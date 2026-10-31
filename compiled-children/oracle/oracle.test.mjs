import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ORACLE_EXPECTATIONS,
  ORACLE_SCENARIO,
  ORACLE_STATES,
  assertNativeCapture,
  eventExpectation,
  expectedProjection,
  assertProjection,
} from "./oracle.mjs";

const fixtureScenario = JSON.parse(readFileSync(new URL("../../fixtures/compiled/children/scenario.json", import.meta.url), "utf8"));
const expectationsJSON = JSON.parse(readFileSync(new URL("./expectations.json", import.meta.url), "utf8"));
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

function captureFreshNativeTrace() {
  const command = process.env.GOBI_GO_EXECUTABLE || "go";
  const result = spawnSync(command, ["run", "./cmd/compiled-children-native", "--script", "fixtures/compiled/children/scenario.json"], {
    cwd: repositoryRoot,
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
  });
  if (result.error || result.status !== 0) {
    const stderr = result.stderr?.toString("utf8").trim();
    throw new Error(`fresh native Go trace failed (${command}): ${result.error?.message ?? (stderr || `exit ${result.status}`)}`);
  }
  if (process.env.GOBI_COMPILED_CHILDREN_NATIVE_CAPTURE) {
    const capturePath = process.env.GOBI_COMPILED_CHILDREN_NATIVE_CAPTURE;
    mkdirSync(dirname(capturePath), { recursive: true });
    writeFileSync(capturePath, result.stdout);
  }
  try {
    return JSON.parse(result.stdout.toString("utf8"));
  } catch (error) {
    throw new Error(`fresh native Go trace was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const nativeCapture = captureFreshNativeTrace();

test("literal schedule covers keyed moves, key reuse, clear, remove, and renderer probes", () => {
  assert.equal(ORACLE_SCENARIO.events.length, 42);
  assert.equal(ORACLE_STATES.length, 39);
  assert.deepEqual(ORACLE_SCENARIO.events.slice(7, 13).map((event) => event.kind), [
    "click", "click", "disabled-action", "renderer-swap", "stale-callback", "renderer-swap",
  ]);
  assert.equal(eventExpectation(8).stateIndex, 9);
  assert.equal(eventExpectation(9).stateIndex, 9);
  assert.equal(eventExpectation(10).stateIndex, 9);
  assert.equal(eventExpectation(11).stateIndex, 9);
  assert.equal(eventExpectation(12).stateIndex, 9);
  assert.equal(eventExpectation(13).stateIndex, 10);
  assert.equal(ORACLE_STATES[0].Children.map((child) => `${child.Key}:g${child.Generation}`).join(","), "oak:g2,elm:g3");
  assert.equal(ORACLE_STATES[9].Children.map((child) => child.Key).join(","), "ash,oak,elm");
  assert.deepEqual(ORACLE_STATES[9].Children.map((child) => [child.Key, child.Counter.Count, child.Token]), [
    ["ash", 0, "child:ash:g4:r1"], ["oak", 1, "child:oak:g2:r1"], ["elm", 1, "child:elm:g3:r1"],
  ]);
  assert.deepEqual(ORACLE_STATES[11].Children.map((child) => [child.Key, child.Token]), [
    ["ash", "child:ash:g4:r1"], ["elm", "child:elm:g3:r1"],
  ]);
  assert.equal(ORACLE_STATES[12].Children.find((child) => child.Key === "oak").Generation, 5);
  assert.deepEqual(ORACLE_STATES[13], ORACLE_STATES[14], "old oak reply must not alter the reused oak generation");
  assert.equal(ORACLE_STATES[21].Children.length, 0);
  assert.equal(ORACLE_STATES[21].Parent.Pending, true);
  assert.equal(ORACLE_STATES[28].Parent.Alive, false);
  assert.equal(ORACLE_STATES[32].Parent.Generation, 8);
  assert.equal(ORACLE_STATES[32].Children.length, 0);
});

test("independent scenario matches the Go native driver's event script", () => {
  assert.deepEqual(ORACLE_SCENARIO, fixtureScenario);
});

test("checked-in expectations JSON is reproducible from the manual oracle", () => {
  assert.deepEqual(expectationsJSON, ORACLE_EXPECTATIONS);
});

test("native Go trace matches all independent state, Gobi tree, effects, and tick expectations", () => {
  assert.equal(assertNativeCapture(nativeCapture), true);
});

test("native capture checker rejects child-first cancellation order mutations", () => {
  const capture = structuredClone(nativeCapture);
  const removal = capture.steps.find((step) => step.eventIndex === 31);
  removal.effects.reverse();
  assert.throws(() => assertNativeCapture(capture), /effects/);
});

test("independent capture checker rejects a reordered Go value slice", () => {
  const capture = expectedProjection(9);
  assert.doesNotThrow(() => assertProjection(capture, 9));
  capture.state.Children.reverse();
  assert.throws(() => assertProjection(capture, 9), /state/);
});

test("independent capture checker rejects a mutated Gobi keyed tree", () => {
  const capture = expectedProjection(9);
  assert.doesNotThrow(() => assertProjection(capture, 9));
  capture.view.kids[1].kids[0].key = "child-oak";
  assert.throws(() => assertProjection(capture, 9), /view/);
});

test("independent capture checker rejects a mutated DOM projection", () => {
  const capture = expectedProjection(9);
  assert.doesNotThrow(() => assertProjection(capture, 9));
  capture.dom.html = capture.dom.html.replace("Child ash generation 4", "Child oak generation 2");
  assert.throws(() => assertProjection(capture, 9), /dom/);
});

test("literal effect expectations isolate cancellation and generation-scoped tokens", () => {
  assert.deepEqual(eventExpectation(14).effects, [
    { kind: "lifecycle.cancel", name: "cancel", arg: "child:oak:g2:r1", reply: "" },
  ]);
  assert.deepEqual(eventExpectation(24).effects, [
    { kind: "lifecycle.cancel", name: "cancel", arg: "child:oak:g5:r2", reply: "" },
    { kind: "lifecycle.cancel", name: "cancel", arg: "child:elm:g3:r2", reply: "" },
  ]);
  assert.deepEqual(eventExpectation(31).effects, [
    { kind: "lifecycle.cancel", name: "cancel", arg: "child:oak:g7:r1", reply: "" },
    { kind: "lifecycle.cancel", name: "cancel", arg: "child:pine:g6:r1", reply: "" },
    { kind: "lifecycle.cancel", name: "cancel", arg: "parent:g1:r2", reply: "" },
  ]);
});
