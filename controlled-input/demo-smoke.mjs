#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
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
  return { server, url: `http://127.0.0.1:${address.port}/controlled-input/demo.html` };
}

async function observe(page, expected) {
  try {
    await page.waitForFunction(({ draft, saved, saves, messageCount, backend }) => {
      try {
        const runtime = JSON.parse(document.getElementById("runtime-snapshot").textContent);
        const actual = JSON.parse(document.getElementById("dom-snapshot").textContent);
        return document.getElementById("active-backend").textContent === backend &&
          runtime.state?.Draft === draft && runtime.state?.Saved === saved &&
          runtime.state?.Saves === saves && runtime.messages?.length === messageCount &&
          actual.backend === backend && actual.html === document.getElementById("editor-root").innerHTML &&
          actual.inputValue === (document.querySelector('#editor-root input[type="text"]')?.value ?? null);
      } catch {
        return false;
      }
    }, expected, { timeout: 5_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const root = document.getElementById("editor-root");
      const input = root.querySelector('input[type="text"]');
      let runtime = null;
      let rendered = null;
      try { runtime = JSON.parse(document.getElementById("runtime-snapshot").textContent); } catch {}
      try { rendered = JSON.parse(document.getElementById("dom-snapshot").textContent); } catch {}
      return {
        backend: document.getElementById("active-backend")?.textContent,
        banner: document.getElementById("error")?.textContent,
        runtime,
        rendered,
        actualHTML: root.innerHTML,
        inputValue: input?.value ?? null,
        inputAttributeValue: input?.getAttribute("value") ?? null,
        inputFocused: input === document.activeElement,
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
      rendered: JSON.parse(document.getElementById("dom-snapshot").textContent),
      actualHTML: root.innerHTML,
      inputValue: input?.value ?? null,
      saveDisabled: root.querySelector("button.save")?.disabled ?? null,
      resetDisabled: root.querySelector("button.reset")?.disabled ?? null,
      savedText: root.querySelectorAll("p")[0]?.textContent ?? null,
      savesText: root.querySelectorAll("p")[1]?.textContent ?? null,
      error: document.getElementById("error").hidden ? null : document.getElementById("error").textContent,
    };
  });

  assert.equal(observed.backend, expected.backend);
  assert.deepEqual(observed.runtime.state, { Draft: expected.draft, Saved: expected.saved, Saves: expected.saves });
  assert.equal(observed.runtime.messages.length, expected.messageCount);
  if (expected.messages) {
    assert.deepEqual(observed.runtime.messages, expected.messages,
      "ordered Go message history must match after every action");
  }
  assert.equal(observed.rendered.backend, expected.backend);
  assert.equal(observed.rendered.html, observed.actualHTML, "reported HTML must equal live DOM");
  assert.deepEqual(observed.rendered.disabled, [
    ...(expected.draft === "" ? ["3"] : []),
    ...(expected.draft === "" && expected.saved === "" && expected.saves === 0 ? ["4"] : []),
  ]);
  assert.equal(observed.inputValue, expected.draft, "the actual input value property must match Go Draft");
  assert.equal(observed.saveDisabled, expected.draft === "");
  assert.equal(observed.resetDisabled,
    expected.draft === "" && expected.saved === "" && expected.saves === 0);
  assert.equal(observed.savedText, `Saved: ${expected.saved}`);
  assert.equal(observed.savesText, `Saves: ${expected.saves}`);
  assert.equal(observed.error, null);
  assert.deepEqual(observed.runtime.bindings, [
    { Path: "0", Event: "input", Message: "edit", Source: "target.value" },
  ]);
  return observed;
}

function log(label, observation) {
  console.log(
    `PASS ${label}: backend=${observation.backend}, draft=${JSON.stringify(observation.runtime.state.Draft)}, ` +
    `saved=${JSON.stringify(observation.runtime.state.Saved)}, saves=${observation.runtime.state.Saves}, ` +
    `messages=${observation.runtime.messages.length}, live DOM matches`,
  );
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
    try {
      await page.waitForFunction(() => document.getElementById("active-backend")?.textContent === "dom", null, {
        timeout: 30_000,
      });
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        backend: document.getElementById("active-backend")?.textContent,
        banner: document.getElementById("error")?.textContent,
        runtime: document.getElementById("runtime-snapshot")?.textContent,
        actualHTML: document.getElementById("editor-root")?.innerHTML,
        wasmAPI: typeof globalThis.gobiEditor,
      }));
      throw new Error(`editor startup failed: ${error.message}\n${JSON.stringify(diagnostics, null, 2)}\n` +
        `browser errors:\n${pageErrors.join("\n")}`);
    }

    const messages = [];
    const expected = { backend: "dom", draft: "", saved: "", saves: 0, messageCount: 0, messages };
    log("initial DOM editor", await observe(page, expected));

    await page.locator('#editor-root input[type="text"]').pressSequentially("draft");
    for (const part of ["d", "dr", "dra", "draf", "draft"]) {
      messages.push({ Name: "edit", Arg: part });
    }
    Object.assign(expected, { draft: "draft", messageCount: messages.length });
    log("ordinary DOM typing", await observe(page, expected));

    await page.locator('[data-backend="react"]').click();
    expected.backend = "react";
    log("swap with an unsaved draft", await observe(page, expected));

    const reactInput = page.locator('#editor-root input[type="text"]');
    // A renderer swap remounts the input and caret preservation across that
    // boundary is outside this milestone. Place the caret at the end before
    // continuing the unsaved draft edit in the new renderer.
    await reactInput.press("End");
    await reactInput.pressSequentially("!");
    messages.push({ Name: "edit", Arg: "draft!" });
    Object.assign(expected, { draft: "draft!", messageCount: messages.length });
    const reactEditObservation = await observe(page, expected);
    log("ordinary React typing", reactEditObservation);
    await page.screenshot({ path: resolve(HERE, "evidence/E6-after-react-edit.png"), fullPage: true });

    await page.locator("#editor-root button.save").click();
    messages.push({ Name: "save", Arg: "" });
    Object.assign(expected, { saved: "draft!", saves: 1, messageCount: messages.length });
    log("save exact draft", await observe(page, expected));

    await page.locator("#editor-root button.save").click();
    messages.push({ Name: "save", Arg: "" });
    Object.assign(expected, { saves: 2, messageCount: messages.length });
    log("repeat save", await observe(page, expected));

    await page.locator('[data-backend="dom"]').click();
    expected.backend = "dom";
    log("swap back with saved state", await observe(page, expected));

    await page.locator("#editor-root button.reset").click();
    messages.push({ Name: "reset", Arg: "" });
    Object.assign(expected, { draft: "", saved: "", saves: 0, messageCount: messages.length });
    log("reset after renderer swap", await observe(page, expected));

    const actualMessages = await page.evaluate(() => JSON.parse(
      document.getElementById("runtime-snapshot").textContent,
    ).messages);
    assert.deepEqual(actualMessages, messages, "ordered Go message history must survive renderer swaps");
    assert.deepEqual(actualMessages.map(({ Name }) => Name), [
      "edit", "edit", "edit", "edit", "edit", "edit", "save", "save", "reset",
    ]);
    if (pageErrors.length > 0) throw new Error(`browser errors:\n${pageErrors.join("\n")}`);
    console.log("Demo smoke passed (8 observed states, ordinary typing in both renderers, one Go session).");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose, reject) => {
      server.close((error) => error ? reject(error) : resolveClose());
    });
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
