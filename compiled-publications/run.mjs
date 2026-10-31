import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  archiveAndVerify,
  createExclusiveAttemptDirectory,
  writeImmutableSnapshot,
} from "../compiled-capabilities/archive-helper.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const packagePath = "github.com/samuelpmahan/gondola/fixtures/compiled/publications";
const fixturePath = join(root, "fixtures/compiled/publications/scenario.json");
const outputRoot = join(here, "demo/output/attempts");
const evidenceRootBase = join(here, "evidence/attempts");
const compilerDir = join(root, "compiled-frontend");
const buildScript = join(here, "demo/build.mjs");
const smokeScript = join(here, "demo/smoke.mjs");
const archiveVerifier = join(here, "demo/verify-archive.mjs");
const harness = join(here, "conformance/run.mjs");
const attemptId = `attempt-${new Date().toISOString().replace(/[-:.]/g, "")}-${process.pid}`;
const attemptRoot = join(outputRoot, attemptId);
const evidenceRoot = join(evidenceRootBase, attemptId);
const archivePath = join(outputRoot, `${attemptId}.tar.gz`);
const manifestPath = join(outputRoot, `${attemptId}.archive-manifest.json`);
const sourcePath = (path) => join(root, path);
const rel = (path) => relative(root, path).split(sep).join("/");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = () => new Date().toISOString();
const argv = process.argv.slice(2);
const rootGoEnv = { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" };
const compilerGoEnv = { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" };
const rootGoExecutable = process.env.GOBI_GO_BIN ?? (spawnSync("which", ["go"], { encoding: "utf8" }).stdout?.trim() || "go");
let chromiumPath = process.env.CHROMIUM_PATH ?? process.env.CHROMIUM_EXECUTABLE_PATH ?? null;
let logRoot = join(attemptRoot, "logs");

let chromiumArgumentSeen = false;
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === "--chromium") {
    if (chromiumArgumentSeen) throw new Error("--chromium may be specified only once");
    chromiumArgumentSeen = true;
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error("--chromium requires a path");
    chromiumPath = resolve(value);
  } else if (argv[index] === "--help") {
    process.stdout.write("Usage: node compiled-publications/run.mjs [--chromium <path>]\n");
    process.exit(0);
  } else {
    throw new Error(`unknown argument ${argv[index]}`);
  }
}

const sourceDirectories = [
  "cmd/compiled-publications-native",
  "fixtures/compiled/publications",
  "counter",
  "gobi",
  "compilercontract",
  "reactmap",
  "compiled-capabilities",
  "compiled-children/runtime",
  "compiled-frontend/frontend/runtime",
  "compiled-frontend/frontend/react",
  "compiled-frontend/frontend/dom",
  "compiled-publications/compiler",
  "compiled-publications/conformance",
  "compiled-publications/demo",
  "compiled-publications/oracle",
  "compiled-publications/runtime",
];
const sourceFiles = [
  "go.mod", "package.json", "package-lock.json",
  "interaction/package.json", "interaction/package-lock.json",
  "compiled-frontend/go.mod", "compiled-frontend/go.sum",
  "compiled-frontend/package.json", "compiled-frontend/package-lock.json",
  "run-compiled-children.sh", "run-compiled-publications.sh",
  ".github/workflows/gobi-compiled-publications.yml",
  "compiled-publications/CONTRACT.md", "compiled-publications/PLAN.md",
  "compiled-publications/README.md", "compiled-publications/RESULTS.md",
  "compiled-publications/.gitignore", "compiled-publications/run.mjs",
  "compiled-capabilities/archive-helper.mjs",
  "compiled-frontend/conformance/browser.mjs",
  "compiled-frontend/conformance/no-wasm.mjs",
  "compiled-frontend/conformance/direct-js.mjs",
  "compiled-frontend/conformance/compare.mjs",
];
const excludedSegments = new Set([".git", "node_modules", "build", "builds", "output", "evidence", "attempts", "coordination", "rawlogs", "receipts", "reports", "seals", "__pycache__"]);

