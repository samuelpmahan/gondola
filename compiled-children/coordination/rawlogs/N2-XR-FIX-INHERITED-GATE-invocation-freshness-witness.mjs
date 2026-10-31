import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateInheritedAcceptance } from "../../inherited-acceptance.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pin = (path, bytes) => ({ path, bytes: bytes.length, sha256: hash(bytes) });
const attempt = "compiled-capabilities/builds/attempts/attempt-20261031T120001000Z";
const sourceBefore = [
  { path: "compiled-capabilities/archive-helper.mjs", bytes: 4, sha256: "b".repeat(64) },
  { path: "compiled-capabilities/run.mjs", bytes: 3, sha256: "a".repeat(64) },
];
const reportPath = "compiled-capabilities/coordination/reports/E-BUILD.md";
const archivePath = `${attempt}/capabilities-artifacts.tar.gz`;
const manifestPath = `${attempt}/archive-manifest.json`;
const snapshotPath = `${attempt}/execution-before-archive.json`;
const reportBytes = Buffer.from("report bytes");
const archiveBytes = Buffer.from("archive bytes");
const snapshotValue = {
  schema: "gobi.compiled-capabilities-execution-before-archive/v1",
  status: "archive_pending",
  archiveStatus: "PENDING",
  archivePending: true,
  acceptanceStatus: "NOT_FINAL",
  finalAcceptance: false,
  attempt,
  sourceBefore,
  preArchiveSourcePins: sourceBefore,
  sourcePinsAtEndOfCommandsAndPreArchive: sourceBefore,
  sourcePinsMatchBeforeArchive: true,
};
const snapshotBytes = Buffer.from(JSON.stringify(snapshotValue));
const snapshotPin = pin("execution-before-archive.json", snapshotBytes);
const manifestBytes = Buffer.from(JSON.stringify({
  schema: "gobi.compiled-capabilities-archive/v1",
  members: [snapshotPin],
}));
const receipt = {
  schema: "gobi.compiled-capabilities-execution/v1",
  job_id: "E-BUILD",
  worker: "N6",
  mode: "full",
  status: "passed",
  startedAt: "2026-10-31T12:00:01.002Z",
  finishedAt: "2026-10-31T12:00:02.000Z",
  attempt,
  sourceBefore,
  sourceAfter: sourceBefore,
  sourcePinsMatch: true,
  failures: [],
  stages: [{ name: "full", status: "passed" }],
  checks: ["fixture"],
  commands: [{
    name: "inherited-full-lifecycle",
    command: "bash",
    args: ["/workspace/run-compiled-lifecycle.sh"],
    exitCode: 0,
  }],
  report: { path: reportPath, sha256: hash(reportBytes) },
  archive: {
    path: archivePath,
    bytes: archiveBytes.length,
    sha256: hash(archiveBytes),
    manifest: { path: manifestPath, bytes: manifestBytes.length, sha256: hash(manifestBytes) },
    executionSnapshot: {
      path: snapshotPath,
      bytes: snapshotBytes.length,
      sha256: hash(snapshotBytes),
      immutable: true,
      status: "archive_pending",
      finalAcceptance: false,
    },
    members: [snapshotPin],
    memberCount: 1,
    sourcePinsAtPreArchive: sourceBefore,
    preArchiveSourcePins: sourceBefore,
    sourcePinsMatchBeforeArchive: true,
    sourceAfterMatchesSourceBefore: true,
    sourceAfterMatchesPreArchiveSnapshot: true,
    roundTripVerified: true,
  },
};

const accepted = validateInheritedAcceptance({
  receipt,
  invocationStartedAt: "2026-10-31T12:00:01.001Z",
  currentSourcePins: sourceBefore,
  artifacts: {
    report: { path: reportPath, bytes: reportBytes },
    archive: { path: archivePath, bytes: archiveBytes },
    manifest: { path: manifestPath, bytes: manifestBytes },
    executionSnapshot: { path: snapshotPath, bytes: snapshotBytes },
  },
});

assert.equal(accepted.status, "passed");
console.log("validator accepted attempt timestamp 2026-10-31T12:00:01.000Z");
console.log("invocation began 2026-10-31T12:00:01.001Z; producer started 2026-10-31T12:00:01.002Z");
console.log("attempt path predates inherited invocation by 1 ms, yet the receipt passed");
