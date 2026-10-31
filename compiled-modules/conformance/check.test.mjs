import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { assertNative } from "./check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURE_PATH = resolve(ROOT, "fixtures/compiled/moduleparent/scenario.json");
const GO = process.env.GOBI_GO_BIN ?? process.env.GOBI_GO_EXECUTABLE ?? "go";

async function freshNativeTrace() {
  const result = spawnSync(GO, ["run", "./cmd/compiled-modules-native", "--script", FIXTURE_PATH], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("native conformance assertion accepts a fresh Go CLI trace without reading author rawlogs", async () => {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  const trace = await freshNativeTrace();
  assert.equal(assertNative(trace, fixture).length, 16);
});

test("literal checker rejects typed state, tree and bridge-order faults in an actual Go capture", async () => {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  const trace = await freshNativeTrace();

  const badState = structuredClone(trace);
  badState.steps[0].childState.Counter.Count += 1;
  assert.throws(() => assertNative(badState, fixture));

  const badTree = structuredClone(trace);
  badTree.steps[1].parentView.tag = "aside";
  assert.throws(() => assertNative(badTree, fixture));

  const badBridgeOrder = structuredClone(trace);
  badBridgeOrder.steps[0].bridges.reverse();
  assert.throws(() => assertNative(badBridgeOrder, fixture));
});
