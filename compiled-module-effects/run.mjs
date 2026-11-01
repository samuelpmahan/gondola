import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { archiveAndVerify, createExclusiveAttemptDirectory, writeImmutableSnapshot } from "../compiled-capabilities/archive-helper.mjs";
import { chromiumLaunchOptions } from "../compiled-frontend/conformance/browser.mjs";
import {
  aggregateMutationControlReports, assertUnmountLifecycleOrder, CAPTURE_MUTATION_CONTROL_IDS,
  MODULE_EFFECTS_SCENARIOS, validateMutationControlReport,
  verifyConformanceProducerSummary,
} from "./delivery-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const compilerDir = join(root, "compiled-frontend");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = () => new Date().toISOString();
const delimiter = process.platform === "win32" ? ";" : ":";
const commandRecords = [];
const rootGoEnv = { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" };
const compilerGoEnv = { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" };
const sourceDirectories = [
  "cmd/module-effects-native", "cmd/keyed-module-native",
  "fixtures/compiled/effectmodulechild", "fixtures/compiled/keyedmoduleparent",
  "fixtures/compiled/keyedmodulewire", "fixtures/compiled/modulechild",
  "fixtures/compiled/moduleparent", "fixtures/compiled/modulewire",
  "moduleabi", "counter", "gobi", "compilercontract", "reactmap",
  "compiled-module-effects", "compiled-keyed-modules",
  "compiled-modules/abi", "compiled-modules/conformance",
  "compiled-frontend",
];
const sourceFiles = [
  "go.mod", "package.json", "package-lock.json", "EXPECTED.json", "SHA256SUMS",
  ".gitignore", ".gitattributes",
  "interaction/package.json", "interaction/package-lock.json",
  "compiled-frontend/go.mod", "compiled-frontend/go.sum",
  "compiled-frontend/package.json", "compiled-frontend/package-lock.json",
  "compiled-capabilities/archive-helper.mjs", "compiled-capabilities/archive-helper.test.mjs",
  "compiled-children/browser-version.mjs",
  "compiled-frontend/conformance/browser.mjs",
  "run.sh", "run-interaction.sh", "run-keyed-modules.sh", "run-module-effects.sh",
  ".github/workflows/gobi-keyed-module-effects.yml", ".github/workflows/gobi-keyed-modules.yml",
];
const excludedNames = new Set([
  ".git", "node_modules", "__pycache__", ".cache", "output", "evidence", "attempts",
  "coordination", "ci", "bundles", "toolchain", "review-evidence", "reports", "receipts",
  "rawlogs", "results", "results-prior-refresh",
]);
const excludedSourceFiles = new Set([
  "compiled-module-effects/RESULTS.md",
  "compiled-frontend/DELIVERY.json", "compiled-frontend/RESULTS.md",
  "compiled-frontend/frontend/runtime/r2_completion_probe.mjs",
  "compiled-frontend/frontend/runtime/r2_completion_probe.json",
  "compiled-frontend/frontend/runtime/r2-node-tests.log",
  "compiled-frontend/frontend/runtime/r2-probe.stderr.log",
]);
const sourceClosureScope = {
  directories: sourceDirectories,
  explicitFiles: sourceFiles,
  rootGoSum: {
    path: "go.sum",
    present: false,
    evidencePath: "go.mod",
    reason: "the root go.mod contains no dependency requirements; the root module has no external Go dependencies",
  },
  excludedDirectoryNames: [...excludedNames].sort(),
  excludedFiles: [...excludedSourceFiles].sort(),
  excludedCompilerLogs: true,
};

function findExecutable(name) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    const result = spawnSync("test", ["-x", candidate]);
    if (result.status === 0) return candidate;
  }
  return name;
}

const goExecutable = process.env.GOBI_GO_BIN ? resolve(process.env.GOBI_GO_BIN) : findExecutable("go");
const nodeExecutable = process.env.GOBI_NODE_BIN ? resolve(process.env.GOBI_NODE_BIN) : process.execPath;
const pythonExecutable = process.env.GOBI_PYTHON_BIN
  ? resolve(process.env.GOBI_PYTHON_BIN)
  : findExecutable("python3") !== "python3" ? findExecutable("python3") : findExecutable("python");

function parseArgs(argv) {
  const args = { allowDirty: false, chromium: null, outputRoot: join(here, "output/attempts"), sourceCommit: null };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--help") return { help: true };
    if (name === "--allow-dirty") {
      if (args.allowDirty) throw new Error("--allow-dirty may only appear once");
      args.allowDirty = true;
      continue;
    }
    if (!["--source-commit", "--chromium", "--output-root"].includes(name)) throw new Error(`unknown argument ${name}`);
    if (seen.has(name)) throw new Error(`${name} may only appear once`);
    seen.add(name);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    const key = name.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    args[key] = key === "chromium" || key === "outputRoot" ? resolve(value) : value;
  }
  if (typeof args.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(args.sourceCommit)) {
    throw new Error("--source-commit requires a 40-character lowercase Git commit ID");
  }
  return args;
}

async function writeJSON(path, value, { exclusive = true } = {}) {
  await mkdir(dirname(path), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await writeFile(path, bytes, { flag: exclusive ? "wx" : "w", mode: 0o644 });
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

async function hashFile(path) {
  const bytes = await readFile(path);
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}

async function walkFiles(directory, { sourceTree = false } = {}) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const rel = relative(root, path).split(sep).join("/");
    if (entry.isDirectory()) {
      if (sourceTree && (excludedNames.has(entry.name) ||
          rel === "compiled-frontend/build/output" || rel.startsWith("compiled-frontend/build/output/") ||
          rel === "compiled-module-effects/build/output" || rel.startsWith("compiled-module-effects/build/output/"))) continue;
      files.push(...await walkFiles(path, { sourceTree }));
    } else if (entry.isFile()) {
      if (!sourceTree || (!excludedSourceFiles.has(rel) &&
          !(rel.startsWith("compiled-frontend/") && (entry.name.endsWith(".log") || entry.name.endsWith(".exit-code"))))) {
        files.push(path);
      }
    } else {
      throw new Error(`source or attempt inventory contains a non-regular entry: ${path}`);
    }
  }
  return files;
}

