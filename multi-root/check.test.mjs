import test from "node:test";
import assert from "node:assert/strict";
import {
  compareReplayScenario,
  validateNativeSegments,
  validateReplayScenario,
} from "./check.mjs";

const snapshot = (draft = "") => ({
  state: { Rows: [{ ID: 1, Draft: draft, Saved: "", Saves: 0, PendingID: 0, Status: "idle" }], NextID: 1, NextRequestID: 0 },
  tree: { Kind: 1, Tag: "div", Key: "collection", Attrs: [], On: null, Kids: [], Text: "" },
  bindings: [{ Path: "2/0/0", Event: "input", Message: "edit/1", Source: "target.value" }],
  messages: [],
});

const rootObservation = (root, sessionID, draft = "") => ({
  root, mounted: true, sessionID, generation: 1, backend: "dom", snapshot: snapshot(draft), audit: [],
  transportLog: [], serverRequests: [], pending: [], focus: null,
  sessionHistory: [{ sessionID, generation: 1 }],
  dom: { html: "<div></div>", root: "<div></div>", reportedHTML: "<div></div>", disabled: [], controls: [], order: [], reportedDisabled: [], inputPath: null, inputValue: null, inputDisabled: null },
  liveProps: [], lifecycleEvents: [], dispatchCount: 0,
});

const paired = (root, id, draft = "") => ({ candidate: rootObservation(root, id, draft), reference: rootObservation(root, id + 10, draft) });

function scenario({ actions = [], ticks = null, nativeSegments = [] } = {}) {
  const initial = { index: 0, action: null, events: [], roots: { alpha: paired("alpha", 1), beta: paired("beta", 2), gamma: paired("gamma", 3) } };
  let sequence = 0;
  for (const root of ["alpha", "beta", "gamma"]) {
    for (const participant of ["candidate", "reference"]) {
      const observation = initial.roots[root][participant];
      const event = { sequence: ++sequence, kind: "mount", root, participant, sessionID: observation.sessionID, generation: observation.generation };
      initial.events.push(event);
      observation.lifecycleEvents.push({ sequence: event.sequence, kind: event.kind, sessionID: event.sessionID, generation: event.generation });
    }
  }
  return {
    name: "test",
    actions,
    ticks: ticks ?? [initial],
    nativeSegments,
  };
}

test("replay validation fails closed on missing roots and required observation channels", () => {
  const incomplete = scenario();
  delete incomplete.ticks[0].roots.beta;
  delete incomplete.ticks[0].roots.alpha.candidate.transportLog;
  const issues = validateReplayScenario(incomplete);
  assert.ok(issues.some((issue) => issue.field === "actor" && issue.root === "beta"));
  assert.ok(issues.some((issue) => issue.field === "observation-shape.transportLog" && issue.root === "alpha"));
});

test("replay validation rejects active session aliasing and out-of-order event receipts", () => {
  const value = scenario();
  value.ticks[0].roots.gamma.candidate.sessionID = 2;
  value.ticks[0].events = [
    { sequence: 2, kind: "mount", root: "alpha" },
    { sequence: 1, kind: "dispatch", root: "beta" },
  ];
  const issues = validateReplayScenario(value);
  assert.ok(issues.some((issue) => issue.field === "session-alias"));
  assert.ok(issues.some((issue) => issue.field === "event-order"));
});

test("lifecycle trace rejects an observation-only fabricated event", () => {
  const value = scenario();
  assert.deepEqual(validateReplayScenario(value), []);
  value.ticks[0].roots.alpha.candidate.lifecycleEvents = [
    { sequence: 999, kind: "fabricated-event", sessionID: 1 },
  ];
  const issues = validateReplayScenario(value);
  assert.ok(issues.some((issue) => issue.field === "lifecycle-history" && issue.root === "alpha" && issue.participant === "candidate"));
  assert.ok(issues.some((issue) => issue.field === "lifecycleEvents" && issue.root === "alpha"));

  const malformed = scenario();
  malformed.ticks[0].roots.alpha.candidate.lifecycleEvents = [null];
  assert.ok(validateReplayScenario(malformed).some((issue) => issue.field === "lifecycle-history" && issue.root === "alpha"));
});

