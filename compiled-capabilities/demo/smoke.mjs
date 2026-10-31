import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { chromiumLaunchOptions } from "../../compiled-frontend/conformance/browser.mjs";
import { installNoWasmGuards } from "../../compiled-frontend/conformance/no-wasm.mjs";

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    if (fallback !== null) return fallback;
    throw new Error(`missing ${name}`);
  }
  if (!process.argv[index + 1]) throw new Error(`missing value for ${name}`);
  return process.argv[index + 1];
}

const demoDirectory = resolve(option("--demo"));
const outputPath = resolve(option("--output"));
const screenshotPath = resolve(option("--screenshot"));
const requestedPort = Number(option("--port", "0"));
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  throw new Error("--port must be an integer from 0 through 65535");
}
const result = {
  schema: "gobi.compiled-capabilities-demo-smoke/v1",
  status: "running",
  startedAt: new Date().toISOString(),
  checks: [],
  failures: [],
  browserErrors: [],
  consoleErrors: [],
  failedRequests: [],
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
    let path = resolve(demoDirectory, `.${decodeURIComponent(url.pathname)}`);
    if (path !== demoDirectory && !path.startsWith(demoDirectory + sep)) throw new Error("request outside demo directory");
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

await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(screenshotPath), { recursive: true });
await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(requestedPort, "127.0.0.1", resolveListen);
});

