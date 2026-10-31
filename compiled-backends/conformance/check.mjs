import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { expectedDOMSnapshots } from "../../compiled-frontend/conformance/dom-oracle.mjs";
import { validateFixtureExpectations } from "../../compiled-frontend/conformance/fixture-expectations.mjs";
import { assertTraceMatch, validateHostScript, validateTrace } from "../../compiled-frontend/conformance/trace.mjs";

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function expectedGoMessage(message) {
  return message === null ? null : { Name: message.name, Arg: message.arg };
}

function focusIdentityHasKey(identity, key) {
  if (typeof identity !== "string") return false;
  try {
    const parts = JSON.parse(identity);
    return Array.isArray(parts) && parts.at(-1) === key;
  } catch {
    return false;
  }
}

export function validateActions(profile, fixture) {
  require(Array.isArray(profile.actions) && profile.actions.length === fixture.actions.length,
    `${profile.backend} action evidence does not cover the fixture`);
  for (let index = 0; index < fixture.actions.length; index += 1) {
    const evidence = profile.actions[index];
    const expected = fixture.expectations.find((item) => item.actionIndex === index);
    require(expected, `fixture action ${index} has no expectation`);
    assertExactTraceValue(fixture.actions[index], evidence.intent, `$.profiles.${profile.backend}.actions[${index}].intent`);
    assertExactTraceValue(expected.message, evidence.expectedMessage, `$.profiles.${profile.backend}.actions[${index}].expectedMessage`);
    const tick = profile.trace.ticks[evidence.traceTickIndex];
    require(tick, `${profile.backend} action ${index} references a missing trace tick`);
    assertExactTraceValue(tick, evidence.traceTick, `$.profiles.${profile.backend}.actions[${index}].traceTick`);
    assertExactTraceValue(fixture.actions[index], tick.action, `$.profiles.${profile.backend}.actions[${index}].traceAction`);
    assertExactTraceValue(expected.message, tick.message, `$.profiles.${profile.backend}.actions[${index}].traceMessage`);
    if (expected.dispatchId !== undefined) assertExactTraceValue(expected.dispatchId, tick.dispatchId,
      `$.profiles.${profile.backend}.actions[${index}].dispatchId`);

    if (expected.message === null) {
      require(tick.dispatchId === null, `${profile.backend} suppressed action ${index} has a dispatch ID`);
      if (evidence.method === "disabled HTMLElement.click() plus runtime suppressed intent") {
        require(evidence.targetDisabled === true, `${profile.backend} disabled action ${index} lacks a disabled target`);
        require(evidence.rendererCallback === undefined || evidence.rendererCallback === null,
          `${profile.backend} disabled action ${index} unexpectedly called the renderer`);
        require(evidence.afterPhysical.callbacks.dispatch === evidence.before.callbacks.dispatch,
          `${profile.backend} disabled action ${index} dispatched physically`);
      } else {
        require(evidence.targetConnectedBefore === false, `${profile.backend} stale action ${index} target remained connected`);
        require(evidence.rendererCallback?.rendererId !== undefined, `${profile.backend} stale action ${index} lacks callback provenance`);
        require(evidence.activeRendererId === evidence.rendererCallback.rendererId,
          `${profile.backend} stale action ${index} was not recorded by the active renderer callback`);
        assertExactTraceValue(fixture.actions[index], evidence.rendererCallback.action,
          `$.profiles.${profile.backend}.actions[${index}].staleAction`);
        assertExactTraceValue(expected.message, null, `$.profiles.${profile.backend}.actions[${index}].staleMessage`);
        assertExactTraceValue({ path: fixture.actions[index].path, event: fixture.actions[index].event,
          value: evidence.targetValueAtDispatch }, evidence.rendererCallback.observed,
        `$.profiles.${profile.backend}.actions[${index}].staleObserved`);
        require(evidence.traceTickIndex === evidence.before.ticks && evidence.afterPhysical.ticks === evidence.before.ticks + 1,
          `${profile.backend} stale action ${index} did not produce exactly one suppressed application tick`);
        require(evidence.afterPhysical.callbacks.dispatch === evidence.before.callbacks.dispatch,
          `${profile.backend} stale action ${index} dispatched an application message`);

        const retiredProbe = evidence.retiredCallbackProbe ?? null;
        if (retiredProbe !== null) {
          require(evidence.method === "active renderer onStaleAction for missing detached target" &&
            evidence.classification === "retired-renderer-probe-plus-active-missing-target-attempt",
          `${profile.backend} stale action ${index} misclassified its retired callback and active attempt`);
          require(retiredProbe.classification === "retired-renderer-callback-fenced-out-of-band" &&
            retiredProbe.rendererId !== evidence.activeRendererId && retiredProbe.callback?.rendererId === retiredProbe.rendererId,
          `${profile.backend} stale action ${index} lacks retired renderer callback provenance`);
          assertExactTraceValue(fixture.actions[index], retiredProbe.callback.action,
            `$.profiles.${profile.backend}.actions[${index}].retiredCallback.action`);
          assertExactTraceValue({ path: fixture.actions[index].path, event: fixture.actions[index].event,
            value: evidence.targetValueAtDispatch }, retiredProbe.callback.observed,
          `$.profiles.${profile.backend}.actions[${index}].retiredCallback.observed`);
          assertExactTraceValue(retiredProbe.before.trace, retiredProbe.after.trace,
            `$.profiles.${profile.backend}.actions[${index}].retiredCallback.trace`);
          assertExactTraceValue(retiredProbe.before.snapshot, retiredProbe.after.snapshot,
            `$.profiles.${profile.backend}.actions[${index}].retiredCallback.snapshot`);
          require(retiredProbe.after.callbacks.dispatch === retiredProbe.before.callbacks.dispatch &&
            retiredProbe.after.callbacks.stale === retiredProbe.before.callbacks.stale + 1,
          `${profile.backend} stale action ${index} retired callback changed app dispatch or was not observed`);
          const fencesBefore = retiredProbe.before.diagnostics.fencedCallbacks;
          const fencesAfter = retiredProbe.after.diagnostics.fencedCallbacks;
          require(Array.isArray(fencesBefore) && Array.isArray(fencesAfter) && fencesAfter.length === fencesBefore.length + 1,
            `${profile.backend} stale action ${index} retired callback was not recorded out-of-band`);
          assertExactTraceValue(fencesBefore, fencesAfter.slice(0, fencesBefore.length),
            `$.profiles.${profile.backend}.actions[${index}].retiredCallback.fencePrefix`);
          assertExactTraceValue({ generation: retiredProbe.rendererId, kind: "stale" },
            { generation: fencesAfter.at(-1).generation, kind: fencesAfter.at(-1).kind },
            `$.profiles.${profile.backend}.actions[${index}].retiredCallback.fence`);
          require(evidence.afterPhysical.callbacks.stale === evidence.before.callbacks.stale + 2,
            `${profile.backend} stale action ${index} must record one retired probe and one active attempt`);
        } else {
          require(evidence.classification === "active-renderer-stale-callback" ||
            evidence.classification === "active-renderer-missing-target-attempt",
          `${profile.backend} stale action ${index} has an unknown active callback classification`);
          require(evidence.afterPhysical.callbacks.stale === evidence.before.callbacks.stale + 1,
            `${profile.backend} stale action ${index} did not use one active onStaleAction callback`);
          if (evidence.method === "retained callback from detached active renderer node") {
            require(evidence.classification === "active-renderer-stale-callback",
              `${profile.backend} stale action ${index} misclassified its retained active callback`);
          } else {
            require(evidence.method === "active renderer onStaleAction for missing detached target" &&
              evidence.classification === "active-renderer-missing-target-attempt",
            `${profile.backend} stale action ${index} claims a detached DOM listener without evidence`);
          }
        }
      }
      const previous = profile.trace.ticks[evidence.traceTickIndex - 1];
      if (evidence.traceTickIndex > 0) assertExactTraceValue(previous.state, tick.state,
        `$.profiles.${profile.backend}.actions[${index}].suppressedState`);
    } else {
      require(evidence.rendererCallback?.rendererId !== undefined, `${profile.backend} active action ${index} lacks renderer callback provenance`);
      assertExactTraceValue(fixture.actions[index], evidence.rendererCallback.action,
        `$.profiles.${profile.backend}.actions[${index}].callbackAction`);
      assertExactTraceValue(expectedGoMessage(expected.message), evidence.rendererCallback.message,
        `$.profiles.${profile.backend}.actions[${index}].callbackMessage`);
      assertExactTraceValue({ path: fixture.actions[index].path, event: fixture.actions[index].event,
        value: evidence.targetValueAtDispatch }, evidence.rendererCallback.observed,
      `$.profiles.${profile.backend}.actions[${index}].observedTargetValue`);
      require(evidence.afterPhysical.callbacks.dispatch === evidence.before.callbacks.dispatch + 1,
        `${profile.backend} active action ${index} lacks one renderer dispatch`);
      require(typeof evidence.targetValueAtDispatch === "string", `${profile.backend} active action ${index} lacks a capture-phase control value`);
    }
  }
}

