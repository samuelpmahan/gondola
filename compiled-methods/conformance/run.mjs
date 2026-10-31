import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

import { replayDirectJavaScript } from "../../compiled-frontend/conformance/direct-js.mjs";
import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { METHODS_PACKAGE_PATH, validateMethodsFixtureScript } from "../browser/dom-oracle.mjs";
import { checkMethodsConformance, assertMethodsMethodContract } from "./check.mjs";
import { probeReadOnlyUpdateGuards, probeValueReceiverSemantics } from "./value-semantics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_FIXTURE = resolve(ROOT, "compiled-methods/conformance/fixtures/methods.json");
const DEFAULT_CONTRACT = resolve(ROOT, "compiled-methods/conformance/method-contract.json");
const DEFAULT_SCHEDULE = resolve(ROOT, "compiled-methods/conformance/swap-schedule.json");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--")) throw new Error(`unexpected argument ${key}`);
    if (index + 1 >= args.length || args[index + 1].startsWith("--")) throw new Error(`missing value for ${key}`);
    if (values.has(key)) throw new Error(`duplicate argument ${key}`);
    values.set(key, args[++index]);
  }
  const required = ["--app-ir", "--compiled", "--helpers", "--native-bin", "--output", "--browser-adapter"];
  for (const key of required) if (!values.has(key)) throw new Error(`missing ${key} <path>`);
  if (values.has("--fixture") && resolve(values.get("--fixture")) !== resolve(DEFAULT_FIXTURE)) {
    throw new Error(`methods conformance is pinned to canonical fixture ${relative(ROOT, DEFAULT_FIXTURE)}`);
  }
  const result = Object.fromEntries([...values].map(([key, value]) => [
    key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), resolve(value),
  ]));
  result.fixture ??= DEFAULT_FIXTURE;
  result.contract ??= DEFAULT_CONTRACT;
  result.schedule ??= DEFAULT_SCHEDULE;
  result.domBuild = [result.domAppIr, result.domCompiled, result.domHelpers].filter(Boolean);
  if (result.domBuild.length !== 0 && result.domBuild.length !== 3) {
    throw new Error("--dom-app-ir, --dom-compiled, and --dom-helpers must be provided together");
  }
  if (result.chromium) result.chromium = resolve(result.chromium);
  return result;
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function walkFiles(directory, root = directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const found = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "node_modules" || entry.name === "artifacts" || entry.name === ".git") continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walkFiles(path, root));
    else if (entry.isFile() && [".mjs", ".js", ".json", ".go", ".md", ".ts"].includes(extname(entry.name))) {
      found.push({ path, relative: relative(ROOT, path).replaceAll("\\", "/") });
    }
  }
  return found;
}

async function captureSourcePins(inputPaths) {
  const sourcePaths = [
    ...await walkFiles(resolve(ROOT, "compiled-methods/conformance")),
    ...await walkFiles(resolve(ROOT, "compiled-methods/browser")),
    ...await walkFiles(resolve(ROOT, "compiled-frontend/conformance")),
    ...await walkFiles(resolve(ROOT, "compiled-frontend/frontend/runtime")),
    ...await walkFiles(resolve(ROOT, "compiled-frontend/frontend/react")),
    ...await walkFiles(resolve(ROOT, "compiled-frontend/frontend/dom")),
  ];
  const fixed = ["package.json", "interaction/package.json", "compiled-frontend/package.json"]
    .map((path) => resolve(ROOT, path));
  const paths = [...new Set([...sourcePaths.map((item) => item.path), ...fixed, ...inputPaths.map((path) => resolve(path))])].sort();
  const pins = [];
  for (const path of paths) {
    const bytes = await readFile(path);
    pins.push({ path: relative(ROOT, path).replaceAll("\\", "/"), sha256: hash(bytes), bytes: bytes.length });
  }
  return pins;
}

async function pinOutputs(paths) {
  const pins = [];
  for (const path of paths) {
    const bytes = await readFile(path);
    pins.push({ path, sha256: hash(bytes), bytes: bytes.length });
  }
  return pins;
}

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json(value), "utf8");
}

