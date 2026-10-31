import test from "node:test";
import assert from "node:assert/strict";

const hostModule = await import("./runtime.mjs").catch(() => ({}));
const {
  COMPILED_CHILDREN_HOST_CAPABILITIES,
  createCompiledChildrenEffectDriver,
  mountCompiledChildrenApp,
  validateCompiledChildrenEffect,
} = hostModule;

const APP_ID = "children-host-test";
const COMPONENT_ID = "children";
const STATE_TYPE = "children.State";

function ensureHostAPI() {
  assert.equal(typeof mountCompiledChildrenApp, "function", "host must export mountCompiledChildrenApp");
  assert.equal(typeof validateCompiledChildrenEffect, "function", "host must export the closed effect validator");
  assert.equal(typeof createCompiledChildrenEffectDriver, "function", "host must export its deterministic effect driver");
}

class GoEffect {
  constructor({ Kind, Name, Arg, Reply }) {
    this.Kind = Kind;
    this.Name = Name;
    this.Arg = Arg;
    this.Reply = Reply;
    this.__goStructValue = true;
  }

  clone() {}

  __goscriptAssign() {}
}

function makeEffect(kind, name, arg, reply) {
  return new GoEffect({ Kind: kind, Name: name, Arg: arg, Reply: reply });
}

function makeRenderer() {
  return {
    viewCapabilities: ["view.node", "binding.value", "binding.checked"],
    callbacks: null,
    previousCallbacks: [],
    view: null,
    unmounted: false,
    update(view, callbacks) {
      if (this.callbacks) this.previousCallbacks.push(this.callbacks);
      this.callbacks = callbacks;
      this.view = view;
      this.unmounted = false;
    },
    viewRecord() {
      return {
        tree: { kind: "element", tag: "div", key: "root", attrs: [], on: [], kids: [], text: this.view?.text ?? "" },
        bindings: [],
      };
    },
    domSnapshot() {
      return {
        normalization: "outerHTML-v1",
        html: this.unmounted ? "" : `<div>${this.view?.text ?? ""}</div>`,
        controls: [],
      };
    },
    unmount() {
      this.unmounted = true;
    },
  };
}

function makeModule() {
  return {
    schema: "gobi.compiled-module/v1",
    appIR: {
      schema: "gobi.app-ir/v1",
      packagePath: "example/children",
      components: [{
        id: COMPONENT_ID,
        packagePath: "example/children",
        stateType: STATE_TYPE,
        messageType: "gobi.Message",
        init: "children.Init",
        update: "children.Update",
        view: "children.View",
        capabilities: ["view.node", "effect.request-reply", "effect.cancel"],
      }],
      types: [],
    },
    symbols: {
      "children.Init": () => ({ reply: "", completed: 0 }),
      "children.Update": (state, message) => {
        if (message.Name === "request") {
          return [state, [makeEffect("fixture.request", "lookup", message.Arg, "complete")]];
        }
        if (message.Name === "cancel") {
          return [state, [makeEffect("lifecycle.cancel", "cancel", message.Arg, "")]];
        }
        if (message.Name === "complete") {
          return [{ reply: message.Arg, completed: state.completed + 1 }, []];
        }
        return [state, []];
      },
      "children.View": (state) => ({ Kind: 1, Tag: "div", Key: "root", Attrs: [], On: [], Kids: [], Text: state.reply }),
    },
  };
}

function makeEncoder() {
  return {
    gobiEncodeState(state, typeId) {
      return {
        typeId,
        kind: "struct",
        fields: [
          { name: "reply", value: { typeId: "string", kind: "string", string: state.reply } },
          { name: "completed", value: { typeId: "int64", kind: "int", int: String(state.completed) } },
        ],
      };
    },
  };
}

function mount(renderer = makeRenderer()) {
  return mountCompiledChildrenApp({
    module: makeModule(),
    componentId: COMPONENT_ID,
    appId: APP_ID,
    encoder: makeEncoder(),
    renderer,
  });
}