if (!chromiumPath) {
  const { chromium } = await import(pathToFileURL(join(root, "interaction/node_modules/playwright/index.mjs")).href);
  chromiumPath = chromium.executablePath();
}
chromiumPath = resolve(chromiumPath);

async function walk(directory, { excludeGenerated = false } = {}) {
  const output = [];
  let entries;
  try {
    entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    if (error?.code === "ENOENT") return output;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (excludeGenerated && excludedSegments.has(entry.name)) continue;
      output.push(...await walk(path, { excludeGenerated }));
    } else if (entry.isFile()) output.push(path);
  }
  return output;
}

async function hashFile(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: hash(bytes) };
}

async function snapshotSourcePins() {
  const paths = new Set(sourceFiles);
  for (const directory of sourceDirectories) {
    for (const path of await walk(sourcePath(directory), { excludeGenerated: true })) paths.add(rel(path));
  }
  const pins = {};
  for (const path of [...paths].sort()) {
    const bytes = await readFile(sourcePath(path));
    pins[path] = { bytes: bytes.length, sha256: hash(bytes) };
  }
  return pins;
}

async function writeJSON(path, value, immutable = false) {
  await mkdir(dirname(path), { recursive: true });
  if (immutable) return writeImmutableSnapshot(path, value);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await writeFile(path, bytes, { flag: "wx" });
  return { bytes: bytes.length, sha256: hash(bytes) };
}

const commands = [];
async function execute(name, command, args, options = {}) {
  const destination = options.logRoot ?? logRoot;
  await mkdir(destination, { recursive: true });
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    input: options.input,
    maxBuffer: 256 * 1024 * 1024,
  });
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  const record = {
    name,
    command,
    args,
    cwd: options.cwd ?? root,
    environment: options.env ?? {},
    exitCode: result.status,
    signal: result.signal ?? null,
    spawnError: result.error ? String(result.error.message ?? result.error) : null,
    stdout: { bytes: stdout.length, sha256: hash(stdout) },
    stderr: { bytes: stderr.length, sha256: hash(stderr) },
    startedAt: stamp(),
  };
  if (options.input !== undefined) {
    const inputBytes = Buffer.isBuffer(options.input) ? options.input : Buffer.from(String(options.input));
    record.stdin = { bytes: inputBytes.length, sha256: hash(inputBytes) };
    await writeFile(join(destination, `${safeName}.stdin.txt`), inputBytes, { flag: "wx" });
  }
  await Promise.all([
    writeFile(join(destination, `${safeName}.stdout.log`), stdout, { flag: "wx" }),
    writeFile(join(destination, `${safeName}.stderr.log`), stderr, { flag: "wx" }),
  ]);
  commands.push(record);
  if (result.error || result.status !== 0) {
    record.completedAt = stamp();
    await Promise.all([
      writeFile(join(destination, `${safeName}.command.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" }),
      writeFile(join(destination, `${safeName}.exit-code`), `${record.exitCode ?? "signal"}\n`, { flag: "wx" }),
    ]);
    throw result.error ?? new Error(`${name} exited ${result.status}${stderr.length ? `: ${stderr.toString("utf8").trim()}` : ""}`);
  }
  record.completedAt = stamp();
  await Promise.all([
    writeFile(join(destination, `${safeName}.command.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" }),
    writeFile(join(destination, `${safeName}.exit-code`), `${record.exitCode ?? "signal"}\n`, { flag: "wx" }),
  ]);
  return stdout.toString("utf8");
}

function lastJSON(text, label) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch { /* continue to last JSON line */ }
  }
  throw new Error(`${label} returned no nonempty JSON output`);
}

