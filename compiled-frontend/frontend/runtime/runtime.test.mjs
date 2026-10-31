import test from "node:test";
import assert from "node:assert/strict";

import {
  createDeterministicEffectHost,
  mountCompiledApp,
  RuntimeFailure,
} from "./runtime.mjs";

const APP_ID = "counter-app";
const COMPONENT_ID = "counter";
const STATE_TYPE = "counter.State";
const MESSAGE_TYPE = "gobi.Message";

function makeAction(path, event = "click", value = "") {
  return { path, event, value };
}

function makeMessage(name, arg = "") {
  return { Name: name, Arg: arg };
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

function makeGoEffect(effect) {
  return new GoEffect(effect);
}

function makeEffectRequest(dispatchId, effectIndex, effect) {
  return { dispatchId, effectIndex, effect };
}

function makeHostScript(steps) {
  return { schema: "gobi.host-script/v1", steps };
}

function floatBits(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleBE(value);
  return buffer.toString("hex");
}

function makeApp({ update } = {}) {
  let initCalls = 0;
  let updateCalls = 0;
  let viewCalls = 0;
  const initial = () => {
    initCalls += 1;
    return { Count: 0, Text: "", Pending: false, Items: null, Float: -0 };
  };
  const defaultUpdate = (state, message) => {
    updateCalls += 1;
    // This test double models the generated module ABI adapter. It returns a
    // Go value-copy result instead of mutating the caller's state object.
    const next = { ...state };
    let effects = [];
    switch (message.Name) {
      case "add":
        next.Count += 1;
        break;
      case "edit":
        next.Text = message.Arg;
        break;
      case "load":
        next.Pending = true;
        effects = [makeGoEffect({
          Kind: "fixture.request",
          Name: "lookup",
          Arg: message.Arg,
          Reply: "complete",
        })];
        break;
      case "complete":
        next.Pending = false;
        next.Text = message.Arg;
        break;
      case "empty-items":
        next.Items = [];
        break;
      case "nil-items":
        next.Items = null;
        break;
      default:
        break;
    }
    return [next, effects];
  };
  const updateFunction = (state, message) => {
    if (update) return update(state, message, () => { updateCalls += 1; });
    return defaultUpdate(state, message);
  };
  const view = (state) => {
    viewCalls += 1;
    return {
      Kind: 1,
      Tag: "div",
      Key: "root",
      Attrs: [],
      On: [],
      Kids: [],
      Text: `count=${state.Count};pending=${state.Pending}`,
    };
  };
  const compiled = {
    schema: "gobi.compiled-module/v1",
    appIR: {
      schema: "gobi.app-ir/v1",
      packagePath: "example/counter",
      components: [{
        id: COMPONENT_ID,
        packagePath: "example/counter",
        stateType: STATE_TYPE,
        messageType: MESSAGE_TYPE,
        init: "counter.Init",
        update: "counter.Update",
        view: "counter.View",
        capabilities: ["view.node", "effect.request-reply"],
      }],
      symbols: [
        { id: "counter.Init", packagePath: "example/counter", name: "Init", signature: { params: [], results: [STATE_TYPE] } },
        { id: "counter.Update", packagePath: "example/counter", name: "Update", signature: { params: [STATE_TYPE, MESSAGE_TYPE], results: [STATE_TYPE, "[]gobi.Effect"] } },
        { id: "counter.View", packagePath: "example/counter", name: "View", signature: { params: [STATE_TYPE], results: ["gobi.Node"] } },
      ],
      types: [],
    },
    symbols: {
      "counter.Init": initial,
      "counter.Update": updateFunction,
      "counter.View": view,
    },
  };
  return {
    compiled,
    calls: () => ({ initCalls, updateCalls, viewCalls }),
  };
}

function makeHelpers() {
  return {
    gobiEncodeState(state, typeId) {
      return {
        typeId,
        kind: "struct",
        fields: [
          {
            name: "Count",
            value: { typeId: "int64", kind: "int", int: String(state.Count) },
          },
          {
            name: "Text",
            value: { typeId: "string", kind: "string", string: state.Text },
          },
          {
            name: "Pending",
            value: { typeId: "bool", kind: "bool", bool: state.Pending },
          },
          {
            name: "Items",
            value: {
              typeId: "[]string",
              kind: "slice",
              isNil: state.Items === null,
              items: state.Items === null ? [] : state.Items.map((item) => ({
                typeId: "string",
                kind: "string",
                string: item,
              })),
            },
          },
          {
            name: "Float",
            value: {
              typeId: "float64",
              kind: "float64",
              float64Bits: floatBits(state.Float),
            },
          },
        ],
      };
    },
  };
}

function makeRenderer() {
  const renderer = {
    currentView: null,
    callbacks: null,
    oldCallbacks: [],
    commitLog: [],
    update(view, callbacks) {
      if (this.callbacks) this.oldCallbacks.push(this.callbacks);
      this.currentView = view;
      this.callbacks = callbacks;
      this.commitLog.push(view.Text);
    },
    viewRecord() {
      const view = this.currentView;
      if (view === null) return null;
      return {
        tree: {
          kind: "element",
          tag: view.Tag,
          key: view.Key,
          attrs: [],
          on: [],
          kids: [],
          text: view.Text,
        },
        bindings: [],
      };
    },
    domSnapshot() {
      if (this.unmounted) return { normalization: "outerHTML-v1", html: "", controls: [] };
      return {
        normalization: "outerHTML-v1",
        html: this.currentView ? `<div>${this.currentView.Text}</div>` : "",
        controls: [],
      };
    },
    snapshot() {
      return this.viewRecord();
    },
    unmount() {
      this.unmounted = true;
      this.currentView = null;
    },
  };
  return renderer;
}

function setup({ update, effectHost = null } = {}) {
  const app = makeApp({ update });
  const renderer = makeRenderer();
  const failures = [];
  const runtime = mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    appId: APP_ID,
    encoder: makeHelpers(),
    renderer,
    effectHost,
    onFailure: (failure) => failures.push(failure),
  });
  return { app, renderer, runtime, failures };
}

test("effect.cancel requires explicit host support before Init or renderer update", () => {
  const app = makeApp();
  app.compiled.appIR.components[0].capabilities.push("effect.cancel");
  const renderer = makeRenderer();
  renderer.viewCapabilities = ["view.node", "binding.value", "binding.checked"];
  let policyCalls = 0;

  assert.throws(() => mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    encoder: makeHelpers(),
    renderer,
    effectPolicy() { policyCalls += 1; return undefined; },
  }), /effect.cancel/);
  assert.deepEqual(app.calls(), { initCalls: 0, updateCalls: 0, viewCalls: 0 });
  assert.deepEqual(renderer.commitLog, []);
  assert.equal(policyCalls, 0);

  assert.throws(() => mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    encoder: makeHelpers(),
    renderer,
    hostCapabilities: ["effect.cancel"],
  }), /effect.request-reply/);
  assert.deepEqual(app.calls(), { initCalls: 0, updateCalls: 0, viewCalls: 0 });
});

test("mount rejects a hostCapabilities accessor without invoking it", () => {
  const app = makeApp();
  const renderer = makeRenderer();
  let getterCalls = 0;
  const options = {
    module: app.compiled,
    componentId: COMPONENT_ID,
    encoder: makeHelpers(),
    renderer,
  };
  Object.defineProperty(options, "hostCapabilities", {
    enumerable: true,
    get() { getterCalls += 1; return ["effect.request-reply"]; },
  });

  assert.throws(() => mountCompiledApp(options), /hostCapabilities/);
  assert.equal(getterCalls, 0);
  assert.equal(app.calls().initCalls, 0);
});

