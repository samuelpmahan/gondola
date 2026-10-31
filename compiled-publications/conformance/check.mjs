import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { encodeFixtureState } from "../../compiled-frontend/conformance/fixture-expectations.mjs";

const SCENARIO_SCHEMA = "gobi.compiled-publications-scenario/v1";
const NATIVE_SCHEMA = "gobi.compiled-publications-native/v1";
const DIRECT_SCHEMA = "gobi.compiled-publications-direct/v1";
const CHECK_SCHEMA = "gobi.compiled-publications-conformance-check/v1";
const NO_WASM_GUARD_ENTRIES = [
  { name: "WebAssembly.compile", kind: "function", status: "installed" },
  { name: "WebAssembly.compileStreaming", kind: "function", status: "installed" },
  { name: "WebAssembly.instantiate", kind: "function", status: "installed" },
  { name: "WebAssembly.instantiateStreaming", kind: "function", status: "installed" },
  { name: "WebAssembly.validate", kind: "function", status: "installed" },
  { name: "WebAssembly.Module", kind: "constructor", status: "installed" },
  { name: "WebAssembly.Instance", kind: "constructor", status: "installed" },
  { name: "WebAssembly.Memory", kind: "constructor", status: "installed" },
  { name: "WebAssembly.Table", kind: "constructor", status: "installed" },
  { name: "WebAssembly.Global", kind: "constructor", status: "installed" },
];

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return structuredClone(value);
}

function normalizeAction(event) {
  if (event?.action && typeof event.action === "object") return event.action;
  if (typeof event?.path === "string" && typeof event?.event === "string") {
    return { path: event.path, event: event.event, value: typeof event.value === "string" ? event.value : "" };
  }
  return null;
}

function actualEventMessage(event) {
  if (event.kind === "effect-reply") return { name: "complete", arg: event.token };
  if (event.kind === "click" || event.kind === "go-message") return event.message ? clone(event.message) : null;
  return null;
}

function effectListFromTick(requestedEffects) {
  return requestedEffects.map(({ effect }) => clone(effect));
}

function assertLiteralMilestones(expectations) {
  const stateAfter = (eventIndex) => expectations.stateProjections[expectations.events[eventIndex].stateIndex].state;
  const captured = stateAfter(3);
  assertExactTraceValue({ ID: 1, Key: "oak", ParentGeneration: 1, ChildGeneration: 2, InputRevision: 2, Value: 4 },
    captured.Publications[0], "$.oracle.snapshotAtCapture");
  const edited = stateAfter(4);
  assertExactTraceValue(7, edited.Children.find((item) => item.Key === "oak").Counter.Count, "$.oracle.laterChildCount");
  assertExactTraceValue(4, edited.Publications[0].Value, "$.oracle.capturedValueAfterEdit");
  assertExactTraceValue("accepted:oak:3", stateAfter(18).LastDecision, "$.oracle.outOfOrderFirstAccepted");
  assertExactTraceValue("rejected:stale-id:2", stateAfter(19).LastDecision, "$.oracle.outOfOrderSecondRejected");
  assertExactTraceValue("rejected:stale-input:1", stateAfter(21).LastDecision, "$.oracle.staleInputRejected");
  assertExactTraceValue("rejected:child-generation:5", stateAfter(35).LastDecision, "$.oracle.staleChildGenerationRejected");
  assertExactTraceValue("accepted:elm:6", stateAfter(37).LastDecision, "$.oracle.freshChildGenerationAccepted");
  const removed = stateAfter(42);
  require(removed.Parent.Alive === false && removed.Children.length === 0,
    "literal parent-removal checkpoint must retire the parent and empty the children");
  assertExactTraceValue([{ ID: 7, Key: "oak", ParentGeneration: 1, ChildGeneration: 2, InputRevision: 5, Value: 9 }],
    removed.Publications, "$.oracle.queueRetainedAcrossRemoval");
  const remounted = stateAfter(43);
  require(remounted.Parent.Alive === true && remounted.Parent.Generation === 5 && remounted.Children.length === 0,
    "literal parent-remount checkpoint must use a fresh generation and empty children");
  assertExactTraceValue(removed.Publications, remounted.Publications, "$.oracle.queueRetainedAcrossRemount");
  assertExactTraceValue("rejected:parent-generation:7", stateAfter(46).LastDecision, "$.oracle.staleParentGenerationRejected");
  assertExactTraceValue("accepted:oak:8", stateAfter(47).LastDecision, "$.oracle.newLifetimePublicationAccepted");
}

function assertFixtureAndOracle(fixture, expectations) {
  assertExactTraceValue(SCENARIO_SCHEMA, fixture?.schema, "$.fixture.schema");
  assertExactTraceValue("gobi.compiled-publications-oracle-expectations/v1", expectations?.schema, "$.expectations.schema");
  assertExactTraceValue({
    schema: fixture.schema,
    name: fixture.name,
    packagePath: fixture.packagePath,
    componentID: fixture.componentID,
    eventCount: fixture.events?.length,
  }, expectations.scenario, "$.expectations.scenario");
  require(Array.isArray(fixture.events) && Array.isArray(expectations.events), "scenario/oracle event tables must be arrays");
  require(fixture.events.length === expectations.events.length, "fixture and independent oracle event counts differ");
  require(fixture.events.length === 50, "fixed publications script must contain 50 source events");
  require(expectations.stateProjections?.length === 46, "literal oracle must contain init plus all 45 Go state checkpoints");
  assertLiteralMilestones(expectations);
  let stateIndex = 0;
  let stepIndex = 0;
  for (let index = 0; index < fixture.events.length; index += 1) {
    const source = fixture.events[index];
    const expected = expectations.events[index];
    const hasGoStep = ["click", "go-message", "effect-reply"].includes(source.kind);
    if (hasGoStep) stateIndex += 1;
    assertExactTraceValue(index, expected.eventIndex, `$.expectations.events[${index}].eventIndex`);
    assertExactTraceValue(source.kind, expected.kind, `$.expectations.events[${index}].kind`);
    assertExactTraceValue(hasGoStep ? stepIndex++ : null, expected.stepIndex, `$.expectations.events[${index}].stepIndex`);
    assertExactTraceValue(stateIndex, expected.stateIndex, `$.expectations.events[${index}].stateIndex`);
    assertExactTraceValue(normalizeAction(source), expected.action, `$.expectations.events[${index}].action`);
    assertExactTraceValue(source.message ? clone(source.message) : null, expected.scenarioMessage,
      `$.expectations.events[${index}].scenarioMessage`);
    assertExactTraceValue(actualEventMessage(source), expected.message,
      `$.expectations.events[${index}].message`);
    assertExactTraceValue(source.expect ?? null, expected.expect ?? null, `$.expectations.events[${index}].expect`);
    for (const key of ["path", "event", "value", "token", "from", "to", "target"]) {
      assertExactTraceValue(source[key] ?? null, expected[key] ?? null, `$.expectations.events[${index}].${key}`);
    }
    if (source.sourceEvent !== undefined) {
      assertExactTraceValue(source.sourceEvent, expected.sourceEvent, `$.expectations.events[${index}].sourceEvent`);
    }
    if (source.kind === "renderer-swap") {
      const probe = source.expect === "accepted" ? expectations.probes.compatibleSwap : expectations.probes.incompatibleSwap;
      assertExactTraceValue({ eventIndex: index, from: source.from, to: source.to, target: source.target, expect: source.expect },
        { eventIndex: probe.eventIndex, from: probe.from, to: probe.to, target: probe.target, expect: probe.expect },
        `$.expectations.events[${index}].rendererCandidate`);
    }
    if (source.kind === "effect-reply") {
      assertExactTraceValue(source.token, expected.message?.arg, `$.expectations.events[${index}].effectReplyToken`);
    }
  }
}

