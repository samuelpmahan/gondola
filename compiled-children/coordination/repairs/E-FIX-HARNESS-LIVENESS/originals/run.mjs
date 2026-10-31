import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { runChildrenBrowserConformance } from "./browser.mjs";
import { checkChildrenConformance, checkSeededChildrenReplay } from "./check.mjs";
import { replayChildrenDirect } from "./direct.mjs";
import { DEFAULT_SEEDS, generateSeededChildrenScenario } from "./seeded.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const stamp = () => new Date().toISOString();

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`unexpected argument ${key}`);
    if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw new Error(`missing value for ${key}`);
    if (values.has(key)) throw new Error(`duplicate argument ${key}`);
    values.set(key, argv[++index]);
  }
  const required = ["--native-go", "--fixture", "--expectations", "--react-manifest", "--dom-manifest", "--output"];
  for (const key of required) if (!values.has(key)) throw new Error(`missing ${key} <path>`);
  const args = Object.fromEntries([...values].map(([key, value]) => {
    const name = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (name === "nativeGo" && !isAbsolute(value) && (value.includes("/") || value.includes("\\"))) {
      return [name, resolve(value)];
    }
    return [name, value];
  }));
  for (const key of ["fixture", "expectations", "reactManifest", "domManifest", "output"]) args[key] = resolve(args[key]);
  if (args.chromium) args.chromium = resolve(args.chromium);
  return args;
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialize(value), "utf8");
}

function resolveNativeExecutable(value) {
  if (isAbsolute(value)) return resolve(value);
  if (value.includes("/") || value.includes("\\")) return resolve(value);
  return value;
}

function manifestPaths(manifest, manifestPath, backend, fixture) {
  if (manifest?.schema !== "gobi.build-manifest/v1" || !Array.isArray(manifest.apps) || manifest.apps.length !== 1) {
    throw new TypeError(`${backend} manifest must be gobi.build-manifest/v1 with exactly one app`);
  }
  const app = manifest.apps[0];
  assertExactTraceValue(backend, app.backend, `$.${backend}.manifest.backend`);
  assertExactTraceValue(fixture.componentID, app.componentId, `$.${backend}.manifest.componentId`);
  assertExactTraceValue(fixture.packagePath, app.packagePath, `$.${backend}.manifest.packagePath`);
  const outputRoot = dirname(resolve(manifestPath));
  return {
    backend,
    componentId: app.componentId,
    packagePath: app.packagePath,
    appIR: resolve(outputRoot, app.appIR),
    compiled: resolve(outputRoot, app.module),
    helpers: resolve(outputRoot, app.encoder),
    manifest: resolve(manifestPath),
  };
}

function runCommand(command, args, { cwd = ROOT, env = {} } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  if (result.error || result.status !== 0) {
    const error = new Error(`${command} ${args.join(" ")} failed (exit ${result.status ?? "spawn-error"}): ${result.stderr || result.error?.message || "no stderr"}`);
    error.command = [command, ...args];
    error.stdout = result.stdout ?? "";
    error.stderr = result.stderr ?? "";
    throw error;
  }
  return { command: [command, ...args], stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function runNative(nativeGo, fixturePath) {
  const executable = resolveNativeExecutable(nativeGo);
  const command = [executable, "run", "./cmd/compiled-children-native", "--script", fixturePath];
  const result = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
  });
  if (result.error || result.status !== 0) {
    const error = new Error(`native Go child replay failed (exit ${result.status ?? "spawn-error"}): ${result.stderr || result.error?.message || "no stderr"}`);
    error.command = command;
    error.stdout = result.stdout ?? "";
    error.stderr = result.stderr ?? "";
    throw error;
  }
  try {
    return { value: JSON.parse(result.stdout), command, stdout: result.stdout, stderr: result.stderr ?? "" };
  } catch (cause) {
    const error = new Error(`native Go child replay did not return one JSON value: ${cause.message}`);
    error.command = command;
    error.stdout = result.stdout ?? "";
    error.stderr = result.stderr ?? "";
    throw error;
  }
}

