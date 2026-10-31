import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { archiveAndVerify, createExclusiveAttemptDirectory, writeImmutableSnapshot } from "./archive-helper.mjs";
import {
  applyReceiptExitCode,
  EXPECTED_BACKENDS_RECEIPT,
  EXPECTED_BACKENDS_REPORT,
  EXPECTED_FRONTEND_EXECUTION,
  EXPECTED_METHODS_RECEIPT,
  EXPECTED_METHODS_REPORT,
  validateInheritedLifecycleEvidence,
} from "./runner-acceptance.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const attempts = join(here, "builds/attempts");
const canonicalReport = join(here, "coordination/reports/E-BUILD.md");
const canonicalReceipt = join(here, "coordination/receipts/E-BUILD.json");
const fixturePackage = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle";
const fixturePath = join(root, "fixtures/compiled/lifecycle/scenario.json");
const archiveHelperTest = join(here, "archive-helper.test.mjs");
const runnerAcceptanceTest = join(here, "runner-acceptance.test.mjs");
const conformanceDriver = join(here, "conformance/run.mjs");
const oracleTest = join(here, "oracle/literal-oracle.test.mjs");
const oracleExpectations = join(here, "oracle/expectations.json");
const demoBuilder = join(here, "demo/build.mjs");
const demoSmokeRunner = join(here, "demo/smoke.mjs");
const ignoredSourceDirectories = new Set([
  ".git",
  "node_modules",
  "build",
  "builds",
  "artifacts",
  "coordination",
  "evidence",
]);
const sourceDirectories = [
  "compilercontract",
  "gobi",
  "fixtures/compiled/lifecycle",
  "cmd/compiled-lifecycle-native",
  "compiled-frontend/analyze",
  "compiled-frontend/build",
  "compiled-frontend/cmd",
  "compiled-frontend/emit",
  "compiled-frontend/conformance",
  "compiled-frontend/frontend/react",
  "compiled-frontend/frontend/dom",
  "compiled-frontend/frontend/runtime",
  "compiled-frontend/frontend/shared",
  "compiled-frontend/semantic",
  "compiled-lifecycle/runtime",
  "compiled-lifecycle/conformance",
  "compiled-lifecycle/browser",
  "compiled-lifecycle/demo",
  "compiled-capabilities/conformance",
  "compiled-capabilities/oracle",
  "compiled-capabilities/demo",
];
const sourceFiles = [
  "SHA256SUMS",
  "EXPECTED.json",
  "go.mod",
  "go.sum",
  "package.json",
  "package-lock.json",
  "interaction/package.json",
  "interaction/package-lock.json",
  "compiled-frontend/go.mod",
  "compiled-frontend/go.sum",
  "compiled-frontend/package.json",
  "compiled-frontend/package-lock.json",
  "run.sh",
  "run-keyed-editor.sh",
  "run-http-effects.sh",
  "run-compiled-methods.sh",
  "run-compiled-backends.sh",
  "run-compiled-frontend.sh",
  "run-compiled-lifecycle.sh",
  "run-compiled-capabilities.sh",
  "run-typed-composition.sh",
  "compiled-methods/run.mjs",
  "compiled-backends/run.mjs",
  "compiled-frontend/run.mjs",
  "compiled-lifecycle/CONTRACT.md",
  "compiled-lifecycle/FIXTURE.md",
  "compiled-lifecycle/run.mjs",
  "compiled-capabilities/PLAN.md",
  "compiled-capabilities/archive-helper.mjs",
  "compiled-capabilities/archive-helper.test.mjs",
  "compiled-capabilities/runner-acceptance.mjs",
  "compiled-capabilities/runner-acceptance.test.mjs",
  "compiled-capabilities/run.mjs",
  ".github/workflows/gobi-compiled-lifecycle.yml",
  ".github/workflows/gobi-compiled-capabilities.yml",
  "compiled-capabilities/.gitignore",
  "compiled-capabilities/README.md",
  "compiled-capabilities/RESULTS.md",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = () => new Date().toISOString();
const rel = (path) => relative(root, path).split(sep).join("/");
const attemptId = new Date().toISOString().replace(/[-:.]/g, "");
const attemptRoot = join(attempts, `attempt-${attemptId}`);
const logDirectory = join(attemptRoot, "logs");
const reactRoot = join(attemptRoot, "react");
const domRoot = join(attemptRoot, "dom");
const demoRoot = join(attemptRoot, "demo");
const matrixRoot = join(attemptRoot, "matrix");
let chromiumPath = process.env.CHROMIUM_PATH ?? process.env.CHROMIUM_EXECUTABLE_PATH ?? null;
const args = process.argv.slice(2);
const invalidArgs = args.length !== 0;
const rootGoEnv = { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" };
const compilerGoEnv = { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" };
const receipt = {
  schema: "gobi.compiled-capabilities-execution/v1",
  job_id: "E-BUILD",
  worker: "N6",
  mode: "full",
  status: "running",
  outcome: "mixed_change",
  summary: "The E-BUILD execution has started; capability acceptance evidence is not complete.",
  startedAt: stamp(),
  attempt: rel(attemptRoot),
  invocation: {
    command: process.env.GOBI_CAPABILITIES_ENTRYPOINT ?? "bash run-compiled-capabilities.sh",
    nodeExecutable: process.execPath,
    arguments: args,
  },
  commands: [],
  stages: [],
  checks: [],
  failures: [],
  executionParameters: {
    seed: null,
    seedPolicy: "no random seed; use the frozen lifecycle scenario and literal capability expectations",
    fixture: "fixtures/compiled/lifecycle/scenario.json",
    compilerInvocation: "GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false go run ./cmd/gobi-build",
    nativeInvocation: "GOTOOLCHAIN=local GOFLAGS=-buildvcs=false go run ./cmd/compiled-lifecycle-native --script <frozen fixture>",
  },
  dependencyInstall: {
    source: ".github/workflows/gobi-compiled-capabilities.yml",
    commands: [
      "npm ci --no-audit --no-fund",
      "npm ci --prefix interaction --no-audit --no-fund",
      "npm ci --prefix compiled-frontend --no-audit --no-fund",
      "interaction/node_modules/.bin/playwright install --with-deps chromium",
    ],
    execution: "CI installs dependencies before the runner; the runner records lock hashes and validates installed-versus-locked versions.",
  },
  environment: Object.fromEntries([
    "GOTOOLCHAIN",
    "GOFLAGS",
    "CHROMIUM_PATH",
    "CHROMIUM_EXECUTABLE_PATH",
    "GOBI_CAPABILITIES_ENTRYPOINT",
  ].map((key) => [key, process.env[key] ?? null])),
  outputPaths: { report: rel(canonicalReport), receipt: rel(canonicalReceipt) },
};

await createExclusiveAttemptDirectory(attemptRoot);
await Promise.all([
  mkdir(logDirectory, { recursive: true }),
  mkdir(reactRoot, { recursive: true }),
  mkdir(domRoot, { recursive: true }),
  mkdir(demoRoot, { recursive: true }),
  mkdir(matrixRoot, { recursive: true }),
  mkdir(dirname(canonicalReport), { recursive: true }),
  mkdir(dirname(canonicalReceipt), { recursive: true }),
]);
await rm(canonicalReport, { force: true });
await saveReceipt();

async function saveReceipt() {
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  await Promise.all([
    writeFile(canonicalReceipt, serialized),
    writeFile(join(attemptRoot, "execution.json"), serialized),
  ]);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function walk(directory, { sourceOnly = false } = {}) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (sourceOnly && ignoredSourceDirectories.has(entry.name)) continue;
    if (sourceOnly && /\.(?:log|png)$/i.test(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, { sourceOnly }));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function hashPath(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: hash(bytes) };
}

async function sourcePins() {
  const paths = sourceFiles.map((path) => join(root, path));
  const sumsPath = join(root, "SHA256SUMS");
  try {
    const sums = await readFile(sumsPath, "utf8");
    for (const line of sums.split(/\r?\n/)) {
      const match = line.match(/^([a-f0-9]{64})\s+\*?(\S+)$/i);
      if (match) paths.push(join(root, match[2]));
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const directory of sourceDirectories) {
    paths.push(...await walk(join(root, directory), { sourceOnly: true }));
  }
  const unique = [...new Set(paths)].sort();
  const pins = [];
  for (const path of unique) {
    try {
      const info = await stat(path);
      if (info.isFile()) pins.push({ path: rel(path), ...await hashPath(path) });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return pins;
}

async function verifyM0SourcePins() {
  const sumPath = join(root, "SHA256SUMS");
  const text = await readFile(sumPath, "utf8");
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^([a-f0-9]{64})\s+\*?(\S+)$/i);
    if (!match) throw new Error(`M0 SHA256SUMS has an invalid line: ${line}`);
    const path = join(root, match[2]);
    const actual = await hashPath(path);
    entries.push({ path: match[2], expectedSha256: match[1], ...actual, matches: actual.sha256 === match[1] });
  }
  const mismatches = entries.filter((entry) => !entry.matches);
  if (entries.length !== 24 || mismatches.length) {
    throw new Error(`M0 preservation check failed (${entries.length} entries; ${mismatches.length} checksum mismatches)`);
  }
  receipt.m0Preservation = {
    checksumFile: { path: rel(sumPath), ...await hashPath(sumPath) },
    entryCount: entries.length,
    entries,
    status: "passed",
  };
  receipt.checks.push("all 24 original M0 SHA256SUMS entries match and remain included in the before/after source-pin set");
  await saveReceipt();
}

async function prepareM0SourcePins() {
  await execute("m0-regenerate-react-map", "go", ["run", "./cmd/gobi", "emit", "react"], { env: rootGoEnv });
  await verifyM0SourcePins();
  return receipt.m0Preservation;
}

function runCommand(name, command, commandArgs, { cwd = root, input, env = {} } = {}) {
  const startedAt = stamp();
  process.stdout.write(`${name}: ${command} ${commandArgs.join(" ")}\n`);
  const child = spawnSync(command, commandArgs, {
    cwd,
    input,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  const entry = {
    name,
    command,
    args: commandArgs,
    cwd: rel(cwd),
    environmentOverrides: env,
    startedAt,
    finishedAt: stamp(),
    exitCode: child.status,
    signal: child.signal,
    error: child.error?.message ?? null,
    inputSha256: input === undefined ? null : hash(Buffer.from(input)),
    stdoutSha256: hash(Buffer.from(stdout)),
    stderrSha256: hash(Buffer.from(stderr)),
    stdoutPath: rel(join(logDirectory, `${name}.stdout.log`)),
    stderrPath: rel(join(logDirectory, `${name}.stderr.log`)),
  };
  receipt.commands.push(entry);
  return { child, stdout, stderr, entry };
}

async function execute(name, command, commandArgs, options = {}) {
  const result = runCommand(name, command, commandArgs, options);
  await Promise.all([
    writeFile(join(logDirectory, `${name}.stdout.log`), result.stdout),
    writeFile(join(logDirectory, `${name}.stderr.log`), result.stderr),
  ]);
  await saveReceipt();
  if (result.child.status !== 0 || result.child.error) {
    const error = result.child.error?.message ?? (result.stderr.trim() || `${name} exited ${result.child.status}`);
    receipt.failures.push({
      name,
      error,
      exitCode: result.child.status,
      signal: result.child.signal,
      stdoutSha256: result.entry.stdoutSha256,
      stderrSha256: result.entry.stderrSha256,
    });
    await saveReceipt();
    throw new Error(`${name} failed; output retained at ${result.entry.stdoutPath} and ${result.entry.stderrPath}`);
  }
  return result.stdout;
}

async function stage(name, operation) {
  try {
    const value = await operation();
    receipt.stages.push({ name, status: "passed" });
    await saveReceipt();
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    receipt.stages.push({ name, status: "failed", error: message });
    receipt.failures.push({ name: `stage:${name}`, error: message });
    await saveReceipt();
    return null;
  }
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function parseLastJSONLine(output, label) {
  const line = output.trim().split("\n").at(-1);
  if (!line) throw new Error(`${label} returned no JSON output`);
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`${label} final output line was not JSON: ${error.message}`);
  }
}

function outputPath(directory, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/")) {
    throw new Error(`invalid compiler output path: ${relativePath}`);
  }
  const full = resolve(directory, relativePath);
  if (!full.startsWith(resolve(directory) + sep)) throw new Error(`compiler output escapes build directory: ${relativePath}`);
  return full;
}

async function pinOutputs(directory, outputs) {
  if (!Array.isArray(outputs) || outputs.length === 0) throw new Error("compiler output inventory is empty");
  const seen = new Set();
  const pins = [];
  for (const row of outputs) {
    if (!row || typeof row.path !== "string" || seen.has(row.path)) throw new Error("compiler output inventory has an invalid or duplicate path");
    seen.add(row.path);
    const bytes = await readFile(outputPath(directory, row.path));
    const actual = { path: row.path, bytes: bytes.length, sha256: hash(bytes) };
    if (actual.bytes !== row.bytes || actual.sha256 !== row.sha256) throw new Error(`BuildResult output pin mismatch: ${row.path}`);
    pins.push(actual);
  }
  const physical = (await walk(directory)).map((path) => relative(directory, path).split(sep).join("/")).sort();
  const reported = pins.map((row) => row.path).sort();
  if (JSON.stringify(physical) !== JSON.stringify(reported)) throw new Error("physical output inventory differs from BuildResult.outputs");
  return pins;
}

async function hashDirectory(directory) {
  const rows = [];
  for (const path of await walk(directory)) rows.push({ path: rel(path), ...await hashPath(path) });
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

function stablePins(before, after, label) {
  const normalize = (rows) => rows.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })).sort((a, b) => a.path.localeCompare(b.path));
  if (JSON.stringify(normalize(before)) !== JSON.stringify(normalize(after))) throw new Error(`${label} changed during validation`);
}

async function collectVersions() {
  if (!chromiumPath && await exists("/tmp/chromium")) chromiumPath = "/tmp/chromium";
  if (!chromiumPath) {
    const playwrightPath = join(root, "interaction/node_modules/playwright/index.mjs");
    if (await exists(playwrightPath)) {
      const { chromium } = await import(pathToFileURL(playwrightPath).href);
      const executable = chromium.executablePath();
      if (await exists(executable)) chromiumPath = executable;
    }
  }
  if (!chromiumPath || !await exists(chromiumPath)) throw new Error("A Playwright Chromium executable is required; install the locked browser or set CHROMIUM_PATH");
  receipt.environment.resolvedChromiumPath = chromiumPath;
  const versions = {
    node: process.version,
    npm: (await execute("version-npm", "npm", ["--version"])).trim(),
    rootGo: (await execute("version-root-go", "go", ["version"], { env: rootGoEnv })).trim(),
    compiledGo: (await execute("version-compiled-go", "go", ["version"], { env: compilerGoEnv })).trim(),
    dependencies: {},
    packageLocks: {},
    chromiumPath,
  };
  if (!versions.node.startsWith("v22.")) throw new Error(`Node 22 is required, got ${versions.node}`);
  if (!versions.rootGo.includes("go1.24.")) throw new Error(`root Go 1.24 is required, got ${versions.rootGo}`);
  if (!versions.compiledGo.includes("go1.27.3")) throw new Error(`compiler Go 1.27.3 is required, got ${versions.compiledGo}`);
  versions.chromium = (await execute("version-chromium", chromiumPath, ["--version"])).trim();
  for (const [name, path] of Object.entries({
    react: "interaction/node_modules/react/package.json",
    reactDOM: "interaction/node_modules/react-dom/package.json",
    playwright: "interaction/node_modules/playwright/package.json",
    esbuild: "interaction/node_modules/esbuild/package.json",
    frontendEsbuild: "compiled-frontend/node_modules/esbuild/package.json",
  })) {
    const packageJSON = await readJSON(join(root, path));
    versions.dependencies[name] = packageJSON.version;
  }
  const lockSources = {
    react: ["interaction/package-lock.json", "node_modules/react"],
    reactDOM: ["interaction/package-lock.json", "node_modules/react-dom"],
    playwright: ["interaction/package-lock.json", "node_modules/playwright"],
    esbuild: ["interaction/package-lock.json", "node_modules/esbuild"],
    frontendEsbuild: ["compiled-frontend/package-lock.json", "node_modules/esbuild"],
  };
  versions.lockedDependencies = {};
  for (const [name, [lockPath, packagePath]] of Object.entries(lockSources)) {
    const lock = await readJSON(join(root, lockPath));
    const locked = lock.packages?.[packagePath]?.version;
    if (typeof locked !== "string") throw new Error(`${lockPath} does not pin ${packagePath}`);
    versions.lockedDependencies[name] = locked;
    if (versions.dependencies[name] !== locked) {
      throw new Error(`${name} installed version ${versions.dependencies[name]} differs from ${lockPath} pin ${locked}`);
    }
  }
  if (versions.dependencies.react !== "19.3.1" || versions.dependencies.reactDOM !== "19.3.1") {
    throw new Error(`React and ReactDOM 19.3.1 are required; got ${versions.dependencies.react} and ${versions.dependencies.reactDOM}`);
  }
  for (const path of ["package-lock.json", "interaction/package-lock.json", "compiled-frontend/package-lock.json"]) {
    versions.packageLocks[path] = hash(await readFile(join(root, path)));
  }
  receipt.versions = versions;
  receipt.checks.push("Go 1.24, compiler Go 1.27.3, Node 22, Chromium, React 19.3.1, all existing npm lockfile hashes, and installed-versus-locked package versions were recorded");
  receipt.checks.push("M0 SHA256SUMS and every listed source file are part of the before/after source-pin set");
  await saveReceipt();
}

async function validateInheritedLifecycle() {
  const receiptPath = join(root, "compiled-lifecycle/coordination/receipts/E-BUILD.json");
  const reportPath = join(root, "compiled-lifecycle/coordination/reports/E-BUILD.md");
  const inherited = await readJSON(receiptPath);
  const receiptBytes = await readFile(receiptPath);
  const reportBytes = await readFile(reportPath);
  if (inherited.inheritedRun?.path !== EXPECTED_METHODS_RECEIPT) {
    throw new Error(`inherited lifecycle receipt must bind ${EXPECTED_METHODS_RECEIPT}`);
  }
  const methodsReceiptPath = join(root, EXPECTED_METHODS_RECEIPT);
  const methodsBytes = await readFile(methodsReceiptPath);
  const methods = JSON.parse(methodsBytes.toString("utf8"));
  const methodsReportPath = join(root, EXPECTED_METHODS_REPORT);
  const methodsReportBytes = await readFile(methodsReportPath);
  if (methods.inheritedRun?.path !== EXPECTED_BACKENDS_RECEIPT) {
    throw new Error(`compiled-methods receipt must bind ${EXPECTED_BACKENDS_RECEIPT}`);
  }
  const backendsReceiptPath = join(root, EXPECTED_BACKENDS_RECEIPT);
  const backendsBytes = await readFile(backendsReceiptPath);
  const backends = JSON.parse(backendsBytes.toString("utf8"));
  const backendsReportPath = join(root, EXPECTED_BACKENDS_REPORT);
  const backendsReportBytes = await readFile(backendsReportPath);
  if (backends.inheritedExecution?.path !== EXPECTED_FRONTEND_EXECUTION) {
    throw new Error(`compiled-backends receipt must bind ${EXPECTED_FRONTEND_EXECUTION}`);
  }
  const frontendExecutionPath = join(root, EXPECTED_FRONTEND_EXECUTION);
  const frontendExecutionBytes = await readFile(frontendExecutionPath);
  const frontendExecution = JSON.parse(frontendExecutionBytes.toString("utf8"));
  const acceptanceEvidence = validateInheritedLifecycleEvidence({
    lifecycle: inherited,
    lifecycleReportBytes: reportBytes,
    methods,
    methodsBytes,
    methodsReportBytes,
    backends,
    backendsBytes,
    backendsReportBytes,
    frontendExecution,
    frontendExecutionBytes,
    runStartedAt: receipt.startedAt,
  });
  receipt.inheritedLifecycle = {
    command: "bash run-compiled-lifecycle.sh",
    path: rel(receiptPath),
    sha256: hash(receiptBytes),
    report: { path: rel(reportPath), sha256: hash(reportBytes) },
    status: inherited.status,
    mode: inherited.mode,
    startedAt: inherited.startedAt,
    finishedAt: inherited.finishedAt,
    sourcePinsMatch: inherited.sourcePinsMatch,
    versions: inherited.versions,
    acceptanceEvidence,
    methodsReceipt: acceptanceEvidence.methodsReceipt,
    backendsReceipt: acceptanceEvidence.backendsReceipt,
    frontendExecution: acceptanceEvidence.frontendExecution,
    inheritedRun: inherited.inheritedRun ?? null,
    attempt: inherited.attempt ?? null,
    archive: inherited.archive ?? null,
    finalOutputLine: null,
  };
  const lifecycleOutput = await readFile(join(logDirectory, "inherited-full-lifecycle.stdout.log"), "utf8");
  receipt.inheritedLifecycle.finalOutputLine = lifecycleOutput.trim().split("\n").at(-1) ?? null;
  receipt.checks.push("fresh lifecycle and hash-bound methods/backend/frontend receipts passed structured full-mode status, freshness, source-pin, command, report, and output facts");
  await saveReceipt();
}

async function runInheritedLifecycle() {
  await execute("inherited-full-lifecycle", "bash", [join(root, "run-compiled-lifecycle.sh")], { env: rootGoEnv });
  await validateInheritedLifecycle();
}

async function buildProfile(backend, backendRoot) {
  const outputDir = join(backendRoot, "output");
  await mkdir(outputDir, { recursive: true });
  const requestPath = join(backendRoot, "request.json");
  const resultPath = join(backendRoot, "result.json");
  const request = {
    schema: "gobi.build-request/v1",
    sourceRoot: root,
    entryPackages: [fixturePackage],
    backend,
    outputDir,
  };
  const requestText = `${JSON.stringify(request, null, 2)}\n`;
  await writeFile(requestPath, requestText);
  const stdout = await execute(`compile-${backend}-goscript`, "go", ["run", "./cmd/gobi-build"], {
    cwd: join(root, "compiled-frontend"),
    input: requestText,
    env: compilerGoEnv,
  });
  let result;
  try {
    result = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${backend} GoScript CLI stdout was not BuildResult JSON: ${error.message}`);
  }
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  if (result.schema !== "gobi.build-result/v1" || result.ok !== true || result.diagnostics?.length || result.apps?.length !== 1) {
    throw new Error(`${backend} actual GoScript CLI build did not return one clean lifecycle app`);
  }
  const manifestPath = join(outputDir, "buildmanifest.json");
  const manifest = await readJSON(manifestPath);
  if (!Array.isArray(manifest.apps) || manifest.apps.length !== 1) throw new Error(`${backend} manifest must list exactly one app`);
  const app = manifest.apps[0];
  if (app.packagePath !== fixturePackage || app.backend !== backend) throw new Error(`${backend} manifest app identity/backend is wrong`);
  const appPaths = Object.fromEntries(["appIR", "module", "encoder"].map((key) => [key, outputPath(outputDir, app[key])]));
  const appIR = await readJSON(appPaths.appIR);
  const component = appIR.components?.find((candidate) => candidate.packagePath === fixturePackage);
  if (!component || component.id !== fixturePackage) throw new Error(`${backend} AppIR component ID differs from its Go package-path ID`);
  const required = ["view.node", "numeric.safe-integer", "numeric.float64", "effect.request-reply", "effect.cancel"];
  if (JSON.stringify(component.capabilities) !== JSON.stringify(required)) {
    throw new Error(`${backend} AppIR capability list differs from the frozen lifecycle requirements: ${JSON.stringify(component.capabilities)}`);
  }
  const outputPins = await pinOutputs(outputDir, result.outputs);
  const record = {
    backend,
    request: { path: rel(requestPath), ...await hashPath(requestPath) },
    result: { path: rel(resultPath), ...await hashPath(resultPath) },
    manifest: { path: rel(manifestPath), ...await hashPath(manifestPath) },
    app: { packagePath: app.packagePath, backend: app.backend, paths: app },
    component: {
      id: component.id,
      packagePath: component.packagePath,
      capabilities: component.capabilities,
      requiredCapabilities: required,
    },
    outputCount: outputPins.length,
    outputPins,
    appIR: { path: rel(appPaths.appIR), ...await hashPath(appPaths.appIR) },
    module: { path: rel(appPaths.module), ...await hashPath(appPaths.module) },
    encoder: { path: rel(appPaths.encoder), ...await hashPath(appPaths.encoder) },
  };
  await writeFile(join(backendRoot, "build-record.json"), `${JSON.stringify(record, null, 2)}\n`);
  receipt.builds ??= {};
  receipt.builds[backend] = record;
  receipt.checks.push(`${backend} compiled one lifecycle package through actual go run ./cmd/gobi-build and pinned every BuildResult output`);
  receipt.checks.push(`${backend} AppIR declares the exact lifecycle profile: view.node, numeric.safe-integer, numeric.float64, effect.request-reply, and compiler-derived effect.cancel`);
  await saveReceipt();
  return { backend, backendRoot, outputDir, request, result, manifest, app, appPaths, appIR, component, outputPins, record };
}

function withoutBackend(manifest) {
  return { ...manifest, apps: manifest.apps.map(({ backend: _backend, ...app }) => app) };
}

async function compareBuilds(react, dom) {
  if (JSON.stringify(react.result.apps) !== JSON.stringify(dom.result.apps)) throw new Error("React and DOM BuildResult app records differ");
  if (JSON.stringify(withoutBackend(react.manifest)) !== JSON.stringify(withoutBackend(dom.manifest))) {
    throw new Error("React and DOM manifests differ outside the backend tag");
  }
  for (const key of ["appIR", "encoder"]) {
    if (Buffer.compare(await readFile(react.appPaths[key]), await readFile(dom.appPaths[key])) !== 0) {
      throw new Error(`React and DOM ${key} bytes differ`);
    }
  }
  const reactPaths = react.outputPins.map(({ path }) => path).sort();
  const domPaths = dom.outputPins.map(({ path }) => path).sort();
  if (JSON.stringify(reactPaths) !== JSON.stringify(domPaths)) throw new Error("React and DOM BuildResult output path sets differ");
  const modulePaths = new Set([react.appPaths.module, dom.appPaths.module].map((path) => relative(react.outputDir, path).split(sep).join("/")));
  const domByPath = new Map(dom.outputPins.map((row) => [row.path, row]));
  const differences = [];
  for (const row of react.outputPins) {
    if (row.path === "buildmanifest.json" || modulePaths.has(row.path)) continue;
    const peer = domByPath.get(row.path);
    if (!peer || peer.sha256 !== row.sha256 || peer.bytes !== row.bytes) differences.push(row.path);
  }
  if (differences.length) throw new Error(`React/DOM non-manifest, non-module output mismatch: ${differences.join(", ")}`);
  receipt.buildComparison = {
    appResultsIdentical: true,
    manifestsEqualAfterRemovingBackendTag: true,
    appIRByteIdentical: true,
    encoderByteIdentical: true,
    outputPathSetsIdentical: true,
    nonManifestNonModuleOutputCount: reactPaths.length - 2,
    rawModuleHashes: { react: react.record.module, dom: dom.record.module },
    rawBundleEqualityClaimed: false,
  };
  receipt.checks.push("React and DOM share AppIR, encoder, and all non-manifest/non-module compiler output; generated module files remain separately pinned");
  await saveReceipt();
}

async function runOracle() {
  if (!await exists(oracleTest) || !await exists(oracleExpectations)) throw new Error("N4 oracle test and expectations source are required");
  const output = await execute("n4-literal-oracle", process.execPath, ["--test", oracleTest]);
  const tap = Object.fromEntries(["tests", "pass", "fail", "cancelled", "skipped", "todo"].map((name) => {
    const match = output.match(new RegExp(`^# ${name} (\\d+)$`, "m"));
    return [name, match ? Number(match[1]) : null];
  }));
  if (tap.tests === null || tap.pass === null || tap.pass < 1 || tap.fail !== 0) {
    throw new Error(`N4 Node oracle did not report a clean TAP summary: ${JSON.stringify(tap)}`);
  }
  const summary = `Node test runner: ${tap.pass}/${tap.tests} passed`;
  receipt.oracle = {
    test: { path: rel(oracleTest), ...await hashPath(oracleTest) },
    expectations: { path: rel(oracleExpectations), ...await hashPath(oracleExpectations) },
    stdoutPath: rel(join(logDirectory, "n4-literal-oracle.stdout.log")),
    stderrPath: rel(join(logDirectory, "n4-literal-oracle.stderr.log")),
    stdoutSha256: hash(Buffer.from(output)),
    summary,
    tap,
    exitCode: 0,
  };
  receipt.checks.push("N4 independent literal capability oracle, hostile-descriptor cases, negative controls, and atomic rejection assertions passed under Node 22");
  await saveReceipt();
}

