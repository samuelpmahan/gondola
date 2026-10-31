import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

const outputDirectory = resolve(option("--demo"));
const resultPath = resolve(option("--output"));
const screenshotPath = resolve(option("--screenshot"));
const result = {
  schema: "gobi.compiled-lifecycle-http-smoke/v1",
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
    let path = resolve(outputDirectory, `.${decodeURIComponent(url.pathname)}`);
    if (path !== outputDirectory && !path.startsWith(outputDirectory + sep)) {
      throw new Error("request outside demo directory");
    }
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
  result.url = `http://127.0.0.1:${address.port}/`;
  await page.goto(result.url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.lifecycleDemo?.runtime && window.lifecycleDemo.backend === "dom");
  assert.match(await page.locator("#status").innerText(), /Compiled Go lifecycle active/);
  assert.equal(await page.locator("[data-renderer=dom]").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#go-view .lifecycle").count(), 1);
  assert.equal(await page.locator("#go-view .lifecycle-parent").count(), 1);
  assert.equal(await page.locator("#go-view .lifecycle-child").count(), 1);
  assert.equal(await page.locator("#go-view .lifecycle-grandchild").count(), 1);
  assert.equal(await page.locator("#go-view .lifecycle-sibling").count(), 1);
  result.checks.push("HTTP page loaded the actual compiled lifecycle Go module and mounted its Go View with the DOM renderer");

  const snapshot = () => page.evaluate(() => window.lifecycleDemo.runtime.snapshot());
  const trace = () => page.evaluate(() => window.lifecycleDemo.runtime.trace());
  const tickCount = async () => (await trace()).ticks.length;
  const activeBackend = () => page.evaluate(() => window.lifecycleDemo.backend);
  const pending = () => page.evaluate(() => window.lifecycleDemo.effects.pending());
  const effectRecords = () => page.evaluate(() => window.lifecycleDemo.effects.records());

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

  function decodeNode(state, name) {
    const node = field(state, name);
    const counter = field(node, "Counter");
    return {
      id: scalar(field(node, "ID")),
      parentId: scalar(field(node, "ParentID")),
      generation: scalar(field(node, "Generation")),
      requestId: scalar(field(node, "RequestID")),
      alive: scalar(field(node, "Alive")),
      requested: scalar(field(node, "Requested")),
      pending: scalar(field(node, "Pending")),
      token: scalar(field(node, "Token")),
      reply: scalar(field(node, "Reply")),
      count: scalar(field(counter, "Count")),
    };
  }

  function decodeState(snapshotValue) {
    return {
      parent: decodeNode(snapshotValue.state, "Parent"),
      child: decodeNode(snapshotValue.state, "Child"),
      grandchild: decodeNode(snapshotValue.state, "Grandchild"),
      sibling: decodeNode(snapshotValue.state, "Sibling"),
      nextRequestId: scalar(field(snapshotValue.state, "NextRequestID")),
    };
  }

  const stateNow = async () => decodeState(await snapshot());
  const safeJson = (value) => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
  const assertNode = (node, expected) => {
    for (const [key, value] of Object.entries(expected)) assert.equal(node[key], value, `${node.id}.${key}`);
  };
  const assertTree = async ({ parent, child, grandchild, sibling }) => {
    assert.equal(await page.locator("#go-view .lifecycle-parent").count(), Number(parent));
    assert.equal(await page.locator("#go-view .lifecycle-child").count(), Number(child));
    assert.equal(await page.locator("#go-view .lifecycle-grandchild").count(), Number(grandchild));
    assert.equal(await page.locator("#go-view .lifecycle-sibling").count(), Number(sibling));
    assert.equal(await page.locator("#go-view .lifecycle-removed").count(), parent ? 0 : 1);
    assert.equal(await page.locator("#go-view .lifecycle-sibling").count(), 1, "unrelated sibling remains mounted");
  };
  const action = async (selector, label) => {
    const before = await tickCount();
    const control = page.locator(selector);
    assert.equal(await control.count(), 1, `expected one Go control for ${label}`);
    assert.equal(await control.isDisabled(), false, `${label} should be enabled`);
    await control.click();
    await page.waitForFunction((expected) => window.lifecycleDemo.runtime.trace().ticks.length === expected, before + 1);
    assert.equal(await tickCount(), before + 1, `${label} should create one Go tick`);
  };
  const clickRenderer = async (next) => {
    const beforeSnapshot = await snapshot();
    const beforeTrace = await trace();
    const beforePending = await pending();
    const beforeTicks = beforeTrace.ticks.length;
    await page.locator(`[data-renderer="${next}"]`).click();
    await page.waitForFunction((expected) => window.lifecycleDemo.backend === expected, next);
    const afterSnapshot = await snapshot();
    assert.deepEqual(afterSnapshot.state, beforeSnapshot.state, "renderer replacement must retain exact Go state");
    assert.deepEqual(afterSnapshot.view, beforeSnapshot.view, "renderer replacement must retain the Go view");
    assert.deepEqual(await trace(), beforeTrace, "renderer replacement must not append a Go tick or alter its trace");
    assert.deepEqual(await pending(), beforePending, "renderer replacement must preserve each pending correlation");
    assert.equal(await tickCount(), beforeTicks);
    assert.equal(await page.locator(`[data-renderer="${next}"]`).getAttribute("aria-pressed"), "true");
  };
  const expectedPending = async (tokens) => {
    const found = await pending();
    assert.deepEqual(found.map((entry) => entry.token), tokens);
    for (const entry of found) {
      assert.equal(entry.effect.kind, "fixture.request");
      assert.equal(entry.effect.name, "lookup");
      assert.equal(entry.effect.arg, entry.token);
      assert.equal(entry.effect.reply, "complete");
    }
    assert.equal(await page.locator("#pending-list [data-deliver-token]").count(), tokens.length);
    return found;
  };
  const assertNoTickChange = async (before, label) => {
    assert.equal(await tickCount(), before, `${label} must not create a Go tick`);
  };
  const initial = await stateNow();
  assertNode(initial.parent, { id: "parent", generation: 1n, alive: true, requested: false, pending: false, token: "", reply: "", count: 0 });
  assertNode(initial.child, { id: "child", parentId: "parent", generation: 1n, alive: true, requested: false, pending: false, token: "", reply: "", count: 0 });
  assertNode(initial.grandchild, { id: "grandchild", parentId: "child", generation: 1n, alive: true, requested: false, pending: false, token: "", reply: "", count: 0 });
  assertNode(initial.sibling, { id: "sibling", generation: 1n, alive: true, requested: false, pending: false, token: "", reply: "", count: 0 });
  assert.equal(initial.nextRequestId, 0n);
  assert.equal(await tickCount(), 1, "Go Init should create the initial tick");
  result.checks.push("Go Init produced the initial value-owned Parent→Child→Grandchild tree and independent Sibling state");

  const nodePath = (node, button) => `#go-view .lifecycle-${node} > .lifecycle-${button}`;
  for (const node of ["parent", "child", "grandchild", "sibling"]) {
    await action(nodePath(node, "add"), `${node} add`);
  }
  let current = await stateNow();
  for (const name of ["parent", "child", "grandchild", "sibling"]) assert.equal(current[name].count, 1);
  result.checks.push("Parent, Child, Grandchild, and Sibling counts changed through Go Update");

  const generationOneTokens = ["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4"];
  for (const node of ["parent", "child", "grandchild", "sibling"]) {
    await action(nodePath(node, "request"), `${node} request`);
  }
  current = await stateNow();
  for (const [name, token] of Object.entries({ parent: generationOneTokens[0], child: generationOneTokens[1], grandchild: generationOneTokens[2], sibling: generationOneTokens[3] })) {
    assertNode(current[name], { requested: true, pending: true, token, reply: "" });
  }
  await expectedPending(generationOneTokens);
  assert.deepEqual((await effectRecords()).map(({ kind, token }) => [kind, token]), generationOneTokens.map((token) => ["request", token]));
  const goRequests = (await trace()).ticks.flatMap((tick) => tick.requestedEffects.map((request) => request.effect));
  assert.deepEqual(goRequests.slice(-4).map((effect) => [effect.kind, effect.name, effect.arg, effect.reply]), generationOneTokens.map((token) => ["fixture.request", "lookup", token, "complete"]));
  result.checks.push("four Go-emitted lifecycle requests are pending in token order and displayed by the manual host");

  await clickRenderer("react");
  result.rendererSwaps = 1;
  await clickRenderer("dom");
  result.rendererSwaps = 2;
  result.checks.push("pending request correlations, Go state, Go view, and trace survived DOM→React→DOM swaps with no extra Go tick");

  await action("#go-view .lifecycle-remove", "remove Parent subtree");
  current = await stateNow();
  for (const name of ["parent", "child", "grandchild"]) {
    assertNode(current[name], { alive: false, pending: false, token: "" });
  }
  assertNode(current.sibling, { alive: true, pending: true, token: generationOneTokens[3] });
  await assertTree({ parent: false, child: false, grandchild: false, sibling: true });
  assert.deepEqual((await effectRecords()).filter((record) => record.kind === "cancel").map((record) => record.token), [
    "grandchild:g1:r3", "child:g1:r2", "parent:g1:r1",
  ], "Go must emit descendant-first cancellation order");
  const goCancellationEffects = (await trace()).ticks.at(-1).requestedEffects.map((request) => request.effect);
  assert.deepEqual(goCancellationEffects.map((effect) => [effect.kind, effect.name, effect.arg, effect.reply]), [
    ["lifecycle.cancel", "cancel", "grandchild:g1:r3", ""],
    ["lifecycle.cancel", "cancel", "child:g1:r2", ""],
    ["lifecycle.cancel", "cancel", "parent:g1:r1", ""],
  ]);
  assert.deepEqual((await pending()).map((entry) => entry.token), ["sibling:g1:r4"], "unrelated sibling request must remain pending");
  result.checks.push("removing Parent removed Child and Grandchild, cancelled Grandchild→Child→Parent, and retained Sibling's request");

  await action("#go-view .lifecycle-remount", "remount Parent subtree");
  current = await stateNow();
  for (const name of ["parent", "child", "grandchild"]) {
    assertNode(current[name], { alive: true, generation: 2n, requested: false, pending: false, token: "", reply: "", count: 0 });
  }
  assertNode(current.sibling, { alive: true, requested: true, pending: true, token: "sibling:g1:r4", count: 1 });
  await assertTree({ parent: true, child: true, grandchild: true, sibling: true });
  assert.equal(await page.locator("#go-view .lifecycle-removed").count(), 0);
  result.checks.push("remount restored a fresh generation-2 Go subtree while Sibling remained live and pending");

  const beforeRetiredReplies = await snapshot();
  const beforeRetiredTrace = await trace();
  const retiredResults = [];
  for (const token of ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"]) {
    await page.locator("#probe-retired").click();
    const statusText = await page.locator("#host-action-status").innerText();
    assert.match(statusText, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const record = (await effectRecords()).filter((event) => event.kind === "force-deliver-retired").at(-1);
    assert.equal(record.token, token);
    assert.equal(record.outcome, "rejected");
    retiredResults.push({ token, outcome: record.outcome, error: record.error ?? record.runtimeResult?.error ?? null });
    assert.deepEqual((await snapshot()).state, beforeRetiredReplies.state, "retired Go reply must not mutate the remounted subtree or sibling");
    assert.deepEqual(await trace(), beforeRetiredTrace, "retired reply probe must not append a Go tick");
  }
  assert.deepEqual(await page.evaluate(() => window.lifecycleDemo.probedRetiredTokens), [
    "grandchild:g1:r3", "child:g1:r2", "parent:g1:r1",
  ]);
  result.retiredReplyProbeOutcomes = retiredResults;
  const goMessageProbeResults = [];
  for (const token of ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"]) {
    const before = await snapshot();
    const beforeTicks = await tickCount();
    await page.locator("#probe-go-message").click();
    await page.waitForFunction((expected) => window.lifecycleDemo.runtime.trace().ticks.length === expected, beforeTicks + 1);
    const after = await snapshot();
    const lastTick = (await trace()).ticks.at(-1);
    assert.deepEqual(after.state, before.state, "stale explicit Go complete message must leave remount state unchanged");
    assert.deepEqual(after.view, before.view, "stale explicit Go complete message must leave the Go tree unchanged");
    assert.equal(lastTick.message.name, "complete");
    assert.equal(lastTick.message.arg, token);
    assert.match(lastTick.dispatchId, /^dispatch-\d{4}$/);
    goMessageProbeResults.push({ token, dispatchId: lastTick.dispatchId, stateUnchanged: true });
  }
  assert.deepEqual(await page.evaluate(() => window.lifecycleDemo.probedGoMessageTokens), [
    "grandchild:g1:r3", "child:g1:r2", "parent:g1:r1",
  ]);
  result.goMessageProbeResults = goMessageProbeResults;
  result.checks.push("retired generation-1 reply callbacks were rejected without a Go tick, then explicit stale complete messages ran Go Update and left the remounted tree unchanged");

  await page.locator('#pending-list [data-deliver-token="sibling:g1:r4"]').click();
  current = await stateNow();
  assertNode(current.sibling, { pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4" });
  assert.deepEqual(await pending(), []);
  const afterSiblingCompletion = await snapshot();
  const siblingTick = await tickCount();
  await page.locator("#replay-token").selectOption("sibling:g1:r4");
  await page.locator("#replay-selected").click();
  const siblingDuplicate = (await effectRecords()).filter((record) => record.kind === "deliver").at(-1);
  assert.equal(siblingDuplicate.token, "sibling:g1:r4");
  assert.equal(siblingDuplicate.outcome, "rejected");
  assert.deepEqual((await snapshot()).state, afterSiblingCompletion.state);
  await assertNoTickChange(siblingTick, "duplicate Sibling completion");
  result.checks.push("manual Sibling completion updated its Go state once; replaying the duplicate reply was rejected without a tick");

  for (const node of ["parent", "child", "grandchild"]) await action(nodePath(node, "add"), `${node} generation-2 add`);
  current = await stateNow();
  for (const name of ["parent", "child", "grandchild"]) assert.equal(current[name].count, 1);
  assert.equal(current.sibling.count, 1);
  const generationTwoTokens = ["parent:g2:r5", "child:g2:r6", "grandchild:g2:r7"];
  for (const node of ["parent", "child", "grandchild"]) await action(nodePath(node, "request"), `${node} generation-2 request`);
  current = await stateNow();
  for (const [name, token] of Object.entries({ parent: generationTwoTokens[0], child: generationTwoTokens[1], grandchild: generationTwoTokens[2] })) {
    assertNode(current[name], { requested: true, pending: true, token, reply: "" });
  }
  await expectedPending(generationTwoTokens);

  await clickRenderer("react");
  result.rendererSwaps += 1;
  await clickRenderer("dom");
  result.rendererSwaps += 1;
  result.checks.push("second-generation pending effects also survived React↔DOM replacement without a Go tick");

  for (const token of ["grandchild:g2:r7", "child:g2:r6", "parent:g2:r5"]) {
    await page.locator(`#pending-list [data-deliver-token="${token}"]`).click();
    const last = (await effectRecords()).filter((record) => record.kind === "deliver").at(-1);
    assert.equal(last.token, token);
    assert.equal(last.outcome, "accepted");
    current = await stateNow();
    const nodeName = token.startsWith("grandchild:") ? "grandchild" : token.startsWith("child:") ? "child" : "parent";
    assertNode(current[nodeName], { pending: false, reply: token });
  }
  assert.deepEqual(await pending(), []);
  const beforeDuplicateChild = await snapshot();
  const beforeDuplicateChildTicks = await tickCount();
  await page.locator("#replay-token").selectOption("child:g2:r6");
  await page.locator("#replay-selected").click();
  const childDuplicate = (await effectRecords()).filter((record) => record.kind === "deliver").at(-1);
  assert.equal(childDuplicate.token, "child:g2:r6");
  assert.equal(childDuplicate.outcome, "rejected");
  assert.deepEqual((await snapshot()).state, beforeDuplicateChild.state);
  await assertNoTickChange(beforeDuplicateChildTicks, "duplicate generation-2 Child completion");
  result.checks.push("manual generation-2 replies completed Grandchild→Child→Parent; duplicate Child was rejected without a Go tick");

  const finalSnapshot = await snapshot();
  const finalState = decodeState(finalSnapshot);
  assertNode(finalState.parent, { alive: true, generation: 2n, requested: true, pending: false, token: "parent:g2:r5", reply: "parent:g2:r5", count: 1 });
  assertNode(finalState.child, { alive: true, generation: 2n, requested: true, pending: false, token: "child:g2:r6", reply: "child:g2:r6", count: 1 });
  assertNode(finalState.grandchild, { alive: true, generation: 2n, requested: true, pending: false, token: "grandchild:g2:r7", reply: "grandchild:g2:r7", count: 1 });
  assertNode(finalState.sibling, { alive: true, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 });
  await assertTree({ parent: true, child: true, grandchild: true, sibling: true });
  assert.equal(await page.locator("#go-view .lifecycle-parent > .lifecycle-request").isDisabled(), true);
  assert.equal(await page.locator("#go-view .lifecycle-child > .lifecycle-request").isDisabled(), true);
  assert.equal(await page.locator("#go-view .lifecycle-grandchild > .lifecycle-request").isDisabled(), true);
  assert.equal(await page.locator("#go-view .lifecycle-sibling > .lifecycle-request").isDisabled(), true);
  assert.equal(await page.locator("#go-view .lifecycle-remove").isDisabled(), false);
  assert.equal(await page.locator("#go-view .lifecycle-remount").isDisabled(), true);
  assert.deepEqual(finalSnapshot.dom.controls.filter((control) => control.disabled).map((control) => control.key), [
    "parent-request", "child-request", "grandchild-request", "sibling-request", "parent-remount",
  ]);
  assert.equal(await activeBackend(), "dom");
  result.finalState = safeJson(finalState);
  result.finalView = finalSnapshot.view;
  result.finalDOM = finalSnapshot.dom;
  result.finalTrace = await trace();
  result.effectRecords = await effectRecords();
  result.pendingAtEnd = await pending();
  result.finalTicks = await tickCount();
  result.finalBackend = await activeBackend();
  result.checks.push("final DOM controls expose Go-disabled request/remount states while preserving the complete final tree and reply state");

  result.failures = await page.evaluate(() => window.lifecycleDemo.failures);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.browserErrors, []);
  assert.deepEqual(result.consoleErrors, []);
  assert.deepEqual(result.failedRequests, []);
  assert.deepEqual(result.wasmRequests, []);
  result.noWasm = await noWasm.assertClear();
  assert.ok(result.requests.some((request) => request.path === "/" && request.status === 200));
  assert.ok(result.requests.some((request) => request.path === "/demo.bundle.mjs" && request.status === 200));
  assert.ok(result.requests.every((request) => request.status === 200), "static HTTP demo should have no missing assets");
  result.httpRequestCount = result.requests.length;
  result.status = "passed";
  await page.screenshot({ path: screenshotPath, fullPage: true });
} catch (error) {
  result.status = "failed";
  result.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  result.partial = await page?.evaluate(() => ({
    backend: window.lifecycleDemo?.backend ?? null,
    snapshot: window.lifecycleDemo?.runtime?.snapshot?.() ?? null,
    trace: window.lifecycleDemo?.runtime?.trace?.() ?? null,
    pending: window.lifecycleDemo?.effects?.pending?.() ?? null,
    effects: window.lifecycleDemo?.effects?.records?.() ?? null,
    failures: window.lifecycleDemo?.failures ?? null,
  })).catch(() => null);
  if (page) await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
console.log(JSON.stringify({
  schema: result.schema,
  status: result.status,
  url: result.url,
  httpRequestCount: result.httpRequestCount ?? result.requests.length,
  checks: result.checks,
  failures: result.failures,
  error: result.error ?? null,
  output: resultPath,
  screenshot: screenshotPath,
}));
