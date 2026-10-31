import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { validateFixtureExpectations } from "../../compiled-frontend/conformance/fixture-expectations.mjs";
import { validateTrace } from "../../compiled-frontend/conformance/trace.mjs";
import { assertMethodsDOMSnapshot, expectedMethodsDOM } from "../browser/dom-oracle.mjs";

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function symbolIndex(appIR) {
  if (!Array.isArray(appIR.symbols)) throw new TypeError("AppIR.symbols must be an array");
  const index = new Map(appIR.symbols.map((symbol) => [symbol.id, symbol]));
  if (index.size !== appIR.symbols.length) throw new Error("AppIR contains duplicate symbol IDs");
  return index;
}

function fieldsOfType(appIR, typeId) {
  const type = appIR.types?.find((item) => item.id === typeId);
  require(type?.kind === "struct" && Array.isArray(type.fields), `AppIR is missing struct type ${typeId}`);
  return type.fields.map(({ name, type: fieldType }) => ({ name, type: fieldType }));
}

/** Check that methods remain visible as typed symbols with the frozen call provenance. */
export function assertMethodsMethodContract(appIR, contract) {
  require(appIR?.schema === "gobi.app-ir/v1", "methods AppIR schema differs");
  require(appIR.packagePath === contract.packagePath, "methods AppIR packagePath differs");
  require(Array.isArray(appIR.components) && appIR.components.length === 1, "methods AppIR must contain one component");
  const component = appIR.components[0];
  assertExactTraceValue({
    id: contract.packagePath,
    packagePath: contract.packagePath,
    stateType: contract.stateType,
    messageType: contract.messageType,
    init: contract.roles.init,
    update: contract.roles.update,
    view: contract.roles.view,
  }, {
    id: component.id,
    packagePath: component.packagePath,
    stateType: component.stateType,
    messageType: component.messageType,
    init: component.init,
    update: component.update,
    view: component.view,
  }, "$.appIR.methods.component");

  const actual = symbolIndex(appIR);
  const expectedIDs = sorted(contract.symbols.map((symbol) => symbol.id));
  assertExactTraceValue(expectedIDs, sorted([...actual.keys()]), "$.appIR.methods.symbolIDs");
  for (const expected of contract.symbols) {
    const symbol = actual.get(expected.id);
    require(symbol, `AppIR is missing required method/callee ${expected.id}`);
    assertExactTraceValue({ params: expected.params, results: expected.results }, symbol.signature,
      `$.appIR.methods.${expected.id}.signature`);
    assertExactTraceValue(sorted(expected.calls), sorted(symbol.calls ?? []),
      `$.appIR.methods.${expected.id}.calls`);
  }
  const stateFields = fieldsOfType(appIR, contract.stateType);
  assertExactTraceValue(Object.entries(contract.stateFields).map(([name, type]) => ({ name, type })),
    stateFields, "$.appIR.methods.stateFields");
  assertExactTraceValue([{ name: "Count", type: "float64" }], fieldsOfType(appIR, contract.counterStateType),
    "$.appIR.methods.counterStateFields");
  assertExactTraceValue([
    { name: "Name", type: "string" },
    { name: "Arg", type: "string" },
  ], fieldsOfType(appIR, contract.messageType), "$.appIR.methods.messageFields");
  return true;
}

function traceCore(trace) {
  require(trace?.schema === "gobi.trace/v1", "trace schema differs");
  require(Array.isArray(trace.ticks), "trace.ticks must be an array");
  return {
    schema: trace.schema,
    appId: trace.appId,
    ticks: trace.ticks.map((tick, index) => ({
      index: tick.index,
      action: tick.action,
      message: tick.message,
      dispatchId: tick.dispatchId,
      state: tick.state,
      requestedEffects: tick.requestedEffects,
      completedEffects: tick.completedEffects,
    })),
  };
}

export function assertMethodsCoreTraceEqual(expected, actual, label = "trace") {
  assertExactTraceValue(traceCore(expected), traceCore(actual), `$.${label}`);
  return true;
}

function expectedPlainState(fixture, tickIndex) {
  const state = tickIndex === 0 ? fixture.initialState : fixture.expectations[tickIndex - 1]?.state;
  require(state, `fixture has no state for tick ${tickIndex}`);
  return {
    parent: state.Parent.Count,
    child: state.Child.Count,
    readOnly: state.ReadOnly,
    savedChild: state.SavedChild,
  };
}

function expectedMessageForAction(fixture, actionIndex) {
  const entry = fixture.expectations.find((item) => item.actionIndex === actionIndex);
  if (!entry) throw new Error(`fixture expectation missing action ${actionIndex}`);
  return entry.message === null ? null : { name: entry.message.name, arg: entry.message.arg };
}

