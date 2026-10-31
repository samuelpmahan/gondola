import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCapabilityConformance } from "../../../../conformance/check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const stem = resolve(here, "../conformance");
const [run, lifecycleRun, lifecycleCheck, browser, expectations] = await Promise.all([
  read(".run.json"), read(".lifecycle.run.json"), read(".lifecycle.check.json"),
  read(".capability.browser.capture.json"),
  JSON.parse(await readFile(resolve(here, "../../../../oracle/expectations.json"), "utf8")),
]);
function read(suffix) { return readFile(`${stem}${suffix}`, "utf8").then(JSON.parse); }
const baseline = { lifecycle: { run: lifecycleRun, check: lifecycleCheck }, browser, expectations, outputPaths: run.outputPaths };
const check = (value) => checkCapabilityConformance(value);
assert.equal(check(baseline).status, "matched");

const observedMutation = structuredClone(baseline);
observedMutation.browser.swap.observedPreservedAfterRejectedSwap = ["state"];
assert.throws(() => check(observedMutation), /values differ/);

const admissionMutation = structuredClone(baseline);
admissionMutation.browser.admissions.hostDescriptorCases[0].initCalls = 1;
assert.throws(() => check(admissionMutation), /ran a Go role/);

const callbackMutation = structuredClone(baseline);
callbackMutation.browser.swap.oldCallbackResult.accepted = true;
assert.throws(() => check(callbackMutation), /old renderer callback/);

const rawSnapshotMutations = [];
for (const [name, mutate] of [
  ["rejected state", (swap) => { swap.rejected.after.snapshot.state.fields[0].value.int = "999"; }],
  ["rejected view", (swap) => { swap.rejected.after.snapshot.view.tree.text = "tampered"; }],
  ["rejected DOM", (swap) => { swap.rejected.after.snapshot.dom.html = "<p>tampered</p>"; }],
  ["rejected pending effect", (swap) => { swap.rejected.after.pending = []; }],
]) {
  const value = structuredClone(baseline);
  mutate(value.browser.swap);
  try { check(value); rawSnapshotMutations.push({ name, rejected: false }); }
  catch { rawSnapshotMutations.push({ name, rejected: true }); }
}

const passthroughMutation = structuredClone(baseline);
passthroughMutation.expectations.swap.incompatibleRendererCapabilities = ["synthetic.unrelated"];
passthroughMutation.browser.swap.expectedIncompatibleRendererCapabilities = ["synthetic.unrelated"];
let syntheticProfilePassthroughRejected = false;
try { check(passthroughMutation); } catch { syntheticProfilePassthroughRejected = true; }

console.log(JSON.stringify({
  baseline: "matched",
  observedPreservationMutationRejected: true,
  admissionEvidenceMutationRejected: true,
  callbackFenceMutationRejected: true,
  rawSnapshotMutations,
  compatibleBeforeSnapshotCaptured: Object.hasOwn(baseline.browser.swap.compatible, "before"),
  compatibleAfterSnapshotCaptured: Object.hasOwn(baseline.browser.swap.compatible, "after"),
  syntheticProfilePassthroughMutationRejected: syntheticProfilePassthroughRejected,
}, null, 2));
