import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { expectedDOMSnapshots } from "../../compiled-frontend/conformance/dom-oracle.mjs";
import { installNoWasmGuards } from "../../compiled-frontend/conformance/no-wasm.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RUNTIME = resolve(ROOT, "compiled-frontend/frontend/runtime/runtime.mjs");
const REACT_RENDERER = resolve(ROOT, "compiled-frontend/frontend/react/renderer.mjs");
const DOM_RENDERER = resolve(ROOT, "compiled-frontend/frontend/dom/renderer.mjs");
const OBSERVED_ACTION = resolve(ROOT, "compiled-frontend/conformance/observed-action.mjs");
const ESBUILD = resolve(ROOT, "interaction/node_modules/esbuild/lib/main.js");

const json = (value) => JSON.stringify(value);

function makeEntry({ compiledPath, helpersPath, outputPath }) {
  return `
import { mountCompiledApp, createDeterministicEffectHost } from ${json(RUNTIME)};
import { createReactRenderer } from ${json(REACT_RENDERER)};
import { createDOMRenderer } from ${json(DOM_RENDERER)};
import { associateObservedAction } from ${json(OBSERVED_ACTION)};
import { gobiCompiled } from ${json(compiledPath)};
import * as encoder from ${json(helpersPath)};

let activeIntent = null;
let instance = null;
let nextRendererId = 0;
const rendererRecords = [];
const counters = { dispatch: 0, stale: 0 };
const observations = { dispatch: [], stale: [], requests: [] };
let physicalObserverInstalled = false;

function copy(value) { return structuredClone(value); }

function associate(observed) {
  if (activeIntent === null) throw new Error("renderer callback arrived without a requested Action intent");
  return associateObservedAction(observed, activeIntent);
}

function makeRenderer(backend, strictMode = false) {
  let core;
  if (backend === "react") core = createReactRenderer({ container: document.getElementById("app"), strictMode });
  else if (backend === "dom") core = createDOMRenderer({ container: document.getElementById("app") });
  else throw new TypeError("renderer backend must be react or dom");
  const record = { id: ++nextRendererId, backend, core, hooks: [], rendererCallbacks: [], lastDispatchMessage: null };
  const renderer = {
    update(view, hooks) {
      record.hooks.push(hooks);
      const callbacks = {
        dispatch(observed, message) {
          counters.dispatch += 1;
          record.lastDispatchMessage = message;
          const action = associate(observed);
          observations.dispatch.push({ rendererId: record.id, observed: copy(observed), action, message: copy(message) });
          return hooks.dispatch(action, message);
        },
        onStaleAction(observed, renderEpoch) {
          counters.stale += 1;
          const action = associate(observed);
          observations.stale.push({ rendererId: record.id, observed: copy(observed), action, renderEpoch });
          return hooks.onStaleAction(action, renderEpoch);
        },
      };
      record.rendererCallbacks.push(callbacks);
      return core.update(view, callbacks);
    },
    viewRecord: (...args) => core.viewRecord(...args),
    domSnapshot: (...args) => core.domSnapshot(...args),
    focusState: (...args) => core.focusState?.(...args) ?? null,
    restoreFocus: (...args) => core.restoreFocus?.(...args) ?? false,
    unmount: (...args) => core.unmount(...args),
    record,
  };
  record.renderer = renderer;
  rendererRecords.push(record);
  return renderer;
}

function requireInstance() {
  if (!instance) throw new Error("conformance app has not mounted");
  return instance;
}

window.__gobiBackendConformance = {
  compiled: gobiCompiled,
  mount({ fixtureScript, componentId, backend, strictMode = false }) {
    const container = document.getElementById("app");
    if (!container) throw new Error("#app container is missing");
    if (physicalObserverInstalled) {
      counters.dispatch = 0;
      counters.stale = 0;
      for (const list of Object.values(observations)) list.length = 0;
      rendererRecords.length = 0;
      nextRendererId = 0;
    } else {
      for (const eventName of ["input", "change", "click"]) container.addEventListener(eventName, (event) => {
        if (activeIntent === null || !event.target) return;
        const target = event.target;
        observations.physical.push({ intent: copy(activeIntent), event: event.type,
          value: target.type === "checkbox" ? String(target.checked) : (typeof target.value === "string" ? target.value : ""),
          tag: target.localName ?? "" });
      }, true);
      physicalObserverInstalled = true;
      observations.physical = [];
    }
    const renderer = makeRenderer(backend, strictMode);
    let runtime = null;
    const host = createDeterministicEffectHost(fixtureScript.hostScript, {
      onRequest(request) {
        if (!runtime) throw new Error("effect requested before runtime mount completed");
        observations.requests.push({ request: copy(request), snapshot: runtime.snapshot(), tickCount: runtime.trace().ticks.length });
      },
    });
    runtime = mountCompiledApp({
      module: gobiCompiled,
      componentId,
      appId: componentId,
      encoder: { gobiEncodeState: encoder.gobiEncodeState },
      renderer,
      effectHost: host,
    });
    instance = { runtime, renderer, host, fixtureScript, componentId, strictMode };
    return { ticks: runtime.trace().ticks.length, backend, componentId };
  },
  setIntent(action) { activeIntent = copy(action); },
  clearIntent() { activeIntent = null; },
  trace() { return requireInstance().runtime.trace(); },
  snapshot() { return requireInstance().runtime.snapshot(); },
  failure() { return requireInstance().runtime.failure(); },
  dispatchSuppressed(action) { return requireInstance().runtime.dispatch(action, null); },
  deliverNext() { return requireInstance().host.deliverNext(); },
  deliver(requestKey) { return requireInstance().host.deliver(requestKey); },
  hostDone() { return requireInstance().host.assertDone(); },
  hostRequests() { return requireInstance().host.requests(); },
  hostCompletions() { return requireInstance().host.completions(); },
  duplicateCompletion(completion) { return requireInstance().runtime.complete(completion); },
  callbacks() { return copy(counters); },
  observations() { return copy(observations); },
  physicalActions() { return copy(observations.physical); },
  rendererDiagnostics() { return requireInstance().runtime.rendererDiagnostics(); },
  focusState() { return requireInstance().renderer.focusState(); },
  currentRenderer() { return { id: requireInstance().renderer.record.id, backend: requireInstance().renderer.record.backend }; },
  swap(backend) {
    const current = requireInstance();
    const previous = current.renderer;
    const before = {
      trace: current.runtime.trace(),
      snapshot: current.runtime.snapshot(),
      hostRequests: current.host.requests(),
      hostCompletions: current.host.completions(),
      diagnostics: current.runtime.rendererDiagnostics(),
      focus: previous.focusState(),
      renderer: { id: previous.record.id, backend: previous.record.backend },
    };
    const oldRoot = document.getElementById("app").firstElementChild;
    const container = document.getElementById("app");
    const initialChildren = container.childNodes.length;
    const mutationObserver = new MutationObserver(() => {});
    mutationObserver.observe(container, { childList: true });
    const oldFocusedElement = before.focus === null ? null : document.activeElement;
    const next = makeRenderer(backend, current.strictMode);
    const returnedSnapshot = current.runtime.replaceRenderer(next);
    current.renderer = next;
    const mutations = mutationObserver.takeRecords();
    mutationObserver.disconnect();
    let observedChildren = initialChildren;
    let oldRootRemoved = false;
    let newRootAdded = false;
    let emptyAfterOldRemoval = false;
    for (const mutation of mutations) {
      if ([...mutation.removedNodes].includes(oldRoot)) oldRootRemoved = true;
      if ([...mutation.addedNodes].includes(container.firstElementChild)) newRootAdded = true;
      observedChildren -= mutation.removedNodes.length;
      observedChildren += mutation.addedNodes.length;
      if (oldRootRemoved && observedChildren === 0) emptyAfterOldRemoval = true;
    }
    const oldRendererSnapshot = emptyAfterOldRemoval
      ? { normalization: "outerHTML-v1", html: "", controls: [] }
      : null;
    const after = {
      trace: current.runtime.trace(),
      snapshot: current.runtime.snapshot(),
      hostRequests: current.host.requests(),
      hostCompletions: current.host.completions(),
      diagnostics: current.runtime.rendererDiagnostics(),
      focus: next.focusState(),
      focusNodeReplaced: oldFocusedElement === null ||
        (oldFocusedElement !== document.activeElement && !oldFocusedElement.isConnected),
      renderer: { id: next.record.id, backend: next.record.backend },
      oldRendererSnapshot,
      oldRootDetached: oldRoot === null || !oldRoot.isConnected,
      oldRootEmptyDuringSwap: emptyAfterOldRemoval,
      rootMutationEvidence: { childListRecords: mutations.length, oldRootRemoved, newRootAdded, emptyAfterOldRemoval },
      physicalHTML: document.getElementById("app").innerHTML,
    };
    return { before, after, returnedSnapshot };
  },
  fenceRetired(rendererId, action, renderEpoch = 0) {
    const record = rendererRecords.find((item) => item.id === rendererId);
    if (!record) throw new Error("unknown renderer id for stale callback probe");
    const hooks = record.hooks.at(-1);
    if (!hooks) throw new Error("renderer has not received runtime callbacks");
    let dispatch = null;
    if (record.lastDispatchMessage !== null) {
      dispatch = hooks.dispatch(copy(action), record.lastDispatchMessage);
    }
    const stale = hooks.onStaleAction(copy(action), renderEpoch);
    return { dispatch, stale, trace: requireInstance().runtime.trace(), snapshot: requireInstance().runtime.snapshot(), diagnostics: requireInstance().runtime.rendererDiagnostics() };
  },
  staleActive(action, renderEpoch = 0) {
    const callbacks = requireInstance().renderer.record.rendererCallbacks.at(-1);
    if (!callbacks) throw new Error("active renderer has no retained callback");
    return callbacks.onStaleAction(copy(action), renderEpoch);
  },
  unmount() {
    const current = requireInstance();
    const renderer = current.renderer;
    const hooks = renderer.record.hooks.at(-1);
    const action = current.fixtureScript.actions.find((item) => item !== null) ?? { path: "", event: "click", value: "" };
    const traceBefore = current.runtime.trace();
    const result = current.runtime.unmount();
    const physical = {
      normalization: "container-innerHTML-v1",
      html: document.getElementById("app").innerHTML,
      controls: document.getElementById("app").querySelectorAll("input,button,textarea,select").length,
    };
    const rendererSnapshot = renderer.domSnapshot();
    const traceAfterUnmount = current.runtime.trace();
    let fenced = null;
    if (hooks) {
      const expectedMessage = current.fixtureScript.expectations.find((item) => item.message !== null)?.message ?? { name: "fence", arg: "" };
      const probeMessage = renderer.record.lastDispatchMessage ?? { Name: expectedMessage.name, Arg: expectedMessage.arg };
      const dispatch = hooks.dispatch(copy(action), probeMessage);
      const stale = hooks.onStaleAction(copy(action), 0);
      fenced = { dispatch, stale, trace: current.runtime.trace(), diagnostics: current.runtime.rendererDiagnostics() };
    }
    return { result, traceBefore, traceAfterUnmount, traceAfter: current.runtime.trace(), physical, rendererSnapshot, fenced };
  },
};
`;
}

