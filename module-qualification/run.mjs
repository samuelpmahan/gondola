import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { archiveAndVerify, createExclusiveAttemptDirectory } from "../compiled-capabilities/archive-helper.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const moduleQualificationRoot = join(root, "module-qualification");
const producerRunner = join(root, "run-compiled-modules.sh");
const fixedScenario = "fixtures/compiled/moduleparent/scenario.json";
const seedValues = [20261031, 20261032, 20261033];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = () => new Date().toISOString();
const safeName = (value) => value.replace(/[^a-zA-Z0-9._-]+/g, "-");
const commandRecords = [];
const archiveCommandRecords = [];
let attemptId;
let attemptRoot;
let bundleRoot;
let currentStage = "argument-validation";
let sourceCommit;
let sourceBefore;
let chromiumPath;
let goExecutable;
let pythonExecutable;

const runnerSourcePaths = [
  "run-module-qualification.sh",
  "module-qualification/run.mjs",
  "module-qualification/run.test.mjs",
  "module-qualification/README.md",
  "module-qualification/RESULTS.md",
  "module-qualification/.gitignore",
  "compiled-capabilities/archive-helper.mjs",
  ".github/workflows/gobi-native-module-qualification.yml",
];

const sourceDirectories = [
  "modulequalification",
  "cmd/module-qualify",
  "moduleabi",
  "gobi",
  "compilercontract",
  "counter",
  "cmd/compiled-modules-native",
  "fixtures/compiled/modulewire",
  "fixtures/compiled/moduleparent",
  "fixtures/compiled/modulechild",
  "compiled-modules/abi",
  "compiled-modules/conformance",
  "compiled-modules/oracle",
  "compiled-modules/runtime",
  "module-qualification/controls",
];

const sourceFiles = [
  "go.mod",
  "run-compiled-modules.sh",
  "run.sh",
  "run-interaction.sh",
  "compiled-modules/run.mjs",
  "compiled-capabilities/archive-helper.mjs",
  "compiled-capabilities/archive-helper.test.mjs",
];

const ignoredSourceDirectories = new Set([
  ".git", "node_modules", "output", "evidence", "attempts", "__pycache__", ".cache", "vendor",
]);

export function resolveExecutable(overrideName, defaultName, env = process.env) {
  const override = env[overrideName];
  const requested = typeof override === "string" && override.trim() !== "" ? override.trim() : defaultName;
  const hasPath = isAbsolute(requested) || requested.includes("/") || requested.includes("\\");
  const candidates = hasPath
    ? [resolve(requested)]
    : (env.PATH ?? "").split(delimiter).filter(Boolean).map((directory) => resolve(directory, requested));
  for (const candidate of candidates) {
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep searching PATH entries; an explicit path still has only one
      // candidate, so a bad GOBI_* override never falls back to the default.
    }
  }
  throw new Error(`${overrideName} or PATH selection ${JSON.stringify(requested)} is not an executable file`);
}

function parseArgs(argv) {
  const args = { sourceCommit: null, chromium: null, outputRoot: join(moduleQualificationRoot, "output/attempts") };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--help") return { help: true };
    if (!["--source-commit", "--chromium", "--output-root"].includes(name)) throw new Error(`unknown argument ${name}`);
    if (seen.has(name)) throw new Error(`${name} may only appear once`);
    seen.add(name);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    if (name === "--source-commit") args.sourceCommit = value;
    if (name === "--chromium") args.chromium = resolve(value);
    if (name === "--output-root") args.outputRoot = resolve(value);
  }
  if (!/^[0-9a-f]{40}$/.test(args.sourceCommit ?? "")) {
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

async function hashPath(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

async function fileExists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function commandRecord(name, command, args, options, result, files) {
  return {
    name,
    argv: [command, ...args],
    cwd: options.cwd ?? root,
    startedAt: options.startedAt,
    finishedAt: stamp(),
    exitCode: result.status ?? (result.signal ? 128 : 1),
    signal: result.signal ?? null,
    environment: options.recordedEnv ?? {},
    stdout: files.stdout,
    stderr: files.stderr,
  };
}

async function execute(name, command, args, options = {}) {
  const logRoot = options.logRoot ?? join(bundleRoot, "commands");
  await mkdir(logRoot, { recursive: true });
  const startedAt = stamp();
  const environment = options.env ?? {};
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...environment },
    input: options.input,
    encoding: null,
    maxBuffer: options.maxBuffer ?? 512 * 1024 * 1024,
  });
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  const stem = safeName(name);
  const stdoutPath = join(logRoot, `${stem}.stdout.bin`);
  const stderrPath = join(logRoot, `${stem}.stderr.bin`);
  await writeFile(stdoutPath, stdout, { flag: "wx", mode: 0o644 });
  await writeFile(stderrPath, stderr, { flag: "wx", mode: 0o644 });
  const record = commandRecord(name, command, args, { ...options, startedAt }, result, {
    stdout: { path: relative(attemptRoot, stdoutPath).split(sep).join("/"), bytes: stdout.length, sha256: sha256(stdout) },
    stderr: { path: relative(attemptRoot, stderrPath).split(sep).join("/"), bytes: stderr.length, sha256: sha256(stderr) },
  });
  const commandPath = join(logRoot, `${stem}.command.json`);
  await writeJSON(commandPath, record);
  record.commandRecordPath = relative(attemptRoot, commandPath).split(sep).join("/");
  commandRecords.push(record);
  if (result.error) throw Object.assign(new Error(`${name}: ${result.error.message}`), { commandRecord: record });
  if (result.status !== 0) {
    throw Object.assign(new Error(`${name} exited ${result.status ?? result.signal}: ${stderr.toString("utf8").trim()}`), { commandRecord: record });
  }
  return stdout;
}

