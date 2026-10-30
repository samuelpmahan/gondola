const INSTANCE_METHODS = ["update", "snapshot", "domSnapshot", "click", "focusState", "restoreFocus", "unmount"];
const LEGACY_METHODS = ["mount", ...INSTANCE_METHODS];
let bootPromise = null;

function fail(message, cause) {
  throw new Error(`Go DOM adapter: ${message}`, cause === undefined ? undefined : { cause });
}

function checkBridge(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    fail("globalThis.gobiGoDOM is not an API object");
  }
  if (typeof candidate.mount !== "function") fail("globalThis.gobiGoDOM must expose mount()");
  return candidate;
}

function hasInstanceMethods(candidate) {
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) &&
    INSTANCE_METHODS.every((method) => typeof candidate[method] === "function");
}

function hasLegacySingletonMethods(candidate) {
  return LEGACY_METHODS.every((method) => typeof candidate[method] === "function");
}

function unwrap(method, result) {
  if (result && typeof result === "object" && !Array.isArray(result) &&
      Object.keys(result).length === 1 && typeof result.error === "string") {
    fail(`gobiGoDOM.${method} failed: ${result.error}`);
  }
  return result;
}

function loadWasmExec(url) {
  if (typeof document === "undefined" || !document.createElement || !document.head) {
    fail("wasmExecURL requires a browser document to load the Go runtime script");
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`could not load Go runtime script ${url}`));
    document.head.appendChild(script);
  });
}

async function waitForBridge(runFailure) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (globalThis.gobiGoDOM) return checkBridge(globalThis.gobiGoDOM);
    if (runFailure.error) fail("Go DOM WASM runtime stopped before registering gobiGoDOM", runFailure.error);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  fail("Go DOM WASM did not register globalThis.gobiGoDOM");
}

/** Load and start the Go/WASM bridge. A previously loaded wasm_exec.js global Go is reused. */
export async function loadGoDOM({ wasmURL, wasmExecURL } = {}) {
  if (typeof wasmURL !== "string" || wasmURL.length === 0) fail("wasmURL must be a non-empty string");
  if (globalThis.gobiGoDOM) return checkBridge(globalThis.gobiGoDOM);
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    if (typeof globalThis.Go !== "function" && wasmExecURL !== undefined) {
      if (typeof wasmExecURL !== "string" || wasmExecURL.length === 0) fail("wasmExecURL must be a non-empty string");
      await loadWasmExec(wasmExecURL);
    }
    if (typeof globalThis.Go !== "function") {
      fail("Go runtime is unavailable; load wasm_exec.js first or pass wasmExecURL");
    }
    if (typeof fetch !== "function") fail("fetch is required to load Go DOM WASM");
    const go = new globalThis.Go();
    if (!go.importObject || typeof go.importObject !== "object") fail("Go runtime must expose importObject");
    const response = await fetch(wasmURL);
    if (!response || response.ok === false) fail(`could not fetch Go DOM WASM from ${wasmURL}`);
    const bytes = await response.arrayBuffer();
    const instantiated = await WebAssembly.instantiate(bytes, go.importObject);
    const instance = instantiated?.instance ?? instantiated;
    const runFailure = { error: null };
    let running;
    try {
      running = go.run(instance);
    } catch (error) {
      runFailure.error = error;
      fail("Go DOM WASM runtime failed to start", error);
    }
    Promise.resolve(running).catch((error) => { runFailure.error = error; });
    return waitForBridge(runFailure);
  })();

  try {
    return await bootPromise;
  } finally {
    bootPromise = null;
  }
}

function adaptHandle(handle) {
  if (!hasInstanceMethods(handle)) fail("gobiGoDOM.mount() must return a renderer API");
  return Object.fromEntries(INSTANCE_METHODS.map((method) => [
    method,
    (...args) => unwrap(method, handle[method](...args)),
  ]));
}

function adaptLegacySingleton(bridge) {
  return Object.fromEntries(INSTANCE_METHODS.map((method) => [
    method,
    (...args) => unwrap(method, bridge[method](...args)),
  ]));
}

/** Mount the already-loaded Go bridge and adapt its per-root renderer handle. */
export function mountGoDOM(root, facade) {
  const bridge = checkBridge(globalThis.gobiGoDOM);
  if (!root) fail("root is required");
  if (!facade || typeof facade !== "object" || typeof facade.init !== "function" ||
      typeof facade.dispatch !== "function") {
    fail("facade must expose init() and dispatch()");
  }
  const handle = unwrap("mount", bridge.mount(root, facade));
  if (hasInstanceMethods(handle)) return adaptHandle(handle);

  // Keep the published singleton test-double contract working while requiring
  // the complete old method table and its null mount result. Real Go/WASM now
  // returns a per-instance handle from mount().
  if ((handle === null || handle === undefined) && hasLegacySingletonMethods(bridge)) {
    return adaptLegacySingleton(bridge);
  }
  fail("gobiGoDOM.mount() must return a renderer API");
}