function assertBuildContract({ reactAppIR, domAppIR, fixture }) {
  assertExactTraceValue(reactAppIR, domAppIR, "$.reactDom.appIR");
  const component = reactAppIR?.components?.find((item) => item.id === fixture.componentID);
  require(component?.packagePath === fixture.packagePath, "AppIR component identity differs from the fixture");
  require(typeof component.stateType === "string", "AppIR component state type is missing");
  for (const capability of ["view.node", "effect.request-reply", "effect.cancel"]) {
    require(component.capabilities?.includes(capability), `AppIR is missing required host capability ${capability}`);
  }
  const update = reactAppIR.symbols?.find((item) => item.id === component.update);
  require(Array.isArray(update?.signature?.results) && update.signature.results.length === 2,
    "AppIR Update must return State and an effects slice");
  return component;
}

function assertNative(native, fixture, expectations, label = "native") {
  assertExactTraceValue(NATIVE_SCHEMA, native?.schema, `$.${label}.schema`);
  assertExactTraceValue(fixture.name, native.name, `$.${label}.name`);
  assertExactTraceValue(fixture.packagePath, native.packagePath, `$.${label}.packagePath`);
  assertExactTraceValue(fixture.componentID, native.componentID, `$.${label}.componentID`);
  const initial = expectations.initialProjection;
  assertExactTraceValue(initial.state, native.initialState, `$.${label}.initialState`);
  assertExactTraceValue(initial.view, native.initialView, `$.${label}.initialView`);
  require(Array.isArray(native.events) && native.events.length === fixture.events.length,
    `${label} source event table is missing or incomplete`);
  require(Array.isArray(native.steps) && native.steps.length === expectations.stateProjections.length - 1,
    `${label} Go step count differs from the literal event schedule`);

  for (let index = 0; index < fixture.events.length; index += 1) {
    const source = fixture.events[index];
    const expected = expectations.events[index];
    const observed = native.events[index];
    assertExactTraceValue(index, observed.index, `$.${label}.events[${index}].index`);
    assertExactTraceValue(source.kind, observed.kind, `$.${label}.events[${index}].kind`);
    assertExactTraceValue(source.path ?? null, observed.path ?? null, `$.${label}.events[${index}].path`);
    assertExactTraceValue(source.event ?? null, observed.event ?? null, `$.${label}.events[${index}].event`);
    assertExactTraceValue(source.value ?? null, observed.value ?? null, `$.${label}.events[${index}].value`);
    assertExactTraceValue(source.token ?? null, observed.token ?? null, `$.${label}.events[${index}].token`);
    assertExactTraceValue(source.from ?? null, observed.from ?? null, `$.${label}.events[${index}].from`);
    assertExactTraceValue(source.to ?? null, observed.to ?? null, `$.${label}.events[${index}].to`);
    assertExactTraceValue(source.target ?? null, observed.target ?? null, `$.${label}.events[${index}].target`);
    assertExactTraceValue(normalizeAction(source), observed.action ?? null, `$.${label}.events[${index}].action`);
    assertExactTraceValue(actualEventMessage(source), observed.message ?? null, `$.${label}.events[${index}].message`);
    assertExactTraceValue(expected.stepIndex, observed.stepIndex ?? null, `$.${label}.events[${index}].stepIndex`);
    if (source.kind === "renderer-swap") {
      assertExactTraceValue(source.expect, observed.expect, `$.${label}.events[${index}].expect`);
    }
  }

  for (let stepIndex = 0; stepIndex < native.steps.length; stepIndex += 1) {
    const step = native.steps[stepIndex];
    const expectation = expectations.events.find((item) => item.stepIndex === stepIndex);
    require(expectation, `${label} step ${stepIndex} has no literal source event`);
    const projection = expectations.stateProjections[expectation.stateIndex];
    assertExactTraceValue(expectation.eventIndex, step.eventIndex, `$.${label}.steps[${stepIndex}].eventIndex`);
    assertExactTraceValue(expectation.kind, step.kind, `$.${label}.steps[${stepIndex}].kind`);
    assertExactTraceValue(expectation.message, step.message, `$.${label}.steps[${stepIndex}].message`);
    assertExactTraceValue(expectation.effects, step.effects, `$.${label}.steps[${stepIndex}].effects`);
    assertExactTraceValue(projection.state, step.state, `$.${label}.steps[${stepIndex}].state`);
    assertExactTraceValue(projection.view, step.view, `$.${label}.steps[${stepIndex}].view`);
  }
  return true;
}

function expectedCompletion(message, effectReplies, eventIndex, expectedEvents) {
  const event = expectedEvents[eventIndex];
  if (event.kind !== "effect-reply") return [];
  const request = effectReplies.get(event.message.arg);
  require(request, `literal effect reply ${event.message.arg} has no prior request correlation`);
  return [{ dispatchId: request.dispatchId, effectIndex: request.effectIndex, message: clone(message) }];
}

function buildExpectedTickData(expectations) {
  const result = new Map();
  const requests = new Map();
  for (const event of expectations.events) {
    if (event.stepIndex === null) continue;
    const dispatchId = `dispatch-${String(event.stateIndex).padStart(4, "0")}`;
    const requestedEffects = event.effects.map((effect, effectIndex) => ({ dispatchId, effectIndex, effect: clone(effect) }));
    for (const request of requestedEffects) {
      if (request.effect.kind === "fixture.request") {
        requests.set(request.effect.arg, { dispatchId, effectIndex: request.effectIndex });
      }
    }
    const message = clone(event.message);
    const completedEffects = event.kind === "effect-reply"
      ? expectedCompletion(message, requests, event.eventIndex, expectations.events)
      : [];
    result.set(event.stateIndex, { event, dispatchId, message, requestedEffects, completedEffects });
  }
  return result;
}

function assertTraceAgainstLiteral(trace, expectations, component, types, label, { withDOM = false } = {}) {
  require(trace?.schema === "gobi.trace/v1", `${label} trace schema differs`);
  assertExactTraceValue(expectations.scenario.componentID, trace.appId, `$.${label}.appId`);
  require(Array.isArray(trace.ticks) && trace.ticks.length === expectations.stateProjections.length,
    `${label} trace tick count differs from the literal Go state checkpoints`);
  const expectedTicks = buildExpectedTickData(expectations);
  for (const projection of expectations.stateProjections) {
    const tick = trace.ticks[projection.stateIndex];
    require(tick && tick.index === projection.stateIndex, `${label} tick ${projection.stateIndex} is missing or misindexed`);
    const encodedState = encodeFixtureState(projection.state, component.stateType, types);
    assertExactTraceValue(encodedState, tick.state, `$.${label}.ticks[${projection.stateIndex}].state`);
    assertExactTraceValue(projection.viewRecord, tick.view, `$.${label}.ticks[${projection.stateIndex}].view`);
    const expected = expectedTicks.get(projection.stateIndex) ?? null;
    if (expected?.event.kind === "click") {
      assertExactTraceValue(expected.event.action, tick.action, `$.${label}.ticks[${projection.stateIndex}].action`);
    }
    assertExactTraceValue(expected?.message ?? null, tick.message, `$.${label}.ticks[${projection.stateIndex}].message`);
    assertExactTraceValue(expected?.dispatchId ?? null, tick.dispatchId, `$.${label}.ticks[${projection.stateIndex}].dispatchId`);
    assertExactTraceValue(expected?.requestedEffects ?? [], tick.requestedEffects,
      `$.${label}.ticks[${projection.stateIndex}].requestedEffects`);
    assertExactTraceValue(expected?.completedEffects ?? [], tick.completedEffects,
      `$.${label}.ticks[${projection.stateIndex}].completedEffects`);
    assertExactTraceValue(withDOM ? projection.dom : null, tick.dom, `$.${label}.ticks[${projection.stateIndex}].dom`);
  }
  return true;
}

