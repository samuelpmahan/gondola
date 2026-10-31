import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(new URL("../../../../", import.meta.url).pathname);
const packet = "compiled-methods/evidence/demo/attempt-05-methods-only-final";
const rawAttempt = "compiled-methods/artifacts/attempts/attempt-20261031T042646625Z";
const canonicalReport = "compiled-methods/coordination/reports/E-DEMO.md";
const canonicalReceipt = "compiled-methods/coordination/receipts/E-DEMO.json";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytesAt = async (path) => readFile(join(root, path));
const hashAt = async (path) => hash(await bytesAt(path));
const jsonAt = async (path) => JSON.parse(await bytesAt(path));

async function listFiles(directory, prefix = "") {
  const entries = await readdir(join(root, directory, prefix), { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) paths.push(...await listFiles(directory, rel));
    else if (entry.isFile()) paths.push(rel);
  }
  return paths.sort();
}

const canonical = await jsonAt(canonicalReceipt);
const canonicalReportHash = await hashAt(canonicalReport);
const rawRunnerReceipt = await jsonAt(`${packet}/execution/runner-receipt.json`);
const rawRunnerReportHash = await hashAt(`${packet}/execution/runner-report.md`);
const raw = await jsonAt(`${rawAttempt}/execution.json`);
const packedRun = await jsonAt(`${packet}/execution/attempt-execution.json`);
assert.deepEqual(packedRun, raw, "packed final execution record must match the raw attempt");
assert.equal(raw.status, "passed");
assert.equal(raw.mode, "methods-only");
assert.equal(raw.sourcePinsMatch, true);
assert.deepEqual(raw.sourceBefore, raw.sourceAfter);
assert.equal(raw.sourceBefore.length, 137);
assert.equal(raw.commands.length, 16);
assert.equal(await hashAt(raw.nativeBinary.path), raw.nativeBinary.sha256);
assert.equal((await bytesAt(raw.nativeBinary.path)).length, raw.nativeBinary.bytes);

let liveSourcePinCount = 0;
for (const pin of raw.sourceAfter) {
  assert.equal(await hashAt(pin.path), pin.sha256, `live source pin mismatch: ${pin.path}`);
  liveSourcePinCount++;
}
const runnerPin = raw.sourceAfter.find((pin) => pin.path === "compiled-methods/run.mjs");
assert.equal(runnerPin?.sha256, "eb1aa250c0c9cfbb7f3d73abf7692f8e50a57314836f8e5d0ac7d53a77a3cb68");
const runnerSource = (await bytesAt("compiled-methods/run.mjs")).toString("utf8");
assert.ok(runnerSource.includes("after[backend] = await hashDirectory(join(root, build.outputDir))"));
assert.ok(runnerSource.includes('stablePins(before, after[backend], `${backend} method build final receipt`)'));
for (const command of raw.commands) {
  assert.equal(command.exitCode, 0, `${command.name} did not pass`);
  assert.equal(await hashAt(command.stdoutPath), command.stdoutSha256, `${command.name} stdout hash mismatch`);
  assert.equal(await hashAt(command.stderrPath), command.stderrSha256, `${command.name} stderr hash mismatch`);
}
const getCommandStdout = (name) => readFile(join(root, raw.commands.find((command) => command.name === name).stdoutPath), "utf8");
assert.equal((await getCommandStdout("version-root-go")).trim(), raw.versions.rootGo);
assert.equal((await getCommandStdout("version-compiled-go")).trim(), raw.versions.compiledGo);
assert.equal(raw.versions.rootGo, "go version go1.24.0 linux/amd64");
assert.equal(raw.versions.compiledGo, "go version go1.27.3 linux/amd64");
assert.equal(execFileSync("/tmp/gondola-node22/node_modules/node/bin/node", ["--version"], { encoding: "utf8" }).trim(), raw.versions.node);
for (const [name, path] of [
  ["react", "interaction/node_modules/react/package.json"],
  ["reactDOM", "interaction/node_modules/react-dom/package.json"],
  ["playwright", "interaction/node_modules/playwright/package.json"],
  ["esbuild", "interaction/node_modules/esbuild/package.json"],
]) assert.equal((await jsonAt(path)).version, raw.versions[name], `${name} version mismatch`);