test("lifecycle events reject duplicate records and wrong session or generation ownership", () => {
  const duplicate = scenario();
  const first = duplicate.ticks[0].events[0];
  duplicate.ticks[0].events.splice(1, 0, { ...first, sequence: 2 });
  duplicate.ticks[0].roots.alpha.candidate.lifecycleEvents.push({ sequence: 2, kind: first.kind, sessionID: first.sessionID, generation: first.generation });
  assert.ok(validateReplayScenario(duplicate).some((issue) => issue.field === "lifecycle-event-semantics"));

  const aliased = scenario();
  aliased.ticks[0].events[0].sessionID = aliased.ticks[0].roots.beta.candidate.sessionID;
  aliased.ticks[0].roots.alpha.candidate.lifecycleEvents[0].sessionID = aliased.ticks[0].roots.beta.candidate.sessionID;
  assert.ok(validateReplayScenario(aliased).some((issue) => issue.field === "lifecycle-event-semantics"));

  const wrongGeneration = scenario();
  wrongGeneration.ticks[0].events[0].generation = 9;
  wrongGeneration.ticks[0].roots.alpha.candidate.lifecycleEvents[0].generation = 9;
  assert.ok(validateReplayScenario(wrongGeneration).some((issue) => issue.field === "lifecycle-event-semantics"));
});

test("failed renderer replacement preserves the accepted backend", () => {
  const value = scenario();
  const next = structuredClone(value.ticks[0]);
  next.index = 1;
  next.action = { kind: "renderer-failure", root: "alpha", backend: "throw-on-mount" };
  next.events = [{ sequence: 7, kind: "renderer-failure", root: "alpha", participant: "candidate", sessionID: 1, backend: "throw-on-mount", error: "failed to mount" }];
  next.roots.alpha.candidate.lifecycleEvents.push({ sequence: 7, kind: "renderer-failure", sessionID: 1, backend: "throw-on-mount", error: "failed to mount" });
  value.actions = [next.action];
  value.ticks.push(next);
  assert.deepEqual(validateReplayScenario(value), []);
  next.roots.alpha.candidate.backend = "react";
  assert.ok(validateReplayScenario(value).some((issue) => issue.field === "backend-transition" && issue.root === "alpha"));
});

test("parity rejects synchronized no-op actions when dispatch receipts and state do not advance", () => {
  const before = scenario();
  const after = structuredClone(before.ticks[0]);
  after.index = 1;
  after.action = { kind: "add", root: "alpha" };
  const value = scenario({ actions: [after.action], ticks: [before.ticks[0], after] });
  const issues = compareReplayScenario(value);
  assert.ok(issues.some((issue) => issue.field === "synchronized-no-op" && issue.root === "alpha"));
});

test("focus witnesses follow the latest root and parity catches replacement selection loss", () => {
  const base = scenario();
  for (const root of ["alpha", "beta"]) {
    base.ticks[0].roots[root] = paired(root, root === "alpha" ? 1 : 2, "abc");
  }
  const withFocus = (pair, key, start, end, direction) => {
    for (const observation of [pair.candidate, pair.reference]) {
      observation.focus = { key, selectionStart: start, selectionEnd: end, selectionDirection: direction };
      observation.dom.inputPath = "2/0/0";
      observation.dom.inputValue = "abc";
      observation.dom.inputDisabled = false;
    }
  };
  const alpha = structuredClone(base.ticks[0]);
  alpha.index = 1;
  alpha.action = { kind: "focus", root: "alpha", rowID: 1, selectionStart: 1, selectionEnd: 2, selectionDirection: "forward" };
  withFocus(alpha.roots.alpha, "row-1-input", 1, 2, "forward");
  const beta = structuredClone(alpha);
  beta.index = 2;
  beta.action = { kind: "focus", root: "beta", rowID: 1, selectionStart: 0, selectionEnd: 1, selectionDirection: "backward" };
  // Alpha's frame lost browser focus when beta received focus. A stale
  // reference witness must not be compared as the active global focus.
  beta.roots.alpha.candidate.focus = null;
  beta.roots.alpha.reference.dom.inputPath = null;
  beta.roots.alpha.reference.dom.inputValue = null;
  beta.roots.alpha.reference.dom.inputDisabled = null;
  withFocus(beta.roots.beta, "row-1-input", 0, 1, "backward");
  const replaced = structuredClone(beta);
  replaced.index = 3;
  replaced.action = { kind: "replace", root: "beta", from: "dom", backend: "dom" };
  replaced.roots.beta.candidate.focus = { key: "row-1-input", selectionStart: 0, selectionEnd: 0, selectionDirection: "forward" };
  for (const observation of [replaced.roots.beta.candidate, replaced.roots.beta.reference]) {
    observation.dom.inputPath = null;
    observation.dom.inputValue = null;
    observation.dom.inputDisabled = null;
  }
  const value = scenario({ actions: [alpha.action, beta.action, replaced.action], ticks: [base.ticks[0], alpha, beta, replaced] });
  const focusIssues = compareReplayScenario(value).filter((issue) => issue.field === "focus" || issue.field === "focus-witness");
  assert.ok(focusIssues.some((issue) => issue.field === "focus" && issue.tick === 3 && issue.root === "beta"));
  assert.ok(!focusIssues.some((issue) => issue.field === "focus-witness"));
});

