import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  EXPECTED_BACKENDS_RECEIPT,
  EXPECTED_BACKENDS_REPORT,
  EXPECTED_FRONTEND_EXECUTION,
  EXPECTED_METHODS_RECEIPT,
  EXPECTED_METHODS_REPORT,
  applyReceiptExitCode,
  validateInheritedLifecycleEvidence,
} from "./runner-acceptance.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = (value) => Buffer.from(JSON.stringify(value));
const command = (script) => ({
  name: "inherited-full-runner",
  command: "bash",
  args: [`/checkout/${script}`],
  exitCode: 0,
  signal: null,
  error: null,
});

function makeEvidence() {
  const methodsReport = Buffer.from("methods report\n");
  const backendsReport = Buffer.from("backends report\n");
  const lifecycleReport = Buffer.from("lifecycle report\n");
  const frontendExecution = {
    schema: "gobi.compiled-execution/v1",
    status: "passed",
    startedAt: "2026-10-31T09:54:00.000Z",
    finishedAt: "2026-10-31T09:54:10.000Z",
    mismatches: 0,
    sourceBefore: [{ path: "src/main.go", bytes: 12, sha256: "a".repeat(64) }],
    sourceAfter: [{ path: "src/main.go", bytes: 12, sha256: "a".repeat(64) }],
    commands: [{ name: "root-go-tests", exitCode: 0, signal: null, error: null }],
  };
  const frontendExecutionBytes = bytes(frontendExecution);
  const backends = {
    schema: "gobi.compiled-backends-execution/v1",
    job_id: "E-DEMO",
    mode: "full",
    status: "passed",
    sourcePinsMatch: true,
    startedAt: "2026-10-31T09:53:56.900Z",
    finishedAt: "2026-10-31T09:54:11.000Z",
    failures: [],
    commands: [{ name: "backend-build", exitCode: 0, signal: null, error: null }],
    inheritedExecution: {
      path: EXPECTED_FRONTEND_EXECUTION,
      sha256: digest(frontendExecutionBytes),
      status: "passed",
    },
  };
  const backendsBytes = bytes(backends);
  const methods = {
    schema: "gobi.compiled-methods-execution/v1",
    job_id: "E-DEMO",
    mode: "full",
    status: "passed",
    sourcePinsMatch: true,
    startedAt: "2026-10-31T09:53:56.800Z",
    finishedAt: "2026-10-31T09:54:12.000Z",
    failures: [],
    attempt: "compiled-methods/artifacts/attempts/attempt-test",
    commands: [command("run-compiled-backends.sh"), { name: "build", exitCode: 0, signal: null, error: null }],
    report: { path: EXPECTED_METHODS_REPORT, sha256: digest(methodsReport) },
    inheritedRun: {
      path: EXPECTED_BACKENDS_RECEIPT,
      sha256: digest(backendsBytes),
      report: EXPECTED_BACKENDS_REPORT,
      reportSha256: digest(backendsReport),
      status: "passed",
      mode: "full",
      startedAt: backends.startedAt,
      commandCount: backends.commands.length,
      finalOutputLine: "compiled-backends: passed (full)",
    },
    methodTests: { files: [{ path: "compiled-methods/conformance/check.test.mjs", sha256: "a".repeat(64) }] },
    methodBuilds: { react: { outputCount: 67 }, dom: { outputCount: 67 } },
    backendBuildComparison: { appIRByteIdentical: true, encoderByteIdentical: true },
    methodMatrix: { status: "matched" },
    demoSmoke: { status: "passed" },
  };
  const methodsBytes = bytes(methods);
  const copiedPath = "compiled-lifecycle/builds/attempts/attempt-lifecycle/inherited/attempt-test";
  const lifecycle = {
    schema: "gobi.compiled-lifecycle-execution/v1",
    job_id: "E-BUILD",
    mode: "full",
    status: "passed",
    sourcePinsMatch: true,
    startedAt: "2026-10-31T09:53:56.700Z",
    finishedAt: "2026-10-31T09:54:14.000Z",
    failures: [],
    stages: [{ name: "static-and-interaction", status: "passed" }],
    commands: [command("run-compiled-methods.sh"), { name: "lifecycle-tests", exitCode: 0, signal: null, error: null }],
    report: { path: "compiled-lifecycle/coordination/reports/E-BUILD.md", sha256: digest(lifecycleReport) },
    conformance: { status: "matched" },
    demoSmoke: { status: "passed" },
    inheritedRun: {
      path: EXPECTED_METHODS_RECEIPT,
      sha256: digest(methodsBytes),
      report: { path: EXPECTED_METHODS_REPORT, sha256: digest(methodsReport) },
      status: "passed",
      mode: "full",
      startedAt: methods.startedAt,
      commandCount: methods.commands.length,
      artifacts: {
        originalPath: methods.attempt,
        copiedPath,
        memberCount: 1,
        files: [{ path: `${copiedPath}/execution.json`, sha256: digest(methodsBytes) }],
      },
    },
  };

  return {
    lifecycle,
    lifecycleReportBytes: lifecycleReport,
    methods,
    methodsBytes,
    methodsReportBytes: methodsReport,
    backends,
    backendsBytes,
    backendsReportBytes: backendsReport,
    frontendExecution,
    frontendExecutionBytes,
    runStartedAt: "2026-10-31T09:53:56.600Z",
  };
}

