import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { validateActions, validateSwapObservations } from "./check.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("swap schedule names all five deterministic existing scripts and alternates both renderers", async () => {
  const schedule = JSON.parse(await readFile(resolve(here, "swap-schedules.json"), "utf8"));
  assert.equal(schedule.schema, "gobi.backend-swap-schedules/v1");
  assert.equal(schedule.policy, "alternate-after-each-fixture-action");
  assert.deepEqual(schedule.backends, ["react", "dom"]);
  assert.equal(schedule.effectReplyTiming, "after-scheduled-swap");
  assert.deepEqual(schedule.fixtures, [
    "unchanged-counter-add-reset-disabled",
    "compiled-form-text-checked-literal-save-reset",
    "compiled-keyed-list-identity-empty-and-detached",
    "compiled-effect-commit-before-deterministic-reply",
    "compiled-list-growth-spare-capacity-edit-reorder-reset",
  ]);
});

function oneSwapEvidence() {
  const dom = { normalization: "outerHTML-v1", html: "<div></div>", controls: [] };
  const trace = { schema: "gobi.trace/v1", appId: "counter", ticks: [{ index: 0, action: null, message: null,
    dispatchId: null, state: { kind: "struct" }, requestedEffects: [], completedEffects: [], view: {}, dom: null }] };
  const browserTrace = structuredClone(trace);
  browserTrace.ticks[0].dom = dom;
  const snapshot = { state: trace.ticks[0].state, view: {}, dom };
  const event = {
    afterActionIndex: 0,
    from: { id: 1, backend: "react" },
    to: { id: 2, backend: "dom" },
    beforeTrace: browserTrace,
    afterTrace: browserTrace,
    beforeSnapshot: snapshot,
    afterSnapshot: snapshot,
    returnedSnapshot: snapshot,
    hostRequestsBefore: [],
    hostRequestsAfter: [],
    hostCompletionsBefore: [],
    hostCompletionsAfter: [],
    diagnosticsBefore: { replacements: [], fencedCallbacks: [] },
    diagnosticsAfter: { replacements: [{ outcome: "committed", focusCaptured: false, focusRestored: false }], fencedCallbacks: [] },
    oldRendererSnapshot: { normalization: "outerHTML-v1", html: "", controls: [] },
    oldRootDetached: true,
    oldRootEmptyDuringSwap: true,
    rootMutationEvidence: { childListRecords: 2, oldRootRemoved: true, newRootAdded: true, emptyAfterOldRemoval: true },
    focusBefore: null,
    focusAfter: null,
    focusNodeReplaced: true,
    physicalHTML: "<div></div>",
    fenced: { trace: browserTrace, snapshot, diagnostics: { fencedCallbacks: [{ kind: "stale" }] }, dispatch: null,
      stale: { accepted: false, stale: true } },
  };
  return {
    schema: "gobi.backend-swap-observations/v1",
    events: [event],
    focusAcrossSwap: [],
  };
}

test("swap observations accept an unchanged application prefix and reject trace or renderer mutations", () => {
  const observations = oneSwapEvidence();
  const profile = { swapObservations: observations };
  const native = structuredClone(observations.events[0].afterTrace);
  native.ticks[0].dom = null;
  assert.doesNotThrow(() => validateSwapObservations(profile, native, { actions: [{}], focusWitnesses: [] }, [observations.events[0].afterSnapshot.dom]));

  const changedTick = structuredClone(profile);
  changedTick.swapObservations.events[0].afterTrace.ticks[0].state.changed = true;
  assert.throws(() => validateSwapObservations(changedTick, native, { actions: [{}], focusWitnesses: [] }, [observations.events[0].afterSnapshot.dom]), /ticks/);

  const wrongBackend = structuredClone(profile);
  wrongBackend.swapObservations.events[0].to.backend = "react";
  assert.throws(() => validateSwapObservations(wrongBackend, native, { actions: [{}], focusWitnesses: [] }, [observations.events[0].afterSnapshot.dom]), /alternate/);

  const retainedRoot = structuredClone(profile);
  retainedRoot.swapObservations.events[0].oldRootEmptyDuringSwap = false;
  assert.throws(() => validateSwapObservations(retainedRoot, native, { actions: [{}], focusWitnesses: [] }, [observations.events[0].afterSnapshot.dom]), /empty physical root/);
});

