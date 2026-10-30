// Read-only review probe for host-side input admission. It starts a local
// reverse proxy over the demo server so the browser loads a freshly compiled
// current bridge from /tmp instead of changing the shared build artifact.
import { createReadStream } from "node:fs";
import { createServer, request } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const wasmPath = "/tmp/host-admission/composition.wasm";
const upstreamPort = Number(process.env.HOST_ADMISSION_UPSTREAM_PORT ?? 8000);
const { chromium } = await import(pathToFileURL(resolve(root, "interaction/node_modules/playwright/index.mjs")).href);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const proxy = createServer((incoming, outgoing) => {
  if (incoming.url === "/typed-composition/build/composition.wasm") {
    outgoing.writeHead(200, {
      "content-type": "application/wasm",
      "content-length": String((awaitStatSize)),
      "cache-control": "no-store",
    });
    createReadStream(wasmPath).pipe(outgoing);
    return;
  }
  const forwarded = request({
    hostname: "127.0.0.1",
    port: upstreamPort,
    path: incoming.url,
    method: incoming.method,
    headers: { ...incoming.headers, host: `127.0.0.1:${upstreamPort}` },
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  forwarded.on("error", (error) => {
    outgoing.writeHead(502, { "content-type": "text/plain" });
    outgoing.end(String(error));
  });
  incoming.pipe(forwarded);
});

const wasmBytes = await readFile(wasmPath);
const awaitStatSize = wasmBytes.length;
const lab = spawn(resolve(root, "http-effects/build/http-lab"), [
  "-addr", `127.0.0.1:${upstreamPort}`, "-root", root,
], { stdio: ["ignore", "pipe", "pipe"] });
let labOutput = "";
lab.stdout.setEncoding("utf8").on("data", (chunk) => { labOutput += chunk; });
lab.stderr.setEncoding("utf8").on("data", (chunk) => { labOutput += chunk; });
for (let attempt = 0; attempt < 100; attempt += 1) {
  try {
    const ready = await fetch(`http://127.0.0.1:${upstreamPort}/typed-composition/demo.html`);
    if (ready.ok) break;
    throw new Error(`http-lab readiness returned HTTP ${ready.status}`);
  } catch (error) {
    if (lab.exitCode !== null) throw new Error(`http-lab exited before readiness: ${labOutput}`);
    if (attempt === 99) throw new Error(`http-lab did not become ready: ${String(error)} ${labOutput}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
}
const port = await new Promise((resolvePort, reject) => {
  proxy.once("error", reject);
  proxy.listen(0, "127.0.0.1", () => resolvePort(proxy.address().port));
});

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/tmp/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/typed-composition/demo.html`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => Boolean(globalThis.__typedCompositionDemo), null, { timeout: 20000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      demoAvailable: Boolean(globalThis.__typedCompositionDemo),
      errorText: document.querySelector("#error")?.textContent,
      liveCountText: document.querySelector("#live-count")?.textContent,
    }));
    throw new Error(`${String(error)}; browser state=${JSON.stringify(state)}`);
  }

  const observations = await page.evaluate(async () => {
    const demo = globalThis.__typedCompositionDemo;
    const { parent: parentID, child: childID } = demo.initialIDs;
    const summarize = () => ({
      list: demo.manager.list(),
      managerTree: demo.manager.tree(),
      hostTree: demo.host.tree(),
      childSnapshot: demo.manager.snapshot(childID),
    });
    const before = summarize();

    const symbol = Symbol("unrecognized");
    const symbolInput = { Title: "symbol-normalized-by-host", ReadOnly: false };
    symbolInput[symbol] = "unexpected own symbol";
    const symbolInputShape = {
      ownKeys: Reflect.ownKeys(symbolInput).map((key) => typeof key === "symbol" ? `[symbol:${key.description}]` : key),
      enumerableOwnStringKeys: Object.keys(symbolInput),
      symbolOwnKeyCount: Reflect.ownKeys(symbolInput).filter((key) => typeof key === "symbol").length,
    };
    let directBridgeError = null;
    try { demo.manager.setChildInputs(parentID, childID, symbolInput); }
    catch (error) { directBridgeError = String(error?.message ?? error); }
    const afterDirectBridge = summarize();

    let hostSymbolError = null;
    try { demo.host.setChildInputs(parentID, childID, symbolInput); }
    catch (error) { hostSymbolError = String(error?.message ?? error); }
    await demo.host.settled();
    const afterHostSymbol = summarize();

    let getterCalls = 0;
    let nestedCreatedID = null;
    const accessorInput = {};
    Object.defineProperty(accessorInput, "Title", {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        nestedCreatedID = globalThis.gobiComposition.create();
        return 7;
      },
    });
    Object.defineProperty(accessorInput, "ReadOnly", {
      enumerable: true,
      configurable: true,
      value: false,
      writable: true,
    });
    const accessorInputShape = {
      ownKeys: Reflect.ownKeys(accessorInput).map(String),
      titleIsGetter: typeof Object.getOwnPropertyDescriptor(accessorInput, "Title").get === "function",
      titleEnumerable: Object.getOwnPropertyDescriptor(accessorInput, "Title").enumerable,
      readOnlyIsDataProperty: Object.hasOwn(Object.getOwnPropertyDescriptor(accessorInput, "ReadOnly"), "value"),
    };
    const beforeAccessor = summarize();
    let accessorHostError = null;
    try { demo.host.setChildInputs(parentID, childID, accessorInput); }
    catch (error) { accessorHostError = String(error?.message ?? error); }
    const afterAccessor = summarize();

    return {
      initialIDs: { parentID, childID },
      before,
      symbolInputShape,
      directBridgeError,
      afterDirectBridge,
      hostSymbolError,
      afterHostSymbol,
      accessorInputShape,
      beforeAccessor,
      getterCalls,
      nestedCreatedID,
      accessorHostError,
      afterAccessor,
    };
  });

  const hostBytes = await readFile(resolve(root, "typed-composition/host.mjs"));
  const bridgeBytes = await readFile(resolve(root, "cmd/composition-wasm/main_wasm.go"));
  const decoderBytes = await readFile(resolve(root, "cmd/composition-wasm/bridge_decode.go"));
  process.stdout.write(`${JSON.stringify({
    url: `http://127.0.0.1:${port}/typed-composition/demo.html`,
    actualDemo: "typed-composition/demo.html",
    bridgeArtifact: wasmPath,
    hashes: {
      compositionWasm: sha256(wasmBytes),
      hostModule: sha256(hostBytes),
      bridgeSource: sha256(bridgeBytes),
      decoderSource: sha256(decoderBytes),
    },
    observations,
    pageErrors,
  }, null, 2)}\n`);
} finally {
  await browser?.close();
  await new Promise((resolveClose) => proxy.close(resolveClose));
  lab.kill("SIGTERM");
}
