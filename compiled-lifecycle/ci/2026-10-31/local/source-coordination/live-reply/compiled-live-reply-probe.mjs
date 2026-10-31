import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

import { mountLifecycleApp } from "../../runtime/runtime.mjs";

const root = resolve(process.cwd());
const appDir = process.env.GOBI_LIFECYCLE_APP_DIR;
if (!appDir) throw new Error("GOBI_LIFECYCLE_APP_DIR must point to the fresh React CLI app directory");

const compiledModule = await import(pathToFileURL(join(appDir, "gobi-compiled.mjs")).href);
const encoderModule = await import(pathToFileURL(join(appDir, "encoder.mjs")).href);
const directHelpers = await import(pathToFileURL(resolve(root, "compiled-frontend/conformance/direct-js.mjs")).href);
const compiled = compiledModule.gobiCompiled;
const encoder = encoderModule;
const component = compiled.appIR.components.find((item) =>
  item.id === "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle");
assert(component, "fresh CLI AppIR is missing the lifecycle component");

function recordCompiledView(raw) {
  const tree = Object.hasOwn(raw, "Tree") ? raw.Tree : raw;
  const rawBindings = Object.hasOwn(raw, "Bindings")
    ? (directHelpers.goSliceValues(raw.Bindings, "View.Bindings") ?? [])
    : [];
  return {
    tree: directHelpers.recordGoNode(tree),
    bindings: rawBindings.map((binding) => ({
      path: binding.Path,
      event: binding.Event,
      message: binding.Message,
      source: binding.Source,
    })),
  };
}

const renderer = {
  currentView: null,
  update(view) { this.currentView = view; },
  viewRecord() { return recordCompiledView(this.currentView); },
  // This headless probe checks the compiled Go view record; it makes no DOM claim.
  domSnapshot() { return { normalization: "outerHTML-v1", html: "<main></main>", controls: [] }; },
  unmount() { this.currentView = null; },
};

const session = mountLifecycleApp({
  module: compiled,
  componentId: component.id,
  appId: component.id,
  encoder,
  renderer,
});
const { runtime, effects } = session;

function dispatch(name, arg = "") {
  return runtime.dispatch(
    { path: "live-reply-probe", event: "click", value: name },
    { Name: name, Arg: arg },
  );
}

function valueField(value, name) {
  assert.equal(value.kind, "struct");
  const field = value.fields.find((item) => item.name === name);
  assert(field, `encoded value is missing field ${name}`);
  return field.value;
}

function stringValue(value) {
  assert.equal(value.kind, "string");
  return value.string;
}

function boolValue(value) {
  assert.equal(value.kind, "bool");
  return value.bool;
}

function stateSummary(encodedState) {
  const nodes = {};
  for (const [label, field] of [["parent", "Parent"], ["child", "Child"], ["grandchild", "Grandchild"], ["sibling", "Sibling"]]) {
    const value = valueField(encodedState, field);
    nodes[label] = {
      id: stringValue(valueField(value, "ID")),
      parentID: stringValue(valueField(value, "ParentID")),
      generation: valueField(value, "Generation").integer,
      requestID: valueField(value, "RequestID").integer,
      alive: boolValue(valueField(value, "Alive")),
      requested: boolValue(valueField(value, "Requested")),
      pending: boolValue(valueField(value, "Pending")),
      token: stringValue(valueField(value, "Token")),
      reply: stringValue(valueField(value, "Reply")),
      counterFloat64Bits: valueField(valueField(value, "Counter"), "Count").float64Bits,
    };
  }
  return { nodes, nextRequestID: valueField(encodedState, "NextRequestID").integer };
}

function currentPendingRecords() {
  return effects.pending().map(({ dispatchId, effectIndex, token }) => ({ dispatchId, effectIndex, token }));
}

function currentSnapshots() {
  const snapshot = runtime.snapshot();
  return { state: snapshot.state, view: snapshot.view, summary: stateSummary(snapshot.state) };
}

for (const name of ["requestParent", "requestChild", "requestGrandchild", "requestSibling"]) {
  const result = dispatch(name);
  assert.equal(result.accepted, true, `${name}: ${result.error ?? "not accepted"}`);
}
assert.deepEqual(effects.pending().map(({ token }) => token), [
  "parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4",
]);

const removeResult = dispatch("removeParent");
assert.equal(removeResult.accepted, true, removeResult.error);
const remountResult = dispatch("remountParent");
assert.equal(remountResult.accepted, true, remountResult.error);
for (const name of ["requestParent", "requestChild", "requestGrandchild"]) {
  const result = dispatch(name);
  assert.equal(result.accepted, true, `${name}: ${result.error ?? "not accepted"}`);
}

const freshSnapshot = currentSnapshots();
const expectedFreshTokens = {
  parent: "parent:g2:r5",
  child: "child:g2:r6",
  grandchild: "grandchild:g2:r7",
  sibling: "sibling:g1:r4",
};
for (const [scope, token] of Object.entries(expectedFreshTokens)) {
  assert.equal(freshSnapshot.summary.nodes[scope].pending, true, `${scope} must still be Pending before old replies`);
  assert.equal(freshSnapshot.summary.nodes[scope].token, token);
}
const expectedPendingCorrelations = currentPendingRecords();
assert.deepEqual(expectedPendingCorrelations.map(({ token }) => token), [
  "sibling:g1:r4", "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7",
]);
const expectedCorePending = runtime.effectDiagnostics().pending.map(({ dispatchId, effectIndex }) => ({ dispatchId, effectIndex }));
assert.equal(expectedCorePending.length, 4);

