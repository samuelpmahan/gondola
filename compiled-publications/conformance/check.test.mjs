import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertNative } from "./check.mjs";
import { assertNativeLiteral } from "../oracle/oracle.mjs";

const fixturePath = new URL("../../fixtures/compiled/publications/scenario.json", import.meta.url);
const expectationsPath = new URL("../oracle/expectations.json", import.meta.url);
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
let cachedInputs;

async function inputs() {
  if (cachedInputs) return cachedInputs;
  const [fixture, expectations] = await Promise.all([fixturePath, expectationsPath].map(async (path) =>
    JSON.parse(await readFile(path, "utf8"))));
  const go = process.env.GOBI_GO_BIN ?? process.env.GOBI_GO_EXECUTABLE ?? "go";
  const scenario = resolve(ROOT, "fixtures/compiled/publications/scenario.json");
  const capture = spawnSync(go, ["run", "./cmd/compiled-publications-native", "--script", scenario], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
  });
  assert.ifError(capture.error);
  assert.equal(capture.status, 0, `fresh native Go replay failed: ${capture.stderr}`);
  let native;
  try { native = JSON.parse(capture.stdout); }
  catch (error) { assert.fail(`fresh native Go replay did not emit JSON: ${error.message}\n${capture.stderr}`); }
  cachedInputs = { fixture, expectations, native };
  return cachedInputs;
}

test("real native Go trace matches the independent full state and view literals", async () => {
  const { fixture, expectations, native } = await inputs();
  assertNative(native, fixture, expectations);
  assertNativeLiteral(native);
  assert.equal(native.events.length, 50);
  assert.equal(native.steps.length, 45);
});

test("captured publication value, revision, generation, and queue order mutations fail", async () => {
  const { fixture, expectations, native } = await inputs();
  const cases = [
    (candidate) => { candidate.steps.find((step) => step.eventIndex === 4).state.Publications[0].Value += 1; },
    (candidate) => { candidate.steps.find((step) => step.eventIndex === 11).state.Input.Revision += 1; },
    (candidate) => { candidate.steps.find((step) => step.eventIndex === 24).state.Children[0].LastAcceptedPublication = 0; },
    (candidate) => {
      const queue = candidate.steps.find((step) => step.eventIndex === 16).state.Publications;
      [queue[0], queue[1]] = [queue[1], queue[0]];
    },
    (candidate) => { [candidate.steps[0], candidate.steps[1]] = [candidate.steps[1], candidate.steps[0]]; },
  ];
  for (const mutate of cases) {
    const candidate = structuredClone(native);
    mutate(candidate);
    assert.throws(() => assertNative(candidate, fixture, expectations));
  }
});