function checkSnapshotRecords(records, fixture, label) {
  require(Array.isArray(records) && records.length === fixture.actions.length + 1,
    `${label} must contain one DOM snapshot per application tick`);
  for (let tickIndex = 0; tickIndex < records.length; tickIndex += 1) {
    const record = records[tickIndex];
    require(record?.tickIndex === tickIndex, `${label}[${tickIndex}] tickIndex differs`);
    const expected = expectedMethodsDOM(expectedPlainState(fixture, tickIndex));
    assertExactTraceValue(expected, record.snapshot, `$.${label}[${tickIndex}].snapshot`);
    const plainState = expectedPlainState(fixture, tickIndex);
    if (record.state !== undefined) {
      const isPlain = (() => {
        try { assertExactTraceValue(plainState, record.state); return true; } catch { return false; }
      })();
      if (!isPlain) {
        const expectedTick = tickIndex === 0 ? null : fixture.expectations[tickIndex - 1];
        require(expectedTick !== null, `${label}[0].state must be the plain or initial encoded state`);
        // N2 may store the typed application state alongside its independent oracle row.
        // Exact native/direct trace checking provides the corresponding encoded state.
        require(record.state && typeof record.state === "object", `${label}[${tickIndex}].state is malformed`);
      }
    }
  }
}

export function validateMethodsBrowserEvidence({ browserEvidence, fixture, nativeTrace, appIR }) {
  require(browserEvidence?.schema === "gobi.methods-browser-conformance/v1", "browser evidence schema differs");
  const profiles = browserEvidence.profiles;
  require(profiles && typeof profiles === "object", "browser evidence profiles are missing");
  for (const backend of ["react", "dom", "swap"]) {
    const profile = profiles[backend];
    require(profile && typeof profile === "object", `browser profile ${backend} is missing`);
    assertMethodsCoreTraceEqual(nativeTrace, profile.trace, `profiles.${backend}.trace`);
    validateTrace(profile.trace, appIR);
    validateFixtureExpectations(profile.trace, fixture, appIR);
    checkSnapshotRecords(profile.domOracle, fixture, `profiles.${backend}.domOracle`);
    checkSnapshotRecords(profile.physicalDOMSnapshots, fixture, `profiles.${backend}.physicalDOMSnapshots`);
    for (let tickIndex = 0; tickIndex < profile.trace.ticks.length; tickIndex += 1) {
      assertExactTraceValue(expectedMethodsDOM(expectedPlainState(fixture, tickIndex)), profile.trace.ticks[tickIndex].dom,
        `$.profiles.${backend}.trace.ticks[${tickIndex}].dom`);
    }
    require(Array.isArray(profile.pageErrors) && profile.pageErrors.length === 0,
      `${backend} browser profile reported page errors`);
    require(profile.noWasm && Array.isArray(profile.noWasm.apiAttempts) && profile.noWasm.apiAttempts.length === 0 &&
      Array.isArray(profile.noWasm.wasmRequests) && profile.noWasm.wasmRequests.length === 0,
      `${backend} browser profile lacks a clean no-WASM observation`);
    validateActions(profile, fixture);
    const expectedStale = backend === "swap" ? fixture.actions.length : 0;
    require(profile.callbackCounts?.dispatch === 14 && profile.callbackCounts?.stale === expectedStale,
      `${backend} callback totals differ from 14 application dispatches and ${expectedStale} stale probes`);
    require(Array.isArray(profile.retiredCallbacks) && profile.retiredCallbacks.length === expectedStale,
      `${backend} retired callback evidence count differs from its profile`);
    validateUnmount(profile.unmount, backend);
  }
  validateSwapProfile(profiles.swap, fixture, nativeTrace);
  return { profiles: ["react", "dom", "swap"], ticks: nativeTrace.ticks.length, swaps: profiles.swap.swaps.length };
}