function focusedSwapEvidence(focusBefore, focusAfter = focusBefore) {
  const observations = oneSwapEvidence();
  const event = observations.events[0];
  event.focusBefore = structuredClone(focusBefore);
  event.focusAfter = structuredClone(focusAfter);
  event.diagnosticsAfter.replacements[0].focusCaptured = true;
  event.diagnosticsAfter.replacements[0].focusRestored = true;
  return {
    observations,
    profile: { swapObservations: observations },
    native: structuredClone(event.afterTrace),
    domSnapshots: [event.afterSnapshot.dom],
  };
}

test("focus checks preserve observed focus without inventing an undeclared fixture witness", () => {
  const observed = {
    identity: JSON.stringify(["effect", "effect-input"]),
    selectionStart: 1,
    selectionEnd: 4,
    selectionDirection: "backward",
  };
  const undeclared = focusedSwapEvidence(observed);
  assert.doesNotThrow(() => validateSwapObservations(undeclared.profile, undeclared.native,
    { actions: [{}], focusWitnesses: [] }, undeclared.domSnapshots));

  const changedAfter = structuredClone(undeclared);
  changedAfter.observations.events[0].focusAfter.selectionEnd += 1;
  assert.throws(() => validateSwapObservations(changedAfter.profile, changedAfter.native,
    { actions: [{}], focusWitnesses: [] }, changedAfter.domSnapshots), /focus/);

  const declared = focusedSwapEvidence(observed);
  assert.doesNotThrow(() => validateSwapObservations(declared.profile, declared.native,
    { actions: [{}], focusWitnesses: [{ afterActionIndex: 0, key: "effect-input", selectionStart: 1,
      selectionEnd: 4, selectionDirection: "backward" }] }, declared.domSnapshots));

  const wrongKey = focusedSwapEvidence(observed);
  assert.throws(() => validateSwapObservations(wrongKey.profile, wrongKey.native,
    { actions: [{}], focusWitnesses: [{ afterActionIndex: 0, key: "other-input", selectionStart: 1,
      selectionEnd: 4, selectionDirection: "backward" }] }, wrongKey.domSnapshots), /keyed input focus/);

  const missing = oneSwapEvidence();
  assert.throws(() => validateSwapObservations({ swapObservations: missing },
    structuredClone(missing.events[0].afterTrace),
    { actions: [{}], focusWitnesses: [{ afterActionIndex: 0, key: "effect-input", selectionStart: 1,
      selectionEnd: 4, selectionDirection: "backward" }] }, [missing.events[0].afterSnapshot.dom]), /declared focus witness/);
});

function staleActionEvidence({ retiredProbe = false } = {}) {
  const action = { path: "2/1/0", event: "input", value: "ignored detached edit" };
  const state = { kind: "struct", value: "unchanged" };
  const initial = { index: 0, action: null, message: null, dispatchId: null, state, requestedEffects: [],
    completedEffects: [], view: {}, dom: null };
  const tick = { index: 1, action, message: null, dispatchId: null, state, requestedEffects: [],
    completedEffects: [], view: {}, dom: null };
  const trace = { schema: "gobi.trace/v1", appId: "list", ticks: [initial, tick] };
  const beforeTrace = { schema: "gobi.trace/v1", appId: "list", ticks: [initial] };
  const observed = { path: action.path, event: action.event, value: action.value };
  const activeRendererId = 8;
  const evidence = {
    index: 0,
    intent: action,
    expectedMessage: null,
    traceTickIndex: 1,
    traceTick: tick,
    method: "active renderer onStaleAction for missing detached target",
    classification: retiredProbe ? "retired-renderer-probe-plus-active-missing-target-attempt" : "active-renderer-missing-target-attempt",
    targetConnectedBefore: false,
    targetValueAtDispatch: action.value,
    activeRendererId,
    observedAction: observed,
    rendererCallback: { rendererId: activeRendererId, action, observed, renderEpoch: 0 },
    before: { ticks: 1, callbacks: { dispatch: 0, stale: 0 } },
    afterPhysical: { ticks: 2, callbacks: { dispatch: 0, stale: retiredProbe ? 2 : 1 } },
  };
  if (retiredProbe) {
    const snapshot = { state, view: {}, dom: { normalization: "outerHTML-v1", html: "<div></div>", controls: [] } };
    evidence.retiredCallbackProbe = {
      classification: "retired-renderer-callback-fenced-out-of-band",
      rendererId: 7,
      before: { trace: beforeTrace, snapshot, callbacks: { dispatch: 0, stale: 0 }, diagnostics: { fencedCallbacks: [] } },
      after: { trace: structuredClone(beforeTrace), snapshot: structuredClone(snapshot), callbacks: { dispatch: 0, stale: 1 }, diagnostics: {
        fencedCallbacks: [{ generation: 7, kind: "stale", renderEpoch: 1 }],
      } },
      callback: { rendererId: 7, action, observed, renderEpoch: 1 },
    };
  }
  return {
    action,
    fixture: { actions: [action], expectations: [{ actionIndex: 0, message: null }] },
    profile: { backend: "swap", trace, actions: [evidence] },
  };
}