function dispatchMessage(runtime, name, arg) {
  return runtime.dispatch(
    { path: "root", event: "click", value: "" },
    { Name: name, Arg: arg },
  );
}

function snapshotString(runtime, fieldName) {
  const field = runtime.snapshot().state.fields.find((candidate) => candidate.name === fieldName);
  return field?.value.string;
}

test("closed effect policy accepts canonical parent and keyed-child request/cancel tuples", () => {
  ensureHostAPI();
  assert.deepEqual(COMPILED_CHILDREN_HOST_CAPABILITIES, ["effect.request-reply", "effect.cancel"]);

  assert.equal(validateCompiledChildrenEffect({
    kind: "fixture.request", name: "lookup", arg: "parent:g1:r2", reply: "complete",
  }), undefined);
  assert.equal(validateCompiledChildrenEffect({
    kind: "fixture.request", name: "lookup", arg: "child:oak_2:g9007199254740991:r1", reply: "complete",
  }), undefined);
  assert.equal(validateCompiledChildrenEffect({
    kind: "lifecycle.cancel", name: "cancel", arg: "child:a:g2:r3", reply: "",
  }), undefined);

  for (const effect of [
    { kind: "fixture.request", name: "cancel", arg: "parent:g1:r1", reply: "complete" },
    { kind: "fixture.request", name: "lookup", arg: "child:A:g1:r1", reply: "complete" },
    { kind: "fixture.request", name: "lookup", arg: "child:a:g01:r1", reply: "complete" },
    { kind: "fixture.request", name: "lookup", arg: "parent:g1:r9007199254740992", reply: "complete" },
    { kind: "lifecycle.cancel", name: "cancel", arg: "child:a:g1:r1", reply: "complete" },
    { kind: "other.request", name: "lookup", arg: "parent:g1:r1", reply: "complete" },
  ]) {
    assert.throws(() => validateCompiledChildrenEffect(effect), TypeError);
  }
});

test("manual completion preserves the original runtime correlation and token message", () => {
  ensureHostAPI();
  const { runtime, effects } = mount();
  const token = "child:oak:g2:r1";

  assert.equal(dispatchMessage(runtime, "request", token).accepted, true);
  const pending = effects.pending();
  assert.equal(pending.length, 1);
  assert.deepEqual(pending[0], {
    sequence: 1,
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    token,
    effect: { kind: "fixture.request", name: "lookup", arg: token, reply: "complete" },
  });

  const delivered = effects.deliver(token);
  assert.equal(delivered.accepted, true);
  const deliveryRecord = effects.records()[1];
  assert.deepEqual(deliveryRecord.message, { name: "complete", arg: token });
  assert.deepEqual({ dispatchId: deliveryRecord.dispatchId, effectIndex: deliveryRecord.effectIndex }, {
    dispatchId: "dispatch-0001",
    effectIndex: 0,
  });
  assert.deepEqual(effects.pending(), []);
  assert.equal(snapshotString(runtime, "reply"), token);
  assert.deepEqual(effects.records().map(({ kind, token: value, outcome }) => [kind, value, outcome]), [
    ["request", token, "queued"],
    ["deliver", token, "accepted"],
  ]);
});

test("Go-emitted cancellation retires only its token correlation and blocks later delivery", () => {
  ensureHostAPI();
  const { runtime, effects } = mount();
  const token = "parent:g1:r1";

  assert.equal(dispatchMessage(runtime, "request", token).accepted, true);
  assert.equal(dispatchMessage(runtime, "cancel", token).accepted, true);
  assert.deepEqual(effects.pending(), []);
  const delivery = effects.deliver(token);
  assert.equal(delivery.accepted, false);
  assert.equal(delivery.outcome, "rejected");
  assert.equal(delivery.error, "lifecycle request is cancelled");

  const records = effects.records();
  assert.deepEqual(records.map(({ kind, token: value, outcome }) => [kind, value, outcome]), [
    ["request", token, "queued"],
    ["cancel", token, "cancelled"],
    ["deliver", token, "rejected"],
  ]);
  assert.deepEqual(records[1].target, { dispatchId: "dispatch-0001", effectIndex: 0 });
  assert.deepEqual(runtime.effectDiagnostics().pending, []);
});

