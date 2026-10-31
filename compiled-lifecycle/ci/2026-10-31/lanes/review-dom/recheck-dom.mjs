import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  LIFECYCLE_PACKAGE_PATH,
  LIFECYCLE_STEPS,
  LIFECYCLE_STATES,
  expectedLifecycleDOM,
  expectedLifecyclePhysicalControls,
  expectedLifecycleStateAtTick,
  expectedLifecycleView,
} from "../../../../browser/lifecycle-oracle.mjs";

const capturePath = "compiled-lifecycle/ci/2026-10-31/extracted/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.browser.capture.json";
const directPath = "compiled-lifecycle/ci/2026-10-31/extracted/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.direct.json";
const captureBytes = await readFile(capturePath);
const captureHash = createHash("sha256").update(captureBytes).digest("hex");
assert.equal(captureHash, "a663d77ba16c43adfb3f4b12666845b82047b3e1b9c7ed68ffea8c98ac304ad6");
const capture = JSON.parse(captureBytes.toString("utf8"));
const direct = JSON.parse(await readFile(directPath, "utf8"));
const profiles = Object.entries(capture.profiles);
assert.deepEqual(profiles.map(([name]) => name).sort(), ["dom", "react", "swap"]);
assert.equal(LIFECYCLE_STEPS.length, 26);
assert.equal(LIFECYCLE_STATES.length, 26);

function field(value, key) {
  assert.equal(value?.kind, "struct");
  const found = value.fields.find((row) => row.name === key);
  assert(found, `missing typed field ${key}`);
  return found.value;
}
function str(value) { assert.equal(value?.kind, "string"); return value.string; }
function integer(value) { assert(["uint", "int"].includes(value?.kind)); return Number(value.integer); }
function bool(value) { assert.equal(value?.kind, "bool"); return value.bool; }
function float(value) {
  assert.equal(value?.kind, "float64");
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt(`0x${value.float64Bits}`), false);
  return view.getFloat64(0, false);
}
function decodeNode(encoded, name) {
  const raw = field(encoded, name);
  const counter = field(raw, "Counter");
  return {
    ID: str(field(raw, "ID")),
    ParentID: str(field(raw, "ParentID")),
    Generation: integer(field(raw, "Generation")),
    RequestID: integer(field(raw, "RequestID")),
    Alive: bool(field(raw, "Alive")),
    Requested: bool(field(raw, "Requested")),
    Pending: bool(field(raw, "Pending")),
    Token: str(field(raw, "Token")),
    Reply: str(field(raw, "Reply")),
    Counter: { Count: float(field(counter, "Count")) },
  };
}
function decodeState(encoded) {
  assert.equal(encoded.typeId, `${LIFECYCLE_PACKAGE_PATH}.State`);
  return {
    Parent: decodeNode(encoded, "Parent"),
    Child: decodeNode(encoded, "Child"),
    Grandchild: decodeNode(encoded, "Grandchild"),
    Sibling: decodeNode(encoded, "Sibling"),
    NextRequestID: integer(field(encoded, "NextRequestID")),
  };
}

const expectedSnapshotTicks = [...Array.from({ length: 9 }, (_, i) => i), 8,
  ...Array.from({ length: 17 }, (_, i) => i + 9)];
