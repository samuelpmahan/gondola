#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const labPath = resolve(HERE, "build/http-lab");
const requireFromInteraction = createRequire(resolve(REPO_ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

function startLab() {
  const child = spawn(labPath, ["-addr", "127.0.0.1:0", "-root", REPO_ROOT], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const ready = new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error("HTTP lab readiness timed out")), 10_000);
    lines.once("line", (line) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(line);
        if (typeof result.url !== "string") throw new Error("readiness record has no url");
        resolveReady(result.url);
      } catch (error) {
        rejectReady(new Error(`invalid HTTP lab readiness line ${JSON.stringify(line)}: ${error.message}`));
      }
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      rejectReady(new Error(`HTTP lab exited before readiness (code=${code}, signal=${signal}): ${stderr}`));
    });
  });
  return { child, lines, ready };
}

async function waitForState(page, expected) {
  await page.waitForFunction((want) => {
    try {
      const state = JSON.parse(document.getElementById("runtime-snapshot").textContent).state;
      return Object.entries(want).every(([key, value]) => state[key] === value);
    } catch {
      return false;
    }
  }, expected, { timeout: 10_000 });
  const observation = await page.evaluate(() => {
    const runtime = JSON.parse(document.getElementById("runtime-snapshot").textContent);
    const audit = JSON.parse(document.getElementById("completion-audit").textContent);
    const transport = JSON.parse(document.getElementById("transport-log").textContent);
    const rendered = JSON.parse(document.getElementById("dom-snapshot").textContent);
    const root = document.getElementById("editor-root");
    const input = root.querySelector('input[type="text"]');
    return {
      state: runtime.state,
      audit,
      transport,
      rendered,
      actualHTML: root.innerHTML,
      inputValue: input?.value ?? null,
      error: document.getElementById("error").hidden ? null : document.getElementById("error").textContent,
    };
  });
  assert.equal(observation.rendered.html, observation.actualHTML, "renderer report must match live HTML");
  assert.equal(observation.inputValue, observation.state.Draft, "controlled input value must match Go Draft");
  assert.equal(observation.error, null, "demo must not show an uncaught browser error");
  return observation;
}

async function waitForServerRecord(page, lane, id, predicate) {
  await page.waitForFunction(async ({ expectedLane, expectedID, testName }) => {
    const response = await fetch(`/api/requests?lane=${encodeURIComponent(expectedLane)}`, { cache: "no-store" });
    if (!response.ok) return false;
    const result = await response.json();
    const record = result.requests?.find((entry) => entry.ID === expectedID);
    if (!record) return false;
    if (testName === "held") return record.State === "held";
    if (testName === "completed") return record.State === "completed";
    if (testName === "cancelled") return record.State === "cancelled" && record.CancelObserved === true;
    return false;
  }, { expectedLane: lane, expectedID: id, testName: predicate }, { timeout: 10_000 });
  return page.evaluate(async ({ expectedLane, expectedID }) => {
    const response = await fetch(`/api/requests?lane=${encodeURIComponent(expectedLane)}`, { cache: "no-store" });
    const result = await response.json();
    return result.requests.find((entry) => entry.ID === expectedID);
  }, { expectedLane: lane, expectedID: id });
}

function say(label, observation) {
  const { state } = observation;
  console.log(`PASS ${label}: backend=${observation.rendered.backend}, status=${state.Status}, ` +
    `pending=${state.PendingID}, saved=${JSON.stringify(state.Saved)}, audit=${observation.audit.length}`);
}

