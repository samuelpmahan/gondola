import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const attemptName = process.argv[2] ?? "replay-custody-safe";
const stem = resolve(ROOT,
  `compiled-children/conformance/evidence/E-FIX-HARNESS-LIVENESS-20261031-01/${attemptName}`);
const originalRoot = resolve(ROOT, "compiled-children/coordination/repairs/E-FIX-HARNESS-LIVENESS/originals");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJSON = async (path) => JSON.parse(await readFile(path, "utf8"));

async function verifyPin(pin, label) {
  const bytes = await readFile(resolve(ROOT, pin.path));
  assert.equal(bytes.length, pin.bytes, `${label} byte count changed: ${pin.path}`);
  assert.equal(digest(bytes), pin.sha256, `${label} SHA-256 changed: ${pin.path}`);
}

const runPath = `${stem}.run.json`;
const manifestPath = `${stem}.manifest.json`;
const [run, manifest, check, browser, seeded] = await Promise.all([
  readJSON(runPath),
  readJSON(manifestPath),
  readJSON(`${stem}.check.json`),
  readJSON(`${stem}.browser.json`),
  readJSON(`${stem}.seeded.json`),
]);

assert.equal(run.status, "matched");
assert.equal(run.sourcesStable, true);
assert.equal(run.buildOutputsStable, true);
assert.deepEqual(run.failures, []);
assert.deepEqual(manifest.sourcePins.before, run.sourcePinsBefore);
assert.deepEqual(manifest.sourcePins.after, run.sourcePinsAfter);
assert.deepEqual(run.sourcePinsBefore, run.sourcePinsAfter);
assert.deepEqual(manifest.buildOutputPins.beforeCheck, run.buildOutputPinsBeforeCheck);
assert.deepEqual(manifest.buildOutputPins.afterCheck, run.buildOutputPinsAfterCheck);
assert.deepEqual(run.buildOutputPinsBeforeCheck, run.buildOutputPinsAfterCheck);
for (const pin of run.sourcePinsBefore) await verifyPin(pin, "source pin");
for (const pin of run.buildOutputPinsBeforeCheck) await verifyPin(pin, "build pin");

assert.equal(check.status, "matched");
assert.equal(check.events, 42);
assert.equal(check.goUpdates, 38);
assert.equal(check.stateCheckpoints, 39);
assert.equal(check.mutationControlsDetected, 12);
assert.ok(check.mutationControls.every((control) => control.detected === true));
assert.equal(check.rendererLifecycleChecked, true);
assert.deepEqual(check.noWasmGuardCoverage, { status: "complete", entries: 10, failures: 0 });
assert.equal(browser.noWasm.guardCoverage.status, "complete");
assert.deepEqual(browser.noWasm.guardCoverage.failures, []);
assert.equal(browser.noWasm.guardCoverage.entries.length, 10);
for (const kind of ["react", "dom", "swap"]) {
  assert.deepEqual(browser.profiles[kind].noWasm, browser.noWasm);
}

const browserBytes = await readFile(`${stem}.browser.json`);
const browserCaptureBytes = await readFile(`${stem}.browser.capture.json`);
assert.equal(digest(browserBytes), digest(browserCaptureBytes), "saved browser capture and final browser output differ");

assert.equal(seeded.results.length, 3);
assert.deepEqual(seeded.results.map((item) => item.seed), [20261031, 20261032, 20261033]);
assert.deepEqual(seeded.results.filter((item) => item.outputs.browser).map((item) => item.seed), [20261031],
  "only the captured representative seed may claim mounted browser evidence");

