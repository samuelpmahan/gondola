import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

function args(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--") || values.has(name) || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new Error(`invalid or duplicate argument near ${name}`);
    }
    values.set(name, argv[++index]);
  }
  for (const name of ["--site", "--output"]) if (!values.has(name)) throw new Error(`missing ${name} <value>`);
  return {
    site: resolve(values.get("--site")),
    output: resolve(values.get("--output")),
    chromium: values.has("--chromium") ? resolve(values.get("--chromium")) : null,
  };
}

const options = args(process.argv.slice(2));
const viewerData = JSON.parse(await readFile(join(options.site, "viewer-data.json"), "utf8"));
if (viewerData.schema !== "gobi.backend-qualification-viewer-data/v1" || viewerData.cases?.length !== 13) {
  throw new Error("demo input is missing the thirteen pinned qualification cases");
}
const { chromium } = await import(pathToFileURL(join(process.cwd(), "interaction/node_modules/playwright/index.mjs")).href);
const chromiumPath = options.chromium ?? chromium.executablePath();
const mime = new Map([[".css", "text/css"], [".html", "text/html"], [".mjs", "text/javascript"], [".json", "application/json"]]);
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const candidate = resolve(options.site, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!candidate.startsWith(options.site + sep)) { response.writeHead(400).end("invalid path"); return; }
  createReadStream(candidate)
    .once("error", () => { if (!response.headersSent) response.writeHead(404); response.end("not found"); })
    .on("open", () => response.writeHead(200, { "content-type": `${mime.get(extname(candidate)) ?? "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" }))
    .pipe(response);
});

await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveListen);
});
const address = server.address();
const pageErrors = [];
let browser;
let page;
const checks = [];
function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`demo smoke failed: ${name}${detail ? ` (${detail})` : ""}`);
}

try {
  browser = await chromium.launch({ executablePath: chromiumPath, headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error?.message ?? error)));
  const url = `http://127.0.0.1:${address.port}/`;
  const response = await page.goto(url, { waitUntil: "networkidle" });
  check("HTTP demo served", response?.ok() === true, String(response?.status()));
  await page.waitForSelector("tr.case-row", { timeout: 10000 });
  check("Go certificate verdict is rendered", (await page.locator("#verdict").textContent())?.trim() === (viewerData.certificate.qualified ? "QUALIFIED" : "NOT QUALIFIED"));
  check("all thirteen real cases are rendered", await page.locator("tr.case-row").count() === 13);
  check("source commit is rendered", (await page.locator("#source-commit").textContent())?.includes(viewerData.sourceCommit));

  const rendered = await page.locator("tr.case-row").evaluateAll((rows) => rows.map((row) => ({
    id: row.dataset.caseId,
    text: row.innerText,
    columns: [...row.querySelectorAll("td")].map((cell) => cell.innerText),
  })));
  const certById = new Map(viewerData.certificate.results.map((result) => [result.id, result]));
  const rawById = new Map(viewerData.cases.map((item) => [item.raw.id, item]));
  check("rendered case IDs match Go certificate", rendered.length === certById.size && rendered.every((row) => certById.has(row.id)));
  check("each rendered verdict comes from the Go certificate", rendered.every((row) => {
    const result = certById.get(row.id);
    const raw = rawById.get(row.id)?.raw;
    const expectedLabel = raw?.fault === "none"
      ? result.passed ? "Baseline matched" : "Baseline failed"
      : result.passed ? "Fault detected" : "Fault escaped";
    return row.columns[7].includes(expectedLabel);
  }));

  const healthy = [...rawById.values()].filter((item) => item.raw.fault === "none");
  const faulted = [...rawById.values()].filter((item) => item.raw.fault !== "none");
  check("three healthy captures have complete event traces", healthy.length === 3 && healthy.every((item) =>
    item.raw.activated === false && item.raw.activationCount === 0 && item.raw.eventsObserved === 50 && item.raw.traceTicks === 46));
  check("ten fault captures were activated on mounted backends", faulted.length === 10 && faulted.every((item) => item.raw.activated === true && item.raw.activationCount >= 1));
  check("faults are qualified by observed expected channels", faulted.every((item) => {
    const certificate = certById.get(item.raw.id);
    return certificate?.passed === true && certificate.expectedChannels.some((channel) => item.raw.observedChannels.includes(channel));
  }));
  check("no case contains infrastructure or page errors", viewerData.cases.every((item) =>
    (item.raw.infrastructureErrors?.length ?? 0) === 0 && (item.raw.pageErrors?.length ?? 0) === 0));
  check("case details expose actual evidence", await page.locator("details summary").count() === 13);
  check("no browser page errors", pageErrors.length === 0, pageErrors.join("; "));

  const result = {
    schema: "gobi.backend-qualification-demo-smoke/v1",
    status: "passed",
    url,
    browser: chromiumPath,
    sourceCommit: viewerData.sourceCommit,
    qualified: viewerData.certificate.qualified === true,
    caseCount: viewerData.cases.length,
    healthyCases: healthy.length,
    activatedFaultCases: faulted.length,
    checks,
    checkCount: checks.length,
    pageErrors,
  };
  await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await page?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await new Promise((resolveClose) => server.close(resolveClose));
}
