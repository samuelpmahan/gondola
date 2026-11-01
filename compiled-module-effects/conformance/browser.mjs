import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { chromiumLaunchOptions } from "../../compiled-frontend/conformance/browser.mjs";
import { browserModuleSideSource, browserSideImports } from "../build/module-loader.mjs";
import { scenarioDigest } from "./capture-utils.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ESBUILD = resolve(ROOT, "interaction/node_modules/esbuild/lib/main.js");
const BROWSER_ENTRY = resolve(ROOT, "compiled-module-effects/conformance/browser-entry.mjs");
const json = (value) => JSON.stringify(value);

function sourceLinesForProfile(prefix, profile) {
  const lines = [
    browserSideImports(`${prefix}Parent`, profile.parent, profile.helperPath, profile.helperExportName),
    browserSideImports(`${prefix}Child`, profile.child),
  ];
  return lines.join("\n");
}

function makeEntry(builds) {
  const profiles = builds.builds ?? builds.profiles;
  const lines = [
    sourceLinesForProfile("react", profiles.react),
    sourceLinesForProfile("dom", profiles.dom),
    `import { installModuleEffectsConformanceBrowser } from ${json(BROWSER_ENTRY)};`,
    "function decodeBytes(value) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }",
    "const modules = {",
    `react: { parent: ${browserModuleSideSource("reactParent", profiles.react.parent, "reactParentKeyed")}, child: ${browserModuleSideSource("reactChild", profiles.react.child)}, pins: ${json(profiles.react.pins ?? null)} },`,
    `dom: { parent: ${browserModuleSideSource("domParent", profiles.dom.parent, "domParentKeyed")}, child: ${browserModuleSideSource("domChild", profiles.dom.child)}, pins: ${json(profiles.dom.pins ?? null)} },`,
    "};",
    "window.__gobiModuleEffectsConformance = installModuleEffectsConformanceBrowser({ modules });",
  ];
  return `${lines.join("\n")}\n`;
}

async function buildBrowserBundle({ builds, tempRoot, bundlePath }) {
  await mkdir(tempRoot, { recursive: true });
  const entryPath = resolve(tempRoot, "module-effects-entry.mjs");
  await writeFile(entryPath, makeEntry(builds), "utf8");
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
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

export async function runModuleEffectsBrowser({ builds, scenario, native, seed = null, outputPrefix,
  chromiumPath = process.env.CHROMIUM_PATH }) {
  if (!builds?.builds?.react && !builds?.profiles?.react) throw new TypeError("browser runner needs react and dom module builds");
  if (!scenario || !native || !outputPrefix) throw new TypeError("browser runner needs a scenario, native capture and output prefix");
  const profiles = builds.builds ?? builds.profiles;
  const prefix = resolve(outputPrefix);
  const bundlePath = `${prefix}.browser.bundle.mjs`;
  const tempRoot = resolve(tmpdir(), `gobi-module-effects-browser-${process.pid}-${Date.now()}`);
  let serverHandle;
  let browser;
  let page;
  const pageErrors = [];
  let stage = "bundle-module-effects-browser-entry";
  try {
    await buildBrowserBundle({ builds, tempRoot, bundlePath });
    serverHandle = await startServer(bundlePath);
    browser = await chromium.launch(chromiumLaunchOptions(chromiumPath));
    page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    stage = "load-module-effects-browser-page";
    await page.goto(serverHandle.url, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => typeof window.__gobiModuleEffectsConformance?.runProfile === "function", null, { timeout: 30000 });
    const captures = {};
    for (const profile of ["react", "dom", "swap"]) {
      stage = `${scenario.name}-${profile}`;
      captures[profile] = await page.evaluate(({ selected, fixture, nativeTrace, seedValue }) =>
        window.__gobiModuleEffectsConformance.runProfile({ profile: selected, scenario: fixture, native: nativeTrace, seed: seedValue }),
      { selected: profile, fixture: scenario, nativeTrace: native, seedValue: seed });
    }
    if (pageErrors.length !== 0) throw new Error(`browser page errors: ${pageErrors.join(" | ")}`);
    const chromiumVersion = await browser.version();
    for (const capture of Object.values(captures)) {
      capture.scenarioSHA256 = scenarioDigest(scenario);
      capture.versions.chromium = chromiumVersion;
      capture.versions.playwright = JSON.parse(await readFile(resolve(ROOT, "interaction/node_modules/playwright/package.json"), "utf8")).version;
    }
    return {
      schema: "gobi.module-effects-browser-capture-index/v1",
      profile: "browser",
      profiles: captures,
      browser: chromiumVersion,
      playwright: captures.react.versions.playwright,
      pageErrors,
    };
  } catch (error) {
    await writeFile(`${prefix}.browser.failed.json`, `${JSON.stringify({
      schema: "gobi.module-effects-browser-failure/v1",
      stage,
      error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null },
      pageErrors,
    }, null, 2)}\n`, "utf8");
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (serverHandle) await new Promise((resolveClose) => serverHandle.server.close(resolveClose));
    await rm(tempRoot, { recursive: true, force: true });
  }
}
