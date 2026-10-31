import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  LIFECYCLE_COMPONENT_ID,
  LIFECYCLE_PACKAGE_PATH,
  LIFECYCLE_STEPS,
  expectedLifecycleStateAtTick,
  expectedLifecycleView,
} from "../../../browser/lifecycle-oracle.mjs";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("usage: node audit-native.mjs <native-output.json>");
const native = JSON.parse(await readFile(resolve(inputPath), "utf8"));
assert.equal(native.schema, "gobi.compiled-lifecycle-native/v1");
assert.equal(native.packagePath, LIFECYCLE_PACKAGE_PATH);
assert.equal(native.componentID, LIFECYCLE_COMPONENT_ID);
assert.equal(native.steps.length, LIFECYCLE_STEPS.length);

for (let index = 0; index < LIFECYCLE_STEPS.length; index += 1) {
  const expected = LIFECYCLE_STEPS[index];
  const actual = native.steps[index];
  const state = expectedLifecycleStateAtTick(expected.stateIndex);
  assert.equal(actual.index, index, `step ${index} index`);
  assert.equal(actual.kind, expected.kind, `step ${index} kind`);
  assert.deepEqual(actual.message, expected.message ?? null, `step ${index} message`);
  assert.deepEqual(actual.effects, expected.effects ?? [], `step ${index} effects`);
  assert.deepEqual(actual.state, state, `step ${index} full Go state`);
  assert.deepEqual(actual.view, expectedLifecycleView(state).tree, `step ${index} Gobi tree`);
  if (expected.kind === "renderer-swap") {
    assert.deepEqual(actual.rendererSwap, { from: expected.from, to: expected.to, target: expected.target });
  } else {
    assert.equal(actual.rendererSwap, null, `step ${index} renderer swap`);
  }
  if (expected.kind === "go-message") assert.equal(actual.outcome, expected.expect, `step ${index} outcome`);
  if (expected.kind === "effect-reply") {
    assert.equal(actual.outcome, expected.expect === "accepted" ? "go-accepted" : "go-no-op", `step ${index} outcome`);
  }
  if (expected.kind === "renderer-swap") assert.equal(actual.outcome, "state-preserved", `step ${index} outcome`);
}

console.log(`PASS native lifecycle trace: ${native.steps.length} steps; state, message, effects, identity, and Gobi tree match independent oracle`);
