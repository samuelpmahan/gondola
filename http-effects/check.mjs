#!/usr/bin/env node
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const BUILD_DIR = resolve(HERE, "build");
const WASM = resolve(BUILD_DIR, "http-save.wasm");
const WASM_EXEC = resolve(BUILD_DIR, "wasm_exec.js");
const REFERENCE_BUNDLE = resolve(BUILD_DIR, "reference.bundle.mjs");
const LAB_BINARY = resolve(BUILD_DIR, "http-lab");
const requireFromInteraction = createRequire(resolve(REPO_ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

function parseSeeds(value) {
  const pieces = String(value).split(",");
  if (!pieces.length || pieces.some((piece) => piece.trim() === "")) {
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
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--seeds") options.seeds = parseSeeds(argv[++index]);
    else if (arg === "--seed") options.seeds = parseSeeds(argv[++index]);
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
    "Usage: node http-effects/check.mjs [options]",
    "  --seeds A,B       deterministic unsigned 32-bit seeds (default 20261030,20261031)",
    "  --seed N          run one deterministic seed",
    "  --cases N         generated scripts per seed (default 30)",
    "  --max-actions N   maximum actions per generated script, 1..40 (default 40)",
    "  --output PATH     JSON report path (default http-effects/build/http-effects-traces-seeds-A-B.json)",
    "  --headed          show Chromium while running",
  ].join("\n");
}

function own(value) {
  return value === undefined ? null : value;
}

/** Compare complete runtime snapshots, renderer DOM, transport order, and lab records. */
function compareObservations(actual, expected) {
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
    "html", "root", "disabled", "inputPath", "inputValue", "inputDisabled", "controlProperties",
    "reportedHTML", "reportedDisabled",
  ]) {
    if (!isDeepStrictEqual(actual?.dom?.[field], expected?.dom?.[field])) {
      mismatches.push({ field: `dom.${field}`, expected: own(expected?.dom?.[field]), actual: own(actual?.dom?.[field]) });
    }
  }
  for (const [label, observation] of [["actual", actual], ["expected", expected]]) {
    if (observation?.dom?.reportedHTML !== undefined &&
        !isDeepStrictEqual(observation.dom.reportedHTML, observation.dom.html)) {
      mismatches.push({
        field: `${label}.dom.reportedHTML`,
        expected: own(observation.dom.html),
        actual: observation.dom.reportedHTML,
      });
    }
    if (observation?.dom?.reportedDisabled !== undefined &&
        !isDeepStrictEqual(observation.dom.reportedDisabled, observation.dom.disabled)) {
      mismatches.push({
        field: `${label}.dom.reportedDisabled`,
        expected: own(observation.dom.disabled),
        actual: observation.dom.reportedDisabled,
      });
    }
  }
  return mismatches;
}

function nativeStep(action, actualValue = undefined) {
  if (!action) return { Path: "", Event: "", Value: "" };
  if (["fill", "type-char", "stale-input"].includes(action.kind)) {
    const value = actualValue ?? (action.kind === "type-char" ? action.resultingValue : action.value);
    return { Path: "0", Event: "input", Value: value ?? "" };
  }
  if (action.kind === "click") {
    const path = action.Path ?? ({ save: "3", reset: "4", cancel: "5" }[action.button] ?? "");
    return { Path: path, Event: "click", Value: "" };
  }
  if (action.kind === "swap") return { Path: "", Event: `backend:${action.backend}`, Value: action.host };
  if (action.kind === "mode") return { Path: "", Event: `mode:${action.mode}`, Value: "" };
  if (action.kind === "release") return { Path: "", Event: `release:${action.mode ?? "success"}`, Value: String(action.id) };
  return { Path: "", Event: String(action.kind ?? ""), Value: "" };
}

function canonical(value) {
  return JSON.stringify(value);
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
    InputDisabled: observation.dom.inputDisabled,
    DisabledProperties: canonical(observation.dom.controlProperties),
    Audit: canonical(observation.audit),
    Transport: canonical(observation.transportLog),
    ServerRequests: canonical(observation.serverRequests),
  };
}

