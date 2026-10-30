import assert from "node:assert/strict";
import test from "node:test";

let scriptsModule = {};
try { scriptsModule = await import("./scripts.mjs"); }
catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
}

const {
  BACKENDS,
  DEFAULT_SEEDS,
  fixedScripts,
  makeScripts,
  parseSeedList,
  seededScripts,
} = scriptsModule;

function validateScript(script) {
  assert.equal(typeof script.name, "string");
  assert.ok(Array.isArray(script.actions));
  const live = new Map();
  const stale = new Map();
  const retiredNames = new Set();
  for (const [index, action] of script.actions.entries()) {
    const failAt = `${script.name} action ${index}: ${JSON.stringify(action)}`;
    assert.ok(action && typeof action === "object", failAt);
    if (action.expectError === true) {
      assert.ok(["root", "child"].includes(action.kind), failAt);
      if (action.kind === "child") assert.ok(!live.has(action.parent) || !BACKENDS.includes(action.backend), failAt);
      continue;
    }
    if (action.kind === "root") {
      assert.ok(!live.has(action.name), failAt);
      assert.ok(BACKENDS.includes(action.backend), failAt);
      live.set(action.name, { parent: null, depth: 1, backend: action.backend, rows: [], nextRequestID: 0 });
      retiredNames.delete(action.name);
    } else if (action.kind === "child") {
      const parent = live.get(action.parent);
      assert.ok(parent, failAt);
      assert.ok(parent.depth < 32, failAt);
      assert.ok(!live.has(action.name), failAt);
      assert.ok(BACKENDS.includes(action.backend), failAt);
      live.set(action.name, { parent: action.parent, depth: parent.depth + 1, backend: action.backend, rows: [], nextRequestID: 0 });
      retiredNames.delete(action.name);
    } else if (action.kind === "add") {
      const session = live.get(action.name);
      assert.ok(session && session.rows.length < 4, failAt);
      session.rows.push({ ID: session.rows.length + 1, draft: "", pending: 0 });
    } else if (action.kind === "fill") {
      const row = live.get(action.name)?.rows.find((item) => item.ID === action.rowID);
      assert.ok(row && typeof action.value === "string", failAt);
      row.draft = action.value;
    } else if (action.kind === "save") {
      const session = live.get(action.name);
      const row = session?.rows.find((item) => item.ID === action.rowID);
      assert.ok(row && row.draft.length > 0, `save requires a non-empty current draft: ${failAt}`);
      session.nextRequestID += 1;
      row.pending = session.nextRequestID;
    } else if (action.kind === "focus") {
      const row = live.get(action.name)?.rows.find((item) => item.ID === action.rowID);
      assert.ok(row, failAt);
      assert.ok(Number.isSafeInteger(action.start) && Number.isSafeInteger(action.end) && action.start >= 0 && action.end >= action.start, failAt);
      assert.ok(action.end <= row.draft.length, failAt);
      assert.ok(["none", "forward", "backward"].includes(action.direction), failAt);
    } else if (action.kind === "replace") {
      const session = live.get(action.name);
      assert.ok(session && BACKENDS.includes(action.backend) && session.backend !== action.backend, failAt);
      session.backend = action.backend;
    } else if (action.kind === "release") {
      const session = live.get(action.name);
      const row = session?.rows.find((item) => item.pending === action.requestID);
      assert.ok(row, failAt);
      assert.equal(typeof action.value, "string", failAt);
      assert.equal(typeof action.error, "string", failAt);
      row.pending = 0;
    } else if (action.kind === "dispose") {
      assert.ok(live.has(action.name), failAt);
      const subtree = new Set([action.name]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const [name, session] of live) {
          if (!subtree.has(name) && subtree.has(session.parent)) {
            subtree.add(name);
            grew = true;
          }
        }
      }
      for (const name of subtree) {
        const session = live.get(name);
        for (const row of session.rows) {
          if (row.pending) stale.set(`${name}:${row.pending}`, { name, requestID: row.pending });
        }
        live.delete(name);
        retiredNames.add(name);
      }
    } else if (action.kind === "stale-release") {
      const key = `${action.name}:${action.requestID}`;
      assert.ok(stale.has(key), failAt);
      const activeSession = live.get(action.name);
      assert.ok(retiredNames.has(action.name) || activeSession, failAt);
      assert.ok(!activeSession || !activeSession.rows.some((row) => row.pending === action.requestID),
        `stale callback must precede reuse of its request ID in a recreated session: ${failAt}`);
      assert.equal(typeof action.value, "string", failAt);
      assert.equal(typeof action.error, "string", failAt);
      stale.delete(key);
    } else {
      assert.fail(`unknown action kind in ${failAt}`);
    }
    assert.ok(live.size <= 6, `generated live sessions exceed six after ${failAt}`);
  }
}

