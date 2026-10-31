import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { replayLifecycleDirect } from "./direct.mjs";
import { checkLifecycleConformance } from "./check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_FIXTURE = resolve(ROOT, "fixtures/compiled/lifecycle/scenario.json");
const DEFAULT_CONTRACT = resolve(ROOT, "compiled-lifecycle/conformance/lifecycle-contract.json");
const DEFAULT_SCHEDULE = resolve(ROOT, "compiled-lifecycle/conformance/swap-schedule.json");
const DEFAULT_BROWSER_ADAPTER = resolve(ROOT, "compiled-lifecycle/conformance/browser.mjs");
const DEFAULT_NATIVE_GO = process.env.GOBI_GO_BIN ?? "go";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`unexpected argument ${key}`);
    if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw new Error(`missing value for ${key}`);
    if (values.has(key)) throw new Error(`duplicate argument ${key}`);
    values.set(key, argv[++index]);
  }
  const required = ["--react-app-ir", "--react-compiled", "--react-helpers", "--dom-app-ir", "--dom-compiled",
    "--dom-helpers", "--react-manifest", "--dom-manifest", "--output"];
  for (const key of required) if (!values.has(key)) throw new Error(`missing ${key} <path>`);
  const args = Object.fromEntries([...values].map(([key, value]) => {
    const name = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return [name, name === "nativeGo" ? resolveNativeExecutable(value) : resolve(value)];
  }));
  args.fixture ??= DEFAULT_FIXTURE;
  args.contract ??= DEFAULT_CONTRACT;
  args.schedule ??= DEFAULT_SCHEDULE;
  args.browserAdapter ??= DEFAULT_BROWSER_ADAPTER;
  args.nativeGo = resolveNativeExecutable(args.nativeGo ?? DEFAULT_NATIVE_GO);
  if (args.chromium) args.chromium = resolve(args.chromium);
  return args;
}

function resolveNativeExecutable(value) {
  if (isAbsolute(value)) return resolve(value);
  // A bare command name must stay available to PATH lookup by spawnSync.
  // Explicit paths are resolved relative to the conformance runner's cwd.
  if (value.includes("/") || value.includes("\\")) return resolve(value);
  return value;
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialize(value), "utf8");
}

async function walkFiles(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const paths = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (["node_modules", ".git", "evidence"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walkFiles(path));
    else if (entry.isFile() && [".mjs", ".js", ".json", ".go", ".md", ".ts"].includes(extname(entry.name))) paths.push(path);
  }
  return paths;
}

async function pins(paths) {
  const results = [];
  for (const path of [...new Set(paths.map((item) => resolve(item)))].sort()) {
    const bytes = await readFile(path);
    results.push({ path: relative(ROOT, path).replaceAll("\\", "/"), sha256: hash(bytes), bytes: bytes.length });
  }
  return results;
}

function version(command, args = ["--version"]) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 });
  return { command, args, exitCode: result.status, output: (result.stdout || result.stderr || "").trim() };
}

