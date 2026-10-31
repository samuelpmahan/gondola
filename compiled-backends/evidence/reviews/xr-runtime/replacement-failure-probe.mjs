import { mountCompiledApp, RuntimeFailure } from "../../../../compiled-frontend/frontend/runtime/runtime.mjs";

const COMPONENT = {
  id: "probe",
  packagePath: "example/probe",
  stateType: "probe.State",
  messageType: "gobi.Message",
  init: "probe.Init",
  update: "probe.Update",
  view: "probe.View",
  capabilities: [],
};

function moduleFor() {
  return {
    schema: "gobi.compiled-module/v1",
    appIR: {
      schema: "gobi.app-ir/v1",
      packagePath: "example/probe",
      components: [COMPONENT],
      symbols: [
        { id: "probe.Init", packagePath: "example/probe", name: "Init", signature: { params: [], results: ["probe.State"] } },
        { id: "probe.Update", packagePath: "example/probe", name: "Update", signature: { params: ["probe.State", "gobi.Message"], results: ["probe.State", "[]gobi.Effect"] } },
        { id: "probe.View", packagePath: "example/probe", name: "View", signature: { params: ["probe.State"], results: ["gobi.Node"] } },
      ],
      types: [],
    },
    symbols: {
      "probe.Init": () => ({ count: 0 }),
      "probe.Update": (state) => [{ ...state }, []],
      "probe.View": () => ({ Kind: 1, Tag: "div", Key: "root", Attrs: null, On: null, Kids: null, Text: "probe" }),
    },
  };
}

const encoder = {
  gobiEncodeState(state, typeId) {
    return { typeId, kind: "struct", fields: [{ name: "count", value: { typeId: "int64", kind: "int", int: String(state.count) } }] };
  },
};

function renderer(overrides = {}) {
  return {
    current: null,
    update(view) { this.current = view; },
    viewRecord() {
      return {
        tree: { kind: "element", tag: "div", key: "root", attrs: null, on: null, kids: null, text: this.current?.Text ?? "probe" },
        bindings: [],
      };
    },
    domSnapshot() { return { normalization: "outerHTML-v1", html: `<div>${this.current?.Text ?? "probe"}</div>`, controls: [] }; },
    unmount() { this.current = null; },
    ...overrides,
  };
}

const undefinedRestoreRuntime = mountCompiledApp({
  module: moduleFor(), componentId: "probe", encoder, renderer: renderer({
    focusState() { return { identity: '["field"]', selectionStart: 1, selectionEnd: 2, selectionDirection: "backward" }; },
    restoreFocus() { return undefined; },
  }),
});
const focusTarget = renderer({ focusState() { return null; }, restoreFocus() { return undefined; } });
const undefinedRestore = undefinedRestoreRuntime.replaceRenderer(focusTarget);

const unhandledRejections = [];
const onUnhandled = (reason) => unhandledRejections.push(reason instanceof Error ? reason.message : String(reason));
process.on("unhandledRejection", onUnhandled);
const thenableRuntime = mountCompiledApp({ module: moduleFor(), componentId: "probe", encoder, renderer: renderer() });
const oldRenderer = renderer();
let replacementError = null;
try {
  thenableRuntime.replaceRenderer(renderer({ update() { return Promise.reject(new Error("late renderer rejection")); } }));
} catch (error) {
  replacementError = { name: error.name, isRuntimeFailure: error instanceof RuntimeFailure, stage: error.stage };
}
await new Promise((resolve) => setTimeout(resolve, 0));
process.off("unhandledRejection", onUnhandled);

console.log(JSON.stringify({
  undefinedRestore: {
    succeeded: undefinedRestore !== null,
    diagnostics: undefinedRestoreRuntime.rendererDiagnostics().replacements[0],
  },
  rejectedThenable: {
    error: replacementError,
    runtimeFailure: thenableRuntime.failure(),
    snapshotUnavailable: (() => {
      try { thenableRuntime.snapshot(); return false; }
      catch { return true; }
    })(),
    unhandledRejections,
  },
}, null, 2));
