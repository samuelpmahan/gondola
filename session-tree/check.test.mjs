import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { add, fill, fixedScripts, save } from "./scripts.mjs";
import {
  derivePostorder,
  expectedNativeStep,
  makeBilateralDisabledControlNegatives,
  makeCancelOrderNegative,
  normalizeFocus,
  validateNativeCoverage,
  validateScenario,
  writeRawArtifacts,
} from "./check.mjs";

function observedSession(name, sessionID, parentID, depth, rows) {
  const inputs = rows.map((row, index) => ({ key: `Row ${row.ID}`, path: `2/${index}/0`, value: row.Draft,
    disabled: false, selectionStart: 0, selectionEnd: 0, selectionDirection: "none", token: index + 10 }));
  const controls = [
    { tag: "button", className: "add", rowLabel: null, path: "0", text: "Add row", value: null, disabled: rows.length >= 4 },
    { tag: "button", className: "reset", rowLabel: null, path: "1", text: "Reset", value: null, disabled: rows.length === 0 },
  ];
  rows.forEach((row, index) => {
    const label = `Row ${row.ID}`;
    controls.push(
      { tag: "button", className: "save", rowLabel: label, path: `2/${index}/5`, text: "Save", value: null, disabled: row.Draft === "" },
      { tag: "button", className: "cancel", rowLabel: label, path: `2/${index}/8`, text: "Cancel", value: null, disabled: row.PendingID === 0 },
      { tag: "button", className: "up", rowLabel: label, path: `2/${index}/7`, text: "Up", value: null, disabled: index === 0 },
    );
  });
  const snapshot = { state: { Rows: rows, NextID: rows.length, NextRequestID: 1 }, tree: {}, bindings: [], messages: [] };
  const dom = "<div></div>";
  return {
    name, sessionID, parentID, parentName: parentID === 0 ? null : "oak", depth, generation: 1, hostGeneration: 1,
    backend: "dom", managerSnapshot: snapshot, snapshot, hostSnapshot: snapshot, audit: [], managerAudit: [],
    domSnapshot: { html: dom, disabled: controls.filter((item) => item.disabled).map((item) => item.path).sort() },
    focus: null, lifecycle: "active", errors: [], actualDOM: dom, shellHTML: "", controls, inputs,
    inputOrder: rows.map((row) => `Row ${row.ID}`), expectedInputOrder: rows.map((row) => `Row ${row.ID}`),
    focusWitness: null, shellToken: sessionID + 10, viewRootToken: sessionID + 20, childrenRootToken: sessionID + 30,
    shellChildTokens: [sessionID + 20, sessionID + 30], shellOrderValid: true, physicalParentToken: sessionID + 40,
    physicalParentValid: true, transportLog: [],
  };
}

function observedActor(sessions, transportCalls = []) {
  const managerTree = sessions.map(({ sessionID, parentID, depth }) => ({ SessionID: sessionID, ParentID: parentID, Depth: depth }));
  const ids = sessions.map((session) => session.sessionID).sort((left, right) => left - right);
  return { managerTree, hostTree: structuredClone(managerTree), managerList: ids, sessions,
    snapshotAllIDs: ids, activeIDs: ids, transports: [], transportCalls, rootSlots: [] };
}

function controlScenario(name, rows) {
  const session = observedSession("oak", 1, 0, 1, rows);
  const actor = observedActor([session]);
  const frame = { Index: 0, Step: { Path: "", Event: "", Value: "" }, State: "{}", Tree: "{}", DOM: "<div></div>", Pixels: "", Mutations: 0 };
  return { name, actions: [], ticks: [{ index: 0, action: null, candidate: actor, reference: structuredClone(actor) }],
    nativeSegments: [{ name: "oak", generation: 1, referenceGeneration: 1,
      frames: [{ tickIndex: 0, candidate: frame, reference: structuredClone(frame) }] }] };
}

