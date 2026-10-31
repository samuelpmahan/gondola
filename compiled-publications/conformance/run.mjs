import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { runPublicationsBrowserConformance } from "./browser.mjs";
import { checkPublicationsConformance, checkSeededPublicationsReplay } from "./check.mjs";
import { replayPublicationsDirect } from "./direct.mjs";
import { DEFAULT_SEEDS, generateSeededPublicationsScenario } from "./seeded.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
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
  const result = Object.fromEntries([...values].map(([key, value]) => [key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
  for (const key of ["fixture", "expectations", "reactManifest", "domManifest", "output"]) result[key] = resolve(result[key]);
  if (result.chromium) result.chromium = resolve(result.chromium);
  if (isAbsolute(result.nativeGo) || result.nativeGo.includes("/") || result.nativeGo.includes("\\")) result.nativeGo = resolve(result.nativeGo);
  return result;
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, jsonText(value), "utf8");
}

async function ensureFresh(stem) {
  try {
    await access(`${stem}.run.json`);
    throw new Error(`refusing to overwrite existing E-HARNESS capture ${stem}.run.json`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(stem), { recursive: true });
}

function executable(value) {
  return isAbsolute(value) || value.includes("/") || value.includes("\\") ? resolve(value) : value;
}

function runProcess(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, ...(options.env ?? {}) },
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

function runNative(go, fixturePath) {
  const command = executable(go);
  const args = ["run", "./cmd/compiled-publications-native", "--script", resolve(fixturePath)];
  const result = runProcess(command, args, { env: { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" } });
  try {
    return { value: JSON.parse(result.stdout), command: result.command, stdout: result.stdout, stderr: result.stderr };
  } catch (cause) {
    const error = new Error(`native publications replay did not emit JSON: ${cause.message}`);
    error.command = result.command;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }
}

function manifestPaths(manifest, manifestPath, backend, fixture) {
  assertExactTraceValue("gobi.build-manifest/v1", manifest?.schema, `$.${backend}.manifest.schema`);
  if (!Array.isArray(manifest.apps) || manifest.apps.length !== 1) throw new TypeError(`${backend} manifest must contain one app`);
  const app = manifest.apps[0];
  assertExactTraceValue(backend, app.backend, `$.${backend}.manifest.backend`);
  assertExactTraceValue(fixture.componentID, app.componentId, `$.${backend}.manifest.componentId`);
  assertExactTraceValue(fixture.packagePath, app.packagePath, `$.${backend}.manifest.packagePath`);
  const base = dirname(resolve(manifestPath));
  return {
    backend,
    componentId: app.componentId,
    manifest: resolve(manifestPath),
    appIRPath: resolve(base, app.appIR),
    compiledPath: resolve(base, app.module),
    helperPath: resolve(base, app.encoder),
  };
}

async function importBuild(paths) {
  const [appIR, compiledModule, helpers] = await Promise.all([
    readJSON(paths.appIRPath),
    import(pathToFileURL(paths.compiledPath).href),
    import(pathToFileURL(paths.helperPath).href),
  ]);
  if (compiledModule?.gobiCompiled?.schema !== "gobi.compiled-module/v1") throw new TypeError(`${paths.backend} output is not a compiled Go module`);
  assertExactTraceValue(appIR, compiledModule.gobiCompiled.appIR, `$.${paths.backend}.module.appIR`);
  const component = appIR.components?.find((item) => item.id === paths.componentId);
  const requiredCapabilities = ["view.node", "effect.request-reply", "effect.cancel"];
  for (const capability of requiredCapabilities) {
    if (!component?.capabilities?.includes(capability)) {
      throw new Error(`${paths.backend} AppIR is missing required host capability ${capability}`);
    }
  }
  return { ...paths, appIR, compiled: compiledModule.gobiCompiled, helpers };
}

async function pin(path) {
  const bytes = await readFile(path);
  return { path: resolve(path), sha256: hash(bytes), bytes: bytes.length };
}

async function captureNativeOutput(stem, label, capture) {
  await Promise.all([
    writeJSON(`${stem}.${label}.native.json`, capture.value),
    writeFile(`${stem}.${label}.native.stdout.log`, capture.stdout, "utf8"),
    writeFile(`${stem}.${label}.native.stderr.log`, capture.stderr, "utf8"),
  ]);
}

async function runConformance(args) {
  const stem = args.output;
  await ensureFresh(stem);
  const outputs = {
    native: `${stem}.native.json`,
    directReact: `${stem}.direct.react.json`,
    directDom: `${stem}.direct.dom.json`,
    browser: `${stem}.browser.capture.json`,
    check: `${stem}.check.json`,
    seeded: `${stem}.seeded.json`,
    run: `${stem}.run.json`,
    failed: `${stem}.failed.json`,
  };
  const run = {
    schema: "gobi.compiled-publications-conformance-run/v1",
    status: "running",
    startedAt: stamp(),
    command: [process.execPath, ...process.argv.slice(1)],
    node: process.version,
    inputs: {
      nativeGo: executable(args.nativeGo),
      fixture: args.fixture,
      expectations: args.expectations,
      reactManifest: args.reactManifest,
      domManifest: args.domManifest,
      chromium: args.chromium ?? process.env.CHROMIUM_PATH ?? null,
    },
    outputPaths: outputs,
    stages: [],
    failures: [],
    commands: [],
  };
  await writeJSON(outputs.run, run);
  let fixture;
  let expectations;
  let react;
  let dom;
  let native;
  let directReact;
  let directDom;
  let browser;
  let check;
  const seeded = [];
  let activeStage = "load-frozen-inputs";
  const stage = async (name, work) => {
    activeStage = name;
    const item = { name, status: "running", startedAt: stamp() };
    run.stages.push(item);
    await writeJSON(outputs.run, run);
    try {
      const result = await work();
      item.status = "complete";
      item.finishedAt = stamp();
      return result;
    } catch (error) {
      item.status = "failed";
      item.finishedAt = stamp();
      item.error = { name: error?.name ?? "Error", message: String(error?.message ?? error) };
      throw error;
    } finally {
      await writeJSON(outputs.run, run);
    }
  };

  try {
    [fixture, expectations] = await Promise.all([readJSON(args.fixture), readJSON(args.expectations)]);
    assertExactTraceValue(fixture.name, expectations.scenario?.name, "$.expectations.scenario.name");
    assertExactTraceValue(fixture.packagePath, expectations.scenario?.packagePath, "$.expectations.scenario.packagePath");
    await stage("load-frozen-inputs-and-builds", async () => {
      const [reactManifest, domManifest] = await Promise.all([readJSON(args.reactManifest), readJSON(args.domManifest)]);
      [react, dom] = await Promise.all([
        importBuild(manifestPaths(reactManifest, args.reactManifest, "react", fixture)),
        importBuild(manifestPaths(domManifest, args.domManifest, "dom", fixture)),
      ]);
      assertExactTraceValue(react.appIR, dom.appIR, "$.reactDom.appIR");
      run.builds = {
        react: { manifest: react.manifest, appIR: react.appIRPath, module: react.compiledPath, encoder: react.helperPath },
        dom: { manifest: dom.manifest, appIR: dom.appIRPath, module: dom.compiledPath, encoder: dom.helperPath },
      };
      run.buildPinsBefore = await Promise.all([react.manifest, react.appIRPath, react.compiledPath, react.helperPath,
        dom.manifest, dom.appIRPath, dom.compiledPath, dom.helperPath].map(pin));
      return true;
    });
    const version = runProcess(executable(args.nativeGo), ["version"], { env: { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" } });
    run.goVersion = version.stdout.trim();
    run.commands.push({ name: "go-version", command: version.command, exitCode: 0 });

    await stage("fixed-native-replay", async () => {
      const capture = runNative(args.nativeGo, args.fixture);
      native = capture.value;
      run.commands.push({ name: "native-fixed", command: capture.command, exitCode: 0 });
      await captureNativeOutput(stem, "fixed", capture);
      await writeJSON(outputs.native, native);
      return true;
    });

    await stage("fixed-direct-react-and-dom-replay", async () => {
      directReact = replayPublicationsDirect({ compiled: react.compiled, helpers: react.helpers, fixture, label: "fixed-react" });
      directDom = replayPublicationsDirect({ compiled: dom.compiled, helpers: dom.helpers, fixture, label: "fixed-dom" });
      await Promise.all([writeJSON(outputs.directReact, directReact), writeJSON(outputs.directDom, directDom)]);
      return true;
    });

    await stage("fixed-mounted-react-dom-and-swap-replay", async () => {
      browser = await runPublicationsBrowserConformance({
        reactCompiled: react.compiledPath,
        reactHelpers: react.helperPath,
        domCompiled: dom.compiledPath,
        domHelpers: dom.helperPath,
        fixturePath: args.fixture,
        expectationsPath: args.expectations,
        outputPrefix: stem,
        chromiumPath: args.chromium ?? process.env.CHROMIUM_PATH,
      });
      run.browser = { version: browser.browser, playwright: browser.playwright, noWasm: browser.noWasm };
      return true;
    });

    await stage("literal-state-tree-dom-check-and-capture-mutations", async () => {
      check = checkPublicationsConformance({
        native, directReact, directDom, browser, fixture, expectations,
        reactAppIR: react.appIR, domAppIR: dom.appIR,
      });
      await writeJSON(outputs.check, check);
      return check;
    });

    await stage("seeded-native-direct-and-representative-browser-replays", async () => {
      for (const seed of DEFAULT_SEEDS) {
        const generated = generateSeededPublicationsScenario(seed);
        const scenarioPath = `${stem}.seed-${seed}.scenario.json`;
        await writeJSON(scenarioPath, generated.scenario);
        const nativeCapture = runNative(args.nativeGo, scenarioPath);
        run.commands.push({ name: `native-seed-${seed}`, command: nativeCapture.command, exitCode: 0 });
        await captureNativeOutput(stem, `seed-${seed}`, nativeCapture);
        const directSeedReact = replayPublicationsDirect({ compiled: react.compiled, helpers: react.helpers, fixture: generated.scenario, label: `seed-${seed}-react` });
        const directSeedDom = replayPublicationsDirect({ compiled: dom.compiled, helpers: dom.helpers, fixture: generated.scenario, label: `seed-${seed}-dom` });
        const nativePath = `${stem}.seed-${seed}.native.json`;
        const directReactPath = `${stem}.seed-${seed}.direct.react.json`;
        const directDomPath = `${stem}.seed-${seed}.direct.dom.json`;
        await Promise.all([
          writeJSON(nativePath, nativeCapture.value),
          writeJSON(directReactPath, directSeedReact),
          writeJSON(directDomPath, directSeedDom),
        ]);
        let seedBrowser = null;
        if (seed === DEFAULT_SEEDS[0]) {
          const noExtraProbePath = `${stem}.seed-${seed}.expectations.json`;
          await writeJSON(noExtraProbePath, { schema: "gobi.compiled-publications-seeded-no-extra-probes/v1", probes: {} });
          seedBrowser = await runPublicationsBrowserConformance({
            reactCompiled: react.compiledPath,
            reactHelpers: react.helperPath,
            domCompiled: dom.compiledPath,
            domHelpers: dom.helperPath,
            fixturePath: scenarioPath,
            expectationsPath: noExtraProbePath,
            outputPrefix: `${stem}.seed-${seed}`,
            profileKinds: ["swap"],
            chromiumPath: args.chromium ?? process.env.CHROMIUM_PATH,
          });
        }
        const summary = checkSeededPublicationsReplay({
          native: nativeCapture.value,
          directReact: directSeedReact,
          directDom: directSeedDom,
          browser: seedBrowser,
          fixture: generated.scenario,
          seed,
          appIR: react.appIR,
        });
        seeded.push({
          ...summary,
          metadata: generated.metadata,
          outputs: {
            scenario: scenarioPath,
            native: nativePath,
            directReact: directReactPath,
            directDom: directDomPath,
            browser: seedBrowser ? `${stem}.seed-${seed}.browser.capture.json` : null,
          },
        });
      }
      const seededRecord = { schema: "gobi.compiled-publications-seeded-replays/v1", results: seeded };
      await writeJSON(outputs.seeded, seededRecord);
      check.seededRuns = { count: seeded.length, seeds: seeded.map((item) => item.seed), mountedBrowserSeed: DEFAULT_SEEDS[0] };
      await writeJSON(outputs.check, check);
      return seededRecord;
    });

    await stage("source-and-build-stability", async () => {
      const buildPaths = [react.manifest, react.appIRPath, react.compiledPath, react.helperPath,
        dom.manifest, dom.appIRPath, dom.compiledPath, dom.helperPath];
      run.buildPinsAfter = await Promise.all(buildPaths.map(pin));
      assertExactTraceValue(run.buildPinsBefore, run.buildPinsAfter, "$.buildOutputPins");
      return true;
    });
    run.status = "matched";
    run.summary = check;
  } catch (error) {
    run.status = "rejected";
    run.failures.push({
      stage: activeStage,
      name: error?.name ?? "Error",
      message: String(error?.message ?? error),
      command: error?.command ?? null,
      stdout: error?.stdout ?? null,
      stderr: error?.stderr ?? null,
      stack: error?.stack ?? null,
    });
    await writeJSON(outputs.failed, { schema: "gobi.compiled-publications-conformance-failure/v1", failures: run.failures, stages: run.stages });
  }
  run.finishedAt = stamp();
  run.commands = run.commands ?? [];
  run.evidencePins = [];
  const evidencePaths = [outputs.native, outputs.directReact, outputs.directDom, outputs.browser, outputs.check, outputs.seeded,
    `${stem}.fixed.native.stdout.log`, `${stem}.fixed.native.stderr.log`,
    `${stem}.browser.failed.json`, outputs.failed];
  for (const path of evidencePaths) {
    try { run.evidencePins.push(await pin(path)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  await writeJSON(outputs.run, run);
  const summary = {
    schema: "gobi.compiled-publications-conformance-summary/v1",
    status: run.status,
    fixture: fixture?.name ?? null,
    fixedEvents: check?.events ?? fixture?.events?.length ?? null,
    fixedGoUpdates: check?.goUpdates ?? native?.steps?.length ?? null,
    fixedStateCheckpoints: check?.stateCheckpoints ?? null,
    browserProfiles: check?.browserProfiles ?? browser?.profilesRun ?? [],
    seededRuns: { count: seeded.length, seeds: seeded.map((item) => item.seed), mountedBrowserSeed: seeded.find((item) => item.mountedBrowser)?.seed ?? null },
    mutationControlsDetected: check?.mutationControlsDetected ?? 0,
    outputPaths: outputs,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (run.status !== "matched") process.exitCode = 1;
  return { run, check, summary };
}

const args = parseArgs(process.argv.slice(2));
await runConformance(args);
