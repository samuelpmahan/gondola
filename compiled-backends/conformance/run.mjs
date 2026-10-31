import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { replayDirectJavaScript } from "../../compiled-frontend/conformance/direct-js.mjs";
import { runBackendBrowserConformance } from "./browser.mjs";
import { checkBackendConformance } from "./check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_SCHEDULE = resolve(ROOT, "compiled-backends/conformance/swap-schedules.json");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--")) throw new Error(`unexpected argument ${key}`);
    if (index + 1 >= args.length || args[index + 1].startsWith("--")) throw new Error(`missing value for ${key}`);
    if (values.has(key)) throw new Error(`duplicate argument ${key}`);
    values.set(key, args[++index]);
  }
  const required = ["--app-ir", "--compiled", "--helpers", "--native-bin", "--fixture", "--output"];
  for (const key of required) if (!values.has(key)) throw new Error(`missing ${key} <path>`);
  return Object.fromEntries([...values].map(([key, value]) => [key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), resolve(value)]));
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function walkSources(directory, root = directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const found = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (["artifacts", "raw", "node_modules", ".git"].includes(entry.name)) continue;
      found.push(...await walkSources(path, root));
    } else if (entry.isFile() && [".mjs", ".json", ".go", ".md"].includes(extname(entry.name))) {
      found.push({ path, relative: relative(ROOT, path).replaceAll("\\", "/") });
    }
  }
  return found;
}

