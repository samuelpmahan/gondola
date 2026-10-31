import { createHash } from "node:crypto";
import { posix as posixPath } from "node:path";

const EXPECTED_REPORT = "compiled-capabilities/coordination/reports/E-BUILD.md";
const ATTEMPT_PATTERN = /^compiled-capabilities\/builds\/attempts\/attempt-(\d{8}T\d{9}Z)$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function fail(message) {
  throw new Error("inherited E-BUILD acceptance: " + message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseTime(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    fail(label + " must be an ISO UTC timestamp");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(label + " is invalid");
  return parsed;
}

function parseAttemptTime(attempt, startedAt) {
  if (typeof attempt !== "string") fail("attempt path is invalid");
  const match = ATTEMPT_PATTERN.exec(attempt);
  if (!match) fail("attempt path must be a fresh compiled-capabilities/builds/attempts/attempt-<UTC timestamp>");
  const stampMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/.exec(match[1]);
  if (!stampMatch) fail("attempt path timestamp is invalid");
  const [, year, month, day, hour, minute, second, millis] = stampMatch;
  const timestamp = Date.parse(year + "-" + month + "-" + day + "T" + hour + ":" + minute + ":" + second + "." + millis + "Z");
  const start = parseTime(startedAt, "startedAt");
  if (!Number.isFinite(timestamp) || timestamp > start || start - timestamp > 60_000) {
    fail("attempt path timestamp is not fresh for the producer startedAt");
  }
}

function validateRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") ||
      value.startsWith("/") || posixPath.normalize(value) !== value ||
      value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail(label + " must be a normalized, repository-relative path");
  }
  return value;
}

function validateDigest(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) fail(label + " must be a lowercase SHA-256");
}

function validatePins(value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(label + " must be a nonempty pin array");
  let previousPath = "";
  const seen = new Set();
  for (const item of value) {
    if (!isRecord(item)) fail(label + " contains a malformed pin");
    validateRelativePath(item.path, label + " path");
    if (seen.has(item.path) || item.path <= previousPath) fail(label + " must have unique sorted paths");
    if (!Number.isSafeInteger(item.bytes) || item.bytes < 0) fail(label + " byte count is invalid");
    validateDigest(item.sha256, label + " hash");
    seen.add(item.path);
    previousPath = item.path;
  }
  return value;
}

function sameJSON(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function artifactBytes(artifact, label) {
  if (!isRecord(artifact) || typeof artifact.path !== "string" ||
      !(Buffer.isBuffer(artifact.bytes) || artifact.bytes instanceof Uint8Array)) {
    fail(label + " actual artifact must include its path and bytes");
  }
  return Buffer.from(artifact.bytes);
}

function verifyArtifact({ actual, declared, label, expectedPath, requireDeclaredBytes }) {
  if (!isRecord(declared)) fail(label + " producer receipt pin is missing");
  const actualPath = validateRelativePath(actual.path, label + " actual path");
  const declaredPath = validateRelativePath(declared.path, label + " receipt path");
  if (actualPath !== declaredPath || declaredPath !== expectedPath) fail(label + " path does not match the expected producer artifact");
  const bytes = artifactBytes(actual, label);
  if (bytes.length === 0) fail(label + " actual bytes are empty");
  validateDigest(declared.sha256, label + " receipt hash");
  if (declared.bytes !== undefined || requireDeclaredBytes) {
    if (!Number.isSafeInteger(declared.bytes) || declared.bytes <= 0 || declared.bytes !== bytes.length) {
      fail(label + " byte count does not match the producer receipt");
    }
  }
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== declared.sha256) fail(label + " actual sha256 does not match the producer receipt");
  return { path: declaredPath, bytes: bytes.length, sha256: actualHash, content: bytes };
}

