import test from "node:test";
import assert from "node:assert/strict";

import {
  createDeterministicEffectHost,
  mountCompiledApp,
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

function setup({ update } = {}) {
  const app = makeApp({ update });
  const renderer = makeRenderer();
  const failures = [];
  const runtime = mountCompiledApp({
    module: app.compiled,
    componentId: COMPONENT_ID,
    appId: APP_ID,
    encoder: makeHelpers(),
    renderer,
    onFailure: (failure) => failures.push(failure),
  });
  return { app, renderer, runtime, failures };
}

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
  const makeRuntimeWithEffect = (rawEffect) => {
    const app = makeApp({
      update(state, message, countCall) {
        countCall();
        return [{ ...state, Pending: true }, [rawEffect]];
      },
    });
    const hostRequests = [];
    const runtime = mountCompiledApp({
      module: app.compiled,
      componentId: COMPONENT_ID,
      appId: APP_ID,
      encoder: makeHelpers(),
      renderer: makeRenderer(),
      effectHost: { request(request) { hostRequests.push(request); } },
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

