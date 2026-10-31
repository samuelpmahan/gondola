import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { chromiumLaunchOptions } from "../../compiled-frontend/conformance/browser.mjs";
import { installNoWasmGuards } from "../../compiled-frontend/conformance/no-wasm.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

const output = resolve(option("--demo"));
const resultPath = resolve(option("--output"));
const screenshotPath = resolve(option("--screenshot"));
const result = {
  schema: "gobi.compiled-methods-http-smoke/v1",
  status: "running",
  startedAt: new Date().toISOString(),
  checks: [],
  failures: [],
  browserErrors: [],
  requests: [],
  wasmRequests: [],
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    let path = resolve(output, `.${decodeURIComponent(url.pathname)}`);
    if (path !== output && !path.startsWith(output + sep)) throw new Error("request outside demo directory");
    if (url.pathname.endsWith("/")) path = join(path, "index.html");
    const bytes = await readFile(path);
    result.requests.push({ path: url.pathname, status: 200, bytes: bytes.length });
    response.writeHead(200, {
      "content-type": contentTypes[extname(path)] ?? "application/octet-stream",
      "cache-control": "no-store",
      "content-length": bytes.length,
    });
    response.end(bytes);
  } catch {
    result.requests.push({ path: request.url, status: 404, bytes: 0 });
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end("not found");
  }
});

await mkdir(dirname(resultPath), { recursive: true });
await mkdir(dirname(screenshotPath), { recursive: true });
await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveListen);
});