function validateMembers(receiptMembers, manifestMembers, snapshotPin) {
  if (!Array.isArray(receiptMembers) || receiptMembers.length === 0 ||
      !Array.isArray(manifestMembers) || manifestMembers.length === 0) {
    fail("archive manifest members must be nonempty arrays");
  }
  const normalize = (members, label) => {
    const seen = new Set();
    const rows = members.map((member) => {
      if (!isRecord(member)) fail(label + " contains a malformed member");
      const path = validateRelativePath(member.path, label + " path");
      if (seen.has(path)) fail(label + " contains a duplicate path");
      seen.add(path);
      if (!Number.isSafeInteger(member.bytes) || member.bytes < 0) fail(label + " byte count is invalid");
      validateDigest(member.sha256, label + " hash");
      return { path, bytes: member.bytes, sha256: member.sha256 };
    }).sort((left, right) => left.path.localeCompare(right.path));
    return rows;
  };
  const expected = normalize(receiptMembers, "archive receipt members");
  const actual = normalize(manifestMembers, "archive manifest members");
  if (!sameJSON(expected, actual)) fail("manifest members do not match the producer receipt");
  if (!expected.some((member) => member.path === snapshotPin.path &&
      member.bytes === snapshotPin.bytes && member.sha256 === snapshotPin.sha256)) {
    fail("archive member inventory does not bind the immutable pre-archive snapshot");
  }
  return expected;
}