function runNative(binaryPath, appIRPath, fixturePath) {
  const command = [binaryPath, "--app-ir", appIRPath, "--script", fixturePath];
  const result = spawnSync(command[0], command.slice(1), { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const error = new Error(`native replay failed (exit ${result.status ?? "spawn-error"}): ${result.stderr || result.error?.message || "no stderr"}`);
    error.nativeStdout = result.stdout ?? "";
    error.nativeStderr = result.stderr ?? "";
    error.command = command;
    throw error;
  }
  try { return { trace: JSON.parse(result.stdout), command, stdout: result.stdout, stderr: result.stderr }; }
  catch (cause) { throw new Error(`native replay did not return one JSON trace: ${cause.message}`); }
}

function version(command, args = ["--version"]) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 });
  return { command, args, exitCode: result.status, output: (result.stdout || result.stderr || "").trim() };
}

function manifestOutputRoot(manifestPath) {
  return dirname(resolve(manifestPath));
}

async function resolveManifestPaths(args) {
  args.reactManifest ??= resolve(dirname(args.appIr), "../../buildmanifest.json");
  if (args.domBuild.length === 3) args.domManifest ??= resolve(dirname(args.domAppIr), "../../buildmanifest.json");
  const buildTreePaths = [args.reactManifest, resolve(dirname(args.reactManifest), "../request.json"),
    resolve(dirname(args.reactManifest), "../result.json")];
  if (args.domManifest) buildTreePaths.push(args.domManifest, resolve(dirname(args.domManifest), "../request.json"),
    resolve(dirname(args.domManifest), "../result.json"));
  for (const manifestPath of [args.reactManifest, ...(args.domManifest ? [args.domManifest] : [])]) {
    const outputRoot = manifestOutputRoot(manifestPath);
    buildTreePaths.push(...(await walkFiles(outputRoot)).map((item) => item.path));
  }
  return [...new Set(buildTreePaths)];
}

function validateBuildManifest(manifest, backend, outputRoot, appIRPath, compiledPath, helpersPath) {
  if (manifest?.schema !== "gobi.build-manifest/v1" || !Array.isArray(manifest.apps) || manifest.apps.length !== 1) {
    throw new TypeError(`${backend} build manifest must describe one gobi.build-manifest/v1 app`);
  }
  const app = manifest.apps[0];
  if (app.backend !== backend || app.packagePath !== METHODS_PACKAGE_PATH) {
    throw new Error(`${backend} build manifest backend/package identity differs`);
  }
  const resolved = {
    appIR: resolve(outputRoot, app.appIR),
    compiled: resolve(outputRoot, app.module),
    helpers: resolve(outputRoot, app.encoder),
  };
  assertExactTraceValue({ appIR: resolve(appIRPath), compiled: resolve(compiledPath), helpers: resolve(helpersPath) },
    resolved, `$.buildManifest.${backend}.paths`);
  return { backend: app.backend, packagePath: app.packagePath, appIR: app.appIR, module: app.module, encoder: app.encoder };
}

function stage(run, name) {
  const record = { name, status: "running", startedAt: new Date().toISOString() };
  run.stages.push(record);
  return record;
}

function finishStage(record, status, error = null) {
  record.status = status;
  record.finishedAt = new Date().toISOString();
  if (error) record.error = { name: error.name ?? "Error", message: String(error.message ?? error) };
}