async function runArchiveHelperTests() {
  if (!await exists(archiveHelperTest)) throw new Error("archive helper regression test is required");
  const output = await execute("archive-helper-startup-regressions", process.execPath, ["--test", archiveHelperTest]);
  const tap = Object.fromEntries(["tests", "pass", "fail", "cancelled", "skipped", "todo"].map((name) => {
    const match = output.match(new RegExp(`^# ${name} (\\d+)$`, "m"));
    return [name, match ? Number(match[1]) : null];
  }));
  receipt.archiveHelperTests = {
    status: "failed",
    test: { path: rel(archiveHelperTest), ...await hashPath(archiveHelperTest) },
    stdoutPath: rel(join(logDirectory, "archive-helper-startup-regressions.stdout.log")),
    stderrPath: rel(join(logDirectory, "archive-helper-startup-regressions.stderr.log")),
    stdoutSha256: hash(Buffer.from(output)),
    tap,
    exitCode: 0,
  };
  await saveReceipt();
  if (tap.tests === null || tap.pass === null || tap.tests < 5 || tap.pass !== tap.tests || tap.fail !== 0 || tap.cancelled !== 0 || tap.skipped !== 0 || tap.todo !== 0) {
    throw new Error(`archive helper Node test stage did not report at least five clean TAP passes: ${JSON.stringify(tap)}`);
  }
  receipt.archiveHelperTests.status = "passed";
  receipt.checks.push(`${tap.pass} archive helper regressions passed under Node 22 before the inherited lifecycle chain (minimum five; all tests must pass with no failures, cancellations, skips, or todos)`);
  await saveReceipt();
  return receipt.archiveHelperTests;
}

