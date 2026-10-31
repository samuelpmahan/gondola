import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { encodeFixtureState } from "../../compiled-frontend/conformance/fixture-expectations.mjs";
import {
  LIFECYCLE_EFFECTS,
  LIFECYCLE_EXPECTED_CANCEL_ORDER,
  LIFECYCLE_PROBES,
  LIFECYCLE_STEPS,
  expectedLifecycleDOM,
  expectedLifecyclePhysicalControls,
  expectedLifecycleStateAtTick,
  expectedLifecycleView,
} from "../browser/lifecycle-oracle.mjs";

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return structuredClone(value);
}

function dispatchId(tickIndex) {
  return `dispatch-${String(tickIndex).padStart(4, "0")}`;
}

function stateIndexForToken(token) {
  for (const step of LIFECYCLE_STEPS) {
    if (step.effects?.some((effect) => effect.kind === "fixture.request" && effect.arg === token)) return step.stateIndex;
  }
  throw new Error(`oracle has no request correlation for ${token}`);
}

function expectedCompletion(step) {
  if (step.kind !== "effect-reply") return [];
  const requestTick = stateIndexForToken(step.token);
  return [{
    dispatchId: dispatchId(requestTick),
    effectIndex: 0,
    message: clone(step.message),
  }];
}

function expectedTickMessage(step) {
  return step.kind === "renderer-swap" ? null : clone(step.message);
}

function expectedTickEffects(step) {
  return (step.effects ?? []).map((effect, effectIndex) => ({
    dispatchId: dispatchId(step.stateIndex),
    effectIndex,
    effect: clone(effect),
  }));
}

function assertGoTrace(trace, { appId, types, stateType, domProfile = false, label }) {
  require(trace?.schema === "gobi.trace/v1", `${label} trace schema differs`);
  assertExactTraceValue(appId, trace.appId, `$.${label}.appId`);
  require(Array.isArray(trace.ticks) && trace.ticks.length === 26, `${label} must contain 26 Go ticks`);

  const expectedStepsByTick = new Map();
  for (const step of LIFECYCLE_STEPS) if (step.kind !== "renderer-swap") expectedStepsByTick.set(step.stateIndex, step);
  for (let tickIndex = 0; tickIndex < trace.ticks.length; tickIndex += 1) {
    const tick = trace.ticks[tickIndex];
    const expectedState = expectedLifecycleStateAtTick(tickIndex);
    const encodedState = encodeFixtureState(expectedState, stateType, types);
    assertExactTraceValue(tickIndex, tick.index, `$.${label}.ticks[${tickIndex}].index`);
    assertExactTraceValue(encodedState, tick.state, `$.${label}.ticks[${tickIndex}].state`);
    assertExactTraceValue(expectedLifecycleView(expectedState), tick.view, `$.${label}.ticks[${tickIndex}].view`);
    const expectedStep = expectedStepsByTick.get(tickIndex) ?? null;
    assertExactTraceValue(expectedStep === null ? null : expectedTickMessage(expectedStep), tick.message,
      `$.${label}.ticks[${tickIndex}].message`);
    assertExactTraceValue(expectedStep === null ? null : dispatchId(tickIndex), tick.dispatchId,
      `$.${label}.ticks[${tickIndex}].dispatchId`);
    assertExactTraceValue(expectedStep === null ? [] : expectedTickEffects(expectedStep), tick.requestedEffects,
      `$.${label}.ticks[${tickIndex}].requestedEffects`);
    assertExactTraceValue(expectedStep === null ? [] : expectedCompletion(expectedStep), tick.completedEffects,
      `$.${label}.ticks[${tickIndex}].completedEffects`);
    if (domProfile) assertExactTraceValue(expectedLifecycleDOM(expectedState), tick.dom,
      `$.${label}.ticks[${tickIndex}].dom`);
    else assertExactTraceValue(null, tick.dom, `$.${label}.ticks[${tickIndex}].dom`);
  }
  return true;
}

function expectedPending(stateIndex) {
  const state = expectedLifecycleStateAtTick(stateIndex);
  const pending = [];
  for (const key of ["Parent", "Child", "Grandchild", "Sibling"]) {
    const node = state[key];
    if (!node.Pending) continue;
    const requestIndex = stateIndexForToken(node.Token);
    pending.push({ token: node.Token, dispatchId: dispatchId(requestIndex), effectIndex: 0 });
  }
  return pending;
}

