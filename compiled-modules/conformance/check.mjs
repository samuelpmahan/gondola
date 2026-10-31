import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { encodeFixtureState } from "../../compiled-frontend/conformance/fixture-expectations.mjs";
import {
  EXPECTED_EVENTS,
  expectedChildDOM,
  expectedChildView,
  expectedParentDOM,
  expectedParentView,
} from "../oracle/oracle.mjs";

const NATIVE_SCHEMA = "gobi.compiled-modules-native/v1";
const DIRECT_SCHEMA = "gobi.compiled-modules-direct/v1";

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(expected, actual, label) {
  assertExactTraceValue(expected, actual, label);
}

function canonicalMessage(message) {
  if (message === null || message === undefined) return null;
  return { name: message.name ?? message.Name, arg: message.arg ?? message.Arg ?? "" };
}

function expectedInitialBridges() {
  const input = { Step: 1, Locked: false, Revision: 1 };
  const publication = { Count: 0, Revision: 1 };
  return [
    { call: "parent.Init", input: null, publication: null },
    { call: "child.Init", input: null, publication: null },
    { call: "parent.Output", input, publication: null },
    { call: "child.Input", input, publication: null },
    { call: "child.Publication", input: null, publication },
    { call: "parent.Receive", input: null, publication },
  ];
}

function expectedBridgeSequence(row) {
  if (row.bridgeRoles.length === 0) return [];
  const empty = { input: null, publication: null };
  if (row.target === "parent") {
    return [
      { call: "parent.Update", ...empty },
      { call: "parent.Output", input: row.input, publication: null },
      { call: "child.Input", input: row.input, publication: null },
    ];
  }
  return [
    { call: "child.Update", ...empty },
    { call: "child.Publication", input: null, publication: row.publication },
    { call: "parent.Receive", input: null, publication: row.publication },
  ];
}

function expectedStepEvents() {
  return EXPECTED_EVENTS.filter((row) => row.message !== null);
}

function assertNative(native, fixture) {
  require(native?.schema === NATIVE_SCHEMA, `native trace schema must be ${NATIVE_SCHEMA}`);
  equal(fixture.name, native.name, "$.native.name");
  equal(24, fixture.events.length, "$.fixture.events.length");
  equal(24, native.events.length, "$.native.events.length");
  equal(16, native.steps.length, "$.native.steps.length");
  const initialParent = EXPECTED_EVENTS[0].parent;
  const initialChild = EXPECTED_EVENTS[0].child;
  // Initialization is separately specified rather than inferred from a runtime profile.
  equal({ Step: 1, Locked: false, Revision: 1, PublishedCount: 0, PublishedRevision: 1 }, native.initial.parentState, "$.native.initial.parentState");
  equal({ Counter: { Count: 0 }, Step: 1, Locked: false, InputRevision: 1 }, native.initial.childState, "$.native.initial.childState");
  equal(expectedParentView(native.initial.parentState), native.initial.parentView, "$.native.initial.parentView");
  equal(expectedChildView(native.initial.childState), native.initial.childView, "$.native.initial.childView");
  equal(expectedInitialBridges(), native.initial.bridges, "$.native.initial.bridges");

  const expectedRows = [];
  let updateIndex = 0;
  for (let index = 0; index < fixture.events.length; index += 1) {
    const script = fixture.events[index];
    const expected = EXPECTED_EVENTS[index];
    const captured = native.events[index];
    equal(index, captured.eventIndex, `$.native.events[${index}].eventIndex`);
    equal(script.kind, captured.kind, `$.native.events[${index}].kind`);
    equal(script.target ?? null, captured.target ?? null, `$.native.events[${index}].target`);
    equal(script.action ?? null, captured.action ?? null, `$.native.events[${index}].action`);
    equal(script.from ?? null, captured.from ?? null, `$.native.events[${index}].from`);
    equal(script.to ?? null, captured.to ?? null, `$.native.events[${index}].to`);
    equal(script.expect ?? null, captured.expect ?? null, `$.native.events[${index}].expect`);
    equal(script.sourceEvent ?? null, captured.sourceEvent ?? null, `$.native.events[${index}].sourceEvent`);
    if (Object.hasOwn(captured, "disabled")) {
      equal(expected.disabled === true, captured.disabled, `$.native.events[${index}].disabled`);
    }
    equal(expected.message, canonicalMessage(captured.message), `$.native.events[${index}].message`);
    const expectedStepIndex = expected.message === null ? null : updateIndex++;
    equal(expectedStepIndex, captured.stepIndex, `$.native.events[${index}].stepIndex`);
    if (expectedStepIndex === null) continue;
    const step = native.steps[expectedStepIndex];
    equal(index, step.eventIndex, `$.native.steps[${expectedStepIndex}].eventIndex`);
    equal(script.kind, step.kind, `$.native.steps[${expectedStepIndex}].kind`);
    equal(script.target, step.target, `$.native.steps[${expectedStepIndex}].target`);
    equal(expected.message, canonicalMessage(step.message), `$.native.steps[${expectedStepIndex}].message`);
    equal([], step.effects, `$.native.steps[${expectedStepIndex}].effects`);
    equal(expected.parent, step.parentState, `$.native.steps[${expectedStepIndex}].parentState`);
    equal(expected.child, step.childState, `$.native.steps[${expectedStepIndex}].childState`);
    equal(expectedParentView(expected.parent), step.parentView, `$.native.steps[${expectedStepIndex}].parentView`);
    equal(expectedChildView(expected.child), step.childView, `$.native.steps[${expectedStepIndex}].childView`);
    equal(expectedBridgeSequence(expected), step.bridges, `$.native.steps[${expectedStepIndex}].bridges`);
    expectedRows.push({ eventIndex: index, stepIndex: expectedStepIndex, expected });
  }
  equal(16, updateIndex, "$.native.updateCount");
  return expectedRows;
}