let browser;
let page;
let noWasm;
try {
  browser = await chromium.launch(chromiumLaunchOptions(process.env.CHROMIUM_PATH));
  result.browserVersion = browser.version();
  page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => result.browserErrors.push(error.message));
  page.on("request", (request) => {
    if (/\.wasm(?:[?#]|$)/i.test(request.url())) result.wasmRequests.push(request.url());
  });
  noWasm = await installNoWasmGuards(page);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP server did not expose a TCP address");
  result.url = `http://127.0.0.1:${address.port}/`;
  await page.goto(result.url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.methodsDemo?.runtime && window.methodsDemo.backend === "react");
  assert.match(await page.locator("#status").innerText(), /Go View mounted/);
  assert.equal(await page.locator("[data-renderer=react]").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".method-composition").count(), 1);
  result.checks.push("HTTP route loaded the actual compiled GoScript module and mounted its Go View with the React renderer");

  const snapshot = () => page.evaluate(() => window.methodsDemo.runtime.snapshot());
  const tickCount = () => page.evaluate(() => window.methodsDemo.runtime.trace().ticks.length);
  const activeBackend = () => page.evaluate(() => window.methodsDemo.backend);
  const numeric = (value) => {
    assert.equal(value?.kind, "float64", "expected a Go float64 state field");
    return Buffer.from(value.float64Bits, "hex").readDoubleBE(0);
  };
  const field = (value, name) => {
    assert.equal(value?.kind, "struct", `expected a Go struct before reading ${name}`);
    const found = value.fields.find((entry) => entry.name === name);
    assert.ok(found, `missing Go state field ${name}`);
    return found.value;
  };
  const currentState = async () => {
    const state = (await snapshot()).state;
    return {
      parent: numeric(field(field(state, "Parent"), "Count")),
      child: numeric(field(field(state, "Child"), "Count")),
      readOnly: field(state, "ReadOnly").bool,
      savedChild: numeric(field(state, "SavedChild")),
    };
  };
  const assertState = async (expected) => {
    assert.deepEqual(await currentState(), expected);
    const view = page.locator(".method-composition");
    const parent = page.locator(".parent-counter");
    const child = page.locator(".child-counter");
    assert.equal(await parent.locator("p").innerText(), `Parent: ${expected.parent}`);
    assert.equal(await child.locator("p").innerText(), `Child: ${expected.child}`);
    assert.equal(await view.getByText(`Saved child: ${expected.savedChild}`, { exact: true }).count(), 1);
    assert.equal(await parent.getByRole("button", { name: "Parent +", exact: true }).isDisabled(), false);
    assert.equal(await parent.getByRole("button", { name: "Parent Reset", exact: true }).isDisabled(), expected.parent === 0);
    assert.equal(await child.getByRole("button", { name: "Child +", exact: true }).isDisabled(), expected.readOnly);
    assert.equal(await child.getByRole("button", { name: "Child Reset", exact: true }).isDisabled(), expected.readOnly || expected.child === 0);
    assert.equal(await view.getByRole("button", { name: expected.readOnly ? "Unlock child" : "Lock child", exact: true }).isDisabled(), false);
    assert.equal(await view.getByRole("button", { name: "Capture child", exact: true }).isDisabled(), false);
    assert.equal(await view.getByRole("button", { name: "Publish saved to parent", exact: true }).isDisabled(), false);
  };

  const actions = [
    { button: "Child +", state: { parent: 0, child: 1, readOnly: false, savedChild: 0 } },
    { button: "Child +", state: { parent: 0, child: 2, readOnly: false, savedChild: 0 } },
    { button: "Capture child", state: { parent: 0, child: 2, readOnly: false, savedChild: 2 } },
    { button: "Child +", state: { parent: 0, child: 3, readOnly: false, savedChild: 2 } },
    { button: "Publish saved to parent", state: { parent: 2, child: 3, readOnly: false, savedChild: 2 } },
    { button: "Child Reset", state: { parent: 2, child: 0, readOnly: false, savedChild: 2 } },
    { button: "Child Reset", disabled: true, state: { parent: 2, child: 0, readOnly: false, savedChild: 2 } },
    { button: "Child +", state: { parent: 2, child: 1, readOnly: false, savedChild: 2 } },
    { button: "Lock child", state: { parent: 2, child: 1, readOnly: true, savedChild: 2 } },
    { button: "Child +", disabled: true, state: { parent: 2, child: 1, readOnly: true, savedChild: 2 } },
    { button: "Child Reset", disabled: true, state: { parent: 2, child: 1, readOnly: true, savedChild: 2 } },
    { button: "Parent +", state: { parent: 3, child: 1, readOnly: true, savedChild: 2 } },
    { button: "Capture child", state: { parent: 3, child: 1, readOnly: true, savedChild: 1 } },
    { button: "Publish saved to parent", state: { parent: 1, child: 1, readOnly: true, savedChild: 1 } },
    { button: "Unlock child", state: { parent: 1, child: 1, readOnly: false, savedChild: 1 } },
    { button: "Child +", state: { parent: 1, child: 2, readOnly: false, savedChild: 1 } },
    { button: "Parent Reset", state: { parent: 0, child: 2, readOnly: false, savedChild: 1 } },
    { button: "Parent Reset", disabled: true, state: { parent: 0, child: 2, readOnly: false, savedChild: 1 } },
  ];
  await assertState({ parent: 0, child: 0, readOnly: false, savedChild: 0 });
  let acceptedDispatches = 0;
  let rendererSwaps = 0;
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const button = page.getByRole("button", { name: action.button, exact: true }).last();
    const ticksBefore = await tickCount();
    if (action.disabled) {
      assert.equal(await button.isDisabled(), true, `fixture intent ${index} should be disabled`);
      await assertState(action.state);
      assert.equal(await tickCount(), ticksBefore, `disabled UI intent ${index} must not reach Go Update`);
      continue;
    }
    assert.equal(await button.isDisabled(), false, `fixture action ${index} should remain available`);
    await button.click();
    acceptedDispatches += 1;
    assert.equal(await tickCount(), ticksBefore + 1, `action ${index} should create one Go tick`);
    await assertState(action.state);

    if (index === 4 || index === 13) {
      const beforeSwap = await snapshot();
      const beforeTicks = await tickCount();
      const next = await activeBackend() === "react" ? "dom" : "react";
      await page.getByRole("button", { name: new RegExp(`^${next}$`, "i") }).click();
      await page.waitForFunction((expected) => window.methodsDemo?.backend === expected, next);
      rendererSwaps += 1;
      assert.deepEqual(await snapshot(), beforeSwap, "renderer replacement must retain the exact Go snapshot");
      assert.equal(await tickCount(), beforeTicks, "renderer replacement must not create an application tick");
      assert.equal(await page.locator(`[data-renderer=${next}]`).getAttribute("aria-pressed"), "true");
      await assertState(action.state);
    }
  }
  assert.equal(acceptedDispatches, 14);
  assert.equal(await tickCount(), 15, "the browser UI should record Init plus fourteen accepted clicks");
  assert.equal(rendererSwaps, 2);
  const finalBeforeSwap = await snapshot();
  const finalTicks = await tickCount();
  if (await activeBackend() !== "dom") {
    await page.getByRole("button", { name: /^DOM$/ }).click();
    await page.waitForFunction(() => window.methodsDemo?.backend === "dom");
    rendererSwaps += 1;
  }
  assert.deepEqual(await snapshot(), finalBeforeSwap);
  assert.equal(await tickCount(), finalTicks);
  await assertState({ parent: 0, child: 2, readOnly: false, savedChild: 1 });
  result.acceptedDispatches = acceptedDispatches;
  result.rendererSwaps = rendererSwaps;
  result.finalState = await currentState();
  result.finalBackend = await activeBackend();
  result.checks.push("Go value methods captured Child=2 before a later Child=3 edit and published the saved value into Parent");
  result.checks.push("locked child actions stayed disabled while parent, capture, and publish actions remained available");
  result.checks.push("React/DOM swaps retained the Go snapshot without allocating an application tick");
  result.checks.push("zero-valued Parent Reset and Child Reset controls were disabled");

  const runtimeFailures = await page.evaluate(() => window.methodsDemo.failures);
  assert.deepEqual(runtimeFailures, []);
  assert.deepEqual(result.browserErrors, []);
  assert.deepEqual(result.wasmRequests, []);
  result.noWasm = await noWasm.assertClear();
  result.status = "passed";
} catch (error) {
  result.status = "failed";
  result.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const debug = await page?.evaluate(() => ({
    backend: window.methodsDemo?.backend ?? null,
    snapshot: window.methodsDemo?.runtime?.snapshot?.() ?? null,
    trace: window.methodsDemo?.runtime?.trace?.() ?? null,
    failures: window.methodsDemo?.failures ?? null,
  })).catch(() => null);
  result.partial = debug;
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  try {
    if (page) await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (error) {
    result.screenshotError = error instanceof Error ? error.message : String(error);
  }
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

console.log(JSON.stringify(result));
