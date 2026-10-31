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
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const attempts = join(here, "builds/attempts");
const canonicalReport = process.env.GOBI_LIFECYCLE_REPORT_PATH
  ? resolve(root, process.env.GOBI_LIFECYCLE_REPORT_PATH)
  : join(here, "coordination/reports/E-BUILD.md");
const canonicalReceipt = process.env.GOBI_LIFECYCLE_RECEIPT_PATH
  ? resolve(root, process.env.GOBI_LIFECYCLE_RECEIPT_PATH)
  : join(here, "coordination/receipts/E-BUILD.json");
const fixturePackage = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle";
const fixturePath = join(root, "fixtures/compiled/lifecycle/scenario.json");
const nativeSource = "./cmd/compiled-lifecycle-native";
const conformanceDriver = join(here, "conformance/run.mjs");
const browserAdapter = join(here, "conformance/browser.mjs");
const contractPath = join(here, "conformance/lifecycle-contract.json");
const schedulePath = join(here, "conformance/swap-schedule.json");
const nodeTestsRoot = [
  join(root, "compiled-frontend/frontend/runtime"),
  join(root, "compiled-frontend/frontend/react"),
  join(root, "compiled-frontend/frontend/dom"),
  join(here, "runtime"),
  join(here, "conformance"),
  join(here, "browser"),
  join(here, "demo"),
];
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
];
const sourceFiles = [
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
  "run-compiled-methods.sh",
  "run-compiled-backends.sh",
  "run-compiled-frontend.sh",
  "run-typed-composition.sh",
  "compiled-methods/run.mjs",
  "compiled-backends/run.mjs",
  "compiled-frontend/run.mjs",
  "compiled-lifecycle/CONTRACT.md",
  "compiled-lifecycle/FIXTURE.md",
  "compiled-lifecycle/PLAN.md",
  "compiled-lifecycle/run.mjs",
  "run-compiled-lifecycle.sh",
  ".github/workflows/gobi-compiled-lifecycle.yml",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = () => new Date().toISOString();
const rel = (path) => relative(root, path).split(sep).join("/");
const attemptId = new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
const attemptRoot = join(attempts, `attempt-${attemptId}`);
const logDirectory = join(attemptRoot, "logs");
const buildRoot = attemptRoot;
const matrixRoot = join(attemptRoot, "matrix");
const demoRoot = join(attemptRoot, "demo");
const nativeRoot = join(attemptRoot, "native");
const nativeBinary = join(nativeRoot, "compiled-lifecycle-native");
const chromiumPath = process.env.CHROMIUM_PATH ?? process.env.CHROMIUM_EXECUTABLE_PATH ??
  ("/tmp/chromium");
const args = process.argv.slice(2);
const mode = args.includes("--lifecycle-only") ? "lifecycle-only" : "full";
const invalidArgs = args.some((argument) => argument !== "--lifecycle-only") || args.length > 1;
const linkedWorktreeFlags = { GOFLAGS: "-buildvcs=false" };
const receipt = {
  schema: "gobi.compiled-lifecycle-execution/v1",
  job_id: "E-BUILD",
  worker: "N6",
  mode,
  status: "running",
  outcome: "mixed_change",
  summary: "The E-BUILD execution has started; acceptance evidence is not complete.",
  startedAt: stamp(),
  attempt: rel(attemptRoot),
  commands: [],
  checks: [],
  failures: [],
  environment: Object.fromEntries(
    ["GOTOOLCHAIN", "GOFLAGS", "CHROMIUM_PATH", "CHROMIUM_EXECUTABLE_PATH", "GOBI_LIFECYCLE_REPORT_PATH", "GOBI_LIFECYCLE_RECEIPT_PATH"].map((key) => [key, process.env[key] ?? null]),
  ),
  outputPaths: { report: rel(canonicalReport), receipt: rel(canonicalReceipt) },
  invocation: {
    command: process.env.GOBI_LIFECYCLE_ENTRYPOINT ?? "bash run-compiled-lifecycle.sh",
    nodeExecutable: process.execPath,
    arguments: args,
  },
};

await Promise.all([
  mkdir(logDirectory, { recursive: true }),
  mkdir(nativeRoot, { recursive: true }),
  mkdir(matrixRoot, { recursive: true }),
  mkdir(demoRoot, { recursive: true }),
  mkdir(dirname(canonicalReport), { recursive: true }),
  mkdir(dirname(canonicalReceipt), { recursive: true }),
]);

// Remove any earlier report and replace its receipt before probing tools or running a build.
await rm(canonicalReport, { force: true });
await saveReceipt();

async function saveReceipt() {
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  await Promise.all([
    writeFile(canonicalReceipt, serialized),
    writeFile(join(attemptRoot, "execution.json"), serialized),
  ]);
}

async function attemptStage(name, operation) {
  receipt.stages ??= [];
  try {
    const result = await operation();
    receipt.stages.push({ name, status: "passed" });
    await saveReceipt();
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    receipt.stages.push({ name, status: "failed", error: message });
    receipt.failures.push({ name: `stage:${name}`, error: message });
    await saveReceipt();
    return null;
  }
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
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "artifacts" ||
        entry.name === "builds" || (sourceOnly && entry.name === "evidence") ||
        (sourceOnly && /\.(log|png)$/i.test(entry.name))) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path, { sourceOnly }));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

async function sourcePins() {
  const paths = sourceFiles.map((path) => join(root, path));
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
    cwd,
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
    const failure = {
      name,
      error,
      exitCode: result.child.status,
      signal: result.child.signal,
      stdoutSha256: result.entry.stdoutSha256,
      stderrSha256: result.entry.stderrSha256,
    };
    receipt.failures.push(failure);
    await saveReceipt();
    throw new Error(`${name} failed; output retained at ${result.entry.stdoutPath} and ${result.entry.stderrPath}`);
  }
  return result.stdout;
}

async function hashPath(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: hash(bytes) };
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
    throw new Error(`invalid build output path: ${relativePath}`);
  }
  const full = resolve(directory, relativePath);
  if (!full.startsWith(resolve(directory) + sep)) throw new Error(`build output escapes output directory: ${relativePath}`);
  return full;
}

async function pinOutputs(directory, outputs) {
  if (!Array.isArray(outputs) || outputs.length === 0) throw new Error("compiler output inventory is empty");
  const seen = new Set();
  const pins = [];
  for (const row of outputs) {
    if (!row || typeof row.path !== "string" || seen.has(row.path)) throw new Error("compiler output inventory contains an invalid or duplicate path");
    seen.add(row.path);
    const bytes = await readFile(outputPath(directory, row.path));
    const actual = { path: row.path, bytes: bytes.length, sha256: hash(bytes) };
    if (actual.bytes !== row.bytes || actual.sha256 !== row.sha256) throw new Error(`compiler output pin mismatch: ${row.path}`);
    pins.push(actual);
  }
  const physical = (await walk(directory)).map((path) => relative(directory, path).split(sep).join("/")).sort();
  const reported = pins.map((row) => row.path).sort();
  if (JSON.stringify(physical) !== JSON.stringify(reported)) throw new Error("physical output inventory differs from BuildResult.outputs");
  return pins;
}

