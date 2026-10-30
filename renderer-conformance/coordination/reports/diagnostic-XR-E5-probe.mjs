import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  addNativeComparisons,
  compareEveryTick,
  compareObservations,
  nativeTick,
  requireNativeComparison,
  validateContractSnapshots,
} from "../../check.mjs";
import { expectedProbeNames } from "../../adversarial.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CLI = join(ROOT, "renderer-conformance/build/render-contract");
const GO = "/tmp/gondola-go/bin/go";
const actorNames = ["dom", "react", "godom", "reference"];
const candidates = ["dom", "react", "godom"];

const fixturePack = JSON.parse(await readFile(join(ROOT, "renderer-conformance/build/fixtures.json"), "utf8"));
const baseSnapshot = JSON.parse(fixturePack.fixtures.find((fixture) => fixture.expectedValid).raw);
const baseHTML = '<div class="probe"></div>';

function observation(lane, focus = null) {
  return {
    snapshot: { ...structuredClone(baseSnapshot), state: { Rows: [{ ID: 1, Draft: "draft" }] } },
    audit: [],
    transportLog: [],
    serverRequests: [],
    serverLane: lane,
    backendName: lane.replace(/^lane-/, ""),
    runtimeCalls: { init: 1, snapshot: 1, dispatch: 0, complete: 0, effects: 0, audit: 1, encodeHTTP: 0, decodeHTTP: 0 },
    pending: [],
    dom: {
      html: baseHTML,
      root: baseHTML,
      disabled: [],
      inputPath: "0",
      inputValue: "draft",
      inputDisabled: false,
      controls: [{ path: "0", tag: "input", value: "draft", disabled: false }],
      order: ["row-1"],
      reportedHTML: baseHTML,
      reportedDisabled: [],
    },
    liveProps: [{ path: "0", tag: "input", value: "draft", defaultValue: "draft", disabled: false }],
    focus,
  };
}

function makeResult() {
  const focused = { key: "row-1-input", selectionStart: 2, selectionEnd: 4, selectionDirection: "forward" };
  const delivery = () => Object.fromEntries(actorNames.map((name) => [name, { dispatchDelta: 0, disabledTarget: null }]));
  const ticks = [
    { index: 0, action: null, deliveries: null, observations: Object.fromEntries(actorNames.map((name) => [name, observation(`lane-${name}`)])) },
    { index: 1, action: { kind: "focus", rowID: 1, selectionStart: 2, selectionEnd: 4, selectionDirection: "forward" }, deliveries: delivery(), observations: Object.fromEntries(actorNames.map((name) => [name, observation(`lane-${name}`, structuredClone(focused))])) },
    { index: 2, action: { kind: "release", id: 1 }, deliveries: delivery(), observations: Object.fromEntries(actorNames.map((name) => [name, observation(`lane-${name}`, structuredClone(focused))])) },
  ];
  const probes = expectedProbeNames.map((name) => ({
    name,
    kind: name === "manifest-version-and-capability-reject-before-init-mount-or-transport" ? "registry-contract" : "real-go",
    pass: true,
  }));
  return {
    scenarios: [{ name: "probe-script", seed: 17, actions: [{ kind: "focus" }, { kind: "release" }], ticks }],
    adversarial: { ok: true, moduleExpectedProbeNames: [...expectedProbeNames], probes },
    goErrors: [],
    pageErrors: [],
  };
}

const clean = makeResult();
assert.deepEqual(compareEveryTick(clean, [17]), [], "the complete synthetic four-actor trace is green");

