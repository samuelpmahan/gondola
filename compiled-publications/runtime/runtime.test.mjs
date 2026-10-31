import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPILED_CHILDREN_HOST_CAPABILITIES,
  createCompiledChildrenEffectDriver,
  mountCompiledChildrenApp,
  validateCompiledChildrenEffect,
} from "../../compiled-children/runtime/runtime.mjs";

const publicationHost = await import("./runtime.mjs").catch(() => ({}));
const {
  COMPILED_PUBLICATIONS_HOST_CAPABILITIES,
  createCompiledPublicationsEffectDriver,
  mountCompiledPublicationsApp,
  validateCompiledPublicationsEffect,
} = publicationHost;

const APP_ID = "publications-host-test";
const COMPONENT_ID = "publications.App";
const STATE_TYPE = "publications.State";

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

function effect(kind, name, arg, reply) {
  return new GoEffect({ Kind: kind, Name: name, Arg: arg, Reply: reply });
}

function makeRenderer() {
  return {
    viewCapabilities: ["view.node", "binding.value", "binding.checked"],
    view: null,
    callbacks: null,
    oldCallbacks: [],
    unmounted: false,
    update(view, callbacks) {
      if (this.callbacks) this.oldCallbacks.push(this.callbacks);
      this.view = view;
      this.callbacks = callbacks;
      this.unmounted = false;
    },
    viewRecord() {
      return {
        tree: { kind: "element", tag: "div", key: "root", attrs: [], on: [], kids: [], text: "" },
        bindings: [],
      };
    },
    domSnapshot() {
      return { normalization: "outerHTML-v1", html: this.unmounted ? "" : "<div></div>", controls: [] };
    },
    clickCapture() {
      const button = this.view?.Kids?.[0];
      if (!button) throw new Error("Go View omitted the capture control");
      const disabled = button.Attrs?.some((attribute) => attribute.Name === "disabled" && attribute.Flag === true);
      if (disabled) return { accepted: false, disabled: true };
      const handler = button.On?.find((candidate) => candidate.Event === "click");
      if (!handler) throw new Error("Go View omitted the capture On message");
      return this.callbacks.dispatch(
        { path: "0", event: "click", value: "" },
        { Name: handler.Message, Arg: handler.Arg },
      );
    },
    unmount() {
      this.unmounted = true;
    },
  };
}

function makeModule() {
  const received = [];
  const component = {
    id: COMPONENT_ID,
    packagePath: "example/publications",
    stateType: STATE_TYPE,
    messageType: "gobi.Message",
    init: "publications.Init",
    update: "publications.Update",
    view: "publications.View",
    capabilities: [
      "view.node",
      "binding.value",
      "binding.checked",
      "numeric.safe-integer",
      "numeric.float64",
      "effect.request-reply",
      "effect.cancel",
    ],
  };
  const symbols = {
    "publications.Init": () => ({ Locked: true, Step: 1, Captures: 0, Completed: 0 }),
    "publications.Update": (state, message) => {
      received.push({ Name: message.Name, Arg: message.Arg });
      const next = { ...state };
      let effects = [];
      switch (message.Name) {
        case "input.step":
          next.Step = Number(message.Arg);
          break;
        case "input.toggleLock":
          next.Locked = !state.Locked;
          break;
        case "child.capture":
          if (!state.Locked) next.Captures += 1;
          break;
        case "publication.deliver":
          // The generated Go Update owns delivery decisions; this test double
          // only records the message boundary.
          break;
        case "request":
          effects = [effect("fixture.request", "lookup", message.Arg, "complete")];
          break;
        case "cancel":
          effects = [effect("lifecycle.cancel", "cancel", message.Arg, "")];
          break;
        case "complete":
          next.Completed += 1;
          break;
        default:
          break;
      }
      return [next, effects];
    },
    "publications.View": (state) => ({
      Kind: 1,
      Tag: "div",
      Key: "root",
      Attrs: [],
      On: [],
      Kids: [{
        Kind: 1,
        Tag: "button",
        Key: "capture",
        Attrs: state.Locked ? [{ Name: "disabled", Value: "", Flag: true, Style: [] }] : [],
        On: [{ Event: "click", Message: "child.capture", Arg: "oak" }],
        Kids: [{ Kind: 2, Text: "Capture" }],
      }],
      Text: "",
    }),
  };
  return {
    received,
    module: {
      schema: "gobi.compiled-module/v1",
      appIR: {
        schema: "gobi.app-ir/v1",
        packagePath: "example/publications",
        components: [component],
        types: [],
      },
      symbols,
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
          { name: "Locked", value: { typeId: "bool", kind: "bool", bool: state.Locked } },
          { name: "Step", value: { typeId: "int64", kind: "int", int: String(state.Step) } },
          { name: "Captures", value: { typeId: "int64", kind: "int", int: String(state.Captures) } },
          { name: "Completed", value: { typeId: "int64", kind: "int", int: String(state.Completed) } },
        ],
      };
    },
  };
}