export function chromiumLaunchOptions(chromiumPath) {
  return { headless: true, ...(chromiumPath ? { executablePath: chromiumPath } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] };
}

async function buildBrowserBundle({ compiledPath, helpersPath, bundlePath }) {
  const entryPath = `${bundlePath}.entry.mjs`;
  await writeFile(entryPath, makeEntry({ compiledPath: resolve(compiledPath), helpersPath: resolve(helpersPath) }), "utf8");
  const { build } = await import(pathToFileURL(ESBUILD).href);
  await build({ entryPoints: [entryPath], bundle: true, platform: "browser", format: "esm", target: "es2022",
    nodePaths: [resolve(ROOT, "interaction/node_modules")], outfile: bundlePath, logLevel: "silent" });
  return entryPath;
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
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
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
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function elementAtPath(page, path) {
  const handle = await page.evaluateHandle((nodePath) => {
    let node = document.querySelector("#app")?.firstElementChild ?? null;
    if (!node) return null;
    if (nodePath === "") return node;
    for (const part of nodePath.split("/")) node = node?.childNodes?.[Number(part)] ?? null;
    return node;
  }, path);
  const element = handle.asElement();
  if (!element) await handle.dispose();
  return element;
}

async function retainElementCallback(element, event) {
  if (!element) return null;
  const propName = event === "input" ? "onInput" : event === "change" ? "onChange" : event === "click" ? "onClick" : null;
  return element.evaluateHandle((node, name) => {
    const key = Object.keys(node).find((candidate) => candidate.startsWith("__reactProps$"));
    return { node, callback: key && name ? node[key]?.[name] ?? null : null };
  }, propName);
}

async function beforeAction(page) {
  return page.evaluate(() => ({ ticks: window.__gobiBackendConformance.trace().ticks.length,
    callbacks: window.__gobiBackendConformance.callbacks(), failure: window.__gobiBackendConformance.failure() }));
}

function actionExpectation(fixture, index) {
  const found = fixture.expectations.find((entry) => entry.actionIndex === index);
  if (!found) throw new Error(`fixture script has no expectation for action ${index}`);
  return found;
}

async function runAction(page, fixture, index, retainedByIndex, focusEvidence) {
  const action = fixture.actions[index];
  const expectation = actionExpectation(fixture, index);
  const before = await beforeAction(page);
  const physicalBefore = (await page.evaluate(() => window.__gobiBackendConformance.physicalActions())).length;
  const element = await elementAtPath(page, action.path);
  const observation = { index, intent: action, expectedMessage: expectation.message, before,
    targetConnectedBefore: Boolean(element), targetValueAtDispatch: null, observedAction: null };
  const nextExpectation = fixture.expectations.find((entry) => entry.actionIndex === index + 1);
  if (nextExpectation?.message === null && !retainedByIndex.has(index + 1)) {
    const nextElement = await elementAtPath(page, fixture.actions[index + 1].path);
    if (nextElement) retainedByIndex.set(index + 1, { element: nextElement,
      callback: await retainElementCallback(nextElement, fixture.actions[index + 1].event),
      renderer: await page.evaluate(() => window.__gobiBackendConformance.currentRenderer()) });
    else await nextElement?.dispose();
  }

  if (expectation.message === null && !element) {
    const retained = retainedByIndex.get(index);
    if (!retained?.element) throw new Error(`stale action ${index} has no retained target`);
    await page.evaluate((intent) => window.__gobiBackendConformance.setIntent(intent), action);
    try {
      const connected = await retained.element.evaluate((node) => node.isConnected);
      if (connected) throw new Error(`stale action ${index} target unexpectedly remains connected`);
      observation.targetConnectedBefore = false;
      observation.targetValueAtDispatch = await retained.element.evaluate((node, value) => {
        if ("value" in node) node.value = value;
        if (node.type === "checkbox") return String(node.checked);
        return typeof node.value === "string" ? node.value : "";
      }, action.value);
      const hasReactCallback = retained.callback ? await retained.callback.evaluate((held) => typeof held.callback === "function") : false;
      const activeRenderer = await page.evaluate(() => window.__gobiBackendConformance.currentRenderer());
      observation.activeRendererId = activeRenderer.id;
      if (hasReactCallback && retained.renderer?.id !== activeRenderer.id) {
        const beforeProbe = await page.evaluate(() => {
          const api = window.__gobiBackendConformance;
          return { trace: api.trace(), snapshot: api.snapshot(), callbacks: api.callbacks(), diagnostics: api.rendererDiagnostics() };
        });
        await retained.callback.evaluate((held, { event, value }) => {
          if (typeof held.callback === "function") held.callback({ currentTarget: held.node, target: held.node });
          else held.node.dispatchEvent(new Event(event, { bubbles: true, cancelable: true }));
        }, { event: action.event, value: action.value });
        const afterProbe = await page.evaluate(() => {
          const api = window.__gobiBackendConformance;
          return { trace: api.trace(), snapshot: api.snapshot(), callbacks: api.callbacks(), diagnostics: api.rendererDiagnostics() };
        });
        const retiredCallback = await page.evaluate(() => window.__gobiBackendConformance.observations().stale.at(-1) ?? null);
        observation.retiredCallbackProbe = {
          classification: "retired-renderer-callback-fenced-out-of-band",
          rendererId: retained.renderer.id,
          before: beforeProbe,
          after: afterProbe,
          callback: retiredCallback,
        };
        const beforeFences = beforeProbe.diagnostics.fencedCallbacks;
        const afterFences = afterProbe.diagnostics.fencedCallbacks;
        const newFences = afterFences.slice(beforeFences.length);
        if (json(beforeProbe.trace) !== json(afterProbe.trace) ||
            json(beforeProbe.snapshot) !== json(afterProbe.snapshot) ||
            afterProbe.callbacks.dispatch !== beforeProbe.callbacks.dispatch ||
            afterProbe.callbacks.stale !== beforeProbe.callbacks.stale + 1 ||
            newFences.length !== 1 || newFences[0].generation !== retained.renderer.id || newFences[0].kind !== "stale" ||
            retiredCallback?.rendererId !== retained.renderer.id) {
          throw new Error(`retired renderer callback ${index} was not isolated from the application trace`);
        }
      }

      if (hasReactCallback && retained.renderer?.id === activeRenderer.id) {
        observation.method = "retained callback from detached active renderer node";
        observation.classification = "active-renderer-stale-callback";
        await retained.callback.evaluate((held) => {
          if (typeof held.callback === "function") held.callback({ currentTarget: held.node, target: held.node });
        });
      } else {
        observation.method = "active renderer onStaleAction for missing detached target";
        observation.classification = observation.retiredCallbackProbe
          ? "retired-renderer-probe-plus-active-missing-target-attempt"
          : "active-renderer-missing-target-attempt";
        await page.evaluate(({ intent, value }) => window.__gobiBackendConformance.staleActive({
          path: intent.path, event: intent.event, value,
        }, 0), { intent: action, value: observation.targetValueAtDispatch });
      }
    } finally {
      await page.evaluate(() => window.__gobiBackendConformance.clearIntent());
    }
    const after = await beforeAction(page);
    observation.afterPhysical = after;
    observation.observedAction = await page.evaluate(() => window.__gobiBackendConformance.observations().stale.at(-1)?.observed ?? null);
    observation.rendererCallback = await page.evaluate(() => window.__gobiBackendConformance.observations().stale.at(-1) ?? null);
    if (after.ticks !== before.ticks + 1 || after.callbacks.dispatch !== before.callbacks.dispatch ||
        after.callbacks.stale !== before.callbacks.stale + 1 + (observation.retiredCallbackProbe ? 1 : 0)) {
      throw new Error(`detached callback ${index} did not produce exactly one active suppressed attempt`);
    }
  } else if (expectation.message === null) {
    if (!element) throw new Error(`suppressed action ${index} target is missing`);
    observation.method = "disabled HTMLElement.click() plus runtime suppressed intent";
    observation.targetDisabled = await element.evaluate((node) => node.disabled === true || node.matches?.(":disabled") === true);
    await element.evaluate((node) => node.click());
    const afterPhysical = await beforeAction(page);
    if (json(before) !== json(afterPhysical)) throw new Error(`disabled action ${index} caused a renderer callback`);
    if (!observation.targetDisabled) throw new Error(`suppressed action ${index} target was not physically disabled`);
    const suppressed = await page.evaluate((intent) => window.__gobiBackendConformance.dispatchSuppressed(intent), action);
    if (!suppressed?.accepted) throw new Error(`runtime rejected suppressed intent ${index}`);
    observation.suppressedRecord = suppressed;
    observation.afterPhysical = await beforeAction(page);
  } else {
    if (!element) throw new Error(`active action ${index} target ${json(action.path)} is missing`);
    const focusWitness = fixture.focusWitnesses?.find((witness) => witness.afterActionIndex === index);
    if (focusWitness) {
      const precedingState = fixture.expectations.filter((entry) => entry.actionIndex < index).at(-1)?.state;
      const rowIndex = precedingState?.Rows?.findIndex((row) => focusWitness.key === `row-${row.ID}-label`) ?? -1;
      const focusTarget = rowIndex < 0 ? null : await elementAtPath(page, `2/${rowIndex}/0`);
      if (!focusTarget) throw new Error("focus witness target is missing before keyed move");
      await focusTarget.evaluate((node, witness) => {
        node.focus();
        node.setSelectionRange(witness.selectionStart, witness.selectionEnd, witness.selectionDirection);
        window.__gobiFocusedRow = node;
      }, focusWitness);
      focusEvidence.before = await page.evaluate(() => ({ activeIsTarget: document.activeElement === window.__gobiFocusedRow,
        start: window.__gobiFocusedRow.selectionStart, end: window.__gobiFocusedRow.selectionEnd,
        direction: window.__gobiFocusedRow.selectionDirection }));
      focusEvidence.witness = focusWitness;
    }
    await page.evaluate((intent) => window.__gobiBackendConformance.setIntent(intent), action);
    try {
      if (action.event === "input") {
        observation.method = "Playwright ElementHandle.fill()";
        await element.fill(action.value);
      } else if (action.event === "change") {
        observation.method = action.value === "true" ? "Playwright ElementHandle.check()" : "Playwright ElementHandle.uncheck()";
        if (action.value === "true") await element.check();
        else if (action.value === "false") await element.uncheck();
        else throw new Error(`checkbox action ${index} must use true or false`);
      } else if (action.event === "click" && focusWitness) {
        observation.method = "bubbling MouseEvent.dispatchEvent without native focus transfer";
        await element.evaluate((node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })));
      } else if (action.event === "click") {
        observation.method = "HTMLElement.click()";
        await element.evaluate((node) => node.click());
      } else throw new Error(`unsupported action event ${json(action.event)}`);
    } finally {
      await page.evaluate(() => window.__gobiBackendConformance.clearIntent());
    }
    const physical = (await page.evaluate(() => window.__gobiBackendConformance.physicalActions()))
      .slice(physicalBefore).filter((item) => item.intent.event === action.event && item.intent.path === action.path && item.event === action.event).at(-1);
    if (!physical) throw new Error(`action ${index} lacks an independent capture-phase DOM value observation`);
    observation.targetValueAtDispatch = physical.value;
    const after = await beforeAction(page);
    observation.afterPhysical = after;
    if (after.failure !== null) throw new Error(`runtime failure after action ${index}: ${json(after.failure)}`);
    if (after.ticks !== before.ticks + 1 || after.callbacks.dispatch !== before.callbacks.dispatch + 1) {
      throw new Error(`active action ${index} expected one renderer dispatch: before=${json(before)} after=${json(after)}`);
    }
    observation.observedAction = await page.evaluate(() => window.__gobiBackendConformance.observations().dispatch.at(-1)?.observed ?? null);
    observation.rendererCallback = await page.evaluate(() => window.__gobiBackendConformance.observations().dispatch.at(-1) ?? null);
    if (focusWitness) {
      focusEvidence.immediate = await page.evaluate(() => ({ activeIsTarget: document.activeElement === window.__gobiFocusedRow,
        start: window.__gobiFocusedRow.selectionStart, end: window.__gobiFocusedRow.selectionEnd,
        direction: window.__gobiFocusedRow.selectionDirection,
        sameKeyedNodeAtNewPath: window.__gobiFocusedRow === (() => {
          let node = document.querySelector("#app")?.firstElementChild;
          for (const part of "2/0/0".split("/")) node = node?.childNodes?.[Number(part)];
          return node;
        })() }));
      await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame())));
      focusEvidence.settled = await page.evaluate(() => ({ activeIsTarget: document.activeElement === window.__gobiFocusedRow,
        start: window.__gobiFocusedRow.selectionStart, end: window.__gobiFocusedRow.selectionEnd,
        direction: window.__gobiFocusedRow.selectionDirection,
        sameKeyedNodeAtNewPath: window.__gobiFocusedRow === (() => {
          let node = document.querySelector("#app")?.firstElementChild;
          for (const part of "2/0/0".split("/")) node = node?.childNodes?.[Number(part)];
          return node;
        })() }));
      for (const phase of ["before", "immediate", "settled"]) {
        const item = focusEvidence[phase];
        if (!item.activeIsTarget || item.start !== focusWitness.selectionStart || item.end !== focusWitness.selectionEnd ||
            item.direction !== focusWitness.selectionDirection) throw new Error(`focus or selection changed at ${phase}: ${json(item)}`);
      }
      if (!focusEvidence.immediate.sameKeyedNodeAtNewPath || !focusEvidence.settled.sameKeyedNodeAtNewPath) {
        throw new Error("keyed input identity changed during list movement");
      }
    }
  }

  const trace = await page.evaluate(() => window.__gobiBackendConformance.trace());
  const tick = trace.ticks.at(-1);
  observation.traceTick = tick;
  observation.traceTickIndex = trace.ticks.length - 1;
  if (tick.action === null || json(tick.action) !== json(action)) throw new Error(`trace action ${index} differs from the requested intent`);
  if (json(tick.message) !== json(expectation.message)) throw new Error(`trace message ${index} differs from the fixture oracle`);
  if (expectation.dispatchId !== undefined && tick.dispatchId !== expectation.dispatchId) throw new Error(`trace dispatch id ${index} differs from fixture`);
  if (expectation.message === null && tick.dispatchId !== null) throw new Error(`suppressed action ${index} unexpectedly updated application state`);
  if (expectation.message !== null && observation.observedAction === null) throw new Error(`active action ${index} lacks renderer action evidence`);
  if (observation.observedAction && observation.targetValueAtDispatch !== null &&
      observation.observedAction.value !== observation.targetValueAtDispatch) {
    throw new Error(`renderer observation ${index} differs from actual control value`);
  }
  return observation;
}

