import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  archiveAndVerify, createExclusiveAttemptDirectory, writeImmutableSnapshot,
} from "../compiled-capabilities/archive-helper.mjs";
import { chromiumLaunchOptions } from "../compiled-frontend/conformance/browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const compilerDir = join(root, "compiled-frontend");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = () => new Date().toISOString();
const commandRecords = [];
const rootGoEnv = { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" };
const compilerGoEnv = { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" };
const excludedDirectories = new Set([
  ".git", "node_modules", "output", "evidence", "attempts", "coordination", "rawlogs", "reports", "__pycache__", ".cache",
]);

const sourceDirectories = [
  "cmd/keyed-module-native",
  "fixtures/compiled/keyedmodulewire",
  "fixtures/compiled/keyedmoduleparent",
  "fixtures/compiled/moduleparent",
  "fixtures/compiled/modulewire",
  "fixtures/compiled/modulechild",
  "moduleabi",
  "counter",
  "gobi",
  "compilercontract",
  "reactmap",
  "compiled-keyed-modules",
  "compiled-modules/abi",
  "compiled-modules/conformance",
  "compiled-frontend/analyze",
  "compiled-frontend/build",
  "compiled-frontend/cmd/gobi-build",
  "compiled-frontend/emit",
  "compiled-frontend/frontend/runtime",
  "compiled-frontend/frontend/shared",
  "compiled-frontend/frontend/react",
  "compiled-frontend/frontend/dom",
  "compiled-frontend/conformance",
];
const sourceFiles = [
  "go.mod",
  "package.json",
  "package-lock.json",
  "interaction/package.json",
  "interaction/package-lock.json",
  "compiled-frontend/go.mod",
  "compiled-frontend/go.sum",
  "compiled-frontend/package.json",
  "compiled-frontend/package-lock.json",
  "compiled-capabilities/archive-helper.mjs",
  "compiled-children/browser-version.mjs",
  "compiled-frontend/conformance/browser.mjs",
  "run-keyed-modules.sh",
  ".github/workflows/gobi-keyed-modules.yml",
  "compiled-keyed-modules/.gitignore",
  "compiled-keyed-modules/README.md",
  "compiled-keyed-modules/RESULTS.md",
  "compiled-keyed-modules/run.mjs",
  "compiled-keyed-modules/demo/build.mjs",
  "compiled-keyed-modules/demo/app.mjs",
  "compiled-keyed-modules/demo/index.html",
];

function safeName(name) { return name.replace(/[^a-zA-Z0-9._-]+/g, "-"); }
function pathDelimiter() { return process.platform === "win32" ? ";" : ":"; }

function findExecutable(name) {
  for (const directory of (process.env.PATH ?? "").split(pathDelimiter())) {
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
    if (name === "--allow-dirty") {
      if (args.allowDirty) throw new Error("--allow-dirty may only appear once");
      args.allowDirty = true;
      continue;
    }
    if (name === "--help") return { help: true };
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
      if (sourceTree && (excludedDirectories.has(entry.name) ||
          rel === "compiled-keyed-modules/build/output" || rel.startsWith("compiled-keyed-modules/build/output/"))) continue;
      files.push(...await walkFiles(path, { sourceTree }));
    } else if (entry.isFile()) {
      files.push(path);
    } else {
      throw new Error(`source or attempt inventory contains a non-regular entry: ${path}`);
    }
  }
  return files;
}

async function snapshotSourcePins() {
  const paths = new Set(sourceFiles);
  for (const directory of sourceDirectories) {
    for (const path of await walkFiles(join(root, directory), { sourceTree: true })) {
      const rel = relative(root, path).split(sep).join("/");
      if (rel.startsWith("compiled-keyed-modules/output/") || rel.startsWith("compiled-keyed-modules/evidence/")) continue;
      paths.add(rel);
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

async function execute(name, command, args, options = {}) {
  const logDir = options.logDir ?? logsRoot;
  await mkdir(logDir, { recursive: true });
  const filename = safeName(name);
  const environment = options.env ?? {};
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...environment },
    input: options.input,
    maxBuffer: options.maxBuffer ?? 256 * 1024 * 1024,
  });
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  const record = {
    name,
    command,
    args,
    cwd: options.cwd ?? root,
    environment,
    startedAt: options.startedAt ?? stamp(),
    completedAt: stamp(),
    exitCode: result.status,
    signal: result.signal ?? null,
    spawnError: result.error ? String(result.error.message ?? result.error) : null,
    stdout: { bytes: stdout.length, sha256: sha256(stdout) },
    stderr: { bytes: stderr.length, sha256: sha256(stderr) },
  };
  if (options.input !== undefined) {
    const input = Buffer.isBuffer(options.input) ? options.input : Buffer.from(String(options.input));
    record.stdin = { bytes: input.length, sha256: sha256(input) };
    await writeFile(join(logDir, `${filename}.stdin.bin`), input, { flag: "wx" });
  }
  await Promise.all([
    writeFile(join(logDir, `${filename}.stdout.bin`), stdout, { flag: "wx" }),
    writeFile(join(logDir, `${filename}.stderr.bin`), stderr, { flag: "wx" }),
    writeJSON(join(logDir, `${filename}.command.json`), record),
  ]);
  if (options.includeInCommands !== false) commandRecords.push(record);
  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed (${result.status ?? result.signal ?? "spawn error"})${stderr.length ? `: ${stderr.toString("utf8").trim()}` : ""}`);
  }
  return stdout.toString("utf8");
}

function parseSingleJSON(text, label) {
  const value = text.trim();
  if (!value) throw new Error(`${label} produced empty stdout`);
  try { return JSON.parse(value); } catch { /* compiler commands can log before the result line */ }
  const lines = value.split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch { /* find the final JSON line */ }
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
    cwd: root, env: {}, maxBuffer: 128 * 1024 * 1024,
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

function validRelativePath(value, label) {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\") ||
      value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${label} is not a normalized relative path`);
  }
}

async function readPinnedOutput(base, pin, label) {
  validRelativePath(pin?.path, `${label} path`);
  const path = resolve(base, pin.path);
  if (!path.startsWith(`${base}${sep}`)) throw new Error(`${label} escaped its output root`);
  const bytes = await readFile(path);
  if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) throw new Error(`${label} digest mismatch`);
  return { path, bytes, sha256: pin.sha256 };
}

function checkBuildIndex(index) {
  if (index.schema !== "gobi.keyed-module-build-index/v1" ||
      index.parentPackagePath !== "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent" ||
      index.childPackagePath !== "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild") {
    throw new Error("keyed build index schema or package paths do not match the frozen contract");
  }
  const roles = ["child", "parent"];
  for (const backend of ["react", "dom"]) {
    if (!index.builds?.[backend] || Object.keys(index.builds[backend]).sort().join(",") !== roles.join(",")) {
      throw new Error(`keyed build index does not contain exactly parent/child for ${backend}`);
    }
  }
  return index;
}

