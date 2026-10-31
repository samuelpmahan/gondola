import assert from "node:assert/strict";
import test from "node:test";
import { isChromiumVersionOutput } from "../browser-version.mjs";

test("accepts exact Chromium and Google Chrome for Testing version output", () => {
  for (const raw of [
    "Chromium 153.0.8010.0",
    "Google Chrome for Testing 156.0.8078.4",
  ]) {
    assert.equal(isChromiumVersionOutput(raw), true, raw);
  }
});

test("rejects empty, malformed, suffixed, or non-Chromium version output", () => {
  for (const raw of [
    "",
    "Chromium",
    "Chromium 153.0.8010",
    "Chromium 153.0.8010.0 dev",
    "Chromium v153.0.8010.0",
    "Google Chrome 156.0.8078.4",
    "Firefox 156.0.8078.4",
    "Chromium 01.0.8010.0",
    "Chromium 153.0.8010.9007199254740992",
    " Chromium 153.0.8010.0",
    "Chromium 153.0.8010.0\n",
  ]) {
    assert.equal(isChromiumVersionOutput(raw), false, JSON.stringify(raw));
  }
});
