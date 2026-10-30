import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const [wasmPath, wasmExecPath] = process.argv.slice(2);
if (!wasmPath || !wasmExecPath) throw new Error("usage: node xr_t2_reentry_probe.mjs <wasm> <wasm_exec.js>");
const root = resolve(new URL("../../..", import.meta.url).pathname);
const html = `<!doctype html><meta charset="utf-8"><script src="/wasm_exec.js"></script><script>
window.probe = (async () => {
  const go = new Go();
  const bytes = await (await fetch('/composition.wasm')).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  void go.run(instance);
  for (let i = 0; i < 200 && !globalThis.gobiComposition; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const api = globalThis.gobiComposition;
  if (!api) throw new Error('bridge did not initialize');
  const parent = api.create();
  const child = api.createChild(parent);
  const before = api.list();
  let nestedID = 0;
  const accessorInput = Object.defineProperty({ ReadOnly: false }, 'Title', {
    enumerable: true,
    get() { nestedID = api.create(); return 7; },
  });
  const invalidAccessorResult = api.setChildInputs(parent, child, accessorInput);
  const afterAccessor = api.list();

  const prototype = { Title: 'from prototype', ReadOnly: false };
  const proxy = new Proxy(Object.create(prototype), {
    ownKeys() { return ['Title', 'ReadOnly']; },
  });
  const proxyResult = api.setChildInputs(parent, child, proxy);
  const afterProxy = api.snapshot(child);
  return { before, nestedID, invalidAccessorResult, afterAccessor, proxyResult,
    afterProxy: { Inputs: afterProxy.state.Inputs, InputRevision: afterProxy.state.InputRevision } };
})().catch((error) => { window.probeError = String(error?.stack ?? error); throw error; });
</script>`;
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/") { response.setHeader("content-type", "text/html"); response.end(html); return; }
  if (pathname === "/composition.wasm") { response.setHeader("content-type", "application/wasm"); response.end(await readFile(wasmPath)); return; }
  if (pathname === "/wasm_exec.js") { response.setHeader("content-type", "text/javascript"); response.end(await readFile(wasmExecPath)); return; }
  response.writeHead(404).end();
});
await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
let browser;
try {
  const require = createRequire(import.meta.url);
  const { chromium } = require(resolve(root, "interaction/node_modules/playwright"));
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || "/tmp/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
  const result = await page.evaluate(async () => await window.probe);
  assert.deepEqual(result.before, [1, 2]);
  assert.equal(result.nestedID, 3);
  assert.equal(Object.hasOwn(result.invalidAccessorResult, "error"), true, "wrong getter value should be rejected");
  assert.deepEqual(result.afterAccessor, [1, 2, 3], "the nested bridge call should be observable");
  assert.equal(result.proxyResult.state.Inputs.Title, "from prototype");
  assert.equal(result.afterProxy.Inputs.Title, "from prototype");
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
