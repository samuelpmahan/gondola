import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "../../interaction/node_modules/playwright/index.mjs";

import { installNoWasmGuards } from "./no-wasm.mjs";

test("browser guard detects compilation and instantiation attempts instead of allowing fallback", async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? "/tmp/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    const guard = await installNoWasmGuards(page);
    await page.goto("data:text/html,<!doctype html><main id=app>JavaScript%20app</main>");
    assert.deepEqual(await guard.assertClear(), { wasmRequests: [], wasmAPIAttempts: [] });
    const blocked = await page.evaluate(() => {
      try {
        WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
        return false;
      } catch (error) {
        return String(error.message).includes("WebAssembly disabled by conformance driver");
      }
    });
    assert.equal(blocked, true);
    await assert.rejects(guard.assertClear(), /WebAssembly\.compile/);
  } finally {
    await browser.close();
  }
});

test("browser guard rejects WASM asset requests", async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? "/tmp/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    const guard = await installNoWasmGuards(page);
    await page.setContent("<!doctype html><main id=app>JavaScript app</main>");
    await page.evaluate(async () => { try { await fetch("https://gobi.invalid/attempt.wasm"); } catch { /* blocked by route */ } });
    await assert.rejects(guard.assertClear(), /attempt\.wasm/);
  } finally {
    await browser.close();
  }
});
