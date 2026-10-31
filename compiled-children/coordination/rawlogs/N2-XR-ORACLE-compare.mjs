import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNativeCapture,
  ORACLE_EXPECTATIONS,
  ORACLE_SCENARIO,
  ORACLE_STATES,
} from "../../oracle/oracle.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const freshBytes = readFileSync(resolve(here, "N2-XR-ORACLE-native-fresh.json"));
const savedBytes = readFileSync(resolve(here, "../../oracle/evidence/native.json"));
const fresh = JSON.parse(freshBytes);
assert.deepEqual(freshBytes, savedBytes, "fresh native output differs from N5 saved output");
assert.equal(ORACLE_SCENARIO.events.length, 42);
assert.equal(fresh.events.length, 42);
assert.equal(fresh.steps.length, 38);
assert.equal(ORACLE_STATES.length, 39);
assert.equal(ORACLE_EXPECTATIONS.stateProjections.length, 39);
assert(ORACLE_EXPECTATIONS.stateProjections.every((p) => p.state && p.view && p.viewRecord && p.dom));
assert.equal(assertNativeCapture(fresh), true);
console.log("fresh trace byte equality: PASS");
console.log("event/step/state counts: 42 / 38 / 39");
console.log("all expected projections include state, Gobi view, view record, and normalized DOM: PASS");
console.log("assertNativeCapture exact state/effect/tree/event comparison: PASS");
