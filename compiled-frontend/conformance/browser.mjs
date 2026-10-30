import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { assertExactTraceValue } from "./compare.mjs";
import { expectedDOMSnapshots } from "./dom-oracle.mjs";
import { validateFixtureExpectations } from "./fixture-expectations.mjs";
import { installNoWasmGuards } from "./no-wasm.mjs";
import { assertStableProvenance, captureConformanceProvenance } from "./provenance.mjs";
import { validateHostScript, validateTrace } from "./trace.mjs";

const REPOSITORY = resolve(dirname(new URL(import.meta.url).pathname), "../..");
const RUNTIME = join(REPOSITORY, "compiled-frontend/frontend/runtime/runtime.mjs");
const RENDERER = join(REPOSITORY, "compiled-frontend/frontend/react/renderer.mjs");
const OBSERVED_ACTION = join(REPOSITORY, "compiled-frontend/conformance/observed-action.mjs");
const ESBUILD = join(REPOSITORY, "interaction/node_modules/esbuild/lib/main.js");

function literal(value) {
  return JSON.stringify(value);
}

export function chromiumLaunchOptions(chromiumPath) {
  return {
    headless: true,
    ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  };
}

function failureArtifactPaths(outputPath) {
  const output = resolve(outputPath);
  const failure = output.endsWith(".json")
    ? output.slice(0, -".json".length) + ".failed.json"
    : `${output}.failed.json`;
  return {
    failure,
    manifest: failure.slice(0, -".json".length) + ".manifest.json",
    bundle: failure.slice(0, -".json".length) + ".bundle.mjs",
  };
}

function changedInputs(before, after, ignoredPaths = []) {
  if (!before || !after) return null;
  const ignored = new Set(ignoredPaths.map((path) => resolve(path)));
  const beforeByPath = new Map(before.inputs.map((input) => [input.path, input.sha256]));
  const afterByPath = new Map(after.inputs.map((input) => [input.path, input.sha256]));
  return [...new Set([...beforeByPath.keys(), ...afterByPath.keys()])].sort()
    .filter((path) => !ignored.has(resolve(path)))
    .filter((path) => beforeByPath.get(path) !== afterByPath.get(path));
}

function withoutBrowserBundle(provenance, bundlePath) {
  const bundle = resolve(bundlePath);
  return { ...provenance, inputs: provenance.inputs.filter((input) => resolve(input.path) !== bundle) };
}

async function bestEffort(capture) {
  try { return await capture(); }
  catch (error) { return { captureError: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }; }
}

async function collectBrowserFailure(page) {
  if (!page) return null;
  return bestEffort(() => page.evaluate(() => {
    const api = window.__gobiConformance;
    const safely = (operation) => {
      try { return operation(); }
      catch (error) { return { captureError: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }; }
    };
    const root = document.getElementById("app");
    return {
      trace: safely(() => api?.trace?.() ?? null),
      snapshot: safely(() => api?.snapshot?.() ?? null),
      runtimeFailure: safely(() => api?.failure?.() ?? null),
      effectRequests: safely(() => api?.hostRequests?.() ?? null),
      effectCompletions: safely(() => api?.hostCompletions?.() ?? null),
      callbacks: safely(() => api?.callbacks?.() ?? null),
      observations: safely(() => api?.observations?.() ?? null),
      physicalDOM: root === null ? null : {
        html: root.innerHTML,
        controls: [...root.querySelectorAll("input,button,textarea,select")].map((node) => ({
          tag: node.tagName.toLowerCase(),
          type: typeof node.type === "string" ? node.type : "",
          value: typeof node.value === "string" ? node.value : "",
          checked: typeof node.checked === "boolean" ? node.checked : false,
          disabled: typeof node.disabled === "boolean" ? node.disabled : false,
        })),
      },
      wasmAPIAttempts: window.__gobiNoWasmAttempts ?? null,
    };
  }));
}