const inventoryLines = (await bytesAt(`${packet}/inventory.sha256`)).toString("utf8").trim().split("\n");
const inventory = inventoryLines.map((line) => {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  assert.ok(match, `malformed inventory row: ${line}`);
  return { sha256: match[1], path: match[2] };
});
assert.equal(inventory.length, 56);
for (const item of inventory) assert.equal(await hashAt(item.path), item.sha256, `inventory hash mismatch: ${item.path}`);
const packetFiles = (await listFiles(packet)).filter((path) => path !== "inventory.sha256").map((path) => `${packet}/${path}`).sort();
assert.deepEqual(inventory.map(({ path }) => path).sort(), packetFiles, "inventory must cover every final evidence file except its own manifest");

const archivePath = `${packet}/archives/compiled-payloads.tar.gz`;
const archiveHash = await hashAt(archivePath);
assert.equal(archiveHash, "0d74acba45844f82ec475bae5e0cdf047d7ef0ab8d89ba1695e35161c0163228");
const archivedNames = execFileSync("tar", ["-tzf", join(root, archivePath)], { encoding: "utf8" }).trim().split("\n").sort();
const listedNames = (await bytesAt(`${packet}/archives/compiled-payloads.list`)).toString("utf8").trim().split("\n").sort();
assert.deepEqual(archivedNames, listedNames, "compiled payload archive entries must match its list");

const sameRows = (left, right) => JSON.stringify(left.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })).sort((a, b) => a.path.localeCompare(b.path))) ===
  JSON.stringify(right.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })).sort((a, b) => a.path.localeCompare(b.path)));
const backendPins = {};
for (const backend of ["react", "dom"]) {
  const build = raw.methodBuilds[backend];
  assert.equal(build.outputDir, `${rawAttempt}/builds/${backend}/output`);
  assert.equal(build.outputPins.length, 67);
  assert.equal(raw.outputPinsBefore[backend].length, 67);
  assert.equal(raw.outputPinsAfter[backend].length, 67);
  assert.ok(sameRows(raw.outputPinsBefore[backend], raw.outputPinsAfter[backend]), `${backend} final output pin arrays changed`);
  const outputPrefix = `${build.outputDir}/`;
  const recordedTree = build.outputPins.map((row) => ({ path: `${build.outputDir}/${row.path}`, bytes: row.bytes, sha256: row.sha256 }));
  assert.ok(sameRows(recordedTree, raw.outputPinsBefore[backend]), `${backend} BuildResult and tree pins differ`);
  for (const pin of raw.outputPinsAfter[backend]) {
    const data = await bytesAt(pin.path);
    assert.equal(data.length, pin.bytes, `${backend} output byte count mismatch: ${pin.path}`);
    assert.equal(hash(data), pin.sha256, `${backend} output hash mismatch: ${pin.path}`);
    assert.ok(pin.path.startsWith(outputPrefix), `${backend} output pin escaped recorded outputDir: ${pin.path}`);
  }
  const buildBase = `${rawAttempt}/builds/${backend}`;
  const request = await jsonAt(`${buildBase}/request.json`);
  const result = await jsonAt(`${buildBase}/result.json`);
  assert.equal(request.sourceRoot, root);
  assert.deepEqual(request.entryPackages, ["github.com/samuelpmahan/gondola/fixtures/compiled/methods"]);
  assert.equal(request.backend, backend);
  assert.equal(resolve(request.outputDir), resolve(root, build.outputDir));
  assert.equal(build.request.path, `${buildBase}/request.json`);
  assert.equal(await hashAt(build.request.path), build.request.sha256);
  assert.equal(build.result.path, `${buildBase}/result.json`);
  const stdoutPath = `${rawAttempt}/logs/compile-${backend}.stdout.log`;
  assert.equal(await hashAt(stdoutPath), build.result.sha256, `${backend} BuildResult stdout hash mismatch`);
  assert.equal(result.ok, true);
  assert.equal(result.apps.length, 1);
  assert.equal(result.outputs.length, 67);
  assert.ok(sameRows(result.outputs, build.outputPins), `${backend} BuildResult outputs differ from the recorded pins`);
  assert.equal(build.manifest.path, `${build.outputDir}/buildmanifest.json`);
  assert.equal(await hashAt(build.manifest.path), build.manifest.sha256);
  const packetBase = `${packet}/builds`;
  assert.deepEqual(await bytesAt(`${packetBase}/${backend}-request.json`), await bytesAt(build.request.path));
  assert.deepEqual(await bytesAt(`${packetBase}/${backend}-result.json`), await bytesAt(build.result.path));
  assert.deepEqual(await bytesAt(`${packetBase}/${backend}-buildmanifest.json`), await bytesAt(build.manifest.path));
  backendPins[backend] = {
    outputDir: build.outputDir,
    requestPath: build.request.path,
    requestBackend: request.backend,
    requestOutputDir: request.outputDir,
    outputCount: build.outputPins.length,
    beforeAfterEqual: true,
    resultAppCount: result.apps.length,
    resultOutputCount: result.outputs.length,
    requestResultAndManifestSnapshotMatch: true,
  };
}
assert.equal(raw.methodBuilds.react.appIR.sha256, raw.methodBuilds.dom.appIR.sha256);
assert.equal(raw.methodBuilds.react.encoder.sha256, raw.methodBuilds.dom.encoder.sha256);
assert.notEqual(raw.methodBuilds.react.rawModule.sha256, raw.methodBuilds.dom.rawModule.sha256);

