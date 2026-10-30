#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const BUILD_DIR = resolve(HERE, "build");
const requireFromInteraction = createRequire(resolve(REPO_ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

function parseArgs(argv) {
  const options = { output: resolve(BUILD_DIR, "e4-drop-chromium-probe-reproduced.json") };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--output") options.output = resolve(argv[++index]);
    else if (argv[index] === "--help" || argv[index] === "-h") options.help = true;
    else throw new Error(`unknown option ${argv[index]}`);
  }
  return options;
}

async function startServer(binary) {
  const child = spawn(binary, ["-addr", "127.0.0.1:0", "-root", REPO_ROOT], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  const ready = new Promise((resolveReady, rejectReady) => {
    child.once("error", rejectReady);
    child.once("exit", (code, signal) => rejectReady(new Error(`HTTP lab exited before readiness: code=${code} signal=${signal}\n${stderr}`)));
    lines.once("line", (line) => {
      try {
        const payload = JSON.parse(line);
        if (typeof payload.url !== "string" || !payload.url.startsWith("http://127.0.0.1:")) {
          throw new Error(`invalid readiness URL ${JSON.stringify(payload)}`);
        }
        resolveReady({ child, url: payload.url.replace(/\/$/, ""), line });
      } catch (error) {
        rejectReady(new Error(`invalid HTTP lab readiness line: ${line}\n${error.message}`));
      }
    });
  });
  return ready;
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  child.kill("SIGTERM");
  const killTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
  await exited;
  clearTimeout(killTimer);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node http-effects/harness-drop-probe.mjs [--output PATH]\nUses HTTP_LAB_BIN or http-effects/build/http-lab and CHROMIUM_EXECUTABLE_PATH.");
    return;
  }
  const binary = resolve(process.env.HTTP_LAB_BIN ?? resolve(BUILD_DIR, "http-lab"));
  await stat(binary);
  const server = await startServer(binary);
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    });
    const page = await browser.newPage();
    const postResponses = [];
    const requestFailures = [];
    const consoleErrors = [];
    const target = `${server.url}/api/save?lane=e4dropprobe&mode=drop`;
    page.on("response", (response) => {
      if (response.url() !== target) return;
      postResponses.push({ method: response.request().method(), url: response.url(), status: response.status(), statusText: response.statusText() });
    });
    page.on("requestfailed", (request) => {
      if (request.url() !== target) return;
      requestFailures.push({ method: request.method(), url: request.url(), failure: request.failure()?.errorText ?? "unknown" });
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push({ text: message.text(), location: message.location() });
    });
    await page.goto(server.url, { waitUntil: "load" });
    const observation = await page.evaluate(async (base) => {
      const url = `${base}/api/save?lane=e4dropprobe&mode=drop`;
      const fetchResult = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ID: 1, Value: "drop probe" }),
        mode: "same-origin",
        credentials: "same-origin",
        redirect: "error",
      }).then(async (response) => {
        try {
          return { status: response.status, statusText: response.statusText, body: await response.text() };
        } catch (error) {
          return { status: response.status, statusText: response.statusText, bodyError: String(error) };
        }
      }).catch((error) => ({ fetchError: String(error) }));
      await new Promise(requestAnimationFrame);
      const records = await (await fetch(`${base}/api/requests?lane=e4dropprobe`, { cache: "no-store" })).json();
      return { fetchResult, records };
    }, server.url);
    const record = observation.records?.requests?.[0] ?? null;
    assert.equal(observation.records?.requests?.length, 1, "drop must retain exactly one request record");
    assert.equal(record?.State, "dropped");
    assert.equal(record?.Status, 200);
    assert.equal(record?.CancelObserved, false);
    assert.equal(observation.fetchResult?.status, 200, "browser must receive the response headers");
    assert.match(observation.fetchResult?.bodyError ?? "", /Failed to fetch/, "body consumption must fail as a network error");
    assert.equal(postResponses.length, 1, "browser must not replay the POST after receiving response headers");
    assert.equal(postResponses[0]?.status, 200);
    assert.ok(requestFailures.some((failure) => failure.failure === "net::ERR_CONTENT_LENGTH_MISMATCH"),
      "Chromium must observe the intentionally truncated body");
    assert.ok(!postResponses.some((response) => response.status === 409), "drop must not become duplicate-ID conflict");

    const evidence = {
      command: "CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node http-effects/harness-drop-probe.mjs --output http-effects/build/e4-drop-chromium-probe-reproduced.json",
      serverBinary: binary,
      readiness: server.line,
      browserVersion: browser.version(),
      observation,
      postResponses,
      requestFailures,
      consoleErrors,
      assertions: {
        oneRetainedDroppedRecord: true,
        headersStatus200ThenBodyNetworkError: true,
        noDuplicateConflictReplay: true,
      },
    };
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, JSON.stringify(evidence, null, 2));
    console.log(`Chromium drop probe passed; evidence: ${options.output}`);
  } finally {
    if (browser) await browser.close();
    await stopServer(server.child);
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