function assertDirect(direct, fixture, expectations, component, types, label) {
  assertExactTraceValue(DIRECT_SCHEMA, direct?.schema, `$.${label}.schema`);
  assertExactTraceValue(fixture.name, direct.name, `$.${label}.name`);
  assertExactTraceValue(fixture.packagePath, direct.packagePath, `$.${label}.packagePath`);
  assertExactTraceValue(fixture.componentID, direct.componentID, `$.${label}.componentID`);
  assertTraceAgainstLiteral(direct.trace, expectations, component, types, `${label}.trace`);
  require(Array.isArray(direct.steps) && direct.steps.length === fixture.events.length,
    `${label} per-source event table is missing events`);
  const ledger = buildExpectedHostLedger(expectations);
  for (let index = 0; index < fixture.events.length; index += 1) {
    const actual = direct.steps[index];
    const expected = expectations.events[index];
    assertExactTraceValue(index, actual.eventIndex, `$.${label}.steps[${index}].eventIndex`);
    assertExactTraceValue(fixture.events[index], actual.event, `$.${label}.steps[${index}].event`);
    assertExactTraceValue(expected.action, actual.action, `$.${label}.steps[${index}].action`);
    assertExactTraceValue(expected.stepIndex, actual.stepIndex, `$.${label}.steps[${index}].stepIndex`);
    assertExactTraceValue(expected.stateIndex, actual.stateIndex, `$.${label}.steps[${index}].stateIndex`);
    assertExactTraceValue(expected.message, actual.message, `$.${label}.steps[${index}].message`);
    assertExactTraceValue(expected.effects, effectListFromTick(actual.requestedEffects), `$.${label}.steps[${index}].effects`);
    const projection = expectations.stateProjections[expected.stateIndex];
    const typedState = encodeFixtureState(projection.state, component.stateType, types);
    assertExactTraceValue(typedState, actual.state, `$.${label}.steps[${index}].state`);
    assertExactTraceValue(projection.viewRecord, actual.view, `$.${label}.steps[${index}].view`);
    if (expected.stepIndex === null) {
      assertExactTraceValue(null, actual.traceTick, `$.${label}.steps[${index}].traceTick`);
      assertExactTraceValue(actual.tickCountBefore, actual.tickCountAfter, `$.${label}.steps[${index}].tickCount`);
    }
    assertExactTraceValue(ledger.pendingAfterEvent.get(index).map(({ token, dispatchId, effectIndex }) =>
      ({ token, dispatchId, effectIndex })), actual.pending, `$.${label}.steps[${index}].pending`);
  }
  const expectedDirectRecords = ledger.records.filter((record) =>
    !(record.kind === "deliver" && record.outcome === "rejected"))
    .map((record, index) => ({ ...record, sequence: index + 1 }));
  const directProjection = direct.effectRecords.map(({ sequence, kind, dispatchId, effectIndex, token, outcome, message, target }) => ({
    sequence, kind, dispatchId, effectIndex, token, outcome,
    ...(message === undefined ? {} : { message }),
    ...(target === undefined ? {} : { target }),
  }));
  const expectedDirectProjection = expectedDirectRecords.map(({ sequence, kind, dispatchId, effectIndex, token, outcome, message, target }) => ({
    sequence, kind, dispatchId, effectIndex, token, outcome,
    ...(message === undefined ? {} : { message }),
    ...(target === undefined ? {} : { target }),
  }));
  assertExactTraceValue(expectedDirectProjection, directProjection, `$.${label}.effectRecords`);
  return true;
}

function buildExpectedHostLedger(expectations) {
  let sequence = 0;
  const requests = new Map();
  const records = [];
  const pendingAfterEvent = new Map();
  const probe = expectations.probes.cancelledOldReply;

  function append(record) {
    sequence += 1;
    records.push({ sequence, ...record });
  }

  function pendingSnapshot() {
    return [...requests.values()].filter((item) => item.status === "pending").map((item) => ({
      sequence: item.sequence,
      dispatchId: item.dispatchId,
      effectIndex: item.effectIndex,
      token: item.token,
      effect: clone(item.effect),
    }));
  }

  for (const event of expectations.events) {
    if (event.kind === "effect-reply") {
      const token = event.message.arg;
      const item = requests.get(token);
      require(item?.status === "pending", `literal host reply ${token} has no pending host request`);
      append({
        kind: "deliver",
        dispatchId: item.dispatchId,
        effectIndex: item.effectIndex,
        token,
        outcome: "accepted",
        message: { name: "complete", arg: token },
        runtimeResult: { accepted: true, dispatchId: `dispatch-${String(event.stateIndex).padStart(4, "0")}` },
      });
      item.status = "delivered";
    }

    for (let effectIndex = 0; effectIndex < event.effects.length; effectIndex += 1) {
      const effect = event.effects[effectIndex];
      const dispatchId = `dispatch-${String(event.stateIndex).padStart(4, "0")}`;
      if (effect.kind === "fixture.request") {
        require(!requests.has(effect.arg), `literal host request token repeats: ${effect.arg}`);
        const record = { sequence: sequence + 1, dispatchId, effectIndex, token: effect.arg, effect: clone(effect), status: "pending" };
        append({ kind: "request", dispatchId, effectIndex, token: effect.arg, outcome: "queued" });
        requests.set(effect.arg, record);
      } else if (effect.kind === "lifecycle.cancel") {
        const item = requests.get(effect.arg);
        require(item?.status === "pending", `literal host cancellation ${effect.arg} has no pending request`);
        append({
          kind: "cancel", dispatchId, effectIndex, token: effect.arg,
          target: { dispatchId: item.dispatchId, effectIndex: item.effectIndex }, outcome: "cancelled",
        });
        item.status = "cancelled";
      } else {
        throw new Error(`literal host ledger encountered unsupported effect ${effect.kind}`);
      }
    }

    if (probe.afterEvent === event.eventIndex) {
      const item = requests.get(probe.token);
      require(item?.status === "cancelled", `literal stale delivery token ${probe.token} was not cancelled yet`);
      append({
        kind: "deliver",
        dispatchId: item.dispatchId,
        effectIndex: item.effectIndex,
        token: probe.token,
        outcome: "rejected",
        error: "lifecycle request is cancelled",
      });
    }
    pendingAfterEvent.set(event.eventIndex, pendingSnapshot());
  }
  return { records, pendingAfterEvent, finalPending: pendingSnapshot() };
}

function hostRecordProjection(records) {
  return records.map(({ sequence, kind, dispatchId = null, effectIndex = null, token, outcome, message, target, error, runtimeResult }) => ({
    sequence, kind, dispatchId, effectIndex, token, outcome,
    ...(message === undefined ? {} : { message }),
    ...(target === undefined ? {} : { target }),
    ...(error === undefined ? {} : { error }),
    ...(runtimeResult === undefined ? {} : { runtimeResult }),
  }));
}

function assertPendingProjection(actual, expected, label) {
  assertExactTraceValue(expected, actual, label);
}

function rendererIdentity(renderer, label) {
  require(renderer && Number.isSafeInteger(renderer.id) && renderer.id > 0 &&
    typeof renderer.backend === "string" && renderer.backend.length > 0,
  `${label} renderer identity is missing or invalid`);
  return { id: renderer.id, backend: renderer.backend };
}

function callbackRendererIdentity(observed, label) {
  require(observed && Number.isSafeInteger(observed.rendererId) && observed.rendererId > 0 &&
    typeof observed.backend === "string" && observed.backend.length > 0,
  `${label} physical callback renderer identity is missing or invalid`);
  return { id: observed.rendererId, backend: observed.backend };
}

function pendingTokens(pending, label) {
  require(Array.isArray(pending), `${label} pending list is missing`);
  const tokens = pending.map((item) => item?.token);
  require(tokens.every((token) => typeof token === "string" && token.length > 0),
    `${label} contains an invalid pending token`);
  require(new Set(tokens).size === tokens.length, `${label} contains duplicate pending tokens`);
  return tokens;
}

