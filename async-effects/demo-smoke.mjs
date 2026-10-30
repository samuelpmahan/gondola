#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const requireFromInteraction = createRequire(resolve(REPO_ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".json", "application/json; charset=utf-8"],
]);

async function serve(request, response) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  } catch {
    response.writeHead(400);
    response.end("bad request");
    return;
  }
  const file = resolve(REPO_ROOT, `.${pathname}`);
  if (!file.startsWith(`${REPO_ROOT}${sep}`)) {
    response.writeHead(403);
    response.end("forbidden");
    return;
  }
  try {
    response.writeHead(200, {
      "content-type": MIME.get(extname(file)) ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end(`not found: ${pathname}`);
  }
}

async function startServer() {
  const server = createServer((request, response) => void serve(request, response));
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/async-effects/demo.html` };
}

async function observe(page, expected) {
  try {
    await page.waitForFunction((want) => {
      try {
        const runtime = JSON.parse(document.getElementById("runtime-snapshot").textContent);
        const dom = JSON.parse(document.getElementById("dom-snapshot").textContent);
        return document.getElementById("active-backend").textContent === want.backend &&
          Object.entries(want.state).every(([key, value]) => runtime.state?.[key] === value) &&
          dom.backend === want.backend && dom.html === document.getElementById("editor-root").innerHTML &&
          dom.inputValue === (document.querySelector('#editor-root input[type="text"]')?.value ?? null) &&
          document.getElementById("error").hidden;
      } catch {
        return false;
      }
    }, expected, { timeout: 5_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const root = document.getElementById("editor-root");
      let runtime = null;
      let rendered = null;
      try { runtime = JSON.parse(document.getElementById("runtime-snapshot").textContent); } catch {}
      try { rendered = JSON.parse(document.getElementById("dom-snapshot").textContent); } catch {}
      return {
        backend: document.getElementById("active-backend")?.textContent,
        banner: document.getElementById("error")?.textContent,
        runtime,
        rendered,
        hostSnapshot: window.__asyncExperiment?.host?.snapshot(),
        hostDOM: window.__asyncExperiment?.host?.domSnapshot(),
        transport: JSON.parse(document.getElementById("transport-log").textContent),
        actualHTML: root?.innerHTML,
        inputValue: root?.querySelector('input[type="text"]')?.value ?? null,
      };
    });
    throw new Error(`snapshot mismatch; expected ${JSON.stringify(expected)}\n${error.message}\n` +
      `live state:\n${JSON.stringify(diagnostics, null, 2)}`);
  }

  const observed = await page.evaluate(() => {
    const root = document.getElementById("editor-root");
    const input = root.querySelector('input[type="text"]');
    return {
      backend: document.getElementById("active-backend").textContent,
      runtime: JSON.parse(document.getElementById("runtime-snapshot").textContent),
      audit: JSON.parse(document.getElementById("completion-audit").textContent),
      transport: JSON.parse(document.getElementById("transport-log").textContent),
      rendered: JSON.parse(document.getElementById("dom-snapshot").textContent),
      actualHTML: root.innerHTML,
      inputValue: input?.value ?? null,
      saveDisabled: root.querySelector("button.save")?.disabled ?? null,
      resetDisabled: root.querySelector("button.reset")?.disabled ?? null,
      cancelDisabled: root.querySelector("button.cancel")?.disabled ?? null,
      error: document.getElementById("error").hidden ? null : document.getElementById("error").textContent,
    };
  });
  assert.equal(observed.rendered.html, observed.actualHTML, "reported HTML must equal live DOM");
  assert.equal(observed.inputValue, observed.runtime.state.Draft, "input value property must equal Go Draft");
  assert.deepEqual(observed.rendered.disabled,
    [
      ...(observed.runtime.state.Draft === "" ? ["3"] : []),
      ...(observed.runtime.state.Draft === "" && observed.runtime.state.Saved === "" &&
          observed.runtime.state.Saves === 0 && observed.runtime.state.Status === "idle" ? ["4"] : []),
      ...(observed.runtime.state.PendingID === 0 ? ["5"] : []),
    ]);
  assert.equal(observed.saveDisabled, observed.runtime.state.Draft === "");
  assert.equal(observed.cancelDisabled, observed.runtime.state.PendingID === 0);
  assert.equal(observed.error, null);
  return observed;
}

function log(label, observation) {
  const { state } = observation.runtime;
  console.log(`PASS ${label}: backend=${observation.backend}, status=${state.Status}, ` +
    `pending=${state.PendingID}, saved=${JSON.stringify(state.Saved)}, audit=${observation.audit.length}`);
}

async function waitForAudit(page, id, reason, accepted) {
  await page.waitForFunction(({ id: expectedID, reason: expectedReason, accepted: expectedAccepted }) => {
    try {
      const audit = JSON.parse(document.getElementById("completion-audit").textContent);
      return audit.some((entry) => entry.ID === expectedID && entry.Reason === expectedReason &&
        entry.Accepted === expectedAccepted);
    } catch {
      return false;
    }
  }, { id, reason, accepted }, { timeout: 5_000 });
}

async function main() {
  const { server, url } = await startServer();
  let browser;
  try {
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

    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => document.getElementById("active-backend")?.textContent === "dom", null, {
      timeout: 30_000,
    });

    const input = page.locator('#editor-root input[type="text"]');
    const expected = { backend: "dom", state: { Draft: "", Saved: "", Saves: 0, NextID: 0, PendingID: 0, Status: "idle" } };
    log("initial Go editor", await observe(page, expected));

    await input.fill("request A");
    await page.locator("#editor-root button.save").click();
    Object.assign(expected.state, { Draft: "request A", NextID: 1, PendingID: 1, Status: "pending" });
    log("manual request A starts", await observe(page, expected));

    await page.locator('[data-backend="react"]').click();
    expected.backend = "react";
    log("request A remains pending after renderer swap", await observe(page, expected));

    await input.fill("request B");
    await page.locator("#editor-root button.save").click();
    Object.assign(expected.state, { Draft: "request B", NextID: 2, PendingID: 2, Status: "pending" });
    const replacement = await observe(page, expected);
    const manualEvidence = resolve(HERE, "evidence");
    await mkdir(manualEvidence, { recursive: true });
    await page.screenshot({ path: resolve(manualEvidence, "demo-pending-swap.png"), fullPage: true });
    log("request B supersedes A after renderer swap", replacement);

    await page.locator('[data-reply-id="1"][data-reply-kind="success"]').click();
    Object.assign(expected.state, { PendingID: 2, Status: "pending" });
    const lateA = await observe(page, expected);
    await waitForAudit(page, 1, "stale", false);
    assert.equal(lateA.runtime.state.Saved, "");
    log("late A reply is recorded and ignored", lateA);

    await page.locator('[data-reply-id="2"][data-reply-kind="success"]').click();
    Object.assign(expected.state, { Saved: "request B", Saves: 1, PendingID: 0, Status: "saved" });
    const savedB = await observe(page, expected);
    await waitForAudit(page, 2, "saved", true);
    log("current B reply is accepted", savedB);

    await page.locator('[data-reply-id="2"][data-reply-kind="duplicate"]').click();
    const duplicateB = await observe(page, expected);
    await waitForAudit(page, 2, "stale", false);
    assert.equal(duplicateB.runtime.state.Saved, "request B", "duplicate B cannot overwrite the accepted value");
    log("duplicate B reply is ignored", duplicateB);

    await input.fill("request C");
    await page.locator("#editor-root button.save").click();
    Object.assign(expected.state, { Draft: "request C", NextID: 3, PendingID: 3, Status: "pending" });
    log("manual request C starts", await observe(page, expected));
    await page.locator("#editor-root button.cancel").click();
    Object.assign(expected.state, { PendingID: 0, Status: "cancelled" });
    log("request C is canceled", await observe(page, expected));
    await page.locator("#editor-root button.reset").click();
    Object.assign(expected.state, { Draft: "", Saved: "", Saves: 0, Status: "idle" });
    log("reset clears the canceled editor but keeps IDs monotonic", await observe(page, expected));
    await page.locator('[data-reply-id="3"][data-reply-kind="success"]').click();
    const lateC = await observe(page, expected);
    await waitForAudit(page, 3, "stale", false);
    assert.equal(lateC.runtime.state.NextID, 3);
    assert.equal(lateC.runtime.state.Saved, "", "late C reply cannot undo reset");
    log("late C reply after cancel and reset is ignored", lateC);

    await page.locator("#auto-reply").check();
    await input.fill("timed save");
    await page.locator("#editor-root button.save").click();
    await page.locator('[data-backend="dom"]').click();
    expected.backend = "dom";
    Object.assign(expected.state, { Draft: "timed save", NextID: 4, PendingID: 4, Status: "pending" });
    log("timer request stays pending through an immediate renderer swap", await observe(page, expected));
    await page.waitForFunction(() => {
      try {
        const runtime = JSON.parse(document.getElementById("runtime-snapshot").textContent);
        const events = JSON.parse(document.getElementById("transport-log").textContent);
        return runtime.state?.PendingID === 0 && runtime.state?.Saved === "timed save" &&
          events.some((event) => event.kind === "reply" && event.transport === "timer");
      } catch {
        return false;
      }
    }, null, { timeout: 5_000 });
    Object.assign(expected.state, { PendingID: 0, Status: "saved", Saved: "timed save", Saves: 1 });
    const timed = await observe(page, expected);
    await waitForAudit(page, 4, "saved", true);
    assert.ok(timed.transport.some((event) => event.kind === "start" && event.transport === "timer"));
    log("setTimeout reply is accepted after the renderer swap", timed);

    await page.locator("#auto-reply").uncheck();
    await input.fill("retry me");
    await page.locator("#editor-root button.save").click();
    Object.assign(expected.state, { Draft: "retry me", NextID: 5, PendingID: 5, Status: "pending" });
    await observe(page, expected);
    await page.locator('[data-reply-id="5"][data-reply-kind="error"]').click();
    Object.assign(expected.state, { PendingID: 0, Status: "error: demo transport rejected the save" });
    const failed = await observe(page, expected);
    await waitForAudit(page, 5, "error", true);
    assert.equal(failed.runtime.state.Saved, "timed save", "error must preserve the previous saved result");
    log("rejected reply preserves the previous saved result", failed);

    await page.locator("#editor-root button.save").click();
    Object.assign(expected.state, { NextID: 6, PendingID: 6, Status: "pending" });
    await observe(page, expected);
    await page.locator('[data-reply-id="6"][data-reply-kind="success"]').click();
    Object.assign(expected.state, { Saved: "retry me", Saves: 2, PendingID: 0, Status: "saved" });
    const retried = await observe(page, expected);
    await waitForAudit(page, 6, "saved", true);
    log("retry receives a new request ID", retried);

    assert.deepEqual(pageErrors, [], `browser errors:\n${pageErrors.join("\n")}`);
    console.log("Async-effects demo smoke passed: manual stale/error/duplicate replies, reset, timer delivery, and live DOM matched.");
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