function validateEffectEvidence(profile, fixture, domSnapshots) {
  const expectedRequests = fixture.hostScript.steps.map((step) => step.request);
  const expectedCompletions = fixture.hostScript.steps.filter((step) => step.completion !== null).map((step) => ({
    dispatchId: step.request.dispatchId,
    effectIndex: step.request.effectIndex,
    message: step.completion,
  }));
  assertExactTraceValue(expectedRequests, profile.host.requests, `$.profiles.${profile.backend}.host.requests`);
  assertExactTraceValue(expectedCompletions, profile.host.completions, `$.profiles.${profile.backend}.host.completions`);
  assertExactTraceValue(expectedRequests, profile.observations.requests.map((item) => item.request),
    `$.profiles.${profile.backend}.observations.requests`);
  require(Array.isArray(profile.reorderControls) && profile.reorderControls.length === expectedCompletions.length,
    `${profile.backend} did not exercise each scripted completion's invalid/reordered correlation control`);
  for (let index = 0; index < profile.reorderControls.length; index += 1) {
    const control = profile.reorderControls[index];
    const request = fixture.hostScript.steps.filter((step) => step.completion !== null)[index].request;
    assertExactTraceValue(request, control.request, `$.profiles.${profile.backend}.reorder[${index}].request`);
    require(control.kind === "wrong-correlation-before-manual-reply" && control.rejected === true &&
      control.wrongCorrelation.dispatchId !== request.dispatchId,
    `${profile.backend} accepted an invalid/reordered effect correlation`);
    assertExactTraceValue(control.before.trace, control.after.trace, `$.profiles.${profile.backend}.reorder[${index}].trace`);
    assertExactTraceValue(control.before.requests, control.after.requests, `$.profiles.${profile.backend}.reorder[${index}].requests`);
    assertExactTraceValue(control.before.completions, control.after.completions, `$.profiles.${profile.backend}.reorder[${index}].completions`);
  }
  for (let index = 0; index < profile.observations.requests.length; index += 1) {
    const observed = profile.observations.requests[index];
    const tickIndex = profile.trace.ticks.findIndex((tick) => tick.dispatchId === observed.request.dispatchId);
    require(tickIndex >= 0 && observed.tickCount === tickIndex + 1,
      `${profile.backend} effect request ${index} was observed before its committing tick`);
    const tick = profile.trace.ticks[tickIndex];
    assertExactTraceValue(tick.state, observed.snapshot.state, `$.profiles.${profile.backend}.effect[${index}].state`);
    assertExactTraceValue(tick.view, observed.snapshot.view, `$.profiles.${profile.backend}.effect[${index}].view`);
    assertExactTraceValue(domSnapshots[tickIndex], observed.snapshot.dom, `$.profiles.${profile.backend}.effect[${index}].dom`);
    require(observed.snapshot.dom.html.includes("Status: pending"),
      `${profile.backend} effect request ${index} was not committed as pending before manual reply`);
    require(observed.snapshot.dom.controls.some((control) => control.path === "1" && control.disabled),
      `${profile.backend} effect request ${index} did not disable the request control while pending`);
  }
  if (expectedCompletions.length > 0) {
    require(profile.duplicateEvidence.length > 0, `${profile.backend} did not attempt a duplicate completion`);
    for (const evidence of profile.duplicateEvidence) {
      require(evidence.result.accepted === false, `${profile.backend} accepted a duplicate effect completion`);
      assertExactTraceValue(evidence.beforeTrace, evidence.afterTrace, `$.profiles.${profile.backend}.duplicateCompletion`);
    }
  }
}