function assertPendingBoundary(actual, expected, label) {
  assertExactTraceValue(pendingTokens(expected, `${label}.expected`),
    pendingTokens(actual, `${label}.actual`), label);
}

/** Verify active renderer identity across every source event, independently of
 * the state/tree projection checker. The swap profile records candidate
 * admission, post-event snapshots, and callback metadata separately; all must
 * agree on one live renderer instance. */
export function assertRendererLifecycle(profile, label = "browser.swap") {
  require(profile && Array.isArray(profile.events) && Array.isArray(profile.snapshots) &&
    Array.isArray(profile.swaps) && Array.isArray(profile.rendererSequence),
  `${label} renderer lifecycle capture is incomplete`);
  require(profile.snapshots.length === profile.events.length + 1,
    `${label} renderer lifecycle snapshots do not bracket every source event`);
  require(profile.events.every((event, index) => event?.eventIndex === index),
    `${label} renderer lifecycle events are missing or misindexed`);
  require(profile.rendererSequence.length >= 1, `${label} renderer candidate sequence is empty`);

  const rendererById = new Map();
  for (let index = 0; index < profile.rendererSequence.length; index += 1) {
    const identity = rendererIdentity(profile.rendererSequence[index], `${label}.rendererSequence[${index}]`);
    require(!rendererById.has(identity.id), `${label} renderer candidate IDs are not unique`);
    rendererById.set(identity.id, identity);
  }
  let active = rendererIdentity(profile.rendererSequence[0], `${label}.initialRenderer`);
  assertExactTraceValue(profile.initialBackend, active.backend, `${label}.initialBackend`);

  const swapsByEvent = new Map(profile.swaps.map((swap) => [swap?.eventIndex, swap]));
  require(swapsByEvent.size === profile.swaps.length, `${label} renderer swap event indices are duplicated`);
  const expectedSwapEventIndices = profile.events
    .filter((event) => event.event?.kind === "renderer-swap")
    .map((event) => event.eventIndex);
  assertExactTraceValue(expectedSwapEventIndices, [...swapsByEvent.keys()].sort((a, b) => a - b),
    `${label}.rendererSwapEventIndices`);

  const actionEvents = profile.events.filter((event) => event.event?.kind === "click");
  const actionByEvent = new Map((profile.actions ?? []).map((action) => [action?.eventIndex, action]));
  const dispatchByEvent = new Map((profile.observations?.dispatch ?? []).map((dispatch) => [dispatch?.eventIndex, dispatch]));
  require(actionByEvent.size === actionEvents.length,
    `${label} physical click action metadata is missing or duplicated`);
  require(dispatchByEvent.size === (profile.observations?.dispatch ?? []).length,
    `${label} dispatch metadata contains duplicate event indices`);

  for (let eventIndex = 0; eventIndex < profile.events.length; eventIndex += 1) {
    const event = profile.events[eventIndex];
    const beforeSnapshot = profile.snapshots[eventIndex];
    const afterSnapshot = profile.snapshots[eventIndex + 1];
    assertExactTraceValue(eventIndex, afterSnapshot?.eventIndex, `${label}.snapshots[${eventIndex + 1}].eventIndex`);
    assertExactTraceValue(eventIndex + 1, event.snapshotIndex, `${label}.events[${eventIndex}].snapshotIndex`);

    const operation = event.operation;
    if (event.event.kind === "renderer-swap") {
      const capturedSwap = swapsByEvent.get(eventIndex);
      require(capturedSwap, `${label} renderer swap ${eventIndex} is missing its lifecycle record`);
      assertExactTraceValue({
        eventIndex,
        to: operation?.to,
        accepted: operation?.accepted,
        errorName: operation?.error?.name ?? null,
        before: operation?.before?.renderer,
        after: operation?.after?.renderer,
      }, {
        eventIndex: capturedSwap.eventIndex,
        to: capturedSwap.to,
        accepted: capturedSwap.accepted,
        errorName: capturedSwap.error?.name ?? null,
        before: capturedSwap.before?.renderer,
        after: capturedSwap.after?.renderer,
      }, `${label}.swapRecord[${eventIndex}]`);
      assertExactTraceValue(operation?.accepted, event.event.expect === "accepted",
        `${label}.swapExpectation[${eventIndex}]`);
      assertExactTraceValue(active, rendererIdentity(capturedSwap.before?.renderer,
        `${label}.swaps[${eventIndex}].before.renderer`), `${label}.swaps[${eventIndex}].before.renderer.active`);
      assertPendingBoundary(capturedSwap.before?.pending, beforeSnapshot?.pending,
        `${label}.swaps[${eventIndex}].before.pending`);
      assertPendingBoundary(capturedSwap.after?.pending, afterSnapshot?.pending,
        `${label}.swaps[${eventIndex}].after.pending`);

      const afterIdentity = rendererIdentity(capturedSwap.after?.renderer,
        `${label}.swaps[${eventIndex}].after.renderer`);
      if (capturedSwap.accepted === true) {
        const candidates = profile.rendererSequence
          .map((renderer) => rendererIdentity(renderer, `${label}.rendererSequence.candidate`))
          .filter((renderer) => renderer.backend === capturedSwap.to);
        require(candidates.length === 1,
          `${label} accepted swap ${eventIndex} does not identify one renderer candidate for ${capturedSwap.to}`);
        assertExactTraceValue(candidates[0], afterIdentity,
          `${label}.swaps[${eventIndex}].acceptedCandidate`);
        require(afterIdentity.id !== active.id,
          `${label} accepted swap ${eventIndex} did not install a new renderer instance`);
        active = afterIdentity;
      } else {
        assertExactTraceValue(active, afterIdentity,
          `${label}.swaps[${eventIndex}].rejectedRendererRetained`);
      }
      assertExactTraceValue(active, afterIdentity, `${label}.swaps[${eventIndex}].activeAfter`);
      assertPendingBoundary(operation?.after?.pending, afterSnapshot?.pending,
        `${label}.swapOperation[${eventIndex}].after.pending`);
    } else if (event.event.kind === "disabled-action" || event.event.kind === "stale-callback") {
      if (operation?.before?.pending) {
        assertPendingBoundary(operation.before.pending, beforeSnapshot?.pending,
          `${label}.operation[${eventIndex}].before.pending`);
      }
      if (operation?.after?.pending) {
        assertPendingBoundary(operation.after.pending, afterSnapshot?.pending,
          `${label}.operation[${eventIndex}].after.pending`);
      }
    } else if (event.event.kind === "click") {
      const expectedIdentity = active;
      const callbackIdentity = rendererIdentity(callbackRendererIdentity(operation?.observed,
        `${label}.events[${eventIndex}].operation.observed`), `${label}.events[${eventIndex}].operation.callback`);
      assertExactTraceValue(expectedIdentity, callbackIdentity,
        `${label}.events[${eventIndex}].operation.activeRenderer`);
      const action = actionByEvent.get(eventIndex);
      const dispatch = dispatchByEvent.get(eventIndex);
      const snapshotOperation = operation;
      assertExactTraceValue(expectedIdentity, callbackRendererIdentity(action?.observed,
        `${label}.actions[${eventIndex}].observed`), `${label}.actions[${eventIndex}].activeRenderer`);
      assertExactTraceValue(expectedIdentity, {
        id: dispatch?.rendererId,
        backend: dispatch?.backend,
      }, `${label}.dispatch[${eventIndex}].activeRenderer`);
      assertExactTraceValue(expectedIdentity, callbackRendererIdentity(snapshotOperation?.observed,
        `${label}.events[${eventIndex}].operation.observed`),
      `${label}.events[${eventIndex}].operation.activeRenderer`);
      assertExactTraceValue(operation.action, action.action, `${label}.actions[${eventIndex}].action`);
      assertExactTraceValue(operation.action, dispatch.action, `${label}.dispatch[${eventIndex}].action`);
      assertExactTraceValue(operation.expectedMessage, action.expectedMessage,
        `${label}.actions[${eventIndex}].expectedMessage`);
      assertExactTraceValue({ Name: operation.expectedMessage?.name, Arg: operation.expectedMessage?.arg },
        dispatch.message, `${label}.dispatch[${eventIndex}].message`);
    }
  }
  return true;
}

