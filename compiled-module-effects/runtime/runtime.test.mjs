import test from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDeferredModuleEffectTransport,
  mountCompiledModuleEffects,
  validateModuleEffectsDescriptor,
} from "./runtime.mjs";
import { loadModuleEffectsBuilds } from "../build/module-loader.mjs";
import { createViewTools } from "../../compiled-frontend/frontend/shared/view.mjs";
import { booleanAttributes, eventNames } from "../../compiled-frontend/frontend/react/react-map.gen.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BUILD_INDEX = resolve(process.env.GOBI_MODULE_EFFECTS_BUILD_INDEX ?? resolve(ROOT, "compiled-module-effects/build/output/E-BUILD-final/build-index.json"));
const tools = createViewTools({ rendererName: "module effects memory test renderer", eventNames, booleanAttributes });
const profilesPromise = loadModuleEffectsBuilds(BUILD_INDEX);

// These host unit tests invoke actual emitted Go modules through a synthetic
// renderer. Browser and mounted React/DOM evidence belongs to the N6 smoke.
class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.nodeType = 1;
    this.childNodes = [];
    this.attributes = new Map();
    this.parentNode = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  replaceChildren(...nodes) {
    for (const node of this.childNodes) node.parentNode = null;
    this.childNodes = nodes;
    for (const node of nodes) node.parentNode = this;
  }
  get firstElementChild() { return this.childNodes.find((node) => node.nodeType === 1) ?? null; }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.childNodes = this.parentNode.childNodes.filter((node) => node !== this);
    this.parentNode = null;
  }
}

class FakeDocument {
  createElement() { return new FakeElement(this); }
}

function memoryRenderers() {
  const create = (backend) => {
    let record = null;
    const renderer = {
      backend,
      viewCapabilities: ["view.node", "binding.value", "binding.checked"],
      callbacks: null,
      unmounted: false,
      update(view, callbacks) {
        const normalized = tools.normalizeAndValidate(view);
        record = {
          tree: tools.nodeRecord(normalized.view.Tree),
          bindings: normalized.view.Bindings == null ? [] : normalized.bindings.map(tools.bindingRecord),
        };
        this.callbacks = callbacks;
        this.unmounted = false;
      },
      viewRecord() { return structuredClone(record); },
      domSnapshot() { return { normalization: "outerHTML-v1", html: "", controls: [] }; },
      unmount() { this.unmounted = true; },
    };
    return renderer;
  };
  return { dom: () => create("dom"), react: () => create("react") };
}

function container() { return new FakeElement(new FakeDocument()); }

async function mount(backend = "dom", transport = undefined, profileOverride = null) {
  const loaded = await profilesPromise;
  const profile = profileOverride ?? loaded.profiles[backend];
  return mountCompiledModuleEffects({ ...profile, backend, renderers: memoryRenderers(), container: container(), transport });
}

function textIn(value, sought) {
  if (typeof value === "string") return value.includes(sought);
  if (Array.isArray(value)) return value.some((item) => textIn(item, sought));
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((item) => textIn(item, sought));
}

function child(handle, key = "a") { return handle.snapshot().children.find((item) => item.key === key); }

test("healthy independent build artifacts mount as keyed parent plus separately initialized Go children", async () => {
  const handle = await mount("dom");
  const initial = handle.snapshot();
  assert.equal(initial.schema, "gobi.module-effects-snapshot/v1");
  assert.deepEqual(initial.children.map(({ key, generation }) => [key, generation]), [["a", 1], ["b", 1]]);
  assert.equal(initial.parent.goState.ChildCount, 2);
  assert.deepEqual(initial.children.map(({ goState }) => [goState.Mounted, goState.Pending, goState.RequestID]), [
    [true, false, 0], [true, false, 0],
  ]);
  assert.equal(handle.trace().callCounts.parentInit, 1);
  assert.equal(handle.trace().callCounts.childInit, 2);
  assert.deepEqual(handle.pending(), []);
  assert.equal(handle.unmount(), true);
});

