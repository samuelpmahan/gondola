import assert from "node:assert/strict";

import { mountLifecycleApp } from "../../../runtime/runtime.mjs";
import { gobiCompiled } from "../../../builds/feasibility/final/react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs";
import * as encoder from "../../../builds/feasibility/final/react/output/apps/lifecycle-7e6575d90707/encoder.mjs";

const component = gobiCompiled.appIR.components[0];
const renderer = {
  update(view, callbacks) { this.view = view; this.callbacks = callbacks; },
  viewRecord() {
    return { tree: { kind: "element", tag: "main", key: "unmount-probe", attrs: [], on: [], kids: [], text: "" }, bindings: [] };
  },
  domSnapshot() { return { normalization: "outerHTML-v1", html: "<main></main>", controls: [] }; },
  unmount() { this.view = null; },
};
const { runtime, effects } = mountLifecycleApp({
  module: gobiCompiled,
  componentId: component.id,
  appId: "reentrant-unmount-probe",
  encoder,
  renderer,
});
const dispatch = (name) => runtime.dispatch(
  { path: "probe", event: "click", value: name },
  { Name: name, Arg: "" },
);

const firstRequest = dispatch("requestParent");
assert.equal(firstRequest.accepted, true);
const parent = effects.pending().find(({ token }) => token === "parent:g1:r1");
let nestedUnmount = null;
const validCompletion = new Proxy({
  dispatchId: parent.dispatchId,
  effectIndex: parent.effectIndex,
  message: { name: "complete", arg: parent.token },
}, {
  ownKeys(target) {
    nestedUnmount = runtime.unmount();
    return Reflect.ownKeys(target);
  },
});
const completion = runtime.complete(validCompletion);
assert.equal(nestedUnmount, false);
assert.equal(completion.accepted, true);
await new Promise((resolve) => queueMicrotask(resolve));
assert.equal(runtime.isUnmounted(), false);
assert.equal(effects.pending().some(({ token }) => token === parent.token), true);

const childRequest = dispatch("requestChild");
assert.equal(childRequest.accepted, true);
const duplicateParentDelivery = effects.deliver(parent.token);
assert.equal(duplicateParentDelivery.accepted, false);
assert.match(duplicateParentDelivery.error, /already delivered/i);
const childDelivery = effects.deliver("child:g1:r2");
assert.equal(childDelivery.accepted, true);

const siblingRequest = dispatch("requestSibling");
assert.equal(siblingRequest.accepted, true);
assert.equal(runtime.unmount(), true);
assert.deepEqual(effects.pending(), []);
const released = effects.forceDeliverRetired("sibling:g1:r3");
assert.equal(released.accepted, false);
assert.match(released.error, /released on host unmount/i);

process.stdout.write(`${JSON.stringify({
  nestedUnmount,
  completionAccepted: completion.accepted,
  runtimeStillMountedAfterRefusal: true,
  duplicateParentDelivery: duplicateParentDelivery.runtimeResult,
  subsequentChildRequestAccepted: childRequest.accepted,
  subsequentChildDeliveryAccepted: childDelivery.accepted,
  directUnmountAccepted: true,
  pendingAfterUnmount: effects.pending().length,
  outstandingCallbackReleased: released.error,
}, null, 2)}\n`);
