import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { mutateInboxOrder, nativeInputFor, validateActor, validateRetainedCallbackFence, validateScenario, writeRawArtifacts } from "./check.mjs";
import { makePositiveScenario } from "./testdata/check-positive-scenario.mjs";

function positiveScenario() {
  const scenario = makePositiveScenario();
  assert.deepEqual(validateScenario(scenario), [], "the complete control must validate before mutation");
  return scenario;
}

function issueFields(scenario) {
  return validateScenario(scenario).map(({ field }) => field);
}

function typedSnapshot({ readOnly = false, inbox = [] } = {}) {
  const disabled = readOnly;
  const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
  const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
  const button = (Key, className, title, isDisabled) => ({ Kind: 1, Tag: "button", Key,
    Attrs: [attr("class", className), ...(isDisabled ? [attr("disabled", "", true)] : [])],
    On: [{ Event: "click", Message: className, Arg: "" }], Kids: [text(title)], Text: "" });
  return {
    state: { Rows: [], NextID: 0, NextRequestID: 0, Inputs: { Title: "Locked", ReadOnly: readOnly }, InputRevision: 1, Inbox: inbox },
    tree: { Kind: 1, Tag: "div", Key: "collection", Attrs: [attr("class", "collection")], On: null,
      Kids: [button("add", "add", "Add row", disabled), button("reset", "reset", "Reset", disabled),
        { Kind: 1, Tag: "div", Key: "rows", Attrs: [attr("class", "rows")], On: null, Kids: [], Text: "" },
        { Kind: 1, Tag: "p", Key: "composition-title", Attrs: null, On: null, Kids: [text("Title: Locked")], Text: "" },
        { Kind: 1, Tag: "p", Key: "composition-inbox", Attrs: null, On: null,
          Kids: [text(`Published: ${inbox.length}`)], Text: "" }], Text: "" },
    bindings: [], messages: [],
  };
}

function actor({ readOnly = false, inbox = [], mutated = false } = {}) {
  const snapshot = typedSnapshot({ readOnly, inbox });
  const controls = [
    { tag: "button", key: "add", path: "0", className: "add", label: "", rowLabel: null,
      text: "Add row", value: null, disabled: mutated ? false : readOnly,
      disabledAttribute: mutated ? false : readOnly, type: null },
    { tag: "button", key: "reset", path: "1", className: "reset", label: "", rowLabel: null,
      text: "Reset", value: null, disabled: readOnly, disabledAttribute: readOnly, type: null },
  ];
  return {
    managerTree: [{ SessionID: 1, ParentID: 0, Depth: 1 }],
    managerList: [1], snapshotAllIDs: [1], activeIDs: [1], changes: [], managerCalls: [], managerEffects: [],
    effectsPending: [], transportCalls: [], transportClock: 0, lifecycle: [{ sessionID: 1, parentID: 0, depth: 1,
      backend: "dom", lifecycle: "active" }], actionResult: null, disposedIDs: [], settledError: null,
    sessions: [{ sessionID: 1, parentID: 0, depth: 1, generation: 1, backend: "dom",
      managerSnapshot: snapshot, snapshot: structuredClone(snapshot), hostSnapshot: structuredClone(snapshot),
      audit: [], managerAudit: [], domSnapshot: { html: "<div></div>", disabled: readOnly ? ["0", "1"] : ["1"] },
      actualDOM: "<div></div>", actualDOMMatchesSnapshot: true, shellHTML: "", focus: null, focusWitness: null,
      lifecycle: "active", errors: [], inputs: [], controls, elementCountMatches: true,
      elementCounts: { tree: 8, dom: 8 }, disabledViolations: [],
      reportedDisabled: readOnly ? ["0", "1"] : ["1"], actualDisabled: readOnly ? ["0", "1"] : ["1"],
      reportedDisabledMatches: true, visibleTitle: "Title: Locked", expectedTitle: "Title: Locked",
      visibleInbox: `Published: ${inbox.length}`, expectedInbox: `Published: ${inbox.length}`,
      transportLog: [], rowOrder: [], inputOrder: [], inputValues: [],
      shellOwnership: { shellChildren: ["session-tree-view", "session-tree-children"], viewContained: true,
        childrenContained: true, physicalParent: "root-slot" } }],
  };
}