test("compatible swaps retain requests while rejected candidates preserve old renderer and callback", () => {
  ensureHostAPI();
  const oldRenderer = makeRenderer();
  const { runtime, effects } = mount(oldRenderer);
  const token = "child:elm:g3:r2";
  assert.equal(dispatchMessage(runtime, "request", token).accepted, true);
  const retiredCallbacks = oldRenderer.callbacks;

  const acceptedRenderer = makeRenderer();
  assert.equal(runtime.replaceRenderer(acceptedRenderer).state.fields[0].value.string, "");
  assert.equal(effects.pending()[0].token, token);
  const staleCallback = retiredCallbacks.dispatch(
    { path: "root", event: "click", value: "" },
    { Name: "ignored", Arg: "" },
  );
  assert.equal(staleCallback.accepted, false);
  assert.equal(staleCallback.stale, true);
  assert.equal(effects.deliver(token).accepted, true);
  assert.equal(snapshotString(runtime, "reply"), token);

  const beforeRejectedSwap = runtime.snapshot();
  const oldCallbacks = acceptedRenderer.callbacks;
  const incompatible = makeRenderer();
  incompatible.viewCapabilities = [];
  assert.throws(() => runtime.replaceRenderer(incompatible), /viewCapabilities/);
  assert.deepEqual(runtime.snapshot(), beforeRejectedSwap);
  assert.equal(acceptedRenderer.unmounted, false);
  assert.equal(oldCallbacks.dispatch({ path: "root", event: "click", value: "" }, { Name: "ignored", Arg: "" }).accepted, true);
  assert.equal(runtime.trace().ticks.length, 4);
});

test("mounted host unmount retires its outstanding request correlation", () => {
  ensureHostAPI();
  const { runtime, effects } = mount();
  const token = "parent:g1:r1";
  assert.equal(dispatchMessage(runtime, "request", token).accepted, true);
  assert.equal(runtime.unmount(), true);
  assert.deepEqual(effects.pending(), []);
  assert.deepEqual(effects.records().map(({ kind, outcome, reason }) => [kind, outcome, reason ?? null]), [
    ["request", "queued", null],
    ["retire", "retired", "host-unmount"],
  ]);
  assert.equal(effects.deliver(token).accepted, false);
});

test("driver rejects duplicate pending request tokens and retires pending work on unmount", () => {
  ensureHostAPI();
  const driver = createCompiledChildrenEffectDriver();
  const delivered = [];
  let admittingCandidate = true;
  const runtimeStub = {
    cancelEffect(correlation) {
      return { accepted: true, cancelled: true, dispatchId: correlation.dispatchId, effectIndex: correlation.effectIndex };
    },
    isAdmittingRendererCandidate() { return admittingCandidate; },
  };
  driver.attachRuntime(runtimeStub);
  const token = "child:a:g2:r1";
  const request = {
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    effect: { kind: "fixture.request", name: "lookup", arg: token, reply: "complete" },
  };
  const deliver = (completion) => { delivered.push(completion); return { accepted: true }; };
  driver.effectHost.request(request, deliver);
  assert.throws(() => driver.effectHost.request(request, deliver), /duplicate/);
  assert.equal(driver.pending().length, 1);
  const paused = driver.deliver(token);
  assert.equal(paused.accepted, false);
  assert.equal(paused.retryable, true);
  assert.equal(driver.pending().length, 1);
  assert.equal(driver.retireAll(), false);
  admittingCandidate = false;
  assert.equal(driver.retireAll(), true);
  assert.deepEqual(driver.pending(), []);
  assert.deepEqual(driver.records().map(({ kind, outcome }) => [kind, outcome]), [
    ["request", "queued"],
    ["retire", "retired"],
  ]);
  assert.deepEqual(delivered, []);
  assert.equal(driver.deliver(token).accepted, false);
});
