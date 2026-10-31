import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { installNoWasmGuards } from "../../compiled-frontend/conformance/no-wasm.mjs";
import { chromiumLaunchOptions } from "../../compiled-frontend/conformance/browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ESBUILD = resolve(ROOT, "interaction/node_modules/esbuild/lib/main.js");
const BROWSER_ENTRY = resolve(ROOT, "compiled-capabilities/conformance/capability-browser-entry.mjs");

function json(value) {
  return JSON.stringify(value);
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeEntry({ compiledPath, helpersPath }) {
  return [
    `import { gobiCompiled } from ${json(resolve(compiledPath))};`,
    `import * as encoder from ${json(resolve(helpersPath))};`,
    `import { installCapabilityBrowser } from ${json(BROWSER_ENTRY)};`,
    "window.__gobiCapability = ({ fixture, expectations }) => installCapabilityBrowser({ gobiCompiled, encoder, fixture, expectations });",
    "",
  ].join("\n");
}

async function buildBrowserBundle({ compiledPath, helpersPath, tempRoot }) {
  const entryPath = resolve(tempRoot, "capability-browser-entry.mjs");
  const bundlePath = resolve(tempRoot, "capability-browser.bundle.mjs");
  await writeFile(entryPath, makeEntry({ compiledPath, helpersPath }), "utf8");
  const { build } = await import(pathToFileURL(ESBUILD).href);
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    nodePaths: [resolve(ROOT, "interaction/node_modules")],
    outfile: bundlePath,
    logLevel: "silent",
  });
  return { entryPath, bundlePath };
}

function contentType(path) {
  const extension = extname(path);
  return extension === ".mjs" || extension === ".js" ? "text/javascript; charset=utf-8" : "application/octet-stream";
}

async function startServer(bundlePath) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/" || url.pathname === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end("<!doctype html><html><head><meta charset=utf-8></head><body><main id=app></main><script type=module src=/bundle.mjs></script></body></html>");
      return;
    }
    if (url.pathname === "/bundle.mjs") {
      response.writeHead(200, { "content-type": contentType(bundlePath), "cache-control": "no-store" });
      createReadStream(bundlePath).pipe(response);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialize(value), "utf8");
}

export async function runCapabilityBrowserConformance({
  compiledPath,
  helpersPath,
  fixturePath,
  expectationsPath,
  outputPrefix,
  chromiumPath = process.env.CHROMIUM_PATH,
}) {
  if (!compiledPath || !helpersPath || !fixturePath || !expectationsPath || !outputPrefix) {
    throw new TypeError("runCapabilityBrowserConformance needs compiledPath, helpersPath, fixturePath, expectationsPath, and outputPrefix");
  }
  const resolved = {
    compiledPath: resolve(compiledPath),
    helpersPath: resolve(helpersPath),
    fixturePath: resolve(fixturePath),
    expectationsPath: resolve(expectationsPath),
    outputPrefix: resolve(outputPrefix),
  };
  const fixture = JSON.parse(await readFile(resolved.fixturePath, "utf8"));
  const expectations = JSON.parse(await readFile(resolved.expectationsPath, "utf8"));
  const capturePath = `${resolved.outputPrefix}.browser.capture.json`;
  const bundleOutputPath = `${resolved.outputPrefix}.browser.bundle.mjs`;
  const failurePath = `${resolved.outputPrefix}.browser.failed.json`;
  const tempRoot = resolve(tmpdir(), `gobi-capability-browser-${process.pid}-${Date.now()}`);
  await mkdir(tempRoot, { recursive: true });
  let serverHandle;
  let browser;
  let page;
  const pageErrors = [];
  let stage = "bundle-browser-entry";
  try {
    const bundle = await buildBrowserBundle({ ...resolved, tempRoot });
    await copyFile(bundle.bundlePath, bundleOutputPath);
    serverHandle = await startServer(bundle.bundlePath);
    browser = await chromium.launch(chromiumLaunchOptions(chromiumPath));
    page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const noWasmGuard = await installNoWasmGuards(page);
    stage = "load-browser-page";
    await page.goto(serverHandle.url, { waitUntil: "load", timeout: 20000 });
    await page.waitForFunction(() => typeof window.__gobiCapability === "function", null, { timeout: 20000 });
    stage = "run-actual-compiled-capability-probe";
    const installedEvidence = await page.evaluate(({ fixtureScript, capabilityExpectations }) =>
      window.__gobiCapability({ fixture: fixtureScript, expectations: capabilityExpectations }),
    { fixtureScript: fixture, capabilityExpectations: expectations });
    if (pageErrors.length > 0) throw new Error(`capability profile page errors: ${pageErrors.join(" | ")}`);
    stage = "verify-no-wasm";
    const noWasm = await noWasmGuard.assertClear();
    const browserVersion = await browser.version();
    const playwrightVersion = JSON.parse(await readFile(resolve(ROOT, "interaction/node_modules/playwright/package.json"), "utf8")).version;
    const bundleBytes = await readFile(bundleOutputPath);
    const result = {
      ...installedEvidence,
      browser: browserVersion,
      playwright: playwrightVersion,
      noWasm: { apiAttempts: noWasm.wasmAPIAttempts, wasmRequests: noWasm.wasmRequests },
      browserBundle: { path: bundleOutputPath, sha256: hash(bundleBytes), bytes: bundleBytes.length },
      pageErrors,
    };
    await writeJSON(capturePath, result);
    return result;
  } catch (error) {
    await writeJSON(failurePath, {
      schema: "gobi.compiled-capability-browser-failure/v1",
      stage,
      fixture: fixture.name,
      error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null },
      pageErrors,
    });
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (serverHandle) await new Promise((resolveClose) => serverHandle.server.close(resolveClose));
    await rm(tempRoot, { recursive: true, force: true });
  }
}