async function recordBuild(backend) {
  const backendRoot = join(attemptRoot, backend);
  const outputDir = join(backendRoot, "output");
  const request = {
    schema: "gobi.build-request/v1",
    sourceRoot: root,
    entryPackages: [packagePath],
    backend,
    outputDir,
  };
  const requestPath = join(backendRoot, "request.json");
  await mkdir(outputDir, { recursive: true });
  await writeJSON(requestPath, request);
  const output = await execute(`goscript-${backend}`, rootGoExecutable, ["run", "./cmd/gobi-build"], {
    cwd: compilerDir,
    env: compilerGoEnv,
    input: `${JSON.stringify(request)}\n`,
  });
  const buildResult = JSON.parse(output);
  if (buildResult.schema !== "gobi.build-result/v1" || buildResult.ok !== true ||
      (buildResult.diagnostics?.length ?? 0) !== 0 || buildResult.apps?.length !== 1 ||
      buildResult.apps[0].packagePath !== packagePath) {
    throw new Error(`${backend} GoScript CLI result is not one clean publications build`);
  }
  const manifestPath = join(outputDir, "buildmanifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.schema !== "gobi.build-manifest/v1" || manifest.apps?.length !== 1 ||
      manifest.apps[0].packagePath !== packagePath || manifest.apps[0].backend !== backend) {
    throw new Error(`${backend} buildmanifest identity is invalid`);
  }
  const app = manifest.apps[0];
  const artifactPaths = {};
  for (const key of ["appIR", "module", "encoder"]) {
    const value = app[key];
    if (typeof value !== "string" || !value || value.startsWith("/")) throw new Error(`${backend} manifest has invalid ${key} path`);
    const path = resolve(outputDir, value);
    if (!path.startsWith(outputDir + sep)) throw new Error(`${backend} ${key} path escapes build directory`);
    artifactPaths[key] = path;
  }
  const appIR = JSON.parse(await readFile(artifactPaths.appIR, "utf8"));
  const component = appIR.components?.find((item) => item.packagePath === packagePath && item.id === packagePath);
  if (!component || !Array.isArray(component.capabilities)) throw new Error(`${backend} AppIR component identity is invalid`);
  for (const capability of ["view.node", "effect.request-reply", "effect.cancel"]) {
    if (!component.capabilities.includes(capability)) throw new Error(`${backend} AppIR is missing ${capability}`);
  }
  if (!Array.isArray(buildResult.outputs) || buildResult.outputs.length === 0) throw new Error(`${backend} BuildResult output list is empty`);
  const outputPins = [];
  const seen = new Set();
  for (const outputRecord of buildResult.outputs) {
    if (typeof outputRecord.path !== "string" || seen.has(outputRecord.path)) throw new Error(`${backend} BuildResult path is empty or duplicated`);
    seen.add(outputRecord.path);
    const fullPath = resolve(outputDir, outputRecord.path);
    if (!fullPath.startsWith(outputDir + sep)) throw new Error(`${backend} output path escapes build directory`);
    const pin = await hashFile(fullPath);
    if (pin.bytes !== outputRecord.bytes || pin.sha256 !== outputRecord.sha256) throw new Error(`${backend} BuildResult pin mismatch ${outputRecord.path}`);
    outputPins.push({ path: outputRecord.path, ...pin });
  }
  const physicalPaths = (await walk(outputDir)).map((path) => relative(outputDir, path).split(sep).join("/")).sort();
  if (JSON.stringify(physicalPaths) !== JSON.stringify(outputPins.map((item) => item.path).sort())) {
    throw new Error(`${backend} physical output directory differs from BuildResult inventory`);
  }
  const appArtifacts = {};
  for (const [key, path] of Object.entries(artifactPaths)) appArtifacts[key] = { path: rel(path), ...await hashFile(path) };
  const record = {
    backend,
    request: { path: rel(requestPath), ...await hashFile(requestPath) },
    result: buildResult,
    manifest: { path: rel(manifestPath), bytes: manifestBytes.length, sha256: hash(manifestBytes) },
    componentId: component.id,
    capabilities: component.capabilities,
    artifacts: appArtifacts,
    outputCount: outputPins.length,
    outputs: outputPins,
  };
  await writeJSON(join(backendRoot, "build-record.json"), record);
  return { backend, outputDir, manifestPath, manifest, app, component, artifactPaths, record };
}

