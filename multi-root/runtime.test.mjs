import test from "node:test";
import assert from "node:assert/strict";
import { createMultiRootManagerAdapter, createSessionRuntime } from "./runtime.mjs";

function fakeManager() {
  const calls = [];
  const snapshot = { state: { value: "before" }, tree: null };
  return {
    calls,
    snapshotValue: snapshot,
    create() { calls.push(["create"]); return 10; },
    snapshot(id) { calls.push(["snapshot", id]); return snapshot; },
    dispatch(id, step) { calls.push(["dispatch", id, step]); return snapshot; },
    effects(id) { calls.push(["effects", id]); return [{ Kind: "cancel", ID: 3 }]; },
    complete(id, reply) { calls.push(["complete", id, reply]); return snapshot; },
    audit(id) { calls.push(["audit", id]); return [{ ID: id }]; },
    dispose(id) { calls.push(["dispose", id]); return []; },
    list() { calls.push(["list"]); return [10]; },
  };
}

test("session runtime routes every keyed-host call through one SessionID", () => {
  const manager = fakeManager();
  const runtime = createSessionRuntime(manager, 10);

  runtime.init();
  runtime.dispatch({ Path: "0", Event: "input", Value: "next", Key: "draft-input" });
  runtime.complete({ ID: 3, Value: "saved", Error: "" });
  runtime.effects();
  runtime.audit();

  assert.deepEqual(manager.calls.map((call) => call.slice(0, 2)), [
    ["snapshot", 10], ["dispatch", 10], ["complete", 10], ["effects", 10], ["audit", 10],
  ]);
  assert.equal(runtime.init().state.value, "before");
});

test("session runtime clones bridge output so renderer mutation cannot alter bridge state", () => {
  const manager = fakeManager();
  const runtime = createSessionRuntime(manager, 10);

  const snapshot = runtime.init();
  snapshot.state.value = "renderer mutation";
  const effects = runtime.effects();
  effects[0].ID = 999;
  const audit = runtime.audit();
  audit[0].ID = 999;

  assert.equal(manager.snapshotValue.state.value, "before");
  assert.deepEqual(manager.effects(10), [{ Kind: "cancel", ID: 3 }]);
  assert.deepEqual(manager.audit(10), [{ ID: 10 }]);
});

test("session runtime fences all bridge calls after the owning generation retires", () => {
  const manager = fakeManager();
  let current = true;
  const runtime = createSessionRuntime(manager, 10, () => current);
  runtime.init();
  const callCount = manager.calls.length;
  current = false;

  assert.throws(() => runtime.init(), /no longer the current root generation/);
  assert.throws(() => runtime.dispatch({}), /no longer the current root generation/);
  assert.throws(() => runtime.complete({}), /no longer the current root generation/);
  assert.throws(() => runtime.effects(), /no longer the current root generation/);
  assert.throws(() => runtime.audit(), /no longer the current root generation/);
  assert.equal(manager.calls.length, callCount, "stale runtime calls never reach the Go bridge");
});

test("session runtime rejects invalid IDs and incomplete manager bridges", () => {
  const manager = fakeManager();
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "10"]) {
    assert.throws(() => createSessionRuntime(manager, id), /positive safe integer/);
  }
  assert.throws(() => createSessionRuntime({ snapshot() {} }, 10), /must expose create\(\)/);
  assert.throws(() => createSessionRuntime(manager, 10, true), /isCurrent must be a function/);
});

test("manager adapter throws exact Go error frames for every bridge method", () => {
  const manager = fakeManager();
  const methods = ["create", "list", "snapshot", "dispatch", "effects", "complete", "audit", "dispose"];
  for (const method of methods) {
    manager[method] = () => ({ error: `${method} rejected` });
  }

  const adapter = createMultiRootManagerAdapter(manager);
  for (const method of methods) {
    assert.throws(() => adapter[method](10, {}), new RegExp(`gobiMultiRoot\\.${method}.*${method} rejected`));
  }
});

test("manager adapter preserves plain fake-manager values and method context", () => {
  const manager = fakeManager();
  manager.context = "retained";
  const errorNamedValue = { error: "ordinary field", state: { value: "kept" } };
  manager.complete = () => errorNamedValue;
  const adapter = createMultiRootManagerAdapter(manager);

  assert.equal(adapter.create(), 10);
  assert.deepEqual(adapter.list(), [10]);
  assert.deepEqual(adapter.snapshot(10).state, { value: "before" });
  assert.deepEqual(adapter.effects(10), [{ Kind: "cancel", ID: 3 }]);
  assert.equal(adapter.complete(10, {}), errorNamedValue, "an object with additional fields is ordinary manager data");
  assert.deepEqual(adapter.dispose(10), []);

  const contextManager = {
    ...manager,
    context: "bound",
    list() { return this.context; },
  };
  assert.equal(createMultiRootManagerAdapter(contextManager).list(), "bound");
});

test("session runtime never returns Go error frames as snapshot, transition, effect, reply, or audit data", () => {
  const cases = [
    ["snapshot", "init", []],
    ["dispatch", "dispatch", [{}]],
    ["complete", "complete", [{}]],
    ["effects", "effects", []],
    ["audit", "audit", []],
  ];
  for (const [method, runtimeMethod, args] of cases) {
    const manager = fakeManager();
    manager[method] = () => ({ error: `${method} rejected` });
    const runtime = createSessionRuntime(manager, 10);
    assert.throws(() => runtime[runtimeMethod](...args), new RegExp(`gobiMultiRoot\\.${method}.*${method} rejected`));
  }
});