test("postorder is independently derived with ascending sibling IDs", () => {
  const tree = [
    { SessionID: 1, ParentID: 0, Depth: 1 },
    { SessionID: 2, ParentID: 1, Depth: 2 },
    { SessionID: 3, ParentID: 1, Depth: 2 },
    { SessionID: 4, ParentID: 2, Depth: 3 },
    { SessionID: 5, ParentID: 2, Depth: 3 },
    { SessionID: 6, ParentID: 0, Depth: 1 },
  ];
  assert.deepEqual(derivePostorder(tree, 1), [4, 5, 2, 3, 1]);
  assert.throws(() => derivePostorder([
    { SessionID: 1, ParentID: 2, Depth: 2 },
    { SessionID: 2, ParentID: 1, Depth: 3 },
  ], 1), /cycle/i);
});

test("native steps encode actual collection browser actions", () => {
  const snapshot = {
    state: { Rows: [{ ID: 1 }, { ID: 2 }] },
    bindings: [{ Message: "edit/2", Path: "2/1/0" }],
  };
  assert.deepEqual(expectedNativeStep(add("oak"), snapshot), { Path: "0", Event: "click", Value: "" });
  assert.deepEqual(expectedNativeStep(fill("oak", 2, "two\r\nrows"), snapshot), { Path: "2/1/0", Event: "input", Value: "tworows" });
  assert.deepEqual(expectedNativeStep(save("oak", 2), snapshot), { Path: "2/1/5", Event: "click", Value: "" });
});

test("collapsed selection is normalized; noncollapsed direction stays exact", () => {
  assert.deepEqual(normalizeFocus({ key: "row-1-input", selectionStart: 4, selectionEnd: 4, selectionDirection: "backward" }), {
    key: "row-1-input", selectionStart: 4, selectionEnd: 4, selectionDirection: "none",
  });
  assert.deepEqual(normalizeFocus({ key: "row-1-input", selectionStart: 2, selectionEnd: 6, selectionDirection: "backward" }), {
    key: "row-1-input", selectionStart: 2, selectionEnd: 6, selectionDirection: "backward",
  });
});

test("native comparison channels fail closed when segments are absent or empty", () => {
  const issues = [];
  validateNativeCoverage({ ticks: [], nativeSegments: [] }, issues);
  assert.ok(issues.some(({ field }) => field === "native.missing-segments"));
  const empty = [];
  validateNativeCoverage({ ticks: [], nativeSegments: [{ name: "oak", generation: 1, frames: empty }] }, empty);
  assert.ok(empty.some(({ field }) => field === "native.empty-segment"));
});

test("scenario checker requires all actor channels even when candidate and reference both omit them", () => {
  const scenario = {
    name: "missing-channel-control",
    actions: [],
    ticks: [{ index: 0, action: null, candidate: {}, reference: {} }],
    nativeSegments: [],
  };
  const issues = validateScenario(scenario);
  assert.ok(issues.some(({ field }) => field === "actor.missing.managerTree"));
  assert.ok(issues.some(({ field }) => field === "actor.missing.audit" || field.includes("session")));
  assert.ok(issues.some(({ field }) => field === "native.missing-segments"));
});

test("scenario checker fails closed when both actors omit immediate focus channels", () => {
  const action = { kind: "root", name: "oak", backend: "dom" };
  const actor = { managerTree: [], hostTree: [], managerList: [], sessions: [], snapshotAllIDs: [], activeIDs: [], transports: [], rootSlots: [] };
  const scenario = {
    name: "missing-focus-channel-control",
    actions: [action],
    ticks: [
      { index: 0, action: null, candidate: actor, reference: structuredClone(actor) },
      { index: 1, action, candidate: actor, reference: structuredClone(actor),
        operationResults: [{ side: "candidate" }, { side: "reference" }] },
    ],
    nativeSegments: [{ name: "oak", generation: 1, frames: [{}, {}] }],
  };
  const issues = validateScenario(scenario);
  assert.ok(issues.some(({ field }) => field === "focus.activation-missing"));
  assert.ok(issues.some(({ field }) => field === "focus.post-action-missing"));
});

test("global invocation channel is required from both actors", () => {
  const actor = { managerTree: [], hostTree: [], managerList: [], sessions: [], snapshotAllIDs: [],
    activeIDs: [], transports: [], rootSlots: [] };
  const scenario = { name: "missing-global-transport-control", actions: [],
    ticks: [{ index: 0, action: null, candidate: actor, reference: structuredClone(actor) }], nativeSegments: [] };
  const issues = validateScenario(scenario).filter(({ field }) => field === "actor.missing.transportCalls");
  assert.deepEqual(issues.map(({ actor: side }) => side).sort(), ["candidate", "reference"]);
});

