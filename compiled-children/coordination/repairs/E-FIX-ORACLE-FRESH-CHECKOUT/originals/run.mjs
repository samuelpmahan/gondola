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
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  archiveAndVerify,
  createExclusiveAttemptDirectory,
  writeImmutableSnapshot,
} from "../compiled-capabilities/archive-helper.mjs";
import { isChromiumVersionOutput } from "./browser-version.mjs";
import { validateInheritedAcceptance } from "./inherited-acceptance.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outputRoot = join(here, "demo/output/attempts");
const packagePath = "github.com/samuelpmahan/gondola/fixtures/compiled/children";
const fixturePath = join(root, "fixtures/compiled/children/scenario.json");
const nativeCommand = join(root, "cmd/compiled-children-native");
const oracleDirectory = join(here, "oracle");
const oracleTest = join(oracleDirectory, "oracle.test.mjs");
const oracleExpectations = join(oracleDirectory, "expectations.json");
const oracleScenario = join(oracleDirectory, "scenario.json");
const oracleModule = join(oracleDirectory, "oracle.mjs");
const harnessRunner = join(here, "conformance/run.mjs");
const hostUnitTest = join(here, "runtime/runtime.test.mjs");
const inheritedAcceptanceTest = join(here, "inherited-acceptance.test.mjs");
const browserVersionModule = join(here, "browser-version.mjs");
const browserVersionTest = join(here, "conformance/browser-version.test.mjs");
const noWasmUnitTest = join(root, "compiled-frontend/conformance/no-wasm.test.mjs");
const swapContractTest = join(here, "conformance/swap-contract.test.mjs");
const demoBuilder = join(here, "demo/build.mjs");
const demoSmoke = join(here, "demo/smoke.mjs");
const archiveVerifier = join(here, "demo/verify-archive.mjs");
const reportPath = join(here, "coordination/reports/E-DELIVERY.md");
const receiptPath = join(here, "coordination/receipts/E-DELIVERY.json");
const ignored = new Set([
  ".git",
  "node_modules",
  "build",
  "builds",
  "artifacts",
  "attempts",
  "evidence",
  "evidence-preflight",
  "output",
  "coordination",
]);
const sourceDirectories = [
  "compiled-children",
  "counter",
  "gobi",
  "reactmap",
  "compilercontract",
  "fixtures/compiled/children",
  "cmd/compiled-children-native",
  "compiled-frontend/analyze",
  "compiled-frontend/build",
  "compiled-frontend/cmd",
  "compiled-frontend/emit",
  "compiled-frontend/conformance",
  "compiled-frontend/semantic",
  "compiled-frontend/frontend/runtime",
  "compiled-frontend/frontend/react",
  "compiled-frontend/frontend/dom",
  "compiled-children/runtime",
  "compiled-children/conformance",
  "compiled-children/oracle",
  "compiled-children/demo",
];
const sourceFiles = [
  "SHA256SUMS",
  "EXPECTED.json",
  "go.mod",
  "package.json",
  "package-lock.json",
  "interaction/package.json",
  "interaction/package-lock.json",
  "compiled-frontend/go.mod",
  "compiled-frontend/go.sum",
  "compiled-frontend/package.json",
  "compiled-frontend/package-lock.json",
  "run.sh",
  "run-typed-composition.sh",
  "run-compiled-frontend.sh",
  "run-compiled-lifecycle.sh",
  "run-compiled-capabilities.sh",
  "run-compiled-children.sh",
  "compiled-frontend/run.mjs",
  "compiled-lifecycle/run.mjs",
  "compiled-capabilities/run.mjs",
  "compiled-capabilities/archive-helper.mjs",
  "compiled-children/CONTRACT.md",
  "compiled-children/PLAN.md",
  "compiled-children/run.mjs",
  "compiled-children/README.md",
  "compiled-children/RESULTS.md",
  "compiled-children/coordination/rawlogs/go.mod",
  "compiled-children/evidence-preflight/go.mod",
  "compiled-children/browser-version.mjs",
  "compiled-children/conformance/browser-version.test.mjs",
  "compiled-children/.gitignore",
  ".github/workflows/gobi-compiled-children.yml",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = () => new Date().toISOString();
const rel = (path) => relative(root, path).split(sep).join("/");
const attemptId = new Date().toISOString().replace(/[-:.]/g, "") + `-${process.pid}`;
const attemptRoot = join(outputRoot, `attempt-${attemptId}`);
const logRoot = join(attemptRoot, "logs");
const args = process.argv.slice(2);
const rootGoEnv = { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" };
const compilerGoEnv = { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" };
let chromiumPath = process.env.CHROMIUM_PATH ?? process.env.CHROMIUM_EXECUTABLE_PATH ?? null;

const receipt = {
  schema: "gobi.compiled-children-execution/v1",
  job_id: "E-DELIVERY",
  worker: "N6",
  mode: "full",
  outcome: "mixed_change",
  status: "running",
  summary: "The E-DELIVERY full attempt is running; no acceptance result is available yet.",
  startedAt: stamp(),
  attempt: rel(attemptRoot),
  invocation: {
    command: "bash run-compiled-children.sh",
    nodeExecutable: process.execPath,
    arguments: args,
  },
  commands: [],
  stages: [],
  checks: [],
  failures: [],
  mismatches: [],
  executionParameters: {
    seed: "fixed frozen fixture; seeded sequence seed is recorded by N4 harness output",
    fixture: rel(fixturePath),
    packagePath,
    compilerInvocation: "GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false go run ./cmd/gobi-build",
    nativeInvocation: "GOTOOLCHAIN=local GOFLAGS=-buildvcs=false go run ./cmd/compiled-children-native --script fixtures/compiled/children/scenario.json",
    inheritedInvocation: "bash run-compiled-capabilities.sh",
  },
  dependencyInstall: {
    commands: [
      "npm ci --no-audit --no-fund",
      "npm ci --prefix interaction --no-audit --no-fund",
      "npm ci --prefix compiled-frontend --no-audit --no-fund",
      "interaction/node_modules/.bin/playwright install --with-deps chromium",
    ],
    execution: "CI installs locked dependencies before the full runner; the runner records lock hashes and installed-versus-locked versions.",
  },
  environment: Object.fromEntries([
    "GOTOOLCHAIN",
    "GOFLAGS",
    "CHROMIUM_PATH",
    "CHROMIUM_EXECUTABLE_PATH",
    "GOBI_SKIP_NPM_CI",
    "GONDOLA_SKIP_NPM_CI",
    "GONDOLA_SKIP_BROWSER_INSTALL",
  ].map((name) => [name, process.env[name] ?? null])),
  outputPaths: {
    report: rel(reportPath),
    receipt: rel(receiptPath),
    attempt: rel(attemptRoot),
  },
  priorEvidenceLimit: {
    acceptedEvidence: "978eaea98831154f8152baa1a64f1d1356916596",
    statement: "The known prior local-container archive corruption remains excluded; its evidence is not copied, repaired, rewritten, or used for this run. The new attempt has independent archive and delivery verification.",
  },
};

await createExclusiveAttemptDirectory(attemptRoot);
await Promise.all([
  ...["logs", "react", "dom", "harness", "oracle", "demo", "inherited"].map((name) =>
    mkdir(join(attemptRoot, name), { recursive: true })),
  mkdir(dirname(reportPath), { recursive: true }),
  mkdir(dirname(receiptPath), { recursive: true }),
  mkdir(join(attemptRoot, "provenance"), { recursive: true }),
]);

const previousDeliveryArtifacts = [];
for (const [source, name] of [[receiptPath, "author-E-DELIVERY.json"], [reportPath, "author-E-DELIVERY.md"]]) {
  if (!await exists(source)) continue;
  const bytes = await readFile(source);
  const path = join(attemptRoot, "provenance", name);
  await writeFile(path, bytes, { flag: "wx", mode: 0o444 });
  previousDeliveryArtifacts.push({ path: rel(path), bytes: bytes.length, sha256: hash(bytes) });
  if (source === receiptPath) {
    try {
      const authorReceipt = JSON.parse(bytes.toString("utf8"));
      const authorAttempt = authorReceipt.authorSmoke?.attemptDirectory;
      if (typeof authorAttempt === "string") {
        const sourceAttempt = resolve(root, authorAttempt);
        const allowedRoot = join(here, "demo/output") + sep;
        if (sourceAttempt.startsWith(allowedRoot) && await exists(sourceAttempt)) {
          const copyRoot = join(attemptRoot, "provenance/author-demo-smoke");
          await copyTree(sourceAttempt, copyRoot);
          const copiedFiles = await walk(copyRoot);
          previousDeliveryArtifacts.push({
            originalPath: rel(sourceAttempt),
            path: rel(copyRoot),
            files: await Promise.all(copiedFiles.map(async (file) => ({ path: rel(file), ...await hashPath(file) }))),
          });
        }
      }
    } catch (error) {
      previousDeliveryArtifacts.push({
        path: rel(path),
        associationError: `author demo evidence association could not be copied: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
if (previousDeliveryArtifacts.length) {
  receipt.previousDeliveryArtifacts = previousDeliveryArtifacts;
  receipt.checks.push("Any prior author E-DELIVERY report and receipt were preserved as read-only attempt provenance before canonical files were updated");
}

async function saveReceipt() {
  const serialized = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  if (serialized.length === 0) throw new Error("E-DELIVERY receipt serialization is empty");
  await writeFile(receiptPath, serialized);
  const written = await readFile(receiptPath);
  if (written.length !== serialized.length || hash(written) !== hash(serialized)) {
    throw new Error("E-DELIVERY receipt bytes differ immediately after write");
  }
}

await saveReceipt();

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
  const paths = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (sourceOnly && ignored.has(entry.name)) continue;
    if (sourceOnly && /\.(?:log|png|tar\.gz)$/i.test(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path, { sourceOnly }));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

async function hashPath(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: hash(bytes) };
}

async function sourcePins() {
  const paths = sourceFiles.map((path) => join(root, path));
  for (const directory of sourceDirectories) paths.push(...await walk(join(root, directory), { sourceOnly: true }));
  const unique = [...new Set(paths)].sort();
  const result = [];
  for (const path of unique) {
    try {
      const info = await stat(path);
      if (info.isFile()) result.push({ path: rel(path), ...await hashPath(path) });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return result;
}

async function verifyRequiredInputs() {
  const required = [
    fixturePath,
    join(nativeCommand, "main.go"),
    join(here, "CONTRACT.md"),
    browserVersionModule,
    browserVersionTest,
    join(here, "inherited-acceptance.mjs"),
    inheritedAcceptanceTest,
    join(here, "coordination/rawlogs/go.mod"),
    join(here, "evidence-preflight/go.mod"),
    join(here, "runtime/runtime.mjs"),
    hostUnitTest,
    noWasmUnitTest,
    swapContractTest,
    harnessRunner,
    oracleTest,
    oracleExpectations,
    oracleScenario,
    oracleModule,
    demoBuilder,
    demoSmoke,
    archiveVerifier,
  ];
  const absent = [];
  for (const path of required) if (!await exists(path)) absent.push(rel(path));
  if (absent.length) throw new Error(`required frozen child-collection inputs are missing: ${absent.join(", ")}`);
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
    stdoutPath: rel(join(logRoot, `${name}.stdout.log`)),
    stderrPath: rel(join(logRoot, `${name}.stderr.log`)),
  };
  receipt.commands.push(entry);
  return { child, stdout, stderr, entry };
}

async function execute(name, command, commandArgs, options = {}) {
  const result = runCommand(name, command, commandArgs, options);
  await Promise.all([
    writeFile(join(logRoot, `${name}.stdout.log`), result.stdout),
    writeFile(join(logRoot, `${name}.stderr.log`), result.stderr),
  ]);
  await saveReceipt();
  if (result.child.status !== 0 || result.child.error) {
    const message = result.child.error?.message ?? (result.stderr.trim() || `${name} exited ${result.child.status}`);
    const failure = {
      name,
      error: message,
      exitCode: result.child.status,
      signal: result.child.signal,
      stdoutSha256: result.entry.stdoutSha256,
      stderrSha256: result.entry.stderrSha256,
    };
    receipt.failures.push(failure);
    await saveReceipt();
    throw new Error(`${name} failed; retained logs: ${result.entry.stdoutPath} and ${result.entry.stderrPath}`);
  }
  return result.stdout;
}

async function stage(name, operation) {
  const record = { name, status: "running", startedAt: stamp() };
  receipt.stages.push(record);
  await saveReceipt();
  try {
    const value = await operation();
    record.status = "passed";
    record.finishedAt = stamp();
    await saveReceipt();
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record.status = "failed";
    record.finishedAt = stamp();
    record.error = message;
    receipt.failures.push({ name: `stage:${name}`, error: message });
    await saveReceipt();
    process.stderr.write(`${name}: ${message}\n`);
    return null;
  }
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function collectVersions() {
  if (!chromiumPath && await exists("/tmp/chromium")) chromiumPath = "/tmp/chromium";
  if (!chromiumPath) {
    const playwright = await import(pathToFileURL(join(root, "interaction/node_modules/playwright/index.mjs")).href);
    chromiumPath = playwright.chromium.executablePath();
  }
  if (!chromiumPath) throw new Error("CHROMIUM_PATH or an installed Playwright Chromium executable is required");
  if (!await exists(chromiumPath)) throw new Error(`configured Chromium executable does not exist: ${chromiumPath}`);
  receipt.environment.resolvedChromiumPath = chromiumPath;
  const versions = {
    node: process.version,
    npm: (await execute("version-npm", "npm", ["--version"])).trim(),
    rootGo: (await execute("version-root-go", "go", ["version"], { env: rootGoEnv })).trim(),
    compilerGo: (await execute("version-compiler-go", "go", ["version"], { env: compilerGoEnv })).trim(),
    chromium: (await execute("version-chromium", chromiumPath, ["--version"])).trim(),
    dependencies: {},
    lockHashes: {},
  };
  for (const [name, value] of Object.entries(versions)) {
    if (typeof value === "string" && value.trim().length === 0) throw new Error(`${name} version output is empty`);
  }
  if (!versions.node.startsWith("v22.")) throw new Error(`Node 22 required; got ${versions.node}`);
  if (!versions.rootGo.includes("go1.24.")) throw new Error(`root Go 1.24 required; got ${versions.rootGo}`);
  if (!versions.compilerGo.includes("go1.27.3")) throw new Error(`compiler Go 1.27.3 required; got ${versions.compilerGo}`);
  if (!isChromiumVersionOutput(versions.chromium)) throw new Error(`Chromium version output is empty or invalid: ${versions.chromium}`);
  for (const [name, path] of Object.entries({
    react: "interaction/node_modules/react/package.json",
    reactDOM: "interaction/node_modules/react-dom/package.json",
    playwright: "interaction/node_modules/playwright/package.json",
    esbuild: "interaction/node_modules/esbuild/package.json",
    frontendEsbuild: "compiled-frontend/node_modules/esbuild/package.json",
  })) versions.dependencies[name] = (await readJSON(join(root, path))).version;
  const locked = {
    react: ["interaction/package-lock.json", "node_modules/react"],
    reactDOM: ["interaction/package-lock.json", "node_modules/react-dom"],
    playwright: ["interaction/package-lock.json", "node_modules/playwright"],
    esbuild: ["interaction/package-lock.json", "node_modules/esbuild"],
    frontendEsbuild: ["compiled-frontend/package-lock.json", "node_modules/esbuild"],
  };
  versions.lockedDependencies = {};
  for (const [name, [lockPath, packagePathInLock]] of Object.entries(locked)) {
    const lock = await readJSON(join(root, lockPath));
    const version = lock.packages?.[packagePathInLock]?.version;
    if (typeof version !== "string") throw new Error(`${lockPath} does not pin ${packagePathInLock}`);
    versions.lockedDependencies[name] = version;
    if (versions.dependencies[name] !== version) {
      throw new Error(`${name} installed ${versions.dependencies[name]} differs from lockfile ${version}`);
    }
  }
  if (versions.dependencies.react !== "19.3.1" || versions.dependencies.reactDOM !== "19.3.1") {
    throw new Error(`React and ReactDOM 19.3.1 required; got ${versions.dependencies.react}/${versions.dependencies.reactDOM}`);
  }
  for (const path of ["package-lock.json", "interaction/package-lock.json", "compiled-frontend/package-lock.json"]) {
    versions.lockHashes[path] = hash(await readFile(join(root, path)));
  }
  receipt.versions = versions;
  receipt.checks.push("Go 1.24, compiler Go 1.27.3, Node 22, Chromium, React 19.3.1, dependency versions, and all existing npm lock hashes were verified");
  await saveReceipt();
}

async function verifyInheritedRun() {
  const inheritedReceiptPath = join(root, "compiled-capabilities/coordination/receipts/E-BUILD.json");
  const inheritedReportPath = join(root, "compiled-capabilities/coordination/reports/E-BUILD.md");
  const inherited = await readJSON(inheritedReceiptPath);
  const inheritedBytes = await readFile(inheritedReceiptPath);
  const reportBytes = await readFile(inheritedReportPath);
  const attemptRelative = inherited.attempt;
  if (typeof attemptRelative !== "string" ||
      !/^compiled-capabilities\/builds\/attempts\/attempt-\d{8}T\d{9}Z$/.test(attemptRelative)) {
    throw new Error("fresh inherited receipt has an invalid attempt path");
  }
  const inheritedAttemptRoot = resolve(root, attemptRelative);
  const attemptRootPrefix = join(root, "compiled-capabilities/builds/attempts") + sep;
  if (!inheritedAttemptRoot.startsWith(attemptRootPrefix)) {
    throw new Error("fresh inherited attempt path escapes the compiled-capabilities attempts directory");
  }
  const archivePath = join(inheritedAttemptRoot, "capabilities-artifacts.tar.gz");
  const manifestPath = join(inheritedAttemptRoot, "archive-manifest.json");
  const executionSnapshotPath = join(inheritedAttemptRoot, "execution-before-archive.json");
  const invocationStartedAt = receipt.executionParameters.inheritedInvocationStartedAt;
  const [archiveBytes, manifestBytes, executionSnapshotBytes, currentSourcePins] = await Promise.all([
    readFile(archivePath),
    readFile(manifestPath),
    readFile(executionSnapshotPath),
    readCurrentInheritedSourcePins(inherited.sourceBefore),
  ]);
  const acceptance = validateInheritedAcceptance({
    receipt: inherited,
    invocationStartedAt,
    currentSourcePins,
    artifacts: {
      report: { path: rel(inheritedReportPath), bytes: reportBytes },
      archive: { path: rel(archivePath), bytes: archiveBytes },
      manifest: { path: rel(manifestPath), bytes: manifestBytes },
      executionSnapshot: { path: rel(executionSnapshotPath), bytes: executionSnapshotBytes },
    },
  });
  const copyRoot = join(attemptRoot, "inherited");
  await mkdir(join(copyRoot, "compiled-capabilities"), { recursive: true });
  await copyFile(inheritedReceiptPath, join(copyRoot, "compiled-capabilities/E-BUILD.json"));
  await copyFile(inheritedReportPath, join(copyRoot, "compiled-capabilities/E-BUILD.md"));
  let attemptCopy = null;
  if (typeof inherited.attempt === "string") {
    const original = resolve(root, inherited.attempt);
    if (!original.startsWith(root + sep) || !await exists(original)) throw new Error("inherited attempt path is invalid or missing");
    attemptCopy = join(copyRoot, "compiled-capabilities/attempt");
    await copyTree(original, attemptCopy);
  }
  receipt.inherited = {
    command: "bash run-compiled-capabilities.sh",
    receipt: { path: rel(inheritedReceiptPath), bytes: inheritedBytes.length, sha256: hash(inheritedBytes) },
    report: acceptance.report,
    archive: acceptance.archive,
    manifest: acceptance.manifest,
    executionSnapshot: acceptance.executionSnapshot,
    status: inherited.status,
    mode: inherited.mode,
    startedAt: inherited.startedAt,
    finishedAt: inherited.finishedAt,
    sourcePinsMatch: inherited.sourcePinsMatch,
    sourcePinCount: acceptance.sourcePinCount,
    attempt: inherited.attempt ?? null,
    copiedAttempt: attemptCopy ? rel(attemptCopy) : null,
    failureCount: inherited.failures.length,
    acceptance,
  };
  receipt.checks.push("fresh inherited E-BUILD passed the invocation-window, finish-time, actual current-source, immutable pre-archive snapshot, report, archive, manifest, and full lifecycle-command checks");
  await saveReceipt();
}

async function readCurrentInheritedSourcePins(sourcePins) {
  if (!Array.isArray(sourcePins) || sourcePins.length === 0) {
    throw new Error("inherited E-BUILD sourceBefore pins are missing");
  }
  const actual = [];
  for (const item of sourcePins) {
    if (!item || typeof item.path !== "string" || item.path.includes("\\") || item.path.startsWith("/")) {
      throw new Error("inherited E-BUILD contains an invalid source pin path");
    }
    const path = resolve(root, item.path);
    if (!path.startsWith(root + sep) || rel(path) !== item.path) {
      throw new Error(`inherited E-BUILD source pin escapes the workspace: ${item.path}`);
    }
    const bytes = await readFile(path);
    actual.push({ path: item.path, bytes: bytes.length, sha256: hash(bytes) });
  }
  return actual;
}

async function preserveFreshInheritedFailure() {
  const receiptPathInChain = join(root, "compiled-capabilities/coordination/receipts/E-BUILD.json");
  const reportPathInChain = join(root, "compiled-capabilities/coordination/reports/E-BUILD.md");
  if (!await exists(receiptPathInChain)) return;
  let inherited;
  let bytes;
  try {
    bytes = await readFile(receiptPathInChain);
    inherited = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    receipt.inheritedFailureEvidence = { status: "unreadable", error: error instanceof Error ? error.message : String(error) };
    await saveReceipt();
    return;
  }
  const inheritedStarted = Date.parse(inherited.startedAt);
  const invocationStarted = Date.parse(receipt.executionParameters.inheritedInvocationStartedAt);
  if (!Number.isFinite(inheritedStarted) || !Number.isFinite(invocationStarted) || inheritedStarted < invocationStarted) return;
  const evidenceRoot = join(attemptRoot, "inherited/failed-full-capabilities");
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(join(evidenceRoot, "E-BUILD.json"), bytes, { flag: "wx" });
  let copiedReport = null;
  if (await exists(reportPathInChain)) {
    const reportBytes = await readFile(reportPathInChain);
    if (inherited.report?.sha256 === hash(reportBytes) && inherited.report?.bytes === reportBytes.length) {
      const destination = join(evidenceRoot, "E-BUILD.md");
      await copyFile(reportPathInChain, destination);
      copiedReport = { path: rel(destination), bytes: reportBytes.length, sha256: hash(reportBytes) };
    }
  }
  let attemptCopy = null;
  if (typeof inherited.attempt === "string") {
    const source = resolve(root, inherited.attempt);
    if (source.startsWith(root + sep) && await exists(source)) {
      attemptCopy = join(evidenceRoot, "attempt");
      await copyTree(source, attemptCopy);
    }
  }
  receipt.inheritedFailureEvidence = {
    status: inherited.status ?? "unknown",
    startedAt: inherited.startedAt ?? null,
    finishedAt: inherited.finishedAt ?? null,
    receipt: { path: rel(join(evidenceRoot, "E-BUILD.json")), bytes: bytes.length, sha256: hash(bytes) },
    report: copiedReport,
    failureCount: Array.isArray(inherited.failures) ? inherited.failures.length : null,
    attempt: inherited.attempt ?? null,
    copiedAttempt: attemptCopy ? rel(attemptCopy) : null,
  };
  await saveReceipt();
}

async function runInheritedFullChain() {
  receipt.executionParameters.inheritedInvocationStartedAt = stamp();
  await saveReceipt();
  try {
    await execute("inherited-full-capabilities", "bash", [join(root, "run-compiled-capabilities.sh")], { env: rootGoEnv });
    await verifyInheritedRun();
    return true;
  } catch (error) {
    await preserveFreshInheritedFailure();
    throw error;
  }
}

async function copyTree(source, destination) {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else if (entry.isFile()) await copyFile(from, to);
  }
}

function resolveOutput(outputDir, path) {
  if (typeof path !== "string" || !path || path.startsWith("/")) throw new Error(`invalid GoScript output path ${path}`);
  const full = resolve(outputDir, path);
  if (!full.startsWith(resolve(outputDir) + sep)) throw new Error(`GoScript output escapes output directory: ${path}`);
  return full;
}

async function pinOutputs(outputDir, outputs) {
  if (!Array.isArray(outputs) || outputs.length === 0) throw new Error("GoScript BuildResult output inventory is empty");
  const rows = [];
  const seen = new Set();
  for (const item of outputs) {
    if (!item || typeof item.path !== "string" || seen.has(item.path)) throw new Error("BuildResult has invalid or duplicate output path");
    seen.add(item.path);
    const bytes = await readFile(resolveOutput(outputDir, item.path));
    const row = { path: item.path, bytes: bytes.length, sha256: hash(bytes) };
    if (item.bytes !== row.bytes || item.sha256 !== row.sha256) throw new Error(`BuildResult pin mismatch for ${item.path}`);
    rows.push(row);
  }
  const physical = (await walk(outputDir)).map((path) => relative(outputDir, path).split(sep).join("/")).sort();
  if (JSON.stringify(physical) !== JSON.stringify(rows.map(({ path }) => path).sort())) {
    throw new Error("physical React/DOM output set differs from GoScript BuildResult inventory");
  }
  return rows;
}

async function buildBackend(backend) {
  const backendRoot = join(attemptRoot, backend);
  const outputDir = join(backendRoot, "output");
  const requestPath = join(backendRoot, "request.json");
  const resultPath = join(backendRoot, "result.json");
  await mkdir(outputDir, { recursive: true });
  const request = {
    schema: "gobi.build-request/v1",
    sourceRoot: root,
    entryPackages: [packagePath],
    backend,
    outputDir,
  };
  const requestText = `${JSON.stringify(request, null, 2)}\n`;
  await writeFile(requestPath, requestText);
  const output = await execute(`compile-${backend}-goscript`, "go", ["run", "./cmd/gobi-build"], {
    cwd: join(root, "compiled-frontend"),
    input: requestText,
    env: compilerGoEnv,
  });
  const result = JSON.parse(output);
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  if (result.schema !== "gobi.build-result/v1" || result.ok !== true || result.diagnostics?.length || result.apps?.length !== 1) {
    throw new Error(`${backend} actual GoScript CLI build did not return exactly one clean compiled children app`);
  }
  const manifestPath = join(outputDir, "buildmanifest.json");
  const manifest = await readJSON(manifestPath);
  if (manifest.apps?.length !== 1) throw new Error(`${backend} manifest must contain one app`);
  const app = manifest.apps[0];
  if (app.packagePath !== packagePath || app.backend !== backend) throw new Error(`${backend} manifest app identity is incorrect`);
  const paths = Object.fromEntries(["appIR", "module", "encoder"].map((key) => [key, resolveOutput(outputDir, app[key])]));
  const appIR = await readJSON(paths.appIR);
  const component = appIR.components?.find((value) => value.packagePath === packagePath);
  if (!component || component.id !== packagePath) throw new Error(`${backend} AppIR component ID differs from package path`);
  for (const requirement of ["view.node", "effect.request-reply", "effect.cancel"]) {
    if (!component.capabilities?.includes(requirement)) throw new Error(`${backend} AppIR is missing ${requirement}`);
  }
  const outputs = await pinOutputs(outputDir, result.outputs);
  const record = {
    backend,
    request: { path: rel(requestPath), ...await hashPath(requestPath) },
    result: { path: rel(resultPath), ...await hashPath(resultPath) },
    manifest: { path: rel(manifestPath), ...await hashPath(manifestPath) },
    packagePath: app.packagePath,
    componentId: component.id,
    capabilities: component.capabilities,
    paths: app,
    outputCount: outputs.length,
    outputs,
    appIR: { path: rel(paths.appIR), ...await hashPath(paths.appIR) },
    module: { path: rel(paths.module), ...await hashPath(paths.module) },
    encoder: { path: rel(paths.encoder), ...await hashPath(paths.encoder) },
  };
  await writeFile(join(backendRoot, "build-record.json"), `${JSON.stringify(record, null, 2)}\n`);
  receipt.builds ??= {};
  receipt.builds[backend] = record;
  receipt.checks.push(`${backend} collection fixture compiled through go run ./cmd/gobi-build and every BuildResult output hash was verified`);
  await saveReceipt();
  return { backend, backendRoot, outputDir, manifest, app, paths, appIR, component, outputs, record };
}

async function compareBuilds(react, dom) {
  if (JSON.stringify(react.record.capabilities) !== JSON.stringify(dom.record.capabilities)) {
    throw new Error("React and DOM AppIR capability declarations differ");
  }
  if (Buffer.compare(await readFile(react.paths.appIR), await readFile(dom.paths.appIR)) !== 0 ||
      Buffer.compare(await readFile(react.paths.encoder), await readFile(dom.paths.encoder)) !== 0) {
    throw new Error("React and DOM GoScript AppIR or encoder outputs differ");
  }
  const reactPaths = react.outputs.map(({ path }) => path).sort();
  const domPaths = dom.outputs.map(({ path }) => path).sort();
  if (JSON.stringify(reactPaths) !== JSON.stringify(domPaths)) throw new Error("React and DOM output path sets differ");
  receipt.buildComparison = {
    appIRByteIdentical: true,
    encoderByteIdentical: true,
    outputPathsIdentical: true,
    reactOutputCount: react.outputs.length,
    domOutputCount: dom.outputs.length,
    backendSpecificModuleHashes: { react: react.record.module, dom: dom.record.module },
  };
  receipt.checks.push("React and DOM builds share byte-identical AppIR, encoder, and output path inventory");
  await saveReceipt();
}

function tapSummary(output) {
  return Object.fromEntries(["tests", "pass", "fail", "cancelled", "skipped", "todo"].map((name) => {
    const match = output.match(new RegExp(`^# ${name} (\\d+)$`, "m"));
    return [name, match ? Number(match[1]) : null];
  }));
}

function hasObservableClearGuardCoverage(coverage) {
  return coverage && ["complete", "absent"].includes(coverage.status) &&
    Array.isArray(coverage.failures) && coverage.failures.length === 0;
}

async function runOracle() {
  const output = await execute("n5-independent-literal-oracle", process.execPath, ["--test", oracleTest]);
  const tap = tapSummary(output);
  if (tap.tests === null || tap.pass === null || tap.pass < 1 || tap.fail !== 0 || tap.cancelled !== 0 || tap.skipped !== 0 || tap.todo !== 0) {
    throw new Error(`N5 literal oracle did not report a clean Node TAP summary: ${JSON.stringify(tap)}`);
  }
  const expectations = await readJSON(oracleExpectations);
  for (const [source, name] of [
    [oracleTest, "oracle.test.mjs"],
    [oracleExpectations, "expectations.json"],
    [oracleScenario, "scenario.json"],
    [oracleModule, "oracle.mjs"],
    [fixturePath, "native-fixture.json"],
  ]) await copyFile(source, join(attemptRoot, "oracle", name));
  receipt.oracle = {
    test: { path: rel(oracleTest), ...await hashPath(oracleTest) },
    expectations: { path: rel(oracleExpectations), ...await hashPath(oracleExpectations) },
    stdoutPath: rel(join(logRoot, "n5-independent-literal-oracle.stdout.log")),
    stderrPath: rel(join(logRoot, "n5-independent-literal-oracle.stderr.log")),
    summary: `Node test runner: ${tap.pass}/${tap.tests} passed`,
    tap,
    schema: expectations.schema ?? null,
    seed: expectations.seed ?? expectations.sequence?.seed ?? null,
    archivedInputs: await Promise.all(["oracle.test.mjs", "expectations.json", "scenario.json", "oracle.mjs", "native-fixture.json"].map(async (name) => ({
      path: rel(join(attemptRoot, "oracle", name)),
      ...await hashPath(join(attemptRoot, "oracle", name)),
    }))),
  };
  receipt.checks.push("N5's independent literal scenario expectations and negative checker controls passed");
  await saveReceipt();
  return expectations;
}

async function runNewUnitTests() {
  const conformanceTests = (await walk(join(here, "conformance"))).filter((path) => path.endsWith(".test.mjs"));
  const testNames = new Set(conformanceTests.map((path) => basename(path)));
  if (!testNames.has("check.test.mjs") || !testNames.has("seeded.test.mjs")) {
    throw new Error("N5 must provide N4 conformance/check.test.mjs and seeded.test.mjs before full acceptance");
  }
  const requiredUnitTests = [hostUnitTest, inheritedAcceptanceTest, browserVersionTest, noWasmUnitTest, swapContractTest];
  const missing = [];
  for (const path of requiredUnitTests) if (!await exists(path)) missing.push(rel(path));
  if (missing.length) throw new Error(`required host, inherited-gate, browser-version, no-WASM, or swap-contract tests are missing: ${missing.join(", ")}`);
  if (!testNames.has(basename(swapContractTest))) {
    throw new Error("N6 conformance/swap-contract.test.mjs must participate in full acceptance");
  }
  const testFiles = [...new Set([...requiredUnitTests, ...conformanceTests])].sort();
  const output = await execute("new-host-and-harness-unit-tests", process.execPath, ["--test", ...testFiles]);
  const tap = tapSummary(output);
  if (tap.tests === null || tap.pass === null || tap.pass < 1 || tap.fail !== 0 || tap.cancelled !== 0 || tap.skipped !== 0 || tap.todo !== 0) {
    throw new Error(`new host and harness unit tests did not report a clean TAP summary: ${JSON.stringify(tap)}`);
  }
  receipt.unitTests = {
    status: "passed",
    files: await Promise.all(testFiles.map(async (path) => ({ path: rel(path), ...await hashPath(path) }))),
    stdoutPath: rel(join(logRoot, "new-host-and-harness-unit-tests.stdout.log")),
    stderrPath: rel(join(logRoot, "new-host-and-harness-unit-tests.stderr.log")),
    tap,
  };
  receipt.checks.push(`new N3 host, inherited-gate, shared no-WASM, and N4/N6 conformance tests passed under Node 22 (${tap.pass}/${tap.tests})`);
  await saveReceipt();
}

async function runHarness(react, dom, expectations) {
  const outputPrefix = join(attemptRoot, "harness/run");
  const nativeGo = process.env.GOBI_GO_BIN ?? process.env.GOBI_GO_EXECUTABLE ??
    (await exists("/tmp/gondola-go/bin/go1.24") ? "/tmp/gondola-go/bin/go1.24" :
      await exists("/tmp/gondola-go/bin/go") ? "/tmp/gondola-go/bin/go" : "go");
  receipt.executionParameters.nativeGoExecutable = nativeGo;
  await saveReceipt();
  const commandArgs = [
    harnessRunner,
    "--native-go", nativeGo,
    "--fixture", fixturePath,
    "--expectations", oracleExpectations,
    "--react-manifest", join(react.outputDir, "buildmanifest.json"),
    "--dom-manifest", join(dom.outputDir, "buildmanifest.json"),
    "--chromium", chromiumPath,
    "--output", outputPrefix,
  ];
  let output;
  try {
    output = await execute("n4-native-direct-browser-harness", process.execPath, commandArgs, {
      env: { CHROMIUM_PATH: chromiumPath },
    });
  } catch (error) {
    const stdoutPath = join(logRoot, "n4-native-direct-browser-harness.stdout.log");
    const stderrPath = join(logRoot, "n4-native-direct-browser-harness.stderr.log");
    const stdout = await readFile(stdoutPath, "utf8").catch(() => "");
    const line = stdout.trim().split("\n").at(-1);
    let summary = null;
    if (line) {
      try { summary = JSON.parse(line); } catch { /* raw logs remain authoritative when there is no JSON summary */ }
    }
    receipt.harnessFailure = {
      outputPrefix: rel(outputPrefix),
      summary,
      stdout: { path: rel(stdoutPath), ...await hashPath(stdoutPath).catch(() => ({ bytes: 0, sha256: null })) },
      stderr: { path: rel(stderrPath), ...await hashPath(stderrPath).catch(() => ({ bytes: 0, sha256: null })) },
      error: error instanceof Error ? error.message : String(error),
    };
    const mismatchValue = summary?.mismatches ?? summary?.failures ?? summary?.failure ?? null;
    if (mismatchValue !== null) receipt.mismatches.push({ source: "N4", value: structuredClone(mismatchValue) });
    await saveReceipt();
    throw error;
  }
  const line = output.trim().split("\n").at(-1);
  if (!line) throw new Error("N4 harness returned no JSON summary");
  const summary = JSON.parse(line);
  if (summary.schema !== "gobi.compiled-children-conformance-check/v1" || summary.status !== "matched") {
    receipt.mismatches.push({ source: "N4", schema: summary.schema ?? null, status: summary.status ?? null, details: summary.mismatches ?? summary.failures ?? null });
    await saveReceipt();
    throw new Error(`N4 native/direct/React/DOM conformance status was ${summary.status}`);
  }
  const expectedBrowserEvidencePath = `${outputPrefix}.browser.json`;
  if (typeof summary.outputPaths?.browser !== "string" ||
      resolve(summary.outputPaths.browser) !== resolve(expectedBrowserEvidencePath)) {
    throw new Error("N4 matched summary does not bind the mounted-browser evidence path");
  }
  const browserEvidence = await readJSON(expectedBrowserEvidencePath);
  const browserGuardCoverage = browserEvidence.noWasm?.guardCoverage;
  if (!hasObservableClearGuardCoverage(browserGuardCoverage)) {
    throw new Error("N4 mounted browser noWasm.guardCoverage must report complete or absent status with no failures");
  }
  if (!Number.isSafeInteger(summary.seededRuns?.count) || summary.seededRuns.count < 1 ||
      !Array.isArray(summary.seededRuns.seeds) || summary.seededRuns.seeds.length !== summary.seededRuns.count) {
    throw new Error("N4 harness summary must record a nonempty exact seed list");
  }
  const candidateFiles = await walk(join(attemptRoot, "harness"));
  receipt.harness = {
    status: summary.status,
    seeds: summary.seededRuns.seeds,
    seededRunCount: summary.seededRuns.count,
    browserNoWasmGuardCoverage: browserGuardCoverage,
    summary,
    outputPrefix: rel(outputPrefix),
    files: await Promise.all(candidateFiles.map(async (path) => ({ path: rel(path), ...await hashPath(path) }))),
    stdoutPath: rel(join(logRoot, "n4-native-direct-browser-harness.stdout.log")),
    stderrPath: rel(join(logRoot, "n4-native-direct-browser-harness.stderr.log")),
  };
  receipt.checks.push("N4 real native, direct-compiled, React, and DOM replay matched state, view tree, DOM order, swaps, pending replies, disabled behavior, and stale-generation rejection");
  await saveReceipt();
}

async function buildAndSmokeDemo(react) {
  const site = join(attemptRoot, "demo/site");
  const buildOutput = await execute("build-http-demo", process.execPath, [
    demoBuilder,
    "--compiled", react.outputDir,
    "--output", site,
    "--backend", "react",
  ]);
  const buildLine = buildOutput.trim().split("\n").at(-1);
  if (!buildLine) throw new Error("HTTP demo builder returned empty BuildResult output");
  const buildResult = JSON.parse(buildLine);
  const buildRecord = await readJSON(join(site, "demo-build.json"));
  if (buildResult.schema !== "gobi.compiled-children-demo-build-result/v1" || buildResult.status !== "passed" ||
      buildRecord.schema !== "gobi.compiled-children-demo-build/v1" || buildRecord.output.bytes <= 0 || !buildRecord.output.sha256) {
    throw new Error("HTTP demo builder did not return a nonempty, hash-bound full BuildResult");
  }
  const smokePath = join(attemptRoot, "demo/smoke.json");
  const screenshotPath = join(attemptRoot, "demo/screenshot.png");
  try {
    await execute("http-browser-smoke", process.execPath, [
      demoSmoke,
      "--demo", site,
      "--output", smokePath,
      "--screenshot", screenshotPath,
      "--chromium", chromiumPath,
      "--port", "0",
    ], { env: { CHROMIUM_PATH: chromiumPath } });
  } catch (error) {
    let failedSmoke = null;
    if (await exists(smokePath)) {
      try { failedSmoke = await readJSON(smokePath); } catch { /* preserve corrupt raw bytes in the attempt */ }
    }
    const failure = {
      status: failedSmoke?.status ?? "command-failed",
      smoke: await exists(smokePath) ? { path: rel(smokePath), ...await hashPath(smokePath) } : null,
      checks: failedSmoke?.checks ?? [],
      browserErrors: failedSmoke?.browserErrors ?? [],
      consoleErrors: failedSmoke?.consoleErrors ?? [],
      failedRequests: failedSmoke?.failedRequests ?? [],
      webAssemblyRequests: failedSmoke?.webAssemblyRequests ?? null,
      webAssemblyApiCalls: failedSmoke?.webAssemblyApiCalls ?? null,
      wasmGuardCoverage: failedSmoke?.wasmGuardCoverage ?? null,
      error: error instanceof Error ? error.message : String(error),
    };
    receipt.demoFailure = failure;
    const failedChecks = failure.checks.filter((check) => check.status === "failed" || check.passed === false);
    if (failedChecks.length || failure.browserErrors.length || failure.consoleErrors.length || failure.failedRequests.length) {
      receipt.mismatches.push({ source: "HTTP-demo-smoke", failedChecks, browserErrors: failure.browserErrors, consoleErrors: failure.consoleErrors, failedRequests: failure.failedRequests });
    }
    await saveReceipt();
    throw error;
  }
  const smoke = await readJSON(smokePath);
  const failedChecks = Array.isArray(smoke.checks)
    ? smoke.checks.filter((check) => check?.passed !== true)
    : [];
  const problems = [];
  if (smoke.status !== "passed" || !Array.isArray(smoke.checks) || smoke.checks.length === 0) {
    problems.push("HTTP demo smoke did not produce a nonempty passed check ledger");
  }
  if (!hasObservableClearGuardCoverage(smoke.wasmGuardCoverage)) {
    problems.push("HTTP demo smoke WebAssembly guard coverage must report complete or absent status with no failures");
  }
  if (failedChecks.length) problems.push(`${failedChecks.length} browser/endpoint check(s) failed`);
  if (smoke.webAssemblyRequests !== 0 || smoke.webAssemblyApiCalls !== 0 || smoke.browserErrors?.length || smoke.consoleErrors?.length) {
    problems.push("HTTP demo recorded browser errors or WebAssembly use");
  }
  if (problems.length) {
    receipt.demoFailure = {
      status: smoke.status ?? "unknown",
      smoke: { path: rel(smokePath), ...await hashPath(smokePath) },
      checks: smoke.checks ?? [],
      browserErrors: smoke.browserErrors ?? [],
      consoleErrors: smoke.consoleErrors ?? [],
      failedRequests: smoke.failedRequests ?? [],
      webAssemblyRequests: smoke.webAssemblyRequests ?? null,
      webAssemblyApiCalls: smoke.webAssemblyApiCalls ?? null,
      wasmGuardCoverage: smoke.wasmGuardCoverage ?? null,
      error: problems.join("; "),
    };
    receipt.mismatches.push({
      source: "HTTP-demo-smoke",
      status: smoke.status ?? null,
      failedChecks,
      browserErrors: smoke.browserErrors ?? [],
      consoleErrors: smoke.consoleErrors ?? [],
      failedRequests: smoke.failedRequests ?? [],
      webAssemblyRequests: smoke.webAssemblyRequests ?? null,
      webAssemblyApiCalls: smoke.webAssemblyApiCalls ?? null,
      wasmGuardCoverage: smoke.wasmGuardCoverage ?? null,
    });
    await saveReceipt();
    throw new Error(problems.join("; "));
  }
  receipt.demo = {
    status: smoke.status,
    smoke: { path: rel(smokePath), ...await hashPath(smokePath) },
    screenshot: { path: rel(screenshotPath), ...await hashPath(screenshotPath) },
    checks: smoke.checks,
    http: smoke.http ?? null,
    browser: smoke.browser ?? null,
    webAssemblyRequests: smoke.webAssemblyRequests,
    webAssemblyApiCalls: smoke.webAssemblyApiCalls,
    wasmGuardCoverage: smoke.wasmGuardCoverage,
  };
  receipt.checks.push(`HTTP demo smoke passed ${smoke.checks.length} browser and endpoint checks against the compiled Go collection`);
  await saveReceipt();
}

async function filesUnder(directory) {
  return walk(directory);
}

async function snapshotSourcePins() {
  const scenario = await readJSON(fixturePath);
  if (scenario.schema !== "gobi.compiled-children-scenario/v1" || scenario.packagePath !== packagePath ||
      !Array.isArray(scenario.events) || scenario.events.length === 0) {
    throw new Error("native fixture scenario is empty or does not match the frozen Go contract");
  }
  const before = await sourcePins();
  if (before.length < sourceFiles.length) throw new Error(`source pin set is incomplete: ${before.length}/${sourceFiles.length} required files`);
  receipt.sourceBefore = before;
  await saveReceipt();
}

async function sourcePinBoundary(label) {
  const current = await sourcePins();
  const expected = receipt.sourceBefore ?? [];
  const matches = JSON.stringify(current) === JSON.stringify(expected);
  receipt.boundaries ??= [];
  receipt.boundaries.push({ name: label, sourcePinsMatch: matches, count: current.length, sha256: hash(Buffer.from(JSON.stringify(current))) });
  if (!matches) throw new Error(`${label}: repository source inputs changed during the attempt`);
  return current;
}

async function copyArchiveInputs() {
  if (typeof receipt.inherited?.attempt !== "string") return;
  const source = resolve(root, receipt.inherited.attempt);
  if (!source.startsWith(root + sep) || !await exists(source)) return;
  const destination = join(attemptRoot, "inherited/compiled-capabilities/attempt");
  if (!await exists(destination)) await copyTree(source, destination);
}

async function createArchive() {
  await copyArchiveInputs();
  await sourcePinBoundary("before-archive");
  const sourcePinsAtPreArchive = await sourcePins();
  const snapshotValue = {
    schema: "gobi.compiled-children-execution-before-archive/v1",
    status: "archive_pending",
    archiveStatus: "PENDING",
    archivePending: true,
    finalAcceptance: false,
    acceptanceStatus: "NOT_FINAL",
    createdAt: stamp(),
    sourceBefore: structuredClone(receipt.sourceBefore),
    sourcePinsAtPreArchive,
    versions: structuredClone(receipt.versions ?? {}),
    dependencyInstall: structuredClone(receipt.dependencyInstall),
    executionParameters: structuredClone(receipt.executionParameters),
    commandLedger: structuredClone(receipt.commands),
    stages: structuredClone(receipt.stages),
    failures: structuredClone(receipt.failures),
    mismatches: structuredClone(receipt.mismatches),
  };
  const snapshotPath = join(attemptRoot, "execution-before-archive.json");
  const snapshot = await writeImmutableSnapshot(snapshotPath, snapshotValue);
  const members = [];
  for (const path of await filesUnder(attemptRoot)) {
    if (path.startsWith(join(attemptRoot, "archive-verification") + sep)) continue;
    members.push({ path: relative(attemptRoot, path).split(sep).join("/"), ...await hashPath(path) });
  }
  members.sort((left, right) => left.path.localeCompare(right.path));
  const manifestPath = join(dirname(attemptRoot), `${basename(attemptRoot)}.archive-manifest.json`);
  const manifest = {
    schema: "gobi.compiled-children-archive/v1",
    policy: "manifest outside tar; outer E-DELIVERY receipt binds archive and manifest bytes",
    attempt: rel(attemptRoot),
    members,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  const archivePath = join(dirname(attemptRoot), `${basename(attemptRoot)}.tar.gz`);
  const verifyRoot = join(attemptRoot, "archive-verification");
  const executeArchiveCommand = async (name, command, commandArgs) => execute(name, command, commandArgs, { cwd: root });
  const archived = await archiveAndVerify({
    attemptRoot,
    archivePath,
    verifyRoot,
    includePaths: ["logs", "react", "dom", "harness", "oracle", "demo", "inherited", "provenance", "execution-before-archive.json"],
    members,
    execute: executeArchiveCommand,
    hashPath,
    readJSON,
  });
  if (archived.archivedSnapshot.archivePending !== true || archived.archivedSnapshot.finalAcceptance !== false ||
      JSON.stringify(archived.archivedSnapshot.sourceBefore) !== JSON.stringify(receipt.sourceBefore) ||
      JSON.stringify(archived.archivedSnapshot.sourcePinsAtPreArchive) !== JSON.stringify(sourcePinsAtPreArchive) ||
      (snapshot.bytes.length !== snapshot.byteLength)) {
    throw new Error("immutable pre-archive provenance snapshot changed during tar round trip");
  }
  const archiveAfter = await hashPath(archivePath);
  const manifestAfter = await hashPath(manifestPath);
  const consumerOutputPath = join(attemptRoot, "provenance/post-command-archive-consumer.json");
  const consumerOutput = await execute("independent-post-command-archive-consumer", process.execPath, [
    archiveVerifier,
    "--archive", archivePath,
    "--manifest", manifestPath,
    "--output", consumerOutputPath,
    "--expected-archive-sha256", archiveAfter.sha256,
    "--expected-manifest-sha256", manifestAfter.sha256,
  ]);
  const consumerLine = consumerOutput.trim().split("\n").at(-1);
  if (!consumerLine) throw new Error("independent archive consumer returned empty verification data");
  const consumer = JSON.parse(consumerLine);
  if (consumer.schema !== "gobi.compiled-children-independent-archive-verification/v1" || consumer.status !== "passed" ||
      consumer.members !== members.length || consumer.archive.sha256 !== archiveAfter.sha256 ||
      consumer.manifest.sha256 !== manifestAfter.sha256 || consumer.archive.bytes <= 0 || consumer.archive.bytes !== consumer.archive.statBytes) {
    throw new Error("independent post-command archive consumer did not verify the recorded archive, manifest, and members");
  }
  const extractedMemberCount = members.length;
  receipt.archive = {
    path: rel(archivePath),
    ...archiveAfter,
    manifest: { path: rel(manifestPath), ...manifestAfter },
    snapshot: { path: rel(snapshotPath), bytes: snapshot.byteLength, sha256: hash(snapshot.bytes) },
    memberCount: extractedMemberCount,
    members,
    roundTripVerified: true,
    immutableSnapshotVerified: true,
    sourcePinsAtPreArchive: sourcePinsAtPreArchive,
    independentConsumer: {
      status: consumer.status,
      consumer: consumer.consumer,
      path: rel(consumerOutputPath),
      ...await hashPath(consumerOutputPath),
      memberCount: consumer.members,
    },
    archiveSha256AfterCommand: archiveAfter.sha256,
    manifestSha256AfterCommand: manifestAfter.sha256,
  };
  await saveReceipt();
  await sourcePinBoundary("after-archive-command");
  const finalArchiveHash = await hashPath(archivePath);
  const finalManifestHash = await hashPath(manifestPath);
  if (finalArchiveHash.sha256 !== archiveAfter.sha256 || finalArchiveHash.bytes !== archiveAfter.bytes ||
      finalManifestHash.sha256 !== manifestAfter.sha256 || finalManifestHash.bytes !== manifestAfter.bytes) {
    throw new Error("archive or external manifest changed after its command boundary");
  }
  receipt.archive.postCommandBoundary = {
    archiveMatchesRecordedBytes: true,
    manifestMatchesRecordedBytes: true,
    independentConsumerPassed: true,
    verifiedAfterCommandAt: stamp(),
  };
  receipt.checks.push(`new archive and external manifest verified after commands; ${extractedMemberCount}/${extractedMemberCount} member hashes round-tripped`);
  await saveReceipt();
}

function generateReport() {
  const stageLines = receipt.stages.map((item) => `- ${item.name}: **${item.status}**${item.error ? ` — ${item.error}` : ""}`);
  const commandLines = receipt.commands.map((item) => `- \`${item.name}\`: \`${item.command} ${item.args.join(" ")}\` (exit ${item.exitCode}; stdout SHA-256 \`${item.stdoutSha256}\`; stderr SHA-256 \`${item.stderrSha256}\`).`);
  const checks = receipt.checks.map((item) => `- ${item}`);
  const failures = receipt.failures.map((item) => `- ${item.name}: ${item.error}`);
  const body = [
    "# E-DELIVERY: compiled keyed child collection delivery",
    "",
    `**Outcome: ${receipt.outcome}. Status: ${receipt.status}.** ${receipt.summary}`,
    "",
    "## Commands and versions",
    "",
    `- Attempt: \`${receipt.attempt}\` (${receipt.mode} mode, Node ${receipt.versions?.node ?? "unknown"}, root Go ${receipt.versions?.rootGo ?? "unknown"}, compiler Go ${receipt.versions?.compilerGo ?? "unknown"}, Chromium ${receipt.versions?.chromium ?? "unknown"}).`,
    `- Fixture: \`${receipt.executionParameters.fixture}\`; scenario seed: \`${receipt.executionParameters.seed}\`.`,
    ...commandLines,
    "",
    "## Stage ledger",
    "",
    ...(stageLines.length ? stageLines : ["- No stages completed."]),
    "",
    "## Acceptance checks",
    "",
    ...(checks.length ? checks : ["- No acceptance checks completed."]),
    "",
    "## Archive and delivery boundary",
    "",
    receipt.archive
      ? `The immutable pre-archive snapshot and ${receipt.archive.memberCount}-member tar round trip passed. Archive SHA-256: \`${receipt.archive.sha256}\`; external manifest SHA-256: \`${receipt.archive.manifest.sha256}\`. A separate Node consumer independently listed, extracted, and hashed all members after the archive command. The runner rechecked both outer hashes and source pins before finalizing this receipt.`
      : "No complete archive verification was produced.",
    "",
    `Prior evidence limitation: ${receipt.priorEvidenceLimit.statement} The accepted prior evidence identifier is \`${receipt.priorEvidenceLimit.acceptedEvidence}\`.`,
    "",
    "## Failures and mismatches",
    "",
    ...(failures.length ? failures : ["- No failures recorded."]),
    ...(receipt.mismatches.length ? receipt.mismatches.map((item) => `- Mismatch: ${JSON.stringify(item)}`) : []),
    "",
    `Inherited chain: ${receipt.inherited?.status ?? "not verified"}. N4 harness: ${receipt.harness?.status ?? "not matched"}. N5 literal oracle: ${receipt.oracle?.summary ?? "not passed"}. HTTP demo: ${receipt.demo?.status ?? "not passed"}.`,
    "",
    "The prior local-container archive was left untouched and is not acceptance evidence. This report does not claim hosted CI success unless a separate run artifact is supplied and matched to this exact source and receipt.",
    "",
  ].join("\n");
  return writeFile(reportPath, body);
}

async function finalize() {
  try {
    receipt.sourceAfter = await sourcePins();
    receipt.sourcePinsMatch = JSON.stringify(receipt.sourceBefore ?? []) === JSON.stringify(receipt.sourceAfter);
    if (!receipt.sourcePinsMatch) receipt.failures.push({ name: "source-pins-after", error: "sourceAfter differs from sourceBefore" });
  } catch (error) {
    receipt.sourcePinsMatch = false;
    receipt.failures.push({ name: "source-pins-after", error: error instanceof Error ? error.message : String(error) });
  }
  if (receipt.archive?.roundTripVerified && receipt.archive?.postCommandBoundary?.archiveMatchesRecordedBytes === true &&
      receipt.archive?.postCommandBoundary?.manifestMatchesRecordedBytes === true &&
      receipt.archive?.postCommandBoundary?.independentConsumerPassed === true && receipt.sourcePinsMatch === true) {
    receipt.boundariesVerified = true;
  } else {
    receipt.boundariesVerified = false;
    if (!receipt.failures.some((item) => item.name === "archive-delivery-boundary")) {
      receipt.failures.push({ name: "archive-delivery-boundary", error: "archive, manifest, or source boundary verification is incomplete" });
    }
  }
  const failedStages = receipt.stages.some((item) => item.status !== "passed");
  receipt.status = receipt.failures.length === 0 && !failedStages ? "passed" : "failed";
  receipt.summary = receipt.status === "passed"
    ? "The full inherited capability chain, fresh React/DOM collection builds, N5 literal oracle, N4 native/direct/browser parity, HTTP smoke, source boundaries, and immutable archive all passed."
    : `${receipt.failures.length} failure(s) were recorded; this full delivery attempt is not accepted.`;
  try {
    await generateReport();
    const reportBytes = await readFile(reportPath);
    if (reportBytes.length === 0) throw new Error("generated E-DELIVERY report is empty");
    receipt.report = { path: rel(reportPath), bytes: reportBytes.length, sha256: hash(reportBytes) };
    await saveReceipt();
  } catch (error) {
    receipt.status = "failed";
    receipt.summary = `Final report/receipt delivery failed: ${error instanceof Error ? error.message : String(error)}`;
    receipt.failures.push({ name: "final-delivery", error: receipt.summary });
    await saveReceipt();
  }
  if (receipt.status !== "passed") process.exitCode = 1;
  process.stdout.write(`compiled-children: ${receipt.status} (${receipt.mode})\n`);
}

try {
  if (args.length !== 0) throw new Error("E-DELIVERY supports full mode only; arguments and partial/reuse modes are rejected");
  const preflight = await stage("preflight-and-toolchain", async () => {
    await verifyRequiredInputs();
    await collectVersions();
    await snapshotSourcePins();
    return true;
  });
  if (!preflight) throw new Error("full runner withheld because frozen inputs or toolchain preflight failed");

  const inheritedOutput = await stage("fresh-full-inherited-capabilities-chain", runInheritedFullChain);

  await stage("new-host-and-harness-unit-tests", runNewUnitTests);

  let react = null;
  let dom = null;
  const reactBuild = await stage("fresh-react-goscript-build", () => buildBackend("react"));
  if (reactBuild) react = reactBuild;
  const domBuild = await stage("fresh-dom-goscript-build", () => buildBackend("dom"));
  if (domBuild) dom = domBuild;
  if (react && dom) await stage("react-dom-build-parity", () => compareBuilds(react, dom));
  else receipt.stages.push({ name: "react-dom-build-parity", status: "skipped", reason: "Both actual GoScript builds are required." });

  let expectations = null;
  const oracle = await stage("n5-independent-literal-oracle", runOracle);
  if (oracle) expectations = oracle;
  if (react && dom && expectations) {
    await stage("n4-native-direct-browser-harness", () => runHarness(react, dom, expectations));
    await stage("compiled-http-demo-and-browser-smoke", () => buildAndSmokeDemo(react));
  } else {
    receipt.stages.push({ name: "n4-native-direct-browser-harness", status: "skipped", reason: "Fresh React/DOM outputs and N5 literal expectations are required." });
    receipt.stages.push({ name: "compiled-http-demo-and-browser-smoke", status: "skipped", reason: "Fresh React output is required." });
  }
  if (inheritedOutput === null) receipt.checks.push("The inherited full chain failed and is retained as a blocking failure; dependent inherited evidence was not accepted.");
} catch (error) {
  receipt.failures.push({ name: "runner", error: error instanceof Error ? error.message : String(error) });
} finally {
  try {
    if (receipt.sourceBefore) await stage("immutable-archive-and-boundary-verification", createArchive);
    else receipt.failures.push({ name: "archive", error: "Archive withheld because the pre-command source pin set was not captured." });
  } catch (error) {
    receipt.failures.push({ name: "archive", error: error instanceof Error ? error.message : String(error) });
  }
  await finalize();
}