function typedExpectedState(side, state, moduleSide) {
  return encodeFixtureState(state, moduleSide.compiled.appIR.components[0].stateType, moduleSide.compiled.appIR.types);
}

export function assertDirect(direct, native, fixture, parentModule, childModule) {
  require(direct?.schema === DIRECT_SCHEMA, `direct trace schema must be ${DIRECT_SCHEMA}`);
  equal(fixture.name, direct.fixture, "$.direct.fixture");
  equal(fixture.events.length, direct.eventCount, "$.direct.eventCount");
  equal(typedExpectedState("parent", {
    Step: 1, Locked: false, Revision: 1, PublishedCount: 0, PublishedRevision: 1,
  }, parentModule), direct.initial.parentState, "$.direct.initial.parentState");
  equal(typedExpectedState("child", {
    Counter: { Count: 0 }, Step: 1, Locked: false, InputRevision: 1,
  }, childModule), direct.initial.childState, "$.direct.initial.childState");
  equal({ tree: native.initial.parentView, bindings: [] }, direct.initial.parentView, "$.direct.initial.parentView");
  equal({ tree: native.initial.childView, bindings: [] }, direct.initial.childView, "$.direct.initial.childView");
  equal(expectedInitialBridges(), direct.initial.bridges, "$.direct.initial.bridges");
  equal(16, direct.steps.length, "$.direct.steps.length");
  let stepIndex = 0;
  for (let index = 0; index < fixture.events.length; index += 1) {
    const script = fixture.events[index];
    const expected = EXPECTED_EVENTS[index];
    const event = direct.events[index];
    equal(index, event.eventIndex, `$.direct.events[${index}].eventIndex`);
    equal(script.kind, event.kind, `$.direct.events[${index}].kind`);
    equal(script.target ?? null, event.target ?? null, `$.direct.events[${index}].target`);
    equal(script.action ?? null, event.action ?? null, `$.direct.events[${index}].action`);
    equal(expected.message, canonicalMessage(event.message), `$.direct.events[${index}].message`);
    if (expected.message === null) {
      equal(false, event.dispatched, `$.direct.events[${index}].dispatched`);
      equal([], event.bridgeCalls, `$.direct.events[${index}].bridgeCalls`);
      continue;
    }
    equal(true, event.dispatched, `$.direct.events[${index}].dispatched`);
    const step = direct.steps[stepIndex];
    equal(stepIndex, step.stepIndex, `$.direct.steps[${stepIndex}].stepIndex`);
    equal(index, step.eventIndex, `$.direct.steps[${stepIndex}].eventIndex`);
    equal(typedExpectedState("parent", expected.parent, parentModule), step.parentState, `$.direct.steps[${stepIndex}].parentState`);
    equal(typedExpectedState("child", expected.child, childModule), step.childState, `$.direct.steps[${stepIndex}].childState`);
    equal({ tree: expectedParentView(expected.parent), bindings: [] }, step.parentView, `$.direct.steps[${stepIndex}].parentView`);
    equal({ tree: expectedChildView(expected.child), bindings: [] }, step.childView, `$.direct.steps[${stepIndex}].childView`);
    equal(expectedBridgeSequence(expected), step.bridges, `$.direct.steps[${stepIndex}].bridges`);
    stepIndex += 1;
  }
  require(stepIndex === 16, `direct updates expected 16, observed ${stepIndex}`);
  return true;
}

