import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runModuleEffectsDirect } from "./direct.mjs";
import { runModuleEffectsBrowser } from "./browser.mjs";
import { DEFAULT_SEEDS, generateSeededEffectsScenario, literalEffectsScenario } from "./scenarios.mjs";
import { loadModuleEffectsBuilds } from "../build/module-loader.mjs";
import { assertScenarioMatchesNative } from "./capture-utils.mjs";
import { validateBuildMutationReport, validateCaptureMutationReport } from "./mutation-controls.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NATIVE_SCHEMA = "gobi.module-effects-native/v1";
const SUMMARY_SCHEMA = "gobi.module-effects-conformance-summary/v1";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new TypeError(`unexpected argument ${item}`);
    const name = item.slice(2);
    if (Object.hasOwn(args, name)) throw new TypeError(`duplicate --${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new TypeError(`--${name} needs a value`);
    args[name] = value;
    index += 1;
  }
  const required = ["native-go", "build-index", "chromium", "output"];
  const missing = required.filter((name) => typeof args[name] !== "string" || args[name] === "");
  if (missing.length !== 0) throw new TypeError(`missing required flags: ${missing.map((name) => `--${name}`).join(", ")}`);
  return {
    nativeGo: resolve(args["native-go"]),
    buildIndex: resolve(args["build-index"]),
    chromium: resolve(args.chromium),
    output: resolve(args.output),
  };
}

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeFile(path, bytes);
  return { path: resolve(path), bytes: bytes.byteLength, sha256: sha256(bytes) };
}

async function writeText(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const bytes = Buffer.from(value, "utf8");
  await writeFile(path, bytes);
  return { path: resolve(path), bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function nativeCommand(nativeGo, scenarioPath) {
  const command = [nativeGo, "run", "./cmd/module-effects-native", "-script", scenarioPath];
  const result = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
    maxBuffer: 256 * 1024 * 1024,
  });
  return { command, result };
}

async function captureNative({ nativeGo, scenario, scenarioPath, outputPrefix, label }) {
  const scenarioCapture = await writeJSON(scenarioPath, scenario);
  const { command, result } = nativeCommand(nativeGo, scenarioPath);
  const stdoutPath = `${outputPrefix}.${label}.native.stdout.log`;
  const stderrPath = `${outputPrefix}.${label}.native.stderr.log`;
  await Promise.all([
    writeText(stdoutPath, result.stdout ?? ""),
    writeText(stderrPath, result.stderr ?? ""),
  ]);
  if (result.error || result.status !== 0) {
    await writeJSON(`${outputPrefix}.${label}.native.failed.json`, {
      command,
      status: result.status,
      signal: result.signal,
      error: result.error ? { name: result.error.name, message: result.error.message } : null,
      stdout: stdoutPath,
      stderr: stderrPath,
    });
    throw new Error(`native module-effects replay failed for ${scenario.name} (${result.status ?? result.signal}): ${result.stderr ?? result.error?.message ?? "unknown error"}`);
  }
  let trace;
  try { trace = JSON.parse(result.stdout); }
  catch (error) { throw new Error(`native module-effects output for ${scenario.name} is not JSON: ${error.message}`); }
  if (trace?.schema !== NATIVE_SCHEMA || trace.name !== scenario.name || trace.events?.length !== scenario.events.length) {
    throw new TypeError(`native module-effects identity, schema, or event count mismatch for ${scenario.name}`);
  }
  assertScenarioMatchesNative(scenario, trace);
  const capture = await writeJSON(`${outputPrefix}.${label}.native.json`, trace);
  return {
    trace,
    capture,
    scenario: scenarioCapture,
    command,
    stdoutPath,
    stderrPath,
    stdoutSHA256: sha256(Buffer.from(result.stdout, "utf8")),
    versions: { node: process.version },
  };
}

function assertionResult(value, label) {
  if (value === false || value?.status === "mismatch" || value?.status === "rejected") {
    throw new Error(`${label} failed: ${value?.summary ?? JSON.stringify(value)}`);
  }
  return value ?? { status: "matched" };
}

async function runOneScenario({ label, scenario, seed, generator, args, builds, oracle, outputPrefix }) {
  const scenarioPath = `${outputPrefix}.${label}.scenario.json`;
  const nativeResult = await captureNative({ nativeGo: args.nativeGo, scenario, scenarioPath, outputPrefix, label });
  const native = nativeResult.trace;
  const nativeCheck = assertionResult(await oracle.assertNativeModuleEffectsCapture(native, scenario), `${label} native semantic oracle`);

  const profiles = {};
  const artifacts = {};
  const metadata = {};
  for (const backend of ["react", "dom"]) {
    const capture = await runModuleEffectsDirect({ build: builds.builds[backend], scenario, native, seed, backend });
    const key = `direct.${backend}`;
    profiles[key] = capture;
    artifacts[key] = await writeJSON(`${outputPrefix}.${label}.${key}.json`, capture);
  }
  const browserRun = await runModuleEffectsBrowser({
    builds,
    scenario,
    native,
    seed,
    outputPrefix: `${outputPrefix}.${label}`,
    chromiumPath: args.chromium,
  });
  for (const backend of ["react", "dom", "swap"]) {
    const key = `browser.${backend}`;
    profiles[key] = browserRun.profiles[backend];
    artifacts[key] = await writeJSON(`${outputPrefix}.${label}.${key}.json`, profiles[key]);
  }

  const parity = assertionResult(
    await oracle.assertModuleEffectsParity({ scenario, native, profiles }),
    `${label} native/direct/browser module-effects parity`,
  );
  const captureIndex = Object.fromEntries(Object.entries(artifacts).map(([profile, capture]) => [profile, capture]));
  const profileArrayCounts = Object.fromEntries(Object.entries(profiles).map(([profile, capture]) => [profile, {
    events: capture.events.length,
    snapshots: capture.snapshots.length,
    ledger: capture.ledger.length,
    orderedLedger: capture.orderedLedger.length,
    transportLedger: capture.transportLedger.length,
  }]));
  return {
    label,
    seed,
    generator: generator ?? null,
    scenario: { name: scenario.name, events: scenario.events.length, path: nativeResult.scenario.path, bytes: nativeResult.scenario.bytes, sha256: nativeResult.scenario.sha256 },
    native: { ...nativeResult.capture, stdoutSHA256: nativeResult.stdoutSHA256, command: nativeResult.command,
      commandEnvironment: { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
      commandCwd: ROOT, stdoutPath: nativeResult.stdoutPath, stderrPath: nativeResult.stderrPath },
    nativeCheck,
    parity,
    browser: { version: browserRun.browser, playwright: browserRun.playwright, pageErrors: browserRun.pageErrors },
    eventCount: scenario.events.length,
    nativeEventCount: native.events.length,
    stateCount: native.states.length,
    effectCount: native.effects.length,
    transportEventCount: native.transportLedger.length,
    profileArrayCounts,
    captures: captureIndex,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(dirname(args.output), { recursive: true });
  const buildIndexBytes = await readFile(args.buildIndex);
  const buildIndex = JSON.parse(buildIndexBytes.toString("utf8"));
  const oracle = await import("../oracle/oracle.mjs");
  const builds = await loadModuleEffectsBuilds(args.buildIndex);
  const goVersionResult = spawnSync(args.nativeGo, ["version"], { encoding: "utf8" });
  if (goVersionResult.error || goVersionResult.status !== 0) throw new Error(`cannot read native Go version: ${goVersionResult.stderr ?? goVersionResult.error?.message}`);
  const nativeGoVersion = (goVersionResult.stdout ?? "").trim();
  const buildAdmission = assertionResult(await oracle.assertModuleEffectsBuildAdmission(builds), "four-build typed effect admission");
  const buildSummary = {
    path: args.buildIndex,
    bytes: buildIndexBytes.byteLength,
    sha256: sha256(buildIndexBytes),
    schema: buildIndex.schema,
    admission: builds.admission,
    closedEffectDescriptors: builds.closedEffectDescriptors,
    pins: Object.fromEntries(["react", "dom"].map((backend) => [backend, builds.builds[backend].pins ?? null])),
    oracle: buildAdmission,
  };

  const scenarios = [{ label: "literal", scenario: literalEffectsScenario(), seed: null, generator: null }];
  for (const seed of DEFAULT_SEEDS) {
    const generated = generateSeededEffectsScenario(seed);
    scenarios.push({ label: `seed-${seed}`, scenario: generated.scenario, seed, generator: generated.metadata });
  }
  const results = [];
  const captureIndex = {};
  for (const item of scenarios) {
    const result = await runOneScenario({ ...item, args, builds, oracle, outputPrefix: args.output });
    results.push(result);
    captureIndex[item.label] = {
      scenario: { path: result.scenario.path, bytes: result.scenario.bytes, sha256: result.scenario.sha256 },
      native: { path: result.native.path, bytes: result.native.bytes, sha256: result.native.sha256,
        command: result.native.command, commandCwd: result.native.commandCwd,
        commandEnvironment: result.native.commandEnvironment },
      profiles: result.captures,
    };
  }
  const literalCaptureRefs = captureIndex.literal;
  const mutationInputs = {
    scenario: JSON.parse(await readFile(literalCaptureRefs.scenario.path, "utf8")),
    native: JSON.parse(await readFile(literalCaptureRefs.native.path, "utf8")),
    profiles: Object.fromEntries(await Promise.all(Object.entries(literalCaptureRefs.profiles).map(async ([profile, ref]) =>
      [profile, JSON.parse(await readFile(ref.path, "utf8"))]))),
  };
  const captureMutationControls = validateCaptureMutationReport(
    await oracle.runModuleEffectsMutationControls(mutationInputs), { allowAdditionalControls: true });
  const buildAdmissionControls = await oracle.runModuleEffectsBuildAdmissionMutationControls(builds);
  buildSummary.mutationControls = validateBuildMutationReport({ status: "detected", ...buildAdmissionControls });

  const summary = {
    schema: SUMMARY_SCHEMA,
    status: "matched",
    worker: "N4",
    job_id: "E-HARNESS",
    buildIndex: buildSummary,
    captureMutationControls,
    nativeGo: args.nativeGo,
    nativeGoVersion,
    chromium: args.chromium,
    versions: { node: process.version, nodeExecutable: process.execPath, nativeGo: nativeGoVersion,
      compilerGo: builds.toolchain?.compilerGo ?? null, browser: results[0].browser.version, playwright: results[0].browser.playwright },
    command: [process.execPath, ...process.argv.slice(1)],
    scenarioCount: scenarios.length,
    fixedEventCount: scenarios[0].scenario.events.length,
    seededSeeds: [...DEFAULT_SEEDS],
    seededEventCounts: Object.fromEntries(results.filter((item) => item.seed !== null).map((item) => [item.seed, item.nativeEventCount])),
    profiles: ["direct.react", "direct.dom", "browser.react", "browser.dom", "browser.swap"],
    profileCountPerScenario: Object.keys(results[0].profileArrayCounts).length,
    nativeEvents: results.reduce((sum, item) => sum + item.nativeEventCount, 0),
    nativeEffects: results.reduce((sum, item) => sum + item.effectCount, 0),
    transportEvents: results.reduce((sum, item) => sum + item.transportEventCount, 0),
    profileEvents: results.reduce((sum, item) => sum + Object.values(item.profileArrayCounts).reduce((inner, counts) => inner + counts.events, 0), 0),
    scenarios: results.map(({ label, seed, generator, scenario, native, eventCount, nativeEventCount, stateCount, effectCount, transportEventCount, profileArrayCounts, nativeCheck, parity, browser }) => ({
      label, seed, generator, scenario, nativeCommand: { argv: native.command, cwd: native.commandCwd, envOverrides: native.commandEnvironment },
      eventCount, nativeEventCount, stateCount, effectCount, transportEventCount, profileArrayCounts, nativeCheck, parity, browser,
    })),
    captures: captureIndex,
    conformanceScope: {
      browserClicks: "real HTMLElement.click() on the current rendered button; no trusted pointer or OS input claim",
      applicationTransitions: "native Go replay is the expected transition source; renderer and transport callbacks do not reconstruct application state",
      transport: "deterministic deferred manual completion queue with retained cancellation, duplicate, and old-generation callbacks",
      lifetime: "UI callbacks are renderer-epoch scoped; effect replies are keyed by key+generation+request token and remain valid across renderer swaps",
    },
  };
  const summaryCapture = await writeJSON(`${args.output}.summary.json`, summary);
  await writeJSON(`${args.output}.check.json`, { schema: "gobi.module-effects-conformance-check/v1", status: "matched", summary: summaryCapture });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch(async (error) => {
  const args = (() => { try { return parseArgs(process.argv.slice(2)); } catch { return null; } })();
  if (args) {
    try {
      await writeJSON(`${args.output}.failed.json`, {
        schema: "gobi.module-effects-conformance-failure/v1",
        worker: "N4",
        job_id: "E-HARNESS",
        error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null },
      });
    } catch { /* preserve the process failure as the primary result */ }
  }
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