async function snapshotSourcePins() {
  const rootGoMod = await readFile(join(root, "go.mod"), "utf8");
  if (/^\s*require(?:\s|\()/m.test(rootGoMod)) {
    throw new Error("root go.sum is intentionally unpinned only while root go.mod declares no external dependencies");
  }
  try {
    await readFile(join(root, "go.sum"));
    throw new Error("root go.sum exists; update the source closure to pin it");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const paths = new Set(sourceFiles);
  for (const directory of sourceDirectories) {
    for (const path of await walkFiles(join(root, directory), { sourceTree: true })) {
      paths.add(relative(root, path).split(sep).join("/"));
    }
  }
  const pins = {};
  for (const path of [...paths].sort()) {
    const bytes = await readFile(join(root, path));
    pins[path] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  return pins;
}

function changedPins(before, after) {
  return [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort()
    .filter((path) => !before?.[path] || !after?.[path] || before[path].bytes !== after[path].bytes || before[path].sha256 !== after[path].sha256);
}

function safeName(name) { return name.replace(/[^a-zA-Z0-9._-]+/g, "-"); }

async function execute(name, command, args, options = {}) {
  const logDir = options.logDir ?? logsRoot;
  await mkdir(logDir, { recursive: true });
  const env = options.env ?? {};
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...env },
    input: options.input,
    maxBuffer: options.maxBuffer ?? 256 * 1024 * 1024,
  });
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  const record = {
    name, command, args, cwd: options.cwd ?? root, environment: env,
    startedAt: options.startedAt ?? stamp(), completedAt: stamp(), exitCode: result.status,
    signal: result.signal ?? null, spawnError: result.error ? String(result.error.message ?? result.error) : null,
    stdout: { bytes: stdout.length, sha256: sha256(stdout) }, stderr: { bytes: stderr.length, sha256: sha256(stderr) },
  };
  if (options.input !== undefined) {
    const input = Buffer.isBuffer(options.input) ? options.input : Buffer.from(String(options.input));
    record.stdin = { bytes: input.length, sha256: sha256(input) };
  }
  const keepOutput = options.captureOutput !== false || result.error || result.status !== 0;
  if (keepOutput) {
    record.stdoutLog = join(logDir, `${safeName(name)}.stdout.bin`);
    record.stderrLog = join(logDir, `${safeName(name)}.stderr.bin`);
  } else {
    record.stdoutLog = null;
    record.stderrLog = null;
  }
  const writes = [writeJSON(join(logDir, `${safeName(name)}.command.json`), record)];
  if (options.input !== undefined) {
    const input = Buffer.isBuffer(options.input) ? options.input : Buffer.from(String(options.input));
    writes.push(writeFile(join(logDir, `${safeName(name)}.stdin.bin`), input, { flag: "wx" }));
  }
  if (keepOutput) {
    writes.push(writeFile(record.stdoutLog, stdout, { flag: "wx" }));
    writes.push(writeFile(record.stderrLog, stderr, { flag: "wx" }));
  }
  await Promise.all(writes);
  if (options.includeInCommands !== false) commandRecords.push(record);
  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed (${result.status ?? result.signal ?? "spawn error"})${stderr.length ? `: ${stderr.toString("utf8").trim()}` : ""}`);
  }
  return stdout.toString("utf8");
}

function parseSingleJSON(text, label) {
  const value = text.trim();
  if (!value) throw new Error(`${label} produced empty stdout`);
  try { return JSON.parse(value); } catch { /* keep looking for the final JSON line */ }
  const lines = value.split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch { /* not JSON */ }
  }
  throw new Error(`${label} produced no parseable JSON result`);
}

async function gitMetadata(phase) {
  const head = (await execute(`git-${phase}-head`, "git", ["rev-parse", "HEAD"], { env: {} })).trim();
  const status = (await execute(`git-${phase}-status`, "git", ["status", "--porcelain", "--untracked-files=all"], { env: {} })).trim();
  return { head, dirty: status.length !== 0, status };
}

async function compareSourcePinsToGit(pins, head) {
  const output = await execute("git-tree-source-closure", "git", ["ls-tree", "-rz", "--full-tree", head], {
    cwd: root, env: {}, maxBuffer: 128 * 1024 * 1024, captureOutput: false,
  });
  const blobs = new Map();
  for (const entry of output.split("\0")) {
    if (!entry) continue;
    const tab = entry.indexOf("\t");
    if (tab < 0) continue;
    const metadata = entry.slice(0, tab).split(" ");
    if (metadata.length === 3 && metadata[1] === "blob") blobs.set(entry.slice(tab + 1), metadata[2]);
  }
  const mismatches = [];
  for (const [path, pin] of Object.entries(pins)) {
    const bytes = await readFile(join(root, path));
    const gitBlob = createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex");
    if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256 || blobs.get(path) !== gitBlob) mismatches.push(path);
  }
  return { sourcePinsMatch: mismatches.length === 0, mismatches };
}

async function toolVersion(name, command, args, options = {}) {
  return (await execute(name, command, args, options)).trim();
}

function parseTAPSummary(text) {
  const read = (label) => {
    const match = text.match(new RegExp(`^# ${label} (\\d+)$`, "m"));
    if (!match) throw new Error(`Node TAP output is missing the ${label} summary`);
    return Number(match[1]);
  };
  const result = { tests: read("tests"), passed: read("pass"), failed: read("fail"), skipped: read("skipped") };
  if (result.failed !== 0 || result.passed !== result.tests || result.skipped !== 0) {
    throw new Error(`Node tests did not pass without skips: ${JSON.stringify(result)}`);
  }
  return result;
}

function parseGoJSONSummary(text, label) {
  const events = text.split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { throw new Error(`${label} produced a non-JSON test event`); }
  });
  const packageRows = events.filter((event) => event.Test === undefined && ["pass", "fail", "skip"].includes(event.Action));
  const testRows = events.filter((event) => typeof event.Test === "string" && ["pass", "fail", "skip"].includes(event.Action));
  const identities = new Map(testRows.map((event) => [`${event.Package}\u0000${event.Test.split("/")[0]}`, event.Test.split("/")[0]]));
  const failed = events.filter((event) => event.Action === "fail");
  const skipped = events.filter((event) => event.Action === "skip");
  return {
    packages: packageRows.length,
    tests: identities.size,
    testCases: testRows.length,
    testNames: [...identities.values()].sort(),
    skipped: skipped.length,
    failed: failed.length,
  };
}

async function runBuilds() {
  currentStage = "four-independent-builds";
  const output = join(attemptRoot, "builds");
  const stdout = await execute("effects-build-adapter", nodeExecutable, [
    join(here, "build/build.mjs"), "--output", output,
  ], { cwd: root, env: { GOBI_GO_BIN: goExecutable, GOBI_NODE_BIN: nodeExecutable }, maxBuffer: 64 * 1024 * 1024, captureOutput: false });
  buildSummary = parseSingleJSON(stdout, "module effects build adapter");
  buildCalls = buildSummary.actualBuildCount ?? buildSummary.buildCalls;
  if (buildSummary.schema !== "gobi.module-effects-build-result/v1" || buildCalls !== 4 ||
      buildSummary.admission?.react?.admitted !== true || buildSummary.admission?.dom?.admitted !== true) {
    throw new Error("four independent module-effects builds or capability admissions did not pass");
  }
  buildIndexPath = join(output, "build-index.json");
  buildIndexBytes = await readFile(buildIndexPath);
  buildIndex = JSON.parse(buildIndexBytes.toString("utf8"));
  if (buildIndex.schema !== "gobi.module-effects-build-index/v1" ||
      !buildIndex.builds?.react?.parent || !buildIndex.builds?.react?.child ||
      !buildIndex.builds?.dom?.parent || !buildIndex.builds?.dom?.child) {
    throw new Error("module-effects build index does not contain four independently pinned build records");
  }
  if (buildIndex.parentPackagePath !== "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent" ||
      buildIndex.childPackagePath !== "github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild") {
    throw new Error("build index does not bind the frozen PR22 keyed parent and effect child packages");
  }
  const buildPins = [];
  for (const backend of ["react", "dom"]) {
    for (const role of ["parent", "child"]) {
      const item = buildIndex.builds[backend][role];
      if (!item.packagePath || !item.artifacts?.moduleABI?.sha256) {
        throw new Error(`build index is missing the ${backend}/${role} ABI or artifact pins`);
      }
      buildPins.push({ backend, role, packagePath: item.packagePath, abiSHA256: item.artifacts.moduleABI.sha256 });
    }
  }
  const admission = buildSummary.admission;
  for (const backend of ["react", "dom"]) {
    const effects = admission[backend].effectProbe?.observations;
    const probe = admission[backend].effectProbe;
    if (admission[backend].parentABIUnchanged !== true || !Array.isArray(effects) || effects.length < 2 ||
        probe?.observedCount !== effects.length) {
      throw new Error(`${backend} admission did not preserve the parent ABI and prove the child effect capability`);
    }
    const expectedEffects = [
      { kind: "fixture.request", name: "save", arg: "a:g1:r1", reply: "complete" },
      { kind: "lifecycle.cancel", name: "cancel", arg: "a:g1:r1", reply: "" },
      { kind: "fixture.request", name: "save", arg: "a:g1:r2", reply: "complete" },
      { kind: "lifecycle.cancel", name: "cancel", arg: "a:g1:r2", reply: "" },
    ];
    const uniqueDescriptors = new Set(effects.map((effect) => JSON.stringify({ kind: effect.kind, name: effect.name, reply: effect.reply })));
    const declaredDescriptors = admission[backend].effectCapabilityExtension?.closedEffectDescriptors;
    const snapshot = (step) => probe.stateSnapshots?.find((item) => item.step === step);
    const requestState = snapshot("request");
    const cancelState = snapshot("cancel");
    const unmountState = snapshot("unmount");
    if (JSON.stringify(effects) !== JSON.stringify(expectedEffects) || uniqueDescriptors.size !== 2 ||
        (probe?.uniqueDescriptorCount !== undefined && probe.uniqueDescriptorCount !== uniqueDescriptors.size) ||
        !Array.isArray(declaredDescriptors) || declaredDescriptors.length !== uniqueDescriptors.size ||
        !requestState || requestState.mounted !== true || requestState.pending !== true || requestState.token !== "a:g1:r1" ||
        !cancelState || cancelState.mounted !== true || cancelState.pending !== false || cancelState.token !== "a:g1:r1" ||
        !unmountState || unmountState.mounted !== false || unmountState.pending !== false) {
      throw new Error(`${backend} generated child did not emit the exact frozen effect descriptors`);
    }
  }
  buildOutput = output;
  await writeJSON(join(attemptRoot, "metadata/build-summary.json"), buildSummary);
  await writeJSON(join(attemptRoot, "metadata/build-integrity.json"), {
    schema: "gobi.module-effects-build-integrity/v1",
    index: { path: relative(attemptRoot, buildIndexPath).split(sep).join("/"), bytes: buildIndexBytes.length, sha256: sha256(buildIndexBytes) },
    buildCalls,
    builds: buildPins,
    admission,
    faultControls: buildSummary.faultControls ?? null,
  });
  return buildSummary;
}

