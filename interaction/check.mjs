#!/usr/bin/env node
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { chromium } from "playwright";
import { BUTTON_PATH, fixedScripts, seededScripts } from "./scripts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const BUILD_DIR = resolve(HERE, "build");
const REACT_BUNDLE = resolve(BUILD_DIR, "react-reference.bundle.mjs");
const WASM = resolve(BUILD_DIR, "counter.wasm");
const WASM_EXEC = resolve(BUILD_DIR, "wasm_exec.js");

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Gobi counter parity</title></head>
<body><main><div id="gobi-root"></div><div id="react-root"></div></main>
<script src="/interaction/build/wasm_exec.js"></script>
<script type="module">
  import { mountGobi } from "/interaction/dom.mjs";
  import { mountReactReference, reactReferenceVersion, reactDOMReferenceVersion }
    from "/interaction/build/react-reference.bundle.mjs";

  window.__parityReady = (async () => {
    const go = new Go();
    const response = await fetch("/interaction/build/counter.wasm");
    if (!response.ok) throw new Error("WASM request failed: " + response.status);
    const { instance } = await WebAssembly.instantiateStreaming(response, go.importObject);
    void go.run(instance);
    for (let attempt = 0; attempt < 500; attempt++) {
      if (globalThis.gobiCounter && typeof globalThis.gobiCounter.init === "function") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!globalThis.gobiCounter || typeof globalThis.gobiCounter.init !== "function") {
      throw new Error("WASM counter did not publish globalThis.gobiCounter.init()");
    }
    window.__reactVersions = { react: reactReferenceVersion, reactDOM: reactDOMReferenceVersion };
    window.__mountGobi = mountGobi;
    window.__mountReactReference = mountReactReference;
    window.gobiMount = mountGobi(document.getElementById("gobi-root"), globalThis.gobiCounter);
    window.reactMount = mountReactReference(document.getElementById("react-root"));
    return true;
  })().catch((error) => {
    window.__parityInitError = String(error && error.stack || error);
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
    "Usage: node interaction/check.mjs [options]",
    "  --seed N          deterministic unsigned 32-bit seed (default 20261030)",
    "  --cases N         generated scripts (default 100)",
    "  --max-actions N   maximum actions per generated script (default 80)",
    "  --output PATH     JSON report path (default interaction/build/interaction-traces-seed-N.json)",
    "  --headed          show Chromium while running",
  ].join("\n");
}

function compareSnapshots(gobiSnapshot, gobiDOM, reactSnapshot, reactDOM) {
  const mismatches = [];
  for (const field of ["state", "tree", "messages"]) {
    if (!isDeepStrictEqual(gobiSnapshot?.[field], reactSnapshot?.[field])) {
      mismatches.push({
        field,
        expected: reactSnapshot?.[field] ?? null,
        actual: gobiSnapshot?.[field] ?? null,
      });
    }
  }
  if (!isDeepStrictEqual(gobiDOM?.html, reactDOM?.html)) {
    mismatches.push({ field: "dom.html", expected: reactDOM?.html ?? null, actual: gobiDOM?.html ?? null });
  }
  if (!isDeepStrictEqual(gobiDOM?.disabled, reactDOM?.disabled)) {
    mismatches.push({
      field: "dom.disabled",
      expected: reactDOM?.disabled ?? null,
      actual: gobiDOM?.disabled ?? null,
    });
  }
  return mismatches;
}

function canonical(value) {
  return JSON.stringify(value);
}

function tickForNative(index, step, gobiSnapshot, reactSnapshot, gobiDOM, reactDOM) {
  const tick = (snapshot, dom) => ({
    Index: index,
    ...(step ? { Step: { Path: step.Path, Event: step.Event, Value: step.Value } } : {}),
    State: canonical(snapshot.state),
    Tree: canonical(snapshot.tree),
    DOM: dom.root,
  });
  return { golden: tick(reactSnapshot, reactDOM), candidate: tick(gobiSnapshot, gobiDOM) };
}

