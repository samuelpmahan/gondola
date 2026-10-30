import test from "node:test";
import assert from "node:assert/strict";

const adapterModule = await import("./adapter.mjs").catch(() => null);
const INSTANCE_METHODS = ["update", "snapshot", "domSnapshot", "click", "focusState", "restoreFocus", "unmount"];

function makeHandle(calls, identity) {
  return {
    update(...args) { calls.push([identity, "update", ...args]); return null; },
    snapshot(...args) { calls.push([identity, "snapshot", ...args]); return { identity }; },
    domSnapshot(...args) { calls.push([identity, "domSnapshot", ...args]); return { html: `<div>${identity}</div>`, disabled: [] }; },
    click(...args) { calls.push([identity, "click", ...args]); return { identity }; },
    focusState(...args) { calls.push([identity, "focusState", ...args]); return { key: identity }; },
    restoreFocus(...args) { calls.push([identity, "restoreFocus", ...args]); return true; },
    unmount(...args) { calls.push([identity, "unmount", ...args]); return null; },
  };
}

test("loadGoDOM starts the WASM bridge using an already loaded Go runtime", async () => {
  assert.equal(typeof adapterModule?.loadGoDOM, "function", "adapter must expose loadGoDOM");
  const previous = {
    Go: globalThis.Go,
    fetch: globalThis.fetch,
    bridge: globalThis.gobiGoDOM,
    instantiate: WebAssembly.instantiate,
  };
  const bridge = { mount() { return makeHandle([], "loaded"); } };
  const instance = { id: "godom-instance" };
  const imports = { fromGo: true };
  const observed = { fetched: null, runInstance: null, importObject: null };
  globalThis.Go = class {
    constructor() { this.importObject = imports; }
    run(value) {
      observed.runInstance = value;
      globalThis.gobiGoDOM = bridge;
      return new Promise(() => {});
    }
  };
  globalThis.fetch = async (url) => {
    observed.fetched = url;
    return { ok: true, async arrayBuffer() { return new ArrayBuffer(0); } };
  };
  WebAssembly.instantiate = async (_bytes, importObject) => {
    observed.importObject = importObject;
    return { instance };
  };
  try {
    assert.equal(await adapterModule.loadGoDOM({ wasmURL: "/renderer-conformance/build/godom.wasm" }), bridge);
    assert.equal(observed.fetched, "/renderer-conformance/build/godom.wasm");
    assert.equal(observed.runInstance, instance);
    assert.equal(observed.importObject, imports);
  } finally {
    if (previous.Go === undefined) delete globalThis.Go;
    else globalThis.Go = previous.Go;
    if (previous.fetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previous.fetch;
    if (previous.bridge === undefined) delete globalThis.gobiGoDOM;
    else globalThis.gobiGoDOM = previous.bridge;
    WebAssembly.instantiate = previous.instantiate;
  }
});

test("Go DOM adapter returns an instance handle and forwards only through that handle", () => {
  assert.equal(typeof adapterModule?.mountGoDOM, "function", "adapter must expose mountGoDOM");
  const previous = globalThis.gobiGoDOM;
  const calls = [];
  const root = { id: "root" };
  const facade = { init() {}, dispatch() {}, rendererFailed() {} };
  const handle = makeHandle(calls, "one");
  globalThis.gobiGoDOM = { mount(...args) { calls.push(["mount", ...args]); return handle; } };
  try {
    const api = adapterModule.mountGoDOM(root, facade);
    const snapshot = { state: {}, tree: {}, bindings: [], messages: [] };
    api.update(snapshot);
    assert.deepEqual(api.snapshot(), { identity: "one" });
    assert.deepEqual(api.domSnapshot(), { html: "<div>one</div>", disabled: [] });
    assert.deepEqual(api.click("0"), { identity: "one" });
    assert.deepEqual(api.focusState(), { key: "one" });
    assert.equal(api.restoreFocus({ key: "one" }), true);
    api.unmount();
    assert.deepEqual(calls[0], ["mount", root, facade], "the host facade must be passed through unchanged");
    assert.deepEqual(calls.slice(1).map(([identity, method]) => method), INSTANCE_METHODS);
    assert.ok(calls.slice(1).every(([identity]) => identity === "one"));
  } finally {
    if (previous === undefined) delete globalThis.gobiGoDOM;
    else globalThis.gobiGoDOM = previous;
  }
});

test("Go DOM adapter keeps two mounted handles independent and unwraps their errors", () => {
  const previous = globalThis.gobiGoDOM;
  const calls = [];
  const handles = [makeHandle(calls, "first"), makeHandle(calls, "second")];
  let index = 0;
  globalThis.gobiGoDOM = { mount() { return handles[index++]; } };
  try {
    const first = adapterModule.mountGoDOM({ id: "first-root" }, { init() {}, dispatch() {} });
    const second = adapterModule.mountGoDOM({ id: "second-root" }, { init() {}, dispatch() {} });
    assert.deepEqual(first.snapshot(), { identity: "first" });
    assert.deepEqual(second.snapshot(), { identity: "second" });

    handles[0].snapshot = () => ({ error: "first handle is fenced" });
    assert.throws(() => first.snapshot(), /first handle is fenced/);
    assert.deepEqual(second.snapshot(), { identity: "second" });
    assert.deepEqual(calls.filter(([, method]) => method === "snapshot").map(([identity]) => identity), ["first", "second", "second"]);
  } finally {
    if (previous === undefined) delete globalThis.gobiGoDOM;
    else globalThis.gobiGoDOM = previous;
  }
});

test("Go DOM adapter accepts only the complete published singleton test-double shape", () => {
  const previous = globalThis.gobiGoDOM;
  const calls = [];
  const legacy = Object.fromEntries(["mount", ...INSTANCE_METHODS].map((method) => [
    method,
    (...args) => { calls.push([method, ...args]); return method === "snapshot" ? { legacy: true } : null; },
  ]));
  globalThis.gobiGoDOM = legacy;
  try {
    const root = { id: "legacy-root" };
    const facade = { init() {}, dispatch() {} };
    const api = adapterModule.mountGoDOM(root, facade);
    assert.deepEqual(api.snapshot(), { legacy: true });
    api.unmount();
    assert.deepEqual(calls.map(([method]) => method), ["mount", "snapshot", "unmount"]);
    assert.equal(calls[0][1], root);
    assert.equal(calls[0][2], facade);
  } finally {
    if (previous === undefined) delete globalThis.gobiGoDOM;
    else globalThis.gobiGoDOM = previous;
  }
});

test("Go DOM adapter unwraps mount failures and rejects malformed renderer handles", () => {
  const previous = globalThis.gobiGoDOM;
  try {
    globalThis.gobiGoDOM = { mount() { return { error: "mount rejected" }; } };
    assert.throws(() => adapterModule.mountGoDOM({}, { init() {}, dispatch() {} }), /mount rejected/);

    globalThis.gobiGoDOM = { mount() { return { snapshot() {} }; } };
    assert.throws(() => adapterModule.mountGoDOM({}, { init() {}, dispatch() {} }), /must return a renderer API/);
  } finally {
    if (previous === undefined) delete globalThis.gobiGoDOM;
    else globalThis.gobiGoDOM = previous;
  }
});