async function writeBrowserFailure({ outputPath, compiledPath, helpersPath, fixturePath, command, fixtureScript,
  component, stage, actionIndex, error, page, pageErrors, browser, noWasm, provenanceBefore, baseProvenanceBefore, bundlePath }) {
  const paths = failureArtifactPaths(outputPath);
  const provenanceStart = provenanceBefore ?? baseProvenanceBefore;
  const provenanceAfter = await bestEffort(() => captureConformanceProvenance({
    compiledPath,
    helpersPath,
    fixturePath,
    ...(bundlePath ? { browserBundlePath: bundlePath } : {}),
    command,
  }));
  const validAfter = provenanceAfter?.schema === "gobi.conformance-provenance/v1" ? provenanceAfter : null;
  const changed = changedInputs(provenanceStart, validAfter);
  const baseChanged = provenanceBefore && baseProvenanceBefore && bundlePath
    ? changedInputs(baseProvenanceBefore, withoutBrowserBundle(provenanceBefore, bundlePath))
    : null;
  const stable = changed === null ? null : changed.length === 0 && (baseChanged === null || baseChanged.length === 0);
  let bundleEvidence = null;
  if (bundlePath) {
    const savedBundle = await bestEffort(async () => {
      const contents = await readFile(bundlePath);
      await writeFile(paths.bundle, contents);
      return {
        path: paths.bundle,
        sha256: createHash("sha256").update(contents).digest("hex"),
        bytes: contents.length,
      };
    });
    bundleEvidence = savedBundle;
  }
  const failure = {
    schema: "gobi.browser-conformance-failure/v1",
    status: "rejected",
    appId: component?.id ?? null,
    fixture: fixtureScript?.name ?? null,
    requestedAction: Number.isSafeInteger(actionIndex) ? fixtureScript?.actions?.[actionIndex] ?? null : null,
    browser: browser ? await bestEffort(() => browser.version()) : null,
    stage,
    actionIndex,
    error: {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    },
    partialBrowserEvidence: await collectBrowserFailure(page),
    pageErrors,
    noWasmRequests: noWasm?.requests ?? null,
    provenance: {
      baseBefore: baseProvenanceBefore,
      before: provenanceStart,
      after: validAfter ?? provenanceAfter,
      changedInputs: changed,
      baseChangedInputs: baseChanged,
      stable,
    },
    browserBundle: bundleEvidence,
  };
  const serialized = `${JSON.stringify(failure, null, 2)}\n`;
  await mkdir(dirname(paths.failure), { recursive: true });
  await writeFile(paths.failure, serialized, "utf8");
  const manifest = {
    schema: "gobi.browser-conformance-failure-manifest/v1",
    failurePath: paths.failure,
    failureSha256: createHash("sha256").update(serialized).digest("hex"),
    failureBytes: Buffer.byteLength(serialized),
    sourceHashesBefore: provenanceStart?.inputs ?? null,
    sourceHashesAfter: validAfter?.inputs ?? null,
    sourceHashesStable: failure.provenance.stable,
    browserBundle: bundleEvidence,
  };
  await writeFile(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { failurePath: paths.failure, manifestPath: paths.manifest, bundlePath: bundleEvidence?.path ?? null };
}

function makeBrowserEntry({ compiledPath, helpersPath, observedActionPath }) {
  return `
import { mountCompiledApp, createDeterministicEffectHost } from ${literal(RUNTIME)};
import { createReactRenderer } from ${literal(RENDERER)};
import { associateObservedAction } from ${literal(observedActionPath)};
import { gobiCompiled } from ${literal(compiledPath)};
import * as encoder from ${literal(helpersPath)};

const callbacks = { dispatch: 0, stale: 0 };
let activeIntent = null;
let instance = null;
const observations = { dispatch: [], stale: [], requests: [] };

function associate(observed) {
  if (activeIntent === null) throw new Error("browser callback arrived without a requested Action intent");
  return associateObservedAction(observed, activeIntent);
}

function makeRenderer(container, strictMode) {
  const base = createReactRenderer({ container, strictMode });
  const renderer = {
    update(view, hooks) {
      return base.update(view, {
        dispatch(observed, message) {
          callbacks.dispatch += 1;
          const action = associate(observed);
          observations.dispatch.push({ observed: structuredClone(observed), action, message: structuredClone(message) });
          return hooks.dispatch(action, message);
        },
        onStaleAction(observed, renderEpoch) {
          callbacks.stale += 1;
          const action = associate(observed);
          observations.stale.push({ observed: structuredClone(observed), action, renderEpoch });
          return hooks.onStaleAction(action, renderEpoch);
        },
      });
    },
    viewRecord: (...args) => base.viewRecord(...args),
    domSnapshot: (...args) => base.domSnapshot(...args),
    focusState: (...args) => base.focusState(...args),
    restoreFocus: (...args) => base.restoreFocus(...args),
    unmount: (...args) => base.unmount(...args),
    base,
  };
  return renderer;
}

window.__gobiConformance = {
  compiled: gobiCompiled,
  mount({ fixtureScript, componentId, appId, strictMode }) {
    const container = document.getElementById("app");
    if (!container) throw new Error("#app container is missing");
    const renderer = makeRenderer(container, strictMode);
    let runtime = null;
    const host = createDeterministicEffectHost(fixtureScript.hostScript, {
      onRequest(request) {
        if (!runtime) throw new Error("effect requested before runtime mount completed");
        observations.requests.push({ request, snapshot: runtime.snapshot(), tickCount: runtime.trace().ticks.length });
      },
    });
    runtime = mountCompiledApp({
      module: gobiCompiled,
      componentId,
      appId,
      encoder: { gobiEncodeState: encoder.gobiEncodeState },
      renderer,
      effectHost: host,
    });
    instance = { runtime, renderer, host };
    return {
      ticks: runtime.trace().ticks.length,
      strictMode,
      componentId,
    };
  },
  setIntent(action) { activeIntent = structuredClone(action); },
  clearIntent() { activeIntent = null; },
  trace() { return instance.runtime.trace(); },
  snapshot() { return instance.runtime.snapshot(); },
  failure() { return instance.runtime.failure(); },
  dispatchSuppressed(action) { return instance.runtime.dispatch(action, null); },
  deliverNext() { return instance.host.deliverNext(); },
  hostDone() { return instance.host.assertDone(); },
  hostRequests() { return instance.host.requests(); },
  hostCompletions() { return instance.host.completions(); },
  duplicateCompletion(completion) { return instance.runtime.complete(completion); },
  callbacks() { return structuredClone(callbacks); },
  observations() { return structuredClone(observations); },
  focusState() { return instance.renderer.focusState(); },
  unmount() { return instance.runtime.unmount(); },
  domSnapshot() { return instance.renderer.domSnapshot(); },
};
`;
}

async function buildBrowserBundle({ compiledPath, helpersPath, tempRoot }) {
  const entryPath = join(tempRoot, "browser-entry.mjs");
  const bundlePath = join(tempRoot, "browser-entry.bundle.mjs");
  await writeFile(entryPath, makeBrowserEntry({ compiledPath, helpersPath, observedActionPath: OBSERVED_ACTION }), "utf8");
  const { build } = await import(pathToFileURL(ESBUILD).href);
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    nodePaths: [join(REPOSITORY, "interaction/node_modules")],
    outfile: bundlePath,
    logLevel: "silent",
  });
  return bundlePath;
}