async function verifyBuildOutputs(buildRoot) {
  const indexPath = join(buildRoot, "build-index.json");
  const indexBytes = await readFile(indexPath);
  const index = checkBuildIndex(JSON.parse(indexBytes.toString("utf8")));
  const builds = {};
  for (const backend of ["react", "dom"]) {
    builds[backend] = {};
    for (const role of ["parent", "child"]) {
      const build = index.builds[backend][role];
      const expectedPackage = role === "parent" ? index.parentPackagePath : index.childPackagePath;
      if (build.packagePath !== expectedPackage || build.componentId !== expectedPackage) throw new Error(`${backend}/${role} build identity mismatch`);
      const outputDir = resolve(buildRoot, build.outputDir);
      if (!outputDir.startsWith(`${buildRoot}${sep}`)) throw new Error(`${backend}/${role} output directory escaped build root`);
      const manifest = await readPinnedOutput(buildRoot, { path: build.manifestPath, ...build.manifest }, `${backend}/${role} manifest`);
      const resultPath = resolve(buildRoot, build.resultPath);
      if (!resultPath.startsWith(`${buildRoot}${sep}`)) throw new Error(`${backend}/${role} result path escaped build root`);
      const resultBytes = await readFile(resultPath);
      const result = JSON.parse(resultBytes.toString("utf8"));
      if (result.schema !== "gobi.build-result/v1" || result.ok !== true || result.apps?.length !== 1 ||
          result.apps[0].packagePath !== expectedPackage || result.outputs?.length !== build.outputCount ||
          JSON.stringify(result.outputs) !== JSON.stringify(build.outputs)) {
        throw new Error(`${backend}/${role} build result does not match the output index`);
      }
      for (const item of build.outputs) {
        const output = await readPinnedOutput(outputDir, item, `${backend}/${role} build output`);
        if (!output.path.startsWith(`${outputDir}${sep}`)) throw new Error(`${backend}/${role} build output escaped its app directory`);
      }
      const manifestJSON = JSON.parse(manifest.bytes.toString("utf8"));
      if (manifestJSON.schema !== "gobi.build-manifest/v1" || manifestJSON.apps?.length !== 1 ||
          manifestJSON.apps[0].backend !== backend || manifestJSON.apps[0].packagePath !== expectedPackage ||
          manifestJSON.apps[0].componentId !== expectedPackage) throw new Error(`${backend}/${role} build manifest identity mismatch`);
      const artifactPins = {};
      for (const key of ["appIR", "module", "encoder", "components", "moduleABI"]) {
        artifactPins[key] = await readPinnedOutput(buildRoot, build.artifacts?.[key], `${backend}/${role}/${key}`);
        if (!artifactPins[key].path.startsWith(`${outputDir}${sep}`)) throw new Error(`${backend}/${role}/${key} escaped its app output directory`);
      }
      const abi = JSON.parse(artifactPins.moduleABI.bytes.toString("utf8"));
      const expectedRoles = role === "parent" ? ["Output", "Receive"] : ["Input", "Publication"];
      if (abi.schema !== "gobi.module-abi/v1" || abi.componentID !== expectedPackage || abi.packagePath !== expectedPackage ||
          expectedRoles.some((name) => !abi.roles?.some((entry) => entry.name === name)) || abi.artifacts?.length !== 4) {
        throw new Error(`${backend}/${role} ABI descriptor mismatch`);
      }
      for (const artifact of abi.artifacts) {
        const pin = await readPinnedOutput(outputDir, artifact, `${backend}/${role} ABI artifact ${artifact.path}`);
        if (!pin.path.startsWith(`${outputDir}${sep}`)) throw new Error(`${backend}/${role} ABI artifact escaped its output directory`);
      }
      const appIR = JSON.parse(artifactPins.appIR.bytes.toString("utf8"));
      if (appIR.schema !== "gobi.app-ir/v1" || appIR.packagePath !== expectedPackage ||
          appIR.components?.length !== 1 || appIR.components[0].id !== expectedPackage) throw new Error(`${backend}/${role} AppIR identity mismatch`);

      let helper = null;
      let helperPin = null;
      let helperDescriptor = null;
      if (role === "parent") {
        helperPin = build.keyedHelper;
        if (!helperPin || helperPin.exportName !== "gobiKeyedModuleHelpers" ||
            JSON.stringify(helperPin.members) !== JSON.stringify(["children", "receiveKeyed", "isCurrent"])) {
          throw new Error(`${backend}/parent keyed helper export contract mismatch`);
        }
        helper = await readPinnedOutput(buildRoot, helperPin, `${backend}/parent keyed helper`);
        helperDescriptor = await readPinnedOutput(buildRoot, {
          path: helperPin.descriptorPath, bytes: helperPin.descriptorBytes, sha256: helperPin.descriptorSha256,
        }, `${backend}/parent keyed helper descriptor`);
        const descriptor = JSON.parse(helperDescriptor.bytes.toString("utf8"));
        if (descriptor.schema !== "gobi.keyed-module-helpers/v1" || descriptor.backend !== backend ||
            descriptor.packagePath !== expectedPackage || descriptor.componentId !== expectedPackage ||
            descriptor.moduleABI?.abiSHA256 !== abi.abiSHA256 || descriptor.appIR?.sha256 !== artifactPins.appIR.sha256 ||
            descriptor.helperArtifact?.sha256 !== helper.sha256 || descriptor.exportName !== helperPin.exportName ||
            JSON.stringify(descriptor.members) !== JSON.stringify(helperPin.members)) {
          throw new Error(`${backend}/parent keyed helper descriptor failed its identity and digest gates`);
        }
      }
      builds[backend][role] = {
        packagePath: expectedPackage,
        componentId: expectedPackage,
        manifest: { path: build.manifestPath, bytes: manifest.bytes.length, sha256: sha256(manifest.bytes) },
        result: { path: build.resultPath, bytes: resultBytes.length, sha256: sha256(resultBytes) },
        outputDir: build.outputDir,
        outputCount: build.outputCount,
        outputs: build.outputs,
        artifacts: Object.fromEntries(Object.entries(artifactPins).map(([key, value]) => [key, {
          path: relative(buildRoot, value.path).split(sep).join("/"), bytes: value.bytes.length, sha256: value.sha256,
        }])),
        ...(helper ? { keyedHelper: {
          path: pinPath(buildRoot, helper.path), bytes: helper.bytes.length, sha256: helper.sha256,
          descriptor: { path: helperPin.descriptorPath, bytes: helperDescriptor.bytes.length, sha256: sha256(helperDescriptor.bytes) },
        } } : {}),
        abiSHA256: abi.abiSHA256,
        artifactSHA256: abi.artifactSHA256,
      };
    }
  }
  return { index, indexPath, indexBytes, builds };
}