async function observeHostRequest(page, fixture, handledRequests) {
  const data = await page.evaluate(() => ({ requests: window.__gobiBackendConformance.hostRequests(),
    observations: window.__gobiBackendConformance.observations().requests }));
  const result = [];
  for (let index = handledRequests; index < data.requests.length; index += 1) {
    const observation = data.observations[index];
    const step = fixture.hostScript.steps[index];
    if (!step || json(step.request) !== json(data.requests[index])) throw new Error(`HostScript request ${index} differs`);
    if (observation.tickCount < 2 || observation.snapshot.state === null || observation.snapshot.dom === null) {
      throw new Error("effect host ran before a pending application state and DOM commit");
    }
    if (observation.snapshot.state.kind !== "struct" || !observation.snapshot.dom.html.includes("Status: pending") ||
        !observation.snapshot.dom.controls.some((control) => control.path === "1" && control.disabled)) {
      throw new Error("effect request was not committed as pending before host observation");
    }
    result.push({ index, request: data.requests[index], snapshot: observation.snapshot, tickCount: observation.tickCount });
  }
  return result;
}

async function deliverHostStep(page, fixture, requestIndex) {
  const step = fixture.hostScript.steps[requestIndex];
  if (!step) throw new Error(`missing HostScript step ${requestIndex}`);
  if (step.completion === null) return { delivered: false, completion: null };
  const before = await page.evaluate(() => ({ trace: window.__gobiBackendConformance.trace(),
    requests: window.__gobiBackendConformance.hostRequests(), completions: window.__gobiBackendConformance.hostCompletions() }));
  const wrongCorrelation = { dispatchId: `${step.request.dispatchId}-reordered`, effectIndex: step.request.effectIndex };
  let rejected = false;
  let rejection = null;
  try {
    await page.evaluate((requestKey) => window.__gobiBackendConformance.deliver(requestKey), wrongCorrelation);
  } catch (error) {
    rejected = true;
    rejection = String(error?.message ?? error);
  }
  const afterRejected = await page.evaluate(() => ({ trace: window.__gobiBackendConformance.trace(),
    requests: window.__gobiBackendConformance.hostRequests(), completions: window.__gobiBackendConformance.hostCompletions() }));
  if (!rejected || json(before.trace) !== json(afterRejected.trace) || json(before.requests) !== json(afterRejected.requests) ||
      json(before.completions) !== json(afterRejected.completions)) {
    throw new Error(`wrong/reordered effect correlation ${requestIndex} was not rejected without changing runtime/host state`);
  }
  const delivered = await page.evaluate(() => window.__gobiBackendConformance.deliverNext());
  if (!delivered) throw new Error(`HostScript completion ${requestIndex} was not deliverable`);
  return { delivered, completion: step.completion,
    reorderControl: { kind: "wrong-correlation-before-manual-reply", request: step.request, wrongCorrelation,
      rejected, rejection, before, after: afterRejected } };
}

