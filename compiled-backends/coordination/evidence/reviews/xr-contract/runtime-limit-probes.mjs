import { mountCompiledApp } from "../../../../../compiled-frontend/frontend/runtime/runtime.mjs";

const componentId = "review.App";
const stateType = "review.State";
const compiled = {
  schema: "gobi.compiled-module/v1",
  appIR: {
    schema: "gobi.app-ir/v1",
    packagePath: "review",
    components: [{
      id: componentId,
      packagePath: "review",
      stateType,
      messageType: "review.Message",
      init: "review.Init",
      update: "review.Update",
      view: "review.View",
      capabilities: ["view.node"],
    }],
  },
  symbols: {
    "review.Init": () => "ready",
    "review.Update": (state) => [state, []],
    "review.View": () => null,
  },
};
const encoder = { gobiEncodeState: (state) => ({ typeId: stateType, kind: "string", string: state }) };
function makeRenderer(overrides = {}) {
  const renderer = {
    unmountCount: 0,
    update() {},
    viewRecord() { return { tree: { kind: "element", tag: "div", key: "", attrs: [], on: [], kids: [], text: "" }, bindings: [] }; },
    domSnapshot() { return { normalization: "outerHTML-v1", html: "<div></div>", controls: [] }; },
    focusState() { return null; },
    restoreFocus() { return true; },
    unmount() { this.unmountCount += 1; },
    ...overrides,
  };
  return renderer;
}
function start(oldRenderer) {
  return mountCompiledApp({ module: compiled, componentId, encoder, renderer: oldRenderer });
}

const focusOld = makeRenderer({ focusState() { throw new Error("focus capture failed"); } });
const focusRuntime = start(focusOld);
let focusError = "";
try { focusRuntime.replaceRenderer(makeRenderer()); } catch (error) { focusError = error.message; }
const focusCapture = {
  error: focusError,
  oldUnmountCount: focusOld.unmountCount,
  runtimeFailure: focusRuntime.failure(),
  snapshotAvailable: focusRuntime.snapshot().state.string === "ready",
};
focusRuntime.unmount();

const directOld = makeRenderer();
const directRuntime = start(directOld);
const directAsync = makeRenderer({ async update() {} });
let directError = "";
try { directRuntime.replaceRenderer(directAsync); } catch (error) { directError = error.message; }
const declaredAsync = {
  error: directError,
  oldUnmountCount: directOld.unmountCount,
  runtimeFailure: directRuntime.failure(),
};
directRuntime.unmount();

const boundOld = makeRenderer();
const boundRuntime = start(boundOld);
const asyncUpdate = async function update() {};
const boundAsync = makeRenderer({ update: asyncUpdate.bind(null) });
let boundError = "";
try { boundRuntime.replaceRenderer(boundAsync); } catch (error) { boundError = error.message; }
const boundAsyncResult = {
  error: boundError,
  oldUnmountCount: boundOld.unmountCount,
  runtimeFailure: boundRuntime.failure(),
  replacementOutcome: boundRuntime.rendererDiagnostics().replacements.at(-1)?.outcome,
};
boundRuntime.unmount();

const restoreOld = makeRenderer({ focusState() { return { identity: "x", selectionStart: 0, selectionEnd: 0, selectionDirection: "none" }; } });
const restoreRuntime = start(restoreOld);
const restoreUndefined = makeRenderer({ restoreFocus() {} });
restoreRuntime.replaceRenderer(restoreUndefined);
const restoreResult = restoreRuntime.rendererDiagnostics().replacements.at(-1);
restoreRuntime.unmount();

process.stdout.write(`${JSON.stringify({ focusCapture, declaredAsync, boundAsync: boundAsyncResult, restoreFocusUndefined: restoreResult }, null, 2)}\n`);