function expectedRuntimePending(stateIndex) {
  const requests = new Map();
  let sequence = 0;
  for (let index = 0; index < LIFECYCLE_STEPS.length; index += 1) {
    const step = LIFECYCLE_STEPS[index];
    if (step.stateIndex > stateIndex) break;
    for (const effect of step.effects ?? []) {
      sequence += 1;
      if (effect.kind === "fixture.request") requests.set(effect.arg, { sequence, effect: clone(effect) });
    }
    if (step.kind === "effect-reply") sequence += 1;
    for (const probe of LIFECYCLE_PROBES.filter((item) => item.afterEvent === index &&
      item.expectRuntimeCompletion === "rejected-cancelled")) sequence += 1;
  }
  return expectedPending(stateIndex).map((item) => {
    const request = requests.get(item.token);
    require(request, `oracle pending token ${item.token} has no request sequence`);
    return { sequence: request.sequence, ...item, effect: request.effect };
  });
}

function expectedDirectEffectRecords() {
  const records = [];
  const requests = new Map();
  let sequence = 0;
  for (const step of LIFECYCLE_STEPS) {
    if (step.kind === "effect-reply") {
      const request = requests.get(step.token);
      require(request, `oracle effect reply ${step.token} has no request`);
      sequence += 1;
      records.push({ sequence, kind: "deliver", ...request, token: step.token,
        outcome: "accepted", message: clone(step.message) });
    }
    for (let effectIndex = 0; effectIndex < (step.effects ?? []).length; effectIndex += 1) {
      const effect = step.effects[effectIndex];
      const token = effect.arg;
      sequence += 1;
      if (effect.kind === "fixture.request") {
        const request = { dispatchId: dispatchId(step.stateIndex), effectIndex: 0 };
        requests.set(token, request);
        records.push({ sequence, kind: "request", ...request, token, outcome: "queued" });
      } else if (effect.kind === "lifecycle.cancel") {
        const target = requests.get(token);
        require(target, `oracle cancellation ${token} has no originating request`);
        records.push({ sequence, kind: "cancel", dispatchId: dispatchId(step.stateIndex), effectIndex,
          token, target: clone(target), outcome: "cancelled" });
      } else {
        throw new Error(`oracle has unsupported lifecycle effect ${effect.kind}`);
      }
    }
  }
  return records;
}

function assertNative(native, fixture, label = "native") {
  require(native?.schema === "gobi.compiled-lifecycle-native/v1", `${label} native schema differs`);
  assertExactTraceValue(fixture.name, native.name, `$.${label}.name`);
  assertExactTraceValue(fixture.packagePath, native.packagePath, `$.${label}.packagePath`);
  assertExactTraceValue(fixture.componentID, native.componentID, `$.${label}.componentID`);
  assertExactTraceValue(expectedLifecycleStateAtTick(0), native.initialState, `$.${label}.initialState`);
  require(Array.isArray(native.steps) && native.steps.length === LIFECYCLE_STEPS.length,
    `${label} native must contain all 26 scripted events`);

  for (let index = 0; index < LIFECYCLE_STEPS.length; index += 1) {
    const expected = LIFECYCLE_STEPS[index];
    const actual = native.steps[index];
    assertExactTraceValue(index, actual.index, `$.${label}.steps[${index}].index`);
    assertExactTraceValue(expected.kind, actual.kind, `$.${label}.steps[${index}].kind`);
    assertExactTraceValue(expected.kind === "renderer-swap" ? null : expected.message, actual.message,
      `$.${label}.steps[${index}].message`);
    assertExactTraceValue(expected.effects ?? [], actual.effects, `$.${label}.steps[${index}].effects`);
    assertExactTraceValue(expectedLifecycleStateAtTick(expected.stateIndex), actual.state,
      `$.${label}.steps[${index}].state`);
    assertExactTraceValue(expectedLifecycleView(expectedLifecycleStateAtTick(expected.stateIndex)).tree, actual.view,
      `$.${label}.steps[${index}].view`);
    if (expected.kind === "renderer-swap") {
      assertExactTraceValue({ from: expected.from, to: expected.to, target: expected.target }, actual.rendererSwap,
        `$.${label}.steps[${index}].rendererSwap`);
      assertExactTraceValue("state-preserved", actual.outcome, `$.${label}.steps[${index}].outcome`);
    } else if (expected.expect !== undefined) {
      const expectedOutcome = expected.kind === "effect-reply"
        ? (expected.expect === "accepted" ? "go-accepted" : "go-no-op")
        : expected.expect;
      assertExactTraceValue(expectedOutcome, actual.outcome, `$.${label}.steps[${index}].outcome`);
    }
  }
  return true;
}

