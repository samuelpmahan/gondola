import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

import { runLifecycleConformance } from "../../compiled-lifecycle/conformance/run.mjs";
import { runCapabilityBrowserConformance } from "./capability-browser.mjs";
import { checkCapabilityConformance } from "./check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_LIFECYCLE_CONTRACT = resolve(ROOT, "compiled-lifecycle/conformance/lifecycle-contract.json");
const DEFAULT_LIFECYCLE_SCHEDULE = resolve(ROOT, "compiled-lifecycle/conformance/swap-schedule.json");
const DEFAULT_LIFECYCLE_BROWSER_ADAPTER = resolve(ROOT, "compiled-lifecycle/conformance/browser.mjs");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

function resolveNativeExecutable(value) {
  if (isAbsolute(value)) return resolve(value);
  if (value.includes("/") || value.includes("\\")) return resolve(value);
  return value;
}

export function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`unexpected argument ${key}`);
    if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw new Error(`missing value for ${key}`);
    if (values.has(key)) throw new Error(`duplicate argument ${key}`);
    values.set(key, argv[++index]);
  }
  const required = ["--react-app-ir", "--react-compiled", "--react-helpers", "--react-manifest",
    "--dom-app-ir", "--dom-compiled", "--dom-helpers", "--dom-manifest", "--native-go", "--fixture",
    "--expectations", "--chromium", "--output"];
  for (const key of required) if (!values.has(key)) throw new Error(`missing ${key} <path>`);
  return Object.fromEntries([...values].map(([key, value]) => {
    const name = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const resolved = name === "nativeGo" ? resolveNativeExecutable(value) : resolve(value);
    return [name, resolved];
  }));
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
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (["node_modules", ".git", "evidence"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(path));
    else if (entry.isFile() && [".mjs", ".js", ".json", ".go", ".md", ".ts"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

async function pins(paths) {
  const rows = [];
  for (const path of [...new Set(paths.map((item) => resolve(item)))].sort()) {
    const bytes = await readFile(path);
    rows.push({ path: relative(ROOT, path).replaceAll("\\", "/"), sha256: hash(bytes), bytes: bytes.length });
  }
  return rows;
}

function version(command, args = ["--version"]) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 });
  return { command, args, exitCode: result.status, output: (result.stdout || result.stderr || "").trim() };
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

function sourcePaths(expectationsPath, fixturePath) {
  return Promise.all([
    walkFiles(resolve(ROOT, "compiled-capabilities/conformance")),
    walkFiles(resolve(ROOT, "compiled-capabilities/oracle")),
  ]).then((groups) => [...new Set([
    ...groups.flat(),
    resolve(expectationsPath),
    resolve(fixturePath),
    DEFAULT_LIFECYCLE_CONTRACT,
    DEFAULT_LIFECYCLE_SCHEDULE,
    DEFAULT_LIFECYCLE_BROWSER_ADAPTER,
    resolve(ROOT, "compiled-lifecycle/conformance/browser-entry.mjs"),
    resolve(ROOT, "compiled-lifecycle/runtime/runtime.mjs"),
    resolve(ROOT, "compiled-frontend/frontend/runtime/runtime.mjs"),
    resolve(ROOT, "compiled-frontend/frontend/react/renderer.mjs"),
    resolve(ROOT, "compiled-frontend/frontend/dom/renderer.mjs"),
  ])]);
}

export async function runCapabilityConformance(args) {
  const outputStem = resolve(args.output);
  const lifecycleStem = `${outputStem}.lifecycle`;
  const capabilityBrowserStem = `${outputStem}.capability`;
  const outputPaths = {
    native: `${lifecycleStem}.native.json`,
    direct: `${lifecycleStem}.direct.json`,
    lifecycleBrowser: `${lifecycleStem}.browser.json`,
    lifecycleCheck: `${lifecycleStem}.check.json`,
    lifecycleManifest: `${lifecycleStem}.manifest.json`,
    lifecycleRun: `${lifecycleStem}.run.json`,
    capabilityBrowser: `${capabilityBrowserStem}.browser.capture.json`,
    capabilityCheck: `${outputStem}.capability-check.json`,
    manifest: `${outputStem}.manifest.json`,
    run: `${outputStem}.run.json`,
    failure: `${outputStem}.failed.json`,
  };
  try { await access(outputPaths.run); throw new Error(`refusing to overwrite existing attempt ${outputPaths.run}`); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await mkdir(dirname(outputStem), { recursive: true });

  const run = {
    schema: "gobi.compiled-capabilities-conformance-run/v1",
    status: "running",
    command: process.argv,
    startedAt: new Date().toISOString(),
    node: process.version,
    versions: { node: process.version, go: version(args.nativeGo, ["version"]) },
    inputs: {
      reactAppIr: args.reactAppIr,
      reactCompiled: args.reactCompiled,
      reactHelpers: args.reactHelpers,
      reactManifest: args.reactManifest,
      domAppIr: args.domAppIr,
      domCompiled: args.domCompiled,
      domHelpers: args.domHelpers,
      domManifest: args.domManifest,
      nativeGo: args.nativeGo,
      fixture: args.fixture,
      expectations: args.expectations,
      chromium: args.chromium,
    },
    outputPaths,
    stages: [],
  };
  await writeJSON(outputPaths.run, run);

  const errors = [];
  let lifecycle = null;
  let capabilityBrowser = null;
  let check = null;
  let expectations = null;
  let sourceBefore = null;
  let inputPinsBefore = null;

  const inputStage = stage(run, "frozen-fixture-and-literal-capability-oracle");
  try {
    const [fixtureValue, expectationValue] = await Promise.all([readJSON(args.fixture), readJSON(args.expectations)]);
    if (fixtureValue.schema !== "gobi.compiled-lifecycle-fixture/v1") throw new TypeError("fixture must be the frozen lifecycle GoScript fixture");
    if (expectationValue.schema !== "gobi.capability-oracle/v1") throw new TypeError("expectations must be gobi.capability-oracle/v1 JSON");
    expectations = expectationValue;
    const paths = await sourcePaths(args.expectations, args.fixture);
    sourceBefore = await pins(paths);
    run.sourcePinsBefore = sourceBefore;
    run.fixtureIdentity = { name: fixtureValue.name, packagePath: fixtureValue.packagePath, componentID: fixtureValue.componentID };
    finish(inputStage, "completed");
  } catch (error) {
    errors.push(error);
    finish(inputStage, "failed", error);
  }

  const lifecycleStage = stage(run, "inherited-compiled-go-lifecycle-react-dom-and-swap-replay");
  try {
    if (!expectations) throw new Error("lifecycle replay withheld because fixture/oracle inputs are invalid");
    lifecycle = await runLifecycleConformance({
      fixture: args.fixture,
      contract: DEFAULT_LIFECYCLE_CONTRACT,
      schedule: DEFAULT_LIFECYCLE_SCHEDULE,
      browserAdapter: DEFAULT_LIFECYCLE_BROWSER_ADAPTER,
      nativeGo: args.nativeGo,
      reactAppIr: args.reactAppIr,
      reactCompiled: args.reactCompiled,
      reactHelpers: args.reactHelpers,
      reactManifest: args.reactManifest,
      domAppIr: args.domAppIr,
      domCompiled: args.domCompiled,
      domHelpers: args.domHelpers,
      domManifest: args.domManifest,
      output: lifecycleStem,
      chromium: args.chromium,
    });
    if (lifecycle.run.status !== "matched") throw new Error("inherited compiled lifecycle replay rejected its native/direct/browser evidence");
    finish(lifecycleStage, "completed");
  } catch (error) {
    errors.push(error);
    finish(lifecycleStage, "failed", error);
  }

  const capabilityBrowserStage = stage(run, "actual-mounted-host-renderer-admission-and-atomic-swap-probe");
  try {
    if (!expectations || !lifecycle) throw new Error("capability browser probe withheld because inherited lifecycle evidence is unavailable");
    capabilityBrowser = await runCapabilityBrowserConformance({
      compiledPath: args.reactCompiled,
      helpersPath: args.reactHelpers,
      fixturePath: args.fixture,
      expectationsPath: args.expectations,
      outputPrefix: capabilityBrowserStem,
      chromiumPath: args.chromium,
    });
    finish(capabilityBrowserStage, "completed");
  } catch (error) {
    errors.push(error);
    finish(capabilityBrowserStage, "failed", error);
    run.capabilityBrowserError = { name: error.name ?? "Error", message: String(error.message ?? error), stack: error.stack ?? null };
  }

  const inputPinStage = stage(run, "source-and-build-output-pins-before-check");
  try {
    if (sourceBefore === null) throw new Error("source pins unavailable");
    const paths = await sourcePaths(args.expectations, args.fixture);
    run.sourcePinsAfterReplay = await pins(paths);
    run.sourcesStableBeforeCheck = JSON.stringify(sourceBefore) === JSON.stringify(run.sourcePinsAfterReplay);
    const buildPaths = [args.reactAppIr, args.reactCompiled, args.reactHelpers, args.reactManifest,
      args.domAppIr, args.domCompiled, args.domHelpers, args.domManifest];
    inputPinsBefore = await pins(buildPaths);
    run.buildOutputPinsBeforeCheck = inputPinsBefore;
    if (!run.sourcesStableBeforeCheck) throw new Error("conformance sources or literal oracle changed during evidence capture");
    finish(inputPinStage, "completed");
  } catch (error) {
    errors.push(error);
    finish(inputPinStage, "failed", error);
  }

  if (lifecycle && capabilityBrowser && expectations && errors.length === 0) {
    const checkStage = stage(run, "independent-capability-and-preservation-checks");
    try {
      check = checkCapabilityConformance({
        lifecycle,
        browser: capabilityBrowser,
        expectations,
        outputPaths: { lifecycleRun: outputPaths.lifecycleRun, lifecycleCheck: outputPaths.lifecycleCheck },
      });
      await writeJSON(outputPaths.capabilityCheck, check);
      finish(checkStage, "completed");
    } catch (error) {
      errors.push(error);
      finish(checkStage, "failed", error);
    }
  } else {
    errors.push(new Error("capability checker withheld because a required replay stage failed"));
  }

  const finalPinStage = stage(run, "final-source-and-build-output-stability-check");
  try {
    if (sourceBefore === null || inputPinsBefore === null) throw new Error("initial pins are unavailable");
    const paths = await sourcePaths(args.expectations, args.fixture);
    run.sourcePinsFinal = await pins(paths);
    run.sourceStableThroughCheck = JSON.stringify(sourceBefore) === JSON.stringify(run.sourcePinsFinal);
    const buildPaths = [args.reactAppIr, args.reactCompiled, args.reactHelpers, args.reactManifest,
      args.domAppIr, args.domCompiled, args.domHelpers, args.domManifest];
    run.buildOutputPinsAfterCheck = await pins(buildPaths);
    run.buildOutputsStableThroughCheck = JSON.stringify(inputPinsBefore) === JSON.stringify(run.buildOutputPinsAfterCheck);
    if (!run.sourceStableThroughCheck || !run.buildOutputsStableThroughCheck) {
      throw new Error("source, oracle, or build outputs changed during the independent checker");
    }
    finish(finalPinStage, "completed");
  } catch (error) {
    errors.push(error);
    finish(finalPinStage, "failed", error);
  }

  run.finishedAt = new Date().toISOString();
  run.status = errors.length === 0 && check?.status === "matched" ? "matched" : "rejected";
  run.summary = check;
  run.lifecycle = lifecycle ? {
    status: lifecycle.run.status,
    runPath: outputPaths.lifecycleRun,
    checkPath: outputPaths.lifecycleCheck,
    nativePath: outputPaths.native,
    directPath: outputPaths.direct,
    browserPath: outputPaths.lifecycleBrowser,
  } : null;
  run.capability = capabilityBrowser ? { browserPath: outputPaths.capabilityBrowser, checkPath: check ? outputPaths.capabilityCheck : null } : null;
  if (errors.length > 0) {
    run.failures = errors.map((error) => ({ name: error.name ?? "Error", message: String(error.message ?? error) }));
    await writeJSON(outputPaths.failure, {
      schema: "gobi.compiled-capabilities-conformance-failure/v1",
      errors: run.failures,
      outputPaths,
      stages: run.stages,
      browserError: run.capabilityBrowserError ?? null,
    });
  }

  const evidenceFiles = [outputPaths.capabilityBrowser, outputPaths.capabilityCheck, outputPaths.failure];
  run.evidencePins = await pins(await Promise.all(evidenceFiles.map(async (path) => {
    try { await access(path); return path; }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  })).then((paths) => paths.filter(Boolean)));
  await writeJSON(outputPaths.manifest, {
    schema: "gobi.compiled-capabilities-conformance-manifest/v1",
    status: run.status,
    outputPaths,
    sourcePins: { before: sourceBefore, final: run.sourcePinsFinal ?? null },
    buildOutputPins: { beforeCheck: inputPinsBefore, afterCheck: run.buildOutputPinsAfterCheck ?? null },
    evidencePins: run.evidencePins,
    browser: capabilityBrowser ? { version: capabilityBrowser.browser, playwright: capabilityBrowser.playwright, noWasm: capabilityBrowser.noWasm } : null,
    lifecycleStatus: lifecycle?.run?.status ?? null,
    capabilityStatus: check?.status ?? null,
  });
  await writeJSON(outputPaths.run, run);
  return { run, check, outputPaths };
}

async function main() {
  const result = await runCapabilityConformance(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ status: result.run.status, fixture: result.check?.fixture ?? null,
    admissionCases: result.check?.admission.observedCaseIds.length ?? 0,
    lifecycleTicks: result.check?.lifecycleSummary.ticks ?? null,
    outputPaths: result.outputPaths })}\n`);
  if (result.run.status !== "matched") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
