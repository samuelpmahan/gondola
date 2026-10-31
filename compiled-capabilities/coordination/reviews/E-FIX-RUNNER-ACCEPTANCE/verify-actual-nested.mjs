import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_BACKENDS_RECEIPT,
  EXPECTED_BACKENDS_REPORT,
  EXPECTED_FRONTEND_EXECUTION,
  EXPECTED_METHODS_RECEIPT,
  EXPECTED_METHODS_REPORT,
  validateInheritedLifecycleEvidence,
} from "../../../runner-acceptance.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const readBytes = (path) => readFile(join(root, path));
const failedRun = JSON.parse((await readBytes("compiled-capabilities/ci/2026-10-31/failed-local-031c/execution.json")).toString());
const lifecycleBytes = await readBytes("compiled-lifecycle/coordination/receipts/E-BUILD.json");
const lifecycle = JSON.parse(lifecycleBytes.toString());
const lifecycleReportBytes = await readBytes("compiled-lifecycle/coordination/reports/E-BUILD.md");
const methodsBytes = await readBytes(EXPECTED_METHODS_RECEIPT);
const methods = JSON.parse(methodsBytes.toString());
const methodsReportBytes = await readBytes(EXPECTED_METHODS_REPORT);
const backendsBytes = await readBytes(EXPECTED_BACKENDS_RECEIPT);
const backends = JSON.parse(backendsBytes.toString());
const backendsReportBytes = await readBytes(EXPECTED_BACKENDS_REPORT);
const frontendExecutionBytes = await readBytes(EXPECTED_FRONTEND_EXECUTION);
const frontendExecution = JSON.parse(frontendExecutionBytes.toString());
const evidence = validateInheritedLifecycleEvidence({
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
  runStartedAt: failedRun.startedAt,
});
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