test("fixed schedules cover nested postorder, renderer retention, stale callbacks, recreation and mount failures", () => {
  assert.equal(typeof makeScripts, "function", "session-tree/scripts.mjs must export makeScripts()");
  assert.equal(fixedScripts.length, 3);
  const names = fixedScripts.map(({ name }) => name);
  assert.deepEqual(names, [
    "nested-postorder-cancel-and-sibling-isolation",
    "nested-renderer-changes-preserve-child-dom-and-focus",
    "dispose-fences-late-replies-and-allows-parent-recreation",
  ]);
  assert.ok(fixedScripts[0].actions.some((action) => action.kind === "child"));
  assert.ok(fixedScripts[0].actions.some((action) => action.kind === "dispose"));
  assert.ok(fixedScripts[0].actions.some((action) => action.kind === "stale-release"));
  assert.ok(fixedScripts[1].actions.some((action) => action.kind === "replace" && action.name === "oak"));
  assert.ok(fixedScripts[1].actions.some((action) => action.kind === "replace" && action.name === "branch"));
  assert.ok(fixedScripts[1].actions.some((action) => action.kind === "focus"));
  assert.ok(fixedScripts[2].actions.some((action) => action.kind === "root" && action.expectError === true));
  assert.ok(fixedScripts[2].actions.some((action) => action.kind === "child" && action.expectError === true));
  assert.ok(fixedScripts[2].actions.filter((action) => action.kind === "root" && action.name === "orchard").length > 1,
    "parent name is reused only after a successful explicit subtree disposal");
  assert.ok(fixedScripts.every(({ actions }) => actions.length > 0 && actions.length <= 40));
  assert.deepEqual(fixedScripts.map(({ actions }) => actions.length), [29, 21, 18]);
  fixedScripts.forEach(validateScript);
});

test("nested renderer witness focuses each replacement target and leaves its descendant mounted", () => {
  const script = fixedScripts.find(({ name }) => name === "nested-renderer-changes-preserve-child-dom-and-focus");
  assert.ok(script);
  assert.equal(script.actions.length, 21);

  const parents = new Map();
  const mountIndexes = new Map();
  for (const [index, action] of script.actions.entries()) {
    if (action.kind === "root") {
      parents.set(action.name, null);
      mountIndexes.set(action.name, index);
    } else if (action.kind === "child") {
      parents.set(action.name, action.parent);
      mountIndexes.set(action.name, index);
    }
  }
  assert.deepEqual([...parents], [["oak", null], ["branch", "oak"], ["bud", "branch"], ["elm", null]]);

  for (const [name, backend, expectedDescendants] of [
    ["oak", "react", ["branch", "bud"]],
    ["branch", "godom", ["bud"]],
    ["bud", "react", []],
  ]) {
    const replaceIndex = script.actions.findIndex((action) =>
      action.kind === "replace" && action.name === name && action.backend === backend);
    assert.ok(replaceIndex > 0, `missing ${name} → ${backend} replacement`);
    const focusAction = script.actions[replaceIndex - 1];
    assert.equal(focusAction.kind, "focus", `${name} replacement must immediately follow its focus witness`);
    assert.equal(focusAction.name, name, `${name} replacement must preserve focus on its own session`);
    assert.equal(focusAction.rowID, 1);
    assert.ok(focusAction.start < focusAction.end, `${name} focus witness must have a noncollapsed selection`);

    const descendants = [...parents.keys()].filter((candidate) => {
      let parent = parents.get(candidate);
      while (parent !== null && parent !== undefined) {
        if (parent === name) return true;
        parent = parents.get(parent);
      }
      return false;
    });
    assert.deepEqual(descendants, expectedDescendants,
      `${name} replacement must run while its expected descendant session shells remain mounted`);
    for (const descendant of expectedDescendants) {
      assert.ok(mountIndexes.get(descendant) < replaceIndex,
        `${descendant} must be mounted before ${name} is replaced`);
    }
  }

  const oakIndex = script.actions.findIndex((action) => action.kind === "replace" && action.name === "oak" && action.backend === "react");
  assert.equal(script.actions[oakIndex + 1].kind, "focus");
  assert.equal(script.actions[oakIndex + 1].name, "branch",
    "the child remains a live focus target immediately after its parent replacement");
  const branchIndex = script.actions.findIndex((action) => action.kind === "replace" && action.name === "branch" && action.backend === "godom");
  assert.equal(script.actions[branchIndex + 1].kind, "fill");
  assert.equal(script.actions[branchIndex + 1].name, "branch",
    "the replaced child remains interactive while its grandchild shell stays mounted");
});