async function runRunnerAcceptanceTests() {
  if (!await exists(runnerAcceptanceTest)) throw new Error("runner acceptance regression test is required");
  const output = await execute("runner-acceptance-regressions", process.execPath, ["--test", runnerAcceptanceTest]);
  const tap = Object.fromEntries(["tests", "pass", "fail", "cancelled", "skipped", "todo"].map((name) => {
    const match = output.match(new RegExp(`^# ${name} (\\d+)$`, "m"));
    return [name, match ? Number(match[1]) : null];
  }));
  receipt.runnerAcceptanceTests = {
    status: "failed",
    test: { path: rel(runnerAcceptanceTest), ...await hashPath(runnerAcceptanceTest) },
    helper: { path: rel(join(here, "runner-acceptance.mjs")), ...await hashPath(join(here, "runner-acceptance.mjs")) },
    stdoutPath: rel(join(logDirectory, "runner-acceptance-regressions.stdout.log")),
    stderrPath: rel(join(logDirectory, "runner-acceptance-regressions.stderr.log")),
    stdoutSha256: hash(Buffer.from(output)),
    tap,
    exitCode: 0,
  };
  await saveReceipt();
  if (tap.tests !== 7 || tap.pass !== 7 || tap.fail !== 0 || tap.cancelled !== 0 || tap.skipped !== 0 || tap.todo !== 0) {
    throw new Error(`runner acceptance Node test stage did not report seven clean TAP passes: ${JSON.stringify(tap)}`);
  }
  receipt.runnerAcceptanceTests.status = "passed";
  receipt.checks.push("seven Node 22 regressions verified fresh hash-bound nested full-run receipts and nonzero child-process exit on final failure");
  await saveReceipt();
  return receipt.runnerAcceptanceTests;
}

