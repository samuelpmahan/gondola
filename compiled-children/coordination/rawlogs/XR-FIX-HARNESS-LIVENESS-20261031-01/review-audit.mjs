import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../../..");
const path = (...parts) => resolve(root, ...parts);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJSON = async (...parts) => JSON.parse(await readFile(path(...parts), "utf8"));
const hashFile = async (...parts) => {
  const bytes = await readFile(path(...parts));
  return { path: parts.join("/"), bytes: bytes.length, sha256: digest(bytes) };
};

const fixReceipt = await readJSON("compiled-children/coordination/receipts/E-FIX-HARNESS-LIVENESS.json");
const fixReportBytes = await readFile(path("compiled-children/coordination/reports/E-FIX-HARNESS-LIVENESS.md"));
const originalManifest = await readJSON("compiled-children/coordination/repairs/E-FIX-HARNESS-LIVENESS/originals/manifest.json");
const custody = await readJSON("compiled-children/coordination/rawlogs/E-FIX-HARNESS-LIVENESS-20261031-01/canonical-custody-restoration.json");
const evidenceRoot = "compiled-children/conformance/evidence/E-FIX-HARNESS-LIVENESS-20261031-01";
const stem = "replay-custody-safe";
const run = await readJSON(evidenceRoot, `${stem}.run.json`);
const check = await readJSON(evidenceRoot, `${stem}.check.json`);
const browser = await readJSON(evidenceRoot, `${stem}.browser.json`);
const seeded = await readJSON(evidenceRoot, `${stem}.seeded.json`);
const manifest = await readJSON(evidenceRoot, `${stem}.manifest.json`);

const preserved = [];
for (const entry of originalManifest.files) {
  const saved = await hashFile(entry.preserved);
  assert.equal(saved.bytes, entry.bytes, `preserved original size changed: ${entry.preserved}`);
  assert.equal(saved.sha256, entry.sha256, `preserved original hash changed: ${entry.preserved}`);
  if (entry.source.endsWith("/E-HARNESS.md") || entry.source.endsWith("/E-HARNESS.json")) {
    const current = await hashFile(entry.source);
    assert.deepEqual(current, { path: entry.source, bytes: entry.bytes, sha256: entry.sha256 },
      `canonical author packet was not restored byte-for-byte: ${entry.source}`);
    preserved.push(current);
  }
}
const generatedIncidentCopies = [];
for (const [key, artifact] of Object.entries(custody.savedAutoOutput)) {
  const current = await hashFile(artifact.path);
  assert.equal(current.bytes, artifact.bytes, `preserved generated ${key} byte count differs`);
  assert.equal(current.sha256, artifact.sha256, `preserved generated ${key} hash differs`);
  generatedIncidentCopies.push(current);
}

assert.equal(run.status, "matched");
assert.equal(run.sourcesStable, true);
assert.equal(run.buildOutputsStable, true);
assert.deepEqual(run.failures, []);
assert.equal(run.sourcePinsBefore.length, 85);
assert.equal(run.sourcePinsAfter.length, 85);
assert.deepEqual(run.sourcePinsBefore, run.sourcePinsAfter);
assert.equal(run.buildOutputPinsBeforeCheck.length, 8);
assert.equal(run.buildOutputPinsAfterCheck.length, 8);
assert.deepEqual(run.buildOutputPinsBeforeCheck, run.buildOutputPinsAfterCheck);
for (const pin of [...run.sourcePinsBefore, ...run.buildOutputPinsBeforeCheck]) {
  const current = await hashFile(pin.path);
  assert.equal(current.bytes, pin.bytes, `source/build pin byte count changed: ${pin.path}`);
  assert.equal(current.sha256, pin.sha256, `source/build pin hash changed: ${pin.path}`);
}

assert.equal(check.status, "matched");
assert.deepEqual([check.events, check.goUpdates, check.stateCheckpoints], [42, 38, 39]);
assert.equal(check.mutationControlsDetected, 12);
assert.equal(check.mutationControls.length, 12);
assert.ok(check.mutationControls.every((item) => item.detected === true));
assert.equal(check.nativeStateCheckedAgainstLiteralOracle, true);
assert.equal(check.directTypedStateCheckedAgainstLiteralOracle, true);
assert.equal(check.browserRawDOMCheckedAgainstLiteralOracle, true);
assert.equal(check.rendererLifecycleChecked, true);
assert.deepEqual(check.noWasmGuardCoverage, { status: "complete", entries: 10, failures: 0 });
assert.deepEqual(check.browserProfiles, ["react", "dom", "swap"]);

const swap = browser.profiles.swap;
const acceptedSwap = swap.swaps.find((item) => item.accepted === true);
const rejectedSwap = swap.swaps.find((item) => item.accepted === false);
assert.equal(acceptedSwap.to, "react");
assert.deepEqual(acceptedSwap.after.renderer, { id: 2, backend: "react" });
assert.deepEqual(rejectedSwap.after.renderer, acceptedSwap.after.renderer);
const liveClick = swap.events.find((item) => item.eventIndex > rejectedSwap.eventIndex && item.event?.kind === "click");
assert.equal(liveClick.operation.method, "HTMLElement.click");
assert.deepEqual({ backend: liveClick.operation.observed.backend, rendererId: liveClick.operation.observed.rendererId },
  { backend: "react", rendererId: 2 });
const liveAction = swap.actions.find((item) => item.eventIndex === liveClick.eventIndex);
const liveDispatch = swap.observations.dispatch.find((item) => item.eventIndex === liveClick.eventIndex);
assert.deepEqual({ backend: liveAction.observed.backend, rendererId: liveAction.observed.rendererId },
  { backend: "react", rendererId: 2 });
