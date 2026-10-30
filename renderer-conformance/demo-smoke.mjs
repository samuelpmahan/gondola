#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const labPath = resolve(ROOT, "http-effects/build/http-lab");
const requireFromInteraction = createRequire(resolve(ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

function startLab() {
  const child = spawn(labPath, ["-addr", "127.0.0.1:0", "-root", ROOT], {
    cwd: ROOT,
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

async function state(page) {
  return page.evaluate(() => JSON.parse(document.getElementById("runtime-snapshot").textContent).state);
}

async function waitForRows(page, expectedIDs) {
  await page.waitForFunction((ids) => {
    try {
      const rows = JSON.parse(document.getElementById("runtime-snapshot").textContent).state.Rows;
      return Array.isArray(rows) && JSON.stringify(rows.map(({ ID }) => ID)) === JSON.stringify(ids);
    } catch {
      return false;
    }
  }, expectedIDs, { timeout: 10_000 });
  return state(page);
}

async function waitForRow(page, rowID, expected) {
  await page.waitForFunction(({ id, want }) => {
    try {
      const rows = JSON.parse(document.getElementById("runtime-snapshot").textContent).state.Rows;
      const row = rows.find((entry) => entry.ID === id);
      return row && Object.entries(want).every(([key, value]) => row[key] === value);
    } catch {
      return false;
    }
  }, { id: rowID, want: expected }, { timeout: 10_000 });
}

async function waitForServerRecord(page, lane, id, stateName, predicate = () => true) {
  await page.waitForFunction(async ({ lane: expectedLane, id: expectedID, stateName: expectedState }) => {
    try {
      const response = await fetch(`/api/requests?lane=${encodeURIComponent(expectedLane)}`, { cache: "no-store" });
      if (!response.ok) return false;
      const result = await response.json();
      const record = result.requests?.find((entry) => entry.ID === expectedID);
      if (!record) return false;
      if (expectedState && record.State !== expectedState) return false;
      return true;
    } catch {
      return false;
    }
  }, { lane, id, stateName }, { timeout: 10_000 });
  const record = await page.evaluate(async ({ expectedLane, expectedID }) => {
    const response = await fetch(`/api/requests?lane=${encodeURIComponent(expectedLane)}`, { cache: "no-store" });
    const result = await response.json();
    return result.requests.find((entry) => entry.ID === expectedID);
  }, { expectedLane: lane, expectedID: id });
  assert.ok(predicate(record), `unexpected server record: ${JSON.stringify(record)}`);
  return record;
}

async function verifySnapshotView(page) {
  try {
    await page.waitForFunction(() => {
      try {
        const root = document.getElementById("editor-root");
        const view = JSON.parse(document.getElementById("dom-snapshot").textContent);
        return view.actualHTML === root.innerHTML && view.html === root.innerHTML;
      } catch {
        return false;
      }
    }, null, { timeout: 5_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      backend: document.getElementById("active-backend").textContent,
      runtime: JSON.parse(document.getElementById("runtime-snapshot").textContent),
      live: document.getElementById("editor-root").innerHTML,
      panel: JSON.parse(document.getElementById("dom-snapshot").textContent),
      renderer: window.__keyedCollectionDemo.host.domSnapshot(),
    }));
    throw new Error(`${error.message}\n${JSON.stringify(diagnostic, null, 2)}`);
  }
  const observation = await page.evaluate(() => {
    const snapshot = JSON.parse(document.getElementById("runtime-snapshot").textContent);
    const actualHTML = document.getElementById("editor-root").innerHTML;
    const rendered = JSON.parse(document.getElementById("dom-snapshot").textContent);
    const keys = JSON.parse(document.getElementById("key-snapshot").textContent);
    const bindings = JSON.parse(document.getElementById("binding-snapshot").textContent);
    const audit = JSON.parse(document.getElementById("completion-audit").textContent);
    const goAudit = window.__keyedCollectionDemo.host.audit();
    return { snapshot, actualHTML, rendered, keys, bindings, audit, goAudit };
  });
  assert.equal(observation.rendered.actualHTML, observation.actualHTML, "live DOM must be inspectable in the snapshot panel");
  assert.equal(observation.rendered.html, observation.actualHTML, "renderer HTML must equal the live root");
  const treeKeys = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.Key) treeKeys.push(node.Key);
    if (Array.isArray(node.Kids)) node.Kids.forEach(visit);
  };
  visit(observation.snapshot.tree);
  assert.deepEqual(observation.keys.map(({ key }) => key), treeKeys, "the key panel must inspect the Go tree keys in order");
  assert.deepEqual(observation.bindings, observation.snapshot.bindings, "the binding panel must match Go JSON");
  assert.deepEqual(observation.audit, observation.goAudit, "audit panel must expose the Go completion audit");
  return observation;
}

async function main() {
  const { child: labServer, lines, ready } = startLab();
  let browser;
  try {
    const baseURL = await ready;
    const lane = `keyed-smoke-${crypto.randomUUID()}`;
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

    await page.goto(`${baseURL}/renderer-conformance/demo.html?lane=${encodeURIComponent(lane)}`, { waitUntil: "load" });
    await page.waitForFunction(() => {
      try {
        return document.getElementById("active-backend")?.textContent === "dom" &&
          JSON.parse(document.getElementById("runtime-snapshot")?.textContent).state.NextID === 0;
      } catch {
        return false;
      }
    }, null, { timeout: 30_000 });

    const root = page.locator("#editor-root");
    const input = (id) => page.getByLabel(`Row ${id}`);
    const rowButton = (id, action) => root.locator(".row").filter({ has: input(id) }).locator(`button.${action}`);

    await root.locator("button.add").click();
    await waitForRows(page, [1]);
    await root.locator("button.add").click();
    await waitForRows(page, [1, 2]);

    await input(1).fill("captured server value");
    await input(2).fill("move this row up");
    await page.locator("#next-mode").selectOption("held");
    await input(1).evaluate((element) => {
      element.focus();
      element.setSelectionRange(3, 11, "backward");
      window.__keyedInputBeforeUpdates = element;
    });
    await rowButton(1, "save").click();
    await waitForRow(page, 1, { PendingID: 1, Status: "pending" });
    const heldOne = await waitForServerRecord(page, lane, 1, "held", (record) => record.Value === "captured server value");

    await input(1).fill("client draft after save");
    await input(1).evaluate((element) => element.setSelectionRange(2, 9, "backward"));
    await rowButton(2, "up").click();
    await waitForRows(page, [2, 1]);
    assert.equal(await page.evaluate(() => document.getElementById("editor-root").querySelector('input[aria-label="Row 1"]') === window.__keyedInputBeforeUpdates), true,
      "editing and reordering must keep the same keyed input element");
    await input(1).evaluate((element) => {
      element.focus();
      element.setSelectionRange(2, 9, "backward");
    });
    const beforeSwapFocus = await page.evaluate(() => {
      window.__keyedInputBeforeBackendSwap = document.getElementById("editor-root").querySelector('input[aria-label="Row 1"]');
      return window.__keyedCollectionDemo.host.focusState();
    });
    assert.deepEqual(beforeSwapFocus, {
      key: "row-1-input", selectionStart: 2, selectionEnd: 9, selectionDirection: "backward",
    });

    await page.locator('[data-backend="godom"]').click();
    await page.waitForFunction(() => document.getElementById("active-backend")?.textContent === "godom");
    const afterSwap = await page.evaluate(() => ({
      changed: document.getElementById("editor-root").querySelector('input[aria-label="Row 1"]') !== window.__keyedInputBeforeBackendSwap,
      focused: document.activeElement === document.getElementById("editor-root").querySelector('input[aria-label="Row 1"]'),
      focus: window.__keyedCollectionDemo.host.focusState(),
    }));
    assert.equal(afterSwap.changed, true, "DOM→GoDOM replacement must create a new renderer node");
    assert.equal(afterSwap.focused, true, "DOM→GoDOM must restore the logical input focus");
    assert.deepEqual(afterSwap.focus, beforeSwapFocus, "DOM→GoDOM must restore the same logical key and selection");
    await page.evaluate(() => {
      window.__keyedInputAfterBackendSwap = document.getElementById("editor-root").querySelector('input[aria-label="Row 1"]');
    });
    await page.locator('[data-release-id="1"][data-release-mode="success"]').waitFor({ timeout: 10_000 });
    const evidenceDir = resolve(HERE, "build");
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: resolve(evidenceDir, "demo-pending-focus-swap.png"), fullPage: true });
    await verifySnapshotView(page);
    console.log(`PASS retained input identity during edit/reorder; held HTTP request #${heldOne.ID} captured its original value`);
    console.log("PASS DOM→GoDOM replacement changed the node and restored row-1 key plus backward selection");

    await page.locator('[data-release-id="1"][data-release-mode="success"]').click();
    await waitForRow(page, 1, {
      Draft: "client draft after save", Saved: "captured server value", Saves: 1, PendingID: 0, Status: "saved",
    });
    const afterCompletion = await page.evaluate(() => ({
      retained: document.getElementById("editor-root").querySelector('input[aria-label="Row 1"]') === window.__keyedInputAfterBackendSwap,
      focus: window.__keyedCollectionDemo.host.focusState(),
    }));
    assert.equal(afterCompletion.retained, true, "HTTP completion must update GoDOM in place");
    assert.deepEqual(afterCompletion.focus, beforeSwapFocus, "completion must preserve the logical focus and selection");
    assert.ok((await verifySnapshotView(page)).audit.some((entry) => entry.ID === 1 && entry.Accepted && entry.Reason === "saved"));
    console.log("PASS real HTTP completion updates the retained GoDOM input without moving its draft or selection");

    await input(1).evaluate((element) => {
      element.focus();
      element.setSelectionRange(1, 6, "forward");
    });
    const beforeReactSwap = await page.evaluate(() => {
      window.__goDOMInputBeforeReactSwap = document.getElementById("editor-root").querySelector('input[aria-label="Row 1"]');
      return window.__keyedCollectionDemo.host.focusState();
    });
    await page.locator('[data-backend="react"]').click();
    await page.waitForFunction(() => document.getElementById("active-backend")?.textContent === "react");
    const afterReactSwap = await page.evaluate(() => ({
      changed: document.getElementById("editor-root").querySelector('input[aria-label="Row 1"]') !== window.__goDOMInputBeforeReactSwap,
      focused: document.activeElement === document.getElementById("editor-root").querySelector('input[aria-label="Row 1"]'),
      focus: window.__keyedCollectionDemo.host.focusState(),
    }));
    assert.equal(afterReactSwap.changed, true, "GoDOM→React replacement must create a new renderer node");
    assert.equal(afterReactSwap.focused, true, "GoDOM→React must restore logical input focus");
    assert.deepEqual(afterReactSwap.focus, beforeReactSwap, "GoDOM→React must restore the same key and selection");
    await page.evaluate(() => {
      window.__keyedInputAfterBackendSwap = document.getElementById("editor-root").querySelector('input[aria-label="Row 1"]');
    });
    console.log("PASS GoDOM→React replacement changed the node and restored row-1 key plus forward selection");

    await input(2).fill("remove while a save is pending");
    await rowButton(2, "save").click();
    await waitForRow(page, 2, { PendingID: 2, Status: "pending" });
    await waitForServerRecord(page, lane, 2, "held", (record) => record.Value === "remove while a save is pending");
    await rowButton(2, "remove").click();
    await waitForRows(page, [1]);
    const cancelled = await waitForServerRecord(page, lane, 2, "cancelled", (record) => record.CancelObserved === true);
    assert.equal(cancelled.CancelObserved, true, "removing a pending row must abort its HTTP fetch");
    await root.locator("button.add").click();
    await waitForRows(page, [1, 3]);
    const pathReuse = await page.evaluate(() => {
      const runtime = window.__keyedCollectionDemo.runtime;
      const before = runtime.snapshot();
      const reusedPathInput = before.tree.Kids[2].Kids[1].Kids[0].Key;
      const invalid = runtime.dispatch({
        Path: "2/1/0", Event: "input", Value: "stale row must not edit the replacement", Key: "row-2-input",
      });
      return {
        reusedPathInput,
        error: invalid?.error ?? null,
        unchanged: JSON.stringify(runtime.snapshot()) === JSON.stringify(before),
      };
    });
    assert.equal(pathReuse.reusedPathInput, "row-3-input", "deleted row's path must now be reused by the newly added row key");
    assert.match(pathReuse.error ?? "", /stale node key/);
    assert.equal(pathReuse.unchanged, true, "old path plus deleted key must be rejected atomically");
    console.log("PASS removing a pending row aborts HTTP, the next row reuses its path with a different key, and stale dispatch is atomic");

    await input(3).fill("retry after server error");
    await page.locator("#next-mode").selectOption("error");
    await rowButton(3, "save").click();
    const errorRecord = await waitForServerRecord(page, lane, 3, "completed", (record) => record.ResultMode === "error");
    assert.equal(errorRecord.Error, "server rejected");
    await waitForRow(page, 3, { Saved: "", Saves: 0, PendingID: 0, Status: "error: server rejected" });
    await page.locator("#next-mode").selectOption("success");
    await rowButton(3, "save").click();
    await waitForRow(page, 3, { Saved: "retry after server error", Saves: 1, PendingID: 0, Status: "saved" });
    await waitForServerRecord(page, lane, 4, "completed", (record) => record.ResultMode === "success");
    assert.ok((await verifySnapshotView(page)).audit.some((entry) => entry.ID === 3 && entry.Accepted && entry.Reason === "error"));
    assert.ok((await verifySnapshotView(page)).audit.some((entry) => entry.ID === 4 && entry.Accepted && entry.Reason === "saved"));
    console.log("PASS typed HTTP error preserves saved state and a fresh request ID retry succeeds");

    assert.deepEqual(pageErrors, [], `browser errors:\n${pageErrors.join("\n")}`);
    await page.close();
    process.stdout.write("renderer conformance real-HTTP demo smoke passed\n");
  } finally {
    if (browser) await browser.close();
    lines.close();
    if (labServer.exitCode === null) {
      labServer.kill("SIGTERM");
      await new Promise((resolveExit) => {
        labServer.once("exit", resolveExit);
        setTimeout(resolveExit, 2_000).unref();
      });
    }
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
