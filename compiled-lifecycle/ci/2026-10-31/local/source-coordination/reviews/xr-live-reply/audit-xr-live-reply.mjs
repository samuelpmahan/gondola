import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const rel = (path) => resolve(root, path);
const readJson = async (path) => JSON.parse(await readFile(rel(path), "utf8"));
const sha256 = async (path) => createHash("sha256").update(await readFile(rel(path))).digest("hex");
const originalNativePath = "compiled-lifecycle/coordination/live-reply/captures/native/stdout.log";
const originalCompiledPath = "compiled-lifecycle/coordination/live-reply/captures/compiled/stdout.log";
const rerunNativePath = "compiled-lifecycle/coordination/reviews/xr-live-reply/native-rerun.stdout.json";
const rerunCompiledPath = "compiled-lifecycle/coordination/reviews/xr-live-reply/compiled-rerun.stdout.json";
const instrumentedPath = "compiled-lifecycle/coordination/reviews/xr-live-reply/compiled-instrumented.stdout.json";
const native = await readJson(originalNativePath);
const compiled = await readJson(originalCompiledPath);
const rerunNative = await readJson(rerunNativePath);
const rerunCompiled = await readJson(rerunCompiledPath);
const instrumented = await readJson(instrumentedPath);
const originalNativeHash = await sha256(originalNativePath);
const originalCompiledHash = await sha256(originalCompiledPath);
assert.equal(await sha256(rerunNativePath), originalNativeHash, "native rerun differs from the frozen raw output");
assert.equal(await sha256(rerunCompiledPath), originalCompiledHash, "compiled rerun differs from the frozen raw output");
assert.deepEqual(rerunNative, native);
assert.deepEqual(rerunCompiled, compiled);

const pins = {
  "fixtures/compiled/lifecycle/app.go": "6b61e55c3046f58873d2774e38a7bca44769f18f6870c39e1885b78be340fe41",
  "fixtures/compiled/lifecycle/view.go": "afc4b1611c5dbd8e5264d3c124b808770bdd8579fdc1426c350f4df6689bb948",
  "fixtures/compiled/lifecycle/scenario.json": "45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650",
  "compiled-lifecycle/runtime/runtime.mjs": "9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed",
  "compiled-frontend/frontend/runtime/runtime.mjs": "42da6087f01acf712aa810556b4ca768dd306e595e8aaf95425cd3d24bd643e0",
  "compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/react/output/buildmanifest.json": "bee3a7810efcc4e9379776961bff22703a740695575c1981a1e8d7475df78603",
  "compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/execution.json": "b0b181c5044b829e4e6d305f8507c447a5e6d2addb29d05c6a1b528ed496976b",
  "compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/react/build-record.json": "36c962c08bece3b14d0d4ed2742bda23f6b758675254f90b7ef2041f3ddbbbb7",
  "compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/react/output/apps/lifecycle-7e6575d90707/app-ir.json": "341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d",
  "compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/react/output/apps/lifecycle-7e6575d90707/encoder.mjs": "521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4",
  "compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs": "dabbfaea0c8a27ec389008f0820f0b14578337acca6cb60bd491ed2394dc5c6c",
  "compiled-lifecycle/coordination/live-reply/native-live-reply-probe.go.txt": "0bb17bc85655ab904fba3f0fba0676e927fd3157a92a7bf9a2b86ceb14c51aa7",
  "compiled-lifecycle/coordination/live-reply/compiled-live-reply-probe.mjs": "8924ca8a36c7d525e4571a93cb0a8774595a8bd217a7a9bdc360b425ed35b42e",
  "compiled-lifecycle/coordination/live-reply/audit-live-reply-results.mjs": "1c733ee555dd94a7cab7eeffc9fd18889ede8da1fa6e626fd12313e1b3bcafbd",
  "compiled-lifecycle/coordination/live-reply/capture-command.mjs": "c5a652081ebd1cc16a1ce50e91aa4defe7dbc8b395586f92334b1f5de476a5e3",
};
for (const [path, hash] of Object.entries(pins)) assert.equal(await sha256(path), hash, `${path} hash differs from the frozen pin`);
const execution = await readJson("compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/execution.json");
assert.equal(execution.status, "passed");
assert.equal(execution.sourcePinsMatch, true);
assert.equal(compiled.componentID, "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle");
assert.equal(compiled.appDir, "/workspace/scratch/39a56936f173/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/react/output/apps/lifecycle-7e6575d90707");
assert.deepEqual(instrumented.trace, compiled.trace, "reviewer instrumentation changed execution trace");
assert.deepEqual(instrumented.effectRecords, compiled.effectRecords, "reviewer instrumentation changed effect records");