async function listNodeTestFiles() {
  const candidates = [];
  for (const directory of ["compiled-module-effects"]) {
    const files = await walkFiles(join(root, directory), { sourceTree: true });
    for (const path of files) {
      const name = path.split(sep).at(-1);
      if (name.endsWith(".test.mjs")) candidates.push(path);
    }
  }
  candidates.push(join(root, "compiled-capabilities/archive-helper.test.mjs"));
  return [...new Set(candidates)].sort();
}

async function runTests() {
  currentStage = "module-effects-go-and-node-tests";
  const goPackages = ["./cmd/module-effects-native", "./fixtures/compiled/effectmodulechild"];
  const goOutput = await execute("module-effects-go-tests", goExecutable, ["test", "-json", "-count=1", ...goPackages], {
    cwd: root, env: rootGoEnv, maxBuffer: 256 * 1024 * 1024,
  });
  const goSummary = parseGoJSONSummary(goOutput, "module-effects Go tests");
  if (goSummary.packages !== goPackages.length || goSummary.tests === 0 || goSummary.failed !== 0 || goSummary.skipped !== 0) {
    throw new Error(`Go test run did not execute and pass each selected package: ${JSON.stringify(goSummary)}`);
  }
  const moduleABITestName = "TestDescribeAcceptsDeclaredChildEffectsAndPreservesCanonicalChecks";
  const moduleABISummaryText = await execute("module-effects-moduleabi-regression", goExecutable, [
    "test", "-json", "-count=1", "./moduleabi", "-run", `^${moduleABITestName}$`,
  ], { cwd: root, env: rootGoEnv, maxBuffer: 256 * 1024 * 1024 });
  const moduleABISummary = parseGoJSONSummary(moduleABISummaryText, "moduleabi closed effect capability regression");
  if (moduleABISummary.packages !== 1 || moduleABISummary.tests !== 1 ||
      JSON.stringify(moduleABISummary.testNames) !== JSON.stringify([moduleABITestName]) ||
      moduleABISummary.failed !== 0 || moduleABISummary.skipped !== 0) {
    throw new Error(`moduleabi closed effect capability regression did not execute and pass: ${JSON.stringify(moduleABISummary)}`);
  }
  const compilerRegressionNames = [
    "TestAnalyzeBoundsParseUintIntrinsicToSafeDecimalWidth",
    "TestSafeParseUintIntrinsicRequiresExactCallAndArguments",
    "TestLoadSourcesProjectsNestedLocalDependenciesAndTypedChildBridgeRoles",
    "TestAnalyzeRejectsUnsafeIntegerOperationInSecondDepthDependency",
  ];
  const compilerRegex = `^(${compilerRegressionNames.join("|")})$`;
  const compilerOutput = await execute("compiler-load-source-regressions", goExecutable, [
    "test", "-json", "-count=1", "./analyze", "-run", compilerRegex,
  ], { cwd: compilerDir, env: compilerGoEnv, maxBuffer: 256 * 1024 * 1024 });
  const compilerSummary = parseGoJSONSummary(compilerOutput, "compiler load-source regressions");
  if (compilerSummary.packages !== 1 || compilerSummary.tests !== compilerRegressionNames.length ||
      JSON.stringify(compilerSummary.testNames) !== JSON.stringify(compilerRegressionNames.slice().sort()) ||
      compilerSummary.failed !== 0 || compilerSummary.skipped !== 0) {
    throw new Error(`compiler regression run did not execute and pass every targeted analyze test: ${JSON.stringify(compilerSummary)}`);
  }
  const buildRegressionNames = [
    "TestStageFailureDiagnosticsPreserveCauseOnlyWhenNoStageDiagnosticExists",
  ];
  const buildRegressionRegex = `^(${buildRegressionNames.join("|")})$`;
  const buildRegressionOutput = await execute("compiler-build-stage-regressions", goExecutable, [
    "test", "-json", "-count=1", "./build", "-run", buildRegressionRegex,
  ], { cwd: compilerDir, env: compilerGoEnv, maxBuffer: 256 * 1024 * 1024 });
  const buildRegressionSummary = parseGoJSONSummary(buildRegressionOutput, "compiler build stage regressions");
  if (buildRegressionSummary.packages !== 1 || buildRegressionSummary.tests !== buildRegressionNames.length ||
      JSON.stringify(buildRegressionSummary.testNames) !== JSON.stringify(buildRegressionNames.slice().sort()) ||
      buildRegressionSummary.failed !== 0 || buildRegressionSummary.skipped !== 0) {
    throw new Error(`compiler Build stage regression did not execute and pass: ${JSON.stringify(buildRegressionSummary)}`);
  }
  const nodeFiles = await listNodeTestFiles();
  if (nodeFiles.length === 0) throw new Error("source/test closure did not discover Node test files");
  if (new Set(nodeFiles).size !== nodeFiles.length || !nodeFiles.includes(join(root, "compiled-capabilities/archive-helper.test.mjs"))) {
    throw new Error("Node test inventory must include every profile test and the archive helper test exactly once");
  }
  const nodeOutput = await execute("all-module-effects-node-tests", nodeExecutable, [
    "--test-reporter=tap", "--test", ...nodeFiles,
  ], { cwd: root, env: { GOBI_MODULE_EFFECTS_BUILD_INDEX: buildIndexPath }, maxBuffer: 256 * 1024 * 1024 });
  nodeTestSummary = {
    schema: "gobi.module-effects-test-summary/v1",
    status: "passed",
    go: {
      packages: goPackages,
      ...goSummary,
      outputBytes: Buffer.byteLength(goOutput),
    },
    moduleABIRegression: {
      package: "./moduleabi", testName: moduleABITestName, ...moduleABISummary,
      outputBytes: Buffer.byteLength(moduleABISummaryText), toolchain: rootGoEnv.GOTOOLCHAIN,
    },
    compilerRegression: {
      package: "./analyze", testNames: compilerRegressionNames, ...compilerSummary,
      outputBytes: Buffer.byteLength(compilerOutput),
      toolchain: compilerGoEnv.GOTOOLCHAIN,
    },
    buildStageRegressions: {
      package: "./build", testNames: buildRegressionNames, ...buildRegressionSummary,
      outputBytes: Buffer.byteLength(buildRegressionOutput), toolchain: compilerGoEnv.GOTOOLCHAIN,
    },
    node: {
      files: nodeFiles.map((path) => relative(root, path).split(sep).join("/")),
      ...parseTAPSummary(nodeOutput), outputBytes: Buffer.byteLength(nodeOutput),
    },
  };
  await writeJSON(join(attemptRoot, "metadata/test-summary.json"), nodeTestSummary);
  return nodeTestSummary;
}