async function copySourceInputs(pins) {
  const inputRoot = join(attemptRoot, "inputs/source");
  for (const [path, expected] of Object.entries(pins)) {
    const destination = join(inputRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    const bytes = await readFile(sourcePath(path));
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) throw new Error(`source changed while snapshotting: ${path}`);
    await writeFile(destination, bytes, { flag: "wx" });
  }
}

const receipt = {
  schema: "gobi.compiled-publications-execution/v1",
  job_id: "E-DELIVERY",
  worker: "N6",
  attempt: attemptId,
  status: "running",
  outcome: "mixed_change",
  summary: "Publications delivery attempt started; no acceptance result available yet.",
  startedAt: stamp(),
  invocation: { node: process.execPath, arguments: argv },
  versions: {},
  commands,
  stages: [],
  failures: [],
  mismatches: [],
  outputPaths: { attempt: rel(attemptRoot), evidence: rel(evidenceRoot), archive: rel(archivePath), manifest: rel(manifestPath) },
  acceptanceScope: "new typed-input/keyed-publication profile only; inherited PR16 regression is run separately by CI",
};

await createExclusiveAttemptDirectory(attemptRoot);
await mkdir(evidenceRoot, { recursive: true });
for (const name of ["native", "react", "dom", "conformance", "oracle", "demo", "inputs", "provenance", "logs"]) {
  await mkdir(join(attemptRoot, name), { recursive: true });
}
const beforePins = await snapshotSourcePins();
receipt.sourceBefore = beforePins;
await writeJSON(join(attemptRoot, "provenance/source-before.json"), beforePins);

async function stage(name, callback) {
  const entry = { name, status: "running", startedAt: stamp() };
  receipt.stages.push(entry);
  await saveProgress();
  try {
    const result = await callback();
    entry.status = "passed";
    entry.completedAt = stamp();
    return result;
  } catch (error) {
    entry.status = "failed";
    entry.completedAt = stamp();
    entry.error = String(error?.message ?? error);
    receipt.failures.push({ stage: name, message: entry.error });
    await saveProgress();
    throw error;
  }
}

async function saveProgress() {
  // Mutable progress stays in the unique attempt; the final receipt is sealed separately.
  await writeFile(join(attemptRoot, "progress.json"), `${JSON.stringify(receipt, null, 2)}\n`);
}

