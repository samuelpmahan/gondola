import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = new URL(".", import.meta.url);
const root = resolve(fileURLToPath(new URL("../..", here)));
const mime = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--") || values.has(name) || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new Error(`invalid or duplicate argument near ${name}`);
    }
    values.set(name, argv[++index]);
  }
  for (const name of ["--demo", "--output", "--screenshot", "--chromium", "--port"]) {
    if (!values.has(name)) throw new Error(`missing ${name} <value>`);
  }
  const port = Number(values.get("--port"));
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error("--port must be an integer from 0 to 65535");
  return {
    demo: resolve(values.get("--demo")),
    output: resolve(values.get("--output")),
    screenshot: resolve(values.get("--screenshot")),
    chromium: resolve(values.get("--chromium")),
    port,
  };
}

const options = parseArguments(process.argv.slice(2));
const { chromium } = await import(pathToFileURL(join(root, "interaction/node_modules/playwright/index.mjs")).href);
const checks = [];
const requests = [];
const browserErrors = [];
const consoleErrors = [];
const failedRequests = [];
const wasmRequests = [];
let wasmApiCalls = 0;
let browser;
let server;
let url;
let port;
let demo;

function check(id, condition, detail = "") {
  checks.push({ id, passed: condition === true, detail });
  assert.equal(condition, true, `${id}${detail ? `: ${detail}` : ""}`);
}

async function startServer(directory, requestedPort) {
  const safeRoot = resolve(directory);
  const http = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
    const path = resolve(safeRoot, relativePath);
    if (!path.startsWith(safeRoot + sep)) {
      response.writeHead(403).end("forbidden");
      requests.push({ method: request.method, path: pathname, status: 403 });
      return;
    }
    try {
      const bytes = await readFile(path);
      response.writeHead(200, { "content-type": mime[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" });
      response.end(bytes);
      requests.push({ method: request.method, path: pathname, status: 200, bytes: bytes.length });
    } catch {
      response.writeHead(404).end("not found");
      requests.push({ method: request.method, path: pathname, status: 404 });
    }
  });
  await new Promise((resolveReady, reject) => {
    http.once("error", reject);
    http.listen(requestedPort, "127.0.0.1", resolveReady);
  });
  const address = http.address();
  return { server: http, port: typeof address === "object" && address ? address.port : requestedPort };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const snapshot = window.childrenDemo.lastSnapshot;
    const field = (value, name) => value?.fields?.find((item) => item.name === name)?.value;
    const text = (value) => value?.string ?? "";
    const boolean = (value) => value?.bool === true;
    const integer = (value) => Number(value?.integer ?? 0);
    const float = (value) => {
      if (typeof value?.float64Bits !== "string") return 0;
      const bytes = new ArrayBuffer(8);
      const view = new DataView(bytes);
      view.setBigUint64(0, BigInt(`0x${value.float64Bits}`));
      return view.getFloat64(0);
    };
    const state = snapshot.state;
    const parent = field(state, "Parent");
    const children = field(state, "Children")?.items ?? [];
    return {
      state: {
        Parent: {
          Alive: boolean(field(parent, "Alive")),
          Generation: integer(field(parent, "Generation")),
          RequestSeq: integer(field(parent, "RequestSeq")),
          Pending: boolean(field(parent, "Pending")),
          Token: text(field(parent, "Token")),
          Reply: text(field(parent, "Reply")),
        },
        Children: children.map((child) => {
          const counter = field(child, "Counter");
          return {
            Key: text(field(child, "Key")),
            Generation: integer(field(child, "Generation")),
            RequestSeq: integer(field(child, "RequestSeq")),
            Pending: boolean(field(child, "Pending")),
            Token: text(field(child, "Token")),
            Reply: text(field(child, "Reply")),
            Counter: { Count: float(field(counter, "Count")) },
          };
        }),
        NextGeneration: integer(field(state, "NextGeneration")),
      },
      view: snapshot.view,
      dom: snapshot.dom,
    };
  });
}

async function children(page) {
  const value = await snapshot(page);
  return value?.state?.Children ?? value?.state?.children ?? [];
}

async function pending(page) {
  return page.evaluate(() => window.childrenDemo.effects.pending().map((item) => item.token));
}

async function hostRecords(page) {
  return page.evaluate(() => window.childrenDemo.effects.records());
}

async function waitFor(page) {
  await page.waitForTimeout(0);
}