const matrix = raw.methodMatrix;
assert.equal(matrix.status, "matched");
assert.deepEqual({ ticks: matrix.ticks, actions: matrix.actions, dispatches: matrix.dispatches, suppressed: matrix.suppressed, swaps: matrix.swaps },
  { ticks: 19, actions: 18, dispatches: 14, suppressed: 4, swaps: 18 });
assert.deepEqual(matrix.profiles, ["react", "dom", "swap"]);
for (const file of matrix.files) {
  assert.equal(await hashAt(file.path), file.sha256, `matrix evidence hash mismatch: ${file.path}`);
  assert.equal((await bytesAt(file.path)).length, file.bytes, `matrix evidence size mismatch: ${file.path}`);
}
const smoke = raw.demoSmoke;
assert.equal(smoke.status, "passed");
assert.deepEqual(smoke.browserErrors, []);
assert.deepEqual(smoke.wasmRequests, []);
assert.deepEqual(smoke.finalState, { parent: 0, child: 2, readOnly: false, savedChild: 1 });
assert.equal(smoke.acceptedDispatches, 14);
assert.equal(smoke.rendererSwaps, 3);
assert.equal(smoke.browserVersion, "153.0.8010.0");
assert.deepEqual(raw.demoOutputPinsBeforeSmoke, raw.demoOutputPinsAfterSmoke);
assert.equal(raw.demoOutputPinsAfterSmoke.length, 5);
for (const pin of raw.demoOutputPinsAfterSmoke) {
  const data = await bytesAt(pin.path);
  assert.equal(data.length, pin.bytes, `HTTP bundle byte count mismatch: ${pin.path}`);
  assert.equal(hash(data), pin.sha256, `HTTP bundle hash mismatch: ${pin.path}`);
}
assert.equal(await hashAt(smoke.smokeJson.path), smoke.smokeJson.sha256);
assert.equal(await hashAt(smoke.screenshot.path), smoke.screenshot.sha256);

const m0 = await jsonAt("compiled-methods/evidence/demo/m0-gate/attempt-01/receipt.json");
assert.equal(m0.status, "passed");
assert.equal(m0.outcome, "matched");
assert.equal(m0.sourcePinsMatch, true);
assert.equal(m0.sourceBefore.length, 27);
assert.deepEqual(m0.sourceBefore, m0.sourceAfter);
for (const command of m0.commands) {
  for (const field of ["stdout", "stderr"]) {
    const row = command[field];
    assert.equal(await hashAt(row.path), row.sha256, `M0 ${command.name} ${field} hash mismatch`);
    assert.equal((await bytesAt(row.path)).length, row.bytes, `M0 ${command.name} ${field} length mismatch`);
  }
}
for (const pin of m0.sourceAfter) assert.equal(await hashAt(pin.path), pin.sha256, `M0 live source pin mismatch: ${pin.path}`);
assert.equal(await hashAt(m0.outputs.expectedJson.path), m0.outputs.expectedJson.sha256);
assert.equal(await hashAt(m0.outputs.sha256Sums.path), m0.outputs.sha256Sums.sha256);
assert.equal(await hashAt(m0.outputs.reactMap.path), m0.outputs.reactMap.sha256);
assert.equal(m0.commands.find((row) => row.name === "milestone-0").stdout.sha256, "45b45b3efa356a009dbd2a99db347c39f01ccbedfa6c2e918250c3aee4d06dd1");
assert.equal(m0.commands.find((row) => row.name === "milestone-0").stderr.sha256, "b22c6a315a68f08f52c5aafa7e6117827c6a17c61371555856ecacbcb5d6455d");
assert.equal(await hashAt(m0.report.path), m0.report.sha256);

