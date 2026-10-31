import { createHash } from "node:crypto";

export const EXPECTED_METHODS_RECEIPT = "compiled-methods/coordination/receipts/E-DEMO.json";
export const EXPECTED_METHODS_REPORT = "compiled-methods/coordination/reports/E-DEMO.md";
export const EXPECTED_BACKENDS_RECEIPT = "compiled-backends/coordination/receipts/E-DEMO.json";
export const EXPECTED_BACKENDS_REPORT = "compiled-backends/coordination/reports/E-DEMO.md";
export const EXPECTED_FRONTEND_EXECUTION = "compiled-frontend/artifacts/execution.json";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const noFailures = (receipt) => Array.isArray(receipt?.failures) && receipt.failures.length === 0;
const samePins = (left, right) => Array.isArray(left) && Array.isArray(right) &&
  JSON.stringify([...left].sort((a, b) => a.path.localeCompare(b.path))) ===
  JSON.stringify([...right].sort((a, b) => a.path.localeCompare(b.path)));
const parseTime = (value, label) => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label} is not a valid timestamp`);
  return time;
};

function requireFreshFullReceipt(receipt, { schema, jobId, startedAt, label }) {
  if (!receipt || receipt.schema !== schema || receipt.job_id !== jobId || receipt.mode !== "full" ||
      receipt.status !== "passed" || receipt.sourcePinsMatch !== true || !noFailures(receipt)) {
    throw new Error(`${label} must be a full passed receipt with stable source pins and no failures`);
  }
  const runStart = parseTime(startedAt, "current E-BUILD startedAt");
  const receiptStart = parseTime(receipt.startedAt, `${label}.startedAt`);
  const receiptFinish = parseTime(receipt.finishedAt, `${label}.finishedAt`);
  if (receiptStart < runStart || receiptFinish < receiptStart) {
    throw new Error(`${label} is stale or has an invalid finish time`);
  }
}

function requireSuccessfulCommand(receipt, expectedScript, label) {
  const command = receipt.commands?.find((row) => row.name === "inherited-full-runner");
  if (!command || command.command !== "bash" || !Array.isArray(command.args) ||
      !command.args.some((arg) => typeof arg === "string" && arg.endsWith(expectedScript)) ||
      command.exitCode !== 0 || command.signal != null || command.error != null) {
    throw new Error(`${label} does not record a successful full ${expectedScript} command`);
  }
}

function requireBoundReport(pointer, reportBytes, expectedPath, label) {
  if (pointer?.path !== expectedPath || typeof pointer.sha256 !== "string" || digest(reportBytes) !== pointer.sha256) {
    throw new Error(`${label} report path/hash binding does not match its bytes`);
  }
}

export function validateInheritedLifecycleEvidence({
  lifecycle,
  lifecycleReportBytes,
  methods,
  methodsBytes,
  methodsReportBytes,
  backends,
  backendsBytes,
  backendsReportBytes,
  frontendExecution,
  frontendExecutionBytes,
  runStartedAt,
}) {
  requireFreshFullReceipt(lifecycle, {
    schema: "gobi.compiled-lifecycle-execution/v1",
    jobId: "E-BUILD",
    startedAt: runStartedAt,
    label: "inherited lifecycle receipt",
  });
  if (!Array.isArray(lifecycle.stages) || lifecycle.stages.length === 0 || lifecycle.stages.some((stage) => stage.status !== "passed")) {
    throw new Error("inherited lifecycle receipt must have a non-empty all-passed stage ledger");
  }
  requireBoundReport(lifecycle.report, lifecycleReportBytes, "compiled-lifecycle/coordination/reports/E-BUILD.md", "inherited lifecycle");
  requireSuccessfulCommand(lifecycle, "run-compiled-methods.sh", "inherited lifecycle receipt");
  if (lifecycle.conformance?.status !== "matched" || lifecycle.demoSmoke?.status !== "passed") {
    throw new Error("inherited lifecycle receipt is missing matched conformance or passed demo evidence");
  }

  requireFreshFullReceipt(methods, {
    schema: "gobi.compiled-methods-execution/v1",
    jobId: "E-DEMO",
    startedAt: lifecycle.startedAt,
    label: "nested compiled-methods receipt",
  });
  requireSuccessfulCommand(methods, "run-compiled-backends.sh", "nested compiled-methods receipt");
  if (methods.methodMatrix?.status !== "matched" || methods.demoSmoke?.status !== "passed" ||
      !Number.isSafeInteger(methods.methodBuilds?.react?.outputCount) || methods.methodBuilds.react.outputCount <= 0 ||
      !Number.isSafeInteger(methods.methodBuilds?.dom?.outputCount) || methods.methodBuilds.dom.outputCount <= 0 ||
      methods.backendBuildComparison?.appIRByteIdentical !== true ||
      methods.backendBuildComparison?.encoderByteIdentical !== true ||
      !Array.isArray(methods.methodTests?.files) || methods.methodTests.files.length === 0) {
    throw new Error("nested compiled-methods receipt lacks structured build, matrix, test, or demo pass facts");
  }
  requireBoundReport(methods.report, methodsReportBytes, EXPECTED_METHODS_REPORT, "nested compiled-methods");

  const lifecycleMethods = lifecycle.inheritedRun;
  if (!lifecycleMethods || lifecycleMethods.path !== EXPECTED_METHODS_RECEIPT ||
      lifecycleMethods.sha256 !== digest(methodsBytes) || lifecycleMethods.status !== methods.status ||
      lifecycleMethods.mode !== methods.mode || lifecycleMethods.startedAt !== methods.startedAt ||
      lifecycleMethods.report?.path !== methods.report.path || lifecycleMethods.report?.sha256 !== digest(methodsReportBytes) ||
      lifecycleMethods.commandCount !== methods.commands?.length ||
      lifecycleMethods.artifacts?.originalPath !== methods.attempt || lifecycleMethods.artifacts?.memberCount <= 0) {
    throw new Error("inherited lifecycle does not bind the fresh full compiled-methods receipt and its archived facts");
  }
  const copiedMethodsExecution = `${lifecycleMethods.artifacts.copiedPath}/execution.json`;
  if (!lifecycleMethods.artifacts.files?.some((file) => file.path === copiedMethodsExecution && file.sha256 === digest(methodsBytes))) {
    throw new Error("inherited lifecycle archive inventory does not bind the copied compiled-methods receipt bytes");
  }

  requireFreshFullReceipt(backends, {
    schema: "gobi.compiled-backends-execution/v1",
    jobId: "E-DEMO",
    startedAt: methods.startedAt,
    label: "nested compiled-backends receipt",
  });
  const methodsBackends = methods.inheritedRun;
  if (!methodsBackends || methodsBackends.path !== EXPECTED_BACKENDS_RECEIPT ||
      methodsBackends.sha256 !== digest(backendsBytes) || methodsBackends.status !== backends.status ||
      methodsBackends.mode !== backends.mode ||
      methodsBackends.report !== EXPECTED_BACKENDS_REPORT ||
      methodsBackends.reportSha256 !== digest(backendsReportBytes) ||
      methodsBackends.commandCount !== backends.commands?.length) {
    throw new Error("compiled-methods receipt does not bind the fresh full compiled-backends receipt facts");
  }
  requireBoundReport({ path: EXPECTED_BACKENDS_REPORT, sha256: methodsBackends.reportSha256 },
    backendsReportBytes, EXPECTED_BACKENDS_REPORT, "nested compiled-backends");
  const frontendSummary = backends.inheritedExecution;
  if (!frontendSummary || frontendSummary.path !== EXPECTED_FRONTEND_EXECUTION ||
      frontendSummary.sha256 !== digest(frontendExecutionBytes) || frontendSummary.status !== "passed" ||
      frontendExecution?.schema !== "gobi.compiled-execution/v1" || frontendExecution.status !== "passed" ||
      frontendExecution.mismatches !== 0 || !samePins(frontendExecution.sourceBefore, frontendExecution.sourceAfter) ||
      !Array.isArray(frontendExecution.commands) || frontendExecution.commands.length === 0 ||
      frontendExecution.commands.some((command) => command.exitCode !== 0 || command.signal != null || command.error != null)) {
    throw new Error("nested compiled-backends receipt does not bind a passed compiled-frontend execution and command ledger");
  }
  if (parseTime(frontendExecution.startedAt, "compiled-frontend startedAt") < parseTime(backends.startedAt, "compiled-backends startedAt") ||
      parseTime(frontendExecution.finishedAt, "compiled-frontend finishedAt") < parseTime(frontendExecution.startedAt, "compiled-frontend startedAt")) {
    throw new Error("compiled-frontend execution is stale or has an invalid finish time");
  }

  return {
    status: "passed",
    fullMode: true,
    lifecycleStartedAt: lifecycle.startedAt,
    methodsReceipt: {
      path: EXPECTED_METHODS_RECEIPT,
      sha256: digest(methodsBytes),
      report: { path: methods.report.path, sha256: digest(methodsReportBytes) },
      status: methods.status,
      mode: methods.mode,
      startedAt: methods.startedAt,
      commandCount: methods.commands.length,
      methodMatrix: methods.methodMatrix.status,
      httpDemo: methods.demoSmoke.status,
      reactOutputCount: methods.methodBuilds.react.outputCount,
      domOutputCount: methods.methodBuilds.dom.outputCount,
      archivedExecutionReceiptSha256: digest(methodsBytes),
    },
    backendsReceipt: {
      path: EXPECTED_BACKENDS_RECEIPT,
      sha256: digest(backendsBytes),
      report: { path: EXPECTED_BACKENDS_REPORT, sha256: digest(backendsReportBytes) },
      status: backends.status,
      mode: backends.mode,
      startedAt: backends.startedAt,
      commandCount: backends.commands.length,
      finalOutputLine: methodsBackends.finalOutputLine,
    },
    frontendExecution: {
      path: EXPECTED_FRONTEND_EXECUTION,
      sha256: digest(frontendExecutionBytes),
      status: frontendExecution.status,
      commandCount: frontendExecution.commands.length,
    },
  };
}

export function applyReceiptExitCode(receipt, processObject = process) {
  if (receipt?.status !== "passed" && (processObject.exitCode == null || processObject.exitCode === 0)) {
    processObject.exitCode = 1;
  }
  return processObject.exitCode ?? 0;
}