async function main() {
  const serverResult = await startServer(options.demo, options.port);
  server = serverResult.server;
  port = serverResult.port;
  url = `http://127.0.0.1:${port}/`;
  const browserVersion = await new Promise((resolveVersion, rejectVersion) => {
    const child = spawn(options.chromium, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", rejectVersion);
    child.once("close", (code) => code === 0 ? resolveVersion(output.trim()) : rejectVersion(new Error(`Chromium --version exited ${code}`)));
  });
  browser = await chromium.launch({ executablePath: options.chromium, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.addInitScript(() => {
    window.__gobiWasmCalls = 0;
    for (const name of ["instantiate", "instantiateStreaming", "compile", "compileStreaming", "validate", "Module", "Instance"]) {
      const value = WebAssembly[name];
      if (typeof value !== "function") continue;
      try {
        Object.defineProperty(WebAssembly, name, {
          configurable: true,
          writable: true,
          value: function (...args) {
            window.__gobiWasmCalls += 1;
            return Reflect.apply(value, this, args);
          },
        });
      } catch {
        // A browser may expose a non-writable WebAssembly intrinsic; request observation still applies.
      }
    }
  });
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" }));
  page.on("request", (request) => { if (/\.wasm(?:$|\?)/i.test(request.url())) wasmRequests.push(request.url()); });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator("#status[data-state='ready']").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Request parent", exact: true }).waitFor({ state: "visible" });
  check("http-root", requests.some((request) => request.path === "/" && request.status === 200));
  check("http-css", requests.some((request) => request.path === "/demo.css" && request.status === 200));
  check("http-bundle", requests.some((request) => request.path === "/demo.bundle.mjs" && request.status === 200));
  check("go-init-state", (await children(page)).map((child) => child.Key).join(",") === "oak,elm");
  check("initial-view", await page.getByText("Parent generation 1; idle", { exact: true }).count() === 1);
  check("initial-renderer", await page.evaluate(() => window.childrenDemo.renderer && window.childrenDemo.backend === "dom"));

  await page.getByRole("button", { name: "Add to oak", exact: true }).click();
  await page.getByRole("button", { name: "Request parent", exact: true }).click();
  await page.getByRole("button", { name: "Request oak", exact: true }).click();
  await page.getByRole("button", { name: "Add ash", exact: true }).click();
  await page.getByRole("button", { name: "Request ash", exact: true }).click();
  let tokens = await pending(page);
  const firstParent = tokens.find((token) => token.startsWith("parent:"));
  const oldOak = tokens.find((token) => token.startsWith("child:oak:"));
  const ashToken = tokens.find((token) => token.startsWith("child:ash:"));
  check("request-token-shapes", firstParent === "parent:g1:r1" && oldOak === "child:oak:g2:r1" && ashToken === "child:ash:g4:r1", JSON.stringify(tokens));
  check("pending-buttons-disabled", await page.getByRole("button", { name: "Request parent", exact: true }).isDisabled() &&
    await page.getByRole("button", { name: "Request oak", exact: true }).isDisabled());
  check("initial-counter", (await children(page)).find((child) => child.Key === "oak")?.Counter?.Count === 1);

  await page.getByRole("button", { name: "Move elm up", exact: true }).click();
  check("reorder-preserves-request", (await children(page)).map((child) => child.Key).join(",") === "elm,oak,ash" &&
    JSON.stringify(await pending(page)) === JSON.stringify(tokens));
  await page.getByRole("button", { name: "React", exact: true }).click();
  check("compatible-swap-preserves-work", await page.evaluate(() => window.childrenDemo.backend === "react") &&
    JSON.stringify(await pending(page)) === JSON.stringify(tokens));
  await page.getByRole("button", { name: "Try renderer missing view.node", exact: true }).click();
  check("incompatible-swap-rejected", await page.evaluate(() => window.childrenDemo.swapOutcome.kind === "rejected" && window.childrenDemo.backend === "react"));
  check("rejected-swap-preserves-work", JSON.stringify(await pending(page)) === JSON.stringify(tokens) &&
    (await children(page)).map((child) => child.Key).join(",") === "elm,oak,ash");
  await page.getByRole("button", { name: "DOM", exact: true }).click();
  check("swap-recovery", await page.evaluate(() => window.childrenDemo.backend === "dom"));

  await page.getByRole("button", { name: "Remove oak", exact: true }).click();
  tokens = await pending(page);
  check("remove-cancels-child", !tokens.includes(oldOak) && (await hostRecords(page)).some((record) => record.kind === "cancel" && record.token === oldOak));
  await page.getByRole("button", { name: "Add oak", exact: true }).click();
  const reusedOak = (await children(page)).find((child) => child.Key === "oak");
  check("key-reuse-fresh-generation", reusedOak?.Generation === 5 && reusedOak?.Counter?.Count === 0);
  const oldReply = page.getByRole("button", { name: `Try stale reply ${oldOak}`, exact: true });
  await oldReply.click();
  check("stale-reply-rejected", await page.evaluate(() => window.childrenDemo.effects.records().at(-1)?.outcome === "rejected"));
  await page.getByRole("button", { name: "Request oak", exact: true }).click();
  await page.getByRole("button", { name: "Add pine", exact: true }).click();
  await page.getByRole("button", { name: "Request pine", exact: true }).click();
  tokens = await pending(page);
  check("reused-generation-token", tokens.includes("child:oak:g5:r1"));
  await page.getByRole("button", { name: "Clear children", exact: true }).click();
  const afterClear = await pending(page);
  const cancellations = (await hostRecords(page)).filter((record) => record.kind === "cancel").map((record) => record.token);
  const clearTail = cancellations.slice(-3);
  check("clear-child-first-order", clearTail.join(",") === "child:pine:g6:r1,child:oak:g5:r1,child:ash:g4:r1", clearTail.join(","));
  check("clear-preserves-parent", afterClear.length === 1 && afterClear[0] === firstParent && (await children(page)).length === 0);
  await page.getByRole("button", { name: `Reply to ${firstParent}`, exact: true }).click();
  check("parent-reply-after-clear", !(await pending(page)).includes(firstParent));

  await page.getByRole("button", { name: "Add ash", exact: true }).click();
  await page.getByRole("button", { name: "Add pine", exact: true }).click();
  await page.getByRole("button", { name: "Request ash", exact: true }).click();
  await page.getByRole("button", { name: "Request pine", exact: true }).click();
  await page.getByRole("button", { name: "Request parent", exact: true }).click();
  const liveTokens = await pending(page);
  const parentBeforeRemoval = liveTokens.find((token) => token.startsWith("parent:"));
  await page.getByRole("button", { name: "Remove parent", exact: true }).click();
  const parentRemoval = (await hostRecords(page)).filter((record) => record.kind === "cancel").slice(-3).map((record) => record.token);
  check("parent-remove-child-first", parentRemoval.join(",") === "child:pine:g8:r1,child:ash:g7:r1," + parentBeforeRemoval, parentRemoval.join(","));
  check("parent-removal-disables-child-actions", await page.getByRole("button", { name: "Add oak", exact: true }).isDisabled() &&
    await page.getByRole("button", { name: "Request parent", exact: true }).isDisabled());
  const parentGenerationBefore = (await snapshot(page)).state.Parent.Generation;
  await page.getByRole("button", { name: "Remount parent", exact: true }).click();
  const remounted = await snapshot(page);
  check("parent-remount-fresh-empty", remounted.state.Parent.Alive === true && remounted.state.Parent.Generation > parentGenerationBefore && remounted.state.Children.length === 0);

  await page.screenshot({ path: options.screenshot, fullPage: true });
  const reactVersions = await page.evaluate(() => window.childrenDemo.reactVersions);
  check("react-dom-versions", reactVersions.react === "19.3.1" && reactVersions.reactDOM === "19.3.1", JSON.stringify(reactVersions));
  wasmApiCalls = await page.evaluate(() => window.__gobiWasmCalls ?? 0);
  check("no-wasm-request", wasmRequests.length === 0, JSON.stringify(wasmRequests));
  check("no-wasm-api", wasmApiCalls === 0, String(wasmApiCalls));
  check("no-browser-errors", browserErrors.length === 0, JSON.stringify(browserErrors));
  check("no-console-errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  check("no-failed-http-requests", failedRequests.length === 0, JSON.stringify(failedRequests));
  check("all-http-responses-ok", requests.every((request) => request.status === 200), JSON.stringify(requests.filter((request) => request.status !== 200)));
  demo = {
    schema: "gobi.compiled-children-http-smoke/v1",
    status: "passed",
    startedAt,
    finishedAt: new Date().toISOString(),
    url,
    port,
    browser: browserVersion,
    checks,
    http: requests,
    finalState: await snapshot(page),
    finalEffects: await hostRecords(page),
    reactVersions,
    browserErrors,
    consoleErrors,
    failedRequests,
    webAssemblyRequests: wasmRequests.length,
    webAssemblyApiCalls: wasmApiCalls,
    screenshot: options.screenshot,
  };
}

const startedAt = new Date().toISOString();
let failure = null;
try {
  await main();
} catch (error) {
  failure = { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null };
  demo = {
    schema: "gobi.compiled-children-http-smoke/v1",
    status: "failed",
    startedAt,
    finishedAt: new Date().toISOString(),
    url: url ?? null,
    port: port ?? null,
    checks,
    http: requests,
    browserErrors,
    consoleErrors,
    failedRequests,
    webAssemblyRequests: wasmRequests.length,
    webAssemblyApiCalls: wasmApiCalls,
    failure,
  };
} finally {
  await browser?.close().catch(() => {});
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

await writeFile(options.output, `${JSON.stringify(demo ?? { status: "failed", failure }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ schema: demo?.schema, status: demo?.status, checks: checks.filter((item) => item.passed).length, failures: checks.filter((item) => !item.passed).length, url: demo?.url, screenshot: options.screenshot })}\n`);
if (failure || demo?.status !== "passed") process.exitCode = 1;
