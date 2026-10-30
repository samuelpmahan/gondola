// Inertia's own browser client, run inside jsdom against a real HTTP server, for oracle.Visit.
// Usage: node inertia-client.mjs   (the job as one JSON object on standard input, the result as one JSON line on standard output)
//   job:    {"base": "http://127.0.0.1:1234", "path": "/", "layers": "http://127.0.0.1:5678", "steps": [{"Kind","URL","Only","Except","Data"}]}
//   result: {"page": {component, props, url, version}, "errors": [...], "fullReloads": n}
// Each page load (the first one, and every full page reload Inertia falls back to) runs in its own worker thread, because
// Inertia keeps its state in module variables and a browser starts again from nothing on a new document.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";

if (isMainThread) {
  const job = JSON.parse(readFileSync(0, "utf8"));
  let url = new URL(job.path, job.base).href;
  let fromStep = 0;
  let storage = {};
  let cookies;
  let fullReloads = 0;
  const errors = [];
  let outcome;
  for (let load = 0; load < 20; load++) {
    outcome = await new Promise((resolve) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: { job, url, fromStep, storage, cookies } });
      worker.on("message", resolve);
      worker.on("error", (error) => resolve({ done: true, errors: [`worker: ${(error && error.stack) || error}`] }));
    });
    errors.push(...(outcome.errors ?? []));
    cookies = outcome.cookies ?? cookies;
    if (!outcome.reload) break;
    fullReloads++;
    url = outcome.reload;
    fromStep = outcome.nextStep;
    storage = outcome.storage ?? {};
  }
  if (outcome.reload) errors.push("more than 20 full page loads in a row");
  console.log(JSON.stringify({ page: outcome.page ?? null, errors, fullReloads }));
  process.exit(0);
} else {
  await work(workerData);
}