function hasModeSave(script, mode) {
  let selectedMode = "success";
  let draft = "";
  for (const action of script.actions ?? []) {
    if (action.kind === "mode") selectedMode = action.mode;
    else if (action.kind === "fill") draft = action.value;
    else if (action.kind === "type") draft += action.value;
    else if (action.kind === "click" && action.button === "reset") draft = "";
    else if (action.kind === "click" && action.button === "save" && draft !== "") {
      const found = selectedMode === mode;
      selectedMode = "success";
      if (found) return true;
    }
  }
  return false;
}

function modeStarts(script) {
  let selectedMode = "success";
  let draft = "";
  let id = 0;
  const starts = [];
  for (const [index, action] of (script.actions ?? []).entries()) {
    if (action.kind === "mode") selectedMode = action.mode;
    else if (action.kind === "fill") draft = action.value;
    else if (action.kind === "type") draft += action.value;
    else if (action.kind === "click" && action.button === "reset") draft = "";
    else if (action.kind === "click" && action.button === "save" && draft !== "") {
      starts.push({ id: ++id, mode: selectedMode, index });
      selectedMode = "success";
    }
  }
  return starts;
}

/** Required adversarial routes are validated from actions, not from report labels. */
function scriptCoverage(scripts) {
  const byName = new Map(scripts.map((script) => [script.name, script]));
  const named = (name) => byName.get(name);
  const all = (predicate) => scripts.some(predicate);
  const hasMode = (mode) => all((script) => hasModeSave(script, mode));
  const heldCancel = all((script) => {
    const held = modeStarts(script).find((start) => start.mode === "held");
    if (!held) return false;
    const suffix = script.actions.slice(held.index + 1);
    const cancel = suffix.findIndex((action) => action.kind === "click" && action.button === "cancel");
    const release = suffix.findIndex((action) => action.kind === "release" && action.id === held.id);
    return cancel >= 0 && release > cancel && suffix[release].expectedStatus === 409;
  });
  const heldReset = all((script) => {
    const held = modeStarts(script).find((start) => start.mode === "held");
    if (!held) return false;
    const suffix = script.actions.slice(held.index + 1);
    const reset = suffix.findIndex((action) => action.kind === "click" && action.button === "reset");
    const release = suffix.findIndex((action) => action.kind === "release" && action.id === held.id);
    return reset >= 0 && release > reset && suffix[release].expectedStatus === 409;
  });
  const heldSwap = all((script) => {
    const held = modeStarts(script).find((start) => start.mode === "held");
    if (!held) return false;
    const suffix = script.actions.slice(held.index + 1);
    const swap = suffix.findIndex((action) => action.kind === "swap");
    const release = suffix.findIndex((action) => action.kind === "release" && action.id === held.id);
    return swap >= 0 && (release < 0 || swap < release);
  });
  const heldSuccessRelease = all((script) => {
    const held = modeStarts(script).find((start) => start.mode === "held");
    if (!held) return false;
    return script.actions.slice(held.index + 1).some((action) =>
      action.kind === "release" && action.id === held.id && action.expectedStatus === 202);
  });
  const errorThenRetry = all((script) => {
    const starts = modeStarts(script);
    const failure = starts.find((start) => start.mode === "error");
    return Boolean(failure && starts.some((start) => start.index > failure.index && start.mode === "success"));
  });
  const alternating = all((script) => {
    const buttons = (script.actions ?? []).filter((action) => action.kind === "click").map((action) => action.button);
    return buttons.join(",").includes("save,cancel,reset") && buttons.filter((button) => button === "save").length >= 2;
  });
  const coverage = {
    "http-success": Boolean(named("http-success") && hasModeSave(named("http-success"), "success")),
    "held-success-release": heldSuccessRelease,
    "held-pending-swap": heldSwap,
    "held-cancel-409": heldCancel,
    "held-reset-late-release-409": heldReset,
    "malformed-response": hasMode("malformed"),
    "wrong-id-response": hasMode("wrong-id"),
    "http-status-503": hasMode("status"),
    "server-error-retry": errorThenRetry,
    "drop-network-error": hasMode("drop"),
    "alternating-save-cancel-reset": alternating,
  };
  return coverage;
}