function focusScenario(action, draft, focusForActor = () => ({
  key: `row-${action.rowID}-input`,
  selectionStart: action.selectionStart,
  selectionEnd: action.selectionEnd,
  selectionDirection: action.selectionDirection ?? "none",
})) {
  const before = Object.fromEntries(actorNames.map((name) => [name, observation(`lane-${name}`)]));
  const after = structuredClone(before);
  for (const name of actorNames) {
    for (const value of [before[name], after[name]]) value.snapshot.state = { Rows: [{ ID: action.rowID, Draft: draft }] };
    after[name].focus = focusForActor(name);
  }
  return {
    name: "focus-witness-probe",
    seed: 19,
    actions: [action],
    ticks: [
      { index: 0, action: null, deliveries: null, observations: before },
      {
        index: 1,
        action,
        step: { Path: "0", Event: "focus", Value: "" },
        deliveries: Object.fromEntries(actorNames.map((name) => [name, { dispatchDelta: 0, disabledTarget: null }])),
        observations: after,
      },
    ],
  };
}

function fillScenario(action) {
  const before = Object.fromEntries(actorNames.map((name) => [name, observation(`lane-${name}`)]));
  const after = structuredClone(before);
  const canonicalValue = String(action.value ?? "").replace(/[\r\n]/g, "");
  for (const name of actorNames) {
    const start = before[name];
    const end = after[name];
    for (const value of [start, end]) value.snapshot.state = { Rows: [{ ID: action.rowID, Draft: value === start ? "before" : canonicalValue }] };
    start.snapshot.messages = [];
    start.snapshot.tree.Kids = [{
      Kind: 1, Tag: "input", Key: `row-${action.rowID}-input`,
      Attrs: [{ Name: "type", Value: "text", Flag: false, Style: null }], On: null, Kids: null, Text: "",
    }];
    start.snapshot.bindings = [{ Path: "0", Event: "input", Message: "edit/1", Source: "target.value" }];
    start.dom.inputValue = "before";
    start.dom.controls = [{ path: "0", tag: "input", type: "text", value: "before", disabled: false }];
    start.liveProps = [{ path: "0", tag: "input", value: "before", defaultValue: "before", disabled: false }];
    end.snapshot.messages = [{ Name: "edit/1", Arg: canonicalValue }];
    end.dom.inputValue = canonicalValue;
    end.dom.controls = [{ path: "0", tag: "input", type: "text", value: canonicalValue, disabled: false }];
    end.liveProps = [{ path: "0", tag: "input", value: canonicalValue, defaultValue: canonicalValue, disabled: false }];
    end.runtimeCalls.dispatch = start.runtimeCalls.dispatch + 1;
  }
  return {
    name: "text-input-sanitization-probe",
    seed: 19,
    actions: [action],
    ticks: [
      { index: 0, action: null, deliveries: null, observations: before },
      {
        index: 1,
        action,
        step: { Path: "0", Event: "input", Value: action.value },
        deliveries: Object.fromEntries(actorNames.map((name) => [name, { dispatchDelta: 1, disabledTarget: false }])),
        observations: after,
      },
    ],
  };
}

const compareScenario = (scenario) => compareEveryTick({
  scenarios: [scenario],
  adversarial: { ok: true, expectedProbeNames: [], probes: [] },
}, [19]);

const collapsedFocusAction = { kind: "focus", rowID: 1, selectionStart: 0, selectionEnd: 0, selectionDirection: "backward" };
const collapsedFocus = focusScenario(collapsedFocusAction, "draft", () => ({
  key: "row-1-input", selectionStart: 0, selectionEnd: 0, selectionDirection: "forward",
}));
const collapsedDirectionMismatches = compareScenario(collapsedFocus);
assert.deepEqual(collapsedDirectionMismatches, [], "browser-normalized collapsed direction is ignored");
collapsedFocus.ticks[1].observations.godom.focus.selectionDirection = "backward";
const collapsedPeerDirectionMismatches = compareScenario(collapsedFocus);
assert.deepEqual(collapsedPeerDirectionMismatches, [], "collapsed direction differences carry no selection semantics");
collapsedFocus.ticks[1].observations.godom.focus.key = "wrong-key";
const collapsedKeyMismatch = compareScenario(collapsedFocus);
assert.ok(collapsedKeyMismatch.some((mismatch) => mismatch.field === "focus-witness" && mismatch.candidate === "godom"));

