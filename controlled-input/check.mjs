#!/usr/bin/env node
import { createServer } from "node:http";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { runAdversarial } from "./adversarial.mjs";
import {
  BUTTON_PATH,
  INPUT_PATH,
  fixedScripts,
  parseSeedList,
  seededScripts,
} from "./scripts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const BUILD_DIR = resolve(HERE, "build");
const WASM = resolve(BUILD_DIR, "editor.wasm");
const WASM_EXEC = resolve(BUILD_DIR, "wasm_exec.js");
const REACT_BUNDLE = resolve(BUILD_DIR, "react.bundle.mjs");
const REFERENCE_BUNDLE = resolve(BUILD_DIR, "reference.bundle.mjs");
const requireFromInteraction = createRequire(resolve(REPO_ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Controlled input renderer parity</title></head>
<body><main>
  <div id="dom-root"></div><div id="react-root"></div><div id="oracle-root"></div>
</main>
<script src="/controlled-input/build/wasm_exec.js"></script>
<script type="module">
  import { createBackendHost } from "/backend-replacement/host.mjs";
  import { mountEditorDOM } from "/controlled-input/dom.mjs";
  import { mountEditorReact } from "/controlled-input/build/react.bundle.mjs";
  import { mountReference, referenceReactVersion, referenceReactDOMVersion }
    from "/controlled-input/build/reference.bundle.mjs";

  const renderers = { dom: mountEditorDOM, react: mountEditorReact };
  const goRuns = [];
  async function makeRuntime() {
    const previous = globalThis.gobiEditor;
    const go = new Go();
    const response = await fetch("/controlled-input/build/editor.wasm", { cache: "no-store" });
    if (!response.ok) throw new Error("editor WASM request failed: " + response.status);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
    const run = go.run(instance);
    run.catch((error) => {
      (window.__inputGoErrors ??= []).push(String(error && error.stack || error));
    });
    goRuns.push({ go, instance, run });
    for (let attempt = 0; attempt < 500; attempt++) {
      if (globalThis.gobiEditor && globalThis.gobiEditor !== previous &&
          typeof globalThis.gobiEditor.init === "function") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!globalThis.gobiEditor || globalThis.gobiEditor === previous ||
        typeof globalThis.gobiEditor.init !== "function" ||
        typeof globalThis.gobiEditor.dispatch !== "function") {
      throw new Error("WASM instance did not publish a fresh globalThis.gobiEditor API");
    }
    return globalThis.gobiEditor;
  }

  const fixture = {
    createBackendHost,
    renderers,
    mountReference,
    runtimes: {},
    makeRuntime,
    readyPromise: null,
  };
  window.__inputExperiment = fixture;
  fixture.readyPromise = (async () => {
    const domRuntime = await makeRuntime();
    const reactRuntime = await makeRuntime();
    if (domRuntime === reactRuntime) throw new Error("Go editor WASM instances did not expose separate APIs");
    fixture.runtimes = { dom: domRuntime, react: reactRuntime };
    window.__inputVersions = {
      referenceReact: referenceReactVersion,
      referenceReactDOM: referenceReactDOMVersion,
    };
    return true;
  })().catch((error) => {
    window.__inputInitError = String(error && error.stack || error);
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
  const options = {
    seeds: [20261030, 20261031],
    cases: 100,
    maxActions: 80,
    output: null,
    headed: false,
  };
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
  if (!Number.isInteger(options.cases) || options.cases < 0) throw new Error("--cases must be non-negative");
  if (!Number.isInteger(options.maxActions) || options.maxActions < 1 || options.maxActions > 80) {
    throw new Error("--max-actions must be from 1 through 80");
  }
  return options;
}

function usage() {
  return [
    "Usage: node controlled-input/check.mjs [options]",
    "  --seeds A,B       deterministic unsigned 32-bit seeds (default 20261030,20261031)",
    "  --seed N          run one deterministic seed",
    "  --cases N         generated scripts per seed (default 100)",
    "  --max-actions N   maximum actions per generated script, 1..80 (default 80)",
    "  --output PATH     JSON report path (default controlled-input/build/report-seeds-A-B.json)",
    "  --headed          show Chromium while running",
  ].join("\n");
}

/** Compare runtime-owned snapshots and actual browser observations field by field. */
function compareSnapshots(actualSnapshot, actualDOM, expectedSnapshot, expectedDOM) {
  const mismatches = [];
  for (const field of ["state", "tree", "bindings", "messages"]) {
    if (!isDeepStrictEqual(actualSnapshot?.[field], expectedSnapshot?.[field])) {
      mismatches.push({
        field,
        expected: expectedSnapshot?.[field] ?? null,
        actual: actualSnapshot?.[field] ?? null,
      });
    }
  }
  for (const field of ["html", "root", "disabled", "inputValue", "disabledProperties"]) {
    if (!isDeepStrictEqual(actualDOM?.[field], expectedDOM?.[field])) {
      mismatches.push({
        field: `dom.${field}`,
        expected: expectedDOM?.[field] ?? null,
        actual: actualDOM?.[field] ?? null,
      });
    }
  }
  for (const [label, dom] of [["actual", actualDOM], ["expected", expectedDOM]]) {
    if (dom?.reportedHTML !== undefined && !isDeepStrictEqual(dom.reportedHTML, dom.html)) {
      mismatches.push({
        field: `${label}.dom.reportedHTML`,
        expected: dom.html ?? null,
        actual: dom.reportedHTML,
      });
    }
    if (dom?.reportedDisabled !== undefined && !isDeepStrictEqual(dom.reportedDisabled, dom.disabled)) {
      mismatches.push({
        field: `${label}.dom.reportedDisabled`,
        expected: dom.disabled ?? null,
        actual: dom.reportedDisabled,
      });
    }
  }
  return mismatches;
}

function nativeStep(action, inputValue = "") {
  if (!action) return { Path: "", Event: "", Value: "" };
  if (action.kind === "fill" || action.kind === "type-char") {
    return { Path: INPUT_PATH, Event: "input", Value: action.kind === "fill" ? action.value : action.resultingValue };
  }
  if (action.kind === "stale-input") {
    return { Path: INPUT_PATH, Event: "input", Value: action.value };
  }
  if (action.kind === "click") {
    return { Path: action.Path ?? BUTTON_PATH[action.button] ?? "", Event: "click", Value: "" };
  }
  if (action.kind === "swap") {
    return { Path: "", Event: `backend:${action.backend}`, Value: action.host ?? "" };
  }
  return { Path: "", Event: "", Value: inputValue };
}

function canonical(value) {
  return JSON.stringify(value);
}

function nativeTick(index, step, sample) {
  return {
    Index: index,
    Step: step ?? { Path: "", Event: "", Value: "" },
    State: canonical(sample.snapshot.state),
    Tree: canonical(sample.snapshot.tree),
    DOM: sample.dom.root,
    Pixels: "",
    Mutations: 0,
    // CompareInteraction intentionally ignores these new editor observations;
    // compareSnapshots checks each independently before native comparison.
    Bindings: canonical(sample.snapshot.bindings),
    Messages: canonical(sample.snapshot.messages),
    InputValue: sample.dom.inputValue,
    Disabled: canonical(sample.dom.disabledProperties),
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
    res.writeHead(200, {
      "content-type": MIME.get(extname(file)) ?? "application/octet-stream",
      "cache-control": "no-store",
    });
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
      throw new Error(`missing ${file}; run controlled-input/run-controlled-input.sh first`);
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
    await page.waitForFunction(() => window.__inputExperiment?.readyPromise || window.__inputInitError, null, { timeout: 30_000 });
    await page.evaluate(async () => {
      if (window.__inputInitError) throw new Error(window.__inputInitError);
      await window.__inputExperiment.readyPromise;
    });
    const versions = await page.evaluate(() => window.__inputVersions);
    for (const [key, version] of Object.entries(versions ?? {})) {
      if (version !== "19.3.1") throw new Error(`expected ${key} 19.3.1, got ${JSON.stringify(versions)}`);
    }

    const isolationProbe = await page.evaluate(() => {
      const { dom, react } = window.__inputExperiment.runtimes;
      const initialDom = structuredClone(dom.init());
      const initialReact = structuredClone(react.init());
      const domAfterEdit = structuredClone(dom.dispatch({ Path: "0", Event: "input", Value: "isolation probe" }));
      // Dispatch against the still-empty React runtime without reinitializing
      // it: disabled Save must remain suppressed if the Go sessions are isolated.
      const reactAfterProbe = structuredClone(react.dispatch({ Path: "3", Event: "click", Value: "" }));
      return {
        separateAPIObjects: dom !== react,
        initialDom,
        initialReact,
        domAfterEdit,
        reactAfterProbe,
      };
    });
    const initialState = { Draft: "", Saved: "", Saves: 0 };
    const isolationPassed = isolationProbe.separateAPIObjects &&
      isDeepStrictEqual(isolationProbe.initialDom.state, initialState) &&
      isDeepStrictEqual(isolationProbe.initialReact.state, initialState) &&
      isDeepStrictEqual(isolationProbe.domAfterEdit.state, { ...initialState, Draft: "isolation probe" }) &&
      isDeepStrictEqual(isolationProbe.reactAfterProbe.state, initialState) &&
      isolationProbe.domAfterEdit.messages.length === 1 && isolationProbe.reactAfterProbe.messages.length === 0;

    const scenarios = [];
    for (const script of scripts) {
      await page.evaluate(() => {
        const fixture = window.__inputExperiment;
        const roots = {
          dom: document.getElementById("dom-root"),
          react: document.getElementById("react-root"),
          oracle: document.getElementById("oracle-root"),
        };
        Object.values(roots).forEach((root) => root.replaceChildren());
        const instrument = (runtime) => {
          const calls = { init: 0, dispatch: 0 };
          return {
            calls,
            runtime: {
              init() { calls.init++; return runtime.init(); },
              dispatch(step) { calls.dispatch++; return runtime.dispatch(step); },
            },
          };
        };
        const domInstrument = instrument(fixture.runtimes.dom);
        const reactInstrument = instrument(fixture.runtimes.react);
        const hosts = {
          dom: fixture.createBackendHost(roots.dom, domInstrument.runtime, fixture.renderers, "dom"),
          react: fixture.createBackendHost(roots.react, reactInstrument.runtime, fixture.renderers, "react"),
        };
        const oracle = fixture.mountReference(roots.oracle);
        window.__inputScenario = {
          roots,
          hosts,
          oracle,
          calls: { dom: domInstrument.calls, react: reactInstrument.calls },
          staleInputs: new Map(),
        };
      });

      const scenario = {
        name: script.name,
        seed: script.seed ?? null,
        actions: structuredClone(script.actions),
        ticks: [],
        nativeTicks: [],
        focusChecks: [],
      };

      const capture = () => page.evaluate(() => {
        const current = window.__inputScenario;
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
        const sample = (api, container) => {
          const reported = api.domSnapshot();
          const top = container.firstElementChild;
          const input = top?.querySelector("input") ?? null;
          const disabledProperties = top
            ? Array.from(top.querySelectorAll("button"), (button) => ({
              path: pathFor(button, top),
              disabled: Boolean(button.disabled),
            }))
            : [];
          const disabled = disabledProperties.filter(({ disabled: value }) => value).map(({ path }) => path);
          return {
            snapshot: api.snapshot(),
            dom: {
              html: container.innerHTML,
              root: top?.outerHTML ?? "",
              disabled,
              inputValue: input?.value ?? null,
              disabledProperties,
              reportedHTML: reported.html,
              reportedDisabled: reported.disabled,
            },
          };
        };
        return {
          backendNames: {
            dom: current.hosts.dom.backendName(),
            react: current.hosts.react.backendName(),
          },
          go: {
            dom: sample(current.hosts.dom, current.roots.dom),
            react: sample(current.hosts.react, current.roots.react),
          },
          oracle: sample(current.oracle, current.roots.oracle),
          runtimeCalls: structuredClone(current.calls),
        };
      });

      const record = async (action = null, step = null, detail = null) => {
        const current = await capture();
        const index = scenario.ticks.length;
        const tick = {
          index,
          kind: action?.kind ?? "initial",
          action: action ? structuredClone(action) : null,
          ...(detail ? { detail: structuredClone(detail) } : {}),
          step: step ? structuredClone(step) : null,
          backendNames: current.backendNames,
          go: current.go,
          oracle: current.oracle,
          runtimeCalls: current.runtimeCalls,
        };
        scenario.ticks.push(tick);
        const effectiveStep = index === 0 ? null : step;
        scenario.nativeTicks.push({
          reference: nativeTick(index, effectiveStep, current.oracle),
          dom: nativeTick(index, effectiveStep, current.go.dom),
          react: nativeTick(index, effectiveStep, current.go.react),
        });
        return current;
      };

      await record();
      for (const action of script.actions) {
        if (action.kind === "fill") {
          for (const name of ["dom", "react", "oracle"]) {
            const selector = `#${name === "oracle" ? "oracle-root" : `${name}-root`} input`;
            const locator = page.locator(selector);
            await locator.fill(action.value);
            const retainedFocus = await locator.evaluate((input) => input.ownerDocument.activeElement === input);
            scenario.focusChecks.push({ action: "fill", host: name, retainedFocus });
          }
          const afterFill = await capture();
          const step = nativeStep({ ...action, value: afterFill.oracle.dom.inputValue ?? "" });
          await record(action, step);
          continue;
        }

        if (action.kind === "type") {
          const before = await capture();
          let value = before.oracle.dom.inputValue ?? "";
          for (const name of ["dom", "react", "oracle"]) {
            const selector = `#${name === "oracle" ? "oracle-root" : `${name}-root`} input`;
            const locator = page.locator(selector);
            await locator.evaluate((input) => {
              input.focus();
              input.setSelectionRange(input.value.length, input.value.length);
            });
          }
          for (const character of action.value) {
            for (const name of ["dom", "react", "oracle"]) {
              const selector = `#${name === "oracle" ? "oracle-root" : `${name}-root`} input`;
              const locator = page.locator(selector);
              await locator.pressSequentially(character);
              const retainedFocus = await locator.evaluate((input) => input.ownerDocument.activeElement === input);
              scenario.focusChecks.push({ action: "type", host: name, character, retainedFocus });
            }
            value += character;
            const typedAction = { kind: "type-char", character, resultingValue: value };
            const step = nativeStep(typedAction);
            await record(typedAction, step, { sequence: action.value });
          }
          continue;
        }

        if (action.kind === "click") {
          for (const name of ["dom", "react", "oracle"]) {
            const selector = `#${name === "oracle" ? "oracle-root" : `${name}-root`} button.${action.button}`;
            const locator = page.locator(selector);
            if (await locator.isDisabled()) {
              // HTMLButtonElement.click() still obeys disabled suppression.
              await locator.evaluate((button) => button.click());
            } else {
              await locator.click();
            }
          }
          await record(action, nativeStep(action));
          continue;
        }

        if (action.kind === "swap") {
          await page.evaluate(({ host, backend }) => {
            const current = window.__inputScenario;
            current.staleInputs.set(host, current.roots[host].querySelector("input"));
            current.hosts[host].replaceBackend(backend);
          }, action);
          await record(action, nativeStep(action));
          continue;
        }

        if (action.kind === "stale-input") {
          const staleValue = await page.evaluate(({ host, value }) => {
            const input = window.__inputScenario.staleInputs.get(host);
            if (!input) throw new Error(`no detached input was saved for ${host}`);
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            return input.value;
          }, action);
          await record(action, nativeStep({ ...action, value: staleValue }));
          continue;
        }

        throw new Error(`unknown controlled-input action kind ${JSON.stringify(action.kind)}`);
      }

      const final = await capture();
      scenario.runtimeCalls = final.runtimeCalls;
      scenario.endBackendNames = final.backendNames;
      await page.evaluate(() => {
        const current = window.__inputScenario;
        current.hosts.dom.unmount();
        current.hosts.react.unmount();
        current.oracle.unmount();
        for (const root of Object.values(current.roots)) root.replaceChildren();
      });
      scenarios.push(scenario);
    }

    const adversarial = await runAdversarial(page);
    return {
      isolationProbe,
      isolationPassed,
      scenarios,
      adversarial,
      goErrors: await page.evaluate(() => structuredClone(window.__inputGoErrors ?? [])),
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
    const seed = scenario.seed ?? seeds[0];
    for (const tick of scenario.ticks) {
      for (const candidate of ["dom", "react"]) {
        for (const difference of compareSnapshots(
          tick.go[candidate].snapshot,
          tick.go[candidate].dom,
          tick.oracle.snapshot,
          tick.oracle.dom,
        )) {
          mismatches.push({ seed, script: scenario.name, tick: tick.index, kind: tick.kind, candidate, ...difference });
        }
      }
      for (const difference of compareSnapshots(
        tick.go.dom.snapshot,
        tick.go.dom.dom,
        tick.go.react.snapshot,
        tick.go.react.dom,
      )) {
        mismatches.push({
          seed,
          script: scenario.name,
          tick: tick.index,
          kind: tick.kind,
          candidate: "dom-vs-react-host",
          ...difference,
        });
      }
    }

    for (const check of scenario.focusChecks ?? []) {
      if (!check.retainedFocus) {
        mismatches.push({
          seed,
          script: scenario.name,
          tick: null,
          kind: "native-typing-focus",
          candidate: check.host,
          field: "inputFocus",
          expected: true,
          actual: false,
          detail: check,
        });
      }
    }
    for (const [candidate, initial] of [["dom", "dom"], ["react", "react"]]) {
      if (scenario.ticks[0]?.backendNames?.[candidate] !== initial) {
        mismatches.push({
          seed,
          script: scenario.name,
          tick: 0,
          kind: "initial-backend",
          candidate,
          field: "backendName",
          expected: initial,
          actual: scenario.ticks[0]?.backendNames?.[candidate] ?? null,
        });
      }
    }
    for (const candidate of ["dom", "react"]) {
      const calls = scenario.runtimeCalls?.[candidate];
      if (!calls || calls.init !== 1) {
        mismatches.push({
          seed,
          script: scenario.name,
          tick: null,
          kind: "runtime-init-count",
          candidate,
          field: "runtime.init",
          expected: 1,
          actual: calls?.init ?? null,
        });
      }
      const last = scenario.ticks.at(-1)?.go?.[candidate]?.snapshot;
      if (calls && last && calls.dispatch !== last.messages.length) {
        mismatches.push({
          seed,
          script: scenario.name,
          tick: scenario.ticks.length - 1,
          kind: "runtime-dispatch-count",
          candidate,
          field: "runtime.dispatch",
          expected: last.messages.length,
          actual: calls.dispatch,
        });
      }
    }
  }

  if (!result.isolationPassed) {
    mismatches.push({
      seed: seeds[0],
      script: "wasm-instance-isolation",
      tick: null,
      kind: "instance-probe",
      candidate: "dom-vs-react-wasm",
      field: "isolation",
      expected: "editing one captured Go runtime leaves the other at its initial state and empty message log",
      actual: result.isolationProbe ?? null,
    });
  }
  const adversarial = Array.isArray(result.adversarial)
    ? result.adversarial
    : (result.adversarial?.probes ?? []);
  for (const probe of adversarial) {
    if (!probe.pass) {
      mismatches.push({
        seed: seeds[0],
        script: "adversarial",
        tick: null,
        kind: "adversarial-probe",
        candidate: null,
        field: probe.name,
        actual: probe.observations,
      });
    }
  }
  for (const error of [...(result.goErrors ?? []), ...(result.pageErrors ?? [])]) {
    mismatches.push({
      seed: seeds[0],
      script: "browser",
      tick: null,
      kind: "browser-error",
      candidate: null,
      field: "console",
      actual: error,
    });
  }
  return mismatches;
}

async function buildNativeComparator() {
  if (process.env.GO_COMPARE_BIN) {
    return { status: "ready", file: resolve(process.env.GO_COMPARE_BIN), args: [] };
  }
  await mkdir(BUILD_DIR, { recursive: true });
  const file = resolve(BUILD_DIR, "compare-interaction.local");
  const candidates = [process.env.GO_BIN, "/tmp/gondola-go/bin/go", "go"].filter(Boolean);
  let last;
  for (const go of [...new Set(candidates)]) {
    try {
      await access(go, fsConstants.X_OK);
    } catch {
      if (go === "go") {
        // PATH executables need not have a filesystem path accessible to access().
      } else continue;
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
  return {
    status: "error",
    error: String(last?.error ?? last?.stderr ?? "native compare-interaction build failed"),
    stderr: last?.stderr ?? "",
  };
}

async function compareNative(scenario, reportDir, seed, scriptIndex, candidate, command) {
  const inputPath = resolve(reportDir, `native-input-seed-${seed}-script-${scriptIndex}-${candidate}.json`);
  const input = {
    golden: {
      Implementation: "Independent React 19.3.1 editor oracle",
      Ticks: scenario.nativeTicks.map(({ reference }) => reference),
    },
    candidate: {
      Implementation: `Go editor WASM with ${candidate} renderer`,
      Ticks: scenario.nativeTicks.map((ticks) => ticks[candidate]),
    },
  };
  await writeFile(inputPath, JSON.stringify(input, null, 2));
  if (command.status !== "ready") {
    return { status: command.status, inputPath, error: command.error, message: command.message, stderr: command.stderr };
  }
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
    for (const candidate of ["dom", "react"]) {
      const comparison = await compareNative(scenario, reportDir, scenario.seed ?? 0, scriptIndex, candidate, command);
      comparisons.push({ script: scenario.name, candidate, ...comparison });
      if (comparison.status !== "matched") {
        mismatches.push({
          seed: scenario.seed ?? 0,
          script: scenario.name,
          tick: comparison.diff?.Tick ?? null,
          kind: "native-compare-interaction",
          candidate,
          field: comparison.diff?.Part ?? comparison.status,
          expected: comparison.diff?.Want,
          actual: comparison.diff?.Got ?? comparison.stderr ?? comparison.error ?? comparison.message,
        });
      }
    }
  }
  return {
    status: comparisons.every((comparison) => comparison.status === "matched") ? "matched" : "failed",
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
  await requireBuildInputs();
  const scripts = options.seeds.flatMap((seed) => [
    ...fixedScripts.map((script) => ({ ...script, seed })),
    ...seededScripts(seed, { cases: options.cases, maxActions: options.maxActions }),
  ]);
  const result = await runBrowser(scripts, options);
  const mismatches = compareEveryTick(result, options.seeds);
  const seedLabel = options.seeds.join("-");
  const reportPath = options.output ?? resolve(BUILD_DIR, `report-seeds-${seedLabel}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  const nativeCommand = await buildNativeComparator();
  const nativeComparison = await addNativeComparisons(result, dirname(reportPath), nativeCommand, mismatches);
  const report = {
    seeds: options.seeds,
    generatedCasesPerSeed: options.cases,
    maxActionsPerGeneratedCase: options.maxActions,
    invocation: { seeds: options.seeds, cases: options.cases, maxActions: options.maxActions },
    browser: {
      name: "Chromium",
      version: result.browserVersion,
      executable: process.env.CHROMIUM_EXECUTABLE_PATH ?? "Playwright-managed",
    },
    react: "19.3.1",
    versions: result.versions,
    wasmInstanceIsolation: result.isolationProbe,
    adversarial: result.adversarial,
    scenarios: result.scenarios,
    mismatches,
    nativeComparison,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  const totalTicks = result.scenarios.reduce((sum, scenario) => sum + scenario.ticks.length, 0);
  if (mismatches.length > 0) {
    console.error(`controlled-input parity failed: ${mismatches.length} mismatch(es) across ${totalTicks} recorded ticks`);
    for (const mismatch of mismatches.slice(0, 12)) {
      console.error(`seed=${mismatch.seed} script=${mismatch.script} tick=${mismatch.tick} candidate=${mismatch.candidate ?? "-"} field=${mismatch.field}`);
    }
    console.error(`full traces: ${reportPath}`);
    process.exitCode = 1;
    return;
  }
  console.log(`controlled-input parity matched ${scripts.length} scripts over ${totalTicks} observations`);
  console.log(`native CompareInteraction: ${nativeComparison.status}`);
  console.log(`full traces: ${reportPath}`);
}

export {
  addNativeComparisons,
  compareEveryTick,
  compareNative,
  compareSnapshots,
  nativeStep,
  nativeTick,
  parseArgs,
  runBrowser,
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
