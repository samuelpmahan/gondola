import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNativeLiteral, ORACLE_EXPECTATIONS } from "./oracle.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const nativeGo = process.env.GOBI_GO_BIN ?? "go";

function runFreshNative() {
  const result = spawnSync(nativeGo, ["run", "./cmd/compiled-publications-native", "--script", "fixtures/compiled/publications/scenario.json"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || `native CLI exit=${result.status}`);
  return JSON.parse(result.stdout);
}

function stepAt(trace, eventIndex) {
  const step = trace.steps.find((candidate) => candidate.eventIndex === eventIndex);
  assert.ok(step, `native trace has no step for source event ${eventIndex}`);
  return step;
}

test("fresh native Go execution matches the independent literal checkpoints", () => {
  const native = runFreshNative();
  assert.equal(assertNativeLiteral(native), true);
  assert.equal(native.events.length, 50);
  assert.equal(native.steps.length, 45);
  assert.equal(ORACLE_EXPECTATIONS.stateProjections.length, 46);
});

test("oracle pins capture immutability and stale revision rejection", () => {
  const native = runFreshNative();
  const capture = stepAt(native, 3).state;
  const edited = stepAt(native, 4).state;
  assert.equal(capture.Publications[0].Value, 4);
  assert.equal(edited.Children.find((child) => child.Key === "oak").Counter.Count, 7);
  assert.equal(edited.Publications[0].Value, 4);
  const stale = stepAt(native, 21).state;
  assert.equal(stale.Input.Revision, 5);
  assert.equal(stale.LastDecision, "rejected:stale-input:1");
  assert.equal(stale.Parent.Rejected, 2);
  assert.deepEqual(stale.Publications, []);
});

test("literal delivery schedule rejects older IDs and reused generations", () => {
  const native = runFreshNative();
  const newestFirst = stepAt(native, 18).state;
  assert.equal(newestFirst.LastDecision, "accepted:oak:3");
  assert.equal(newestFirst.Children.find((child) => child.Key === "oak").LastAcceptedPublication, 3);
  const olderNext = stepAt(native, 19).state;
  assert.equal(olderNext.LastDecision, "rejected:stale-id:2");
  const reusedKey = stepAt(native, 34).state;
  assert.equal(reusedKey.Children.find((child) => child.Key === "elm").Generation, 4);
  assert.equal(stepAt(native, 35).state.LastDecision, "rejected:child-generation:5");
  assert.equal(stepAt(native, 37).state.LastDecision, "accepted:elm:6");
});

test("parent removal cancels children in reverse order and remount fences the old parent", () => {
  const native = runFreshNative();
  const removal = stepAt(native, 42);
  assert.deepEqual(removal.effects.map((effect) => effect.arg), [
    "child:elm:g4:r1", "child:oak:g2:r2", "parent:g1:r2",
  ]);
  assert.equal(removal.state.Parent.Alive, false);
  assert.deepEqual(removal.state.Children, []);
  assert.equal(removal.state.Publications[0].ID, 7);
  const remount = stepAt(native, 43).state;
  assert.equal(remount.Parent.Generation, 5);
  assert.deepEqual(remount.Publications.map((item) => item.ID), [7]);
  assert.equal(stepAt(native, 46).state.LastDecision, "rejected:parent-generation:7");
  assert.equal(stepAt(native, 47).state.LastDecision, "accepted:oak:8");
});

test("literal checker rejects mutations to state, view and ordered effects", () => {
  const native = runFreshNative();
  const cases = [
    ["captured snapshot", (candidate) => { stepAt(candidate, 4).state.Publications[0].Value = 7; }],
    ["child generation", (candidate) => { stepAt(candidate, 35).state.Children[1].Generation = 3; }],
    ["input revision", (candidate) => { stepAt(candidate, 21).state.Input.Revision = 2; }],
    ["view order", (candidate) => { [stepAt(candidate, 17).view.kids[1], stepAt(candidate, 17).view.kids[2]] = [stepAt(candidate, 17).view.kids[2], stepAt(candidate, 17).view.kids[1]]; }],
    ["cancellation order", (candidate) => { stepAt(candidate, 42).effects.reverse(); }],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(native);
    mutate(candidate);
    assert.throws(() => assertNativeLiteral(candidate), /differs from independent literal expectation/, label);
  }
});

test("published expectation file is the complete immutable oracle consumed by the checker", () => {
  const serialized = JSON.parse(readFileSync(resolve(root, "compiled-publications/oracle/expectations.json"), "utf8"));
  assert.deepEqual(serialized, ORACLE_EXPECTATIONS);
  assert.equal(serialized.schema, "gobi.compiled-publications-oracle-expectations/v1");
  assert.equal(serialized.events.length, 50);
  assert.equal(serialized.stateProjections.length, 46);
  assert.deepEqual(serialized.events.filter((event) => event.stepIndex === null).map((event) => event.eventIndex), [6, 7, 26, 27, 28]);
});
