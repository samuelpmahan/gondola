import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(reportDir, "../../..");
const godomWasm = resolve(repoRoot, "renderer-conformance/build/godom.wasm");
const collectionWasm = resolve(repoRoot, "keyed-editor/build/keyed-collection.wasm");
const wasmExec = resolve(repoRoot, "renderer-conformance/build/wasm_exec.js");
const manifestPath = resolve(repoRoot, "renderer-conformance/build/manifest.json");

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>XR-E2 direct Go/WASM review</title></head>
<body><div id="root"></div><script src="/wasm_exec.js"></script><script>
window.__xrE2Probe = (async () => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const waitFor = async (ready) => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (ready()) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Go WASM global did not publish within the bounded wait");
  };
  const startGo = async (url) => {
    const go = new Go();
    const response = await fetch(url);
    if (!response.ok) throw new Error("could not load " + url + ": " + response.status);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
    void go.run(instance);
    return go;
  };
  const unwrap = (value, operation) => {
    if (value && typeof value === "object" && typeof value.error === "string") {
      throw new Error(operation + ": " + value.error);
    }
    return value;
  };
  await startGo("/collection.wasm");
  await waitFor(() => globalThis.gobiCollection);
  await startGo("/godom.wasm");
  await waitFor(() => globalThis.gobiGoDOM);
  const manifestResponse = await fetch("/manifest.json");
  if (!manifestResponse.ok) throw new Error("Go manifest request failed");
  const manifest = await manifestResponse.json();
  assert(typeof manifest.messageBlankRunes === "string" &&
    manifest.messageBlankRunes.includes("\\u0085") && manifest.messageBlankRunes.includes("\\ufeff"),
    "compiled renderer review requires the refreshed Go blank-rune manifest");

  const api = globalThis.gobiGoDOM;
  const root = document.getElementById("root");
  const makeFacade = (setFailure) => ({
    init() { return unwrap(gobiCollection.init(), "collection init"); },
    dispatch(step) { return unwrap(gobiCollection.dispatch(step), "collection dispatch"); },
    rendererFailed(error) { setFailure(error); },
  });
  const findHandler = (node) => {
    if (node.On && node.On.length > 0) return node.On[0];
    for (const child of node.Kids || []) {
      const found = findHandler(child);
      if (found) return found;
    }
    return null;
  };
  const traceInputWrites = (run) => {
    const writes = [];
    const setAttribute = Element.prototype.setAttribute;
    const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (!valueDescriptor || typeof valueDescriptor.get !== "function" || typeof valueDescriptor.set !== "function" ||
        valueDescriptor.configurable !== true) {
      throw new Error("HTMLInputElement.value descriptor is not instrumentable in this browser");
    }
    Element.prototype.setAttribute = function (name, value) {
      if (this.localName === "input") writes.push("attribute:" + name);
      return setAttribute.call(this, name, value);
    };
    Object.defineProperty(HTMLInputElement.prototype, "value", {
      configurable: true,
      enumerable: valueDescriptor.enumerable,
      get() { return valueDescriptor.get.call(this); },
      set(value) {
        writes.push("property:value");
        return valueDescriptor.set.call(this, value);
      },
    });
    try {
      run();
      return writes;
    } finally {
      Element.prototype.setAttribute = setAttribute;
      Object.defineProperty(HTMLInputElement.prototype, "value", valueDescriptor);
    }
  };
  const messageFailures = [];
  let inputPropertyOrder = null;
  for (const field of ["handler", "binding"]) {
    for (const [label, value] of [["u0085", "\\u0085"], ["ufeff", "\\ufeff"]]) {
      let failure = null;
      const facade = makeFacade((error) => { failure = error; });
      unwrap(api.mount(root, facade), "mount for " + field + " " + label);
      if (field === "handler" && label === "u0085") {
        const initialWrites = traceInputWrites(() => unwrap(api.click("0"), "add row for input-order probe"));
        assert(JSON.stringify(initialWrites) === JSON.stringify([
          "attribute:aria-label", "attribute:type", "attribute:value",
        ]), "input attributes must be written ordinary attributes, type, then value");
        const input = root.querySelector("input");
        input.value = "external value";
        const next = unwrap(gobiCollection.dispatch({
          Path: "2/0/0", Event: "input", Value: "Go controlled value", Key: "row-1-input",
        }), "real Go controlled-value dispatch");
        const updateWrites = traceInputWrites(() => unwrap(api.update(next), "apply controlled-value update"));
        assert(JSON.stringify(updateWrites) === JSON.stringify(["attribute:value", "property:value"]),
          "input.value must be assigned only after its changed value attribute and only when the live property differs");
        assert(input.value === "Go controlled value", "real Go snapshot value must reach the same retained input element");
        inputPropertyOrder = { initialWrites, updateWrites, liveValue: input.value };
      } else {
        unwrap(api.click("0"), "add row for " + field + " " + label);
      }
      const accepted = unwrap(api.snapshot(), "snapshot before " + field + " " + label);
      const invalid = structuredClone(accepted);
      if (field === "handler") {
        const handler = findHandler(invalid.tree);
        assert(handler, "real Go app snapshot must contain a literal handler");
        handler.Message = value;
      } else {
        assert(invalid.bindings.length > 0, "real Go app snapshot must contain an input binding");
        invalid.bindings[0].Message = value;
      }
      const beforeHTML = root.innerHTML;
      const beforeState = gobiCollection.snapshot();
      const rejected = api.update(invalid);
      const afterHTML = root.innerHTML;
      const afterState = gobiCollection.snapshot();
      const fenced = api.snapshot();
      const record = {
        field,
        rune: label,
        rejected: rejected && Object.keys(rejected).length === 1 && typeof rejected.error === "string",
        htmlUnchanged: beforeHTML === afterHTML,
        appStateUnchanged: JSON.stringify(beforeState) === JSON.stringify(afterState),
        rendererFenced: fenced && typeof fenced.error === "string",
        hostNotified: failure !== null,
        error: rejected && rejected.error,
      };
      assert(record.rejected, field + " " + label + " must return exact {error:string}");
      assert(record.htmlUnchanged, field + " " + label + " rejection must precede DOM mutation");
      assert(record.appStateUnchanged, field + " " + label + " host update must not dispatch app state");
      assert(record.rendererFenced, field + " " + label + " rejection must fence later renderer calls");
      assert(!record.hostNotified, field + " " + label + " host-invoked update must not report a native-event failure");
      messageFailures.push(record);
      unwrap(api.unmount(), "unmount after " + field + " " + label);
    }
  }

  let dispatchFailure = null;
  const failureFacade = makeFacade((error) => { dispatchFailure = error; });
  unwrap(api.mount(root, failureFacade), "mount for post-dispatch paint failure");
  const appBefore = gobiCollection.snapshot();
  const originalCreateTextNode = document.createTextNode;
  let inject = true;
  document.createTextNode = function (value) {
    if (inject) {
      inject = false;
      throw new Error("XR-E2 injected DOM text-node failure after Go dispatch");
    }
    return originalCreateTextNode.call(this, value);
  };
  let clickResult;
  try {
    clickResult = api.click("0");
  } finally {
    document.createTextNode = originalCreateTextNode;
  }
  const appAfter = gobiCollection.snapshot();
  const fencedAfterDispatch = api.snapshot();
  const dispatchFailureRecord = {
    clickReturnedError: clickResult && Object.keys(clickResult).length === 1 && typeof clickResult.error === "string",
    rendererFailedNotified: dispatchFailure && typeof dispatchFailure.error === "string",
    appRowsBefore: appBefore.state.Rows.length,
    appRowsAfter: appAfter.state.Rows.length,
    appDispatchCommitted: appAfter.state.Rows.length === appBefore.state.Rows.length + 1,
    rendererFenced: fencedAfterDispatch && typeof fencedAfterDispatch.error === "string",
    clickError: clickResult && clickResult.error,
    notification: dispatchFailure,
    partialDOMAfterPaintFailure: root.innerHTML,
  };
  assert(dispatchFailureRecord.clickReturnedError, "paint failure after native click must return an error");
  assert(dispatchFailureRecord.rendererFailedNotified, "native callback paint failure must notify rendererFailed");
  assert(dispatchFailureRecord.appDispatchCommitted,
    "real Go application state must remain committed when renderer paint fails; no rollback is claimed");
  assert(dispatchFailureRecord.rendererFenced, "renderer must fence itself after callback paint failure");
  unwrap(api.unmount(), "unmount after post-dispatch paint failure");

  return {
    ok: true,
    manifestHasGoBlankRunes: true,
    realGoRuntimes: ["collection WASM", "Go DOM renderer WASM"],
    messageFailures,
    inputPropertyOrder,
    postDispatchPaintFailure: dispatchFailureRecord,
  };
})().catch((error) => {
  window.__xrE2ProbeError = String(error && error.stack || error);
  throw error;
});
</script></body></html>`;

const files = new Map([
  ["/", [null, "text/html; charset=utf-8"]],
  ["/godom.wasm", [godomWasm, "application/wasm"]],
  ["/collection.wasm", [collectionWasm, "application/wasm"]],
  ["/wasm_exec.js", [wasmExec, "text/javascript; charset=utf-8"]],
  ["/manifest.json", [manifestPath, "application/json; charset=utf-8"]],
]);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const entry = files.get(pathname);
  if (!entry) {
    response.writeHead(404).end("not found");
    return;
  }
  try {
    response.setHeader("content-type", entry[1]);
    response.end(entry[0] === null ? html : await readFile(entry[0]));
  } catch (error) {
    response.writeHead(500).end(`file unavailable: ${error.message}`);
  }
});
await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveListen);
});

let browser;
try {
  const require = createRequire(resolve(repoRoot, "interaction/package.json"));
  const { chromium } = require("playwright");
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
  const result = await page.evaluate(async () => {
    await window.__xrE2Probe;
    return window.__xrE2ProbeError ? { error: window.__xrE2ProbeError } : window.__xrE2Probe;
  });
  assert.deepEqual(pageErrors, [], JSON.stringify({ result, pageErrors }));
  assert.equal(result.ok, true, JSON.stringify(result));
  await writeFile(resolve(reportDir, "XR-E2-probe-results.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
