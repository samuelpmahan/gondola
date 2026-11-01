import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { chromiumLaunchOptions } from "../../compiled-frontend/conformance/browser.mjs";
import { normalizeKeyedSnapshot, normalizeRuntimeEvent, scenarioDigest } from "./capture-utils.mjs";
import { browserModuleSideSource, browserSideImports } from "./module-loader.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ESBUILD = resolve(ROOT, "interaction/node_modules/esbuild/lib/main.js");
const BROWSER_ENTRY = resolve(ROOT, "compiled-keyed-modules/conformance/browser-entry.mjs");
const INDEX_SCHEMA = "gobi.keyed-module-browser/v1";

const json = (value) => JSON.stringify(value);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const base64 = (bytes) => Buffer.from(bytes).toString("base64");

function importSide(prefix, compiledSide, helperPath = null, helperExportName = "gobiKeyedModuleHelpers") {
  return browserSideImports(prefix, compiledSide, helperPath, helperExportName);
}

function makeEntry(builds) {
  const lines = [
    importSide("reactParent", builds.react.pair.parent, builds.react.helperPath, builds.react.helperExportName),
    importSide("reactChild", builds.react.pair.child),
    importSide("domParent", builds.dom.pair.parent, builds.dom.helperPath, builds.dom.helperExportName),
    importSide("domChild", builds.dom.pair.child),
    `import { installKeyedConformanceBrowser } from ${json(BROWSER_ENTRY)};`,
    "function decodeBytes(value) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }",
    "const modules = {",
    `react: { parent: ${browserModuleSideSource("reactParent", builds.react.parent, "reactParentKeyed")}, child: ${browserModuleSideSource("reactChild", builds.react.child)} },`,
    `dom: { parent: ${browserModuleSideSource("domParent", builds.dom.parent, "domParentKeyed")}, child: ${browserModuleSideSource("domChild", builds.dom.child)} }`,
    "};",
    "window.__gobiKeyedConformance = installKeyedConformanceBrowser({ modules });",
  ];
  return `${lines.join("\n")}\n`;
}

async function buildBrowserBundle({ builds, tempRoot, bundlePath }) {
  await mkdir(tempRoot, { recursive: true });
  const entryPath = resolve(tempRoot, "keyed-module-entry.mjs");
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

function normalizeBrowserRaw(raw, { scenario, seed, build }) {
  const snapshots = raw.snapshots.map(({ eventIndex, snapshot }) => ({ eventIndex, snapshot: normalizeKeyedSnapshot(snapshot) }));
  const events = raw.events.map((event, index) => {
    const source = scenario.events[index];
    const nativeRow = raw.nativeRows[index];
    return {
      ...normalizeRuntimeEvent(event.runtimeEvent, source, index, nativeRow, event.result),
      domClick: structuredClone(event.domClick),
      callbackObservation: structuredClone(event.domClick?.observed ?? null),
    };
  });
  const identity = structuredClone(raw.identity);
  return {
    schema: "gobi.keyed-module-capture/v1",
    profile: raw.profile,
    backend: raw.backend,
    backendStart: raw.backendStart,
    backendEnd: raw.backendEnd,
    moduleBuildBackend: raw.moduleBuildBackend,
    rendererBackend: raw.backendEnd,
    scenarioName: scenario.name,
    scenario: structuredClone(scenario),
    scenarioSHA256: scenarioDigest(scenario),
    scenarioHash: scenarioDigest(scenario),
    seed,
    sourceEventCount: scenario.events.length,
    snapshots,
    events,
    trace: structuredClone(raw.trace),
    finalSnapshot: normalizeKeyedSnapshot(raw.finalSnapshot),
    identity,
    probes: structuredClone(raw.probes),
    callbackObservations: structuredClone(raw.callbackObservations),
    failure: raw.failure,
    unmount: structuredClone(raw.unmount),
    modulePins: build.pins,
    versions: raw.versions,
  };
}

export async function runKeyedBrowserConformance({ builds, scenario, native, seed = null, outputPrefix,
  chromiumPath = process.env.CHROMIUM_PATH }) {
  if (!builds?.react || !builds?.dom || !scenario || !native || !outputPrefix) {
    throw new TypeError("browser keyed conformance needs both module builds, scenario, native trace and outputPrefix");
  }
  const prefix = resolve(outputPrefix);
  const bundlePath = `${prefix}.browser.bundle.mjs`;
  const tempRoot = resolve(tmpdir(), `gobi-keyed-browser-${process.pid}-${Date.now()}`);
  let serverHandle;
  let browser;
  let page;
  const pageErrors = [];
  let stage = "bundle-keyed-browser-entry";
  try {
    await buildBrowserBundle({ builds, tempRoot, bundlePath });
    serverHandle = await startServer(bundlePath);
    browser = await chromium.launch(chromiumLaunchOptions(chromiumPath));
    page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    stage = "load-keyed-browser-page";
    await page.goto(serverHandle.url, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => typeof window.__gobiKeyedConformance?.runProfile === "function", null, { timeout: 30000 });
    const profiles = {};
    for (const profile of ["react", "dom", "swap"]) {
      stage = `${scenario.name}-${profile}`;
      const raw = await page.evaluate(({ profile: selected, fixture, nativeTrace, seedValue }) =>
        window.__gobiKeyedConformance.runProfile({ profile: selected, scenario: fixture, native: nativeTrace, seed: seedValue }),
      { profile, fixture: scenario, nativeTrace: native, seedValue: seed });
      raw.nativeRows = native.events;
      raw.versions = { chromium: await browser.version() };
      profiles[profile] = normalizeBrowserRaw(raw, { scenario, seed, build: builds[raw.moduleBuildBackend] });
      await writeFile(`${prefix}.${scenario.name}.${profile}.raw.json`, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
    }
    if (pageErrors.length !== 0) throw new Error(`browser page errors: ${pageErrors.join(" | ")}`);
    const bundleBytes = await readFile(bundlePath);
    const result = {
      schema: INDEX_SCHEMA,
      profile: "browser",
      backend: "dom",
      scenarioName: scenario.name,
      scenario: structuredClone(scenario),
      scenarioHash: scenarioDigest(scenario),
      seed,
      sourceEventCount: scenario.events.length,
      snapshots: profiles.dom.snapshots,
      events: profiles.dom.events,
      identity: {
        schema: "gobi.keyed-module-browser-identity-set/v1",
        profileIdentities: Object.fromEntries(Object.entries(profiles).map(([name, profile]) => [name, profile.identity])),
        checkpoints: profiles.swap.identity.checkpoints,
      },
      probes: profiles.swap.probes,
      profiles,
      browserProfileCount: Object.keys(profiles).length,
      browser: await browser.version(),
      playwright: JSON.parse(await readFile(resolve(ROOT, "interaction/node_modules/playwright/package.json"), "utf8")).version,
      pageErrors,
      bundle: { path: bundlePath, bytes: bundleBytes.length, sha256: sha256(bundleBytes) },
    };
    return result;
  } catch (error) {
    await writeFile(`${prefix}.${scenario.name}.browser.failed.json`, `${JSON.stringify({
      schema: "gobi.keyed-module-browser-failure/v1",
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