async function nextConformanceOutput() {
  const evidence = join(here, "conformance/evidence");
  await mkdir(evidence, { recursive: true });
  const entries = await readdir(evidence, { withFileTypes: true });
  const used = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  let index = 0;
  while (used.has(`attempt-${String(index).padStart(2, "0")}`)) index += 1;
  return join(evidence, `attempt-${String(index).padStart(2, "0")}`, "capabilities");
}

async function copyMatrixEvidence(outputPrefix) {
  const suffixes = [
    "lifecycle.native.json",
    "lifecycle.direct.json",
    "lifecycle.browser.json",
    "lifecycle.check.json",
    "lifecycle.manifest.json",
    "lifecycle.run.json",
    "capability.browser.capture.json",
    "capability-check.json",
    "manifest.json",
    "run.json",
    "failed.json",
  ];
  const files = [];
  for (const suffix of suffixes) {
    const source = `${outputPrefix}.${suffix}`;
    if (!await exists(source)) continue;
    const destination = join(matrixRoot, `capabilities.${suffix}`);
    await copyFile(source, destination);
    files.push({ path: rel(destination), ...await hashPath(destination), originalPath: rel(source) });
  }
  return files;
}

async function runConformance(react, dom) {
  const outputPrefix = await nextConformanceOutput();
  const nativeGo = process.env.GOBI_GO_EXECUTABLE ?? (await exists("/tmp/gondola-go/bin/go") ? "/tmp/gondola-go/bin/go" : "go");
  receipt.executionParameters.nativeGoExecutable = nativeGo;
  await saveReceipt();
  const commandArgs = [
    conformanceDriver,
    "--react-app-ir", react.appPaths.appIR,
    "--react-compiled", react.appPaths.module,
    "--react-helpers", react.appPaths.encoder,
    "--react-manifest", join(react.outputDir, "buildmanifest.json"),
    "--dom-app-ir", dom.appPaths.appIR,
    "--dom-compiled", dom.appPaths.module,
    "--dom-helpers", dom.appPaths.encoder,
    "--dom-manifest", join(dom.outputDir, "buildmanifest.json"),
    "--native-go", nativeGo,
    "--fixture", fixturePath,
    "--expectations", oracleExpectations,
    "--chromium", chromiumPath,
    "--output", outputPrefix,
  ];
  let stdout;
  try {
    stdout = await execute("n3-compiled-capability-conformance", process.execPath, commandArgs, {
      env: { CHROMIUM_PATH: chromiumPath },
    });
  } catch (error) {
    receipt.conformance = {
      status: "failed",
      outputPrefix: rel(outputPrefix),
      files: await copyMatrixEvidence(outputPrefix),
    };
    await saveReceipt();
    throw error;
  }
  const summary = parseLastJSONLine(stdout, "N3 capability conformance driver");
  const files = await copyMatrixEvidence(outputPrefix);
  const runPath = `${outputPrefix}.run.json`;
  const checkPath = `${outputPrefix}.capability-check.json`;
  const manifestPath = `${outputPrefix}.manifest.json`;
  const nativeTracePath = `${outputPrefix}.lifecycle.native.json`;
  const expectations = await readJSON(oracleExpectations);
  const run = await readJSON(runPath);
  const check = await readJSON(checkPath);
  const manifest = await readJSON(manifestPath);
  const nativeTrace = await readJSON(nativeTracePath);
  if (summary.status !== "matched" || run.status !== "matched" || check.schema !== "gobi.compiled-capability-check/v1" || check.status !== "matched") {
    throw new Error("N3 native/direct/React/DOM capability conformance did not report matched");
  }
  if (check.lifecycle?.status !== "matched" || run.lifecycle?.status !== "matched") {
    throw new Error("N3 nested native/direct/React/DOM lifecycle comparison did not report matched");
  }
  if (manifest.schema !== "gobi.compiled-capabilities-conformance-manifest/v1" || manifest.status !== "matched" ||
      run.sourceStableThroughCheck !== true || run.buildOutputsStableThroughCheck !== true ||
      check.lifecycle?.runPath !== run.lifecycle?.runPath || check.lifecycle?.checkPath !== run.lifecycle?.checkPath) {
    throw new Error("N3 manifest, source/output pins, or inherited lifecycle output paths did not verify");
  }
  if (nativeTrace.schema !== "gobi.compiled-lifecycle-native/v1" ||
      nativeTrace.packagePath !== fixturePackage || nativeTrace.componentID !== fixturePackage) {
    throw new Error("N3 native Go trace returned the wrong schema or lifecycle package identity");
  }
  const nativeEffects = (nativeTrace.steps ?? []).flatMap((step) => step.effects ?? []).map((effect) => ({
    kind: effect.kind ?? effect.Kind,
    name: effect.name ?? effect.Name,
    reply: effect.reply ?? effect.Reply,
  }));
  if (!nativeEffects.some((effect) => effect.kind === "fixture.request" && effect.name === "lookup" && effect.reply === "complete") ||
      !nativeEffects.some((effect) => effect.kind === "lifecycle.cancel" && effect.name === "cancel" && effect.reply === "")) {
    throw new Error("N3 native trace omitted the request/reply or cancellation effect observations");
  }
  const admission = check.admission;
  const expectedCaseIds = [
    ...expectations.admission.rejectBeforeInitOrRender.map((row) => row.id),
    ...expectations.admission.strictHostDeclarations.map((row) => row.id),
    ...expectations.admission.strictRendererDeclarations.map((row) => row.id),
  ];
  if (JSON.stringify(admission?.expectedCaseIds) !== JSON.stringify(expectedCaseIds) ||
      JSON.stringify(admission?.observedCaseIds) !== JSON.stringify(expectedCaseIds) ||
      admission?.allRejectedBeforeInitOrRender !== true) {
    throw new Error("N3 admission case IDs or pre-Init/render rejection controls differ from the independent N4 list");
  }
  for (const [key, rows] of [
    ["strictHost", expectations.admission.strictHostDeclarations],
    ["strictRenderer", expectations.admission.strictRendererDeclarations],
  ]) {
    const result = admission[key];
    const ids = rows.map((row) => row.id);
    if (JSON.stringify(result?.expectedCaseIds) !== JSON.stringify(ids) ||
        JSON.stringify(result?.observedCaseIds) !== JSON.stringify(ids) ||
        result?.rejectedWithoutInitOrRender !== true) {
      throw new Error(`N3 ${key} malformed-profile cases differ from N4 or were not rejected before app/renderer entry`);
    }
  }
  const rejected = check.swap?.rejected;
  const compatible = check.swap?.compatible;
  const expectedMutationControlIds = [
    "rejected-state",
    "rejected-view",
    "rejected-dom",
    "rejected-pending",
    "compatible-state",
    "compatible-view",
    "compatible-dom",
    "compatible-pending",
    "host-option-accessor-construction",
  ];
  const mutationControls = check.capabilityMutationControls;
  const mutationControlIds = Array.isArray(mutationControls) ? mutationControls.map((row) => row.id) : [];
  const mutationControlsValid = check.capabilityMutationControlsDetected === expectedMutationControlIds.length &&
    JSON.stringify(mutationControlIds) === JSON.stringify(expectedMutationControlIds) &&
    mutationControls.every((row) => row.detected === true && typeof row.error === "string" && row.error.length > 0);
  if (rejected?.errorName !== "TypeError" || rejected.diagnostic?.phase !== "admission" ||
      rejected.diagnostic?.oldUnmounted !== false || rejected.diagnostic?.toGeneration !== null ||
      JSON.stringify(rejected.expectedPreserved) !== JSON.stringify(expectations.swap.preservedAfterRejectedSwap) ||
      JSON.stringify(rejected.observedPreserved) !== JSON.stringify(expectations.swap.preservedAfterRejectedSwap) ||
      rejected.rawPreservationVerified !== true || compatible?.rawPreservationVerified !== true ||
      check.swap.oldActiveClickAccepted !== true ||
      JSON.stringify(compatible?.expectedPreserved) !== JSON.stringify(expectations.swap.compatibleSwapPreserves) ||
      JSON.stringify(compatible?.observedPreserved) !== JSON.stringify(expectations.swap.compatibleSwapPreserves) ||
      compatible?.oldRootDetached !== true || check.swap.oldCallbackFencedAfterCommit !== true ||
      check.swap.replyAccepted !== true || check.swap.disabledClickSuppressed !== true || !mutationControlsValid) {
    throw new Error("N3 raw swap preservation, capture mutation controls, or post-commit callback/reply evidence differs from the frozen N4 oracle");
  }
  const expectedEventOrder = [
    "init",
    "click-add-parent",
    "click-request-parent",
    "disabled-request-click-suppressed",
    "reject-incompatible-renderer",
    "old-active-click-after-rejection",
    "compatible-renderer-commit",
    "fence-old-callback-after-commit",
    "deliver-pending-reply",
  ];
  if (JSON.stringify(check.swap.eventOrder) !== JSON.stringify(expectedEventOrder)) {
    throw new Error("N3 capability event order differs from the frozen interaction sequence");
  }
  if (await exists(`${outputPrefix}.failed.json`)) throw new Error("N3 left a failure receipt despite matched status");
  for (const suffix of ["lifecycle.native.json", "lifecycle.direct.json", "lifecycle.browser.json", "lifecycle.check.json", "lifecycle.manifest.json", "lifecycle.run.json", "capability.browser.capture.json", "capability-check.json", "manifest.json", "run.json"]) {
    if (!files.some((row) => row.originalPath.endsWith(`.${suffix}`))) throw new Error(`N3 evidence is missing ${suffix}`);
  }
  receipt.conformance = {
    status: run.status,
    outputPrefix: rel(outputPrefix),
    summary,
    checks: check,
    rawPreservationVerified: {
      rejected: rejected.rawPreservationVerified,
      compatible: compatible.rawPreservationVerified,
    },
    capabilityMutationControlsDetected: check.capabilityMutationControlsDetected,
    capabilityMutationControls: mutationControls.map(({ id, detected, error }) => ({ id, detected, error })),
    manifest: { path: rel(manifestPath), ...await hashPath(manifestPath) },
    run: { path: rel(runPath), ...await hashPath(runPath) },
    nativeTrace: {
      path: rel(nativeTracePath),
      ...await hashPath(nativeTracePath),
      schema: nativeTrace.schema,
      steps: nativeTrace.steps?.length ?? null,
      requestEffects: nativeEffects.filter((effect) => effect.kind === "fixture.request").length,
      cancellationEffects: nativeEffects.filter((effect) => effect.kind === "lifecycle.cancel").length,
    },
    files,
  };
  receipt.checks.push("N3 native/direct/React/DOM traces matched; rejected and compatible swaps passed raw state/view/DOM/pending preservation, and all nine capture mutation controls were detected");
  await saveReceipt();
}