function assertNoWasmCoverage(noWasm, label) {
  require(noWasm && Array.isArray(noWasm.apiAttempts) && noWasm.apiAttempts.length === 0,
    `${label} no-WASM API attempts are missing or nonzero`);
  require(Array.isArray(noWasm.wasmRequests) && noWasm.wasmRequests.length === 0,
    `${label} no-WASM network requests are missing or nonzero`);
  const coverage = noWasm.guardCoverage;
  require(coverage?.status === "complete" && Array.isArray(coverage.entries) &&
    Array.isArray(coverage.failures) && coverage.failures.length === 0,
  `${label} no-WASM guard coverage is incomplete or failed`);
  assertExactTraceValue(NO_WASM_GUARD_ENTRIES, coverage.entries, `${label}.noWasm.guardCoverage.entries`);
  return { status: coverage.status, entries: coverage.entries.length, failures: coverage.failures.length };
}

function assertBrowserProfile(profile, kind, fixture, expectations, component, types) {
  require(profile?.backend === kind, `browser ${kind} profile identity differs`);
  assertExactTraceValue(fixture.componentID, profile.appId, `$.browser.${kind}.appId`);
  assertTraceAgainstLiteral(profile.trace, expectations, component, types, `browser.${kind}.trace`, { withDOM: true });
  require(Array.isArray(profile.events) && profile.events.length === fixture.events.length,
    `browser ${kind} event table is incomplete`);
  require(Array.isArray(profile.snapshots) && profile.snapshots.length === fixture.events.length + 1,
    `browser ${kind} snapshots must include init and every source event`);
  const ledger = buildExpectedHostLedger(expectations);
  for (let index = 0; index < fixture.events.length; index += 1) {
    const expectedEvent = expectations.events[index];
    const observed = profile.events[index];
    const snapshot = profile.snapshots[index + 1];
    const shouldApply = kind === "swap" || !["renderer-swap", "stale-callback"].includes(fixture.events[index].kind);
    assertExactTraceValue(fixture.events[index], observed.event, `$.browser.${kind}.events[${index}].event`);
    assertExactTraceValue(index, observed.eventIndex, `$.browser.${kind}.events[${index}].eventIndex`);
    assertExactTraceValue(expectedEvent.stepIndex, observed.stepIndex, `$.browser.${kind}.events[${index}].stepIndex`);
    assertExactTraceValue(expectedEvent.stateIndex, observed.stateIndex, `$.browser.${kind}.events[${index}].stateIndex`);
    assertExactTraceValue(expectedEvent.stateIndex, snapshot.stateIndex, `$.browser.${kind}.snapshots[${index + 1}].stateIndex`);
    assertExactTraceValue(index + 1, observed.snapshotIndex, `$.browser.${kind}.events[${index}].snapshotIndex`);
    assertExactTraceValue(shouldApply, observed.applied, `$.browser.${kind}.events[${index}].applied`);
    const projection = expectations.stateProjections[expectedEvent.stateIndex];
    const typedState = encodeFixtureState(projection.state, component.stateType, types);
    const traceTick = profile.trace.ticks[expectedEvent.stateIndex];
    assertExactTraceValue(typedState, traceTick.state, `$.browser.${kind}.traceState[${index + 1}]`);
    assertExactTraceValue(projection.viewRecord, traceTick.view, `$.browser.${kind}.traceView[${index + 1}]`);
    assertExactTraceValue(projection.dom, traceTick.dom, `$.browser.${kind}.traceDOM[${index + 1}]`);
    assertExactTraceValue(projection.dom, snapshot.physicalDOM, `$.browser.${kind}.snapshots[${index + 1}].physicalDOM`);
    assertPendingProjection(ledger.pendingAfterEvent.get(index), snapshot.pending,
      `$.browser.${kind}.snapshots[${index + 1}].pending`);
  }

  const expectedClickEvents = expectations.events.filter((event) => event.kind === "click");
  require(profile.actions.length === expectedClickEvents.length, `browser ${kind} did not perform every scripted physical click`);
  for (let index = 0; index < expectedClickEvents.length; index += 1) {
    const expected = expectedClickEvents[index];
    const actual = profile.actions[index];
    assertExactTraceValue(expected.eventIndex, actual.eventIndex, `$.browser.${kind}.actions[${index}].eventIndex`);
    assertExactTraceValue(expected.action, actual.action, `$.browser.${kind}.actions[${index}].action`);
    assertExactTraceValue(expected.message, actual.observed.message ? {
      name: actual.observed.message.Name,
      arg: actual.observed.message.Arg,
    } : null, `$.browser.${kind}.actions[${index}].message`);
    require(actual.method === "HTMLElement.click" && actual.attempted === true,
      `browser ${kind} event ${expected.eventIndex} was not a real HTMLElement.click`);
  }
  for (const error of profile.pageErrors ?? []) throw new Error(`browser ${kind} page error: ${error}`);
  assertExactTraceValue(hostRecordProjection(ledger.records), hostRecordProjection(profile.effectRecords),
    `$.browser.${kind}.effectRecords`);
  assertExactTraceValue(ledger.finalPending, profile.pendingAtEnd, `$.browser.${kind}.pendingAtEnd`);
  return true;
}

function assertMutationDetected(name, mutate, validate, controls) {
  const candidate = mutate();
  let detected = false;
  try { validate(candidate); } catch { detected = true; }
  require(detected, `captured-data mutation control ${name} was not detected`);
  controls.push({ name, detected: true });
}

function findStructField(value, name, predicate = () => true) {
  if (!value || typeof value !== "object") return null;
  if (value.kind === "struct" && Array.isArray(value.fields)) {
    const field = value.fields.find((item) => item.name === name);
    if (field && predicate(field.value)) return field.value;
    for (const item of value.fields) {
      const found = findStructField(item.value, name, predicate);
      if (found) return found;
    }
  }
  if (value.kind === "slice" && Array.isArray(value.items)) {
    for (const item of value.items) {
      const found = findStructField(item, name, predicate);
      if (found) return found;
    }
  }
  return null;
}