function requireScriptCoverage(coverage) {
  const missing = Object.entries(coverage).filter(([, covered]) => !covered).map(([name]) => name);
  if (missing.length) throw new Error(`required HTTP adversarial scripts are missing: ${missing.join(", ")}`);
  return coverage;
}

function networkURL(baseURL, path, parameters) {
  const url = new URL(path, baseURL);
  for (const [key, value] of parameters) url.searchParams.set(key, String(value));
  return url.href;
}

function expectedConsoleManifest(scripts, baseURL) {
  const manifest = [];
  for (const [scriptIndex, script] of scripts.entries()) {
    let mode = "success";
    let draft = "";
    let nextID = 0;
    const lanes = ["dom", "react", "reference"].map((participant) => `e4-${scriptIndex}-${participant}`);
    for (const action of script.actions ?? []) {
      if (action.kind === "mode") mode = action.mode;
      else if (action.kind === "fill") draft = action.value;
      else if (action.kind === "type") draft += action.value;
      else if (action.kind === "click" && action.button === "reset") draft = "";
      else if (action.kind === "click" && action.button === "save" && draft !== "") {
        const requestID = ++nextID;
        if (mode === "status" || mode === "drop") {
          for (const lane of lanes) {
            manifest.push({
              method: "POST",
              url: networkURL(baseURL, "/api/save", [["lane", lane], ["mode", mode]]),
              status: mode === "status" ? 503 : 200,
              mode,
              reason: mode === "status" ? "save-http-status" : "save-network-drop",
              script: script.name,
              requestID,
            });
          }
        }
        mode = "success";
      } else if (action.kind === "release" && action.expectedStatus === 409) {
        for (const lane of lanes) {
          manifest.push({
            method: "POST",
            url: networkURL(baseURL, "/api/release", [["lane", lane], ["id", action.id], ["mode", action.mode ?? "success"]]),
            status: 409,
            mode: action.mode ?? "success",
            reason: "release-after-cancel",
            script: script.name,
            requestID: action.id,
          });
        }
      }
    }
  }
  return manifest;
}

function classifyConsoleDiagnostics(consoleEvents, apiResponses, manifest) {
  const consumed = new Set();
  const expected = [];
  const unexpected = [];
  for (const event of consoleEvents) {
    const status = Number(event.text.match(/status of (\d{3})/)?.[1]);
    const consoleURL = event.location?.url;
    let match = null;
    let responseIndex = -1;
    if (Number.isInteger(status) && typeof consoleURL === "string" && consoleURL !== "") {
      responseIndex = apiResponses.findIndex((response, index) => {
        if (consumed.has(index) || response.status !== status || response.url !== consoleURL) return false;
        const expectedEntry = manifest.find((entry) => entry.method === response.method &&
          entry.url === response.url && entry.status === response.status);
        if (!expectedEntry) return false;
        match = expectedEntry;
        return true;
      });
    } else if (typeof consoleURL === "string" && consoleURL !== "" && /net::ERR_|failed to load resource/i.test(event.text)) {
      responseIndex = apiResponses.findIndex((response, index) => {
        if (consumed.has(index) || response.url !== consoleURL) return false;
        const expectedEntry = manifest.find((entry) => entry.method === response.method &&
          entry.url === response.url && entry.status === response.status && entry.reason === "save-network-drop");
        if (!expectedEntry) return false;
        match = expectedEntry;
        return true;
      });
      if (responseIndex >= 0 && match) match = { ...match, status: apiResponses[responseIndex].status };
    }
    if (responseIndex < 0 || !match) {
      unexpected.push(event);
      continue;
    }
    consumed.add(responseIndex);
    expected.push({
      consoleText: event.text,
      method: match.method,
      url: match.url,
      mode: match.mode,
      status: match.status ?? status,
      reason: match.reason,
      script: match.script,
      requestID: match.requestID,
    });
  }
  return { expected, unexpected };
}

