import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "../../../../interaction/node_modules/playwright/index.mjs";
import { chromiumLaunchOptions } from "../../../../compiled-frontend/conformance/browser.mjs";
import { LIFECYCLE_HOST_CAPABILITIES } from "../../../../compiled-lifecycle/runtime/runtime.mjs";

const site = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const expectedViewProfile = ["view.node", "binding.value", "binding.checked"];
const expectedHostProfile = ["effect.request-reply", "effect.cancel"];
const result = {
  schema: "gobi.capability-demo-profile-review/v1",
  status: "running",
  checks: [],
  profiles: [],
};
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    let path = resolve(site, `.${decodeURIComponent(url.pathname)}`);
    if (path !== site && !path.startsWith(site + sep)) throw new Error("request outside review site");
    if (url.pathname.endsWith("/")) path = join(path, "index.html");
    const bytes = await readFile(path);
    response.writeHead(200, { "content-type": contentTypes[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(bytes);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end("not found");
  }
});

await mkdir(resolve(output, ".."), { recursive: true });
await new Promise((listen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", listen);
});
let browser;
try {
  assert.deepEqual(LIFECYCLE_HOST_CAPABILITIES, expectedHostProfile);
  assert.equal(Object.isFrozen(LIFECYCLE_HOST_CAPABILITIES), true);
  assert.throws(() => LIFECYCLE_HOST_CAPABILITIES.push("view.node"), TypeError);
  result.hostExport = [...LIFECYCLE_HOST_CAPABILITIES];
  result.hostExportFrozen = Object.isFrozen(LIFECYCLE_HOST_CAPABILITIES);
  result.checks.push("the exported lifecycle host capability array is exact and frozen against mutation");

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("review HTTP server has no TCP port");
  browser = await chromium.launch(chromiumLaunchOptions(process.env.CHROMIUM_PATH));
  result.browserVersion = browser.version();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.capabilityDemo?.runtime && window.capabilityDemo.backend === "dom");

  async function readActiveProfile() {
    return page.evaluate(() => ({
      backend: window.capabilityDemo.backend,
      capabilities: [...window.capabilityDemo.renderer.viewCapabilities],
      capabilitiesFrozen: Object.isFrozen(window.capabilityDemo.renderer.viewCapabilities),
      displayedHost: [...document.querySelectorAll("#host-support li")].map((item) => item.textContent),
      displayedRenderer: [...document.querySelectorAll("#renderer-support li")].map((item) => item.textContent),
    }));
  }

  const dom = await readActiveProfile();
  assert.deepEqual(dom.capabilities, expectedViewProfile);
  assert.equal(dom.capabilitiesFrozen, true);
  assert.deepEqual(dom.displayedHost, expectedHostProfile);
  assert.deepEqual(dom.displayedRenderer, expectedViewProfile);
  result.profiles.push(dom);

  await page.locator('[data-renderer="react"]').click();
  await page.waitForFunction(() => window.capabilityDemo.backend === "react");
  const react = await readActiveProfile();
  assert.deepEqual(react.capabilities, expectedViewProfile);
  assert.equal(react.capabilitiesFrozen, true);
  assert.deepEqual(react.displayedRenderer, expectedViewProfile);
  assert.deepEqual(react.displayedHost, expectedHostProfile);
  result.profiles.push(react);

  await page.locator('[data-renderer="dom"]').click();
  await page.waitForFunction(() => window.capabilityDemo.backend === "dom");
  const recoveredDOM = await readActiveProfile();
  assert.deepEqual(recoveredDOM.capabilities, expectedViewProfile);
  assert.equal(recoveredDOM.capabilitiesFrozen, true);
  assert.deepEqual(recoveredDOM.displayedRenderer, expectedViewProfile);
  result.profiles.push(recoveredDOM);
  result.checks.push("actual DOM and React renderers each expose and display the exact frozen view/binding profile");
  result.status = "passed";
} catch (error) {
  result.status = "failed";
  result.failure = { name: error?.name ?? "Error", message: error?.message ?? String(error), stack: error?.stack ?? null };
} finally {
  if (browser) await browser.close();
  await new Promise((close) => server.close(close));
  result.finishedAt = new Date().toISOString();
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
}

if (result.status !== "passed") {
  console.error(JSON.stringify({ schema: result.schema, status: result.status, output, failure: result.failure }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ schema: result.schema, status: result.status, checks: result.checks.length, output }));
}