const clampedFocus = focusScenario(
  { kind: "focus", rowID: 1, selectionStart: 0, selectionEnd: 99, selectionDirection: "forward" },
  "abc",
  () => ({ key: "row-1-input", selectionStart: 0, selectionEnd: 3, selectionDirection: "forward" }),
);
const clampedFocusMismatches = compareScenario(clampedFocus);
assert.deepEqual(clampedFocusMismatches, [], "selection end is clamped to the controlled text length");

const noncollapsedFocus = focusScenario(
  { kind: "focus", rowID: 1, selectionStart: 0, selectionEnd: 2, selectionDirection: "backward" },
  "abc",
  () => ({ key: "row-1-input", selectionStart: 0, selectionEnd: 2, selectionDirection: "forward" }),
);
const noncollapsedFocusMismatches = compareScenario(noncollapsedFocus);
assert.ok(noncollapsedFocusMismatches.some((mismatch) => mismatch.field === "focus-witness"));

const unspecifiedDirectionFocus = focusScenario(
  { kind: "focus", rowID: 1, selectionStart: 0, selectionEnd: 2, selectionDirection: "none" },
  "abc",
  () => ({ key: "row-1-input", selectionStart: 0, selectionEnd: 2, selectionDirection: "forward" }),
);
const unspecifiedDirectionMismatches = compareScenario(unspecifiedDirectionFocus);
assert.deepEqual(unspecifiedDirectionMismatches, [], "Chromium default direction is accepted when the action requested none");
unspecifiedDirectionFocus.ticks[1].observations.godom.focus.selectionDirection = "backward";
const unspecifiedDirectionPeerMismatch = compareScenario(unspecifiedDirectionFocus);
assert.ok(unspecifiedDirectionPeerMismatch.some((mismatch) => mismatch.field === "focus" && mismatch.candidate === "godom"),
  "actual focus direction parity remains enforced for noncollapsed ranges");

const whitespaceNewlineAction = { kind: "fill", rowID: 1, value: "  exact whitespace\n" };
const normalizedFill = fillScenario(whitespaceNewlineAction);
const normalizedFillMismatches = compareScenario(normalizedFill);
assert.deepEqual(normalizedFillMismatches, [], "CR/LF is browser-sanitized while surrounding spaces remain");
normalizedFill.ticks[1].observations.godom.snapshot.messages[0].Arg = "exact whitespace";
const trimmedFillMismatches = compareScenario(normalizedFill);
assert.ok(trimmedFillMismatches.some((mismatch) => mismatch.field === "dispatch-message" && mismatch.candidate === "godom"),
  "trimming spaces beyond CR/LF must still fail");

const channelMutations = [
  ["snapshot.state", (o) => { o.snapshot.state.probe = "changed"; }],
  ["snapshot.tree", (o) => { o.snapshot.tree.Key = "changed"; }],
  ["snapshot.bindings", (o) => { o.snapshot.bindings[0].Message = "changed"; }],
  ["snapshot.messages", (o) => { o.snapshot.messages.push({ Name: "changed", Arg: "" }); }],
  ["audit", (o) => { o.audit.push({ ID: 99 }); }],
  ["transportLog", (o) => { o.transportLog.push({ Kind: "changed", ID: 99 }); }],
  ["serverRequests", (o) => { o.serverRequests.push({ ID: 99 }); }],
  ["pending", (o) => { o.pending.push({ ID: 99 }); }],
  ["dom.html", (o) => { o.dom.html += "!"; }],
  ["dom.root", (o) => { o.dom.root += "!"; }],
  ["dom.disabled", (o) => { o.dom.disabled.push("0"); }],
  ["dom.inputPath", (o) => { o.dom.inputPath = "9"; }],
  ["dom.inputValue", (o) => { o.dom.inputValue = "changed"; }],
  ["dom.inputDisabled", (o) => { o.dom.inputDisabled = true; }],
  ["dom.controls", (o) => { o.dom.controls[0].disabled = true; }],
  ["dom.order", (o) => { o.dom.order.reverse(); o.dom.order.push("changed"); }],
  ["dom.reportedHTML", (o) => { o.dom.reportedHTML += "!"; }],
  ["dom.reportedDisabled", (o) => { o.dom.reportedDisabled.push("0"); }],
  ["liveProps", (o) => { o.liveProps[0].value = "changed"; }],
  ["focus", (o) => { o.focus.selectionStart += 1; }],
];

