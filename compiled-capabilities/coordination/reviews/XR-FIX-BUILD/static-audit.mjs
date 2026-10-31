import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const read = (path) => readFile(path, "utf8");
const digest = (text) => createHash("sha256").update(text).digest("hex");
const run = await read("compiled-capabilities/run.mjs");
const helper = await read("compiled-capabilities/archive-helper.mjs");
const helperTest = await read("compiled-capabilities/archive-helper.test.mjs");
const n3Gate = run.slice(run.indexOf("async function runConformance"), run.indexOf("async function runHTTPDemo"));
const makeArchive = run.slice(run.indexOf("async function makeArchive"), run.indexOf("async function generateReport"));
const sourceFiles = run.slice(run.indexOf("const sourceFiles = ["), run.indexOf("];\nconst hash"));
const receipt = JSON.parse(await read("compiled-capabilities/coordination/receipts/E-FIX-BUILD.json"));
const xrBuild = JSON.parse(await read("compiled-capabilities/coordination/receipts/XR-BUILD.json"));
const eBuild = JSON.parse(await read("compiled-capabilities/coordination/receipts/E-BUILD.json"));
const n3Check = JSON.parse(await read("compiled-capabilities/conformance/evidence/attempt-05/conformance.capability-check.json"));
const n3Run = JSON.parse(await read("compiled-capabilities/conformance/evidence/attempt-05/conformance.run.json"));

for (const path of ["compiled-capabilities/archive-helper.mjs", "compiled-capabilities/archive-helper.test.mjs"]) {
  assert(sourceFiles.includes(JSON.stringify(path)), `source pin literal missing ${path}`);
}
for (const field of [
  "schema: \"gobi.compiled-capabilities-execution-before-archive/v1\"",
  "archiveStatus: \"PENDING\"",
  "archivePending: true",
  "acceptanceStatus: \"NOT_FINAL\"",
  "finalAcceptance: false",
  "sourceBefore: structuredClone(receipt.sourceBefore ?? [])",
  "preArchiveSourcePins: structuredClone(sourcePinsAtPreArchive)",
  "toolchainAndDependencies:",
  "versions: structuredClone(receipt.versions ?? {})",
  "dependencyInstall: structuredClone(receipt.dependencyInstall ?? {})",
  "commandLedger: structuredClone(receipt.commands ?? [])",
  "stageOutcomes: structuredClone(receipt.stages ?? [])",
  "executionReceiptBeforeArchive: structuredClone(receipt)",
]) assert(makeArchive.includes(field), `snapshot payload field missing: ${field}`);
assert(makeArchive.includes('"execution-before-archive.json"'), "snapshot is not included in archive member list");
assert(makeArchive.indexOf("writeImmutableSnapshot(executionSnapshotPath") < makeArchive.indexOf("archiveAndVerify({"),
  "snapshot must be written before archive creation and verification");
assert(makeArchive.includes("manifest remains outside the tar"), "manifest self-hash policy is missing");
assert(makeArchive.includes("manifest: { path: rel(manifestPath), ...await hashPath(manifestPath) }"),
  "final receipt does not bind the external manifest hash");
assert(makeArchive.includes("path: rel(archivePath),\n    ...archive"), "final receipt does not bind the archive hash");
assert(run.includes("matchesSourceBefore && matchesPreArchiveSnapshot && receipt.archive?.sourcePinsMatchBeforeArchive === true"),
  "final source check does not require both source snapshots and pre-archive agreement");
for (const id of ["rejected-state", "rejected-view", "rejected-dom", "rejected-pending", "compatible-state",
  "compatible-view", "compatible-dom", "compatible-pending", "host-option-accessor-construction"]) {
  assert(n3Gate.includes(JSON.stringify(id)), `N3 outer gate omitted ${id}`);
}
assert(n3Gate.includes("rejected.rawPreservationVerified !== true"), "N3 outer gate omitted rejected raw preservation");
assert(n3Gate.includes("compatible?.rawPreservationVerified !== true"), "N3 outer gate omitted compatible raw preservation");
assert(n3Gate.includes("capabilityMutationControlsDetected === expectedMutationControlIds.length"),
  "N3 outer gate omitted mutation control count check");
