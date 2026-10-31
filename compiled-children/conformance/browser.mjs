import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { installNoWasmGuards } from "../../compiled-frontend/conformance/no-wasm.mjs";
import { chromiumLaunchOptions } from "../../compiled-frontend/conformance/browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ESBUILD = resolve(ROOT, "interaction/node_modules/esbuild/lib/main.js");
const BROWSER_ENTRY = resolve(ROOT, "compiled-children/conformance/browser-entry.mjs");

function json(value) {
  return JSON.stringify(value);
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeEntry({ reactCompiled, reactHelpers, domCompiled, domHelpers }) {
  return [
    `import { gobiCompiled as gobiReact } from ${json(resolve(reactCompiled))};`,
    `import * as encoderReact from ${json(resolve(reactHelpers))};`,
    `import { gobiCompiled as gobiDom } from ${json(resolve(domCompiled))};`,
    `import * as encoderDom from ${json(resolve(domHelpers))};`,
    `import { installChildrenBrowser } from ${json(BROWSER_ENTRY)};`,
    "window.__gobiChildren = installChildrenBrowser({ gobiReact, encoderReact, gobiDom, encoderDom });",
    "",
  ].join("\n");
}

async function buildBrowserBundle({ reactCompiled, reactHelpers, domCompiled, domHelpers, tempRoot, bundleOutputPath }) {
  const entryPath = resolve(tempRoot, "children-browser-entry.mjs");
  await writeFile(entryPath, makeEntry({ reactCompiled, reactHelpers, domCompiled, domHelpers }), "utf8");
  const { build } = await import(pathToFileURL(ESBUILD).href);
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    nodePaths: [resolve(ROOT, "interaction/node_modules")],
    outfile: bundleOutputPath,
    logLevel: "silent",
  });
  return { entryPath, bundlePath: bundleOutputPath };
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

export async function runChildrenBrowserConformance({
  reactCompiled,
  reactHelpers,
  domCompiled,
  domHelpers,
  fixturePath,
  expectationsPath,
  outputPrefix,
  profileKinds = ["react", "dom", "swap"],
  chromiumPath = process.env.CHROMIUM_PATH,
}) {
  if (!reactCompiled || !reactHelpers || !domCompiled || !domHelpers || !fixturePath || !expectationsPath || !outputPrefix) {
    throw new TypeError("runChildrenBrowserConformance needs both compiled modules/helpers, fixture, expectations, and output prefix");
  }
  const resolved = {
    reactCompiled: resolve(reactCompiled),
    reactHelpers: resolve(reactHelpers),
    domCompiled: resolve(domCompiled),
    domHelpers: resolve(domHelpers),
    fixturePath: resolve(fixturePath),
    expectationsPath: resolve(expectationsPath),
    outputPrefix: resolve(outputPrefix),
  };
  if (!Array.isArray(profileKinds) || profileKinds.length === 0 ||
      profileKinds.some((kind) => !["react", "dom", "swap"].includes(kind)) ||
      new Set(profileKinds).size !== profileKinds.length) {
    throw new TypeError("profileKinds must be a nonempty unique subset of react, dom, swap");
  }
  const [fixture, expectations] = await Promise.all([
    readFile(resolved.fixturePath, "utf8").then(JSON.parse),
    readFile(resolved.expectationsPath, "utf8").then(JSON.parse),
  ]);
  const browserCapturePath = `${resolved.outputPrefix}.browser.capture.json`;
  const bundleOutputPath = `${resolved.outputPrefix}.browser.bundle.mjs`;
  const tempRoot = resolve(tmpdir(), `gobi-children-browser-${process.pid}-${Date.now()}`);
  await mkdir(tempRoot, { recursive: true });
  let serverHandle;
  let browser;
  let page;
  const pageErrors = [];
  let stage = "bundle-browser-entry";
  try {
    await buildBrowserBundle({ ...resolved, tempRoot, bundleOutputPath });
    serverHandle = await startServer(bundleOutputPath);
    browser = await chromium.launch(chromiumLaunchOptions(chromiumPath));
    page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const noWasmGuard = await installNoWasmGuards(page);
    stage = "load-browser-page";
    await page.goto(serverHandle.url, { waitUntil: "load", timeout: 20000 });
    await page.waitForFunction(() => typeof window.__gobiChildren?.runProfile === "function", null, { timeout: 20000 });
    const browserVersion = await browser.version();
    const profiles = {};
    for (const kind of profileKinds) {
      stage = `run-${kind}-profile`;
      profiles[kind] = await page.evaluate(({ profileKind, fixtureScript, literalExpectations }) =>
        window.__gobiChildren.runProfile({ kind: profileKind, fixture: fixtureScript, expectations: literalExpectations }),
      { profileKind: kind, fixtureScript: fixture, literalExpectations: expectations });
      profiles[kind].pageErrors = [...pageErrors];
      if (profiles[kind].pageErrors.length > 0) {
        throw new Error(`${kind} profile page errors: ${profiles[kind].pageErrors.join(" | ")}`);
      }
    }
    stage = "verify-no-wasm";
    const noWasm = await noWasmGuard.assertClear();
    const noWasmEvidence = {
      apiAttempts: noWasm.wasmAPIAttempts,
      wasmRequests: noWasm.wasmRequests,
      guardCoverage: noWasm.guardCoverage,
    };
    for (const profile of Object.values(profiles)) profile.noWasm = noWasmEvidence;
    stage = "write-browser-evidence";
    const bundleBytes = await readFile(bundleOutputPath);
    const result = {
      schema: "gobi.compiled-children-browser/v1",
      fixture: fixture.name,
      packagePath: fixture.packagePath,
      componentID: fixture.componentID,
      browser: browserVersion,
      playwright: JSON.parse(await readFile(resolve(ROOT, "interaction/node_modules/playwright/package.json"), "utf8")).version,
      noWasm: noWasmEvidence,
      profilesRun: [...profileKinds],
      profiles,
      pageErrors,
      browserBundle: { path: bundleOutputPath, sha256: hash(bundleBytes), bytes: bundleBytes.length },
    };
    await writeJSON(browserCapturePath, result);
    return result;
  } catch (error) {
    await writeJSON(`${resolved.outputPrefix}.browser.failed.json`, {
      schema: "gobi.compiled-children-browser-failure/v1",
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
