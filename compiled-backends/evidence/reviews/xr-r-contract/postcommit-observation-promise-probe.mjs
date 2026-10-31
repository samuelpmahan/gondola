import { mountCompiledApp, RuntimeFailure } from "../../../../compiled-frontend/frontend/runtime/runtime.mjs";

const component = {
  id: "sample.App",
  packagePath: "sample",
  stateType: "sample.State",
  messageType: "sample.Message",
  init: "sample.Init",
  update: "sample.Update",
  view: "sample.View",
  capabilities: [],
};

function createModule() {
  return {
    schema: "gobi.compiled-module/v1",
    appIR: {
      schema: "gobi.app-ir/v1",
      packagePath: "sample",
      components: [component],
      symbols: [
        { id: "sample.Init", packagePath: "sample", name: "Init", signature: { params: [], results: ["sample.State"] } },
        { id: "sample.Update", packagePath: "sample", name: "Update", signature: { params: ["sample.State", "sample.Message"], results: ["sample.State", "[]gobi.Effect"] } },
        { id: "sample.View", packagePath: "sample", name: "View", signature: { params: ["sample.State"], results: ["gobi.Node"] } },
      ],
    },
    symbols: {
      "sample.Init": () => ({ value: "initial" }),
      "sample.Update": (state) => [{ ...state }, []],
      "sample.View": () => ({ Kind: 1, Tag: "div", Key: "root", Attrs: null, On: null, Kids: null, Text: "ready" }),
    },
  };
}

function renderer(failingMethod = null) {
  return {
    current: null,
    update(view) { this.current = view; },
    viewRecord() {
      if (failingMethod === "viewRecord") return Promise.reject(new Error("late viewRecord rejection"));
      return {
        tree: { kind: "element", tag: "div", key: "root", attrs: [], on: [], kids: [], text: "ready" },
        bindings: [],
      };
    },
    domSnapshot() {
      if (failingMethod === "domSnapshot") return Promise.reject(new Error("late domSnapshot rejection"));
      return { normalization: "outerHTML-v1", html: "<div>ready</div>", controls: [] };
    },
    unmount() { this.current = null; },
  };
}

const unhandledRejections = [];
const onUnhandled = (reason) => unhandledRejections.push(reason instanceof Error ? reason.message : String(reason));
process.on("unhandledRejection", onUnhandled);
const results = [];
for (const method of ["viewRecord", "domSnapshot"]) {
  const old = renderer();
  const runtime = mountCompiledApp({
    module: createModule(),
    componentId: component.id,
    encoder: { gobiEncodeState: () => ({ typeId: "sample.State", kind: "string", string: "ready" }) },
    renderer: old,
  });
  let caught = null;
  try {
    runtime.replaceRenderer(renderer(method));
  } catch (error) {
    caught = { name: error.name, runtimeFailure: error instanceof RuntimeFailure, stage: error.stage ?? null };
  }
  results.push({
    method,
    caught,
    failure: runtime.failure(),
    oldUnmounted: old.current === null,
    snapshotUnavailable: (() => {
      try { runtime.snapshot(); return false; }
      catch { return true; }
    })(),
  });
}
await new Promise((resolve) => setImmediate(resolve));
process.off("unhandledRejection", onUnhandled);
console.log(JSON.stringify({ results, unhandledRejections }, null, 2));