test("accepts fresh full lifecycle plus hash-bound methods, backends, and frontend receipt facts", () => {
  const evidence = makeEvidence();
  const result = validateInheritedLifecycleEvidence(evidence);
  assert.equal(result.status, "passed");
  assert.equal(result.methodsReceipt.sha256, digest(evidence.methodsBytes));
  assert.equal(result.methodsReceipt.methodMatrix, "matched");
  assert.equal(result.backendsReceipt.finalOutputLine, "compiled-backends: passed (full)");
});

test("rejects phrase-only lifecycle evidence without a bound methods receipt", () => {
  const evidence = makeEvidence();
  evidence.lifecycle.checks = ["inherited compiled-methods all passed"];
  evidence.lifecycle.inheritedRun = null;
  assert.throws(() => validateInheritedLifecycleEvidence(evidence), /does not bind the fresh full compiled-methods receipt/);
});

test("rejects tampering with the methods receipt after lifecycle hash binding", () => {
  const evidence = makeEvidence();
  evidence.methodsBytes = Buffer.from("tampered receipt");
  assert.throws(() => validateInheritedLifecycleEvidence(evidence), /does not bind the fresh full compiled-methods receipt/);
});

test("rejects stale, partial, or failed methods receipts", () => {
  const stale = makeEvidence();
  stale.methods.startedAt = "2026-10-31T09:53:00.000Z";
  stale.methodsBytes = bytes(stale.methods);
  stale.lifecycle.inheritedRun.sha256 = digest(stale.methodsBytes);
  stale.lifecycle.inheritedRun.startedAt = stale.methods.startedAt;
  stale.lifecycle.inheritedRun.artifacts.files[0].sha256 = digest(stale.methodsBytes);
  assert.throws(() => validateInheritedLifecycleEvidence(stale), /nested compiled-methods receipt is stale/);

  const failed = makeEvidence();
  failed.methods.status = "failed";
  failed.methodsBytes = bytes(failed.methods);
  failed.lifecycle.inheritedRun.sha256 = digest(failed.methodsBytes);
  failed.lifecycle.inheritedRun.status = "failed";
  failed.lifecycle.inheritedRun.artifacts.files[0].sha256 = digest(failed.methodsBytes);
  assert.throws(() => validateInheritedLifecycleEvidence(failed), /nested compiled-methods receipt must be a full passed/);
});

test("rejects mutations to structured methods matrix and nested hashes", () => {
  const matrix = makeEvidence();
  matrix.methods.methodMatrix.status = "failed";
  matrix.methodsBytes = bytes(matrix.methods);
  matrix.lifecycle.inheritedRun.sha256 = digest(matrix.methodsBytes);
  matrix.lifecycle.inheritedRun.artifacts.files[0].sha256 = digest(matrix.methodsBytes);
  assert.throws(() => validateInheritedLifecycleEvidence(matrix), /lacks structured build, matrix, test, or demo pass facts/);

  const nested = makeEvidence();
  nested.methods.inheritedRun.sha256 = "0".repeat(64);
  nested.methodsBytes = bytes(nested.methods);
  nested.lifecycle.inheritedRun.sha256 = digest(nested.methodsBytes);
  nested.lifecycle.inheritedRun.artifacts.files[0].sha256 = digest(nested.methodsBytes);
  assert.throws(() => validateInheritedLifecycleEvidence(nested), /does not bind the fresh full compiled-backends receipt facts/);
});

test("final failed receipt produces an actual failing Node child exit", () => {
  const helperURL = pathToFileURL(resolve(here, "runner-acceptance.mjs")).href;
  const runChild = (status) => spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    `import { applyReceiptExitCode } from ${JSON.stringify(helperURL)}; applyReceiptExitCode({ status: ${JSON.stringify(status)} });`,
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(runChild("passed").status, 0);
  assert.equal(runChild("failed").status, 1);
  assert.equal(runChild("running").status, 1);
});

test("runner invokes structured acceptance and final receipt exit policy", async () => {
  const source = await readFile(resolve(here, "run.mjs"), "utf8");
  assert.ok(source.includes("validateInheritedLifecycleEvidence("), "runner must call the structured nested receipt validator");
  assert.ok(source.includes("applyReceiptExitCode(receipt)"), "runner must derive process status from final receipt status");
  assert.equal(/checks\?\.some\(\(line\)\s*=>\s*line\.includes\(\s*["']inherited compiled-methods/.test(source), false,
    "runner must not use the old prose-substring acceptance gate");
});
