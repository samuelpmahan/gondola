import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  METHODS_ACTIONS,
  METHODS_STATES,
  assertMethodsDOMSnapshot,
  expandMethodsSwapSchedule,
  expectedMethodsDOM,
  expectedMethodsPhysicalControls,
  methodsStateAtTick,
  validateMethodsFixtureScript,
} from "./dom-oracle.mjs";

test("the hand-authored methods oracle covers the init tick and all 18 actions", () => {
  assert.equal(METHODS_STATES.length, 19);
  assert.equal(METHODS_ACTIONS.length, 18);
  assert.deepEqual(methodsStateAtTick(0), { parent: 0, child: 0, readOnly: false, savedChild: 0 });
  assert.deepEqual(methodsStateAtTick(5), { parent: 2, child: 3, readOnly: false, savedChild: 2 });
  assert.deepEqual(methodsStateAtTick(14), { parent: 1, child: 1, readOnly: true, savedChild: 1 });
  assert.deepEqual(methodsStateAtTick(18), { parent: 0, child: 2, readOnly: false, savedChild: 1 });
});

test("initial outerHTML and live controls are hand-authored in source attribute order", () => {
  const snapshot = expectedMethodsDOM(methodsStateAtTick(0));
  assert.deepEqual(snapshot, {
    normalization: "outerHTML-v1",
    html: '<div class="method-composition"><div class="parent-counter"><p>Parent: 0</p><button>Parent +</button><button disabled="">Parent Reset</button></div><div class="child-counter"><p>Child: 0</p><button>Child +</button><button disabled="">Child Reset</button></div><button>Lock child</button><p>Saved child: 0</p><button>Capture child</button><button>Publish saved to parent</button></div>',
    controls: [
      { path: "0/1", key: "parent-add", tag: "button", type: "submit", value: "", checked: false, disabled: false },
      { path: "0/2", key: "parent-reset", tag: "button", type: "submit", value: "", checked: false, disabled: true },
      { path: "1/1", key: "child-add", tag: "button", type: "submit", value: "", checked: false, disabled: false },
      { path: "1/2", key: "child-reset", tag: "button", type: "submit", value: "", checked: false, disabled: true },
      { path: "2", key: "readonly-toggle", tag: "button", type: "submit", value: "", checked: false, disabled: false },
      { path: "4", key: "capture-child", tag: "button", type: "submit", value: "", checked: false, disabled: false },
      { path: "5", key: "publish-saved", tag: "button", type: "submit", value: "", checked: false, disabled: false },
    ],
  });
  assert.deepEqual(expectedMethodsPhysicalControls(methodsStateAtTick(9)).filter((control) => control.disabled).map((control) => control.path), ["1/1", "1/2"]);
});

test("disabled controls match the frozen zero and read-only transitions", () => {
  for (let index = 0; index < METHODS_STATES.length; index += 1) {
    const expected = expectedMethodsDOM(methodsStateAtTick(index));
    assert.equal(expected.controls[1].disabled, methodsStateAtTick(index).parent === 0, `parent reset tick ${index}`);
    assert.equal(expected.controls[2].disabled, methodsStateAtTick(index).readOnly, `child add tick ${index}`);
    assert.equal(expected.controls[3].disabled,
      methodsStateAtTick(index).readOnly || methodsStateAtTick(index).child === 0,
      `child reset tick ${index}`);
  }
  assert.deepEqual(METHODS_ACTIONS.map((action, index) => action.message === null ? index : null).filter(Number.isInteger), [6, 9, 10, 17]);
});

test("the DOM oracle rejects serialization and live-control mutations", () => {
  const state = methodsStateAtTick(9);
  const expected = expectedMethodsDOM(state);
  assertMethodsDOMSnapshot(expected, state);

  const changedAttributeOrder = structuredClone(expected);
  changedAttributeOrder.html = changedAttributeOrder.html.replace('<button disabled="">Child +</button>', '<button>Child +</button>');
  assert.throws(() => assertMethodsDOMSnapshot(changedAttributeOrder, state), /value differs/);

  const changedControl = structuredClone(expected);
  changedControl.controls[2].disabled = false;
  assert.throws(() => assertMethodsDOMSnapshot(changedControl, state), /value differs/);
});

test("fixture validation binds the browser run to the canonical action and empty-host contract", async () => {
  const fixture = JSON.parse(await readFile(new URL("../conformance/fixtures/methods.json", import.meta.url), "utf8"));
  assert.equal(validateMethodsFixtureScript(fixture), true);
  const mutated = structuredClone(fixture);
  mutated.actions[3].path = "0/1";
  assert.throws(() => validateMethodsFixtureScript(mutated), /value differs/);
});

test("the canonical browser schedule alternates after every action, including the final action", async () => {
  const schedule = JSON.parse(await readFile(new URL("../conformance/swap-schedule.json", import.meta.url), "utf8"));
  const expanded = expandMethodsSwapSchedule(schedule);
  assert.equal(expanded.transitions.length, 18);
  assert.deepEqual(expanded.transitions[0], { afterActionIndex: 0, to: "dom" });
  assert.deepEqual(expanded.transitions[17], { afterActionIndex: 17, to: "react" });
  for (let index = 0; index < expanded.transitions.length; index += 1) {
    assert.equal(expanded.transitions[index].afterActionIndex, index);
    assert.equal(expanded.transitions[index].to, index % 2 === 0 ? "dom" : "react");
  }
  assert.throws(() => expandMethodsSwapSchedule({ ...schedule, policy: "swap-once" }), /alternate-after-each-fixture-action/);
});