function validateExpectedNetworkResponses(manifest, apiResponses) {
  const mismatches = [];
  const grouped = new Map();
  for (const expected of manifest) {
    const key = `${expected.method}\n${expected.url}\n${expected.status}`;
    const group = grouped.get(key) ?? { expected, count: 0 };
    group.count++;
    grouped.set(key, group);
  }
  for (const { expected, count } of grouped.values()) {
    const observed = apiResponses.filter((response) => response.method === expected.method && response.url === expected.url);
    if (observed.length !== count || observed.some((response) => response.status !== expected.status)) {
      mismatches.push({
        script: expected.script,
        candidate: expected.url,
        field: "network.expected-response",
        expected: { method: expected.method, url: expected.url, status: expected.status, mode: expected.mode, count },
        actual: observed,
      });
    }
  }
  return mismatches;
}

function compareEveryTick(result, seeds) {
  const mismatches = [];
  for (const scenario of result.scenarios) {
    if (!Array.isArray(scenario.ticks) || scenario.ticks.length === 0) {
      mismatches.push({ seed: scenario.seed ?? seeds[0], script: scenario.name, tick: null, candidate: "all", field: "trace", actual: "no initial/action observations" });
      continue;
    }
    for (const tick of scenario.ticks) {
      for (const candidate of ["dom", "react"]) {
        for (const difference of compareObservations(tick.observations[candidate], tick.observations.reference)) {
          mismatches.push({ seed: scenario.seed ?? seeds[0], script: scenario.name, tick: tick.index, candidate, ...difference });
        }
      }
      for (const difference of compareObservations(tick.observations.dom, tick.observations.react)) {
        mismatches.push({ seed: scenario.seed ?? seeds[0], script: scenario.name, tick: tick.index, candidate: "go-dom-vs-react", ...difference });
      }
      for (const participant of ["dom", "react", "reference"]) {
        if (tick.observations[participant]?.dom?.inputPath !== "0") {
          mismatches.push({
            seed: scenario.seed ?? seeds[0], script: scenario.name, tick: tick.index, candidate: participant,
            field: "dom.inputPath", expected: "0", actual: tick.observations[participant]?.dom?.inputPath ?? null,
          });
        }
      }
      for (const participant of ["dom", "react", "reference"]) {
        const native = tick.native[participant];
        if (!native || native.Index !== tick.index ||
            typeof native.State !== "string" || typeof native.Tree !== "string" || typeof native.DOM !== "string") {
          mismatches.push({ seed: scenario.seed ?? seeds[0], script: scenario.name, tick: tick.index, candidate: participant, field: "native.trace", expected: "complete native tick", actual: native ?? null });
        }
      }
    }
    if (scenario.executionError || scenario.disposeError) {
      mismatches.push({
        seed: scenario.seed ?? seeds[0], script: scenario.name, tick: null, candidate: "browser",
        field: "execution", actual: scenario.executionError ?? scenario.disposeError,
      });
    }
  }
  for (const error of [...(result.goErrors ?? []), ...(result.pageErrors ?? [])]) {
    mismatches.push({ seed: seeds[0], script: "browser", tick: null, candidate: null, field: "global-error", actual: error });
  }
  for (const [name, covered] of Object.entries(result.scriptCoverage ?? {})) {
    if (!covered) mismatches.push({ seed: seeds[0], script: "script-coverage", tick: null, candidate: null, field: name, expected: true, actual: false });
  }
  return mismatches;
}

