import test from "node:test";
import assert from "node:assert/strict";

import { checkConformance } from "./check.mjs";
import { expectedDOMSnapshots } from "./dom-oracle.mjs";
import { encodeFixtureState } from "./fixture-expectations.mjs";

const fixture = {
  name: "counter-check-test",
  packagePath: "example/counter",
  initialState: { Count: 0 },
  actions: [
    { path: "1", event: "click", value: "" },
    { path: "1", event: "click", value: "" },
    { path: "2", event: "click", value: "" },
    { path: "2", event: "click", value: "" },
  ],
  hostScript: { schema: "gobi.host-script/v1", steps: [] },
  focusWitnesses: [],
  expectations: [
    { actionIndex: 0, message: { name: "add", arg: "" }, dispatchId: "dispatch-0001", state: { Count: 1 }, requestedEffects: [] },
    { actionIndex: 1, message: { name: "add", arg: "" }, dispatchId: "dispatch-0002", state: { Count: 2 }, requestedEffects: [] },
    { actionIndex: 2, message: { name: "reset", arg: "" }, dispatchId: "dispatch-0003", state: { Count: 0 }, requestedEffects: [] },
    { actionIndex: 3, message: null, dispatchId: null, state: { Count: 0 }, requestedEffects: [] },
  ],
};

const app = {
  types: [
    { id: "float64", kind: "float64", jsRepresentation: "number" },
    { id: "State", kind: "struct", fields: [{ name: "Count", type: "float64" }], jsRepresentation: "class" },
  ],
  components: [{ id: "counter", packagePath: "example/counter", stateType: "State" }],
};

const view = {
  tree: { kind: 1, tag: "div", key: "counter", attrs: [{ name: "class", value: "counter", flag: false, style: [] }], on: [], kids: [], text: "" },
  bindings: [],
};

function makeTrace(script = fixture, traceView = view) {
  const ticks = [{ index: 0, action: null, message: null, dispatchId: null,
    state: encodeFixtureState(script.initialState, "State", app.types), requestedEffects: [], completedEffects: [], view: traceView, dom: null }];
  for (const expectation of script.expectations) {
    ticks.push({
      index: ticks.length,
      action: script.actions[expectation.actionIndex],
      message: expectation.message,
      dispatchId: expectation.dispatchId,
      state: encodeFixtureState(expectation.state, "State", app.types),
      requestedEffects: [], completedEffects: [], view: traceView, dom: null,
    });
  }
  return { schema: "gobi.trace/v1", appId: "counter", ticks };
}

function browserEvidence(nativeTrace, script = fixture) {
  const trace = structuredClone(nativeTrace);
  const snapshots = expectedDOMSnapshots(script);
  trace.ticks.forEach((tick, index) => { tick.dom = snapshots[index]; });
  const actions = script.actions.map((intent, index) => {
    const expectation = script.expectations.find((entry) => entry.actionIndex === index);
    const before = { ticks: index + 1, callbacks: { dispatch: index < 3 ? index : 3, stale: 0 } };
    const suppressed = expectation.message === null;
    const actual = trace.ticks[index + 1];
    return {
      index,
      intent,
      expectedMessage: expectation.message,
      observedAction: expectation.message === null ? null : { path: intent.path, event: intent.event, value: intent.value },
      targetValueAtDispatch: expectation.message === null ? null : intent.value,
      method: "HTMLElement.click()",
      targetConnectedBefore: true,
      targetDisabled: suppressed,
      before,
      afterPhysical: suppressed ? structuredClone(before) : {
        ticks: before.ticks + 1,
        callbacks: { dispatch: before.callbacks.dispatch + 1, stale: 0 },
      },
      ...(suppressed ? { suppressedRecord: { accepted: true, dispatchId: null } } : {}),
      traceTick: actual,
    };
  });
  return {
    trace,
    actions,
    browser: "test fixture",
    strictMode: false,
    noWasm: { wasmRequests: [], wasmAPIAttempts: [] },
    effectHostEvidence: { requests: [], completions: [] },
    hostObservations: {
      requests: [],
      dispatch: actions.filter((action) => action.expectedMessage !== null).map((action) => ({
        observed: action.observedAction,
        action: action.intent,
        message: { Name: action.expectedMessage.name, Arg: action.expectedMessage.arg },
      })),
      stale: [],
    },
    focus: null,
    unmount: {
      physicalDOM: { normalization: "container-innerHTML-v1", html: "", controls: 0 },
      rendererSnapshot: { normalization: "outerHTML-v1", html: "", controls: [] },
    },
  };
}

test("four-way checker validates complete traces, hand-authored DOM, and mutation controls", () => {
  const nativeTrace = makeTrace();
  const report = checkConformance({ app, fixture, nativeTrace, directTrace: structuredClone(nativeTrace), browserEvidence: browserEvidence(nativeTrace) });
  assert.equal(report.status, "matched");
  assert.equal(report.ticks, 5);
  assert.equal(report.suppressedTicks, 1);
  assert.ok(report.mutationControls.length >= 10);
  assert.ok(report.mutationControls.every((control) => control.detected));
});

