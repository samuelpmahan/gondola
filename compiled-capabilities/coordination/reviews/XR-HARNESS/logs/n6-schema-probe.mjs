import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const stem = resolve(root, "compiled-capabilities/coordination/reviews/XR-HARNESS/conformance");
const read = (suffix) => readFile(`${stem}${suffix}`, "utf8").then(JSON.parse);
const [run, check, manifest, native] = await Promise.all([
  read(".run.json"), read(".capability-check.json"), read(".manifest.json"), read(".lifecycle.native.json"),
]);
const expectations = JSON.parse(await readFile(resolve(root, "compiled-capabilities/oracle/expectations.json"), "utf8"));
const n6Source = await readFile(resolve(root, "compiled-capabilities/run.mjs"), "utf8");
const requiredFlags = ["--react-app-ir", "--react-compiled", "--react-helpers", "--react-manifest",
  "--dom-app-ir", "--dom-compiled", "--dom-helpers", "--dom-manifest", "--native-go", "--fixture",
  "--expectations", "--chromium", "--output"];
for (const flag of requiredFlags) {
  assert(n6Source.includes(JSON.stringify(flag)), `N6 source omits ${flag}`);
  assert(run.command.includes(flag), `fresh N3 command omits ${flag}`);
}
assert.equal(run.status, "matched");
assert.equal(check.schema, "gobi.compiled-capability-check/v1");
assert.equal(check.status, "matched");
assert.equal(manifest.schema, "gobi.compiled-capabilities-conformance-manifest/v1");
assert.equal(manifest.status, "matched");
assert.equal(run.sourceStableThroughCheck, true);
assert.equal(run.buildOutputsStableThroughCheck, true);
assert.equal(check.lifecycle.status, "matched");
assert.equal(run.lifecycle.status, "matched");
assert.equal(check.lifecycle.runPath, run.lifecycle.runPath);
assert.equal(check.lifecycle.checkPath, run.lifecycle.checkPath);
assert.equal(native.schema, "gobi.compiled-lifecycle-native/v1");
assert.equal(native.packagePath, "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle");
assert.equal(native.componentID, native.packagePath);
const nativeEffects = native.steps.flatMap((step) => step.effects ?? []).map((effect) => ({
  kind: effect.kind ?? effect.Kind, name: effect.name ?? effect.Name, reply: effect.reply ?? effect.Reply,
}));
assert(nativeEffects.some((effect) => effect.kind === "fixture.request" && effect.name === "lookup" && effect.reply === "complete"));
assert(nativeEffects.some((effect) => effect.kind === "lifecycle.cancel" && effect.name === "cancel" && effect.reply === ""));
const expectedIDs = [
  ...expectations.admission.rejectBeforeInitOrRender.map((row) => row.id),
  ...expectations.admission.strictHostDeclarations.map((row) => row.id),
  ...expectations.admission.strictRendererDeclarations.map((row) => row.id),
];
assert.deepEqual(check.admission.expectedCaseIds, expectedIDs);
assert.deepEqual(check.admission.observedCaseIds, expectedIDs);
assert.equal(check.admission.allRejectedBeforeInitOrRender, true);
for (const [key, rows] of [["strictHost", expectations.admission.strictHostDeclarations], ["strictRenderer", expectations.admission.strictRendererDeclarations]]) {
  const ids = rows.map((row) => row.id);
  assert.deepEqual(check.admission[key].expectedCaseIds, ids);
  assert.deepEqual(check.admission[key].observedCaseIds, ids);
  assert.equal(check.admission[key].rejectedWithoutInitOrRender, true);
}
assert.equal(check.swap.rejected.errorName, "TypeError");
assert.equal(check.swap.rejected.diagnostic.phase, "admission");
assert.equal(check.swap.rejected.diagnostic.oldUnmounted, false);
assert.equal(check.swap.rejected.diagnostic.toGeneration, null);
assert.deepEqual(check.swap.rejected.expectedPreserved, expectations.swap.preservedAfterRejectedSwap);
assert.deepEqual(check.swap.rejected.observedPreserved, expectations.swap.preservedAfterRejectedSwap);
assert.equal(check.swap.oldActiveClickAccepted, true);
assert.deepEqual(check.swap.compatible.expectedPreserved, expectations.swap.compatibleSwapPreserves);
assert.deepEqual(check.swap.compatible.observedPreserved, expectations.swap.compatibleSwapPreserves);
assert.equal(check.swap.compatible.oldRootDetached, true);
assert.equal(check.swap.oldCallbackFencedAfterCommit, true);
assert.equal(check.swap.replyAccepted, true);
assert.equal(check.swap.disabledClickSuppressed, true);
assert.deepEqual(check.swap.eventOrder, ["init", "click-add-parent", "click-request-parent", "disabled-request-click-suppressed",
  "reject-incompatible-renderer", "old-active-click-after-rejection", "compatible-renderer-commit",
  "fence-old-callback-after-commit", "deliver-pending-reply"]);
for (const suffix of [".lifecycle.native.json", ".lifecycle.direct.json", ".lifecycle.browser.json", ".lifecycle.check.json",
  ".lifecycle.manifest.json", ".lifecycle.run.json", ".capability.browser.capture.json", ".capability-check.json", ".manifest.json", ".run.json"]) {
  await access(`${stem}${suffix}`);
}
console.log(JSON.stringify({
  n6RequiredFlags: requiredFlags.length,
  commandAndOutputSchemas: "matched",
  admissionCases: expectedIDs.length,
  nativeTraceAndEffects: "matched",
  lifecycleTicks: check.lifecycleSummary.ticks,
  lifecycleClicks: check.lifecycleSummary.clicks,
  lifecycleRequests: check.lifecycleSummary.requests,
  lifecycleCancellations: check.lifecycleSummary.cancellations,
  expectedEvidenceFiles: 10,
}, null, 2));