function snapshotStatePair(snapshot, expected, modules, label) {
  equal(typedExpectedState("parent", expected.parent, modules.parent), snapshot.parent.state, `${label}.parent.state`);
  equal(typedExpectedState("child", expected.child, modules.child), snapshot.child.state, `${label}.child.state`);
  equal(expectedParentView(expected.parent), snapshot.parent.view.tree ?? snapshot.parent.view, `${label}.parent.view`);
  equal(expectedChildView(expected.child), snapshot.child.view.tree ?? snapshot.child.view, `${label}.child.view`);
  equal(expectedParentDOM(expected.parent), snapshot.parent.dom, `${label}.parent.dom`);
  equal(expectedChildDOM(expected.child), snapshot.child.dom, `${label}.child.dom`);
}

function expectedGoCountDelta(expected) {
  const delta = { parentInit: 0, childInit: 0, parentUpdate: 0, childUpdate: 0,
    parentView: 0, childView: 0, output: 0, input: 0, publication: 0, receive: 0 };
  if (expected.message !== null) {
    delta.parentView = 1;
    delta.childView = 1;
    if (expected.target === "parent") {
      delta.parentUpdate = 1;
      delta.output = 1;
      delta.input = 1;
    } else {
      delta.childUpdate = 1;
      delta.publication = 1;
      delta.receive = 1;
    }
  }
  return delta;
}

function countDelta(before, after) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  return Object.fromEntries(keys.map((key) => [key, (after?.[key] ?? 0) - (before?.[key] ?? 0)]));
}

function normalizeRuntimeBridgeCalls(event) {
  const bridgeByKey = new Map((event.bridgeCalls ?? event.bridges ?? []).map((call) => [`${call.owner}.${call.role}`, call]));
  const rows = [];
  for (const call of event.callOrder ?? []) {
    const { owner, role } = call;
    if (!["Update", "output", "input", "publication", "receive"].includes(role)) continue;
    const row = { call: `${owner}.${role[0].toUpperCase()}${role.slice(1)}`, input: null, publication: null };
    const bridge = bridgeByKey.get(`${owner}.${role}`);
    if (role === "output") row.input = bridge?.output ?? null;
    else if (role === "input") row.input = bridge?.input ?? null;
    else if (role === "publication") row.publication = bridge?.output ?? null;
    else if (role === "receive") row.publication = bridge?.input ?? null;
    rows.push(row);
  }
  return rows;
}

function assertNoGoCalls(event, label) {
  equal([], event.bridgeCalls ?? [], `${label}.bridgeCalls`);
  equal([], event.callOrder ?? [], `${label}.callOrder`);
  equal(event.callCountsBefore, event.callCountsAfter, `${label}.callCounts`);
  equal(event.bridgeCallCountBefore, event.bridgeCallCountAfter, `${label}.bridgeCallCount`);
}