test("synchronous transport delivery waits until Go pending state and its rendered view are committed", async () => {
  let handle;
  let retained;
  let startSnapshot;
  let synchronousResult;
  const transport = {
    start(request, deliver) {
      retained = deliver;
      startSnapshot = handle.snapshot();
      assert.equal(request.effect.kind, "fixture.request");
      assert.equal(request.effect.name, "save");
      synchronousResult = deliver({ Name: "complete", Arg: request.effect.arg });
    },
    cancel() { return true; },
  };
  handle = await mount("dom", transport);
  const before = handle.trace().callCounts.childUpdate;
  const click = handle.click({ target: "child", key: "a", generation: 1, path: "3/0", event: "click", value: "" });
  assert.equal(click.accepted, true);
  assert.equal(synchronousResult.queued, true);
  assert.equal(startSnapshot.children[0].goState.Pending, true);
  assert.equal(textIn(startSnapshot.children[0].view, "Saving"), true);
  await handle.flush();
  assert.equal(child(handle).goState.Pending, false);
  assert.equal(child(handle).goState.Reply, "a:g1:r1");
  const after = handle.trace().callCounts.childUpdate;
  assert.equal(after - before, 2, "one request Update and one queued completion Update");
  assert.equal(retained({ Name: "complete", Arg: "a:g1:r1" }).outcome, "ignored-delivered");
  assert.equal(handle.trace().callCounts.childUpdate, after, "retained duplicate callback must not call Go");
  handle.unmount();
});

test("pending transport replies survive renderer swaps while retired UI callbacks stay fenced", async () => {
  const handle = await mount("dom", createDeferredModuleEffectTransport());
  assert.equal(handle.click({ target: "child", key: "a", generation: 1, path: "3/0", event: "click", value: "" }).accepted, true);
  const token = handle.pending()[0].token;
  const oldRenderer = handle.mountedHandles().children.find((item) => item.key === "a").renderer;
  const staleCallbacks = oldRenderer.callbacks;
  const beforeSwap = handle.snapshot();
  const afterSwap = handle.replaceBackend("react");
  assert.equal(afterSwap.backend, "react");
  assert.equal(handle.pending()[0].token, token);
  assert.deepEqual(child(handle).goState, beforeSwap.children[0].goState);
  const beforeStale = handle.trace().callCounts.childUpdate;
  const stale = staleCallbacks.dispatch({ path: "2/1", event: "click", value: "" }, { Name: "add", Arg: "" });
  assert.equal(stale.stale, true);
  assert.equal(handle.trace().callCounts.childUpdate, beforeStale);
  const candidateA = handle.mountedHandles().children.find((item) => item.key === "a").renderer;
  assert.equal(candidateA.callbacks.dispatch({ path: "2/1", event: "click", value: "" }, { Name: "add", Arg: "" }).accepted, true,
    "candidate child callbacks should become live immediately after the swap commits");
  assert.equal(child(handle).goState.Core.Counter.Count, 1);
  const candidateB = handle.mountedHandles().children.find((item) => item.key === "b").renderer;
  assert.equal(candidateB.callbacks.dispatch({ path: "3/0", event: "click", value: "" }, { Name: "request", Arg: "" }).accepted, true,
    "candidate Save callbacks should be live immediately after the swap commits");
  const secondToken = handle.pending().find((item) => item.key === "b").token;
  assert.equal(handle.deliver(token).accepted, true);
  assert.equal(child(handle).goState.Reply, token);
  assert.equal(handle.deliver(secondToken).accepted, true);
  assert.equal(child(handle, "b").goState.Reply, secondToken);
  assert.equal(handle.forceDeliverRetained(token).accepted, false);
  assert.equal(handle.trace().callCounts.childUpdate, beforeStale + 4);
  handle.dispatchParent({ Name: "child.remove", Arg: "a" });
  handle.dispatchParent({ Name: "child.add", Arg: "a" });
  const remounted = handle.mountedHandles().children.find((item) => item.key === "a");
  assert.equal(remounted.generation, 2);
  assert.equal(remounted.renderer.backend, "react", "remounts must use the active backend factory");
  assert.equal(remounted.renderer.callbacks.dispatch({ path: "2/1", event: "click", value: "" }, { Name: "add", Arg: "" }).accepted, true);
  assert.equal(child(handle).goState.Core.Counter.Count, 1, "remounted candidate renderer should dispatch immediately");
  handle.unmount();
});