async function readCapture(pin, label) {
  if (!pin || typeof pin !== "object" || typeof pin.path !== "string") throw new Error(`${label} capture pin is missing`);
  const path = isAbsolute(pin.path) ? pin.path : resolve(root, pin.path);
  if (!path.startsWith(`${attemptRoot}${sep}`)) throw new Error(`${label} capture was written outside the current attempt`);
  const bytes = await readFile(path);
  if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) throw new Error(`${label} capture digest differs from harness summary`);
  const capture = JSON.parse(bytes.toString("utf8"));
  if (!capture || typeof capture !== "object" || Array.isArray(capture)) throw new Error(`${label} capture is not a JSON object`);
  return { capture, path, bytes, sha256: sha256(bytes) };
}

async function runConformance(args) {
  currentStage = "native-direct-browser-conformance";
  const output = join(attemptRoot, "conformance/effects");
  await mkdir(dirname(output), { recursive: true });
  const harness = join(here, "conformance/run.mjs");
  const stdout = await execute("effects-conformance", nodeExecutable, [
    harness, "--native-go", goExecutable, "--build-index", buildIndexPath,
    "--chromium", chromiumPath, "--output", output,
  ], { cwd: root, env: { GOBI_GO_BIN: goExecutable, CHROMIUM_PATH: chromiumPath }, maxBuffer: 256 * 1024 * 1024, captureOutput: false });
  conformanceSummary = parseSingleJSON(stdout, "module effects conformance harness");
  const inheritedNativeGoVersion = await toolVersion("conformance-native-go-version", goExecutable, ["version"], { env: {} });
  const expectedCommand = [process.execPath, harness, "--native-go", goExecutable, "--build-index", buildIndexPath,
    "--chromium", chromiumPath, "--output", output];
  const browserVersion = toolchain.chromium.match(/\b\d+\.\d+\.\d+\.\d+\b/)?.[0];
  if (!browserVersion) throw new Error(`cannot parse pinned Chromium version ${toolchain.chromium}`);
  const verified = await verifyConformanceProducerSummary(conformanceSummary, {
    attemptRoot, root, outputPrefix: output,
    buildIndexPath, buildIndexBytes, buildIndex, buildSummary,
    nativeGo: goExecutable, nativeGoVersion: inheritedNativeGoVersion,
    chromium: chromiumPath, browserVersion,
    nodeExecutable: process.execPath, nodeVersion: process.version,
    compilerGo: buildSummary.toolchain.compilerGo, playwright: toolchain.playwright,
    expectedCommand,
  });
  conformanceSummary.captureMutationControlsDetected = verified.captureMutationControls.rejected
    .filter((item) => item.rejected === true).length;
  conformanceSummary.buildAdmissionMutationControlsDetected = verified.buildAdmissionMutationControls.rejected
    .filter((item) => item.rejected === true).length;
  conformanceSummary.captureCounts = verified.counts;
  conformanceSummary.nativeCommandEvidence = verified.nativeCommandEvidence;
  conformanceSummary.producerFiles = { summary: verified.summaryFile, check: verified.checkFile };
  conformanceSummary.profileCapturesVerified = verified.profileCaptures.map(({ scenarioName, profile }) => ({ scenarioName, profile }));
  await writeJSON(join(attemptRoot, "conformance/summary.json"), conformanceSummary);
  return verified.profileCaptures;
}

async function runOracle(profileCaptures) {
  currentStage = "healthy-oracle-and-mutation-controls";
  const oracle = await import(pathToFileURL(join(here, "oracle/oracle.mjs")).href);
  const requireOraclePass = (result, label) => {
    if (result === false || ["mismatch", "rejected", "failed"].includes(result?.status)) {
      throw new Error(`${label} rejected a healthy capture: ${JSON.stringify(result)}`);
    }
    return result ?? { status: "matched" };
  };
  const scenarios = new Map();
  const nativeByScenario = new Map();
  const profilesByScenario = new Map();
  for (const item of profileCaptures) {
    scenarios.set(item.scenarioName, item.scenario);
    nativeByScenario.set(item.scenarioName, item.native);
    if (!profilesByScenario.has(item.scenarioName)) profilesByScenario.set(item.scenarioName, {});
    profilesByScenario.get(item.scenarioName)[item.profile] = item.capture;
  }
  const nativeChecks = [];
  const parityChecks = [];
  const mutationReports = [];
  for (const [scenarioName, scenario] of scenarios) {
    const native = nativeByScenario.get(scenarioName);
    const nativeResult = requireOraclePass(await oracle.assertNativeModuleEffectsCapture(native, scenario), `${scenarioName} native oracle`);
    if (nativeResult.events !== scenario.events.length) throw new Error(`${scenarioName} native oracle did not check every scenario event`);
    nativeChecks.push({ scenario: scenarioName, ...nativeResult });
    const parityResult = requireOraclePass(await oracle.assertModuleEffectsParity({ scenario, native, profiles: profilesByScenario.get(scenarioName) }), `${scenarioName} parity oracle`);
    if (parityResult.status !== "matched") throw new Error(`${scenarioName} parity oracle did not return matched status`);
    parityChecks.push({ scenario: scenarioName, ...parityResult });
    const mutationReport = await oracle.runModuleEffectsMutationControls({
      scenario, native, profiles: profilesByScenario.get(scenarioName),
    });
    if (mutationReport?.status !== "detected" || !Array.isArray(mutationReport.rejected) ||
        mutationReport.total !== mutationReport.rejected.length) {
      throw new Error(`${scenarioName} independent capture mutation controls did not return their full rejected-row array`);
    }
    mutationReports.push({
      ...mutationReport,
      requiredControlIds: [...CAPTURE_MUTATION_CONTROL_IDS],
      allowAdditionalControls: false,
    });
  }
  const literalControls = validateMutationControlReport(mutationReports[0], {
    path: "oracle.mutationControls.literal", requiredIds: CAPTURE_MUTATION_CONTROL_IDS,
    allowAdditionalControls: false, normalizeIdFromName: true,
  });
  const mutationApplications = aggregateMutationControlReports(mutationReports, [...scenarios.keys()]);
  oracleSummary = {
    schema: "gobi.module-effects-oracle-summary/v1", status: "matched", nativeChecks, parityChecks,
    mutationControls: {
      ...literalControls,
      mutationControlsDetected: literalControls.rejected.filter((item) => item.rejected === true).length,
    },
    mutationControlApplications: mutationApplications,
    conformanceCaptureMutationControls: conformanceSummary.captureMutationControls,
    buildAdmission: buildSummary.admission,
    buildAdmissionMutationControls: conformanceSummary.buildIndex.mutationControls,
  };
  await writeJSON(join(attemptRoot, "oracle/summary.json"), oracleSummary);
  return oracleSummary;
}

