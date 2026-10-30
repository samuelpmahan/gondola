import test from "node:test";
import assert from "node:assert/strict";
import { createCompositionReference } from "./reference.mjs";
import {
  DEFAULT_CASES,
  DEFAULT_MAX_ACTIONS,
  DEFAULT_SEEDS,
  browserTextInputValue,
  fixedScripts,
  makeScripts,
  runReferenceScript,
  seededScripts,
} from "./scripts.mjs";

const callMethods = new Set([
  "create", "createChild", "tree", "list", "snapshot", "dispatch", "effects",
  "complete", "audit", "dispose", "disposeTree", "setChildInputs", "publish",
  "changes", "encodeHTTP", "decodeHTTP",
]);

function action(script, method, predicate = () => true) {
  return script.actions.find((candidate) => candidate.method === method && predicate(candidate));
}

test("fixed traces use the closed native action schema and include typed policy witnesses", () => {
  assert.deepEqual(DEFAULT_SEEDS, [20261030, 20261031]);
  assert.equal(DEFAULT_CASES, 30);
  assert.equal(DEFAULT_MAX_ACTIONS, 40);
  assert.deepEqual(fixedScripts.map(({ name }) => name), [
    "inputs-publication-races",
    "readonly-pending-reply",
    "grandchild-routing-disposal-and-recreation",
  ]);

  for (const script of fixedScripts) {
    assert.ok(Object.isFrozen(script));
    assert.ok(Object.isFrozen(script.actions));
    for (const item of script.actions) {
      assert.deepEqual(Object.keys(item).sort(), ["args", "method"]);
      assert.ok(callMethods.has(item.method), "unknown native method " + item.method);
      assert.ok(Array.isArray(item.args));
      assert.ok(Object.isFrozen(item.args));
    }
  }

  const publication = fixedScripts[0];
  assert.ok(action(publication, "setChildInputs", (item) =>
    item.args[0] === 1 && item.args[1] === 2 && item.args[2].Title === "Research branch"));
  assert.ok(action(publication, "setChildInputs", (item) =>
    item.args[0] === 3 && item.args[1] === 2), "wrong immediate parent is attempted");
  assert.ok(action(publication, "dispatch", (item) =>
    item.args[1].Path === "2/0/9" &&
    item.args[1].Key === "row-1-publish" &&
    item.args[1].Value === "1/2"), "a rendered publish button is clicked");
  assert.ok(action(publication, "publish", (item) => item.args[2] === 1),
    "a stale input revision is attempted after equal inputs");
  assert.ok(action(publication, "publish", (item) => item.args[2] === 2),
    "current-revision publication is repeated");
  assert.deepEqual(publication.inputWitnesses, [
    {
      actionIndex: 12,
      requested: "draft \r\nto save",
      effective: "draft to save",
      key: "row-1-input",
    },
    {
      actionIndex: 17,
      requested: "draft changed \nafter save",
      effective: "draft changed after save",
      key: "row-1-input",
    },
  ], "requested CRLF and LF inputs map to unchanged effective fixed steps");
  for (const witness of publication.inputWitnesses) {
    const item = publication.actions[witness.actionIndex];
    assert.equal(item.method, "dispatch");
    assert.equal(item.args[1].Key, witness.key);
    assert.equal(item.args[1].Value, witness.effective);
    assert.equal(browserTextInputValue(witness.requested), witness.effective);
  }

  const readonly = fixedScripts[1];
  assert.ok(action(readonly, "complete"), "pending async work completes after ReadOnly turns on");
  assert.ok(action(readonly, "setChildInputs", (item) => item.args[2].ReadOnly));
  assert.ok(action(readonly, "publish"), "direct publication is attempted while read-only");
  const lifecycle = fixedScripts[2];
  assert.ok(action(lifecycle, "createChild", (item) => item.args[0] === 2),
    "the script creates a grandchild");
  assert.ok(action(lifecycle, "disposeTree"));
  assert.equal(lifecycle.actions.filter((item) => item.method === "create").length, 2,
    "a new root is created after disposal");
});

