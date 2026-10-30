import test from "node:test";
import assert from "node:assert/strict";
import { createBackendHost } from "./host.mjs";

function fakeRoot() {
  return {
    cleared: 0,
    replaceChildren() {
      this.cleared += 1;
    },
  };
}

function fakeRuntime() {
  const calls = { init: 0, dispatch: [] };
  let count = 0;
  return {
    calls,
    currentCount() {
      return count;
    },
    init() {
      calls.init += 1;
      return { state: { Count: count }, tree: {}, messages: [] };
    },
    dispatch(input) {
      calls.dispatch.push({ ...input });
      count += input.Value === "reset" ? -count : 1;
      return {
        state: { Count: count },
        tree: {},
        messages: calls.dispatch.map((message) => ({ ...message })),
      };
    },
  };
}

function recordingBackend(name, record) {
  return (_root, runtime) => {
    record.mounts.push(name);
    const initial = runtime.init();
    return {
      snapshot() {
        return runtime.init();
      },
      domSnapshot() {
        return {
          html: `<${name}>${runtime.init().state.Count}</${name}>`,
          disabled: [],
          ...(name === "dom" ? { nodes: [{ type: "element", tag: "div" }] } : {}),
        };
      },
      click(path) {
        return runtime.dispatch({ Path: String(path), Event: "click", Value: name });
      },
      unmount() {
        record.unmounts.push(name);
      },
      initial,
    };
  };
}

test("switches renderers around one runtime while preserving snapshots and dispatch order", () => {
  const runtime = fakeRuntime();
  const root = fakeRoot();
  const record = { mounts: [], unmounts: [] };
  const host = createBackendHost(root, runtime, {
    dom: recordingBackend("dom", record),
    react: recordingBackend("react", record),
  });

  assert.equal(runtime.calls.init, 1);
  assert.deepEqual(host.snapshot(), { state: { Count: 0 }, tree: {}, messages: [] });
  assert.deepEqual(host.domSnapshot(), { html: "<dom>0</dom>", disabled: [] }, "backend-only nodes are omitted");
  const oldDom = host.snapshot();
  oldDom.state.Count = 91;
  assert.equal(host.snapshot().state.Count, 0, "host snapshots are defensive copies");

  host.click("1");
  assert.equal(host.snapshot().state.Count, 1);
  const switched = host.replaceBackend("react");
  assert.equal(switched.state.Count, 1);
  assert.equal(runtime.calls.init, 1, "renderer switches never reinitialize the runtime");
  assert.equal(host.backendName(), "react");
  assert.deepEqual(host.domSnapshot(), { html: "<react>1</react>", disabled: [] });

  host.click("2");
  host.replaceBackend("dom");
  assert.deepEqual(host.snapshot(), {
    state: { Count: 2 },
    tree: {},
    messages: [
      { Path: "1", Event: "click", Value: "dom" },
      { Path: "2", Event: "click", Value: "react" },
    ],
  });
  assert.deepEqual(record.mounts, ["dom", "react", "dom"]);
  assert.deepEqual(record.unmounts, ["dom", "react"]);
  assert.equal(runtime.calls.init, 1);
  assert.equal(runtime.calls.dispatch.length, 2);

  host.unmount();
});

test("stale renderer facades cannot dispatch and same-backend replacement is idempotent", () => {
  const runtime = fakeRuntime();
  const record = { mounts: [], unmounts: [] };
  let oldRuntimeFacade;
  const dom = (_root, facade) => {
    oldRuntimeFacade = facade;
    return recordingBackend("dom", record)(_root, facade);
  };
  const host = createBackendHost(fakeRoot(), runtime, {
    dom,
    react: recordingBackend("react", record),
  });

  const snapshot = host.replaceBackend("dom");
  assert.equal(snapshot.state.Count, 0);
  assert.deepEqual(record.mounts, ["dom"], "replacing with the active name does not remount");
  host.replaceBackend("react");
  assert.throws(() => oldRuntimeFacade.dispatch({ Value: "stale" }), /stale renderer/);
  assert.equal(runtime.calls.dispatch.length, 0, "stale callbacks never reach the runtime");
  assert.equal(host.snapshot().state.Count, 0);
  host.unmount();
});

test("unknown backend names fail before changing the current renderer", () => {
  const runtime = fakeRuntime();
  const record = { mounts: [], unmounts: [] };
  const host = createBackendHost(fakeRoot(), runtime, {
    dom: recordingBackend("dom", record),
    react: recordingBackend("react", record),
  });

  assert.throws(() => host.replaceBackend("missing"), /unknown backend/);
  assert.equal(host.backendName(), "dom");
  assert.equal(host.snapshot().state.Count, 0);
  assert.deepEqual(record.mounts, ["dom"]);
  assert.deepEqual(record.unmounts, []);
  host.unmount();
});