function runNative(goPath, fixturePath) {
  const command = [goPath, "run", "./cmd/compiled-lifecycle-native", "--script", fixturePath];
  const result = spawnSync(command[0], command.slice(1), { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const error = new Error(`native Go lifecycle replay failed (exit ${result.status ?? "spawn-error"}): ${result.stderr || result.error?.message || "no stderr"}`);
    error.stdout = result.stdout ?? "";
    error.stderr = result.stderr ?? "";
    error.command = command;
    throw error;
  }
  try { return { value: JSON.parse(result.stdout), command, stdout: result.stdout, stderr: result.stderr }; }
  catch (cause) { throw new Error(`native Go replay did not return one JSON value: ${cause.message}`); }
}

export { parseArgs, runNative };

function manifestPaths(manifest, manifestPath, backend, inputPaths) {
  if (manifest?.schema !== "gobi.build-manifest/v1" || !Array.isArray(manifest.apps) || manifest.apps.length !== 1) {
    throw new TypeError(`${backend} manifest must be gobi.build-manifest/v1 with one app`);
  }
  const app = manifest.apps[0];
  if (app.backend !== backend) throw new Error(`${backend} manifest backend identity differs`);
  const outputRoot = dirname(resolve(manifestPath));
  const found = {
    appIR: resolve(outputRoot, app.appIR),
    compiled: resolve(outputRoot, app.module),
    helpers: resolve(outputRoot, app.encoder),
  };
  assertExactTraceValue({ appIR: resolve(inputPaths.appIR), compiled: resolve(inputPaths.compiled), helpers: resolve(inputPaths.helpers) },
    found, `$.${backend}.manifest.paths`);
  assertExactTraceValue(app.componentId, app.packagePath, `$.${backend}.manifest.componentID`);
  return { backend, componentId: app.componentId, packagePath: app.packagePath, ...found };
}

async function buildInputPins(args) {
  const codeDirs = [
    resolve(ROOT, "compiled-lifecycle/conformance"), resolve(ROOT, "compiled-lifecycle/browser"),
    resolve(ROOT, "compiled-lifecycle/runtime"), resolve(ROOT, "compiled-frontend/conformance"),
    resolve(ROOT, "compiled-frontend/frontend/runtime"), resolve(ROOT, "compiled-frontend/frontend/react"),
    resolve(ROOT, "compiled-frontend/frontend/dom"),
  ];
  const selected = [args.fixture, args.contract, args.schedule, args.reactAppIr, args.reactCompiled, args.reactHelpers,
    args.domAppIr, args.domCompiled, args.domHelpers, args.reactManifest, args.domManifest, args.browserAdapter];
  const manifests = [await readJSON(args.reactManifest), await readJSON(args.domManifest)];
  for (const [manifest, manifestPath] of [[manifests[0], args.reactManifest], [manifests[1], args.domManifest]]) {
    const root = dirname(resolve(manifestPath));
    for (const relativePath of manifest.emittedTypeScript ?? []) selected.push(resolve(root, relativePath));
    for (const app of manifest.apps ?? []) {
      for (const key of ["appIR", "module", "encoder", "components"]) if (app[key]) selected.push(resolve(root, app[key]));
    }
  }
  const sourceFiles = (await Promise.all(codeDirs.map(walkFiles))).flat();
  return [...new Set([...sourceFiles, ...selected])];
}

function stage(run, name) {
  const entry = { name, status: "running", startedAt: new Date().toISOString() };
  run.stages.push(entry);
  return entry;
}

function finish(record, status, error = null) {
  record.status = status;
  record.finishedAt = new Date().toISOString();
  if (error) record.error = { name: error.name ?? "Error", message: String(error.message ?? error) };
}

export async function runLifecycleConformance(args) {
  const outputStem = resolve(args.output);
  const outputPaths = {
    native: `${outputStem}.native.json`,
    direct: `${outputStem}.direct.json`,
    browser: `${outputStem}.browser.json`,
    browserCapture: `${outputStem}.browser.capture.json`,
    check: `${outputStem}.check.json`,
    manifest: `${outputStem}.manifest.json`,
    run: `${outputStem}.run.json`,
    failure: `${outputStem}.failed.json`,
  };
  try { await access(outputPaths.run); throw new Error(`refusing to overwrite existing attempt ${outputPaths.run}`); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await mkdir(dirname(outputStem), { recursive: true });
  const run = {
    schema: "gobi.compiled-lifecycle-conformance-run/v1",
    status: "running",
    command: process.argv,
    startedAt: new Date().toISOString(),
    node: process.version,
    versions: { node: process.version, go: version(args.nativeGo, ["version"]) },
    inputs: {
      fixture: args.fixture, contract: args.contract, schedule: args.schedule,
      nativeGo: args.nativeGo, reactAppIR: args.reactAppIr, reactCompiled: args.reactCompiled,
      reactHelpers: args.reactHelpers, reactManifest: args.reactManifest,
      domAppIR: args.domAppIr, domCompiled: args.domCompiled, domHelpers: args.domHelpers,
      domManifest: args.domManifest, browserAdapter: args.browserAdapter,
      chromium: args.chromium ?? process.env.CHROMIUM_PATH ?? null,
    },
    outputPaths,
    stages: [],
  };
  await writeJSON(outputPaths.run, run);
  const errors = [];
  let native = null;
  let direct = null;
  let browser = null;
  let check = null;
  let fixture = null;
  let contract = null;
  let schedule = null;
  let appIR = null;
  let reactAppIR = null;
  let domAppIR = null;
  let helpers = null;
  let sourcePaths = [];
  let sourcePinsBefore = null;
  let outputPinsBeforeCheck = null;

  const inputStage = stage(run, "frozen-contract-and-build-manifests");
  try {
    [fixture, contract, schedule, reactAppIR, domAppIR] = await Promise.all([
      readJSON(args.fixture), readJSON(args.contract), readJSON(args.schedule), readJSON(args.reactAppIr), readJSON(args.domAppIr),
    ]);
    const [reactManifest, domManifest] = await Promise.all([readJSON(args.reactManifest), readJSON(args.domManifest)]);
    run.buildManifests = {
      react: manifestPaths(reactManifest, args.reactManifest, "react", { appIR: args.reactAppIr, compiled: args.reactCompiled, helpers: args.reactHelpers }),
      dom: manifestPaths(domManifest, args.domManifest, "dom", { appIR: args.domAppIr, compiled: args.domCompiled, helpers: args.domHelpers }),
    };
    assertExactTraceValue(reactAppIR, domAppIR, "$.reactDom.appIR");
    sourcePaths = await buildInputPins(args);
    sourcePinsBefore = await pins(sourcePaths);
    run.sourcePinsBefore = sourcePinsBefore;
    finish(inputStage, "completed");
  } catch (error) {
    errors.push(error);
    finish(inputStage, "failed", error);
  }

  const nativeStage = stage(run, "native-go-script-cli-replay");
  try {
    if (!fixture || !reactAppIR) throw new Error("native replay withheld because fixture/build inputs are invalid");
    const result = runNative(args.nativeGo, args.fixture);
    native = result.value;
    run.nativeCommand = result.command;
    run.nativeGoStderr = result.stderr;
    await writeJSON(outputPaths.native, native);
    finish(nativeStage, "completed");
  } catch (error) {
    errors.push(error);
    finish(nativeStage, "failed", error);
    if (error.stdout !== undefined) {
      await writeFile(`${outputStem}.native.stdout.log`, error.stdout, "utf8");
      await writeFile(`${outputStem}.native.stderr.log`, error.stderr, "utf8");
      run.nativeCommand = error.command ?? null;
    }
  }

  let compiledModule;
  const directStage = stage(run, "direct-emitted-module-replay");
  try {
    if (!fixture || !reactAppIR) throw new Error("direct replay withheld because fixture/build inputs are invalid");
    [compiledModule, helpers] = await Promise.all([
      import(pathToFileURL(args.reactCompiled).href), import(pathToFileURL(args.reactHelpers).href),
    ]);
    if (compiledModule.gobiCompiled?.schema !== "gobi.compiled-module/v1") throw new Error("React module is not gobi.compiled-module/v1");
    assertExactTraceValue(reactAppIR, compiledModule.gobiCompiled.appIR, "$.reactBuild.compiledAppIR");
    direct = replayLifecycleDirect({ compiled: compiledModule.gobiCompiled, helpers, fixture });
    await writeJSON(outputPaths.direct, direct);
    finish(directStage, "completed");
  } catch (error) {
    errors.push(error);
    finish(directStage, "failed", error);
  }

  const browserStage = stage(run, "react-dom-and-alternating-swap-browser-profiles");
  try {
    if (!fixture || !schedule) throw new Error("browser profile withheld because fixture/schedule inputs are invalid");
    const browserAdapter = await import(pathToFileURL(args.browserAdapter).href);
    if (typeof browserAdapter.runLifecycleBrowserConformance !== "function") {
      throw new TypeError("browser adapter must export runLifecycleBrowserConformance");
    }
    browser = await browserAdapter.runLifecycleBrowserConformance({
      compiledPath: args.reactCompiled,
      helpersPath: args.reactHelpers,
      fixturePath: args.fixture,
      schedulePath: args.schedule,
      outputPrefix: outputStem,
      chromiumPath: args.chromium ?? process.env.CHROMIUM_PATH,
    });
    run.versions.chromium = browser.browser;
    await writeJSON(outputPaths.browser, browser);
    finish(browserStage, "completed");
  } catch (error) {
    errors.push(error);
    finish(browserStage, "failed", error);
    run.browserError = { name: error.name ?? "Error", message: String(error.message ?? error), stack: error.stack ?? null };
  }

  const pinStage = stage(run, "source-and-build-output-pins");
  try {
    if (sourcePinsBefore === null) throw new Error("source pins unavailable from contract stage");
    run.sourcePinsAfter = await pins(sourcePaths);
    run.sourcesStable = JSON.stringify(sourcePinsBefore) === JSON.stringify(run.sourcePinsAfter);
    const inputOutputs = [args.reactAppIr, args.reactCompiled, args.reactHelpers, args.reactManifest,
      args.domAppIr, args.domCompiled, args.domHelpers, args.domManifest];
    outputPinsBeforeCheck = await pins(inputOutputs);
    run.buildOutputPinsBeforeCheck = outputPinsBeforeCheck;
    if (!run.sourcesStable) throw new Error("harness, fixture, runtime, oracle, or generated build source changed during evidence capture");
    finish(pinStage, "completed");
  } catch (error) {
    errors.push(error);
    finish(pinStage, "failed", error);
  }

  if (native && direct && browser && helpers && fixture && contract && schedule && reactAppIR && domAppIR && errors.length === 0) {
    const checkStage = stage(run, "literal-state-effect-and-physical-dom-checks");
    try {
      check = checkLifecycleConformance({ native, direct, browser, fixture, contract, schedule,
        appIR: reactAppIR, reactAppIR, domAppIR, helpers });
      await writeJSON(outputPaths.check, check);
      finish(checkStage, "completed");
    } catch (error) {
      errors.push(error);
      finish(checkStage, "failed", error);
    }
  } else {
    errors.push(new Error("full conformance check withheld because a required evidence stage failed"));
  }

  const finalPinStage = stage(run, "final-source-and-build-output-stability-check");
  try {
    if (sourcePinsBefore === null || outputPinsBeforeCheck === null) throw new Error("initial pins are unavailable");
    run.sourcePinsFinal = await pins(sourcePaths);
    run.sourceStableThroughCheck = JSON.stringify(sourcePinsBefore) === JSON.stringify(run.sourcePinsFinal);
    const outputPathsToPin = [args.reactAppIr, args.reactCompiled, args.reactHelpers, args.reactManifest,
      args.domAppIr, args.domCompiled, args.domHelpers, args.domManifest];
    run.buildOutputPinsAfterCheck = await pins(outputPathsToPin);
    run.buildOutputsStableThroughCheck = JSON.stringify(outputPinsBeforeCheck) === JSON.stringify(run.buildOutputPinsAfterCheck);
    if (!run.sourceStableThroughCheck || !run.buildOutputsStableThroughCheck) {
      throw new Error("source or build outputs changed during the independent checker");
    }
    finish(finalPinStage, "completed");
  } catch (error) {
    errors.push(error);
    finish(finalPinStage, "failed", error);
  }

  run.finishedAt = new Date().toISOString();
  run.status = errors.length === 0 && check?.status === "matched" ? "matched" : "rejected";
  run.summary = check;
  if (errors.length > 0) {
    run.failures = errors.map((error) => ({ name: error.name ?? "Error", message: String(error.message ?? error) }));
    await writeJSON(outputPaths.failure, {
      schema: "gobi.compiled-lifecycle-conformance-failure/v1",
      errors: run.failures,
      outputPaths,
      stages: run.stages,
      browserError: run.browserError ?? null,
    });
  }
  const evidenceFiles = [outputPaths.native, outputPaths.direct, outputPaths.browser, outputPaths.browserCapture,
    outputPaths.check, outputPaths.failure, `${outputStem}.browser.failed.json`];
  const evidencePresent = [];
  for (const path of evidenceFiles) {
    try { await access(path); evidencePresent.push(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  run.evidencePins = await pins(evidencePresent);
  await writeJSON(outputPaths.manifest, {
    schema: "gobi.compiled-lifecycle-conformance-manifest/v1",
    status: run.status,
    outputPaths,
    sourcePins: { before: sourcePinsBefore, final: run.sourcePinsFinal ?? null },
    buildOutputPins: { beforeCheck: outputPinsBeforeCheck, afterCheck: run.buildOutputPinsAfterCheck ?? null },
    evidencePins: run.evidencePins,
    browser: browser ? { version: browser.browser, playwright: browser.playwright, noWasm: browser.noWasm } : null,
  });
  await writeJSON(outputPaths.run, run);
  return { run, check, outputPaths };
}

async function main() {
  const result = await runLifecycleConformance(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ status: result.run.status, appId: result.check?.appId ?? null,
    fixture: result.check?.fixture ?? null, ticks: result.check?.ticks ?? null, swaps: result.check?.swaps ?? null,
    mutationControlsDetected: result.check?.mutationControlsDetected ?? 0, outputPaths: result.outputPaths })}\n`);
  if (result.run.status !== "matched") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
