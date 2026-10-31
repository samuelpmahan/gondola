import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { assertNative } from "./check.mjs";

const repoFile = (path) => fileURLToPath(new URL(path, import.meta.url));
const fixturePath = repoFile("../../fixtures/compiled/children/scenario.json");
const expectationsPath = repoFile("../oracle/expectations.json");
const nativePath = repoFile("../../fixtures/compiled/children/evidence/rawlogs/native-trace.json");
const pinnedNativeSHA256 = "8ad3a28bd1a5e03a3c324dcecb1b5c55d97ffae257b1011103e7730573baefbb";

const [fixture, expectations, nativeBytes] = await Promise.all([
  readFile(fixturePath, "utf8").then(JSON.parse),
  readFile(expectationsPath, "utf8").then(JSON.parse),
  readFile(nativePath),
]);
const nativeTrace = JSON.parse(nativeBytes.toString("utf8"));

function mutatedStep(eventIndex, mutate) {
  const copy = structuredClone(nativeTrace);
  const step = copy.steps.find((candidate) => candidate.eventIndex === eventIndex);
  assert.ok(step, `pinned trace has no Go step for event ${eventIndex}`);
  mutate(step);
  return copy;
}

test("pinned native Go trace matches the independent literal fixture projections", () => {
  const sha256 = createHash("sha256").update(nativeBytes).digest("hex");
  assert.equal(sha256, pinnedNativeSHA256, "native evidence changed; review and explicitly repin it");
  assert.equal(assertNative(nativeTrace, fixture, expectations, "pinned-native"), true);
});

test("native checker rejects a child counter value mutation", () => {
  const changed = mutatedStep(0, (step) => {
    step.state.Children.find((child) => child.Key === "oak").Counter.Count += 1;
  });
  assert.throws(() => assertNative(changed, fixture, expectations, "mutated-count"));
});

test("native checker rejects a reused key with the wrong generation", () => {
  const changed = mutatedStep(15, (step) => {
    step.state.Children.find((child) => child.Key === "oak").Generation = 2;
  });
  assert.throws(() => assertNative(changed, fixture, expectations, "mutated-generation"));
});

test("native checker rejects a child request sequence mutation", () => {
  const changed = mutatedStep(4, (step) => {
    step.state.Children.find((child) => child.Key === "oak").RequestSeq = 2;
  });
  assert.throws(() => assertNative(changed, fixture, expectations, "mutated-request-sequence"));
});

test("native checker rejects clear cancellation effects in the wrong order", () => {
  const changed = mutatedStep(24, (step) => step.effects.reverse());
  assert.throws(() => assertNative(changed, fixture, expectations, "mutated-clear-order"));
});

test("native checker compares the complete Gobi child node key after a pending reorder", () => {
  const changed = mutatedStep(8, (step) => {
    // At source event 8 the list is [ash, oak, elm]. Preserve the rest of the
    // record and corrupt only oak's identity key in the full Go view tree.
    step.view.kids[1].kids[1].key = "child-ash";
  });
  assert.throws(() => assertNative(changed, fixture, expectations, "mutated-node-key"));
});