async function hashDirectory(directory) {
  const paths = await walk(directory);
  const rows = [];
  for (const path of paths) rows.push({ path: rel(path), ...await hashPath(path) });
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

function stablePins(before, after, label) {
  const normalize = (rows) => rows.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })).sort((a, b) => a.path.localeCompare(b.path));
  if (JSON.stringify(normalize(before)) !== JSON.stringify(normalize(after))) throw new Error(`${label} output files changed during validation`);
}

async function buildProfile(backend) {
  const backendRoot = join(buildRoot, backend);
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
  const stdout = await execute(`compile-${backend}`, "go", ["run", "./cmd/gobi-build"], {
    cwd: join(root, "compiled-frontend"),
    input: requestText,
    env: { ...linkedWorktreeFlags, GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" },
  });
  const result = JSON.parse(stdout);
  await writeFile(resultPath, stdout);
  if (result.schema !== "gobi.build-result/v1" || result.ok !== true || result.diagnostics?.length || result.apps?.length !== 1) {
    throw new Error(`${backend} GoScript CLI build did not return one clean app`);
  }
  const manifestPath = join(outputDir, "buildmanifest.json");
  const manifest = await readJSON(manifestPath);
  if (!Array.isArray(manifest.apps) || manifest.apps.length !== 1) throw new Error(`${backend} manifest must list exactly one app`);
  const app = manifest.apps[0];
  if (app.packagePath !== fixturePackage || app.backend !== backend) throw new Error(`${backend} manifest app identity/backend tag is wrong`);
  const appPaths = Object.fromEntries(["appIR", "module", "encoder"].map((key) => [key, outputPath(outputDir, app[key])]));
  const appIR = await readJSON(appPaths.appIR);
  const component = appIR.components?.find((candidate) => candidate.packagePath === fixturePackage);
  if (!component || component.id !== fixturePackage) throw new Error(`${backend} AppIR component ID/package identity differs from the compiler v1 package-path ID`);
  if (!component.capabilities?.includes("effect.request-reply")) throw new Error(`${backend} AppIR does not declare the effect.request-reply capability for fixture.request`);
  const outputPins = await pinOutputs(outputDir, result.outputs);
  const record = {
    backend,
    outputDir: rel(outputDir),
    request: { path: rel(requestPath), ...await hashPath(requestPath) },
    result: { path: rel(resultPath), ...await hashPath(resultPath) },
    manifest: { path: rel(manifestPath), ...await hashPath(manifestPath) },
    app: { packagePath: app.packagePath, backend: app.backend, paths: app },
    appIRComponent: {
      id: component.id,
      packagePath: component.packagePath,
      capabilities: component.capabilities,
      requestEffectCapability: component.capabilities.includes("effect.request-reply"),
    },
    outputCount: outputPins.length,
    outputPins,
    rawModule: { path: rel(appPaths.module), ...await hashPath(appPaths.module) },
    appIR: { path: rel(appPaths.appIR), ...await hashPath(appPaths.appIR) },
    encoder: { path: rel(appPaths.encoder), ...await hashPath(appPaths.encoder) },
  };
  await writeFile(join(backendRoot, "build-record.json"), `${JSON.stringify(record, null, 2)}\n`);
  receipt.builds ??= {};
  receipt.builds[backend] = record;
  receipt.checks.push(`${backend} profile compiled one lifecycle package through the actual gobi-build CLI and pinned every BuildResult output`);
  receipt.checks.push(`${backend} AppIR uses component ID ${component.id} and declares effect.request-reply for fixture.request`);
  await saveReceipt();
  return { backend, backendRoot, outputDir, request, result, manifest, app, appPaths, outputPins, record };
}

function withoutBackend(manifest) {
  return {
    ...manifest,
    apps: manifest.apps.map(({ backend: _backend, ...app }) => app),
  };
}

async function compareBuilds(react, dom) {
  if (JSON.stringify(react.result.apps) !== JSON.stringify(dom.result.apps)) throw new Error("React and DOM BuildResult apps differ");
  if (JSON.stringify(withoutBackend(react.manifest)) !== JSON.stringify(withoutBackend(dom.manifest))) {
    throw new Error("React and DOM build manifests differ outside the backend tag");
  }
  for (const key of ["appIR", "encoder"]) {
    if (Buffer.compare(await readFile(react.appPaths[key]), await readFile(dom.appPaths[key])) !== 0) {
      throw new Error(`React and DOM ${key} bytes differ`);
    }
  }
  const reactPaths = react.outputPins.map(({ path }) => path).sort();
  const domPaths = dom.outputPins.map(({ path }) => path).sort();
  if (JSON.stringify(reactPaths) !== JSON.stringify(domPaths)) throw new Error("React and DOM output path sets differ");
  const modulePaths = new Set([react.appPaths.module, dom.appPaths.module].map((path) => relative(react.outputDir, path).split(sep).join("/")));
  const differing = [];
  const domByPath = new Map(dom.outputPins.map((row) => [row.path, row]));
  for (const row of react.outputPins) {
    if (row.path === "buildmanifest.json" || modulePaths.has(row.path)) continue;
    const peer = domByPath.get(row.path);
    if (!peer || peer.sha256 !== row.sha256 || peer.bytes !== row.bytes) differing.push(row.path);
  }
  if (differing.length) throw new Error(`React/DOM non-manifest, non-module outputs differ: ${differing.join(", ")}`);
  receipt.buildComparison = {
    appResultsIdentical: true,
    manifestsEqualAfterRemovingBackendTag: true,
    appIRByteIdentical: true,
    encoderByteIdentical: true,
    outputPathSetsIdentical: true,
    exactNonManifestNonModuleOutputs: reactPaths.length - 2,
    rawModuleHashes: { react: react.record.rawModule, dom: dom.record.rawModule },
    rawBundleEqualityClaimed: false,
  };
  receipt.checks.push("React and DOM profiles share AppIR/encoder and all non-manifest, non-module compiler files; raw bundles are retained separately with no cross-directory equality claim");
  await saveReceipt();
}

async function allTestFiles(directories) {
  const paths = [];
  for (const directory of directories) {
    for (const path of await walk(directory, { sourceOnly: true })) {
      if (path.endsWith(".test.mjs")) paths.push(path);
    }
  }
  return [...new Set(paths)].sort();
}

async function preservePreflightHistory() {
  const sourceRoot = join(here, "builds/feasibility");
  const targetRoot = join(attemptRoot, "preflight");
  const files = [];
  if (await exists(sourceRoot)) {
    for (const source of await walk(sourceRoot)) {
      const destination = join(targetRoot, relative(sourceRoot, source));
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
      files.push({ path: rel(destination), ...await hashPath(destination) });
    }
  }
  const dependencyRoot = join(here, "builds/dependency-preflight");
  if (await exists(dependencyRoot)) {
    for (const source of await walk(dependencyRoot)) {
      const destination = join(targetRoot, "dependency-preflight", relative(dependencyRoot, source));
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
      files.push({ path: rel(destination), ...await hashPath(destination) });
    }
  }
  const portabilityRoot = join(here, "builds/portability");
  if (await exists(portabilityRoot)) {
    for (const source of await walk(portabilityRoot)) {
      const destination = join(targetRoot, "portability-reproduction", relative(portabilityRoot, source));
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
      files.push({ path: rel(destination), ...await hashPath(destination) });
    }
  }
  const demoEvidenceRoot = join(here, "demo/evidence");
  const demoEvidenceCopy = join(targetRoot, "demo-rejection");
  const rejectedDemoFiles = [];
  if (await exists(demoEvidenceRoot)) {
    for (const source of await walk(demoEvidenceRoot)) {
      const destination = join(demoEvidenceCopy, relative(demoEvidenceRoot, source));
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
      const record = { path: rel(destination), ...await hashPath(destination) };
      files.push(record);
      rejectedDemoFiles.push(record);
    }
  }
  const attempts = [];
  for (const [stage, directory] of [
    ["initial-red", ""],
    ["green-preintegration", "final"],
    ["bridge-green-incomplete-diagnostic", "bridge-green-01"],
    ["bridge-green-preintegration", "bridge-green-02"],
  ]) {
    for (const backend of ["react", "dom"]) {
      const profileRoot = join(sourceRoot, directory, backend);
      const resultPath = join(profileRoot, "result.json");
      if (!await exists(resultPath)) continue;
      let result;
      try {
        result = await readJSON(resultPath);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        attempts.push({
          stage,
          backend,
          status: "result-json-invalid",
          request: { path: rel(join(profileRoot, "request.json")), ...await hashPath(join(profileRoot, "request.json")) },
          result: { path: rel(resultPath), ...await hashPath(resultPath) },
          stderr: { path: rel(join(profileRoot, "stderr.log")), ...await hashPath(join(profileRoot, "stderr.log")) },
          outputCount: 0,
          diagnostics: [],
          parseError: error.message,
        });
        continue;
      }
      const record = {
        stage,
        backend,
        status: result.ok === true ? "build-passed" : "build-failed",
        request: { path: rel(join(profileRoot, "request.json")), ...await hashPath(join(profileRoot, "request.json")) },
        result: { path: rel(resultPath), ...await hashPath(resultPath) },
        stderr: { path: rel(join(profileRoot, "stderr.log")), ...await hashPath(join(profileRoot, "stderr.log")) },
        outputCount: result.outputs?.length ?? 0,
        diagnostics: result.diagnostics ?? [],
        command: `GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run ./cmd/gobi-build < ${join(profileRoot, "request.json")} > ${resultPath} 2> ${join(profileRoot, "stderr.log")}`,
        cwd: "compiled-frontend",
      };
      if (result.ok === true) {
        const manifestPath = join(profileRoot, "output/buildmanifest.json");
        const manifest = await readJSON(manifestPath);
        const app = manifest.apps?.[0];
        const appIR = app ? await readJSON(join(profileRoot, "output", app.appIR)) : null;
        const component = appIR?.components?.find((candidate) => candidate.packagePath === fixturePackage);
        record.manifest = { path: rel(manifestPath), ...await hashPath(manifestPath) };
        record.appIRComponent = component ? {
          id: component.id,
          packagePath: component.packagePath,
          capabilities: component.capabilities,
        } : null;
        record.outputPins = result.outputs;
      }
      attempts.push(record);
    }
  }
  const redSource = join(sourceRoot, "red-source/fixtures/compiled/lifecycle/app.go");
  const dependencyInstalls = [];
  for (const item of [
    {
      command: "env PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH npm ci --no-audit --no-fund",
      cwd: rel(root),
      logStem: "root",
    },
    {
      command: "env PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH npm ci --prefix interaction --no-audit --no-fund",
      cwd: rel(root),
      logStem: "interaction",
    },
    {
      command: "env PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH npm ci --prefix compiled-frontend --no-audit --no-fund",
      cwd: rel(root),
      logStem: "compiled-frontend",
    },
  ]) {
    const sourceStdout = join(dependencyRoot, `${item.logStem}.stdout.log`);
    const sourceStderr = join(dependencyRoot, `${item.logStem}.stderr.log`);
    const logRoot = join(targetRoot, "dependency-preflight");
    const retained = await exists(sourceStdout) && await exists(sourceStderr);
    dependencyInstalls.push({
      command: item.command,
      cwd: item.cwd,
      status: retained ? "earlier-preflight-logs-retained" : "not-run-by-this-runner",
      ...(retained ? {
        exitCode: 0,
        stdout: { path: rel(join(logRoot, `${item.logStem}.stdout.log`)), ...await hashPath(join(logRoot, `${item.logStem}.stdout.log`)) },
        stderr: { path: rel(join(logRoot, `${item.logStem}.stderr.log`)), ...await hashPath(join(logRoot, `${item.logStem}.stderr.log`)) },
      } : { stdout: null, stderr: null }),
    });
  }
  receipt.preflightHistory = {
    path: rel(targetRoot),
    files,
    attempts,
    rejectedDemo: {
      originalEvidencePath: await exists(demoEvidenceRoot) ? rel(demoEvidenceRoot) : null,
      preservedFiles: rejectedDemoFiles,
      smoke: await exists(join(demoEvidenceRoot, "attempt-01-slice-abi-failure/smoke.json"))
        ? await readJSON(join(demoEvidenceRoot, "attempt-01-slice-abi-failure/smoke.json"))
        : null,
    },
    dependencyInstalls,
    redSourceSnapshot: await exists(redSource) ? { path: rel(redSource), ...await hashPath(redSource) } : null,
    chronology: [
      "The first React and DOM CLI feasibility attempts were preserved as failures against the initial source guard.",
      "The later React and DOM CLI feasibility attempts were preserved as successful compiler builds before the native/browser/demo integration gate.",
      "The successful preintegration AppIR exposed a component-ID expectation mismatch; the compiler v1 package-path ID was kept and fixture consumers were aligned to it.",
      "The rejected preintegration demo smoke and screenshot are retained separately; N2 owns the shared host result-slice adaptation.",
      "One intermediate React command returned empty stdout despite producing compiler outputs; that anomalous result file is retained, and a separate React retry is the successful bridge-green-02 build used for the demo smoke.",
      "After the effect-slice bridge focused suites passed, fresh React/DOM GoScript builds and an HTTP demo smoke passed in bridge-green-02; those remain preintegration evidence pending N1/N4 matrix repairs.",
      "A separate portability React CLI build was created under builds/portability/attempt-00, with its generated appDir and all 67 output hashes pinned for the test-loader proof.",
      "Preintegration compiler output is not acceptance evidence for the final frozen source or runtime behavior.",
    ],
  };
  receipt.checks.push(`copied ${files.length} preintegration CLI source/request/result/log/output files into this attempt without replacing the original red or green records`);
  await saveReceipt();
}

async function collectVersions() {
  receipt.versions = {
    node: process.version,
    npm: (await execute("version-npm", "npm", ["--version"])).trim(),
    rootGo: (await execute("version-root-go", "go", ["version"], { env: { GOTOOLCHAIN: "local" } })).trim(),
    compiledGo: (await execute("version-compiled-go", "go", ["version"], { env: { GOTOOLCHAIN: "go1.27.3" } })).trim(),
    packageLocks: {},
    dependencies: {},
    chromiumPath: await exists(chromiumPath) ? chromiumPath : null,
  };
  if (!receipt.versions.rootGo.includes("go1.24.")) throw new Error(`root compiler baseline requires Go 1.24.x; got ${receipt.versions.rootGo}`);
  if (!receipt.versions.compiledGo.includes("go1.27.3")) throw new Error(`compiled frontend requires Go 1.27.3; got ${receipt.versions.compiledGo}`);
  if (!receipt.versions.node.startsWith("v22.")) throw new Error(`Node 22 is required; got ${receipt.versions.node}`);
  if (receipt.versions.chromiumPath) {
    receipt.versions.chromium = (await execute("version-chromium", chromiumPath, ["--version"])).trim();
  }
  for (const [name, path] of Object.entries({
    react: "interaction/node_modules/react/package.json",
    reactDOM: "interaction/node_modules/react-dom/package.json",
    playwright: "interaction/node_modules/playwright/package.json",
    esbuild: "interaction/node_modules/esbuild/package.json",
    frontendEsbuild: "compiled-frontend/node_modules/esbuild/package.json",
  })) {
    try {
      receipt.versions.dependencies[name] = (await readJSON(join(root, path))).version;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      receipt.versions.dependencies[name] = null;
    }
  }
  for (const path of ["package-lock.json", "interaction/package-lock.json", "compiled-frontend/package-lock.json"]) {
    receipt.versions.packageLocks[path] = hash(await readFile(join(root, path)));
  }
  if (receipt.preflightHistory) receipt.preflightHistory.toolchains = receipt.versions;
  await saveReceipt();
}

async function runTests() {
  await attemptStage("go-tests", async () => {
    await execute(
      "lifecycle-go-tests",
      "go",
      ["test", "./compilercontract", "./gobi", "./fixtures/compiled/lifecycle", "./cmd/compiled-lifecycle-native"],
      { env: { ...linkedWorktreeFlags, GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" } },
    );
    receipt.checks.push("Go 1.24 compiler-contract, gobi, lifecycle fixture, and native adapter tests passed");
  });
  await attemptStage("compiler-go-tests", async () => {
    await execute(
      "lifecycle-compiler-go-tests",
      "go",
      ["test", "./analyze", "./build", "./cmd/...", "./emit"],
      { cwd: join(root, "compiled-frontend"), env: { ...linkedWorktreeFlags, GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" } },
    );
    receipt.checks.push("Go 1.27.3 compiled-frontend analyze/build/CLI/emit tests passed");
  });
  const compiledRuntimeTest = join(here, "runtime/runtime.test.mjs");
  const tests = await allTestFiles(nodeTestsRoot);
  if (!tests.includes(compiledRuntimeTest)) {
    receipt.failures.push({ name: "node-test-inventory", error: "compiled lifecycle runtime integration tests are missing" });
    await saveReceipt();
  }
  const preBuildTests = tests.filter((path) => path !== compiledRuntimeTest);
  const missing = [];
  if (!preBuildTests.some((path) => path.endsWith("compiled-frontend/frontend/runtime/runtime.test.mjs"))) {
    missing.push("shared compiled-frontend host runtime tests");
  }
  if (!tests.some((path) => path.startsWith(join(here, "conformance") + sep))) {
    missing.push("lifecycle conformance Node tests");
  }
  if (missing.length) {
    receipt.failures.push({ name: "node-test-inventory", error: `required suites missing: ${missing.join(", ")}` });
    await saveReceipt();
  }
  if (tests.length) {
    receipt.nodeTests = {
      files: await Promise.all(tests.map(async (path) => ({ path: rel(path), ...await hashPath(path) }))),
      node: process.version,
      deferredCompiledLifecycleRuntimeTest: rel(compiledRuntimeTest),
    };
    await saveReceipt();
    await attemptStage("node-tests-before-build", async () => {
      await execute("lifecycle-node-tests-before-build", process.execPath, ["--test", ...preBuildTests], {
        env: process.env.CHROMIUM_PATH || process.env.CHROMIUM_EXECUTABLE_PATH
          ? { CHROMIUM_PATH: process.env.CHROMIUM_PATH ?? process.env.CHROMIUM_EXECUTABLE_PATH }
          : {},
      });
      receipt.checks.push(`Node 22 browser, demo, conformance, renderer, shared-host-runtime, and lifecycle-oracle tests passed before output generation (${preBuildTests.length} test files)`);
    });
  } else {
    receipt.failures.push({ name: "node-tests", error: "no Node test files were found" });
    await saveReceipt();
  }
}

async function runCompiledLifecycleNodeTest(react) {
  const testPath = join(here, "runtime/runtime.test.mjs");
  const appDir = dirname(react.appPaths.appIR);
  for (const path of [react.appPaths.module, react.appPaths.encoder]) {
    if (dirname(path) !== appDir) throw new Error("compiled lifecycle integration-test files do not share one generated appDir");
  }
  for (const name of ["app-ir.json", "gobi-compiled.mjs", "encoder.mjs"]) {
    if (!await exists(join(appDir, name))) throw new Error(`compiled lifecycle runtime test appDir is missing ${name}`);
  }
  const appDirEnvironment = { GOBI_LIFECYCLE_APP_DIR: appDir };
  await execute("lifecycle-compiled-runtime-tests", process.execPath, ["--test", testPath], { env: appDirEnvironment });
  receipt.nodeTests.compiledLifecycleRuntime = {
    path: rel(testPath),
    appDir: rel(appDir),
    environmentVariable: "GOBI_LIFECYCLE_APP_DIR",
  };
  receipt.checks.push("Node 22 compiled lifecycle runtime integration tests passed against the fresh React GoScript output directory");
  await saveReceipt();
}

async function runNativeProbe() {
  await execute("build-native", "go", ["build", "-o", nativeBinary, nativeSource], {
    env: { ...linkedWorktreeFlags, GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
  });
  receipt.nativeBinary = { path: rel(nativeBinary), ...await hashPath(nativeBinary) };
  const stdout = await execute("native-cli-probe", nativeBinary, ["--script", fixturePath]);
  const trace = parseLastJSONLine(stdout, "native lifecycle CLI");
  if (trace.schema !== "gobi.compiled-lifecycle-native/v1" || trace.packagePath !== fixturePackage || trace.componentID !== fixturePackage) {
    throw new Error("native lifecycle CLI returned the wrong schema or package identity");
  }
  const effects = (trace.steps ?? []).flatMap((step) => step.effects ?? []).map((effect) => ({
    kind: effect.kind ?? effect.Kind,
    name: effect.name ?? effect.Name,
    arg: effect.arg ?? effect.Arg,
    reply: effect.reply ?? effect.Reply,
  }));
  if (!effects.some((effect) => effect.kind === "fixture.request" && effect.name === "lookup" && effect.reply === "complete")) {
    throw new Error("native lifecycle trace does not contain the admitted fixture.request/lookup/complete ABI");
  }
  if (!effects.some((effect) => effect.kind === "lifecycle.cancel" && effect.name === "cancel" && effect.reply === "")) {
    throw new Error("native lifecycle trace does not contain lifecycle.cancel/cancel/empty-reply");
  }
  const tracePath = join(matrixRoot, "native-cli.json");
  await writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`);
  receipt.nativeTrace = {
    path: rel(tracePath),
    ...await hashPath(tracePath),
    steps: trace.steps?.length ?? null,
    requestEffects: effects.filter((effect) => effect.kind === "fixture.request").length,
    cancellationEffects: effects.filter((effect) => effect.kind === "lifecycle.cancel").length,
  };
  receipt.checks.push("native lifecycle CLI binary executed the frozen fixture script and retained fixture.request and lifecycle.cancel effects under the package-path component ID");
  await saveReceipt();
}

async function nextConformanceAttempt() {
  const evidence = join(here, "conformance/evidence");
  await mkdir(evidence, { recursive: true });
  const entries = await readdir(evidence, { withFileTypes: true });
  const used = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  let index = 0;
  while (used.has(`attempt-${String(index).padStart(2, "0")}`)) index += 1;
  return join(evidence, `attempt-${String(index).padStart(2, "0")}`);
}

async function copyConformanceEvidence(outputPrefix) {
  const suffixes = [
    "native.json",
    "native.stdout.log",
    "native.stderr.log",
    "direct.json",
    "browser.json",
    "browser.capture.json",
    "browser.bundle.mjs",
    "browser.failed.json",
    "check.json",
    "manifest.json",
    "run.json",
    "failed.json",
  ];
  const copied = [];
  for (const suffix of suffixes) {
    const source = `${outputPrefix}.${suffix}`;
    if (!await exists(source)) continue;
    const destination = join(matrixRoot, `lifecycle.${suffix}`);
    await copyFile(source, destination);
    copied.push({ path: rel(source), ...await hashPath(source) });
  }
  return copied;
}

async function runConformance(react, dom) {
  for (const path of [fixturePath, contractPath, schedulePath, conformanceDriver, browserAdapter]) {
    if (!await exists(path)) throw new Error(`required lifecycle conformance input is missing: ${rel(path)}`);
  }
  const conformanceAttempt = await nextConformanceAttempt();
  const outputPrefix = join(conformanceAttempt, "lifecycle");
  const nativeGo = process.env.GOBI_GO_EXECUTABLE ??
    (await exists("/tmp/gondola-go/bin/go") ? "/tmp/gondola-go/bin/go" : "go");
  const commandArgs = [
    conformanceDriver,
    "--react-app-ir", react.appPaths.appIR,
    "--react-compiled", react.appPaths.module,
    "--react-helpers", react.appPaths.encoder,
    "--dom-app-ir", dom.appPaths.appIR,
    "--dom-compiled", dom.appPaths.module,
    "--dom-helpers", dom.appPaths.encoder,
    "--native-go", nativeGo,
    "--react-manifest", join(react.outputDir, "buildmanifest.json"),
    "--dom-manifest", join(dom.outputDir, "buildmanifest.json"),
    "--fixture", fixturePath,
    "--contract", contractPath,
    "--schedule", schedulePath,
    "--output", outputPrefix,
  ];
  const chromium = process.env.CHROMIUM_PATH ?? process.env.CHROMIUM_EXECUTABLE_PATH ??
    (await exists(chromiumPath) ? chromiumPath : null);
  if (chromium) commandArgs.push("--chromium", chromium);
  let stdout;
  try {
    stdout = await execute("lifecycle-conformance", process.execPath, commandArgs, {
      env: chromium ? { CHROMIUM_PATH: chromium } : {},
    });
  } catch (error) {
    const matrixFiles = await copyConformanceEvidence(outputPrefix);
    let run = null;
    let check = null;
    try { run = await readJSON(`${outputPrefix}.run.json`); } catch {}
    try { check = await readJSON(`${outputPrefix}.check.json`); } catch {}
    receipt.conformance = {
      status: run?.status ?? "failed",
      attempt: rel(conformanceAttempt),
      outputPrefix: rel(outputPrefix),
      run: run ? { path: rel(`${outputPrefix}.run.json`), ...await hashPath(`${outputPrefix}.run.json`) } : null,
      checks: check,
      matrixFiles,
    };
    await saveReceipt();
    throw error;
  }
  const matrixFiles = await copyConformanceEvidence(outputPrefix);
  const summary = parseLastJSONLine(stdout, "lifecycle conformance harness");
  const runPath = `${outputPrefix}.run.json`;
  const checkPath = `${outputPrefix}.check.json`;
  const manifestPath = `${outputPrefix}.manifest.json`;
  const run = await readJSON(runPath);
  const check = await readJSON(checkPath);
  const manifest = await readJSON(manifestPath);
  if (summary.status !== "matched" || run.status !== "matched" || check.status !== "matched") {
    throw new Error("native/direct/browser lifecycle conformance did not report matched");
  }
  const matrixSummary = check;
  const expectedCounts = {
    events: 26,
    ticks: 26,
    clicks: 16,
    swaps: 17,
    stalePhysicalClicksAcrossProfiles: 18,
    retiredRendererFences: 32,
    requests: 7,
    cancellations: 3,
  };
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (matrixSummary[key] !== expected) throw new Error(`lifecycle matrix ${key} count differs: expected ${expected}, got ${matrixSummary[key]}`);
  }
  if (matrixSummary.mutationControlsDetected === undefined || matrixSummary.mutationControlsDetected === false) {
    throw new Error("lifecycle matrix did not record its mutation-control checks");
  }
  for (const suffix of ["native.json", "direct.json", "browser.json", "browser.capture.json", "check.json", "manifest.json", "run.json"]) {
    if (!matrixFiles.some((row) => row.path.endsWith(`.${suffix}`))) throw new Error(`lifecycle matrix file is missing: ${rel(`${outputPrefix}.${suffix}`)}`);
  }
  if (await exists(`${outputPrefix}.failed.json`)) throw new Error("lifecycle harness left a failure receipt despite matched status");
  receipt.conformance = {
    status: run.status,
    attempt: rel(conformanceAttempt),
    outputPrefix: rel(outputPrefix),
    fixture: { path: rel(fixturePath), ...await hashPath(fixturePath) },
    contract: { path: rel(contractPath), ...await hashPath(contractPath) },
    schedule: { path: rel(schedulePath), ...await hashPath(schedulePath) },
    browserAdapter: { path: rel(browserAdapter), ...await hashPath(browserAdapter) },
    summary,
    checks: check,
    manifest: { path: rel(manifestPath), ...await hashPath(manifestPath) },
    run: { path: rel(runPath), ...await hashPath(runPath) },
    matrixFiles,
    counts: matrixSummary,
  };
  receipt.checks.push("N3 native/direct/React/DOM lifecycle matrix matched the frozen independent oracle and preserved all raw traces");
  await saveReceipt();
}

async function runDemo(react) {
  const site = join(demoRoot, "site");
  const smokePath = join(demoRoot, "demo-smoke.json");
  const screenshotPath = join(demoRoot, "demo.png");
  await execute("build-http-demo", process.execPath, [
    join(here, "demo/build.mjs"),
    "--compiled", react.outputDir,
    "--output", site,
    "--backend", "react",
  ]);
  receipt.demoOutputPinsBeforeSmoke = await hashDirectory(site);
  await saveReceipt();
  const chromium = process.env.CHROMIUM_PATH ?? process.env.CHROMIUM_EXECUTABLE_PATH ??
    (await exists(chromiumPath) ? chromiumPath : null);
  const smokeArgs = [
    join(here, "demo/smoke.mjs"),
    "--demo", site,
    "--output", smokePath,
    "--screenshot", screenshotPath,
  ];
  await execute("http-demo-smoke", process.execPath, smokeArgs, {
    env: chromium ? { CHROMIUM_PATH: chromium } : {},
  });
  const smoke = await readJSON(smokePath);
  if (smoke.status !== "passed") throw new Error("compiled lifecycle HTTP demo smoke did not report passed");
  if (Array.isArray(smoke.failures) && smoke.failures.length) throw new Error("compiled lifecycle demo smoke reports failures");
  if (Array.isArray(smoke.browserErrors) && smoke.browserErrors.length) throw new Error("compiled lifecycle demo smoke reports browser errors");
  if (!smoke.noWasm || smoke.noWasm.wasmRequests?.length !== 0 || smoke.noWasm.wasmAPIAttempts?.length !== 0 ||
      smoke.wasmRequests?.length !== 0) {
    throw new Error("compiled lifecycle demo smoke did not verify the no-WASM route");
  }
  if (!Array.isArray(smoke.requests) || smoke.requests.some((request) => request.status !== 200)) {
    throw new Error("compiled lifecycle demo smoke recorded missing or failed HTTP assets");
  }
  const screenshot = await hashPath(screenshotPath);
  const after = await hashDirectory(site);
  stablePins(receipt.demoOutputPinsBeforeSmoke, after, "compiled lifecycle demo site");
  receipt.demoOutputPinsAfterSmoke = after;
  receipt.demoSmoke = {
    ...smoke,
    path: { path: rel(smokePath), ...await hashPath(smokePath) },
    screenshot: { path: rel(screenshotPath), ...screenshot },
  };
  receipt.checks.push("compiled lifecycle static HTTP demo smoke passed with captured screenshot and stable built site pins");
  await saveReceipt();
}

async function preserveInheritedAttempt(inherited) {
  if (typeof inherited?.attempt !== "string") return null;
  const source = resolve(root, inherited.attempt);
  if (!source.startsWith(resolve(root) + sep) || !await exists(source)) return null;
  const destination = join(attemptRoot, "inherited", inherited.attempt.split("/").at(-1));
  const files = [];
  for (const path of await walk(source)) {
    const target = join(destination, relative(source, path));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(path, target);
    files.push({ path: rel(target), ...await hashPath(target) });
  }
  return {
    originalPath: rel(source),
    copiedPath: rel(destination),
    memberCount: files.length,
    memberBytes: files.reduce((total, row) => total + row.bytes, 0),
    files,
  };
}

async function makeArchive() {
  const directories = [];
  for (const name of ["preflight", "inherited", "react", "dom", "native", "demo", "matrix", "logs"]) {
    if (await exists(join(attemptRoot, name))) directories.push(name);
  }
  if (directories.length === 0) throw new Error("no lifecycle attempt evidence directories are available to archive");
  const members = [];
  for (const directory of directories) {
    const directoryPath = join(attemptRoot, directory);
    for (const path of await walk(directoryPath)) members.push({ path: relative(attemptRoot, path).split(sep).join("/"), ...await hashPath(path) });
  }
  members.sort((a, b) => a.path.localeCompare(b.path));
  const archivePath = join(attemptRoot, "lifecycle-artifacts.tar.gz");
  const manifestPath = join(attemptRoot, "archive-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify({ schema: "gobi.compiled-lifecycle-archive/v1", createdAt: stamp(), members }, null, 2)}\n`);
  await execute("archive-lifecycle-artifacts", "tar", ["-czf", archivePath, "-C", attemptRoot, ...directories]);
  const archive = await hashPath(archivePath);
  const listed = (await execute("list-lifecycle-archive", "tar", ["-tzf", archivePath]))
    .trim().split("\n").filter((line) => line && !line.endsWith("/"));
  if (JSON.stringify(listed.sort()) !== JSON.stringify(members.map(({ path }) => path).sort())) {
    throw new Error("lifecycle artifact archive member list differs from the pinned inventory");
  }
  const verifyRoot = join(attemptRoot, "archive-verification");
  await mkdir(verifyRoot, { recursive: true });
  await execute("extract-lifecycle-archive", "tar", ["-xzf", archivePath, "-C", verifyRoot]);
  for (const member of members) {
    const extracted = join(verifyRoot, member.path);
    const actual = await hashPath(extracted);
    if (actual.bytes !== member.bytes || actual.sha256 !== member.sha256) throw new Error(`archive round-trip mismatch: ${member.path}`);
  }
  await rm(verifyRoot, { recursive: true, force: true });
  receipt.archive = {
    path: rel(archivePath),
    ...archive,
    manifest: { path: rel(manifestPath), ...await hashPath(manifestPath) },
    memberCount: members.length,
    memberBytes: members.reduce((total, row) => total + row.bytes, 0),
    roundTripVerified: true,
  };
  receipt.checks.push(`artifact archive contains ${members.length} pinned build, native, matrix, demo, and log files and round-tripped every member hash`);
  await saveReceipt();
}

async function recordInheritedRun() {
  if (mode === "lifecycle-only") {
    receipt.checks.push("explicit --lifecycle-only mode skipped the inherited run-compiled-methods.sh chain");
    await saveReceipt();
    return;
  }
  let inherited;
  let inheritedArtifacts;
  try {
    const output = await execute("inherited-full-runner", "bash", [join(root, "run-compiled-methods.sh")], {
      env: linkedWorktreeFlags,
    });
    const receiptPath = join(root, "compiled-methods/coordination/receipts/E-DEMO.json");
    const reportPath = join(root, "compiled-methods/coordination/reports/E-DEMO.md");
    inherited = await readJSON(receiptPath);
    inheritedArtifacts = await preserveInheritedAttempt(inherited);
    const reportBytes = await readFile(reportPath);
    const fresh = Date.parse(inherited.startedAt) >= Date.parse(receipt.startedAt);
    if (!fresh || inherited.mode !== "full" || inherited.status !== "passed") {
      throw new Error(`inherited full compiled-methods runner was not a fresh pass (fresh=${fresh}, mode=${inherited.mode}, status=${inherited.status})`);
    }
    receipt.inheritedRun = {
      path: rel(receiptPath),
      sha256: hash(await readFile(receiptPath)),
      report: { path: rel(reportPath), sha256: hash(reportBytes) },
      status: inherited.status,
      mode: inherited.mode,
      startedAt: inherited.startedAt,
      versions: inherited.versions,
      commandCount: inherited.commands?.length ?? 0,
      summary: inherited.summary,
      artifacts: inheritedArtifacts,
      finalOutputLine: output.trim().split("\n").at(-1),
    };
    receipt.checks.push("fresh full run-compiled-methods.sh completed before lifecycle-specific tests and matrix");
  } catch (error) {
    if (!inherited) {
      try {
        inherited = await readJSON(join(root, "compiled-methods/coordination/receipts/E-DEMO.json"));
        inheritedArtifacts = await preserveInheritedAttempt(inherited);
      } catch {
        // The inherited command logs remain available even if no receipt was written.
      }
    }
    receipt.inheritedRun = {
      status: "failed_or_incomplete",
      error: error instanceof Error ? error.message : String(error),
      ...(inherited ? { mode: inherited.mode, statusFromReceipt: inherited.status, startedAt: inherited.startedAt } : {}),
      ...(inheritedArtifacts ? { artifacts: inheritedArtifacts } : {}),
    };
    receipt.failures.push({ name: "inherited-full-runner", error: receipt.inheritedRun.error });
  }
  await saveReceipt();
}

async function generateReport() {
  const commandLines = (receipt.commands ?? []).map((row) =>
    `- \`${row.name}\`: \`${row.command} ${row.args.join(" ")}\` (exit ${row.exitCode}; stdout SHA-256 \`${row.stdoutSha256}\`; stderr SHA-256 \`${row.stderrSha256}\`; logs \`${row.stdoutPath}\`, \`${row.stderrPath}\`)`,
  ).join("\n");
  const versions = Object.entries(receipt.versions ?? {})
    .filter(([, value]) => typeof value === "string" || value === null)
    .map(([name, value]) => `- ${name}: \`${value ?? "not detected"}\``).join("\n") || "- Versions not fully recorded.";
  const checks = (receipt.checks ?? []).map((row) => `- ${row}`).join("\n") || "- No completed acceptance checks.";
  const failures = (receipt.failures ?? []).map((row) => `- ${row.name}: ${row.error}`).join("\n") || "- None recorded.";
  const sourceStatus = receipt.sourcePinsMatch === true ? "stable" : receipt.sourcePinsMatch === false ? "changed or mismatched" : "not fully recorded";
  const inherited = receipt.inheritedRun
    ? `\n\nInherited run receipt: \`${receipt.inheritedRun.path ?? "not available"}\` (${receipt.inheritedRun.status}, mode ${receipt.inheritedRun.mode ?? "not completed"}).`
    : "";
  const preflightLines = (receipt.preflightHistory?.attempts ?? []).map((row) =>
    `- ${row.stage} ${row.backend}: ${row.status}; ${row.outputCount} BuildResult outputs${row.appIRComponent ? `; AppIR ID ${row.appIRComponent.id}; capabilities ${row.appIRComponent.capabilities.join(", ")}` : ""}.`,
  ).join("\n") || "- No earlier CLI feasibility artifacts were found.";
  const report = [
    "# E-BUILD (compiled Go lifecycle)",
    "",
    `**Outcome: ${receipt.outcome}.** ${receipt.summary ?? "No final summary recorded."}`,
    "",
    "## Execution",
    "",
    `- Mode: \`${receipt.mode}\``,
    `- Status: \`${receipt.status}\``,
    `- Attempt: \`${receipt.attempt}\``,
    `- Invocation: \`${receipt.invocation?.command ?? "not recorded"}\` ${receipt.invocation?.arguments?.join(" ") ?? ""}`,
    `- Source pins: ${sourceStatus} (${receipt.sourceBefore?.length ?? 0} before, ${receipt.sourceAfter?.length ?? 0} after)`,
    `- Started: ${receipt.startedAt}`,
    `- Finished: ${receipt.finishedAt ?? "not finished"}${inherited}`,
    "",
    "## Exact commands",
    "",
    commandLines || "- None recorded.",
    "",
    "## Toolchains",
    "",
    versions,
    "",
    "## Checks",
    "",
    checks,
    "",
    "## React and DOM GoScript builds",
    "",
    `Each actual \`go run ./cmd/gobi-build\` invocation has its own \`request.json\`, raw \`result.json\`, and \`output/**\` directory under \`${receipt.attempt}/react\` and \`${receipt.attempt}/dom\`. The output inventory matches \`BuildResult.outputs\`; AppIR and encoders are compared byte-for-byte. Separate raw module hashes are retained because temporary source labels can vary between build roots.`,
    "",
    `- React output files: ${receipt.builds?.react?.outputCount ?? "not built"}`,
    `- DOM output files: ${receipt.builds?.dom?.outputCount ?? "not built"}`,
    `- AppIR component ID: \`${receipt.builds?.react?.appIRComponent?.id ?? "not recorded"}\``,
    `- AppIR capabilities: \`${receipt.builds?.react?.appIRComponent?.capabilities?.join(", ") ?? "not recorded"}\``,
    `- AppIR byte-identical: ${receipt.buildComparison?.appIRByteIdentical ?? false}`,
    `- Encoder byte-identical: ${receipt.buildComparison?.encoderByteIdentical ?? false}`,
    "- Request/cancel ABI: `fixture.request/lookup/token/complete` and `lifecycle.cancel/cancel/token/empty-reply`.",
    `- Raw module equality claimed: ${receipt.buildComparison?.rawBundleEqualityClaimed ?? false}`,
    "",
    "## Preserved feasibility attempts",
    "",
    preflightLines,
    `- Earlier CLI requests, results, stderr, dependency logs, generated outputs, and rejected demo smoke are copied under \`${receipt.preflightHistory?.path ?? "not retained"}\` and included in the attempt archive.`,
    "",
    "## Native, direct, browser, and demo evidence",
    "",
    `- Native binary: ${receipt.nativeBinary ? `\`${receipt.nativeBinary.path}\` (SHA-256 \`${receipt.nativeBinary.sha256}\`)` : "not built"}`,
    `- Native fixture trace: ${receipt.nativeTrace ? `\`${receipt.nativeTrace.path}\` (${receipt.nativeTrace.steps ?? "?"} steps; ${receipt.nativeTrace.requestEffects ?? "?"} request effects; ${receipt.nativeTrace.cancellationEffects ?? "?"} cancellations)` : "not run"}`,
    `- Conformance attempt: ${receipt.conformance?.attempt ?? "not run"}`,
    `- Matrix status: ${receipt.conformance?.status ?? "not run"}`,
    `- Matrix counts: \`${JSON.stringify(receipt.conformance?.counts ?? {})}\``,
    `- Demo smoke: ${receipt.demoSmoke?.status ?? "not run"}`,
    `- Screenshot: ${receipt.demoSmoke?.screenshot?.path ?? "not captured"}`,
    `- Archive: ${receipt.archive ? `\`${receipt.archive.path}\` (SHA-256 \`${receipt.archive.sha256}\`, ${receipt.archive.memberCount} members, round-trip verified)` : "not created"}`,
    "",
    "## Failures",
    "",
    failures,
    "",
    "## Limits",
    "",
    "- AppIR v1 `effect.request-reply` is a coarse effect-route marker; this experiment mounts a closed lifecycle effect policy for `fixture.request` and `lifecycle.cancel`, and cancellation retires runtime correlations.",
    "- The ordinary compiled runtime host still rejects `lifecycle.cancel`. Another frontend must implement this explicit lifecycle profile and pass the replay before claiming cancellation support.",
    "- The fixture exercises the finite frozen lifecycle scenario and does not establish arbitrary Manager or pointer-owned Go compilation.",
    "- Renderer replacement runs the same compiled Go module through the shipped React and DOM adapters; raw bundle bytes from separate output roots are pinned independently and are not normalized into an equality claim.",
    `- ${receipt.mode === "lifecycle-only" ? "This explicit partial mode skipped the inherited compiled-methods regression chain." : receipt.inheritedRun?.status === "passed" ? "The inherited full compiled-methods chain completed before lifecycle-specific validation." : "The inherited full compiled-methods chain did not report a fresh pass."}`,
    "- Any failed command, source-pin mismatch, missing trace, output mismatch, or demo failure leaves the overall execution failed.",
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
  if (invalidArgs) throw new Error("supported option: --lifecycle-only (explicit partial lifecycle run)");
  if (!process.version.startsWith("v22.")) throw new Error(`Node 22 is required; got ${process.version}`);
  receipt.sourceBefore = await sourcePins();
  await saveReceipt();
  await preservePreflightHistory();
  await recordInheritedRun();
  await attemptStage("toolchain-inventory", collectVersions);
  await runTests();
  await attemptStage("native-cli", runNativeProbe);
  const react = await attemptStage("react-goscript-build", () => buildProfile("react"));
  const dom = await attemptStage("dom-goscript-build", () => buildProfile("dom"));
  if (react) {
    await attemptStage("compiled-lifecycle-runtime-tests", () => runCompiledLifecycleNodeTest(react));
  } else {
    receipt.failures.push({ name: "compiled-lifecycle-runtime-tests", error: "fresh React GoScript output is required" });
  }
  if (react && dom) {
    await attemptStage("backend-build-comparison", () => compareBuilds(react, dom));
    await attemptStage("compiled-output-before-pins", async () => {
      receipt.outputPinsBefore = {
        react: await hashDirectory(react.outputDir),
        dom: await hashDirectory(dom.outputDir),
      };
      await saveReceipt();
    });
    await attemptStage("native-direct-browser-matrix", () => runConformance(react, dom));
  } else {
    receipt.failures.push({ name: "native-direct-browser-matrix", error: "React and DOM GoScript outputs are both required" });
  }
  if (react) await attemptStage("http-demo", () => runDemo(react));
  else receipt.failures.push({ name: "http-demo", error: "React GoScript output is required" });
  if (react && dom && receipt.outputPinsBefore) {
    await attemptStage("compiled-output-stability", async () => {
      receipt.outputPinsAfter = {
        react: await hashDirectory(react.outputDir),
        dom: await hashDirectory(dom.outputDir),
      };
      stablePins(receipt.outputPinsBefore.react, receipt.outputPinsAfter.react, "React lifecycle compiler output");
      stablePins(receipt.outputPinsBefore.dom, receipt.outputPinsAfter.dom, "DOM lifecycle compiler output");
      receipt.checks.push("React and DOM compiler outputs stayed byte-stable through matrix and demo execution");
      await saveReceipt();
    });
  }
  await makeArchive();
  const inheritedPassed = mode === "lifecycle-only" || receipt.inheritedRun?.status === "passed";
  if (!inheritedPassed) throw new Error("full mode requires a fresh passing inherited compiled-methods execution");
  if (receipt.failures.length) throw new Error(`${receipt.failures.length} failure(s) were recorded while completing the lifecycle evidence chain`);
  receipt.status = "passed";
  receipt.summary = mode === "lifecycle-only"
    ? "The explicit lifecycle-only run passed Go and Node tests, both real GoScript CLI backend builds, native/direct/browser conformance, and the executable HTTP demo; inherited compiled-methods regression was skipped."
    : "The inherited compiled-methods regression and the new lifecycle Go/Node tests, React/DOM GoScript CLI builds, native/direct/browser matrix, and executable HTTP demo all passed.";
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
  if (!receipt.archive) {
    try {
      await makeArchive();
    } catch (error) {
      receipt.status = "failed";
      receipt.summary = receipt.summary || "The lifecycle evidence archive could not be completed.";
      receipt.failures.push({ name: "archive-finalize", error: error instanceof Error ? error.message : String(error) });
      process.exitCode = 1;
    }
  }
  receipt.finishedAt = stamp();
  try {
    receipt.sourceAfter = await sourcePins();
    receipt.sourcePinsMatch = JSON.stringify(receipt.sourceBefore ?? []) === JSON.stringify(receipt.sourceAfter);
    if (receipt.sourcePinsMatch !== true && receipt.status === "passed") {
      receipt.status = "failed";
      receipt.summary = "Source pins changed during the lifecycle build and execution.";
      receipt.failures.push({ name: "source-pins", error: "sourceBefore and sourceAfter differ" });
      process.exitCode = 1;
    }
  } catch (error) {
    receipt.sourcePinsMatch = false;
    receipt.status = "failed";
    receipt.summary = "Source pins could not be completed after execution.";
    receipt.failures.push({ name: "source-pins-after", error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
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
  process.stdout.write(`compiled-lifecycle: ${receipt.status} (${receipt.mode})\n`);
}