async function capturePins(paths) {
  const repoSources = [
    ...await walkSources(resolve(ROOT, "compiled-backends/conformance")),
    ...await walkSources(resolve(ROOT, "compiled-frontend/frontend/runtime")),
    ...await walkSources(resolve(ROOT, "compiled-frontend/frontend/react")),
    ...await walkSources(resolve(ROOT, "compiled-frontend/frontend/dom")),
  ];
  const fixed = [
    "compiled-frontend/conformance/compare.mjs",
    "compiled-frontend/conformance/direct-js.mjs",
    "compiled-frontend/conformance/dom-oracle.mjs",
    "compiled-frontend/conformance/fixture-expectations.mjs",
    "compiled-frontend/conformance/no-wasm.mjs",
    "compiled-frontend/conformance/observed-action.mjs",
    "compiled-frontend/conformance/trace.mjs",
    "compiled-frontend/package.json",
    "interaction/package.json",
    "package.json",
  ].map((path) => resolve(ROOT, path));
  const files = [...new Set([...repoSources.map((item) => item.path), ...fixed, ...paths.map((path) => resolve(path))])].sort();
  const pins = [];
  for (const path of files) {
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
  await writeFile(path, serialize(value), "utf8");
}

function runNative(binaryPath, appIRPath, fixturePath) {
  const result = spawnSync(binaryPath, ["--app-ir", appIRPath, "--script", fixturePath], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const error = new Error(`native replay failed (exit ${result.status ?? "spawn-error"}): ${result.stderr || result.error?.message || "no stderr"}`);
    error.nativeStdout = result.stdout ?? "";
    error.nativeStderr = result.stderr ?? "";
    throw error;
  }
  try { return JSON.parse(result.stdout); }
  catch (cause) { throw new Error(`native replay did not return one JSON trace: ${cause.message}`); }
}

export async function runBackendConformance(args) {
  const nativeBin = resolve(args.nativeBin);
  const appIRPath = resolve(args.appIr);
  const compiledPath = resolve(args.compiled);
  const helpersPath = resolve(args.helpers);
  const fixturePath = resolve(args.fixture);
  const outputStem = resolve(args.output);
  const schedulePath = resolve(args.schedule ?? DEFAULT_SCHEDULE);
  const browserOutputStem = `${outputStem}.browser`;
  const outputPaths = {
    native: `${outputStem}.native.json`,
    direct: `${outputStem}.direct.json`,
    browser: `${outputStem}.browser.json`,
    check: `${outputStem}.check.json`,
    manifest: `${outputStem}.manifest.json`,
    run: `${outputStem}.run.json`,
  };
  await mkdir(dirname(outputStem), { recursive: true });
  const run = { schema: "gobi.backend-conformance-run/v1", status: "running", command: process.argv.slice(0),
    startedAt: new Date().toISOString(), node: process.version, inputs: { appIR: appIRPath, compiled: compiledPath,
      helpers: helpersPath, nativeBin, fixture: fixturePath, schedule: schedulePath }, outputPaths,
    stages: [], versions: {} };
  await writeJSON(outputPaths.run, run);
  const evidencePaths = [appIRPath, compiledPath, helpersPath, nativeBin, fixturePath, schedulePath];
  let sourceBefore;
  try {
    run.stages.push({ name: "capture-input-pins", status: "running" });
    sourceBefore = await capturePins(evidencePaths);
    run.sourcePinsBefore = sourceBefore;
    const appIR = await readJSON(appIRPath);
    const fixture = await readJSON(fixturePath);
    const schedule = await readJSON(schedulePath);
    const [compiledModule, helperModule] = await Promise.all([
      import(pathToFileURL(compiledPath).href),
      import(pathToFileURL(helpersPath).href),
    ]);
    if (compiledModule.gobiCompiled?.schema !== "gobi.compiled-module/v1") throw new Error("compiled module export is not gobi.compiled-module/v1");
    if (!Array.isArray(schedule.fixtures) || !schedule.fixtures.includes(fixture.name)) throw new Error("swap schedule does not list this fixture");
    run.stages.at(-1).status = "completed";

    run.stages.push({ name: "native-replay", status: "running" });
    const nativeTrace = runNative(nativeBin, appIRPath, fixturePath);
    await writeJSON(outputPaths.native, nativeTrace);
    run.stages.at(-1).status = "completed";

    run.stages.push({ name: "direct-javascript-replay", status: "running" });
    const directTrace = replayDirectJavaScript({ compiled: compiledModule.gobiCompiled, helpers: helperModule, fixtureScript: fixture });
    await writeJSON(outputPaths.direct, directTrace);
    run.stages.at(-1).status = "completed";

    run.stages.push({ name: "mounted-backend-and-swap-browser", status: "running" });
    const browserEvidence = await runBackendBrowserConformance({ compiledPath, helpersPath, fixturePath,
      outputPrefix: browserOutputStem, swapSchedule: schedule, chromiumPath: args.chromium ?? process.env.CHROMIUM_PATH });
    await writeJSON(outputPaths.browser, browserEvidence);
    run.versions.chromium = browserEvidence.browser;
    run.versions.playwright = JSON.parse(await readFile(resolve(ROOT, "interaction/node_modules/playwright/package.json"), "utf8")).version;
    run.stages.at(-1).status = "completed";

    run.stages.push({ name: "trace-and-mutation-checks", status: "running" });
    const sourceAfter = await capturePins(evidencePaths);
    const sourceStable = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
    const buildOutputsBeforeCheck = await pinOutputs([appIRPath, compiledPath, helpersPath, nativeBin]);
    if (!sourceStable) throw new Error("conformance inputs changed while the browser was running");
    const check = checkBackendConformance({ appIR, fixture, nativeTrace, directTrace, browserEvidence, schedule,
      pins: { sourceStable, sourceCount: sourceBefore.length, buildOutputs: buildOutputsBeforeCheck } });
    const buildOutputsAfterCheck = await pinOutputs([appIRPath, compiledPath, helpersPath, nativeBin]);
    const sourceAfterCheck = await capturePins(evidencePaths);
    if (JSON.stringify(sourceBefore) !== JSON.stringify(sourceAfterCheck)) throw new Error("conformance sources changed during final trace checking");
    if (JSON.stringify(buildOutputsBeforeCheck) !== JSON.stringify(buildOutputsAfterCheck)) {
      throw new Error("compiled module, encoder, AppIR, or native oracle changed during conformance checking");
    }
    await writeJSON(outputPaths.check, check);
    run.stages.at(-1).status = "completed";
    run.sourcePinsAfter = sourceAfterCheck;
    run.sourceStable = sourceStable;
    run.outputPins = buildOutputsAfterCheck;
    run.status = "matched";
    run.finishedAt = new Date().toISOString();
    run.summary = { appId: check.appId, fixture: check.fixture, ticks: check.ticks,
      swaps: check.swaps, focusSwaps: check.focusSwaps, mutationControlsDetected: check.mutationControlsDetected };
    await writeJSON(outputPaths.manifest, { schema: "gobi.backend-conformance-manifest/v1", outputPaths,
      browserBundle: await pinOutputs([`${browserOutputStem}.bundle.mjs`]), sourcePins: { before: sourceBefore, after: sourceAfterCheck },
      outputPins: buildOutputsAfterCheck, browser: { version: browserEvidence.browser, noWasm: browserEvidence.noWasm } });
    await writeJSON(outputPaths.run, run);
    return { run, check, outputPaths };
  } catch (error) {
    run.status = "rejected";
    run.finishedAt = new Date().toISOString();
    run.error = { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null };
    if (sourceBefore) {
      try { run.sourcePinsAfter = await capturePins(evidencePaths); run.sourceStable = JSON.stringify(sourceBefore) === JSON.stringify(run.sourcePinsAfter); }
      catch (pinError) { run.sourcePinsAfterError = String(pinError?.message ?? pinError); }
    }
    if (error.nativeStdout !== undefined) {
      await writeFile(`${outputStem}.native.failed.stdout.log`, error.nativeStdout, "utf8");
      await writeFile(`${outputStem}.native.failed.stderr.log`, error.nativeStderr, "utf8");
    }
    await writeJSON(`${outputStem}.failed.json`, { schema: "gobi.backend-conformance-failure/v1", run,
      nativeTracePath: outputPaths.native, directTracePath: outputPaths.direct, browserEvidencePath: outputPaths.browser,
      browserFailurePath: `${browserOutputStem}.failed.json` });
    await writeJSON(outputPaths.run, run);
    throw error;
  }
}

async function main() {
  const result = await runBackendConformance(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ status: result.run.status, appId: result.check.appId, fixture: result.check.fixture,
    ticks: result.check.ticks, swaps: result.check.swaps, mutationControlsDetected: result.check.mutationControlsDetected,
    outputPaths: result.outputPaths })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