test("effect.cancel app requires an explicit renderer profile before Init", () => {
  const app = makeApp();
  app.compiled.appIR.components[0].capabilities.push("effect.cancel");
  const renderer = makeRenderer();

  assert.throws(() => mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    encoder: makeHelpers(),
    renderer,
    hostCapabilities: ["effect.request-reply", "effect.cancel"],
  }), /renderer.*viewCapabilities/);
  assert.deepEqual(app.calls(), { initCalls: 0, updateCalls: 0, viewCalls: 0 });
  assert.deepEqual(renderer.commitLog, []);
});

test("mount rejects a renderer viewCapabilities accessor without invoking it", () => {
  const app = makeApp();
  app.compiled.appIR.components[0].capabilities.push("effect.cancel");
  const renderer = makeRenderer();
  let getterCalls = 0;
  Object.defineProperty(renderer, "viewCapabilities", {
    enumerable: true,
    get() { getterCalls += 1; return ["view.node"]; },
  });

  assert.throws(() => mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    encoder: makeHelpers(),
    renderer,
    hostCapabilities: ["effect.request-reply", "effect.cancel"],
  }), /viewCapabilities/);
  assert.equal(getterCalls, 0);
  assert.equal(app.calls().initCalls, 0);
});

test("effectPolicy cannot authorize lifecycle.cancel without the app capability", () => {
  const app = makeApp({
    update(state, message, countCall) {
      countCall();
      return [state, [makeGoEffect({
        Kind: "lifecycle.cancel", Name: "cancel", Arg: "parent:g1:r1", Reply: "",
      })]];
    },
  });
  const hostRequests = [];
  let policyCalls = 0;
  const runtime = mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    encoder: makeHelpers(),
    renderer: makeRenderer(),
    effectHost: { request(request) { hostRequests.push(request); } },
    effectPolicy() { policyCalls += 1; return undefined; },
  });

  const result = runtime.dispatch(makeAction("1"), makeMessage("cancel"));
  assert.equal(result.accepted, false);
  assert.equal(policyCalls, 0);
  assert.deepEqual(hostRequests, []);
});

test("replacement rejects a missing view profile before retiring the live renderer", () => {
  const app = makeApp();
  app.compiled.appIR.components[0].capabilities.push("effect.cancel");
  let deliver;
  const effectHost = { request(_request, callback) { deliver = callback; } };
  const renderer = makeRenderer();
  renderer.viewCapabilities = ["view.node", "binding.value", "binding.checked"];
  const runtime = mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    encoder: makeHelpers(),
    renderer,
    effectHost,
    hostCapabilities: ["effect.request-reply", "effect.cancel"],
  });
  assert.equal(runtime.dispatch(makeAction("1"), makeMessage("load", "pending")).accepted, true);
  const traceBefore = runtime.trace();
  const candidate = makeRenderer();
  candidate.viewCapabilities = [];

  assert.throws(() => runtime.replaceRenderer(candidate), /viewCapabilities/);
  assert.equal(renderer.unmounted, undefined);
  assert.deepEqual(candidate.commitLog, []);
  assert.deepEqual(runtime.trace(), traceBefore);
  assert.deepEqual(runtime.effectDiagnostics().pending, [{ dispatchId: "dispatch-0001", effectIndex: 0, queued: false }]);
  assert.deepEqual(runtime.rendererDiagnostics().replacements, [{
    attempt: 1,
    fromGeneration: 1,
    toGeneration: null,
    outcome: "rejected",
    phase: "admission",
    oldUnmounted: false,
    focusCaptured: false,
    focusRestored: false,
  }]);

  const callbackResult = renderer.callbacks.dispatch(makeAction("1"), makeMessage("add"));
  assert.equal(callbackResult.accepted, true);
  assert.equal(renderer.currentView.Text, "count=1;pending=true");
  assert.equal(deliver({
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    message: { name: "complete", arg: "still-live" },
  }).accepted, true);
});

test("candidate profile traps cannot mutate the host or replace the active renderer", () => {
  const { renderer: oldRenderer, runtime } = setup();
  const traceBefore = runtime.trace();
  let callbackAttempt;
  let nestedReplacementError;
  const candidate = new Proxy(makeRenderer(), {
    getOwnPropertyDescriptor(target, key) {
      if (key === "viewCapabilities") {
        callbackAttempt = oldRenderer.callbacks.dispatch(makeAction("1"), makeMessage("add"));
        try {
          runtime.replaceRenderer(makeRenderer());
        } catch (error) {
          nestedReplacementError = error.message;
        }
        return { value: [], writable: true, enumerable: true, configurable: true };
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });

  assert.throws(() => runtime.replaceRenderer(candidate), /viewCapabilities/);
  assert.equal(callbackAttempt.accepted, false);
  assert.match(nestedReplacementError, /reentrant/i);
  assert.equal(oldRenderer.unmounted, undefined);
  assert.deepEqual(runtime.trace(), traceBefore);
  assert.equal(runtime.rendererDiagnostics().currentGeneration, 1);
  assert.deepEqual(oldRenderer.currentView.Text, "count=0;pending=false");
  assert.equal(oldRenderer.callbacks.dispatch(makeAction("1"), makeMessage("add")).accepted, true);
  assert.equal(oldRenderer.currentView.Text, "count=1;pending=false");
});

function stateField(tick, name) {
  return tick.state.fields.find((field) => field.name === name).value;
}

test("mount emits init tick once; no-dispatch attempts remain visible without Update", () => {
  const { app, renderer, runtime } = setup();
  const initial = runtime.trace();

  assert.equal(app.calls().initCalls, 1);
  assert.equal(initial.schema, "gobi.trace/v1");
  assert.equal(initial.appId, APP_ID);
  assert.equal(initial.ticks.length, 1);
  assert.equal(initial.ticks[0].index, 0);
  assert.equal(initial.ticks[0].action, null);
  assert.equal(initial.ticks[0].message, null);
  assert.equal(initial.ticks[0].dispatchId, null);
  assert.equal(initial.ticks[0].requestedEffects.length, 0);
  assert.equal(initial.ticks[0].completedEffects.length, 0);
  assert.deepEqual(initial.ticks[0].view, renderer.viewRecord());
  assert.deepEqual(initial.ticks[0].dom, renderer.domSnapshot());

  const result = runtime.dispatch(makeAction("2/0", "click", ""), null);
  const trace = runtime.trace();

  assert.equal(result.accepted, true);
  assert.equal(result.dispatchId, null);
  assert.equal(app.calls().updateCalls, 0);
  assert.equal(trace.ticks.length, 2);
  assert.deepEqual(trace.ticks[1].action, makeAction("2/0", "click", ""));
  assert.equal(trace.ticks[1].message, null);
  assert.equal(trace.ticks[1].dispatchId, null);
  assert.deepEqual(trace.ticks[1].state, trace.ticks[0].state);
  assert.equal(app.calls().initCalls, 1);
});

test("effects are requested only after synchronous state and view commit; replies dispatch once", () => {
  const action = makeAction("1", "click", "load");
  const message = makeMessage("load", "café");
  const request = makeEffectRequest("dispatch-0001", 0, {
    kind: "fixture.request",
    name: "lookup",
    arg: "café",
    reply: "complete",
  });
  const hostScript = makeHostScript([{
    request,
    completion: { name: "complete", arg: "found" },
  }]);
  const hostEvents = [];
  let runtime;
  const host = createDeterministicEffectHost(hostScript, {
    onRequest: (effectRequest) => {
      const snapshot = runtime.snapshot();
      hostEvents.push({
        kind: "request",
        text: snapshot.view.tree.text,
        pending: stateField({ state: snapshot.state }, "Pending").bool,
        traceLength: runtime.trace().ticks.length,
        effectRequest,
      });
    },
    onCompletion: (completion) => hostEvents.push({ kind: "completion", completion }),
  });
  const app = makeApp();
  const renderer = makeRenderer();
  const runtimeFailures = [];
  runtime = mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    appId: APP_ID,
    encoder: makeHelpers(),
    renderer,
    effectHost: host,
    onFailure: (failure) => runtimeFailures.push(failure),
  });

  const result = runtime.dispatch(action, message);
  assert.equal(result.accepted, true);
  assert.equal(result.dispatchId, "dispatch-0001");
  assert.equal(hostEvents[0].kind, "request");
  assert.equal(hostEvents[0].text, "count=0;pending=true");
  assert.equal(hostEvents[0].pending, true);
  assert.equal(hostEvents[0].traceLength, 2);
  assert.deepEqual(hostEvents[0].effectRequest, request);
  assert.equal(runtime.trace().ticks.length, 2);
  assert.deepEqual(runtime.trace().ticks[1].requestedEffects, [request]);

  assert.equal(host.deliverNext(), true);
  host.assertDone();
  assert.equal(host.deliverNext(), false);
  const duplicate = runtime.complete(host.completions()[0]);
  assert.equal(duplicate.accepted, false);
  assert.match(duplicate.error, /already delivered/i);

  const trace = runtime.trace();
  assert.equal(trace.ticks.length, 3);
  assert.equal(trace.ticks[2].index, 2);
  assert.equal(trace.ticks[2].action, null);
  assert.deepEqual(trace.ticks[2].message, { name: "complete", arg: "found" });
  assert.equal(trace.ticks[2].dispatchId, "dispatch-0002");
  assert.deepEqual(trace.ticks[2].requestedEffects, []);
  assert.deepEqual(trace.ticks[2].completedEffects, [{
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    message: { name: "complete", arg: "found" },
  }]);
  assert.equal(stateField(trace.ticks[2], "Pending").bool, false);
  assert.equal(app.calls().updateCalls, 2);
  assert.equal(renderer.commitLog.at(-1), "count=0;pending=false");
  assert.deepEqual(runtimeFailures, []);
});