async function runHTTPDemo(react) {
  if (!await exists(demoBuilder) || !await exists(demoSmokeRunner)) throw new Error("N5 HTTP demo build and smoke runners are required");
  const site = join(demoRoot, "site");
  const smokePath = join(demoRoot, "demo-smoke.json");
  const screenshotPath = join(demoRoot, "demo.png");
  await execute("n5-build-http-demo", process.execPath, [demoBuilder, "--compiled", react.outputDir, "--output", site, "--backend", "react"]);
  receipt.demoOutputPinsBeforeSmoke = await hashDirectory(site);
  await saveReceipt();
  await execute("n5-http-demo-smoke", process.execPath, [
    demoSmokeRunner,
    "--demo", site,
    "--output", smokePath,
    "--screenshot", screenshotPath,
    "--port", "0",
  ], { env: { CHROMIUM_PATH: chromiumPath } });
  const smoke = await readJSON(smokePath);
  if (smoke.schema !== "gobi.compiled-capabilities-demo-smoke/v1" || smoke.status !== "passed") {
    throw new Error("N5 HTTP demo smoke did not report its versioned passed result");
  }
  if (smoke.failures?.length || smoke.browserErrors?.length || smoke.consoleErrors?.length || smoke.failedRequests?.length) {
    throw new Error("N5 HTTP demo smoke recorded browser, console, or request failures");
  }
  const requiredAssets = ["/", "/demo.css", "/demo.bundle.mjs"];
  for (const asset of requiredAssets) {
    if (!smoke.requests?.some((request) => request.path === asset && request.status === 200)) {
      throw new Error(`N5 HTTP demo did not record a successful request for ${asset}`);
    }
  }
  if (!Array.isArray(smoke.checks) || smoke.checks.length < 8 ||
      JSON.stringify(smoke.reactVersions) !== JSON.stringify({ react: "19.3.1", reactDOM: "19.3.1" })) {
    throw new Error("N5 HTTP demo did not exercise all eight checks with the locked React/ReactDOM versions");
  }
  const expectedMessages = ["addParent", "requestParent", "addParent", "complete"];
  const expectedDispatchIds = ["dispatch-0001", "dispatch-0002", "dispatch-0003", "dispatch-0004"];
  const finalTicks = smoke.finalTrace?.ticks?.slice(1) ?? [];
  if (JSON.stringify(finalTicks.map((tick) => tick.message?.name ?? null)) !== JSON.stringify(expectedMessages) ||
      JSON.stringify(finalTicks.map((tick) => tick.dispatchId)) !== JSON.stringify(expectedDispatchIds) ||
      !Array.isArray(smoke.finalPending) || smoke.finalPending.length !== 0) {
    throw new Error("N5 final trace, ordered Go actions, or pending-reply state differs from the frozen smoke scenario");
  }
  if (smoke.wasmRequests?.length || (smoke.noWasm && ((smoke.noWasm.wasmRequests?.length ?? 0) !== 0 || (smoke.noWasm.wasmAPIAttempts?.length ?? 0) !== 0))) {
    throw new Error("N5 capability demo used or requested WebAssembly");
  }
  const after = await hashDirectory(site);
  stablePins(receipt.demoOutputPinsBeforeSmoke, after, "N5 static HTTP demo output");
  receipt.demoOutputPinsAfterSmoke = after;
  if (!await exists(screenshotPath)) throw new Error("N5 HTTP demo smoke did not produce its screenshot");
  receipt.demoSmoke = {
    ...smoke,
    result: { path: rel(smokePath), ...await hashPath(smokePath) },
    screenshot: { path: rel(screenshotPath), ...await hashPath(screenshotPath) },
  };
  receipt.checks.push("N5 executable HTTP demo verified compatible mount/swap, atomic rejected swap, recovery, reply delivery, and disabled-action suppression");
  await saveReceipt();
}