export function validateInheritedAcceptance({ receipt, invocationStartedAt, currentSourcePins, artifacts }) {
  if (!isRecord(receipt) || receipt.schema !== "gobi.compiled-capabilities-execution/v1" ||
      receipt.job_id !== "E-BUILD" || receipt.worker !== "N6") {
    fail("producer receipt identity or schema is invalid");
  }
  if (receipt.mode !== "full" || receipt.status !== "passed") fail("producer receipt is not a passed full run");
  if (!Array.isArray(receipt.failures) || receipt.failures.length !== 0) fail("producer receipt has failures");
  if (!Array.isArray(receipt.commands)) fail("producer command ledger is missing");
  if (!Array.isArray(receipt.stages) || receipt.stages.length === 0 ||
      receipt.stages.some((stage) => !isRecord(stage) || stage.status !== "passed")) {
    fail("producer stages are incomplete or not all passed");
  }
  if (!Array.isArray(receipt.checks) || receipt.checks.length === 0) fail("producer checks are missing");
  const started = parseTime(receipt.startedAt, "startedAt");
  const invocationStarted = parseTime(invocationStartedAt, "inherited invocation start");
  if (started < invocationStarted) fail("startedAt is before the inherited invocation window");
  const finished = parseTime(receipt.finishedAt, "finishedAt");
  if (finished < started) fail("finishedAt precedes startedAt");
  parseAttemptTime(receipt.attempt, receipt.startedAt);

  if (receipt.sourcePinsMatch !== true) fail("sourcePinsMatch must be exactly true");
  const sourceBefore = validatePins(receipt.sourceBefore, "sourceBefore");
  const sourceAfter = validatePins(receipt.sourceAfter, "sourceAfter");
  const actualSources = validatePins(currentSourcePins, "current source pins");
  if (!sameJSON(sourceBefore, sourceAfter)) fail("sourceBefore and sourceAfter differ");
  if (!sameJSON(sourceBefore, actualSources)) fail("current source pins differ from producer sourceBefore");

  const archive = receipt.archive;
  if (!isRecord(archive) || archive.roundTripVerified !== true ||
      archive.sourcePinsMatchBeforeArchive !== true ||
      archive.sourceAfterMatchesSourceBefore !== true ||
      archive.sourceAfterMatchesPreArchiveSnapshot !== true) {
    fail("archive round-trip or source-boundary evidence is incomplete");
  }
  const preArchive = validatePins(archive.sourcePinsAtPreArchive, "archive sourcePinsAtPreArchive");
  const preArchiveAlias = validatePins(archive.preArchiveSourcePins, "archive preArchiveSourcePins");
  if (!sameJSON(sourceBefore, preArchive) || !sameJSON(sourceBefore, preArchiveAlias)) {
    fail("pre-archive source pins differ from sourceBefore/sourceAfter");
  }

  const attempt = receipt.attempt;
  const reportPath = EXPECTED_REPORT;
  const archivePath = attempt + "/capabilities-artifacts.tar.gz";
  const manifestPath = attempt + "/archive-manifest.json";
  const snapshotPath = attempt + "/execution-before-archive.json";
  const report = verifyArtifact({
    actual: artifacts?.report,
    declared: receipt.report,
    label: "report",
    expectedPath: reportPath,
    requireDeclaredBytes: false,
  });
  const archived = verifyArtifact({
    actual: artifacts?.archive,
    declared: archive,
    label: "archive",
    expectedPath: archivePath,
    requireDeclaredBytes: true,
  });
  const manifest = verifyArtifact({
    actual: artifacts?.manifest,
    declared: archive.manifest,
    label: "manifest",
    expectedPath: manifestPath,
    requireDeclaredBytes: true,
  });
  const snapshot = verifyArtifact({
    actual: artifacts?.executionSnapshot,
    declared: archive.executionSnapshot,
    label: "execution snapshot",
    expectedPath: snapshotPath,
    requireDeclaredBytes: true,
  });
  if (archive.executionSnapshot.immutable !== true ||
      archive.executionSnapshot.status !== "archive_pending" ||
      archive.executionSnapshot.finalAcceptance !== false) {
    fail("immutable pre-archive snapshot metadata is invalid");
  }

  let manifestValue;
  let snapshotValue;
  try {
    manifestValue = JSON.parse(manifest.content.toString("utf8"));
  } catch {
    fail("manifest JSON is invalid");
  }
  if (!isRecord(manifestValue) || manifestValue.schema !== "gobi.compiled-capabilities-archive/v1") {
    fail("manifest schema is invalid");
  }
  const snapshotPin = {
    path: "execution-before-archive.json",
    bytes: snapshot.bytes,
    sha256: snapshot.sha256,
  };
  const members = validateMembers(archive.members, manifestValue.members, snapshotPin);
  if (archive.memberCount !== members.length) fail("archive memberCount does not match the manifest");
  try {
    snapshotValue = JSON.parse(snapshot.content.toString("utf8"));
  } catch {
    fail("pre-archive snapshot JSON is invalid");
  }
  if (!isRecord(snapshotValue) ||
      snapshotValue.schema !== "gobi.compiled-capabilities-execution-before-archive/v1" ||
      snapshotValue.status !== "archive_pending" || snapshotValue.archiveStatus !== "PENDING" ||
      snapshotValue.archivePending !== true || snapshotValue.acceptanceStatus !== "NOT_FINAL" ||
      snapshotValue.finalAcceptance !== false || snapshotValue.attempt !== attempt ||
      snapshotValue.sourcePinsMatchBeforeArchive !== true) {
    fail("pre-archive snapshot metadata is invalid");
  }
  const snapshotSourceBefore = validatePins(snapshotValue.sourceBefore, "snapshot sourceBefore");
  const snapshotPreArchive = validatePins(snapshotValue.preArchiveSourcePins, "snapshot preArchiveSourcePins");
  const snapshotEndPins = validatePins(snapshotValue.sourcePinsAtEndOfCommandsAndPreArchive, "snapshot end-of-commands pins");
  if (!sameJSON(sourceBefore, snapshotSourceBefore) || !sameJSON(sourceBefore, snapshotPreArchive) ||
      !sameJSON(sourceBefore, snapshotEndPins) || !sameJSON(actualSources, snapshotPreArchive)) {
    fail("pre-archive source pins differ from current source pins");
  }

  const lifecycle = receipt.commands.find((command) => command?.name === "inherited-full-lifecycle");
  if (!lifecycle || lifecycle.command !== "bash" ||
      !Array.isArray(lifecycle.args) || !lifecycle.args.some((arg) => typeof arg === "string" && arg.endsWith("run-compiled-lifecycle.sh")) ||
      lifecycle.exitCode !== 0) {
    fail("successful full inherited lifecycle command is not recorded");
  }

  return {
    status: "passed",
    mode: receipt.mode,
    attempt,
    startedAt: receipt.startedAt,
    finishedAt: receipt.finishedAt,
    sourcePinCount: sourceBefore.length,
    report: { path: report.path, bytes: report.bytes, sha256: report.sha256 },
    archive: { path: archived.path, bytes: archived.bytes, sha256: archived.sha256 },
    manifest: { path: manifest.path, bytes: manifest.bytes, sha256: manifest.sha256 },
    executionSnapshot: { path: snapshot.path, bytes: snapshot.bytes, sha256: snapshot.sha256 },
  };
}