const oldTokens = ["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3"];
const liveTokens = ["sibling:g1:r4", "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7"];
const freshStage = compiled.stages.freshPendingBeforeOldReplies;
assert.deepEqual(Object.values(freshStage.state.nodes).map((node) => node.token), [
  "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7", "sibling:g1:r4",
]);
assert(Object.values(freshStage.state.nodes).every((node) => node.pending));
assert.deepEqual(freshStage.driverCorrelations.map((row) => [row.dispatchId, row.effectIndex, row.token]), [
  ["dispatch-0004", 0, "sibling:g1:r4"],
  ["dispatch-0007", 0, "parent:g2:r5"],
  ["dispatch-0008", 0, "child:g2:r6"],
  ["dispatch-0009", 0, "grandchild:g2:r7"],
]);
assert.deepEqual(freshStage.coreCorrelations, freshStage.driverCorrelations.map(({ dispatchId, effectIndex }) => ({ dispatchId, effectIndex })));

// The host trace records the complete typed encoded State and View at every tick.
// Ticks 9–12 are the fully pending generation-2 checkpoint and the three old
// direct Go completion messages. Compare full records, not summary booleans.
const directTicks = compiled.trace.ticks.slice(9, 13);
assert.deepEqual(directTicks.map((tick) => tick.message.arg), ["", ...oldTokens]);
for (const tick of directTicks.slice(1)) {
  assert.deepEqual(tick.state, directTicks[0].state);
  assert.deepEqual(tick.view, directTicks[0].view);
  assert.deepEqual(tick.requestedEffects, []);
  assert.deepEqual(tick.completedEffects, []);
}
assert.deepEqual(compiled.trace.ticks.slice(9, 13).map((tick) => tick.dispatchId), [
  "dispatch-0009", "dispatch-0010", "dispatch-0011", "dispatch-0012",
]);

// Re-run instrumented copy serializes exact before/after typed values and both
// host correlation tables around ordinary stale messages and retired callbacks.
assert.equal(instrumented.stages.directOldGoMessages.length, 3);
for (const [index, record] of instrumented.stages.directOldGoMessages.entries()) {
  assert.equal(record.token, oldTokens[index]);
  assert.deepEqual(record.beforeSnapshot.state, record.afterSnapshot.state);
  assert.deepEqual(record.beforeSnapshot.view, record.afterSnapshot.view);
  assert.deepEqual(record.beforeSnapshot.driverCorrelations, record.afterSnapshot.driverCorrelations);
  assert.deepEqual(record.beforeSnapshot.coreCorrelations, record.afterSnapshot.coreCorrelations);
  assert.deepEqual(record.afterSnapshot.state, directTicks[0].state);
  assert.deepEqual(record.afterSnapshot.view, directTicks[0].view);
  assert.equal(record.result.accepted, true);
  assert.equal(record.goTickCount.after, record.goTickCount.before + 1);
}
assert.deepEqual(instrumented.stages.forceDeliveryOfRetiredCallbacks.map((row) => row.token), oldTokens);
for (const [index, record] of instrumented.stages.forceDeliveryOfRetiredCallbacks.entries()) {
  assert.equal(record.result.accepted, false);
  assert.match(record.result.error, /unknown or extra effect completion/i);
  assert.deepEqual(record.result.correlation, { dispatchId: `dispatch-000${index + 1}`, effectIndex: 0 });
  assert.deepEqual(record.beforeSnapshot.state, record.afterSnapshot.state);
  assert.deepEqual(record.beforeSnapshot.view, record.afterSnapshot.view);
  assert.deepEqual(record.beforeSnapshot.driverCorrelations, record.afterSnapshot.driverCorrelations);
  assert.deepEqual(record.beforeSnapshot.coreCorrelations, record.afterSnapshot.coreCorrelations);
  assert.deepEqual(record.afterSnapshot.state, directTicks[0].state);
  assert.deepEqual(record.afterSnapshot.view, directTicks[0].view);
  assert.deepEqual(record.afterSnapshot.driverCorrelations, freshStage.driverCorrelations);
  assert.deepEqual(record.afterSnapshot.coreCorrelations, freshStage.coreCorrelations);
  assert.equal(record.goTickCount.before, record.goTickCount.after);
}