async function requireBuildInputs() {
  for (const file of [WASM, WASM_EXEC, REFERENCE_BUNDLE, resolve(REPO_ROOT, "controlled-input/build/react.bundle.mjs")]) {
    try { await stat(file); } catch { throw new Error(`missing ${file}; run the HTTP effects build gates first`); }
  }
  try { await access(resolve(REPO_ROOT, "interaction/node_modules/playwright")); }
  catch { throw new Error("missing pinned Playwright dependency under interaction/node_modules"); }
}

function commandCandidates() {
  return [process.env.GO_BIN, resolve("/tmp/gondola-go/bin/go"), "go"].filter(Boolean);
}

async function startLabServer() {
  const configuredLab = process.env.HTTP_LAB_BIN ? resolve(process.env.HTTP_LAB_BIN) : LAB_BINARY;
  let command;
  let args;
  try {
    await access(configuredLab, fsConstants.X_OK);
    command = configuredLab;
    args = ["-addr", "127.0.0.1:0", "-root", REPO_ROOT];
  } catch {
    command = commandCandidates()[0];
    args = ["run", "./cmd/http-lab", "-addr", "127.0.0.1:0", "-root", REPO_ROOT];
  }

  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "local" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  let timeout;
  const ready = new Promise((resolveReady, rejectReady) => {
    const fail = (message) => rejectReady(new Error(`${message}${stderr ? `\n${stderr}` : ""}`));
    child.once("error", (error) => fail(`could not start HTTP lab server: ${error.message}`));
    child.once("exit", (code, signal) => fail(`HTTP lab server exited before readiness (code=${code}, signal=${signal})`));
    lines.on("line", (line) => {
      let payload;
      try { payload = JSON.parse(line); } catch { return fail(`HTTP lab server wrote invalid readiness JSON: ${line}`); }
      if (typeof payload.url !== "string" || !payload.url.startsWith("http://127.0.0.1:")) {
        return fail(`HTTP lab readiness URL is invalid: ${JSON.stringify(payload)}`);
      }
      clearTimeout(timeout);
      resolveReady({ child, url: payload.url.replace(/\/$/, "") });
    });
    timeout = setTimeout(() => fail("timed out waiting for HTTP lab readiness"), 30_000);
  });
  return ready.then((server) => ({ ...server, binary: command }));
}

async function stopLabServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolveClosed) => child.once("exit", resolveClosed));
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
  await closed;
  clearTimeout(timeout);
}

async function startBrowser({ headed }) {
  const browser = await chromium.launch({
    headless: !headed,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  });
  return browser;
}