function validateUnmount(unmount, label) {
  if (!unmount) throw new Error(`${label} has no unmount evidence`);
  assertExactTraceValue({ normalization: "container-innerHTML-v1", html: "", controls: 0 }, unmount.physical, `$.${label}.physical`);
  assertExactTraceValue({ normalization: "outerHTML-v1", html: "", controls: [] }, unmount.rendererSnapshot, `$.${label}.rendererSnapshot`);
  assertExactTraceValue(unmount.traceBefore, unmount.traceAfterUnmount, `$.${label}.trace`);
  if (unmount.fenced) {
    assertExactTraceValue(unmount.traceAfter, unmount.fenced.trace, `$.${label}.fenced.trace`);
    const extraTicks = unmount.traceAfter.ticks.slice(unmount.traceAfterUnmount.ticks.length);
    require(extraTicks.length === (unmount.fenced.dispatch ? 2 : 1), `${label} did not capture post-unmount callback attempts`);
    for (const tick of extraTicks) {
      require(tick.message === null && tick.dispatchId === null && tick.requestedEffects.length === 0 &&
        tick.completedEffects.length === 0, `${label} post-unmount callback performed a Go Update or effect`);
      assertExactTraceValue(unmount.traceAfterUnmount.ticks.at(-1).state, tick.state, `$.${label}.fenced.state`);
      assertExactTraceValue(unmount.traceAfterUnmount.ticks.at(-1).view, tick.view, `$.${label}.fenced.view`);
      assertExactTraceValue({ normalization: "outerHTML-v1", html: "", controls: [] }, tick.dom, `$.${label}.fenced.dom`);
    }
    require(unmount.fenced.dispatch?.accepted === true && unmount.fenced.dispatch.dispatchId === null &&
      unmount.fenced.stale?.accepted === true && unmount.fenced.stale.dispatchId === null,
    `${label} post-unmount callback caused a Go Update`);
  }
}