test("Go unmount state and cancellation precede renderer teardown; old generation callbacks cannot mutate remount", async () => {
  const callbacks = new Map();
  const transportLog = [];
  const transport = {
    start(request, deliver) { callbacks.set(request.effect.arg, deliver); transportLog.push(["start", request.effect.arg]); },
    cancel(token, correlation) {
      transportLog.push(["cancel", token, correlation.dispatchId]);
      callbacks.get(token)?.({ Name: "complete", Arg: token });
      return true;
    },
  };
  const handle = await mount("dom", transport);
  handle.click({ target: "child", key: "a", generation: 1, path: "3/0", event: "click", value: "" });
  const oldToken = handle.pending()[0].token;
  const oldRenderer = handle.mountedHandles().children.find((item) => item.key === "a").renderer;
  const oldCallbacks = oldRenderer.callbacks;
  const beforeRemoval = handle.trace().callCounts.childUpdate;
  assert.equal(handle.dispatchParent({ Name: "child.remove", Arg: "a" }).accepted, true);
  const afterRemovalTrace = handle.trace();
  const retired = afterRemovalTrace.retiredChildren.at(-1);
  assert.equal(retired.before.Pending, true);
  assert.equal(retired.after.Mounted, false);
  assert.equal(retired.after.Pending, false);
  assert.equal(retired.after.Token, oldToken);
  assert.deepEqual(retired.emittedEffects, [{ kind: "lifecycle.cancel", name: "cancel", arg: oldToken, reply: "" }]);
  assert.deepEqual(retired.transportPendingAfter, []);
  const lifecycle = afterRemovalTrace.lifecycle.filter((row) => row.stateEventIndex === retired.stateEventIndex);
  const kinds = lifecycle.map((row) => row.kind);
  assert.ok(kinds.indexOf("go-unmounted-commit") < kinds.indexOf("go-cancel-effect"));
  assert.ok(kinds.indexOf("go-cancel-effect") < kinds.indexOf("transport-cancel-call"));
  assert.ok(kinds.indexOf("transport-cancel") < kinds.indexOf("renderer-unmount"));
  assert.equal(afterRemovalTrace.callCounts.childUpdate, beforeRemoval + 1);
  assert.equal(handle.dispatchParent({ Name: "child.add", Arg: "a" }).accepted, true);
  assert.equal(child(handle).generation, 2);
  assert.equal(handle.click({ target: "child", key: "a", generation: 2, path: "3/0", event: "click", value: "" }).accepted, true);
  const newToken = handle.pending().find((item) => item.key === "a").token;
  assert.equal(newToken, "a:g2:r1");
  const beforeLate = handle.trace().callCounts.childUpdate;
  assert.equal(callbacks.get(oldToken)({ Name: "complete", Arg: oldToken }).accepted, false);
  assert.equal(handle.trace().callCounts.childUpdate, beforeLate);
  assert.equal(oldCallbacks.dispatch({ path: "2/1", event: "click", value: "" }, { Name: "add", Arg: "" }).stale, true);
  assert.equal(handle.trace().callCounts.childUpdate, beforeLate);
  assert.equal(handle.forceDeliverRetained(oldToken).accepted, false);
  assert.equal(child(handle).goState.RequestID, 1);
  assert.deepEqual(transportLog.map(([kind]) => kind), ["start", "cancel", "start"]);
  handle.unmount();
});

test("closed effect descriptors reject malformed tuples and wrong replies leave Go pending", async () => {
  assert.equal(validateModuleEffectsDescriptor({ kind: "fixture.request", name: "save", arg: "a:g2:r1", reply: "complete" }), undefined);
  for (const effect of [
    { kind: "fixture.request", name: "lookup", arg: "a:g2:r1", reply: "complete" },
    { kind: "lifecycle.cancel", name: "cancel", arg: "a:g2:r1", reply: "complete" },
    { kind: "other.request", name: "save", arg: "a:g2:r1", reply: "complete" },
    { kind: "fixture.request", name: "save", arg: "a:g02:r1", reply: "complete" },
  ]) assert.throws(() => validateModuleEffectsDescriptor(effect), TypeError);

  const handle = await mount("dom");
  handle.click({ target: "child", key: "a", generation: 1, path: "3/0", event: "click", value: "" });
  const token = handle.pending()[0].token;
  const before = handle.trace().callCounts.childUpdate;
  const rejected = handle.deliver(token, { Name: "complete", Arg: "a:g1:r2" });
  assert.equal(rejected.accepted, false);
  assert.equal(child(handle).goState.Pending, true);
  assert.equal(handle.trace().callCounts.childUpdate, before);
  assert.equal(handle.deliver(token).accepted, true);
  handle.unmount();
});

test("profile ABI admission rejects a changed child descriptor before mounting Go", async () => {
  const loaded = await profilesPromise;
  const base = loaded.profiles.dom;
  const changed = {
    ...base,
    child: { ...base.child, descriptor: { ...base.child.descriptor, capabilities: [...base.child.descriptor.capabilities, "effect.unknown"] } },
  };
  await assert.rejects(mount("dom", undefined, changed), /descriptor|capabilit|ABI/i);
});