async function runBrowser(scripts, { headed }) {
  const server = await startLabServer();
  let browser;
  const pageErrors = [];
  const consoleEvents = [];
  const apiResponses = [];
  const requestFailures = [];
  const scenarios = [];
  let versions = null;
  try {
    browser = await startBrowser({ headed });
    const page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleEvents.push({ text: message.text(), location: message.location() });
    });
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith("/api/")) return;
      apiResponses.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        lane: url.searchParams.get("lane"),
        mode: url.searchParams.get("mode"),
        id: url.searchParams.get("id") === null ? null : Number(url.searchParams.get("id")),
      });
    });
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return;
      requestFailures.push({
        method: request.method(),
        url: request.url(),
        lane: url.searchParams.get("lane"),
        mode: url.searchParams.get("mode"),
        id: url.searchParams.get("id") === null ? null : Number(url.searchParams.get("id")),
        failure: request.failure()?.errorText ?? "unknown network failure",
      });
    });
    await page.goto(`${server.url}/http-effects/harness.html`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__httpHarness?.readyPromise || window.__httpInitError, null, { timeout: 30_000 });
    await page.evaluate(async () => {
      if (window.__httpInitError) throw new Error(window.__httpInitError);
      await window.__httpHarness.readyPromise;
    });
    versions = await page.evaluate(() => structuredClone(window.__httpHarness.versions));
    if (versions.react !== "19.3.1" || versions.reactDOM !== "19.3.1") {
      throw new Error(`expected React and ReactDOM 19.3.1, got ${JSON.stringify(versions)}`);
    }

    for (const [scriptIndex, script] of scripts.entries()) {
      const scenario = {
        name: script.name,
        seed: script.seed ?? null,
        actions: structuredClone(script.actions),
        ticks: [],
        nativeTicks: [],
        referenceEffects: [],
        releaseResults: [],
      };
      try {
        await page.evaluate(async (meta) => window.__httpHarness.createScenario(meta), { index: scriptIndex, name: script.name });
        const record = async (action = null, step = null) => {
          const sample = await page.evaluate(() => window.__httpHarness.capture());
          const index = scenario.ticks.length;
          const native = {
            reference: nativeTick(index, index === 0 ? null : step, sample.observations.reference),
            dom: nativeTick(index, index === 0 ? null : step, sample.observations.dom),
            react: nativeTick(index, index === 0 ? null : step, sample.observations.react),
          };
          scenario.ticks.push({
            index,
            kind: action?.kind ?? "initial",
            action: action ? structuredClone(action) : null,
            step: step ? structuredClone(step) : null,
            observations: structuredClone(sample.observations),
            native: structuredClone(native),
            referenceEffects: structuredClone(sample.referenceEffects),
            releaseResults: structuredClone(sample.releaseResults),
          });
          scenario.nativeTicks.push(native);
          scenario.referenceEffects = structuredClone(sample.referenceEffects);
          scenario.releaseResults = structuredClone(sample.releaseResults);
        };
        const settle = async (marker) => page.evaluate((savedMarker) => window.__httpHarness.settleAction(savedMarker), marker);
        await record();

        for (const action of script.actions) {
          if (action.kind === "fill") {
            const marker = await page.evaluate(() => window.__httpHarness.mark());
            const rootIDs = await page.evaluate(() => window.__httpHarness.rootIDs());
            for (const participant of ["dom", "react", "reference"]) {
              await page.locator(`#${rootIDs[participant]} input`).fill(action.value);
            }
            await settle(marker);
            const step = nativeStep(action, action.value);
            await record(action, step);
            continue;
          }

          if (action.kind === "type") {
            const rootIDs = await page.evaluate(() => window.__httpHarness.rootIDs());
            const selectors = ["dom", "react", "reference"].map((participant) => `#${rootIDs[participant]} input`);
            for (const selector of selectors) {
              await page.locator(selector).evaluate((input) => {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
              });
            }
            let value = await page.locator(selectors[0]).inputValue();
            for (const character of [...action.value]) {
              const marker = await page.evaluate(() => window.__httpHarness.mark());
              for (const selector of selectors) await page.locator(selector).pressSequentially(character);
              value += character;
              await settle(marker);
              const typed = { kind: "type-char", character, resultingValue: value };
              await record(typed, nativeStep(typed));
            }
            if ([...action.value].length === 0) {
              const marker = await page.evaluate(() => window.__httpHarness.mark());
              await settle(marker);
              await record(action, nativeStep(action, value));
            }
            continue;
          }

          if (action.kind === "click") {
            const marker = await page.evaluate(() => window.__httpHarness.mark());
            const rootIDs = await page.evaluate(() => window.__httpHarness.rootIDs());
            const buttonIndex = { save: 0, reset: 1, cancel: 2 }[action.button];
            if (buttonIndex === undefined) throw new Error(`unknown async-save button ${action.button}`);
            for (const participant of ["dom", "react", "reference"]) {
              const locator = page.locator(`#${rootIDs[participant]} button`).nth(buttonIndex);
              if (await locator.isDisabled()) await locator.evaluate((button) => button.click());
              else await locator.click();
            }
            await settle(marker);
            await record(action, nativeStep(action));
            continue;
          }

          if (action.kind === "mode") {
            const marker = await page.evaluate(() => window.__httpHarness.mark());
            await page.evaluate((mode) => window.__httpHarness.setMode(mode), action.mode);
            await settle(marker);
            await record(action, nativeStep(action));
            continue;
          }

          if (action.kind === "release") {
            const marker = await page.evaluate(() => window.__httpHarness.mark());
            await page.evaluate(({ id, mode, expectedStatus }) =>
              window.__httpHarness.release(id, mode ?? "success", expectedStatus ?? 202), action);
            await settle(marker);
            await record(action, nativeStep(action));
            continue;
          }

          if (action.kind === "swap") {
            const marker = await page.evaluate(() => window.__httpHarness.mark());
            await page.evaluate((value) => window.__httpHarness.swap(value), action);
            await settle(marker);
            await record(action, nativeStep(action));
            continue;
          }

          if (action.kind === "stale-input") {
            const marker = await page.evaluate(() => window.__httpHarness.mark());
            await page.evaluate((value) => window.__httpHarness.staleInput(value), action);
            await settle(marker);
            await record(action, nativeStep(action));
            continue;
          }

          throw new Error(`unknown HTTP-effects action kind ${JSON.stringify(action.kind)}`);
        }
      } catch (error) {
        scenario.executionError = String(error?.stack ?? error);
      } finally {
        try {
          await page.evaluate(async () => window.__httpHarness.disposeScenario());
        } catch (error) {
          scenario.disposeError = String(error?.stack ?? error);
        }
      }
      scenarios.push(scenario);
    }

    const goErrors = await page.evaluate(() => structuredClone(window.__httpHarness.errors ?? []));
    const expectedManifest = expectedConsoleManifest(scripts, server.url);
    const consoleClassification = classifyConsoleDiagnostics(consoleEvents, apiResponses, expectedManifest);
    pageErrors.push(...consoleClassification.unexpected.map((event) => event.text));
    return {
      scenarios,
      goErrors,
      pageErrors,
      consoleDiagnostics: consoleClassification.expected,
      unexpectedConsoleEvents: consoleClassification.unexpected,
      expectedConsoleManifest: expectedManifest,
      apiResponses,
      requestFailures,
      versions,
    serverBinary: server.binary,
      browserVersion: browser.version(),
    };
  } finally {
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
  return { status: "error", error: String(last?.error ?? last?.stderr ?? "native compare-interaction build failed"), stderr: last?.stderr ?? "" };
}