function runMutationControls({ native, directReact, browser, fixture, expectations, component, types }) {
  const controls = [];
  assertMutationDetected("native-full-state-generation", () => {
    const candidate = clone(native);
    const capture = candidate.steps.find((item) => item.eventIndex === 3);
    capture.state.Publications[0].ChildGeneration += 1;
    return candidate;
  }, (candidate) => assertNative(candidate, fixture, expectations, "mutation.native.state"), controls);

  assertMutationDetected("native-captured-value-remains-frozen", () => {
    const candidate = clone(native);
    const afterCounterEdit = candidate.steps.find((item) => item.eventIndex === 4);
    afterCounterEdit.state.Publications[0].Value += 1;
    return candidate;
  }, (candidate) => assertNative(candidate, fixture, expectations, "mutation.native.publication-value"), controls);

  assertMutationDetected("native-input-revision", () => {
    const candidate = clone(native);
    const step = candidate.steps.find((item) => item.eventIndex === 11);
    step.state.Input.Revision += 1;
    return candidate;
  }, (candidate) => assertNative(candidate, fixture, expectations, "mutation.native.input-revision"), controls);

  assertMutationDetected("native-publication-queue-order", () => {
    const candidate = clone(native);
    const step = candidate.steps.find((item) => item.eventIndex === 16);
    [step.state.Publications[0], step.state.Publications[1]] = [step.state.Publications[1], step.state.Publications[0]];
    return candidate;
  }, (candidate) => assertNative(candidate, fixture, expectations, "mutation.native.queue-order"), controls);

  assertMutationDetected("native-ordered-go-step", () => {
    const candidate = clone(native);
    [candidate.steps[0], candidate.steps[1]] = [candidate.steps[1], candidate.steps[0]];
    return candidate;
  }, (candidate) => assertNative(candidate, fixture, expectations, "mutation.native.order"), controls);

  assertMutationDetected("direct-typed-state-captured-publication-value", () => {
    const candidate = clone(directReact);
    const tick = candidate.trace.ticks.find((item) => findStructField(item.state, "Value", (field) =>
      field?.kind === "float64" && field.float64Bits === "4010000000000000"));
    const value = findStructField(tick?.state, "Value", (field) =>
      field?.kind === "float64" && field.float64Bits === "4010000000000000");
    require(value?.kind === "float64", "mutation fixture cannot locate the typed captured publication value");
    value.float64Bits = "4019000000000000";
    return candidate;
  }, (candidate) => assertDirect(candidate, fixture, expectations, component, types, "mutation.direct.state"), controls);

  assertMutationDetected("browser-raw-physical-dom", () => {
    const candidate = { profiles: { swap: clone(browser.profiles.swap) } };
    candidate.profiles.swap.snapshots[17].physicalDOM.html += "<!-- changed -->";
    return candidate;
  }, (candidate) => assertBrowserProfile(candidate.profiles.swap, "swap", fixture, expectations, component, types), controls);

  assertMutationDetected("browser-disabled-control", () => {
    const candidate = { profiles: { react: clone(browser.profiles.react) } };
    const snapshot = candidate.profiles.react.snapshots[8];
    snapshot.physicalDOM.controls.find((control) => control.path === "1/1/1").disabled = false;
    return candidate;
  }, (candidate) => assertBrowserProfile(candidate.profiles.react, "react", fixture, expectations, component, types), controls);

  assertMutationDetected("browser-publication-button-order", () => {
    const candidate = { profiles: { react: clone(browser.profiles.react) } };
    const controls = candidate.profiles.react.snapshots[17].physicalDOM.controls.filter((item) => item.path.startsWith("3/"));
    require(controls.length >= 2, "mutation fixture cannot locate queued publication buttons");
    const allControls = candidate.profiles.react.snapshots[17].physicalDOM.controls;
    const indices = allControls.map((item, index) => item.path.startsWith("3/") ? index : -1).filter((index) => index >= 0);
    [allControls[indices[0]], allControls[indices[1]]] = [allControls[indices[1]], allControls[indices[0]]];
    return candidate;
  }, (candidate) => assertBrowserProfile(candidate.profiles.react, "react", fixture, expectations, component, types), controls);

  assertMutationDetected("browser-parent-removal-cancellation-order", () => {
    const candidate = { profiles: { swap: clone(browser.profiles.swap) } };
    const expected = expectations.probes.parentRemoval.expectedCancellationOrder;
    const rows = candidate.profiles.swap.effectRecords;
    const positions = expected.map((token) => rows.findIndex((row) => row.kind === "cancel" && row.token === token));
    require(positions.every((position) => position >= 0), "mutation fixture cannot locate literal parent-removal cancellations");
    [rows[positions[0]], rows[positions[1]]] = [rows[positions[1]], rows[positions[0]]];
    return candidate;
  }, (candidate) => assertBrowserProfile(candidate.profiles.swap, "swap", fixture, expectations, component, types), controls);

  assertMutationDetected("browser-accepted-swap-wrong-backend", () => {
    const candidate = { profiles: { swap: clone(browser.profiles.swap) } };
    const accepted = candidate.profiles.swap.swaps.find((item) => item.accepted === true);
    require(accepted, "mutation fixture cannot locate the accepted renderer candidate");
    accepted.after.renderer.backend = accepted.before.renderer.backend;
    return candidate;
  }, (candidate) => assertRendererLifecycle(candidate.profiles.swap, "mutation.browser.swap"), controls);

  assertMutationDetected("browser-accepted-swap-wrong-renderer-id", () => {
    const candidate = { profiles: { swap: clone(browser.profiles.swap) } };
    const accepted = candidate.profiles.swap.swaps.find((item) => item.accepted === true);
    require(accepted, "mutation fixture cannot locate the accepted renderer candidate");
    accepted.after.renderer.id = accepted.before.renderer.id;
    return candidate;
  }, (candidate) => assertRendererLifecycle(candidate.profiles.swap, "mutation.browser.swap"), controls);

  const swapProfile = browser.profiles.swap;
  const rejectedSwap = swapProfile.swaps.find((item) => item.accepted === false);
  const firstPostRejectionClick = rejectedSwap && swapProfile.events.find((event) =>
    event.eventIndex > rejectedSwap.eventIndex && event.event?.kind === "click");
  require(firstPostRejectionClick, "mutation fixture cannot locate a physical click after rejection");
  const acceptedSwap = swapProfile.swaps.find((item) => item.accepted === true);
  require(acceptedSwap, "mutation fixture cannot locate the retained live renderer");
  const retiredIdentity = rendererIdentity(acceptedSwap.before.renderer, "mutation.retiredRenderer");

  assertMutationDetected("browser-post-rejection-live-callback-wrong-backend", () => {
    const candidate = { profiles: { swap: clone(browser.profiles.swap) } };
    const liveEvent = candidate.profiles.swap.events[firstPostRejectionClick.eventIndex];
    liveEvent.operation.observed.backend = retiredIdentity.backend;
    candidate.profiles.swap.actions.find((item) => item.eventIndex === liveEvent.eventIndex).observed.backend = retiredIdentity.backend;
    candidate.profiles.swap.observations.dispatch.find((item) => item.eventIndex === liveEvent.eventIndex).backend = retiredIdentity.backend;
    return candidate;
  }, (candidate) => assertRendererLifecycle(candidate.profiles.swap, "mutation.browser.swap"), controls);

  assertMutationDetected("browser-post-rejection-live-callback-wrong-id", () => {
    const candidate = { profiles: { swap: clone(browser.profiles.swap) } };
    const liveEvent = candidate.profiles.swap.events[firstPostRejectionClick.eventIndex];
    liveEvent.operation.observed.rendererId = retiredIdentity.id;
    candidate.profiles.swap.actions.find((item) => item.eventIndex === liveEvent.eventIndex).observed.rendererId = retiredIdentity.id;
    candidate.profiles.swap.observations.dispatch.find((item) => item.eventIndex === liveEvent.eventIndex).rendererId = retiredIdentity.id;
    return candidate;
  }, (candidate) => assertRendererLifecycle(candidate.profiles.swap, "mutation.browser.swap"), controls);

  assertMutationDetected("browser-post-rejection-action-metadata-mismatch", () => {
    const candidate = { profiles: { swap: clone(browser.profiles.swap) } };
    const action = candidate.profiles.swap.actions.find((item) => item.eventIndex === firstPostRejectionClick.eventIndex);
    action.observed.backend = retiredIdentity.backend;
    return candidate;
  }, (candidate) => assertRendererLifecycle(candidate.profiles.swap, "mutation.browser.swap"), controls);

  assertMutationDetected("browser-no-wasm-guard-coverage-entry-removed", () => {
    const candidate = { noWasm: clone(browser.noWasm), profiles: { swap: { noWasm: clone(browser.profiles.swap.noWasm) } } };
    candidate.noWasm.guardCoverage.entries.pop();
    candidate.profiles.swap.noWasm.guardCoverage.entries.pop();
    return candidate;
  }, (candidate) => assertNoWasmCoverage(candidate.noWasm, "mutation.browser"), controls);

  return controls;
}