export function validateSwapObservations(profile, nativeTrace, fixture, domSnapshots,
  schedule = { initialBackend: "react", backends: ["react", "dom"], policy: "alternate-after-each-fixture-action" }) {
  const observation = profile.swapObservations;
  require(observation?.schema === "gobi.backend-swap-observations/v1", "swap observations must use their separate versioned schema");
  require(Array.isArray(observation.events) && observation.events.length === fixture.actions.length,
    "swap schedule must switch renderers after every fixture action");
  if (schedule.policy !== "alternate-after-each-fixture-action" || !Array.isArray(schedule.backends) ||
      !schedule.backends.includes(schedule.initialBackend)) throw new Error("swap schedule is invalid or unsupported");
  let expectedFrom = schedule.initialBackend;
  let sawFocus = false;
  for (let index = 0; index < observation.events.length; index += 1) {
    const event = observation.events[index];
    require(event.afterActionIndex === index, `swap ${index} is not aligned with its fixture action`);
    assertExactTraceValue({ backend: expectedFrom, id: event.from.id }, event.from,
      `$.swapObservations.events[${index}].from`);
    const currentIndex = schedule.backends.indexOf(expectedFrom);
    const expectedTo = schedule.backends[(currentIndex + 1) % schedule.backends.length];
    require(event.to.backend === expectedTo && event.from.backend === expectedFrom,
      `swap ${index} does not alternate React and DOM renderers`);
    expectedFrom = expectedTo;
    assertExactTraceValue(event.beforeTrace, event.afterTrace, `$.swapObservations.events[${index}].trace`);
    require(event.beforeTrace.ticks.length === event.afterTrace.ticks.length,
      `swap ${index} appended an application trace tick`);
    const expectedPrefix = { ...nativeTrace, ticks: nativeTrace.ticks.slice(0, event.afterTrace.ticks.length) };
    assertTraceMatch(expectedPrefix, event.afterTrace, {
      domSnapshots: domSnapshots.slice(0, event.afterTrace.ticks.length),
    });
    const currentDom = domSnapshots[event.afterTrace.ticks.length - 1];
    assertExactTraceValue(currentDom, event.afterSnapshot.dom, `$.swapObservations.events[${index}].dom`);
    assertExactTraceValue(event.beforeSnapshot.state, event.afterSnapshot.state, `$.swapObservations.events[${index}].state`);
    assertExactTraceValue(event.beforeSnapshot.view, event.afterSnapshot.view, `$.swapObservations.events[${index}].view`);
    assertExactTraceValue(event.afterSnapshot, event.returnedSnapshot, `$.swapObservations.events[${index}].returnedSnapshot`);
    assertExactTraceValue(event.hostRequestsBefore, event.hostRequestsAfter, `$.swapObservations.events[${index}].hostRequests`);
    assertExactTraceValue(event.hostCompletionsBefore, event.hostCompletionsAfter, `$.swapObservations.events[${index}].hostCompletions`);
    require(event.oldRootDetached === true, `swap ${index} left the retired renderer root attached`);
    require(event.oldRootEmptyDuringSwap === true && event.rootMutationEvidence?.oldRootRemoved === true &&
      event.rootMutationEvidence?.newRootAdded === true && event.rootMutationEvidence?.emptyAfterOldRemoval === true,
    `swap ${index} did not observe an empty physical root between renderer commits`);
    assertExactTraceValue({ normalization: "outerHTML-v1", html: "", controls: [] }, event.oldRendererSnapshot,
      `$.swapObservations.events[${index}].oldRendererSnapshot`);
    const replacements = event.diagnosticsAfter?.replacements;
    require(Array.isArray(replacements) && replacements.length === index + 1,
      `swap ${index} is missing runtime renderer replacement diagnostics`);
    const replacement = replacements.at(-1);
    require(replacement.outcome === "committed", `swap ${index} was not recorded as committed`);
    const witness = fixture.focusWitnesses.find((item) => item.afterActionIndex === index);
    if (event.focusBefore !== null) {
      sawFocus = true;
      assertExactTraceValue(event.focusBefore, event.focusAfter, `$.swapObservations.events[${index}].focus`);
      require(event.focusNodeReplaced === true, `swap ${index} did not replace the focused physical node`);
      require(replacement.focusCaptured === true && replacement.focusRestored === true,
        `swap ${index} did not record logical focus restoration`);
      if (witness) {
        require(focusIdentityHasKey(event.focusAfter.identity, witness.key) &&
          event.focusAfter.selectionStart === witness.selectionStart && event.focusAfter.selectionEnd === witness.selectionEnd &&
          event.focusAfter.selectionDirection === witness.selectionDirection,
        `swap ${index} lost the keyed input focus or selection witness`);
      }
    } else {
      require(replacement.focusCaptured === false && replacement.focusRestored === false,
        `swap ${index} reported focus restoration without a focused keyed input`);
      require(witness === undefined, `swap ${index} did not exercise its declared focus witness`);
    }
    require(event.fenced && event.fenced.trace, `swap ${index} lacks old-renderer callback fence evidence`);
    assertExactTraceValue(event.afterTrace, event.fenced.trace, `$.swapObservations.events[${index}].fenced.trace`);
    assertExactTraceValue(event.afterSnapshot.state, event.fenced.snapshot.state, `$.swapObservations.events[${index}].fenced.state`);
    assertExactTraceValue(event.afterSnapshot.view, event.fenced.snapshot.view, `$.swapObservations.events[${index}].fenced.view`);
    if (event.fenced.dispatch !== null) require(event.fenced.dispatch?.accepted === false && event.fenced.dispatch?.stale === true,
      `swap ${index} did not fence the retired dispatch callback`);
    require(event.fenced.stale?.accepted === false && event.fenced.stale?.stale === true,
      `swap ${index} did not fence the retired stale callback`);
    const fences = event.fenced.diagnostics?.fencedCallbacks;
    require(Array.isArray(fences) && fences.length >= 1,
      `swap ${index} did not record retired callback diagnostics`);
  }
  if (fixture.focusWitnesses.length > 0) require(sawFocus, "fixture focus witness was not exercised by a backend swap");
}

