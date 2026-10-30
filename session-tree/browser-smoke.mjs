#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BUILD = resolve(HERE, "build");
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

async function waitForTree(page, predicate, description) {
  try {
    await page.waitForFunction(predicate, null, { timeout: 10_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      tree: document.getElementById("tree-output")?.textContent,
      snapshots: document.getElementById("snapshot-output")?.textContent,
      error: document.getElementById("error")?.textContent,
    }));
    throw new Error(`${description}: ${error.message}\n${JSON.stringify(diagnostic, null, 2)}`);
  }
}

async function waitForRow(page, sessionID, expected) {
  await page.waitForFunction(({ id, wanted }) => {
    try {
      const rows = window.__sessionTreeDemo.manager.snapshot(id).state.Rows;
      const row = rows.find(({ ID }) => ID === 1);
      return row && Object.entries(wanted).every(([key, value]) => row[key] === value);
    } catch { return false; }
  }, { id: sessionID, wanted: expected }, { timeout: 10_000 });
}

async function waitForRequest(page, sessionID, requestID, state) {
  await page.waitForFunction(async ({ sid, id, want }) => {
    try {
      const record = window.__sessionTreeDemo.record(sid);
      if (!record) return false;
      const response = await fetch(`/api/requests?lane=${encodeURIComponent(record.lane)}`, { cache: "no-store" });
      if (!response.ok) return false;
      const result = await response.json();
      return result.requests?.some((entry) => entry.ID === id && entry.State === want);
    } catch { return false; }
  }, { sid: sessionID, id: requestID, want: state }, { timeout: 15_000 });
  return page.evaluate(async ({ sid, id }) => {
    const record = window.__sessionTreeDemo.record(sid);
    const response = await fetch(`/api/requests?lane=${encodeURIComponent(record.lane)}`, { cache: "no-store" });
    const result = await response.json();
    return result.requests.find((entry) => entry.ID === id);
  }, { sid: sessionID, id: requestID });
}

async function addDraft(page, sessionID, value) {
  const view = page.locator(`[data-session-view="${sessionID}"]`);
  await view.locator("button.add").click();
  await view.getByLabel("Row 1").fill(value);
  await waitForRow(page, sessionID, { Draft: value });
  return view;
}

async function setHeld(page, sessionID) {
  const control = page.locator(`[data-control-session="${sessionID}"]`);
  await control.locator("[data-response-mode]").selectOption("held");
}