test("renderer evidence keeps lowerCamel Action separate from uppercase GoMessage", () => {
  const nativeTrace = makeTrace();
  const evidence = browserEvidence(nativeTrace);
  assert.deepEqual(evidence.hostObservations.dispatch[0].action, { path: "1", event: "click", value: "" });
  assert.deepEqual(evidence.hostObservations.dispatch[0].message, { Name: "add", Arg: "" });
  assert.doesNotThrow(() => checkConformance({ app, fixture, nativeTrace,
    directTrace: structuredClone(nativeTrace), browserEvidence: evidence }));

  const wrongCase = structuredClone(evidence);
  wrongCase.hostObservations.dispatch[0].message = { name: "add", arg: "" };
  assert.throws(() => checkConformance({ app, fixture, nativeTrace,
    directTrace: structuredClone(nativeTrace), browserEvidence: wrongCase }), /hostObservations\.dispatch\[0\]\.message/);
});

test("four-way checker fails if the browser skips a live DOM snapshot", () => {
  const nativeTrace = makeTrace();
  const browser = browserEvidence(nativeTrace);
  browser.trace.ticks[2].dom = null;
  assert.throws(() => checkConformance({ app, fixture, nativeTrace, directTrace: structuredClone(nativeTrace), browserEvidence: browser }), /missing DOM evidence/);
});

test("four-way checker requires direct and renderer snapshots to prove an empty post-unmount root", () => {
  const nativeTrace = makeTrace();
  const browser = browserEvidence(nativeTrace);
  browser.unmount.physicalDOM.html = "<div>orphan</div>";
  assert.throws(() => checkConformance({ app, fixture, nativeTrace, directTrace: structuredClone(nativeTrace), browserEvidence: browser }), /browser\.unmount\.physicalDOM\.html/);
});

test("focus conformance checks range and direction in before, immediate, and settled witnesses", () => {
  const nativeTrace = makeTrace();
  const witness = {
    beforeActionIndex: 0,
    afterActionIndex: 0,
    key: "keyed-input",
    selectionStart: 0,
    selectionEnd: 2,
    selectionDirection: "backward",
  };
  const focusedFixture = { ...fixture, focusWitnesses: [witness] };
  const evidence = browserEvidence(nativeTrace);
  evidence.focus = {
    before: { activeIsTarget: true, start: 0, end: 2, direction: "backward" },
    immediate: { activeIsTarget: true, start: 0, end: 2, direction: "backward", sameKeyedNodeAtNewPath: true },
    settled: { activeIsTarget: true, start: 0, end: 2, direction: "backward", sameKeyedNodeAtNewPath: true },
  };

  const report = checkConformance({ app, fixture: focusedFixture, nativeTrace, directTrace: structuredClone(nativeTrace), browserEvidence: evidence });
  assert.ok(report.mutationControls.some((control) => control.name === "focus-selection-range" && control.detected));
  assert.ok(report.mutationControls.some((control) => control.name === "focus-selection-direction" && control.detected));

  const badRange = structuredClone(evidence);
  badRange.focus.immediate.start = 1;
  assert.throws(() => checkConformance({ app, fixture: focusedFixture, nativeTrace, directTrace: structuredClone(nativeTrace), browserEvidence: badRange }), /browser\.focus\.immediate\.start/);

  const badDirection = structuredClone(evidence);
  badDirection.focus.settled.direction = "forward";
  assert.throws(() => checkConformance({ app, fixture: focusedFixture, nativeTrace, directTrace: structuredClone(nativeTrace), browserEvidence: badDirection }), /browser\.focus\.settled\.direction/);
});

test("literal handler keeps requested action, observed target value, and Go message separate", () => {
  const literalFixture = {
    ...structuredClone(fixture),
    initialState: { Count: 1 },
    actions: [{ path: "2", event: "click", value: "must not replace literal" }],
    expectations: [{
      actionIndex: 0,
      message: { name: "literal", arg: "target.value" },
      dispatchId: "dispatch-0001",
      state: { Count: 1 },
      requestedEffects: [],
    }],
  };
  const literalView = {
    tree: { kind: 1, tag: "div", key: "counter", attrs: [{ name: "class", value: "counter", flag: false, style: [] }], on: [], kids: [
      { kind: 1, tag: "p", key: "count", attrs: null, on: null, kids: [{ kind: 2, tag: "", key: "", attrs: null, on: null, kids: null, text: "Count: 1" }], text: "" },
      { kind: 1, tag: "button", key: "add", attrs: [{ name: "class", value: "add", flag: false, style: [] }], on: [{ event: "click", message: "add", arg: "" }], kids: [{ kind: 2, tag: "", key: "", attrs: null, on: null, kids: null, text: "+" }], text: "" },
      { kind: 1, tag: "button", key: "reset", attrs: null, on: [{ event: "click", message: "literal", arg: "target.value" }], kids: [{ kind: 2, tag: "", key: "", attrs: null, on: null, kids: null, text: "Reset" }], text: "" },
    ], text: "" },
    bindings: [],
  };
  const nativeTrace = makeTrace(literalFixture, literalView);
  const evidence = browserEvidence(nativeTrace, literalFixture);
  evidence.actions[0].observedAction.value = "";
  evidence.actions[0].targetValueAtDispatch = "";
  evidence.hostObservations.dispatch[0].observed.value = "";

  const report = checkConformance({ app, fixture: literalFixture, nativeTrace, directTrace: structuredClone(nativeTrace), browserEvidence: evidence });
  assert.ok(report.mutationControls.some((control) => control.name === "observed-target-value-independent-of-intent" && control.detected));
  assert.equal(evidence.actions[0].intent.value, "must not replace literal");
  assert.equal(evidence.actions[0].observedAction.value, "");
  assert.equal(evidence.trace.ticks[1].message.arg, "target.value");
});
