#!/usr/bin/env node
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { access, appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createInterface } from "node:readline";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { runAdversarial } from "./adversarial.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const BUILD_DIR = resolve(HERE, "build");
const WASM = resolve(BUILD_DIR, "keyed-collection.wasm");
const WASM_EXEC = resolve(BUILD_DIR, "wasm_exec.js");
const REACT_BUNDLE = resolve(BUILD_DIR, "react.bundle.mjs");
const REFERENCE_BUNDLE = resolve(BUILD_DIR, "reference.bundle.mjs");
const LAB_BINARY = resolve(BUILD_DIR, "http-lab");
const INHERITED_LAB_BINARY = resolve(REPO_ROOT, "http-effects/build/http-lab");
const requireFromInteraction = createRequire(resolve(REPO_ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

function parseSeeds(value) {
  const pieces = String(value).split(",");
  if (pieces.length === 0 || pieces.some((piece) => piece.trim() === "")) {
    throw new RangeError("seeds must be comma-separated unsigned 32-bit integers");
  }
  const seeds = pieces.map((piece) => Number(piece.trim()));
  if (new Set(seeds).size !== seeds.length || seeds.some((seed) =>
    !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff)) {
    throw new RangeError("seeds must be unique unsigned 32-bit integers");
  }
  return seeds;
}

function parseArgs(argv) {
  const options = { seeds: [20261030, 20261031], cases: 30, maxActions: 40, output: null, headed: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--seeds" || arg === "--seed") options.seeds = parseSeeds(argv[++index]);
    else if (arg === "--cases") options.cases = Number(argv[++index]);
    else if (arg === "--max-actions") options.maxActions = Number(argv[++index]);
    else if (arg === "--output") options.output = resolve(argv[++index]);
    else if (arg === "--headed") options.headed = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown option ${arg}`);
  }
  if (!Number.isInteger(options.cases) || options.cases < 0) throw new RangeError("--cases must be non-negative");
  if (!Number.isInteger(options.maxActions) || options.maxActions < 1 || options.maxActions > 40) {
    throw new RangeError("--max-actions must be from 1 through 40");
  }
  return options;
}

function usage() {
  return [
    "Usage: node keyed-editor/check.mjs [options]",
    "  --seeds A,B       deterministic unsigned 32-bit seeds (default 20261030,20261031)",
    "  --seed N          run one deterministic seed",
    "  --cases N         generated scripts per seed (default 30)",
    "  --max-actions N   maximum actions per generated script, 1..40 (default 40)",
    "  --output PATH     JSON report path (default keyed-editor/build/keyed-editor-traces-seeds-A-B.json)",
    "  --headed          show Chromium while running",
  ].join("\n");
}

const own = (value) => value === undefined ? null : value;
const canonical = (value) => JSON.stringify(value);

/** Compare every semantic channel of one mounted actor against the reference. */
function compareObservations(actual, expected, { compareFocus = false } = {}) {
  const mismatches = [];
  for (const field of ["state", "tree", "bindings", "messages"]) {
    if (!isDeepStrictEqual(actual?.snapshot?.[field], expected?.snapshot?.[field])) {
      mismatches.push({ field, expected: own(expected?.snapshot?.[field]), actual: own(actual?.snapshot?.[field]) });
    }
  }
  for (const field of ["audit", "transportLog", "serverRequests", "pending"]) {
    if (!isDeepStrictEqual(actual?.[field], expected?.[field])) {
      mismatches.push({ field, expected: own(expected?.[field]), actual: own(actual?.[field]) });
    }
  }
  for (const field of [
    "html", "root", "disabled", "inputPath", "inputValue", "inputDisabled", "controls", "order",
    "reportedHTML", "reportedDisabled",
  ]) {
    if (!isDeepStrictEqual(actual?.dom?.[field], expected?.dom?.[field])) {
      mismatches.push({ field: `dom.${field}`, expected: own(expected?.dom?.[field]), actual: own(actual?.dom?.[field]) });
    }
  }
  if (compareFocus && !isDeepStrictEqual(actual?.focus, expected?.focus)) {
    mismatches.push({ field: "focus", expected: own(expected?.focus), actual: own(actual?.focus) });
  }
  for (const [label, observation] of [["actual", actual], ["expected", expected]]) {
    if (observation?.dom?.reportedHTML !== undefined &&
        !isDeepStrictEqual(observation.dom.reportedHTML, observation.dom.html)) {
      mismatches.push({
        field: `${label}.dom.reportedHTML`, expected: own(observation.dom.html), actual: observation.dom.reportedHTML,
      });
    }
    if (observation?.dom?.reportedDisabled !== undefined &&
        !isDeepStrictEqual(observation.dom.reportedDisabled, observation.dom.disabled)) {
      mismatches.push({
        field: `${label}.dom.reportedDisabled`, expected: own(observation.dom.disabled), actual: observation.dom.reportedDisabled,
      });
    }
  }
  return mismatches;
}

function nativeStep(action, actualValue = undefined, resolvedStep = {}) {
  if (!action) return { Path: "", Event: "", Value: "" };
  const step = action.step ?? action.resolvedStep ?? resolvedStep;
  if (action.kind === "fill") return {
    Path: step.Path ?? action.Path ?? action.path ?? "",
    Event: step.Event ?? "input",
    Value: actualValue ?? action.value ?? step.Value ?? "",
  };
  if (action.kind === "click") return {
    Path: step.Path ?? action.Path ?? action.path ?? "",
    Event: step.Event ?? "click",
    Value: step.Value ?? "",
  };
  if (action.kind === "add" || action.kind === "reset") return {
    Path: step.Path ?? (action.kind === "add" ? "0" : "1"),
    Event: "click",
    Value: step.Value ?? "",
  };
  if (action.kind === "raw-dispatch") return {
    Path: action.step?.Path ?? "",
    Event: action.step?.Event ?? "",
    Value: action.step?.Value ?? "",
  };
  if (action.kind === "detached-input") return {
    Path: step.Path ?? "",
    Event: "input",
    Value: action.value ?? "",
  };
  if (action.kind === "focus") return {
    Path: step.Path ?? "",
    Event: "focus",
    Value: "",
  };
  if (action.kind === "swap") return { Path: "", Event: `backend:${action.backend}`, Value: action.host };
  if (action.kind === "mode") return { Path: "", Event: `mode:${action.mode}`, Value: "" };
  if (action.kind === "release") return { Path: "", Event: `release:${action.mode ?? "success"}`, Value: String(action.id) };
  return { Path: "", Event: String(action.kind ?? ""), Value: "" };
}

function nativeTick(index, step, observation) {
  return {
    Index: index,
    Step: step ?? { Path: "", Event: "", Value: "" },
    State: canonical(observation.snapshot.state),
    Tree: canonical(observation.snapshot.tree),
    DOM: observation.dom.root,
    Pixels: "",
    Mutations: 0,
    Bindings: canonical(observation.snapshot.bindings),
    Messages: canonical(observation.snapshot.messages),
    InputValue: observation.dom.inputValue,
    Disabled: canonical(observation.dom.controls),
    ServerRequests: canonical(observation.serverRequests),
    Transport: canonical(observation.transportLog),
    Audit: canonical(observation.audit),
  };
}

/** Native SameDOM comparison is a required gate, never an optional enhancement. */
function requireNativeComparison(result) {
  if (!result || result.status !== "matched" || !Array.isArray(result.scenarios) || result.scenarios.length === 0) {
    throw new Error(`native CompareInteraction is required and must match; got ${result?.status ?? "missing"}`);
  }
  return result;
}

function compareEveryTick(result, seeds) {
  const mismatches = [];
  for (const scenario of result.scenarios ?? []) {
    if (scenario.executionError || scenario.disposeError) {
      mismatches.push({ seed: scenario.seed ?? seeds[0], script: scenario.name, tick: null, candidate: "browser", field: "execution", actual: scenario.executionError ?? scenario.disposeError });
    }
    if (scenario.ticks.length !== scenario.actions.length + 1) {
      mismatches.push({ seed: scenario.seed ?? seeds[0], script: scenario.name, tick: null, candidate: "browser", field: "tick-count", expected: scenario.actions.length + 1, actual: scenario.ticks.length });
    }
    for (const failure of scenario.actorErrors ?? []) {
      mismatches.push({
        seed: scenario.seed ?? seeds[0], script: scenario.name, tick: null, candidate: failure.participant,
        field: "actor-action", actual: { action: failure.action, error: failure.error },
      });
    }
    let explicitFocusObserved = false;
    for (const tick of scenario.ticks) {
      if (tick.action?.kind === "focus") explicitFocusObserved = true;
      const observedLanes = ["dom", "react", "reference"].map((participant) => tick.observations?.[participant]?.serverLane);
      if (observedLanes.some((lane) => typeof lane !== "string") || new Set(observedLanes).size !== 3) {
        mismatches.push({
          seed: scenario.seed ?? seeds[0], script: scenario.name, tick: tick.index, candidate: "http-lab",
          field: "unique-lanes", expected: 3, actual: observedLanes,
        });
      }
      for (const candidate of ["dom", "react"]) {
        for (const difference of compareObservations(
          tick.observations?.[candidate], tick.observations?.reference, { compareFocus: explicitFocusObserved },
        )) {
          mismatches.push({ seed: scenario.seed ?? seeds[0], script: scenario.name, tick: tick.index, candidate, ...difference });
        }
      }
      for (const difference of compareObservations(
        tick.observations?.dom, tick.observations?.react, { compareFocus: explicitFocusObserved },
      )) {
        mismatches.push({ seed: scenario.seed ?? seeds[0], script: scenario.name, tick: tick.index, candidate: "go-dom-vs-react", ...difference });
      }
    }
  }
  for (const error of [...(result.goErrors ?? []), ...(result.pageErrors ?? [])]) {
    mismatches.push({ seed: seeds[0], script: "browser", tick: null, candidate: null, field: "global-error", actual: error });
  }
  const adversarial = result.adversarial ?? {};
  const expected = adversarial.moduleExpectedProbeNames ?? adversarial.expectedProbeNames ?? [];
  const observed = (adversarial.probes ?? []).map(({ name }) => name);
  const duplicates = observed.filter((name, index) => observed.indexOf(name) !== index);
  const missing = expected.filter((name) => !observed.includes(name));
  const unexpected = observed.filter((name) => !expected.includes(name));
  if (adversarial.error || adversarial.ok !== true || missing.length || duplicates.length || unexpected.length) {
    mismatches.push({
      seed: seeds[0], script: "adversarial", tick: null, candidate: "E5", field: "required-probes",
      expected, actual: { ok: adversarial.ok, observed, missing, duplicates, unexpected, error: adversarial.error ?? adversarial.validationError },
    });
  }
  for (const probe of adversarial.probes ?? []) {
    if (probe.pass !== true) mismatches.push({
      seed: seeds[0], script: "adversarial", tick: null, candidate: "real-go", field: `probe.${probe.name}`, expected: true, actual: probe,
    });
  }
  return mismatches;
}

async function requireBuildInputs() {
  for (const file of [WASM, WASM_EXEC, REACT_BUNDLE, REFERENCE_BUNDLE]) {
    try { await stat(file); }
    catch { throw new Error(`missing ${file}; run the keyed-editor build gates first`); }
  }
  try { await access(resolve(REPO_ROOT, "interaction/node_modules/playwright")); }
  catch { throw new Error("missing pinned Playwright dependency under interaction/node_modules"); }
}

function commandCandidates() {
  return [process.env.GO_BIN, "/tmp/gondola-go/bin/go", "go"].filter(Boolean);
}

async function executableCommand(candidate) {
  if (isAbsolute(candidate) || candidate.includes("/") || candidate.includes("\\")) {
    const absolute = resolve(candidate);
    try { await access(absolute, fsConstants.X_OK); return absolute; }
    catch { return null; }
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const absolute = resolve(directory || ".", candidate);
    try { await access(absolute, fsConstants.X_OK); return candidate; }
    catch { /* continue searching PATH */ }
  }
  return null;
}

async function selectGoCommand(candidates = commandCandidates()) {
  for (const candidate of candidates) {
    const executable = await executableCommand(candidate);
    if (executable) return executable;
  }
  throw new Error(`no executable Go command found among ${candidates.join(", ")}`);
}

async function startLabServer({ readyTimeoutMs = 30_000 } = {}) {
  if (!Number.isSafeInteger(readyTimeoutMs) || readyTimeoutMs < 1) {
    throw new RangeError("readyTimeoutMs must be a positive safe integer");
  }
  const configuredLab = process.env.HTTP_LAB_BIN ? resolve(process.env.HTTP_LAB_BIN) : LAB_BINARY;
  let command = null;
  let args = null;
  for (const candidate of [...new Set([configuredLab, INHERITED_LAB_BINARY])]) {
    try {
      await access(candidate, fsConstants.X_OK);
      command = candidate;
      args = ["-addr", "127.0.0.1:0", "-root", REPO_ROOT];
      break;
    } catch { /* try the inherited lab binary before the Go fallback */ }
  }
  if (!command) {
    command = await selectGoCommand();
    args = ["run", "./cmd/http-lab", "-addr", "127.0.0.1:0", "-root", REPO_ROOT];
  }
  let child;
  try {
    child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "local" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`could not start HTTP lab server: ${error.message}`);
  }
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  let timeout;
  const ready = new Promise((resolveReady, rejectReady) => {
    let settled = false;
    const clearReadyTimer = () => {
      if (timeout) clearTimeout(timeout);
      timeout = null;
    };
    const fail = (message) => {
      if (settled) return;
      settled = true;
      clearReadyTimer();
      rejectReady(new Error(`${message}${stderr ? `\n${stderr}` : ""}`));
    };
    child.once("error", (error) => fail(`could not start HTTP lab server: ${error.message}`));
    child.once("exit", (code, signal) => fail(`HTTP lab server exited before readiness (code=${code}, signal=${signal})`));
    lines.on("line", (line) => {
      let payload;
      try { payload = JSON.parse(line); }
      catch { return fail(`HTTP lab server wrote invalid readiness JSON: ${line}`); }
      if (typeof payload.url !== "string" || !payload.url.startsWith("http://127.0.0.1:")) {
        return fail(`HTTP lab readiness URL is invalid: ${JSON.stringify(payload)}`);
      }
      if (settled) return;
      settled = true;
      clearReadyTimer();
      resolveReady({ child, url: payload.url.replace(/\/$/, "") });
    });
    timeout = setTimeout(() => fail(`timed out waiting for HTTP lab readiness after ${readyTimeoutMs}ms`), readyTimeoutMs);
  });
  try {
    const server = await ready;
    return { ...server, binary: command };
  } catch (error) {
    lines.close();
    await stopLabServer(child);
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    timeout = null;
  }
}

function waitForChildClose(child, milliseconds) {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return Promise.resolve(true);
  return new Promise((resolveClosed) => {
    const finish = (closed) => {
      clearTimeout(timeout);
      child.off("close", onClose);
      resolveClosed(closed);
    };
    const onClose = () => finish(true);
    const timeout = setTimeout(() => finish(false), milliseconds);
    child.once("close", onClose);
  });
}

async function stopLabServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const graceful = waitForChildClose(child, 5_000);
  try { child.kill("SIGTERM"); } catch { /* the process may have exited between the check and signal */ }
  if (await graceful) return;
  const forced = waitForChildClose(child, 5_000);
  try { child.kill("SIGKILL"); } catch { /* preserve cleanup and the original startup failure */ }
  await forced;
}

function withTimeout(promise, milliseconds, description) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${description} exceeded ${milliseconds}ms`)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runBrowser(scripts, { headed = false, onProgress = null } = {}) {
  const server = await startLabServer();
  console.log(`[keyed-editor] HTTP lab ready: ${server.url}`);
  let browser;
  const scenarios = [];
  const pageErrors = [];
  const consoleEvents = [];
  const apiResponses = [];
  const requestFailures = [];
  let versions = null;
  let contexts = [];
  try {
    browser = await chromium.launch({
      headless: !headed,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    });
    console.log(`[keyed-editor] Chromium ${browser.version()} launched; isolating the three participants`);
    // Chromium's same-origin HTTP/1 pool has six connections per page. Isolate
    // each participant so held requests cannot starve another actor's release
    // or server-record GET, while preserving one real shared lab instance.
    const participants = ["dom", "react", "reference"];
    const pages = {};
    for (const participant of participants) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      pages[participant] = page;
      page.on("pageerror", (error) => pageErrors.push(`${participant}: ${String(error?.stack ?? error)}`));
      page.on("console", (message) => {
        if (message.type() === "error") consoleEvents.push({ participant, text: message.text(), location: message.location() });
      });
      page.on("response", (response) => {
        const url = new URL(response.url());
        if (!url.pathname.startsWith("/api/")) return;
        apiResponses.push({
          participant,
          method: response.request().method(),
          url: response.url(),
          status: response.status(),
          lane: url.searchParams.get("lane"),
          mode: url.searchParams.get("mode"),
          id: url.searchParams.get("id") === null ? null : Number(url.searchParams.get("id")),
        });
      });
      page.on("requestfailed", (request) => {
        const url = new URL(request.url());
        if (!url.pathname.startsWith("/api/")) return;
        requestFailures.push({
          participant,
          method: request.method(),
          url: request.url(),
          lane: url.searchParams.get("lane"),
          mode: url.searchParams.get("mode"),
          id: url.searchParams.get("id") === null ? null : Number(url.searchParams.get("id")),
          failure: request.failure()?.errorText ?? "unknown network failure",
        });
      });
      page.setDefaultNavigationTimeout(30_000);
      page.setDefaultTimeout(30_000);
      await page.goto(`${server.url}/keyed-editor/harness.html`, { waitUntil: "load" });
      try {
        await page.waitForFunction(() => window.__keyedHarness?.readyPromise || window.__keyedInitError, null, { timeout: 30_000 });
      } catch (error) {
        const state = await page.evaluate(() => ({
          harness: Boolean(window.__keyedHarness),
          initError: window.__keyedInitError ?? null,
          title: document.title,
          fixtureHTML: document.querySelector("#fixture")?.innerHTML ?? "",
        }));
        throw new Error(`keyed browser fixture did not initialize for ${participant}: ${String(error?.message ?? error)}; state=${JSON.stringify(state)}; pageErrors=${JSON.stringify(pageErrors)}`);
      }
      await withTimeout(page.evaluate(async () => {
        if (window.__keyedInitError) throw new Error(window.__keyedInitError);
        await window.__keyedHarness.readyPromise;
      }), 30_000, `${participant} harness readiness`);
      console.log(`[keyed-editor] ${participant} context ready`);
      if (onProgress) await onProgress({ phase: "actor-ready", participant });
    }
    versions = await pages.reference.evaluate(() => window.__keyedHarness.versions());
    if (versions.react !== "19.3.1" || versions.reactDOM !== "19.3.1") {
      throw new Error(`expected React and ReactDOM 19.3.1, got ${JSON.stringify(versions)}`);
    }

    for (const [scriptIndex, script] of scripts.entries()) {
      console.log(`[keyed-editor] scenario ${scriptIndex + 1}/${scripts.length}: ${script.name}`);
      const scenario = {
        name: script.name,
        seed: script.seed ?? null,
        actions: structuredClone(script.actions),
        ticks: [],
        nativeTicks: [],
        actorErrors: [],
      };
      try {
        for (const participant of participants) {
          await withTimeout(pages[participant].evaluate(async ({ index, name, participantName, url }) => {
            await window.__keyedHarness.createActor({ index, name, participant: participantName, serverURL: url });
          }, { index: scriptIndex, name: script.name, participantName: participant, url: server.url }), 20_000, `${script.name} ${participant} actor creation`);
        }

        const capture = async () => {
          const entries = await Promise.all(participants.map(async (participant) => [
            participant,
            await withTimeout(pages[participant].evaluate(() => window.__keyedHarness.capture()), 20_000, `${script.name} ${participant} capture`),
          ]));
          return Object.fromEntries(entries);
        };
        const record = async (action = null, step = null) => {
          const observations = await capture();
          const index = scenario.ticks.length;
          scenario.ticks.push({
            index,
            kind: action?.kind ?? "initial",
            action: action ? structuredClone(action) : null,
            step: step ? structuredClone(step) : null,
            observations: structuredClone(observations),
          });
          const nativeStepValue = index === 0 ? null : nativeStep(action, undefined, step);
          const native = Object.fromEntries(participants.map((participant) => [
            participant,
            nativeTick(index, nativeStepValue, observations[participant]),
          ]));
          scenario.nativeTicks.push(native);
          if (onProgress) await onProgress({ phase: "tick", scriptIndex, script: script.name, tick: scenario.ticks.at(-1) });
        };

        await record();
        for (const action of script.actions) {
          const results = await Promise.all(participants.map(async (participant) => {
            try {
              const result = await withTimeout(
                pages[participant].evaluate((value) => window.__keyedHarness.apply(value), action),
                30_000,
                `${script.name} ${participant} action ${action.kind}`,
              );
              return { participant, result };
            } catch (error) {
              const failure = { participant, action: structuredClone(action), error: String(error?.stack ?? error) };
              scenario.actorErrors.push(failure);
              return { participant, error: failure.error };
            }
          }));
          const resolvedStep = results.find(({ participant }) => participant === "reference")?.result?.step ?? {};
          const step = action.kind === "raw-dispatch" ? action.step : nativeStep(action, undefined, resolvedStep);
          await record(action, step);
        }
      } catch (error) {
        scenario.executionError = String(error?.stack ?? error);
      } finally {
        try {
          for (const participant of participants) {
            await pages[participant].evaluate(() => window.__keyedHarness.disposeActor());
          }
        } catch (error) {
          scenario.disposeError = String(error?.stack ?? error);
        }
      }
      scenarios.push(scenario);
      console.log(`[keyed-editor] scenario ${script.name}: ${scenario.ticks.length} ticks${scenario.actorErrors.length ? `; ${scenario.actorErrors.length} actor errors` : ""}`);
      if (onProgress) await onProgress({ phase: "scenario-complete", scriptIndex, scenario: structuredClone(scenario) });
    }

    let adversarial;
    try { adversarial = await withTimeout(runAdversarial(pages.dom), 180_000, "real-Go adversarial browser probes"); }
    catch (error) {
      adversarial = {
        ok: false,
        error: String(error?.stack ?? error),
        probes: error?.probes ?? [],
        moduleExpectedProbeNames: [],
      };
    }
    const goErrors = [];
    for (const participant of participants) {
      const errors = await pages[participant].evaluate(() => structuredClone(window.__keyedHarness.errors ?? []));
      goErrors.push(...errors.map((error) => `${participant}: ${error}`));
    }
    const applicationConsoleErrors = consoleEvents.filter(({ location }) => {
      try { return !new URL(location?.url ?? "about:blank").pathname.startsWith("/api/"); }
      catch { return true; }
    });
    pageErrors.push(...applicationConsoleErrors.map(({ participant, text }) => `${participant}: console.error: ${text}`));
    return {
      scenarios,
      adversarial,
      goErrors,
      pageErrors,
      consoleEvents,
      apiResponses,
      requestFailures,
      versions,
      browserVersion: browser.version(),
      serverBinary: server.binary,
      browserContexts: participants.length,
    };
  } finally {
    for (const context of contexts) {
      try { await context.close(); } catch { /* preserve the first failure */ }
    }
    if (browser) await browser.close();
    await stopLabServer(server.child);
  }
}

async function buildNativeComparator(reportDir) {
  if (process.env.GO_COMPARE_BIN) {
    const file = resolve(process.env.GO_COMPARE_BIN);
    try { await access(file, fsConstants.X_OK); return { status: "ready", file, args: [] }; }
    catch (error) { return { status: "error", error: `GO_COMPARE_BIN is not executable: ${error.message}` }; }
  }
  await mkdir(reportDir, { recursive: true });
  const file = resolve(reportDir, "compare-interaction.local");
  let last = null;
  for (const go of commandCandidates()) {
    if (go !== "go") {
      try { await access(go, fsConstants.X_OK); } catch { continue; }
    }
    const built = spawnSync(go, ["build", "-o", file, "./cmd/compare-interaction"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "local" },
      maxBuffer: 8 * 1024 * 1024,
    });
    if (!built.error && built.status === 0) return { status: "ready", file, args: [] };
    last = built;
    if (built.error?.code !== "ENOENT") break;
  }
  if (last?.error?.code === "ENOENT") return { status: "unavailable", message: "Go and GO_COMPARE_BIN are unavailable." };
  return { status: "error", error: String(last?.error ?? last?.stderr ?? "native comparator build failed"), stderr: last?.stderr ?? "" };
}

async function compareNative(scenario, reportDir, scriptIndex, candidate, command) {
  const inputPath = resolve(reportDir, `native-input-seed-${scenario.seed ?? 0}-script-${scriptIndex}-${candidate}.json`);
  const input = {
    golden: { Implementation: "Independent React 19.3.1 keyed collection reference", Ticks: scenario.nativeTicks.map(({ reference }) => reference) },
    candidate: { Implementation: `Go collection WASM with ${candidate} renderer`, Ticks: scenario.nativeTicks.map((tick) => tick[candidate]) },
  };
  await writeFile(inputPath, JSON.stringify(input, null, 2));
  if (command.status !== "ready") return { status: command.status, inputPath, error: command.error, message: command.message, stderr: command.stderr };
  const ran = spawnSync(command.file, [...command.args, inputPath], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "local" },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (ran.error) return { status: "error", inputPath, error: String(ran.error), output: ran.stdout ?? "", stderr: ran.stderr ?? "" };
  let diff;
  try { diff = JSON.parse(ran.stdout.trim()); } catch { diff = null; }
  return {
    status: ran.status === 0 ? "matched" : "mismatch",
    inputPath,
    exitCode: ran.status,
    diff,
    stdout: ran.stdout,
    stderr: ran.stderr,
  };
}

async function addNativeComparisons(result, reportDir, command, mismatches) {
  const comparisons = [];
  for (const [scriptIndex, scenario] of result.scenarios.entries()) {
    if (scenario.nativeTicks.length === 0) {
      mismatches.push({ seed: scenario.seed ?? 0, script: scenario.name, tick: null, candidate: "native", field: "trace", actual: "no captured native ticks" });
      continue;
    }
    for (const candidate of ["dom", "react"]) {
      const comparison = await compareNative(scenario, reportDir, scriptIndex, candidate, command);
      comparisons.push({ script: scenario.name, candidate, ...comparison });
      if (comparison.status !== "matched") mismatches.push({
        seed: scenario.seed ?? 0,
        script: scenario.name,
        tick: comparison.diff?.Tick ?? null,
        candidate,
        field: comparison.diff?.Part ?? comparison.status,
        expected: comparison.diff?.Want,
        actual: comparison.diff?.Got ?? comparison.stderr ?? comparison.error ?? comparison.message,
      });
    }
  }
  const resultSet = {
    status: comparisons.length > 0 && comparisons.every((comparison) => comparison.status === "matched") ? "matched" : "failed",
    comparator: command.status,
    scenarios: comparisons,
  };
  try { requireNativeComparison(resultSet); }
  catch (error) { mismatches.push({ seed: 0, script: "native-comparator", tick: null, candidate: null, field: "required", actual: error.message }); }
  return resultSet;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const { makeScripts } = await import("./scripts.mjs");
  await requireBuildInputs();
  const scripts = makeScripts({ seeds: options.seeds, cases: options.cases, maxActions: options.maxActions });
  const reportPath = options.output ?? resolve(BUILD_DIR, `keyed-editor-traces-seeds-${options.seeds.join("-")}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  const progressPath = `${reportPath}.partial.ndjson`;
  await writeFile(progressPath, "");
  let result;
  try {
    result = await runBrowser(scripts, {
      ...options,
      onProgress: async (event) => {
        const saved = event.phase === "tick"
          ? event
          : { phase: event.phase, participant: event.participant, scriptIndex: event.scriptIndex, script: event.script, tickCount: event.scenario?.ticks?.length };
        await appendFile(progressPath, `${JSON.stringify(saved)}\n`);
      },
    });
  } catch (error) {
    const reportPath = options.output ?? resolve(BUILD_DIR, `keyed-editor-traces-seeds-${options.seeds.join("-")}.json`);
    await mkdir(dirname(reportPath), { recursive: true });
    const failure = {
      seeds: options.seeds,
      generatedCasesPerSeed: options.cases,
      maxActionsPerGeneratedCase: options.maxActions,
      invocation: options,
      runError: String(error?.stack ?? error),
      partialTrace: progressPath,
      scenarios: [],
      mismatches: [{ seed: options.seeds[0], script: "browser-setup", tick: null, candidate: null, field: "runner", actual: String(error?.message ?? error) }],
      nativeComparison: { status: "not-run", required: true },
      limits: ["Browser setup failed before a comparable actor trace could be captured."],
    };
    await writeFile(reportPath, JSON.stringify(failure, null, 2));
    console.error(`browser setup failed; diagnostic report: ${reportPath}`);
    throw error;
  }
  const mismatches = compareEveryTick(result, options.seeds);
  const expectedScenarios = scripts.length;
  if (result.scenarios.length !== expectedScenarios) mismatches.push({
    seed: options.seeds[0], script: "browser", tick: null, candidate: null, field: "scenario-count", expected: expectedScenarios, actual: result.scenarios.length,
  });
  const nativeCommand = await buildNativeComparator(dirname(reportPath));
  const nativeComparison = await addNativeComparisons(result, dirname(reportPath), nativeCommand, mismatches);
  const report = {
    seeds: options.seeds,
    generatedCasesPerSeed: options.cases,
    maxActionsPerGeneratedCase: options.maxActions,
    invocation: options,
    react: "19.3.1",
    browser: {
      name: "Chromium",
      version: result.browserVersion,
      executable: process.env.CHROMIUM_EXECUTABLE_PATH ?? "Playwright-managed",
      isolatedParticipantContexts: result.browserContexts,
    },
    versions: result.versions,
    httpLab: { binary: result.serverBinary },
    goErrors: result.goErrors,
    pageErrors: result.pageErrors,
    consoleEvents: result.consoleEvents,
    apiResponses: result.apiResponses,
    requestFailures: result.requestFailures,
    scenarios: result.scenarios,
    partialTrace: progressPath,
    adversarial: result.adversarial,
    mismatches,
    nativeComparison,
    limits: [
      "HTTP observations cover the existing loopback lab in Chromium with one participant per browser context and the recorded lane names.",
      "Focus checks use explicit focus and selection actions; no focus behavior is inferred from native pointer clicks or disabled controls.",
      "The run does not cover IME composition, concurrent browser scheduling, other browser engines, pixel equivalence, or production HTTP services.",
    ],
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  const totalTicks = result.scenarios.reduce((sum, scenario) => sum + scenario.ticks.length, 0);
  if (mismatches.length > 0) {
    console.error(`keyed collection parity failed: ${mismatches.length} mismatch(es) across ${totalTicks} observations`);
    for (const mismatch of mismatches.slice(0, 24)) {
      console.error(`seed=${mismatch.seed} script=${mismatch.script} tick=${mismatch.tick} candidate=${mismatch.candidate ?? "-"} field=${mismatch.field}`);
    }
    console.error(`full traces: ${reportPath}`);
    process.exitCode = 1;
    return;
  }
  console.log(`keyed collection parity matched ${scripts.length} scripts over ${totalTicks} initial/action observations`);
  console.log(`native CompareInteraction: ${nativeComparison.status}`);
  console.log(`full traces: ${reportPath}`);
}

export {
  addNativeComparisons,
  buildNativeComparator,
  compareEveryTick,
  compareNative,
  compareObservations,
  nativeStep,
  nativeTick,
  parseArgs,
  requireNativeComparison,
  runBrowser,
  selectGoCommand,
  startLabServer,
  stopLabServer,
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