async function runProfile(page, fixture, component, backend, { swaps = false, swapSchedule = null } = {}) {
  const start = await page.evaluate(({ script, componentId, targetBackend }) => window.__gobiBackendConformance.mount({
    fixtureScript: script, componentId, backend: targetBackend, strictMode: script.hostScript.steps.length > 0,
  }), { script: fixture, componentId: component.id, targetBackend: backend });
  const actions = [];
  const swapEvents = [];
  const focusAcrossSwap = [];
  const retained = new Map();
  const focusEvidence = {};
  let handledRequests = 0;
  let heldCompletions = [];
  const reorderControls = [];

  for (let index = 0; index < fixture.actions.length; index += 1) {
    const actionEvidence = await runAction(page, fixture, index, retained, focusEvidence);
    actions.push(actionEvidence);
    const newRequests = await observeHostRequest(page, fixture, handledRequests);
    handledRequests += newRequests.length;
    if (swaps) {
      const current = await page.evaluate(() => window.__gobiBackendConformance.currentRenderer());
      const currentIndex = swapSchedule.backends.indexOf(current.backend);
      const nextBackend = swapSchedule.backends[(currentIndex + 1) % swapSchedule.backends.length];
      const event = await page.evaluate((targetBackend) => window.__gobiBackendConformance.swap(targetBackend), nextBackend);
      const swapObservation = {
        afterActionIndex: index,
        from: event.before.renderer,
        to: event.after.renderer,
        beforeTrace: event.before.trace,
        afterTrace: event.after.trace,
        beforeSnapshot: event.before.snapshot,
        afterSnapshot: event.after.snapshot,
        returnedSnapshot: event.returnedSnapshot,
        hostRequestsBefore: event.before.hostRequests,
        hostRequestsAfter: event.after.hostRequests,
        hostCompletionsBefore: event.before.hostCompletions,
        hostCompletionsAfter: event.after.hostCompletions,
        diagnosticsBefore: event.before.diagnostics,
        diagnosticsAfter: event.after.diagnostics,
        oldRendererSnapshot: event.after.oldRendererSnapshot,
        oldRootDetached: event.after.oldRootDetached,
        oldRootEmptyDuringSwap: event.after.oldRootEmptyDuringSwap,
        rootMutationEvidence: event.after.rootMutationEvidence,
        focusBefore: event.before.focus,
        focusAfter: event.after.focus,
        focusNodeReplaced: event.after.focusNodeReplaced,
        physicalHTML: event.after.physicalHTML,
      };
      swapEvents.push(swapObservation);
      if (event.before.focus !== null) focusAcrossSwap.push({ actionIndex: index, before: event.before.focus, after: event.after.focus });
      if (event.after.trace.ticks.length !== event.before.trace.ticks.length) throw new Error("renderer replacement appended an application trace tick");
      if (json(event.before.trace) !== json(event.after.trace)) throw new Error("renderer replacement changed application trace bytes");
      if (json(event.before.snapshot.state) !== json(event.after.snapshot.state) ||
          json(event.before.snapshot.view) !== json(event.after.snapshot.view)) throw new Error("renderer replacement changed Go state or View");
      if (json(event.before.hostRequests) !== json(event.after.hostRequests) ||
          json(event.before.hostCompletions) !== json(event.after.hostCompletions)) throw new Error("renderer replacement changed effect host correlation");
      if (!event.after.oldRootDetached || event.after.oldRendererSnapshot.html !== "" ||
          event.after.oldRendererSnapshot.controls.length !== 0) throw new Error("retired renderer root was not empty after swap");
      const nextSnapshot = event.after.snapshot;
      const expectedDom = expectedDOMSnapshots(fixture)[event.after.trace.ticks.length - 1];
      if (json(nextSnapshot.dom) !== json(expectedDom)) throw new Error("new renderer DOM differs from the independent DOM oracle after swap");
      if (event.before.focus !== null && json(event.before.focus) !== json(event.after.focus)) {
        throw new Error("cross-backend swap did not restore focused keyed input and selection");
      }
      const nextIntent = fixture.actions[index + 1] ?? fixture.actions[index];
      const oldId = event.before.renderer.id;
      const fenced = await page.evaluate(({ rendererId, staleAction }) =>
        window.__gobiBackendConformance.fenceRetired(rendererId, staleAction, 0), { rendererId: oldId, staleAction: nextIntent });
      swapObservation.fenced = fenced;
      if (json(fenced.trace) !== json(event.after.trace) ||
          json(fenced.snapshot.state) !== json(event.after.snapshot.state) ||
          json(fenced.snapshot.view) !== json(event.after.snapshot.view)) throw new Error("retired renderer callbacks changed application state or trace");
      if (fenced.dispatch && (fenced.dispatch.accepted !== false || fenced.dispatch.stale !== true)) {
        throw new Error("retired renderer dispatch callback was not fenced");
      }
      if (!fenced.stale || fenced.stale.accepted !== false || fenced.stale.stale !== true) {
        throw new Error("retired renderer stale callback was not fenced");
      }
      const diag = fenced.diagnostics;
      if (!Array.isArray(diag.fencedCallbacks) || diag.fencedCallbacks.length < 1) throw new Error("runtime did not record the retired callback fence");
    }

    for (let requestIndex = heldCompletions.length; requestIndex < handledRequests; requestIndex += 1) {
      const step = fixture.hostScript.steps[requestIndex];
      if (step?.completion !== null && swaps) {
        heldCompletions.push(requestIndex);
        continue;
      }
      const result = await deliverHostStep(page, fixture, requestIndex);
      if (result.reorderControl) reorderControls.push(result.reorderControl);
    }
    for (const requestIndex of heldCompletions.splice(0)) {
      const result = await deliverHostStep(page, fixture, requestIndex);
      if (result.reorderControl) reorderControls.push(result.reorderControl);
    }
  }

  await page.evaluate(() => window.__gobiBackendConformance.hostDone());
  const host = await page.evaluate(() => ({ requests: window.__gobiBackendConformance.hostRequests(), completions: window.__gobiBackendConformance.hostCompletions() }));
  const duplicateEvidence = [];
  if (host.completions.length > 0) {
    const completion = host.completions[0];
    const before = await page.evaluate(() => window.__gobiBackendConformance.trace());
    const duplicate = await page.evaluate((value) => window.__gobiBackendConformance.duplicateCompletion(value), completion);
    const after = await page.evaluate(() => window.__gobiBackendConformance.trace());
    if (duplicate.accepted !== false || json(before) !== json(after)) throw new Error("duplicate completion changed the application trace");
    duplicateEvidence.push({ completion, result: duplicate, beforeTrace: before, afterTrace: after });
  }
  const trace = await page.evaluate(() => window.__gobiBackendConformance.trace());
  const observations = await page.evaluate(() => window.__gobiBackendConformance.observations());
  const diagnostics = await page.evaluate(() => window.__gobiBackendConformance.rendererDiagnostics());
  const evidence = { backend, start, trace, actions,
    swapObservations: { schema: "gobi.backend-swap-observations/v1", events: swapEvents, focusAcrossSwap },
    observations, host, reorderControls, duplicateEvidence, diagnostics,
    focus: Object.keys(focusEvidence).length ? focusEvidence : null };
  return evidence;
}