const channelResults = [];
for (const [field, mutate] of channelMutations) {
  const result = structuredClone(clean);
  mutate(result.scenarios[0].ticks[2].observations.godom);
  const mismatches = compareEveryTick(result, [17]);
  const expectedField = field.startsWith("snapshot.") ? field.slice("snapshot.".length) : field;
  assert.ok(mismatches.some((mismatch) => mismatch.field === expectedField || mismatch.field === "focus"), field);
  channelResults.push({ field, caught: true, mismatchCount: mismatches.length });
}

const missingActor = structuredClone(clean);
delete missingActor.scenarios[0].ticks[2].observations.godom;
const missingActorMismatches = compareEveryTick(missingActor, [17]);
assert.ok(missingActorMismatches.some((mismatch) => mismatch.field === "unique-lanes"));

const duplicatedLane = structuredClone(clean);
duplicatedLane.scenarios[0].ticks[2].observations.godom.serverLane = "lane-reference";
const laneMismatches = compareEveryTick(duplicatedLane, [17]);
assert.ok(laneMismatches.some((mismatch) => mismatch.field === "unique-lanes"));

const preFocusDifference = structuredClone(clean);
preFocusDifference.scenarios[0].ticks[0].observations.godom.focus = { key: "different", selectionStart: 0 };
assert.ok(!compareEveryTick(preFocusDifference, [17]).some((mismatch) => mismatch.field === "focus"));

const allActorsMissingFocus = structuredClone(clean);
for (const tick of allActorsMissingFocus.scenarios[0].ticks.slice(1)) {
  for (const participant of actorNames) tick.observations[participant].focus = null;
}
const allActorsMissingFocusMismatches = compareEveryTick(allActorsMissingFocus, [17]);

const commonMissingFields = ["audit", "transportLog", "serverRequests", "pending", "dom", "liveProps", "runtimeCalls"];
const commonMissingResults = [];
for (const field of commonMissingFields) {
  const result = structuredClone(clean);
  for (const participant of actorNames) delete result.scenarios[0].ticks[2].observations[participant][field];
  const mismatches = compareEveryTick(result, [17]);
  commonMissingResults.push({ field, mismatchCount: mismatches.length, status: mismatches.length === 0 ? "GREEN_BYPASS" : "caught" });
}

const skippedAdd = structuredClone(clean);
skippedAdd.scenarios[0].actions[0] = { kind: "add" };
skippedAdd.scenarios[0].ticks[1].action = { kind: "add" };
const skippedAddMismatches = compareEveryTick(skippedAdd, [17]);

const missingProbe = structuredClone(clean);
missingProbe.adversarial.probes.pop();
const probeMismatches = compareEveryTick(missingProbe, [17]);
assert.ok(probeMismatches.some((mismatch) => mismatch.field === "required-probes"));

const missingCandidateTick = structuredClone(clean);
missingCandidateTick.scenarios[0].ticks.pop();
const tickCountMismatches = compareEveryTick(missingCandidateTick, [17]);
assert.ok(tickCountMismatches.some((mismatch) => mismatch.field === "tick-count"));

