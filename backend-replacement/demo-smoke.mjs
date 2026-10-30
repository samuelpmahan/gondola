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
  return { server, url: `http://127.0.0.1:${address.port}/backend-replacement/demo.html` };
}

async function waitForSnapshot(page, { backend, count, messages }) {
  await page.waitForFunction(({ expectedBackend, expectedCount, expectedMessages }) => {
    try {
      const runtime = JSON.parse(document.getElementById("runtime-snapshot").textContent);
      const reportedDOM = JSON.parse(document.getElementById("dom-snapshot").textContent);
      const root = document.getElementById("counter-root");
      return document.getElementById("active-backend").textContent === expectedBackend &&
        runtime.state?.Count === expectedCount && runtime.messages?.length === expectedMessages.length &&
        reportedDOM.html === root.innerHTML &&
        root.querySelector("p")?.textContent === `Count: ${expectedCount}`;
    } catch {
      return false;
    }
  }, { expectedBackend: backend, expectedCount: count, expectedMessages: messages }, { timeout: 10_000 });

  const observed = await page.evaluate(() => ({
    backend: document.getElementById("active-backend").textContent,
    runtime: JSON.parse(document.getElementById("runtime-snapshot").textContent),
    reportedDOM: JSON.parse(document.getElementById("dom-snapshot").textContent),
    actualHTML: document.getElementById("counter-root").innerHTML,
    actualCountText: document.querySelector("#counter-root p")?.textContent ?? null,
    error: document.getElementById("error").hidden ? null : document.getElementById("error").textContent,
  }));

  assert.equal(observed.backend, backend);
  assert.equal(observed.runtime.state.Count, count);
  assert.deepEqual(observed.runtime.messages.map(({ Name }) => Name), messages);
  assert.equal(observed.reportedDOM.html, observed.actualHTML, "reported DOM snapshot must match the live DOM");
  assert.equal(observed.actualCountText, `Count: ${count}`);
  assert.deepEqual(observed.reportedDOM.disabled, count === 0 ? ["2"] : []);
  assert.equal(observed.error, null);
  return observed;
}

function say(label, observation) {
  console.log(
    `PASS ${label}: backend=${observation.backend}, Count=${observation.runtime.state.Count}, ` +
    `messages=${observation.runtime.messages.length}, DOM matches`,
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
    await page.waitForFunction(() => document.getElementById("active-backend")?.textContent === "dom", null, {
      timeout: 30_000,
    });

    const steps = [
      {
        label: "initial DOM render",
        act: async () => {},
        backend: "dom",
        count: 0,
        messages: [],
      },
      {
        label: "first Add",
        act: async () => page.locator("#counter-root button.add").click(),
        backend: "dom",
        count: 1,
        messages: ["add"],
      },
      {
        label: "second Add",
        act: async () => page.locator("#counter-root button.add").click(),
        backend: "dom",
        count: 2,
        messages: ["add", "add"],
      },
      {
        label: "swap to React",
        act: async () => page.locator('[data-backend="react"]').click(),
        backend: "react",
        count: 2,
        messages: ["add", "add"],
      },
      {
        label: "Add on React",
        act: async () => page.locator("#counter-root button.add").click(),
        backend: "react",
        count: 3,
        messages: ["add", "add", "add"],
      },
      {
        label: "swap back to DOM",
        act: async () => page.locator('[data-backend="dom"]').click(),
        backend: "dom",
        count: 3,
        messages: ["add", "add", "add"],
      },
      {
        label: "Reset after swap",
        act: async () => page.locator("#counter-root button").nth(1).click(),
        backend: "dom",
        count: 0,
        messages: ["add", "add", "add", "reset"],
      },
    ];

    for (const step of steps) {
      await step.act();
      const observation = await waitForSnapshot(page, step);
      say(step.label, observation);
      if (pageErrors.length > 0) throw new Error(`browser errors:\n${pageErrors.join("\n")}`);
    }
    console.log("Demo smoke passed (7 states across DOM and React renderers).");
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