async function work({ job, url, fromStep, storage, cookies }) {
  process.env.GOBI_NODE_ENV = "development"; // React then explains a hydration mismatch in full
  const errors = [];
  const { JSDOM, CookieJar, VirtualConsole } = await import("jsdom");
  const jar = cookies ? CookieJar.deserializeSync(cookies) : new CookieJar();
  // jsdom cannot navigate. A full page load is what Inertia asks for with window.location; it is caught here and done by
  // the main thread, as a new document.
  let navigated;
  const navigation = new Promise((resolve) => (navigated = resolve));
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => {
    if (/navigation/i.test(String(error && error.message))) navigated(true);
    else if (!/Not implemented/i.test(String(error && error.message))) errors.push(`jsdom: ${(error && error.message) || error}`);
  });
  virtualConsole.on("error", (...args) => errors.push(`console.error: ${args.join(" ")}`));
  let dom;
  try {
    dom = await JSDOM.fromURL(url, { cookieJar: jar, pretendToBeVisual: true, virtualConsole });
  } catch (error) {
    parentPort.postMessage({ done: true, errors: [`could not load ${url}: ${error.message}`] });
    return;
  }
  const { window } = dom;
  for (const [key, value] of Object.entries(storage)) window.sessionStorage.setItem(key, value);
  // jsdom has no navigation timing; Node's performance answers the same questions with an empty list.
  Object.defineProperty(window, "performance", { configurable: true, value: performance });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollTo = () => {};
  installGlobals(window);

  // The address Inertia is about to load as a whole page, learnt from the 409 it was answered with.
  let location = null;
  const send = window.XMLHttpRequest.prototype.send;
  window.XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", () => {
      const to = this.getResponseHeader("X-Inertia-Location");
      if (this.status === 409 && to) {
        location = new URL(to, window.location.href).href;
      }
    });
    return send.apply(this, args);
  };

  const { React } = await import("./react-nodes.mjs");
  const { createInertiaApp, router } = await import("@inertiajs/react");
  const { hydrateRoot } = await import("react-dom/client");
  const { resolver } = await import("./inertia-pages.mjs");
  const h = React.createElement;

  let page = null;
  const element = window.document.querySelector('script[data-page="app"][type="application/json"]');
  if (element) page = JSON.parse(element.textContent);
  window.addEventListener("error", (event) => errors.push(`error: ${event.message}`));
  process.on("unhandledRejection", (reason) => errors.push(`unhandled rejection: ${(reason && reason.message) || reason}`));
  const finish = (extra) => {
    const { component, props, url, version } = page ?? {};
    parentPort.postMessage({ page: page && { component, props, url, version }, errors, cookies: JSON.stringify(jar.serializeSync()), ...extra });
  };

  try {
    await createInertiaApp({
      resolve: resolver(job.layers),
      progress: false,
      setup({ el, App, props }) {
        hydrateRoot(el, h(App, props), { onRecoverableError: (error) => errors.push(`hydration: ${(error && error.message) || error}`) });
      },
    });
  } catch (error) {
    errors.push(`createInertiaApp: ${(error && error.message) || error}`);
    return finish({ done: true });
  }
  router.on("navigate", (event) => (page = event.detail.page));
  router.on("success", (event) => (page = event.detail.page)); // a partial reload ends with success, not navigate
  router.on("httpException", (event) => {
    errors.push(`the server answered a visit with ${event.detail.response.status}, which is not an Inertia response`);
    event.preventDefault();
  });
  router.on("networkError", (event) => {
    errors.push(`network error: ${(event.detail.error && event.detail.error.message) || event.detail.error}`);
    event.preventDefault();
  });
  await settle();

  const steps = job.steps ?? [];
  for (let i = fromStep; i < steps.length; i++) {
    const step = steps[i];
    const done = new Promise((resolve) => {
      const options = { onFinish: () => resolve(false), onCancel: () => resolve(false) };
      if (step.Only && step.Only.length) options.only = step.Only;
      if (step.Except && step.Except.length) options.except = step.Except;
      try {
        switch (step.Kind) {
          case "visit": router.get(step.URL, {}, options); break;
          case "reload": router.reload(options); break;
          case "post": router.post(step.URL, step.Data ?? {}, options); break;
          case "put": router.put(step.URL, step.Data ?? {}, options); break;
          case "patch": router.patch(step.URL, step.Data ?? {}, options); break;
          case "delete": router.delete(step.URL, options); break;
          default: errors.push(`unknown step kind ${JSON.stringify(step.Kind)}`); resolve(false);
        }
      } catch (error) {
        errors.push(`step ${i} (${step.Kind} ${step.URL}): ${error.message}`);
        resolve(false);
      }
    });
    const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), 10000));
    const outcome = await Promise.race([done, navigation, timeout]);
    // Inertia answers a 409 with window.location = to. jsdom reports a move to another address, but not a move to the very
    // address it is on (a reload), so a 409 that named a location is taken as the move too.
    if (outcome === true || location) {
      await settle();
      const storageNow = {};
      for (let k = 0; k < window.sessionStorage.length; k++) storageNow[window.sessionStorage.key(k)] = window.sessionStorage.getItem(window.sessionStorage.key(k));
      return finish({ reload: location ?? window.location.href, nextStep: i + 1, storage: storageNow });
    }
    if (outcome === "timeout") errors.push(`step ${i} (${step.Kind} ${step.URL}) did not finish in 10 seconds`);
    await settle();
  }
  finish({ done: true });
}

// settle lets React and Inertia finish what they started.
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 10));
}

// installGlobals makes the jsdom window the global scope, as in a browser, except for what Node does better.
function installGlobals(window) {
  const keep = new Set(["setTimeout", "setInterval", "clearTimeout", "clearInterval", "setImmediate", "clearImmediate", "queueMicrotask",
    "console", "process", "Buffer", "fetch", "URL", "URLSearchParams", "TextEncoder", "TextDecoder", "structuredClone", "performance",
    "crypto", "AbortController", "AbortSignal", "globalThis", "undefined", "NaN", "Infinity", "Object", "Function", "Array", "String",
    "Number", "Boolean", "Symbol", "Math", "JSON", "Promise", "Proxy", "Reflect", "Map", "Set", "WeakMap", "WeakSet", "Date", "RegExp",
    "Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "Intl", "BigInt", "ArrayBuffer", "DataView", "Uint8Array",
    "Int8Array", "Uint16Array", "Int16Array", "Uint32Array", "Int32Array", "Float32Array", "Float64Array", "WebAssembly", "eval",
    "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "escape",
    "unescape", "MessageChannel", "MessagePort", "MessageEvent", "BroadcastChannel", "Atomics", "SharedArrayBuffer", "WeakRef",
    "FinalizationRegistry", "AggregateError", "EvalError", "URIError", "Iterator", "require", "module", "exports"]);
  for (const key of Object.getOwnPropertyNames(window)) {
    if (keep.has(key)) continue;
    Object.defineProperty(globalThis, key, { configurable: true, enumerable: false, get: () => window[key], set: (value) => { window[key] = value; } });
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: window });
  Object.defineProperty(globalThis, "self", { configurable: true, value: window });
}