assert.equal(expectedSnapshotTicks.length, 27);
const profileSummary = {};
for (const [name, profile] of profiles) {
  assert.equal(profile.componentId, LIFECYCLE_PACKAGE_PATH);
  assert.equal(profile.appId, LIFECYCLE_PACKAGE_PATH);
  assert.deepEqual(profile.pageErrors, []);
  assert.deepEqual(profile.noWasm, { apiAttempts: [], wasmRequests: [] });
  assert.equal(profile.trace.ticks.length, 26);
  assert.equal(profile.events.length, 26);
  assert.equal(profile.snapshots.length, 27);
  assert.equal(profile.actions.length, 16);
  assert.deepEqual(profile.pendingAtEnd, []);
  assert.deepEqual(profile.snapshots.map((row) => row.stateIndex), expectedSnapshotTicks);

  const clickSteps = LIFECYCLE_STEPS.map((step, eventIndex) => ({ step, eventIndex }))
    .filter(({ step }) => step.kind === "click");
  assert.equal(clickSteps.length, 16);
  for (let i = 0; i < clickSteps.length; i += 1) {
    const { step, eventIndex } = clickSteps[i];
    const action = profile.actions[i];
    assert.equal(action.eventIndex, eventIndex);
    assert.equal(action.method, "HTMLElement.click");
    assert.equal(action.attempted, true);
    assert.equal(action.target.connected, true);
    assert.equal(action.target.disabled, false);
    assert.equal(action.target.value, step.action.value);
    assert.deepEqual(action.action, step.action);
    assert.deepEqual(action.expectedMessage, step.message);
    assert.equal(action.observed.action.path, step.action.path);
    assert.deepEqual(action.observed.message, { Name: step.message.name, Arg: step.message.arg });
    assert.equal(action.afterTicks, action.beforeTicks + 1);
  }

  for (const [i, snapshot] of profile.snapshots.entries()) {
    const state = expectedLifecycleStateAtTick(snapshot.stateIndex);
    const view = expectedLifecycleView(state);
    const dom = expectedLifecycleDOM(state);
    assert.equal(snapshot.traceTickIndex, snapshot.stateIndex, `${name} physical snapshot ${i} tick binding`);
    assert.deepEqual(decodeState(snapshot.runtimeSnapshot.state), state, `${name} snapshot ${i} decoded typed state`);
    assert.deepEqual(snapshot.runtimeSnapshot.view, view, `${name} snapshot ${i} literal View`);
    assert.deepEqual(snapshot.traceTick.view, view, `${name} snapshot ${i} tick View`);
    assert.deepEqual(snapshot.rendererSnapshot, dom, `${name} snapshot ${i} renderer snapshot`);
    assert.deepEqual(snapshot.physicalDOM, dom, `${name} snapshot ${i} captured physical DOM`);
    assert.equal(snapshot.physicalDOM.normalization, "outerHTML-v1");
    assert.equal(snapshot.physicalDOM.html, dom.html, `${name} snapshot ${i} outerHTML`);
    assert.deepEqual(snapshot.physicalDOM.controls,
      expectedLifecyclePhysicalControls(state).map(({ text: _text, ...control }) => control),
      `${name} snapshot ${i} live control properties`);
    assert.deepEqual(snapshot.expectedDOM, dom, `${name} snapshot ${i} literal DOM oracle`);
  }

  const removed = profile.snapshots.find((x) => x.eventIndex === 9);
  const remounted = profile.snapshots.find((x) => x.eventIndex === 10);
  assert(removed && remounted);
  assert.match(removed.physicalDOM.html, /Parent: removed/);
  assert(!removed.physicalDOM.html.includes("lifecycle-child"));
  assert(!removed.physicalDOM.html.includes("lifecycle-grandchild"));
  assert(removed.physicalDOM.html.includes("Sibling: live; count=1; pending sibling:g1:r4"));
  assert(remounted.physicalDOM.html.includes("lifecycle-parent"));
  assert(remounted.physicalDOM.html.includes("lifecycle-child"));
  assert(remounted.physicalDOM.html.includes("lifecycle-grandchild"));
  assert(!remounted.physicalDOM.html.includes("Parent: removed"));
  assert(remounted.physicalDOM.html.includes("Sibling: live; count=1; pending sibling:g1:r4"));

  const records = profile.effectRecords;
  assert.deepEqual(records.filter((x) => x.kind === "request").map((x) => x.token), [
    "parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4",
    "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7",
  ]);
  assert.deepEqual(records.filter((x) => x.kind === "cancel").map((x) => [x.token, x.outcome]), [
    ["grandchild:g1:r3", "cancelled"], ["child:g1:r2", "cancelled"], ["parent:g1:r1", "cancelled"],
  ]);
  assert.deepEqual(records.filter((x) => x.kind === "force-deliver-retired").map((x) => [x.token, x.outcome]), [
    ["grandchild:g1:r3", "rejected"], ["child:g1:r2", "rejected"], ["parent:g1:r1", "rejected"],
  ]);
  assert.deepEqual(records.filter((x) => x.kind === "deliver").map((x) => [x.token, x.outcome]), [
    ["sibling:g1:r4", "accepted"], ["grandchild:g2:r7", "accepted"],
    ["child:g2:r6", "accepted"], ["parent:g2:r5", "accepted"],
  ]);
  assert.equal(profile.probes.length, 5);
  assert.deepEqual(profile.probes.map((x) => [x.token, x.result.accepted, x.result.error, x.tickCount]), [
    ["grandchild:g1:r3", false, "unknown or extra effect completion", 10],
    ["child:g1:r2", false, "unknown or extra effect completion", 10],
    ["parent:g1:r1", false, "unknown or extra effect completion", 10],
    ["sibling:g1:r4", false, "effect completion already delivered", 15],
    ["child:g2:r6", false, "effect completion already delivered", 25],
  ]);
  assert.deepEqual(profile.unmount.physicalDOM, { html: "", controls: 0 });

  const detached = profile.stalePhysicalClicks;
  assert.equal(detached.length, 1);
  assert.equal(detached[0].eventIndex, 10);
  assert.equal(detached[0].attempts.length, 6);
  assert.deepEqual(detached[0].attempts.map((x) => x.path), [
    "0/1", "0/2", "0/3/1", "0/3/2", "0/3/3/1", "0/3/3/2",
  ]);
  assert(detached[0].attempts.every((x) => x.method === "retained-detached-HTMLElement.click"));
  assert(detached[0].attempts.every((x) => x.attempted && x.targetBefore.connected === false && x.targetConnectedAfter === false));
  assert.deepEqual(detached[0].before, detached[0].after);

  if (name === "swap") {
    assert.equal(profile.swaps.length, 17);
    assert.equal(profile.rendererSequence.length, 18);
    const eligible = profile.swaps.filter((x) => x.after.retiredCallbacks.eligible);
    assert.equal(eligible.length, 16);
    assert.equal(profile.swaps.length - eligible.length, 1);
    assert.deepEqual(profile.callbackCounts, { dispatch: 32, stale: 16 });
    let oldCallbackProbeCount = 0;
    for (const swap of profile.swaps) {
      assert.deepEqual(swap.before.trace, swap.after.trace);
      assert.deepEqual(swap.before.snapshot, swap.after.snapshot);
      assert.deepEqual(swap.before.pending, swap.after.pending);
      assert.deepEqual(swap.before.effectRecords, swap.after.effectRecords);
      if (!swap.after.retiredCallbacks.eligible) continue;
      for (const kind of ["dispatch", "stale"]) {
        oldCallbackProbeCount += 1;
        assert.equal(swap.after.retiredCallbacks[kind].accepted, false);
        assert.equal(swap.after.retiredCallbacks[kind].stale, true);
        assert.equal(swap.after.retiredCallbacks[kind].error, "renderer callback fenced after replacement");
      }
    }
    assert.equal(oldCallbackProbeCount, 32);
    profileSummary[name] = { ticks: 26, snapshots: 27, swaps: 17, rendererInstances: 18,
      callbacksFenced: oldCallbackProbeCount, retiredClicks: 6, cancels: 3 };
  } else {
    assert.deepEqual(profile.swaps, []);
    profileSummary[name] = { ticks: 26, snapshots: 27, swaps: 0, retiredClicks: 6, cancels: 3 };
  }
}

for (let i = 0; i < direct.trace.ticks.length; i += 1) {
  for (const profile of Object.values(capture.profiles)) {
    assert.deepEqual(profile.trace.ticks[i].state, direct.trace.ticks[i].state);
    assert.deepEqual(profile.trace.ticks[i].view, direct.trace.ticks[i].view);
    assert.deepEqual(profile.trace.ticks[i].requestedEffects, direct.trace.ticks[i].requestedEffects);
    assert.deepEqual(profile.trace.ticks[i].completedEffects, direct.trace.ticks[i].completedEffects);
  }
}
const report = {
  schema: "gobi.compiled-lifecycle-independent-dom-recheck/v1",
  capturePath,
  captureBytes: captureBytes.length,
  captureSha256: captureHash,
  profiles: profileSummary,
  scope: "Independent field-by-field review of captured compiled/browser state, View, physical DOM, cancellation, swap, detached-control, and direct trace evidence; native comparison is absent in the failed hosted run.",
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