function assertDirect(direct, fixture, appId, types, stateType, label = "direct") {
  require(direct?.schema === "gobi.compiled-lifecycle-direct/v1", `${label} output schema differs`);
  assertExactTraceValue(fixture.name, direct.name, `$.${label}.name`);
  assertExactTraceValue(fixture.packagePath, direct.packagePath, `$.${label}.packagePath`);
  assertExactTraceValue(fixture.componentID, direct.componentID, `$.${label}.componentID`);
  assertExactTraceValue(appId, direct.appId, `$.${label}.appId`);
  assertGoTrace(direct.trace, { appId, types, stateType, label: `${label}.trace` });
  require(Array.isArray(direct.steps) && direct.steps.length === LIFECYCLE_STEPS.length,
    `${label} direct replay must contain 26 events`);
  for (let index = 0; index < LIFECYCLE_STEPS.length; index += 1) {
    const expected = LIFECYCLE_STEPS[index];
    const actual = direct.steps[index];
    const tickBefore = expected.kind === "renderer-swap" ? expected.stateIndex : expected.stateIndex - 1;
    assertExactTraceValue(index, actual.eventIndex, `$.${label}.steps[${index}].eventIndex`);
    assertExactTraceValue(fixture.events[index], actual.event, `$.${label}.steps[${index}].event`);
    assertExactTraceValue(expected.kind === "renderer-swap" ? null : expected.message, actual.message,
      `$.${label}.steps[${index}].message`);
    assertExactTraceValue(expected.effects ? expectedTickEffects(expected) : [], actual.requestedEffects,
      `$.${label}.steps[${index}].requestedEffects`);
    assertExactTraceValue(tickBefore, actual.tickBefore, `$.${label}.steps[${index}].tickBefore`);
    assertExactTraceValue(expected.stateIndex, actual.tickAfter, `$.${label}.steps[${index}].tickAfter`);
    assertExactTraceValue(encodeFixtureState(expectedLifecycleStateAtTick(expected.stateIndex), stateType, types), actual.state,
      `$.${label}.steps[${index}].state`);
    assertExactTraceValue(expectedLifecycleView(expectedLifecycleStateAtTick(expected.stateIndex)), actual.view,
      `$.${label}.steps[${index}].view`);
    assertExactTraceValue(expected.kind === "renderer-swap" ? null : direct.trace.ticks[expected.stateIndex], actual.traceTick,
      `$.${label}.steps[${index}].traceTick`);
    assertExactTraceValue(expectedPending(expected.stateIndex), actual.pending,
      `$.${label}.steps[${index}].pending`);
    if (expected.expect !== undefined) assertExactTraceValue(expected.expect, actual.outcome,
      `$.${label}.steps[${index}].outcome`);
  }
  assertExactTraceValue(expectedDirectEffectRecords(), direct.effectRecords, `$.${label}.effectRecords`);
  assertExactTraceValue([], direct.pending, `$.${label}.pending`);
  return true;
}

function expectedBrowserEffectRecords() {
  const records = [];
  const requests = new Map();
  let sequence = 0;
  for (let index = 0; index < LIFECYCLE_STEPS.length; index += 1) {
    const step = LIFECYCLE_STEPS[index];
    for (let effectIndex = 0; effectIndex < (step.effects ?? []).length; effectIndex += 1) {
      const effect = step.effects[effectIndex];
      const token = effect.arg;
      sequence += 1;
      if (effect.kind === "fixture.request") {
        const request = { dispatchId: dispatchId(step.stateIndex), effectIndex: 0 };
        requests.set(token, request);
        records.push({ sequence, kind: "request", ...request, token, outcome: "queued" });
      } else if (effect.kind === "lifecycle.cancel") {
        const target = requests.get(token);
        require(target, `oracle cancellation ${token} has no request`);
        records.push({ sequence, kind: "cancel", dispatchId: dispatchId(step.stateIndex), effectIndex,
          token, target: clone(target), outcome: "cancelled" });
      }
    }
    for (const probe of LIFECYCLE_PROBES.filter((item) => item.afterEvent === index && item.expectRuntimeCompletion === "rejected-cancelled")) {
      const request = requests.get(probe.token);
      require(request, `cancelled probe ${probe.token} has no request`);
      sequence += 1;
      records.push({ sequence, kind: "force-deliver-retired", ...request, token: probe.token,
        outcome: "rejected", message: { name: "complete", arg: probe.token },
        runtimeResult: { accepted: false, error: "unknown or extra effect completion" } });
    }
    if (step.kind === "effect-reply") {
      const request = requests.get(step.token);
      require(request, `oracle delivery ${step.token} has no request`);
      sequence += 1;
      records.push({ sequence, kind: "deliver", ...request, token: step.token, outcome: "accepted",
        message: clone(step.message), runtimeResult: { accepted: true, dispatchId: dispatchId(step.stateIndex) } });
    }
  }
  return records;
}

