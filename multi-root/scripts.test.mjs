import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SEEDS, ROOTS, BACKENDS, fixedScripts, makeScripts, seededScripts } from "./scripts.mjs";

test("fixed scripts keep the three-root isolation and lifecycle witnesses explicit", () => {
  assert.deepEqual(ROOTS, ["alpha", "beta", "gamma"]);
  assert.deepEqual(BACKENDS, ["dom", "react", "godom"]);
  const allActions = fixedScripts.flatMap((script) => script.actions);
  const witness = (kind, root) => allActions.some((action) => action.kind === kind && action.root === root);
  for (const root of ROOTS) {
    assert.ok(witness("add", root), `${root} receives its own Add`);
    assert.ok(witness("focus", root), `${root} receives its own focus action`);
  }
  assert.ok(allActions.filter((action) => action.kind === "save").length >= 3,
    "the fixed schedule saves all three roots before releasing any request");
  assert.ok(witness("unmount", "alpha"), "one held root is disposed");
  assert.ok(witness("release", "alpha"), "the disposed root receives a late reply attempt");
  assert.ok(allActions.some((action) => action.kind === "mount" && action.root === "alpha"),
    "the vacated root is reused with a new session");
  assert.ok(allActions.some((action) => action.kind === "renderer-failure" && action.root === "gamma"),
    "one renderer failure is isolated from sibling roots");

  const swaps = allActions.filter((action) => action.kind === "replace");
  for (const [root, from] of [["alpha", "dom"], ["beta", "react"], ["gamma", "godom"]]) {
    for (const to of BACKENDS) {
      assert.ok(swaps.some((action) => action.root === root && action.from === from && action.backend === to),
        `directed backend change ${from} -> ${to} on ${root}`);
    }
  }
  const repeat = allActions.filter((action) => action.root === "alpha" && ["mount", "unmount"].includes(action.kind));
  assert.ok(repeat.length >= 4, "the fixed scripts repeat mount/dispose on a reused root");
});

test("the required seeds produce stable, distinct three-root schedules", () => {
  assert.deepEqual(DEFAULT_SEEDS, [20261030, 20261031]);
  for (const seed of DEFAULT_SEEDS) {
    const first = seededScripts(seed, { cases: 3, maxActions: 20 });
    const second = seededScripts(seed, { cases: 3, maxActions: 20 });
    assert.deepEqual(first, second);
    assert.equal(first.length, 3);
    assert.ok(first.every((script) => script.seed === seed && script.actions.length <= 20));
    assert.ok(first.every((script) => script.actions.every((action) => ROOTS.includes(action.root))));
  }
  assert.notDeepEqual(seededScripts(DEFAULT_SEEDS[0], { cases: 3, maxActions: 20 }),
    seededScripts(DEFAULT_SEEDS[1], { cases: 3, maxActions: 20 }));
  assert.ok(makeScripts({ seeds: DEFAULT_SEEDS, cases: 2, maxActions: 12 }).length > fixedScripts.length);
});

test("generated saves always target a nonempty current draft and stay within their action cap", () => {
  for (const seed of DEFAULT_SEEDS) {
    for (const script of seededScripts(seed, { cases: 30, maxActions: 40 })) {
      const drafts = Object.fromEntries(ROOTS.map((root) => [root, ""]));
      assert.ok(script.actions.length <= 40, `${script.name} exceeded its action cap`);
      for (const action of script.actions) {
        if (action.kind === "fill") drafts[action.root] = action.value;
        if (action.kind === "save") {
          assert.notEqual(drafts[action.root], "", `${script.name} saves an empty ${action.root} draft`);
        }
      }
    }
  }
});

test("forced focus and repair actions obey small action caps for edge seeds", () => {
  for (const [seed, cases, maxActions] of [[59, 5, 40], [0, 2, 13]]) {
    const scripts = seededScripts(seed, { cases, maxActions });
    assert.equal(scripts.length, cases);
    for (const script of scripts) {
      assert.ok(script.actions.length <= maxActions,
        `${script.name} emitted ${script.actions.length} actions over cap ${maxActions}`);
    }
  }
});