const rawLogRoot = resolve(ROOT, "compiled-children/coordination/rawlogs");
const rawLogDirectories = (await readdir(rawLogRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("E-HARNESS-"))
  .map((entry) => resolve(rawLogRoot, entry.name));
const expectedRunPath = relative(ROOT, runPath).replaceAll("\\", "/");
const matchingIndexes = [];
for (const directory of rawLogDirectories) {
  try {
    const path = resolve(directory, "trace-index.json");
    const index = await readJSON(path);
    if (index.run === expectedRunPath) matchingIndexes.push({ path, index });
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}
assert.equal(matchingIndexes.length, 1, "run must have one unique raw trace index");
const traceIndexPath = matchingIndexes[0].path;
const traceIndex = matchingIndexes[0].index;
assert.equal(traceIndex.schema, "gobi.compiled-children-harness-rawlog/v1");
assert.deepEqual(traceIndex.summary, run.summary);
assert.ok(traceIndex.attempt, "unique attempt record path is missing from the raw trace index");
const attemptRecordPath = resolve(ROOT, traceIndex.attempt);
const attemptRecord = await readJSON(attemptRecordPath);
assert.equal(attemptRecord.schema, "gobi.compiled-children-harness-attempt/v1");
assert.equal(attemptRecord.status, run.status);
assert.equal(attemptRecord.uniqueEvidence.canonicalEHarnessPacket,
  "preserved; this attempt writes no shared E-HARNESS report or receipt");
assert.deepEqual(traceIndex.traceArtifacts, attemptRecord.traceArtifacts);
assert.deepEqual(traceIndex.summary, attemptRecord.summary);

let verifiedArchives = 0;
for (const artifact of traceIndex.traceArtifacts) {
  const sourceBytes = await readFile(resolve(ROOT, artifact.source));
  const archiveBytes = await readFile(resolve(ROOT, artifact.path));
  assert.equal(sourceBytes.length, artifact.sourceBytes, `archived source byte count differs: ${artifact.source}`);
  assert.equal(digest(sourceBytes), artifact.sourceSha256, `archived source hash differs: ${artifact.source}`);
  assert.equal(archiveBytes.length, artifact.archiveBytes, `compressed archive byte count differs: ${artifact.path}`);
  assert.equal(digest(archiveBytes), artifact.archiveSha256, `compressed archive hash differs: ${artifact.path}`);
  const expanded = gunzipSync(archiveBytes);
  assert.equal(expanded.length, sourceBytes.length, `decompressed archive length differs: ${artifact.path}`);
  assert.equal(digest(expanded), artifact.sourceSha256, `decompressed archive hash differs: ${artifact.path}`);
  assert.ok(expanded.equals(sourceBytes), `decompressed archive bytes differ: ${artifact.path}`);
  verifiedArchives += 1;
}

const originalManifest = await readJSON(resolve(originalRoot, "manifest.json"));
const originalHashes = [];
for (const item of originalManifest.files) {
  const bytes = await readFile(resolve(ROOT, item.preserved));
  assert.equal(bytes.length, item.bytes, `preserved E-HARNESS original byte count differs: ${item.preserved}`);
  assert.equal(digest(bytes), item.sha256, `preserved E-HARNESS original hash differs: ${item.preserved}`);
  originalHashes.push({ path: item.preserved, sha256: item.sha256, bytes: item.bytes });
}
const canonicalPaths = {
  report: resolve(ROOT, "compiled-children/coordination/reports/E-HARNESS.md"),
  receipt: resolve(ROOT, "compiled-children/coordination/receipts/E-HARNESS.json"),
};
for (const key of ["report", "receipt"]) {
  const source = key === "report"
    ? "compiled-children/coordination/reports/E-HARNESS.md"
    : "compiled-children/coordination/receipts/E-HARNESS.json";
  const entry = originalManifest.files.find((item) => item.source === source);
  assert.ok(entry, `original preservation manifest is missing canonical ${key}`);
  const current = await readFile(canonicalPaths[key]);
  assert.equal(current.length, entry.bytes, `canonical ${key} was not restored to the preserved author version`);
  assert.equal(digest(current), entry.sha256, `canonical ${key} hash differs from preserved author version`);
}

const result = {
  schema: "gobi.e-fix-harness-liveness-independent-verification/v1",
  status: "verified",
  run: {
    path: expectedRunPath,
    sha256: digest(await readFile(runPath)),
    status: run.status,
    sourcePins: run.sourcePinsBefore.length,
    buildPins: run.buildOutputPinsBeforeCheck.length,
    sourcesStable: run.sourcesStable,
    buildOutputsStable: run.buildOutputsStable,
  },
  fixed: { events: check.events, goUpdates: check.goUpdates, checkpoints: check.stateCheckpoints },
  mutationControls: check.mutationControls,
  guardCoverage: check.noWasmGuardCoverage,
  seeded: {
    seeds: seeded.results.map((item) => item.seed),
    mountedBrowserSeeds: seeded.results.filter((item) => item.outputs.browser).map((item) => item.seed),
  },
  traceArchive: {
    traceIndexPath: relative(ROOT, traceIndexPath).replaceAll("\\", "/"),
    traceIndexSha256: digest(await readFile(traceIndexPath)),
    attemptSummaryPath: traceIndex.attempt,
    attemptSummarySha256: digest(await readFile(attemptRecordPath)),
    verifiedArchives,
    status: "all source and gzip hashes/lengths match; decompressed bytes equal original source bytes",
  },
  preservedOriginals: originalHashes,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
