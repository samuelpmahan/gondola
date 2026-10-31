import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { validateInheritedAcceptance } from "./inherited-acceptance.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pin = (path, bytes) => ({ path, bytes: bytes.length, sha256: hash(bytes) });
const clone = (value) => structuredClone(value);

function fixture() {
  const attempt = "compiled-capabilities/builds/attempts/attempt-20261031T120001000Z";
  const sourceBefore = [
    { path: "compiled-capabilities/archive-helper.mjs", bytes: 4, sha256: "b".repeat(64) },
    { path: "compiled-capabilities/run.mjs", bytes: 3, sha256: "a".repeat(64) },
  ];
  const reportBytes = Buffer.from("# Report content is not an acceptance signal.\n");
  const archiveBytes = Buffer.from("gzip archive bytes");
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
  const executionSnapshotBytes = Buffer.from(JSON.stringify(snapshotValue) + "\n");
  const snapshotPin = pin("execution-before-archive.json", executionSnapshotBytes);
  const manifestBytes = Buffer.from(JSON.stringify({
    schema: "gobi.compiled-capabilities-archive/v1",
    members: [snapshotPin],
  }) + "\n");
  const manifestPath = attempt + "/archive-manifest.json";
  const snapshotPath = attempt + "/execution-before-archive.json";
  const archivePath = attempt + "/capabilities-artifacts.tar.gz";
  const reportPath = "compiled-capabilities/coordination/reports/E-BUILD.md";
  const receipt = {
    schema: "gobi.compiled-capabilities-execution/v1",
    job_id: "E-BUILD",
    worker: "N6",
    mode: "full",
    status: "passed",
    startedAt: "2026-10-31T12:00:01.000Z",
    finishedAt: "2026-10-31T12:00:10.000Z",
    attempt,
    sourceBefore,
    sourceAfter: sourceBefore,
    sourcePinsMatch: true,
    failures: [],
    stages: [{ name: "full", status: "passed" }],
    checks: ["structured evidence exists"],
    commands: [{
      name: "inherited-full-lifecycle",
      command: "bash",
      args: ["run-compiled-lifecycle.sh"],
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
        bytes: executionSnapshotBytes.length,
        sha256: hash(executionSnapshotBytes),
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
  return {
    receipt,
    invocationStartedAt: "2026-10-31T12:00:00.000Z",
    currentSourcePins: clone(sourceBefore),
    artifacts: {
      report: { path: reportPath, bytes: reportBytes },
      archive: { path: archivePath, bytes: archiveBytes },
      manifest: { path: manifestPath, bytes: manifestBytes },
      executionSnapshot: { path: snapshotPath, bytes: executionSnapshotBytes },
    },
  };
}

function rebindSnapshot(input, mutate) {
  const value = JSON.parse(input.artifacts.executionSnapshot.bytes.toString("utf8"));
  mutate(value);
  const bytes = Buffer.from(JSON.stringify(value) + "\n");
  const snapshot = pin("execution-before-archive.json", bytes);
  input.artifacts.executionSnapshot.bytes = bytes;
  input.receipt.archive.executionSnapshot.bytes = bytes.length;
  input.receipt.archive.executionSnapshot.sha256 = snapshot.sha256;
  input.receipt.archive.members = [snapshot];
  const manifest = Buffer.from(JSON.stringify({
    schema: "gobi.compiled-capabilities-archive/v1",
    members: [snapshot],
  }) + "\n");
  input.artifacts.manifest.bytes = manifest;
  input.receipt.archive.manifest.bytes = manifest.length;
  input.receipt.archive.manifest.sha256 = hash(manifest);
}

test("accepts a fresh, source-stable receipt with byte-bound artifacts without requiring report prose", () => {
  const input = fixture();
  assert.doesNotThrow(() => validateInheritedAcceptance(input));
});

test("rejects an attempt timestamp one millisecond before the inherited invocation", () => {
  const input = fixture();
  input.invocationStartedAt = "2026-10-31T12:00:01.001Z";
  input.receipt.startedAt = "2026-10-31T12:00:01.002Z";
  assert.throws(() => validateInheritedAcceptance(input), /attempt path timestamp precedes inherited invocation/i);
});

test("accepts attempt timestamps equal to or one millisecond after invocation start", () => {
  const equal = fixture();
  equal.invocationStartedAt = "2026-10-31T12:00:01.000Z";
  assert.doesNotThrow(() => validateInheritedAcceptance(equal));

  const after = fixture();
  after.invocationStartedAt = "2026-10-31T12:00:00.999Z";
  assert.doesNotThrow(() => validateInheritedAcceptance(after));
});

test("rejects a receipt started before the inherited invocation window", () => {
  const input = fixture();
  input.receipt.startedAt = "2026-10-31T11:59:59.999Z";
  assert.throws(() => validateInheritedAcceptance(input), /startedAt.*invocation/i);
});

test("rejects a missing or invalid finish time", () => {
  const input = fixture();
  delete input.receipt.finishedAt;
  assert.throws(() => validateInheritedAcceptance(input), /finishedAt/i);
  const invalid = fixture();
  invalid.receipt.finishedAt = "not-a-time";
  assert.throws(() => validateInheritedAcceptance(invalid), /finishedAt/i);
});

test("rejects a tampered actual report", () => {
  const input = fixture();
  input.artifacts.report.bytes = Buffer.from("# report content is not an acceptance signal.\n");
  assert.throws(() => validateInheritedAcceptance(input), /report.*sha256/i);
});

test("rejects a tampered actual archive", () => {
  const input = fixture();
  input.artifacts.archive.bytes = Buffer.from("gzop archive bytes");
  assert.throws(() => validateInheritedAcceptance(input), /archive.*sha256/i);
});

test("rejects a tampered actual manifest", () => {
  const input = fixture();
  input.artifacts.manifest.bytes = Buffer.from(input.artifacts.manifest.bytes.toString("utf8").replace("archive/v1", "archive/v0"));
  assert.throws(() => validateInheritedAcceptance(input), /manifest.*sha256/i);
});

test("rejects source drift against the producer's actual source files", () => {
  const input = fixture();
  input.currentSourcePins[0].sha256 = "c".repeat(64);
  assert.throws(() => validateInheritedAcceptance(input), /current source pins/i);
});

test("rejects false source-stability booleans even when the arrays happen to match", () => {
  const input = fixture();
  input.receipt.sourcePinsMatch = false;
  assert.throws(() => validateInheritedAcceptance(input), /sourcePinsMatch/i);
});

test("rejects a mismatched immutable pre-archive source snapshot", () => {
  const input = fixture();
  rebindSnapshot(input, (snapshot) => {
    snapshot.preArchiveSourcePins[0].sha256 = "d".repeat(64);
  });
  assert.throws(() => validateInheritedAcceptance(input), /pre-archive source pins/i);
});

test("rejects an unbound manifest member inventory", () => {
  const input = fixture();
  const manifest = JSON.parse(input.artifacts.manifest.bytes.toString("utf8"));
  manifest.members = [];
  const bytes = Buffer.from(JSON.stringify(manifest) + "\n");
  input.artifacts.manifest.bytes = bytes;
  input.receipt.archive.manifest.bytes = bytes.length;
  input.receipt.archive.manifest.sha256 = hash(bytes);
  assert.throws(() => validateInheritedAcceptance(input), /manifest members/i);
});

test("rejects a stale or malformed attempt path", () => {
  const input = fixture();
  input.receipt.attempt = "compiled-capabilities/builds/attempts/attempt-20261030T120001000Z";
  assert.throws(() => validateInheritedAcceptance(input), /attempt path/i);
});
