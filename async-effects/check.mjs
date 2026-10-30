#!/usr/bin/env node
import { createServer } from "node:http";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const BUILD_DIR = resolve(HERE, "build");
const WASM = resolve(BUILD_DIR, "async-save.wasm");
const WASM_EXEC = resolve(BUILD_DIR, "wasm_exec.js");
const REACT_BUNDLE = resolve(REPO_ROOT, "controlled-input/build/react.bundle.mjs");
const REFERENCE_BUNDLE = resolve(BUILD_DIR, "reference.bundle.mjs");
const requireFromInteraction = createRequire(resolve(REPO_ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Async save three-way browser comparison</title></head>
<body><main id="async-fixtures"></main>
<script src="/async-effects/build/wasm_exec.js"></script>
<script type="module">
  import { createEffectHost } from "/async-effects/host.mjs";
  import { createManualTransport } from "/async-effects/transport.mjs";
  import { mountEditorDOM } from "/controlled-input/dom.mjs";
  import { mountEditorReact } from "/controlled-input/build/react.bundle.mjs";
  import { mountReference, referenceReactVersion, referenceReactDOMVersion }
    from "/async-effects/build/reference.bundle.mjs";

  const errors = [];
  const renderers = { dom: mountEditorDOM, react: mountEditorReact };
  const goRuns = [];
  let fixtureSequence = 0;
  const experiment = {
    createEffectHost,
    createManualTransport,
    renderers,
    runtimes: {},
    runtime: null,
    makeRuntime,
    createFixture,
    fixtures: [],
    readyPromise: null,
    errors,
  };
  window.__asyncExperiment = experiment;

  async function makeRuntime() {
    const previous = globalThis.gobiAsyncSave;
    const go = new Go();
    const response = await fetch("/async-effects/build/async-save.wasm", { cache: "no-store" });
    if (!response.ok) throw new Error("async-save WASM request failed: " + response.status);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
    const run = go.run(instance);
    run.catch((error) => errors.push(String(error && error.stack || error)));
    goRuns.push({ go, instance, run });
    for (let attempt = 0; attempt < 500; attempt++) {
      if (globalThis.gobiAsyncSave && globalThis.gobiAsyncSave !== previous &&
          typeof globalThis.gobiAsyncSave.init === "function") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const runtime = globalThis.gobiAsyncSave;
    if (!runtime || runtime === previous || typeof runtime.init !== "function" ||
        typeof runtime.dispatch !== "function" || typeof runtime.complete !== "function" ||
        typeof runtime.effects !== "function" || typeof runtime.audit !== "function") {
      throw new Error("WASM instance did not publish a fresh globalThis.gobiAsyncSave API");
    }
    return runtime;
  }

  function countRuntime(raw) {
    const runtimeCalls = { init: 0, dispatch: 0, complete: 0, effects: 0, audit: 0 };
    const runtime = Object.fromEntries(Object.keys(runtimeCalls).map((method) => [method, (...args) => {
      runtimeCalls[method]++;
      return raw[method](...args);
    }]));
    return { runtime, runtimeCalls };
  }

  async function createFixture({ runtimeKey = "dom", backend = "dom", defaultValue, includeReference = true } = {}) {
    const rawRuntime = experiment.runtimes[runtimeKey];
    if (!rawRuntime) throw new Error("unknown or unavailable Go runtime key: " + runtimeKey);
    const root = document.createElement("div");
    root.id = "async-host-root-" + (++fixtureSequence);
    document.getElementById("async-fixtures").appendChild(root);
    const referenceRoot = includeReference ? document.createElement("div") : null;
    if (referenceRoot) {
      referenceRoot.id = "async-reference-root-" + fixtureSequence;
      document.getElementById("async-fixtures").appendChild(referenceRoot);
    }
    const { runtime, runtimeCalls } = countRuntime(rawRuntime);
    const manualTransport = createManualTransport(defaultValue === undefined ? {} : { defaultValue });
    const host = createEffectHost(root, runtime, renderers, manualTransport, backend);
    const reference = referenceRoot ? mountReference(referenceRoot) : null;
    let disposed = false;
    const fixture = {
      root,
      roots: { host: root, reference: referenceRoot },
      runtime,
      rawRuntime,
      runtimeCalls,
      renderers,
      host,
      manualTransport,
      transport: manualTransport,
      reference,
      flush: () => host.flush(),
      settled: () => host.settled(),
      async dispose() {
        if (disposed) return;
        disposed = true;
        try {
          host.unmount();
        } catch (error) {
          // Adversarial lifecycle probes may explicitly unmount before they
          // deliver a late callback. Treat that already-disposed state as the
          // same cleanup operation, while preserving all other errors.
          if (!String(error?.message ?? error).includes("host has been disposed")) throw error;
        }
        if (reference) reference.unmount();
        root.remove();
        if (referenceRoot) referenceRoot.remove();
      },
    };
    experiment.fixtures.push(fixture);
    return fixture;
  }

  experiment.readyPromise = (async () => {
    const domRuntime = await makeRuntime();
    const reactRuntime = await makeRuntime();
    if (domRuntime === reactRuntime) throw new Error("Go async-save WASM instances did not expose isolated API objects");
    experiment.runtimes = { dom: domRuntime, react: reactRuntime };
    experiment.runtime = domRuntime;
    experiment.versions = { react: referenceReactVersion, reactDOM: referenceReactDOMVersion };
    return true;
  })().catch((error) => {
    window.__asyncInitError = String(error && error.stack || error);
    throw error;
  });
</script></body></html>`;

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

function parseArgs(argv) {
  const options = { seeds: [20261030, 20261031], cases: 30, maxActions: 40, output: null, headed: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--seed") options.seeds = parseSeedList(argv[++index]);
    else if (arg === "--seeds") options.seeds = parseSeedList(argv[++index]);
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

function parseSeedList(value) {
  const parts = String(value).split(",");
  if (parts.some((part) => part.trim() === "")) throw new RangeError("seeds must be comma-separated unsigned 32-bit integers");
  const seeds = parts.map((part) => Number(part.trim()));
  if (new Set(seeds).size !== seeds.length || seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff)) {
    throw new RangeError("seeds must be unique unsigned 32-bit integers");
  }
  return seeds;
}

function usage() {
  return [
    "Usage: node async-effects/check.mjs [options]",
    "  --seeds A,B       deterministic unsigned 32-bit seeds (default 20261030,20261031)",
    "  --seed N          run one deterministic seed",
    "  --cases N         generated scripts per seed (default 30)",
    "  --max-actions N   maximum actions per generated script, 1..40 (default 40)",
    "  --output PATH     JSON report path (default async-effects/build/async-effects-traces-seeds-A-B.json)",
    "  --headed          show Chromium while running",
  ].join("\n");
}

function own(value, key) {
  return value === undefined ? null : value;
}

/** Compare the full Go snapshot with the independent reference projection. */
function compareSnapshots(actual, expected) {
  const mismatches = [];
  for (const field of ["state", "tree", "bindings", "messages"]) {
    if (!isDeepStrictEqual(actual?.[field], expected?.[field])) {
      mismatches.push({ field, expected: own(expected?.[field]), actual: own(actual?.[field]) });
    }
  }
  return mismatches;
}

/** Compare one candidate's serialized view, live DOM properties and transport log. */
function compareObservations(actual, expected) {
  const mismatches = compareSnapshots(actual?.snapshot, expected?.snapshot);
  for (const field of ["audit", "transportLog", "pending"]) {
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
  if (actual?.dom?.reportedHTML !== undefined && !isDeepStrictEqual(actual.dom.reportedHTML, actual.dom.html)) {
    mismatches.push({ field: "actual.dom.reportedHTML", expected: own(actual.dom.html), actual: actual.dom.reportedHTML });
  }
  if (actual?.dom?.reportedDisabled !== undefined && !isDeepStrictEqual(actual.dom.reportedDisabled, actual.dom.disabled)) {
    mismatches.push({ field: "actual.dom.reportedDisabled", expected: own(actual.dom.disabled), actual: actual.dom.reportedDisabled });
  }
  if (expected?.dom?.reportedHTML !== undefined && !isDeepStrictEqual(expected.dom.reportedHTML, expected.dom.html)) {
    mismatches.push({ field: "expected.dom.reportedHTML", expected: own(expected.dom.html), actual: expected.dom.reportedHTML });
  }
  if (expected?.dom?.reportedDisabled !== undefined && !isDeepStrictEqual(expected.dom.reportedDisabled, expected.dom.disabled)) {
    mismatches.push({ field: "expected.dom.reportedDisabled", expected: own(expected.dom.disabled), actual: expected.dom.reportedDisabled });
  }
  return mismatches;
}

function canonical(value) {
  return JSON.stringify(value);
}

function nativeStep(action, actualValue = undefined) {
  if (!action) return { Path: "", Event: "", Value: "" };
  if (action.kind === "fill" || action.kind === "type-char" || action.kind === "stale-input") {
    const value = actualValue ?? (action.kind === "type-char" ? action.resultingValue : action.value);
    return { Path: "0", Event: "input", Value: value ?? "" };
  }
  if (action.kind === "click") return { Path: action.Path ?? ({ save: "3", reset: "4", cancel: "5" }[action.button] ?? ""), Event: "click", Value: "" };
  if (action.kind === "reply") return { Path: "", Event: "reply", Value: String(action.id) };
  if (action.kind === "swap") return { Path: "", Event: "backend", Value: `${action.host}:${action.backend}` };
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
    InputDisabled: observation.dom.inputDisabled,
    DisabledProperties: canonical(observation.dom.controlProperties),
    Audit: canonical(observation.audit),
    Transport: canonical(observation.transportLog),
  };
}

function pathFromRoot(element, top) {
  const indexes = [];
  let node = element;
  while (node && node !== top) {
    const parent = node.parentNode;
    if (!parent) return null;
    indexes.push(Array.prototype.indexOf.call(parent.childNodes, node));
    node = parent;
  }
  return node === top ? indexes.reverse().join("/") : null;
}

async function htmlResponse(res) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(HTML);
}

async function serveFile(reqPath, res) {
  const decoded = decodeURIComponent(reqPath);
  const file = resolve(REPO_ROOT, `.${decoded}`);
  if (!file.startsWith(`${REPO_ROOT}${sep}`)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME.get(extname(file)) ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end(`not found: ${decoded}`);
  }
}

async function startServer() {
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/" || pathname === "/index.html") void htmlResponse(res);
    else void serveFile(pathname, res);
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function requireBuildInputs() {
  for (const file of [WASM, WASM_EXEC, REACT_BUNDLE, REFERENCE_BUNDLE]) {
    try {
      await stat(file);
    } catch {
      throw new Error(`missing ${file}; run the async-effects build script first`);
    }
  }
}

async function runBrowser(scripts, { headed = false } = {}) {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({
      headless: !headed,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__asyncExperiment?.readyPromise || window.__asyncInitError, null, { timeout: 30_000 });
    await page.evaluate(async () => {
      if (window.__asyncInitError) throw new Error(window.__asyncInitError);
      await window.__asyncExperiment.readyPromise;
    });
    const versions = await page.evaluate(() => window.__asyncExperiment.versions);
    if (versions.react !== "19.3.1" || versions.reactDOM !== "19.3.1") {
      throw new Error(`expected React and ReactDOM 19.3.1, got ${JSON.stringify(versions)}`);
    }

    const scenarios = [];
    for (const script of scripts) {
      const scenario = {
        name: script.name,
        seed: script.seed ?? null,
        actions: structuredClone(script.actions),
        ticks: [],
        nativeTicks: [],
        runtimeCalls: {},
      };
      try {
        await page.evaluate(async () => {
          const fixture = window.__asyncExperiment;
          const prior = window.__asyncScenario;
          if (prior) {
            await Promise.all([prior.dom.dispose(), prior.react.dispose()]);
          }
          const dom = await fixture.createFixture({ runtimeKey: "dom", backend: "dom", includeReference: true });
          const react = await fixture.createFixture({ runtimeKey: "react", backend: "react", includeReference: false });
          window.__asyncScenario = {
            dom,
            react,
            reference: dom.reference,
            expectedTransportLog: [],
            expectedPending: [],
            staleInputs: {},
            referenceEffects: [],
          };
        });

        const capture = () => page.evaluate(() => {
          const current = window.__asyncScenario;
          const pathFor = (element, top) => {
            const indexes = [];
            let node = element;
            while (node && node !== top) {
              const parent = node.parentNode;
              if (!parent) return null;
              indexes.push(Array.prototype.indexOf.call(parent.childNodes, node));
              node = parent;
            }
            return node === top ? indexes.reverse().join("/") : null;
          };
          const sample = (api, fixture, meta = {}) => {
            const reported = api.domSnapshot();
            const container = fixture.root;
            const top = container.firstElementChild;
            const input = top?.querySelector("input") ?? null;
            const controlProperties = top
              ? Array.from(top.querySelectorAll("input, button"), (element) => ({
                path: pathFor(element, top),
                tag: element.localName,
                value: "value" in element ? element.value : null,
                disabled: Boolean("disabled" in element && element.disabled),
                checked: "checked" in element ? Boolean(element.checked) : null,
              }))
              : [];
            const disabled = controlProperties.filter((control) => control.disabled).map((control) => control.path);
            return {
              snapshot: api.snapshot(),
              audit: api.audit(),
              dom: {
                html: container.innerHTML,
                root: top?.outerHTML ?? "",
                disabled,
                inputPath: input ? pathFor(input, top) : null,
                inputValue: input?.value ?? null,
                inputDisabled: input ? Boolean(input.disabled) : null,
                controlProperties,
                reportedHTML: reported.html,
                reportedDisabled: reported.disabled,
              },
              transportLog: fixture.manualTransport ? fixture.manualTransport.log() : structuredClone(meta.transportLog ?? []),
              pending: fixture.manualTransport ? fixture.manualTransport.pending() : structuredClone(meta.pending ?? []),
              runtimeCalls: fixture.runtimeCalls ? structuredClone(fixture.runtimeCalls) : null,
              backendName: fixture.host ? fixture.host.backendName() : null,
            };
          };
          return {
            dom: sample(current.dom.host, current.dom),
            react: sample(current.react.host, current.react),
            reference: sample(current.reference, { root: current.dom.roots.reference }, {
              transportLog: current.expectedTransportLog,
              pending: current.expectedPending.filter((item) => !item.delivered).map((item) => item.command),
            }),
            expectedTransportLog: structuredClone(current.expectedTransportLog),
            expectedPending: structuredClone(current.expectedPending),
            referenceEffects: structuredClone(current.referenceEffects),
          };
        });

        const settleAndDrain = () => page.evaluate(async () => {
          const current = window.__asyncScenario;
          await Promise.all([current.dom.host.settled(), current.react.host.settled()]);
          const commands = current.reference.effects();
          for (const command of commands) {
            if (command.Kind === "start") {
              const event = { kind: "start", command: structuredClone(command) };
              current.expectedTransportLog.push(event);
              current.expectedPending.push({ command: structuredClone(command), delivered: false });
            } else if (command.Kind === "cancel") {
              current.expectedTransportLog.push({ kind: "cancel", id: command.ID });
            } else {
              throw new Error("reference emitted an unsupported effect: " + JSON.stringify(command));
            }
          }
          current.referenceEffects.push(structuredClone(commands));
          return commands;
        });

        const record = async (action = null, step = null) => {
          const current = await capture();
          const index = scenario.ticks.length;
          scenario.ticks.push({
            index,
            kind: action?.kind ?? "initial",
            action: action ? structuredClone(action) : null,
            step: step ? structuredClone(step) : null,
            ...structuredClone(current),
          });
          scenario.nativeTicks.push({
            reference: nativeTick(index, index === 0 ? null : step, current.reference),
            dom: nativeTick(index, index === 0 ? null : step, current.dom),
            react: nativeTick(index, index === 0 ? null : step, current.react),
          });
          scenario.runtimeCalls = { dom: current.dom.runtimeCalls, react: current.react.runtimeCalls };
        };

        await record();
        for (const action of script.actions) {
          if (action.kind === "fill") {
            for (const host of ["dom", "react", "reference"]) {
              const rootId = await page.evaluate((name) => name === "reference"
                ? window.__asyncScenario.dom.roots.reference.id
                : window.__asyncScenario[name].root.id, host);
              const selector = "#" + rootId + " input";
              await page.locator(selector).fill(action.value);
            }
            await settleAndDrain();
            await record(action, nativeStep(action, action.value));
            continue;
          }

          if (action.kind === "type") {
            const inputSelectors = await page.evaluate(() => {
              const current = window.__asyncScenario;
              return [current.dom.root.id, current.react.root.id, current.dom.roots.reference.id]
                .map((id) => "#" + id + " input");
            });
            const codepoints = [...action.value];
            let value = (await page.locator(inputSelectors[0]).inputValue()) ?? "";
            for (const selector of inputSelectors) {
              await page.locator(selector).evaluate((input) => {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
              });
            }
            for (const character of codepoints) {
              for (const selector of inputSelectors) await page.locator(selector).pressSequentially(character);
              value += character;
              await settleAndDrain();
              const typed = { kind: "type-char", character, resultingValue: value };
              await record(typed, nativeStep(typed));
            }
            continue;
          }

          if (action.kind === "click") {
            const buttonIndex = { save: 0, reset: 1, cancel: 2 }[action.button];
            if (buttonIndex === undefined) throw new Error("unknown button: " + action.button);
            for (const host of ["dom", "react", "reference"]) {
              const rootId = await page.evaluate((name) => name === "reference"
                ? window.__asyncScenario.dom.roots.reference.id
                : window.__asyncScenario[name].root.id, host);
              const locator = page.locator("#" + rootId + " button").nth(buttonIndex);
              if (await locator.isDisabled()) await locator.evaluate((button) => button.click());
              else await locator.click();
            }
            await settleAndDrain();
            await record(action, nativeStep(action));
            continue;
          }

          if (action.kind === "swap") {
            await page.evaluate(({ host, backend }) => {
              const current = window.__asyncScenario;
              const fixture = current[host];
              current.staleInputs[host] = fixture.root.querySelector("input");
              fixture.host.replaceBackend(backend);
            }, action);
            await settleAndDrain();
            await record(action, nativeStep(action));
            continue;
          }

          if (action.kind === "stale-input") {
            await page.evaluate(({ host, value }) => {
              const current = window.__asyncScenario;
              const input = current.staleInputs[host];
              if (!input) throw new Error("no detached input was retained for host " + host);
              input.value = value;
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }, action);
            await settleAndDrain();
            await record(action, nativeStep(action));
            continue;
          }

          if (action.kind === "reply") {
            const delivery = await page.evaluate(async ({ id, value, error, hasValue, hasError }) => {
              const current = window.__asyncScenario;
              const options = {};
              if (hasValue) options.value = value;
              if (hasError) options.error = error;
              const domReply = current.dom.manualTransport.deliver(id, options);
              const reactReply = current.react.manualTransport.deliver(id, options);
              if (JSON.stringify(domReply) !== JSON.stringify(reactReply)) {
                throw new Error("isolated Go transports normalized the same reply differently");
              }
              current.expectedTransportLog.push({ kind: "deliver", reply: structuredClone(domReply) });
              const pending = current.expectedPending.find((item) => item.command.ID === id && !item.delivered);
              if (pending) pending.delivered = true;
              current.reference.complete(domReply);
              await Promise.all([current.dom.host.settled(), current.react.host.settled()]);
              const commands = current.reference.effects();
              if (commands.length !== 0) throw new Error("completion unexpectedly emitted reference effects");
              return domReply;
            }, {
              id: action.id,
              value: action.value ?? "",
              error: action.error ?? "",
              hasValue: Object.hasOwn(action, "value"),
              hasError: Object.hasOwn(action, "error") && action.error !== "",
            });
            await record(action, nativeStep(action));
            continue;
          }

          throw new Error(`unknown async-effects action kind ${JSON.stringify(action.kind)}`);
        }
      } catch (error) {
        scenario.executionError = String(error?.stack ?? error);
      } finally {
        try {
          await page.evaluate(async () => {
            const current = window.__asyncScenario;
            if (current) await Promise.all([current.dom.dispose(), current.react.dispose()]);
            window.__asyncScenario = null;
          });
        } catch (error) {
          scenario.disposeError = String(error?.stack ?? error);
        }
      }
      scenarios.push(scenario);
    }

    let adversarial;
    try {
      const module = await import("./adversarial.mjs");
      adversarial = await module.runAdversarial(page);
      adversarial.moduleExpectedProbeNames = module.expectedProbeNames;
    } catch (error) {
      adversarial = {
        ...(error?.report && typeof error.report === "object" ? error.report : {}),
        ok: false,
        error: String(error?.stack ?? error),
        expectedProbeNames: error?.report?.expectedProbeNames ?? [],
        probes: error?.report?.probes ?? [],
      };
    }
    const goErrors = await page.evaluate(() => structuredClone(window.__asyncExperiment.errors ?? []));
    return {
      scenarios,
      adversarial,
      goErrors,
      pageErrors,
      browserVersion: browser.version(),
      versions,
    };
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function compareEveryTick(result, seeds) {
  const mismatches = [];
  for (const scenario of result.scenarios) {
    for (const tick of scenario.ticks) {
      for (const candidate of ["dom", "react"]) {
        for (const difference of compareObservations(tick[candidate], {
          snapshot: tick.reference.snapshot,
          audit: tick.reference.audit,
          transportLog: tick.expectedTransportLog,
          pending: tick.expectedPending.filter((item) => !item.delivered).map((item) => item.command),
          dom: tick.reference.dom,
        })) {
          mismatches.push({ seed: scenario.seed ?? seeds[0], script: scenario.name, tick: tick.index, candidate, ...difference });
        }
      }
      for (const difference of compareObservations(tick.dom, {
        snapshot: tick.react.snapshot,
        audit: tick.react.audit,
        transportLog: tick.react.transportLog,
        pending: tick.react.pending,
        dom: tick.react.dom,
      })) {
        mismatches.push({ seed: scenario.seed ?? seeds[0], script: scenario.name, tick: tick.index, candidate: "go-dom-vs-react", ...difference });
      }
      if (tick.dom.dom.inputPath !== "0" || tick.react.dom.inputPath !== "0" || tick.reference.dom.inputPath !== "0") {
        mismatches.push({
          seed: scenario.seed ?? seeds[0], script: scenario.name, tick: tick.index, candidate: "all",
          field: "dom.inputPath", expected: "0",
          actual: { dom: tick.dom.dom.inputPath, react: tick.react.dom.inputPath, reference: tick.reference.dom.inputPath },
        });
      }
      for (const candidate of ["dom", "react"]) {
        const calls = tick[candidate]?.runtimeCalls;
        const messages = tick[candidate]?.snapshot?.messages ?? [];
        const completeCount = messages.filter((message) => message.Name === "reply").length;
        const dispatchCount = messages.length - completeCount;
        for (const [method, expectedCount] of [
          ["init", 1],
          ["dispatch", dispatchCount],
          ["complete", completeCount],
          ["effects", dispatchCount],
          ["audit", tick.index + 1],
        ]) {
          if (calls?.[method] !== expectedCount) mismatches.push({
            seed: scenario.seed ?? seeds[0], script: scenario.name, tick: tick.index, candidate,
            field: `runtime.${method}`, expected: expectedCount, actual: calls?.[method] ?? null,
          });
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
  const adversarial = result.adversarial ?? {};
  const expected = adversarial.moduleExpectedProbeNames ?? adversarial.expectedProbeNames ?? [];
  const observed = (adversarial.probes ?? []).map((probe) => probe.name);
  const duplicates = observed.filter((name, index) => observed.indexOf(name) !== index);
  const missing = expected.filter((name) => !observed.includes(name));
  const unexpected = observed.filter((name) => !expected.includes(name));
  if (adversarial.error || adversarial.ok !== true || missing.length || duplicates.length || unexpected.length) {
    mismatches.push({
      seed: seeds[0], script: "adversarial", tick: null, candidate: "E6",
      field: "expected-probes", expected, actual: { ok: adversarial.ok, observed, missing, duplicates, unexpected, error: adversarial.error },
    });
  }
  for (const probe of adversarial.probes ?? []) {
    if (probe.pass !== true) mismatches.push({
      seed: seeds[0], script: "adversarial", tick: null, candidate: probe.kind ?? "E6",
      field: `probe.${probe.name}`, expected: true, actual: probe,
    });
  }
  for (const error of [...(result.goErrors ?? []), ...(result.pageErrors ?? [])]) {
    mismatches.push({ seed: seeds[0], script: "browser", tick: null, candidate: null, field: "global-error", actual: error });
  }
  return mismatches;
}

async function buildNativeComparator(reportDir) {
  if (process.env.GO_COMPARE_BIN) return { status: "ready", file: resolve(process.env.GO_COMPARE_BIN), args: [] };
  await mkdir(reportDir, { recursive: true });
  const file = resolve(reportDir, "compare-interaction.local");
  const candidates = [process.env.GO_BIN, "/tmp/gondola-go/bin/go", "go"].filter(Boolean);
  let last;
  for (const go of [...new Set(candidates)]) {
    try { await access(go, fsConstants.X_OK); } catch { if (go !== "go") continue; }
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
    golden: { Implementation: "Independent React 19.3.1 async-save reference", Ticks: scenario.nativeTicks.map(({ reference }) => reference) },
    candidate: { Implementation: `Go async-save WASM with ${candidate} renderer`, Ticks: scenario.nativeTicks.map((tick) => tick[candidate]) },
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
    if (scenario.nativeTicks.length === 0) {
      mismatches.push({ seed: scenario.seed ?? 0, script: scenario.name, tick: null, candidate: "native", field: "trace", actual: "no captured ticks" });
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
  const result = await runBrowser(scripts, options);
  const mismatches = compareEveryTick(result, seeds);
  const reportPath = options.output ?? resolve(BUILD_DIR, `async-effects-traces-seeds-${seeds.join("-")}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  const nativeCommand = await buildNativeComparator(dirname(reportPath));
  const nativeComparison = await addNativeComparisons(result, dirname(reportPath), nativeCommand, mismatches);
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
    adversarial: result.adversarial,
    scenarios: result.scenarios,
    mismatches,
    nativeComparison,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  const totalTicks = result.scenarios.reduce((sum, scenario) => sum + scenario.ticks.length, 0);
  if (mismatches.length > 0) {
    console.error(`async-effects parity failed: ${mismatches.length} mismatch(es) across ${totalTicks} recorded ticks`);
    for (const mismatch of mismatches.slice(0, 16)) {
      console.error(`seed=${mismatch.seed} script=${mismatch.script} tick=${mismatch.tick} candidate=${mismatch.candidate ?? "-"} field=${mismatch.field}`);
    }
    console.error(`full traces: ${reportPath}`);
    process.exitCode = 1;
    return;
  }
  console.log(`async-effects parity matched ${scripts.length} scripts over ${totalTicks} initial/action observations`);
  console.log(`native CompareInteraction: ${nativeComparison.status}`);
  console.log(`full traces: ${reportPath}`);
}

export {
  addNativeComparisons,
  buildNativeComparator,
  compareEveryTick,
  compareNative,
  compareObservations,
  compareSnapshots,
  nativeStep,
  nativeTick,
  parseArgs,
  parseSeedList,
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