async function makeArchive() {
  const directories = ["react", "dom", "demo", "matrix", "logs"];
  const executionSnapshotPath = join(attemptRoot, "execution-before-archive.json");
  if (await exists(executionSnapshotPath)) throw new Error("immutable pre-archive execution snapshot already exists");
  const sourcePinsAtPreArchive = await sourcePins();
  const sourcePinsMatchBeforeArchive = JSON.stringify(receipt.sourceBefore ?? []) === JSON.stringify(sourcePinsAtPreArchive);
  const executionSnapshot = {
    schema: "gobi.compiled-capabilities-execution-before-archive/v1",
    status: "archive_pending",
    archiveStatus: "PENDING",
    archivePending: true,
    acceptanceStatus: "NOT_FINAL",
    finalAcceptance: false,
    createdAt: stamp(),
    attempt: rel(attemptRoot),
    sourceBefore: structuredClone(receipt.sourceBefore ?? []),
    preArchiveSourcePins: structuredClone(sourcePinsAtPreArchive),
    sourcePinsAtEndOfCommandsAndPreArchive: structuredClone(sourcePinsAtPreArchive),
    sourcePinsMatchBeforeArchive,
    toolchainAndDependencies: {
      versions: structuredClone(receipt.versions ?? {}),
      dependencyInstall: structuredClone(receipt.dependencyInstall ?? {}),
    },
    invocation: structuredClone(receipt.invocation),
    executionParameters: structuredClone(receipt.executionParameters),
    environment: structuredClone(receipt.environment),
    commandLedger: structuredClone(receipt.commands ?? []),
    stages: structuredClone(receipt.stages ?? []),
    stageOutcomes: structuredClone(receipt.stages ?? []),
    outcomeBeforeArchive: {
      status: receipt.status,
      outcome: receipt.outcome,
      summary: receipt.summary,
      checks: structuredClone(receipt.checks ?? []),
      failures: structuredClone(receipt.failures ?? []),
    },
    executionReceiptBeforeArchive: structuredClone(receipt),
    archiveBinding: {
      policy: "archive manifest remains outside the tar; the final outer receipt binds its exact SHA-256",
      finalArchiveHash: "PENDING",
    },
  };
  const snapshot = await writeImmutableSnapshot(executionSnapshotPath, executionSnapshot);
  const members = [];
  for (const directory of directories) {
    for (const path of await walk(join(attemptRoot, directory))) {
      members.push({ path: relative(attemptRoot, path).split(sep).join("/"), ...await hashPath(path) });
    }
  }
  members.push({ path: "execution-before-archive.json", bytes: snapshot.byteLength, sha256: hash(snapshot.bytes) });
  const inheritedAttempt = receipt.inheritedLifecycle?.attempt;
  const inheritedArchivePath = receipt.inheritedLifecycle?.archive?.path
    ? join(root, receipt.inheritedLifecycle.archive.path)
    : null;
  if (inheritedArchivePath && await exists(inheritedArchivePath)) {
    const copyPath = join(attemptRoot, "inherited-lifecycle-artifacts.tar.gz");
    await copyFile(inheritedArchivePath, copyPath);
    members.push({ path: "inherited-lifecycle-artifacts.tar.gz", ...await hashPath(copyPath) });
  }
  if (inheritedAttempt) {
    const inheritedReceiptPath = join(root, "compiled-lifecycle/coordination/receipts/E-BUILD.json");
    const inheritedReportPath = join(root, "compiled-lifecycle/coordination/reports/E-BUILD.md");
    for (const source of [inheritedReceiptPath, inheritedReportPath]) {
      if (!await exists(source)) continue;
      const destination = join(attemptRoot, "inherited", source.endsWith(".json") ? "E-BUILD.json" : "E-BUILD.md");
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
      members.push({ path: relative(attemptRoot, destination).split(sep).join("/"), ...await hashPath(destination) });
    }
  }
  members.sort((a, b) => a.path.localeCompare(b.path));
  const archivePath = join(attemptRoot, "capabilities-artifacts.tar.gz");
  const manifestPath = join(attemptRoot, "archive-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify({
    schema: "gobi.compiled-capabilities-archive/v1",
    createdAt: stamp(),
    manifestPolicy: "outside the tar to avoid a manifest self-hash cycle; its exact bytes are SHA-256 bound by the final outer execution receipt",
    members,
  }, null, 2)}\n`);
  const includePaths = [
    ...directories,
    "execution-before-archive.json",
    ...(await exists(join(attemptRoot, "inherited")) ? ["inherited"] : []),
    ...(await exists(join(attemptRoot, "inherited-lifecycle-artifacts.tar.gz")) ? ["inherited-lifecycle-artifacts.tar.gz"] : []),
  ];
  const verifyRoot = join(attemptRoot, "archive-verification");
  const { archive, archivedSnapshot } = await archiveAndVerify({
    attemptRoot,
    archivePath,
    verifyRoot,
    includePaths,
    members,
    execute,
    hashPath,
    readJSON,
  });
  if (archivedSnapshot.schema !== "gobi.compiled-capabilities-execution-before-archive/v1" ||
      archivedSnapshot.archiveStatus !== "PENDING" || archivedSnapshot.archivePending !== true || archivedSnapshot.acceptanceStatus !== "NOT_FINAL" ||
      archivedSnapshot.finalAcceptance !== false ||
      JSON.stringify(archivedSnapshot.sourceBefore) !== JSON.stringify(receipt.sourceBefore ?? []) ||
      JSON.stringify(archivedSnapshot.preArchiveSourcePins) !== JSON.stringify(sourcePinsAtPreArchive) ||
      JSON.stringify(archivedSnapshot.sourcePinsAtEndOfCommandsAndPreArchive) !== JSON.stringify(sourcePinsAtPreArchive)) {
    throw new Error("archived immutable execution snapshot lost pre-archive provenance or pending status");
  }
  receipt.archive = {
    path: rel(archivePath),
    ...archive,
    manifest: { path: rel(manifestPath), ...await hashPath(manifestPath) },
    memberCount: members.length,
    memberBytes: members.reduce((total, row) => total + row.bytes, 0),
    members,
    executionSnapshot: {
      path: rel(executionSnapshotPath),
      ...await hashPath(executionSnapshotPath),
      immutable: true,
      status: archivedSnapshot.status,
      finalAcceptance: archivedSnapshot.finalAcceptance,
    },
    sourcePinsAtPreArchive,
    preArchiveSourcePins: sourcePinsAtPreArchive,
    sourcePinsMatchBeforeArchive,
    manifestPolicy: "outside the tar; exact manifest hash is bound by this final outer receipt",
    roundTripVerified: true,
  };
  if (!sourcePinsMatchBeforeArchive) {
    receipt.status = "failed";
    receipt.summary = "Source pins changed before capability archive creation.";
    receipt.failures.push({ name: "source-pins-prearchive", error: "sourceBefore and pre-archive source pins differ" });
    process.exitCode = 1;
  }
  receipt.checks.push(`capability archive contains ${members.length} hashed build, native, conformance, demo, log, inherited lifecycle, and immutable pre-archive provenance members; extraction round-trip verified`);
  await saveReceipt();
}

async function generateReport() {
  const commands = (receipt.commands ?? []).map((row) =>
    `- \`${row.name}\`: \`${row.command} ${row.args.join(" ")}\` (exit ${row.exitCode}; stdout SHA-256 \`${row.stdoutSha256}\`; stderr SHA-256 \`${row.stderrSha256}\`; logs \`${row.stdoutPath}\`, \`${row.stderrPath}\`)`,
  ).join("\n") || "- None recorded.";
  const versionRows = Object.entries(receipt.versions ?? {}).filter(([, value]) => typeof value === "string" || value === null);
  for (const [group, values] of Object.entries({
    dependencies: receipt.versions?.dependencies,
    lockedDependencies: receipt.versions?.lockedDependencies,
    packageLocks: receipt.versions?.packageLocks,
  })) {
    for (const [name, value] of Object.entries(values ?? {})) versionRows.push([`${group}.${name}`, value]);
  }
  const versions = versionRows.map(([name, value]) => `- ${name}: \`${value ?? "not detected"}\``).join("\n") || "- Versions not fully recorded.";
  const checks = (receipt.checks ?? []).map((line) => `- ${line}`).join("\n") || "- No completed checks.";
  const failures = (receipt.failures ?? []).map((item) => `- ${item.name}: ${item.error}`).join("\n") || "- None recorded.";
  const capabilities = receipt.builds?.react?.component?.capabilities?.join(", ") ?? "not recorded";
  const report = [
    "# E-BUILD (compiled backend capability negotiation)",
    "",
    `**Outcome: ${receipt.outcome}.** ${receipt.summary}`,
    "",
    "## Execution",
    "",
    `- Status: \`${receipt.status}\``,
    `- Attempt: \`${receipt.attempt}\``,
    `- Invocation: \`${receipt.invocation.command}\``,
    `- Started: ${receipt.startedAt}`,
    `- Finished: ${receipt.finishedAt ?? "not finished"}`,
    `- Source pins: ${receipt.sourcePinsMatch === true ? "stable" : receipt.sourcePinsMatch === false ? "changed or mismatched" : "incomplete"} (${receipt.sourceBefore?.length ?? 0} before; ${receipt.sourceAfter?.length ?? 0} after)`,
    "",
    "## Exact commands",
    "",
    commands,
    "",
    "## Toolchains and locked dependencies",
    "",
    versions,
    "",
    "## Checks",
    "",
    checks,
    "",
    "## GoScript backend builds",
    "",
    `- Fixture package: \`${fixturePackage}\``,
    `- React output files: ${receipt.builds?.react?.outputCount ?? "not built"}`,
    `- DOM output files: ${receipt.builds?.dom?.outputCount ?? "not built"}`,
    `- AppIR capabilities: \`${capabilities}\``,
    `- Shared AppIR/encoder across profiles: ${receipt.buildComparison?.appIRByteIdentical === true && receipt.buildComparison?.encoderByteIdentical === true}`,
    "- Raw generated modules are pinned per profile; the runner makes no cross-output raw bundle equality claim.",
    "",
    "## Negotiation and replay evidence",
    "",
    `- Runner acceptance regressions: ${receipt.runnerAcceptanceTests?.status ?? "not run"} (${receipt.runnerAcceptanceTests?.tap?.pass ?? 0}/${receipt.runnerAcceptanceTests?.tap?.tests ?? 0} tests)`,
    `- Inherited lifecycle chain: ${receipt.inheritedLifecycle?.acceptanceEvidence?.status ?? "not passed"} (lifecycle ${receipt.inheritedLifecycle?.status ?? "not passed"}; methods receipt ${receipt.inheritedLifecycle?.methodsReceipt?.sha256 ?? "not bound"}; backend receipt ${receipt.inheritedLifecycle?.backendsReceipt?.sha256 ?? "not bound"}; full mode; stable source pins)`,
    `- Native lifecycle trace: ${receipt.conformance?.nativeTrace?.path ?? "not produced"}`,
    `- N4 literal oracle: ${receipt.oracle?.summary ?? "not run"}`,
    `- N3 direct/native/React/DOM matrix: ${receipt.conformance?.status ?? "not run"}`,
    `- N3 assertion summary: \`${JSON.stringify(receipt.conformance?.checks ?? {})}\``,
    `- N3 raw rejected/compatible swap preservation: ${receipt.conformance?.rawPreservationVerified?.rejected === true && receipt.conformance?.rawPreservationVerified?.compatible === true ? "verified" : "not verified"}; capture mutation controls: ${receipt.conformance?.capabilityMutationControlsDetected ?? 0}/9 detected`,
    `- N5 HTTP demo: ${receipt.demoSmoke?.status ?? "not run"}`,
    `- Evidence archive: ${receipt.archive ? `\`${receipt.archive.path}\` (${receipt.archive.memberCount} members; SHA-256 \`${receipt.archive.sha256}\`; immutable pre-archive snapshot included; manifest SHA-256 \`${receipt.archive.manifest.sha256}\`; round-trip verified)` : "not completed"}`,
    "",
    "## Failures",
    "",
    failures,
    "",
    "## Scope",
    "",
    "The compiled lifecycle fixture proves this bounded typed-Go capability profile across native Go, direct execution, and the shipped React/DOM renderers. Host and renderer capability profiles are separate. Incompatible candidates must be rejected before the active lifecycle is retired; only explicit profiles establish support for the declared capabilities. The actual Go lifecycle view has no value/checked input bindings; synthetic N4 oracle cases independently exercise those renderer requirements.",
    "",
  ].join("\n");
  receipt.report = { path: rel(canonicalReport), sha256: hash(Buffer.from(report)) };
  await Promise.all([
    writeFile(canonicalReport, report),
    writeFile(join(attemptRoot, "report.md"), report),
  ]);
  await saveReceipt();
}

async function main() {
  if (invalidArgs) throw new Error("run-compiled-capabilities.sh accepts no arguments; the full inherited and capability chain always runs");
  if (!process.version.startsWith("v22.")) throw new Error(`Node 22 is required; got ${process.version}`);
  await stage("toolchain-and-dependency-inventory", collectVersions);
  const archiveHelperTests = await stage("archive-helper-startup-regressions", runArchiveHelperTests);
  if (!archiveHelperTests) throw new Error("archive helper startup regressions failed; inherited execution was withheld");
  const m0 = await stage("m0-receipt-and-source-preservation", prepareM0SourcePins);
  if (!m0) throw new Error("M0 source-pin preparation did not pass; inherited execution was withheld");
  receipt.sourceBefore = await sourcePins();
  await saveReceipt();
  const runnerAcceptanceTests = await stage("runner-acceptance-regressions", runRunnerAcceptanceTests);
  if (!runnerAcceptanceTests) throw new Error("runner acceptance regressions failed; inherited execution was withheld");
  await stage("inherited-static-and-interaction-lifecycle", runInheritedLifecycle);
  const react = await stage("react-goscript-build", () => buildProfile("react", reactRoot));
  const dom = await stage("dom-goscript-build", () => buildProfile("dom", domRoot));
  if (react && dom) {
    await stage("backend-build-comparison", () => compareBuilds(react, dom));
    receipt.outputPinsBefore = {
      react: await hashDirectory(react.outputDir),
      dom: await hashDirectory(dom.outputDir),
    };
    await saveReceipt();
  }
  await stage("n4-independent-literal-oracle", runOracle);
  if (react && dom) await stage("n3-compiled-conformance", () => runConformance(react, dom));
  else receipt.failures.push({ name: "n3-compiled-conformance", error: "fresh React and DOM GoScript outputs are required" });
  if (react) await stage("n5-http-demo", () => runHTTPDemo(react));
  else receipt.failures.push({ name: "n5-http-demo", error: "fresh React GoScript output is required" });
  if (react && dom && receipt.outputPinsBefore) {
    await stage("compiled-output-stability", async () => {
      receipt.outputPinsAfter = {
        react: await hashDirectory(react.outputDir),
        dom: await hashDirectory(dom.outputDir),
      };
      stablePins(receipt.outputPinsBefore.react, receipt.outputPinsAfter.react, "React compiler output");
      stablePins(receipt.outputPinsBefore.dom, receipt.outputPinsAfter.dom, "DOM compiler output");
      receipt.checks.push("React and DOM GoScript output trees stayed byte-stable through oracle, conformance, and HTTP demo execution");
      await saveReceipt();
    });
  }
}

try {
  await main();
} catch (error) {
  receipt.status = "failed";
  receipt.outcome = "mixed_change";
  receipt.summary = error instanceof Error ? error.message : String(error);
  if (!receipt.failures.some((row) => row.name === "runner")) receipt.failures.push({ name: "runner", error: receipt.summary });
  process.exitCode = 1;
} finally {
  try {
    await makeArchive();
  } catch (error) {
    receipt.status = "failed";
    receipt.summary = receipt.summary || "Capability evidence archive could not be completed.";
    receipt.failures.push({ name: "archive-finalize", error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
  receipt.finishedAt = stamp();
  try {
    receipt.sourceAfter = await sourcePins();
    const matchesSourceBefore = JSON.stringify(receipt.sourceBefore ?? []) === JSON.stringify(receipt.sourceAfter);
    const matchesPreArchiveSnapshot = receipt.archive?.sourcePinsAtPreArchive
      ? JSON.stringify(receipt.archive.sourcePinsAtPreArchive) === JSON.stringify(receipt.sourceAfter)
      : false;
    receipt.sourcePinsMatch = matchesSourceBefore && matchesPreArchiveSnapshot && receipt.archive?.sourcePinsMatchBeforeArchive === true;
    if (receipt.archive) {
      receipt.archive.sourceAfterMatchesSourceBefore = matchesSourceBefore;
      receipt.archive.sourceAfterMatchesPreArchiveSnapshot = matchesPreArchiveSnapshot;
    }
    if (receipt.sourcePinsMatch !== true) {
      receipt.status = "failed";
      receipt.summary = "Source pins changed during execution or do not match the immutable pre-archive snapshot.";
      receipt.failures.push({
        name: "source-pins",
        error: `sourceAfter must match sourceBefore and the pre-archive snapshot (sourceBefore=${matchesSourceBefore}, snapshot=${matchesPreArchiveSnapshot}, preArchive=${receipt.archive?.sourcePinsMatchBeforeArchive ?? false})`,
      });
      process.exitCode = 1;
    }
  } catch (error) {
    receipt.sourcePinsMatch = false;
    receipt.status = "failed";
    receipt.summary = "Source pins could not be completed after execution.";
    receipt.failures.push({ name: "source-pins-after", error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
  if (receipt.status !== "failed") {
    receipt.status = receipt.failures.length === 0 ? "passed" : "failed";
    receipt.summary = receipt.failures.length === 0
      ? "The inherited static/interaction lifecycle regressions, fresh React and DOM GoScript builds, independent N4 oracle, N3 direct/native/browser capability matrix, and N5 HTTP demo all passed."
      : `${receipt.failures.length} failure(s) were recorded while completing the capability evidence chain.`;
  }
  await saveReceipt();
  try {
    await generateReport();
  } catch (error) {
    receipt.status = "failed";
    receipt.summary = `Report generation failed: ${error instanceof Error ? error.message : String(error)}`;
    receipt.failures.push({ name: "report", error: receipt.summary });
    process.exitCode = 1;
    await saveReceipt();
  }
  applyReceiptExitCode(receipt);
  process.stdout.write(`compiled-capabilities: ${receipt.status} (${receipt.mode})\n`);
}