function pinPath(base, path) { return relative(base, path).split(sep).join("/"); }

let attemptId;
let attemptRoot;
let evidenceRoot;
let logsRoot;
let archivePath;
let archiveManifestPath;
let sourcePinsBefore = null;
let gitStart = null;
let currentStage = "argument-validation";
let chromiumPath = null;
let toolchain = null;
let nativeCaptures = {};
let buildSummary = null;
let buildIntegrity = null;
let conformanceSummary = null;
let oracleSummary = null;
let demoSummary = null;
let buildOracleSummary = null;
let focusedTestSummary = null;

async function captureScenarios() {
  currentStage = "scenario-materialization";
  const scenariosModule = await import(pathToFileURL(join(here, "conformance/scenarios.mjs")).href);
  const scenarios = [{ name: "literal", value: scenariosModule.literalKeyedScenario() }];
  for (const seed of scenariosModule.DEFAULT_SEEDS) {
    const generated = scenariosModule.generateSeededKeyedScenario(seed);
    scenarios.push({ name: `seed-${seed}`, value: generated.scenario, metadata: generated.metadata });
  }
  const scenarioRoot = join(attemptRoot, "scenarios");
  await mkdir(scenarioRoot, { recursive: true });
  for (const item of scenarios) {
    const path = join(scenarioRoot, `${item.name}.json`);
    const pin = await writeJSON(path, item.value);
    item.path = path;
    item.pin = { path: relative(attemptRoot, path).split(sep).join("/"), ...pin };
  }
  await writeJSON(join(scenarioRoot, "index.json"), {
    schema: "gobi.keyed-modules-scenario-index/v1",
    generator: "compiled-keyed-modules/conformance/scenarios.mjs",
    scenarios: scenarios.map(({ name, value, metadata, pin }) => ({
      name, scenarioName: value.name, eventCount: value.events.length, metadata: metadata ?? null, pin,
    })),
  });
  return scenarios;
}

async function runNativeCapture(scenario, name, oracle) {
  currentStage = `fresh-native-${name}`;
  const stdout = await execute(`native-${name}`, goExecutable, ["run", "./cmd/keyed-module-native", "--script", scenario.path], {
    cwd: root,
    env: { ...rootGoEnv, GOBI_GO_BIN: goExecutable },
  });
  const capture = parseSingleJSON(stdout, `native ${name}`);
  if (capture.schema !== "gobi.keyed-module-native/v1" || capture.name !== scenario.value.name ||
      capture.events?.length !== scenario.value.events.length || capture.events.some((event, index) => event.index !== index)) {
    throw new Error(`native ${name} capture failed schema, identity, or event-count gates`);
  }
  const path = join(attemptRoot, "native", `${name}.json`);
  const pin = await writeJSON(path, capture);
  const checks = await oracle.assertNativeKeyedCapture(capture, scenario.value);
  if (checks?.status !== "matched" || !Array.isArray(checks.checks) || checks.checks.length === 0) {
    throw new Error(`healthy native ${name} oracle did not return matched checks`);
  }
  nativeCaptures[name] = { capture, scenario: scenario.value, path, pin: { path: relative(attemptRoot, path).split(sep).join("/"), ...pin }, checks };
  return nativeCaptures[name];
}

async function runBuildAdapter() {
  currentStage = "four-independent-builds";
  const output = join(attemptRoot, "builds");
  const stdout = await execute("keyed-build-adapter", nodeExecutable, [
    join(here, "build/build.mjs"), "--output", output,
  ], {
    cwd: root,
    env: { GOBI_GO_BIN: goExecutable, GOBI_NODE_BIN: nodeExecutable },
    maxBuffer: 64 * 1024 * 1024,
  });
  buildSummary = parseSingleJSON(stdout, "keyed module build adapter");
  if (buildSummary.schema !== "gobi.keyed-module-build-result/v1" || buildSummary.admission?.react?.admitted !== true ||
      buildSummary.admission?.dom?.admitted !== true ||
      ["childSnapshotDetached", "crossAdapterStateAccepted", "parentStateNotMutatedByReceiveKeyed", "remountGenerationFenced"]
        .some((key) => buildSummary.adapterChecks?.react?.[key] !== true || buildSummary.adapterChecks?.dom?.[key] !== true)) {
    throw new Error("four independent keyed builds did not pass module-pair and helper adapter gates");
  }
  buildIntegrity = await verifyBuildOutputs(output);
  const oracle = await import(pathToFileURL(join(here, "oracle/oracle.mjs")).href);
  const identity = await oracle.assertKeyedBuildIdentity(buildIntegrity.index, {
    buildRoot: output,
    repoRoot: root,
  });
  if (identity?.status !== "matched" || identity.independentPairs !== 2) {
    throw new Error("keyed build identity oracle did not admit both backend-specific parent/child pairs");
  }
  const mutations = await oracle.runKeyedBuildMutationControls(buildIntegrity.index, {
    buildRoot: output,
    repoRoot: root,
  });
  if (mutations?.status !== "detected" || mutations.mutationControlsDetected !== 17 ||
      mutations.controls?.some((control) => control.status !== "rejected")) {
    throw new Error("keyed build mutation controls did not reject every frozen build fault control");
  }
  buildOracleSummary = {
    schema: "gobi.keyed-module-build-oracle-summary/v1",
    status: "matched",
    identity,
    mutationControls: mutations,
  };
  await writeJSON(join(attemptRoot, "oracle/build-summary.json"), buildOracleSummary);
  await writeJSON(join(attemptRoot, "metadata/build-integrity.json"), {
    schema: "gobi.keyed-module-build-integrity/v1",
    buildIndex: { path: relative(attemptRoot, buildIntegrity.indexPath).split(sep).join("/"), bytes: buildIntegrity.indexBytes.length, sha256: sha256(buildIntegrity.indexBytes) },
    builds: buildIntegrity.builds,
    admission: buildIntegrity.index.admission,
    adapterChecks: buildIntegrity.index.adapterChecks,
  });
  return buildIntegrity;
}

function parseTAPSummary(text) {
  const read = (name) => {
    const match = text.match(new RegExp(`^# ${name} (\\d+)$`, "m"));
    if (!match) throw new Error(`Node TAP output is missing the ${name} summary`);
    return Number(match[1]);
  };
  const summary = {
    tests: read("tests"),
    passed: read("pass"),
    failed: read("fail"),
    skipped: read("skipped"),
  };
  if (summary.passed !== summary.tests || summary.failed !== 0 || summary.skipped !== 0) {
    throw new Error(`focused Node tests did not pass without skips: ${JSON.stringify(summary)}`);
  }
  return summary;
}