export function assertBrowserProfile(profile, kind, fixture, modules) {
  require(profile?.schema === "gobi.compiled-modules-browser-profile/v1", `${kind} profile schema is invalid`);
  equal(kind, profile.profile, `$.browser.${kind}.profile`);
  equal(24, profile.events.length, `$.browser.${kind}.events.length`);
  equal(25, profile.snapshots.length, `$.browser.${kind}.snapshots.length`);
  equal(false, profile.abiAdmission.accepted, `$.browser.${kind}.abiAdmission.accepted`);
  require(profile.abiAdmission.error?.message, `${kind} invalid ABI admission did not record a reason`);
  require(Object.values(profile.abiAdmission.roleCounts).every((count) => count === 0), `${kind} invalid ABI called a Go role`);
  require(Object.values(profile.abiAdmission.rendererFactoryCounts).every((count) => count === 0), `${kind} invalid ABI called a renderer factory`);
  equal(true, profile.abiAdmission.callerDOMUnchanged, `$.browser.${kind}.abiAdmission.callerDOMUnchanged`);
  const initialCallOrder = [
    { owner: "parent", role: "Init" }, { owner: "child", role: "Init" },
    { owner: "parent", role: "output" }, { owner: "child", role: "input" },
    { owner: "child", role: "publication" }, { owner: "parent", role: "receive" },
    { owner: "parent", role: "View" }, { owner: "child", role: "View" },
  ];
  equal(initialCallOrder.map((call, sequence) => ({ sequence, ...call })), profile.trace.initial.callOrder,
    `$.browser.${kind}.initial.callOrder`);
  equal(expectedInitialBridges().slice(2), normalizeRuntimeBridgeCalls(profile.trace.initial),
    `$.browser.${kind}.initial.bridge-order`);
  snapshotStatePair(profile.snapshots[0].snapshot, {
    parent: { Step: 1, Locked: false, Revision: 1, PublishedCount: 0, PublishedRevision: 1 },
    child: { Counter: { Count: 0 }, Step: 1, Locked: false, InputRevision: 1 },
  }, modules, `$.browser.${kind}.snapshots[0]`);
  equal(expectedParentDOM({ Step: 1, Locked: false, Revision: 1, PublishedCount: 0, PublishedRevision: 1 }),
    profile.snapshots[0].physical.parent, `$.browser.${kind}.snapshots[0].physical.parent`);
  equal(expectedChildDOM({ Counter: { Count: 0 }, Step: 1, Locked: false, InputRevision: 1 }),
    profile.snapshots[0].physical.child, `$.browser.${kind}.snapshots[0].physical.child`);
  const expectedInitialCounts = { parentInit: 1, childInit: 1, parentUpdate: 0, childUpdate: 0,
    parentView: 1, childView: 1, output: 1, input: 1, publication: 1, receive: 1 };
  equal(expectedInitialCounts, profile.snapshots[0].callCounts, `$.browser.${kind}.initial.callCounts`);
  for (let index = 0; index < EXPECTED_EVENTS.length; index += 1) {
    const expected = EXPECTED_EVENTS[index];
    const event = profile.events[index];
    equal(index, event.eventIndex, `$.browser.${kind}.events[${index}].eventIndex`);
    equal(fixture.events[index], event.sourceEvent, `$.browser.${kind}.events[${index}].sourceEvent`);
    equal(expected.message, canonicalMessage(event.message), `$.browser.${kind}.events[${index}].message`);
    const snapshot = profile.snapshots[index + 1];
    equal(index, snapshot.eventIndex, `$.browser.${kind}.snapshots[${index + 1}].eventIndex`);
    equal(profile.snapshots[index].callCounts, event.callCountsBefore, `$.browser.${kind}.events[${index}].counts-before`);
    equal(snapshot.callCounts, event.callCountsAfter, `$.browser.${kind}.events[${index}].counts-after`);
    snapshotStatePair(snapshot.snapshot, expected, modules, `$.browser.${kind}.snapshots[${index + 1}]`);
    equal(expectedParentDOM(expected.parent), snapshot.physical.parent, `$.browser.${kind}.snapshots[${index + 1}].physical.parent`);
    equal(expectedChildDOM(expected.child), snapshot.physical.child, `$.browser.${kind}.snapshots[${index + 1}].physical.child`);
    equal(snapshot.snapshot.parent.dom, snapshot.physical.parent, `$.browser.${kind}.snapshots[${index + 1}].physical-parent-parity`);
    equal(snapshot.snapshot.child.dom, snapshot.physical.child, `$.browser.${kind}.snapshots[${index + 1}].physical-child-parity`);
    equal(expectedGoCountDelta(expected), countDelta(event.callCountsBefore, event.callCountsAfter),
      `$.browser.${kind}.events[${index}].Go-call-delta`);
    if (expected.message !== null) {
      equal(true, event.dispatched, `$.browser.${kind}.events[${index}].dispatched`);
      equal(true, event.runtimeEvent?.dispatched, `$.browser.${kind}.events[${index}].runtime-dispatched`);
      equal(expectedBridgeSequence(expected), normalizeRuntimeBridgeCalls(event.runtimeEvent),
        `$.browser.${kind}.events[${index}].bridge-order`);
      if (event.physicalClick) {
        equal(true, event.physicalClick.attempted, `$.browser.${kind}.events[${index}].physicalClick.attempted`);
        equal(false, event.physicalClick.targetBefore.disabled, `$.browser.${kind}.events[${index}].physicalClick.targetBefore.disabled`);
        equal(1, event.physicalClick.callbackInvocations, `$.browser.${kind}.events[${index}].physicalClick.callbackInvocations`);
        equal(expected.message, canonicalMessage(event.physicalClick.observed?.message), `$.browser.${kind}.events[${index}].observed-message`);
        equal(fixture.events[index].action, event.physicalClick.observed?.action, `$.browser.${kind}.events[${index}].observed-action`);
      } else {
        equal("go-message", fixture.events[index].kind, `$.browser.${kind}.events[${index}].message-source`);
      }
    }
    if (expected.disabled) {
      require(event.physicalClick?.targetBefore?.disabled === true, `${kind} event ${index} did not physically target a disabled control`);
      equal(0, event.physicalClick?.callbackInvocations ?? null, `$.browser.${kind}.events[${index}].callbackInvocations`);
      equal(false, event.dispatched, `$.browser.${kind}.events[${index}].dispatched`);
      assertNoGoCalls(event, `$.browser.${kind}.events[${index}]`);
    }
    if (expected.rendererSwap) {
      if (kind === "swap") {
        require(event.operation.swap?.accepted === true, `${kind} profile rejected a compatible renderer swap`);
        equal(fixture.events[index].from, event.operation.swap.from, `$.browser.${kind}.events[${index}].swap.from`);
        equal(fixture.events[index].to, event.operation.swap.to, `$.browser.${kind}.events[${index}].swap.to`);
      } else {
        equal(false, event.operation.applied, `$.browser.${kind}.events[${index}].swap.applied`);
      }
      assertNoGoCalls(event, `$.browser.${kind}.events[${index}]`);
    }
    if (expected.staleCallback) {
      if (kind === "swap") {
        require(event.operation.result?.accepted === false && event.operation.result?.stale === true,
          `${kind} stale callback was not fenced`);
        equal(1, event.operation.callbackInvocations, `$.browser.${kind}.events[${index}].stale-callback-count`);
      } else {
        equal(false, event.operation.applied, `$.browser.${kind}.events[${index}].stale-callback.applied`);
      }
      assertNoGoCalls(event, `$.browser.${kind}.events[${index}]`);
    }
  }
  equal(17, profile.trace.checkpoints.length, `$.browser.${kind}.Go-checkpoint-count`);
  equal(16, profile.trace.steps.length, `$.browser.${kind}.Go-update-count`);
  if (kind === "swap") equal("dom", profile.trace.backend, `$.browser.${kind}.final-backend`);
  equal("", profile.unmount.after.parent.html, `$.browser.${kind}.unmount.parent`);
  equal("", profile.unmount.after.child.html, `$.browser.${kind}.unmount.child`);
  require(profile.failures.length === 0, `${kind} module-pair failures: ${profile.failures.join(" | ")}`);
  return true;
}