test("detached callbacks separate retired-renderer fencing from one active missing-target attempt", () => {
  const active = staleActionEvidence();
  assert.doesNotThrow(() => validateActions(active.profile, active.fixture));

  const retired = staleActionEvidence({ retiredProbe: true });
  assert.doesNotThrow(() => validateActions(retired.profile, retired.fixture));

  const retiredTick = structuredClone(retired.profile);
  retiredTick.actions[0].retiredCallbackProbe.after.trace.ticks.push(retiredTick.trace.ticks[1]);
  assert.throws(() => validateActions(retiredTick, retired.fixture), /retiredCallback.trace/);

  const doubleActiveTick = structuredClone(retired.profile);
  doubleActiveTick.actions[0].afterPhysical.ticks += 1;
  assert.throws(() => validateActions(doubleActiveTick, retired.fixture), /exactly one suppressed application tick/);

  const wrongActiveRenderer = structuredClone(retired.profile);
  wrongActiveRenderer.actions[0].rendererCallback.rendererId = 7;
  assert.throws(() => validateActions(wrongActiveRenderer, retired.fixture), /active renderer callback/);

  const wrongRetiredLifetime = structuredClone(retired.profile);
  wrongRetiredLifetime.actions[0].retiredCallbackProbe.callback.rendererId = 8;
  assert.throws(() => validateActions(wrongRetiredLifetime, retired.fixture), /retired renderer callback provenance/);
});

test("action evidence keeps actual target value and Go message independent of the requested intent", () => {
  const intent = { path: "2", event: "click", value: "do not replace literal" };
  const traceTick = { index: 1, action: intent, message: { name: "literal", arg: "target.value" }, dispatchId: "dispatch-0001" };
  const fixture = { actions: [intent], expectations: [{ actionIndex: 0, message: traceTick.message, dispatchId: "dispatch-0001" }] };
  const profile = { backend: "react", trace: { ticks: [{}, traceTick] }, actions: [{
    index: 0,
    intent,
    expectedMessage: traceTick.message,
    traceTickIndex: 1,
    traceTick,
    before: { callbacks: { dispatch: 0, stale: 0 } },
    afterPhysical: { callbacks: { dispatch: 1, stale: 0 } },
    targetValueAtDispatch: "",
    rendererCallback: { rendererId: 1, action: intent, observed: { path: "2", event: "click", value: "" },
      message: { Name: "literal", Arg: "target.value" } },
  }] };
  assert.doesNotThrow(() => validateActions(profile, fixture));

  const conflated = structuredClone(profile);
  conflated.actions[0].rendererCallback.message.Arg = intent.value;
  assert.throws(() => validateActions(conflated, fixture), /callbackMessage/);

  const forgedTarget = structuredClone(profile);
  forgedTarget.actions[0].rendererCallback.observed.value = intent.value;
  assert.throws(() => validateActions(forgedTarget, fixture), /observedTargetValue/);
});