test("scripted host rejects missing, extra, reordered, and mismatched effect requests", () => {
  const first = makeEffectRequest("dispatch-0001", 0, { kind: "fixture.request", name: "lookup", arg: "a", reply: "complete" });
  const second = makeEffectRequest("dispatch-0002", 0, { kind: "fixture.request", name: "lookup", arg: "b", reply: "complete" });
  const script = makeHostScript([
    { request: first, completion: { name: "complete", arg: "1" } },
    { request: second, completion: { name: "complete", arg: "2" } },
  ]);

  const missing = createDeterministicEffectHost(script);
  assert.throws(() => missing.assertDone(), /missing.*request|unconsumed/i);

  const extra = createDeterministicEffectHost(makeHostScript([]));
  assert.throws(() => extra.request(first, () => {}), /extra|no expected/i);

  const reordered = createDeterministicEffectHost(script);
  assert.throws(() => reordered.request(second, () => {}), /mismatch|expected/i);

  const mismatched = createDeterministicEffectHost(script);
  assert.throws(() => mismatched.request({
    ...first,
    effect: { ...first.effect, arg: "wrong" },
  }, () => {}), /mismatch|expected/i);

  const unknownKind = makeEffectRequest("dispatch-0001", 0, {
    kind: "network.fetch",
    name: "fetch",
    arg: "/",
    reply: "complete",
  });
  assert.throws(() => createDeterministicEffectHost(makeHostScript([
    { request: unknownKind, completion: { name: "complete", arg: "" } },
  ])), /unsupported effect kind/i);

  const unsupportedName = makeEffectRequest("dispatch-0001", 0, {
    kind: "fixture.request", name: "other", arg: "x", reply: "complete",
  });
  assert.throws(() => createDeterministicEffectHost(makeHostScript([
    { request: unsupportedName, completion: { name: "complete", arg: "" } },
  ])), /lookup\/complete/i);
});

test("scripted host rejects reordered completions by correlation key", () => {
  const first = makeEffectRequest("dispatch-0001", 0, {
    kind: "fixture.request", name: "lookup", arg: "a", reply: "complete",
  });
  const second = makeEffectRequest("dispatch-0001", 1, {
    kind: "fixture.request", name: "lookup", arg: "b", reply: "complete",
  });
  const host = createDeterministicEffectHost(makeHostScript([
    { request: first, completion: { name: "complete", arg: "1" } },
    { request: second, completion: { name: "complete", arg: "2" } },
  ]));
  host.request(first, () => {});
  host.request(second, () => {});

  assert.throws(
    () => host.deliver({ dispatchId: "dispatch-0001", effectIndex: 1 }),
    /reordered/i,
  );
  assert.equal(host.deliverNext(), true);
  assert.equal(host.deliverNext(), true);
  host.assertDone();
});

test("scripted host rejects an undelivered expected reply", () => {
  const request = makeEffectRequest("dispatch-0001", 0, { kind: "fixture.request", name: "lookup", arg: "x", reply: "complete" });
  const host = createDeterministicEffectHost(makeHostScript([{
    request,
    completion: { name: "complete", arg: "x" },
  }]));
  host.request(request, () => {});
  assert.throws(() => host.assertDone(), /completion|undelivered/i);
});

test("an effect-host failure is explicit and does not duplicate the committed transition tick", () => {
  const failures = [];
  const app = makeApp();
  const runtime = mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    appId: APP_ID,
    encoder: makeHelpers(),
    renderer: makeRenderer(),
    effectHost: {
      request() { throw new Error("host rejected request"); },
    },
    onFailure: (failure) => failures.push(failure),
  });

  const result = runtime.dispatch(makeAction("1", "click", "load"), makeMessage("load", "q"));
  const trace = runtime.trace();
  assert.equal(result.accepted, false);
  assert.equal(result.failure.stage, "effect-host");
  assert.match(result.error, /host rejected request/);
  assert.equal(trace.ticks.length, 2);
  assert.equal(trace.ticks[1].dispatchId, "dispatch-0001");
  assert.deepEqual(trace.ticks[1].requestedEffects, [makeEffectRequest("dispatch-0001", 0, {
    kind: "fixture.request", name: "lookup", arg: "q", reply: "complete",
  })]);
  assert.equal(runtime.failure().stage, "effect-host");
  assert.equal(failures.length, 1);
});