function nativeStateValue(state, moduleSide) {
  return encodeFixtureState(state, moduleSide.compiled.appIR.components[0].stateType, moduleSide.compiled.appIR.types);
}

export function assertSeededReplay({ native, directProfiles, browserProfiles, fixture, modulePairs, seed }) {
  require(native?.schema === NATIVE_SCHEMA, `seed ${seed} native schema is invalid`);
  equal(fixture.name, native.name, `$.seed.${seed}.native.name`);
  equal(40, fixture.events.length, `$.seed.${seed}.events.length`);
  equal(40, native.events.length, `$.seed.${seed}.native.events.length`);
  equal(40, directProfiles.react.eventCount, `$.seed.${seed}.direct.eventCount`);
  const nativeByEvent = new Map(native.steps.map((step) => [step.eventIndex, step]));
  const directByBackend = Object.fromEntries(Object.entries(directProfiles).map(([backend, profile]) =>
    [backend, new Map(profile.steps.map((step) => [step.eventIndex, step]))]));
  const browserByBackend = browserProfiles;
  const moduleForBackend = { react: modulePairs.react, dom: modulePairs.dom };
  let latestNative = {
    parentState: native.initial.parentState,
    childState: native.initial.childState,
    parentView: native.initial.parentView,
    childView: native.initial.childView,
  };
  const latestDirect = Object.fromEntries(["react", "dom"].map((backend) => [backend, {
    parentState: directProfiles[backend].initial.parentState,
    childState: directProfiles[backend].initial.childState,
    parentView: directProfiles[backend].initial.parentView.tree,
    childView: directProfiles[backend].initial.childView.tree,
  }]));
  for (const backend of ["react", "dom"]) {
    equal(nativeStateValue(native.initial.parentState, moduleForBackend[backend].parent), latestDirect[backend].parentState,
      `$.seed.${seed}.initial.${backend}.parentState`);
    equal(nativeStateValue(native.initial.childState, moduleForBackend[backend].child), latestDirect[backend].childState,
      `$.seed.${seed}.initial.${backend}.childState`);
    equal(native.initial.parentView, latestDirect[backend].parentView, `$.seed.${seed}.initial.${backend}.parentView`);
    equal(native.initial.childView, latestDirect[backend].childView, `$.seed.${seed}.initial.${backend}.childView`);
  }
  for (let index = 0; index < fixture.events.length; index += 1) {
    const source = fixture.events[index];
    const nativeEvent = native.events[index];
    equal(index, nativeEvent.eventIndex, `$.seed.${seed}.native.events[${index}].eventIndex`);
    equal(source.kind, nativeEvent.kind, `$.seed.${seed}.native.events[${index}].kind`);
    equal(source.target, nativeEvent.target, `$.seed.${seed}.native.events[${index}].target`);
    equal(source.action, nativeEvent.action, `$.seed.${seed}.native.events[${index}].action`);
    const step = nativeByEvent.get(index) ?? null;
    const isDispatch = step !== null;
    equal(isDispatch, nativeEvent.stepIndex !== null, `$.seed.${seed}.native.events[${index}].stepIndex`);
    if (step) latestNative = step;
    for (const backend of ["react", "dom"]) {
      const directStep = directByBackend[backend].get(index);
      if (directStep) latestDirect[backend] = {
        parentState: directStep.parentState,
        childState: directStep.childState,
        parentView: directStep.parentView.tree,
        childView: directStep.childView.tree,
      };
      const side = moduleForBackend[backend];
      equal(nativeStateValue(latestNative.parentState, side.parent), latestDirect[backend].parentState,
        `$.seed.${seed}.direct-${backend}.parentState[${index}]`);
      equal(nativeStateValue(latestNative.childState, side.child), latestDirect[backend].childState,
        `$.seed.${seed}.direct-${backend}.childState[${index}]`);
      equal(latestNative.parentView, latestDirect[backend].parentView, `$.seed.${seed}.direct-${backend}.parentView[${index}]`);
      equal(latestNative.childView, latestDirect[backend].childView, `$.seed.${seed}.direct-${backend}.childView[${index}]`);
    }
    const browserEventRows = Object.fromEntries(["react", "dom", "swap"].map((kind) => [kind,
      browserByBackend[kind].events.find((row) => row.sourceEventIndex === index)]));
    for (const kind of ["react", "dom", "swap"]) {
      const row = browserEventRows[kind];
      require(row, `seed ${seed} ${kind} profile omitted source event ${index}`);
      equal(source, row.sourceEvent, `$.seed.${seed}.browser.${kind}.events[${index}].sourceEvent`);
      if (source.kind !== "click") throw new Error(`seed ${seed} contains a non-click input`);
      const targetBefore = row.physicalClick?.targetBefore;
      require(targetBefore?.connected === true, `seed ${seed} ${kind} event ${index} did not click a connected element`);
      if (Object.hasOwn(nativeEvent, "disabled")) {
        equal(targetBefore.disabled, nativeEvent.disabled, `$.seed.${seed}.native.events[${index}].disabled`);
      }
      if (targetBefore.disabled) {
        equal(0, row.physicalClick.callbackInvocations, `$.seed.${seed}.${kind}.events[${index}].suppressed-callbacks`);
        equal(false, row.dispatched, `$.seed.${seed}.${kind}.events[${index}].disabled-dispatch`);
      } else {
        equal(1, row.physicalClick.callbackInvocations, `$.seed.${seed}.${kind}.events[${index}].callback-count`);
        equal(true, row.dispatched, `$.seed.${seed}.${kind}.events[${index}].dispatch`);
      }
      equal(isDispatch, row.dispatched, `$.seed.${seed}.${kind}.events[${index}].Go-update`);
      equal(canonicalMessage(nativeEvent.message), canonicalMessage(row.message), `$.seed.${seed}.${kind}.events[${index}].message`);
      equal(expectedGoCountDelta({ message: isDispatch ? nativeEvent.message : null, target: source.target }),
        countDelta(row.callCountsBefore, row.callCountsAfter), `$.seed.${seed}.${kind}.events[${index}].Go-call-delta`);
      const checkpoint = browserByBackend[kind].snapshots.find((entry) => entry.eventIndex === index)?.snapshot;
      require(checkpoint, `seed ${seed} browser ${kind} lacks event ${index} state capture`);
      const modulePair = kind === "swap" ? modulePairs.dom : modulePairs[kind];
      equal(nativeStateValue(latestNative.parentState, modulePair.parent), checkpoint.parent.state,
        `$.seed.${seed}.browser-${kind}.parentState[${index}]`);
      equal(nativeStateValue(latestNative.childState, modulePair.child), checkpoint.child.state,
        `$.seed.${seed}.browser-${kind}.childState[${index}]`);
      equal(latestNative.parentView, checkpoint.parent.view.tree ?? checkpoint.parent.view,
        `$.seed.${seed}.browser-${kind}.parentView[${index}]`);
      equal(latestNative.childView, checkpoint.child.view.tree ?? checkpoint.child.view,
        `$.seed.${seed}.browser-${kind}.childView[${index}]`);
      if (isDispatch) {
        const nativeStep = nativeByEvent.get(index);
        equal(nativeStep.bridges, normalizeRuntimeBridgeCalls(row.runtimeEvent),
          `$.seed.${seed}.browser-${kind}.bridges[${index}]`);
      } else {
        equal([], row.bridgeCalls, `$.seed.${seed}.${kind}.events[${index}].suppressed-bridges`);
        equal(row.callCountsBefore, row.callCountsAfter, `$.seed.${seed}.${kind}.events[${index}].suppressed-counts`);
      }
      const physical = browserByBackend[kind].snapshots.find((entry) => entry.eventIndex === index)?.physical;
      require(physical, `seed ${seed} browser ${kind} lacks event ${index} physical DOM`);
      equal(checkpoint.parent.dom, physical.parent, `$.seed.${seed}.${kind}.physical-parent-parity[${index}]`);
      equal(checkpoint.child.dom, physical.child, `$.seed.${seed}.${kind}.physical-child-parity[${index}]`);
    }
    if (!isDispatch) continue;
    const directStep = directByBackend.react.get(index);
    require(directStep, `seed ${seed} direct React trace omitted update at event ${index}`);
    const encodedNativeParentReact = nativeStateValue(step.parentState, modulePairs.react.parent);
    const encodedNativeChildReact = nativeStateValue(step.childState, modulePairs.react.child);
    equal(encodedNativeParentReact, directStep.parentState, `$.seed.${seed}.direct.parentState[${index}]`);
    equal(encodedNativeChildReact, directStep.childState, `$.seed.${seed}.direct.childState[${index}]`);
    equal(step.parentView, directStep.parentView.tree, `$.seed.${seed}.direct.parentView[${index}]`);
    equal(step.childView, directStep.childView.tree, `$.seed.${seed}.direct.childView[${index}]`);
    for (const backend of ["react", "dom"]) {
      const modulePair = moduleForBackend[backend];
      const direct = directByBackend[backend].get(index);
      require(direct, `seed ${seed} direct ${backend} trace omitted update at event ${index}`);
      equal(nativeStateValue(step.parentState, modulePair.parent), direct.parentState, `$.seed.${seed}.direct-${backend}.parentState[${index}]`);
      equal(nativeStateValue(step.childState, modulePair.child), direct.childState, `$.seed.${seed}.direct-${backend}.childState[${index}]`);
      equal(step.parentView, direct.parentView.tree, `$.seed.${seed}.direct-${backend}.parentView[${index}]`);
      equal(step.childView, direct.childView.tree, `$.seed.${seed}.direct-${backend}.childView[${index}]`);
      equal(step.bridges, direct.bridges, `$.seed.${seed}.direct-${backend}.bridges[${index}]`);
      equal(step.bridges, normalizeRuntimeBridgeCalls(browserEventRows[backend].runtimeEvent), `$.seed.${seed}.browser-${backend}.bridges[${index}]`);
    }
    equal(step.bridges, normalizeRuntimeBridgeCalls(browserEventRows.swap.runtimeEvent), `$.seed.${seed}.browser-swap.bridges[${index}]`);
    for (const side of ["parent", "child"]) {
      const reactDOM = browserByBackend.react.snapshots.find((row) => row.eventIndex === index)?.physical[side];
      const domDOM = browserByBackend.dom.snapshots.find((row) => row.eventIndex === index)?.physical[side];
      const swapDOM = browserByBackend.swap.snapshots.find((row) => row.eventIndex === index)?.physical[side];
      equal(reactDOM, domDOM, `$.seed.${seed}.react-dom-physical-${side}[${index}]`);
      equal(domDOM, swapDOM, `$.seed.${seed}.dom-swap-physical-${side}[${index}]`);
      for (const kind of ["react", "dom", "swap"]) {
        const snapshot = browserByBackend[kind].snapshots.find((row) => row.eventIndex === index)?.snapshot;
        equal(browserByBackend[kind].snapshots.find((row) => row.eventIndex === index)?.physical[side],
          snapshot[side].dom, `$.seed.${seed}.${kind}.physical-runtime-${side}[${index}]`);
      }
    }
  }
  for (const kind of ["react", "dom", "swap"]) {
    const profile = browserByBackend[kind];
    equal(40, profile.sourceEventCount, `$.seed.${seed}.browser.${kind}.sourceEventCount`);
    equal(41 + (kind === "swap" ? 3 : 0), profile.snapshots.length, `$.seed.${seed}.browser.${kind}.snapshotCount`);
    equal(0, profile.failures.length, `$.seed.${seed}.browser.${kind}.failures`);
    equal("", profile.unmount.after.parent.html, `$.seed.${seed}.browser.${kind}.unmount.parent`);
    equal("", profile.unmount.after.child.html, `$.seed.${seed}.browser.${kind}.unmount.child`);
  }
  equal(native.steps.length + 1, browserByBackend.react.trace.checkpoints.length, `$.seed.${seed}.react.Go-checkpoint-count`);
  equal(native.steps.length + 1, browserByBackend.dom.trace.checkpoints.length, `$.seed.${seed}.dom.Go-checkpoint-count`);
  equal(native.steps.length + 1, browserByBackend.swap.trace.checkpoints.length, `$.seed.${seed}.swap.Go-checkpoint-count`);
  equal(browserByBackend.dom.trace.callCounts, browserByBackend.swap.trace.callCounts, `$.seed.${seed}.swap.call-counts`);
  const swapProbes = browserByBackend.swap.events.filter((row) => row.hostProbe !== undefined);
  equal(3, swapProbes.length, `$.seed.${seed}.swap.host-probe-count`);
  equal(2, swapProbes.filter((row) => row.hostProbe === "injected-swap").length, `$.seed.${seed}.swap.swap-count`);
  const oldCallbacks = swapProbes.filter((row) => row.hostProbe === "injected-stale");
  equal(1, oldCallbacks.length, `$.seed.${seed}.swap.stale-callback-count`);
  require(oldCallbacks[0].operation.result?.accepted === false && oldCallbacks[0].operation.result?.stale === true,
    `seed ${seed} old renderer callback was not fenced`);
  return true;
}

