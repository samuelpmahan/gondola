import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, mkdir, rm, writeFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const compiledRoot = resolve(process.env.GOBI_FROZEN_REACT_BUILD ?? "/tmp/gobi-e-build-frozen/react");
const outputRoot = join(repoRoot, "compiled-backends/artifacts/independence/dom-only-counter");
const chromiumPath = process.env.GOBI_CHROMIUM_PATH ?? "/tmp/chromium";
const metafileOnly = process.argv.includes("--metafile-only");
const require = createRequire(join(repoRoot, "interaction/package.json"));
const { build } = require("esbuild");
const { chromium } = require("playwright");

const sha256 = async path => createHash("sha256").update(await readFile(path)).digest("hex");
const toPosix = path => path.split(sep).join("/");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const manifestPath = join(compiledRoot, "buildmanifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.schema, "gobi.build-manifest/v1");
const counterPackage = "github.com/samuelpmahan/gondola/counter";
const app = manifest.apps.find(candidate => candidate.packagePath === counterPackage);
assert.ok(app, "the frozen manifest must contain the compiled counter");
assert.equal(app.backend, "react", "use the actual module and encoder from the frozen React-profile build");

const modulePath = resolve(compiledRoot, app.module);
const encoderPath = resolve(compiledRoot, app.encoder);
const appIRPath = resolve(compiledRoot, app.appIR);
const domRendererPath = join(repoRoot, "compiled-frontend/frontend/dom/renderer.mjs");
const runtimePath = join(repoRoot, "compiled-frontend/frontend/runtime/runtime.mjs");
const sharedViewPath = join(repoRoot, "compiled-frontend/frontend/shared/view.mjs");
const reactMapPath = join(repoRoot, "compiled-frontend/frontend/react/react-map.gen.mjs");

const entryPath = join(outputRoot, "entry.mjs");
const bundlePath = join(outputRoot, "dom-counter.bundle.mjs");
const imports = [
  `import { gobiCompiled } from ${JSON.stringify(modulePath)};`,
  `import * as encoder from ${JSON.stringify(encoderPath)};`,
  `import { createDOMRenderer } from ${JSON.stringify(domRendererPath)};`,
  `import { mountCompiledApp } from ${JSON.stringify(runtimePath)};`,
].join("\n");
const entrySource = `${imports}

const component = gobiCompiled.appIR.components.find(item => item.id === ${JSON.stringify(app.componentId)});
if (!component) throw new Error("counter component missing from actual compiled GoScript module");
for (const role of ["init", "update", "view"]) {
  if (typeof gobiCompiled.symbols[component[role]] !== "function") throw new Error("compiled Go symbol missing: " + role);
}
const container = document.querySelector("#counter");
const renderer = createDOMRenderer({ container });
const runtime = mountCompiledApp({ module: gobiCompiled, encoder, componentId: component.id, renderer });
function decodeCount(snapshot) {
  const state = snapshot.state.fields.find(field => field.name === "Count");
  if (!state || state.value.kind !== "float64") throw new Error("unexpected actual counter state encoding");
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt("0x" + state.value.float64Bits));
  return view.getFloat64(0);
}
window.domCounterProof = {
  ready: true,
  backend: "dom",
  componentId: component.id,
  roles: { init: component.init, update: component.update, view: component.view },
  sample() {
    const snapshot = runtime.snapshot();
    const buttons = [...container.querySelectorAll("button")];
    return {
      count: decodeCount(snapshot),
      html: container.innerHTML,
      addDisabled: buttons[0]?.disabled ?? null,
      resetDisabled: buttons[1]?.disabled ?? null,
      tickCount: runtime.trace().ticks.length,
      messages: runtime.trace().ticks.slice(1).map(tick => tick.message?.name ?? null),
    };
  },
};
`;
await writeFile(entryPath, entrySource);

const htmlPath = join(outputRoot, "index.html");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>DOM-only compiled counter independence proof</title></head>
<body><main id="counter"></main>
<script>
  window.__gobiGuards = { wasmApiCalls: [], fetchCalls: [], xhrCalls: [], wasmRequests: [] };
  for (const name of Reflect.ownKeys(WebAssembly)) {
    if (typeof name !== "string" || typeof WebAssembly[name] !== "function") continue;
    const descriptor = Object.getOwnPropertyDescriptor(WebAssembly, name);
    if (!descriptor || descriptor.configurable !== true) throw new Error("cannot guard WebAssembly." + name);
    Object.defineProperty(WebAssembly, name, {
      configurable: true,
      enumerable: descriptor.enumerable,
      writable: true,
      value(...args) {
        window.__gobiGuards.wasmApiCalls.push(name);
        throw new Error("WebAssembly API blocked by independence proof: " + name);
      }
    });
  }
  window.fetch = (...args) => {
    window.__gobiGuards.fetchCalls.push(String(args[0]));
    return Promise.reject(new Error("fetch blocked by independence proof"));
  };
  const NativeXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = class extends NativeXHR {
    open(...args) { window.__gobiGuards.xhrCalls.push(String(args[1])); return super.open(...args); }
    send(...args) { window.__gobiGuards.xhrCalls.push("send"); throw new Error("XHR blocked by independence proof"); }
  };
  window.addEventListener("error", event => { window.__gobiPageErrors ??= []; window.__gobiPageErrors.push(String(event.message)); });
  window.addEventListener("unhandledrejection", event => { window.__gobiUnhandled ??= []; window.__gobiUnhandled.push(String(event.reason)); });
</script>
<script type="module" src="./dom-counter.bundle.mjs"></script>
</body></html>`;
await writeFile(htmlPath, html);

const built = await build({
  entryPoints: [entryPath],
  absWorkingDir: repoRoot,
  outfile: bundlePath,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  nodePaths: [join(repoRoot, "interaction/node_modules")],
  metafile: true,
  sourcemap: false,
  logLevel: "silent",
});
const metafilePath = join(outputRoot, "metafile.json");
await writeFile(metafilePath, `${JSON.stringify(built.metafile, null, 2)}\n`);
const inputs = Object.keys(built.metafile.inputs).map(path => toPosix(resolve(repoRoot, path)));
const outputImports = Object.values(built.metafile.outputs).flatMap(output => output.imports ?? []);
const forbiddenReactInputs = inputs.filter(path =>
  /\/node_modules\/(?:react|react-dom)(?:\/|$)/.test(path)
  || /\/compiled-frontend\/frontend\/react\/renderer\.mjs$/.test(path)
  || /\/compiled-frontend\/frontend\/react\/bindings\.mjs$/.test(path));
const forbiddenReactExternalImports = outputImports.filter(item =>
  item.external && /(^|\/)(?:react|react-dom)(?:\/|$)/.test(item.path));
assert.deepEqual(forbiddenReactInputs, [], "DOM-only bundle metafile must not include React packages or adapters");
assert.deepEqual(forbiddenReactExternalImports, [], "DOM-only output must not retain React package imports");
for (const required of [
  modulePath,
  encoderPath,
  join(repoRoot, "compiled-frontend/frontend/dom/renderer.mjs"),
  join(repoRoot, "compiled-frontend/frontend/runtime/runtime.mjs"),
]) {
  assert.ok(inputs.includes(toPosix(resolve(required))), `metafile is missing required input ${required}`);
}
if (metafileOnly) {
  process.stdout.write(`${JSON.stringify({
    result: "metafile-only",
    inputCount: inputs.length,
    forbiddenReactInputs,
    forbiddenReactExternalImports,
    requiredInputs: [modulePath, encoderPath, join(repoRoot, "compiled-frontend/frontend/dom/renderer.mjs"), join(repoRoot, "compiled-frontend/frontend/runtime/runtime.mjs")],
    metafile: metafilePath,
  }, null, 2)}\n`);
  process.exit(0);
}
const sourcePaths = {
  manifest: { path: manifestPath, sha256: await sha256(manifestPath) },
  appIR: { path: appIRPath, sha256: await sha256(appIRPath) },
  module: { path: modulePath, sha256: await sha256(modulePath) },
  encoder: { path: encoderPath, sha256: await sha256(encoderPath) },
  domRenderer: { path: domRendererPath, sha256: await sha256(domRendererPath) },
  runtime: { path: runtimePath, sha256: await sha256(runtimePath) },
  sharedView: { path: sharedViewPath, sha256: await sha256(sharedViewPath) },
  reactMapData: { path: reactMapPath, sha256: await sha256(reactMapPath) },
  proofScript: { path: fileURLToPath(import.meta.url), sha256: await sha256(fileURLToPath(import.meta.url)) },
};
const pinSnapshot = async () => Object.fromEntries(await Promise.all(
  Object.entries(sourcePaths).map(async ([name, file]) => [name, { path: file.path, sha256: await sha256(file.path) }]),
));
const sourcePinsBefore = await pinSnapshot();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!new Set(["index.html", "dom-counter.bundle.mjs"]).has(name)) {
      response.writeHead(404).end("not found");
      return;
    }
    const bytes = await readFile(join(outputRoot, name));
    response.writeHead(200, {
      "content-type": name.endsWith(".mjs") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-length": bytes.length,
    }).end(bytes);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveListen);
});
const address = server.address();
assert.ok(address && typeof address === "object");

let browser;
let runResult;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: chromiumPath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  const networkRequests = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => networkRequests.push(request.url()));
  const response = await page.goto(`http://127.0.0.1:${address.port}/index.html`, { waitUntil: "load" });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.domCounterProof?.ready === true);
  assert.equal(await page.evaluate(() => window.domCounterProof.backend), "dom");
  const frameworkGlobals = await page.evaluate(() => ({
    react: typeof window.React !== "undefined",
    reactDOM: typeof window.ReactDOM !== "undefined",
  }));
  assert.deepEqual(frameworkGlobals, { react: false, reactDOM: false }, "React globals must not exist");

  const steps = [];
  async function sample(label, expectedCount, expectedDisabled) {
    const observed = await page.evaluate(() => window.domCounterProof.sample());
    assert.equal(observed.count, expectedCount, `${label} Go state`);
    assert.equal(observed.resetDisabled, expectedDisabled, `${label} reset disabled property`);
    assert.equal(observed.addDisabled, false, `${label} add enabled property`);
    assert.match(observed.html, new RegExp(`Count: ${expectedCount}`), `${label} live DOM text`);
    steps.push({ label, ...observed });
  }
  await sample("init", 0, true);
  await page.getByRole("button", { name: "+" }).click();
  await sample("add-1", 1, false);
  await page.getByRole("button", { name: "+" }).click();
  await sample("add-2", 2, false);
  await page.getByRole("button", { name: "Reset" }).click();
  await sample("reset", 0, true);

  const guards = await page.evaluate(() => ({
    wasmApiCalls: window.__gobiGuards.wasmApiCalls,
    fetchCalls: window.__gobiGuards.fetchCalls,
    xhrCalls: window.__gobiGuards.xhrCalls,
    wasmRequests: performance.getEntriesByType("resource").map(entry => entry.name).filter(name => /\.wasm(?:$|\?)/i.test(name)),
    pageErrors: window.__gobiPageErrors ?? [],
    unhandledRejections: window.__gobiUnhandled ?? [],
  }));
  assert.deepEqual(guards.wasmApiCalls, [], "no WebAssembly API was attempted");
  assert.deepEqual(guards.fetchCalls, [], "the app made no Fetch request");
  assert.deepEqual(guards.xhrCalls, [], "the app made no XHR request");
  assert.deepEqual(guards.wasmRequests, [], "the page made no WASM resource request");
  assert.deepEqual(guards.pageErrors, []);
  assert.deepEqual(guards.unhandledRejections, []);
  const pageURL = `http://127.0.0.1:${address.port}/index.html`;
  const bundleURL = `http://127.0.0.1:${address.port}/dom-counter.bundle.mjs`;
  assert.deepEqual(networkRequests, [pageURL, bundleURL], "only the static test page and its bundle should be requested");
  assert.deepEqual(networkRequests.filter(url => /\.wasm(?:$|\?)/i.test(url)), []);
  const trace = await page.evaluate(() => window.domCounterProof.sample());
  assert.equal(trace.tickCount, 4, "Init plus Add, Add, Reset are the only application ticks");
  assert.deepEqual(trace.messages, ["add", "add", "reset"]);

  const sourcePinsAfter = await pinSnapshot();
  assert.deepEqual(sourcePinsAfter, sourcePinsBefore, "all pinned proof inputs must remain unchanged across the browser run");

  await page.screenshot({ path: join(outputRoot, "dom-counter.png"), fullPage: true });
  runResult = {
    schema: "gobi.dom-only-counter-independence/v1",
    decision: "passed",
    source: {
      compiledRoot,
      backendManifest: app.backend,
      packagePath: app.packagePath,
      componentId: app.componentId,
      roleBindings: app.roleBindings,
      filesBefore: sourcePinsBefore,
      filesAfter: sourcePinsAfter,
      stableAcrossRun: true,
    },
    bundle: {
      path: bundlePath,
      sha256: await sha256(bundlePath),
      bytes: (await stat(bundlePath)).size,
      metafile: metafilePath,
      metafileSha256: await sha256(metafilePath),
      inputCount: inputs.length,
      reactPackageInputs: inputs.filter(path => /\/node_modules\/(?:react|react-dom)(?:\/|$)/.test(path)),
      reactAdapterInputs: forbiddenReactInputs,
      reactExternalImports: forbiddenReactExternalImports,
      requiredInputs: [modulePath, encoderPath, join(repoRoot, "compiled-frontend/frontend/dom/renderer.mjs"), join(repoRoot, "compiled-frontend/frontend/runtime/runtime.mjs")],
      outputHasReactGlobal: frameworkGlobals.react,
      outputHasReactDOMGlobal: frameworkGlobals.reactDOM,
    },
    browser: {
      chromiumVersion: browser.version(),
      url: `http://127.0.0.1:${address.port}/index.html`,
      steps,
      tickCount: trace.tickCount,
      messages: trace.messages,
      guards,
      networkRequests,
    },
  };
  await writeFile(join(outputRoot, "run.json"), `${JSON.stringify(runResult, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ result: "passed", run: runResult }, null, 2)}\n`);
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
