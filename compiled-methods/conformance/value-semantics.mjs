import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { goSliceValues } from "../../compiled-frontend/conformance/direct-js.mjs";
import { encodeFixtureState } from "../../compiled-frontend/conformance/fixture-expectations.mjs";

function findComponent(appIR, packagePath) {
  const component = appIR.components?.find((item) => item.packagePath === packagePath);
  if (!component) throw new Error(`AppIR has no component for ${packagePath}`);
  return component;
}

function encode(helpers, state, component) {
  if (typeof helpers.gobiEncodeState !== "function") throw new TypeError("helpers.gobiEncodeState is required");
  return helpers.gobiEncodeState(state, component.stateType);
}

/**
 * Probe value-receiver isolation through the emitted public Init/Update roles.
 * The original opaque state object is retained across each Update invocation,
 * then encoded again so nested alias mutation cannot hide behind a returned
 * state or a later trace snapshot.
 */
export function probeValueReceiverSemantics({ compiled, helpers, fixture }) {
  const component = findComponent(compiled.appIR, fixture.packagePath);
  const init = compiled.symbols?.[component.init];
  const update = compiled.symbols?.[component.update];
  if (typeof init !== "function" || typeof update !== "function") {
    throw new TypeError("compiled Init and Update roles must be callable");
  }
  let state = init();
  const checks = [{
    actionIndex: null,
    operation: "Init",
    passed: (() => {
      try {
        assertExactTraceValue(encodeFixtureState(fixture.initialState, component.stateType, compiled.appIR.types),
          encode(helpers, state, component), "$.valueSemantics.initialState");
        return true;
      } catch { return false; }
    })(),
  }];
  const expectedByAction = new Map(fixture.expectations.map((item) => [item.actionIndex, item]));

  for (let actionIndex = 0; actionIndex < fixture.actions.length; actionIndex += 1) {
    const expected = expectedByAction.get(actionIndex);
    if (!expected) throw new Error(`fixture action ${actionIndex} has no expectation`);
    if (expected.message === null) {
      assertExactTraceValue(encodeFixtureState(expected.state, component.stateType, compiled.appIR.types),
        encode(helpers, state, component), `$.valueSemantics.actions[${actionIndex}].suppressedState`);
      checks.push({ actionIndex, invoked: false, reason: "disabled intent has no Update call", passed: true });
      continue;
    }

    const originalState = state;
    const before = encode(helpers, originalState, component);
    const result = update(originalState, { Name: expected.message.name, Arg: expected.message.arg });
    if (!Array.isArray(result) || result.length !== 2) {
      throw new TypeError(`Update action ${actionIndex} did not return [state, effects]`);
    }
    const after = encode(helpers, originalState, component);
    const returned = encode(helpers, result[0], component);
    const expectedReturned = encodeFixtureState(expected.state, component.stateType, compiled.appIR.types);
    let unchanged = true;
    let unchangedError = null;
    try { assertExactTraceValue(before, after, `$.valueSemantics.actions[${actionIndex}].originalStateAfterUpdate`); }
    catch (error) { unchanged = false; unchangedError = `${error.message}`; }
    let returnedMatches = true;
    let returnedError = null;
    try { assertExactTraceValue(expectedReturned, returned, `$.valueSemantics.actions[${actionIndex}].returnedState`); }
    catch (error) { returnedMatches = false; returnedError = `${error.message}`; }
    checks.push({
      actionIndex,
      message: expected.message,
      invoked: true,
      originalRetainedDuringCall: true,
      originalStateBefore: before,
      originalStateAfter: after,
      returnedState: returned,
      expectedReturnedState: expectedReturned,
      unchanged,
      returnedMatches,
      passed: unchanged && returnedMatches,
      errors: [unchangedError, returnedError].filter(Boolean),
    });
    state = result[0];
  }

  const snapshotActions = [4, 13].map((actionIndex) => {
    const check = checks.find((item) => item.actionIndex === actionIndex);
    return {
      actionIndex,
      operation: "PublishSaved",
      originalStateUnchanged: check?.unchanged === true,
      returnedParentCount: check?.returnedState?.fields?.find((field) => field.name === "Parent")?.value?.fields
        ?.find((field) => field.name === "Count")?.value?.float64Bits ?? null,
      originalParentCountBefore: check?.originalStateBefore?.fields?.find((field) => field.name === "Parent")?.value?.fields
        ?.find((field) => field.name === "Count")?.value?.float64Bits ?? null,
      originalParentCountAfter: check?.originalStateAfter?.fields?.find((field) => field.name === "Parent")?.value?.fields
        ?.find((field) => field.name === "Count")?.value?.float64Bits ?? null,
    };
  });
  return {
    schema: "gobi.methods-value-semantics/v1",
    boundary: "emitted-module Init/Update role ABI; original opaque state encoded before and after every enabled Update",
    checks,
    snapshotActions,
    passed: checks.every((check) => check.passed),
    failures: checks.filter((check) => !check.passed),
  };
}

/** Directly probe Go ReadOnly method guards; these bypass the disabled DOM. */
export function probeReadOnlyUpdateGuards({ compiled, helpers, fixture }) {
  const component = compiled.appIR.components.find((item) => item.packagePath === fixture.packagePath);
  if (!component) throw new Error(`missing methods component ${fixture.packagePath}`);
  const init = compiled.symbols?.[component.init];
  const update = compiled.symbols?.[component.update];
  if (typeof init !== "function" || typeof update !== "function") throw new TypeError("compiled role symbols are not callable");
  let state = init();
  const expectedByAction = new Map(fixture.expectations.map((item) => [item.actionIndex, item]));
  for (let actionIndex = 0; actionIndex <= 8; actionIndex += 1) {
    const expected = expectedByAction.get(actionIndex);
    if (!expected) throw new Error(`fixture expectation missing setup action ${actionIndex}`);
    if (expected.message === null) continue;
    state = update(state, { Name: expected.message.name, Arg: expected.message.arg })[0];
  }
  const lockedState = encode(helpers, state, component);
  const guards = [];
  for (const messageName of ["childAdd", "childReset"]) {
    const original = state;
    const originalBefore = encode(helpers, original, component);
    const result = update(original, { Name: messageName, Arg: "" });
    if (!Array.isArray(result) || result.length !== 2) throw new TypeError(`${messageName} Update must return [state,effects]`);
    const originalAfter = encode(helpers, original, component);
    const returnedState = encode(helpers, result[0], component);
    const effects = goSliceValues(result[1], `${messageName}.effects`) ?? [];
    let originalUnchanged = true;
    let returnedStateUnchanged = true;
    try { assertExactTraceValue(originalBefore, originalAfter, `$.readOnlyGuards.${messageName}.original`); }
    catch { originalUnchanged = false; }
    try { assertExactTraceValue(lockedState, returnedState, `$.readOnlyGuards.${messageName}.returned`); }
    catch { returnedStateUnchanged = false; }
    guards.push({
      classification: "direct-role-update-go-read-only-guard-probe",
      message: { Name: messageName, Arg: "" },
      notABrowserIntent: true,
      originalStateBefore: originalBefore,
      originalStateAfter: originalAfter,
      returnedState,
      effectCount: effects.length,
      originalUnchanged,
      returnedStateUnchanged,
      noEffects: effects.length === 0,
      passed: originalUnchanged && returnedStateUnchanged && effects.length === 0,
    });
  }
  return {
    schema: "gobi.methods-read-only-update-guards/v1",
    setupActionIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    lockedState,
    guards,
    passed: guards.every((guard) => guard.passed),
  };
}