function expectReject(name, fn, detected) {
  try { fn(); }
  catch { detected.push(name); return; }
  throw new Error(`mutation control ${name} was not detected`);
}

/** Mutates real captured output and requires the same production checker to reject it. */
export function runMutationControls(actualBrowser, fixture, modules) {
  const detected = [];
  const base = actualBrowser.profiles.swap;
  assertBrowserProfile(base, "swap", fixture, modules);
  for (const [name, mutate] of [
    ["parent-state-field", (copy) => { copy.snapshots[2].snapshot.parent.state = { ...copy.snapshots[2].snapshot.parent.state, fields: [] }; }],
    ["child-view-tree", (copy) => { copy.snapshots[3].snapshot.child.view.tree.tag = "aside"; }],
    ["physical-dom-html", (copy) => { copy.snapshots[4].physical.parent.html += "<i>mutated</i>"; }],
    ["disabled-control", (copy) => { copy.snapshots[5].physical.child.controls[0].disabled = false; }],
    ["bridge-order", (copy) => { copy.events[0].runtimeEvent.callOrder.reverse(); }],
    ["ABI-role-before-reject", (copy) => { copy.abiAdmission.roleCounts["parent.Init"] = 1; }],
  ]) {
    const copy = structuredClone(base);
    mutate(copy);
    expectReject(name, () => assertBrowserProfile(copy, "swap", fixture, modules), detected);
  }
  return detected;
}

export function checkModuleConformance({ native, direct, browser, fixture, parentModule, childModule }) {
  assertNative(native, fixture);
  assertDirect(direct, native, fixture, parentModule, childModule);
  const modules = { parent: parentModule, child: childModule };
  for (const profile of ["react", "dom", "swap"]) assertBrowserProfile(browser.profiles[profile], profile, fixture, modules);
  const mutationControls = runMutationControls(browser, fixture, modules);
  return {
    status: "matched",
    fixedEventCount: 24,
    fixedGoUpdates: 16,
    fixedStateCheckpoints: 17,
    browserProfiles: ["react", "dom", "swap"],
    mutationControls,
    mutationControlsDetected: mutationControls.length,
  };
}

export { assertNative, expectedBridgeSequence, expectedInitialBridges };
