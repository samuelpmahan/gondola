import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";

export const METHODS_FIXTURE_NAME = "compiled-value-method-composition-child-readonly-snapshot";
export const METHODS_PACKAGE_PATH = "github.com/samuelpmahan/gondola/fixtures/compiled/methods";

export const METHODS_ACTIONS = Object.freeze([
  ["1/1", "childAdd"],
  ["1/1", "childAdd"],
  ["4", "captureChild"],
  ["1/1", "childAdd"],
  ["5", "publishSaved"],
  ["1/2", "childReset"],
  ["1/2", null],
  ["1/1", "childAdd"],
  ["2", "toggleReadOnly"],
  ["1/1", null],
  ["1/2", null],
  ["0/1", "parentAdd"],
  ["4", "captureChild"],
  ["5", "publishSaved"],
  ["2", "toggleReadOnly"],
  ["1/1", "childAdd"],
  ["0/2", "parentReset"],
  ["0/2", null],
].map(([path, message]) => Object.freeze({ path, event: "click", value: "", message })));

// This table is authored from the frozen fixture contract, not projected from
// AppIR, a renderer view, or browser output. Entry zero is the Init state.
export const METHODS_STATES = Object.freeze([
  [0, 0, false, 0],
  [0, 1, false, 0],
  [0, 2, false, 0],
  [0, 2, false, 2],
  [0, 3, false, 2],
  [2, 3, false, 2],
  [2, 0, false, 2],
  [2, 0, false, 2],
  [2, 1, false, 2],
  [2, 1, true, 2],
  [2, 1, true, 2],
  [2, 1, true, 2],
  [3, 1, true, 2],
  [3, 1, true, 1],
  [1, 1, true, 1],
  [1, 1, false, 1],
  [1, 2, false, 1],
  [0, 2, false, 1],
  [0, 2, false, 1],
].map(([parent, child, readOnly, savedChild]) => Object.freeze({ parent, child, readOnly, savedChild })));

const CONTROL_KEYS = Object.freeze([
  ["0/1", "parent-add", "Parent +", () => false],
  ["0/2", "parent-reset", "Parent Reset", (state) => state.parent === 0],
  ["1/1", "child-add", "Child +", (state) => state.readOnly],
  ["1/2", "child-reset", "Child Reset", (state) => state.readOnly || state.child === 0],
  ["2", "readonly-toggle", (state) => state.readOnly ? "Unlock child" : "Lock child", () => false],
  ["4", "capture-child", "Capture child", () => false],
  ["5", "publish-saved", "Publish saved to parent", () => false],
]);

function validateState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("methods oracle state must be an object");
  }
  const expected = ["parent", "child", "readOnly", "savedChild"];
  const actual = Object.keys(state).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== [...expected].sort()[index])) {
    throw new TypeError("methods oracle state must contain exactly parent, child, readOnly, savedChild");
  }
  for (const key of ["parent", "child", "savedChild"]) {
    if (!Number.isSafeInteger(state[key]) || state[key] < 0) {
      throw new TypeError(`methods oracle state.${key} must be a non-negative safe integer`);
    }
  }
  if (typeof state.readOnly !== "boolean") throw new TypeError("methods oracle state.readOnly must be boolean");
}

export function methodsStateAtTick(tickIndex) {
  if (!Number.isSafeInteger(tickIndex) || tickIndex < 0 || tickIndex >= METHODS_STATES.length) {
    throw new RangeError(`methods tick index must be between 0 and ${METHODS_STATES.length - 1}`);
  }
  return { ...METHODS_STATES[tickIndex] };
}

