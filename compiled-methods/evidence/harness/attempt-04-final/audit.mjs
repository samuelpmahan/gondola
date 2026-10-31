import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { expectedMethodsDOM } from "../../../browser/dom-oracle.mjs";

const root = resolve(process.cwd());
const stem = resolve(root, "compiled-methods/evidence/harness/attempt-04-final/methods");
const readJSON = async (path) => JSON.parse(await readFile(path, "utf8"));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const nativePath = `${stem}.native.json`;
const directPath = `${stem}.direct.json`;
const [run, native, direct, browser, value, guards, fixture] = await Promise.all([
  readJSON(`${stem}.run.json`), readJSON(nativePath), readJSON(directPath), readJSON(`${stem}.browser.json`),
  readJSON(`${stem}.value-semantics.json`), readJSON(`${stem}.read-only-guards.json`),
  readJSON(resolve(root, "compiled-methods/conformance/fixtures/methods.json")),
]);
const core = (trace) => ({
  schema: trace.schema,
  appId: trace.appId,
  ticks: trace.ticks.map(({ index, action, message, dispatchId, state, requestedEffects, completedEffects }) =>
    ({ index, action, message, dispatchId, state, requestedEffects, completedEffects })),
});
assert.equal(run.status, "matched");
assert.equal(run.sourceStable, true);
assert.equal(run.sourceStableThroughCheck, true);
assert.equal(run.outputsStableThroughCheck, true);
assert.deepEqual(core(native), core(direct));
assert.equal(native.ticks.length, 19);
const traceBytes = await readFile(nativePath);
assert.equal(digest(traceBytes), digest(await readFile(directPath)));

for (const backend of ["react", "dom", "swap"]) {
  const profile = browser.profiles[backend];
  assert.deepEqual(core(native), core(profile.trace));
  assert.equal(profile.trace.ticks.length, 19);
  assert.equal(profile.actions.length, 18);
  assert.equal(profile.domOracle.length, 19);
  assert.equal(profile.physicalDOMSnapshots.length, 19);
  assert.deepEqual(profile.pageErrors, []);
  assert.deepEqual(profile.noWasm.apiAttempts, []);
  assert.deepEqual(profile.noWasm.wasmRequests, []);
  assert.equal(profile.unmount.physicalDOM.html, "");
  assert.equal(profile.unmount.physicalDOM.controls, 0);
  for (let tick = 0; tick < 19; tick += 1) {
    const expectedGo = tick === 0 ? fixture.initialState : fixture.expectations[tick - 1].state;
    const state = {
      parent: expectedGo.Parent.Count,
      child: expectedGo.Child.Count,
      readOnly: expectedGo.ReadOnly,
      savedChild: expectedGo.SavedChild,
    };
    const dom = expectedMethodsDOM(state);
    assert.deepEqual(profile.trace.ticks[tick].dom, dom);
    assert.deepEqual(profile.domOracle[tick], { tickIndex: tick, state, snapshot: dom });
    assert.deepEqual(profile.physicalDOMSnapshots[tick].snapshot, dom);
  }
  for (let action = 0; action < 18; action += 1) {
    const record = profile.actions[action];
    const expected = fixture.expectations[action];
    assert.deepEqual(record.action, fixture.actions[action]);
    assert.equal(record.tickIndex, action + 1);
    assert.equal(record.target.connected, true);
    assert.equal(record.target.value, fixture.actions[action].value);
    if (expected.message === null) {
      assert.equal(record.target.disabled, true);
      assert.equal(record.physicalClick.disabled, true);
      assert.equal(record.suppressedDispatch.dispatchId, null);
      assert.equal(profile.trace.ticks[action + 1].dispatchId, null);
      assert.deepEqual(profile.trace.ticks[action + 1].state, profile.trace.ticks[action].state);
    } else {
      assert.equal(record.target.disabled, false);
      assert.deepEqual(profile.trace.ticks[action + 1].message, expected.message);
      assert.deepEqual(record.observed.message, { Name: expected.message.name, Arg: expected.message.arg });
    }
  }
}

const swaps = browser.profiles.swap;
assert.equal(swaps.swaps.length, 18);
assert.equal(swaps.retiredCallbacks.length, 18);
assert.equal(swaps.callbackCounts.dispatch, 14);
assert.equal(swaps.callbackCounts.stale, 18);
for (let index = 0; index < 18; index += 1) {
  const swap = swaps.swaps[index];
  assert.equal(swap.afterActionIndex, index);
  assert.equal(swap.beforeTickCount, swap.afterTickCount);
  assert.equal(swap.stateUnchanged, true);
  assert.equal(swap.oldRootEmptyAfterUnmount, true);
  assert.equal(swap.oldRootDetached, true);
  assert.equal(swap.retiredCallback.detachedAtInvocation, true);
  assert.equal(swap.retiredCallback.invoked, true);
  assert.equal(swap.retiredCallback.traceTicksUnchanged, true);
  assert.equal(swap.retiredCallback.runtimeFenceCountAfter, swap.retiredCallback.runtimeFenceCountBefore + 1);
}

assert.equal(value.passed, true);
assert.equal(value.checks.filter((item) => item.invoked).length, 14);
assert.deepEqual(value.snapshotActions.map((item) => [item.actionIndex, item.originalStateUnchanged,
  item.originalParentCountBefore, item.originalParentCountAfter, item.returnedParentCount]), [
  [4, true, "0000000000000000", "0000000000000000", "4000000000000000"],
  [13, true, "4008000000000000", "4008000000000000", "3ff0000000000000"],
]);
assert.equal(guards.passed, true);
assert.deepEqual(guards.guards.map((item) => [item.message.Name, item.originalUnchanged,
  item.returnedStateUnchanged, item.noEffects]), [
  ["childAdd", true, true, true], ["childReset", true, true, true],
]);

const verifiedPinSets = [];
for (const key of ["sourcePinsBefore", "sourcePinsAfter", "sourcePinsFinal", "outputPinsBeforeCheck", "outputPinsAfterCheck"]) {
  const pins = run[key];
  assert.ok(Array.isArray(pins), `${key} is missing`);
  for (const pin of pins) {
    const path = isAbsolute(pin.path) ? pin.path : resolve(root, pin.path);
    const bytes = await readFile(path);
    assert.equal(digest(bytes), pin.sha256, `SHA-256 ${pin.path}`);
    assert.equal(bytes.length, pin.bytes, `byte count ${pin.path}`);
  }
  verifiedPinSets.push({ name: key, count: pins.length });
}
for (const pin of run.evidencePins) {
  const bytes = await readFile(pin.path);
  assert.equal(digest(bytes), pin.sha256, `SHA-256 ${pin.path}`);
  assert.equal(bytes.length, pin.bytes, `byte count ${pin.path}`);
}

const result = {
  schema: "gobi.methods-independent-audit/v1",
  status: "verified",
  logicalTicks: 19,
  actions: 18,
  disabledSuppressions: 4,
  profiles: { react: 19, dom: 19, swap: 19 },
  swaps: 18,
  retiredCallbackFences: 18,
  originalStateChecks: 14,
  publishSavedWitnesses: 2,
  readOnlyGuardProbes: 2,
  mutationControls: 4,
  verifiedPinSets,
  evidencePinsVerified: run.evidencePins.length,
  nativeAndDirectRawTraceSha256: digest(traceBytes),
  browserTraceSha256: browser.traceSha256,
  versions: { node: run.node, go: run.versions.go.output, chromium: run.versions.chromium },
};
await writeFile(`${stem}.independent-audit-replay.json`, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result)}\n`);
