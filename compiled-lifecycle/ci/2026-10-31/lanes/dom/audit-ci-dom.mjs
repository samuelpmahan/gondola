import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  LIFECYCLE_PACKAGE_PATH,
  LIFECYCLE_STEPS,
  LIFECYCLE_STATES,
  expectedLifecycleDOM,
  expectedLifecyclePhysicalControls,
  expectedLifecycleStateAtTick,
  expectedLifecycleView,
} from "../../../../browser/lifecycle-oracle.mjs";

const root = resolve(process.cwd());
const extracted = "compiled-lifecycle/ci/2026-10-31/extracted";
const attempt = `${extracted}/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z`;
const artifactAttempt = "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z";
const captureRel = `${attempt}/matrix/lifecycle.browser.capture.json`;
const browserRel = `${attempt}/matrix/lifecycle.browser.json`;
const directRel = `${attempt}/matrix/lifecycle.direct.json`;
const runRel = `${attempt}/matrix/lifecycle.run.json`;
const manifestRel = `${attempt}/matrix/lifecycle.manifest.json`;
const failureRel = `${attempt}/matrix/lifecycle.failed.json`;
const executionRel = `${attempt}/execution.json`;
const retentionRel = "compiled-lifecycle/ci/2026-10-31/provider/failed-41178420647/retention.json";
const membersRel = "compiled-lifecycle/ci/2026-10-31/provider/failed-41178420647/members.json";
const toAbs = (p) => resolve(root, p);
const json = async (p) => JSON.parse(await readFile(toAbs(p), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileSha = async (p) => sha(await readFile(toAbs(p)));
const eq = (actual, expected, label) => assert.deepEqual(actual, expected, label);

function field(value, name, path) {
  assert(value && value.kind === "struct", `${path} must be an encoded struct`);
  const row = value.fields.find((item) => item.name === name);
  assert(row, `${path}.${name} is missing`);
  return row.value;
}

function asString(value, path) {
  assert.equal(value?.kind, "string", `${path} must be string`);
  return value.string;
}

function asBool(value, path) {
  assert.equal(value?.kind, "bool", `${path} must be bool`);
  return value.bool;
}

function asUint(value, path) {
  assert(["uint", "int"].includes(value?.kind), `${path} must be integer`);
  const parsed = Number(value.integer);
  assert(Number.isSafeInteger(parsed), `${path} is outside safe integer range`);
  return parsed;
}

function asFloat64(value, path) {
  assert.equal(value?.kind, "float64", `${path} must be float64`);
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt(`0x${value.float64Bits}`), false);
  return view.getFloat64(0, false);
}

function decodeState(encoded) {
  assert.equal(encoded.typeId, `${LIFECYCLE_PACKAGE_PATH}.State`);
  const node = (name) => {
    const path = `State.${name}`;
    const raw = field(encoded, name, "State");
    const counter = field(raw, "Counter", path);
    return {
      ID: asString(field(raw, "ID", path), `${path}.ID`),
      ParentID: asString(field(raw, "ParentID", path), `${path}.ParentID`),
      Generation: asUint(field(raw, "Generation", path), `${path}.Generation`),
      RequestID: asUint(field(raw, "RequestID", path), `${path}.RequestID`),
      Alive: asBool(field(raw, "Alive", path), `${path}.Alive`),
      Requested: asBool(field(raw, "Requested", path), `${path}.Requested`),
      Pending: asBool(field(raw, "Pending", path), `${path}.Pending`),
      Token: asString(field(raw, "Token", path), `${path}.Token`),
      Reply: asString(field(raw, "Reply", path), `${path}.Reply`),
      Counter: { Count: asFloat64(field(counter, "Count", `${path}.Counter`), `${path}.Counter.Count`) },
    };
  };
  return {
    Parent: node("Parent"),
    Child: node("Child"),
    Grandchild: node("Grandchild"),
    Sibling: node("Sibling"),
    NextRequestID: asUint(field(encoded, "NextRequestID", "State"), "State.NextRequestID"),
  };
}

function expectationForTick(index) {
  assert(index >= 0 && index < LIFECYCLE_STATES.length);
  return expectedLifecycleStateAtTick(index);
}

function expectedRequestRecords(step, dispatchId) {
  return (step.effects ?? []).map((effect, effectIndex) => ({ dispatchId, effectIndex, effect }));
}

const captureBytes = await readFile(toAbs(captureRel));
const browserBytes = await readFile(toAbs(browserRel));
const captureHash = sha(captureBytes);
const capture = JSON.parse(captureBytes.toString("utf8"));
const direct = await json(directRel);
const run = await json(runRel);
const manifest = await json(manifestRel);
const failed = await json(failureRel);
const execution = await json(executionRel);
const retention = await json(retentionRel);
const providerMembers = await json(membersRel);

// Bind the capture to the primary provider artifact and the current published tree.
assert.equal(retention.artifactId, 13034915662);
assert.equal(retention.runId, 41178420647);
assert.equal(retention.bytes, 47035803);
assert.equal(retention.sha256, "6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4");
assert.equal(providerMembers.artifactId, retention.artifactId);
assert.equal(sha(browserBytes), captureHash);
assert.equal(captureHash, "a663d77ba16c43adfb3f4b12666845b82047b3e1b9c7ed68ffea8c98ac304ad6");
const memberByPath = new Map(providerMembers.members.map((item) => [item.path, item]));
const captureMember = memberByPath.get(`${artifactAttempt}/matrix/lifecycle.browser.capture.json`);
assert(captureMember);
assert.equal(captureMember.bytes, captureBytes.length);
assert.equal(captureMember.sha256, captureHash);
const directMember = memberByPath.get(`${artifactAttempt}/matrix/lifecycle.direct.json`);
assert(directMember);
assert.equal(directMember.sha256, await fileSha(directRel));
const runMember = memberByPath.get(`${artifactAttempt}/matrix/lifecycle.run.json`);
assert(runMember);
assert.equal(runMember.sha256, await fileSha(runRel));

const sourceCommit = await json("compiled-lifecycle/ci/2026-10-31/lanes/evidence/commit-source-49cc-current.json");
assert.equal(sourceCommit.sha, "49cc2b96c8817a47319d5b7bd484184a22fa984b");
assert.equal(sourceCommit.commit.tree.sha, "d49ca35b7eda23837c392bbe0d2363551e4c7bec");
assert.equal(run.status, "rejected");
assert.equal(run.outputPaths.check.endsWith("lifecycle.check.json"), true);
assert.equal(manifest.status, "rejected");
assert.equal(run.sourceStableThroughCheck, true);
assert.equal(run.buildOutputsStableThroughCheck, true);
assert.equal(run.stages.find((row) => row.name === "direct-emitted-module-replay")?.status, "completed");
assert.equal(run.stages.find((row) => row.name === "react-dom-and-alternating-swap-browser-profiles")?.status, "completed");
assert.equal(run.stages.find((row) => row.name === "native-go-script-cli-replay")?.status, "failed");
assert.match(failed.errors[0].message, /spawnSync .*\/go ENOENT/);
assert.match(failed.errors[1].message, /full conformance check withheld/);
assert.equal(execution.mode, "full");
assert.equal(execution.status, "failed");

// Check the recorded source pins against the exact source checkout and its immutable run pins.
const pinRows = new Map(run.sourcePinsBefore.map((row) => [row.path, row]));
eq(run.sourcePinsBefore, run.sourcePinsFinal, "source pins before/final");
const sourceFiles = [
  "fixtures/compiled/lifecycle/scenario.json",
  "compiled-lifecycle/browser/lifecycle-oracle.mjs",
  "compiled-lifecycle/browser/lifecycle-oracle.test.mjs",
  "compiled-lifecycle/conformance/browser-entry.mjs",
  "compiled-lifecycle/conformance/browser.mjs",
  "compiled-lifecycle/conformance/run.mjs",
  "compiled-lifecycle/conformance/lifecycle-contract.json",
  "compiled-lifecycle/conformance/swap-schedule.json",
  "compiled-lifecycle/runtime/runtime.mjs",
  "compiled-frontend/frontend/runtime/runtime.mjs",
  "compiled-frontend/frontend/dom/renderer.mjs",
  "compiled-frontend/frontend/react/renderer.mjs",
];
const sourcePins = {};
for (const path of sourceFiles) {
  const pin = pinRows.get(path);
  assert(pin, `source pin missing: ${path}`);
  const actual = await fileSha(path);
  assert.equal(pin.sha256, actual, `current source differs from CI pin: ${path}`);
  sourcePins[path] = actual;
}
const fixtureAppSha = await fileSha("fixtures/compiled/lifecycle/app.go");
const fixtureViewSha = await fileSha("fixtures/compiled/lifecycle/view.go");
assert.equal(fixtureAppSha, "6b61e55c3046f58873d2774e38a7bca44769f18f6870c39e1885b78be340fe41");
assert.equal(fixtureViewSha, "afc4b1611c5dbd8e5264d3c124b808770bdd8579fdc1426c350f4df6689bb948");
sourcePins["fixtures/compiled/lifecycle/app.go"] = fixtureAppSha;
sourcePins["fixtures/compiled/lifecycle/view.go"] = fixtureViewSha;

assert.equal(capture.schema, "gobi.compiled-lifecycle-browser/v1");
assert.equal(capture.fixture, "compiled-lifecycle-parent-child-grandchild-remount-fence");
assert.equal(capture.packagePath, LIFECYCLE_PACKAGE_PATH);
assert.equal(capture.componentID, LIFECYCLE_PACKAGE_PATH);
assert.deepEqual(capture.pageErrors, []);
assert.deepEqual(capture.noWasm, { apiAttempts: [], wasmRequests: [] });
assert.equal(capture.browser, "156.0.8078.4");
assert.equal(capture.playwright, "1.64.1");
assert.equal(capture.profiles && Object.keys(capture.profiles).length, 3);
assert.deepEqual(Object.keys(capture.profiles).sort(), ["dom", "react", "swap"]);
assert.equal(capture.browserBundle.sha256, "ef3510480d4d30ffb5f8ee172e8b29532269cce806cc0c030cd22e553ba92368");
assert.equal(capture.browserBundle.bytes, 1881327);
assert.equal(sha(await readFile(toAbs(`${attempt}/matrix/lifecycle.browser.bundle.mjs`))), capture.browserBundle.sha256);

const directTicks = direct.trace.ticks;
assert.equal(direct.schema, "gobi.compiled-lifecycle-direct/v1");
assert.equal(direct.componentID, LIFECYCLE_PACKAGE_PATH);
assert.equal(directTicks.length, 26);
assert.equal(LIFECYCLE_STEPS.length, 26);
assert.equal(LIFECYCLE_STATES.length, 26);

const profileResults = {};
for (const [profileName, profile] of Object.entries(capture.profiles)) {
  assert.equal(profile.componentId, LIFECYCLE_PACKAGE_PATH);
  assert.equal(profile.appId, LIFECYCLE_PACKAGE_PATH);
  assert.deepEqual(profile.pageErrors, []);
  assert.deepEqual(profile.noWasm, { apiAttempts: [], wasmRequests: [] });
  assert.equal(profile.trace.ticks.length, 26);
  assert.equal(profile.events.length, 26);
  assert.equal(profile.snapshots.length, 27);
  assert.equal(profile.actions.length, 16);
  assert.deepEqual(profile.pendingAtEnd, []);

  // Check every physical capture, including both snapshots around the no-Go-tick
  // renderer swap at event 8 (state index 8 appears twice in the 27 snapshots).
  for (const [snapshotIndex, snapshot] of profile.snapshots.entries()) {
    const expectedState = expectationForTick(snapshot.stateIndex);
    const expectedView = expectedLifecycleView(expectedState);
    const expectedDOM = expectedLifecycleDOM(expectedState);
    assert.equal(snapshot.traceTickIndex, snapshot.stateIndex, `${profileName} snapshot ${snapshotIndex} tick binding`);
    eq(snapshot.traceTick, profile.trace.ticks[snapshot.traceTickIndex], `${profileName} raw snapshot ${snapshotIndex} tick`);
    eq(decodeState(snapshot.runtimeSnapshot.state), expectedState, `${profileName} raw snapshot ${snapshotIndex} typed state`);
    eq(snapshot.runtimeSnapshot.view, expectedView, `${profileName} raw snapshot ${snapshotIndex} literal Go View`);
    eq(snapshot.runtimeSnapshot.dom, expectedDOM, `${profileName} raw snapshot ${snapshotIndex} runtime DOM`);
    eq(snapshot.rendererSnapshot, expectedDOM, `${profileName} raw snapshot ${snapshotIndex} renderer DOM`);
    eq(snapshot.physicalDOM, expectedDOM, `${profileName} raw snapshot ${snapshotIndex} live physical DOM/controls`);
    eq(snapshot.expectedDOM, expectedDOM, `${profileName} raw snapshot ${snapshotIndex} oracle DOM`);
  }

  // Decode the raw encoded State, then compare typed fields, literal Go View,
  // renderer snapshot, captured HTML, and live button properties at all 26 Go ticks.
  for (let tickIndex = 0; tickIndex < 26; tickIndex += 1) {
    const expectedState = expectationForTick(tickIndex);
    const tick = profile.trace.ticks[tickIndex];
    const initialSnapshot = profile.snapshots.find((item) => item.traceTickIndex === tickIndex);
    assert(initialSnapshot, `${profileName} lacks physical snapshot for Go tick ${tickIndex}`);
    const expectedView = expectedLifecycleView(expectedState);
    const expectedDOM = expectedLifecycleDOM(expectedState);
    assert.equal(tick.index, tickIndex);
    eq(decodeState(tick.state), expectedState, `${profileName} tick ${tickIndex} decoded State`);
    eq(tick.view, expectedView, `${profileName} tick ${tickIndex} Go View tree`);
    eq(tick.dom, expectedDOM, `${profileName} tick ${tickIndex} Go renderer DOM snapshot`);
    eq(decodeState(initialSnapshot.runtimeSnapshot.state), expectedState, `${profileName} snapshot ${tickIndex} typed State`);
    eq(initialSnapshot.runtimeSnapshot.view, expectedView, `${profileName} snapshot ${tickIndex} Go View`);
    eq(initialSnapshot.runtimeSnapshot.dom, expectedDOM, `${profileName} snapshot ${tickIndex} runtime DOM`);
    eq(initialSnapshot.rendererSnapshot, expectedDOM, `${profileName} snapshot ${tickIndex} renderer DOM`);
    eq(initialSnapshot.physicalDOM, expectedDOM, `${profileName} snapshot ${tickIndex} physical DOM/live controls`);
    eq(initialSnapshot.expectedDOM, expectedDOM, `${profileName} snapshot ${tickIndex} embedded expected DOM`);
  }

  // Every timeline event is literal. The root renderer swap is represented by a
  // second state-8 snapshot but does not add a Go tick.
  const swapStep = LIFECYCLE_STEPS[8];
  assert.equal(swapStep.kind, "renderer-swap");
  assert.equal(profile.snapshots.filter((item) => item.traceTickIndex === 8).length, 2);
  for (let eventIndex = 0; eventIndex < LIFECYCLE_STEPS.length; eventIndex += 1) {
    const step = LIFECYCLE_STEPS[eventIndex];
    const event = profile.events[eventIndex];
    assert.equal(event.eventIndex, eventIndex);
    assert.equal(event.stateIndex, step.stateIndex);
    if (step.kind === "renderer-swap") continue;
    const tick = profile.trace.ticks[step.stateIndex];
    assert.deepEqual(tick.message, step.message);
    assert.deepEqual(tick.requestedEffects, expectedRequestRecords(step, tick.dispatchId));
    if (step.kind === "effect-reply") {
      const request = profile.effectRecords.find((row) => row.kind === "request" && row.token === step.token);
      assert(request, `${profileName} missing request for reply ${step.token}`);
      assert.deepEqual(tick.completedEffects, [{
        dispatchId: request.dispatchId,
        effectIndex: request.effectIndex,
        message: step.message,
      }]);
    } else {
      assert.deepEqual(tick.completedEffects, []);
    }
  }

  // The physically attempted controls were live and enabled, with exact paths and messages.
  const clickSteps = LIFECYCLE_STEPS.map((step, index) => ({ step, index })).filter(({ step }) => step.kind === "click");
  assert.equal(clickSteps.length, 16);
  for (let i = 0; i < clickSteps.length; i += 1) {
    const { step, index } = clickSteps[i];
    const action = profile.actions[i];
    assert.equal(action.eventIndex, index);
    assert.equal(action.method, "HTMLElement.click");
    assert.equal(action.attempted, true);
    assert.deepEqual(action.action, step.action);
    assert.deepEqual(action.expectedMessage, step.message);
    assert.equal(action.target.connected, true);
    assert.equal(action.target.disabled, false);
    assert.equal(action.target.value, step.action.value);
    assert.equal(action.observed.action.path, step.action.path);
    assert.deepEqual(action.observed.message, { Name: step.message.name, Arg: step.message.arg });
    assert.equal(action.afterTicks, action.beforeTicks + 1);
  }

  const atEvent = (eventIndex) => profile.snapshots.find((item) => item.eventIndex === eventIndex);
  const removed = atEvent(9);
  const removedState = expectationForTick(9);
  const removedDOM = expectedLifecycleDOM(removedState);
  assert(removed);
  eq(removed.physicalDOM, removedDOM, `${profileName} removed physical DOM`);
  assert.match(removed.physicalDOM.html, /Parent: removed/);
  assert(!removed.physicalDOM.html.includes("lifecycle-node lifecycle-child"));
  assert(!removed.physicalDOM.html.includes("lifecycle-node lifecycle-grandchild"));
  assert(removed.physicalDOM.html.includes("Sibling: live; count=1; pending sibling:g1:r4"));
  assert.deepEqual(removed.physicalDOM.controls.map(({ path, disabled }) => [path, disabled]), [
    ["1/1", false], ["1/2", true], ["2/0", true], ["2/1", false],
  ]);

  const remounted = atEvent(10);
  const remountState = expectationForTick(10);
  assert(remounted);
  eq(decodeState(remounted.runtimeSnapshot.state), remountState, `${profileName} remounted typed state`);
  eq(remounted.physicalDOM, expectedLifecycleDOM(remountState), `${profileName} remounted physical DOM`);
  assert(remounted.physicalDOM.html.includes("lifecycle-node lifecycle-parent"));
  assert(remounted.physicalDOM.html.includes("lifecycle-node lifecycle-child"));
  assert(remounted.physicalDOM.html.includes("lifecycle-node lifecycle-grandchild"));
  assert(!remounted.physicalDOM.html.includes("Parent: removed"));
  assert(remounted.physicalDOM.html.includes("Sibling: live; count=1; pending sibling:g1:r4"));

  // The request and removal controls expose live HTMLElement.disabled states.
  for (const [tickIndex, expectedDisabled] of [[8, ["parent-request", "child-request", "grandchild-request", "sibling-request", "parent-remount"]],
    [9, ["sibling-request", "parent-remove"]], [10, ["sibling-request", "parent-remount"]],
    [21, ["parent-request", "child-request", "grandchild-request", "sibling-request", "parent-remount"]],
    [25, ["parent-request", "child-request", "grandchild-request", "sibling-request", "parent-remount"]]]) {
    const snapshot = profile.snapshots.find((item) => item.traceTickIndex === tickIndex);
    assert(snapshot);
    eq(snapshot.physicalDOM.controls.filter((control) => control.disabled).map((control) => control.key),
      expectedDisabled, `${profileName} live disabled controls at tick ${tickIndex}`);
    eq(snapshot.physicalDOM.controls, expectedLifecyclePhysicalControls(expectationForTick(tickIndex)).map(({ text: _text, ...control }) => control),
      `${profileName} physical control properties at tick ${tickIndex}`);
  }

  // Canceled callback effects are rejected. Accepted sibling and fresh generation replies survive.
  const records = profile.effectRecords;
  const requestTokens = records.filter((row) => row.kind === "request").map((row) => row.token);
  assert.deepEqual(requestTokens, [
    "parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4",
    "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7",
  ]);
  assert.deepEqual(records.filter((row) => row.kind === "cancel").map((row) => row.token), [
    "grandchild:g1:r3", "child:g1:r2", "parent:g1:r1",
  ]);
  assert.deepEqual(records.filter((row) => row.kind === "cancel").map((row) => row.outcome), ["cancelled", "cancelled", "cancelled"]);
  assert.deepEqual(records.filter((row) => row.kind === "force-deliver-retired").map((row) => [row.token, row.outcome, row.runtimeResult.error]), [
    ["grandchild:g1:r3", "rejected", "unknown or extra effect completion"],
    ["child:g1:r2", "rejected", "unknown or extra effect completion"],
    ["parent:g1:r1", "rejected", "unknown or extra effect completion"],
  ]);
  assert.deepEqual(records.filter((row) => row.kind === "deliver").map((row) => [row.token, row.outcome]), [
    ["sibling:g1:r4", "accepted"], ["grandchild:g2:r7", "accepted"],
    ["child:g2:r6", "accepted"], ["parent:g2:r5", "accepted"],
  ]);
  assert.deepEqual(profile.probes.slice(0, 3).map((probe) => [probe.token, probe.result.accepted, probe.tickCount]), [
    ["grandchild:g1:r3", false, 10], ["child:g1:r2", false, 10], ["parent:g1:r1", false, 10],
  ]);
  assert(profile.probes.slice(0, 3).every((probe) => probe.result.error === "unknown or extra effect completion"));
  assert.deepEqual(profile.probes.slice(3).map((probe) => [probe.result.accepted, probe.result.error, probe.tickCount]), [
    [false, "effect completion already delivered", 15], [false, "effect completion already delivered", 25],
  ]);
  eq(decodeState(profile.snapshots.at(-1).runtimeSnapshot.state), expectationForTick(25), `${profileName} final Go state`);
  assert.deepEqual(profile.pendingAtEnd, []);
  assert.deepEqual(profile.unmount.physicalDOM, { html: "", controls: 0 });
  assert.deepEqual(profile.unmount.rendererSnapshot, { normalization: "outerHTML-v1", html: "", controls: [] });

  const swaps = profile.swaps;
  if (profileName === "swap") {
    assert.equal(swaps.length, 17);
    assert.equal(profile.rendererSequence.length, 18);
    assert.deepEqual(profile.callbackCounts, { dispatch: 32, stale: 16 });
    assert.equal(swaps.filter((row) => row.after.retiredCallbacks.eligible).length, 16);
    assert.equal(swaps.filter((row) => !row.after.retiredCallbacks.eligible).length, 1);
    assert.equal(swaps.find((row) => !row.after.retiredCallbacks.eligible).reason, "fixture-renderer-swap-8");
    for (const swap of swaps) {
      eq(swap.before.trace, swap.after.trace, `${swap.reason} preserves Go trace`);
      eq(swap.before.snapshot, swap.after.snapshot, `${swap.reason} preserves typed state/view`);
      eq(swap.before.pending, swap.after.pending, `${swap.reason} preserves pending effects`);
      eq(swap.before.effectRecords, swap.after.effectRecords, `${swap.reason} preserves effect records`);
      assert.equal(swap.after.oldRootDetached, true);
      assert.equal(swap.after.oldRootEmptyDuringSwap, true);
      const retired = swap.after.retiredCallbacks;
      if (!retired.eligible) {
        assert.equal(retired.reason, "retired renderer had no user action callback to retain");
        continue;
      }
      for (const key of ["dispatch", "stale"]) {
        assert.deepEqual(retired[key], {
          accepted: false,
          dispatchId: null,
          stale: true,
          error: "renderer callback fenced after replacement",
        });
      }
      eq(retired.before.trace, retired.after.trace, `${swap.reason} old callback preserves trace`);
      eq(retired.before.snapshot, retired.after.snapshot, `${swap.reason} old callback preserves state/view`);
      assert.equal(retired.after.diagnostics.fencedCallbacks.length,
        retired.before.diagnostics.fencedCallbacks.length + 2, `${swap.reason} records both callback fences`);
    }
  } else {
    assert.deepEqual(swaps, []);
    assert.deepEqual(profile.callbackCounts, { dispatch: 16, stale: 0 });
  }

  const retiredClicks = profile.stalePhysicalClicks;
  assert.equal(retiredClicks.length, 1);
  const stale = retiredClicks[0];
  assert.equal(stale.eventIndex, 10);
  assert.equal(stale.attempts.length, 6);
  eq(stale.before.trace, stale.after.trace, `${profileName} detached click Go trace`);
  eq(stale.before.snapshot, stale.after.snapshot, `${profileName} detached click state/view`);
  eq(stale.before.callbacks, stale.after.callbacks, `${profileName} detached click callback counts`);
  eq(stale.before.pending, stale.after.pending, `${profileName} detached click pending correlations`);
  eq(stale.before.effectRecords, stale.after.effectRecords, `${profileName} detached click effects`);
  eq(stale.before.physicalHTML, stale.after.physicalHTML, `${profileName} detached click physical HTML`);
  assert.deepEqual(stale.attempts.map((row) => row.path), ["0/1", "0/2", "0/3/1", "0/3/2", "0/3/3/1", "0/3/3/2"]);
  assert(stale.attempts.every((row) => row.method === "retained-detached-HTMLElement.click" && row.attempted &&
    row.targetBefore.connected === false && row.targetConnectedAfter === false));
  for (const attemptRow of stale.attempts) eq(attemptRow.callbackCountsAfter, stale.before.callbacks,
    `${profileName} detached click ${attemptRow.path} has no renderer callback`);

  const mismatchActionIndices = [];
  for (let tickIndex = 0; tickIndex < directTicks.length; tickIndex += 1) {
    const directTick = directTicks[tickIndex];
    const browserTick = profile.trace.ticks[tickIndex];
    eq(browserTick.state, directTick.state, `${profileName} vs direct emitted Go state tick ${tickIndex}`);
    eq(browserTick.view, directTick.view, `${profileName} vs direct emitted Go View tick ${tickIndex}`);
    eq(browserTick.requestedEffects, directTick.requestedEffects, `${profileName} vs direct requested effects tick ${tickIndex}`);
    eq(browserTick.completedEffects, directTick.completedEffects, `${profileName} vs direct completed effects tick ${tickIndex}`);
    if (JSON.stringify(browserTick.action) !== JSON.stringify(directTick.action)) mismatchActionIndices.push(tickIndex);
  }
  assert.deepEqual(mismatchActionIndices, [11, 12, 13, 15, 25], `${profileName} direct-message action witnesses are expected differences`);

  profileResults[profileName] = {
    backend: profile.backend,
    stateTicks: profile.trace.ticks.length,
    physicalSnapshots: profile.snapshots.length,
    activePhysicalClicks: profile.actions.length,
    detachedSubtreeClickAttempts: stale.attempts.length,
    cancellationOrder: records.filter((row) => row.kind === "cancel").map((row) => row.token),
    finalPendingCount: profile.pendingAtEnd.length,
    snapshotHash: sha(Buffer.from(JSON.stringify(profile.snapshots))),
    traceHash: sha(Buffer.from(JSON.stringify(profile.trace))),
  };
}

const output = {
  schema: "gobi.compiled-lifecycle-ci-dom-review/v1",
  outcome: "confirmed_reuse",
  provider: {
    artifactId: retention.artifactId,
    runId: retention.runId,
    providerConclusion: retention.providerConclusion,
    bytes: retention.bytes,
    sha256: retention.sha256,
    sourceSHA: sourceCommit.sha,
    sourceTree: sourceCommit.commit.tree.sha,
    capturePath: captureRel,
    captureBytes: captureBytes.length,
    captureSha256: captureHash,
  },
  globalRun: {
    status: execution.status,
    matrixStatus: run.status,
    directStage: "completed",
    browserStage: "completed",
    nativeStage: "failed: spawnSync /home/runner/work/gondola/gondola/go ENOENT",
    completeCheckProduced: false,
    nativeGoEquivalenceClaimed: false,
    fullCIOrOverallPassClaimed: false,
  },
  buildOutputs: manifest.buildOutputPins.beforeCheck.map((row) => ({ path: row.path, sha256: row.sha256, bytes: row.bytes })),
  sourcePins,
  browser: {
    version: capture.browser,
    playwright: capture.playwright,
    pageErrors: capture.pageErrors,
    noWasm: capture.noWasm,
    profiles: profileResults,
    requiredCancellationOrder: ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"],
    currentAndFreshRepliesAccepted: ["sibling:g1:r4", "grandchild:g2:r7", "child:g2:r6", "parent:g2:r5"],
    detachedChildControlsRemainDisconnectedAndNoOp: true,
    rendererSwapCount: capture.profiles.swap.swaps.length,
    callbackEligibleSwaps: capture.profiles.swap.swaps.filter((row) => row.after.retiredCallbacks.eligible).length,
    oldRendererDispatchAndStaleFences: capture.profiles.swap.callbackCounts.stale,
  },
  scope: "primary push artifact DOM, compiled-state, literal Go View, live control-property, cancellation, and callback-fence evidence; no native Go equivalence or overall CI success claim",
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