function rejectMutation(name, action, controls) {
  let rejected = false;
  try { action(); } catch { rejected = true; }
  require(rejected, `mutation control ${name} was not detected`);
  controls.push({ name, detected: true });
}

function mutationControls({ fixture, nativeTrace, browser, domSnapshots, appIR, schedule }) {
  const controls = [];
  const checkStatic = (profile) => {
    validateTrace(profile.trace, appIR);
    validateHostScript(fixture.hostScript, profile.trace);
    validateFixtureExpectations(profile.trace, fixture, appIR);
    assertTraceMatch(nativeTrace, profile.trace, { domSnapshots });
    validateActions(profile, fixture);
  };
  const react = browser.profiles.react;
  const dom = browser.profiles.dom;
  const swap = browser.profiles.swap;
  rejectMutation("react-dom-html", () => {
    const candidate = structuredClone(react.trace);
    candidate.ticks[0].dom.html += "<!-- mutated -->";
    assertTraceMatch(nativeTrace, candidate, { domSnapshots });
  }, controls);
  rejectMutation("dom-control-order", () => {
    const candidate = structuredClone(dom.trace);
    candidate.ticks[0].dom.controls.reverse();
    assertTraceMatch(nativeTrace, candidate, { domSnapshots });
  }, controls);
  const targetValueWitness = react.actions.find((item) => item.expectedMessage !== null &&
    item.targetValueAtDispatch !== item.intent.value);
  if (targetValueWitness) rejectMutation("action-target-value", () => {
    const candidate = structuredClone(react);
    const entry = candidate.actions.find((item) => item.expectedMessage !== null && item.targetValueAtDispatch !== item.intent.value);
    entry.rendererCallback.observed.value = entry.intent.value;
    validateActions(candidate, fixture);
  }, controls);
  const literalWitnessIndex = react.actions.findIndex((item) => item.expectedMessage?.name === "literal");
  if (literalWitnessIndex >= 0) rejectMutation("literal-message-vs-bound-value", () => {
    const candidate = structuredClone(react);
    candidate.actions[literalWitnessIndex].rendererCallback.message.Arg = candidate.actions[literalWitnessIndex].intent.value;
    validateActions(candidate, fixture);
  }, controls);
  rejectMutation("fixture-action-order", () => {
    const candidate = structuredClone(react);
    if (candidate.actions.length < 2) throw new Error("fixture has too few actions to reorder");
    [candidate.actions[0], candidate.actions[1]] = [candidate.actions[1], candidate.actions[0]];
    validateActions(candidate, fixture);
  }, controls);
  const disabledIndex = react.actions.findIndex((item) => item.expectedMessage === null && item.targetDisabled === true);
  if (disabledIndex >= 0) rejectMutation("disabled-reset-physical-gate", () => {
    const candidate = structuredClone(react);
    candidate.actions[disabledIndex].targetDisabled = false;
    validateActions(candidate, fixture);
  }, controls);
  rejectMutation("swap-added-tick", () => {
    const candidate = structuredClone(swap);
    candidate.swapObservations.events[0].afterTrace.ticks.push(structuredClone(candidate.trace.ticks.at(-1)));
    validateSwapObservations(candidate, nativeTrace, fixture, domSnapshots, schedule);
  }, controls);
  rejectMutation("missing-swap-observation", () => {
    const candidate = structuredClone(swap);
    candidate.swapObservations.events.pop();
    validateSwapObservations(candidate, nativeTrace, fixture, domSnapshots, schedule);
  }, controls);
  rejectMutation("old-root-after-swap", () => {
    const candidate = structuredClone(swap);
    candidate.swapObservations.events[0].oldRootDetached = false;
    validateSwapObservations(candidate, nativeTrace, fixture, domSnapshots, schedule);
  }, controls);
  rejectMutation("swap-backend-order", () => {
    const candidate = structuredClone(swap);
    candidate.swapObservations.events[0].to.backend = candidate.swapObservations.events[0].from.backend;
    validateSwapObservations(candidate, nativeTrace, fixture, domSnapshots, schedule);
  }, controls);
  if (fixture.hostScript.steps.length > 0) {
    rejectMutation("effect-reorder-rejection", () => {
      const candidate = structuredClone(swap);
      candidate.reorderControls[0].rejected = false;
      validateEffectEvidence(candidate, fixture, domSnapshots);
    }, controls);
    rejectMutation("effect-reply-before-request", () => {
      const candidate = structuredClone(swap.trace);
      const completionIndex = candidate.ticks.findIndex((tick) => tick.completedEffects.length > 0);
      if (completionIndex < 1) throw new Error("fixture has no post-request completion tick to reorder");
      const completion = candidate.ticks[completionIndex].completedEffects.shift();
      candidate.ticks[0].completedEffects.push(completion);
      validateTrace(candidate, appIR);
    }, controls);
    rejectMutation("effect-completion-correlation", () => {
      const candidate = structuredClone(swap.trace);
      const completed = candidate.ticks.flatMap((tick) => tick.completedEffects)[0];
      completed.dispatchId = "dispatch-reordered";
      validateHostScript(fixture.hostScript, candidate);
    }, controls);
  }
  return controls;
}

