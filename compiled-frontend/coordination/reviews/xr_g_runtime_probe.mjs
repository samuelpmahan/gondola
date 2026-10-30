import { mountCompiledApp } from "../../frontend/runtime/runtime.mjs";

function setup() {
  let updates = 0;
  let callbacks;
  let currentView = null;
  const symbols = {
    init: () => ({ count: 0 }),
    update: (state) => {
      updates += 1;
      return [{ count: state.count + 1 }, []];
    },
    view: (state) => ({ Kind: 1, Tag: "div", Key: "root", Attrs: [], On: [], Kids: [], Text: String(state.count) }),
  };
  const module = {
    schema: "gobi.compiled-module/v1",
    appIR: {
      schema: "gobi.app-ir/v1",
      packagePath: "probe",
      components: [{
        id: "probe.Counter", packagePath: "probe", stateType: "probe.State", messageType: "gobi.Message",
        init: "probe.Init", update: "probe.Update", view: "probe.View", capabilities: ["view.node"],
      }],
      symbols: [
        { id: "probe.Init", packagePath: "probe", name: "Init" },
        { id: "probe.Update", packagePath: "probe", name: "Update" },
        { id: "probe.View", packagePath: "probe", name: "View" },
      ],
      types: [],
    },
    symbols: { "probe.Init": symbols.init, "probe.Update": symbols.update, "probe.View": symbols.view },
  };
  const renderer = {
    update(view, handlers) { currentView = view; callbacks = handlers; },
    viewRecord() {
      if (currentView === null) return null;
      return { tree: { kind: "element", tag: "div", key: "root", attrs: [], on: [], kids: [], text: currentView.Text }, bindings: [] };
    },
    domSnapshot() {
      if (currentView === null) throw new Error("cannot snapshot DOM after renderer unmount");
      return { normalization: "outerHTML-v1", html: `<div>${currentView.Text}</div>`, controls: [] };
    },
    unmount() { currentView = null; },
  };
  const runtime = mountCompiledApp({
    module,
    componentId: "probe.Counter",
    encoder: { gobiEncodeState: (state) => ({ typeId: "probe.State", kind: "struct", fields: [{ name: "count", value: { typeId: "int", kind: "int", int: String(state.count) } }] }) },
    renderer,
  });
  return { runtime, callbacks, getUpdates: () => updates, getCallbacks: () => callbacks };
}

const casing = setup();
casing.getCallbacks().dispatch({ Path: "", Event: "click", Value: "intent" }, { Name: "inc", Arg: "" });
const casingFailure = casing.runtime.failure();

const reentry = setup();
let nestedResult;
let entered = false;
const actionWithGetter = {
  get path() {
    if (!entered) {
      entered = true;
      nestedResult = reentry.runtime.dispatch({ path: "nested", event: "click", value: "" }, { Name: "nested", Arg: "" });
    }
    return "outer";
  },
  event: "click",
  value: "",
};
const outerResult = reentry.runtime.dispatch(actionWithGetter, { Name: "outer", Arg: "" });

const afterUnmount = setup();
afterUnmount.runtime.unmount();
const postUnmountStaleResult = afterUnmount.runtime.recordStaleAction({ path: "stale", event: "click", value: "" }, 1);

process.stdout.write(JSON.stringify({
  rendererActionCasing: {
    failure: casingFailure,
    updateCalls: casing.getUpdates(),
    traceTicks: casing.runtime.trace().ticks.length,
  },
  accessorReentry: {
    nestedAccepted: nestedResult?.accepted,
    outerAccepted: outerResult.accepted,
    updateCalls: reentry.getUpdates(),
    traceTicks: reentry.runtime.trace().ticks.length,
    tickActions: reentry.runtime.trace().ticks.map((tick) => tick.action),
  },
  postUnmountStale: {
    result: postUnmountStaleResult,
    failure: afterUnmount.runtime.failure(),
    traceTicks: afterUnmount.runtime.trace().ticks.length,
  },
}));
