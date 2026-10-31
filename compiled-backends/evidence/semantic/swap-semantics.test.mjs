import assert from "node:assert/strict";
import test from "node:test";
import { createDeterministicEffectHost, mountCompiledApp } from "../../../compiled-frontend/frontend/runtime/runtime.mjs";

const COMPONENT_ID = "sample.App";
const STATE_TYPE = "sample.State";
const MESSAGE_TYPE = "sample.Message";

function makeGoEffect(fields) {
  class Effect {}
  Object.defineProperties(Effect.prototype, {
    __goscriptAssign: { value() {}, writable: true, configurable: true },
    clone: { value() { return Object.assign(new Effect(), this); }, writable: true, configurable: true },
  });
  const effect = Object.assign(new Effect(), fields);
  Object.defineProperty(effect, "__goStructValue", {
    value: true, enumerable: true, writable: true, configurable: true,
  });
  return effect;
}

function makeRuntime({ initialState = "ready", onUpdate = null, effectHost = null, renderer = null } = {}) {
  const calls = { init: 0, update: 0, view: 0 };
  const compiled = {
    schema: "gobi.compiled-module/v1",
    appIR: {
      schema: "gobi.app-ir/v1",
      packagePath: "sample",
      components: [{
        id: COMPONENT_ID,
        packagePath: "sample",
        stateType: STATE_TYPE,
        messageType: MESSAGE_TYPE,
        init: "sample.Init",
        update: "sample.Update",
        view: "sample.View",
        capabilities: ["view.node", "effect.request-reply"],
      }],
    },
    symbols: {
      "sample.Init": () => {
        calls.init += 1;
        return initialState;
      },
      "sample.Update": (state, message) => {
        calls.update += 1;
        if (onUpdate) return onUpdate(state, message);
        return [message.Name === "inc" ? String(Number(state) + 1) : state, []];
      },
      "sample.View": (state) => {
        calls.view += 1;
        return {
          Kind: 1,
          Tag: "div",
          Key: "root",
          Attrs: [],
          On: [],
          Kids: [],
          Text: state,
        };
      },
    },
  };
  const runtime = mountCompiledApp({
    module: compiled,
    componentId: COMPONENT_ID,
    encoder: {
      gobiEncodeState(state) {
        return { typeId: STATE_TYPE, kind: "string", string: state };
      },
    },
    renderer: renderer ?? makeRenderer(makeContainer(), "initial"),
    effectHost,
  });
  return { calls, runtime, compiled };
}

function makeRenderer(container, name, options = {}) {
  const renderer = {
    currentView: null,
    callbacks: null,
    physicalNode: null,
    unmounted: false,
    unmountObservedEmpty: false,
    restoredFocus: null,
    focusRecord: options.focusRecord ?? null,
    update(view, callbacks) {
      this.currentView = view;
      this.callbacks = callbacks;
      this.physicalNode = { renderer: name, view };
      container.children.splice(0, container.children.length, this.physicalNode);
      const result = options.update?.call(this, view, callbacks);
      return result;
    },
    viewRecord() {
      if (this.currentView === null) return null;
      return {
        tree: {
          kind: "element",
          tag: this.currentView.Tag,
          key: this.currentView.Key,
          attrs: [],
          on: [],
          kids: [],
          text: this.currentView.Text,
        },
        bindings: [],
      };
    },
    domSnapshot() {
      const text = this.currentView?.Text ?? "";
      return {
        normalization: "outerHTML-v1",
        html: this.currentView === null ? "" : `<div>${text}</div>`,
        controls: [],
      };
    },
    focusState() {
      return this.focusRecord === null ? null : { ...this.focusRecord };
    },
    restoreFocus(record) {
      this.restoredFocus = record === null ? null : { ...record };
      if (typeof options.restoreFocus === "function") return options.restoreFocus.call(this, record);
      return true;
    },
    unmount() {
      this.unmounted = true;
      container.children.length = 0;
      this.unmountObservedEmpty = container.children.length === 0;
      this.currentView = null;
    },
  };
  return renderer;
}

function makeContainer() {
  return { children: [] };
}

const incAction = { path: "", event: "click", value: "" };
const incMessage = { Name: "inc", Arg: "" };
const loadMessage = { Name: "load", Arg: "x" };
const validCompletion = {
  dispatchId: "dispatch-0001",
  effectIndex: 0,
  message: { name: "complete", arg: "done" },
};