async function runFocusedTests(buildIndexPath) {
  currentStage = "focused-Go-and-Node-tests";
  const goPackages = [
    "./cmd/keyed-module-native",
    "./fixtures/compiled/keyedmoduleparent",
    "./fixtures/compiled/keyedmodulewire",
    "./fixtures/compiled/moduleparent",
    "./fixtures/compiled/modulechild",
  ];
  const goOutput = await execute("focused-keyed-go-tests", goExecutable, ["test", "-count=1", ...goPackages], {
    cwd: root,
    env: rootGoEnv,
  });
  const nodeFiles = [
    "compiled-keyed-modules/runtime/runtime.test.mjs",
    "compiled-keyed-modules/conformance/module-loader.test.mjs",
    "compiled-keyed-modules/oracle/oracle.test.mjs",
  ];
  const nodeOutput = await execute("focused-keyed-node-tests", nodeExecutable, [
    "--test-reporter=tap", "--test", ...nodeFiles.map((path) => join(root, path)),
  ], {
    cwd: root,
    env: { GOBI_KEYED_BUILD_INDEX: buildIndexPath },
    maxBuffer: 64 * 1024 * 1024,
  });
  focusedTestSummary = {
    schema: "gobi.keyed-modules-focused-tests/v1",
    status: "passed",
    go: { packages: goPackages, outputBytes: Buffer.byteLength(goOutput) },
    node: { files: nodeFiles, ...parseTAPSummary(nodeOutput), outputBytes: Buffer.byteLength(nodeOutput) },
    commands: commandRecords.filter((record) => record.name === "focused-keyed-go-tests" || record.name === "focused-keyed-node-tests"),
  };
  await writeJSON(join(attemptRoot, "metadata/focused-tests.json"), focusedTestSummary);
  return focusedTestSummary;
}

function countFromText(text) {
  const match = text.match(/count\s*:\s*(\d+)/i);
  if (!match) throw new Error(`counter publication text has no count: ${text}`);
  return Number(match[1]);
}

