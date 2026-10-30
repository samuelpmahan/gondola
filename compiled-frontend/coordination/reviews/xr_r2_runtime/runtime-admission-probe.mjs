import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mountCompiledApp } from "../../../frontend/runtime/runtime.mjs";

const runtimePath = new URL("../../../frontend/runtime/runtime.mjs", import.meta.url);
const runtimeSha256 = createHash("sha256").update(readFileSync(runtimePath)).digest("hex");

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

function setup(effectHost) {
  const calls = { updates: 0, hostRequests: [] };
  let deliver = null;
  const initial = () => ({ Count: 0, Pending: false, Reply: "" });
  const update = (state, message) => {
    calls.updates += 1;
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
        id: "counter", packagePath: "example/counter", stateType: "counter.State",
        messageType: "gobi.Message", init: "counter.Init", update: "counter.Update",
        view: "counter.View", capabilities: ["view.node", "effect.request-reply"],
      }],
      symbols: [], types: [],
    },
    symbols: { "counter.Init": initial, "counter.Update": update, "counter.View": view },
  };
  const renderer = {
    callbacks: null,
    oldCallbacks: [],
    currentView: null,
    unmounted: false,
    update(nextView, callbacks) {
      this.currentView = { tree: nextView, bindings: [] };
      this.callbacks = callbacks;
      this.oldCallbacks.push(callbacks);
    },
    viewRecord() { return this.currentView; },
    domSnapshot() {
      const text = this.currentView?.tree.text ?? "";
      return { normalization: "outerHTML-v1", html: this.unmounted ? "" : `<div>${text}</div>`, controls: [] };
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
    componentId: "counter",
    appId: "xr-r2-runtime-review",
    encoder,
    renderer,
    effectHost: {
      request(request, callback) {
        calls.hostRequests.push(request);
        deliver = callback;
        effectHost?.(runtime, request, callback);
      },
    },
  });
  return { calls, renderer, runtime, get deliver() { return deliver; } };
}

const trapped = setup(null);
assert.equal(trapped.runtime.dispatch({ path: "", event: "click", value: "load" }, { Name: "load", Arg: "query" }).accepted, true);
const beforeInvalid = trapped.runtime.trace();
const hostRequestsBeforeInvalid = trapped.calls.hostRequests.length;
const validReply = {
  dispatchId: "dispatch-0001",
  effectIndex: 0,
  message: { name: "complete", arg: "reply-after-rejection" },
};
let nestedCompletion;
let nestedDispatch;
let nestedStale;
let nestedUnmount;
let ownKeysCalls = 0;
const invalidOuter = new Proxy({ dispatchId: "wrong", effectIndex: 0 }, {
  ownKeys(target) {
    ownKeysCalls += 1;
    nestedCompletion = trapped.runtime.complete(validReply);
    nestedDispatch = trapped.runtime.dispatch({ path: "nested", event: "click", value: "nested" }, { Name: "add", Arg: "" });
    nestedStale = trapped.runtime.recordStaleAction({ path: "stale", event: "click", value: "stale" }, 0);
    nestedUnmount = trapped.runtime.unmount();
    return Reflect.ownKeys(target);
  },
});
const invalidResult = trapped.runtime.complete(invalidOuter);
const afterInvalid = trapped.runtime.snapshot();
assert.equal(invalidResult.accepted, false);
assert.equal(ownKeysCalls, 1);
assert.equal(nestedCompletion.accepted, false);
assert.equal(nestedDispatch.accepted, false);
assert.equal(nestedStale.accepted, false);
assert.equal(nestedUnmount, false);
assert.equal(trapped.runtime.isUnmounted(), false);
assert.deepEqual(trapped.runtime.trace(), beforeInvalid);
assert.equal(trapped.calls.updates, 1);
assert.equal(trapped.calls.hostRequests.length, hostRequestsBeforeInvalid);
assert.equal(afterInvalid.state.fields.find((field) => field.name === "Count").value.int, "0");
assert.equal(afterInvalid.state.fields.find((field) => field.name === "Reply").value.string, "");
assert.equal(trapped.runtime.failure(), null);