test("failed replacement remounts the old backend from the latest cached snapshot", () => {
  const runtime = fakeRuntime();
  const root = fakeRoot();
  const record = { mounts: [], unmounts: [] };
  let failedFacade;
  const failedRenderer = (_root, facade) => {
    record.mounts.push("broken");
    failedFacade = facade;
    record.failedMountSnapshot = facade.init();
    throw new Error("mount exploded");
  };
  const host = createBackendHost(root, runtime, {
    dom: recordingBackend("dom", record),
    broken: failedRenderer,
  });

  host.click("1");
  assert.throws(() => host.replaceBackend("broken"), /failed to mount; restored "dom"/);
  assert.deepEqual(record.failedMountSnapshot, {
    state: { Count: 1 },
    tree: {},
    messages: [{ Path: "1", Event: "click", Value: "dom" }],
  });
  assert.deepEqual(host.snapshot(), record.failedMountSnapshot);
  assert.equal(host.backendName(), "dom");
  assert.throws(() => failedFacade.dispatch({ Value: "stale-after-rollback" }), /stale renderer/);
  assert.equal(runtime.calls.dispatch.length, 1, "failed renderer callbacks are fenced after rollback");
  assert.equal(runtime.calls.init, 1);
  assert.deepEqual(record.mounts, ["dom", "broken", "dom"]);
  assert.deepEqual(record.unmounts, ["dom"]);
  assert.ok(root.cleared > 0, "failed mount cleanup clears partial DOM before rollback");
  host.unmount();
});

test("a backend cannot mutate runtime state during a mount that later fails", () => {
  const runtime = fakeRuntime();
  const record = { mounts: [], unmounts: [] };
  let mountFacade;
  const broken = (_root, facade) => {
    mountFacade = facade;
    assert.deepEqual(facade.init(), { state: { Count: 0 }, tree: {}, messages: [] });
    assert.throws(() => facade.dispatch({ Value: "during-mount" }), /before mount completes/);
    throw new Error("mount failed after attempted dispatch");
  };
  const host = createBackendHost(fakeRoot(), runtime, {
    dom: recordingBackend("dom", record),
    broken,
  });

  assert.throws(() => host.replaceBackend("broken"), /failed to mount; restored "dom"/);
  assert.deepEqual(host.snapshot(), { state: { Count: 0 }, tree: {}, messages: [] });
  assert.equal(runtime.calls.dispatch.length, 0, "mount-time dispatch never reaches the runtime");
  assert.equal(runtime.calls.init, 1);
  assert.equal(host.backendName(), "dom");
  assert.throws(() => mountFacade.dispatch({ Value: "stale-after-failed-mount" }), /stale renderer/);
  host.unmount();
});

test("renderer click failure fences dispatch without resetting an accepted runtime snapshot", () => {
  const runtime = fakeRuntime();
  let rendererFacade;
  const dom = (_root, facade) => {
    rendererFacade = facade;
    return {
      snapshot: () => facade.init(),
      domSnapshot: () => ({ html: "<div></div>", disabled: [] }),
      click(path) {
        facade.dispatch({ Path: String(path), Event: "click", Value: "dom" });
        throw new Error("renderer rejected the accepted tree");
      },
      unmount() {},
    };
  };
  const host = createBackendHost(fakeRoot(), runtime, { dom });

  assert.throws(() => host.click("1"), /click failed; host is now unusable/);
  assert.equal(runtime.calls.init, 1, "click failure never reinitializes or resets the runtime");
  assert.equal(runtime.calls.dispatch.length, 1, "the click dispatch was accepted once");
  assert.equal(runtime.currentCount(), 1, "accepted runtime state is preserved");
  assert.throws(() => host.snapshot(), /unusable/);
  assert.throws(() => host.domSnapshot(), /unusable/);
  assert.throws(() => host.click("1"), /unusable/);
  assert.throws(() => host.replaceBackend("dom"), /unusable/);
  assert.throws(() => host.backendName(), /unusable/);
  assert.throws(() => rendererFacade.dispatch({ Value: "after-failure" }), /unusable/);
  assert.equal(runtime.calls.dispatch.length, 1, "the failed renderer epoch cannot dispatch again");
  host.unmount();
  assert.throws(() => host.snapshot(), /disposed/);
});

test("host operations reject use after unmount", () => {
  const runtime = fakeRuntime();
  const record = { mounts: [], unmounts: [] };
  const host = createBackendHost(fakeRoot(), runtime, {
    dom: recordingBackend("dom", record),
  });

  host.unmount();
  assert.throws(() => host.snapshot(), /disposed/);
  assert.throws(() => host.domSnapshot(), /disposed/);
  assert.throws(() => host.click("1"), /disposed/);
  assert.throws(() => host.replaceBackend("dom"), /disposed/);
  assert.throws(() => host.backendName(), /disposed/);
  assert.throws(() => host.unmount(), /disposed/);
  assert.deepEqual(record.unmounts, ["dom"]);
});

test("runtime errors do not replace the last successful cached snapshot", () => {
  const runtime = fakeRuntime();
  const dispatch = runtime.dispatch;
  runtime.dispatch = (input) => {
    if (input.Value === "bad") return { error: "rejected" };
    return dispatch(input);
  };
  let facade;
  const dom = (_root, runtimeFacade) => {
    facade = runtimeFacade;
    return recordingBackend("dom", { mounts: [], unmounts: [] })(_root, runtimeFacade);
  };
  const host = createBackendHost(fakeRoot(), runtime, { dom });

  assert.throws(() => facade.dispatch({ Value: "bad" }), /runtime error: rejected/);
  assert.deepEqual(host.snapshot(), { state: { Count: 0 }, tree: {}, messages: [] });
  assert.equal(runtime.calls.init, 1);
  host.unmount();
});
