import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCompiledKeyedDirect } from "./direct.mjs";
import { runKeyedBrowserConformance } from "./browser.mjs";
import { loadKeyedModuleBuilds } from "./module-loader.mjs";
import { DEFAULT_SEEDS, generateSeededKeyedScenario, literalKeyedScenario } from "./scenarios.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GO_NATIVE_SCHEMA = "gobi.keyed-module-native/v1";
const SUMMARY_SCHEMA = "gobi.keyed-modules-conformance-summary/v1";
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
  const command = [nativeGo, "run", "./cmd/keyed-module-native", "--script", scenarioPath];
  const result = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
    maxBuffer: 128 * 1024 * 1024,
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
    throw new Error(`native keyed replay failed for ${scenario.name} (${result.status ?? result.signal}): ${result.stderr ?? result.error?.message ?? "unknown error"}`);
  }
  let trace;
  try { trace = JSON.parse(result.stdout); }
  catch (error) { throw new Error(`native keyed replay output for ${scenario.name} is not JSON: ${error.message}`); }
  if (trace?.schema !== GO_NATIVE_SCHEMA || trace.name !== scenario.name || trace.events?.length !== scenario.events.length) {
    throw new TypeError(`native keyed replay identity or schema mismatch for ${scenario.name}`);
  }
  const tracePath = `${outputPrefix}.${label}.native.json`;
  const traceCapture = await writeJSON(tracePath, trace);
  return {
    trace,
    capture: traceCapture,
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

async function runOneScenario({ label, scenario, seed, args, builds, oracle, outputPrefix, runMutationControls }) {
  const scenarioPath = `${outputPrefix}.inputs.${label}.scenario.json`;
  const nativeResult = await captureNative({ nativeGo: args.nativeGo, scenario, scenarioPath, outputPrefix, label });
  const native = nativeResult.trace;
  const nativeCheck = assertionResult(await oracle.assertNativeKeyedCapture(native, scenario), `${label} native semantic oracle`);
  const direct = {};
  const directArtifacts = {};
  for (const backend of ["react", "dom"]) {
    direct[backend] = await runCompiledKeyedDirect({ build: builds.builds[backend], scenario, native, seed });
    const path = `${outputPrefix}.${label}.direct.${backend}.json`;
    directArtifacts[backend] = await writeJSON(path, direct[backend]);
  }
  const directArtifact = await writeJSON(`${outputPrefix}.${label}.direct.json`, direct);

  const browserRun = await runKeyedBrowserConformance({
    builds: builds.builds,
    scenario,
    native,
    seed,
    outputPrefix: `${outputPrefix}.${label}`,
    chromiumPath: args.chromium,
  });
  const browser = browserRun;
  const browserArtifacts = {};
  for (const profile of ["react", "dom", "swap"]) {
    browserArtifacts[profile] = await writeJSON(`${outputPrefix}.${label}.browser.${profile}.json`, browser.profiles[profile]);
  }
  const browserArtifact = await writeJSON(`${outputPrefix}.${label}.browser.json`, browser);

  const parity = assertionResult(
    await oracle.assertKeyedCaptureParity({ native, direct, browser, scenario }),
    `${label} direct/browser keyed parity`,
  );
  let mutationControls = null;
  if (runMutationControls) {
    mutationControls = assertionResult(
      await oracle.runKeyedMutationControls({ native, direct, browser, scenario }),
      `${label} keyed mutation controls`,
    );
  }
  return {
    label,
    seed,
    scenario: { name: scenario.name, events: scenario.events.length, path: nativeResult.scenario.path, sha256: nativeResult.scenario.sha256 },
    native: { ...nativeResult.capture, stdoutSHA256: nativeResult.stdoutSHA256, command: nativeResult.command,
      stdoutPath: nativeResult.stdoutPath, stderrPath: nativeResult.stderrPath },
    direct: { ...directArtifact, byBackend: directArtifacts },
    browser: { ...browserArtifact, byProfile: browserArtifacts, browser: browser.browser, playwright: browser.playwright,
      pageErrors: browser.pageErrors },
    nativeCheck,
    parity,
    mutationControls,
    sourceEventCount: scenario.events.length,
    browserProfileCount: browser.browserProfileCount,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPrefix = args.output;
  await mkdir(dirname(outputPrefix), { recursive: true });
  const buildIndexBytes = await readFile(args.buildIndex);
  const buildIndex = JSON.parse(buildIndexBytes.toString("utf8"));
  const oracle = await import("../oracle/oracle.mjs");
  const builds = await loadKeyedModuleBuilds(args.buildIndex);
  const repoRoot = ROOT;
  const buildRoot = dirname(args.buildIndex);
  const buildIdentity = assertionResult(await oracle.assertKeyedBuildIdentity(buildIndex, { buildRoot, repoRoot }), "build identity audit");
  const buildMutations = assertionResult(await oracle.runKeyedBuildMutationControls(buildIndex, { buildRoot, repoRoot }), "build helper identity controls");

  const scenarios = [{ label: "literal", scenario: literalKeyedScenario(), seed: null }];
  for (const seed of DEFAULT_SEEDS) {
    const generated = generateSeededKeyedScenario(seed);
    scenarios.push({ label: `seed-${seed}`, scenario: generated.scenario, seed, generator: generated.metadata });
  }
  const results = [];
  for (const [index, item] of scenarios.entries()) {
    results.push(await runOneScenario({
      label: item.label,
      scenario: item.scenario,
      seed: item.seed,
      args,
      builds,
      oracle,
      outputPrefix,
      runMutationControls: index === 0,
    }));
    results.at(-1).generator = item.generator ?? null;
  }
  const captureIndex = Object.fromEntries(results.map((item) => [item.label, {
    scenario: item.scenario,
    native: { path: item.native.path, bytes: item.native.bytes, sha256: item.native.sha256 },
    direct: { path: item.direct.path, bytes: item.direct.bytes, sha256: item.direct.sha256,
      react: item.direct.byBackend.react, dom: item.direct.byBackend.dom },
    browser: Object.fromEntries(Object.entries(item.browser.byProfile).map(([profile, capture]) => [profile, capture])),
    browserIndex: { path: item.browser.path, bytes: item.browser.bytes, sha256: item.browser.sha256 },
  }]));
  const summary = {
    schema: SUMMARY_SCHEMA,
    status: "matched",
    worker: "N4",
    job_id: "E-HARNESS",
    buildIndex: { path: args.buildIndex, bytes: buildIndexBytes.byteLength, sha256: sha256(buildIndexBytes),
      parentABI: { react: builds.builds.react.pins.parentABI, dom: builds.builds.dom.pins.parentABI },
      childABI: { react: builds.builds.react.pins.childABI, dom: builds.builds.dom.pins.childABI },
      helperSHA256: { react: builds.builds.react.pins.helperSHA256, dom: builds.builds.dom.pins.helperSHA256 } },
    nativeGo: args.nativeGo,
    chromium: args.chromium,
    scenarioCount: scenarios.length,
    fixedEventCount: scenarios[0].scenario.events.length,
    seededSeeds: [...DEFAULT_SEEDS],
    seededEventsPerSeed: scenarios[1].scenario.events.length,
    directProfileCount: results.length * 2,
    browserProfileCount: results.reduce((sum, item) => sum + item.browserProfileCount, 0),
    profiles: ["direct.react", "direct.dom", "browser.react", "browser.dom", "browser.swap"],
    buildIdentity,
    buildMutationControls: buildMutations,
    scenarios: results,
    captures: { literal: captureIndex.literal, seeds: Object.fromEntries(DEFAULT_SEEDS.map((seed) => [seed, captureIndex[`seed-${seed}`]])) },
    conformanceScope: {
      browserClicks: "programmatic HTMLElement.click() DOM dispatch through current rendered Go View handlers; not trusted pointer or OS input",
      stateTransitions: "Go native trace is the expected transition source; direct and browser captures invoke generated Go roles",
      asyncEffects: "none tested or claimed; bounded synchronous membership/generation profile only",
      helperReachability: "Children is AppIR-reachable; ReceiveKeyed and IsCurrent are sidecar-pinned exported GoScript helpers but not AppIR-reachability-admitted by the unchanged shared analyzer",
    },
  };
  const summaryCapture = await writeJSON(`${outputPrefix}.summary.json`, summary);
  const checkCapture = await writeJSON(`${outputPrefix}.check.json`, {
    schema: "gobi.keyed-modules-conformance-check/v1",
    status: "matched",
    summary: summaryCapture,
  });
  process.stdout.write(`${JSON.stringify({ ...summary, summaryCapture, checkCapture })}\n`);
}

main().catch(async (error) => {
  const argv = process.argv.slice(2);
  const index = argv.indexOf("--output");
  if (index >= 0 && argv[index + 1]) {
    const output = resolve(argv[index + 1]);
    await mkdir(dirname(output), { recursive: true });
    await writeJSON(`${output}.failed.json`, {
      schema: "gobi.keyed-modules-conformance-failure/v1",
      status: "failed",
      error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null },
    }).catch(() => {});
  }
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