assert(helper.includes("flag: \"wx\", mode: 0o444"), "snapshot write is not exclusive and read-only");
assert(helper.includes("JSON.stringify(listed.sort()) !== JSON.stringify(expected)"), "archive listing is not checked against the exact member inventory");
assert(helper.includes("actual.bytes !== member.bytes || actual.sha256 !== member.sha256"), "round-trip member hashes are not checked");
assert(helperTest.includes("sourceAfter, outerReceipt.sourceBefore") && helperTest.includes("outerReceipt.snapshotPins"),
  "helper test omits outer pre/post-source pin comparisons");
assert(n3Run.status === "matched" && n3Check.status === "matched", "N3 attempt-05 run/check is not matched");
assert(n3Check.swap.rejected.rawPreservationVerified === true && n3Check.swap.compatible.rawPreservationVerified === true,
  "N3 attempt-05 raw preservation fields are missing");
assert(n3Check.capabilityMutationControlsDetected === 9 && n3Check.capabilityMutationControls.every((row) => row.detected && row.error),
  "N3 attempt-05 nine controls are not all detected");
for (const [path, expected] of Object.entries(receipt.changes.preservedPriorArtifacts)) {
  if (path.endsWith("Sha256")) continue;
  assert(expected === true, `prior artifact preservation claim false: ${path}`);
}
const eReceiptHash = digest(await read("compiled-capabilities/coordination/receipts/E-BUILD.json"));
const eReportHash = digest(await read("compiled-capabilities/coordination/reports/E-BUILD.md"));
const xrReceiptHash = digest(await read("compiled-capabilities/coordination/receipts/XR-BUILD.json"));
const xrReportHash = digest(await read("compiled-capabilities/coordination/reviews/XR-BUILD.md"));
assert(eReceiptHash === receipt.changes.preservedPriorArtifacts.eBuildReceiptSha256, "original E-BUILD receipt changed");
assert(eReportHash === receipt.changes.preservedPriorArtifacts.eBuildReportSha256, "original E-BUILD report changed");
assert(xrReceiptHash === receipt.changes.preservedPriorArtifacts.xrBuildReceiptSha256, "original XR-BUILD receipt changed");
assert(xrReportHash === receipt.changes.preservedPriorArtifacts.xrBuildReportSha256, "original XR-BUILD report changed");
assert(eReceiptHash === xrBuild.reviewed_source_sha256["compiled-capabilities/coordination/receipts/E-BUILD.json"],
  "original E-BUILD receipt differs from XR-BUILD review pin");
assert(eReportHash === xrBuild.reviewed_source_sha256["compiled-capabilities/coordination/reports/E-BUILD.md"],
  "original E-BUILD report differs from XR-BUILD review pin");
assert(eBuild.status === "running" || eBuild.status === undefined,
  "unexpected full-run E-BUILD receipt status; preparation review should not change it");

process.stdout.write(`${JSON.stringify({
  status: "passed",
  checks: [
    "immutable pre-archive snapshot fields and pending state",
    "snapshot inclusion, exact tar inventory, extraction hashes, and external manifest binding",
    "outer sourceBefore/sourceAfter/preArchiveSourcePins consistency gate",
    "source pin literals for archive helper and helper test",
    "N3 ordered nine-control and dual raw-preservation acceptance gate",
    "N3 attempt-05 focused evidence",
    "original E-BUILD and XR-BUILD report/receipt artifacts remain unchanged",
    "original E-BUILD report and receipt match XR-BUILD source pins",
  ],
  sourcePins: [
    "compiled-capabilities/run.mjs",
    "compiled-capabilities/archive-helper.mjs",
    "compiled-capabilities/archive-helper.test.mjs",
  ],
  n3Attempt05: { run: n3Run.status, check: n3Check.status, controls: n3Check.capabilityMutationControlsDetected },
  originalEBuildReceiptSha256: eReceiptHash,
  originalEBuildReportSha256: eReportHash,
  originalXrBuildReceiptSha256: xrReceiptHash,
  originalXrBuildReportSha256: xrReportHash,
}, null, 2)}\n`);