test("native input keeps the closed public action envelope", () => {
  const script = { name: "wire", actions: [
    { method: "create", args: [] },
    { method: "setChildInputs", args: [1, 2, { Title: "x", ReadOnly: true }] },
  ] };
  assert.deepEqual(nativeInputFor(script), { actions: script.actions });
});

test("actor validator independently rejects an enabled read-only DOM control", () => {
  const issues = validateActor(actor({ readOnly: true, mutated: true }), { script: "readonly" });
  assert.ok(issues.some(({ field }) => field === "actor.dom.control-disabled-policy"));
  assert.ok(issues.some(({ field }) => field === "actor.dom.readonly-control-enabled"));
});

test("inbox ordering mutation is caught from the typed receipt sequence", () => {
  const inbox = [
    { Sequence: 1, ParentID: 1, ChildID: 2, RowID: 1, Saved: "a", Saves: 1, InputRevision: 1 },
    { Sequence: 2, ParentID: 1, ChildID: 2, RowID: 1, Saved: "b", Saves: 2, InputRevision: 1 },
  ];
  const candidate = actor({ inbox });
  const source = { name: "ordered", actions: [], browserFrames: [{ index: 0, candidate: { ...candidate,
    managerTree: [{ SessionID: 1, ParentID: 0, Depth: 1 }, { SessionID: 2, ParentID: 1, Depth: 2 }],
    managerList: [1, 2], snapshotAllIDs: [1], activeIDs: [1] } }] };
  // The helper only needs a live parent record with two inbox messages.
  source.browserFrames[0].candidate.sessions[0].managerSnapshot.state.Inbox = inbox;
  source.browserFrames[0].candidate.sessions[0].snapshot.state.Inbox = structuredClone(inbox);
  source.browserFrames[0].candidate.sessions[0].hostSnapshot.state.Inbox = structuredClone(inbox);
  const mutated = mutateInboxOrder(source);
  assert.equal(mutated.mutation.status, "reordered");
  const issues = validateActor(mutated.scenario.browserFrames[0].candidate, { script: "ordered" });
  assert.ok(issues.some(({ field }) => field.endsWith("inbox.sequence-order")));
});

test("scenario validation fails closed when native frames are absent", () => {
  const issues = validateScenario({ name: "missing-native", actions: [{ method: "create", args: [] }],
    nativeFrames: [], modelFrames: [], browserFrames: [] });
  assert.ok(issues.some(({ field }) => field === "native.frames.missing"));
  assert.ok(issues.some(({ field }) => field === "native.empty-frames"));
});

test("retained callback proof requires no Go completion and unchanged recreated snapshots", () => {
  const manager = {
    tree: [{ SessionID: 3, ParentID: 0, Depth: 1 }, { SessionID: 4, ParentID: 3, Depth: 2 }],
    sessions: [{ id: 3, snapshot: { state: { Inbox: [] }, messages: [] } },
      { id: 4, snapshot: { state: { Inbox: [] }, messages: [] } }],
    changes: [],
  };
  const side = {
    actualGoManager: true,
    old: { rootID: 1, childID: 2, pendingID: 1, pendingSnapshot: { state: { Rows: [{ PendingID: 1 }] } },
      savedCallbackRetained: true, transportStateBeforeDelivery: "cancelled" },
    disposedIDs: [2, 1],
    freshIDs: [3, 4],
    before: { manager, dom: [], changes: [] },
    after: { manager, dom: [], changes: [] },
    delivery: { previousState: "cancelled" },
    goCompleteCalls: 0,
    completeCalls: [],
    transportEvents: [{ kind: "delivery", ID: 1 }],
  };
  const probe = { candidate: side, reference: { ...side, actualGoManager: false } };
  assert.equal(validateRetainedCallbackFence(probe).status, "fenced");
  const mutated = structuredClone(probe);
  mutated.candidate.goCompleteCalls = 1;
  mutated.candidate.completeCalls = [{ method: "complete" }];
  assert.equal(validateRetainedCallbackFence(mutated).status, "failed");
});

test("raw mismatch artifacts preserve full, untruncated values and hashes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "typed-composition-check-"));
  try {
    const longValue = "x".repeat(5000);
    const result = await writeRawArtifacts({ scenarios: [{ name: "raw", actions: [{ method: "create", args: [] }],
      observation: longValue }], issues: [{ field: "large", actual: longValue }], outputDir: directory, baseName: "proof" });
    const shard = await readFile(result.files[0].path, "utf8");
    const mismatches = await readFile(result.mismatchArtifact.path, "utf8");
    assert.ok(shard.includes(longValue));
    assert.ok(mismatches.includes(longValue));
    assert.equal(result.files[0].sha256.length, 64);
    assert.equal(result.mismatchArtifact.sha256.length, 64);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a required focus replacement witness cannot be omitted", () => {
  const scenario = positiveScenario();
  scenario.browserFrames[4].candidate.focusReplacement = null;
  assert.ok(issueFields(scenario).includes("focus.replacement.missing"));
});