function mount({ renderer = makeRenderer(), onTick = null, onFailure = null } = {}) {
  const fixture = makeModule();
  const mounted = mountCompiledPublicationsApp({
    module: fixture.module,
    componentId: COMPONENT_ID,
    appId: APP_ID,
    encoder: makeEncoder(),
    renderer,
    onTick,
    onFailure,
  });
  return { ...mounted, fixture, renderer };
}

function dispatch(runtime, name, arg = "") {
  return runtime.dispatch({ path: "root", event: "click", value: "" }, { Name: name, Arg: arg });
}

function field(runtime, name) {
  return runtime.snapshot().state.fields.find((candidate) => candidate.name === name)?.value;
}

function ensureHostAPI() {
  assert.equal(typeof mountCompiledPublicationsApp, "function", "host must export mountCompiledPublicationsApp");
  assert.equal(typeof validateCompiledPublicationsEffect, "function", "host must export closed effect validation");
  assert.equal(typeof createCompiledPublicationsEffectDriver, "function", "host must export deterministic effect driver");
}

test("publication mount accepts the existing numeric and effect capability profile", () => {
  ensureHostAPI();
  assert.equal(mountCompiledPublicationsApp.name, "mountCompiledPublicationsApp");
  assert.deepEqual(COMPILED_PUBLICATIONS_HOST_CAPABILITIES, COMPILED_CHILDREN_HOST_CAPABILITIES);
  assert.equal(Object.isFrozen(COMPILED_PUBLICATIONS_HOST_CAPABILITIES), true);
  assert.equal(validateCompiledPublicationsEffect, validateCompiledChildrenEffect);
  assert.equal(createCompiledPublicationsEffectDriver, createCompiledChildrenEffectDriver);

  const { runtime, fixture } = mount();
  assert.deepEqual(fixture.module.appIR.components[0].capabilities, [
    "view.node", "binding.value", "binding.checked", "numeric.safe-integer", "numeric.float64",
    "effect.request-reply", "effect.cancel",
  ]);
  assert.equal(field(runtime, "Locked").bool, true);
  assert.equal(runtime.trace().appId, APP_ID);
});

test("closed request/cancel profile is unchanged and publication inputs are not host effects", () => {
  ensureHostAPI();
  assert.equal(validateCompiledPublicationsEffect({
    kind: "fixture.request", name: "lookup", arg: "parent:g1:r1", reply: "complete",
  }), undefined);
  assert.equal(validateCompiledPublicationsEffect({
    kind: "lifecycle.cancel", name: "cancel", arg: "child:oak:g2:r1", reply: "",
  }), undefined);
  for (const bad of [
    { kind: "fixture.request", name: "lookup", arg: "parent:g01:r1", reply: "complete" },
    { kind: "fixture.request", name: "lookup", arg: "child:Oak:g2:r1", reply: "complete" },
    { kind: "publication.deliver", name: "deliver", arg: "1", reply: "" },
  ]) assert.throws(() => validateCompiledPublicationsEffect(bad), TypeError);

  const { runtime, effects } = mount();
  assert.deepEqual(Object.keys(effects).sort(), ["deliver", "pending", "records"]);
  for (const [name, arg] of [
    ["input.step", "3"],
    ["input.toggleLock", ""],
    ["child.capture", "oak"],
    ["publication.deliver", "7"],
  ]) assert.equal(dispatch(runtime, name, arg).accepted, true);
});