function makePendingEffectFixture() {
  const hostScript = {
    schema: "gobi.host-script/v1",
    steps: [{
      request: {
        dispatchId: "dispatch-0001",
        effectIndex: 0,
        effect: { kind: "fixture.request", name: "lookup", arg: "x", reply: "complete" },
      },
      completion: { name: "complete", arg: "done" },
    }],
  };
  const effectHost = createDeterministicEffectHost(hostScript);
  const container = makeContainer();
  const initialRenderer = makeRenderer(container, "react", {
    focusRecord: {
      identity: '["root","field:query"]',
      selectionStart: 3,
      selectionEnd: 3,
      selectionDirection: "backward",
    },
  });
  const app = makeRuntime({
    initialState: "ready",
    effectHost,
    renderer: initialRenderer,
    onUpdate(state, message) {
      if (message.Name === "load") {
        return ["pending", [makeGoEffect({ Kind: "fixture.request", Name: "lookup", Arg: "x", Reply: "complete" })]];
      }
      if (message.Name === "complete") return ["done", []];
      return [state, []];
    },
  });
  app.runtime.dispatch(incAction, loadMessage);
  return { app, container, effectHost, initialRenderer };
}

function oneShotDeliveryThenable(effectHost, afterDelivery = () => {}) {
  return new Proxy({}, {
    get(_target, property) {
      if (property === "then") {
        effectHost.deliverNext();
        afterDelivery();
        return undefined;
      }
      return undefined;
    },
  });
}

test("swap reuses the cached Go view without rerunning Go or recording an app tick", () => {
  const container = makeContainer();
  const initial = makeRenderer(container, "react", {
    focusRecord: {
      identity: '["root","field:query"]',
      selectionStart: 3,
      selectionEnd: 3,
      selectionDirection: "backward",
    },
  });
  const { calls, runtime: live } = makeRuntime({ initialState: "0", renderer: initial });
  const before = live.trace();
  const next = makeRenderer(container, "dom");

  const swapped = live.replaceRenderer(next);

  assert.deepEqual(live.trace(), before, "renderer replacement must not append a tick");
  assert.equal(calls.init, 1);
  assert.equal(calls.update, 0);
  assert.equal(calls.view, 1);
  assert.equal(initial.unmounted, true);
  assert.equal(initial.unmountObservedEmpty, true);
  assert.notEqual(initial.physicalNode, next.physicalNode, "replacement creates a distinct DOM node");
  assert.deepEqual(initial.restoredFocus, null);
  assert.deepEqual(next.restoredFocus, initial.focusRecord, "focus and backward selection restore by logical key");
  assert.deepEqual(swapped.state, live.snapshot().state);
  assert.equal(container.children.length, 1, "only the new renderer root remains after the synchronous swap");

  const traceBeforeRetiredCallback = live.trace();
  const retiredCallback = initial.callbacks.dispatch(incAction, incMessage);
  assert.equal(retiredCallback.accepted, false, "retired renderer callback is fenced");
  assert.deepEqual(live.trace(), traceBeforeRetiredCallback, "retired callback is diagnostic-only and adds no tick");

  const update = live.dispatch(incAction, incMessage);
  assert.equal(update.dispatchId, "dispatch-0001");
  assert.equal(calls.update, 1);
  assert.equal(live.trace().ticks.length, before.ticks.length + 1);
  assert.equal(live.trace().ticks.at(-1).dispatchId, "dispatch-0001");
  assert.equal(calls.init, 1);
  const currentCallbacks = next.callbacks;
  const stateBeforeUnmount = live.snapshot().state;
  live.unmount();
  assert.equal(container.children.length, 0);
  const postUnmount = currentCallbacks.dispatch(incAction, incMessage);
  assert.equal(postUnmount.stale, true, "active renderer callback after unmount is suppressed");
  assert.equal(postUnmount.dispatchId, null);
  assert.equal(calls.update, 1, "post-unmount callback cannot run Go Update");
  const lifecycleTick = live.trace().ticks.at(-1);
  assert.deepEqual(lifecycleTick.action, incAction);
  assert.equal(lifecycleTick.message, null);
  assert.equal(lifecycleTick.dispatchId, null);
  assert.deepEqual(lifecycleTick.state, stateBeforeUnmount);
  assert.deepEqual(lifecycleTick.dom, { normalization: "outerHTML-v1", html: "", controls: [] });
});

