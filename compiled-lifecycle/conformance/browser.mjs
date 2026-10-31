import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { installNoWasmGuards } from "../../compiled-frontend/conformance/no-wasm.mjs";
import { chromiumLaunchOptions } from "../../compiled-frontend/conformance/browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ESBUILD = resolve(ROOT, "interaction/node_modules/esbuild/lib/main.js");
const BROWSER_ENTRY = resolve(ROOT, "compiled-lifecycle/conformance/browser-entry.mjs");

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
    `import { installLifecycleBrowser } from ${json(BROWSER_ENTRY)};`,
    "window.__gobiLifecycle = installLifecycleBrowser({ gobiCompiled, encoder });",
    "",
  ].join("\n");
}

async function buildBrowserBundle({ compiledPath, helpersPath, tempRoot }) {
  const entryPath = resolve(tempRoot, "lifecycle-browser-entry.mjs");
  const bundlePath = resolve(tempRoot, "lifecycle-browser.bundle.mjs");
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

export async function runLifecycleBrowserConformance({
  compiledPath,
  helpersPath,
  fixturePath,
  schedulePath,
  outputPrefix,
  chromiumPath = process.env.CHROMIUM_PATH,
}) {
  if (!compiledPath || !helpersPath || !fixturePath || !schedulePath || !outputPrefix) {
    throw new TypeError("runLifecycleBrowserConformance needs compiledPath, helpersPath, fixturePath, schedulePath, and outputPrefix");
  }
  const resolved = {
    compiledPath: resolve(compiledPath),
    helpersPath: resolve(helpersPath),
    fixturePath: resolve(fixturePath),
    schedulePath: resolve(schedulePath),
    outputPrefix: resolve(outputPrefix),
  };
  const fixture = JSON.parse(await readFile(resolved.fixturePath, "utf8"));
  const swapSchedule = JSON.parse(await readFile(resolved.schedulePath, "utf8"));
  const browserCapturePath = `${resolved.outputPrefix}.browser.capture.json`;
  const bundleOutputPath = `${resolved.outputPrefix}.browser.bundle.mjs`;
  const tempRoot = resolve(tmpdir(), `gobi-lifecycle-browser-${process.pid}-${Date.now()}`);
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
    await page.waitForFunction(() => typeof window.__gobiLifecycle?.runProfile === "function", null, { timeout: 20000 });
    const browserVersion = await browser.version();
    const profiles = {};
    for (const kind of ["react", "dom", "swap"]) {
      stage = `run-${kind}-profile`;
      const profile = await page.evaluate(({ profileKind, fixtureScript, swapSchedule }) =>
        window.__gobiLifecycle.runProfile({ kind: profileKind, fixture: fixtureScript, swapSchedule }),
      { profileKind: kind, fixtureScript: fixture, swapSchedule });
      profile.pageErrors = [...pageErrors];
      if (profile.pageErrors.length > 0) throw new Error(`${kind} profile page errors: ${profile.pageErrors.join(" | ")}`);
      profiles[kind] = profile;
    }
    stage = "verify-no-wasm";
    const noWasm = await noWasmGuard.assertClear();
    const noWasmEvidence = {
      apiAttempts: noWasm.wasmAPIAttempts,
      wasmRequests: noWasm.wasmRequests,
    };
    for (const profile of Object.values(profiles)) profile.noWasm = noWasmEvidence;
    stage = "write-browser-evidence";
    const bundleBytes = await readFile(bundleOutputPath);
    const result = {
      schema: "gobi.compiled-lifecycle-browser/v1",
      fixture: fixture.name,
      packagePath: fixture.packagePath,
      componentID: fixture.componentID,
      swapSchedule,
      browser: browserVersion,
      playwright: JSON.parse(await readFile(resolve(ROOT, "interaction/node_modules/playwright/package.json"), "utf8")).version,
      noWasm: noWasmEvidence,
      profiles,
      pageErrors,
      browserBundle: { path: bundleOutputPath, sha256: hash(bundleBytes), bytes: bundleBytes.length },
    };
    await writeJSON(browserCapturePath, result);
    return result;
  } catch (error) {
    await writeJSON(`${resolved.outputPrefix}.browser.failed.json`, {
      schema: "gobi.compiled-lifecycle-browser-failure/v1",
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