async function runArchiveCommand(name, command, args, options = {}) {
  const startedAt = stamp();
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: null,
    maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024,
  });
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  const archiveLogRoot = join(attemptRoot, "archive-logs");
  await mkdir(archiveLogRoot, { recursive: true });
  const stem = safeName(name);
  const stdoutPath = join(archiveLogRoot, `${stem}.stdout.bin`);
  const stderrPath = join(archiveLogRoot, `${stem}.stderr.bin`);
  await writeFile(stdoutPath, stdout, { flag: "wx", mode: 0o644 });
  await writeFile(stderrPath, stderr, { flag: "wx", mode: 0o644 });
  const record = {
    name, argv: [command, ...args], cwd: options.cwd ?? root, startedAt, finishedAt: stamp(),
    exitCode: result.status ?? 1,
    stdout: { path: relative(attemptRoot, stdoutPath).split(sep).join("/"), bytes: stdout.length, sha256: sha256(stdout) },
    stderr: { path: relative(attemptRoot, stderrPath).split(sep).join("/"), bytes: stderr.length, sha256: sha256(stderr) },
  };
  archiveCommandRecords.push(record);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status}: ${stderr.toString("utf8").trim()}`);
  return stdout.toString("utf8");
}

async function walkFiles(directory, { sourceTree = false } = {}) {
  const output = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (sourceTree && ignoredSourceDirectories.has(entry.name)) continue;
      output.push(...await walkFiles(path, { sourceTree }));
    } else if (entry.isFile()) {
      output.push(path);
    } else {
      throw new Error(`source inventory has a non-regular entry: ${path}`);
    }
  }
  return output;
}

async function sourceInventory() {
  const paths = new Set(runnerSourcePaths);
  for (const path of sourceFiles) paths.add(path);
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
  const names = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  return names.filter((name) => !before?.[name] || !after?.[name] ||
    before[name].bytes !== after[name].bytes || before[name].sha256 !== after[name].sha256);
}

async function gitInfo(label) {
  const head = (await execute(`git-${label}-head`, "git", ["rev-parse", "HEAD"])).toString("utf8").trim();
  const status = (await execute(`git-${label}-status`, "git", ["status", "--porcelain", "--untracked-files=all"])).toString("utf8").trim();
  return { head, dirty: status.length !== 0, status };
}

function validateSourcePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.includes("\0") ||
      isAbsolute(value) || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`unsafe verifier input path: ${JSON.stringify(value)}`);
  }
  return value;
}

function parseJSONSequence(text, label) {
  const values = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (start < 0) {
      if (/\s/.test(character)) continue;
      if (character !== "{") throw new Error(`${label} expected a JSON object at byte ${index}`);
      start = index;
      depth = 0;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") depth += 1;
    if (character === "}" || character === "]") {
      depth -= 1;
      if (depth < 0) throw new Error(`${label} closed a JSON value early`);
      if (depth === 0) {
        values.push(JSON.parse(text.slice(start, index + 1)));
        start = -1;
      }
    }
  }
  if (start >= 0 || depth !== 0 || inString) throw new Error(`${label} ended with an incomplete JSON value`);
  if (values.length === 0) throw new Error(`${label} returned no JSON packages`);
  return values;
}

function requireReport(report, mode, expectedArchive = null) {
  if (report?.schema !== "gobi.module-qualification-report/v1") throw new Error(`${mode} verifier emitted an unexpected report schema`);
  if (report.sourceCommit !== sourceCommit) throw new Error(`${mode} verifier source commit differs from the producer commit`);
  if (report.sourceIdentity?.head !== sourceCommit || report.sourceIdentity?.dirty !== false || report.sourceIdentity?.sourcePinsMatch !== true) {
    throw new Error(`${mode} verifier did not confirm clean source identity and matching pins`);
  }
  const capture = report.capture;
  if (capture?.profiles !== 12 || capture?.events !== 144 || capture?.updates !== 99 ||
      !Array.isArray(capture?.seeds) || JSON.stringify(capture.seeds) !== JSON.stringify(seedValues)) {
    throw new Error(`${mode} capture report does not match the finite 12-profile fixture counts`);
  }
  if (report.abi?.status !== "passed" || report.abi?.builds !== 4 || report.abi?.pairs !== 2) {
    throw new Error(`${mode} ABI report does not confirm both independently built pairs`);
  }
  if (!Array.isArray(report.inputs) || report.inputs.length === 0) throw new Error(`${mode} verifier omitted its source inputs`);
  if (expectedArchive && (report.archive?.members !== expectedArchive.members || report.archive?.bytes !== expectedArchive.bytes ||
      report.archive?.sourceCommit !== sourceCommit)) {
    throw new Error("archive verifier measurements differ from the upstream artifact manifest");
  }
  return report;
}

async function parseJSONOutput(bytes, label) {
  const text = bytes.toString("utf8").trim();
  if (!text) throw new Error(`${label} produced empty stdout`);
  try { return JSON.parse(text); } catch (error) { throw new Error(`${label} stdout was not one JSON value: ${error.message}`); }
}

async function copyVerifierSourceClosure(destination) {
  const listEnv = { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" };
  const output = await execute("go-list-module-qualifier-dependencies", goExecutable, [
    "list", "-deps", "-test", "-json", "./cmd/module-qualify",
  ], { cwd: root, env: listEnv, recordedEnv: listEnv, maxBuffer: 128 * 1024 * 1024 });
  const packageObjects = parseJSONSequence(output.toString("utf8"), "go list -deps -test -json");
  const paths = new Set(["go.mod"]);
  const packages = [];
  const generatedHarnessFiles = [];
  for (const item of packageObjects) {
    if (item.Module?.Path !== "github.com/samuelpmahan/gondola") continue;
    const directory = item.Dir;
    if (typeof directory !== "string") throw new Error("go list package has no source directory");
    const files = [...(item.GoFiles ?? []), ...(item.CgoFiles ?? []), ...(item.TestGoFiles ?? []),
      ...(item.XTestGoFiles ?? []), ...(item.EmbedFiles ?? [])];
    const packageFiles = [];
    for (const file of files) {
      const absolute = resolve(directory, file);
      const rel = relative(root, absolute).split(sep).join("/");
      if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
        if (absolute.includes(`${sep}.cache${sep}go-build${sep}`)) {
          generatedHarnessFiles.push(absolute);
          continue;
        }
        throw new Error(`go list returned a project source outside the checkout: ${absolute}`);
      }
      validateSourcePath(rel);
      paths.add(rel);
      packageFiles.push(rel);
    }
    packages.push({ directory: relative(root, directory).split(sep).join("/"), files: [...new Set(packageFiles)].sort() });
  }
  if (await fileExists(join(root, "go.sum"))) paths.add("go.sum");
  const controlsPath = "module-qualification/controls/mutations.json";
  // This JSON corpus is read by modulequalification/adversarial_test.go via
  // os.ReadFile, so `go list -deps -test -json` cannot discover it as an
  // EmbedFile. Make it a required, explicitly pinned input to the verifier
  // source closure instead of silently producing an incomplete bundle.
  await readFile(join(root, controlsPath));
  paths.add(controlsPath);
  const copied = [];
  for (const rel of [...paths].sort()) {
    const source = join(root, rel);
    const bytes = await readFile(source);
    const target = join(destination, rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx", mode: 0o444 });
    const copiedBytes = await readFile(target);
    if (sha256(copiedBytes) !== sha256(bytes)) throw new Error(`verifier source copy mismatch: ${rel}`);
    copied.push({ path: rel, bytes: bytes.length, sha256: sha256(bytes) });
  }
  await writeJSON(join(bundleRoot, "metadata/verifier-go-list.json"), {
    schema: "gobi.module-qualification-go-source-closure/v1",
    command: "go list -deps -test -json ./cmd/module-qualify",
    packages,
    generatedGoTestHarnessFiles: generatedHarnessFiles,
    files: copied,
  });
  return copied;
}

async function verifyReportInputs(report, attemptDirectory) {
  if (!Array.isArray(report.inputs) || report.inputs.length === 0) throw new Error("Go verifier report omitted its input inventory");
  const copiedInputs = [];
  for (const input of report.inputs) {
    const rel = validateSourcePath(input.path);
    const source = join(attemptDirectory, rel);
    const bytes = await readFile(source);
    if (bytes.length !== input.bytes || sha256(bytes) !== input.sha256) throw new Error(`Go report input pin mismatch: ${rel}`);
    copiedInputs.push({ path: rel, bytes: input.bytes, sha256: input.sha256 });
  }
  await writeJSON(join(bundleRoot, "metadata/profile-report-inputs.json"), copiedInputs);
  // The runtime archive is already a complete, hash-pinned copy of these
  // profile inputs. Verify each report pin against that producer archive root
  // rather than duplicating every capture/build output into this bundle.
  return copiedInputs;
}

/* Keep the exact report inventory in metadata; the upstream runtime archive
 * carries the payloads. Only the verifier's own Go source closure is copied
 * separately, avoiding a second uncompressed copy of the entire producer run. */
async function copyRunnerInputs(destination) {
  for (const rel of runnerSourcePaths) {
    const source = join(root, rel);
    const bytes = await readFile(source);
    const target = join(destination, rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx", mode: 0o444 });
    const copied = await readFile(target);
    if (sha256(bytes) !== sha256(copied)) throw new Error(`runner source copy mismatch: ${rel}`);
  }
}

function assertProfileReceipt(receipt, summary) {
  if (receipt?.schema !== "gobi.compiled-modules-delivery-receipt/v1" || receipt.status !== "passed") {
    throw new Error("upstream compiled-module producer receipt is absent or not passed");
  }
  if (receipt.sourceCommit !== sourceCommit || receipt.verifier?.gitHead !== sourceCommit ||
      receipt.verifier?.dirty !== false || receipt.verifier?.sourcePinsMatch !== true) {
    throw new Error("upstream producer receipt is not bound to the clean candidate source commit");
  }
  if (summary.status !== "passed" || summary.sourceCommit !== sourceCommit || summary.fixedEvents !== 24 ||
      summary.fixedGoUpdates !== 16 || summary.fixedStateCheckpoints !== 17 || summary.browserProfileCount !== 12 ||
      summary.mutationControlsDetected !== 6 || summary.attempt !== receipt.attempt?.id ||
      JSON.stringify(summary.seededSeeds) !== JSON.stringify(seedValues)) {
    throw new Error("upstream producer summary failed its exact fixed-profile and capture gates");
  }
  if (receipt.counts?.fixedEvents !== 24 || receipt.counts?.fixedGoUpdates !== 16 ||
      receipt.counts?.fixedStateCheckpoints !== 17 || receipt.counts?.browserProfileCount !== 12 ||
      JSON.stringify(receipt.counts?.seededSeeds) !== JSON.stringify(seedValues)) {
    throw new Error("upstream producer receipt does not record the expected fixed and seeded profiles");
  }
  if (receipt.archive?.independentConsumer?.status !== "passed" ||
      receipt.archive.independentConsumer.archiveSHA256 !== receipt.archive.sha256 ||
      receipt.archive.independentConsumer.manifestSHA256 !== receipt.archive.manifestSHA256 ||
      receipt.archive.independentConsumer.members !== receipt.archive.members) {
    throw new Error("upstream producer's post-command archive consumer did not confirm the frozen artifact");
  }
}

async function bundleMemberList(directory) {
  const files = await walkFiles(directory);
  const rows = [];
  for (const absolute of files) {
    const path = relative(attemptRoot, absolute).split(sep).join("/");
    const file = await hashPath(absolute);
    rows.push({ path, bytes: file.bytes, sha256: file.sha256 });
  }
  rows.sort((left, right) => left.path.localeCompare(right.path));
  return rows;
}

async function run(args) {
  sourceCommit = args.sourceCommit;
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  attemptId = `attempt-${timestamp}-${process.pid}`;
  attemptRoot = join(args.outputRoot, attemptId);
  bundleRoot = join(attemptRoot, "bundle");
  await createExclusiveAttemptDirectory(attemptRoot);
  await mkdir(bundleRoot, { recursive: false });
  await mkdir(join(bundleRoot, "commands"), { recursive: true });
  await mkdir(join(bundleRoot, "reports"), { recursive: true });
  await mkdir(join(bundleRoot, "upstream"), { recursive: true });
  await mkdir(join(bundleRoot, "verifier-source"), { recursive: true });

  try {
    currentStage = "toolchain-and-source-snapshot";
    const rootGoEnv = { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" };
    goExecutable = resolveExecutable("GOBI_GO_BIN", "go");
    pythonExecutable = resolveExecutable("GOBI_PYTHON_BIN", "python3");
    const goVersion = (await execute("tool-go-version", goExecutable, ["version"], { env: rootGoEnv, recordedEnv: rootGoEnv })).toString("utf8").trim();
    if (!/go version go1\.24\./.test(goVersion)) throw new Error(`Go 1.24 is required, got ${goVersion}`);
    const compilerEnv = { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" };
    const compilerVersion = (await execute("tool-compiler-go-version", goExecutable, ["version"], {
      cwd: join(root, "compiled-frontend"), env: compilerEnv, recordedEnv: compilerEnv,
    })).toString("utf8").trim();
    if (!compilerVersion.includes("go1.27.3")) throw new Error(`Go compiler toolchain 1.27.3 is required, got ${compilerVersion}`);
    const nodeVersion = `v${process.versions.node}`;
    if (Number(process.versions.node.split(".")[0]) !== 22) throw new Error(`Node 22 is required, got ${nodeVersion}`);
    const nodeReported = (await execute("tool-node-version", process.execPath, ["--version"])).toString("utf8").trim();
    if (nodeReported !== nodeVersion) throw new Error("Node executable version does not match the runner process");
    const tarVersion = (await execute("tool-tar-version", "tar", ["--version"])).toString("utf8").split(/\r?\n/)[0];
    const pythonVersion = (await execute("tool-python-version", pythonExecutable, ["-c", "import sys; print(sys.version.split()[0])"])).toString("utf8").trim();
    const chromiumRaw = args.chromium ?? process.env.CHROMIUM_PATH ?? process.env.CHROMIUM_EXECUTABLE_PATH;
    if (chromiumRaw) {
      chromiumPath = resolve(chromiumRaw);
    } else {
      const { chromium } = await import(pathToFileURL(join(root, "interaction/node_modules/playwright/index.mjs")).href);
      chromiumPath = chromium.executablePath();
    }
    const chromiumVersion = (await execute("tool-chromium-version", chromiumPath, ["--version"])).toString("utf8").trim();
    const playwright = JSON.parse(await readFile(join(root, "interaction/node_modules/playwright/package.json"), "utf8"));
    const gitBefore = await gitInfo("before");
    if (gitBefore.head !== sourceCommit) throw new Error(`--source-commit ${sourceCommit} does not match Git HEAD ${gitBefore.head}`);
    if (gitBefore.dirty) throw new Error(`working tree must be clean before the run: ${gitBefore.status}`);
    sourceBefore = await sourceInventory();
    await writeJSON(join(bundleRoot, "metadata/source-pins-before.json"), sourceBefore);

    currentStage = "portable-tool-resolution-tests";
    const toolTestOutput = await execute("portable-tool-resolution-tests", process.execPath, [
      "--test", join(moduleQualificationRoot, "run.test.mjs"),
    ], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
    const toolTestText = toolTestOutput.toString("utf8");
    if (!/^# tests 4$/m.test(toolTestText) || !/^# pass 4$/m.test(toolTestText) ||
        !/^# fail 0$/m.test(toolTestText) || /^# (?:skipped|todo) [1-9]/m.test(toolTestText)) {
      throw new Error("portable tool-resolution tests did not report four passing tests with no skips");
    }

    const context = {
      schema: "gobi.module-qualification-run-context/v1",
      sourceCommit,
      gitBefore,
      tools: {
        go: goVersion,
        compilerGo: compilerVersion,
        node: nodeVersion,
        platform: process.platform,
        architecture: process.arch,
        chromium: chromiumVersion,
        playwright: playwright.version,
        tar: tarVersion,
        python: pythonVersion,
      },
      fixture: { path: fixedScenario, sha256: sha256(await readFile(join(root, fixedScenario))) },
      seeds: seedValues,
      producerProfile: { command: "bash run-compiled-modules.sh", sourceCommit, freshAttemptRequired: true },
    };
    await writeJSON(join(bundleRoot, "metadata/run-context.json"), context);

    currentStage = "fresh-upstream-profile";
    const upstreamOutputRoot = join(root, "compiled-modules/output/attempts");
    const producerEnv = {
      GOBI_GO_BIN: goExecutable,
      GOBI_PYTHON_BIN: pythonExecutable,
      GOTOOLCHAIN: "local",
      GOFLAGS: "-buildvcs=false",
      CHROMIUM_PATH: chromiumPath,
    };
    const producerStdout = await execute("fresh-compiled-modules-profile", "bash", [
      producerRunner,
      "--source-commit", sourceCommit,
      "--chromium", chromiumPath,
      "--output-root", upstreamOutputRoot,
    ], { cwd: root, env: producerEnv, recordedEnv: producerEnv, maxBuffer: 128 * 1024 * 1024 });
    const producerSummary = await parseJSONOutput(producerStdout, "existing compiled-modules producer");
    const producerReceiptPath = producerSummary.receiptPath;
    if (typeof producerReceiptPath !== "string") throw new Error("producer summary omitted receiptPath");
    const producerReceipt = JSON.parse(await readFile(producerReceiptPath, "utf8"));
    assertProfileReceipt(producerReceipt, producerSummary);
    const producerAttemptRoot = producerReceipt.attempt?.path;
    const archivePath = producerReceipt.archive?.path;
    const manifestPath = producerReceipt.archive?.manifestPath;
    if (!producerAttemptRoot || !archivePath || !manifestPath) throw new Error("producer receipt omitted attempt/archive paths");
    const archiveInfo = await hashPath(archivePath);
    const manifestInfo = await hashPath(manifestPath);
    if (archiveInfo.bytes !== producerReceipt.archive.bytes || archiveInfo.sha256 !== producerReceipt.archive.sha256 ||
        manifestInfo.sha256 !== producerReceipt.archive.manifestSHA256) {
      throw new Error("fresh upstream archive or manifest changed after the producer returned");
    }
    const archiveManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (archiveManifest.sourceCommit !== sourceCommit || archiveManifest.members.length !== producerReceipt.archive.members ||
        archiveManifest.archive?.bytes !== producerReceipt.archive.bytes ||
        archiveManifest.archive?.sha256 !== producerReceipt.archive.sha256) {
      throw new Error("fresh upstream archive manifest differs from the producer receipt");
    }
    await copyFile(archivePath, join(bundleRoot, "upstream/runtime.tar.gz"));
    await copyFile(manifestPath, join(bundleRoot, "upstream/runtime.manifest.json"));
    await copyFile(producerReceiptPath, join(bundleRoot, "upstream/producer-receipt.json"));
    await writeJSON(join(bundleRoot, "upstream/producer-summary.json"), producerSummary);
    await writeJSON(join(bundleRoot, "upstream/producer-context.json"), {
      schema: "gobi.module-qualification-upstream-context/v1",
      producerAttemptID: producerReceipt.attempt.id,
      originalAttemptRoot: producerAttemptRoot,
      originalArchivePath: archivePath,
      originalManifestPath: manifestPath,
      originalProducerReceiptPath: producerReceiptPath,
      bundledArchivePath: "upstream/runtime.tar.gz",
      bundledManifestPath: "upstream/runtime.manifest.json",
      bundledProducerReceiptPath: "upstream/producer-receipt.json",
    });

    currentStage = "focused-go-qualification-tests";
    const qualificationEnv = {
      ...rootGoEnv,
      GOBI_MODULE_CAPTURE_ROOT: producerAttemptRoot,
      GOBI_MODULE_ARCHIVE: archivePath,
      GOBI_MODULE_MANIFEST: manifestPath,
      GOBI_MODULE_EXPECTED_SOURCE: sourceCommit,
    };
    const testOutput = await execute("focused-module-qualification-go-tests", goExecutable, [
      "test", "-json", "-count=1", "./modulequalification/...", "./cmd/module-qualify/...",
    ], { cwd: root, env: qualificationEnv, recordedEnv: qualificationEnv, maxBuffer: 256 * 1024 * 1024 });
    const testEvents = testOutput.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { throw new Error(`go test -json emitted malformed output: ${line.slice(0, 240)}`); }
    });
    const testNames = [...new Set(testEvents.filter((event) => event.Action === "run" && event.Test).map((event) => event.Test))].sort();
    const skippedTests = testEvents.filter((event) => event.Action === "skip");
    const failedTests = testEvents.filter((event) => event.Action === "fail" && event.Test);
    if (!testNames.includes("TestCapturedFixtureIsActuallyAccepted") || !testNames.includes("TestRealCaptureMutationControls")) {
      throw new Error("focused Go suite did not run both real-capture acceptance and mutation-control tests");
    }
    if (skippedTests.length || failedTests.length) throw new Error("focused Go qualification suite skipped or failed a test");
    const mutationCorpus = JSON.parse(await readFile(join(root, "module-qualification/controls/mutations.json"), "utf8"));
    const expectedMutationNames = mutationCorpus.cases.map((item) => `TestRealCaptureMutationControls/${item.id}`).sort();
    const passedMutationNames = [...new Set(testEvents
      .filter((event) => event.Action === "pass" && typeof event.Test === "string" && event.Test.startsWith("TestRealCaptureMutationControls/"))
      .map((event) => event.Test))].sort();
    if (mutationCorpus.schema !== "gobi.module-qualification-mutation-controls/v1" ||
        expectedMutationNames.length !== 10 || JSON.stringify(passedMutationNames) !== JSON.stringify(expectedMutationNames)) {
      throw new Error(`the Go suite did not pass all ten actual-capture mutation controls (passed ${passedMutationNames.length})`);
    }
    const focusedTestSummary = {
      schema: "gobi.module-qualification-go-tests/v1",
      status: "passed",
      command: "go test -json -count=1 ./modulequalification/... ./cmd/module-qualify/...",
      captureRoot: producerAttemptRoot,
      topLevelTestNames: testNames,
      mutationControlsDetected: passedMutationNames.map((name) => name.slice("TestRealCaptureMutationControls/".length)),
      mutationControlCount: passedMutationNames.length,
      skippedTests: skippedTests.length,
      failedTests: failedTests.length,
      jsonEvents: testEvents.length,
    };
    await writeJSON(join(bundleRoot, "reports/focused-go-tests.json"), focusedTestSummary);

    currentStage = "go-directory-verification";
    const directoryReportBytes = await execute("go-verify-directory", goExecutable, [
      "run", "./cmd/module-qualify", "--directory", producerAttemptRoot,
    ], { cwd: root, env: rootGoEnv, recordedEnv: rootGoEnv, maxBuffer: 128 * 1024 * 1024 });
    const directoryReport = requireReport(await parseJSONOutput(directoryReportBytes, "Go directory verifier"), "directory");
    if (directoryReport.capture.mutationControls !== 0) {
      throw new Error("Go capture verifier mutationControls must report zero; negative controls are the separate focused tests");
    }
    await writeJSON(join(bundleRoot, "reports/directory-report.json"), directoryReport);

    currentStage = "go-archive-verification";
    const archiveReportBytes = await execute("go-verify-archive", goExecutable, [
      "run", "./cmd/module-qualify", "--archive", archivePath, "--manifest", manifestPath,
    ], { cwd: root, env: rootGoEnv, recordedEnv: rootGoEnv, maxBuffer: 128 * 1024 * 1024 });
    const archiveReport = requireReport(await parseJSONOutput(archiveReportBytes, "Go archive verifier"), "archive", {
      members: producerReceipt.archive.members,
      bytes: producerReceipt.archive.bytes,
    });
    if (JSON.stringify(archiveReport.capture) !== JSON.stringify(directoryReport.capture) ||
        JSON.stringify(archiveReport.abi) !== JSON.stringify(directoryReport.abi) ||
        JSON.stringify(archiveReport.inputs) !== JSON.stringify(directoryReport.inputs)) {
      throw new Error("Go directory and archive verifier reports differ on capture, ABI, or hashed inputs");
    }
    await writeJSON(join(bundleRoot, "reports/archive-report.json"), archiveReport);

    currentStage = "milestone-zero-regression";
    const m0Env = { ...qualificationEnv };
    await execute("milestone-zero-run", "bash", [join(root, "run.sh")], {
      cwd: root, env: m0Env, recordedEnv: m0Env,
      maxBuffer: 256 * 1024 * 1024,
    });

    currentStage = "counter-interaction-regression";
    const counterEnv = {
      ...qualificationEnv,
      GONDOLA_SKIP_NPM_CI: "1",
      GONDOLA_SKIP_BROWSER_INSTALL: "1",
      CHROMIUM_PATH: chromiumPath,
    };
    await execute("counter-interaction-regression", "bash", [join(root, "run-interaction.sh")], {
      cwd: root, env: counterEnv, recordedEnv: counterEnv, maxBuffer: 256 * 1024 * 1024,
    });

    currentStage = "source-and-git-revalidation";
    const sourceAfter = await sourceInventory();
    const sourceChanges = changedPins(sourceBefore, sourceAfter);
    if (sourceChanges.length) throw new Error(`source inputs changed during qualification: ${sourceChanges.join(", ")}`);
    const gitAfter = await gitInfo("after");
    if (gitAfter.head !== sourceCommit || gitAfter.dirty) throw new Error("Git source identity or clean status changed during qualification");
    await writeJSON(join(bundleRoot, "metadata/source-pins-after.json"), sourceAfter);
    await writeJSON(join(bundleRoot, "metadata/git-after.json"), gitAfter);

    currentStage = "evidence-bundle-source-snapshot";
    const verifierInputs = await verifyReportInputs(directoryReport, producerAttemptRoot);
    const verifierSourceFiles = await copyVerifierSourceClosure(join(bundleRoot, "verifier-source"));
    await copyRunnerInputs(join(bundleRoot, "runner-source"));
    await writeJSON(join(bundleRoot, "metadata/verifier-inputs.json"), verifierInputs);
    const executionSnapshot = {
      schema: "gobi.module-qualification-execution-snapshot/v1",
      sourceCommit,
      sourcePins: sourceBefore,
      producerAttemptID: producerReceipt.attempt.id,
      producerArchiveSHA256: producerReceipt.archive.sha256,
      directoryReportSHA256: sha256(Buffer.from(`${JSON.stringify(directoryReport, null, 2)}\n`)),
      archiveReportSHA256: sha256(Buffer.from(`${JSON.stringify(archiveReport, null, 2)}\n`)),
    };
    await writeJSON(join(attemptRoot, "execution-before-archive.json"), executionSnapshot);
    const runSummary = {
      schema: "gobi.module-qualification-delivery-summary/v1",
      status: "passed",
      sourceCommit,
      producerAttempt: { id: producerReceipt.attempt.id, bundledRuntimeArchive: "upstream/runtime.tar.gz" },
      capture: directoryReport.capture,
      fixedProfile: { events: 24, goUpdates: 16, stateCheckpoints: 17 },
      abi: directoryReport.abi,
      archiveVerification: archiveReport.archive,
      focusedGoTests: focusedTestSummary,
      negativeControls: { captureMutationControls: focusedTestSummary.mutationControlCount, producerOfflineControls: producerReceipt.conformance?.mutationControlsDetected },
      regressions: { milestoneZero: "passed", counterInteraction: "passed" },
      evidence: { upstreamArchive: "upstream/runtime.tar.gz", bundleManifest: "../module-qualification-evidence.manifest.json" },
      sourceInputCount: directoryReport.inputs.length,
      verifierSourceFileCount: verifierSourceFiles.length,
      portableToolResolutionTests: 4,
      commandCount: commandRecords.length,
    };
    await writeJSON(join(bundleRoot, "summary.json"), runSummary);
    const bundleMembersBeforeIndex = await bundleMemberList(bundleRoot);
    const bundleIndex = {
      schema: "gobi.module-qualification-evidence-index/v1",
      sourceCommit,
      attempt: attemptId,
      members: bundleMembersBeforeIndex,
    };
    await writeJSON(join(bundleRoot, "index.json"), bundleIndex);
    const bundleMembers = await bundleMemberList(bundleRoot);
    const archivePathOut = join(attemptRoot, "module-qualification-evidence.tar.gz");
    const archiveManifestPath = join(attemptRoot, "module-qualification-evidence.manifest.json");
    const verifyRoot = await mkdtemp(join(tmpdir(), "gobi-module-qualification-verify-"));
    let archiveResult;
    try {
      archiveResult = await archiveAndVerify({
        attemptRoot,
        archivePath: archivePathOut,
        verifyRoot,
        includePaths: ["bundle", "execution-before-archive.json"],
        members: [
          ...bundleMembers,
          { path: "execution-before-archive.json", ...(await hashPath(join(attemptRoot, "execution-before-archive.json"))) },
        ],
        execute: runArchiveCommand,
        hashPath,
        readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
      });
    } finally {
      await rm(verifyRoot, { recursive: true, force: true });
    }
    if (archiveResult.archivedSnapshot?.sourceCommit !== sourceCommit ||
        archiveResult.archivedSnapshot?.producerArchiveSHA256 !== producerReceipt.archive.sha256) {
      throw new Error("outer evidence archive round trip changed its source or upstream archive identity");
    }
    const outerArchive = await hashPath(archivePathOut);
    const bundleIndexHash = await hashPath(join(bundleRoot, "index.json"));
    const snapshotHash = await hashPath(join(attemptRoot, "execution-before-archive.json"));
    const archiveCommandLogPath = join(attemptRoot, "archive-commands.json");
    await writeJSON(archiveCommandLogPath, { schema: "gobi.module-qualification-archive-commands/v1", commands: archiveCommandRecords });
    const manifest = {
      schema: "gobi.module-qualification-evidence-manifest/v1",
      sourceCommit,
      attempt: attemptId,
      archive: { path: basename(archivePathOut), ...outerArchive },
      index: { path: "bundle/index.json", ...bundleIndexHash },
      executionSnapshot: { path: "execution-before-archive.json", ...snapshotHash },
      memberCount: bundleMembers.length + 1,
      expandedBytes: bundleMembers.reduce((sum, item) => sum + item.bytes, snapshotHash.bytes),
      upstreamRuntimeArchive: {
        path: "bundle/upstream/runtime.tar.gz",
        bytes: archiveInfo.bytes,
        sha256: archiveInfo.sha256,
        manifestSHA256: manifestInfo.sha256,
      },
      report: { profiles: 12, distinctEvents: 144, distinctUpdates: 99, fixedEvents: 24, fixedUpdates: 16, seeds: seedValues },
      negativeControls: { goCaptureMutations: focusedTestSummary.mutationControlCount },
      commandCount: commandRecords.length,
      archiveCommandLog: { path: basename(archiveCommandLogPath), ...(await hashPath(archiveCommandLogPath)) },
      sourceInputs: { count: verifierInputs.length, directoryReportCount: directoryReport.inputs.length },
    };
    await writeJSON(archiveManifestPath, manifest);

    currentStage = "final-producer-source-recheck";
    const finalSource = await sourceInventory();
    const finalChanges = changedPins(sourceBefore, finalSource);
    if (finalChanges.length) throw new Error(`source inputs changed during evidence packaging: ${finalChanges.join(", ")}`);
    const finalGit = await gitInfo("final");
    if (finalGit.head !== sourceCommit || finalGit.dirty) throw new Error("Git source identity changed during evidence packaging");
    const summaryPath = join(attemptRoot, "summary.json");
    await writeJSON(summaryPath, {
      ...runSummary,
      evidence: {
        upstreamArchive: producerReceipt.archive.path,
        upstreamManifest: producerReceipt.archive.manifestPath,
        verifierBundle: archivePathOut,
        verifierManifest: archiveManifestPath,
      },
      bundle: manifest.archive,
      finalSource: { head: finalGit.head, dirty: finalGit.dirty, sourcePinsUnchanged: true },
    });
    process.stdout.write(`${JSON.stringify({ ...JSON.parse(await readFile(summaryPath, "utf8")), summaryPath })}\n`);
  } catch (error) {
    const failure = {
      schema: "gobi.module-qualification-failure/v1",
      status: "failed",
      sourceCommit,
      attempt: attemptId,
      stage: currentStage,
      error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null },
      commands: commandRecords,
      archiveCommands: archiveCommandRecords,
    };
    await writeJSON(join(attemptRoot, "failure-receipt.json"), failure).catch(() => {});
    process.stderr.write(`${currentStage}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Usage: bash run-module-qualification.sh --source-commit <40-char-sha> [--chromium <executable>] [--output-root <dir>]\n");
    return;
  }
  await run(args);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`argument-validation: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