function expectedSwapEvents(schedule) {
  const expected = [];
  let current = schedule.initialBackend;
  for (let eventIndex = 0; eventIndex < LIFECYCLE_STEPS.length; eventIndex += 1) {
    const step = LIFECYCLE_STEPS[eventIndex];
    if (step.kind === "renderer-swap") {
      expected.push({ reason: `fixture-renderer-swap-${eventIndex}`, from: current, to: step.to });
      current = step.to;
    } else if (step.kind === "click") {
      const next = schedule.backends.find((backend) => backend !== current);
      expected.push({ reason: `alternate-after-click-${eventIndex}`, from: current, to: next });
      current = next;
    }
  }
  return expected;
}

function assertSwapRecord(record, expected, index, label) {
  assertExactTraceValue(expected.reason, record.reason, `$.${label}.swaps[${index}].reason`);
  assertExactTraceValue(expected.from, record.from.backend, `$.${label}.swaps[${index}].from.backend`);
  assertExactTraceValue(expected.to, record.to.backend, `$.${label}.swaps[${index}].to.backend`);
  assertExactTraceValue(index + 2, record.to.id, `$.${label}.swaps[${index}].to.id`);
  assertExactTraceValue(record.before.trace.ticks, record.after.trace.ticks, `$.${label}.swaps[${index}].trace`);
  assertExactTraceValue(record.before.snapshot.state, record.after.snapshot.state, `$.${label}.swaps[${index}].state`);
  assertExactTraceValue(record.before.snapshot.view, record.after.snapshot.view, `$.${label}.swaps[${index}].view`);
  assertExactTraceValue(record.before.pending, record.after.pending, `$.${label}.swaps[${index}].pending`);
  assertExactTraceValue(record.before.effectRecords, record.after.effectRecords, `$.${label}.swaps[${index}].effectRecords`);
  require(record.after.oldRootDetached === true && record.after.oldRootEmptyDuringSwap === true,
    `${label} swap ${index} did not detach and empty the retired root`);
  const stale = record.after.retiredCallbacks;
  require(stale && stale.rendererId === record.from.id, `${label} swap ${index} lacks retired callback provenance`);
  if (expected.reason.startsWith("fixture-renderer-swap-")) {
    assertExactTraceValue(false, stale.eligible, `$.${label}.swaps[${index}].callbackEligibility`);
    assertExactTraceValue("retired renderer had no user action callback to retain", stale.reason,
      `$.${label}.swaps[${index}].callbackEligibilityReason`);
    assertExactTraceValue(null, stale.action, `$.${label}.swaps[${index}].callbackAction`);
    assertExactTraceValue(stale.before.trace, stale.after.trace, `$.${label}.swaps[${index}].noCallbackTrace`);
    assertExactTraceValue(stale.before.snapshot, stale.after.snapshot, `$.${label}.swaps[${index}].noCallbackSnapshot`);
    assertExactTraceValue(stale.before.diagnostics.fencedCallbacks, stale.after.diagnostics.fencedCallbacks,
      `$.${label}.swaps[${index}].noCallbackDiagnostics`);
  } else {
    assertExactTraceValue(true, stale.eligible, `$.${label}.swaps[${index}].callbackEligibility`);
    require(stale.dispatch?.accepted === false && stale.dispatch?.stale === true &&
      stale.stale?.accepted === false && stale.stale?.stale === true,
    `${label} swap ${index} did not fence both retired callbacks`);
    assertExactTraceValue([
      { generation: record.from.id, kind: "dispatch" },
      { generation: record.from.id, kind: "stale" },
    ], stale.after.diagnostics.fencedCallbacks.slice(stale.before.diagnostics.fencedCallbacks.length)
      .map(({ generation, kind }) => ({ generation, kind })), `$.${label}.swaps[${index}].fenceDiagnostics`);
  }
}