async function releaseLate(page, sessionID, requestID) {
  const selector = `[data-late-release="${sessionID}:${requestID}"]`;
  await page.locator(selector).waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(selector).click();
  await page.waitForFunction(({ sid, id }) => {
    const record = window.__sessionTreeDemo.records.get(sid);
    return record?.lateResults.get(id)?.status === 409;
  }, { sid: sessionID, id: requestID }, { timeout: 10_000 });
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
    const expectedConflictLogs = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
    page.on("console", (message) => {
      const text = message.text();
      // Deliberate late-release checks exercise the HTTP lab's expected 409 response.
      if (message.type() === "error" && text.includes("status of 409 (Conflict)")) expectedConflictLogs.push(text);
      else if (message.type() === "error") pageErrors.push(text);
    });
    await page.goto(`${baseURL}/session-tree/demo.html`, { waitUntil: "load" });
    await page.waitForFunction(() => document.getElementById("live-count")?.textContent === "4 live sessions" ||
      (document.getElementById("error") && !document.getElementById("error").hidden), null, { timeout: 30_000 });
    assert.equal(await page.locator("#error").isVisible(), false, await page.locator("#error").textContent());
    assert.equal(await page.locator("#live-count").textContent(), "4 live sessions");

    const initial = await page.evaluate(() => window.__sessionTreeDemo.initialIDs);
    const tree = await page.evaluate(() => window.__sessionTreeDemo.host.tree());
    assert.deepEqual(tree.map(({ SessionID, ParentID, Depth }) => [SessionID, ParentID, Depth]), [
      [initial.family, 0, 1],
      [initial.child, initial.family, 2],
      [initial.grandchild, initial.child, 3],
      [initial.sibling, 0, 1],
    ], "initial Go tree must contain the family chain and separate sibling root");
    const lanes = await page.evaluate((ids) => ids.map((id) => window.__sessionTreeDemo.record(id).lane), Object.values(initial));
    assert.equal(new Set(lanes).size, 4, "every Go session gets its own HTTP lane");

    const parentView = await addDraft(page, initial.family, "parent renderer focus");
    const childView = await addDraft(page, initial.child, "held in child");
    const grandchildView = await addDraft(page, initial.grandchild, "held in grandchild");
    await addDraft(page, initial.sibling, "sibling survives disposal");
    await page.evaluate(({ parentID, childID, grandchildID }) => {
      const parent = document.querySelector(`[data-session-view="${parentID}"] input[aria-label="Row 1"]`);
      parent.focus();
      parent.setSelectionRange(2, 10, "backward");
      parent.dispatchEvent(new Event("select", { bubbles: true }));
      window.__sessionTreeParentInput = parent;
      window.__sessionTreeChildShell = document.querySelector(`[data-shell-session="${childID}"]`);
      window.__sessionTreeChildInput = document.querySelector(`[data-session-view="${childID}"] input[aria-label="Row 1"]`);
      window.__sessionTreeGrandchildShell = document.querySelector(`[data-shell-session="${grandchildID}"]`);
      window.__sessionTreeGrandchildInput = document.querySelector(`[data-session-view="${grandchildID}"] input[aria-label="Row 1"]`);
      window.__sessionTreeSiblingInput = document.querySelector(`[data-session-view="${window.__sessionTreeDemo.initialIDs.sibling}"] input[aria-label="Row 1"]`);
    }, { parentID: initial.family, childID: initial.child, grandchildID: initial.grandchild });

    const parentControls = page.locator(`[data-control-session="${initial.family}"]`);
    await parentControls.locator("[data-backend-select]").selectOption("react");
    await parentControls.locator('[data-action="replace"]').click();
    await waitForTree(page, () => document.querySelector(`[data-control-session="${window.__sessionTreeDemo.initialIDs.family}"]`)?.textContent.includes("react"), "parent renderer replacement");
    const parentSwap = await page.evaluate(({ parentID, childID }) => {
      const currentParent = document.querySelector(`[data-session-view="${parentID}"] input[aria-label="Row 1"]`);
      const currentChild = document.querySelector(`[data-session-view="${childID}"] input[aria-label="Row 1"]`);
      const childShell = document.querySelector(`[data-shell-session="${childID}"]`);
      return {
        parentInputReplaced: currentParent !== window.__sessionTreeParentInput,
        parentFocused: document.activeElement === currentParent,
        parentSelection: [currentParent.selectionStart, currentParent.selectionEnd, currentParent.selectionDirection],
        childShellRetained: childShell === window.__sessionTreeChildShell,
        childInputRetained: currentChild === window.__sessionTreeChildInput,
      };
    }, { parentID: initial.family, childID: initial.child });
    assert.deepEqual(parentSwap, {
      parentInputReplaced: true,
      parentFocused: true,
      parentSelection: [2, 10, "backward"],
      childShellRetained: true,
      childInputRetained: true,
    }, "parent replacement must restore logical focus and keep its child shell and live input");

    const childControls = page.locator(`[data-control-session="${initial.child}"]`);
    await childControls.locator("[data-backend-select]").selectOption("dom");
    await childControls.locator('[data-action="replace"]').click();
    const childSwap = await page.evaluate(({ grandchildID }) => ({
      shellRetained: document.querySelector(`[data-shell-session="${grandchildID}"]`) === window.__sessionTreeGrandchildShell,
      inputRetained: document.querySelector(`[data-session-view="${grandchildID}"] input[aria-label="Row 1"]`) === window.__sessionTreeGrandchildInput,
    }), { grandchildID: initial.grandchild });
    assert.deepEqual(childSwap, { shellRetained: true, inputRetained: true },
      "child renderer replacement must leave the grandchild shell and input untouched");

    for (const sessionID of [initial.child, initial.grandchild, initial.sibling]) await setHeld(page, sessionID);
    for (const sessionID of [initial.child, initial.grandchild, initial.sibling]) {
      await page.locator(`[data-session-view="${sessionID}"] button.save`).click();
      await waitForRow(page, sessionID, { PendingID: 1, Status: "pending" });
      const request = await waitForRequest(page, sessionID, 1, "held");
      assert.equal(request.CancelObserved, false);
    }

    await page.locator(`[data-control-session="${initial.child}"] [data-action="dispose"]`).click();
    await page.waitForFunction(({ childID, grandchildID }) => {
      const tree = window.__sessionTreeDemo.host.tree().map(({ SessionID }) => SessionID);
      return !tree.includes(childID) && !tree.includes(grandchildID);
    }, { childID: initial.child, grandchildID: initial.grandchild }, { timeout: 10_000 });
    const childCancelled = await waitForRequest(page, initial.child, 1, "cancelled");
    const grandchildCancelled = await waitForRequest(page, initial.grandchild, 1, "cancelled");
    assert.equal(childCancelled.CancelObserved, true);
    assert.equal(grandchildCancelled.CancelObserved, true);
    const disposal = JSON.parse(await page.locator("#disposal-output").textContent());
    assert.deepEqual(disposal.map(({ sessionID }) => sessionID), [initial.grandchild, initial.child],
      "subtree disposal must present grandchild before child");
    assert.ok(disposal.every(({ commands }) => commands.some(({ Kind, ID }) => Kind === "cancel" && ID === 1)));
    assert.deepEqual(await page.evaluate((id) => window.__sessionTreeDemo.host.tree().map(({ SessionID }) => SessionID), initial.sibling),
      [initial.family, initial.sibling], "family parent and sibling root must survive child-subtree disposal");

    await releaseLate(page, initial.child, 1);
    await releaseLate(page, initial.grandchild, 1);
    const childLate = await page.evaluate((ids) => Promise.all(ids.map(async (id) =>
      window.__sessionTreeDemo.records.get(id).lateResults.get(1).status)), [initial.child, initial.grandchild]);
    assert.deepEqual(childLate, [409, 409]);

    const siblingBeforeRootDispose = await page.evaluate((id) => window.__sessionTreeDemo.manager.snapshot(id).state.Rows[0], initial.sibling);
    assert.equal(siblingBeforeRootDispose.PendingID, 1, "unrelated sibling save must remain pending");
    await setHeld(page, initial.family);
    await parentView.locator("button.save").click();
    await waitForRow(page, initial.family, { PendingID: 1, Status: "pending" });
    await waitForRequest(page, initial.family, 1, "held");
    const oldFamilyCallback = await page.evaluate((id) => window.__sessionTreeDemo.records.get(id).callbacks.has(1), initial.family);
    assert.equal(oldFamilyCallback, true);
    await page.locator(`[data-control-session="${initial.family}"] [data-action="dispose"]`).click();
    await page.waitForFunction((id) => !window.__sessionTreeDemo.host.tree().some((entry) => entry.SessionID === id), initial.family);
    const parentCancelled = await waitForRequest(page, initial.family, 1, "cancelled");
    assert.equal(parentCancelled.CancelObserved, true);
    assert.equal(await page.locator("#recreate-family").isEnabled(), true);

    const siblingInputAfterDispose = await page.evaluate((id) => document.querySelector(`[data-session-view="${id}"] input[aria-label="Row 1"]`) === window.__sessionTreeSiblingInput, initial.sibling);
    assert.equal(siblingInputAfterDispose, true, "disposing the family root must leave sibling DOM identity untouched");
    await page.locator("#recreate-family").click();
    await page.waitForFunction((oldID) => {
      const shell = document.querySelector("#family-mount > [data-shell-session]");
      const id = Number(shell?.dataset.shellSession);
      return Number.isSafeInteger(id) && id > oldID && window.__sessionTreeDemo.manager.snapshot(id).state.Rows.length === 0;
    }, initial.family, { timeout: 10_000 });
    const newFamilyID = await page.evaluate(() => Number(document.querySelector("#family-mount > [data-shell-session]").dataset.shellSession));
    assert.ok(newFamilyID > initial.family);
    const stale = await page.evaluate(({ oldID, newID }) => {
      const result = window.__sessionTreeDemo.replayRetiredCallback(oldID, 1, "must not enter new session");
      return {
        ...result,
        newRows: window.__sessionTreeDemo.manager.snapshot(newID).state.Rows,
        currentIDs: window.__sessionTreeDemo.host.tree().map(({ SessionID }) => SessionID),
      };
    }, { oldID: initial.family, newID: newFamilyID });
    assert.equal(stale.completeCalls, 0, "retired callback must not call Go Complete");
    assert.equal(stale.error, null, "retired callback must return without raising a stale-session error");
    assert.deepEqual(stale.newRows, [], "retired callback must not change the fresh session");
    assert.deepEqual(stale.currentIDs, [initial.sibling, newFamilyID],
      "the sibling and fresh root must be the only live sessions after recreation");
    assert.deepEqual(stale.tree, [
      { sessionID: initial.sibling, parentID: 0, depth: 1 },
      { sessionID: newFamilyID, parentID: 0, depth: 1 },
    ], "retired callback must leave tree ownership unchanged after root recreation");

    await page.locator(`[data-release="${initial.sibling}:1"]`).click();
    await waitForRequest(page, initial.sibling, 1, "completed");
    await waitForRow(page, initial.sibling, {
      Draft: "sibling survives disposal",
      Saved: "sibling survives disposal",
      PendingID: 0,
      Status: "saved",
    });
    assert.deepEqual(pageErrors, [], `browser reported uncaught errors: ${JSON.stringify(pageErrors)}`);
    assert.equal(expectedConflictLogs.length, 2, "the two deliberate late HTTP releases should be the only expected 409 console errors");

    const result = {
      ok: true,
      initialTree: tree,
      parentSwap,
      childSwap,
      disposedPostorder: disposal.map(({ sessionID }) => sessionID),
      descendantCancelObserved: [grandchildCancelled.CancelObserved, childCancelled.CancelObserved],
      lateReleaseStatus: childLate,
      siblingInputSurvivedFamilyDisposal: siblingInputAfterDispose,
      siblingSavedAfterDisposal: true,
      recreatedFamilyID: newFamilyID,
      staleCallbackCompleteCalls: stale.completeCalls,
    };
    await mkdir(BUILD, { recursive: true });
    await writeFile(resolve(BUILD, "browser-smoke.json"), `${jsonForFile(result)}\n`);
    console.log("PASS DOM parent -> React child -> GoDOM grandchild plus separate sibling root mounted");
    console.log("PASS parent and child renderer swaps retained descendant shell/input identity and restored parent selection");
    console.log(`PASS child subtree disposal cancelled descendant requests in postorder ${result.disposedPostorder.join(",")}`);
    console.log("PASS late releases returned HTTP 409; sibling save completed after subtree and root disposal");
    console.log(`PASS recreated family root ${initial.family} -> ${newFamilyID} ignored the captured retired callback`);
    console.log("session-tree HTTP browser smoke passed");
  } finally {
    if (browser) await browser.close();
    lines.close();
    labServer.kill("SIGTERM");
    if (labServer.exitCode === null) await new Promise((resolveExit) => labServer.once("exit", resolveExit));
  }
}

function jsonForFile(value) {
  return JSON.stringify(value, null, 2);
}

await main();