test("compiled effects require the exact marked GoScript struct ABI", () => {
  const makeRuntimeWithEffect = (rawEffect, effectPolicy = null, {
    capabilities = [],
    hostCapabilities = undefined,
    viewCapabilities = null,
  } = {}) => {
    const app = makeApp({
      update(state, message, countCall) {
        countCall();
        return [{ ...state, Pending: true }, [rawEffect]];
      },
    });
    app.compiled.appIR.components[0].capabilities.push(...capabilities);
    const renderer = makeRenderer();
    if (viewCapabilities !== null) renderer.viewCapabilities = viewCapabilities;
    const hostRequests = [];
    const runtime = mountCompiledApp({
      module: app.compiled,
      componentId: COMPONENT_ID,
      appId: APP_ID,
      encoder: makeHelpers(),
      renderer,
      effectHost: { request(request) { hostRequests.push(request); } },
      effectPolicy,
      hostCapabilities,
    });
    return { app, hostRequests, runtime };
  };

  const trusted = makeRuntimeWithEffect(makeGoEffect({
    Kind: "fixture.request", Name: "lookup", Arg: "q", Reply: "complete",
  }));
  const accepted = trusted.runtime.dispatch(makeAction("1"), makeMessage("load", "q"));
  assert.equal(accepted.accepted, true);
  assert.deepEqual(trusted.hostRequests[0].effect, {
    kind: "fixture.request", name: "lookup", arg: "q", reply: "complete",
  });

  const unmarked = makeRuntimeWithEffect({
    Kind: "fixture.request", Name: "lookup", Arg: "q", Reply: "complete",
  });
  const unmarkedResult = unmarked.runtime.dispatch(makeAction("1"), makeMessage("load", "q"));
  assert.equal(unmarkedResult.accepted, false);
  assert.match(unmarkedResult.error, /exactly|GoScript struct marker/i);
  assert.equal(unmarked.hostRequests.length, 0);

  const getterEffect = makeGoEffect({
    Kind: "fixture.request", Name: "lookup", Arg: "q", Reply: "complete",
  });
  let getterCalls = 0;
  Object.defineProperty(getterEffect, "Arg", {
    enumerable: true,
    configurable: true,
    get() { getterCalls += 1; return "q"; },
  });
  const accessor = makeRuntimeWithEffect(getterEffect);
  const accessorResult = accessor.runtime.dispatch(makeAction("1"), makeMessage("load", "q"));
  assert.equal(accessorResult.accepted, false);
  assert.equal(getterCalls, 0);
  assert.equal(accessor.hostRequests.length, 0);

  const extraEffect = makeGoEffect({
    Kind: "fixture.request", Name: "lookup", Arg: "q", Reply: "complete",
  });
  extraEffect.unexpected = "extra";
  const extra = makeRuntimeWithEffect(extraEffect);
  assert.equal(extra.runtime.dispatch(makeAction("1"), makeMessage("load", "q")).accepted, false);
  assert.equal(extra.hostRequests.length, 0);

  const wrongContract = makeRuntimeWithEffect(makeGoEffect({
    Kind: "fixture.request", Name: "first", Arg: "q", Reply: "done",
  }));
  const wrongResult = wrongContract.runtime.dispatch(makeAction("1"), makeMessage("load", "q"));
  assert.equal(wrongResult.accepted, false);
  assert.match(wrongResult.error, /lookup\/complete/i);
  assert.equal(wrongContract.hostRequests.length, 0);

  const extensionEffect = makeGoEffect({
    Kind: "lifecycle.request", Name: "lookup", Arg: "parent:g1:r1", Reply: "complete",
  });
  const strict = makeRuntimeWithEffect(extensionEffect);
  const strictResult = strict.runtime.dispatch(makeAction("1"), makeMessage("load", "parent:g1:r1"));
  assert.equal(strictResult.accepted, false);
  assert.match(strictResult.error, /unsupported effect kind/i);
  assert.equal(strict.hostRequests.length, 0);

  const policyCalls = [];
  const extended = makeRuntimeWithEffect(extensionEffect, (effect, label) => {
    assert.equal(Object.isFrozen(effect), true);
    assert.throws(() => { effect.kind = "mutated.by.policy"; }, TypeError);
    policyCalls.push({ effect: { ...effect }, label });
    if (effect.kind !== "lifecycle.request" || effect.name !== "lookup" || effect.reply !== "complete") {
      throw new TypeError("lifecycle effect is outside the closed request policy");
    }
  });
  const extendedResult = extended.runtime.dispatch(makeAction("1"), makeMessage("load", "parent:g1:r1"));
  assert.equal(extendedResult.accepted, true);
  assert.deepEqual(extended.hostRequests[0].effect, {
    kind: "lifecycle.request", name: "lookup", arg: "parent:g1:r1", reply: "complete",
  });
  assert.deepEqual(policyCalls, [{
    effect: { kind: "lifecycle.request", name: "lookup", arg: "parent:g1:r1", reply: "complete" },
    label: "gobi.Effect",
  }]);

  const closed = makeRuntimeWithEffect(makeGoEffect({
    Kind: "lifecycle.cancel", Name: "cancel", Arg: "parent:g1:r1", Reply: "",
  }), (effect) => {
    if (effect.kind !== "lifecycle.request") {
      throw new TypeError("lifecycle effect is outside the closed request policy");
    }
  }, {
    capabilities: ["effect.cancel"],
    hostCapabilities: ["effect.request-reply", "effect.cancel"],
    viewCapabilities: ["view.node", "binding.value", "binding.checked"],
  });
  const closedResult = closed.runtime.dispatch(makeAction("1"), makeMessage("load", "parent:g1:r1"));
  assert.equal(closedResult.accepted, false);
  assert.match(closedResult.error, /closed request policy/i);
  assert.equal(closed.hostRequests.length, 0);
});

test("cancelEffect removes the live correlation and fences its retained callback", () => {
  const app = makeApp();
  const requests = [];
  const renderer = makeRenderer();
  const runtime = mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    appId: APP_ID,
    encoder: makeHelpers(),
    renderer,
    effectHost: {
      request(request, deliver) { requests.push({ request, deliver }); },
    },
  });

  const result = runtime.dispatch(makeAction("1"), makeMessage("load", "parent:g1:r1"));
  assert.equal(result.accepted, true);
  assert.deepEqual(runtime.effectDiagnostics().pending, [{
    dispatchId: "dispatch-0001", effectIndex: 0, queued: false,
  }]);

  const cancellation = runtime.cancelEffect({ dispatchId: "dispatch-0001", effectIndex: 0 });
  assert.deepEqual(cancellation, {
    accepted: true, cancelled: true, dispatchId: "dispatch-0001", effectIndex: 0,
  });
  assert.deepEqual(runtime.effectDiagnostics(), {
    pending: [],
    cancellations: [{ dispatchId: "dispatch-0001", effectIndex: 0, outcome: "cancelled" }],
  });
  assert.equal(app.calls().updateCalls, 1);
  assert.equal(runtime.trace().ticks.length, 2);

  const late = requests[0].deliver({
    dispatchId: "dispatch-0001", effectIndex: 0,
    message: { name: "complete", arg: "parent:g1:r1" },
  });
  assert.deepEqual(late, { accepted: false, error: "unknown or extra effect completion" });
  assert.equal(app.calls().updateCalls, 1);
  assert.equal(stateField({ state: runtime.snapshot().state }, "Pending").bool, true);

  const duplicateCancel = runtime.cancelEffect({ dispatchId: "dispatch-0001", effectIndex: 0 });
  assert.deepEqual(duplicateCancel, {
    accepted: false, cancelled: false, error: "unknown or completed effect",
  });
  assert.deepEqual(runtime.effectDiagnostics().cancellations.at(-1), {
    dispatchId: "dispatch-0001", effectIndex: 0,
    outcome: "rejected", reason: "unknown or completed effect",
  });
  assert.equal(runtime.cancelEffect({ dispatchId: "dispatch-0001", effectIndex: 0, token: "extra" }).accepted, false);
});

test("renderer lowerCamel actions are accepted and dispatch admission precedes input traps", () => {
  const rendererCasing = setup();
  const casingResult = rendererCasing.runtime.dispatch(
    { path: "", event: "click", value: "intent" },
    makeMessage("add"),
  );
  assert.equal(casingResult.accepted, true);
  assert.deepEqual(rendererCasing.runtime.trace().ticks[1].action, makeAction("", "click", "intent"));

  const pascal = setup();
  const pascalResult = pascal.runtime.dispatch(
    { Path: "", Event: "click", Value: "intent" },
    makeMessage("add"),
  );
  assert.equal(pascalResult.accepted, false);
  assert.equal(pascal.app.calls().updateCalls, 0);

  const accessor = setup();
  let getterCalls = 0;
  let nestedResult;
  const actionWithGetter = {
    get path() {
      getterCalls += 1;
      nestedResult = accessor.runtime.dispatch(makeAction("nested"), makeMessage("add"));
      return "outer";
    },
    event: "click",
    value: "",
  };
  const accessorResult = accessor.runtime.dispatch(actionWithGetter, makeMessage("add"));
  assert.equal(accessorResult.accepted, false);
  assert.equal(getterCalls, 0);
  assert.equal(nestedResult, undefined);
  assert.equal(accessor.app.calls().updateCalls, 0);
  assert.equal(accessor.runtime.trace().ticks.length, 1);

  const proxy = setup();
  let trapNestedResult;
  let reentered = false;
  const proxyAction = new Proxy(makeAction("outer", "click", ""), {
    ownKeys(target) {
      if (!reentered) {
        reentered = true;
        trapNestedResult = proxy.runtime.dispatch(makeAction("nested"), makeMessage("add"));
      }
      return Reflect.ownKeys(target);
    },
  });
  const proxyResult = proxy.runtime.dispatch(proxyAction, makeMessage("add"));
  const proxyTrace = proxy.runtime.trace();
  assert.equal(proxyResult.accepted, true);
  assert.equal(trapNestedResult.accepted, false);
  assert.equal(proxy.app.calls().updateCalls, 1);
  assert.equal(proxyTrace.ticks.length, 3);
  assert.deepEqual(proxyTrace.ticks[2].action, makeAction("nested"));
});

