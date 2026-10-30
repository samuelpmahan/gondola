#!/usr/bin/env node
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { BUTTON_PATH, fixedScripts, seededScripts } from "./scripts.mjs";
import { runAdversarial } from "./adversarial.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const INTERACTION_DIR = resolve(REPO_ROOT, "interaction");
const BUILD_DIR = resolve(HERE, "build");
const REACT_BUNDLE = resolve(BUILD_DIR, "react-backend.bundle.mjs");
const REFERENCE_BUNDLE = resolve(INTERACTION_DIR, "build/react-reference.bundle.mjs");
const WASM = resolve(INTERACTION_DIR, "build/counter.wasm");
const WASM_EXEC = resolve(INTERACTION_DIR, "build/wasm_exec.js");
const EXPECTED_RUNTIME_ERROR = "backend host: runtime.dispatch() returned a runtime error: __EXPECTED_RUNTIME_FAILURE__";
const requireFromInteraction = createRequire(resolve(INTERACTION_DIR, "package.json"));
const { chromium } = requireFromInteraction("playwright");

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Gobi backend replacement parity</title></head>
<body><main>
  <div id="dom-root"></div><div id="react-root"></div><div id="oracle-root"></div>
</main>
<script src="/interaction/build/wasm_exec.js"></script>
<script type="module">
  import { mountGobi } from "/interaction/dom.mjs";
  import { createBackendHost } from "/backend-replacement/host.mjs";
  import { mountGobiReact } from "/backend-replacement/build/react-backend.bundle.mjs";
  import { mountReactReference, reactReferenceVersion, reactDOMReferenceVersion }
    from "/interaction/build/react-reference.bundle.mjs";

  const renderers = { dom: mountGobi, react: mountGobiReact };
  const goRuns = [];
  async function makeRuntime() {
    const previous = globalThis.gobiCounter;
    const go = new Go();
    const response = await fetch("/interaction/build/counter.wasm", { cache: "no-store" });
    if (!response.ok) throw new Error("WASM request failed: " + response.status);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
    const run = go.run(instance);
    run.catch((error) => {
      (window.__replacementGoErrors ??= []).push(String(error && error.stack || error));
    });
    goRuns.push({ go, instance, run });
    for (let attempt = 0; attempt < 500; attempt++) {
      if (globalThis.gobiCounter && globalThis.gobiCounter !== previous &&
          typeof globalThis.gobiCounter.init === "function") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!globalThis.gobiCounter || globalThis.gobiCounter === previous ||
        typeof globalThis.gobiCounter.init !== "function") {
      throw new Error("WASM instance did not publish a fresh globalThis.gobiCounter API");
    }
    // Capture the object now: the next Go instance replaces the global property.
    return globalThis.gobiCounter;
  }

  window.__replacementReady = (async () => {
    const domRuntime = await makeRuntime();
    const reactRuntime = await makeRuntime();
    if (domRuntime === reactRuntime) throw new Error("Go WASM instances did not expose separate APIs");
    window.__replacementVersions = {
      react: reactReferenceVersion,
      reactDOM: reactDOMReferenceVersion,
    };
    // Adversarial checks reuse the captured runtime after the traced scenarios.
    // makeRuntime() creates another real Go instance only if a check asks for it.
    window.__replacement = {
      createBackendHost,
      renderers,
      mountGobi,
      mountGobiReact,
      mountReactReference,
      runtime: domRuntime,
      runtimes: { dom: domRuntime, react: reactRuntime },
      makeRuntime,
    };
    return true;
  })().catch((error) => {
    window.__replacementInitError = String(error && error.stack || error);
    throw error;
  });
</script></body></html>`;

function parseArgs(argv) {
  const options = { seed: 20261030, cases: 100, maxActions: 80, output: null, headed: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seed") options.seed = Number(argv[++i]);
    else if (arg === "--cases") options.cases = Number(argv[++i]);
    else if (arg === "--max-actions") options.maxActions = Number(argv[++i]);
    else if (arg === "--output") options.output = resolve(argv[++i]);
    else if (arg === "--headed") options.headed = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown option ${arg}`);
  }
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffff_ffff) {
    throw new Error("--seed must be an unsigned 32-bit integer");
  }
  if (!Number.isInteger(options.cases) || options.cases < 0) throw new Error("--cases must be non-negative");
  if (!Number.isInteger(options.maxActions) || options.maxActions < 1) throw new Error("--max-actions must be positive");
  return options;
}

