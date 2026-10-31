import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { chromiumLaunchOptions } from "../../compiled-frontend/conformance/browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ESBUILD = resolve(ROOT, "interaction/node_modules/esbuild/lib/main.js");
const ENTRY_MODULE = resolve(ROOT, "compiled-modules/conformance/browser-entry.mjs");

function json(value) {
  return JSON.stringify(value);
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function base64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function byteMapSource(side) {
  const pairs = [...side.artifactBytes.entries()].sort(([left], [right]) => left.localeCompare(right));
  return `new Map([${pairs.map(([path, bytes]) => `[${json(path)},decodeBytes(${json(base64(bytes))})]`).join(",")}])`;
}

function sideSource(name, side) {
  return `{
    compiled: ${name}Compiled,
    bridges: ${name}Bridges,
    encoder: { gobiEncodeState: ${name}Encoder.gobiEncodeState },
    descriptor: ${json(side.descriptor)},
    descriptorBytes: decodeBytes(${json(base64(side.descriptorBytes))}),
    artifactBytes: ${byteMapSource(side)},
    componentId: ${json(side.componentId)},
    backend: ${json(side.backend)},
    packagePath: ${json(side.packagePath)}
  }`;
}

function importSide(prefix, side) {
  return [
    `import { gobiCompiled as ${prefix}Compiled, gobiModuleBridges as ${prefix}Bridges } from ${json(side.modulePath)};`,
    `import * as ${prefix}Encoder from ${json(side.encoderPath)};`,
  ].join("\n");
}

function makeEntry(modulePairs) {
  const lines = [
    importSide("reactParent", modulePairs.react.parent),
    importSide("reactChild", modulePairs.react.child),
    importSide("domParent", modulePairs.dom.parent),
    importSide("domChild", modulePairs.dom.child),
    `import { installCompiledModulePairBrowser } from ${json(ENTRY_MODULE)};`,
    "function decodeBytes(value) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }",
    "const modules = {",
    `react: { parent: ${sideSource("reactParent", modulePairs.react.parent)}, child: ${sideSource("reactChild", modulePairs.react.child)} },`,
    `dom: { parent: ${sideSource("domParent", modulePairs.dom.parent)}, child: ${sideSource("domChild", modulePairs.dom.child)} }`,
    "};",
    "window.__gobiModulePair = installCompiledModulePairBrowser({ modules });",
  ];
  return `${lines.join("\n")}\n`;
}

async function buildBrowserBundle({ modulePairs, tempRoot, bundleOutputPath }) {
  await mkdir(tempRoot, { recursive: true });
  const entryPath = resolve(tempRoot, "module-pair-entry.mjs");
  await writeFile(entryPath, makeEntry(modulePairs), "utf8");
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
      response.end("<!doctype html><html><head><meta charset=utf-8></head><body><div id=admission></div><main id=app></main><script type=module src=/bundle.mjs></script></body></html>");
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
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function runModuleBrowserConformance({
  reactPair,
  domPair,
  fixture,
  seededScenarios = [],
  outputPrefix,
  chromiumPath = process.env.CHROMIUM_PATH,
}) {
  if (!reactPair || !domPair || !fixture || !outputPrefix) {
    throw new TypeError("runModuleBrowserConformance needs React/DOM module pairs, fixture and outputPrefix");
  }
  const prefix = resolve(outputPrefix);
  const bundleOutputPath = `${prefix}.browser.bundle.mjs`;
  const tempRoot = resolve(tmpdir(), `gobi-module-pair-${process.pid}-${Date.now()}`);
  let serverHandle;
  let browser;
  let page;
  const pageErrors = [];
  let stage = "bundle-browser-entry";
  try {
    await buildBrowserBundle({ modulePairs: { react: reactPair, dom: domPair }, tempRoot, bundleOutputPath });
    serverHandle = await startServer(bundleOutputPath);
    browser = await chromium.launch(chromiumLaunchOptions(chromiumPath));
    page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    stage = "load-browser-page";
    await page.goto(serverHandle.url, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => typeof window.__gobiModulePair?.runProfile === "function", null, { timeout: 30000 });
    const profiles = {};
    for (const kind of ["react", "dom", "swap"]) {
      stage = `fixed-${kind}`;
      profiles[kind] = await page.evaluate(({ profileKind, script }) =>
        window.__gobiModulePair.runProfile({ kind: profileKind, fixture: script, runId: `fixed-${profileKind}` }),
      { profileKind: kind, script: fixture });
    }
    const seededProfiles = {};
    for (const item of seededScenarios) {
      for (const kind of ["react", "dom", "swap"]) {
        const runId = `seed-${item.seed}-${kind}`;
        stage = runId;
        seededProfiles[runId] = await page.evaluate(({ profileKind, script, seedValue, id }) =>
          window.__gobiModulePair.runProfile({
            kind: profileKind,
            fixture: script,
            runId: id,
            seed: seedValue,
            injectSeedSwaps: profileKind === "swap",
          }),
        { profileKind: kind, script: item.scenario, seedValue: item.seed, id: runId });
      }
    }
    if (pageErrors.length !== 0) throw new Error(`browser page errors: ${pageErrors.join(" | ")}`);
    stage = "write-browser-capture";
    const bundleBytes = await readFile(bundleOutputPath);
    const result = {
      schema: "gobi.compiled-modules-browser/v1",
      fixture: fixture.name,
      profiles: { ...profiles, seeded: seededProfiles },
      profileCount: 3 + Object.keys(seededProfiles).length,
      fixedProfiles: ["react", "dom", "swap"],
      seededProfiles: Object.keys(seededProfiles),
      pageErrors,
      browser: await browser.version(),
      playwright: JSON.parse(await readFile(resolve(ROOT, "interaction/node_modules/playwright/package.json"), "utf8")).version,
      browserBundle: { path: bundleOutputPath, bytes: bundleBytes.length, sha256: hash(bundleBytes) },
    };
    await writeJSON(`${prefix}.browser.json`, result);
    return result;
  } catch (error) {
    await writeJSON(`${prefix}.browser.failed.json`, {
      schema: "gobi.compiled-modules-browser-failure/v1",
      stage,
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