async function importBuild(paths) {
  const [appIR, module, helpers] = await Promise.all([
    readJSON(paths.appIR),
    import(pathToFileURL(paths.compiled).href),
    import(pathToFileURL(paths.helpers).href),
  ]);
  if (module?.gobiCompiled?.schema !== "gobi.compiled-module/v1") {
    throw new TypeError(`${paths.backend} emitted module must export gobiCompiled/v1`);
  }
  assertExactTraceValue(appIR, module.gobiCompiled.appIR, `$.${paths.backend}.compiled.appIR`);
  return {
    ...paths,
    appIRPath: paths.appIR,
    helperPath: paths.helpers,
    appIR,
    module: module.gobiCompiled,
    helpers,
  };
}

async function walkFiles(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const paths = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (["node_modules", ".git", "evidence", "build", "builds", "custody"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walkFiles(path));
    else if (entry.isFile() && [".mjs", ".js", ".json", ".go", ".md"].includes(extname(entry.name))) paths.push(path);
  }
  return paths;
}

async function pins(paths) {
  const result = [];
  for (const path of [...new Set(paths.map((item) => resolve(item)))].sort()) {
    const bytes = await readFile(path);
    result.push({ path: relative(ROOT, path).replaceAll("\\", "/"), sha256: hash(bytes), bytes: bytes.length });
  }
  return result;
}

async function gzipEvidence(sourcePath, destinationPath) {
  await mkdir(dirname(destinationPath), { recursive: true });
  await pipeline(
    createReadStream(sourcePath),
    createGzip({ level: 6 }),
    createWriteStream(destinationPath, { flags: "wx" }),
  );
  const [sourceBytes, archiveBytes] = await Promise.all([readFile(sourcePath), readFile(destinationPath)]);
  return {
    source: displayPath(sourcePath),
    path: displayPath(destinationPath),
    compression: "gzip",
    sourceSha256: hash(sourceBytes),
    sourceBytes: sourceBytes.length,
    archiveSha256: hash(archiveBytes),
    archiveBytes: archiveBytes.length,
  };
}

async function inputSourcePaths({ fixture, expectations, builds }) {
  const dirs = [
    "compiled-children/conformance",
    "compiled-children/runtime",
    "compiled-children/oracle",
    "fixtures/compiled/children",
    "cmd/compiled-children-native",
    "counter",
    "gobi",
    "compilercontract",
    "compiled-frontend/conformance",
    "compiled-frontend/frontend/runtime",
    "compiled-frontend/frontend/react",
    "compiled-frontend/frontend/dom",
  ];
  const selected = [fixture, expectations];
  for (const build of Object.values(builds)) {
    selected.push(build.manifest, build.appIRPath, build.compiled, build.helperPath);
  }
  const code = (await Promise.all(dirs.map((dir) => walkFiles(resolve(ROOT, dir)))).then((groups) => groups.flat()));
  return [...new Set([...code, ...selected])];
}

function displayPath(path) {
  return relative(ROOT, path).replaceAll("\\", "/") || ".";
}