async function cleanupProfile(page) {
  const result = await page.evaluate(() => window.__gobiBackendConformance.unmount());
  if (result.physical.html !== "" || result.physical.controls !== 0 || result.rendererSnapshot.html !== "" ||
      result.rendererSnapshot.controls.length !== 0) throw new Error("runtime unmount left physical or renderer DOM behind");
  if (json(result.traceBefore) !== json(result.traceAfterUnmount)) throw new Error("unmount itself changed the Gobi trace");
  if (result.fenced) {
    const extraTicks = result.traceAfter.ticks.slice(result.traceAfterUnmount.ticks.length);
    if (extraTicks.length !== (result.fenced.dispatch ? 2 : 1) || extraTicks.some((tick) => tick.message !== null ||
        tick.dispatchId !== null || tick.requestedEffects.length !== 0 || tick.completedEffects.length !== 0)) {
      throw new Error("post-unmount callbacks were not fenced to suppressed actions");
    }
    for (const tick of extraTicks) {
      if (json(tick.state) !== json(result.traceAfterUnmount.ticks.at(-1).state)) throw new Error("post-unmount callback changed Go state");
    }
    if (result.fenced.dispatch && (result.fenced.dispatch.accepted !== true || result.fenced.dispatch.dispatchId !== null ||
        result.fenced.stale?.accepted !== true || result.fenced.stale?.dispatchId !== null)) {
      throw new Error("post-unmount callback produced a Go Update");
    }
  }
  return result;
}

