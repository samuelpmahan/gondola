import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";

const attempt = join(import.meta.dirname, "attempt-02");
const readJSON = async (name) => JSON.parse(await readFile(join(attempt, name), "utf8"));
const [capture, check, run] = await Promise.all([
  readJSON("conformance.capability.browser.capture.json"),
  readJSON("conformance.capability-check.json"),
  readJSON("conformance.run.json"),
]);
assert.equal(run.status, "matched");
assert.equal(check.status, "matched");
assert.equal(run.sourceStableThroughCheck, true);
assert.equal(run.buildOutputsStableThroughCheck, true);
assert.deepEqual(run.sourcePinsBefore, run.sourcePinsFinal);
assert.deepEqual(run.buildOutputPinsBeforeCheck, run.buildOutputPinsAfterCheck);
const host = capture.admissions.hostDescriptorCases.find((row) => row.id === "accessor-host-capabilities-property");
assert(host);
assert.equal(host.optionAccessorConstructed, true);
assert.equal(host.optionGetterCalls, 0);
assert.equal(host.initCalls, 0);
assert.equal(host.updateCalls, 0);
assert.equal(host.viewCalls, 0);
assert.equal(host.rendererCalls, 0);
assert.equal(host.containerEmpty, true);
assert.equal(check.admission.strictHost.hostOptionAccessorConstructed, true);
assert.equal(check.admission.strictHost.hostOptionGetterCalls, 0);
for (const name of ["rejected", "compatible"]) {
  const swap = capture.swap[name];
  for (const key of ["state", "view", "dom"]) {
    assert.deepEqual(swap.before.snapshot[key], swap.after.snapshot[key], `${name}.${key}`);
  }
  assert.deepEqual(swap.before.pending, swap.after.pending, `${name}.pending`);
  assert.equal(check.swap[name].rawPreservationVerified, true);
}
assert.equal(capture.initialAppIRUsedUnmodified, true);
assert.deepEqual(capture.componentCapabilities, [
  "view.node", "numeric.safe-integer", "numeric.float64", "effect.request-reply", "effect.cancel",
]);
assert.deepEqual(check.swap.rejected.actualRequiredRendererCapabilities, ["view.node"]);
assert.deepEqual(check.swap.rejected.candidateCapabilities, []);
assert.equal(check.swap.rejected.missingCapability, "view.node");
const mutationIds = [
  "rejected-state", "rejected-view", "rejected-dom", "rejected-pending",
  "compatible-state", "compatible-view", "compatible-dom", "compatible-pending",
  "host-option-accessor-construction",
];
assert.equal(check.capabilityMutationControlsDetected, 9);
assert.deepEqual(check.capabilityMutationControls.map((row) => row.id), mutationIds);
assert(check.capabilityMutationControls.every((row) => row.detected === true && typeof row.error === "string" && row.error.length > 0));
await assert.rejects(access(join(attempt, "conformance.failed.json")), { code: "ENOENT" });
const output = JSON.parse((await readFile(join(attempt, "logs/runner.stdout.log"), "utf8")).trim());
assert.equal(output.status, "matched");
assert.equal(output.admissionCases, 19);
assert.equal(output.lifecycleTicks, 26);
console.log(JSON.stringify({
  run: run.status,
  check: check.status,
  admissionCases: output.admissionCases,
  lifecycleTicks: output.lifecycleTicks,
  hostOptionAccessor: { constructed: host.optionAccessorConstructed, getterCalls: host.optionGetterCalls,
    init: host.initCalls, update: host.updateCalls, view: host.viewCalls, renderer: host.rendererCalls },
  rawPreservation: { rejected: check.swap.rejected.rawPreservationVerified, compatible: check.swap.compatible.rawPreservationVerified },
  actualRequirement: check.swap.rejected.actualRequiredRendererCapabilities,
  activeCandidate: check.swap.rejected.candidateCapabilities,
  missingCapability: check.swap.rejected.missingCapability,
  mutationControlsDetected: check.capabilityMutationControlsDetected,
  sourceStable: run.sourceStableThroughCheck,
  buildOutputsStable: run.buildOutputsStableThroughCheck,
}, null, 2));