try {
  receipt.versions = await stage("tool-versions", async () => {
    const nodeVersion = process.version;
    const rootGo = await execute("root-go-version", rootGoExecutable, ["version"], { env: rootGoEnv });
    const compilerGo = await execute("compiler-go-version", rootGoExecutable, ["version"], { cwd: compilerDir, env: compilerGoEnv });
    const chromiumVersion = await execute("chromium-version", chromiumPath, ["--version"]);
    const npmVersion = await execute("npm-version", "npm", ["--version"]);
    if (!nodeVersion.startsWith("v22.")) throw new Error(`Node 22 required; got ${nodeVersion}`);
    if (!rootGo.includes("go1.24.")) throw new Error(`root Go 1.24 required; got ${rootGo.trim()}`);
    if (!compilerGo.includes("go1.27.3")) throw new Error(`compiler Go 1.27.3 required; got ${compilerGo.trim()}`);
    if (!/Chromium/i.test(chromiumVersion)) throw new Error(`Chromium version output is invalid: ${chromiumVersion.trim()}`);
    const versions = {
      node: nodeVersion,
      npm: npmVersion.trim(),
      rootGo: rootGo.trim(),
      compilerGo: compilerGo.trim(),
      goExecutable: rootGoExecutable,
      chromium: chromiumVersion.trim(),
      chromiumExecutable: chromiumPath,
      nodeExecutable: process.execPath,
      playwright: JSON.parse(await readFile(join(root, "interaction/node_modules/playwright/package.json"), "utf8")).version,
      react: JSON.parse(await readFile(join(root, "node_modules/react/package.json"), "utf8")).version,
      reactDOM: JSON.parse(await readFile(join(root, "node_modules/react-dom/package.json"), "utf8")).version,
      esbuild: JSON.parse(await readFile(join(root, "interaction/node_modules/esbuild/package.json"), "utf8")).version,
      lockfiles: Object.fromEntries(["package-lock.json", "interaction/package-lock.json", "compiled-frontend/package-lock.json"]
        .map((path) => [path, beforePins[path]])),
    };
    await writeJSON(join(attemptRoot, "provenance/versions.json"), versions);
    return versions;
  });

  await stage("focused-node-and-go-tests", async () => {
    const nodeTests = [
      "compiled-publications/runtime/runtime.test.mjs",
      "compiled-publications/oracle/oracle.test.mjs",
      "compiled-publications/conformance/check.test.mjs",
      "compiled-publications/conformance/seeded.test.mjs",
    ];
    for (const path of nodeTests) await readFile(sourcePath(path));
    await execute("focused-node-tests", process.execPath, ["--test", ...nodeTests], { env: { GOBI_GO_BIN: rootGoExecutable } });
    await execute("focused-go-tests", rootGoExecutable, ["test", "./fixtures/compiled/publications", "./cmd/compiled-publications-native"], { env: rootGoEnv });
    receipt.checks = (receipt.checks ?? []).concat(["focused host, literal oracle, native fixture/CLI, conformance mutation, and seeded schedule tests passed"]);
  });

  await stage("fresh-native-trace", async () => {
    const output = await execute("fresh-native-scenario", rootGoExecutable, ["run", "./cmd/compiled-publications-native", "--script", "fixtures/compiled/publications/scenario.json"], { env: rootGoEnv });
    const trace = JSON.parse(output);
    if (trace.schema !== "gobi.compiled-publications-native/v1" || trace.packagePath !== packagePath ||
        trace.name !== "typed-keyed-parent-input-delayed-publications" || trace.events?.length !== 50 || trace.steps?.length !== 45) {
      throw new Error("fresh native capture differs from frozen 50-event/45-update contract");
    }
    const path = join(attemptRoot, "native/native-trace.json");
    await writeFile(path, `${JSON.stringify(trace, null, 2)}\n`, { flag: "wx" });
    receipt.native = {
      path: rel(path),
      ...await hashFile(path),
      sourceEvents: trace.events.length,
      goUpdates: trace.steps.length,
      nonDispatchEvents: trace.events.length - trace.steps.length,
    };
    receipt.harnessInput = { nativeTrace: receipt.native, provenance: "fresh native Go CLI capture generated by this unique E-DELIVERY attempt" };
    return trace;
  });

  const reactBuild = await stage("fresh-react-and-dom-goscript-builds", async () => {
    const react = await recordBuild("react");
    const dom = await recordBuild("dom");
    for (const key of ["appIR", "encoder"]) {
      const left = await readFile(react.artifactPaths[key]);
      const right = await readFile(dom.artifactPaths[key]);
      if (!left.equals(right)) throw new Error(`React/DOM ${key} output bytes differ`);
    }
    receipt.builds = { react: react.record, dom: dom.record, appIRAndEncoderByteIdentical: true };
    await writeJSON(join(attemptRoot, "provenance/build-comparison.json"), {
      schema: "gobi.compiled-publications-build-comparison/v1",
      appIRAndEncoderByteIdentical: true,
      react: react.record.artifacts,
      dom: dom.record.artifacts,
    });
    return react;
  });

  await stage("native-direct-browser-conformance", async () => {
    const outputPrefix = join(attemptRoot, "conformance/publications");
    const text = await execute("publications-conformance", process.execPath, [
      harness,
      "--native-go", rootGoExecutable,
      "--fixture", fixturePath,
      "--expectations", join(here, "oracle/expectations.json"),
      "--react-manifest", join(attemptRoot, "react/output/buildmanifest.json"),
      "--dom-manifest", join(attemptRoot, "dom/output/buildmanifest.json"),
      "--chromium", chromiumPath,
      "--output", outputPrefix,
    ], { env: { CHROMIUM_PATH: chromiumPath } });
    const summary = lastJSON(text, "publications conformance harness");
    if (summary.schema !== "gobi.compiled-publications-conformance-summary/v1" || summary.status !== "matched") {
      throw new Error(`publications conformance did not pass: ${JSON.stringify(summary)}`);
    }
    if (summary.fixedEvents !== 50 || summary.fixedGoUpdates !== 45 || summary.fixedStateCheckpoints !== 46 || summary.seededRuns?.count !== 3) {
      throw new Error(`conformance counts differ from frozen contract: ${JSON.stringify(summary)}`);
    }
    if (JSON.stringify(summary.seededRuns.seeds) !== JSON.stringify([20261031, 20261032, 20261033]) ||
        summary.seededRuns.mountedBrowserSeed !== 20261031 || summary.mutationControlsDetected !== 16 ||
        JSON.stringify(summary.browserProfiles) !== JSON.stringify(["react", "dom", "swap"])) {
      throw new Error(`seed or mutation-control evidence differs from contract: ${JSON.stringify(summary)}`);
    }
    receipt.conformance = summary;
    return summary;
  });

  await stage("http-demo-build-and-smoke", async () => {
    const site = join(attemptRoot, "demo/site");
    const buildText = await execute("demo-build", process.execPath, [
      buildScript,
      "--react-manifest", join(attemptRoot, "react/output/buildmanifest.json"),
      "--output", site,
    ]);
    const build = lastJSON(buildText, "demo build");
    if (build.schema !== "gobi.compiled-publications-demo-build-result/v1" || build.status !== "passed") {
      throw new Error(`demo build failed: ${JSON.stringify(build)}`);
    }
    const smokePath = join(attemptRoot, "demo/smoke.json");
    const smokeText = await execute("demo-http-smoke", process.execPath, [
      smokeScript,
      "--site", site,
      "--output", smokePath,
      "--chromium", chromiumPath,
    ], { env: { CHROMIUM_PATH: chromiumPath } });
    const smoke = lastJSON(smokeText, "demo HTTP smoke");
    if (smoke.schema !== "gobi.compiled-publications-demo-smoke/v1" || smoke.status !== "passed" || smoke.checkCount !== 20 ||
        smoke.noWasm?.guardCoverage?.status !== "complete" || smoke.noWasm.guardCoverage.entries?.length !== 10 ||
        smoke.noWasm.guardCoverage.failures?.length !== 0 || smoke.noWasm.wasmRequests?.length !== 0 ||
        smoke.noWasm.wasmAPIAttempts?.length !== 0 || smoke.pageErrors?.length !== 0) {
      throw new Error(`HTTP demo smoke failed or omitted checks: ${JSON.stringify(smoke)}`);
    }
    receipt.demo = { build, smoke };
    return { build, smoke };
  });

  await stage("source-input-snapshot-and-boundary", async () => {
    await copySourceInputs(beforePins);
    const afterPins = await snapshotSourcePins();
    if (JSON.stringify(beforePins) !== JSON.stringify(afterPins)) throw new Error("pinned source changed during new-profile execution");
    const nativeCaptureNow = await hashFile(join(attemptRoot, "native/native-trace.json"));
    if (nativeCaptureNow.bytes !== receipt.native.bytes || nativeCaptureNow.sha256 !== receipt.native.sha256) {
      throw new Error("fresh attempt-native trace changed during conformance execution");
    }
    receipt.sourceAfter = afterPins;
    receipt.sourcePinsMatch = true;
    return { sourceCount: Object.keys(beforePins).length };
  });

  await stage("archive-and-independent-consumer", async () => {
    receipt.archivePending = true;
    receipt.finalAcceptance = false;
    const snapshot = await writeImmutableSnapshot(join(attemptRoot, "execution-before-archive.json"), {
      schema: "gobi.compiled-publications-pre-archive-snapshot/v1",
      attempt: attemptId,
      sourceBefore: beforePins,
      sourceAfter: receipt.sourceAfter,
      harnessInput: receipt.harnessInput,
      sourcePinsMatch: receipt.sourcePinsMatch,
      native: receipt.native,
      builds: receipt.builds,
      conformance: receipt.conformance,
      demo: receipt.demo,
      commandCount: commands.length,
      archivePending: true,
      finalAcceptance: false,
    });
    const memberPaths = (await walk(attemptRoot)).map((path) => relative(attemptRoot, path).split(sep).join("/")).sort();
    const members = [];
    for (const path of memberPaths) members.push({ path, ...await hashFile(join(attemptRoot, path)) });
    const manifest = {
      schema: "gobi.compiled-publications-archive/v1",
      policy: "explicit stable file inventory, no directory recursion; external manifest binds all archive members",
      attempt: attemptId,
      members,
      preArchiveSnapshot: { path: "execution-before-archive.json", bytes: snapshot.byteLength, sha256: hash(snapshot.bytes) },
    };
    await writeJSON(manifestPath, manifest, true);
    const producerRoundTrip = await archiveAndVerify({
      attemptRoot,
      archivePath,
      verifyRoot: join(evidenceRoot, "producer-roundtrip"),
      includePaths: ["inputs", "logs", "native", "react", "dom", "conformance", "oracle", "demo", "provenance", "execution-before-archive.json", "progress.json"],
      members,
      execute: (name, command, args) => execute(name, command, args, { logRoot: join(evidenceRoot, "archive-command-logs") }),
      hashPath: hashFile,
      readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
    });
    const archivedSnapshot = producerRoundTrip.archivedSnapshot;
    if (archivedSnapshot.schema !== "gobi.compiled-publications-pre-archive-snapshot/v1" ||
        archivedSnapshot.archivePending !== true || archivedSnapshot.finalAcceptance !== false ||
        JSON.stringify(archivedSnapshot.sourceBefore) !== JSON.stringify(beforePins) ||
        JSON.stringify(archivedSnapshot.sourceAfter) !== JSON.stringify(receipt.sourceAfter) ||
        JSON.stringify(archivedSnapshot.harnessInput) !== JSON.stringify(receipt.harnessInput)) {
      throw new Error("archived immutable snapshot differs from the pre-archive provenance pins");
    }
    const archive = await hashFile(archivePath);
    const manifestHash = await hashFile(manifestPath);
    const consumerPath = join(evidenceRoot, "independent-archive-consumer.json");
    logRoot = join(evidenceRoot, "post-archive-logs");
    const consumerText = await execute("independent-post-command-archive-consumer", process.execPath, [
      archiveVerifier,
      "--archive", archivePath,
      "--manifest", manifestPath,
      "--output", consumerPath,
      "--expected-archive-sha256", archive.sha256,
      "--expected-manifest-sha256", manifestHash.sha256,
    ], { logRoot });
    const consumer = lastJSON(consumerText, "independent archive consumer");
    if (consumer.schema !== "gobi.compiled-publications-independent-archive-verification/v1" ||
        consumer.status !== "passed" || consumer.members !== members.length ||
        consumer.archive.sha256 !== archive.sha256 || consumer.manifest.sha256 !== manifestHash.sha256 ||
        consumer.archive.bytes !== consumer.archive.statBytes) {
      throw new Error(`independent archive consumer failed: ${JSON.stringify(consumer)}`);
    }
    const finalArchive = await hashFile(archivePath);
    const finalManifest = await hashFile(manifestPath);
    if (JSON.stringify(finalArchive) !== JSON.stringify(archive) || JSON.stringify(finalManifest) !== JSON.stringify(manifestHash)) {
      throw new Error("archive or manifest changed after independent verification");
    }
    const afterArchivePins = await snapshotSourcePins();
    if (JSON.stringify(beforePins) !== JSON.stringify(afterArchivePins)) throw new Error("source pins changed across archive and independent-consumer commands");
    const nativeCaptureAfter = await hashFile(join(attemptRoot, "native/native-trace.json"));
    if (nativeCaptureAfter.bytes !== receipt.native.bytes || nativeCaptureAfter.sha256 !== receipt.native.sha256) {
      throw new Error("fresh attempt-native trace changed across archive verification");
    }
    receipt.sourceAfterArchive = afterArchivePins;
    receipt.sourcePinsMatch = true;
    receipt.archive = {
      path: rel(archivePath),
      ...archive,
      manifest: { path: rel(manifestPath), ...manifestHash },
      memberCount: members.length,
      roundTripVerified: true,
      independentConsumer: { path: rel(consumerPath), ...await hashFile(consumerPath), members: consumer.members },
      postCommandBoundary: { archiveHashStable: true, manifestHashStable: true, consumerPassed: true },
    };
    return receipt.archive;
  });

  receipt.status = "passed";
  receipt.outcome = "mixed_change";
  receipt.summary = `New typed-input/publication profile passed with ${receipt.native.goUpdates} native Go updates, ${receipt.conformance.seededRuns.count} seeded schedules, ${receipt.demo.smoke.checkCount} HTTP smoke checks, and an independently verified ${receipt.archive.memberCount}-member archive.`;
  receipt.completedAt = stamp();
  receipt.archivePending = false;
  receipt.finalAcceptance = true;
} catch (error) {
  receipt.status = "failed";
  receipt.summary = `Publications delivery failed during ${receipt.stages.at(-1)?.name ?? "setup"}: ${String(error?.message ?? error)}`;
  if (!receipt.failures.some((failure) => failure.message === String(error?.message ?? error))) {
    receipt.failures.push({ stage: receipt.stages.at(-1)?.name ?? "setup", message: String(error?.message ?? error) });
  }
  receipt.completedAt = stamp();
}