test("completion during swap queues after return while dispatch and nested replacement are fenced", async () => {
  const hostScript = {
    schema: "gobi.host-script/v1",
    steps: [{
      request: {
        dispatchId: "dispatch-0001",
        effectIndex: 0,
        effect: { kind: "fixture.request", name: "lookup", arg: "x", reply: "complete" },
      },
      completion: { name: "complete", arg: "done" },
    }],
  };
  const effectHost = createDeterministicEffectHost(hostScript);
  const container = makeContainer();
  const first = makeRenderer(container, "react", {
    focusRecord: {
      identity: '["root","field:query"]',
      selectionStart: 3,
      selectionEnd: 3,
      selectionDirection: "backward",
    },
  });
  let runtime;
  const app = makeRuntime({
    initialState: "ready",
    effectHost,
    renderer: first,
    onUpdate(state, message) {
      if (message.Name === "load") {
        return ["pending", [makeGoEffect({ Kind: "fixture.request", Name: "lookup", Arg: "x", Reply: "complete" })]];
      }
      if (message.Name === "complete") return ["done", []];
      return [state, []];
    },
  });
  runtime = app.runtime;
  runtime.dispatch(incAction, loadMessage);
  const beforeSwap = runtime.trace();
  const third = makeRenderer(container, "unused");
  const attempted = {};
  const next = makeRenderer(container, "dom", {
    update() {
      // Accessing a hostile `then` property is where the runtime checks that a
      // renderer commit is synchronous. Delivery is one-shot, so replacement
      // must queue it rather than reject and lose it.
      return new Proxy({}, {
        get(_target, property) {
          if (property === "then") {
            attempted.delivered = effectHost.deliverNext();
            return undefined;
          }
          return undefined;
        },
      });
    },
    restoreFocus() {
      attempted.dispatch = runtime.dispatch(incAction, incMessage);
      try {
        attempted.replace = runtime.replaceRenderer(third);
      } catch (error) {
        attempted.replace = { threw: error.name };
      }
      return true;
    },
  });

  const returned = runtime.replaceRenderer(next);

  assert.equal(attempted.delivered, true);
  assert.equal(attempted.dispatch?.accepted, false, "reentrant app dispatch is rejected");
  assert.notEqual(attempted.replace?.accepted, true, "nested replacement cannot commit");
  assert.deepEqual(runtime.trace(), beforeSwap, "no Go Update or reply tick occurs inside synchronous replacement");
  assert.equal(app.calls.update, 1, "only the original load transition ran before return");
  assert.equal(returned.state.string, "pending");
  assert.equal(runtime.snapshot().state.string, "pending");
  assert.equal(runtime.trace().ticks.length, beforeSwap.ticks.length);
  const duplicate = runtime.complete(validCompletion);
  assert.equal(duplicate.accepted, false, "queued completion is duplicate-fenced before drain");
  runtime.dispatch(incAction, null);
  assert.equal(runtime.trace().ticks.length, beforeSwap.ticks.length + 1, "an unrelated no-dispatch attempt does not drain the held completion synchronously");
  assert.equal(runtime.trace().ticks.at(-1).dispatchId, null);
  assert.equal(runtime.snapshot().state.string, "pending");

  await Promise.resolve();

  assert.equal(app.calls.update, 2, "exactly one reply Update runs after the replacement returns");
  assert.equal(runtime.trace().ticks.length, beforeSwap.ticks.length + 2);
  assert.equal(runtime.trace().ticks.at(-1).dispatchId, "dispatch-0002");
  assert.deepEqual(runtime.trace().ticks.at(-1).completedEffects, [{
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    message: { name: "complete", arg: "done" },
  }]);
  assert.equal(runtime.snapshot().state.string, "done");
  effectHost.assertDone();
  runtime.unmount();
});

test("one-shot completion queued during a swap is canceled by unmount before the microtask", async () => {
  const { app, container, effectHost } = makePendingEffectFixture();
  const { runtime } = app;
  const next = makeRenderer(container, "dom", {
    update() {
      return oneShotDeliveryThenable(effectHost);
    },
  });

  const returned = runtime.replaceRenderer(next);
  assert.equal(returned.state.string, "pending");
  assert.equal(effectHost.completions().length, 1, "the one-shot host made its delivery attempt");
  assert.equal(app.calls.update, 1, "no reply Update has run yet");
  assert.equal(runtime.unmount(), true);

  await Promise.resolve();

  assert.equal(app.calls.update, 1, "unmount cancels held reply work");
  assert.equal(runtime.trace().ticks.length, 2);
  assert.equal(runtime.isUnmounted(), true);
  effectHost.assertDone();
});