export function expectedMethodsDOM(state) {
  validateState(state);
  const resetParentDisabled = state.parent === 0 ? " disabled=\"\"" : "";
  const childAddDisabled = state.readOnly ? " disabled=\"\"" : "";
  const resetChildDisabled = state.readOnly || state.child === 0 ? " disabled=\"\"" : "";
  const lockLabel = state.readOnly ? "Unlock child" : "Lock child";
  const html = `<div class="method-composition"><div class="parent-counter"><p>Parent: ${state.parent}</p><button>Parent +</button><button${resetParentDisabled}>Parent Reset</button></div><div class="child-counter"><p>Child: ${state.child}</p><button${childAddDisabled}>Child +</button><button${resetChildDisabled}>Child Reset</button></div><button>${lockLabel}</button><p>Saved child: ${state.savedChild}</p><button>Capture child</button><button>Publish saved to parent</button></div>`;
  const controls = CONTROL_KEYS.map(([path, key, textOrStateText, disabledFor]) => ({
    path,
    key,
    tag: "button",
    type: "submit",
    value: "",
    checked: false,
    disabled: disabledFor(state),
    text: typeof textOrStateText === "function" ? textOrStateText(state) : textOrStateText,
  }));
  // Browser renderer snapshots intentionally omit text from controls; text is
  // kept only in the separate physical-control evidence below.
  return {
    normalization: "outerHTML-v1",
    html,
    controls: controls.map(({ text: _text, ...control }) => control),
  };
}

export function expectedMethodsPhysicalControls(state) {
  const snapshot = expectedMethodsDOM(state);
  return snapshot.controls.map((control, index) => ({
    ...control,
    text: CONTROL_KEYS[index][2] instanceof Function ? CONTROL_KEYS[index][2](state) : CONTROL_KEYS[index][2],
  }));
}

export function expandMethodsSwapSchedule(schedule) {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule) ||
      schedule.schema !== "gobi.methods-swap-schedule/v1" || schedule.initialBackend !== "react" ||
      !Array.isArray(schedule.backends) || schedule.backends.length !== 2 ||
      schedule.backends[0] !== "react" || schedule.backends[1] !== "dom" ||
      schedule.policy !== "alternate-after-each-fixture-action") {
    throw new TypeError("swap schedule must match the frozen react/dom alternate-after-each-fixture-action contract");
  }
  let current = schedule.initialBackend;
  const transitions = [];
  for (let actionIndex = 0; actionIndex < METHODS_ACTIONS.length; actionIndex += 1) {
    current = current === schedule.backends[0] ? schedule.backends[1] : schedule.backends[0];
    transitions.push({ afterActionIndex: actionIndex, to: current });
  }
  return {
    schedule: { schema: schedule.schema, initialBackend: schedule.initialBackend, backends: [...schedule.backends], policy: schedule.policy },
    transitions,
  };
}

export function assertMethodsDOMSnapshot(actual, state, path = "$.methods.dom") {
  assertExactTraceValue(expectedMethodsDOM(state), actual, path);
  return true;
}

export function validateMethodsFixtureScript(fixture) {
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) {
    throw new TypeError("methods fixture script must be an object");
  }
  if (fixture.schema !== "gobi.fixture-script/v1") throw new TypeError("methods fixture schema differs from gobi.fixture-script/v1");
  if (fixture.name !== METHODS_FIXTURE_NAME) throw new TypeError("methods fixture name differs from the frozen contract");
  if (fixture.packagePath !== METHODS_PACKAGE_PATH) throw new TypeError("methods fixture packagePath differs from the frozen contract");
  if (!Array.isArray(fixture.actions) || fixture.actions.length !== METHODS_ACTIONS.length) {
    throw new TypeError(`methods fixture must have exactly ${METHODS_ACTIONS.length} actions`);
  }
  for (let index = 0; index < METHODS_ACTIONS.length; index += 1) {
    const expected = METHODS_ACTIONS[index];
    const actual = fixture.actions[index];
    const action = actual && { path: actual.path, event: actual.event, value: actual.value };
    assertExactTraceValue(
      { path: expected.path, event: expected.event, value: expected.value },
      action,
      `$.methods.fixture.actions[${index}]`,
    );
  }
  if (!fixture.hostScript || fixture.hostScript.schema !== "gobi.host-script/v1" ||
      !Array.isArray(fixture.hostScript.steps) || fixture.hostScript.steps.length !== 0) {
    throw new TypeError("methods fixture must declare an empty gobi.host-script/v1 script");
  }
  return true;
}
