import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { replayCompiledModulesDirect } from "./direct.mjs";
import { runModuleBrowserConformance } from "./browser.mjs";
import { loadModulePairBuilds } from "./module-loader.mjs";
import { generateSeededModuleScenario, DEFAULT_SEEDS, SEEDED_EVENT_COUNT } from "./seeded.mjs";
import {
  assertNative,
  assertDirect,
  assertBrowserProfile,
  assertSeededReplay,
  runMutationControls,
} from "./check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIXED_PARENT = "github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent";
const FIXED_CHILD = "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild";
const EXPECTATIONS_SCHEMA = "gobi.compiled-modules-oracle-expectations/v1";

function writeJSON(path, value) {
  return mkdir(dirname(path), { recursive: true }).then(() =>
    writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new TypeError(`unexpected argument ${item}`);
    const key = item.slice(2);
    if (Object.hasOwn(values, key)) throw new TypeError(`duplicate --${key}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new TypeError(`--${key} needs a value`);
    values[key] = value;
    index += 1;
  }
  const required = ["native-go", "fixture", "expectations", "parent-react-manifest", "child-react-manifest",
    "parent-dom-manifest", "child-dom-manifest", "chromium", "output"];
  const missing = required.filter((key) => typeof values[key] !== "string" || values[key] === "");
  if (missing.length) throw new TypeError(`missing required flags: ${missing.map((key) => `--${key}`).join(", ")}`);
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, resolve(value)]));
}

function directPair(pair) {
  return {
    parent: { ...pair.parent, abi: pair.parent.descriptor },
    child: { ...pair.child, abi: pair.child.descriptor },
  };
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function captureNative({ nativeGo, scenario, scenarioPath, outputPrefix, label }) {
  await writeJSON(scenarioPath, scenario);
  const command = [nativeGo, "run", "./cmd/compiled-modules-native", "--script", scenarioPath];
  const result = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
  });
  const stdoutPath = `${outputPrefix}.${label}.native.stdout.log`;
  const stderrPath = `${outputPrefix}.${label}.native.stderr.log`;
  await Promise.all([
    mkdir(dirname(stdoutPath), { recursive: true }),
    writeFile(stdoutPath, result.stdout ?? "", "utf8"),
    writeFile(stderrPath, result.stderr ?? "", "utf8"),
  ]);
  if (result.error || result.status !== 0) {
    await writeJSON(`${outputPrefix}.${label}.native.failed.json`, {
      command,
      status: result.status,
      signal: result.signal,
      error: result.error ? { name: result.error.name, message: result.error.message } : null,
      stdoutPath,
      stderrPath,
    });
    throw new Error(`${label} native Go command failed with status ${result.status}: ${result.stderr ?? result.error?.message ?? "unknown error"}`);
  }
  let trace;
  try { trace = JSON.parse(result.stdout); }
  catch (error) { throw new Error(`${label} native output was not JSON: ${error.message}`); }
  const tracePath = `${outputPrefix}.${label}.native.json`;
  await writeJSON(tracePath, trace);
  return {
    trace,
    command,
    scenarioPath,
    stdoutPath,
    stderrPath,
    tracePath,
    stdoutSHA256: sha256(Buffer.from(result.stdout)),
    traceSHA256: sha256(Buffer.from(`${JSON.stringify(trace, null, 2)}\n`)),
    stdoutBytes: Buffer.byteLength(result.stdout),
  };
}

async function captureDirect(pair, fixture) {
  return replayCompiledModulesDirect({ ...directPair(pair), fixture });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prefix = args.output;
  await mkdir(dirname(prefix), { recursive: true });
  const fixture = await readJSON(args.fixture);
  const expectations = await readJSON(args.expectations);
  if (expectations.schema !== EXPECTATIONS_SCHEMA || fixture.schema !== expectations.scenario.schema ||
      fixture.name !== expectations.scenario.name || fixture.events.length !== expectations.scenario.sourceEvents) {
    throw new TypeError("fixture and literal module expectations do not match the frozen 24-event plan");
  }
  if (JSON.stringify(expectations.seeded.seeds) !== JSON.stringify(DEFAULT_SEEDS) ||
      expectations.seeded.eventsPerSeed !== SEEDED_EVENT_COUNT) {
    throw new TypeError("seeded plan does not match the frozen seeds or event bound");
  }
  const [reactPair, domPair] = await Promise.all([
    loadModulePairBuilds({ parentManifest: args["parent-react-manifest"], childManifest: args["child-react-manifest"],
      parentPackage: FIXED_PARENT, childPackage: FIXED_CHILD }),
    loadModulePairBuilds({ parentManifest: args["parent-dom-manifest"], childManifest: args["child-dom-manifest"],
      parentPackage: FIXED_PARENT, childPackage: FIXED_CHILD }),
  ]);
  const modulePairs = { react: reactPair, dom: domPair };
  const fixedNative = await captureNative({ nativeGo: args["native-go"], scenario: fixture, scenarioPath: `${prefix}.inputs.fixed.scenario.json`,
    outputPrefix: prefix, label: "fixed" });
  const fixedDirect = {
    react: await captureDirect(reactPair, fixture),
    dom: await captureDirect(domPair, fixture),
  };
  await writeJSON(`${prefix}.fixed.direct.json`, fixedDirect);
  const seededInputs = DEFAULT_SEEDS.map((seed) => ({ seed, ...generateSeededModuleScenario(seed, SEEDED_EVENT_COUNT) }));
  const seededNative = {};
  const seededDirect = {};
  const seedSummary = [];
  for (const item of seededInputs) {
    const label = `seed-${item.seed}`;
    const capture = await captureNative({ nativeGo: args["native-go"], scenario: item.scenario,
      scenarioPath: `${prefix}.inputs.${label}.scenario.json`, outputPrefix: prefix, label });
    seededNative[item.seed] = capture;
    seededDirect[item.seed] = {
      react: await captureDirect(reactPair, item.scenario),
      dom: await captureDirect(domPair, item.scenario),
    };
    seedSummary.push({
      seed: item.seed,
      events: item.scenario.events.length,
      goUpdates: capture.trace.steps.length,
      stateCheckpoints: capture.trace.steps.length + 1,
      nativeTraceSHA256: capture.traceSHA256,
      generator: item.metadata.generator,
    });
  }
  await writeJSON(`${prefix}.fixed.native.json`, fixedNative.trace);
  await writeJSON(`${prefix}.seeded.direct.json`, seededDirect);
  const browser = await runModuleBrowserConformance({
    reactPair,
    domPair,
    fixture,
    seededScenarios: seededInputs.map(({ seed, scenario }) => ({ seed, scenario })),
    outputPrefix: prefix,
    chromiumPath: args.chromium,
  });
  await writeJSON(`${prefix}.fixed.browser-profiles.json`, {
    schema: "gobi.compiled-modules-browser-profile-index/v1",
    capturePath: `${prefix}.browser.json`,
    profiles: Object.fromEntries(["react", "dom", "swap"].map((kind) => {
      const profile = browser.profiles[kind];
      return [kind, { sourceEvents: profile.sourceEventCount, updates: profile.trace.steps.length,
        checkpoints: profile.trace.checkpoints.length, initialBackend: profile.initialBackend,
        finalBackend: profile.trace.backend, failures: profile.failures.length }];
    })),
    seededProfiles: Object.keys(browser.profiles.seeded),
    browserProfileCount: browser.profileCount,
  });
  const fixedMutations = [];
  assertNative(fixedNative.trace, fixture);
  assertDirect(fixedDirect.react, fixedNative.trace, fixture, directPair(reactPair).parent, directPair(reactPair).child);
  assertDirect(fixedDirect.dom, fixedNative.trace, fixture, directPair(domPair).parent, directPair(domPair).child);
  for (const kind of ["react", "dom", "swap"]) {
    const pair = kind === "dom" ? domPair : reactPair;
    assertBrowserProfile(browser.profiles[kind], kind, fixture, { parent: pair.parent, child: pair.child });
  }
  fixedMutations.push(...runMutationControls(browser, fixture, { parent: reactPair.parent, child: reactPair.child }));

  const seededResults = [];
  for (const item of seededInputs) {
    const backendProfiles = {};
    for (const kind of ["react", "dom", "swap"]) backendProfiles[kind] = browser.profiles.seeded[`seed-${item.seed}-${kind}`];
    assertSeededReplay({
      native: seededNative[item.seed].trace,
      directProfiles: seededDirect[item.seed],
      browserProfiles: backendProfiles,
      fixture: item.scenario,
      modulePairs,
      seed: item.seed,
    });
    const seedItem = seedSummary.find((row) => row.seed === item.seed);
    seedItem.browserProfiles = ["react", "dom", "swap"];
    seedItem.browserMounted = true;
    seedItem.status = "matched";
    seededResults.push({ seed: item.seed, status: "matched", events: item.scenario.events.length,
      nativeGoUpdates: seededNative[item.seed].trace.steps.length, browserProfiles: ["react", "dom", "swap"] });
  }
  await writeJSON(`${prefix}.seeded.summary.json`, seedSummary);

  const summary = {
    schema: "gobi.compiled-modules-conformance/v1",
    status: "matched",
    fixture: fixture.name,
    fixedEventCount: fixture.events.length,
    fixedGoUpdates: fixedNative.trace.steps.length,
    fixedStateCheckpoints: fixedNative.trace.steps.length + 1,
    browserProfiles: ["react", "dom", "swap", ...seededInputs.flatMap(({ seed }) => ["react", "dom", "swap"].map((kind) => `seed-${seed}-${kind}`))],
    browserProfileCount: 3 + seededInputs.length * 3,
    seededSeeds: [...DEFAULT_SEEDS],
    seededEventsPerSeed: SEEDED_EVENT_COUNT,
    seededRuns: seededResults,
    mutationControls: fixedMutations,
    mutationControlsDetected: fixedMutations.length,
    nativeTraceSHA256: fixedNative.traceSHA256,
    browserBundleSHA256: browser.browserBundle.sha256,
    pageErrors: browser.pageErrors,
  };
  await writeJSON(`${prefix}.check.json`, summary);
  await writeJSON(`${prefix}.run.json`, {
    schema: "gobi.compiled-modules-conformance-run/v1",
    command: process.argv.slice(0, 2).concat(process.argv.slice(2)),
    versions: { node: process.version, browser: browser.browser, playwright: browser.playwright },
    fixture: { path: args.fixture, name: fixture.name, events: fixture.events.length },
    expectations: { path: args.expectations, schema: expectations.schema },
    nativeGo: args["native-go"],
    builds: {
      react: { parentABI: reactPair.parent.descriptor.abiSHA256, childABI: reactPair.child.descriptor.abiSHA256 },
      dom: { parentABI: domPair.parent.descriptor.abiSHA256, childABI: domPair.child.descriptor.abiSHA256 },
    },
    nativeCapture: { command: fixedNative.command, tracePath: fixedNative.tracePath, traceSHA256: fixedNative.traceSHA256 },
    seedCaptures: Object.fromEntries(DEFAULT_SEEDS.map((seed) => [seed, {
      nativeTracePath: seededNative[seed].tracePath,
      nativeTraceSHA256: seededNative[seed].traceSHA256,
      nativeGoUpdates: seededNative[seed].trace.steps.length,
    }])),
    directCaptures: { fixedPath: `${prefix}.fixed.direct.json`, seededPath: `${prefix}.seeded.direct.json` },
    browserCapturePath: `${prefix}.browser.json`,
    summary,
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch(async (error) => {
  const argv = process.argv.slice(2);
  const outputIndex = argv.indexOf("--output");
  const output = outputIndex >= 0 ? argv[outputIndex + 1] ?? null : null;
  process.stderr.write(`${error?.stack ?? error}\n`);
  if (output) {
    try { await writeJSON(`${resolve(output)}.failed.json`, { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null }); }
    catch { /* keep the original failure */ }
  }
  process.exitCode = 1;
});