const directStale = [];
for (const token of ["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3"]) {
  const before = currentSnapshots();
  const pendingBefore = currentPendingRecords();
  const corePendingBefore = runtime.effectDiagnostics().pending.map(({ dispatchId, effectIndex }) => ({ dispatchId, effectIndex }));
  const ticksBefore = runtime.trace().ticks.length;
  const result = dispatch("complete", token);
  const after = currentSnapshots();
  const pendingAfter = currentPendingRecords();
  const corePendingAfter = runtime.effectDiagnostics().pending.map(({ dispatchId, effectIndex }) => ({ dispatchId, effectIndex }));
  assert.equal(result.accepted, true, `direct old Go message ${token} should be processed as a no-op`);
  assert.deepEqual(after.state, before.state, `direct old message ${token} changed Go state`);
  assert.deepEqual(after.view, before.view, `direct old message ${token} changed compiled Go view`);
  assert.deepEqual(pendingAfter, pendingBefore, `direct old message ${token} changed driver correlations`);
  assert.deepEqual(corePendingAfter, corePendingBefore, `direct old message ${token} changed core correlations`);
  assert.equal(runtime.trace().ticks.length, ticksBefore + 1, "direct Go messages should be admitted as ordinary no-op ticks");
  directStale.push({
    token,
    result,
    goTickCount: { before: ticksBefore, after: runtime.trace().ticks.length },
    stateUnchanged: true,
    viewUnchanged: true,
    driverCorrelationsUnchanged: true,
    coreCorrelationsUnchanged: true,
    state: after.summary,
  });
}

const retiredCallbackProbes = [];
for (const token of ["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3"]) {
  const before = currentSnapshots();
  const pendingBefore = currentPendingRecords();
  const corePendingBefore = runtime.effectDiagnostics().pending.map(({ dispatchId, effectIndex }) => ({ dispatchId, effectIndex }));
  const ticksBefore = runtime.trace().ticks.length;
  const result = effects.forceDeliverRetired(token);
  const after = currentSnapshots();
  assert.equal(result.accepted, false, `retired callback ${token} should be fenced by its old correlation`);
  assert.match(result.error, /unknown or extra effect completion/i);
  assert.equal(runtime.trace().ticks.length, ticksBefore, `retired callback ${token} added a Go tick`);
  assert.deepEqual(after.state, before.state, `retired callback ${token} changed Go state`);
  assert.deepEqual(after.view, before.view, `retired callback ${token} changed compiled Go view`);
  assert.deepEqual(currentPendingRecords(), pendingBefore, `retired callback ${token} changed driver correlations`);
  assert.deepEqual(runtime.effectDiagnostics().pending.map(({ dispatchId, effectIndex }) => ({ dispatchId, effectIndex })), corePendingBefore,
    `retired callback ${token} changed current core correlations`);
  retiredCallbackProbes.push({
    token,
    result,
    goTickCount: { before: ticksBefore, after: runtime.trace().ticks.length },
    stateUnchanged: true,
    viewUnchanged: true,
    currentCorrelationsUnchanged: true,
    state: after.summary,
  });
}

const freshDeliveries = [];
for (const token of ["grandchild:g2:r7", "child:g2:r6", "parent:g2:r5", "sibling:g1:r4"]) {
  const before = runtime.trace().ticks.length;
  const result = effects.deliver(token);
  assert.equal(result.accepted, true, `fresh reply ${token} was rejected: ${result.error ?? "unknown"}`);
  assert.equal(runtime.trace().ticks.length, before + 1);
  const after = currentSnapshots();
  const scope = token.startsWith("parent:") ? "parent" : token.startsWith("child:") ? "child" : token.startsWith("grandchild:") ? "grandchild" : "sibling";
  assert.equal(after.summary.nodes[scope].pending, false, `${scope} remained Pending after fresh reply`);
  assert.equal(after.summary.nodes[scope].reply, token, `${scope} did not store its exact fresh reply`);
  freshDeliveries.push({ token, result, state: after.summary });
}
assert.deepEqual(effects.pending(), []);
assert.deepEqual(runtime.effectDiagnostics().pending, []);

const output = {
  schema: "gobi.lifecycle-live-reply-compiled-probe/v1",
  execution: "actual compiled GoScript Init/Update/View through existing mountCompiledApp host + lifecycle effect driver; headless ViewRecord serializer; no application reducer and no DOM claim",
  componentID: component.id,
  appDir: resolve(appDir),
  stages: {
    freshPendingBeforeOldReplies: {
      state: freshSnapshot.summary,
      driverCorrelations: expectedPendingCorrelations,
      coreCorrelations: expectedCorePending,
      view: freshSnapshot.view,
    },
    directOldGoMessages: directStale,
    forceDeliveryOfRetiredCallbacks: retiredCallbackProbes,
    freshRepliesStillAccepted: freshDeliveries,
  },
  final: {
    state: currentSnapshots().summary,
    view: runtime.snapshot().view,
    pending: effects.pending(),
    corePending: runtime.effectDiagnostics().pending,
  },
  trace: runtime.trace(),
  effectRecords: effects.records(),
  coreEffectDiagnostics: runtime.effectDiagnostics(),
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
