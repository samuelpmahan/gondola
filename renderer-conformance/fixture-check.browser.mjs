#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const LAB = resolve(REPO_ROOT, "http-effects/build/http-lab");
const requireFromInteraction = createRequire(resolve(REPO_ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

function startLab() {
  const child = spawn(LAB, ["-addr", "127.0.0.1:0", "-root", REPO_ROOT], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const ready = new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error("fixture browser server readiness timed out")), 10_000);
    lines.once("line", (line) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(line);
        if (typeof result.url !== "string") throw new Error("readiness record has no url");
        resolveReady(result.url);
      } catch (error) {
        rejectReady(new Error(`invalid readiness line ${JSON.stringify(line)}: ${error.message}`));
      }
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      rejectReady(new Error(`fixture browser server exited before readiness (code=${code}, signal=${signal}): ${stderr}`));
    });
  });
  return { child, lines, ready };
}

async function main() {
  const { child: server, lines, ready } = startLab();
  let browser;
  try {
    const baseURL = await ready;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await page.goto(`${baseURL}/renderer-conformance/fixtures.html`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__fixtureCheckDone === true, null, { timeout: 120_000 });
    const failure = await page.evaluate(() => window.__fixtureCheckError);
    assert.equal(failure, null, failure ?? "browser fixture run failed");
    assert.deepEqual(pageErrors, [], `browser fixture page reported errors: ${pageErrors.join("\n")}`);
    const result = await page.evaluate(() => window.__fixtureCheckResult);
    assert.equal(result?.positiveFixtures > 0, true, "fixture browser runner rendered no positive snapshots");
    assert.equal(result?.backendRenderCount, result.positiveFixtures * 3,
      "each positive snapshot must render through DOM, React, and Go DOM");
    assert.equal(result?.negativeAtomicityChecks, result.objectNegativeFixtures * 3,
      "each browser-object negative must be rejected atomically by all three candidates");
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    if (browser) await browser.close();
    lines.close();
    server.kill("SIGTERM");
    await new Promise((resolveExit) => {
      if (server.exitCode !== null || server.signalCode !== null) return resolveExit();
      server.once("exit", resolveExit);
    });
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