const contractResult = (mutate = null) => {
  const snapshots = Object.fromEntries(candidates.map((candidate) => [candidate, { snapshot: structuredClone(baseSnapshot) }]));
  if (mutate) mutate(snapshots);
  return { scenarios: [{ name: "contract-probe", seed: 17, ticks: [{ index: 0, observations: snapshots }] }] };
};
const validContract = validateContractSnapshots(contractResult(), { status: "ready", file: CLI });
assert.equal(validContract.status, "matched");
assert.equal(validContract.observations, 3);
assert.equal(validContract.uniqueSnapshots, 1);
assert.equal(validContract.cachedObservations, 2);
const invalidContract = validateContractSnapshots(contractResult((snapshots) => { snapshots.godom.snapshot.tree.Kind = 3; }), { status: "ready", file: CLI });
assert.equal(invalidContract.status, "failed");
assert.equal(invalidContract.failures.length, 1);
assert.equal(invalidContract.failures[0].candidate, "godom");
const missingContractSnapshot = validateContractSnapshots(contractResult((snapshots) => { delete snapshots.react.snapshot; }), { status: "ready", file: CLI });
assert.equal(missingContractSnapshot.status, "failed");
assert.equal(missingContractSnapshot.failures[0].candidate, "react");
const unavailableContract = validateContractSnapshots(contractResult(), { status: "unavailable", error: "missing Go" });
assert.equal(unavailableContract.status, "failed");
assert.equal(unavailableContract.observations, 0);