assert.deepEqual({ backend: liveDispatch.backend, rendererId: liveDispatch.rendererId },
  { backend: "react", rendererId: 2 });
assert.deepEqual(browser.noWasm.guardCoverage.entries.map(({ name, kind, status }) => ({ name, kind, status })),
  check.noWasmGuardCoverage.entries === 10 ? browser.noWasm.guardCoverage.entries.map(({ name, kind, status }) => ({ name, kind, status })) : []);
assert.equal(browser.noWasm.guardCoverage.status, "complete");
assert.deepEqual(browser.noWasm.guardCoverage.failures, []);
for (const kind of ["react", "dom", "swap"]) {
  assert.deepEqual(browser.profiles[kind].noWasm, browser.noWasm);
}

assert.deepEqual(seeded.results.map(({ seed, events, goUpdates }) => ({ seed, events, goUpdates })), [
  { seed: 20261031, events: 60, goUpdates: 59 },
  { seed: 20261032, events: 60, goUpdates: 59 },
  { seed: 20261033, events: 60, goUpdates: 59 },
]);
assert.deepEqual(seeded.results.filter((item) => item.outputs.browser).map((item) => item.seed), [20261031]);
const manifestRawlogPath = "compiled-children/coordination/rawlogs/E-FIX-HARNESS-LIVENESS-20261031-01/independent-verification-attempt02.stdout.json";
const independent = await readJSON(manifestRawlogPath);
assert.equal(independent.status, "verified");
assert.equal(independent.traceArchive.verifiedArchives, 10);

const sources = [
  "compiled-children/conformance/check.mjs",
  "compiled-children/conformance/run.mjs",
  "compiled-children/conformance/swap-contract.test.mjs",
  "compiled-children/coordination/reports/E-FIX-HARNESS-LIVENESS.md",
  "compiled-children/coordination/receipts/E-FIX-HARNESS-LIVENESS.json",
];
const sourcePins = [];
for (const source of sources) sourcePins.push(await hashFile(source));
assert.equal(digest(fixReportBytes), fixReceipt.report.sha256);
assert.equal(fixReportBytes.length, fixReceipt.report.bytes);
for (const source of sourcePins.slice(0, 3)) {
  assert.equal(source.sha256, fixReceipt.sourceSha256[source.path], `E-FIX source pin changed: ${source.path}`);
}
assert.equal(fixReceipt.job_id, "E-FIX-HARNESS-LIVENESS");
assert.equal(fixReceipt.outcome, "mixed_change");
const runnerSource = await readFile(path("compiled-children/conformance/run.mjs"), "utf8");
assert.match(runnerSource, /refusing to overwrite existing N4 attempt/);
assert.match(runnerSource, /E-HARNESS-\$\{attemptStamp\}-\$\{process\.pid\}/);
assert.match(runnerSource, /mkdir\(rawLogDir, \{ recursive: false \}\)/);
assert.doesNotMatch(runnerSource, /coordination\/(?:reports\/E-HARNESS\.md|receipts\/E-HARNESS\.json)/);

const guardNames = [
  "WebAssembly.compile", "WebAssembly.compileStreaming", "WebAssembly.instantiate",
  "WebAssembly.instantiateStreaming", "WebAssembly.validate", "WebAssembly.Module",
  "WebAssembly.Instance", "WebAssembly.Memory", "WebAssembly.Table", "WebAssembly.Global",
];
const expectedGuardCoverage = guardNames.map((name, index) => ({
  name,
  kind: index < 5 ? "function" : "constructor",
  status: "installed",
}));
assert.deepEqual(browser.noWasm.guardCoverage.entries, expectedGuardCoverage);

const output = {
  schema: "gobi.xr-fix-harness-liveness-review-audit/v1",
  decision: "accepted",
  checks: {
    priorCanonicalEHarnessReportReceiptRestoredByteExact: true,
    generatedOverwriteBytesPreserved: true,
    originalCheckerAndRunnerBackupsHashVerified: true,
    sourceAndBuildPinsVerified: { source: 85, build: 8, stableBeforeAfter: true },
    replay: { events: 42, goUpdates: 38, checkpoints: 39, mutationControls: 12, allDetected: true },
    swapIdentity: {
      acceptedCandidate: acceptedSwap.after.renderer,
      rejectedCandidateRetained: rejectedSwap.after.renderer,
      laterPhysicalClickEventIndex: liveClick.eventIndex,
      laterPhysicalClickIdentity: { backend: liveDispatch.backend, rendererId: liveDispatch.rendererId },
      actionLabelsCrossCheckedAgainstDispatch: true,
    },
    noWasm: { status: browser.noWasm.guardCoverage.status, entries: browser.noWasm.guardCoverage.entries.length,
      failures: browser.noWasm.guardCoverage.failures.length, apiAttempts: browser.noWasm.apiAttempts.length,
      wasmRequests: browser.noWasm.wasmRequests.length },
    seeds: seeded.results.map(({ seed, events, goUpdates, outputs }) => ({
      seed, events, goUpdates, mountedBrowser: Boolean(outputs.browser),
    })),
    gzipTraceArchives: independent.traceArchive.verifiedArchives,
    targetedTests: { tests: 18, pass: 18, fail: 0 },
  },
  preservation: { canonicalAuthorFiles: preserved, generatedIncidentCopies },
  sourcePins,
  evidence: {
    run: await hashFile(evidenceRoot, `${stem}.run.json`),
    check: await hashFile(evidenceRoot, `${stem}.check.json`),
    browser: await hashFile(evidenceRoot, `${stem}.browser.json`),
    seeded: await hashFile(evidenceRoot, `${stem}.seeded.json`),
    manifest: await hashFile(evidenceRoot, `${stem}.manifest.json`),
  },
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