async function serveStatic(siteRoot) {
  const canonicalRoot = await realpath(siteRoot);
  const types = new Map([[".html", "text/html"], [".mjs", "text/javascript"], [".css", "text/css"], [".json", "application/json"]]);
  const server = createServer((request, response) => {
    let relativePath;
    try { relativePath = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname.slice(1)); }
    catch { response.writeHead(400).end("invalid URL"); return; }
    if (!relativePath) relativePath = "index.html";
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

async function runDemoBuild(buildRoot) {
  currentStage = "demo-build";
  const output = join(attemptRoot, "demo/site");
  const stdout = await execute("demo-build", nodeExecutable, [
    join(here, "demo/build.mjs"), "--build-root", buildRoot, "--output", output,
  ], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  demoSummary = parseSingleJSON(stdout, "keyed module demo build");
  if (demoSummary.schema !== "gobi.keyed-modules-demo-build/v1" || demoSummary.status !== "passed" ||
      Object.keys(demoSummary.profiles ?? {}).length !== 4 || !demoSummary.output?.sha256) {
    throw new Error("keyed module demo build result is incomplete");
  }
  return output;
}

async function runDemoHTTPSmoke(chromium, siteRoot) {
  currentStage = "actual-mounted-demo-smoke";
  const server = await serveStatic(siteRoot);
  let browser;
  const pageErrors = [];
  const failedRequests = [];
  const steps = [];
  try {
    browser = await chromium.launch(chromiumLaunchOptions(chromiumPath));
    const page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" }));
    const response = await page.goto(server.url, { waitUntil: "load", timeout: 20000 });
    if (!response || response.status() !== 200) throw new Error("keyed demo index did not return HTTP 200");
    await page.locator("#keyed-status[data-state='ready']").waitFor({ timeout: 20000 });
    await page.waitForFunction(() => typeof window.keyedModulesDemo?.snapshot === "function", null, { timeout: 20000 });

    const childRoot = (key) => `#keyed-modules [data-gobi-module-root='child-${key}']`;
    const publication = (key) => page.locator(`${childRoot(key)} .module-child-publication`);
    const assertCount = async (key, expected) => {
      await page.waitForFunction(({ key: childKey, count }) => {
        const node = document.querySelector(`#keyed-modules [data-gobi-module-root='child-${childKey}'] .module-child-publication`);
        const match = node?.textContent?.match(/count\s*:\s*(\d+)/i);
        return match !== null && Number(match[1]) === count;
      }, { key, count: expected }, { timeout: 10000 });
      const text = await publication(key).innerText();
      if (countFromText(text) !== expected) throw new Error(`${key} counter text did not match ${expected}`);
    };
    const snapshot = () => page.evaluate(() => window.keyedModulesDemo.snapshot());
    const clickChildAdd = async (key) => page.locator(`${childRoot(key)} .counter button.add`).click();
    const clickParent = async (selector) => page.locator(`#keyed-modules [data-gobi-module-root='parent'] ${selector}`).click();

    const initial = await snapshot();
    if (JSON.stringify(initial.children.map((child) => [child.key, child.generation])) !== JSON.stringify([["a", 1], ["b", 1]])) {
      throw new Error("demo did not mount keys a and b at generation 1 in Go order");
    }
    await assertCount("a", 0);
    await assertCount("b", 0);
    steps.push({ name: "initial-two-key-mount", passed: true, children: initial.children.map(({ key, generation }) => ({ key, generation })) });

    await clickChildAdd("a");
    await assertCount("a", 1);
    await assertCount("b", 0);
    await clickChildAdd("b");
    await assertCount("a", 1);
    await assertCount("b", 1);
    steps.push({ name: "independent-counter-adds", passed: true, counts: { a: 1, b: 1 } });

    await clickParent(".module-step-up");
    await page.waitForFunction(() => [...document.querySelectorAll("#keyed-modules .module-child-input")].length === 2 &&
      [...document.querySelectorAll("#keyed-modules .module-child-input")].every((node) => node.textContent.includes("Step: 2")));
    await clickChildAdd("a");
    await assertCount("a", 3);
    await assertCount("b", 1);
    steps.push({ name: "step-input-propagation", passed: true, counts: { a: 3, b: 1 } });

    await clickParent(".module-lock-toggle");
    const lockedAAdd = page.locator(`${childRoot("a")} .counter button.add`);
    if (!(await lockedAAdd.isDisabled())) throw new Error("parent lock did not disable child Add");
    const directLocked = await page.evaluate(() => window.keyedModulesDemo.dispatchGoMessage("child", { Name: "add", Arg: "" }, { key: "a", generation: 1 }));
    if (!directLocked.accepted) throw new Error("locked child Go message was not delivered to the Go module");
    await assertCount("a", 3);
    await assertCount("b", 1);
    steps.push({ name: "lock-propagation-and-child-guard", passed: true, goMessageAccepted: directLocked.accepted });

    await clickParent(".module-input-reset");
    await page.locator("#keyed-modules [data-gobi-module-root='parent'] .keyed-reorder-children").click();
    await page.waitForFunction(() => JSON.stringify(window.keyedModulesDemo.snapshot().children.map((child) => child.key)) === JSON.stringify(["b", "a"]));
    await assertCount("a", 3);
    await assertCount("b", 1);
    steps.push({ name: "reorder-preserves-child-state", passed: true, order: ["b", "a"], counts: { a: 3, b: 1 } });

    await page.locator("#keyed-modules [data-gobi-module-root='parent']").getByRole("button", { name: "Remove a" }).click();
    await page.waitForFunction(() => window.keyedModulesDemo.snapshot().children.length === 1 && window.keyedModulesDemo.snapshot().children[0].key === "b");
    await page.locator("#keyed-modules [data-gobi-module-root='parent']").getByRole("button", { name: "Mount a" }).click();
    await page.waitForFunction(() => window.keyedModulesDemo.snapshot().children.some((child) => child.key === "a" && child.generation === 2));
    await assertCount("a", 0);
    await assertCount("b", 1);
    const remounted = await snapshot();
    const stalePublication = await page.evaluate(() => {
      const current = window.keyedModulesDemo.snapshot();
      const revision = current.children[0].input.Revision ?? current.children[0].input.revision;
      return window.keyedModulesDemo.publishChild("a", 1, { Count: 99, Revision: revision });
    });
    if (stalePublication.accepted !== false || stalePublication.stale !== true) throw new Error("old child publication was not rejected after remount");
    await assertCount("a", 0);
    steps.push({ name: "remove-remount-generation-fence", passed: true, generation: 2, stalePublication });

    const beforeSwap = await snapshot();
    await page.locator("[data-keyed-backend='react']").click();
    await page.waitForFunction(() => window.keyedModulesDemo.snapshot().backend === "react");
    await page.locator("[data-keyed-backend='dom']").click();
    await page.waitForFunction(() => window.keyedModulesDemo.snapshot().backend === "dom");
    const finalSnapshot = await snapshot();
    if (JSON.stringify(finalSnapshot.children.map((child) => [child.key, child.generation])) !==
        JSON.stringify(beforeSwap.children.map((child) => [child.key, child.generation]))) {
      throw new Error("renderer round trip changed keyed membership or generation");
    }
    await assertCount("a", 0);
    await assertCount("b", 1);
    if (pageErrors.length !== 0 || failedRequests.length !== 0) {
      throw new Error(`demo reported page errors or failed requests: ${JSON.stringify({ pageErrors, failedRequests })}`);
    }
    const finalTrace = await page.evaluate(() => window.keyedModulesDemo.trace());
    demoSummary.httpSmoke = {
      schema: "gobi.keyed-modules-demo-http-smoke/v1",
      status: "passed",
      httpStatus: response.status(),
      initialSnapshot: initial,
      remountedSnapshot: remounted,
      finalSnapshot,
      finalTrace,
      steps,
      rendererRoundTripPreserved: true,
      pageErrors,
      failedRequests,
    };
    await writeJSON(join(attemptRoot, "demo/http-smoke.json"), demoSummary.httpSmoke);
  } catch (error) {
    await writeJSON(join(attemptRoot, "demo/http-smoke.failed.json"), {
      schema: "gobi.keyed-modules-demo-http-smoke-failure/v1",
      status: "failed",
      url: server.url,
      pageErrors,
      failedRequests,
      error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null },
    }).catch(() => {});
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise((done) => server.server.close(done));
  }
}

async function readCapture(pin, label) {
  if (!pin || typeof pin !== "object" || typeof pin.path !== "string") throw new Error(`${label} capture pin is missing`);
  const path = pin.path.startsWith(sep) ? pin.path : resolve(root, pin.path);
  if (!path.startsWith(`${attemptRoot}${sep}`)) throw new Error(`${label} capture was written outside the current attempt`);
  const bytes = await readFile(path);
  if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) throw new Error(`${label} capture digest differs from harness summary`);
  const capture = JSON.parse(bytes.toString("utf8"));
  if (!capture || typeof capture !== "object" || Array.isArray(capture)) throw new Error(`${label} capture is not a JSON object`);
  return { capture, path, bytes, sha256: pin.sha256 };
}

async function runConformance(args) {
  currentStage = "native-direct-browser-conformance";
  const { chromium } = await import(pathToFileURL(join(root, "interaction/node_modules/playwright/index.mjs")).href);
  const outputStem = join(attemptRoot, "conformance/keyed");
  await mkdir(dirname(outputStem), { recursive: true });
  const harnessPath = join(here, "conformance/run.mjs");
  const stdout = await execute("keyed-conformance", nodeExecutable, [
    harnessPath,
    "--native-go", goExecutable,
    "--build-index", join(attemptRoot, "builds/build-index.json"),
    "--chromium", chromiumPath,
    "--output", outputStem,
  ], {
    cwd: root,
    env: { GOBI_GO_BIN: goExecutable, CHROMIUM_PATH: chromiumPath },
    maxBuffer: 256 * 1024 * 1024,
  });
  conformanceSummary = parseSingleJSON(stdout, "keyed module conformance harness");
  if (conformanceSummary.schema !== "gobi.keyed-modules-conformance-summary/v1" ||
      conformanceSummary.status !== "matched" || conformanceSummary.scenarioCount !== 4 ||
      conformanceSummary.browserProfileCount !== 12 || conformanceSummary.directProfileCount !== 8 ||
      !conformanceSummary.captures?.literal || !conformanceSummary.captures?.seeds) {
    throw new Error("native/direct/browser conformance summary did not match the finite four-scenario profile");
  }
  const scenariosModule = await import(pathToFileURL(join(here, "conformance/scenarios.mjs")).href);
  const expectedSeeds = scenariosModule.DEFAULT_SEEDS.map(String);
  if (JSON.stringify(Object.keys(conformanceSummary.captures.seeds).sort()) !== JSON.stringify(expectedSeeds.sort())) {
    throw new Error("conformance summary does not contain the three frozen seed captures");
  }
  const report = [];
  for (const [name, captureSet] of [["literal", conformanceSummary.captures.literal], ...Object.entries(conformanceSummary.captures.seeds).map(([seed, value]) => [`seed-${seed}`, value])]) {
    const scenario = name === "literal"
      ? scenariosModule.literalKeyedScenario()
      : scenariosModule.generateSeededKeyedScenario(Number(name.slice("seed-".length))).scenario;
    const native = await readCapture(captureSet.native, `${name} native`);
    const direct = {
      react: await readCapture(captureSet.direct?.react, `${name} direct react`),
      dom: await readCapture(captureSet.direct?.dom, `${name} direct dom`),
    };
    const browser = await readCapture(captureSet.browserIndex, `${name} browser aggregate`);
    const browserProfiles = {};
    for (const profile of ["react", "dom", "swap"]) {
      browserProfiles[profile] = await readCapture(captureSet.browser?.[profile], `${name} browser ${profile}`);
    }
    report.push({
      name,
      scenario,
      native,
      direct,
      browser,
      browserProfiles,
    });
  }
  conformanceSummary.capturesVerified = report.map(({ name, native, direct, browser, browserProfiles }) => ({
    name,
    native: { path: relative(attemptRoot, native.path).split(sep).join("/"), bytes: native.bytes.length, sha256: native.sha256 },
    direct: Object.fromEntries(Object.entries(direct).map(([backend, capture]) => [backend, {
      path: relative(attemptRoot, capture.path).split(sep).join("/"), bytes: capture.bytes.length, sha256: capture.sha256,
    }])),
    browserAggregate: { path: relative(attemptRoot, browser.path).split(sep).join("/"), bytes: browser.bytes.length, sha256: browser.sha256 },
    browser: Object.fromEntries(Object.entries(browserProfiles).map(([profile, item]) => [profile, {
      path: relative(attemptRoot, item.path).split(sep).join("/"), bytes: item.bytes.length, sha256: item.sha256,
    }])),
  }));
  await writeJSON(join(attemptRoot, "conformance/summary.json"), conformanceSummary);
  return { report, chromium };
}

async function runOracle(report) {
  currentStage = "healthy-oracle-and-mutation-controls";
  const oracle = await import(pathToFileURL(join(here, "oracle/oracle.mjs")).href);
  const nativeChecks = [];
  for (const item of report) {
    const result = await oracle.assertNativeKeyedCapture(item.native.capture, item.scenario);
    if (result?.status !== "matched" || !Array.isArray(result.checks) || result.checks.length === 0) {
      throw new Error(`${item.name} native oracle did not return matched checks`);
    }
    nativeChecks.push({ scenario: item.name, ...result });
  }
  const parityChecks = [];
  for (const item of report) {
    const result = await oracle.assertKeyedCaptureParity({
      native: item.native.capture,
      direct: Object.fromEntries(Object.entries(item.direct).map(([backend, capture]) => [backend, capture.capture])),
      browser: item.browser.capture,
      scenario: item.scenario,
    });
    if (result?.status !== "matched") throw new Error(`${item.name} native/direct/browser oracle parity did not match`);
    parityChecks.push({ scenario: item.name, ...result });
  }
  const literal = report.find((item) => item.name === "literal");
  const mutations = await oracle.runKeyedMutationControls({
    native: literal.native.capture,
    direct: Object.fromEntries(Object.entries(literal.direct).map(([backend, capture]) => [backend, capture.capture])),
    browser: literal.browser.capture,
    scenario: literal.scenario,
  });
  if (mutations?.status !== "detected" || mutations.mutationControlsDetected < 10 ||
      mutations.controls?.some((control) => control.status !== "rejected")) {
    throw new Error("keyed mutation controls did not reject every frozen fault control");
  }
  oracleSummary = {
    schema: "gobi.keyed-modules-oracle-summary/v1",
    status: "matched",
    healthyNativeChecks: nativeChecks,
    parityChecks,
    mutationControls: mutations,
    build: buildOracleSummary,
  };
  await writeJSON(join(attemptRoot, "oracle/summary.json"), oracleSummary);
  return oracleSummary;
}

async function copySourceSnapshot(pins) {
  for (const [path, expected] of Object.entries(pins)) {
    const source = join(root, path);
    const bytes = await readFile(source);
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error(`source changed before snapshot copy: ${path}`);
    const target = join(attemptRoot, "source", path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx", mode: 0o444 });
  }
}

async function inventoryAttempt() {
  const files = await walkFiles(attemptRoot);
  const members = [];
  for (const path of files) {
    const bytes = await readFile(path);
    members.push({ path: relative(attemptRoot, path).split(sep).join("/"), bytes: bytes.length, sha256: sha256(bytes) });
  }
  members.sort((left, right) => left.path.localeCompare(right.path));
  return members;
}

async function consumeArchiveIndependently(manifestHash) {
  currentStage = "independent-archive-consumer";
  const python = [
    "import hashlib,json,sys,tarfile",
    "archive,manifest_path,manifest_hash=sys.argv[1:4]",
    "manifest=json.load(open(manifest_path,encoding='utf-8'))",
    "expected={item['path']:item for item in manifest['members']}",
    "with tarfile.open(archive,'r:gz') as tf:",
    " members=tf.getmembers(); actual={}",
    " for item in members:",
    "  name=item.name[2:] if item.name.startswith('./') else item.name",
    "  if name in actual: raise SystemExit('duplicate member: '+name)",
    "  if not item.isfile(): raise SystemExit('non-regular archive member: '+name)",
    "  actual[name]=item",
    " if set(actual)!=set(expected): raise SystemExit('archive member set differs from manifest')",
    " for name,item in expected.items():",
    "  stream=tf.extractfile(actual[name]); data=stream.read() if stream else b''",
    "  digest=hashlib.sha256(data).hexdigest()",
    "  if len(data)!=item['bytes'] or digest!=item['sha256']: raise SystemExit('archive content mismatch: '+name)",
    "print(json.dumps({'schema':'gobi.keyed-modules-independent-consumer/v1','status':'passed','members':len(actual),'archiveSHA256':manifest['archive']['sha256'],'manifestSHA256':manifest_hash},sort_keys=True))",
  ].join("\n");
  const output = await execute("independent-archive-consumer", pythonExecutable, [
    "-c", python, archivePath, archiveManifestPath, manifestHash,
  ], { cwd: root, env: {}, logDir: join(evidenceRoot, "consumer-logs") });
  return parseSingleJSON(output, "independent Python archive consumer");
}

async function freezeArchive(sourcePinsAfter) {
  currentStage = "archive-inventory-and-roundtrip";
  const changes = changedPins(sourcePinsBefore, sourcePinsAfter);
  if (changes.length !== 0) throw new Error(`source inputs changed during the profile: ${changes.join(", ")}`);
  await copySourceSnapshot(sourcePinsBefore);
  const pinsAfterCopy = await snapshotSourcePins();
  const copyChanges = changedPins(sourcePinsBefore, pinsAfterCopy);
  if (copyChanges.length !== 0) throw new Error(`source inputs changed while copying the immutable source snapshot: ${copyChanges.join(", ")}`);
  await writeImmutableSnapshot(join(attemptRoot, "execution-before-archive.json"), {
    schema: "gobi.keyed-modules-execution-snapshot/v1",
    sourceCommit: sourceCommitArgument,
    verifierGitHead: gitStart.head,
    verifierGitDirty: gitStart.dirty,
    verifierSourcePinsMatch: gitStart.sourcePinsMatch,
    verifierSourcePinMismatches: gitStart.sourcePinMismatches,
    sourcePins: sourcePinsBefore,
    commands: commandRecords,
    counts: {
      scenarios: Object.keys(conformanceSummary.capturesVerified ?? {}).length,
      browserProfiles: conformanceSummary.browserProfileCount,
      mutationControls: oracleSummary.mutationControls.mutationControlsDetected,
      focusedGoPackages: focusedTestSummary.go.packages.length,
      focusedNodeTests: focusedTestSummary.node.tests,
      focusedNodeSkips: focusedTestSummary.node.skipped,
    },
  });
  const members = await inventoryAttempt();
  const verifyRoot = await mkdtemp(join(tmpdir(), "gobi-keyed-archive-verify-"));
  let produced;
  try {
    produced = await archiveAndVerify({
      attemptRoot,
      archivePath,
      verifyRoot,
      includePaths: ["source", "builds", "native", "scenarios", "conformance", "demo", "oracle", "metadata", "logs", "execution-before-archive.json"],
      members,
      execute: async (name, command, args) => execute(`archive-${name}`, command, args, {
        cwd: root, env: {}, logDir: join(evidenceRoot, "archive-logs"), includeInCommands: false,
      }),
      hashPath: async (path) => hashFile(path),
      readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
    });
  } finally {
    await rm(verifyRoot, { recursive: true, force: true });
  }
  if (produced.archivedSnapshot?.schema !== "gobi.keyed-modules-execution-snapshot/v1" ||
      produced.archivedSnapshot.sourceCommit !== sourceCommitArgument ||
      JSON.stringify(produced.archivedSnapshot.sourcePins) !== JSON.stringify(sourcePinsBefore)) {
    throw new Error("archive round-trip did not preserve the exact source snapshot and execution identity");
  }
  const manifest = {
    schema: "gobi.keyed-modules-archive-manifest/v1",
    sourceCommit: sourceCommitArgument,
    verifierGitHead: gitStart.head,
    verifierGitDirty: gitStart.dirty,
    verifierSourcePinsMatch: gitStart.sourcePinsMatch,
    sourcePins: sourcePinsBefore,
    members,
    archive: { path: archivePath, ...produced.archive },
    archivedSnapshotVerified: true,
  };
  const manifestHash = await writeJSON(archiveManifestPath, manifest);
  const consumer = await consumeArchiveIndependently(manifestHash.sha256);
  const archiveAfterConsumer = await hashFile(archivePath);
  if (archiveAfterConsumer.bytes !== produced.archive.bytes || archiveAfterConsumer.sha256 !== produced.archive.sha256 ||
      consumer.status !== "passed" || consumer.members !== members.length || consumer.manifestSHA256 !== manifestHash.sha256) {
    throw new Error("independent post-command archive consumer failed the frozen member inventory");
  }
  const pinsAfterConsumer = await snapshotSourcePins();
  const consumerChanges = changedPins(sourcePinsBefore, pinsAfterConsumer);
  if (consumerChanges.length !== 0) throw new Error(`source files changed during archive verification: ${consumerChanges.join(", ")}`);
  await writeJSON(join(evidenceRoot, "independent-consumer.json"), consumer);
  return { manifest, manifestHash, consumer };
}

let sourceCommitArgument = null;

async function writeFailureReceipt(error, args) {
  if (!evidenceRoot) return;
  const failure = {
    schema: "gobi.keyed-modules-delivery-failure/v1",
    status: "failed",
    sourceCommit: args.sourceCommit,
    verifierGitHead: gitStart?.head ?? null,
    verifierGitDirty: gitStart?.dirty ?? null,
    verifierSourcePinsMatch: gitStart?.sourcePinsMatch ?? null,
    verifierSourcePinMismatches: gitStart?.sourcePinMismatches ?? null,
    stage: currentStage,
    error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null },
    sourcePinsBefore,
    commandCount: commandRecords.length,
    commands: commandRecords,
    attemptRoot,
    archivePath: archivePath ?? null,
  };
  await writeJSON(join(evidenceRoot, "failure-receipt.json"), failure).catch(() => {});
}

async function run(args) {
  sourceCommitArgument = args.sourceCommit;
  const now = new Date().toISOString().replace(/[-:.]/g, "");
  attemptId = `attempt-${now}-${process.pid}-${randomUUID().slice(0, 8)}`;
  attemptRoot = join(args.outputRoot, attemptId);
  evidenceRoot = join(here, "evidence/attempts", attemptId);
  archivePath = join(args.outputRoot, `${attemptId}.tar.gz`);
  archiveManifestPath = join(args.outputRoot, `${attemptId}.manifest.json`);
  logsRoot = join(attemptRoot, "logs");
  await createExclusiveAttemptDirectory(attemptRoot);
  await mkdir(dirname(evidenceRoot), { recursive: true });
  await mkdir(evidenceRoot, { recursive: false });
  await mkdir(logsRoot, { recursive: true });

  currentStage = "toolchain-and-source-snapshot";
  const rootGoVersion = await execute("go-version", goExecutable, ["version"], { env: rootGoEnv });
  if (!/go version go1\.24\./.test(rootGoVersion)) throw new Error(`Go 1.24 required for native calls, got ${rootGoVersion.trim()}`);
  const nodeVersion = process.versions.node;
  if (Number(nodeVersion.split(".")[0]) !== 22) throw new Error(`Node 22 required, got ${nodeVersion}`);
  const compilerGoVersion = await execute("compiler-go-version", goExecutable, ["version"], { cwd: compilerDir, env: compilerGoEnv });
  if (!/go version go1\.27\.3/.test(compilerGoVersion)) throw new Error(`compiler Go 1.27.3 required, got ${compilerGoVersion.trim()}`);
  const pythonVersion = await execute("python-version", pythonExecutable, ["--version"], { env: {}, logDir: join(evidenceRoot, "consumer-logs") });
  const tarVersion = await execute("tar-version", "tar", ["--version"], { env: {} });
  const chromiumRaw = args.chromium ?? process.env.CHROMIUM_PATH ?? process.env.CHROMIUM_EXECUTABLE_PATH;
  if (chromiumRaw) chromiumPath = resolve(chromiumRaw);
  else {
    const { chromium } = await import(pathToFileURL(join(root, "interaction/node_modules/playwright/index.mjs")).href);
    chromiumPath = chromium.executablePath();
  }
  const chromiumVersion = await execute("chromium-version", chromiumPath, ["--version"], { env: {} });
  const playwrightPackage = JSON.parse(await readFile(join(root, "interaction/node_modules/playwright/package.json"), "utf8"));
  toolchain = {
    goExecutable,
    go: rootGoVersion.trim(),
    compilerGo: compilerGoVersion.trim(),
    nodeExecutable,
    node: `v${nodeVersion}`,
    pythonExecutable,
    python: pythonVersion.trim(),
    chromiumPath,
    chromium: chromiumVersion.trim(),
    playwright: playwrightPackage.version,
    tar: tarVersion.trim().split(/\r?\n/)[0],
    platform: process.platform,
    architecture: process.arch,
  };
  gitStart = await gitMetadata("before");
  if (args.sourceCommit !== gitStart.head) throw new Error(`source commit ${args.sourceCommit} does not match Git HEAD ${gitStart.head}`);
  if (gitStart.dirty && !args.allowDirty) throw new Error("working tree is dirty; use --allow-dirty for an author-only diagnostic");
  sourcePinsBefore = await snapshotSourcePins();
  const sourceClosure = await compareSourcePinsToGit(sourcePinsBefore, gitStart.head);
  gitStart.sourcePinsMatch = sourceClosure.sourcePinsMatch && !gitStart.dirty;
  gitStart.sourcePinMismatches = sourceClosure.mismatches;
  if (!gitStart.dirty && !gitStart.sourcePinsMatch) {
    throw new Error(`clean checkout source pins do not match Git HEAD: ${sourceClosure.mismatches.join(", ")}`);
  }
  await writeJSON(join(attemptRoot, "metadata/source-pins-before.json"), sourcePinsBefore);
  await writeJSON(join(attemptRoot, "metadata/git-source-closure.json"), gitStart);
  await writeJSON(join(attemptRoot, "metadata/runner-context.json"), {
    schema: "gobi.keyed-modules-run-context/v1",
    sourceCommit: args.sourceCommit,
    verifierGitHead: gitStart.head,
    verifierGitDirty: gitStart.dirty,
    verifierGitStatus: gitStart.status,
    verifierSourcePinsMatch: gitStart.sourcePinsMatch,
    verifierSourcePinMismatches: gitStart.sourcePinMismatches,
    tools: toolchain,
    fixture: { path: "fixtures/compiled/keyedmoduleparent/scenario.json", sha256: sha256(await readFile(join(root, "fixtures/compiled/keyedmoduleparent/scenario.json"))) },
    dirtyAllowed: args.allowDirty,
  });

  const build = await runBuildAdapter();
  await runFocusedTests(build.indexPath);
  const { report, chromium } = await runConformance(args);
  await runOracle(report);
  const siteRoot = await runDemoBuild(join(attemptRoot, "builds"));
  await runDemoHTTPSmoke(chromium, siteRoot);

  currentStage = "final-source-pin-comparison";
  const sourcePinsAfter = await snapshotSourcePins();
  const changed = changedPins(sourcePinsBefore, sourcePinsAfter);
  if (changed.length !== 0) throw new Error(`source inputs changed during the profile: ${changed.join(", ")}`);
  const gitEnd = await gitMetadata("after");
  if (gitEnd.head !== gitStart.head || gitEnd.status !== gitStart.status) throw new Error("Git HEAD or working-tree status changed during the profile");
  await writeJSON(join(attemptRoot, "metadata/source-pins-after.json"), sourcePinsAfter);
  await writeJSON(join(attemptRoot, "metadata/git-source-closure-after.json"), gitEnd);
  const archive = await freezeArchive(sourcePinsAfter);

  currentStage = "final-receipt";
  const scenarioCounts = Object.fromEntries(report.map((item) => [item.name, item.scenario.events.length]));
  const captureSummary = conformanceSummary.capturesVerified;
  const receipt = {
    schema: "gobi.keyed-modules-delivery-receipt/v1",
    status: gitStart.sourcePinsMatch ? "passed" : "author-only",
    profile: "two-key-independent-counter-parent-child-v1",
    sourceCommit: args.sourceCommit,
    verifier: {
      gitHead: gitStart.head,
      dirty: gitStart.dirty,
      sourcePinsMatch: gitStart.sourcePinsMatch,
      sourcePinMismatches: gitStart.sourcePinMismatches,
    },
    attempt: { id: attemptId, path: attemptRoot },
    tools: toolchain,
    counts: {
      buildCalls: 4,
      focusedGoPackages: focusedTestSummary.go.packages.length,
      focusedNodeTests: focusedTestSummary.node.tests,
      focusedNodeSkips: focusedTestSummary.node.skipped,
      scenarios: scenarioCounts,
      browserProfiles: conformanceSummary.browserProfileCount,
      mutationControlsDetected: oracleSummary.mutationControls.mutationControlsDetected,
    },
    builds: build.builds,
    buildIndex: {
      path: relative(attemptRoot, build.indexPath).split(sep).join("/"),
      bytes: build.indexBytes.length,
      sha256: sha256(build.indexBytes),
      admission: build.index.admission,
      adapterChecks: build.index.adapterChecks,
    },
    focusedTests: focusedTestSummary,
    conformance: { summary: conformanceSummary, captures: captureSummary },
    oracle: oracleSummary,
    demo: demoSummary,
    sourcePins: sourcePinsBefore,
    archive: {
      path: archivePath,
      bytes: archive.manifest.archive.bytes,
      sha256: archive.manifest.archive.sha256,
      manifestPath: archiveManifestPath,
      manifestSHA256: archive.manifestHash.sha256,
      members: archive.manifest.members.length,
      independentConsumer: archive.consumer,
    },
    commands: commandRecords,
  };
  await writeJSON(join(evidenceRoot, "receipt.json"), receipt);
  process.stdout.write(`${JSON.stringify({
    schema: "gobi.keyed-modules-delivery-summary/v1",
    status: receipt.status,
    sourceCommit: args.sourceCommit,
    attempt: attemptId,
    buildCalls: 4,
    scenarios: scenarioCounts,
    browserProfiles: conformanceSummary.browserProfileCount,
    mutationControlsDetected: oracleSummary.mutationControls.mutationControlsDetected,
    archive: receipt.archive,
    receiptPath: join(evidenceRoot, "receipt.json"),
  })}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Usage: node compiled-keyed-modules/run.mjs --source-commit <40-char-sha> [--chromium <executable>] [--allow-dirty] [--output-root <dir>]\n");
    return;
  }
  try { await run(args); }
  catch (error) {
    await writeFailureReceipt(error, args);
    process.stderr.write(`${currentStage}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

await main();



