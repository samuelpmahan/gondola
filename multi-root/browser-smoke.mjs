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

async function waitForRows(card, ids) {
  await card.page().waitForFunction(({ slot, expected }) => {
    const cardElement = document.querySelector(`article[data-slot="${slot}"]`);
    if (!cardElement) return false;
    const snapshot = JSON.parse(cardElement.querySelector("[data-snapshot]").textContent);
    return Array.isArray(snapshot.state?.Rows) &&
      JSON.stringify(snapshot.state.Rows.map(({ ID }) => ID)) === JSON.stringify(expected);
  }, { slot: await card.getAttribute("data-slot"), expected: ids }, { timeout: 10_000 });
}

async function waitForRow(card, rowID, expected) {
  const page = card.page();
  const slot = await card.getAttribute("data-slot");
  try {
    await page.waitForFunction(({ targetSlot, id, want }) => {
      try {
        const cardElement = document.querySelector(`article[data-slot="${targetSlot}"]`);
        const snapshot = JSON.parse(cardElement.querySelector("[data-snapshot]").textContent);
        const row = snapshot.state?.Rows?.find((entry) => entry.ID === id);
        return row && Object.entries(want).every(([key, value]) => row[key] === value);
      } catch {
        return false;
      }
    }, { targetSlot: slot, id: rowID, want: expected }, { timeout: 10_000 });
  } catch (error) {
    const diagnostic = await page.locator(`article[data-slot="${slot}"]`).evaluate((element, targetSlot) => ({
      snapshot: element.querySelector("[data-snapshot]").textContent,
      requests: element.querySelector("[data-requests]").textContent,
      error: document.getElementById("error").textContent,
      demoSlot: window.__multiRootDemo?.slots?.find((entry) => entry.name === targetSlot) ? {
        lane: window.__multiRootDemo.slots.find((entry) => entry.name === targetSlot).lane,
        lateRelease: window.__multiRootDemo.slots.find((entry) => entry.name === targetSlot).lateRelease,
        transport: window.__multiRootDemo.slots.find((entry) => entry.name === targetSlot).transport?.log(),
      } : null,
    }), slot);
    throw new Error(`${error.message}\nroot ${slot} diagnostic: ${JSON.stringify(diagnostic)}`);
  }
}

async function waitForRequest(page, lane, id, expectedState, predicate = () => true) {
  await page.waitForFunction(async ({ expectedLane, expectedID, state }) => {
    try {
      const response = await fetch(`/api/requests?lane=${encodeURIComponent(expectedLane)}`, { cache: "no-store" });
      if (!response.ok) return false;
      const result = await response.json();
      const record = result.requests?.find((item) => item.ID === expectedID);
      return Boolean(record && record.State === state);
    } catch {
      return false;
    }
  }, { expectedLane: lane, expectedID: id, state: expectedState }, { timeout: 10_000 });
  const record = await page.evaluate(async ({ expectedLane, expectedID }) => {
    const response = await fetch(`/api/requests?lane=${encodeURIComponent(expectedLane)}`, { cache: "no-store" });
    const result = await response.json();
    return result.requests.find((item) => item.ID === expectedID);
  }, { expectedLane: lane, expectedID: id });
  assert.ok(predicate(record), `unexpected HTTP request record: ${JSON.stringify(record)}`);
  return record;
}