function validateActions(profile, fixture) {
  require(Array.isArray(profile.actions) && profile.actions.length === fixture.actions.length,
    `${profile.backend ?? "browser"} action records do not cover the fixture`);
  for (let actionIndex = 0; actionIndex < fixture.actions.length; actionIndex += 1) {
    const evidence = profile.actions[actionIndex];
    const expected = fixture.expectations.find((item) => item.actionIndex === actionIndex);
    const action = fixture.actions[actionIndex];
    require(evidence.actionIndex === actionIndex, `browser action ${actionIndex} index differs`);
    assertExactTraceValue(action, evidence.action, `$.browser.actions[${actionIndex}].action`);
    assertExactTraceValue(expected.message, evidence.expectedMessage, `$.browser.actions[${actionIndex}].expectedMessage`);
    require(evidence.tickIndex === actionIndex + 1, `browser action ${actionIndex} is not aligned to its trace tick`);
    require(evidence.beforeTickCount === actionIndex + 1 && evidence.afterTickCount === actionIndex + 2,
      `browser action ${actionIndex} did not produce exactly one action tick`);
    require(evidence.target?.connected === true && evidence.target.value === action.value &&
      evidence.physicalClick?.method === "HTMLElement.click" && evidence.physicalClick.attempted === true,
    `browser action ${actionIndex} lacks the actual connected target value/click evidence`);
    const tick = profile.trace.ticks[evidence.tickIndex];
    const dispatchCount = fixture.expectations.slice(0, actionIndex + 1)
      .filter((item) => item.message !== null).length;
    const staleCount = profile.backend === "swap" ? actionIndex : 0;
    require(evidence.afterCallbacks?.dispatch === dispatchCount && evidence.afterCallbacks?.stale === staleCount,
      `browser action ${actionIndex} callback totals differ from the active profile schedule`);
    assertExactTraceValue(expectedMessageForAction(fixture, actionIndex), tick.message,
      `$.browser.actions[${actionIndex}].traceMessage`);
    if (expected.message === null) {
      require(evidence.physicalClick?.method === "HTMLElement.click" && evidence.physicalClick.disabled === true &&
        evidence.physicalClick.traceTicksUnchanged === true,
      `disabled browser action ${actionIndex} was not a physical disabled click`);
      require(evidence.suppressedDispatch?.accepted === true && evidence.suppressedDispatch.dispatchId === null,
        `disabled browser action ${actionIndex} lacks suppressed dispatch evidence`);
      assertExactTraceValue(tick.state, profile.trace.ticks[evidence.tickIndex - 1].state,
        `$.browser.actions[${actionIndex}].suppressedState`);
    } else {
      require(evidence.target.disabled === false,
        `active browser action ${actionIndex} lacked an enabled target`);
      assertExactTraceValue({ Name: expected.message.name, Arg: expected.message.arg }, evidence.observed?.message,
        `$.browser.actions[${actionIndex}].observedMessage`);
      require(evidence.observed?.action?.path === action.path && evidence.observed.action.event === action.event &&
        evidence.observed.action.value === action.value,
      `active browser action ${actionIndex} did not preserve its actual target path/event/value`);
    }
  }
}

function validateUnmount(unmount, label) {
  require(unmount && typeof unmount === "object", `${label} profile lacks unmount evidence`);
  require(unmount.physicalDOM?.html === "" && unmount.physicalDOM.controls === 0,
    `${label} profile left physical DOM after unmount`);
  assertExactTraceValue({ normalization: "outerHTML-v1", html: "", controls: [] }, unmount.rendererSnapshot,
    `$.${label}.unmount.rendererSnapshot`);
}

function validateSwapProfile(profile, fixture, nativeTrace) {
  require(Array.isArray(profile.swaps) && profile.swaps.length === fixture.actions.length,
    "swap profile must switch renderers after each fixture action");
  require(Array.isArray(profile.rendererSequence) && profile.rendererSequence.length === fixture.actions.length + 1,
    "swap profile renderer sequence must include initial renderer and every replacement");
  let current = "react";
  assertExactTraceValue(current, profile.rendererSequence[0], "$.profiles.swap.rendererSequence[0]");
  for (let index = 0; index < profile.swaps.length; index += 1) {
    const swap = profile.swaps[index];
    const next = current === "react" ? "dom" : "react";
    require(swap.actionIndex === index && swap.from === current && swap.to === next,
      `swap ${index} did not alternate renderer backends after the matching action`);
    require(swap.beforeTickCount === index + 2 && swap.afterTickCount === index + 2,
      `swap ${index} changed application tick count`);
    require(swap.stateUnchanged === true && swap.oldRootEmptyAfterUnmount === true,
      `swap ${index} changed state or left the retired root mounted`);
    require(swap.oldRootDetached === true && swap.retiredCallback?.captured === true &&
      swap.retiredCallback.detachedAtInvocation === true && swap.retiredCallback.invoked === true &&
      swap.retiredCallback.traceTicksUnchanged === true,
    `swap ${index} lacks retired callback fencing evidence`);
    const expectedSnapshot = expectedMethodsDOM(expectedPlainState(fixture, index + 1));
    assertExactTraceValue(expectedSnapshot, swap.newSnapshot?.oracle?.snapshot,
      `$.profiles.swap.swaps[${index}].newSnapshot.oracle`);
    assertExactTraceValue(expectedSnapshot, swap.newSnapshot?.physical?.snapshot,
      `$.profiles.swap.swaps[${index}].newSnapshot.physical`);
    require(swap.retiredCallback.runtimeFenceCountAfter === swap.retiredCallback.runtimeFenceCountBefore + 1,
      `swap ${index} did not record exactly one out-of-band retired-callback fence`);
    assertExactTraceValue(swap.retiredCallback, profile.retiredCallbacks[index],
      `$.profiles.swap.retiredCallbacks[${index}]`);
    require(swap.retiredCallback.runtimeFence?.kind === "stale" &&
      Number.isSafeInteger(swap.retiredCallback.runtimeFence?.generation),
    `swap ${index} retired callback fence lacks runtime generation provenance`);
    require(swap.beforeTickCount === nativeTrace.ticks[index + 1].index + 1 &&
      swap.afterTickCount === swap.beforeTickCount,
      `swap ${index} changed the number of application ticks`);
    current = next;
    assertExactTraceValue(current, profile.rendererSequence[index + 1], `$.profiles.swap.rendererSequence[${index + 1}]`);
  }
}