const finalReceiptPath = join(evidenceRoot, "receipt.json");
await writeJSON(finalReceiptPath, receipt, true);
const reportLines = [
  "# Publications delivery attempt",
  "",
  `**${receipt.status.toUpperCase()}** — ${receipt.summary}`,
  "",
  `Attempt: \`${attemptId}\`; source pins matched: \`${receipt.sourcePinsMatch === true}\`.`,
  "",
  "## Stages",
  "",
  ...receipt.stages.map((item) => `- ${item.name}: ${item.status}${item.error ? ` — ${item.error}` : ""}`),
  "",
  "## Counts and artifacts",
  "",
  `- Native source events: ${receipt.native?.sourceEvents ?? "not captured"}; Go updates: ${receipt.native?.goUpdates ?? "not captured"}; non-dispatch events: ${receipt.native?.nonDispatchEvents ?? "not captured"}.`,
  `- Seeded schedules: ${receipt.conformance?.seededRuns?.count ?? "not captured"}; seeds: ${JSON.stringify(receipt.conformance?.seededRuns?.seeds ?? [])}.`,
  `- HTTP smoke checks: ${receipt.demo?.smoke?.checkCount ?? "not captured"}.`,
  `- Archive: ${receipt.archive ? `${receipt.archive.memberCount} members, ${receipt.archive.bytes} bytes, SHA-256 ${receipt.archive.sha256}` : "not produced"}.`,
  "",
  "## Failures",
  "",
  ...(receipt.failures.length ? receipt.failures.map((item) => `- ${item.stage}: ${item.message}`) : ["- None." ]),
  "",
];
const reportPath = join(evidenceRoot, "report.md");
await writeFile(reportPath, reportLines.join("\n"), { flag: "wx" });
process.stdout.write(`${JSON.stringify({ schema: receipt.schema, status: receipt.status, summary: receipt.summary,
  receipt: rel(finalReceiptPath), report: rel(reportPath), attempt: rel(attemptRoot), archive: receipt.archive ?? null })}\n`);
if (receipt.status !== "passed") process.exitCode = 1;