function usage() {
  return [
    "Usage: node backend-replacement/check.mjs [options]",
    "  --seed N          deterministic unsigned 32-bit seed (default 20261030)",
    "  --cases N         generated scripts (default 100)",
    "  --max-actions N   maximum generated actions per script (default 80)",
    "  --output PATH     JSON report path (default backend-replacement/build/report-seed-N.json)",
    "  --headed          show Chromium while running",
  ].join("\n");
}

/** Return every field whose observable state or mounted browser DOM differs. */
function compareSnapshots(actualSnapshot, actualDOM, expectedSnapshot, expectedDOM) {
  const mismatches = [];
  for (const field of ["state", "tree", "messages"]) {
    if (!isDeepStrictEqual(actualSnapshot?.[field], expectedSnapshot?.[field])) {
      mismatches.push({
        field,
        expected: expectedSnapshot?.[field] ?? null,
        actual: actualSnapshot?.[field] ?? null,
      });
    }
  }
  for (const field of ["html", "disabled", "root"]) {
    if (!isDeepStrictEqual(actualDOM?.[field], expectedDOM?.[field])) {
      mismatches.push({
        field: `dom.${field}`,
        expected: expectedDOM?.[field] ?? null,
        actual: actualDOM?.[field] ?? null,
      });
    }
  }
  for (const [reported, actual] of [["reportedHTML", "html"], ["reportedDisabled", "disabled"]]) {
    if (actualDOM?.[reported] !== undefined && !isDeepStrictEqual(actualDOM[reported], actualDOM[actual])) {
      mismatches.push({ field: `dom.${reported}`, expected: actualDOM[actual] ?? null, actual: actualDOM[reported] });
    }
  }
  return mismatches;
}

function canonical(value) {
  return JSON.stringify(value);
}

function nativeStep(action, hostName = "") {
  if (!action) return null;
  if (action.kind === "click" || action.kind === "stale-click") {
    return { Path: action.Path ?? BUTTON_PATH[action.action] ?? "1", Event: "click", Value: action.Value ?? "" };
  }
  if (action.kind === "swap") {
    return { Path: "", Event: `backend:${action.backend}`, Value: action.host ?? hostName };
  }
  return { Path: "", Event: "backend:unknown", Value: action.host ?? hostName };
}

function nativeTick(index, step, snapshot, dom) {
  return {
    Index: index,
    ...(step ? { Step: { Path: step.Path, Event: step.Event, Value: step.Value } } : {}),
    State: canonical(snapshot.state),
    Tree: canonical(snapshot.tree),
    DOM: dom.root,
  };
}

function compareBrowserErrors(pageErrors, expectedErrors, seed) {
  const mismatches = [];
  const validManifest = Array.isArray(expectedErrors) && expectedErrors.length === 1 &&
    expectedErrors[0]?.probe === "runtime errors fail closed and preserve the last snapshot" &&
    expectedErrors[0]?.source === "window.error" &&
    expectedErrors[0]?.message === EXPECTED_RUNTIME_ERROR;
  if (!validManifest) {
    mismatches.push({
      seed,
      script: "adversarial",
      tick: null,
      kind: "expected-error-manifest",
      field: "expectedErrors",
      expected: [{
        probe: "runtime errors fail closed and preserve the last snapshot",
        source: "window.error",
        message: EXPECTED_RUNTIME_ERROR,
      }],
      actual: expectedErrors ?? [],
    });
  }
  for (const error of pageErrors ?? []) {
    mismatches.push({ seed, script: "browser", tick: null, kind: "browser-error", field: "console", actual: error });
  }
  return mismatches;
}

function htmlResponse(res) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(HTML);
}

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

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
    if (pathname === "/" || pathname === "/index.html") htmlResponse(res);
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
  for (const file of [WASM, WASM_EXEC, REFERENCE_BUNDLE, REACT_BUNDLE]) {
    try {
      await stat(file);
    } catch {
      throw new Error(`missing ${file}; run the backend-replacement build script first`);
    }
  }
}