function assertParityTrace(left, right, label, { withDOM = true } = {}) {
  const projection = (trace) => trace.ticks.map(({ index, message, dispatchId, state, requestedEffects, completedEffects, view, dom }) =>
    ({ index, message, dispatchId, state, requestedEffects, completedEffects, view, ...(withDOM ? { dom } : {}) }));
  assertExactTraceValue(projection(left), projection(right), `$.${label}.traceParity`);
}

export function checkPublicationsConformance({ native, directReact, directDom, browser, fixture, expectations,
  reactAppIR, domAppIR }) {
  assertFixtureAndOracle(fixture, expectations);
  const component = assertBuildContract({ reactAppIR, domAppIR, fixture });
  assertNative(native, fixture, expectations);
  assertDirect(directReact, fixture, expectations, component, reactAppIR.types, "direct.react");
  assertDirect(directDom, fixture, expectations, component, domAppIR.types, "direct.dom");
  assertParityTrace(directReact.trace, directDom.trace, "direct.reactDom");

  require(browser?.schema === "gobi.compiled-publications-browser/v1", "browser capture schema differs");
  assertExactTraceValue(fixture.name, browser.fixture, "$.browser.fixture");
  const profiles = browser.profiles;
  require(profiles && typeof profiles === "object", "browser profile table is missing");
  for (const kind of ["react", "dom", "swap"]) {
    assertBrowserProfile(profiles[kind], kind, fixture, expectations, component, reactAppIR.types);
    assertParityTrace(directReact.trace, profiles[kind].trace, `browser.${kind}.direct`, { withDOM: false });
  }

  const swap = profiles.swap;
  const compatible = expectations.probes.compatibleSwap;
  const incompatible = expectations.probes.incompatibleSwap;
  const acceptedSwap = swap.swaps.find((item) => item.eventIndex === compatible.eventIndex);
  const rejectedSwap = swap.swaps.find((item) => item.eventIndex === incompatible.eventIndex);
  require(acceptedSwap?.accepted === true && rejectedSwap?.accepted === false,
    "browser swap profile did not exercise both compatible and rejected renderer candidates");
  assertExactTraceValue(compatible.pendingTokens, acceptedSwap.before.pending.map((item) => item.token),
    "$.browser.swap.compatiblePending");
  assertExactTraceValue(compatible.pendingTokens, acceptedSwap.after.pending.map((item) => item.token),
    "$.browser.swap.compatiblePendingAfter");
  assertExactTraceValue(incompatible.activeRendererAfter, rejectedSwap.after.renderer.backend,
    "$.browser.swap.rejectedActiveRenderer");
  assertExactTraceValue(incompatible.pendingTokens, rejectedSwap.after.pending.map((item) => item.token),
    "$.browser.swap.rejectedPending");
  require(rejectedSwap.error?.name === "TypeError", "incompatible renderer candidate was not rejected during admission");
  require(acceptedSwap.after.retiredCallback?.dispatch?.stale === true &&
    acceptedSwap.after.retiredCallback?.stale?.stale === true,
  "compatible renderer replacement did not fence both captured callback routes");
  assertRendererLifecycle(swap);
  const noWasmSummary = assertNoWasmCoverage(browser.noWasm, "browser");
  for (const kind of ["react", "dom", "swap"]) {
    assertExactTraceValue(browser.noWasm, profiles[kind].noWasm, `$.browser.${kind}.noWasm`);
    assertNoWasmCoverage(profiles[kind].noWasm, `browser.${kind}`);
  }

  for (const eventIndex of [6, 7]) {
    const disabled = profiles.swap.events[eventIndex];
    require(disabled?.operation?.targetBefore?.disabled === true,
      `physical disabled control event ${eventIndex} was not probed in the swap profile`);
  }
  const retiredCallback = profiles.swap.events[expectations.probes.retiredCallback.eventIndex].operation;
  require(retiredCallback?.result?.accepted === false && retiredCallback.result.stale === true,
    "retired renderer callback was not suppressed after replacement");
  const staleDelivery = swap.staleDeliveries.find((item) => item.token === expectations.probes.cancelledOldReply.token);
  require(staleDelivery?.result?.accepted === false && staleDelivery.result.outcome === "rejected",
    "cancelled old-generation effect callback was not rejected by the host");

  const parentRemoval = swap.effectRecords.filter((item) => item.kind === "cancel" &&
    expectations.probes.parentRemoval.expectedCancellationOrder.includes(item.token)).map((item) => item.token);
  assertExactTraceValue(expectations.probes.parentRemoval.expectedCancellationOrder, parentRemoval,
    "$.browser.swap.parentRemovalCancellationOrder");

  const mutationControls = runMutationControls({ native, directReact, browser, fixture, expectations, component, types: reactAppIR.types });
  return {
    schema: CHECK_SCHEMA,
    status: "matched",
    appId: fixture.componentID,
    fixture: fixture.name,
    events: fixture.events.length,
    goUpdates: native.steps.length,
    stateCheckpoints: expectations.stateProjections.length,
    publicationCheckpoints: expectations.stateProjections.filter((item) => item.state?.Publications?.length > 0).length,
    physicalClicksPerProfile: profiles.react.actions.length,
    swaps: swap.swaps.length,
    acceptedCompatibleSwaps: swap.swaps.filter((item) => item.accepted).length,
    rejectedIncompatibleSwaps: swap.swaps.filter((item) => !item.accepted).length,
    requests: swap.effectRecords.filter((item) => item.kind === "request").length,
    cancellations: swap.effectRecords.filter((item) => item.kind === "cancel").length,
    staleGenerationHostRepliesRejected: swap.staleDeliveries.length,
    disabledActionsFenced: 2,
    mutationControls,
    mutationControlsDetected: mutationControls.length,
    nativeStateCheckedAgainstLiteralOracle: true,
    directTypedStateCheckedAgainstLiteralOracle: true,
    browserRawDOMCheckedAgainstLiteralOracle: true,
    rendererLifecycleChecked: true,
    noWasmGuardCoverage: noWasmSummary,
    browserProfiles: ["react", "dom", "swap"],
    seededRuns: { count: 0, seeds: [] },
  };
}

/** Compare seeded evidence to actual native Go output and the compiled/browser
 * projections. This is bounded differential replay, not an extra literal oracle. */
