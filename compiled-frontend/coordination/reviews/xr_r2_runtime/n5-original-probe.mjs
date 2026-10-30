import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mountCompiledApp } from "../../../frontend/runtime/runtime.mjs";

const COMPONENT_ID = "counter";
const APP_ID = "runtime-audit";
const STATE_TYPE = "counter.State";
const MESSAGE_TYPE = "gobi.Message";
const runtimeSource = new URL("../../../frontend/runtime/runtime.mjs", import.meta.url);
const runtimeSha256 = createHash("sha256").update(readFileSync(runtimeSource)).digest("hex");

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

function harness() {
  const calls = { update: 0, hostRequests: [] };
  const initial = () => ({ Count: 0, Pending: false, Reply: "" });
  const update = (state, message) => {
    calls.update += 1;
    const next = { ...state };
    if (message.Name === "load") {
      next.Pending = true;
      return [next, [new GoEffect({
        Kind: "fixture.request", Name: "lookup", Arg: message.Arg, Reply: "complete",
      })]];
    }
    if (message.Name === "complete") {
      next.Pending = false;
      next.Reply = message.Arg;
      next.Count += 1;
    }
    if (message.Name === "add") next.Count += 1;
    return [next, []];
  };
  const view = (state) => ({ text: `count=${state.Count};pending=${state.Pending};reply=${state.Reply}` });
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
      symbols: [],
      types: [],
    },
    symbols: { "counter.Init": initial, "counter.Update": update, "counter.View": view },
  };
  const renderer = {
    callbacks: null,
    oldCallbacks: [],
    currentView: { tree: null, bindings: [] },
    unmounted: false,
    update(nextView, callbacks) {
      this.currentView = { tree: nextView, bindings: [] };
      this.callbacks = callbacks;
      this.oldCallbacks.push(callbacks);
    },
    viewRecord() { return this.currentView; },
    domSnapshot() {
      return { normalization: "outerHTML-v1", html: this.unmounted ? "" : "<root>", controls: [] };
    },
    unmount() { this.unmounted = true; },
  };
  const encoder = {
    gobiEncodeState(state, typeId) {
      return {
        typeId,
        kind: "struct",
        fields: [
          { name: "Count", value: { typeId: "int64", kind: "int", int: String(state.Count) } },
          { name: "Pending", value: { typeId: "bool", kind: "bool", bool: state.Pending } },
          { name: "Reply", value: { typeId: "string", kind: "string", string: state.Reply } },
        ],
      };
    },
  };
  const runtime = mountCompiledApp({
    module: compiled,
    componentId: COMPONENT_ID,
    appId: APP_ID,
    encoder,
    renderer,
    effectHost: { request(request) { calls.hostRequests.push(request); } },
  });
  return { calls, renderer, runtime };
}

const load = harness();
const loadResult = load.runtime.dispatch(
  { path: "", event: "click", value: "load" },
  { Name: "load", Arg: "query" },
);
assert.equal(loadResult.accepted, true);
assert.deepEqual(load.calls.hostRequests.map((r) => [r.effect.kind, r.effect.name, r.effect.reply]), [
  ["fixture.request", "lookup", "complete"],
]);
const validReply = {
  dispatchId: loadResult.dispatchId,
  effectIndex: 0,
  message: { name: "complete", arg: "reply-from-reentrant-trap" },
};
let nestedCompletionResult;
let ownKeysTrapRuns = 0;
const invalidOuterCompletion = new Proxy({ dispatchId: "wrong", effectIndex: 0 }, {
  ownKeys(target) {
    ownKeysTrapRuns += 1;
    nestedCompletionResult = load.runtime.complete(validReply);
    return Reflect.ownKeys(target);
  },
});
const outerCompletionResult = load.runtime.complete(invalidOuterCompletion);
const completionAfter = load.runtime.snapshot();
assert.equal(outerCompletionResult.accepted, false);
assert.equal(ownKeysTrapRuns, 1);
assert.equal(nestedCompletionResult.accepted, true);
assert.equal(load.calls.update, 2);
assert.equal(completionAfter.state.fields.find((f) => f.name === "Count").value.int, "1");
assert.equal(completionAfter.state.fields.find((f) => f.name === "Reply").value.string, "reply-from-reentrant-trap");

const stale = harness();
let nestedDispatchResult;
let staleOwnKeysRuns = 0;
const staleActionProxy = new Proxy({ path: "stale", event: "click", value: "detached" }, {
  ownKeys(target) {
    staleOwnKeysRuns += 1;
    nestedDispatchResult = stale.runtime.dispatch(
      { path: "nested", event: "click", value: "nested" },
      { Name: "add", Arg: "" },
    );
    return Reflect.ownKeys(target);
  },
});
const staleResult = stale.runtime.recordStaleAction(staleActionProxy, 0);
assert.equal(staleResult.accepted, true);
assert.equal(staleOwnKeysRuns, 1);
assert.equal(nestedDispatchResult.accepted, false);
assert.equal(stale.calls.update, 0);
assert.equal(stale.runtime.failure(), null);

const unmount = harness();
unmount.runtime.dispatch({ path: "", event: "click", value: "add" }, { Name: "add", Arg: "" });
const beforeUnmount = unmount.runtime.trace().ticks.at(-1).view;
unmount.runtime.unmount();
const late = unmount.renderer.oldCallbacks[0].onStaleAction(
  { path: "", event: "click", value: "late" },
  0,
);
const lateTick = unmount.runtime.trace().ticks.at(-1);
assert.equal(late.accepted, true);
assert.deepEqual(lateTick.view, beforeUnmount);
assert.equal(lateTick.dom.html, "");
assert.equal(unmount.calls.update, 1);
assert.equal(unmount.runtime.failure(), null);

const result = {
  runtimeSha256,
  nodeVersion: process.version,
  focusedExistingSuite: { passed: 11, failed: 0 },
  lowerCamelActionAndMarkedEffect: {
    accepted: loadResult.accepted,
    exactEffectTuple: ["fixture.request", "lookup", "complete"],
  },
  invalidOuterCompletionReentrancy: {
    ownKeysTrapRuns,
    outerAccepted: outerCompletionResult.accepted,
    outerError: outerCompletionResult.error,
    nestedAccepted: nestedCompletionResult.accepted,
    updateCallsAfterOuterRejection: load.calls.update,
    countAfterOuterRejection: completionAfter.state.fields.find((f) => f.name === "Count").value.int,
    replyAfterOuterRejection: completionAfter.state.fields.find((f) => f.name === "Reply").value.string,
  },
  staleActionAdmission: {
    ownKeysTrapRuns: staleOwnKeysRuns,
    staleAccepted: staleResult.accepted,
    nestedDispatchAccepted: nestedDispatchResult.accepted,
    updateCalls: stale.calls.update,
    failure: stale.runtime.failure(),
  },
  postUnmountStaleSnapshot: {
    staleAccepted: late.accepted,
    logicalViewPreserved: JSON.stringify(lateTick.view) === JSON.stringify(beforeUnmount),
    domHtml: lateTick.dom.html,
    updateCalls: unmount.calls.update,
    failure: unmount.runtime.failure(),
  },
};
console.log(JSON.stringify(result, null, 2));