const nativeDir = await mkdtemp(join(tmpdir(), "xr-e5-native-"));
try {
  const comparator = join(nativeDir, "compare-interaction");
  const build = spawnSync(GO, ["build", "-o", comparator, "./cmd/compare-interaction"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, GOTOOLCHAIN: "local" },
  });
  assert.equal(build.status, 0, build.stderr || build.error?.message || "native comparator build failed");
  const scenariosFor = (mutate = null) => {
    const before = Object.fromEntries(["reference", ...candidates].map((candidate) => [candidate, observation(`lane-${candidate}`)]));
    const after = structuredClone(before);
    const ticks = [
      { index: 0, action: null, step: null, observations: before },
      { index: 1, action: { kind: "fill", rowID: 1, value: "draft" }, step: { Path: "0", Event: "input", Value: "draft" }, observations: after },
    ];
    const nativeTicks = ticks.map((tick) => Object.fromEntries(Object.entries(tick.observations).map(([candidate, value]) => [
      candidate,
      nativeTick(tick.index, tick.action ? tick.step : null, value),
    ])));
    if (mutate) mutate(nativeTicks);
    return { scenarios: [{ name: "native-probe", seed: 17, ticks, nativeTicks }] };
  };
  const nativeCommand = { status: "ready", file: comparator, args: [], command: [comparator] };
  const nativeMismatches = [];
  const nativeGood = await addNativeComparisons(scenariosFor(), nativeDir, nativeCommand, nativeMismatches);
  assert.equal(nativeGood.status, "matched");
  assert.equal(nativeGood.scenarios.length, 3);
  assert.equal(nativeMismatches.length, 0);
  const nativeCoreFields = ["Index", "Step", "State", "Tree", "DOM"];
  const nativeFieldResults = [];
  for (const field of nativeCoreFields) {
    const mismatches = [];
    const result = await addNativeComparisons(scenariosFor((ticks) => {
      const value = ticks[1].godom[field];
      ticks[1].godom[field] = field === "Index" ? value + 1 : field === "Step" ? { Path: "9", Event: "input", Value: "wrong" } : `${value} changed`;
    }), nativeDir, nativeCommand, mismatches);
    assert.equal(result.status, "failed", `${field} mutation must fail the native gate`);
    assert.ok(mismatches.some((mismatch) => mismatch.candidate === "godom"));
    nativeFieldResults.push({ field, caught: true });
  }
  const nativeExtraFieldMutation = [];
  const supplementalResult = await addNativeComparisons(scenariosFor((ticks) => {
    ticks[1].godom.Bindings = "changed";
  }), nativeDir, nativeCommand, nativeExtraFieldMutation);
  const nativeAllCoreFieldsMissing = [];
  const emptyNative = await addNativeComparisons(scenariosFor((ticks) => {
    for (const tick of ticks) {
      for (const participant of ["reference", ...candidates]) {
        tick[participant].State = "";
        tick[participant].Tree = "";
        tick[participant].DOM = "";
        tick[participant].Step = { Path: "", Event: "", Value: "" };
      }
    }
  }), nativeDir, nativeCommand, nativeAllCoreFieldsMissing);
  const nativeAdmission = requireNativeComparison({
    status: "matched",
    scenarios: ["dom", "react", "godom"].map((candidate) => ({ script: "one", candidate, status: "matched" })),
  });
  assert.equal(nativeAdmission.status, "matched");
  const nativeMutants = [
    { script: "one", candidate: "dom", status: "matched" },
    { script: "one", candidate: "react", status: "mismatch" },
    { script: "one", candidate: "godom", status: "matched" },
  ];
  let nativeCounterfactualsCaught = 0;
  for (let index = 0; index < nativeMutants.length; index += 1) {
    const result = { status: "matched", scenarios: nativeMutants.map((item) => ({ ...item })) };
    if (index === 0) result.scenarios.shift();
    else if (index === 1) result.scenarios[1].status = "failed";
    else result.scenarios.push({ script: "one", candidate: "godom", status: "matched" });
    try { requireNativeComparison(result); }
    catch { nativeCounterfactualsCaught += 1; }
  }
  assert.equal(nativeCounterfactualsCaught, nativeMutants.length);

  console.log(JSON.stringify({
    fourActorBaseline: "matched",
    focusNormalization: {
      collapsedBrowserDirectionMismatchAccepted: collapsedDirectionMismatches.length === 0,
      collapsedActorDirectionDifferenceAccepted: collapsedPeerDirectionMismatches.length === 0,
      wrongFocusKeyCaught: collapsedKeyMismatch.some((mismatch) => mismatch.field === "focus-witness" && mismatch.candidate === "godom"),
      selectionRangeClamped: clampedFocusMismatches.length === 0,
      explicitNoncollapsedDirectionMismatchCaught: noncollapsedFocusMismatches.some((mismatch) => mismatch.field === "focus-witness"),
      unspecifiedNoncollapsedDirectionAccepted: unspecifiedDirectionMismatches.length === 0,
      actualNoncollapsedDirectionParityEnforced: unspecifiedDirectionPeerMismatch.some((mismatch) => mismatch.field === "focus" && mismatch.candidate === "godom"),
    },
    textInputNormalization: {
      CRLFOnlyRemovedAndSpacesPreserved: normalizedFillMismatches.length === 0,
      additionalSpaceTrimmingCaught: trimmedFillMismatches.some((mismatch) => mismatch.field === "dispatch-message" && mismatch.candidate === "godom"),
    },
    observationChannelsMutatedIndividually: channelResults,
    missingActorCaught: true,
    duplicatedActorLaneCaught: true,
    oneActorFocusMutationCaught: channelResults.find(({ field }) => field === "focus")?.caught,
    focusDifferenceBeforeExplicitActionIgnored: true,
    focusNullForAllActorsAfterExplicitAction: allActorsMissingFocusMismatches.length === 0 ? "GREEN_BYPASS" : "caught",
    commonObservationFieldRemovedFromAllActors: commonMissingResults,
    synchronizedAddWithUnchangedFourActorObservations: skippedAddMismatches.length === 0 ? "GREEN_BYPASS" : "caught",
    missingRequiredAdversarialProbeCaught: true,
    missingTickCaught: true,
    contractValidation: {
      validObservations: validContract.observations,
      uniqueSnapshots: validContract.uniqueSnapshots,
      cachedObservations: validContract.cachedObservations,
      invalidCandidateCaught: invalidContract.failures[0].candidate,
      missingSnapshotCaught: missingContractSnapshot.failures[0].candidate,
      unavailableCLIRejected: unavailableContract.status === "failed",
    },
    nativeGate: {
      requiredCandidateComparisons: nativeGood.scenarios.map(({ candidate }) => candidate),
      coreFieldsMutatedIndividually: nativeFieldResults,
      supplementalBindingsMutationStatus: supplementalResult.status,
      allNativeStateTreeDOMAndActionStepsEmptyAcrossActors: emptyNative.status,
      incompleteFailedAndDuplicateNativeSetsCaught: nativeCounterfactualsCaught,
    },
  }, null, 2));
} finally {
  await rm(nativeDir, { recursive: true, force: true });
}