test("post-teardown replacement failure cancels a one-shot completion queued during focus restore", async () => {
  const { app, container, effectHost } = makePendingEffectFixture();
  const { runtime } = app;
  const next = makeRenderer(container, "dom", {
    restoreFocus() {
      effectHost.deliverNext();
      throw new Error("focus restore failed");
    },
  });

  assert.throws(() => runtime.replaceRenderer(next), /focus restore failed/i);
  assert.notEqual(runtime.failure(), null);
  await Promise.resolve();

  assert.equal(app.calls.update, 1, "failed replacement cancels held reply work");
  assert.equal(runtime.trace().ticks.length, 2);
  effectHost.assertDone();
});

test("pre-teardown focus capture rejection cancels a one-shot completion queued during capture", async () => {
  const { app, effectHost, initialRenderer } = makePendingEffectFixture();
  const { runtime } = app;
  const traceBefore = runtime.trace();
  initialRenderer.focusState = () => {
    effectHost.deliverNext();
    throw new Error("capture rejected after effect delivery");
  };

  assert.throws(() => runtime.replaceRenderer(makeRenderer(makeContainer(), "dom")), /capture rejected/i);
  assert.equal(initialRenderer.unmounted, false);
  assert.equal(runtime.failure(), null);
  assert.equal(runtime.snapshot().state.string, "pending");
  assert.deepEqual(runtime.trace(), traceBefore);
  await Promise.resolve();
  assert.equal(app.calls.update, 1, "canceled capture-time delivery cannot run a reply Update");
  assert.deepEqual(runtime.trace(), traceBefore);
  effectHost.assertDone();
  runtime.unmount();
});

test("focus capture throw, Promise, or malformed record rejects before teardown and leaves the runtime usable", async () => {
  const cases = [
    {
      name: "throw",
      capture() { throw new Error("focus capture failed"); },
      expected: /focus capture failed/i,
    },
    {
      name: "promise",
      makeCapture() {
        let rejectLater;
        const promise = new Promise((_resolve, reject) => { rejectLater = reject; });
        return { capture: () => promise, rejectLater };
      },
      expected: /synchron|thenable|focus/i,
    },
    {
      name: "malformed",
      capture() {
        return { identity: 7, selectionStart: -1, selectionEnd: 0, selectionDirection: "sideways" };
      },
      expected: /focus|selection|identity/i,
    },
    {
      name: "extra field",
      capture() {
        return {
          identity: '["root","field:query"]',
          selectionStart: 0,
          selectionEnd: 0,
          selectionDirection: "none",
          extra: true,
        };
      },
      expected: /focus|selection|field|exact/i,
    },
    {
      name: "undefined",
      capture() { return undefined; },
      expected: /focus|selection|record|null/i,
    },
  ];

  for (const captureCase of cases) {
    const container = makeContainer();
    const old = makeRenderer(container, "react", {
      focusRecord: {
        identity: '["root","field:query"]',
        selectionStart: 1,
        selectionEnd: 1,
        selectionDirection: "none",
      },
    });
    const { calls, runtime } = makeRuntime({ initialState: "0", renderer: old });
    const traceBefore = runtime.trace();
    const promiseCase = captureCase.makeCapture?.();
    old.focusState = promiseCase?.capture ?? captureCase.capture;

    assert.throws(() => runtime.replaceRenderer(makeRenderer(container, "dom")), captureCase.expected, captureCase.name);
    assert.equal(old.unmounted, false, `${captureCase.name}: old renderer must remain mounted`);
    assert.equal(runtime.failure(), null, `${captureCase.name}: pre-teardown capture rejection does not halt runtime`);
    assert.deepEqual(runtime.trace(), traceBefore, `${captureCase.name}: no app tick is recorded`);
    assert.equal(runtime.snapshot().state.string, "0", `${captureCase.name}: old renderer remains usable`);
    assert.deepEqual(calls, { init: 1, update: 0, view: 1 });
    assert.equal(runtime.rendererDiagnostics().replacements.at(-1).outcome, "rejected");
    assert.equal(runtime.rendererDiagnostics().replacements.at(-1).phase, "focus-capture");

    if (promiseCase) promiseCase.rejectLater(new Error("late rejected focus promise"));
    old.focusState = () => ({
      identity: '["root","field:query"]',
      selectionStart: 1,
      selectionEnd: 1,
      selectionDirection: "none",
    });
    runtime.replaceRenderer(makeRenderer(container, "dom"));
    assert.equal(old.unmounted, true, `${captureCase.name}: later valid replacement succeeds`);
    runtime.unmount();
  }

  await new Promise((resolve) => setImmediate(resolve));
});