test("global invocation parity compares calls while each actor side stays validated", () => {
  const scenario = controlScenario("transport-provenance", []);
  const call = { sequence: 1, kind: "start", sessionID: 1, generation: 1, hostGeneration: 1,
    requestID: 1, value: "pending", error: "" };
  scenario.ticks[0].candidate.transportCalls = [{ ...call, side: "candidate" }];
  scenario.ticks[0].reference.transportCalls = [{ ...call, side: "reference" }];
  const issues = validateScenario(scenario);
  assert.ok(!issues.some(({ field }) => field === "parity.transport-invocation-order"));

  scenario.ticks[0].candidate.transportCalls[0].side = "reference";
  const wrongProvenance = validateScenario(scenario);
  assert.ok(wrongProvenance.some(({ field, actor }) => field === "actor.transport-call-shape-order" && actor === "candidate"));
});

test("bilateral disabled-control mutations fail the Go-state-derived Add, Reset, and Up checks", () => {
  const row = (ID) => ({ ID, Draft: "", Saved: "", Saves: 0, PendingID: 0, Status: "idle" });
  const inputs = [controlScenario("at-cap", Array.from({ length: 4 }, (_, index) => row(index + 1))),
    controlScenario("empty", []), controlScenario("first-row", [row(1)])];
  const negatives = makeBilateralDisabledControlNegatives(inputs);
  assert.deepEqual(negatives.map(({ kind, status }) => [kind, status]), [
    ["add-at-cap", "mutated"], ["reset-empty", "mutated"], ["up-first-row", "mutated"],
  ]);
  for (const negative of negatives) {
    const issues = validateScenario(negative.scenario).filter(({ field }) => field === negative.expectedField);
    assert.deepEqual(issues.map(({ actor: side }) => side).sort(), ["candidate", "reference"]);
  }
});

test("reordered cross-session cancel calls fail while local histories and bundles remain intact", () => {
  const rowsFor = (value) => [{ ID: 1, Draft: value, Saved: "", Saves: 0, PendingID: 1, Status: "pending" }];
  const beforeSessions = [observedSession("oak", 1, 0, 1, rowsFor("root")),
    observedSession("seed", 2, 1, 2, rowsFor("child"))];
  const beforeTree = [{ SessionID: 1, ParentID: 0, Depth: 1 }, { SessionID: 2, ParentID: 1, Depth: 2 }];
  const bundles = [
    { SessionID: 2, Commands: [{ Kind: "cancel", ID: 1, Value: "" }] },
    { SessionID: 1, Commands: [{ Kind: "cancel", ID: 1, Value: "" }] },
  ];
  const callsFor = (side) => [
    { sequence: 1, side, kind: "cancel", sessionID: 2, generation: 1, hostGeneration: 1, requestID: 1, value: "", error: "" },
    { sequence: 2, side, kind: "cancel", sessionID: 1, generation: 1, hostGeneration: 1, requestID: 1, value: "", error: "" },
  ];
  const beforeActor = (side) => observedActor(beforeSessions, callsFor(side));
  const afterActor = (side) => observedActor([], callsFor(side));
  const action = { kind: "dispose", name: "oak" };
  const resultFor = (side) => ({ side, name: "oak", expectedIDs: [2, 1], expectedNames: ["seed", "oak"],
    returned: structuredClone(bundles), invocationSequenceStart: 1, invocationSequenceEnd: 2,
    actualInvocationDelta: callsFor(side), actualCancelInvocations: callsFor(side),
    beforeTree, afterTree: [], beforeSnapshot: beforeSessions[0].snapshot, beforeSiblings: [], afterSiblings: [],
    focusActivation: { attempted: false, reason: "no-prior-active-focus" }, postActionFocus: [] });
  const frame = { Index: 0, Step: { Path: "", Event: "", Value: "" }, State: "{}", Tree: "{}", DOM: "<div></div>", Pixels: "", Mutations: 0 };
  const scenario = { name: "cancel-order-negative", actions: [action], ticks: [
    { index: 0, action: null, candidate: beforeActor("candidate"), reference: beforeActor("reference") },
    { index: 1, action, candidate: afterActor("candidate"), reference: afterActor("reference"),
      operationResults: [resultFor("candidate"), resultFor("reference")] },
  ], nativeSegments: ["oak", "seed"].map((name) => ({ name, generation: 1, referenceGeneration: 1,
    frames: [{ tickIndex: 0, reference: structuredClone(frame), candidate: structuredClone(frame) }] })) };
  const negative = makeCancelOrderNegative(scenario);
  assert.equal(negative.mutation.status, "reordered");
  assert.equal(negative.mutation.localTransportLogsUnchanged, true);
  assert.equal(negative.mutation.goBundlesUnchanged, true);
  assert.ok(validateScenario(negative.scenario).some(({ field }) => field === "dispose.cancel-invocation-order"));
});

