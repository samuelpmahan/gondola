import test from "node:test";
import assert from "node:assert/strict";

import { encodeFixtureState, validateFixtureExpectations } from "./fixture-expectations.mjs";

const app = {
  components: [{ id: "form", packagePath: "example/form", stateType: "State" }],
  types: [
    { id: "bool", kind: "bool", jsRepresentation: "direct" },
    { id: "string", kind: "string", jsRepresentation: "direct" },
    { id: "[]string", kind: "slice", elemType: "string", jsRepresentation: "array-or-goscript-slice" },
    { id: "float64", kind: "float64", jsRepresentation: "number" },
    { id: "State", kind: "struct", fields: [
      { name: "Text", type: "string" },
      { name: "Enabled", type: "bool" },
      { name: "Rows", type: "[]string" },
      { name: "Float", type: "float64" },
    ], jsRepresentation: "class" },
  ],
};

const fixture = {
  schema: "gobi.fixture-script/v1",
  packagePath: "example/form",
  initialState: { Text: "", Enabled: false, Rows: null, FloatBits: "8000000000000000" },
  actions: [{ path: "0", event: "click", value: "intent" }],
  expectations: [{ actionIndex: 0, message: { name: "literal", arg: "target.value" }, dispatchId: "dispatch-0001",
    state: { Text: "target.value", Enabled: false, Rows: [], FloatBits: "8000000000000000" }, requestedEffects: [] }],
};

function trace() {
  return {
    schema: "gobi.trace/v1", appId: "form", ticks: [
      { index: 0, action: null, message: null, dispatchId: null,
        state: encodeFixtureState(fixture.initialState, "State", app.types), requestedEffects: [], completedEffects: [], view: { tree: {}, bindings: [] }, dom: null },
      { index: 1, action: fixture.actions[0], message: { name: "literal", arg: "target.value" }, dispatchId: "dispatch-0001",
        state: encodeFixtureState(fixture.expectations[0].state, "State", app.types), requestedEffects: [], completedEffects: [], view: { tree: {}, bindings: [] }, dom: null },
    ],
  };
}

test("encodes fixture expectations losslessly, including nil/empty and negative zero", () => {
  const nil = encodeFixtureState(fixture.initialState, "State", app.types);
  assert.equal(nil.fields[2].value.isNil, true);
  assert.deepEqual(nil.fields[2].value.items, []);
  assert.equal(nil.fields[3].value.float64Bits, "8000000000000000");
  const empty = encodeFixtureState(fixture.expectations[0].state, "State", app.types);
  assert.equal(empty.fields[2].value.isNil, false);
  assert.deepEqual(empty.fields[2].value.items, []);
});

test("checks full action intent and message as independent fixture channels", () => {
  assert.equal(validateFixtureExpectations(trace(), fixture, app), true);
  const badIntent = trace();
  badIntent.ticks[1].action = { ...fixture.actions[0], value: "target.value" };
  assert.throws(() => validateFixtureExpectations(badIntent, fixture, app), /ticks\[1\]/);
  const badMessage = trace();
  badMessage.ticks[1].message.arg = "intent";
  assert.throws(() => validateFixtureExpectations(badMessage, fixture, app), /ticks\[1\]/);
  const badState = trace();
  badState.ticks[1].state.fields[0].value.string = "bad";
  assert.throws(() => validateFixtureExpectations(badState, fixture, app), /ticks\[1\]/);
});