test("reentrant dispatch is explicitly rejected and later traced as a no-op", () => {
  let runtime;
  const nestedAction = makeAction("2/1", "click", "nested");
  let nestedResult;
  const app = makeApp({
    update(state, message, countCall) {
      countCall();
      if (message.Name === "outer") {
        nestedResult = runtime.dispatch(nestedAction, makeMessage("nested"));
      }
      return [{ ...state, Count: state.Count + 1 }, []];
    },
  });
  const renderer = makeRenderer();
  runtime = mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    appId: APP_ID,
    encoder: makeHelpers(),
    renderer,
  });

  runtime.dispatch(makeAction("2/0", "click", "outer"), makeMessage("outer"));
  const trace = runtime.trace();

  assert.equal(nestedResult.accepted, false);
  assert.match(nestedResult.error, /reentrant/i);
  assert.equal(app.calls().updateCalls, 1);
  assert.equal(trace.ticks.length, 3);
  assert.deepEqual(trace.ticks[1].action, makeAction("2/0", "click", "outer"));
  assert.equal(trace.ticks[1].dispatchId, "dispatch-0001");
  assert.deepEqual(trace.ticks[2].action, nestedAction);
  assert.equal(trace.ticks[2].message, null);
  assert.equal(trace.ticks[2].dispatchId, null);
  assert.equal(stateField(trace.ticks[2], "Count").int, "1");
});

test("stale and post-unmount callbacks are fenced and recorded without Update", () => {
  const { app, renderer, runtime } = setup();
  const staleAction = makeAction("2/0", "click", "detached");
  runtime.dispatch(makeAction("2/0", "click", "add"), makeMessage("add"));
  const staleCallback = renderer.oldCallbacks[0]?.onStaleAction;
  assert.equal(typeof staleCallback, "function");

  staleCallback(staleAction, 0);
  runtime.unmount();
  const traceBeforeLate = runtime.trace();
  const lateAction = makeAction("2/0", "click", "unmounted");
  renderer.callbacks.onStaleAction(lateAction, 1);
  const trace = runtime.trace();

  assert.equal(app.calls().updateCalls, 1);
  assert.equal(renderer.unmounted, true);
  assert.equal(traceBeforeLate.ticks.length, 3);
  assert.deepEqual(trace.ticks[3].action, lateAction);
  assert.equal(trace.ticks[3].message, null);
  assert.equal(trace.ticks[3].dispatchId, null);
  assert.deepEqual(trace.ticks[3].view, traceBeforeLate.ticks.at(-1).view);
  assert.equal(trace.ticks[3].dom.html, "");
  assert.equal(runtime.failure(), null);
});

test("renderer replacement commits the cached Go view without an application tick or Update", () => {
  const hostEvents = [];
  let deliver;
  const effectHost = {
    request(request, callback) {
      hostEvents.push({ kind: "request", request });
      deliver = callback;
    },
  };
  const { app, renderer: oldRenderer, runtime } = setup({ effectHost });
  assert.equal(runtime.dispatch(makeAction("1"), makeMessage("load", "q")).dispatchId, "dispatch-0001");
  const traceBeforeSwap = runtime.trace();
  const callsBeforeSwap = app.calls();
  const nextRenderer = makeRenderer();

  const swapped = runtime.replaceRenderer(nextRenderer);

  assert.equal(oldRenderer.unmounted, true);
  assert.equal(nextRenderer.currentView.Text, "count=0;pending=true");
  assert.deepEqual(swapped.state, traceBeforeSwap.ticks.at(-1).state);
  assert.deepEqual(swapped.view, nextRenderer.viewRecord());
  assert.deepEqual(swapped.dom, nextRenderer.domSnapshot());
  assert.deepEqual(runtime.trace(), traceBeforeSwap);
  assert.deepEqual(app.calls(), callsBeforeSwap);
  assert.equal(runtime.rendererDiagnostics().currentGeneration, 2);
  assert.deepEqual(runtime.rendererDiagnostics().replacements, [{
    attempt: 1,
    fromGeneration: 1,
    toGeneration: 2,
    outcome: "committed",
    phase: "complete",
    oldUnmounted: true,
    focusCaptured: false,
    focusRestored: false,
  }]);

  const reply = {
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    message: { name: "complete", arg: "after-swap" },
  };
  assert.equal(deliver(reply).accepted, true);
  assert.equal(deliver(reply).accepted, false);
  const afterReply = runtime.trace();
  assert.equal(afterReply.ticks.at(-1).dispatchId, "dispatch-0002");
  assert.deepEqual(afterReply.ticks.at(-1).completedEffects, [{
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    message: reply.message,
  }]);
  assert.equal(stateField(afterReply.ticks.at(-1), "Pending").bool, false);
  assert.equal(hostEvents.length, 1);
  assert.equal(app.calls().initCalls, 1);
  assert.equal(app.calls().updateCalls, 2);
});

test("retired renderer callbacks are fenced out of the application trace by renderer identity", () => {
  const { app, renderer: oldRenderer, runtime } = setup();
  const callbacksFromInitialView = oldRenderer.callbacks;
  runtime.dispatch(makeAction("2/0", "click", "advance"), makeMessage("add"));
  const callbacksFromLaterView = oldRenderer.callbacks;
  const traceBeforeSwap = runtime.trace();
  const nextRenderer = makeRenderer();

  runtime.replaceRenderer(nextRenderer);
  assert.deepEqual(runtime.trace(), traceBeforeSwap);

  const staleDispatch = callbacksFromInitialView.dispatch(
    makeAction("2/0", "click", "retired-dispatch"),
    makeMessage("add"),
  );
  const staleNotification = callbacksFromLaterView.onStaleAction(
    makeAction("2/0", "click", "retired-stale"),
    99,
  );

  assert.equal(staleDispatch.accepted, false);
  assert.equal(staleNotification.accepted, false);
  assert.equal(staleDispatch.stale, true);
  assert.equal(runtime.rendererDiagnostics().fencedCallbacks.length, 2);
  assert.deepEqual(runtime.rendererDiagnostics().fencedCallbacks.map(({ kind }) => kind), ["dispatch", "stale"]);
  assert.deepEqual(runtime.trace(), traceBeforeSwap);
  assert.equal(app.calls().updateCalls, 1);

  const newDispatch = nextRenderer.callbacks.dispatch(
    makeAction("2/0", "click", "current"),
    makeMessage("add"),
  );
  assert.equal(newDispatch.accepted, true);
  assert.equal(newDispatch.dispatchId, "dispatch-0002");
  assert.equal(app.calls().updateCalls, 2);
});