const messageTrap = setup(null);
assert.equal(messageTrap.runtime.dispatch({ path: "", event: "click", value: "load" }, { Name: "load", Arg: "query" }).accepted, true);
const messageTrapBefore = messageTrap.runtime.trace();
const messageTrapValidReply = {
  dispatchId: "dispatch-0001", effectIndex: 0,
  message: { name: "complete", arg: "must-not-run" },
};
let messageDescriptorTrapCalls = 0;
let messageNestedCompletion;
let messageNestedDispatch;
let messageNestedStale;
let messageNestedUnmount;
const thrownError = new Proxy(new Error("error-message-observed-under-fence"), {
  getOwnPropertyDescriptor(target, key) {
    if (key === "message") {
      messageDescriptorTrapCalls += 1;
      messageNestedCompletion = messageTrap.runtime.complete(messageTrapValidReply);
      messageNestedDispatch = messageTrap.runtime.dispatch({ path: "nested", event: "click", value: "nested" }, { Name: "add", Arg: "" });
      messageNestedStale = messageTrap.runtime.recordStaleAction({ path: "stale", event: "click", value: "stale" }, 0);
      messageNestedUnmount = messageTrap.runtime.unmount();
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
});
const invalidThrowingInput = new Proxy({}, { ownKeys() { throw thrownError; } });
const messageTrapResult = messageTrap.runtime.complete(invalidThrowingInput);
assert.equal(messageTrapResult.accepted, false);
assert.equal(messageTrapResult.error, "error-message-observed-under-fence");
assert.equal(messageDescriptorTrapCalls, 1);
assert.equal(messageNestedCompletion.accepted, false);
assert.equal(messageNestedDispatch.accepted, false);
assert.equal(messageNestedStale.accepted, false);
assert.equal(messageNestedUnmount, false);
assert.equal(messageTrap.runtime.isUnmounted(), false);
assert.deepEqual(messageTrap.runtime.trace(), messageTrapBefore);
assert.equal(messageTrap.calls.updates, 1);
assert.equal(messageTrap.runtime.failure(), null);

const synchronous = setup((runtime, request, callback) => {
  const beforeDelivery = runtime.snapshot();
  synchronousEvidence.stateDuringHost = beforeDelivery.view.tree.text;
  synchronousEvidence.pendingDuringHost = beforeDelivery.state.fields.find((field) => field.name === "Pending").value.bool;
  synchronousEvidence.domDuringHost = beforeDelivery.dom.html;
  synchronousEvidence.traceLengthDuringHost = runtime.trace().ticks.length;
  synchronousEvidence.deliveryResult = callback({
    dispatchId: request.dispatchId,
    effectIndex: request.effectIndex,
    message: { name: "complete", arg: "synchronous-reply" },
  });
});
const synchronousEvidence = { stateDuringHost: null, pendingDuringHost: null, domDuringHost: null, traceLengthDuringHost: null, deliveryResult: null };
const synchronousResult = synchronous.runtime.dispatch({ path: "", event: "click", value: "load" }, { Name: "load", Arg: "query" });
const synchronousTrace = synchronous.runtime.trace();
const duplicateResult = synchronous.deliver({
  dispatchId: "dispatch-0001", effectIndex: 0,
  message: { name: "complete", arg: "duplicate" },
});
assert.equal(synchronousResult.accepted, true);
assert.equal(synchronousEvidence.pendingDuringHost, true);
assert.equal(synchronousEvidence.domDuringHost, "<div>count=0;pending=true;reply=</div>");
assert.equal(synchronousEvidence.traceLengthDuringHost, 2);
assert.equal(synchronousEvidence.deliveryResult.accepted, true);
assert.equal(synchronousEvidence.deliveryResult.queued, true);
assert.equal(synchronousTrace.ticks.length, 3);
assert.equal(synchronous.calls.updates, 2);
assert.equal(synchronousTrace.ticks.at(-1).message.arg, "synchronous-reply");
assert.equal(duplicateResult.accepted, false);
assert.equal(synchronous.calls.updates, 2);
assert.equal(synchronous.runtime.trace().ticks.length, 3);

console.log(JSON.stringify({
  schema: "xr-r2-runtime.admission-probe/v1",
  nodeVersion: process.version,
  runtimeSha256,
  invalidOuterCompletion: {
    ownKeysCalls,
    accepted: invalidResult.accepted,
    nestedCompletionAccepted: nestedCompletion.accepted,
    nestedDispatchAccepted: nestedDispatch.accepted,
    nestedStaleAccepted: nestedStale.accepted,
    nestedUnmount: nestedUnmount,
    updates: trapped.calls.updates,
    hostRequests: trapped.calls.hostRequests.length,
    traceUnchanged: JSON.stringify(trapped.runtime.trace()) === JSON.stringify(beforeInvalid),
    count: afterInvalid.state.fields.find((field) => field.name === "Count").value.int,
    reply: afterInvalid.state.fields.find((field) => field.name === "Reply").value.string,
    unmounted: trapped.runtime.isUnmounted(),
    failure: trapped.runtime.failure(),
  },
  thrownErrorMessageDescriptorObservation: {
    descriptorTrapCalls: messageDescriptorTrapCalls,
    observedMessage: messageTrapResult.error,
    nestedCompletionAccepted: messageNestedCompletion.accepted,
    nestedDispatchAccepted: messageNestedDispatch.accepted,
    nestedStaleAccepted: messageNestedStale.accepted,
    nestedUnmount: messageNestedUnmount,
    updates: messageTrap.calls.updates,
    traceUnchanged: JSON.stringify(messageTrap.runtime.trace()) === JSON.stringify(messageTrapBefore),
    unmounted: messageTrap.runtime.isUnmounted(),
    failure: messageTrap.runtime.failure(),
  },
  synchronousHostReply: {
    dispatchAccepted: synchronousResult.accepted,
    stateDuringHostRequest: synchronousEvidence.stateDuringHost,
    pendingDuringHostRequest: synchronousEvidence.pendingDuringHost,
    domDuringHostRequest: synchronousEvidence.domDuringHost,
    traceLengthDuringHostRequest: synchronousEvidence.traceLengthDuringHost,
    deliveryAccepted: synchronousEvidence.deliveryResult.accepted,
    deliveryQueued: synchronousEvidence.deliveryResult.queued,
    traceTicksAfterDrain: synchronousTrace.ticks.length,
    updateCalls: synchronous.calls.updates,
    reply: synchronousTrace.ticks.at(-1).message.arg,
    duplicateAccepted: duplicateResult.accepted,
    traceTicksAfterDuplicate: synchronous.runtime.trace().ticks.length,
    updateCallsAfterDuplicate: synchronous.calls.updates,
  },
}, null, 2));