function normalizeDOM(mount, container) {
  const rendered = mount.domSnapshot();
  const root = container.firstElementChild;
  return {
    html: rendered.html,
    // This mirrors the native comparator's canonical outerHTML contract while the
    // separate disabled paths check native button activation behavior.
    root: root ? root.outerHTML : "",
    disabled: rendered.disabled,
  };
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
  for (const file of [WASM, WASM_EXEC, REACT_BUNDLE]) {
    try {
      await stat(file);
    } catch {
      throw new Error(`missing ${file}; run the interaction build script first`);
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
    await page.waitForFunction(() => (window.gobiMount && window.reactMount) || window.__parityInitError, null, { timeout: 30_000 });
    const initError = await page.evaluate(() => window.__parityInitError ?? null);
    if (initError) throw new Error(`browser initialization failed:\n${initError}`);
    const versions = await page.evaluate(() => window.__reactVersions);
    if (versions.react !== "19.3.1" || versions.reactDOM !== "19.3.1") {
      throw new Error(`expected React and ReactDOM 19.3.1, got ${JSON.stringify(versions)}`);
    }

    const result = await page.evaluate((allScripts) => {
      let gobiMount = window.gobiMount;
      let reactMount = window.reactMount;
      const gobiContainer = document.getElementById("gobi-root");
      const reactContainer = document.getElementById("react-root");
      const freshSession = () => {
        gobiMount.unmount();
        reactMount.unmount();
        gobiMount = window.gobiMount = window.__mountGobi(gobiContainer, globalThis.gobiCounter);
        reactMount = window.reactMount = window.__mountReactReference(reactContainer);
      };
      const sample = () => {
        const gobi = gobiMount.snapshot();
        const react = reactMount.snapshot();
        const gobiDOMSnapshot = gobiMount.domSnapshot();
        const reactDOMSnapshot = reactMount.domSnapshot();
        const gobiDOM = {
          html: gobiDOMSnapshot.html,
          root: gobiContainer.firstElementChild?.outerHTML ?? "",
          disabled: gobiDOMSnapshot.disabled,
        };
        const reactDOM = {
          html: reactDOMSnapshot.html,
          root: reactContainer.firstElementChild?.outerHTML ?? "",
          disabled: reactDOMSnapshot.disabled,
        };
        return { gobi, react, gobiDOM, reactDOM };
      };
      const clone = (value) => structuredClone(value);
      const scenarios = [];
      for (const [scriptIndex, script] of allScripts.entries()) {
        if (scriptIndex > 0) freshSession();
        const scenario = {
          name: script.name,
          seed: script.seed ?? null,
          actions: clone(script.actions),
          ticks: [],
          nativeTicks: [],
        };
        let nativeIndex = 0;
        let sampleNow = sample();
        scenario.ticks.push({ index: 0, action: null, ...clone(sampleNow) });
        scenario.nativeTicks.push({
          golden: {
            Index: nativeIndex,
            State: JSON.stringify(sampleNow.react.state),
            Tree: JSON.stringify(sampleNow.react.tree),
            DOM: sampleNow.reactDOM.root,
          },
          candidate: {
            Index: nativeIndex,
            State: JSON.stringify(sampleNow.gobi.state),
            Tree: JSON.stringify(sampleNow.gobi.tree),
            DOM: sampleNow.gobiDOM.root,
          },
        });

        for (const action of script.actions) {
          // Each scenario runs in one browser task. All native button clicks in a
          // burst happen before Node receives a snapshot; sync React flushes keep
          // every event tick deterministic and ordered.
          gobiMount.click(action.Path);
          reactMount.click(action.Path);
          sampleNow = sample();
          const step = { Path: action.Path, Event: action.Event, Value: action.Value };
          nativeIndex++;
          scenario.nativeTicks.push({
            golden: {
              Index: nativeIndex,
              Step: step,
              State: JSON.stringify(sampleNow.react.state),
              Tree: JSON.stringify(sampleNow.react.tree),
              DOM: sampleNow.reactDOM.root,
            },
            candidate: {
              Index: nativeIndex,
              Step: step,
              State: JSON.stringify(sampleNow.gobi.state),
              Tree: JSON.stringify(sampleNow.gobi.tree),
              DOM: sampleNow.gobiDOM.root,
            },
          });
          scenario.ticks.push({ index: scenario.ticks.length, action: clone(action), ...clone(sampleNow) });
        }
        scenarios.push(scenario);
      }
      return { scenarios, pageErrors: clone(window.__pageErrors ?? []) };
    }, scripts);
    result.pageErrors = [...result.pageErrors, ...pageErrors];

    const demoPage = await browser.newPage();
    demoPage.on("pageerror", (error) => result.pageErrors.push(String(error?.stack ?? error)));
    demoPage.on("console", (message) => {
      if (message.type() === "error") result.pageErrors.push(message.text());
    });
    await demoPage.goto(`${url}interaction/demo.html`, { waitUntil: "load" });
    await demoPage.waitForFunction(() => window.gobiCounterMount || document.querySelector("#snapshot")?.textContent !== "Loading Go WebAssembly…", null, { timeout: 30_000 });
    result.demoSmoke = await demoPage.evaluate(() => {
      const mounted = window.gobiCounterMount;
      const read = () => JSON.parse(document.querySelector("#snapshot").textContent);
      if (!mounted) return { error: document.querySelector("#snapshot").textContent };
      const initial = read();
      mounted.click("1");
      const afterAdd = read();
      mounted.click("2");
      const afterReset = read();
      mounted.click("2");
      const afterDisabledReset = read();
      return { initial, afterAdd, afterReset, afterDisabledReset };
    });
    return { ...result, browserVersion: browser.version() };
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function addComparisonMismatches(result, seed) {
  const mismatches = [];
  for (const scenario of result.scenarios) {
    for (const tick of scenario.ticks) {
      const differences = compareSnapshots(tick.gobi, tick.gobiDOM, tick.react, tick.reactDOM);
      for (const difference of differences) {
        mismatches.push({
          seed: scenario.seed ?? seed,
          script: scenario.name,
          tick: tick.index,
          path: tick.action?.Path ?? "<initial>",
          action: tick.action?.action ?? "initial",
          ...difference,
        });
      }
    }
  }
  return mismatches;
}

function addDemoMismatches(smoke, seed) {
  const mismatches = [];
  if (!smoke || smoke.error) {
    return [{ seed, script: "mounted-demo", tick: null, path: "<demo>", action: "load", field: "demo", actual: smoke?.error ?? "missing smoke result" }];
  }
  const check = (tick, field, actual, expected) => {
    if (!isDeepStrictEqual(actual, expected)) {
      mismatches.push({ seed, script: "mounted-demo", tick, path: "<demo>", action: tick, field, expected, actual });
    }
  };
  const state = (tick) => smoke[tick]?.runtime?.state?.Count;
  const messages = (tick) => smoke[tick]?.runtime?.messages;
  const disabled = (tick) => smoke[tick]?.dom?.disabled;
  check("initial", "state.Count", state("initial"), 0);
  check("initial", "dom.disabled", disabled("initial"), ["2"]);
  check("initial", "messages", messages("initial"), []);
  check("afterAdd", "state.Count", state("afterAdd"), 1);
  check("afterAdd", "dom.disabled", disabled("afterAdd"), []);
  check("afterAdd", "messages", messages("afterAdd"), [{ Name: "add", Arg: "" }]);
  check("afterReset", "state.Count", state("afterReset"), 0);
  check("afterReset", "dom.disabled", disabled("afterReset"), ["2"]);
  check("afterReset", "messages", messages("afterReset"), [
    { Name: "add", Arg: "" },
    { Name: "reset", Arg: "" },
  ]);
  check("afterDisabledReset", "state.Count", state("afterDisabledReset"), 0);
  check("afterDisabledReset", "messages", messages("afterDisabledReset"), messages("afterReset"));
  check("afterDisabledReset", "dom.disabled", disabled("afterDisabledReset"), ["2"]);
  return mismatches;
}

function buildNativeComparator(reportDir) {
  if (process.env.GO_COMPARE_BIN) return { status: "ready", file: process.env.GO_COMPARE_BIN, args: [] };
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

function compareNative(nativeTicks, reportDir, seed, scriptIndex, command) {
  const inputPath = resolve(reportDir, `native-input-seed-${seed}-script-${scriptIndex}.json`);
  const input = {
    golden: {
      Implementation: "React 19.3.1 browser reference",
      Ticks: nativeTicks.map(({ golden }) => golden),
    },
    candidate: {
      Implementation: "Gobi counter WASM",
      Ticks: nativeTicks.map(({ candidate }) => candidate),
    },
  };
  const write = writeFile(inputPath, JSON.stringify(input, null, 2));
  return write.then(() => {
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
  });
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
  const allMismatches = addComparisonMismatches(result, options.seed);
  allMismatches.push(...addDemoMismatches(result.demoSmoke, options.seed));
  if (result.pageErrors.length > 0) {
    for (const error of result.pageErrors) allMismatches.push({ seed: options.seed, script: "browser", tick: null, path: "<runtime>", action: "browser-error", field: "console", actual: error });
  }

  const reportPath = options.output ?? resolve(BUILD_DIR, `interaction-traces-seed-${options.seed}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  const nativeCommand = buildNativeComparator(dirname(reportPath));
  const nativeComparisons = [];
  for (const [scriptIndex, scenario] of result.scenarios.entries()) {
    const comparison = await compareNative(scenario.nativeTicks, dirname(reportPath), options.seed, scriptIndex, nativeCommand);
    nativeComparisons.push({ script: scenario.name, ...comparison });
    if (comparison.status !== "matched") {
      allMismatches.push({
        seed: scenario.seed ?? options.seed,
        script: scenario.name,
        tick: comparison.diff?.Tick ?? null,
        path: comparison.diff?.Part ?? "<native> error",
        action: "compare-interaction",
        field: comparison.diff?.Part ?? comparison.status,
        actual: comparison.diff?.Got ?? comparison.stderr ?? comparison.error ?? comparison.message,
        expected: comparison.diff?.Want,
      });
    }
  }
  const nativeComparison = {
    status: nativeComparisons.every((comparison) => comparison.status === "matched") ? "matched" : "failed",
    comparator: nativeCommand.status,
    scenarios: nativeComparisons,
  };
  const report = {
    seed: options.seed,
    generatedCases: options.cases,
    maxActionsPerGeneratedCase: options.maxActions,
    invocation: { seed: options.seed, cases: options.cases, maxActions: options.maxActions },
    react: "19.3.1",
    browser: { name: "Chromium", version: result.browserVersion, executable: process.env.CHROMIUM_EXECUTABLE_PATH ?? "Playwright-managed" },
    demoSmoke: result.demoSmoke,
    scenarios: result.scenarios.map(({ nativeTicks, ...scenario }) => scenario),
    mismatches: allMismatches,
    nativeComparison,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  const totalTicks = result.scenarios.reduce((sum, scenario) => sum + scenario.ticks.length, 0);
  if (allMismatches.length > 0) {
    console.error(`interaction parity failed: ${allMismatches.length} mismatch(es) across ${totalTicks} recorded ticks`);
    for (const mismatch of allMismatches.slice(0, 12)) {
      console.error(`seed=${mismatch.seed} script=${mismatch.script} tick=${mismatch.tick} path=${mismatch.path} action=${mismatch.action} field=${mismatch.field}`);
    }
    console.error(`full traces: ${reportPath}`);
    process.exitCode = 1;
    return;
  }
  console.log(`interaction parity matched ${scripts.length} scripts over ${totalTicks} initial/action ticks (seed ${options.seed})`);
  console.log(`native comparator: ${nativeComparison.status}`);
  console.log(`full traces: ${reportPath}`);
}

export { compareSnapshots, normalizeDOM, tickForNative };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
