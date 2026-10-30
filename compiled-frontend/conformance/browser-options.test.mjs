import test from "node:test";
import assert from "node:assert/strict";

import { chromiumLaunchOptions } from "./browser.mjs";

test("uses Playwright-managed Chromium when no explicit executable is configured", () => {
  assert.deepEqual(chromiumLaunchOptions(undefined), {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
});

test("uses an explicit Chromium executable only when CHROMIUM_PATH is supplied", () => {
  assert.deepEqual(chromiumLaunchOptions("/tmp/chromium"), {
    headless: true,
    executablePath: "/tmp/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
});