export function checkSeededPublicationsReplay({ native, directReact, directDom, browser = null, fixture, seed, appIR }) {
  assertExactTraceValue(NATIVE_SCHEMA, native?.schema, "$.seed.native.schema");
  assertExactTraceValue(DIRECT_SCHEMA, directReact?.schema, "$.seed.directReact.schema");
  assertExactTraceValue(DIRECT_SCHEMA, directDom?.schema, "$.seed.directDom.schema");
  assertExactTraceValue(fixture.packagePath, native.packagePath, `$.seed.${seed}.native.packagePath`);
  assertExactTraceValue(fixture.componentID, native.componentID, `$.seed.${seed}.native.componentID`);
  require(native.name === fixture.name && native.events.length === fixture.events.length,
    `seed ${seed} native trace metadata differs from generated input`);
  let expectedStepIndex = 0;
  const expectedEvents = fixture.events.map((item, eventIndex) => {
    const hasStep = ["click", "go-message", "effect-reply"].includes(item.kind);
    return {
      index: eventIndex,
      kind: item.kind,
      path: item.path ?? null,
      event: item.event ?? null,
      value: item.value ?? null,
      action: normalizeAction(item),
      message: actualEventMessage(item),
      token: item.token ?? null,
      from: item.from ?? null,
      to: item.to ?? null,
      target: item.target ?? null,
      expect: item.expect ?? null,
      stepIndex: hasStep ? expectedStepIndex++ : null,
    };
  });
  assertExactTraceValue(expectedEvents,
    native.events.map(({ index, kind, path, event, value, action, message, token, from, to, target, expect, stepIndex }) =>
      ({ index, kind, path: path ?? null, event: event ?? null, value: value ?? null, message: message ?? null,
        action: action ?? null, token: token ?? null, from: from ?? null, to: to ?? null,
        target: target ?? null, expect: expect ?? null, stepIndex: stepIndex ?? null })),
    `$.seed.${seed}.events`);
  assertExactTraceValue(native.events.map((item) => item.index), fixture.events.map((_, index) => index),
    `$.seed.${seed}.eventOrder`);
  require(native.steps.length + 1 === directReact.trace.ticks.length && native.steps.length + 1 === directDom.trace.ticks.length,
    `seed ${seed} native/direct tick counts differ`);
  const initialExpected = encodeFixtureState(native.initialState, appIR.components[0].stateType, appIR.types);
  assertExactTraceValue(initialExpected, directReact.trace.ticks[0].state, `$.seed.${seed}.react.initialState`);
  assertExactTraceValue(initialExpected, directDom.trace.ticks[0].state, `$.seed.${seed}.dom.initialState`);
  assertExactTraceValue(native.initialView, directReact.trace.ticks[0].view.tree, `$.seed.${seed}.react.initialView`);
  assertExactTraceValue(native.initialView, directDom.trace.ticks[0].view.tree, `$.seed.${seed}.dom.initialView`);
  assertExactTraceValue(fixture.componentID, directReact.trace.appId, `$.seed.${seed}.react.appId`);
  assertExactTraceValue(fixture.componentID, directDom.trace.appId, `$.seed.${seed}.dom.appId`);
  for (let index = 0; index < native.steps.length; index += 1) {
    const nativeStep = native.steps[index];
    const sourceEventIndex = expectedEvents.findIndex((event) => event.stepIndex === index);
    require(sourceEventIndex >= 0, `seed ${seed} native step ${index} has no source event`);
    const sourceEvent = fixture.events[sourceEventIndex];
    assertExactTraceValue(sourceEventIndex, nativeStep.eventIndex, `$.seed.${seed}.native.eventIndex[${index}]`);
    assertExactTraceValue(sourceEvent.kind, nativeStep.kind, `$.seed.${seed}.native.kind[${index}]`);
    assertExactTraceValue(actualEventMessage(sourceEvent), nativeStep.message, `$.seed.${seed}.native.message[${index}]`);
    const reactTick = directReact.trace.ticks[index + 1];
    const domTick = directDom.trace.ticks[index + 1];
    const encoded = encodeFixtureState(nativeStep.state, appIR.components[0].stateType, appIR.types);
    assertExactTraceValue(encoded, reactTick.state, `$.seed.${seed}.react.state[${index}]`);
    assertExactTraceValue(encoded, domTick.state, `$.seed.${seed}.dom.state[${index}]`);
    assertExactTraceValue(nativeStep.view, reactTick.view.tree, `$.seed.${seed}.react.view[${index}]`);
    assertExactTraceValue(nativeStep.view, domTick.view.tree, `$.seed.${seed}.dom.view[${index}]`);
    assertExactTraceValue({ name: nativeStep.message.name, arg: nativeStep.message.arg }, reactTick.message,
      `$.seed.${seed}.react.message[${index}]`);
    assertExactTraceValue({ name: nativeStep.message.name, arg: nativeStep.message.arg }, domTick.message,
      `$.seed.${seed}.dom.message[${index}]`);
    assertExactTraceValue(nativeStep.effects, effectListFromTick(reactTick.requestedEffects), `$.seed.${seed}.react.effects[${index}]`);
    assertExactTraceValue(nativeStep.effects, effectListFromTick(domTick.requestedEffects), `$.seed.${seed}.dom.effects[${index}]`);
  }
  if (browser) {
    const profile = browser.profiles?.swap;
    require(profile, `seed ${seed} browser swap profile is missing`);
    require(profile.trace.ticks.length === directReact.trace.ticks.length, `seed ${seed} browser trace tick count differs`);
    const initialEncoded = encodeFixtureState(native.initialState, appIR.components[0].stateType, appIR.types);
    assertExactTraceValue(initialEncoded, profile.trace.ticks[0].state, `$.seed.${seed}.browser.initialState`);
    assertExactTraceValue(native.initialView, profile.trace.ticks[0].view.tree, `$.seed.${seed}.browser.initialView`);
    for (let index = 0; index < native.steps.length; index += 1) {
      const nativeStep = native.steps[index];
      const tick = profile.trace.ticks[index + 1];
      const encoded = encodeFixtureState(nativeStep.state, appIR.components[0].stateType, appIR.types);
      assertExactTraceValue(encoded, tick.state, `$.seed.${seed}.browser.state[${index}]`);
      assertExactTraceValue(nativeStep.view, tick.view.tree, `$.seed.${seed}.browser.view[${index}]`);
    }
    let stateIndex = 0;
    let stepIndex = 0;
    for (let eventIndex = 0; eventIndex < fixture.events.length; eventIndex += 1) {
      const event = fixture.events[eventIndex];
      const hasStep = ["click", "go-message", "effect-reply"].includes(event.kind);
      if (hasStep) stateIndex += 1;
      const observed = profile.events[eventIndex];
      const snapshot = profile.snapshots[eventIndex + 1];
      assertExactTraceValue(event, observed.event, `$.seed.${seed}.browser.event[${eventIndex}]`);
      assertExactTraceValue(hasStep ? stepIndex++ : null, observed.stepIndex, `$.seed.${seed}.browser.stepIndex[${eventIndex}]`);
      assertExactTraceValue(stateIndex, observed.stateIndex, `$.seed.${seed}.browser.stateIndex[${eventIndex}]`);
      assertExactTraceValue(stateIndex, snapshot.stateIndex, `$.seed.${seed}.browser.snapshotIndex[${eventIndex}]`);
      assertExactTraceValue(eventIndex + 1, observed.snapshotIndex, `$.seed.${seed}.browser.eventSnapshotIndex[${eventIndex}]`);
      assertExactTraceValue(profile.trace.ticks[stateIndex].dom, snapshot.physicalDOM,
        `$.seed.${seed}.browser.physicalDOM[${eventIndex}]`);
    }
    assertExactTraceValue(fixture.events.filter((event) => event.kind === "click").length, profile.actions.length,
      `$.seed.${seed}.browser.physicalClickCount`);
    for (let index = 0; index < profile.actions.length; index += 1) {
      const event = fixture.events.filter((item) => item.kind === "click")[index];
      assertExactTraceValue(normalizeAction(event), profile.actions[index].action, `$.seed.${seed}.browser.clickAction[${index}]`);
      assertExactTraceValue(event.message, { name: profile.actions[index].observed.message.Name,
        arg: profile.actions[index].observed.message.Arg }, `$.seed.${seed}.browser.clickMessage[${index}]`);
      require(profile.actions[index].method === "HTMLElement.click" && profile.actions[index].attempted === true,
        `seed ${seed} browser click ${index} was not a physical HTMLElement.click`);
    }
    const hostProjection = (records) => records.map(({ sequence, kind, dispatchId = null, effectIndex = null,
      token, outcome, target }) => ({ sequence, kind, dispatchId, effectIndex, token, outcome,
      ...(target === undefined ? {} : { target }) }));
    assertExactTraceValue(hostProjection(directReact.effectRecords), hostProjection(profile.effectRecords),
      `$.seed.${seed}.browser.hostEffectOrder`);
    assertExactTraceValue(directReact.pending, profile.pendingAtEnd.map(({ token, dispatchId, effectIndex }) =>
      ({ token, dispatchId, effectIndex })), `$.seed.${seed}.browser.pendingAtEnd`);
  }
  return {
    seed,
    events: fixture.events.length,
    goUpdates: native.steps.length,
    stateTreeDomParity: browser !== null,
    browserProfiles: browser?.profilesRun ?? [],
    mountedBrowser: browser !== null,
    oracle: "native-direct differential; no extra per-seed literal oracle",
  };
}

export { assertNative, assertDirect, assertBrowserProfile, assertTraceAgainstLiteral };