let browser;
let page;
let noWasm;
try {
  browser = await chromium.launch(chromiumLaunchOptions(process.env.CHROMIUM_PATH));
  result.browserVersion = browser.version();
  page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => result.browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") result.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => result.failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? null }));
  page.on("request", (request) => {
    if (/\.wasm(?:[?#]|$)/i.test(request.url())) result.wasmRequests.push(request.url());
  });
  noWasm = await installNoWasmGuards(page);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP server did not expose a TCP address");
  result.port = address.port;
  result.url = `http://127.0.0.1:${address.port}/`;
  await page.goto(result.url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.capabilityDemo?.runtime && window.capabilityDemo.backend === "dom");

  assert.match(await page.locator("#status").innerText(), /Compiled Go lifecycle active/);
  assert.equal(await page.locator("#go-view .lifecycle").count(), 1);
  assert.equal(await page.locator("#go-view .lifecycle-parent").count(), 1);
  assert.equal(await page.locator("#go-view .lifecycle-child").count(), 1);
  assert.equal(await page.locator("#go-view .lifecycle-grandchild").count(), 1);
  assert.equal(await page.locator("#go-view .lifecycle-sibling").count(), 1);
  assert.equal(await page.locator("#complete-next").isDisabled(), true);
  result.checks.push("HTTP served the compiled Go lifecycle app and mounted its actual Parent, Child, Grandchild, and Sibling view with the DOM renderer");

  for (const assetPath of ["/", "/demo.css", "/demo.bundle.mjs"]) {
    const asset = result.requests.find((request) => request.path === assetPath);
    assert.ok(asset, `expected HTTP request for ${assetPath}`);
    assert.equal(asset.status, 200, `${assetPath} must return HTTP 200`);
    assert.ok(asset.bytes > 0, `${assetPath} must not be empty`);
  }
  result.checks.push("the page, stylesheet, and compiled browser bundle each returned HTTP 200");

  const visibleCaps = async (id) => page.locator(`#${id} li`).allTextContents();
  const requirements = await visibleCaps("compiled-requirements");
  const hostSupport = await visibleCaps("host-support");
  const domSupport = await visibleCaps("renderer-support");
  assert.ok(requirements.includes("view.node"));
  assert.ok(requirements.includes("effect.request-reply"));
  assert.ok(requirements.includes("effect.cancel"));
  assert.deepEqual(hostSupport, ["effect.request-reply", "effect.cancel"]);
  assert.ok(domSupport.includes("view.node"));
  result.checks.push("the page exposes compiled Go requirements, the lifecycle host's explicit support, and the active DOM view profile");

  const snapshot = () => page.evaluate(() => window.capabilityDemo.runtime.snapshot());
  const trace = () => page.evaluate(() => window.capabilityDemo.runtime.trace());
  const pending = () => page.evaluate(() => window.capabilityDemo.effects.pending());
  const backend = () => page.evaluate(() => window.capabilityDemo.backend);
  const countParent = async () => {
    const state = (await snapshot()).state;
    const parent = field(state, "Parent");
    const counter = field(parent, "Counter");
    return scalar(field(counter, "Count"));
  };

  await clickGoAction("#go-view .lifecycle-parent > .lifecycle-add", "parent counter add");
  assert.equal(await countParent(), 1);
  await clickGoAction("#go-view .lifecycle-parent > .lifecycle-request", "parent request");
  const requestToken = "parent:g1:r1";
  assert.deepEqual((await pending()).map((entry) => entry.token), [requestToken]);
  assert.equal(await page.locator("#complete-next").isDisabled(), false);
  assert.equal(await page.locator("#go-view .lifecycle-parent > .lifecycle-request").isDisabled(), true);
  const beforeDisabledClick = await trace();
  await page.locator("#go-view .lifecycle-parent > .lifecycle-request").evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.deepEqual(await trace(), beforeDisabledClick, "disabled Go action must be ignored before Update");
  assert.deepEqual((await pending()).map((entry) => entry.token), [requestToken]);
  result.checks.push("enabled DOM clicks created one Go tick each in order; the disabled pending request ignored an injected click without a tick");

  const beforeReact = await snapshot();
  const beforeReactTrace = await trace();
  const beforeReactPending = await pending();
  await page.locator('[data-renderer="react"]').click();
  await page.waitForFunction(() => window.capabilityDemo.backend === "react");
  assertSameGoSnapshot(await snapshot(), beforeReact, "compatible renderer swap");
  assert.deepEqual(await trace(), beforeReactTrace, "compatible renderer swap must not create a Go tick");
  assert.deepEqual(await pending(), beforeReactPending, "compatible renderer swap must preserve pending correlation");
  assert.ok((await visibleCaps("renderer-support")).includes("view.node"));
  assert.equal(await page.locator("[data-renderer=react]").getAttribute("aria-pressed"), "true");
  result.reactVersions = await page.evaluate(() => window.capabilityDemo.reactVersions);
  assert.deepEqual(result.reactVersions, { react: "19.3.1", reactDOM: "19.3.1" });
  assert.equal(await page.locator("#go-view .lifecycle-parent").count(), 1, "React must mount the Go lifecycle tree");
  result.checks.push("the compatible DOM→React 19.3.1 swap retained the mounted Go counter, view, tick history, and pending request");

  await page.locator("#go-view .lifecycle-parent > .lifecycle-add").evaluate((button) => {
    window.__parentAddBeforeRejectedSwap = button;
  });
  const beforeReject = await snapshot();
  const beforeRejectTrace = await trace();
  const beforeRejectPending = await pending();
  const beforeRejectHTML = await page.locator("#go-view").innerHTML();
  const beforeRejectTicks = beforeRejectTrace.ticks.length;
  await page.locator("#reject-incompatible").click();
  assert.match(await page.locator("#swap-status").innerText(), /Incompatible profile rejected/);
  assert.match(await page.locator("#swap-status").innerText(), /view\.node/);
  assert.equal(await backend(), "react", "rejected candidate must not replace the live React renderer");
  assert.deepEqual(await snapshot(), beforeReject, "rejected candidate must preserve Go state and logical view");
  assert.deepEqual(await trace(), beforeRejectTrace, "rejected candidate must not create a Go tick");
  assert.deepEqual(await pending(), beforeRejectPending, "rejected candidate must preserve the outstanding request");
  assert.equal(await page.locator("#go-view").innerHTML(), beforeRejectHTML, "rejected candidate must preserve physical DOM");
  assert.equal(await page.locator("#go-view .lifecycle-parent > .lifecycle-add").evaluate((button) => button === window.__parentAddBeforeRejectedSwap), true,
    "rejected candidate must leave the original mounted control node in place");
  const replacements = (await page.evaluate(() => window.capabilityDemo.runtime.rendererDiagnostics())).replacements;
  const rejected = replacements.at(-1);
  assert.equal(rejected.outcome, "rejected");
  assert.equal(rejected.phase, "admission");
  assert.equal(rejected.oldUnmounted, false);
  assert.equal(await trace().then((value) => value.ticks.length), beforeRejectTicks);
  result.checks.push("the missing-view.node profile was rejected during admission before old renderer unmount; the original DOM node, count, trace, and pending request remained intact");

  await clickGoAction("#go-view .lifecycle-parent > .lifecycle-add", "live control after rejection");
  assert.equal(await countParent(), 2, "the pre-existing control should still dispatch to Go after rejection");
  assert.deepEqual((await pending()).map((entry) => entry.token), [requestToken]);

  const beforeRecovery = await snapshot();
  const beforeRecoveryTrace = await trace();
  const beforeRecoveryPending = await pending();
  await page.locator('[data-renderer="dom"]').click();
  await page.waitForFunction(() => window.capabilityDemo.backend === "dom");
  assertSameGoSnapshot(await snapshot(), beforeRecovery, "compatible recovery");
  assert.deepEqual(await trace(), beforeRecoveryTrace, "compatible recovery must not create a Go tick");
  assert.deepEqual(await pending(), beforeRecoveryPending, "compatible recovery must preserve the pending request");
  result.checks.push("a compatible React→DOM recovery swap succeeded with the pending Go request still correlated");

  const ticksBeforeReply = (await trace()).ticks.length;
  await page.locator("#complete-next").click();
  await page.waitForFunction((expected) => window.capabilityDemo.runtime.trace().ticks.length === expected, ticksBeforeReply + 1);
  assert.deepEqual(await pending(), []);
  assert.equal(await page.locator("#complete-next").isDisabled(), true);
  const afterReply = await trace();
  assert.deepEqual(afterReply.ticks.slice(1).map((tick) => tick.message?.name ?? null), ["addParent", "requestParent", "addParent", "complete"]);
  assert.deepEqual(afterReply.ticks.slice(1).map((tick) => tick.dispatchId), ["dispatch-0001", "dispatch-0002", "dispatch-0003", "dispatch-0004"]);
  const repliedState = (await snapshot()).state;
  assert.equal(scalar(field(field(repliedState, "Parent"), "Pending")), false);
  assert.equal(scalar(field(field(repliedState, "Parent"), "Reply")), requestToken);
  assert.match(await page.locator(".lifecycle-parent").innerText(), new RegExp(requestToken.replaceAll(":", "\\:")));
  result.checks.push("the recovered DOM renderer delivered the pending reply into Go Update after the four ordered user/host events");

  assert.deepEqual(result.browserErrors, []);
  assert.deepEqual(result.consoleErrors, []);
  assert.deepEqual(result.failedRequests, []);
  assert.deepEqual(result.wasmRequests, []);
  result.noWasm = await noWasm.assertClear();
  assert.equal(await page.locator("#go-view .lifecycle").count(), 1);
  assert.equal(await page.locator("#go-view .lifecycle-parent").count(), 1);
  assert.equal(await page.locator("#active-renderer").innerText(), "Renderer: DOM");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  result.screenshot = { path: screenshotPath };
  result.finalSnapshot = await snapshot();
  result.finalTrace = await trace();
  result.finalPending = await pending();
  result.status = "passed";
} catch (error) {
  result.status = "failed";
  result.failures.push({ name: error?.name ?? "Error", message: error?.message ?? String(error), stack: error?.stack ?? null });
  if (page) {
    try { await page.screenshot({ path: screenshotPath, fullPage: true }); result.screenshot = { path: screenshotPath }; }
    catch (captureError) { result.screenshotError = captureError?.message ?? String(captureError); }
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
  result.finishedAt = new Date().toISOString();
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}

if (result.status !== "passed") {
  console.error(JSON.stringify({ schema: result.schema, status: result.status, output: outputPath, failures: result.failures }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    schema: result.schema,
    status: result.status,
    checks: result.checks.length,
    port: result.port,
    output: outputPath,
    screenshot: screenshotPath,
  }));
}

function field(value, name) {
  assert.equal(value?.kind, "struct", `expected a Go struct before reading ${name}`);
  const entry = value.fields.find((candidate) => candidate.name === name);
  assert.ok(entry, `Go state is missing field ${name}`);
  return entry.value;
}

function scalar(value) {
  assert.ok(value && typeof value === "object", "expected an encoded Go value");
  if (value.kind === "bool") return value.bool;
  if (value.kind === "string") return value.string;
  if (value.kind === "int" || value.kind === "uint") return BigInt(value.integer);
  if (value.kind === "float64") return Buffer.from(value.float64Bits, "hex").readDoubleBE(0);
  throw new TypeError(`unsupported encoded Go scalar ${value.kind}`);
}

async function clickGoAction(selector, label) {
  const before = await page.evaluate(() => window.capabilityDemo.runtime.trace().ticks.length);
  const control = page.locator(selector);
  assert.equal(await control.count(), 1, `expected one Go control for ${label}`);
  assert.equal(await control.isDisabled(), false, `${label} should be enabled`);
  await control.click();
  await page.waitForFunction((expected) => window.capabilityDemo.runtime.trace().ticks.length === expected, before + 1);
  assert.equal(await page.evaluate(() => window.capabilityDemo.runtime.trace().ticks.length), before + 1, `${label} should create exactly one Go tick`);
}

function assertSameGoSnapshot(actual, expected, label) {
  assert.deepEqual(actual.state, expected.state, `${label} must preserve Go state`);
  assert.deepEqual(actual.view, expected.view, `${label} must preserve the logical Go view`);
}
