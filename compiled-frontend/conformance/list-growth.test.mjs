import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expectedDOMSnapshots } from "./dom-oracle.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/list-growth.json", import.meta.url), "utf8"));
const rootKeys = ["actions", "expectations", "focusWitnesses", "hostScript", "initialState", "name", "packagePath", "schema"];
const stateKeys = ["NextID", "Rows"];

function rows(ids, labels = {}, checked = []) {
  return ids.map((id) => ({ ID: id, Label: labels[id] ?? "", Checked: checked.includes(id) }));
}

test("list-growth fixture is a closed deterministic five-append GoRows sequence", () => {
  assert.deepEqual(Object.keys(fixture).sort(), rootKeys);
  assert.equal(fixture.schema, "gobi.fixture-script/v1");
  assert.equal(fixture.name, "compiled-list-growth-spare-capacity-edit-reorder-reset");
  assert.equal(fixture.packagePath, "github.com/samuelpmahan/gondola/fixtures/compiled/list");
  assert.deepEqual(fixture.initialState, { Rows: null, NextID: 0 });
  assert.deepEqual(fixture.focusWitnesses, []);
  assert.deepEqual(fixture.hostScript, { schema: "gobi.host-script/v1", steps: [] });

  assert.equal(fixture.actions.length, 11);
  for (let index = 0; index < 5; index += 1) {
    assert.deepEqual(fixture.actions[index], { path: "0", event: "click", value: "" });
  }
  assert.deepEqual(fixture.actions.slice(5), [
    { path: "2/2/0", event: "input", value: "grown row three" },
    { path: "2/4/1", event: "change", value: "true" },
    { path: "2/4/2", event: "click", value: "" },
    { path: "2/2/3", event: "click", value: "" },
    { path: "1", event: "click", value: "" },
    { path: "1", event: "click", value: "" },
  ]);
  for (const action of fixture.actions) assert.deepEqual(Object.keys(action).sort(), ["event", "path", "value"]);

  const expectedMessages = [
    ...Array.from({ length: 5 }, () => ({ name: "add", arg: "" })),
    { name: "edit/3", arg: "grown row three" },
    { name: "check/5", arg: "true" },
    { name: "move-up/5", arg: "" },
    { name: "remove/3", arg: "" },
    { name: "reset", arg: "" },
    null,
  ];
  const expectedRows = [
    rows([1]),
    rows([1, 2]),
    rows([1, 2, 3]),
    rows([1, 2, 3, 4]),
    rows([1, 2, 3, 4, 5]),
    rows([1, 2, 3, 4, 5], { 3: "grown row three" }),
    rows([1, 2, 3, 4, 5], { 3: "grown row three" }, [5]),
    rows([1, 2, 3, 5, 4], { 3: "grown row three" }, [5]),
    rows([1, 2, 5, 4], { 3: "grown row three" }, [5]),
    [],
    [],
  ];

  assert.equal(fixture.expectations.length, 11);
  for (let index = 0; index < fixture.expectations.length; index += 1) {
    const expectation = fixture.expectations[index];
    assert.deepEqual(Object.keys(expectation).sort(), ["actionIndex", "completedEffects", "dispatchId", "message", "requestedEffects", "state"]);
    assert.equal(expectation.actionIndex, index);
    assert.deepEqual(expectation.message, expectedMessages[index]);
    assert.deepEqual(expectation.state.Rows, expectedRows[index]);
    assert.deepEqual(Object.keys(expectation.state).sort(), stateKeys);
    assert.equal(expectation.state.NextID, Math.min(index + 1, 5));
    assert.deepEqual(expectation.requestedEffects, []);
    assert.deepEqual(expectation.completedEffects, []);
    assert.equal(expectation.dispatchId, index < 10 ? `dispatch-${String(index + 1).padStart(4, "0")}` : null);
  }

  // These are the two intermediate lengths requested for GoSlice spare-capacity coverage.
  assert.equal(fixture.expectations[2].state.Rows.length, 3);
  assert.equal(fixture.expectations[4].state.Rows.length, 5);
  assert.equal(fixture.initialState.Rows, null, "initial Rows must preserve nil");
  assert.deepEqual(fixture.expectations[9].state.Rows, []);
  assert.deepEqual(fixture.expectations[10].state.Rows, []);
  assert.equal(fixture.expectations[10].message, null, "the second reset click must be suppressed after reset disables it");

  const dom = expectedDOMSnapshots(fixture);
  assert.equal(dom.length, 12, "DOM oracle must include init and every attempted action");
  assert.equal(dom[0].controls.find((entry) => entry.path === "1").disabled, true);
  assert.equal(dom[3].controls.filter((entry) => entry.key.startsWith("row-")).length, 12);
  assert.equal(dom[5].controls.filter((entry) => entry.key.startsWith("row-")).length, 20);
  assert.equal(dom[7].controls.find((entry) => entry.path === "2/4/1").checked, true);
  assert.equal(dom[8].controls.find((entry) => entry.path === "2/3/1").key, "row-5-checked");
  assert.ok(dom[9].controls.every((entry) => entry.key !== "row-3-label"));
  assert.equal(dom[10].controls.find((entry) => entry.path === "1").disabled, true);
  assert.equal(dom[11].controls.find((entry) => entry.path === "1").disabled, true);
});
