// Adversarial browser control: sampling must not hide focus lost after a swap.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateScenario } from "../../check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(resolve(ROOT, "interaction/package.json"));
const { chromium } = require("playwright");
const output = resolve(process.argv[2] ?? resolve(ROOT, "session-tree/build/root-focus-negative-post.json"));
const lab = spawn(resolve(ROOT, "http-effects/build/http-lab"), ["-addr", "127.0.0.1:0", "-root", ROOT]);
const lines = createInterface({ input: lab.stdout });
let browser;
try {
  const url = await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error("HTTP lab timeout")), 10_000);
    lines.once("line", (line) => {
      clearTimeout(timer);
      try { resolveReady(JSON.parse(line).url); } catch (error) { reject(error); }
    });
    lab.once("error", reject);
  });
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"],
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage();
  await page.goto(`${url}/session-tree/fixture.html`);
  await page.waitForFunction(() => globalThis.__sessionTreeFixture || globalThis.__sessionTreeStartupError);
  const result = await page.evaluate(async () => {
    const fixture = globalThis.__sessionTreeFixture;
    if (!fixture) throw new Error(globalThis.__sessionTreeStartupError);
    const original = fixture.candidate.host.replace;
    let injected = 0;
    fixture.candidate.host.replace = (...args) => {
      const value = original(...args);
      const active = document.activeElement;
      if (active?.tagName === "INPUT") { active.blur(); injected += 1; }
      return value;
    };
    try {
      const scenario = await fixture.runScenario({ name: "root-focus-loss-negative-control", seed: null, actions: [
        { kind: "root", name: "root", backend: "dom" },
        { kind: "add", name: "root" },
        { kind: "fill", name: "root", rowID: 1, value: "value" },
        { kind: "focus", name: "root", rowID: 1, start: 0, end: 0, direction: "none" },
        { kind: "replace", name: "root", backend: "react" },
      ] });
      return { injected, scenario };
    } finally { fixture.candidate.host.replace = original; }
  });
  const issues = validateScenario(result.scenario);
  const sha256 = {};
  for (const name of ["session-tree/check.mjs", "session-tree/fixture.mjs"]) {
    sha256[name] = createHash("sha256").update(await readFile(resolve(ROOT, name))).digest("hex");
  }
  await writeFile(output, `${JSON.stringify({ ...result, issues, sha256 }, null, 2)}\n`);
  console.log(JSON.stringify({ injected: result.injected, mismatchCount: issues.length,
    fields: issues.map((issue) => issue.field), output }));
  assert.equal(result.injected, 1, "control must actually blur the candidate input");
  assert.ok(issues.some((issue) => issue.field.includes("focus")), "checker accepted injected post-swap focus loss");
} finally {
  if (browser) await browser.close();
  lines.close();
  lab.kill("SIGTERM");
}