async function runBrowser(scripts, { headed }) {
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
    await page.waitForFunction(() => window.__replacement || window.__replacementInitError, null, { timeout: 30_000 });
    const initError = await page.evaluate(() => window.__replacementInitError ?? null);
    if (initError) throw new Error(`browser initialization failed:\n${initError}`);
    const versions = await page.evaluate(() => window.__replacementVersions);
    if (versions.react !== "19.3.1" || versions.reactDOM !== "19.3.1") {
      throw new Error(`expected React and ReactDOM 19.3.1, got ${JSON.stringify(versions)}`);
    }

    const result = await page.evaluate((allScripts) => {
      const fixture = window.__replacement;
      const roots = {
        dom: document.getElementById("dom-root"),
        react: document.getElementById("react-root"),
        oracle: document.getElementById("oracle-root"),
      };
      const rawRuntimes = fixture.runtimes;
      const clone = (value) => structuredClone(value);
      const canonical = (value) => JSON.stringify(value);
      const browserNativeStep = (action, hostName = "") => {
        if (!action) return null;
        if (action.kind === "click" || action.kind === "stale-click") {
          return { Path: action.Path ?? "1", Event: "click", Value: action.Value ?? "" };
        }
        if (action.kind === "swap") {
          return { Path: "", Event: `backend:${action.backend}`, Value: action.host ?? hostName };
        }
        return { Path: "", Event: "backend:unknown", Value: action.host ?? hostName };
      };
      const browserNativeTick = (index, step, snapshot, dom) => ({
        Index: index,
        ...(step ? { Step: { Path: step.Path, Event: step.Event, Value: step.Value } } : {}),
        State: canonical(snapshot.state),
        Tree: canonical(snapshot.tree),
        DOM: dom.root,
      });
      const instrumentRuntime = (runtime) => {
        const calls = { init: 0, dispatch: 0 };
        return {
          calls,
          runtime: {
            init() { calls.init++; return runtime.init(); },
            dispatch(step) { calls.dispatch++; return runtime.dispatch(step); },
          },
        };
      };

      // Confirm the two captured WASM APIs own separate sessions. Scenario host
      // creation calls init again, so this probe cannot leak into a trace.
      const isolatedDomInitial = rawRuntimes.dom.init();
      const isolatedReactInitial = rawRuntimes.react.init();
      const isolatedDomAfterAdd = rawRuntimes.dom.dispatch({ Path: "1", Event: "click", Value: "" });
      const isolatedReactReset = rawRuntimes.react.init();
      const isolationProbe = {
        separateAPIObjects: rawRuntimes.dom !== rawRuntimes.react,
        domInitial: clone(isolatedDomInitial),
        reactInitial: clone(isolatedReactInitial),
        domAfterAdd: clone(isolatedDomAfterAdd),
        reactUnaffected: clone(isolatedReactReset),
      };

      const pathFromRoot = (element, top) => {
        const parts = [];
        let node = element;
        while (node && node !== top) {
          const parent = node.parentNode;
          if (!parent) return null;
          parts.push(Array.prototype.indexOf.call(parent.childNodes, node));
          node = parent;
        }
        return node === top ? parts.reverse().join("/") : null;
      };
      const actualDisabledPaths = (container) => {
        const top = container.firstElementChild;
        if (!top) return [];
        return Array.from(top.querySelectorAll("button"))
          .filter((button) => button.disabled)
          .map((button) => pathFromRoot(button, top));
      };
      const rendererDOM = (mount, container) => {
        const reported = mount.domSnapshot();
        return {
          html: container.innerHTML,
          disabled: actualDisabledPaths(container),
          root: container.firstElementChild?.outerHTML ?? "",
          reportedHTML: reported.html,
          reportedDisabled: reported.disabled,
        };
      };
      const sampleMount = (mount, container) => ({
        snapshot: mount.snapshot(),
        dom: rendererDOM(mount, container),
      });
      const capture = (hosts, oracleMount) => ({
        backendNames: {
          dom: hosts.dom.backendName(),
          react: hosts.react.backendName(),
        },
        go: {
          dom: sampleMount(hosts.dom, roots.dom),
          react: sampleMount(hosts.react, roots.react),
        },
        oracle: sampleMount(oracleMount, roots.oracle),
      });
      const tickFor = (captureNow, index, kind, action, step, runtimeCalls) => ({
        index,
        kind,
        action: action ? clone(action) : null,
        step: step ? clone(step) : null,
        backendNames: clone(captureNow.backendNames),
        go: clone(captureNow.go),
        oracle: clone(captureNow.oracle),
        runtimeCalls: clone(runtimeCalls),
      });

      const scenarios = [];
      for (const [scriptIndex, script] of allScripts.entries()) {
        if (scriptIndex > 0) {
          // The previous host unmounted both roots and the independent oracle.
          roots.dom.replaceChildren();
          roots.react.replaceChildren();
          roots.oracle.replaceChildren();
        }
        const domInstrument = instrumentRuntime(rawRuntimes.dom);
        const reactInstrument = instrumentRuntime(rawRuntimes.react);
        const hosts = {
          dom: fixture.createBackendHost(roots.dom, domInstrument.runtime, fixture.renderers, "dom"),
          react: fixture.createBackendHost(roots.react, reactInstrument.runtime, fixture.renderers, "react"),
        };
        const oracleMount = fixture.mountReactReference(roots.oracle);
        if (hosts.dom.backendName() !== "dom" || hosts.react.backendName() !== "react") {
          throw new Error("candidate hosts did not start on their requested backends");
        }

        const scenario = {
          name: script.name,
          seed: script.seed ?? null,
          actions: clone(script.actions),
          ticks: [],
          nativeTicks: [],
          rejectedBackendAttempts: [],
        };
        const runtimeCalls = () => ({ dom: domInstrument.calls, react: reactInstrument.calls });
        const record = (kind, action = null, step = null) => {
          const current = capture(hosts, oracleMount);
          const index = scenario.ticks.length;
          scenario.ticks.push(tickFor(current, index, kind, action, step, runtimeCalls()));
          const effectiveStep = index === 0 ? null : (step ?? browserNativeStep(action));
          scenario.nativeTicks.push({
            oracle: browserNativeTick(index, effectiveStep, current.oracle.snapshot, current.oracle.dom),
            dom: browserNativeTick(index, effectiveStep, current.go.dom.snapshot, current.go.dom.dom),
            react: browserNativeTick(index, effectiveStep, current.go.react.snapshot, current.go.react.dom),
          });
          return current;
        };

        record("initial");
        for (const action of script.actions) {
          if (action.kind === "click") {
            hosts.dom.click(action.Path);
            hosts.react.click(action.Path);
            oracleMount.click(action.Path);
            record("click", action, browserNativeStep(action));
            continue;
          }

          if (action.kind === "swap") {
            const host = hosts[action.host];
            const root = roots[action.host];
            if (!host || !root) throw new Error(`unknown host in swap: ${action.host}`);
            const previousBackend = host.backendName();
            const staleAdd = root.querySelector("button.add");
            host.replaceBackend(action.backend);
            const actualBackend = host.backendName();
            if (actualBackend !== action.backend) {
              throw new Error(`host ${action.host} requested ${action.backend}, got ${actualBackend}`);
            }
            record("swap", action, browserNativeStep(action));
            if (previousBackend !== actualBackend && staleAdd) {
              const staleAction = {
                kind: "stale-click",
                host: action.host,
                fromBackend: previousBackend,
                toBackend: actualBackend,
                Path: "1",
                Event: "click",
                Value: "",
                action: "add",
              };
              staleAdd.click();
              record("stale-click", staleAction, browserNativeStep(staleAction));
            }
            continue;
          }

          if (action.kind === "unknown-backend") {
            const host = hosts[action.host];
            if (!host) throw new Error(`unknown host in failed replacement: ${action.host}`);
            const before = {
              backend: host.backendName(),
              sample: sampleMount(host, roots[action.host]),
            };
            let error = null;
            try { host.replaceBackend(action.backend); }
            catch (caught) { error = String(caught && caught.message || caught); }
            const after = {
              backend: host.backendName(),
              sample: sampleMount(host, roots[action.host]),
            };
            const failure = {
              host: action.host,
              requestedBackend: action.backend,
              error,
              backendUnchanged: before.backend === after.backend,
              snapshotUnchanged: canonical(before.sample) === canonical(after.sample),
            };
            scenario.rejectedBackendAttempts.push(failure);
            record("unknown-backend", action, browserNativeStep(action));
            continue;
          }

          throw new Error(`unknown scenario action kind ${JSON.stringify(action.kind)}`);
        }

        scenario.runtimeCalls = clone(runtimeCalls());
        hosts.dom.unmount();
        hosts.react.unmount();
        oracleMount.unmount();
        scenarios.push(scenario);
      }

      return {
        isolationProbe,
        scenarios,
        pageErrors: clone(window.__replacementGoErrors ?? []),
      };
    }, scripts);
    // The adversarial probes deliberately reset and exercise runtime state, so
    // run them after every reproducible parity trace has been captured.
    result.adversarial = await runAdversarial(page);
    result.pageErrors = [...result.pageErrors, ...pageErrors];
    return { ...result, browserVersion: browser.version() };
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function compareEveryTick(result, seed) {
  const mismatches = [];
  for (const scenario of result.scenarios) {
    for (const tick of scenario.ticks) {
      for (const candidate of ["dom", "react"]) {
        for (const difference of compareSnapshots(
          tick.go[candidate].snapshot,
          tick.go[candidate].dom,
          tick.oracle.snapshot,
          tick.oracle.dom,
        )) {
          mismatches.push({
            seed: scenario.seed ?? seed,
            script: scenario.name,
            tick: tick.index,
            kind: tick.kind,
            candidate,
            ...difference,
          });
        }
      }
      for (const difference of compareSnapshots(
        tick.go.dom.snapshot,
        tick.go.dom.dom,
        tick.go.react.snapshot,
        tick.go.react.dom,
      )) {
        mismatches.push({
          seed: scenario.seed ?? seed,
          script: scenario.name,
          tick: tick.index,
          kind: tick.kind,
          candidate: "dom-vs-react-host",
          ...difference,
        });
      }
    }

    for (const [candidate, initial] of [["dom", "dom"], ["react", "react"]]) {
      if (scenario.ticks[0]?.backendNames?.[candidate] !== initial) {
        mismatches.push({
          seed: scenario.seed ?? seed,
          script: scenario.name,
          tick: 0,
          kind: "initial",
          candidate,
          field: "backendName",
          expected: initial,
          actual: scenario.ticks[0]?.backendNames?.[candidate] ?? null,
        });
      }
    }

    for (const attempt of scenario.rejectedBackendAttempts) {
      if (!attempt.error || !attempt.backendUnchanged || !attempt.snapshotUnchanged) {
        mismatches.push({
          seed: scenario.seed ?? seed,
          script: scenario.name,
          tick: null,
          kind: "unknown-backend",
          candidate: attempt.host,
          field: "unknown-backend-failure",
          expected: "throw and preserve backend, snapshot, DOM, and messages",
          actual: attempt,
        });
      }
    }

    for (const candidate of ["dom", "react"]) {
      const calls = scenario.runtimeCalls?.[candidate];
      if (!calls || calls.init !== 1) {
        mismatches.push({
          seed: scenario.seed ?? seed,
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
          seed: scenario.seed ?? seed,
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

  const isolation = result.isolationProbe;
  const isolationOK = isolation?.separateAPIObjects === true &&
    isolation.domAfterAdd?.state?.Count === 1 &&
    isolation.domAfterAdd?.messages?.length === 1 &&
    isolation.reactUnaffected?.state?.Count === 0 &&
    isolation.reactUnaffected?.messages?.length === 0;
  if (!isolationOK) {
    mismatches.push({
      seed,
      script: "wasm-instance-isolation",
      tick: null,
      kind: "instance-probe",
      candidate: "dom-vs-react-wasm",
      field: "isolation",
      expected: "adding to one Go WASM instance leaves the other at count 0 with no messages",
      actual: isolation ?? null,
    });
  }
  const adversarialProbes = Array.isArray(result.adversarial)
    ? result.adversarial
    : (result.adversarial?.probes ?? []);
  mismatches.push(...compareBrowserErrors(result.pageErrors, result.adversarial?.expectedErrors, seed));
  for (const probe of adversarialProbes) {
    if (!probe.pass) {
      mismatches.push({
        seed,
        script: "adversarial",
        tick: null,
        kind: "adversarial-probe",
        field: probe.name,
        actual: probe.observations,
      });
    }
  }
  return mismatches;
}

function buildNativeComparator(reportDir) {
  if (process.env.GO_COMPARE_BIN) {
    return { status: "ready", file: resolve(process.env.GO_COMPARE_BIN), args: [] };
  }
  const file = resolve(reportDir, "compare-interaction.local");
  const built = spawnSync("go", ["build", "-o", file, "./cmd/compare-interaction"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "local" },
    maxBuffer: 8 * 1024 * 1024,
  });
  if (built.error?.code === "ENOENT") return { status: "unavailable", message: "Go and GO_COMPARE_BIN are unavailable." };
  if (built.error || built.status !== 0) {
    return { status: "error", error: String(built.error ?? built.stderr ?? `go build exited ${built.status}`), stderr: built.stderr ?? "" };
  }
  return { status: "ready", file, args: [] };
}

async function compareNative(ticks, reportDir, seed, scriptIndex, candidate, command) {
  const inputPath = resolve(reportDir, `native-input-seed-${seed}-script-${scriptIndex}-${candidate}.json`);
  const input = {
    golden: {
      Implementation: "independent React 19.3.1 browser reference",
      Ticks: ticks.map(({ oracle }) => oracle),
    },
    candidate: {
      Implementation: candidate === "dom" ? "Go WASM through dom backend host" : "Go WASM through React backend host",
      Ticks: ticks.map((tick) => tick[candidate]),
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

async function addNativeComparisons(result, reportDir, seed, command, mismatches) {
  const comparisons = [];
  for (const [scriptIndex, scenario] of result.scenarios.entries()) {
    for (const candidate of ["dom", "react"]) {
      const comparison = await compareNative(scenario.nativeTicks, reportDir, seed, scriptIndex, candidate, command);
      comparisons.push({ script: scenario.name, candidate, ...comparison });
      if (comparison.status !== "matched") {
        mismatches.push({
          seed: scenario.seed ?? seed,
          script: scenario.name,
          tick: comparison.diff?.Tick ?? null,
          kind: "native-trace-comparison",
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
  const scripts = [
    ...fixedScripts.map((script) => ({ ...script, seed: options.seed })),
    ...seededScripts(options.seed, { cases: options.cases, maxActions: options.maxActions }),
  ];
  const result = await runBrowser(scripts, options);
  const mismatches = compareEveryTick(result, options.seed);
  const reportPath = options.output ?? resolve(BUILD_DIR, `report-seed-${options.seed}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  const nativeCommand = buildNativeComparator(dirname(reportPath));
  const nativeComparison = await addNativeComparisons(result, dirname(reportPath), options.seed, nativeCommand, mismatches);
  const report = {
    seed: options.seed,
    generatedCases: options.cases,
    maxActionsPerGeneratedCase: options.maxActions,
    invocation: { seed: options.seed, cases: options.cases, maxActions: options.maxActions },
    react: "19.3.1",
    browser: { name: "Chromium", version: result.browserVersion, executable: process.env.CHROMIUM_EXECUTABLE_PATH ?? "Playwright-managed" },
    wasmInstanceIsolation: result.isolationProbe,
    adversarial: result.adversarial,
    expectedErrors: result.adversarial?.expectedErrors ?? [],
    scenarios: result.scenarios.map(({ nativeTicks, ...scenario }) => scenario),
    mismatches,
    nativeComparison,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  const totalTicks = result.scenarios.reduce((sum, scenario) => sum + scenario.ticks.length, 0);
  if (mismatches.length > 0) {
    console.error(`backend replacement parity failed: ${mismatches.length} mismatch(es) across ${totalTicks} recorded ticks`);
    for (const mismatch of mismatches.slice(0, 12)) {
      console.error(`seed=${mismatch.seed} script=${mismatch.script} tick=${mismatch.tick} kind=${mismatch.kind} candidate=${mismatch.candidate ?? "-"} field=${mismatch.field}`);
    }
    console.error(`full traces: ${reportPath}`);
    process.exitCode = 1;
    return;
  }
  console.log(`backend replacement parity matched ${scripts.length} scripts over ${totalTicks} initial/action ticks (seed ${options.seed})`);
  console.log(`native Gobi trace comparison: ${nativeComparison.status}`);
  console.log(`full traces: ${reportPath}`);
}

export { compareBrowserErrors, compareSnapshots, nativeStep, parseArgs, runBrowser };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