test("fixed script replay emits full native-shaped frames and preserves message/inbox order", () => {
  const frames = runReferenceScript(createCompositionReference(), fixedScripts[0]);
  assert.equal(frames.length, fixedScripts[0].actions.length);
  for (const entry of frames) {
    assert.deepEqual(Object.keys(entry).sort(), ["action", "frame", "result"]);
    assert.deepEqual(Object.keys(entry.frame).sort(), ["changes", "sessions", "tree"]);
    assert.ok(Array.isArray(entry.frame.changes));
    assert.ok(entry.frame.sessions.every((item, index, values) =>
      index === 0 || values[index - 1].id < item.id));
  }

  const wrongParent = frames.find((entry) =>
    entry.action.method === "setChildInputs" && entry.action.args[0] === 3);
  assert.equal(wrongParent.result.error, "session ID 2 is not an immediate child of session ID 3");

  const stalePublish = frames.find((entry) =>
    entry.action.method === "publish" && entry.action.args[2] === 1);
  assert.equal(stalePublish.result.error, "input revision 1 is stale; current revision is 2");

  const final = frames.at(-1);
  assert.deepEqual(final.result, []);
  assert.deepEqual(final.frame.changes, [],
    "per-action frames drain dirty IDs before the final changes() action");
  const firstPublish = frames.find((entry) =>
    entry.action.method === "dispatch" && entry.action.args[1].Path === "2/0/9");
  assert.deepEqual(firstPublish.frame.changes, [1, 2],
    "the publish action dirties the child and its immediate parent");
  const parent = final.frame.sessions.find(({ id }) => id === 1).snapshot;
  assert.deepEqual(parent.state.Inbox.map(({ Sequence, Saved, InputRevision }) =>
    [Sequence, Saved, InputRevision]), [
    [1, "saved at completion", 2],
    [2, "saved at completion", 2],
    [3, "saved at completion", 2],
  ]);
  const child = final.frame.sessions.find(({ id }) => id === 2).snapshot;
  assert.deepEqual(child.messages.filter(({ Name }) => Name === "publish"), [
    { Name: "publish", Arg: "1/2" },
    { Name: "publish", Arg: "1/2" },
    { Name: "publish", Arg: "1/2" },
  ]);
});

test("every fixed trace completes as ordered full-state frames", () => {
  for (const script of fixedScripts) {
    const frames = runReferenceScript(createCompositionReference(), script);
    assert.equal(frames.length, script.actions.length);
    assert.ok(frames.every(({ frame }) =>
      Array.isArray(frame.tree) &&
      Array.isArray(frame.sessions) &&
      Array.isArray(frame.changes)));
  }
  const policy = runReferenceScript(createCompositionReference(), fixedScripts[0]);
  assert.equal(policy.filter(({ result }) => result && typeof result === "object" && "error" in result).length, 2);
  const readonly = runReferenceScript(createCompositionReference(), fixedScripts[1]);
  assert.equal(readonly.filter(({ result }) => result && typeof result === "object" && "error" in result).length, 1);
});

test("seeded traces are stable, bounded, and executable against the independent model", () => {
  for (const seed of DEFAULT_SEEDS) {
    const first = seededScripts(seed);
    assert.equal(first.length, DEFAULT_CASES);
    assert.deepEqual(first, seededScripts(seed));
    for (const script of first) {
      assert.ok(script.actions.length <= DEFAULT_MAX_ACTIONS, script.name + " exceeds the action cap");
      assert.ok(script.seed === seed);
      for (const witness of script.inputWitnesses) {
        const item = script.actions[witness.actionIndex];
        assert.equal(item.method, "dispatch");
        assert.equal(item.args[1].Key, witness.key);
        assert.equal(item.args[1].Value, witness.effective);
        assert.equal(browserTextInputValue(witness.requested), witness.effective);
        assert.ok(/[\r\n]/.test(witness.requested));
      }
      for (const item of script.actions) {
        assert.ok(callMethods.has(item.method));
        assert.ok(Array.isArray(item.args));
      }
    }
  }

  const bounded = makeScripts({ seeds: [7, 8], cases: 3, maxActions: 12 });
  assert.equal(bounded.length, fixedScripts.length + 6);
  for (const script of bounded.slice(fixedScripts.length)) {
    assert.ok(script.actions.length <= 12);
    const frames = runReferenceScript(createCompositionReference(), script);
    assert.equal(frames.length, script.actions.length);
    assert.ok(frames.every(({ frame }) => Array.isArray(frame.sessions)));
  }

  assert.throws(() => seededScripts(-1), /unsigned 32-bit/i);
  assert.throws(() => seededScripts(1, { maxActions: 41 }), /maxActions/i);
  assert.throws(() => seededScripts(1, { maxActions: 8 }), /maxActions/i);
  assert.throws(() => makeScripts({ seeds: [1, 1] }), /unique/i);
  assert.throws(() => makeScripts({ cases: -1 }), /cases/i);
});

test("seeded action records are JSON serializable and preserve primitive values", () => {
  const selected = makeScripts({ seeds: [20261030], cases: 2, maxActions: 14 });
  const encoded = JSON.stringify(selected);
  const decoded = JSON.parse(encoded);
  assert.deepEqual(decoded, selected);
  for (const script of decoded) {
    assert.ok(Array.isArray(script.inputWitnesses));
    for (const item of script.actions) {
      assert.deepEqual(Object.keys(item).sort(), ["args", "method"]);
      assert.equal(typeof item.method, "string");
    }
  }
});

test("browser script normalization is distinct from direct Go-shaped dispatch values", () => {
  const requested = "line one\r\nline two\nline three\r";
  assert.equal(browserTextInputValue(requested), "line oneline twoline three");

  const manager = createCompositionReference();
  const root = manager.create();
  const child = manager.createChild(root);
  manager.dispatch(child, { Path: "0", Event: "click", Value: "", Key: "add" });
  manager.dispatch(child, {
    Path: "2/0/0",
    Event: "input",
    Value: requested,
    Key: "row-1-input",
  });
  assert.equal(manager.snapshot(child).state.Rows[0].Draft, requested,
    "the manager model remains able to receive arbitrary strings outside the mounted text-input profile");
});