// The native capture stores full typed Go state after each stale message.
assert.deepEqual(native.staleDirectMessages.map((row) => row.token), oldTokens);
for (const row of native.staleDirectMessages) {
  assert.deepEqual(row.state, native.afterFreshRequests.state);
  assert.deepEqual(row.currentPendingTokens, ["parent:g2:r5", "child:g2:r6", "grandchild:g2:r7", "sibling:g1:r4"]);
  assert.equal(row.stateUnchanged, true);
  assert.equal(row.viewUnchanged, true);
  assert.equal(row.effectsEmpty, true);
}
assert.deepEqual(native.afterFreshRequests.state.Parent.Token, "parent:g2:r5");
assert.deepEqual(native.afterFreshRequests.state.Child.Token, "child:g2:r6");
assert.deepEqual(native.afterFreshRequests.state.Grandchild.Token, "grandchild:g2:r7");
assert.deepEqual(native.afterFreshRequests.state.Sibling.Token, "sibling:g1:r4");
assert.deepEqual(native.final.state.Parent.Reply, "parent:g2:r5");
assert.deepEqual(native.final.state.Child.Reply, "child:g2:r6");
assert.deepEqual(native.final.state.Grandchild.Reply, "grandchild:g2:r7");
assert.deepEqual(native.final.state.Sibling.Reply, "sibling:g1:r4");

assert.deepEqual(compiled.effectRecords.filter((row) => row.kind === "cancel").map((row) => row.token), [
  "grandchild:g1:r3", "child:g1:r2", "parent:g1:r1",
]);
assert.deepEqual(compiled.stages.freshRepliesStillAccepted.map((row) => row.token), [
  "grandchild:g2:r7", "child:g2:r6", "parent:g2:r5", "sibling:g1:r4",
]);
assert(compiled.stages.freshRepliesStillAccepted.every((row) => row.result.accepted));
assert.deepEqual(compiled.final.pending, []);
assert.deepEqual(compiled.final.corePending, []);

const result = {
  schema: "gobi.lifecycle-live-reply-independent-review/v1",
  decision: "accepted",
  frozenRawRerunMatches: true,
  sourceAndGeneratedModulePinsMatch: true,
  compiledTypedStateAndViewEqualAcrossThreeDirectStaleTicks: true,
  retiredCallbacks: {
    tokens: oldTokens,
    rejectedByRetiredCorrelationWithoutTicks: true,
    fullTypedStateViewAndDriverCoreCorrelationsUnchanged: true,
  },
  stillPendingDuringStaleAttempts: liveTokens,
  freshRepliesAccepted: compiled.stages.freshRepliesStillAccepted.map((row) => row.token),
  cancellationOrder: compiled.effectRecords.filter((row) => row.kind === "cancel").map((row) => row.token),
  scope: "native Go and actual compiled GoScript host headless probe; no DOM/browser claim",
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