function assertBrowserProfile(profile, kind, { fixture, appId, types, stateType, schedule, label = `browser.${kind}` }) {
  require(profile?.backend === kind, `${label} backend label differs`);
  assertExactTraceValue(appId, profile.componentId, `$.${label}.componentId`);
  assertExactTraceValue(fixture.componentID, profile.appId, `$.${label}.appId`);
  assertGoTrace(profile.trace, { appId, types, stateType, domProfile: true, label: `${label}.trace` });
  require(Array.isArray(profile.events) && profile.events.length === LIFECYCLE_STEPS.length,
    `${label} must cover all 26 fixture events`);
  require(Array.isArray(profile.actions) && profile.actions.length === 16, `${label} must record all 16 physical clicks`);
  require(Array.isArray(profile.snapshots) && profile.snapshots.length === 27, `${label} must contain 27 initial/event snapshots`);

  const snapshotsByState = new Map();
  for (let index = 0; index < profile.snapshots.length; index += 1) {
    const actual = profile.snapshots[index];
    const stateIndex = index === 0 ? 0 : LIFECYCLE_STEPS[index - 1].stateIndex;
    const state = expectedLifecycleStateAtTick(stateIndex);
    const expectedDOM = expectedLifecycleDOM(state);
    assertExactTraceValue(stateIndex, actual.stateIndex, `$.${label}.snapshots[${index}].stateIndex`);
    assertExactTraceValue(stateIndex, actual.traceTickIndex, `$.${label}.snapshots[${index}].traceTickIndex`);
    assertExactTraceValue(profile.trace.ticks[stateIndex], actual.traceTick, `$.${label}.snapshots[${index}].traceTick`);
    assertExactTraceValue(expectedDOM, actual.runtimeSnapshot.dom, `$.${label}.snapshots[${index}].runtimeDOM`);
    assertExactTraceValue(expectedDOM, actual.rendererSnapshot, `$.${label}.snapshots[${index}].rendererDOM`);
    assertExactTraceValue(expectedDOM, actual.physicalDOM, `$.${label}.snapshots[${index}].physicalDOM`);
    assertExactTraceValue(expectedDOM, actual.expectedDOM, `$.${label}.snapshots[${index}].literalDOM`);
    snapshotsByState.set(stateIndex, actual);
  }

  let clickIndex = 0;
  for (let eventIndex = 0; eventIndex < LIFECYCLE_STEPS.length; eventIndex += 1) {
    const expected = LIFECYCLE_STEPS[eventIndex];
    const actual = profile.events[eventIndex];
    assertExactTraceValue(eventIndex, actual.eventIndex, `$.${label}.events[${eventIndex}].eventIndex`);
    assertExactTraceValue(fixture.events[eventIndex], actual.event, `$.${label}.events[${eventIndex}].event`);
    assertExactTraceValue(expected.stateIndex, actual.stateIndex, `$.${label}.events[${eventIndex}].stateIndex`);
    assertExactTraceValue(expected.stateIndex + 1, actual.traceTickCount, `$.${label}.events[${eventIndex}].traceTickCount`);
    if (expected.kind === "click") {
      const action = profile.actions[clickIndex];
      const expectedControl = expectedLifecyclePhysicalControls(expectedLifecycleStateAtTick(expected.stateIndex - 1))
        .find((control) => control.path === expected.action.path);
      require(expectedControl, `${label} click ${clickIndex} has no literal physical control`);
      assertExactTraceValue(eventIndex, action.eventIndex, `$.${label}.actions[${clickIndex}].eventIndex`);
      assertExactTraceValue({ path: expected.action.path, event: expected.action.event, value: expected.action.value },
        action.action, `$.${label}.actions[${clickIndex}].action`);
      assertExactTraceValue("HTMLElement.click", action.method, `$.${label}.actions[${clickIndex}].method`);
      assertExactTraceValue(true, action.attempted, `$.${label}.actions[${clickIndex}].attempted`);
      assertExactTraceValue({ connected: true, disabled: expectedControl.disabled, value: expected.action.value,
        type: expectedControl.type, text: expectedControl.text }, action.target, `$.${label}.actions[${clickIndex}].target`);
      assertExactTraceValue(expected.message, action.expectedMessage, `$.${label}.actions[${clickIndex}].message`);
      assertExactTraceValue(expected.action, action.observed.action, `$.${label}.actions[${clickIndex}].observedAction`);
      assertExactTraceValue({ name: expected.message.name, arg: expected.message.arg },
        { name: action.observed.message.Name, arg: action.observed.message.Arg }, `$.${label}.actions[${clickIndex}].observedMessage`);
      require(action.afterTicks === action.beforeTicks + 1, `${label} action ${clickIndex} did not add one tick`);
      clickIndex += 1;
    }
  }
  require(clickIndex === 16, `${label} click coverage count differs`);

  const expectedProbes = LIFECYCLE_PROBES;
  assertExactTraceValue(expectedProbes.length, profile.probes.length, `$.${label}.probes.length`);
  for (let index = 0; index < expectedProbes.length; index += 1) {
    const expected = expectedProbes[index];
    const actual = profile.probes[index];
    for (const key of ["afterEvent", "token", "expectRuntimeCompletion"]) {
      assertExactTraceValue(expected[key], actual[key], `$.${label}.probes[${index}].${key}`);
    }
    require(actual.result?.accepted === false, `${label} probe ${expected.token} was accepted`);
    require(actual.tickCount === expected.afterEvent + 1, `${label} probe ${expected.token} tick count differs`);
  }

  assertExactTraceValue(expectedBrowserEffectRecords(), profile.effectRecords, `$.${label}.effectRecords`);
  assertExactTraceValue([], profile.pendingAtEnd, `$.${label}.pendingAtEnd`);
  if (kind === "swap") {
    const expectedSwaps = expectedSwapEvents(schedule);
    assertExactTraceValue(expectedSwaps.length, profile.swaps.length, `$.${label}.swaps.length`);
    for (let index = 0; index < expectedSwaps.length; index += 1) {
      assertSwapRecord(profile.swaps[index], expectedSwaps[index], index, label);
    }
    assertExactTraceValue([
      { id: 1, backend: schedule.initialBackend },
      ...expectedSwaps.map(({ to }, index) => ({ id: index + 2, backend: to })),
    ], profile.rendererSequence, `$.${label}.rendererSequence`);
    const fixedSwap = profile.swaps.find((item) => item.reason === `fixture-renderer-swap-${schedule.fixtureSwapEventIndex}`);
    require(fixedSwap, `${label} is missing the frozen pending-request renderer swap`);
    assertExactTraceValue(expectedRuntimePending(8), fixedSwap.before.pending, `$.${label}.fixedSwap.pendingBefore`);
    assertExactTraceValue(expectedRuntimePending(8), fixedSwap.after.pending, `$.${label}.fixedSwap.pendingAfter`);
  } else {
    assertExactTraceValue([], profile.swaps, `$.${label}.swaps`);
    assertExactTraceValue([{ id: 1, backend: kind }], profile.rendererSequence, `$.${label}.rendererSequence`);
  }

  require(Array.isArray(profile.stalePhysicalClicks) && profile.stalePhysicalClicks.length === 1,
    `${label} must physically click the retained subtree buttons once after remount`);
  const stale = profile.stalePhysicalClicks[0];
  assertExactTraceValue(10, stale.eventIndex, `$.${label}.stalePhysicalClicks.eventIndex`);
  assertExactTraceValue(6, stale.attempts.length, `$.${label}.stalePhysicalClicks.attempts.length`);
  const expectedStale = [
    ["0/1", "addParent"], ["0/2", "requestParent"], ["0/3/1", "addChild"],
    ["0/3/2", "requestChild"], ["0/3/3/1", "addGrandchild"], ["0/3/3/2", "requestGrandchild"],
  ];
  for (let index = 0; index < expectedStale.length; index += 1) {
    const [path, message] = expectedStale[index];
    const attempt = stale.attempts[index];
    assertExactTraceValue(path, attempt.path, `$.${label}.stalePhysicalClicks[${index}].path`);
    assertExactTraceValue({ name: message, arg: "" }, attempt.message, `$.${label}.stalePhysicalClicks[${index}].message`);
    assertExactTraceValue("retained-detached-HTMLElement.click", attempt.method,
      `$.${label}.stalePhysicalClicks[${index}].method`);
    assertExactTraceValue(true, attempt.attempted, `$.${label}.stalePhysicalClicks[${index}].attempted`);
    assertExactTraceValue(false, attempt.targetBefore.connected, `$.${label}.stalePhysicalClicks[${index}].targetConnected`);
    assertExactTraceValue(false, attempt.targetConnectedAfter, `$.${label}.stalePhysicalClicks[${index}].targetConnectedAfter`);
  }
  assertExactTraceValue(stale.before.trace, stale.after.trace, `$.${label}.stalePhysicalClicks.trace`);
  assertExactTraceValue(stale.before.snapshot, stale.after.snapshot, `$.${label}.stalePhysicalClicks.snapshot`);
  assertExactTraceValue(stale.before.callbacks, stale.after.callbacks, `$.${label}.stalePhysicalClicks.callbacks`);
  assertExactTraceValue(stale.before.pending, stale.after.pending, `$.${label}.stalePhysicalClicks.pending`);
  assertExactTraceValue(stale.before.effectRecords, stale.after.effectRecords, `$.${label}.stalePhysicalClicks.effectRecords`);
  assertExactTraceValue(stale.before.physicalHTML, stale.after.physicalHTML, `$.${label}.stalePhysicalClicks.physicalHTML`);
  require(profile.pageErrors.length === 0, `${label} has browser page errors`);
  const eligibleSwapCount = kind === "swap" ? profile.swaps.filter((item) => item.after.retiredCallbacks.eligible).length : 0;
  assertExactTraceValue({
    dispatch: 16 + eligibleSwapCount,
    stale: eligibleSwapCount,
  }, profile.callbackCounts, `$.${label}.callbackCounts`);
  require(profile.noWasm?.apiAttempts?.length === 0 && profile.noWasm?.wasmRequests?.length === 0,
    `${label} has WebAssembly attempts or requests`);
  require(profile.unmount?.physicalDOM?.html === "" && profile.unmount.physicalDOM.controls === 0,
    `${label} left physical DOM after unmount`);
  assertExactTraceValue({ normalization: "outerHTML-v1", html: "", controls: [] }, profile.unmount.rendererSnapshot,
    `$.${label}.unmount.rendererSnapshot`);
  return true;
}

