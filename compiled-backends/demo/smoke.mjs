import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../interaction/node_modules/playwright/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(process.argv[process.argv.indexOf("--demo") + 1] ?? "");
if (!process.argv.includes("--demo") || !output) throw new Error("missing --demo directory");
const result = {
  schema: "gobi.compiled-backends-demo-smoke/v1",
  startedAt: new Date().toISOString(),
  checks: [],
  errors: [],
  wasmRequests: [],
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    let path = resolve(output, `.${decodeURIComponent(url.pathname)}`);
    if (path !== output && !path.startsWith(output + sep)) throw new Error("outside demo root");
    if (url.pathname.endsWith("/")) path = join(path, "index.html");
    const bytes = await readFile(path);
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    }[extname(path)] ?? "application/octet-stream";
    response.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
    response.end(bytes);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  }
});
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--no-sandbox"],
  });
  result.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1300 } });
  page.on("pageerror", error => result.errors.push(error.message));
  page.on("request", request => {
    if (/\.wasm(?:[?#]|$)/.test(request.url())) result.wasmRequests.push(request.url());
  });
  const address = server.address();
  result.url = `http://127.0.0.1:${address.port}/`;
  await page.goto(result.url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.gobiDemo && Object.keys(window.gobiDemo.sessions).length === 4);
  assert.match(await page.locator("#status").innerText(), /Four compiled Go components mounted/);
  for (const name of ["counter", "form", "list", "effect"]) {
    assert.equal(await page.locator(`[data-card="${name}"] [data-renderer="react"]`).getAttribute("aria-pressed"), "true");
  }
  result.checks.push("HTTP page loaded all four compiled Go modules through the runtime on React");

  const app = name => page.locator(`[data-app="${name}"]`);
  const card = name => page.locator(`[data-card="${name}"]`);
  const clickSwitch = async (name, backend) => page.evaluate(({ name, backend }) => {
    const button = document.querySelector(`[data-card="${name}"] [data-renderer="${backend}"]`);
    button.click();
  }, { name, backend });
  const snapshot = name => page.evaluate(name => window.gobiDemo.sessions[name].runtime.snapshot(), name);
  const trace = name => page.evaluate(name => window.gobiDemo.sessions[name].runtime.trace(), name);
  const scalar = value => {
    assert.ok(value && typeof value === "object", "expected an encoded Go value");
    if (value.kind === "bool") return value.bool;
    if (value.kind === "string") return value.string;
    if (value.kind === "int" || value.kind === "uint") return BigInt(value.integer);
    if (value.kind === "float64") return Buffer.from(value.float64Bits, "hex").readDoubleBE(0);
    return value;
  };
  const field = (value, name) => {
    assert.equal(value?.kind, "struct", `expected Go struct before reading ${name}`);
    const entry = value.fields.find(candidate => candidate.name === name);
    assert.ok(entry, `Go struct is missing field ${name}`);
    return entry.value;
  };

  await app("counter").getByRole("button", { name: "+", exact: true }).click();
  await app("counter").getByRole("button", { name: "+", exact: true }).click();
  assert.equal(scalar(field((await snapshot("counter")).state, "Count")), 2);
  await clickSwitch("counter", "dom");
  assert.equal(await card("counter").locator("[data-renderer=dom]").getAttribute("aria-pressed"), "true");
  assert.equal(scalar(field((await snapshot("counter")).state, "Count")), 2);
  const beforeOldCallback = await page.evaluate(() => {
    const session = window.gobiDemo.sessions.counter;
    return { ticks: session.runtime.trace().ticks.length, fenced: session.runtime.rendererDiagnostics().fencedCallbacks.length };
  });
  await clickSwitch("counter", "react");
  assert.equal(scalar(field((await snapshot("counter")).state, "Count")), 2);
  const afterOldCallback = await page.evaluate(() => ({
    result: window.gobiDemo.sessions.counter.fenceRetiredCallback(
      { path: "1", event: "click", value: "" },
      { Name: "add", Arg: "" },
    ),
    ticks: window.gobiDemo.sessions.counter.runtime.trace().ticks.length,
    state: window.gobiDemo.sessions.counter.runtime.snapshot().state,
    diagnostics: window.gobiDemo.sessions.counter.runtime.rendererDiagnostics(),
  }));
  assert.equal(afterOldCallback.result.stale, true);
  assert.equal(afterOldCallback.result.dispatchId, null);
  assert.equal(afterOldCallback.ticks, beforeOldCallback.ticks);
  assert.equal(afterOldCallback.diagnostics.fencedCallbacks.length, beforeOldCallback.fenced + 1);
  assert.equal(scalar(field(afterOldCallback.state, "Count")), 2);
  result.checks.push("counter GoState survived React→DOM→React and a retained callback from the retired DOM renderer was fenced without an application tick");

  const draft = app("form").getByLabel("Draft", { exact: true });
  await draft.fill("selection survives swap");
  await draft.evaluate(input => {
    input.focus();
    input.setSelectionRange(2, 11, "backward");
  });
  await clickSwitch("form", "dom");
  const domFocus = await app("form").getByLabel("Draft", { exact: true }).evaluate(input => ({
    active: document.activeElement === input,
    value: input.value,
    start: input.selectionStart,
    end: input.selectionEnd,
    direction: input.selectionDirection,
  }));
  assert.deepEqual(domFocus, { active: true, value: "selection survives swap", start: 2, end: 11, direction: "backward" });
  assert.equal(scalar(field((await snapshot("form")).state, "Draft")), "selection survives swap");
  await clickSwitch("form", "react");
  const reactFocus = await app("form").getByLabel("Draft", { exact: true }).evaluate(input => ({
    active: document.activeElement === input,
    value: input.value,
    start: input.selectionStart,
    end: input.selectionEnd,
    direction: input.selectionDirection,
  }));
  assert.deepEqual(reactFocus, domFocus);
  await app("form").getByRole("button", { name: "Save", exact: true }).click();
  const formState = (await snapshot("form")).state;
  assert.equal(scalar(field(formState, "Draft")), "selection survives swap");
  assert.equal(scalar(field(formState, "Saved")), "selection survives swap");
  result.checks.push("form GoState, focused input, value, and backward selection survived both backend swaps");

  await app("list").getByRole("button", { name: "Add", exact: true }).click();
  await app("list").getByRole("button", { name: "Add", exact: true }).click();
  await app("list").getByLabel("Row 2", { exact: true }).fill("compiled row state");
  await clickSwitch("list", "dom");
  const listRows = field((await snapshot("list")).state, "Rows").items;
  assert.equal(listRows.length, 2);
  assert.equal(scalar(field(listRows[1], "Label")), "compiled row state");
  assert.equal(await app("list").getByLabel("Row 2", { exact: true }).inputValue(), "compiled row state");
  await clickSwitch("list", "react");
  const reactRows = field((await snapshot("list")).state, "Rows").items;
  assert.equal(reactRows.length, 2);
  assert.equal(scalar(field(reactRows[1], "Label")), "compiled row state");
  result.checks.push("list GoState and keyed row content survived DOM and React replacement");

  await app("effect").getByLabel("Request value", { exact: true }).fill("captured before swap");
  await app("effect").getByRole("button", { name: "Request", exact: true }).click();
  let effectState = (await snapshot("effect")).state;
  assert.equal(scalar(field(effectState, "Pending")), true);
  assert.equal((await page.evaluate(() => window.gobiDemo.sessions.effect.pending.length)), 1);
  const effectTrace = await trace("effect");
  assert.equal(effectTrace.ticks.at(-1).requestedEffects[0].effect.arg, "captured before swap");
  await clickSwitch("effect", "dom");
  effectState = (await snapshot("effect")).state;
  assert.equal(scalar(field(effectState, "Pending")), true);
  assert.equal((await page.evaluate(() => window.gobiDemo.sessions.effect.pending.length)), 1);
  await clickSwitch("effect", "react");
  effectState = (await snapshot("effect")).state;
  assert.equal(scalar(field(effectState, "Pending")), true);
  assert.equal((await page.evaluate(() => window.gobiDemo.sessions.effect.pending.length)), 1);
  await card("effect").getByRole("button", { name: "Complete next request", exact: true }).click();
  effectState = (await snapshot("effect")).state;
  assert.equal(scalar(field(effectState, "Pending")), false);
  assert.equal(scalar(field(effectState, "Value")), "captured before swap");
  assert.equal(scalar(field(effectState, "Completions")), 1n);
  assert.equal((await trace("effect")).ticks.at(-1).completedEffects[0].message.arg, "captured before swap");
  result.checks.push("pending manual effect request survived DOM swap and completed through its original captured callback");

  result.failures = await page.evaluate(() => window.gobiDemo.failures);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.wasmRequests, []);
  await page.screenshot({ path: join(root, "compiled-backends/artifacts/demo.png"), fullPage: true });
  result.status = "passed";
} catch (error) {
  result.status = "failed";
  result.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  await mkdir(join(root, "compiled-backends/artifacts"), { recursive: true });
  await writeFile(join(root, "compiled-backends/artifacts/demo-smoke.json"), `${JSON.stringify(result, null, 2)}\n`);
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
console.log(JSON.stringify(result));
