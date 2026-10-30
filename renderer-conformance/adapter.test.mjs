import test from "node:test";
import assert from "node:assert/strict";

const adapterModule = await import("./adapter.mjs").catch(() => null);

test("loadGoDOM starts the WASM bridge using an already loaded Go runtime", async () => {
  assert.equal(typeof adapterModule?.loadGoDOM, "function", "adapter must expose loadGoDOM");
  const previous = {
    Go: globalThis.Go,
    fetch: globalThis.fetch,
    bridge: globalThis.gobiGoDOM,
    instantiate: WebAssembly.instantiate,
  };
  const bridge = {
    mount() {}, update() {}, snapshot() {}, domSnapshot() {}, click() {}, focusState() {}, restoreFocus() {}, unmount() {},
  };
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

test("Go DOM adapter forwards host callbacks and renderer methods through the bridge", () => {
  assert.equal(typeof adapterModule?.mountGoDOM, "function", "adapter must expose mountGoDOM");
  const previous = globalThis.gobiGoDOM;
  const calls = [];
  const snapshot = { state: {}, tree: {}, bindings: [], messages: [] };
  const root = { id: "root" };
  const facade = { init() {}, dispatch() {}, rendererFailed() {} };
  const bridge = {
    mount(...args) { calls.push(["mount", ...args]); return null; },
    update(...args) { calls.push(["update", ...args]); return null; },
    snapshot() { calls.push(["snapshot"]); return snapshot; },
    domSnapshot() { calls.push(["domSnapshot"]); return { html: "<div></div>", disabled: [] }; },
    click(...args) { calls.push(["click", ...args]); return null; },
    focusState() { calls.push(["focusState"]); return { key: "root" }; },
    restoreFocus(...args) { calls.push(["restoreFocus", ...args]); return null; },
    unmount() { calls.push(["unmount"]); return null; },
  };
  globalThis.gobiGoDOM = bridge;
  try {
    const api = adapterModule.mountGoDOM(root, facade);
    api.update(snapshot);
    assert.equal(api.snapshot(), snapshot);
    assert.deepEqual(api.domSnapshot(), { html: "<div></div>", disabled: [] });
    api.click("0");
    assert.deepEqual(api.focusState(), { key: "root" });
    api.restoreFocus({ key: "root" });
    api.unmount();
    assert.equal(calls[0][0], "mount");
    assert.equal(calls[0][1], root);
    assert.equal(calls[0][2], facade, "failure notification stays on the exact host facade");
    assert.deepEqual(calls.map(([method]) => method), [
      "mount", "update", "snapshot", "domSnapshot", "click", "focusState", "restoreFocus", "unmount",
    ]);
  } finally {
    if (previous === undefined) delete globalThis.gobiGoDOM;
    else globalThis.gobiGoDOM = previous;
  }
});

test("Go DOM adapter unwraps the bridge's exact error object", () => {
  assert.equal(typeof adapterModule?.mountGoDOM, "function", "adapter must expose mountGoDOM");
  const previous = globalThis.gobiGoDOM;
  globalThis.gobiGoDOM = {
    mount() { return { error: "mount rejected" }; },
    update() {}, snapshot() {}, domSnapshot() {}, click() {}, focusState() {}, restoreFocus() {}, unmount() {},
  };
  try {
    assert.throws(() => adapterModule.mountGoDOM({}, { init() {}, dispatch() {} }), /mount rejected/);
  } finally {
    if (previous === undefined) delete globalThis.gobiGoDOM;
    else globalThis.gobiGoDOM = previous;
  }
});