async function serveStatic(siteRoot) {
  const canonicalRoot = await realpath(siteRoot);
  const types = new Map([[".html", "text/html"], [".mjs", "text/javascript"], [".css", "text/css"], [".json", "application/json"]]);
  const server = createServer((request, response) => {
    let requested;
    try { requested = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname.slice(1)); }
    catch { response.writeHead(400).end("invalid URL"); return; }
    const relativePath = requested || "index.html";
    const path = resolve(canonicalRoot, relativePath);
    if (!path.startsWith(`${canonicalRoot}${sep}`)) { response.writeHead(400).end("invalid path"); return; }
    const stream = createReadStream(path);
    stream.once("error", () => { if (!response.headersSent) response.writeHead(404); response.end("not found"); });
    response.writeHead(200, { "content-type": `${types.get(extname(path)) ?? "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    stream.pipe(response);
  });
  await new Promise((listen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", listen); });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function runDemo(buildsRoot) {
  currentStage = "real-timer-demo-build";
  const output = join(attemptRoot, "demo/site");
  const stdout = await execute("effects-demo-build", nodeExecutable, [
    join(here, "demo/build.mjs"), "--build-index", join(buildsRoot, "build-index.json"), "--output", output,
  ], { cwd: root, env: {}, maxBuffer: 64 * 1024 * 1024, captureOutput: false });
  demoSummary = parseSingleJSON(stdout, "module effects demo build");
  if (demoSummary.schema !== "gobi.module-effects-demo-build/v1" || demoSummary.status !== "passed" || !demoSummary.output?.sha256) {
    throw new Error("module effects demo build did not produce its pinned site bundle");
  }
  return output;
}

async function runDemoBrowser(siteRoot) {
  currentStage = "mounted-timer-demo-smoke";
  const server = await serveStatic(siteRoot);
  let browser;
  const pageErrors = [];
  const failedRequests = [];
  const steps = [];
  try {
    const { chromium } = await import(pathToFileURL(join(root, "interaction/node_modules/playwright/index.mjs")).href);
    browser = await chromium.launch(chromiumLaunchOptions(chromiumPath));
    const page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" }));
    const response = await page.goto(server.url, { waitUntil: "load", timeout: 20000 });
    if (!response || response.status() !== 200) throw new Error("module effects demo did not return HTTP 200");
    await page.locator("#effects-status[data-state='ready']").waitFor({ timeout: 20000 });
    await page.waitForFunction(() => typeof window.moduleEffectsDemo?.snapshot === "function", null, { timeout: 20000 });

    const child = (key) => `#effects-modules [data-gobi-module-root='child-${key}']`;
    const clickHTMLElement = async (selector) => page.evaluate((query) => {
      const element = document.querySelector(query);
      if (!(element instanceof HTMLElement)) throw new Error(`missing HTMLElement: ${query}`);
      element.click();
    }, selector);
    const waitForStatus = async (key, pattern) => page.waitForFunction(({ selector, pattern: source }) => {
      const text = document.querySelector(`${selector} .effect-request-status`)?.textContent ?? "";
      return new RegExp(source).test(text);
    }, { selector: child(key), pattern: pattern.source }, { timeout: 10000 });
    const waitForCounter = async (key, expected) => page.waitForFunction(({ selector, key: childKey, expectedCount }) => {
      const snapshot = window.moduleEffectsDemo.snapshot();
      const childState = snapshot.children.find((item) => item.key === childKey);
      const text = document.querySelector(`${selector} .counter`)?.textContent ?? "";
      return Number(childState?.goState?.Core?.Counter?.Count) === expectedCount && text.includes(`Count: ${expectedCount}`);
    }, { selector: child(key), key, expectedCount: expected }, { timeout: 10000 });
    const waitForBackend = (backend) => page.waitForFunction((expected) => window.moduleEffectsDemo.snapshot().backend === expected, backend);
    const clickParentButton = async (label) => page.evaluate(({ selector, text }) => {
      const button = [...document.querySelectorAll(selector)].find((item) => item.textContent?.trim() === text);
      if (!(button instanceof HTMLElement)) throw new Error(`missing parent button ${text}`);
      button.click();
    }, { selector: "#effects-modules [data-gobi-module-root='parent'] button", text: label });
    const state = () => page.evaluate(() => window.moduleEffectsDemo.snapshot());
    const transportLog = () => page.evaluate(() => window.moduleEffectsDemo.transportLog());

    await page.waitForFunction(() => document.querySelectorAll("#effects-modules [data-gobi-module-root^='child-']").length === 2);
    const initial = await state();
    steps.push({ name: "initial-two-key-mount", passed: true });

    await clickHTMLElement(`${child("a")} .effect-request-controls button:first-child`);
    await waitForStatus("a", /^Saving$/);
    const firstSave = page.locator(`${child("a")} .effect-request-controls button:first-child`);
    const firstCancel = page.locator(`${child("a")} .effect-request-controls button:last-child`);
    if (!(await firstSave.isDisabled()) || (await firstCancel.isDisabled())) throw new Error("Go pending state did not disable Save and enable Cancel");
    steps.push({ name: "request-pending-and-disabled-controls", passed: true });

    await clickHTMLElement(`${child("a")} .effect-request-controls button:last-child`);
    await waitForStatus("a", /^Ready$/);
    steps.push({ name: "go-declared-cancel", passed: true });

    await clickHTMLElement("#effects-backend-react");
    await waitForBackend("react");
    const idleSave = page.locator(`${child("a")} .effect-request-controls button:first-child`);
    if (await idleSave.isDisabled()) throw new Error("Save was disabled while idle immediately after the React renderer swap");
    await clickHTMLElement(`${child("a")} .counter button:nth-of-type(1)`);
    await waitForCounter("a", 1);
    await clickHTMLElement(`${child("a")} .effect-request-controls button:first-child`);
    await waitForStatus("a", /^Saving$/);
    const aSave = page.locator(`${child("a")} .effect-request-controls button:first-child`);
    const aCancel = page.locator(`${child("a")} .effect-request-controls button:last-child`);
    if (!(await aSave.isDisabled()) || (await aCancel.isDisabled())) throw new Error("React renderer did not expose Go pending Save/Cancel state");
    steps.push({ name: "react-swap-immediate-real-add-and-idle-save-clicks", passed: true });

    await clickHTMLElement("#effects-backend-dom");
    await waitForBackend("dom");
    await waitForStatus("a", /^Saving$/);
    await waitForStatus("a", /^Saved: a:g1:r2$/);
    steps.push({ name: "renderer-swap-preserves-pending-timer", passed: true });

    await clickHTMLElement("#effects-backend-react");
    await waitForBackend("react");

    await clickHTMLElement(`${child("b")} .effect-request-controls button:first-child`);
    await waitForStatus("b", /^Saving$/);
    await clickParentButton("Remove b");
    await page.waitForFunction(() => !document.querySelector("#effects-modules [data-gobi-module-root='child-b']"));
    await clickParentButton("Mount b");
    await page.waitForFunction(() => document.querySelector("#effects-modules [data-gobi-module-root='child-b']"));
    await clickHTMLElement(`${child("b")} .counter button:nth-of-type(1)`);
    await waitForCounter("b", 1);
    await clickHTMLElement(`${child("b")} .effect-request-controls button:first-child`);
    await waitForStatus("b", /^Saving$/);
    await waitForStatus("b", /^Saved: b:g2:r1$/);
    const final = await state();
    const remountedB = final.children.find((item) => item.key === "b");
    if (!remountedB || remountedB.generation !== 2 || remountedB.goState?.Mounted !== true ||
        remountedB.goState?.RequestID !== 1 || remountedB.goState?.Pending !== false ||
        remountedB.goState?.Reply !== "b:g2:r1" || Number(remountedB.goState?.Core?.Counter?.Count) !== 1) {
      throw new Error(`remounted key b did not hold its new Go-owned request/reply state: ${JSON.stringify(remountedB)}`);
    }
    const transport = await transportLog();
    const removalCancellation = transport.some((record) => record.token === "b:g1:r1" && record.kind === "cancel" && record.status === "cancelled");
    if (!removalCancellation) throw new Error("removing a pending key did not run its declared Go cancellation");
    const trace = await page.evaluate(() => window.moduleEffectsDemo.trace());
    const removalRows = trace.lifecycle.filter((row) => row.key === "b" && row.generation === 1);
    const removalOrder = assertUnmountLifecycleOrder(removalRows, { key: "b", generation: 1 });
    const timerCompleted = ["a:g1:r2", "b:g2:r1"].every((token) =>
      transport.some((record) => record.kind === "timer-reply" && record.token === token && record.status === "accepted"));
    if (!timerCompleted) throw new Error("timer transport did not deliver and accept both uncancelled request token echoes");
    const startObservations = await page.evaluate(() => window.moduleEffectsDemo.transportStartObservations());
    const expectedStartTokens = ["a:g1:r1", "a:g1:r2", "b:g1:r1", "b:g2:r1"];
    if (JSON.stringify(startObservations.map((item) => item.token)) !== JSON.stringify(expectedStartTokens) ||
      startObservations.some((item) => item.goPending !== true || item.goToken !== item.token || item.statusLabel !== "Saving" ||
        item.saveDisabled !== true || item.cancelDisabled !== false) || startObservations[1].backend !== "react" ||
      startObservations[2].backend !== "react" || startObservations[3].backend !== "react") {
      throw new Error(`transport.start did not observe committed pending Go and actual rendered browser controls: ${JSON.stringify(startObservations)}`);
    }
    steps.push({ name: "swap-remove-remount-real-child-actions", passed: true });
    if (pageErrors.length !== 0 || failedRequests.length !== 0) throw new Error(`demo browser errors: ${JSON.stringify({ pageErrors, failedRequests })}`);
    demoSummary.httpSmoke = {
      schema: "gobi.module-effects-demo-http-smoke/v1", status: "passed", httpStatus: response.status(),
      initial, final, steps, transport, removalRows, trace, pageErrors, failedRequests,
      startObservations, removalOrder,
      browserInput: "HTMLElement.click()",
    };
    await writeJSON(join(attemptRoot, "demo/http-smoke.json"), demoSummary.httpSmoke);
  } catch (error) {
    await writeJSON(join(attemptRoot, "demo/http-smoke.failed.json"), {
      schema: "gobi.module-effects-demo-http-smoke-failure/v1", status: "failed",
      url: server.url, pageErrors, failedRequests,
      error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null },
    }).catch(() => {});
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise((done) => server.server.close(done));
  }
}

async function copySourceSnapshot(pins) {
  for (const [path, expected] of Object.entries(pins)) {
    const bytes = await readFile(join(root, path));
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error(`source changed before snapshot copy: ${path}`);
    const target = join(attemptRoot, "source", path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx", mode: 0o444 });
  }
}

async function inventoryAttempt() {
  const files = await walkFiles(attemptRoot);
  const members = [];
  const excludedDuplicateLogs = [];
  const excludedRegenerableBundles = [];
  const expectedBundles = new Set(MODULE_EFFECTS_SCENARIOS.map((scenario) => `conformance/effects.${scenario}.browser.bundle.mjs`));
  for (const path of files) {
    const bytes = await readFile(path);
    const pin = { path: relative(attemptRoot, path).split(sep).join("/"), bytes: bytes.length, sha256: sha256(bytes) };
    if (pin.path.startsWith("conformance/") && basename(path).endsWith(".browser.bundle.mjs")) {
      if (!expectedBundles.has(pin.path) || pin.bytes === 0) throw new Error(`unexpected or empty regenerable conformance bundle: ${pin.path}`);
      excludedRegenerableBundles.push(pin);
    } else {
      members.push(pin);
    }
  }
  const excludedBundleNames = excludedRegenerableBundles.map((item) => item.path).sort();
  if (JSON.stringify(excludedBundleNames) !== JSON.stringify([...expectedBundles].sort())) {
    throw new Error("archive inventory does not contain the exact four pinned regenerable browser bundles");
  }
  return {
    members: members.sort((left, right) => left.path.localeCompare(right.path)),
    excludedDuplicateLogs: excludedDuplicateLogs.sort((left, right) => left.path.localeCompare(right.path)),
    excludedRegenerableBundles: excludedRegenerableBundles.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

async function independentConsumer(manifestPath, archivePath) {
  currentStage = "independent-archive-consumer";
  const python = [
    "import hashlib,json,sys,tarfile",
    "archive,manifest_path=sys.argv[1:3]",
    "manifest=json.load(open(manifest_path,encoding='utf-8'))",
    "archive_bytes=open(archive,'rb').read()",
    "archive_digest=hashlib.sha256(archive_bytes).hexdigest()",
    "if len(archive_bytes)!=manifest['archive']['bytes'] or archive_digest!=manifest['archive']['sha256']: raise SystemExit('archive bytes differ from manifest pin')",
    "rows=manifest['members']; expected={item['path']:item for item in rows}",
    "if len(expected)!=len(rows): raise SystemExit('manifest has duplicate members')",
    "with tarfile.open(archive,'r:gz') as tf:",
    " members=tf.getmembers(); actual={}",
    " for member in members:",
    "  name=member.name[2:] if member.name.startswith('./') else member.name",
    "  if name in actual: raise SystemExit('duplicate archive member: '+name)",
    "  if name.startswith('/') or any(part in ('','.','..') for part in name.split('/')): raise SystemExit('unsafe archive member: '+name)",
    "  if not member.isfile(): raise SystemExit('non-regular archive member: '+name)",
    "  actual[name]=member",
    " if set(actual)!=set(expected): raise SystemExit('archive member set differs from manifest')",
    " for name,pin in expected.items():",
    "  stream=tf.extractfile(actual[name]); data=stream.read() if stream else b''",
    "  digest=hashlib.sha256(data).hexdigest()",
    "  if len(data)!=pin['bytes'] or digest!=pin['sha256']: raise SystemExit('archive member mismatch: '+name)",
    "print(json.dumps({'status':'passed','members':len(actual),'archiveBytes':len(archive_bytes),'archiveSHA256':archive_digest},sort_keys=True))",
  ].join("\n");
  const output = await execute("independent-python-archive-consumer", pythonExecutable, [
    "-c", python, archivePath, manifestPath,
  ], { cwd: root, env: {}, logDir: join(evidenceRoot, "consumer-logs") });
  return parseSingleJSON(output, "independent Python archive consumer");
}

async function archiveAttempt(sourcePinsAfter) {
  currentStage = "archive-source-snapshot-and-round-trip";
  const changes = changedPins(sourcePinsBefore, sourcePinsAfter);
  if (changes.length) throw new Error(`source changed during run: ${changes.join(", ")}`);
  await copySourceSnapshot(sourcePinsBefore);
  const pinsAfterCopy = await snapshotSourcePins();
  const copyChanges = changedPins(sourcePinsBefore, pinsAfterCopy);
  if (copyChanges.length) throw new Error(`source changed while snapshot was copied: ${copyChanges.join(", ")}`);
  const testSourceFilesPinned = Object.keys(sourcePinsBefore).filter((path) => path.endsWith(".test.mjs") || path.endsWith("_test.go"));
  await writeImmutableSnapshot(join(attemptRoot, "execution-before-archive.json"), {
    schema: "gobi.module-effects-execution-snapshot/v1", sourceCommit: sourceCommitArgument,
    verifierGitHead: gitStart.head, verifierGitDirty: gitStart.dirty,
    verifierSourcePinsMatch: gitStart.sourcePinsMatch, sourcePinMismatches: gitStart.sourcePinMismatches,
    sourcePins: sourcePinsBefore, testSourceFilesPinned, sourceClosureScope,
    counts: {
      builds: buildCalls,
      conformance: conformanceSummary.captureCounts,
      nodeTests: nodeTestSummary.node.tests,
      conformanceCaptureMutationControls: conformanceSummary.captureMutationControlsDetected,
      buildAdmissionMutationControls: conformanceSummary.buildAdmissionMutationControlsDetected,
      independentCaptureMutationControls: oracleSummary.mutationControls.mutationControlsDetected,
      independentCaptureMutationControlApplications: oracleSummary.mutationControlApplications.mutationControlsDetected,
    },
    commands: commandRecords,
  });
  const inventory = await inventoryAttempt();
  const members = inventory.members;
  const archiveVerifyRoot = await mkdtemp(join(tmpdir(), "gobi-module-effects-archive-verify-"));
  const produced = await archiveAndVerify({
    attemptRoot, archivePath, verifyRoot: archiveVerifyRoot,
    includePaths: ["source", "builds", "native", "scenarios", "conformance", "demo", "oracle", "metadata", "logs", "execution-before-archive.json"],
    members,
    execute: async (name, command, args) => execute(`archive-${name}`, command, args, {
      cwd: root, env: {}, logDir: join(evidenceRoot, "archive-logs"), includeInCommands: false,
    }),
    hashPath: async (path) => hashFile(path),
    readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
  }).finally(() => rm(archiveVerifyRoot, { recursive: true, force: true }));
  if (produced.archivedSnapshot?.schema !== "gobi.module-effects-execution-snapshot/v1" ||
      produced.archivedSnapshot.sourceCommit !== sourceCommitArgument ||
      JSON.stringify(produced.archivedSnapshot.sourcePins) !== JSON.stringify(sourcePinsBefore)) {
    throw new Error("archive round-trip did not preserve the exact source snapshot and commit");
  }
  const archivePin = await hashFile(archivePath);
  const archiveManifest = {
    schema: "gobi.module-effects-archive-manifest/v1", sourceCommit: sourceCommitArgument,
    verifierGitHead: gitStart.head, verifierGitDirty: gitStart.dirty,
    verifierSourcePinsMatch: gitStart.sourcePinsMatch, sourcePinMismatches: gitStart.sourcePinMismatches,
    sourcePins: sourcePinsBefore, testSourceFilesPinned, sourceClosureScope,
    members, excludedDuplicateLogs: inventory.excludedDuplicateLogs,
    excludedRegenerableBundles: inventory.excludedRegenerableBundles,
    archive: { path: archivePath, bytes: archivePin.bytes, sha256: archivePin.sha256 }, archivedSnapshotVerified: true,
  };
  const manifestPath = join(dirname(archivePath), `${attemptId}.manifest.json`);
  const manifestHash = await writeJSON(manifestPath, archiveManifest);
  const consumer = await independentConsumer(manifestPath, archivePath);
  if (consumer.status !== "passed" || consumer.members !== members.length ||
      consumer.archiveBytes !== archivePin.bytes || consumer.archiveSHA256 !== archivePin.sha256) {
    throw new Error("independent archive consumer did not verify the frozen member inventory");
  }
  const archiveLogRoot = join(evidenceRoot, "archive-logs");
  const archiveCommands = [];
  for (const name of (await readdir(archiveLogRoot)).filter((value) => value.endsWith(".command.json")).sort()) {
    archiveCommands.push(JSON.parse(await readFile(join(archiveLogRoot, name), "utf8")));
  }
  return { archiveManifest, archiveManifestPath: manifestPath, manifestHash, consumer, archiveCommands };
}

let attemptId;
let attemptRoot;
let evidenceRoot;
let logsRoot;
let archivePath;
let sourcePinsBefore;
let gitStart;
let currentStage = "argument-validation";
let chromiumPath;
let toolchain;
let buildSummary;
let buildCalls;
let buildIndexPath;
let buildIndexBytes;
let buildIndex;
let buildOutput;
let nodeTestSummary;
let conformanceSummary;
let oracleSummary;
let demoSummary;
let sourceCommitArgument;

async function writeFailure(error, args) {
  if (!evidenceRoot) return;
  await writeJSON(join(evidenceRoot, "failure.json"), {
    schema: "gobi.module-effects-delivery-failure/v1", status: "failed",
    sourceCommit: args.sourceCommit, git: gitStart ?? null, stage: currentStage,
    error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null },
    sourcePinsBefore: sourcePinsBefore ?? null, commands: commandRecords, attemptRoot, archivePath,
  }).catch(() => {});
}

async function run(args) {
  sourceCommitArgument = args.sourceCommit;
  const now = new Date().toISOString().replace(/[-:.]/g, "");
  attemptId = `attempt-${now}-${process.pid}-${randomUUID().slice(0, 8)}`;
  attemptRoot = join(args.outputRoot, attemptId);
  evidenceRoot = join(here, "evidence/attempts", attemptId);
  archivePath = join(args.outputRoot, `${attemptId}.tar.gz`);
  logsRoot = join(attemptRoot, "logs");
  await createExclusiveAttemptDirectory(attemptRoot);
  await mkdir(dirname(evidenceRoot), { recursive: true });
  await mkdir(evidenceRoot, { recursive: false });
  await mkdir(logsRoot, { recursive: true });

  currentStage = "toolchain-and-source-snapshot";
  const rootGo = await toolVersion("go-version", goExecutable, ["version"], { env: rootGoEnv });
  if (!/go version go1\.24\./.test(rootGo)) throw new Error(`Go 1.24 required, got ${rootGo}`);
  if (Number(process.versions.node.split(".")[0]) !== 22) throw new Error(`Node 22 required, got v${process.versions.node}`);
  const compilerGo = await toolVersion("compiler-go-version", goExecutable, ["version"], { cwd: compilerDir, env: compilerGoEnv });
  if (!/go version go1\.27\.3/.test(compilerGo)) throw new Error(`compiler Go 1.27.3 required, got ${compilerGo}`);
  const python = await toolVersion("python-version", pythonExecutable, ["--version"], { env: {}, logDir: join(evidenceRoot, "consumer-logs") });
  const tar = await toolVersion("tar-version", "tar", ["--version"], { env: {} });
  if (args.chromium) chromiumPath = args.chromium;
  else if (process.env.CHROMIUM_PATH) chromiumPath = resolve(process.env.CHROMIUM_PATH);
  else if (process.env.CHROMIUM_EXECUTABLE_PATH) chromiumPath = resolve(process.env.CHROMIUM_EXECUTABLE_PATH);
  else {
    const { chromium } = await import(pathToFileURL(join(root, "interaction/node_modules/playwright/index.mjs")).href);
    chromiumPath = chromium.executablePath();
  }
  const chromiumVersion = await toolVersion("chromium-version", chromiumPath, ["--version"], { env: {} });
  const playwright = JSON.parse(await readFile(join(root, "interaction/node_modules/playwright/package.json"), "utf8"));
  toolchain = {
    goExecutable, go: rootGo, compilerGo: compilerGo.replace(/^go version /, ""),
    nodeExecutable, node: `v${process.versions.node}`, pythonExecutable, python,
    chromiumPath, chromium: chromiumVersion, playwright: playwright.version,
    tar: tar.split(/\r?\n/)[0], platform: process.platform, architecture: process.arch,
  };
  gitStart = await gitMetadata("before");
  if (args.sourceCommit !== gitStart.head) throw new Error(`source commit ${args.sourceCommit} does not match Git HEAD ${gitStart.head}`);
  if (gitStart.dirty && !args.allowDirty) throw new Error("working tree is dirty; use --allow-dirty for an author-only diagnostic");
  sourcePinsBefore = await snapshotSourcePins();
  const sourceClosure = await compareSourcePinsToGit(sourcePinsBefore, gitStart.head);
  gitStart.sourcePinsMatch = sourceClosure.sourcePinsMatch && !gitStart.dirty;
  gitStart.sourcePinMismatches = sourceClosure.mismatches;
  if (!gitStart.dirty && !gitStart.sourcePinsMatch) throw new Error(`clean source pins differ from Git HEAD: ${sourceClosure.mismatches.join(", ")}`);
  await writeJSON(join(attemptRoot, "metadata/source-pins-before.json"), sourcePinsBefore);
  await writeJSON(join(attemptRoot, "metadata/git-source-closure.json"), gitStart);
  await writeJSON(join(attemptRoot, "metadata/runner-context.json"), {
    schema: "gobi.module-effects-run-context/v1", sourceCommit: args.sourceCommit,
    verifierGitHead: gitStart.head, verifierGitDirty: gitStart.dirty,
    verifierSourcePinsMatch: gitStart.sourcePinsMatch, sourcePinMismatches: gitStart.sourcePinMismatches,
    tools: toolchain, sourceClosureScope, dirtyAllowed: args.allowDirty,
  });

  await runBuilds();
  await runTests();
  const profileCaptures = await runConformance(args);
  await runOracle(profileCaptures);
  const siteRoot = await runDemo(buildOutput);
  await runDemoBrowser(siteRoot);

  currentStage = "final-source-stability";
  const sourcePinsAfter = await snapshotSourcePins();
  const changed = changedPins(sourcePinsBefore, sourcePinsAfter);
  if (changed.length) throw new Error(`source inputs changed during profile: ${changed.join(", ")}`);
  const gitEnd = await gitMetadata("after");
  if (gitEnd.head !== gitStart.head || gitEnd.status !== gitStart.status) throw new Error("Git HEAD or working-tree status changed during profile");
  await writeJSON(join(attemptRoot, "metadata/source-pins-after.json"), sourcePinsAfter);
  await writeJSON(join(attemptRoot, "metadata/git-source-closure-after.json"), gitEnd);
  const archive = await archiveAttempt(sourcePinsAfter);

  currentStage = "final-delivery-receipt";
  const receipt = {
    schema: "gobi.module-effects-delivery-receipt/v1",
    status: gitStart.sourcePinsMatch ? "passed" : "author-only",
    sourceCommit: args.sourceCommit,
    verifier: { gitHead: gitStart.head, dirty: gitStart.dirty, sourcePinsMatch: gitStart.sourcePinsMatch, sourcePinMismatches: gitStart.sourcePinMismatches },
    sourceClosureScope,
    attempt: { id: attemptId, path: attemptRoot }, tools: toolchain,
    counts: {
      buildCalls,
      sourcePins: Object.keys(sourcePinsBefore).length,
      testSourceFilesPinned: Object.keys(sourcePinsBefore).filter((path) => path.endsWith(".test.mjs") || path.endsWith("_test.go")).length,
      goTestPackagesExecuted: nodeTestSummary.go.packages,
      compilerRegressionTests: nodeTestSummary.compilerRegression.tests,
      compilerRegressionTestNames: nodeTestSummary.compilerRegression.testNames,
      buildStageRegressionTests: nodeTestSummary.buildStageRegressions.tests,
      buildStageRegressionTestNames: nodeTestSummary.buildStageRegressions.testNames,
      moduleABIRegressionTests: nodeTestSummary.moduleABIRegression.tests,
      moduleABIRegressionTestName: nodeTestSummary.moduleABIRegression.testName,
      nodeTests: nodeTestSummary.node.tests,
      nodeTestFilesExecuted: nodeTestSummary.node.files.length,
      scenarios: conformanceSummary.captureCounts.scenarios,
      nativeEvents: conformanceSummary.captureCounts.nativeEvents,
      profileEvents: conformanceSummary.captureCounts.profileEvents,
      snapshots: conformanceSummary.captureCounts.snapshots,
      nativeStates: conformanceSummary.captureCounts.nativeStates,
      nativeEffects: conformanceSummary.captureCounts.nativeEffects,
      nativeTransportEvents: conformanceSummary.captureCounts.nativeTransportEvents,
      nativeLifecycleEvents: conformanceSummary.captureCounts.nativeLifecycleEvents,
      retiredChildren: conformanceSummary.captureCounts.retiredChildren,
      profileTransportEvents: conformanceSummary.captureCounts.profileTransportEvents,
      ledgerEvents: conformanceSummary.captureCounts.ledgerEvents,
      orderedLedgerEvents: conformanceSummary.captureCounts.orderedLedgerEvents,
      mutationControlsDetected: oracleSummary.mutationControls.mutationControlsDetected,
      mutationControlApplicationsDetected: oracleSummary.mutationControlApplications.mutationControlsDetected,
      mutationControlApplicationCount: oracleSummary.mutationControlApplications.total,
      mutationControlDistinctIDs: oracleSummary.mutationControlApplications.distinctControlIds.length,
      conformanceCaptureMutationControlsDetected: conformanceSummary.captureMutationControlsDetected,
      buildAdmissionMutationControlsDetected: conformanceSummary.buildAdmissionMutationControlsDetected,
      demoSteps: demoSummary.httpSmoke.steps.length,
    },
    buildSummary, buildIndex: { path: relative(attemptRoot, buildIndexPath).split(sep).join("/"), bytes: buildIndexBytes.length, sha256: sha256(buildIndexBytes) },
    tests: nodeTestSummary, conformance: conformanceSummary, oracle: oracleSummary, demo: demoSummary,
    sourcePins: sourcePinsBefore, archive: {
      path: archivePath, bytes: archive.archiveManifest.archive.bytes, sha256: archive.archiveManifest.archive.sha256,
      manifestPath: archive.archiveManifestPath, manifestSHA256: archive.manifestHash.sha256,
      members: archive.archiveManifest.members.length, independentConsumer: archive.consumer, commands: archive.archiveCommands,
      excludedDuplicateLogs: archive.archiveManifest.excludedDuplicateLogs,
      excludedRegenerableBundles: archive.archiveManifest.excludedRegenerableBundles,
    },
    commands: commandRecords,
  };
  await writeJSON(join(evidenceRoot, "receipt.json"), receipt);
  process.stdout.write(`${JSON.stringify({
    schema: "gobi.module-effects-delivery-summary/v1", status: receipt.status, sourceCommit: args.sourceCommit,
    attempt: attemptId, buildCalls, counts: receipt.counts, archive: receipt.archive,
    receiptPath: join(evidenceRoot, "receipt.json"),
  })}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Usage: node compiled-module-effects/run.mjs --source-commit <40-char-sha> [--chromium <executable>] [--allow-dirty] [--output-root <dir>]\n");
    return;
  }
  try { await run(args); }
  catch (error) {
    await writeFailure(error, args);
    process.stderr.write(`${currentStage}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

await main();
