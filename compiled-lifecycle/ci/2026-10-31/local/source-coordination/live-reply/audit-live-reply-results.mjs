import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const nativePath = resolve(root, "compiled-lifecycle/coordination/live-reply/captures/native/stdout.log");
const compiledPath = resolve(root, "compiled-lifecycle/coordination/live-reply/captures/compiled/stdout.log");
const native = JSON.parse(await readFile(nativePath, "utf8"));
const compiled = JSON.parse(await readFile(compiledPath, "utf8"));
const helpers = await import(pathToFileURL(resolve(root, "compiled-frontend/conformance/direct-js.mjs")).href);

function float64Hex(number) {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, number, false);
  return new DataView(buffer).getBigUint64(0, false).toString(16).padStart(16, "0");
}

function nativeSummary(state) {
  const result = {};
  for (const [name, node] of Object.entries({
    parent: state.Parent,
    child: state.Child,
    grandchild: state.Grandchild,
    sibling: state.Sibling,
  })) {
    result[name] = {
      id: node.ID,
      parentID: node.ParentID,
      generation: String(node.Generation),
      requestID: String(node.RequestID),
      alive: node.Alive,
      requested: node.Requested,
      pending: node.Pending,
      token: node.Token,
      reply: node.Reply,
      counterFloat64Bits: float64Hex(node.Counter.Count),
    };
  }
  return { nodes: result, nextRequestID: String(state.NextRequestID) };
}

function nativeViewRecord(view) {
  return { tree: helpers.recordGoNode(view), bindings: [] };
}

assert.equal(native.schema, "gobi.lifecycle-live-reply-native-probe/v1");
assert.equal(compiled.schema, "gobi.lifecycle-live-reply-compiled-probe/v1");
assert.equal(compiled.componentID, "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle");

const nativeFresh = native.afterFreshRequests;
const compiledFresh = compiled.stages.freshPendingBeforeOldReplies;
assert.deepEqual(nativeSummary(nativeFresh.state), compiledFresh.state);
assert.deepEqual(nativeViewRecord(nativeFresh.view), compiledFresh.view);
for (const node of Object.values(compiledFresh.state.nodes)) assert.equal(node.pending, true);

const expectedOld = ["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3"];
assert.deepEqual(native.staleDirectMessages.map((item) => item.token), expectedOld);
assert.deepEqual(compiled.stages.directOldGoMessages.map((item) => item.token), expectedOld);
for (const item of native.staleDirectMessages) {
  assert.equal(item.stateUnchanged, true);
  assert.equal(item.viewUnchanged, true);
  assert.equal(item.effectsEmpty, true);
  assert.deepEqual(item.currentPendingTokens, ["parent:g2:r5", "child:g2:r6", "grandchild:g2:r7", "sibling:g1:r4"]);
}
for (const item of compiled.stages.directOldGoMessages) {
  assert.equal(item.result.accepted, true);
  assert.equal(item.stateUnchanged, true);
  assert.equal(item.viewUnchanged, true);
  assert.equal(item.driverCorrelationsUnchanged, true);
  assert.equal(item.coreCorrelationsUnchanged, true);
}

assert.deepEqual(compiled.effectRecords.filter((item) => item.kind === "cancel").map((item) => item.token), [
  "grandchild:g1:r3", "child:g1:r2", "parent:g1:r1",
]);
assert.deepEqual(compiled.stages.forceDeliveryOfRetiredCallbacks.map((item) => item.token), expectedOld);
for (const item of compiled.stages.forceDeliveryOfRetiredCallbacks) {
  assert.equal(item.result.accepted, false);
  assert.equal(item.result.outcome, "rejected");
  assert.match(item.result.error, /unknown or extra effect completion/i);
  assert.equal(item.goTickCount.before, item.goTickCount.after);
  assert.equal(item.stateUnchanged, true);
  assert.equal(item.viewUnchanged, true);
  assert.equal(item.currentCorrelationsUnchanged, true);
}

const expectedReplies = ["grandchild:g2:r7", "child:g2:r6", "parent:g2:r5", "sibling:g1:r4"];
assert.deepEqual(native.final.state.Parent.Reply, "parent:g2:r5");
assert.deepEqual(native.final.state.Child.Reply, "child:g2:r6");
assert.deepEqual(native.final.state.Grandchild.Reply, "grandchild:g2:r7");
assert.deepEqual(native.final.state.Sibling.Reply, "sibling:g1:r4");
assert.deepEqual(compiled.stages.freshRepliesStillAccepted.map((item) => item.token), expectedReplies);
assert(compiled.stages.freshRepliesStillAccepted.every((item) => item.result.accepted));
assert.deepEqual(nativeSummary(native.final.state), compiled.final.state);
assert.deepEqual(nativeViewRecord(native.final.view), compiled.final.view);
assert.deepEqual(compiled.final.pending, []);
assert.deepEqual(compiled.final.corePending, []);

const result = {
  schema: "gobi.lifecycle-live-reply-cross-audit/v1",
  result: "confirmed",
  nativeCompiledGoAndActualCompiledGoScriptMatchAtFreshPendingAndFinalStates: true,
  nativeAndCompiledGoViewsMatchAtFreshPendingAndFinalStates: true,
  oldDirectGoCompletionMessagesLeaveFullStateViewAndPendingWorkUnchanged: expectedOld,
  oldRetiredCallbacksRejectedWithoutGoTicks: expectedOld,
  freshRequestsRemainPendingAcrossBothStalePaths: ["parent:g2:r5", "child:g2:r6", "grandchild:g2:r7", "sibling:g1:r4"],
  freshRepliesAccepted: expectedReplies,
  cancellationOrder: compiled.effectRecords.filter((item) => item.kind === "cancel").map((item) => item.token),
  scope: "headless compiled host probe; no browser DOM or broader matrix claim",
};
const outputPath = resolve(root, "compiled-lifecycle/coordination/live-reply/cross-audit.json");
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