function contentType(path) {
  const extension = extname(path);
  if (extension === ".mjs" || extension === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

async function startServer(bundlePath) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/" || url.pathname === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end("<!doctype html><html><head><meta charset=utf-8></head><body><main id=app></main><script type=module src=/bundle.mjs></script></body></html>");
      return;
    }
    if (url.pathname === "/bundle.mjs") {
      response.writeHead(200, { "content-type": contentType(bundlePath), "cache-control": "no-store" });
      createReadStream(bundlePath).pipe(response);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function elementAtPath(page, path) {
  const handle = await page.evaluateHandle((nodePath) => {
    let node = document.querySelector("#app")?.firstElementChild ?? null;
    if (!node) return null;
    if (nodePath === "") return node;
    for (const part of nodePath.split("/")) {
      const index = Number(part);
      node = node?.childNodes?.[index] ?? null;
    }
    return node;
  }, path);
  const element = handle.asElement();
  if (!element) await handle.dispose();
  return element;
}

async function captureRetainedCallback(element, event) {
  if (!element) return null;
  const name = event === "input" ? "onInput" : event === "change" ? "onChange" : event === "click" ? "onClick" : null;
  if (name === null) return null;
  return element.evaluateHandle((node, propName) => {
    const key = Object.keys(node).find((candidate) => candidate.startsWith("__reactProps$"));
    return key ? node[key]?.[propName] ?? null : null;
  }, name);
}

function expectedAction(fixture, index) {
  const expectation = fixture.expectations?.find((entry) => entry.actionIndex === index);
  if (!expectation) throw new Error(`fixture script is missing expectation for action ${index}`);
  return expectation;
}

async function runAction(page, fixture, index, retainedByIndex, focusEvidence, hostProgress) {
  const action = fixture.actions[index];
  const expectation = expectedAction(fixture, index);
  const before = await page.evaluate(() => ({ ticks: window.__gobiConformance.trace().ticks.length, callbacks: window.__gobiConformance.callbacks() }));
  const element = await elementAtPath(page, action.path);
  const observation = {
    index, intent: action, expectedMessage: expectation.message, before, targetConnectedBefore: Boolean(element),
    observedAction: null, targetValueAtDispatch: null,
  };
  const nextExpectation = fixture.expectations?.find((entry) => entry.actionIndex === index + 1);
  const nextAction = fixture.actions[index + 1];
  if (nextExpectation?.message === null && nextAction && !retainedByIndex.has(index + 1)) {
    const nextElement = await elementAtPath(page, nextAction.path);
    if (nextElement) {
      const callback = await captureRetainedCallback(nextElement, nextAction.event);
      retainedByIndex.set(index + 1, { element: nextElement, callback });
    }
  }

  if (expectation.message === null && element === null) {
    const retained = retainedByIndex.get(index);
    if (!retained || !retained.element || !retained.callback) {
      throw new Error(`stale action ${index} has no retained React event callback`);
    }
    await page.evaluate((intent) => window.__gobiConformance.setIntent(intent), action);
    try {
      const connected = await retained.element.evaluate((node) => node.isConnected);
      if (connected) throw new Error(`stale action ${index} target unexpectedly remains connected`);
      observation.method = "retained React event callback from detached DOM element";
      observation.targetConnectedBefore = false;
      observation.targetDisabled = await retained.element.evaluate((node) => node.disabled === true);
      await retained.element.evaluate((node, value) => { node.value = value; }, action.value);
      observation.targetValueAtDispatch = await retained.element.evaluate((node) => typeof node.value === "string" ? node.value : "");
      await retained.callback.evaluate((callback, node) => {
        if (typeof callback !== "function") throw new Error("retained React callback is no longer callable");
        callback({ currentTarget: node, target: node });
      }, retained.element);
    } finally {
      await page.evaluate(() => window.__gobiConformance.clearIntent());
    }
    const afterStale = await page.evaluate(() => ({ ticks: window.__gobiConformance.trace().ticks.length, callbacks: window.__gobiConformance.callbacks() }));
    if (afterStale.ticks !== before.ticks + 1 || afterStale.callbacks.dispatch !== before.callbacks.dispatch ||
        afterStale.callbacks.stale !== before.callbacks.stale + 1) {
      throw new Error(`detached callback ${index} did not produce exactly one stale/no-dispatch tick: before=${JSON.stringify(before)} after=${JSON.stringify(afterStale)}`);
    }
    observation.observedAction = await page.evaluate(() => window.__gobiConformance.observations().stale.at(-1)?.observed ?? null);
    observation.afterPhysical = afterStale;
  } else if (expectation.message === null) {
    const disabled = await element.evaluate((node) => node.disabled === true || node.matches?.(":disabled") === true);
    observation.method = "HTMLElement.click()";
    observation.targetDisabled = disabled;
    await element.evaluate((node) => node.click());
    const afterPhysicalAttempt = await page.evaluate(() => ({ ticks: window.__gobiConformance.trace().ticks.length, callbacks: window.__gobiConformance.callbacks() }));
    assertExactTraceValue(before, afterPhysicalAttempt, `$.browser.action[${index}].physicalSuppression`);
    if (disabled !== true) throw new Error(`action ${index} was expected suppressed but target is not disabled; no renderer callback was observed`);
    observation.afterPhysical = afterPhysicalAttempt;
    const result = await page.evaluate((intent) => window.__gobiConformance.dispatchSuppressed(intent), action);
    if (!result?.accepted) throw new Error(`runtime rejected the explicit suppressed intent for action ${index}`);
    observation.suppressedRecord = result;
  } else {
    if (!element) throw new Error(`active action ${index} target ${JSON.stringify(action.path)} is missing`);
    const focusWitness = fixture.focusWitnesses?.find((witness) => witness.afterActionIndex === index);
    if (focusWitness) {
      const focusElement = await elementAtPath(page, "2/1/0");
      if (!focusElement) throw new Error("focused keyed row input is missing before move");
      await focusElement.evaluate((node, witness) => {
        node.focus();
        node.setSelectionRange(witness.selectionStart, witness.selectionEnd, witness.selectionDirection);
        window.__gobiFocusedRow = node;
      }, focusWitness);
      focusEvidence.before = await page.evaluate(() => ({
        activeIsTarget: document.activeElement === window.__gobiFocusedRow,
        start: window.__gobiFocusedRow.selectionStart,
        end: window.__gobiFocusedRow.selectionEnd,
        direction: window.__gobiFocusedRow.selectionDirection,
      }));
      focusEvidence.element = focusElement;
    }

    await page.evaluate((intent) => window.__gobiConformance.setIntent(intent), action);
    try {
      if (action.event === "input") {
        observation.method = "Playwright ElementHandle.fill()";
        await element.fill(action.value);
      } else if (action.event === "change") {
        observation.method = action.value === "true" ? "Playwright ElementHandle.check()" : "Playwright ElementHandle.uncheck()";
        if (action.value === "true") await element.check();
        else if (action.value === "false") await element.uncheck();
        else throw new Error(`checkbox action ${index} must use value true or false`);
      } else if (action.event === "click" && focusWitness) {
        observation.method = "bubbling MouseEvent.dispatchEvent without native focus transfer";
        observation.targetValueAtDispatch = await element.evaluate((node) => typeof node.value === "string" ? node.value : "");
        await element.evaluate((node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })));
      } else if (action.event === "click") {
        observation.method = "HTMLElement.click()";
        observation.targetValueAtDispatch = await element.evaluate((node) => typeof node.value === "string" ? node.value : "");
        await element.evaluate((node) => node.click());
      } else {
        throw new Error(`unsupported browser action event ${JSON.stringify(action.event)}`);
      }
    } finally {
      await page.evaluate(() => window.__gobiConformance.clearIntent());
    }

    const after = await page.evaluate(() => ({ ticks: window.__gobiConformance.trace().ticks.length, callbacks: window.__gobiConformance.callbacks(), failure: window.__gobiConformance.failure() }));
    observation.afterPhysical = after;
    if (after.failure !== null) throw new Error(`runtime failure after browser action ${index}: ${JSON.stringify(after.failure)}`);
    if (after.ticks !== before.ticks + 1 || after.callbacks.dispatch !== before.callbacks.dispatch + 1) {
      throw new Error(`action ${index} expected one physical renderer dispatch; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    }
    observation.observedAction = await page.evaluate(() => window.__gobiConformance.observations().dispatch.at(-1)?.observed ?? null);

    if (focusWitness) {
      focusEvidence.immediate = await page.evaluate(() => ({
        activeIsTarget: document.activeElement === window.__gobiFocusedRow,
        start: window.__gobiFocusedRow.selectionStart,
        end: window.__gobiFocusedRow.selectionEnd,
        direction: window.__gobiFocusedRow.selectionDirection,
        sameKeyedNodeAtNewPath: window.__gobiFocusedRow === (() => {
          let node = document.querySelector("#app")?.firstElementChild;
          for (const part of "2/0/0".split("/")) node = node?.childNodes?.[Number(part)];
          return node;
        })(),
      }));
      await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame())));
      focusEvidence.settled = await page.evaluate(() => ({
        activeIsTarget: document.activeElement === window.__gobiFocusedRow,
        start: window.__gobiFocusedRow.selectionStart,
        end: window.__gobiFocusedRow.selectionEnd,
        direction: window.__gobiFocusedRow.selectionDirection,
        sameKeyedNodeAtNewPath: window.__gobiFocusedRow === (() => {
          let node = document.querySelector("#app")?.firstElementChild;
          for (const part of "2/0/0".split("/")) node = node?.childNodes?.[Number(part)];
          return node;
        })(),
      }));
      for (const phase of ["before", "immediate", "settled"]) {
        const observation = focusEvidence[phase];
        if (!observation.activeIsTarget || observation.start !== focusWitness.selectionStart ||
            observation.end !== focusWitness.selectionEnd || observation.direction !== focusWitness.selectionDirection) {
          throw new Error(`focus/selection not preserved at ${phase}: ${JSON.stringify(observation)}`);
        }
      }
      if (!focusEvidence.immediate.sameKeyedNodeAtNewPath || !focusEvidence.settled.sameKeyedNodeAtNewPath) {
        throw new Error("keyed input DOM identity changed across row reorder");
      }
    }
  }

  const actionTrace = await page.evaluate(() => window.__gobiConformance.trace());
  const actualTick = actionTrace.ticks.at(-1);
  assertExactTraceValue(action, actualTick.action, `$.browser.action[${index}].intent`);
  assertExactTraceValue(expectation.message, actualTick.message, `$.browser.action[${index}].message`);
  if (expectation.dispatchId !== undefined) assertExactTraceValue(expectation.dispatchId, actualTick.dispatchId, `$.browser.action[${index}].dispatchId`);
  if (actionTrace.ticks.length !== before.ticks + 1) throw new Error(`action ${index} produced an unexpected number of ticks`);
  if (expectation.message === null) {
    if (actualTick.dispatchId !== null) throw new Error(`suppressed action ${index} unexpectedly updated Go state`);
    assertExactTraceValue(actionTrace.ticks.at(-2).state, actualTick.state, `$.browser.action[${index}].suppressedState`);
  }
  observation.traceTick = actualTick;

  const requestCount = await page.evaluate(() => window.__gobiConformance.hostRequests().length);
  if (requestCount > hostProgress.handledRequests) {
    const host = await page.evaluate(() => ({
      requests: window.__gobiConformance.hostRequests(),
      observations: window.__gobiConformance.observations().requests,
    }));
    for (let requestIndex = hostProgress.handledRequests; requestIndex < requestCount; requestIndex += 1) {
      const request = host.requests[requestIndex];
      const observation = host.observations[requestIndex];
      if (observation.tickCount < 2) throw new Error("effect host observed request before the committing trace tick");
      assertExactTraceValue(request, observation.request, `$.browser.effectRequest[${requestIndex}]`);
      const pendingObservation = fixture.expectations.find((entry) => entry.dispatchId === request.dispatchId);
      if (!pendingObservation || pendingObservation.state?.Pending !== true || pendingObservation.state?.Status !== "pending") {
        throw new Error(`fixture has no independent pending-state expectation for ${request.dispatchId}`);
      }
      if (!observation.snapshot.dom.html.includes("Status: pending") ||
          !observation.snapshot.dom.controls.some((control) => control.path === "1" && control.disabled)) {
        throw new Error("request host ran before the pending status and disabled Request button were visible in the DOM");
      }
      const hostStep = fixture.hostScript.steps[requestIndex];
      if (!hostStep) throw new Error(`missing HostScript step ${requestIndex} for effect request`);
      if (hostStep.completion !== null) {
        const delivered = await page.evaluate(() => window.__gobiConformance.deliverNext());
        if (!delivered) throw new Error("scripted completion was expected but no effect was deliverable");
      }
      hostProgress.handledRequests += 1;
      await page.evaluate(() => window.__gobiConformance.hostDone());
    }
  }
  observation.traceTickCountAfterHost = await page.evaluate(() => window.__gobiConformance.trace().ticks.length);
  return observation;
}

export async function runBrowserConformance({ compiledPath, helpersPath, fixturePath, outputPath, chromiumPath = process.env.CHROMIUM_PATH }) {
  const tempRoot = await mkdtemp(join(tmpdir(), "gobi-compiled-browser-"));
  let serverHandle;
  let browser;
  let page;
  let noWasm;
  let pageErrors = [];
  let fixtureScript;
  let component;
  let bundlePath;
  let provenanceBefore;
  let baseProvenanceBefore;
  let stage = "load-fixture";
  let actionIndex = null;
  try {
    baseProvenanceBefore = await captureConformanceProvenance({
      compiledPath, helpersPath, fixturePath, command: process.argv.slice(0),
    });
    fixtureScript = JSON.parse(await readFile(fixturePath, "utf8"));
    const compiledModule = await import(pathToFileURL(resolve(compiledPath)).href);
    const compiled = compiledModule.gobiCompiled;
    if (!compiled || compiled.schema !== "gobi.compiled-module/v1") throw new Error("compiled module does not export gobiCompiled v1");
    component = compiled.appIR.components.find((entry) => entry.packagePath === fixtureScript.packagePath);
    if (!component) throw new Error(`fixture package ${fixtureScript.packagePath} has no compiled component`);
    stage = "bundle-browser-entry";
    bundlePath = await buildBrowserBundle({ compiledPath: resolve(compiledPath), helpersPath: resolve(helpersPath), tempRoot });
    serverHandle = await startServer(bundlePath);
    provenanceBefore = await captureConformanceProvenance({
      compiledPath, helpersPath, fixturePath, browserBundlePath: bundlePath, command: process.argv.slice(0),
    });
    stage = "verify-bundle-source-pins";
    assertStableProvenance(baseProvenanceBefore, withoutBrowserBundle(provenanceBefore, bundlePath));
    browser = await chromium.launch(chromiumLaunchOptions(chromiumPath));
    page = await browser.newPage();
    pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    noWasm = await installNoWasmGuards(page);
    stage = "load-browser-page";
    await page.goto(serverHandle.url, { waitUntil: "load", timeout: 15000 });
    await page.waitForFunction(() => typeof window.__gobiConformance?.mount === "function", null, { timeout: 15000 });
    const strictMode = fixtureScript.hostScript.steps.length > 0;
    stage = "mount-compiled-app";
    await page.evaluate(({ fixtureScript: script, componentId, strictMode: strict }) => {
      window.__gobiConformance.mount({ fixtureScript: script, componentId, appId: componentId, strictMode: strict });
    }, { fixtureScript, componentId: component.id, strictMode });

    const retained = new Map();
    const focusEvidence = {};
    const hostProgress = { handledRequests: 0 };
    const actionEvidence = [];
    let duplicateCompletionEvidence = null;
    for (let index = 0; index < fixtureScript.actions.length; index += 1) {
      actionIndex = index;
      stage = "run-browser-action";
      actionEvidence.push(await runAction(page, fixtureScript, index, retained, focusEvidence, hostProgress));
      if (pageErrors.length > 0) throw new Error(`browser page error: ${pageErrors.join(" | ")}`);
    }
    actionIndex = null;
    stage = "assert-host-complete";
    await page.evaluate(() => window.__gobiConformance.hostDone());

    if (fixtureScript.hostScript.steps.length > 0) {
      stage = "verify-host-completions";
      const host = await page.evaluate(() => ({ requests: window.__gobiConformance.hostRequests(), completions: window.__gobiConformance.hostCompletions() }));
      assertExactTraceValue(fixtureScript.hostScript.steps.map((step) => step.request), host.requests, "$.browser.effectHost.requests");
      assertExactTraceValue(fixtureScript.hostScript.steps.filter((step) => step.completion !== null).map((step) => ({
        dispatchId: step.request.dispatchId,
        effectIndex: step.request.effectIndex,
        message: step.completion,
      })), host.completions, "$.browser.effectHost.completions");
      if (host.completions.length > 0) {
        const beforeDuplicate = await page.evaluate(() => window.__gobiConformance.trace().ticks.length);
        const result = await page.evaluate((completion) => window.__gobiConformance.duplicateCompletion(completion), host.completions[0]);
        const afterDuplicate = await page.evaluate(() => window.__gobiConformance.trace().ticks.length);
        if (result.accepted !== false || afterDuplicate !== beforeDuplicate) throw new Error("duplicate host completion was delivered more than once");
        duplicateCompletionEvidence = { result, beforeTickCount: beforeDuplicate, afterTickCount: afterDuplicate };
      }
    }

    stage = "assert-no-wasm";
    const wasmEvidence = await noWasm.assertClear();
    stage = "validate-browser-trace";
    const trace = await page.evaluate(() => window.__gobiConformance.trace());
    validateTrace(trace, compiled.appIR);
    validateHostScript(fixtureScript.hostScript, trace);
    validateFixtureExpectations(trace, fixtureScript, compiled.appIR);
    const domOracle = expectedDOMSnapshots(fixtureScript);
    assertExactTraceValue(domOracle, trace.ticks.map((tick) => tick.dom), "$.browser.domOracle");
    stage = "unmount-and-check-dom";
    await page.evaluate(() => window.__gobiConformance.unmount());
    const unmountEvidence = await page.evaluate(() => {
      const root = document.getElementById("app");
      if (!root) throw new Error("#app container is missing after unmount");
      return {
        physicalDOM: { normalization: "container-innerHTML-v1", html: root.innerHTML,
          controls: root.querySelectorAll("input,button,textarea,select").length },
        rendererSnapshot: window.__gobiConformance.domSnapshot(),
      };
    });
    assertExactTraceValue({ normalization: "container-innerHTML-v1", html: "", controls: 0 },
      unmountEvidence.physicalDOM, "$.browser.unmount.physicalDOM");
    assertExactTraceValue({ normalization: "outerHTML-v1", html: "", controls: [] },
      unmountEvidence.rendererSnapshot, "$.browser.unmount.rendererSnapshot");
    if (pageErrors.length > 0) throw new Error(`browser page error: ${pageErrors.join(" | ")}`);
    stage = "verify-source-provenance";
    const provenanceAfter = await captureConformanceProvenance({
      compiledPath, helpersPath, fixturePath, browserBundlePath: bundlePath, command: process.argv.slice(0),
    });
    assertStableProvenance(provenanceBefore, provenanceAfter);
    assertStableProvenance(baseProvenanceBefore, withoutBrowserBundle(provenanceAfter, bundlePath));
    const evidence = {
      schema: "gobi.browser-conformance/v1",
      appId: component.id,
      fixture: fixtureScript.name,
      browser: await browser.version(),
      strictMode,
      trace,
      actions: actionEvidence,
      domOracle,
      focus: Object.keys(focusEvidence).length ? {
        before: focusEvidence.before,
        immediate: focusEvidence.immediate,
        settled: focusEvidence.settled,
      } : null,
      hostObservations: await page.evaluate(() => window.__gobiConformance.observations()),
      effectHostEvidence: await page.evaluate(() => ({
        requests: window.__gobiConformance.hostRequests(),
        completions: window.__gobiConformance.hostCompletions(),
      })),
      duplicateCompletionEvidence,
      callbackCounts: await page.evaluate(() => window.__gobiConformance.callbacks()),
      noWasm: wasmEvidence,
      unmount: unmountEvidence,
      provenanceBase: baseProvenanceBefore,
      provenance: provenanceBefore,
      traceSha256: createHash("sha256").update(JSON.stringify(trace)).digest("hex"),
      pageErrors,
    };
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(dirname(resolve(outputPath)), { recursive: true });
    await writeFile(resolve(outputPath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    return evidence;
  } catch (error) {
    try {
      const receipt = await writeBrowserFailure({
        outputPath, compiledPath, helpersPath, fixturePath, command: process.argv.slice(0), fixtureScript,
        component, stage, actionIndex, error, page, pageErrors, browser, noWasm, provenanceBefore, baseProvenanceBefore, bundlePath,
      });
      if (error instanceof Error) error.failureEvidence = receipt;
      process.stderr.write(`browser failure evidence: ${JSON.stringify(receipt)}\n`);
    } catch (writeError) {
      process.stderr.write(`browser failure evidence could not be saved: ${writeError instanceof Error ? writeError.message : String(writeError)}\n`);
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (serverHandle) await new Promise((resolveClose, reject) => serverHandle.server.close((error) => error ? reject(error) : resolveClose()));
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function argument(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) throw new Error(`missing ${name} <path>`);
  return args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const evidence = await runBrowserConformance({
    compiledPath: argument(args, "--compiled"),
    helpersPath: argument(args, "--helpers"),
    fixturePath: argument(args, "--fixture"),
    outputPath: argument(args, "--output"),
  });
  process.stdout.write(`${JSON.stringify({ appId: evidence.appId, ticks: evidence.trace.ticks.length, noWasm: evidence.noWasm })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
