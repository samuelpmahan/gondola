import assert from "node:assert/strict";
import { mountCompiledApp, RuntimeFailure } from "../../../../compiled-frontend/frontend/runtime/runtime.mjs";

const stateType = "fixture.State";
const componentId = "fixture/app";
const view = { Kind: 1, Tag: "div", Key: "root", Attrs: [], On: [], Kids: [], Text: "ok" };
const compiled = {
  schema: "gobi.compiled-module/v1",
  appIR: {
    schema: "gobi.app-ir/v1",
    packagePath: "fixture/app",
    components: [{
      id: componentId,
      packagePath: "fixture/app",
      stateType,
      messageType: "gobi.Message",
      init: "fixture.Init",
      update: "fixture.Update",
      view: "fixture.View",
      capabilities: ["view.node"],
    }],
  },
  symbols: {
    "fixture.Init": () => 0,
    "fixture.Update": (state) => [state, []],
    "fixture.View": () => view,
  },
};
const encoder = {
  gobiEncodeState(state, typeId) {
    return { typeId, kind: "int", integer: String(state) };
  },
};

function makeRenderer() {
  return {
    current: null,
    update(nextView) { this.current = nextView; },
    viewRecord() {
      return {
        tree: { kind: "element", tag: "div", key: "root", attrs: [], on: [], kids: [], text: "ok" },
        bindings: [],
      };
    },
    domSnapshot() { return { normalization: "outerHTML-v1", html: "<div>ok</div>", controls: [] }; },
    unmount() { this.unmounted = true; this.current = null; },
  };
}

function mount(renderer = makeRenderer()) {
  const runtime = mountCompiledApp({
    module: compiled,
    componentId,
    appId: componentId,
    encoder,
    renderer,
  });
  return { renderer, runtime };
}

const unhandled = [];
const onUnhandled = (reason) => unhandled.push(reason instanceof Error ? reason.message : String(reason));
process.on("unhandledRejection", onUnhandled);

try {
  const results = [];
  for (const method of ["update", "viewRecord", "domSnapshot"]) {
    const { renderer: oldRenderer, runtime } = mount();
    const nextRenderer = makeRenderer();
    nextRenderer[method] = () => Promise.reject(new Error(`late ${method}`));
    assert.throws(() => runtime.replaceRenderer(nextRenderer), RuntimeFailure);
    const diagnostic = runtime.rendererDiagnostics().replacements.at(-1);
    assert.equal(diagnostic.phase, method === "update" ? "new-commit" : "new-snapshot");
    assert.equal(runtime.failure().stage, "renderer-replacement");
    assert.equal(oldRenderer.unmounted, true);
    results.push({ method, phase: diagnostic.phase, stage: runtime.failure().stage, outcome: diagnostic.outcome });
  }

  {
    const { renderer: oldRenderer, runtime } = mount();
    oldRenderer.unmount = () => Promise.reject(new Error("late old unmount"));
    assert.throws(() => runtime.replaceRenderer(makeRenderer()), RuntimeFailure);
    const diagnostic = runtime.rendererDiagnostics().replacements.at(-1);
    assert.equal(diagnostic.phase, "old-unmount");
    assert.equal(diagnostic.oldUnmounted, false);
    results.push({ method: "swap old unmount", phase: diagnostic.phase, stage: runtime.failure().stage, outcome: diagnostic.outcome });
  }

  {
    const { renderer: oldRenderer, runtime } = mount();
    const focus = {
      identity: "[\"keyed-input\"]",
      selectionStart: 0,
      selectionEnd: 1,
      selectionDirection: "forward",
    };
    oldRenderer.focusState = () => focus;
    oldRenderer.restoreFocus = () => true;
    const nextRenderer = makeRenderer();
    nextRenderer.focusState = () => null;
    nextRenderer.restoreFocus = () => Promise.reject(new Error("late restore"));
    assert.throws(() => runtime.replaceRenderer(nextRenderer), RuntimeFailure);
    const diagnostic = runtime.rendererDiagnostics().replacements.at(-1);
    assert.equal(diagnostic.phase, "focus-restore");
    results.push({ method: "restoreFocus", phase: diagnostic.phase, stage: runtime.failure().stage, outcome: diagnostic.outcome });
  }

  {
    const { renderer, runtime } = mount();
    renderer.unmount = () => Promise.reject(new Error("late final unmount"));
    assert.equal(runtime.unmount(), false);
    assert.equal(runtime.failure().stage, "unmount");
    assert.equal(runtime.isUnmounted(), true);
    results.push({ method: "final unmount", phase: "unmount", returned: false, stage: runtime.failure().stage });
  }

  {
    const { renderer: oldRenderer, runtime } = mount();
    oldRenderer.focusState = () => Promise.reject(new Error("late focus capture"));
    oldRenderer.restoreFocus = () => true;
    const nextRenderer = makeRenderer();
    nextRenderer.focusState = () => null;
    nextRenderer.restoreFocus = () => true;
    assert.throws(() => runtime.replaceRenderer(nextRenderer), /focusState\(\).*synchronously/i);
    assert.equal(oldRenderer.unmounted, undefined);
    assert.equal(runtime.failure(), null);
    results.push({ method: "focusState", phase: "focus-capture", outcome: "rejected-before-teardown" });
  }

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(unhandled, []);
  console.log(JSON.stringify({ results, unhandledRejections: unhandled }, null, 2));
} finally {
  process.off("unhandledRejection", onUnhandled);
}
