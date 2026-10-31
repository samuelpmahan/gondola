import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkLifecycleConformance } from "./check.mjs";
import { LIFECYCLE_COMPONENT_ID, LIFECYCLE_STEPS, lifecycleEventsForFixture } from "../browser/lifecycle-oracle.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readJSON = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));

test("frozen lifecycle fixture maps to all 26 oracle events and 26 states", async () => {
  const fixture = await readJSON("fixtures/compiled/lifecycle/scenario.json");
  assert.equal(fixture.componentID, LIFECYCLE_COMPONENT_ID);
  assert.deepEqual(fixture.events, lifecycleEventsForFixture());
  assert.equal(LIFECYCLE_STEPS.length, 26);
  assert.equal(LIFECYCLE_STEPS.filter((step) => step.kind === "click").length, 16);
  assert.equal(LIFECYCLE_STEPS[8].stateIndex, 8);
  assert.equal(LIFECYCLE_STEPS[9].effects.map((effect) => effect.arg).join(","),
    "grandchild:g1:r3,child:g1:r2,parent:g1:r1");
});

test("conformance checker rejects the display label as an AppIR identity", async () => {
  const [fixture, contract] = await Promise.all([
    readJSON("fixtures/compiled/lifecycle/scenario.json"),
    readJSON("compiled-lifecycle/conformance/lifecycle-contract.json"),
  ]);
  const appIR = { components: [{ id: "compiled-lifecycle", packagePath: fixture.packagePath }] };
  assert.throws(() => checkLifecycleConformance({ fixture, contract, schedule: {}, appIR, reactAppIR: appIR,
    domAppIR: appIR, native: {}, direct: {}, browser: {}, helpers: {} }), /\$\.appIR\.componentID/);
});

test("conformance checker requires the frozen request-reply AppIR capability", async () => {
  const [fixture, contract] = await Promise.all([
    readJSON("fixtures/compiled/lifecycle/scenario.json"),
    readJSON("compiled-lifecycle/conformance/lifecycle-contract.json"),
  ]);
  const appIR = {
    components: [{ id: fixture.componentID, packagePath: fixture.packagePath, capabilities: ["view.node"],
      stateType: contract.stateType, messageType: contract.messageType }],
    symbols: [],
  };
  assert.throws(() => checkLifecycleConformance({ fixture, contract, schedule: {}, appIR, reactAppIR: appIR,
    domAppIR: appIR, native: {}, direct: {}, browser: {}, helpers: {} }), /missing required capability effect.request-reply/);
});