/** Compare native/direct application ticks to mounted React, DOM, and alternating renderer evidence. */
export function checkBackendConformance({ appIR, fixture, nativeTrace, directTrace, browserEvidence, schedule = browserEvidence?.schedule, pins = null }) {
  for (const [name, trace] of [["native", nativeTrace], ["direct", directTrace]]) {
    validateTrace(trace, appIR);
    validateHostScript(fixture.hostScript, trace);
    validateFixtureExpectations(trace, fixture, appIR);
    require(trace.ticks.every((tick) => tick.dom === null), `${name} trace must keep dom:null`);
  }
  assertExactTraceValue(nativeTrace, directTrace, "$.native-vs-direct");
  const domSnapshots = expectedDOMSnapshots(fixture);
  require(browserEvidence?.schema === "gobi.backend-browser-conformance/v1", "browser evidence has an unknown schema");
  for (const backend of ["react", "dom", "swap"]) {
    const profile = browserEvidence.profiles?.[backend];
    require(profile, `browser evidence is missing ${backend} profile`);
    validateTrace(profile.trace, appIR);
    validateHostScript(fixture.hostScript, profile.trace);
    validateFixtureExpectations(profile.trace, fixture, appIR);
    assertExactTraceValue(domSnapshots, profile.trace.ticks.map((tick) => tick.dom), `$.profiles.${backend}.domOracle`);
    assertTraceMatch(nativeTrace, profile.trace, { domSnapshots });
    validateActions(profile, fixture);
    validateEffectEvidence(profile, fixture, domSnapshots);
    if (backend !== "swap") {
      validateUnmount(profile.unmount, `profiles.${backend}.unmount`);
      require(profile.swapObservations?.events?.length === 0, `${backend} static profile unexpectedly recorded swaps`);
    }
  }
  validateSwapObservations(browserEvidence.profiles.swap, nativeTrace, fixture, domSnapshots, schedule);
  validateUnmount(browserEvidence.unmount, "swap.unmount");
  const controls = mutationControls({ fixture, nativeTrace, browser: browserEvidence, domSnapshots, appIR, schedule });
  return {
    schema: "gobi.backend-conformance-check/v1",
    status: "matched",
    fixture: fixture.name,
    appId: nativeTrace.appId,
    ticks: nativeTrace.ticks.length,
    backends: { react: "matched", dom: "matched", alternatingSwap: "matched" },
    swaps: browserEvidence.profiles.swap.swapObservations.events.length,
    focusSwaps: browserEvidence.profiles.swap.swapObservations.focusAcrossSwap.length,
    effectRequests: fixture.hostScript.steps.length,
    mutationControls: controls,
    mutationControlsDetected: controls.length,
    pins,
  };
}
