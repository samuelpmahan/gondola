import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../interaction/node_modules/playwright/index.mjs";
import { installNoWasmGuards } from "../../compiled-frontend/conformance/no-wasm.mjs";
import { chromiumLaunchOptions } from "../../compiled-frontend/conformance/browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const args = new Map();
for (let i = 0; i < process.argv.length - 2; i += 1) {
  const key = process.argv[i + 2];
  if (!key.startsWith("--") || args.has(key) || !process.argv[i + 3] || process.argv[i + 3].startsWith("--")) {
    throw new Error(`invalid or duplicate argument near ${key}`);
  }
  args.set(key, process.argv[i + 3]);
  i += 1;
}
for (const key of ["--site", "--output"]) if (!args.has(key)) throw new Error(`missing ${key}`);
const site = resolve(args.get("--site"));
const output = resolve(args.get("--output"));
const chromiumPath = args.get("--chromium") ?? process.env.CHROMIUM_PATH ?? process.env.CHROMIUM_EXECUTABLE_PATH ?? null;

async function serve() {
  const root = await realpath(site);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const name = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const path = resolve(root, name);
    if (!path.startsWith(root + sep)) { response.writeHead(400).end("invalid path"); return; }
    const type = new Map([[".html", "text/html"], [".css", "text/css"], [".mjs", "text/javascript"]]).get(extname(path));
    const stream = createReadStream(path);
    stream.once("error", () => { if (!response.headersSent) response.writeHead(404); response.end("not found"); });
    response.writeHead(200, { "content-type": `${type ?? "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    stream.pipe(response);
  });
  await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

const checks = [];
const check = (name, okay, detail = "") => {
  if (!okay) throw new Error(`${name}: ${detail || "assertion failed"}`);
  checks.push({ name, passed: true, detail });
};
let browser;
let page;
let server;
const pageErrors = [];
const view = () => page.locator("#go-view").innerText();
const click = (label) => page.getByRole("button", { name: label, exact: true }).click();

try {
  await mkdir(dirname(output), { recursive: true });
  server = await serve();
  browser = await chromium.launch(chromiumLaunchOptions(chromiumPath));
  page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const guard = await installNoWasmGuards(page);
  await page.goto(server.url, { waitUntil: "load", timeout: 20000 });
  await page.locator("#status[data-state='ready']").waitFor({ timeout: 20000 });
  await page.waitForFunction(() => typeof window.publicationsDemo?.runtime?.snapshot === "function", null, { timeout: 20000 });
  check("HTTP demo served and compiled Go module mounted", true, server.url);

  let text = await view();
  check("initial parent input and keyed children render", text.includes("input step=1 locked=false revision=1") && text.includes("Child oak") && text.includes("Child elm"));
  await click("Set input step 3");
  await page.locator("#go-view").getByText(/input step=3 locked=false revision=2/).waitFor();
  await click("Add to oak");
  await page.locator("#go-view").getByText(/Child oak .*count=3/).waitFor();
  check("typed input drives the Go child counter", true, "step=3 produced count=3");
  await click("Capture oak");
  await page.getByRole("button", { name: "Deliver #1 oak value=3", exact: true }).waitFor();
  await click("Add to oak");
  await page.locator("#go-view").getByText(/Child oak .*count=6/).waitFor();
  check("publication payload stays captured while the live counter changes", (await view()).includes("Deliver #1 oak value=3"));

  await click("Lock input");
  await page.locator("#go-view").getByText(/input step=3 locked=true revision=3/).waitFor();
  const beforeDisabledClick = await view();
  const add = page.getByRole("button", { name: "Add to oak", exact: true });
  check("locked Go view disables add and capture", await add.isDisabled() && await page.getByRole("button", { name: "Capture oak", exact: true }).isDisabled());
  await add.evaluate((element) => element.click());
  check("browser suppresses disabled counter click", (await view()) === beforeDisabledClick);
  await click("Unlock input");
  await page.locator("#go-view").getByText(/input step=3 locked=false revision=4/).waitFor();
  await click("Deliver #1 oak value=3");
  await page.locator("#go-view").getByText("Last decision: rejected:stale-input:1", { exact: true }).waitFor();
  check("stale input revision rejects delayed publication", (await view()).includes("Accepted=0 Rejected=1"));
  await click("Capture oak");
  await page.getByRole("button", { name: "Deliver #2 oak value=6", exact: true }).waitFor();
  await click("Deliver #2 oak value=6");
  await page.locator("#go-view").getByText("Last decision: accepted:oak:2", { exact: true }).waitFor();
  check("current revision accepts captured publication", (await view()).includes("Published oak value=6"));

  await click("Capture oak");
  await page.getByRole("button", { name: "Deliver #3 oak value=6", exact: true }).waitFor();
  await page.locator("[data-renderer='react']").click();
  await page.waitForFunction(() => window.publicationsDemo?.backend === "react");
  check("React renderer swap preserves Go publication queue", (await view()).includes("Deliver #3 oak value=6"));
  await page.locator("#reject-incompatible").click();
  check("incompatible renderer is rejected and active React view stays live", await page.locator("#active-renderer").innerText() === "Renderer: React" && (await view()).includes("Deliver #3 oak value=6"));
  await click("Deliver #3 oak value=6");
  await page.locator("#go-view").getByText("Last decision: accepted:oak:3", { exact: true }).waitFor();

  await click("Request parent");
  await page.waitForFunction(() => window.publicationsDemo.pending.length === 1);
  await page.locator("[data-renderer='dom']").click();
  await page.waitForFunction(() => window.publicationsDemo?.backend === "dom" && window.publicationsDemo.pending.length === 1);
  check("DOM renderer swap preserves pending host request", true);
  await page.locator("#reject-incompatible").click();
  check("rejected renderer preserves current renderer and pending request", await page.locator("#active-renderer").innerText() === "Renderer: DOM" && await page.locator("#pending-count").innerText() === "1 pending reply");
  await page.locator("[data-deliver-token]").click();
  await page.waitForFunction(() => window.publicationsDemo.pending.length === 0);
  check("manual host reply completes Go request", await page.locator("#pending-count").innerText() === "No pending replies");
  await click("Request parent");
  await page.waitForFunction(() => window.publicationsDemo.pending.length === 1);
  await click("Remove parent");
  await page.waitForFunction(() => window.publicationsDemo.pending.length === 0 && window.publicationsDemo.hostRecords.some((record) => record.kind === "cancel"));
  check("removing parent cancels outstanding host request", true);
  await page.locator(".host-replies details summary").click();
  await page.locator("[data-stale-token]").click();
  check("cancelled host reply is rejected", await page.locator("#host-action-status").getAttribute("data-state") === "rejected");
  await click("Remount parent");
  await page.locator("#go-view").getByText(/Parent generation 4/).waitFor();
  check("parent remount starts a fresh Go-owned lifetime", true);
  await click("Add oak");
  await page.locator("#go-view").getByText(/Child oak generation 5; count=0/).waitFor();
  await click("Add to oak");
  await page.locator("#go-view").getByText(/Child oak generation 5; count=3/).waitFor();
  await click("Capture oak");
  await page.getByRole("button", { name: "Deliver #4 oak value=3", exact: true }).waitFor();
  check("fresh remounted parent accepts new child and queues a Go publication", true);

  const noWasm = await guard.assertClear();
  check("all ten no-WASM hooks are observable", noWasm.guardCoverage.status === "complete" && noWasm.guardCoverage.entries.length === 10 && noWasm.guardCoverage.failures.length === 0);
  check("no WASM request or API attempt occurred", noWasm.wasmRequests.length === 0 && noWasm.wasmAPIAttempts.length === 0);
  check("browser has no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
  const screenshot = join(dirname(output), "demo-final.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  const image = await readFile(screenshot);
  const result = {
    schema: "gobi.compiled-publications-demo-smoke/v1",
    status: "passed",
    checks,
    checkCount: checks.length,
    browser: await browser.version(),
    playwright: JSON.parse(await readFile(resolve(ROOT, "interaction/node_modules/playwright/package.json"), "utf8")).version,
    noWasm,
    pageErrors,
    screenshot: { path: screenshot, bytes: image.length, sha256: digest(image) },
  };
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failed = { schema: "gobi.compiled-publications-demo-smoke-failure/v1", status: "failed", checks,
    error: { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null }, pageErrors };
  await writeFile(`${output}.failed.json`, `${JSON.stringify(failed, null, 2)}\n`, { flag: "wx" });
  throw error;
} finally {
  if (page) await page.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise((done) => server.server.close(done));
}