export function runMethodsMutationControls({ appIR, contract, nativeTrace, fixture, expectedDOM }) {
  const outcomes = [];
  const reject = (name, action) => {
    let rejected = false;
    let reason = null;
    try { action(); } catch (error) { rejected = true; reason = String(error.message ?? error); }
    if (!rejected) throw new Error(`mutation control ${name} was not rejected`);
    outcomes.push({ name, rejected, reason });
  };

  const wrongMethodState = structuredClone(nativeTrace);
  wrongMethodState.ticks[5].state.fields.find((field) => field.name === "Parent").value.fields
    .find((field) => field.name === "Count").value.float64Bits = "3ff0000000000000";
  reject("wrong-method-state", () => assertMethodsCoreTraceEqual(nativeTrace, wrongMethodState, "mutation.state"));

  const wrongCallee = structuredClone(appIR);
  const reduce = wrongCallee.symbols.find((symbol) => symbol.id.endsWith(".State.Reduce"));
  reduce.calls = reduce.calls.filter((id) => !id.endsWith(".State.PublishSaved"));
  reject("wrong-callee-provenance", () => assertMethodsMethodContract(wrongCallee, contract));

  const wrongMessageValue = structuredClone(nativeTrace);
  wrongMessageValue.ticks[1].message = { name: "parentAdd", arg: "" };
  reject("wrong-message-value", () => assertMethodsCoreTraceEqual(nativeTrace, wrongMessageValue, "mutation.message"));

  const wrongDOM = structuredClone(expectedDOM);
  wrongDOM.html = wrongDOM.html.replace("Parent: 0", "Parent: 99");
  reject("wrong-dom", () => assertMethodsDOMSnapshot(wrongDOM, { parent: 0, child: 0, readOnly: false, savedChild: 0 }));
  return { schema: "gobi.methods-mutation-controls/v1", outcomes, detected: outcomes.length };
}

export function checkMethodsConformance({ appIR, contract, fixture, nativeTrace, directTrace, valueSemantics, readOnlyGuards, browserEvidence }) {
  assertMethodsMethodContract(appIR, contract);
  validateTrace(nativeTrace, appIR);
  validateTrace(directTrace, appIR);
  validateFixtureExpectations(nativeTrace, fixture, appIR);
  validateFixtureExpectations(directTrace, fixture, appIR);
  assertMethodsCoreTraceEqual(nativeTrace, directTrace, "nativeVsDirect");
  require(valueSemantics?.schema === "gobi.methods-value-semantics/v1" && valueSemantics.passed === true,
    "emitted module value-receiver probe did not pass");
  require(readOnlyGuards?.schema === "gobi.methods-read-only-update-guards/v1" && readOnlyGuards.passed === true,
    "emitted module direct read-only method guards did not pass");
  const browser = validateMethodsBrowserEvidence({ browserEvidence, fixture, nativeTrace, appIR });
  const mutationControls = runMethodsMutationControls({ appIR, contract, nativeTrace, fixture,
    expectedDOM: expectedMethodsDOM({ parent: 0, child: 0, readOnly: false, savedChild: 0 }) });
  return {
    schema: "gobi.methods-conformance-check/v1",
    status: "matched",
    fixture: fixture.name,
    appId: nativeTrace.appId,
    ticks: nativeTrace.ticks.length,
    actions: fixture.actions.length,
    suppressedActions: fixture.expectations.filter((item) => item.message === null).length,
    browserProfiles: browser.profiles,
    swaps: browser.swaps,
    valueSemanticsChecks: valueSemantics.checks.filter((item) => item.invoked).length,
    publishSavedWitnesses: valueSemantics.snapshotActions,
    readOnlyMethodGuards: readOnlyGuards.guards,
    mutationControls,
  };
}