async function ensureFreshOutput(outputStem) {
  try {
    await access(`${outputStem}.run.json`);
    throw new Error(`refusing to overwrite existing N4 attempt ${outputStem}.run.json`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(outputStem), { recursive: true });
}

async function runConformance(args) {
  const outputStem = resolve(args.output);
  await ensureFreshOutput(outputStem);
  const outputs = {
    native: `${outputStem}.native.json`,
    directReact: `${outputStem}.direct.react.json`,
    directDom: `${outputStem}.direct.dom.json`,
    browser: `${outputStem}.browser.json`,
    check: `${outputStem}.check.json`,
    seeded: `${outputStem}.seeded.json`,
    unitTestStdout: `${outputStem}.unit-tests.stdout.log`,
    unitTestStderr: `${outputStem}.unit-tests.stderr.log`,
    run: `${outputStem}.run.json`,
    manifest: `${outputStem}.manifest.json`,
    failure: `${outputStem}.failed.json`,
  };
  const run = {
    schema: "gobi.compiled-children-conformance-run/v1",
    status: "running",
    startedAt: stamp(),
    command: [process.execPath, ...process.argv.slice(1)],
    node: process.version,
    inputs: {
      fixture: resolve(args.fixture),
      expectations: resolve(args.expectations),
      reactManifest: resolve(args.reactManifest),
      domManifest: resolve(args.domManifest),
      nativeGo: resolveNativeExecutable(args.nativeGo),
      chromium: args.chromium ?? process.env.CHROMIUM_PATH ?? null,
    },
    outputPaths: outputs,
    stages: [],
    failures: [],
  };
  await writeJSON(outputs.run, run);
  const errors = [];
  let sourcePaths = [];
  let sourcePinsBefore = null;
  let outputPinsBeforeCheck = null;
  let fixture = null;
  let expectations = null;
  let react = null;
  let dom = null;
  let native = null;
  let directReact = null;
  let directDom = null;
  let browser = null;
  let check = null;
  const seededResults = [];
  const commandRecords = [];

  async function stage(name, work) {
    const item = { name, status: "running", startedAt: stamp() };
    run.stages.push(item);
    await writeJSON(outputs.run, run);
    try {
      const result = await work();
      item.status = "completed";
      item.finishedAt = stamp();
      return result;
    } catch (error) {
      item.status = "failed";
      item.finishedAt = stamp();
      item.error = { name: error.name ?? "Error", message: String(error.message ?? error) };
      errors.push(error);
      return null;
    } finally {
      await writeJSON(outputs.run, run);
    }
  }

  await stage("frozen-script-oracle-and-build-manifests", async () => {
    [fixture, expectations] = await Promise.all([readJSON(args.fixture), readJSON(args.expectations)]);
    assertExactTraceValue(fixture.name, expectations.scenario?.name, "$.expectations.scenario.name");
    assertExactTraceValue(fixture.packagePath, expectations.scenario?.packagePath, "$.expectations.scenario.packagePath");
    const [reactManifest, domManifest] = await Promise.all([readJSON(args.reactManifest), readJSON(args.domManifest)]);
    const [reactPaths, domPaths] = [
      manifestPaths(reactManifest, args.reactManifest, "react", fixture),
      manifestPaths(domManifest, args.domManifest, "dom", fixture),
    ];
    [react, dom] = await Promise.all([importBuild(reactPaths), importBuild(domPaths)]);
    assertExactTraceValue(react.appIR, dom.appIR, "$.reactDom.appIR");
    const goVersion = runCommand(resolveNativeExecutable(args.nativeGo), ["version"], {
      env: { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
    });
    run.goVersion = goVersion.stdout.trim();
    commandRecords.push({ name: "native-go-version", command: goVersion.command, exitCode: 0 });
    run.builds = {
      react: { manifest: react.manifest, appIR: react.appIRPath, compiled: react.compiled, helpers: react.helperPath },
      dom: { manifest: dom.manifest, appIR: dom.appIRPath, compiled: dom.compiled, helpers: dom.helperPath },
    };
    sourcePaths = await inputSourcePaths({ fixture: args.fixture, expectations: args.expectations, builds: { react, dom } });
    sourcePinsBefore = await pins(sourcePaths);
    run.sourcePinsBefore = sourcePinsBefore;
    return true;
  });

  if (errors.length === 0) {
    await stage("conformance-checker-and-seeded-unit-tests", async () => {
      const testPaths = [
        "compiled-children/conformance/check.test.mjs",
        "compiled-children/conformance/seeded.test.mjs",
      ];
      let result;
      try {
        result = runCommand(process.execPath, ["--test", ...testPaths]);
      } catch (error) {
        await Promise.all([
          writeFile(outputs.unitTestStdout, error.stdout ?? "", "utf8"),
          writeFile(outputs.unitTestStderr, error.stderr ?? "", "utf8"),
        ]);
        throw error;
      }
      await Promise.all([
        writeFile(outputs.unitTestStdout, result.stdout, "utf8"),
        writeFile(outputs.unitTestStderr, result.stderr, "utf8"),
      ]);
      const tap = Object.fromEntries([...result.stdout.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)]
        .map((match) => [match[1], Number(match[2])]));
      if (!Number.isSafeInteger(tap.tests) || tap.tests < 1 || tap.pass !== tap.tests ||
          tap.fail !== 0 || tap.cancelled !== 0 || tap.skipped !== 0 || tap.todo !== 0) {
        throw new Error(`checker and seeded tests did not report a clean TAP summary: ${JSON.stringify(tap)}`);
      }
      run.unitTests = {
        status: "passed",
        command: result.command,
        tap,
        stdout: displayPath(outputs.unitTestStdout),
        stderr: displayPath(outputs.unitTestStderr),
      };
      commandRecords.push({ name: "checker-and-seeded-unit-tests", command: result.command, exitCode: 0, tap });
      return run.unitTests;
    });
  }

  if (errors.length === 0) {
    const result = await stage("native-go-script-replay", async () => {
      const capture = runNative(args.nativeGo, args.fixture);
      native = capture.value;
      commandRecords.push({ name: "native-fixed", command: capture.command, exitCode: 0 });
      run.nativeCommand = capture.command;
      run.nativeGoStderr = capture.stderr;
      await Promise.all([
        writeJSON(outputs.native, native),
        writeFile(`${outputStem}.native.stdout.log`, capture.stdout, "utf8"),
        writeFile(`${outputStem}.native.stderr.log`, capture.stderr, "utf8"),
      ]);
      return native;
    });
    if (result === null && errors.length === 0) errors.push(new Error("native replay failed without a recorded stage error"));
  }

  if (errors.length === 0) {
    await stage("direct-react-and-dom-emitted-module-replay", async () => {
      directReact = replayChildrenDirect({ compiled: react.module, helpers: react.helpers, fixture, label: "direct-react" });
      directDom = replayChildrenDirect({ compiled: dom.module, helpers: dom.helpers, fixture, label: "direct-dom" });
      await Promise.all([writeJSON(outputs.directReact, directReact), writeJSON(outputs.directDom, directDom)]);
      return true;
    });
  }

  if (errors.length === 0) {
    await stage("mounted-react-dom-and-compatible-swap-browser-replay", async () => {
      browser = await runChildrenBrowserConformance({
        reactCompiled: react.compiled,
        reactHelpers: react.helperPath,
        domCompiled: dom.compiled,
        domHelpers: dom.helperPath,
        fixturePath: args.fixture,
        expectationsPath: args.expectations,
        outputPrefix: outputStem,
        chromiumPath: args.chromium ?? process.env.CHROMIUM_PATH,
      });
      run.browser = { version: browser.browser, playwright: browser.playwright, noWasm: browser.noWasm };
      await writeJSON(outputs.browser, browser);
      return true;
    });
  }

  if (errors.length === 0) {
    await stage("independent-literal-capture-check-and-mutation-controls", async () => {
      outputPinsBeforeCheck = await pins([react.manifest, react.appIRPath, react.compiled, react.helperPath,
        dom.manifest, dom.appIRPath, dom.compiled, dom.helperPath]);
      check = checkChildrenConformance({
        native, directReact, directDom, browser, fixture, expectations,
        reactAppIR: react.appIR, domAppIR: dom.appIR,
      });
      run.buildOutputPinsBeforeCheck = outputPinsBeforeCheck;
      return check;
    });
  }

  if (errors.length === 0) {
    await stage("seeded-bounded-native-direct-and-browser-replays", async () => {
      const seeds = DEFAULT_SEEDS;
      const representativeSeed = seeds[0];
      for (const seed of seeds) {
        const generated = generateSeededChildrenScenario(seed);
        const scenarioPath = `${outputStem}.seed-${seed}.scenario.json`;
        await writeJSON(scenarioPath, generated.scenario);
        const nativeCapture = runNative(args.nativeGo, scenarioPath);
        const seedNativePath = `${outputStem}.seed-${seed}.native.json`;
        await Promise.all([
          writeJSON(seedNativePath, nativeCapture.value),
          writeFile(`${outputStem}.seed-${seed}.native.stdout.log`, nativeCapture.stdout, "utf8"),
          writeFile(`${outputStem}.seed-${seed}.native.stderr.log`, nativeCapture.stderr, "utf8"),
        ]);
        commandRecords.push({ name: `native-seed-${seed}`, command: nativeCapture.command, exitCode: 0 });
        const directSeedReact = replayChildrenDirect({ compiled: react.module, helpers: react.helpers, fixture: generated.scenario, label: `seed-${seed}-react` });
        const directSeedDom = replayChildrenDirect({ compiled: dom.module, helpers: dom.helpers, fixture: generated.scenario, label: `seed-${seed}-dom` });
        const directReactPath = `${outputStem}.seed-${seed}.direct.react.json`;
        const directDomPath = `${outputStem}.seed-${seed}.direct.dom.json`;
        await Promise.all([writeJSON(directReactPath, directSeedReact), writeJSON(directDomPath, directSeedDom)]);
        let seedBrowser = null;
        if (seed === representativeSeed) {
          const noExtraOracle = `${outputStem}.seed-${seed}.expectations.json`;
          await writeJSON(noExtraOracle, { schema: "gobi.compiled-children-seeded-no-extra-probes/v1", probes: {} });
          seedBrowser = await runChildrenBrowserConformance({
            reactCompiled: react.compiled,
            reactHelpers: react.helperPath,
            domCompiled: dom.compiled,
            domHelpers: dom.helperPath,
            fixturePath: scenarioPath,
            expectationsPath: noExtraOracle,
            outputPrefix: `${outputStem}.seed-${seed}`,
            profileKinds: ["swap"],
            chromiumPath: args.chromium ?? process.env.CHROMIUM_PATH,
          });
          await writeJSON(`${outputStem}.seed-${seed}.browser.json`, seedBrowser);
        }
        const summary = checkSeededChildrenReplay({
          native: nativeCapture.value,
          directReact: directSeedReact,
          directDom: directSeedDom,
          browser: seedBrowser,
          fixture: generated.scenario,
          seed,
          appIR: react.appIR,
        });
        const record = {
          ...summary,
          metadata: generated.metadata,
          outputs: {
            scenario: scenarioPath,
            native: seedNativePath,
            directReact: directReactPath,
            directDom: directDomPath,
            browser: seedBrowser ? `${outputStem}.seed-${seed}.browser.json` : null,
          },
        };
        seededResults.push(record);
      }
      await writeJSON(outputs.seeded, { schema: "gobi.compiled-children-seeded-replays/v1", results: seededResults });
      check.seededRuns = { count: seededResults.length, seeds: seededResults.map((item) => item.seed) };
      await writeJSON(outputs.check, check);
      return seededResults;
    });
  }

  if (errors.length === 0) {
    await stage("source-and-build-output-stability", async () => {
      run.sourcePinsAfter = await pins(sourcePaths);
      run.sourcesStable = JSON.stringify(sourcePinsBefore) === JSON.stringify(run.sourcePinsAfter);
      const outputPaths = [react.manifest, react.appIRPath, react.compiled, react.helperPath,
        dom.manifest, dom.appIRPath, dom.compiled, dom.helperPath];
      run.buildOutputPinsAfterCheck = await pins(outputPaths);
      run.buildOutputsStable = JSON.stringify(outputPinsBeforeCheck) === JSON.stringify(run.buildOutputPinsAfterCheck);
      if (!run.sourcesStable || !run.buildOutputsStable) {
        throw new Error("harness, fixture, oracle, runtime, or build inputs changed during N4 evidence capture");
      }
      return true;
    });
  }

  run.finishedAt = stamp();
  run.status = errors.length === 0 && check?.status === "matched" ? "matched" : "rejected";
  run.summary = check;
  run.commands = commandRecords;
  if (errors.length > 0) {
    run.failures = errors.map((error) => ({
      name: error.name ?? "Error",
      message: String(error.message ?? error),
      command: error.command ?? null,
    }));
    await writeJSON(outputs.failure, { schema: "gobi.compiled-children-conformance-failure/v1", failures: run.failures, stages: run.stages });
  }

  const evidencePaths = [outputs.native, outputs.directReact, outputs.directDom, outputs.browser,
    outputs.check, outputs.seeded, outputs.unitTestStdout, outputs.unitTestStderr, outputs.failure, `${outputStem}.browser.capture.json`,
    `${outputStem}.browser.failed.json`];
  const evidencePins = [];
  for (const path of evidencePaths) {
    try {
      await access(path);
      const bytes = await readFile(path);
      evidencePins.push({ path, sha256: hash(bytes), bytes: bytes.length });
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  run.evidencePins = evidencePins;
  await writeJSON(outputs.manifest, {
    schema: "gobi.compiled-children-conformance-manifest/v1",
    status: run.status,
    outputPaths: outputs,
    sourcePins: { before: sourcePinsBefore, after: run.sourcePinsAfter ?? null },
    buildOutputPins: { beforeCheck: outputPinsBeforeCheck, afterCheck: run.buildOutputPinsAfterCheck ?? null },
    evidencePins,
    browser: browser ? { version: browser.browser, playwright: browser.playwright, noWasm: browser.noWasm } : null,
  });
  await writeJSON(outputs.run, run);

  await writeCanonicalArtifacts({ args, run, check, outputs, seededResults, errors, evidencePins });
  const summary = {
    schema: "gobi.compiled-children-conformance-check/v1",
    status: run.status,
    fixture: check?.fixture ?? fixture?.name ?? null,
    events: check?.events ?? fixture?.events?.length ?? null,
    ticks: check?.stateCheckpoints ?? null,
    swaps: check?.swaps ?? null,
    mutationControlsDetected: check?.mutationControlsDetected ?? 0,
    seededRuns: { count: seededResults.length, seeds: seededResults.map((item) => item.seed) },
    outputPaths: outputs,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (run.status !== "matched") process.exitCode = 1;
  return { run, check, summary };
}

async function writeCanonicalArtifacts({ args, run, check, outputs, seededResults, errors, evidencePins }) {
  const reportPath = resolve(ROOT, "compiled-children/coordination/reports/E-HARNESS.md");
  const receiptPath = resolve(ROOT, "compiled-children/coordination/receipts/E-HARNESS.json");
  const rawLogRoot = resolve(ROOT, "compiled-children/coordination/rawlogs");
  await Promise.all([mkdir(dirname(reportPath), { recursive: true }), mkdir(dirname(receiptPath), { recursive: true }), mkdir(rawLogRoot, { recursive: true })]);
  const attemptStamp = new Date().toISOString().replaceAll(":", "").replaceAll("-", "");
  const rawLogDir = resolve(rawLogRoot, `E-HARNESS-${attemptStamp}-${process.pid}`);
  await mkdir(rawLogDir, { recursive: false });
  const rawLogPath = resolve(rawLogDir, "trace-index.json");
  const traceArtifacts = [];
  for (const key of ["native", "directReact", "directDom", "browser", "check", "seeded", "unitTestStdout", "unitTestStderr", "run", "manifest", "failure"]) {
    const sourcePath = outputs[key];
    try {
      await access(sourcePath);
      const stem = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      traceArtifacts.push(await gzipEvidence(sourcePath, resolve(rawLogDir, `${stem}${extname(sourcePath)}.gz`)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const outcome = run.status === "matched" ? "mixed_change" : "insufficient_evidence";
  const summary = run.status === "matched"
    ? `Matched ${check.events} source events and ${check.goUpdates} Go updates across native Go, direct React/DOM compiled modules, and three mounted browser profiles; detected ${check.mutationControlsDetected} captured-data mutations; ran ${seededResults.length} bounded seeded schedules.`
    : `N4 conformance did not match; ${errors.length} failure(s) are recorded in the run receipt and raw evidence.`;
  const receipt = {
    schema: "gobi.compiled-children-execution/v1",
    job_id: "E-HARNESS",
    worker: "N4",
    outcome,
    status: run.status,
    summary,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    invocation: run.command,
    versions: {
      node: run.node,
      go: run.goVersion ?? null,
      chromium: run.browser?.version ?? null,
      playwright: run.browser?.playwright ?? null,
    },
    inputs: run.inputs,
    inputPinScope: "Hashes the consumed fixture, literal oracle core, harness/runtime/frontend code, Go fixture/native CLI, and emitted build inputs before and after replay. Oracle custody repair artifacts are separately owned and are excluded because this harness does not import or execute them.",
    commands: run.commands,
    unitTests: run.unitTests ?? null,
    outputs: Object.fromEntries(Object.entries(outputs).map(([key, path]) => [key, displayPath(path)])),
    seeds: seededResults.map(({ seed, events, goUpdates, stateTreeDomParity, metadata }) => ({
      seed, events, goUpdates, stateTreeDomParity, metadata,
    })),
    mismatches: errors.map((error) => ({ stage: error.stage ?? null, message: String(error.message ?? error) })),
    failures: run.failures ?? [],
    evidencePins,
    traceArtifacts,
    rawLog: { path: displayPath(rawLogPath), traceDirectory: displayPath(rawLogDir) },
    exactCommands: [
      `${resolveNativeExecutable(args.nativeGo)} run ./cmd/compiled-children-native --script ${displayPath(args.fixture)}`,
      `${process.execPath} ${displayPath(resolve(ROOT, "compiled-children/conformance/run.mjs"))} ${process.argv.slice(2).join(" ")}`,
    ],
    limitations: ["Seeded sequences are bounded differential replays and do not claim universal behavior coverage."],
  };
  const report = [
    "# E-HARNESS — compiled keyed children conformance",
    "",
    `Outcome: **${outcome}** (${run.status}).`,
    "",
    summary,
    "",
    "## Evidence",
    "",
    `- Fixed fixture: ${displayPath(args.fixture)} (${check?.events ?? "unavailable"} source events).`,
    `- Literal expectations: ${displayPath(args.expectations)}; native/direct/browser checks are compared against all typed state fields, complete Gobi view trees, and captured DOM.`,
    `- Seeds: ${seededResults.map((item) => item.seed).join(", ") || "none"}; the first seed also ran through the mounted browser renderer swap.`,
    `- Versions: Node ${run.node}; ${run.goVersion ?? "Go version unavailable"}; Chromium ${run.browser?.version ?? "unavailable"}; Playwright ${run.browser?.playwright ?? "unavailable"}.`,
    `- Inputs stable during capture: source=${run.sourcesStable === true}, buildOutputs=${run.buildOutputsStable === true}.`,
    "- Pin scope: consumed fixture/oracle core, harness, runtime/frontend, Go fixture/native CLI, and emitted build inputs; separately owned `oracle/custody/` artifacts are not imported or pinned by this harness.",
    `- Checker and seeded unit tests: ${run.unitTests?.tap.pass ?? 0}/${run.unitTests?.tap.tests ?? 0} passed using Node 22.`,
    `- Captured-data mutation controls detected: ${check?.mutationControlsDetected ?? 0}.`,
    `- Compressed raw traces: ${displayPath(rawLogDir)} (${traceArtifacts.map((item) => `${item.path} ${item.archiveSha256}`).join(", ")}).`,
    `- Run record: ${displayPath(outputs.run)}.`,
    `- Raw browser/native/direct evidence prefix: ${displayPath(args.output)}.`,
    "",
    "## Commands and failures",
    "",
    ...receipt.commands.map((item) => `- ${item.name}: \`${item.command.join(" ")}\`.`),
    `- Harness invocation: \`${process.execPath} ${displayPath(resolve(ROOT, "compiled-children/conformance/run.mjs"))} ${process.argv.slice(2).join(" ")}\`.`,
    ...(errors.length ? errors.map((error) => `- Failure: ${String(error.message ?? error)}`) : ["- Failures: none in this attempt."]),
    "",
    "Seeded traces are finite deterministic samples. They check native/direct parity and one mounted browser sample; the N5 literal oracle remains the fixed-script authority.",
    "",
  ].join("\n");
  await Promise.all([
    writeJSON(receiptPath, receipt),
    writeFile(reportPath, report, "utf8"),
    writeJSON(rawLogPath, {
      schema: "gobi.compiled-children-harness-rawlog/v1",
      run: displayPath(outputs.run),
      summary: check,
      seeds: receipt.seeds,
      failures: receipt.failures,
      mismatches: receipt.mismatches,
      commands: receipt.commands,
      unitTests: receipt.unitTests,
      evidencePins,
      traceArtifacts,
    }),
  ]);
}

async function main() {
  await runConformance(parseArgs(process.argv.slice(2)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}

export { parseArgs, runNative, runConformance };