function rejectMutation(name, mutate, validate, controls) {
  let detected = false;
  try {
    validate(mutate());
  } catch {
    detected = true;
  }
  require(detected, `mutation control ${name} was not detected`);
  controls.push({ name, detected: true });
}

export function checkLifecycleConformance({ native, direct, browser, fixture, contract, schedule,
  appIR, reactAppIR, domAppIR, helpers }) {
  assertExactTraceValue("gobi.compiled-lifecycle-conformance-contract/v1", contract.schema, "$.contract.schema");
  assertExactTraceValue(fixture.name, contract.fixture, "$.contract.fixture");
  assertExactTraceValue(fixture.packagePath, contract.packagePath, "$.contract.packagePath");
  assertExactTraceValue(fixture.componentID, contract.componentID, "$.contract.componentID");
  assertExactTraceValue(fixture.componentID, appIR.components?.[0]?.id, "$.appIR.componentID");
  assertExactTraceValue(fixture.packagePath, appIR.components?.[0]?.packagePath, "$.appIR.packagePath");
  assertExactTraceValue(appIR, reactAppIR, "$.reactBuild.appIR");
  assertExactTraceValue(appIR, domAppIR, "$.domBuild.appIR");
  const component = appIR.components[0];
  for (const capability of contract.capabilities) {
    require(component.capabilities?.includes(capability), `AppIR is missing required capability ${capability}`);
  }
  assertExactTraceValue(contract.stateType, component.stateType, "$.appIR.stateType");
  assertExactTraceValue(contract.messageType, component.messageType, "$.appIR.messageType");
  assertExactTraceValue(contract.updateResults, appIR.symbols.find((item) => item.id === component.update)?.signature?.results,
    "$.appIR.updateResults");
  assertExactTraceValue(schedule.schema, "gobi.compiled-lifecycle-swap-schedule/v1", "$.schedule.schema");
  assertNative(native, fixture);
  assertDirect(direct, fixture, fixture.componentID, appIR.types, component.stateType);

  const profiles = browser?.profiles;
  require(profiles && typeof profiles === "object", "browser profile table is missing");
  for (const kind of ["react", "dom", "swap"]) {
    assertBrowserProfile(profiles[kind], kind, { fixture, appId: fixture.componentID, types: appIR.types,
      stateType: component.stateType, schedule });
  }

  const directCore = direct.trace.ticks.map(({ index, message, dispatchId, state, requestedEffects, completedEffects, view }) =>
    ({ index, message, dispatchId, state, requestedEffects, completedEffects, view }));
  for (const kind of ["react", "dom", "swap"]) {
    const browserCore = profiles[kind].trace.ticks.map(({ index, message, dispatchId, state, requestedEffects, completedEffects, view }) =>
      ({ index, message, dispatchId, state, requestedEffects, completedEffects, view }));
    assertExactTraceValue(directCore, browserCore, `$.browser.${kind}.fullGoProjection`);
  }

  const controls = [];
  rejectMutation("native-child-first-cancel-order", () => {
    const candidate = clone(native);
    candidate.steps[9].effects.reverse();
    return candidate;
  }, (candidate) => assertNative(candidate, fixture, "mutation.native.cancelOrder"), controls);
  rejectMutation("direct-old-generation-state", () => {
    const candidate = clone(direct);
    candidate.steps[11].state.fields[2].value.fields[8].value.string = "grandchild:g1:r3";
    return candidate;
  }, (candidate) => assertDirect(candidate, fixture, fixture.componentID, appIR.types, component.stateType,
    "mutation.direct.oldState"), controls);
  rejectMutation("direct-message", () => {
    const candidate = clone(direct);
    candidate.trace.ticks[1].message.name = "addSibling";
    return candidate;
  }, (candidate) => assertDirect(candidate, fixture, fixture.componentID, appIR.types, component.stateType,
    "mutation.direct.message"), controls);
  rejectMutation("react-physical-dom", () => {
    const candidate = clone(browser);
    candidate.profiles.react.snapshots[0].physicalDOM.html += "<!-- mutated -->";
    return candidate;
  }, (candidate) => assertBrowserProfile(candidate.profiles.react, "react", { fixture, appId: fixture.componentID,
    types: appIR.types, stateType: component.stateType, schedule, label: "mutation.react.dom" }), controls);
  rejectMutation("dom-disabled-control", () => {
    const candidate = clone(browser);
    const disabled = candidate.profiles.dom.snapshots.find((item) => item.stateIndex === 8).physicalDOM.controls
      .find((item) => item.path === "0/2");
    disabled.disabled = false;
    return candidate;
  }, (candidate) => assertBrowserProfile(candidate.profiles.dom, "dom", { fixture, appId: fixture.componentID,
    types: appIR.types, stateType: component.stateType, schedule, label: "mutation.dom.disabled" }), controls);
  rejectMutation("swap-effect-correlation", () => {
    const candidate = clone(browser);
    candidate.profiles.swap.effectRecords.find((item) => item.kind === "request" && item.token === "parent:g1:r1").dispatchId = "dispatch-0004";
    return candidate;
  }, (candidate) => assertBrowserProfile(candidate.profiles.swap, "swap", { fixture, appId: fixture.componentID,
    types: appIR.types, stateType: component.stateType, schedule, label: "mutation.swap.correlation" }), controls);
  rejectMutation("remounted-detached-button", () => {
    const candidate = clone(browser);
    candidate.profiles.swap.stalePhysicalClicks[0].attempts.pop();
    return candidate;
  }, (candidate) => assertBrowserProfile(candidate.profiles.swap, "swap", { fixture, appId: fixture.componentID,
    types: appIR.types, stateType: component.stateType, schedule, label: "mutation.swap.stalePhysical" }), controls);
  rejectMutation("cancel-order-literal", () => {
    const candidate = clone(browser);
    const positions = candidate.profiles.swap.effectRecords.map((item, index) => item.kind === "cancel" ? index : -1).filter((index) => index >= 0);
    const reversed = positions.map((position) => candidate.profiles.swap.effectRecords[position]).reverse();
    positions.forEach((position, index) => { candidate.profiles.swap.effectRecords[position] = reversed[index]; });
    return candidate;
  }, (candidate) => assertBrowserProfile(candidate.profiles.swap, "swap", { fixture, appId: fixture.componentID,
    types: appIR.types, stateType: component.stateType, schedule, label: "mutation.swap.cancelOrder" }), controls);

  return {
    schema: "gobi.compiled-lifecycle-conformance-check/v1",
    status: "matched",
    appId: fixture.componentID,
    experimentLabel: contract.experimentLabel,
    fixture: fixture.name,
    events: LIFECYCLE_STEPS.length,
    ticks: 26,
    clicks: 16,
    swaps: profiles.swap.swaps.length,
    requests: 7,
    cancellations: LIFECYCLE_EXPECTED_CANCEL_ORDER.length,
    cancellationOrder: clone(LIFECYCLE_EXPECTED_CANCEL_ORDER),
    stalePhysicalClicksPerProfile: profiles.react.stalePhysicalClicks[0].attempts.length,
    stalePhysicalClicksAcrossProfiles: ["react", "dom", "swap"].reduce((sum, kind) =>
      sum + profiles[kind].stalePhysicalClicks[0].attempts.length, 0),
    retiredRendererFences: profiles.swap.swaps.reduce((sum, item) =>
      sum + item.after.retiredCallbacks.after.diagnostics.fencedCallbacks.length -
        item.after.retiredCallbacks.before.diagnostics.fencedCallbacks.length, 0),
    callbackFenceEligibleSwaps: profiles.swap.swaps.filter((item) => item.after.retiredCallbacks.eligible).length,
    callbackFenceIneligibleSwaps: profiles.swap.swaps.filter((item) => !item.after.retiredCallbacks.eligible).length,
    browserProfiles: ["react", "dom", "swap"],
    pendingSurvivedFixedSwap: clone(profiles.swap.events[8].snapshot.runtimeSnapshot.state),
    effectRecords: profiles.swap.effectRecords.length,
    mutationControls: controls,
    mutationControlsDetected: controls.filter((item) => item.detected).length,
    nativeTraceCheckedAgainstLiteralOracle: true,
    directTraceCheckedAgainstLiteralOracle: true,
    browserTracesCheckedAgainstLiteralOracle: true,
    physicalDOMCheckedAgainstLiteralOracle: true,
  };
}