export async function runMethodsConformance(args) {
  const outputStem = resolve(args.output);
  const outputPaths = {
    native: `${outputStem}.native.json`,
    direct: `${outputStem}.direct.json`,
    browser: `${outputStem}.browser.json`,
    browserCapture: `${outputStem}.browser.capture.json`,
    valueSemantics: `${outputStem}.value-semantics.json`,
    readOnlyGuards: `${outputStem}.read-only-guards.json`,
    check: `${outputStem}.check.json`,
    manifest: `${outputStem}.manifest.json`,
    run: `${outputStem}.run.json`,
    failure: `${outputStem}.failed.json`,
  };
  try { await access(outputPaths.run); throw new Error(`refusing to overwrite existing attempt ${outputPaths.run}`); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await mkdir(dirname(outputStem), { recursive: true });
  const run = {
    schema: "gobi.methods-conformance-run/v1",
    status: "running",
    command: process.argv.slice(0),
    startedAt: new Date().toISOString(),
    node: process.version,
    inputs: {
      appIR: args.appIr, compiled: args.compiled, helpers: args.helpers,
      domAppIR: args.domAppIr ?? null, domCompiled: args.domCompiled ?? null, domHelpers: args.domHelpers ?? null,
      nativeBin: args.nativeBin, fixture: args.fixture, contract: args.contract,
      schedule: args.schedule, browserAdapter: args.browserAdapter, chromium: args.chromium ?? process.env.CHROMIUM_PATH ?? null,
    },
    outputPaths,
    stages: [],
    versions: { node: process.version, go: version(process.env.GOBI_GO_BIN ?? "go", ["version"]) },
  };
  await writeJSON(outputPaths.run, run);
  let buildTreePaths = [];
  try { buildTreePaths = await resolveManifestPaths(args); }
  catch (error) { run.manifestPinError = { name: error.name ?? "Error", message: String(error.message ?? error) }; }
  const inputPaths = [args.appIr, args.compiled, args.helpers, args.nativeBin, args.fixture, args.contract,
    args.schedule, args.browserAdapter, args.reactManifest, ...args.domBuild,
    ...(args.domManifest ? [args.domManifest] : []), ...buildTreePaths];
  let sourcePinsBefore = null;
  let nativeTrace = null;
  let directTrace = null;
  let valueSemantics = null;
  let readOnlyGuards = null;
  let browserEvidence = null;
  let check = null;
  const failures = [];

  const pinStage = stage(run, "source-pins-before");
  try {
    sourcePinsBefore = await captureSourcePins(inputPaths);
    run.sourcePinsBefore = sourcePinsBefore;
    finishStage(pinStage, "completed");
  } catch (error) {
    failures.push(error);
    finishStage(pinStage, "failed", error);
  }

  let appIR;
  let contract;
  let fixture;
  let schedule;
  let reactManifest;
  let domManifest;
  try {
    [appIR, contract, fixture, schedule, reactManifest, domManifest] = await Promise.all([
      readJSON(args.appIr), readJSON(args.contract), readJSON(args.fixture), readJSON(args.schedule),
      readJSON(args.reactManifest), ...(args.domManifest ? [readJSON(args.domManifest)] : [Promise.resolve(null)]),
    ]);
    validateMethodsFixtureScript(fixture);
    assertExactTraceValue("gobi.methods-swap-schedule/v1", schedule.schema, "$.schedule.schema");
    assertExactTraceValue(METHODS_PACKAGE_PATH, fixture.packagePath, "$.fixture.packagePath");
    run.buildManifests = {
      react: validateBuildManifest(reactManifest, "react", manifestOutputRoot(args.reactManifest), args.appIr, args.compiled, args.helpers),
      dom: domManifest ? validateBuildManifest(domManifest, "dom", manifestOutputRoot(args.domManifest), args.domAppIr, args.domCompiled, args.domHelpers) : null,
    };
  } catch (error) {
    failures.push(error);
    run.inputValidationError = { name: error.name ?? "Error", message: String(error.message ?? error) };
  }

  const nativeStage = stage(run, "native-reference-replay");
  try {
    if (!appIR || !fixture) throw new Error("cannot run native replay without valid AppIR and fixture inputs");
    const native = runNative(args.nativeBin, args.appIr, args.fixture);
    nativeTrace = native.trace;
    run.nativeCommand = native.command;
    await writeJSON(outputPaths.native, nativeTrace);
    run.versions.nativeGo = version(process.env.GOBI_GO_BIN ?? "go", ["version"]);
    finishStage(nativeStage, "completed");
  } catch (error) {
    failures.push(error);
    finishStage(nativeStage, "failed", error);
    if (error.nativeStdout !== undefined) {
      await writeFile(`${outputStem}.native.stdout.log`, error.nativeStdout, "utf8");
      await writeFile(`${outputStem}.native.stderr.log`, error.nativeStderr, "utf8");
      run.nativeCommand = error.command ?? null;
    }
  }

  const directStage = stage(run, "direct-emitted-module-replay-and-value-probes");
  let compiledModule;
  let helpers;
  try {
    if (!fixture || !appIR) throw new Error("cannot run emitted module without valid fixture and AppIR inputs");
    [compiledModule, helpers] = await Promise.all([
      import(pathToFileURL(args.compiled).href), import(pathToFileURL(args.helpers).href),
    ]);
    if (compiledModule.gobiCompiled?.schema !== "gobi.compiled-module/v1") throw new Error("module export is not gobi.compiled-module/v1");
    assertExactTraceValue(appIR, compiledModule.gobiCompiled.appIR, "$.compiled.appIR");
    assertMethodsMethodContract(appIR, contract);
    directTrace = replayDirectJavaScript({ compiled: compiledModule.gobiCompiled, helpers, fixtureScript: fixture });
    await writeJSON(outputPaths.direct, directTrace);
    valueSemantics = probeValueReceiverSemantics({ compiled: compiledModule.gobiCompiled, helpers, fixture });
    await writeJSON(outputPaths.valueSemantics, valueSemantics);
    readOnlyGuards = probeReadOnlyUpdateGuards({ compiled: compiledModule.gobiCompiled, helpers, fixture });
    await writeJSON(outputPaths.readOnlyGuards, readOnlyGuards);
    finishStage(directStage, valueSemantics.passed && readOnlyGuards.passed ? "completed" : "failed");
    if (!valueSemantics.passed) failures.push(new Error("emitted module mutated one or more retained original states during Update"));
    if (!readOnlyGuards.passed) failures.push(new Error("emitted module direct read-only Update guard probe failed"));
  } catch (error) {
    failures.push(error);
    finishStage(directStage, "failed", error);
    if (valueSemantics) await writeJSON(outputPaths.valueSemantics, valueSemantics);
    if (readOnlyGuards) await writeJSON(outputPaths.readOnlyGuards, readOnlyGuards);
  }

  if (args.domBuild.length === 3) {
    const domStage = stage(run, "dom-build-cross-pins");
    try {
      const domAppIR = await readJSON(args.domAppIr);
      const domModule = await import(pathToFileURL(args.domCompiled).href);
      assertExactTraceValue(appIR, domAppIR, "$.domBuild.appIR");
      assertExactTraceValue(appIR, domModule.gobiCompiled?.appIR, "$.domBuild.compiledAppIR");
      const [reactEncoder, domEncoder] = await Promise.all([readFile(args.helpers), readFile(args.domHelpers)]);
      const encoderHashes = { react: hash(reactEncoder), dom: hash(domEncoder) };
      assertExactTraceValue(encoderHashes.react, encoderHashes.dom, "$.domBuild.encoderSha256");
      run.domBuildParity = {
        appIR: "exact",
        encoderSha256: encoderHashes,
        reactModuleSha256: hash(await readFile(args.compiled)),
        domModuleSha256: hash(await readFile(args.domCompiled)),
        selectedRuntimeModule: "react build module used in React/DOM/swap profiles",
      };
      finishStage(domStage, "completed");
    } catch (error) {
      failures.push(error);
      finishStage(domStage, "failed", error);
    }
  }

  const browserStage = stage(run, "browser-react-dom-and-swap-profiles");
  try {
    if (!compiledModule || !helpers || !fixture || !schedule) throw new Error("cannot run browser profiles without valid compiled inputs");
    const adapterModule = await import(pathToFileURL(args.browserAdapter).href);
    if (typeof adapterModule.runMethodsBrowserConformance !== "function") {
      throw new TypeError("browser adapter must export runMethodsBrowserConformance");
    }
    browserEvidence = await adapterModule.runMethodsBrowserConformance({
      compiledPath: args.compiled,
      helpersPath: args.helpers,
      fixturePath: args.fixture,
      outputPrefix: outputPaths.browserCapture,
      schedule,
      chromiumPath: args.chromium ?? process.env.CHROMIUM_PATH,
    });
    run.versions.chromium = browserEvidence.browser;
    await writeJSON(outputPaths.browser, browserEvidence);
    finishStage(browserStage, "completed");
  } catch (error) {
    failures.push(error);
    finishStage(browserStage, "failed", error);
    run.browserError = { name: error.name ?? "Error", message: String(error.message ?? error), stack: error.stack ?? null };
    try {
      const captured = `${outputStem}.browser.capture.failed.json`;
      run.browserFailurePath = captured;
      await access(captured);
    } catch { /* the adapter may have failed before it could write its failure record */ }
  }

  const pinAfterStage = stage(run, "source-and-output-pins-after");
  let outputPinsBeforeCheck = null;
  try {
    run.sourcePinsAfter = await captureSourcePins(inputPaths);
    run.sourceStable = sourcePinsBefore !== null && JSON.stringify(sourcePinsBefore) === JSON.stringify(run.sourcePinsAfter);
    outputPinsBeforeCheck = await pinOutputs(inputPaths);
    run.outputPinsBeforeCheck = outputPinsBeforeCheck;
    if (!run.sourceStable) throw new Error("harness, adapter, runtime, fixture, or input source changed during the run");
    finishStage(pinAfterStage, "completed");
  } catch (error) {
    failures.push(error);
    finishStage(pinAfterStage, "failed", error);
  }

  if (nativeTrace && directTrace && valueSemantics && readOnlyGuards && browserEvidence &&
      valueSemantics.passed && readOnlyGuards.passed && failures.length === 0) {
    const checkStage = stage(run, "independent-trace-method-dom-and-mutation-checks");
    try {
      check = checkMethodsConformance({ appIR, contract, fixture, nativeTrace, directTrace,
        valueSemantics, readOnlyGuards, browserEvidence });
      await writeJSON(outputPaths.check, check);
      finishStage(checkStage, "completed");
    } catch (error) {
      failures.push(error);
      finishStage(checkStage, "failed", error);
    }
  } else {
    failures.push(new Error("full check withheld because one or more required evidence stages did not pass"));
  }

  const finalPinStage = stage(run, "source-and-output-pins-final");
  try {
    run.sourcePinsFinal = await captureSourcePins(inputPaths);
    run.sourceStableThroughCheck = run.sourceStable && JSON.stringify(run.sourcePinsAfter) === JSON.stringify(run.sourcePinsFinal);
    run.outputPinsAfterCheck = outputPinsBeforeCheck ? await pinOutputs(inputPaths) : null;
    run.outputsStableThroughCheck = outputPinsBeforeCheck !== null &&
      JSON.stringify(outputPinsBeforeCheck) === JSON.stringify(run.outputPinsAfterCheck);
    if (!run.sourceStableThroughCheck || !run.outputsStableThroughCheck) {
      throw new Error("source or build input changed during the final checker stage");
    }
    finishStage(finalPinStage, "completed");
  } catch (error) {
    failures.push(error);
    finishStage(finalPinStage, "failed", error);
  }

  run.finishedAt = new Date().toISOString();
  run.status = failures.length === 0 && check?.status === "matched" ? "matched" : "rejected";
  run.summary = check ?? null;
  if (failures.length > 0) {
    run.failures = failures.map((error) => ({ name: error.name ?? "Error", message: String(error.message ?? error) }));
    await writeJSON(outputPaths.failure, {
      schema: "gobi.methods-conformance-failure/v1", run,
      nativeTracePath: outputPaths.native, directTracePath: outputPaths.direct,
      valueSemanticsPath: outputPaths.valueSemantics, readOnlyGuardsPath: outputPaths.readOnlyGuards,
      browserEvidencePath: outputPaths.browser,
      browserFailurePath: run.browserFailurePath ?? `${outputStem}.browser.capture.failed.json`,
    });
  }
  const evidenceCandidates = [outputPaths.native, outputPaths.direct, outputPaths.browser, outputPaths.browserCapture,
    outputPaths.valueSemantics, outputPaths.readOnlyGuards, outputPaths.check, outputPaths.failure,
    `${outputStem}.browser.capture.failed.json`];
  const evidencePaths = [];
  for (const path of evidenceCandidates) {
    try { await access(path); evidencePaths.push(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  run.evidencePins = await pinOutputs(evidencePaths);
  await writeJSON(outputPaths.manifest, {
    schema: "gobi.methods-conformance-manifest/v1",
    status: run.status,
    outputPaths,
    sourcePins: { before: sourcePinsBefore, after: run.sourcePinsFinal ?? run.sourcePinsAfter ?? null },
    outputPins: run.outputPinsAfterCheck ?? outputPinsBeforeCheck,
    evidencePins: run.evidencePins,
    browser: browserEvidence ? { version: browserEvidence.browser, noWasm: browserEvidence.profiles.react.noWasm } : null,
  });
  await writeJSON(outputPaths.run, run);
  if (run.status !== "matched") {
    const error = new Error(`methods conformance rejected: ${run.failures?.map((item) => item.message).join("; ") ?? "check did not match"}`);
    error.run = run;
    throw error;
  }
  return { run, check, outputPaths };
}

async function main() {
  const result = await runMethodsConformance(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ status: result.run.status, appId: result.check.appId,
    fixture: result.check.fixture, ticks: result.check.ticks, swaps: result.check.swaps,
    mutationControls: result.check.mutationControls.detected, outputPaths: result.outputPaths })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