test("replacement focus hooks preserve the keyed focus snapshot without changing the trace", () => {
  const { renderer: oldRenderer, runtime } = setup();
  const focus = {
    identity: JSON.stringify(["keyed-input"]),
    selectionStart: 2,
    selectionEnd: 4,
    selectionDirection: "backward",
  };
  let nextFocus = null;
  let dispatchDuringRestore;
  let directDispatchDuringRestore;
  oldRenderer.focusState = () => focus;
  oldRenderer.restoreFocus = () => false;
  const traceBeforeSwap = runtime.trace();
  const nextRenderer = makeRenderer();
  nextRenderer.focusState = () => null;
  nextRenderer.restoreFocus = (state) => {
    nextFocus = state;
    dispatchDuringRestore = nextRenderer.callbacks.dispatch(makeAction("nested"), makeMessage("add"));
    directDispatchDuringRestore = runtime.dispatch(makeAction("direct"), makeMessage("add"));
    return true;
  };

  runtime.replaceRenderer(nextRenderer);

  assert.deepEqual(nextFocus, focus);
  assert.equal(dispatchDuringRestore.accepted, false);
  assert.equal(directDispatchDuringRestore.accepted, false);
  assert.deepEqual(runtime.trace(), traceBeforeSwap);
  assert.equal(runtime.rendererDiagnostics().replacements[0].focusCaptured, true);
  assert.equal(runtime.rendererDiagnostics().replacements[0].focusRestored, true);
});

test("replacement requires a valid focus record and a truthful boolean restore result", () => {
  const malformed = setup();
  malformed.renderer.focusState = () => undefined;
  malformed.renderer.restoreFocus = () => true;
  const beforeMalformedCapture = malformed.runtime.trace();
  const malformedCaptureTarget = makeRenderer();
  malformedCaptureTarget.focusState = () => null;
  malformedCaptureTarget.restoreFocus = () => true;
  assert.throws(
    () => malformed.runtime.replaceRenderer(malformedCaptureTarget),
    /focusState\(\).*null.*focus record/i,
  );
  assert.equal(malformed.renderer.unmounted, undefined);
  assert.equal(malformed.runtime.failure(), null);
  assert.deepEqual(malformed.runtime.trace(), beforeMalformedCapture);

  for (const restoreResult of [undefined, "restored", false]) {
    const { renderer: oldRenderer, runtime } = setup();
    oldRenderer.focusState = () => ({
      identity: JSON.stringify(["keyed-input"]),
      selectionStart: 1,
      selectionEnd: 2,
      selectionDirection: "forward",
    });
    oldRenderer.restoreFocus = () => true;
    const before = runtime.trace();
    const nextRenderer = makeRenderer();
    nextRenderer.focusState = () => null;
    nextRenderer.restoreFocus = () => restoreResult;

    assert.throws(() => runtime.replaceRenderer(nextRenderer), RuntimeFailure);
    assert.equal(oldRenderer.unmounted, true);
    assert.deepEqual(runtime.trace(), before);
    assert.equal(runtime.failure().stage, "renderer-replacement");
    assert.equal(runtime.rendererDiagnostics().currentGeneration, null);
    assert.equal(runtime.rendererDiagnostics().replacements.at(-1).phase, "focus-restore");
    assert.equal(runtime.rendererDiagnostics().replacements.at(-1).focusRestored, false);
    assert.throws(() => runtime.snapshot(), /unavailable after a failed replacement/i);
  }
});

test("replacement rejects invalid, async, and reentrant admissions before old renderer teardown", () => {
  const { renderer: oldRenderer, runtime } = setup();
  const traceBefore = runtime.trace();
  assert.throws(() => runtime.replaceRenderer({ update() {} }), /renderer must provide/i);
  assert.equal(oldRenderer.unmounted, undefined);
  assert.deepEqual(runtime.trace(), traceBefore);
  assert.throws(() => runtime.replaceRenderer(oldRenderer), /with itself/i);
  assert.equal(oldRenderer.unmounted, undefined);
  assert.deepEqual(runtime.trace(), traceBefore);

  let asyncCalls = 0;
  const asyncRenderer = makeRenderer();
  asyncRenderer.update = async () => {
    asyncCalls += 1;
  };
  assert.throws(() => runtime.replaceRenderer(asyncRenderer), /synchronously/i);
  assert.equal(asyncCalls, 0);
  assert.equal(oldRenderer.unmounted, undefined);
  assert.deepEqual(runtime.trace(), traceBefore);

  let enteredGetter = false;
  const target = makeRenderer();
  const reentrantRenderer = new Proxy(target, {
    getOwnPropertyDescriptor(object, key) {
      if (key === "update" && !enteredGetter) {
        enteredGetter = true;
        assert.throws(() => runtime.replaceRenderer(makeRenderer()), /reentrant/i);
      }
      return Reflect.getOwnPropertyDescriptor(object, key);
    },
  });
  assert.doesNotThrow(() => runtime.replaceRenderer(reentrantRenderer));
  assert.equal(enteredGetter, true);
  assert.equal(oldRenderer.unmounted, true);
  assert.deepEqual(runtime.trace(), traceBefore);
  assert.equal(runtime.rendererDiagnostics().replacements[0].outcome, "rejected");
  assert.equal(runtime.rendererDiagnostics().replacements.at(-1).outcome, "committed");
});

test("a thenable renderer commit fails closed without claiming the old view was restored", async () => {
  let deliver;
  let heldDelivery;
  const { renderer: oldRenderer, runtime } = setup({
    effectHost: { request(_request, callback) { deliver = callback; } },
  });
  runtime.dispatch(makeAction("1"), makeMessage("load", "q"));
  const traceBefore = runtime.trace();
  const reply = {
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    message: { name: "complete", arg: "must-be-canceled" },
  };
  const nextRenderer = makeRenderer();
  nextRenderer.update = () => {
    heldDelivery = deliver(reply);
    return Promise.resolve();
  };

  assert.throws(() => runtime.replaceRenderer(nextRenderer), RuntimeFailure);

  assert.equal(oldRenderer.unmounted, true);
  assert.deepEqual(runtime.trace(), traceBefore);
  assert.equal(heldDelivery.accepted, true);
  assert.equal(heldDelivery.queued, true);
  assert.equal(runtime.failure().stage, "renderer-replacement");
  assert.equal(runtime.rendererDiagnostics().currentGeneration, null);
  assert.throws(() => runtime.snapshot(), /unavailable after a failed replacement/i);
  await Promise.resolve();
  assert.deepEqual(runtime.trace(), traceBefore);
  assert.equal(runtime.complete(reply).accepted, false);
  assert.deepEqual(runtime.rendererDiagnostics().replacements.at(-1), {
    attempt: 1,
    fromGeneration: 1,
    toGeneration: 2,
    outcome: "failed",
    phase: "new-commit",
    oldUnmounted: true,
    focusCaptured: false,
    focusRestored: false,
  });
});