test("fixed schedules retain required nested renderer and disposal witnesses", () => {
  assert.deepEqual(fixedScripts.map(({ actions }) => actions.length), [29, 21, 18]);
  assert.ok(fixedScripts.some(({ actions }) => actions.some((action) => action.kind === "stale-release")));
  assert.ok(fixedScripts.some(({ actions }) => actions.filter((action) => action.kind === "replace").length >= 3));
  const recreation = fixedScripts.find(({ name }) => name === "dispose-fences-late-replies-and-allows-parent-recreation");
  const actions = recreation.actions;
  const stale = actions.findIndex((action) => action.kind === "stale-release" && action.name === "seed");
  const oldDispose = actions.findIndex((action, index) => index < stale && action.kind === "dispose" && action.name === "orchard");
  const newRoot = actions.findIndex((action, index) => index > oldDispose && index < stale && action.kind === "root" && action.name === "orchard");
  const newFruit = actions.findIndex((action, index) => index > newRoot && index < stale && action.kind === "child" && action.name === "fruit");
  const newSeed = actions.findIndex((action, index) => index > newFruit && index < stale && action.kind === "child" && action.name === "seed");
  const newRequest = actions.findIndex((action, index) => index > newSeed && index < stale && action.kind === "save" && action.name === "seed");
  assert.ok(newSeed >= 0 && stale > newSeed);
  assert.equal(newRequest, -1);
});

test("raw evidence shards preserve every scenario and mismatch with verifiable hashes", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "session-tree-raw-evidence-"));
  try {
    const scenarios = [
      { name: "first", seed: 7, actions: [{ kind: "root" }], ticks: [{ candidate: { sessions: [{}] }, reference: { sessions: [{}] } }], nativeSegments: [{ frames: [{}] }] },
      { name: "second", seed: 9, actions: [], ticks: [{ candidate: { sessions: [] }, reference: { sessions: [] } }], nativeSegments: [] },
    ];
    const issues = Array.from({ length: 300 }, (_, index) => ({ field: `control-${index}`, tick: index }));
    const artifacts = await writeRawArtifacts({ scenarios, issues, outputDir, baseName: "bounded-test" });
    assert.equal(artifacts.scenarioFiles.length, 2);
    assert.deepEqual(artifacts.scenarioFiles.map(({ name }) => name), ["first", "second"]);
    assert.ok(artifacts.scenarioFiles.every((entry) => entry.sha256.length === 64));
    assert.equal(artifacts.scenarioFiles[0].globalTicks, 1);
    assert.equal(artifacts.scenarioFiles[0].candidateSessionObservations, 1);
    assert.equal(artifacts.scenarioFiles[0].referenceSessionObservations, 1);
    assert.equal(artifacts.mismatchArtifact.count, 300);
    assert.equal(artifacts.mismatchArtifact.sha256.length, 64);
    const encodedIssues = await readFile(artifacts.mismatchArtifact.path, "utf8");
    assert.equal(JSON.parse(encodedIssues).length, 300);
    assert.equal(createHash("sha256").update(encodedIssues).digest("hex"), artifacts.mismatchArtifact.sha256);
    const encodedScenario = await readFile(artifacts.scenarioFiles[1].path, "utf8");
    assert.deepEqual(JSON.parse(encodedScenario), scenarios[1]);
    assert.equal(createHash("sha256").update(encodedScenario).digest("hex"), artifacts.scenarioFiles[1].sha256);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