test("bilateral effects, manager-call, transport, and clock channels are required", () => {
  const scenario = positiveScenario();
  for (const frame of scenario.browserFrames) {
    for (const side of ["candidate", "reference"]) {
      const actor = frame[side];
      delete actor.managerEffects;
      delete actor.managerCalls;
      delete actor.transportCalls;
      delete actor.transportClock;
    }
  }
  const fields = new Set(issueFields(scenario));
  for (const side of ["candidate", "reference"]) {
    assert.ok(fields.has(`transport.${side}.managerEffects.missing`));
    assert.ok(fields.has(`transport.${side}.managerCalls.missing`));
    assert.ok(fields.has(`transport.${side}.transportCalls.missing`));
    assert.ok(fields.has(`transport.${side}.clock.shape`));
  }
});

test("bilaterally reversed transport invocations fail against Go command order", () => {
  const scenario = positiveScenario();
  const frame = scenario.browserFrames[13];
  for (const side of ["candidate", "reference"]) {
    const actor = frame[side];
    actor.transportCalls.reverse();
    actor.transportCalls.forEach((event, index) => {
      event.sequence = actor.transportClock.before + index + 1;
    });
  }
  const fields = issueFields(scenario);
  assert.ok(fields.includes("transport.candidate.cancel.id"));
  assert.ok(fields.includes("transport.reference.cancel.id"));
});

test("omitting a Go disposal command's transport invocation fails on both actors", () => {
  const scenario = positiveScenario();
  for (const side of ["candidate", "reference"]) {
    const actor = scenario.browserFrames[13][side];
    actor.transportCalls.pop();
    actor.transportClock.after -= 1;
  }
  const fields = issueFields(scenario);
  assert.ok(fields.includes("transport.candidate.command-count"));
  assert.ok(fields.includes("transport.reference.command-count"));
});

test("changing a wrong-parent rejection into success fails, but error prose is not compared", () => {
  const scenario = positiveScenario();
  const index = 12;
  assert.equal(typeof scenario.nativeFrames[index].result?.error, "string");

  const wordingOnly = structuredClone(scenario);
  wordingOnly.nativeFrames[index].result.error = "different native wording";
  wordingOnly.modelFrames[index].result.error = "different model wording";
  for (const side of ["candidate", "reference"]) {
    wordingOnly.browserFrames[index].operationResults[side].error = `different ${side} wording`;
    wordingOnly.browserFrames[index][side].actionResult.error = `different ${side} wording`;
    for (const call of wordingOnly.browserFrames[index][side].managerCalls) {
      if (call.method === "setChildInputs") call.result.error = `different ${side} call wording`;
    }
  }
  assert.deepEqual(validateScenario(wordingOnly), [], "the contract compares rejection outcome, not prose");

  const changedOutcome = structuredClone(scenario);
  changedOutcome.browserFrames[index].operationResults.candidate = null;
  changedOutcome.browserFrames[index].candidate.actionResult = null;
  assert.ok(issueFields(changedOutcome).includes("operation.native-candidate"));
});

test("blocked disabled input proves unchanged physical value/state and zero native dispatch", () => {
  const noNativeSuppression = positiveScenario();
  noNativeSuppression.browserFrames[11].candidate.inputObservation.nativeDispatches = 1;
  assert.ok(issueFields(noNativeSuppression).includes("input.candidate.native-dispatch-count"));

  const changedPhysicalValue = positiveScenario();
  changedPhysicalValue.browserFrames[11].candidate.inputObservation.afterValue = "blocked input";
  assert.ok(issueFields(changedPhysicalValue).includes("input.candidate.afterValue"));

  const changedGoState = positiveScenario();
  const nativeChild = changedGoState.nativeFrames[11].frame.sessions.find(({ id }) => id === 2);
  nativeChild.snapshot.state.Rows[0].Draft = "unexpected disabled edit";
  assert.ok(issueFields(changedGoState).includes("input.candidate.blocked-state-unchanged"));
});