test("collapsed selection direction is normalized because no selection is directional", () => {
  const before = scenario();
  const after = structuredClone(before.ticks[0]);
  after.index = 1;
  after.action = { kind: "focus", root: "alpha", rowID: 1, selectionStart: 0, selectionEnd: 0, selectionDirection: "backward" };
  after.roots.alpha.candidate.focus = { key: "row-1-input", selectionStart: 0, selectionEnd: 0, selectionDirection: "forward" };
  after.roots.alpha.reference.focus = { key: "row-1-input", selectionStart: 0, selectionEnd: 0, selectionDirection: "backward" };
  const value = scenario({ actions: [after.action], ticks: [before.ticks[0], after] });
  assert.deepEqual(compareReplayScenario(value).filter((issue) => issue.field === "focus" || issue.field === "focus-witness"), []);
});

test("lifecycle validation rejects disposed-session revival and empty native frames", () => {
  const before = scenario();
  const disposed = structuredClone(before.ticks[0]);
  disposed.index = 1;
  disposed.action = { kind: "unmount", root: "alpha" };
  disposed.roots.alpha.candidate = { root: "alpha", mounted: false, sessionID: null, generation: 1, backend: null,
    snapshot: null, audit: [], transportLog: [], serverRequests: [], pending: [], focus: null,
    sessionHistory: [{ sessionID: 1, generation: 1 }],
    dom: { html: "", root: "", disabled: [], controls: [], order: [], inputPath: null, inputValue: null, inputDisabled: null },
    liveProps: [], lifecycleEvents: [], dispatchCount: 0 };
  const revived = structuredClone(disposed);
  revived.index = 2;
  revived.action = { kind: "late-release", root: "alpha", requestID: 1 };
  revived.roots.alpha.candidate = rootObservation("alpha", 1);
  const value = scenario({ actions: [disposed.action, revived.action], ticks: [before.ticks[0], disposed, revived] });
  const lifecycleIssues = validateReplayScenario(value);
  assert.ok(lifecycleIssues.some((issue) => issue.field === "disposed-session-revival"));
  assert.ok(validateNativeSegments({ ...value, nativeSegments: [{ root: "alpha", sessionID: 1, referenceSessionID: 11, generation: 1, frames: [] }] })
    .some((issue) => issue.field === "empty-native-frames"));
});

test("native segments require a nonempty exact React and candidate envelope for every active session", () => {
  const value = scenario();
  const issues = validateNativeSegments(value);
  assert.ok(issues.some((issue) => issue.field === "native-segments-missing"));
  const frame = (index, state) => ({
    Index: index,
    Step: { Path: "", Event: "", Value: "" },
    State: JSON.stringify(state),
    Tree: JSON.stringify(snapshot().tree),
    DOM: "<div></div>", Pixels: "", Mutations: 0,
  });
  value.nativeSegments = ["alpha", "beta", "gamma"].map((root, offset) => ({
    root, sessionID: offset + 1, referenceSessionID: offset + 11, generation: 1,
    frames: [{ tickIndex: 0, reference: frame(0, snapshot().state), candidate: frame(0, snapshot().state) }],
  }));
  assert.deepEqual(validateNativeSegments(value), []);
  value.nativeSegments[0].frames[0].candidate.State = "";
  assert.ok(validateNativeSegments(value).some((issue) => issue.field === "native-frame"));
});