export async function runBackendBrowserConformance({ compiledPath, helpersPath, fixturePath, outputPrefix,
  swapSchedule, chromiumPath = process.env.CHROMIUM_PATH }) {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const compiledModule = await import(pathToFileURL(resolve(compiledPath)).href);
  const compiled = compiledModule.gobiCompiled;
  if (!compiled || compiled.schema !== "gobi.compiled-module/v1") throw new Error("compiled input does not export gobiCompiled v1");
  const component = compiled.appIR.components.find((entry) => entry.packagePath === fixture.packagePath);
  if (!component) throw new Error(`compiled app has no fixture component ${fixture.packagePath}`);
  if (!swapSchedule || swapSchedule.schema !== "gobi.backend-swap-schedules/v1" ||
      !Array.isArray(swapSchedule.backends) || swapSchedule.backends.length < 2 ||
      !swapSchedule.backends.includes("react") || !swapSchedule.backends.includes("dom") ||
      !swapSchedule.fixtures.includes(fixture.name)) throw new Error("swap schedule is incomplete for this fixture");
  if (swapSchedule.policy !== "alternate-after-each-fixture-action" || swapSchedule.effectReplyTiming !== "after-scheduled-swap") {
    throw new Error("unsupported swap schedule policy");
  }
  const bundlePath = `${resolve(outputPrefix)}.bundle.mjs`;
  const entryPath = await buildBrowserBundle({ compiledPath, helpersPath, bundlePath });
  const serverHandle = await startServer(bundlePath);
  let browser;
  const pageErrors = [];
  let partial = null;
  let noWasm = null;
  const profiles = {};
  try {
    browser = await chromium.launch(chromiumLaunchOptions(chromiumPath));
    const page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    noWasm = await installNoWasmGuards(page);
    await page.goto(serverHandle.url, { waitUntil: "load", timeout: 15000 });
    await page.waitForFunction(() => typeof window.__gobiBackendConformance?.mount === "function", null, { timeout: 15000 });
    for (const backend of ["react", "dom"]) {
      profiles[backend] = await runProfile(page, fixture, component, backend);
      profiles[backend].unmount = await cleanupProfile(page);
    }
    profiles.swap = await runProfile(page, fixture, component, swapSchedule.initialBackend, { swaps: true, swapSchedule });
    partial = profiles;
    const unmount = await cleanupProfile(page);
    if (pageErrors.length > 0) throw new Error(`browser page error: ${pageErrors.join(" | ")}`);
    const wasm = await noWasm.assertClear();
    return { schema: "gobi.backend-browser-conformance/v1", fixture: fixture.name,
      browser: await browser.version(), appId: component.id, schedule: swapSchedule, profiles, unmount, noWasm: wasm,
      pageErrors, bundle: { path: bundlePath, sha256: createHash("sha256").update(await readFile(bundlePath)).digest("hex"),
        bytes: (await readFile(bundlePath)).length }, browserEntry: entryPath };
  } catch (error) {
    try {
      partial = profiles;
      const page = browser?.contexts()[0]?.pages()[0];
      if (page) partial = { completedProfiles: profiles, current: await page.evaluate(() => {
        const api = window.__gobiBackendConformance;
        const safely = (fn) => { try { return fn(); } catch (error) { return { captureError: String(error) }; } };
        return { trace: safely(() => api?.trace?.() ?? null), snapshot: safely(() => api?.snapshot?.() ?? null),
          diagnostics: safely(() => api?.rendererDiagnostics?.() ?? null), observations: safely(() => api?.observations?.() ?? null),
          html: document.getElementById("app")?.innerHTML ?? null };
      }) };
    } catch { /* partial capture is best effort */ }
    const failure = { schema: "gobi.backend-browser-failure/v1", status: "rejected", fixture: fixture.name,
      stage: partial === null ? "setup-or-mount" : "profile-or-swap", error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null },
      partial, pageErrors, noWasmRequests: noWasm?.requests ?? null,
      bundle: { path: bundlePath, exists: true, sha256: createHash("sha256").update(await readFile(bundlePath)).digest("hex") } };
    await mkdir(dirname(resolve(outputPrefix)), { recursive: true });
    await writeFile(`${resolve(outputPrefix)}.failed.json`, `${JSON.stringify(failure, null, 2)}\n`);
    error.failureEvidence = failure;
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose, reject) => serverHandle.server.close((error) => error ? reject(error) : resolveClose()));
  }
}