test("Go Update receives exact publication On messages and suppresses a locked capture", () => {
  ensureHostAPI();
  const { runtime, fixture, renderer } = mount();
  assert.equal(renderer.view.Kids[0].Attrs[0].Name, "disabled");
  assert.deepEqual(renderer.clickCapture(), { accepted: false, disabled: true });
  assert.deepEqual(fixture.received, []);

  // This dispatch simulates a disabled-control bypass. The mounted Go Update
  // remains the authority and sees the message, but refuses capture while locked.
  assert.equal(dispatch(runtime, "child.capture", "oak").accepted, true);
  assert.equal(field(runtime, "Captures").int, "0");
  assert.deepEqual(fixture.received.at(-1), { Name: "child.capture", Arg: "oak" });

  assert.equal(dispatch(runtime, "input.toggleLock").accepted, true);
  assert.deepEqual(renderer.view.Kids[0].Attrs, []);
  assert.equal(renderer.clickCapture().accepted, true);
  assert.equal(field(runtime, "Captures").int, "1");
  assert.deepEqual(fixture.received.slice(-2), [
    { Name: "input.toggleLock", Arg: "" },
    { Name: "child.capture", Arg: "oak" },
  ]);
});

test("request correlation survives compatible swaps; stale callbacks and rejected candidates are fenced", () => {
  ensureHostAPI();
  const firstRenderer = makeRenderer();
  const { runtime, effects, fixture } = mount({ renderer: firstRenderer });
  const token = "child:oak:g2:r1";
  assert.equal(dispatch(runtime, "request", token).accepted, true);
  const staleDispatch = firstRenderer.callbacks;

  const compatibleRenderer = makeRenderer();
  runtime.replaceRenderer(compatibleRenderer);
  assert.equal(effects.pending()[0].token, token);
  const stale = staleDispatch.dispatch(
    { path: "root", event: "click", value: "" },
    { Name: "input.step", Arg: "2" },
  );
  assert.equal(stale.accepted, false);
  assert.equal(stale.stale, true);
  assert.deepEqual(fixture.received.at(-1), { Name: "request", Arg: token });

  const beforeRejectedSwap = runtime.snapshot();
  const currentCallbacks = compatibleRenderer.callbacks;
  const incompatible = makeRenderer();
  incompatible.viewCapabilities = [];
  assert.throws(() => runtime.replaceRenderer(incompatible), /viewCapabilities/);
  assert.deepEqual(runtime.snapshot(), beforeRejectedSwap);
  assert.equal(compatibleRenderer.unmounted, false);
  assert.equal(effects.pending()[0].token, token);

  assert.equal(currentCallbacks.dispatch(
    { path: "root", event: "click", value: "" },
    { Name: "input.step", Arg: "2" },
  ).accepted, true);
  assert.equal(field(runtime, "Step").int, "2");
  assert.equal(effects.deliver(token).accepted, true);
  assert.equal(field(runtime, "Completed").int, "1");
  assert.deepEqual(effects.pending(), []);
});

test("Go-emitted cancellation and host unmount retire only pending request correlations", () => {
  ensureHostAPI();
  const { runtime, effects } = mount();
  const token = "parent:g1:r2";
  assert.equal(dispatch(runtime, "request", token).accepted, true);
  assert.equal(dispatch(runtime, "cancel", token).accepted, true);
  assert.deepEqual(effects.pending(), []);
  assert.equal(effects.deliver(token).outcome, "rejected");

  const outstanding = "parent:g1:r3";
  assert.equal(dispatch(runtime, "request", outstanding).accepted, true);
  assert.equal(runtime.unmount(), true);
  assert.deepEqual(effects.pending(), []);
  assert.equal(effects.records().at(-1).outcome, "retired");
});
