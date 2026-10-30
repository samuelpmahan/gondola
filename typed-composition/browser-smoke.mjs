#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCleanHTTPProcessClose,
  retainPrimaryFailure,
  startHTTPProcess,
} from "./http-lab-process.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const labPath = resolve(ROOT, "http-effects/build/http-lab");
const requireFromInteraction = createRequire(resolve(ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

function startLab() {
  return startHTTPProcess({
    command: labPath,
    args: ["-addr", "127.0.0.1:0", "-root", ROOT],
    cwd: ROOT,
  });
}

async function waitFor(page, predicate, description, arg = null) {
  try { await page.waitForFunction(predicate, arg, { timeout: 15_000 }); }
  catch (error) {
    const detail = await page.evaluate(() => ({
      live: document.getElementById("live-count")?.textContent,
      snapshots: document.getElementById("snapshot-output")?.textContent,
      receipts: document.getElementById("receipts-output")?.textContent,
      error: document.getElementById("error")?.textContent,
    }));
    throw new Error(`${description}: ${error.message}\n${JSON.stringify(detail, null, 2)}`);
  }
}

async function waitForRequest(page, sessionID, requestID, state) {
  await page.waitForFunction(async ({ sid, id, wanted }) => {
    const record = window.__typedCompositionDemo.records.get(sid);
    if (!record) return false;
    const response = await fetch(`/api/requests?lane=${encodeURIComponent(record.lane)}`, { cache: "no-store" });
    if (!response.ok) return false;
    const body = await response.json();
    return body.requests?.some((request) => request.ID === id && request.State === wanted);
  }, { sid: sessionID, id: requestID, wanted: state }, { timeout: 15_000 });
}

async function addDraft(page, sessionID, value) {
  const view = page.locator(`[data-session-view="${sessionID}"]`);
  await view.locator("button.add").click();
  await view.getByLabel("Row 1").fill(value);
  await waitFor(page, ({ sid, value: wanted }) => {
    const snapshot = window.__typedCompositionDemo.manager.snapshot(sid);
    const state = snapshot.state ?? snapshot.State;
    return state.Rows?.[0]?.Draft === wanted;
  }, `row draft ${JSON.stringify(value)}`, { sid: sessionID, value });
  return view;
}

async function main() {
  const lab = startLab();
  let browser;
  let primaryError;
  let operationFailed = false;
  try {
    const baseURL = await lab.ready;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
    page.on("console", (message) => { if (message.type() === "error") pageErrors.push(message.text()); });
    await page.goto(`${baseURL}/typed-composition/demo.html`, { waitUntil: "load" });
    await page.waitForFunction(() => document.getElementById("live-count")?.textContent === "2 live sessions" ||
      (document.getElementById("error") && !document.getElementById("error").hidden), null, { timeout: 30_000 });
    assert.equal(await page.locator("#error").isVisible(), false, await page.locator("#error").textContent());

    const initial = await page.evaluate(() => window.__typedCompositionDemo.initialIDs);
    assert.ok(initial.parent > 0 && initial.child > initial.parent);
    assert.match(await page.locator(`[data-session-view="${initial.parent}"]`).textContent(), /Published: 0/);
    assert.match(await page.locator(`[data-session-view="${initial.child}"]`).textContent(), /Title: Review ticket/);

    const childView = await addDraft(page, initial.child, "accepted over HTTP");
    const parentControls = page.locator(`[data-control-session="${initial.parent}"]`);
    const childControls = page.locator(`[data-control-session="${initial.child}"]`);
    await childControls.locator("[data-response-mode]").selectOption("held");
    await childView.locator("button.save").click();
    await waitForRequest(page, initial.child, 1, "held");
    await waitFor(page, ({ sid }) => {
      const snapshot = window.__typedCompositionDemo.manager.snapshot(sid);
      const state = snapshot.state ?? snapshot.State;
      return state.Rows[0].Status === "pending";
    },
      "child save is pending at HTTP server", { sid: initial.child });

    await parentControls.locator("[data-policy-title]").fill("Approval ticket");
    await parentControls.locator("[data-policy-title]").press("Tab");
    await parentControls.locator("[data-policy-readonly]").check();
    await page.evaluate(() => window.__typedCompositionDemo.settled());
    await waitFor(page, ({ sid }) => {
      const snapshot = window.__typedCompositionDemo.manager.snapshot(sid);
      const state = snapshot.state ?? snapshot.State;
      return state.Inputs?.ReadOnly === true || state.inputs?.readOnly === true;
    }, "child receives parent read-only policy", { sid: initial.child });
    await waitFor(page, ({ sid }) => document.querySelector(`[data-session-view="${sid}"]`)?.textContent.includes("Title: Approval ticket"),
      "child title follows parent input", { sid: initial.child });
    const disabledState = await page.evaluate((id) => {
      const view = document.querySelector(`[data-session-view="${id}"]`);
      return {
        inputs: [...view.querySelectorAll("input")].map((input) => input.disabled),
        buttons: [...view.querySelectorAll("button")].map((button) => button.disabled),
      };
    }, initial.child);
    assert.ok(disabledState.inputs.length > 0 && disabledState.inputs.every(Boolean));
    assert.ok(disabledState.buttons.length > 0 && disabledState.buttons.every(Boolean));

    await page.locator(`[data-release="${initial.child}:1"]`).click();
    await waitForRequest(page, initial.child, 1, "completed");
    await waitFor(page, ({ sid }) => {
      const snapshot = window.__typedCompositionDemo.manager.snapshot(sid);
      const state = snapshot.state ?? snapshot.State;
      const row = state.Rows[0];
      return row.Saved === "accepted over HTTP" && row.Status === "saved" && row.PendingID === 0;
    }, "pending completion updates Go state while read-only is active", { sid: initial.child });
    assert.match(await page.locator(`[data-session-view="${initial.parent}"]`).textContent(), /Published: 0/);

    await parentControls.locator("[data-policy-readonly]").uncheck();
    await page.evaluate(() => window.__typedCompositionDemo.settled());
    await waitFor(page, ({ sid }) => {
      const snapshot = window.__typedCompositionDemo.manager.snapshot(sid);
      const state = snapshot.state ?? snapshot.State;
      return state.Inputs?.ReadOnly === false || state.inputs?.readOnly === false;
    }, "parent re-enables the child", { sid: initial.child });

    const rendererSequence = ["dom", "godom", "react"];
    for (const backend of rendererSequence) {
      await page.evaluate((id) => {
        const input = document.querySelector(`[data-session-view="${id}"] input[aria-label="Row 1"]`);
        input.focus();
        input.setSelectionRange(2, 9, "backward");
        input.dispatchEvent(new Event("select", { bubbles: true }));
        window.__rendererInput = input;
      }, initial.child);
      await childControls.locator("[data-backend-select]").selectOption(backend);
      await childControls.locator('[data-action="replace"]').click();
      await waitFor(page, ({ id, backend: expected }) =>
        document.querySelector(`[data-control-session="${id}"] [data-details]`)?.textContent.includes(expected),
      `child renderer switched to ${backend}`, { id: initial.child, backend });
      const after = await page.evaluate(({ id }) => {
        const input = document.querySelector(`[data-session-view="${id}"] input[aria-label="Row 1"]`);
        const state = window.__typedCompositionDemo.manager.snapshot(id).state;
        return {
          replaced: input !== window.__rendererInput,
          focused: document.activeElement === input,
          selection: [input.selectionStart, input.selectionEnd, input.selectionDirection],
          draft: state.Rows[0].Draft,
          saved: state.Rows[0].Saved,
        };
      }, { id: initial.child });
      assert.equal(after.replaced, true);
      assert.equal(after.focused, true);
      assert.deepEqual(after.selection, [2, 9, "backward"]);
      assert.equal(after.draft, "accepted over HTTP");
      assert.equal(after.saved, "accepted over HTTP");
      await page.evaluate((id) => { window.__rendererInput = document.querySelector(`[data-session-view="${id}"] input[aria-label="Row 1"]`); }, initial.child);
    }

    await childView.locator("button.publish").click();
    await waitFor(page, ({ id }) => document.querySelector(`[data-session-view="${id}"]`)?.textContent.includes("Published: 1"),
      "Go publishes child row into parent Inbox", { id: initial.parent });
    await waitFor(page, ({ id }) => {
      const snapshot = window.__typedCompositionDemo.manager.snapshot(id);
      const state = snapshot.state ?? snapshot.State;
      return state.Inbox?.length === 1 || state.inbox?.length === 1;
    }, "parent Inbox retains one Go receipt", { id: initial.parent });
    const receipt = await page.evaluate((id) => {
      const snapshot = window.__typedCompositionDemo.manager.snapshot(id);
      const state = snapshot.state ?? snapshot.State;
      return state.Inbox?.[0] ?? state.inbox?.[0];
    }, initial.parent);
    assert.equal(receipt.Saved, "accepted over HTTP");
    assert.equal(receipt.ChildID, initial.child);
    assert.equal(receipt.Saves, 1);

    await page.locator(`[data-control-session="${initial.child}"] [data-action="dispose"]`).click();
    await waitFor(page, ({ id }) => !window.__typedCompositionDemo.host.tree().some((entry) => (entry.SessionID ?? entry.sessionID) === id),
      "child session disposed", { id: initial.child });
    assert.match(await page.locator(`[data-session-view="${initial.parent}"]`).textContent(), /Published: 1/);
    const retained = JSON.parse(await page.locator("#receipts-output").textContent());
    assert.equal(retained.length, 1);
    assert.equal(retained[0].Saved, "accepted over HTTP");

    await page.locator("#recreate-child").click();
    await waitFor(page, ({ oldID }) => {
      const demo = window.__typedCompositionDemo;
      const tree = demo.host.tree();
      const child = tree.find((entry) => (entry.ParentID ?? entry.parentID) === demo.initialIDs.parent);
      return child && (child.SessionID ?? child.sessionID) > oldID;
    }, "child recreated with a fresh session ID", { oldID: initial.child });
    const recreated = await page.evaluate(() => {
      const demo = window.__typedCompositionDemo;
      const tree = demo.host.tree();
      const child = tree.find((entry) => (entry.ParentID ?? entry.parentID) === demo.initialIDs.parent);
      const id = child.SessionID ?? child.sessionID;
      return { id, state: demo.manager.snapshot(id).state };
    });
    assert.ok(recreated.id > initial.child);
    assert.deepEqual(recreated.state.Rows, []);
    assert.match(await page.locator(`#receipts-output`).textContent(), /accepted over HTTP/);
    assert.deepEqual(pageErrors, [], `browser console errors: ${pageErrors.join("\n")}`);
    console.log(JSON.stringify({
      initial,
      recreatedID: recreated.id,
      receipt,
      rendererSequence,
      readonlyCompletion: "saved while read-only",
      http: "held request released through loopback HTTP lab",
      pageErrors,
    }));
  } catch (error) {
    operationFailed = true;
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    try {
      if (browser) {
        try { await browser.close(); }
        catch (error) { cleanupErrors.push(error); }
      }
    } finally {
      try {
        assertCleanHTTPProcessClose(await lab.close());
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    const finalError = retainPrimaryFailure(primaryError, cleanupErrors, operationFailed);
    if (!operationFailed && finalError) throw finalError;
    if (operationFailed && cleanupErrors.length) {
      for (const error of cleanupErrors) {
        console.error(`browser smoke cleanup also failed: ${error?.stack ?? error}`);
      }
    }
  }
}

await main();