test("a rejected native Promise from renderer update is observed without invoking its then getter", async () => {
  const { app, renderer: oldRenderer, runtime } = setup();
  const before = runtime.trace();
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason instanceof Error ? reason.message : String(reason));
  process.on("unhandledRejection", onUnhandled);
  let thenGetterCalls = 0;
  let reentrantDispatch;
  let nextRenderer;
  nextRenderer = makeRenderer();
  nextRenderer.update = (_view, callbacks) => {
    const rejected = Promise.reject(new Error("late renderer rejection"));
    Object.defineProperty(rejected, "then", {
      configurable: true,
      get() {
        thenGetterCalls += 1;
        reentrantDispatch = callbacks.dispatch(makeAction("then-getter"), makeMessage("add"));
        assert.throws(() => runtime.replaceRenderer(makeRenderer()), /reentrant/i);
        return Promise.prototype.then;
      },
    });
    return rejected;
  };

  try {
    assert.throws(() => runtime.replaceRenderer(nextRenderer), RuntimeFailure);
    assert.equal(oldRenderer.unmounted, true);
    assert.equal(runtime.failure().stage, "renderer-replacement");
    assert.equal(runtime.rendererDiagnostics().currentGeneration, null);
    assert.deepEqual(runtime.trace(), before);
    assert.equal(app.calls().updateCalls, 0);

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(unhandled, []);
    assert.equal(thenGetterCalls, 0);
    assert.equal(reentrantDispatch, undefined);
    assert.equal(app.calls().updateCalls, 0);
    assert.deepEqual(runtime.trace(), before);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("rejected observation Promises fail a swap closed without leaking rejections", async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason instanceof Error ? reason.message : String(reason));
  process.on("unhandledRejection", onUnhandled);
  try {
    for (const method of ["viewRecord", "domSnapshot"]) {
      const { app, renderer: oldRenderer, runtime } = setup();
      const traceBefore = runtime.trace();
      const stateBefore = runtime.snapshot().state;
      const nextRenderer = makeRenderer();
      nextRenderer[method] = () => Promise.reject(new Error(`late ${method} rejection`));

      assert.throws(() => runtime.replaceRenderer(nextRenderer), RuntimeFailure);
      assert.equal(oldRenderer.unmounted, true);
      assert.equal(runtime.failure().stage, "renderer-replacement");
      assert.equal(runtime.rendererDiagnostics().currentGeneration, null);
      assert.deepEqual(runtime.trace(), traceBefore);
      assert.equal(app.calls().updateCalls, 0);
      assert.equal(app.calls().initCalls, 1);
      assert.throws(() => runtime.snapshot(), /unavailable after a failed replacement/i);
      assert.deepEqual(stateBefore.fields[0], { name: "Count", value: { typeId: "int64", kind: "int", int: "0" } });
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("active runtime unmount rejects a returned Promise without reporting success", async () => {
  const { app, renderer, runtime } = setup();
  const traceBefore = runtime.trace();
  const retainedView = renderer.currentView;
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason instanceof Error ? reason.message : String(reason));
  process.on("unhandledRejection", onUnhandled);
  renderer.unmount = () => Promise.reject(new Error("late unmount rejection"));

  try {
    assert.equal(runtime.unmount(), false);
    assert.equal(runtime.isUnmounted(), true);
    assert.equal(runtime.failure().stage, "unmount");
    assert.equal(renderer.currentView, retainedView);
    assert.equal(app.calls().updateCalls, 0);
    assert.deepEqual(runtime.trace(), traceBefore);

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("completion during replacement stays pending at return, then commits exactly once", async () => {
  let deliver;
  let runtime;
  let duringSwapDispatch;
  let directDispatch;
  let firstDelivery;
  let duplicateDelivery;
  let proxyDispatch;
  const effectHost = {
    request(_request, callback) { deliver = callback; },
  };
  const app = makeApp();
  const oldRenderer = makeRenderer();
  runtime = mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    appId: APP_ID,
    encoder: makeHelpers(),
    renderer: oldRenderer,
    effectHost,
  });
  assert.equal(runtime.dispatch(makeAction("1"), makeMessage("load", "q")).accepted, true);
  const beforeSwap = runtime.trace();
  const reply = {
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    message: { name: "complete", arg: "held-reply" },
  };
  const nextRenderer = makeRenderer();
  const commit = nextRenderer.update.bind(nextRenderer);
  let injectDuringReplacement = true;
  nextRenderer.update = (view, callbacks) => {
    if (injectDuringReplacement) {
      injectDuringReplacement = false;
      duringSwapDispatch = callbacks.dispatch(makeAction("nested"), makeMessage("add"));
      directDispatch = runtime.dispatch(makeAction("direct"), makeMessage("add"));
      const proxiedReply = new Proxy(reply, {
        ownKeys(target) {
          proxyDispatch = runtime.dispatch(makeAction("proxy-trap"), makeMessage("add"));
          assert.throws(() => runtime.replaceRenderer(makeRenderer()), /reentrant/i);
          return Reflect.ownKeys(target);
        },
      });
      firstDelivery = deliver(proxiedReply);
      duplicateDelivery = deliver(reply);
    }
    return commit(view, callbacks);
  };

  const swapped = runtime.replaceRenderer(nextRenderer);

  assert.equal(swapped.dom.html, "<div>count=0;pending=true</div>");
  assert.equal(stateField(runtime.trace().ticks.at(-1), "Pending").bool, true);
  assert.deepEqual(runtime.trace(), beforeSwap);
  assert.equal(duringSwapDispatch.accepted, false);
  assert.equal(directDispatch.accepted, false);
  assert.equal(proxyDispatch.accepted, false);
  assert.equal(firstDelivery.accepted, true);
  assert.equal(firstDelivery.queued, true);
  assert.equal(duplicateDelivery.accepted, false);
  assert.equal(app.calls().updateCalls, 1);
  assert.equal(runtime.complete(reply).accepted, false);
  assert.deepEqual(runtime.trace(), beforeSwap);

  await Promise.resolve();

  const afterDrain = runtime.trace();
  assert.equal(afterDrain.ticks.length, beforeSwap.ticks.length + 1);
  assert.equal(afterDrain.ticks.at(-1).dispatchId, "dispatch-0002");
  assert.equal(afterDrain.ticks.at(-1).message.name, "complete");
  assert.equal(afterDrain.ticks.at(-1).completedEffects[0].dispatchId, "dispatch-0001");
  assert.equal(stateField(afterDrain.ticks.at(-1), "Pending").bool, false);
  assert.equal(app.calls().updateCalls, 2);
});

test("cancelEffect removes a completion held during renderer replacement before it drains", async () => {
  let deliver;
  let runtime;
  let queuedDelivery;
  let cancellation;
  const app = makeApp();
  const effectHost = { request(_request, callback) { deliver = callback; } };
  runtime = mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    appId: APP_ID,
    encoder: makeHelpers(),
    renderer: makeRenderer(),
    effectHost,
  });
  runtime.dispatch(makeAction("1"), makeMessage("load", "q"));
  const before = runtime.trace();
  const reply = {
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    message: { name: "complete", arg: "cancel-during-replacement" },
  };
  const nextRenderer = makeRenderer();
  const commit = nextRenderer.update.bind(nextRenderer);
  let inject = true;
  nextRenderer.update = (view, callbacks) => {
    if (inject) {
      inject = false;
      queuedDelivery = deliver(reply);
      cancellation = runtime.cancelEffect({ dispatchId: reply.dispatchId, effectIndex: reply.effectIndex });
    }
    return commit(view, callbacks);
  };

  runtime.replaceRenderer(nextRenderer);
  assert.deepEqual(queuedDelivery, { accepted: true, queued: true, dispatchId: null });
  assert.deepEqual(cancellation, {
    accepted: true, cancelled: true, dispatchId: "dispatch-0001", effectIndex: 0,
  });
  assert.deepEqual(runtime.trace(), before);
  assert.deepEqual(runtime.effectDiagnostics(), {
    pending: [],
    cancellations: [{ dispatchId: "dispatch-0001", effectIndex: 0, outcome: "cancelled" }],
  });

  await Promise.resolve();

  assert.deepEqual(runtime.trace(), before);
  assert.equal(app.calls().updateCalls, 1);
  assert.deepEqual(runtime.complete(reply), {
    accepted: false, error: "unknown or extra effect completion",
  });
});

test("unmount before the held completion microtask cancels it without resurrection", async () => {
  let deliver;
  let completionDelivery;
  const app = makeApp();
  const oldRenderer = makeRenderer();
  const originalUnmount = oldRenderer.unmount.bind(oldRenderer);
  const effectHost = { request(_request, callback) { deliver = callback; } };
  const runtime = mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    appId: APP_ID,
    encoder: makeHelpers(),
    renderer: oldRenderer,
    effectHost,
  });
  runtime.dispatch(makeAction("1"), makeMessage("load", "q"));
  const before = runtime.trace();
  const reply = {
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    message: { name: "complete", arg: "must-not-resurrect" },
  };
  oldRenderer.unmount = () => {
    const result = originalUnmount();
    completionDelivery = deliver(reply);
    return result;
  };

  runtime.replaceRenderer(makeRenderer());
  assert.equal(completionDelivery.accepted, true);
  assert.equal(completionDelivery.queued, true);
  assert.equal(runtime.trace().ticks.length, before.ticks.length);
  assert.equal(runtime.unmount(), true);
  await Promise.resolve();

  assert.equal(runtime.isUnmounted(), true);
  assert.deepEqual(runtime.trace(), before);
  assert.equal(app.calls().updateCalls, 1);
  assert.equal(runtime.complete(reply).accepted, false);
});

