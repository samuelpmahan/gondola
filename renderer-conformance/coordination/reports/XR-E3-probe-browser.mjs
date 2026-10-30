import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)));
const REPO = resolve(HERE, "../../..");
const [godomWasm, collectionWasm, wasmExec] = process.argv.slice(2);
if (!godomWasm || !collectionWasm || !wasmExec) {
  throw new Error("usage: node XR-E3-probe-browser.mjs <godom.wasm> <collection.wasm> <wasm_exec.js>");
}

const knownFiles = new Map([
  ["/", [resolve(HERE, "XR-E3-probe-browser.html"), "text/html; charset=utf-8"]],
  ["/godom.wasm", [resolve(godomWasm), "application/wasm"]],
  ["/collection.wasm", [resolve(collectionWasm), "application/wasm"]],
  ["/wasm_exec.js", [resolve(wasmExec), "text/javascript; charset=utf-8"]],
  ["/manifest.json", [resolve(REPO, "renderer-conformance/build/manifest.json"), "application/json"]],
]);
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    let [file, mime] = knownFiles.get(path) ?? [];
    if (!file) {
      file = resolve(REPO, `.${path}`);
      if (!file.startsWith(REPO + sep)) {
        response.writeHead(404).end("not found");
        return;
      }
      const extension = extname(file);
      mime = extension === ".mjs" ? "text/javascript; charset=utf-8"
        : extension === ".json" ? "application/json" : "application/octet-stream";
    }
    response.setHeader("content-type", mime);
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end("not found");
  }
});
await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveListen);
});

let browser;
try {
  const require = createRequire(import.meta.url);
  const { chromium } = require(resolve(REPO, "interaction/node_modules/playwright"));
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__xrE3Result || window.__xrE3Error, null, { timeout: 30_000 });
  const result = await page.evaluate(() => window.__xrE3Result ?? { error: window.__xrE3Error });
  assert.equal(result.ok, true, JSON.stringify({ result, pageErrors }));
  assert.deepEqual(pageErrors, [], "actual GoDOM host swap browser probe must not produce uncaught errors");
  console.log(JSON.stringify(result));
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