async function main() {
  const { child: labServer, lines, ready } = startLab();
  let browser;
  try {
    const baseURL = await ready;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    const expectedConflictResponses = [];
    const expectedConflictConsoleMessages = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
    page.on("response", (response) => {
      if (response.status() === 409) expectedConflictResponses.push(response.url());
    });
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("status of 409 (Conflict)")) {
        expectedConflictConsoleMessages.push(message.text());
      } else if (message.type() === "error") pageErrors.push(message.text());
    });
    await page.goto(`${baseURL}/multi-root/demo.html`, { waitUntil: "load" });
    await page.waitForFunction(() => {
      const error = document.getElementById("error");
      return document.getElementById("live-sessions")?.textContent === "3 / 3" ||
        (error && !error.hidden && error.textContent.trim() !== "");
    }, null, { timeout: 30_000 });
    const startupError = await page.locator("#error").textContent();
    assert.equal(await page.locator("#error").isVisible(), false, `demo startup reported: ${startupError}`);
    assert.equal(await page.locator("#live-sessions").textContent(), "3 / 3", "demo must mount all three sessions");

    const card = (slot) => page.locator(`article[data-slot="${slot}"]`);
    const app = (slot) => card(slot).locator("[data-app-root]");
    const input = (slot, rowID = 1) => app(slot).getByLabel(`Row ${rowID}`);
    const action = (slot, rowID, name) => {
      assert.ok(Number.isSafeInteger(rowID) && rowID > 0);
      return app(slot).locator(`button.${name}`).first();
    };
    await page.waitForFunction(() => {
      const read = (slot) => {
        const cardElement = document.querySelector(`article[data-slot="${slot}"]`);
        return {
          sessionID: Number(cardElement.querySelector("[data-session]").textContent),
          lane: cardElement.querySelector("[data-lane]").textContent,
          backend: cardElement.querySelector("[data-active-backend]").textContent,
        };
      };
      const a = read("A");
      const b = read("B");
      const c = read("C");
      return a.sessionID > 0 && b.sessionID > a.sessionID && c.sessionID > b.sessionID &&
        a.lane && b.lane && c.lane && a.backend === "dom" && b.backend === "react" && c.backend === "godom";
    }, null, { timeout: 10_000 });
    const initial = await page.evaluate(() => Object.fromEntries(["A", "B", "C"].map((slot) => {
      const cardElement = document.querySelector(`article[data-slot="${slot}"]`);
      return [slot, {
        sessionID: Number(cardElement.querySelector("[data-session]").textContent),
        lane: cardElement.querySelector("[data-lane]").textContent,
        backend: cardElement.querySelector("[data-active-backend]").textContent,
      }];
    })));
    assert.equal(new Set(Object.values(initial).map(({ sessionID }) => sessionID)).size, 3);
    assert.equal(new Set(Object.values(initial).map(({ lane }) => lane)).size, 3);

    await app("A").locator("button.add").click();
    await app("B").locator("button.add").click();
    await app("C").locator("button.add").click();
    await waitForRows(card("A"), [1]);
    await waitForRows(card("B"), [1]);
    await waitForRows(card("C"), [1]);
    await input("A").fill("held from root A");
    await input("B").fill("held from root B");
    await card("A").locator("[data-mode]").selectOption("held");
    await card("B").locator("[data-mode]").selectOption("held");

    await input("A").evaluate((element) => {
      element.focus();
      element.setSelectionRange(2, 8, "backward");
      window.__multiRootBeforeSwap = element;
    });
    await page.evaluate(() => {
      window.__multiRootSiblingInput = document.querySelector('article[data-slot="B"] [data-app-root] input');
      window.__multiRootSiblingGoDOM = document.querySelector('article[data-slot="C"] [data-app-root] input');
    });
    await card("A").locator('[data-backend="react"]').click();
    await page.waitForFunction(() => {
      const a = document.querySelector('article[data-slot="A"]');
      const b = document.querySelector('article[data-slot="B"]');
      const c = document.querySelector('article[data-slot="C"]');
      return a.querySelector("[data-active-backend]").textContent === "react" &&
        b.querySelector("[data-active-backend]").textContent === "react" &&
        c.querySelector("[data-active-backend]").textContent === "godom";
    }, null, { timeout: 10_000 });
    const focusAfterSwap = await page.evaluate(() => {
      const current = document.querySelector('article[data-slot="A"] [data-app-root] input');
      return {
        replaced: current !== window.__multiRootBeforeSwap,
        focused: document.activeElement === current,
        start: current.selectionStart,
        end: current.selectionEnd,
        direction: current.selectionDirection,
        siblingBRetained: document.querySelector('article[data-slot="B"] [data-app-root] input') === window.__multiRootSiblingInput,
        siblingCRetained: document.querySelector('article[data-slot="C"] [data-app-root] input') === window.__multiRootSiblingGoDOM,
      };
    });
    assert.deepEqual(focusAfterSwap, {
      replaced: true,
      focused: true,
      start: 2,
      end: 8,
      direction: "backward",
      siblingBRetained: true,
      siblingCRetained: true,
    }, "swapping root A must preserve its logical focus and leave sibling nodes untouched");

    await action("A", 1, "save").click();
    await action("B", 1, "save").click();
    await waitForRow(card("A"), 1, { PendingID: 1, Status: "pending" });
    await waitForRow(card("B"), 1, { PendingID: 1, Status: "pending" });
    const heldA = await waitForRequest(page, initial.A.lane, 1, "held", (record) => record.Value === "held from root A");
    const heldB = await waitForRequest(page, initial.B.lane, 1, "held", (record) => record.Value === "held from root B");
    assert.equal(heldA.ID, heldB.ID, "two sessions may use the same local request ID");
    assert.notEqual(heldA.Lane, heldB.Lane, "same-numbered requests must remain in different lanes");
    await page.waitForFunction(() => ["A", "B"].every((slot) => {
      const row = document.querySelector(`article[data-slot="${slot}"] [data-request-id="1"]`);
      return row?.textContent.includes("held → pending") && row.querySelector('[data-release-id="1"]');
    }), null, { timeout: 10_000 });
    await mkdir(resolve(HERE, "build"), { recursive: true });
    await page.screenshot({ path: resolve(HERE, "build/demo-three-roots-held.png"), fullPage: true });

    await card("A").locator('[data-action="dispose"]').click();
    await page.waitForFunction(() => {
      const a = document.querySelector('article[data-slot="A"]');
      return a.querySelector("[data-active-backend]").textContent === "disposed" &&
        a.querySelector('[data-action="remount"]').disabled === false;
    }, null, { timeout: 10_000 });
    const cancelledA = await waitForRequest(page, initial.A.lane, 1, "cancelled", (record) => record.CancelObserved === true);
    const stillHeldB = await waitForRequest(page, initial.B.lane, 1, "held", (record) => record.CancelObserved === false);
    assert.equal(cancelledA.CancelObserved, true);
    assert.equal(stillHeldB.State, "held", "disposing A must not cancel root B's held request");
    await card("A").locator('[data-late-release-id="1"]').click();
    await page.waitForFunction(() => {
      const row = document.querySelector('article[data-slot="A"] [data-request-id="1"]');
      return row?.textContent.includes("Late release rejected (409)");
    }, null, { timeout: 10_000 });
    assert.deepEqual(expectedConflictResponses.length, 1, "only the intentional late release should receive HTTP 409");
    assert.ok(expectedConflictResponses[0].includes(`lane=${encodeURIComponent(initial.A.lane)}`));

    const bInput = input("B");
    await bInput.fill("sibling continued after disposal");
    await card("B").locator('[data-requests] [data-release-id="1"][data-release-mode="success"]').click();
    await waitForRequest(page, initial.B.lane, 1, "completed");
    await waitForRow(card("B"), 1, {
      Draft: "sibling continued after disposal",
      Saved: "held from root B",
      PendingID: 0,
      Status: "saved",
    });
    assert.equal((await waitForRequest(page, initial.B.lane, 1, "completed")).CancelObserved, false);

    const remountedSession = await page.evaluate(() => Number(
      document.querySelector('article[data-slot="A"] [data-session]').textContent,
    ));
    assert.equal(remountedSession, initial.A.sessionID, "disposed root keeps its old ID visible until fresh remount");
    await card("A").locator('[data-action="remount"]').click();
    await page.waitForFunction((oldID) => {
      const a = document.querySelector('article[data-slot="A"]');
      const sessionID = Number(a.querySelector("[data-session]").textContent);
      const snapshot = JSON.parse(a.querySelector("[data-snapshot]").textContent);
      return sessionID > oldID && a.querySelector("[data-active-backend]").textContent === "react" &&
        Array.isArray(snapshot.state?.Rows) && snapshot.state.Rows.length === 0;
    }, initial.A.sessionID, { timeout: 10_000 });
    const newLane = await card("A").locator("[data-lane]").textContent();
    assert.notEqual(newLane, initial.A.lane, "fresh mount must allocate a new HTTP lane");
    assert.deepEqual(pageErrors, [], `browser must not report uncaught errors: ${JSON.stringify(pageErrors)}`);
    assert.equal(expectedConflictConsoleMessages.length, 1, "Chromium may log the expected late-release 409 as a resource error");

    console.log("PASS three simultaneous DOM, React, and GoDOM roots have distinct sessions and lanes");
    console.log("PASS root-local DOM→React swap restored selection without replacing sibling inputs");
    console.log(`PASS held request #${heldA.ID} in root A cancelled; root B's same-numbered save completed`);
    console.log("PASS late release for disposed root was rejected with HTTP 409");
    console.log("PASS fresh remount allocated an empty session and a new lane");
    console.log("multi-root real-browser demo smoke passed");
  } finally {
    if (browser) await browser.close();
    lines.close();
    labServer.kill("SIGTERM");
    if (labServer.exitCode === null) {
      await new Promise((resolveClose) => labServer.once("exit", resolveClose));
    }
  }
}

await main();