async function main() {
  const lab = startLab();
  let browser;
  try {
    const baseURL = await lab.ready;
    const lane = `smoke-${randomUUID()}`;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await page.goto(`${baseURL}/http-effects/demo.html?lane=${encodeURIComponent(lane)}`, { waitUntil: "load" });
    await page.waitForFunction(() => document.getElementById("active-backend")?.textContent === "dom", null, {
      timeout: 30_000,
    });

    const input = page.locator('#editor-root input[type="text"]');
    const mode = page.locator("#next-mode");
    const save = page.locator("#editor-root button.save");
    const observe = (state) => waitForState(page, state);

    let current = await observe({ Draft: "", Saved: "", Saves: 0, NextID: 0, PendingID: 0, Status: "idle" });
    say("initial Go editor", current);

    await input.fill("held across renderer swap");
    await mode.selectOption("held");
    await save.click();
    current = await observe({ Draft: "held across renderer swap", NextID: 1, PendingID: 1, Status: "pending" });
    const held = await waitForServerRecord(page, lane, 1, "held");
    assert.equal(held.Value, "held across renderer swap");
    await page.locator('[data-backend="react"]').click();
    current = await observe({ Draft: "held across renderer swap", NextID: 1, PendingID: 1, Status: "pending" });
    assert.equal(current.rendered.backend, "react");
    assert.equal(current.actualHTML, current.rendered.html, "React renderer report must match the live DOM");
    assert.ok(current.transport.some((event) => event.Kind === "start" && event.ID === 1 &&
      event.Value === "held across renderer swap"), "visible transport log must show the held HTTP start");
    assert.equal(current.audit.length, 0, "pending request must not have a completion audit yet");
    const screenshotPath = resolve(HERE, "build/demo-pending-swap.png");
    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`PASS captured pending-request DOM→React swap screenshot: ${screenshotPath}`);
    say("real held request survives renderer swap", current);

    await page.locator("#refresh-requests").click();
    await page.locator('[data-release-id="1"][data-release-mode="success"]').click();
    current = await observe({ Saved: "held across renderer swap", Saves: 1, PendingID: 0, Status: "saved" });
    assert.ok(current.audit.some((entry) => entry.ID === 1 && entry.Accepted && entry.Reason === "saved"));
    say("released HTTP response is accepted after swap", current);

    await input.fill("retry after server error");
    await mode.selectOption("error");
    await save.click();
    const errorRecord = await waitForServerRecord(page, lane, 2, "completed");
    assert.equal(errorRecord.Error, "server rejected");
    current = await observe({ Draft: "retry after server error", Saved: "held across renderer swap", Saves: 1, NextID: 2, PendingID: 0, Status: "error: server rejected" });
    assert.ok(current.audit.some((entry) => entry.ID === 2 && entry.Accepted && entry.Reason === "error"));
    say("server error preserves the previous saved value", current);

    await mode.selectOption("success");
    await save.click();
    current = await observe({ Draft: "retry after server error", Saved: "retry after server error", Saves: 2, NextID: 3, PendingID: 0, Status: "saved" });
    await waitForServerRecord(page, lane, 3, "completed");
    say("retry uses a fresh ID and succeeds over HTTP", current);

    await input.fill("retry after malformed response");
    await mode.selectOption("malformed");
    await save.click();
    const malformedRecord = await waitForServerRecord(page, lane, 4, "completed");
    assert.equal(malformedRecord.ResultMode, "malformed");
    current = await observe({ Draft: "retry after malformed response", Saved: "retry after server error", Saves: 2, NextID: 4, PendingID: 0, Status: "error: invalid response" });
    assert.ok(current.audit.some((entry) => entry.ID === 4 && entry.Error === "invalid response" && entry.Accepted));
    say("malformed HTTP body becomes a typed error", current);

    await mode.selectOption("success");
    await save.click();
    current = await observe({ Draft: "retry after malformed response", Saved: "retry after malformed response", Saves: 3, NextID: 5, PendingID: 0, Status: "saved" });
    await waitForServerRecord(page, lane, 5, "completed");
    say("malformed response retry succeeds", current);

    await input.fill("abort this held fetch");
    await mode.selectOption("held");
    await save.click();
    current = await observe({ Draft: "abort this held fetch", NextID: 6, PendingID: 6, Status: "pending" });
    await waitForServerRecord(page, lane, 6, "held");
    await page.locator("#editor-root button.cancel").click();
    current = await observe({ Draft: "abort this held fetch", NextID: 6, PendingID: 0, Status: "cancelled" });
    const canceled = await waitForServerRecord(page, lane, 6, "cancelled");
    assert.equal(canceled.CancelObserved, true);
    assert.ok(current.transport.some((event) => event.Kind === "cancel" && event.ID === 6));
    assert.ok(!current.transport.some((event) => event.Kind === "reply" && event.ID === 6));
    say("cancel aborts the pending fetch and is recorded by the server", current);

    assert.deepEqual(pageErrors, [], `browser errors:\n${pageErrors.join("\n")}`);
    console.log("HTTP effects demo smoke passed: held HTTP release, pending renderer swap, server error and retry, malformed reply and retry, and observed fetch abort.");
    await page.close();
  } finally {
    if (browser) await browser.close();
    lab.lines.close();
    if (lab.child.exitCode === null) {
      lab.child.kill("SIGTERM");
      await new Promise((resolveExit) => {
        lab.child.once("exit", resolveExit);
        setTimeout(resolveExit, 2_000).unref();
      });
    }
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
