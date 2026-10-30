import test from "node:test";
import assert from "node:assert/strict";
import { BUTTON_PATH, fixedScripts, seededScripts } from "./scripts.mjs";

test("fixed scripts cover disabled reset, interleaving, and burst clicks", () => {
  const byName = Object.fromEntries(fixedScripts.map((script) => [script.name, script]));
  assert.equal(BUTTON_PATH.add, "1");
  assert.equal(BUTTON_PATH.reset, "2");
  assert.deepEqual(byName["reset-while-zero"].actions.map((step) => step.action), ["reset"]);
  assert.equal(byName["rapid-add-burst"].actions.filter((step) => step.action === "add").length, 32);
  assert.deepEqual(byName["rapid-toggle-burst"].actions.slice(3, 5).map((step) => step.action), ["reset", "reset"]);
});

test("seeded scripts are stable and retain enough context to reproduce failures", () => {
  const a = seededScripts(20261030, { cases: 10, maxActions: 12 });
  const b = seededScripts(20261030, { cases: 10, maxActions: 12 });
  assert.deepEqual(a, b);
  assert.ok(a.every((script) => script.seed === 20261030 && script.actions.length >= 1));
  assert.ok(a.every((script) => script.actions.every((step) => ["1", "2"].includes(step.Path))));
  assert.notDeepEqual(a, seededScripts(20261031, { cases: 10, maxActions: 12 }));
});

test("seed and size arguments reject invalid values", () => {
  assert.throws(() => seededScripts(-1), RangeError);
  assert.throws(() => seededScripts(1, { cases: -1 }), RangeError);
  assert.throws(() => seededScripts(1, { maxActions: 0 }), RangeError);
});
