import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const commandDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(commandDir, "../..");
const [wasmPath, wasmExecPath] = process.argv.slice(2);
if (!wasmPath || !wasmExecPath) {
  throw new Error("usage: node smoke.mjs <multi-root.wasm> <wasm_exec.js>");
}

const files = new Map([
  ["/", [resolve(commandDir, "smoke.html"), "text/html; charset=utf-8"]],
  ["/multi-root.wasm", [resolve(wasmPath), "application/wasm"]],
  ["/wasm_exec.js", [resolve(wasmExecPath), "text/javascript; charset=utf-8"]],
]);
const server = createServer(async (request, response) => {
  const entry = files.get(new URL(request.url, "http://localhost").pathname);
  if (!entry) {
    response.writeHead(404).end("not found");
    return;
  }
  try {
    response.setHeader("content-type", entry[1]);
    response.end(await readFile(entry[0]));
  } catch {
    response.writeHead(500).end("file unavailable");
  }
});
await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveListen);
});

let browser;
try {
  const require = createRequire(import.meta.url);
  const { chromium } = require(resolve(repoRoot, "interaction/node_modules/playwright"));
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
  const result = await page.evaluate(async () => {
    await window.__multiRootSmoke;
    return window.__multiRootSmokeError ? { error: window.__multiRootSmokeError } : { ok: true };
  });
  assert.deepEqual(result, { ok: true }, JSON.stringify({ result, pageErrors }));
  assert.deepEqual(pageErrors, [], "browser must not report uncaught smoke errors");
  const details = await page.evaluate(() => window.__multiRootSmoke);
  process.stdout.write(`${JSON.stringify(details)}\n`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