test("trace snapshots preserve nil versus empty slices and negative-zero bits", () => {
  const { runtime } = setup();
  runtime.dispatch(makeAction("2/2", "click", "empty"), makeMessage("empty-items"));
  const trace = runtime.trace();

  const beforeItems = stateField(trace.ticks[0], "Items");
  const afterItems = stateField(trace.ticks[1], "Items");
  assert.deepEqual(beforeItems, { typeId: "[]string", kind: "slice", isNil: true, items: [] });
  assert.deepEqual(afterItems, { typeId: "[]string", kind: "slice", isNil: false, items: [] });
  assert.deepEqual(stateField(trace.ticks[0], "Float"), {
    typeId: "float64",
    kind: "float64",
    float64Bits: "8000000000000000",
  });

  trace.ticks[0].state.fields[0].value.int = "999";
  assert.equal(stateField(runtime.trace().ticks[0], "Count").int, "0");
});

test("completion admission blocks proxy-trap reentry across runtime entrypoints", () => {
  let deliver;
  const { app, runtime } = setup({
    effectHost: { request(_request, callback) { deliver = callback; } },
  });
  assert.equal(runtime.dispatch(makeAction("1"), makeMessage("load", "q")).accepted, true);
  const before = runtime.trace();
  const validReply = {
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    message: { name: "complete", arg: "reply-from-reentry" },
  };
  let nestedCompletion;
  let nestedDispatch;
  let nestedStale;
  let nestedUnmount;
  let ownKeysCalls = 0;
  const invalidOuter = new Proxy({ dispatchId: "wrong", effectIndex: 0 }, {
    ownKeys(target) {
      ownKeysCalls += 1;
      nestedCompletion = runtime.complete(validReply);
      nestedDispatch = runtime.dispatch(makeAction("nested"), makeMessage("add"));
      nestedStale = runtime.recordStaleAction(makeAction("stale"), 0);
      nestedUnmount = runtime.unmount();
      return Reflect.ownKeys(target);
    },
  });

  const rejected = runtime.complete(invalidOuter);

  assert.equal(rejected.accepted, false);
  assert.equal(ownKeysCalls, 1);
  assert.equal(nestedCompletion.accepted, false);
  assert.equal(nestedDispatch.accepted, false);
  assert.equal(nestedStale.accepted, false);
  assert.equal(nestedUnmount, false);
  assert.equal(runtime.isUnmounted(), false);
  assert.equal(app.calls().updateCalls, 1);
  assert.deepEqual(runtime.trace(), before);
  assert.equal(runtime.failure(), null);

  assert.equal(deliver(validReply).accepted, true);
  assert.equal(app.calls().updateCalls, 2);
  assert.equal(stateField(runtime.trace().ticks.at(-1), "Text").string, "reply-from-reentry");
});

test("completion descriptor and prototype traps run only after admission is reserved", () => {
  let deliver;
  const { app, runtime } = setup({
    effectHost: { request(_request, callback) { deliver = callback; } },
  });
  assert.equal(runtime.dispatch(makeAction("1"), makeMessage("load", "q")).accepted, true);
  const validReply = {
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    message: { name: "complete", arg: "reply" },
  };
  let nestedDispatch;
  let nestedStale;
  let nestedUnmount;
  let trapCalls = 0;
  let descriptorTrapEntered = false;
  const proxiedReply = new Proxy(validReply, {
    getPrototypeOf(target) {
      trapCalls += 1;
      return Reflect.getPrototypeOf(target);
    },
    getOwnPropertyDescriptor(target, key) {
      trapCalls += 1;
      if (key === "dispatchId" && !descriptorTrapEntered) {
        descriptorTrapEntered = true;
        nestedDispatch = runtime.dispatch(makeAction("nested"), makeMessage("add"));
        nestedStale = runtime.recordStaleAction(makeAction("stale"), 0);
        nestedUnmount = runtime.unmount();
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });

  const result = runtime.complete(proxiedReply);

  assert.equal(result.accepted, true);
  assert.ok(trapCalls >= 4);
  assert.equal(descriptorTrapEntered, true);
  assert.equal(nestedDispatch.accepted, false);
  assert.equal(nestedStale.accepted, false);
  assert.equal(nestedUnmount, false);
  assert.equal(runtime.isUnmounted(), false);
  assert.equal(app.calls().updateCalls, 2);
  assert.equal(runtime.trace().ticks.length, 3);
  assert.equal(deliver({ dispatchId: "dispatch-0001", effectIndex: 0, message: { name: "complete", arg: "duplicate" } }).accepted, false);
});

test("completion accessors are rejected without invoking their getter", () => {
  let deliver;
  const { runtime } = setup({
    effectHost: { request(_request, callback) { deliver = callback; } },
  });
  runtime.dispatch(makeAction("1"), makeMessage("load", "q"));
  const accessorCompletion = {
    dispatchId: "dispatch-0001",
    effectIndex: 0,
  };
  let getterCalls = 0;
  Object.defineProperty(accessorCompletion, "message", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return { name: "complete", arg: "should-not-run" };
    },
  });

  const rejected = runtime.complete(accessorCompletion);

  assert.equal(rejected.accepted, false);
  assert.equal(getterCalls, 0);
  assert.equal(runtime.trace().ticks.length, 2);
  assert.equal(runtime.failure(), null);
  assert.equal(deliver({ dispatchId: "dispatch-0001", effectIndex: 0, message: { name: "complete", arg: "ok" } }).accepted, true);
});

test("completion trap failures cannot reenter after validation admission is released", () => {
  const { app, runtime } = setup();
  let nestedDispatch;
  const thrown = new Proxy(new Error("proxy trap failed"), {
    get(target, key, receiver) {
      if (key === "message") {
        nestedDispatch = runtime.dispatch(makeAction("nested"), makeMessage("add"));
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const invalidCompletion = new Proxy({}, {
    ownKeys() { throw thrown; },
  });
  const before = runtime.trace();

  const rejected = runtime.complete(invalidCompletion);

  assert.equal(rejected.accepted, false);
  assert.equal(nestedDispatch, undefined);
  assert.equal(app.calls().updateCalls, 0);
  assert.deepEqual(runtime.trace(), before);
  assert.equal(runtime.failure(), null);
});

test("synchronous effect-host delivery waits until the requesting commit finishes", () => {
  let runtime;
  let deliveryResult;
  let stateDuringRequest;
  let traceLengthDuringRequest;
  const effectHost = {
    request(request, deliver) {
      stateDuringRequest = runtime.snapshot().view.tree.text;
      traceLengthDuringRequest = runtime.trace().ticks.length;
      deliveryResult = deliver({
        dispatchId: request.dispatchId,
        effectIndex: request.effectIndex,
        message: { name: "complete", arg: "synchronous" },
      });
    },
  };
  const configured = setup({ effectHost });
  runtime = configured.runtime;

  const result = runtime.dispatch(makeAction("1"), makeMessage("load", "q"));

  assert.equal(result.accepted, true);
  assert.equal(deliveryResult.accepted, true);
  assert.equal(deliveryResult.queued, true);
  assert.equal(stateDuringRequest, "count=0;pending=true");
  assert.equal(traceLengthDuringRequest, 2);
  assert.equal(configured.app.calls().updateCalls, 2);
  assert.equal(runtime.trace().ticks.length, 3);
  assert.equal(stateField(runtime.trace().ticks.at(-1), "Pending").bool, false);
  assert.equal(stateField(runtime.trace().ticks.at(-1), "Text").string, "synchronous");
});