test("focus restoration accepts only strict true and fails closed after teardown otherwise", async () => {
  const restoreResults = [
    ["false", () => false],
    ["undefined", () => undefined],
    ["string", () => "true"],
    ["rejected Promise", () => Promise.reject(new Error("late focus rejection"))],
  ];
  for (const [label, restoreFocus] of restoreResults) {
    const container = makeContainer();
    const old = makeRenderer(container, "react", {
      focusRecord: {
        identity: '["root","field:query"]',
        selectionStart: 1,
        selectionEnd: 1,
        selectionDirection: "none",
      },
    });
    const { runtime } = makeRuntime({ initialState: "0", renderer: old });
    const traceBefore = runtime.trace();
    const next = makeRenderer(container, "dom", { restoreFocus });

    assert.throws(() => runtime.replaceRenderer(next), /focus|boolean|restore|synchron|thenable/i, label);
    assert.equal(old.unmounted, true, "restore validation happens after old teardown");
    assert.notEqual(runtime.failure(), null, "restore failure halts runtime");
    assert.deepEqual(runtime.trace(), traceBefore, "failed replacement adds no app tick");
    assert.throws(() => runtime.snapshot(), /unavailable|renderer/i, "runtime does not claim rollback");
    const diagnostic = runtime.rendererDiagnostics().replacements.at(-1);
    assert.equal(diagnostic.outcome, "failed");
    assert.equal(diagnostic.phase, "focus-restore");
    assert.equal(diagnostic.focusRestored, false);
  }
  await new Promise((resolve) => setImmediate(resolve));
});

test("focus capture cannot reenter dispatch or replacement while the old renderer is active", () => {
  const container = makeContainer();
  const old = makeRenderer(container, "react", {
    focusRecord: {
      identity: '["root","field:query"]',
      selectionStart: 1,
      selectionEnd: 1,
      selectionDirection: "none",
    },
  });
  const { calls, runtime } = makeRuntime({ initialState: "0", renderer: old });
  const traceBefore = runtime.trace();
  const attempted = {};
  const nested = makeRenderer(container, "nested");
  old.focusState = () => {
    attempted.dispatch = runtime.dispatch(incAction, incMessage);
    try {
      attempted.replace = runtime.replaceRenderer(nested);
    } catch (error) {
      attempted.replace = { threw: error.name };
    }
    return {
      identity: '["root","field:query"]',
      selectionStart: 1,
      selectionEnd: 1,
      selectionDirection: "none",
    };
  };

  const next = makeRenderer(container, "dom");
  runtime.replaceRenderer(next);

  assert.equal(attempted.dispatch.accepted, false);
  assert.equal(attempted.dispatch.dispatchId, null);
  assert.equal(attempted.replace.threw, "TypeError");
  assert.equal(nested.unmounted, false);
  assert.equal(calls.update, 0);
  assert.deepEqual(runtime.trace(), traceBefore, "reentrant callbacks add no hidden application tick");
  assert.equal(old.unmounted, true, "the outer replacement can still commit");
  assert.equal(runtime.snapshot().state.string, "0");
  runtime.unmount();
});

test("malformed focus pairs fail before teardown; async commits fail closed after teardown", () => {
  const container = makeContainer();
  const old = makeRenderer(container, "react");
  const { runtime: live } = makeRuntime({ initialState: "0", renderer: old });
  assert.throws(() => live.replaceRenderer(old), /same|cannot replace|renderer/i);
  assert.equal(old.unmounted, false, "same-instance rejection occurs before teardown");
  const malformedPair = {
    ...makeRenderer(container, "bad"),
    focusState() { return null; },
    restoreFocus: undefined,
  };
  assert.throws(() => live.replaceRenderer(malformedPair), /focus|renderer|protocol/i);
  assert.equal(old.unmounted, false, "preflight failure leaves old renderer mounted");

  const asynchronous = makeRenderer(container, "async", { update: () => Promise.resolve() });
  assert.throws(() => live.replaceRenderer(asynchronous), /synchron|thenable|renderer/i);
  assert.equal(old.unmounted, true, "teardown may already have occurred when commit fails");
  assert.notEqual(live.failure(), null, "post-teardown failure is surfaced and halts runtime");
  live.unmount();
});