const rawRunnerReportPath = `${packet}/execution/runner-report.md`;
assert.equal(await hashAt(rawRunnerReportPath), rawRunnerReceipt.report.sha256);
const canonicalReportPin = canonical.report;
const canonicalReportPinMatches = await hashAt(canonicalReportPin.path) === canonicalReportPin.sha256;
const findings = [];
if (!canonicalReportPinMatches) findings.push({
  severity: "amend",
  code: "canonical-report-sha-mismatch",
  path: canonicalReportPin.path,
  recordedSha256: canonicalReportPin.sha256,
  actualSha256: canonicalReportHash,
  observedRecordedHashAt: rawRunnerReportPath,
});
assert.equal(canonical.finalEvidencePacket.rawRunnerReportSha256, rawRunnerReceipt.report.sha256);
assert.equal(canonical.finalEvidencePacket.rawRunnerReceiptSha256, await hashAt(`${packet}/execution/runner-receipt.json`));
assert.equal(canonical.finalEvidencePacket.compiledPayloadArchiveSha256, archiveHash);

const audit = {
  schema: "gobi.xr-demo-audit/v1",
  status: findings.length ? "verified_with_amendment" : "verified",
  canonical: {
    reportPath: canonicalReport,
    reportSha256: canonicalReportHash,
    receiptPath: canonicalReceipt,
    receiptSha256: await hashAt(canonicalReceipt),
    receiptReportPin: canonicalReportPin,
    receiptReportPinMatches: canonicalReportPinMatches,
    rawRunnerReportSha256: rawRunnerReportHash,
    rawRunnerReceiptReportSha256: rawRunnerReceipt.report.sha256,
    rawRunnerReportHashMatchesReceipt: rawRunnerReportHash === rawRunnerReceipt.report.sha256,
    runScriptSha256: await hashAt("compiled-methods/run.mjs"),
    sourcePinCount: liveSourcePinCount,
    currentSourcePinsAllMatch: true,
  },
  finalEvidence: {
    inventoryMemberCount: inventory.length,
    inventoryHashesMatch: true,
    inventoryCoversAllFilesExceptManifest: true,
    payloadArchiveSha256: archiveHash,
    payloadArchiveEntriesMatchList: true,
  },
  methodBuilds: backendPins,
  nativeBinary: raw.nativeBinary,
  buildComparison: {
    appIRSha256: raw.methodBuilds.react.appIR.sha256,
    encoderSha256: raw.methodBuilds.react.encoder.sha256,
    rawReactModuleSha256: raw.methodBuilds.react.rawModule.sha256,
    rawDOMModuleSha256: raw.methodBuilds.dom.rawModule.sha256,
    rawModuleHashesDiffer: true,
  },
  matrix: {
    status: matrix.status,
    ticks: matrix.ticks,
    actions: matrix.actions,
    dispatches: matrix.dispatches,
    suppressed: matrix.suppressed,
    swaps: matrix.swaps,
    mutationControls: matrix.checks.mutationControls.detected,
  },
  rawCommandRecords: {
    count: raw.commands.length,
    allExitZero: true,
    stdoutAndStderrHashesMatch: true,
    rootGo: raw.versions.rootGo,
    compilerGo: raw.versions.compiledGo,
    node: raw.versions.node,
    react: raw.versions.react,
    reactDOM: raw.versions.reactDOM,
    playwright: raw.versions.playwright,
    esbuild: raw.versions.esbuild,
  },
  demoSmoke: {
    status: smoke.status,
    browserVersion: smoke.browserVersion,
    acceptedDispatches: smoke.acceptedDispatches,
    rendererSwaps: smoke.rendererSwaps,
    finalBackend: smoke.finalBackend,
    finalState: smoke.finalState,
    browserErrorCount: smoke.browserErrors.length,
    wasmRequestCount: smoke.wasmRequests.length,
  },
  m0: {
    status: m0.status,
    outcome: m0.outcome,
    cases: 5000,
    sourcePinCount: m0.sourceBefore.length,
    sourcePinsMatch: true,
    logsMatchReceipt: true,
    reportHashMatches: true,
  },
  inheritedFullLocal: canonical.localInheritedFullRun.status,
  ciStatus: "pending; no successful fresh CI evidence reviewed in this packet",
  findings,
};
await writeFile(join(root, "compiled-methods/evidence/reviews/xr-demo/audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