test("postorder disposal witness fills the oak root to the four-row cap", () => {
  const script = fixedScripts.find(({ name }) => name === "nested-postorder-cancel-and-sibling-isolation");
  assert.ok(script);
  assert.equal(script.actions.length, 29);
  const disposeIndex = script.actions.findIndex((action) => action.kind === "dispose" && action.name === "oak");
  assert.ok(disposeIndex >= 0);
  const beforeDispose = script.actions.slice(0, disposeIndex);
  const oakAdds = beforeDispose.filter((action) => action.kind === "add" && action.name === "oak");
  assert.equal(oakAdds.length, 4,
    "oak must contain four rows immediately before subtree disposal");
  assert.deepEqual(beforeDispose.filter((action) => action.kind === "save" && action.name === "oak").map((action) => action.rowID), [1, 2],
    "only the original two requests are saved/cancelled");
  assert.deepEqual(beforeDispose.filter((action) => action.kind === "fill" && action.name === "oak" && action.rowID >= 3), [],
    "the two extra rows only fill the collection capacity; they do not create extra save/cancel effects");
});

test("recreation witness retires and remounts orchard, fruit, and seed before the old seed reply", () => {
  const script = fixedScripts.find(({ name }) => name === "dispose-fences-late-replies-and-allows-parent-recreation");
  assert.ok(script);
  assert.equal(script.actions.length, 18);
  const actions = script.actions;
  const oldDispose = actions.findIndex((action) => action.kind === "dispose" && action.name === "orchard");
  const newOrchard = actions.findIndex((action, index) => index > oldDispose && action.kind === "root" && action.name === "orchard");
  const newFruit = actions.findIndex((action, index) => index > newOrchard && action.kind === "child" && action.name === "fruit" && action.parent === "orchard");
  const newSeed = actions.findIndex((action, index) => index > newFruit && action.kind === "child" && action.name === "seed" && action.parent === "fruit");
  const oldSeedRelease = actions.findIndex((action, index) => index > newSeed && action.kind === "stale-release" && action.name === "seed" && action.requestID === 1);
  assert.ok(oldDispose < newOrchard && newOrchard < newFruit && newFruit < newSeed && newSeed < oldSeedRelease,
    "the same symbolic parent/child/grandchild names must be live before releasing the retired callback");
  assert.equal(actions.slice(newSeed + 1, oldSeedRelease).some((action) => action.kind === "save" && action.name === "seed"), false,
    "the recreated seed must not own request ID 1 when the old seed callback is replayed");
  assert.deepEqual(actions.slice(newOrchard, newSeed + 1).map(({ kind, name, parent }) => [kind, name, parent ?? null]), [
    ["root", "orchard", null], ["child", "fruit", "orchard"], ["child", "seed", "fruit"],
  ]);
  validateScript(script);
});

test("generated schedules are deterministic, bounded and semantically valid", () => {
  assert.deepEqual(DEFAULT_SEEDS, [20261030, 20261031]);
  assert.deepEqual(makeScripts(), [
    ...fixedScripts,
    ...seededScripts(DEFAULT_SEEDS[0], { cases: 30, maxActions: 40 }),
    ...seededScripts(DEFAULT_SEEDS[1], { cases: 30, maxActions: 40 }),
  ]);
  assert.equal(makeScripts().length, 63);
  for (const seed of DEFAULT_SEEDS) {
    const first = seededScripts(seed, { cases: 30, maxActions: 40 });
    assert.deepEqual(first, seededScripts(seed, { cases: 30, maxActions: 40 }));
    assert.equal(first.length, 30);
    for (const script of first) {
      assert.ok(script.actions.length <= 40, `${script.name} exceeds its hard action cap`);
      validateScript(script);
    }
  }
  assert.deepEqual(makeScripts({ seeds: [7, 8], cases: 3, maxActions: 12 }),
    makeScripts({ seeds: [7, 8], cases: 3, maxActions: 12 }));
  assert.ok(seededScripts(1, { cases: 5, maxActions: 11 }).every(({ actions }) => actions.length <= 11));
  assert.throws(() => seededScripts(-1), /seed/i);
  assert.throws(() => makeScripts({ seeds: [1, 1] }), /unique/i);
  assert.throws(() => makeScripts({ cases: -1 }), /cases/i);
  assert.throws(() => makeScripts({ maxActions: 41 }), /maxActions/i);
});

test("script constructors use the frozen action fields and symbolic references", () => {
  assert.equal(typeof makeScripts, "function", "session-tree/scripts.mjs must export makeScripts()");
  const all = makeScripts();
  for (const script of all) {
    for (const action of script.actions) {
      assert.ok(["root", "child", "add", "fill", "save", "focus", "replace", "dispose", "release", "stale-release"].includes(action.kind));
      if (action.kind === "root" || action.kind === "child") {
        assert.equal(typeof action.name, "string");
        assert.equal(typeof action.backend, "string");
        if (action.kind === "child") assert.equal(typeof action.parent, "string");
      } else assert.equal(typeof action.name, "string");
    }
  }
  assert.deepEqual(parseSeedList("7, 8"), [7, 8]);
  assert.throws(() => parseSeedList("7,7"), /unique/i);
  assert.throws(() => parseSeedList("7,"), /seed/i);
  assert.throws(() => parseSeedList("4294967296"), /seed/i);
});