async function compareNative(scenario, reportDir, scriptIndex, candidate, command) {
  const inputPath = resolve(reportDir, `native-input-seed-${scenario.seed ?? 0}-script-${scriptIndex}-${candidate}.json`);
  const input = {
    golden: {
      Implementation: "Independent React 19.3.1 HTTP reference",
      Ticks: scenario.nativeTicks.map(({ reference }) => reference),
    },
    candidate: {
      Implementation: `Go HTTP WASM ${candidate} candidate`,
      Ticks: scenario.nativeTicks.map((tick) => tick[candidate]),
    },
  };
  await writeFile(inputPath, JSON.stringify(input, null, 2));
  if (command.status !== "ready") return { status: command.status, inputPath, error: command.error, message: command.message, stderr: command.stderr };
  const ran = spawnSync(command.file, [...command.args, inputPath], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "local" },
    maxBuffer: 8 * 1024 * 1024,
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
    if (!scenario.nativeTicks.length) {
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
  return {
    status: comparisons.length > 0 && comparisons.every((comparison) => comparison.status === "matched") ? "matched" : "failed",
    comparator: command.status,
    scenarios: comparisons,
  };
}

/** The Go SameDOM comparator is mandatory; a missing binary is a failed gate. */
function requireNativeComparison(result) {
  if (!result || result.status !== "matched" || !Array.isArray(result.scenarios) || result.scenarios.length === 0) {
    throw new Error(`native CompareInteraction is required and must match; got ${result?.status ?? "missing"}`);
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const { DEFAULT_SEEDS, fixedScripts, seededScripts } = await import("./scripts.mjs");
  const seeds = options.seeds ?? DEFAULT_SEEDS;
  await requireBuildInputs();
  const scripts = seeds.flatMap((seed) => [
    ...fixedScripts.map((script) => ({ ...script, seed })),
    ...seededScripts(seed, { cases: options.cases, maxActions: options.maxActions }),
  ]);
  const coverage = requireScriptCoverage(scriptCoverage(scripts));
  const result = await runBrowser(scripts, options);
  const mismatches = compareEveryTick({ ...result, scriptCoverage: coverage }, seeds);
  for (const mismatch of validateExpectedNetworkResponses(result.expectedConsoleManifest, result.apiResponses)) {
    mismatches.push({ seed: seeds[0], tick: null, ...mismatch });
  }
  const reportPath = options.output ?? resolve(BUILD_DIR, `http-effects-traces-seeds-${seeds.join("-")}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  const nativeCommand = await buildNativeComparator(dirname(reportPath));
  const nativeComparison = await addNativeComparisons(result, dirname(reportPath), nativeCommand, mismatches);
  try { requireNativeComparison(nativeComparison); }
  catch (error) {
    mismatches.push({ seed: seeds[0], script: "native-comparator", tick: null, candidate: null, field: "required", actual: String(error.message) });
  }
  const report = {
    seeds,
    generatedCasesPerSeed: options.cases,
    maxActionsPerGeneratedCase: options.maxActions,
    invocation: { seeds, cases: options.cases, maxActions: options.maxActions },
    react: "19.3.1",
    browser: {
      name: "Chromium",
      version: result.browserVersion,
      executable: process.env.CHROMIUM_EXECUTABLE_PATH ?? "Playwright-managed",
    },
    versions: result.versions,
    httpLab: { binary: result.serverBinary },
    scriptCoverage: coverage,
    goErrors: result.goErrors,
    pageErrors: result.pageErrors,
    expectedConsoleManifest: result.expectedConsoleManifest,
    consoleDiagnostics: result.consoleDiagnostics,
    unexpectedConsoleEvents: result.unexpectedConsoleEvents,
    apiResponses: result.apiResponses,
    requestFailures: result.requestFailures,
    scenarios: result.scenarios,
    mismatches,
    nativeComparison,
    limits: [
      "A real AbortController cancellation closes the held HTTP response; the lab records cancelled and rejects a later release with 409. It cannot deliver a late response over the aborted socket.",
      "The HTTP checks cover this finite serialized lab behavior in the executed Chromium browser, not production services, authentication, cross-origin requests, IME, focus continuity, or pixel parity.",
    ],
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  const totalTicks = result.scenarios.reduce((sum, scenario) => sum + scenario.ticks.length, 0);
  if (mismatches.length > 0) {
    console.error(`HTTP effects parity failed: ${mismatches.length} mismatch(es) across ${totalTicks} recorded observations`);
    for (const mismatch of mismatches.slice(0, 18)) {
      console.error(`seed=${mismatch.seed} script=${mismatch.script} tick=${mismatch.tick} candidate=${mismatch.candidate ?? "-"} field=${mismatch.field}`);
    }
    console.error(`full traces: ${reportPath}`);
    process.exitCode = 1;
    return;
  }
  console.log(`HTTP effects parity matched ${scripts.length} scripts over ${totalTicks} initial/action observations`);
  console.log(`native CompareInteraction: ${nativeComparison.status}`);
  console.log(`full traces: ${reportPath}`);
}

export {
  addNativeComparisons,
  buildNativeComparator,
  classifyConsoleDiagnostics,
  compareEveryTick,
  compareNative,
  compareObservations,
  expectedConsoleManifest,
  nativeStep,
  nativeTick,
  parseArgs,
  requireNativeComparison,
  requireScriptCoverage,
  scriptCoverage,
  validateExpectedNetworkResponses,
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
