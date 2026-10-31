import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { chromium } from "../../interaction/node_modules/playwright/index.mjs";

import { chromiumLaunchOptions } from "./browser.mjs";
import { installNoWasmGuards } from "./no-wasm.mjs";

const functionHooks = ["compile", "compileStreaming", "instantiate", "instantiateStreaming", "validate"];
const constructorHooks = ["Module", "Instance", "Memory", "Table", "Global"];
const absent = Symbol("absent WebAssembly global");

function makeWebAssembly({ lockedReadOnly = null, lockedWritable = null } = {}) {
  const api = {};
  for (const name of functionHooks) {
    Object.defineProperty(api, name, {
      configurable: name !== lockedReadOnly && name !== lockedWritable,
      enumerable: true,
      writable: name !== lockedReadOnly,
      value: function originalEntryPoint() {},
    });
  }
  for (const name of constructorHooks) {
    Object.defineProperty(api, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: function OriginalConstructor() {},
    });
  }
  return api;
}

async function createMockPage(webAssembly = makeWebAssembly(), { runInitScripts = true } = {}) {
  const context = vm.createContext({});
  context.WebAssembly = webAssembly === absent ? undefined : webAssembly;
  vm.runInContext("globalThis.window = globalThis", context);
  const initScripts = [];
  let requestRoute;
  const page = {
    async route(pattern, handler) { requestRoute = { pattern, handler }; },
    async addInitScript(script) { initScripts.push(script); },
    async evaluate(script) {
      const value = vm.runInContext(`(${script.toString()})()`, context);
      return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    },
  };
  const guard = await installNoWasmGuards(page);
  assert.ok(requestRoute, "the helper also registers a .wasm request blocker");
  if (runInitScripts) {
    for (const script of initScripts) vm.runInContext(`(${script.toString()})()`, context);
  }
  return { context, guard, requestRoute };
}

function coverageNames(coverage) {
  return coverage.entries.map((entry) => entry.name);
}

test("real Chromium guard blocks compilation and reports successful hook coverage", async () => {
  const browser = await chromium.launch(chromiumLaunchOptions(process.env.CHROMIUM_PATH));
  try {
    const page = await browser.newPage();
    const guard = await installNoWasmGuards(page);
    await page.goto("data:text/html,<!doctype html><main id=app>JavaScript%20app</main>");
    const evidence = await guard.assertClear();
    assert.deepEqual(evidence.wasmRequests, []);
    assert.deepEqual(evidence.wasmAPIAttempts, []);
    assert.equal(evidence.guardCoverage.status, "complete");
    assert.ok(evidence.guardCoverage.entries.length > 0);
    assert.deepEqual(evidence.guardCoverage.failures, []);
    const blocked = await page.evaluate(() => {
      try {
        WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
        return false;
      } catch (error) {
        return String(error.message).includes("WebAssembly disabled by conformance driver");
      }
    });
    assert.equal(blocked, true);
    await assert.rejects(guard.assertClear(), /WebAssembly\.compile/);
  } finally {
    await browser.close();
  }
});

test("real Chromium guard rejects WASM asset requests", async () => {
  const browser = await chromium.launch(chromiumLaunchOptions(process.env.CHROMIUM_PATH));
  try {
    const page = await browser.newPage();
    const guard = await installNoWasmGuards(page);
    await page.goto("data:text/html,<!doctype html><main id=app>JavaScript%20app</main>");
    await page.evaluate(async () => { try { await fetch("https://gobi.invalid/attempt.wasm"); } catch { /* blocked by route */ } });
    await assert.rejects(guard.assertClear(), /attempt\.wasm/);
  } finally {
    await browser.close();
  }
});

test("installs every listed API and constructor guard and returns explicit complete coverage", async () => {
  const { guard, context } = await createMockPage();

  const evidence = await guard.assertClear();

  assert.deepEqual(evidence.wasmRequests, []);
  assert.deepEqual(evidence.wasmAPIAttempts, []);
  assert.equal(evidence.guardCoverage.status, "complete");
  assert.deepEqual(evidence.guardCoverage.failures, []);
  assert.deepEqual(coverageNames(evidence.guardCoverage), [
    ...functionHooks.map((name) => `WebAssembly.${name}`),
    ...constructorHooks.map((name) => `WebAssembly.${name}`),
  ]);
  assert.ok(evidence.guardCoverage.entries.every((entry) => entry.status === "installed"));

  assert.throws(() => vm.runInContext("WebAssembly.compile()", context), /WebAssembly disabled/);
  await assert.rejects(guard.assertClear(), /WASM fallback detected/);
  const attempts = await vm.runInContext("window.__gobiNoWasmAttempts", context);
  assert.deepEqual(Array.from(attempts), ["WebAssembly.compile"]);
});

test("reports absent only when the WebAssembly global is absent", async () => {
  const { guard } = await createMockPage(absent);

  const evidence = await guard.assertClear();

  assert.deepEqual(evidence.wasmRequests, []);
  assert.deepEqual(evidence.wasmAPIAttempts, []);
  assert.deepEqual(evidence.guardCoverage, {
    status: "absent",
    entries: [{ name: "WebAssembly", kind: "global", status: "absent" }],
    failures: [],
  });
});

test("fails closed when a present read-only non-configurable hook cannot be replaced", async () => {
  const { guard, context } = await createMockPage(makeWebAssembly({ lockedReadOnly: "compile" }));

  await assert.rejects(guard.assertClear(), /coverage installation failed/);
  const coverage = JSON.parse(JSON.stringify(context.window.__gobiNoWasmGuardCoverage));
  assert.equal(coverage.status, "failed");
  assert.deepEqual(coverage.failures, [{
    name: "WebAssembly.compile",
    reason: "property is non-configurable and non-writable",
  }]);
});

test("fails closed when a present WebAssembly global has no observable coverage ledger", async () => {
  const { guard } = await createMockPage(makeWebAssembly(), { runInitScripts: false });

  await assert.rejects(guard.assertClear(), /coverage is missing or unobservable/);
});

test("supports replacing a non-configurable but writable hook without changing its descriptor", async () => {
  const webAssembly = makeWebAssembly({ lockedWritable: "compile" });
  const { guard, context } = await createMockPage(webAssembly);

  const evidence = await guard.assertClear();

  assert.equal(evidence.guardCoverage.status, "complete");
  const descriptor = Object.getOwnPropertyDescriptor(webAssembly, "compile");
  assert.equal(descriptor.configurable, false);
  assert.equal(descriptor.writable, true);
  assert.throws(() => vm.runInContext("WebAssembly.compile()", context), /WebAssembly disabled/);
  await assert.rejects(guard.assertClear(), /WASM fallback detected/);
});

