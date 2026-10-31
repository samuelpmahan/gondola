import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

const [attemptArg, evidenceDirArg] = process.argv.slice(2);
if (!attemptArg || !evidenceDirArg) {
  throw new Error("usage: node audit-ci-order.mjs <extracted-attempt-dir> <ci-evidence-dir>");
}

const attempt = resolve(attemptArg);
const evidenceDir = resolve(evidenceDirArg);
const readJSON = async (path) => JSON.parse(await readFile(path, "utf8"));
const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashFile = async (path) => hashBytes(await readFile(path));
const file = (path) => resolve(attempt, path);
const decodeGobiValue = (value) => {
  if (value.kind === "struct") return Object.fromEntries(value.fields.map(({ name, value: child }) => [name, decodeGobiValue(child)]));
  if (value.kind === "slice") return value.items.map(decodeGobiValue);
  if (value.kind === "string") return value.string;
  if (value.kind === "bool") return value.bool;
  if (value.kind === "uint" || value.kind === "int") return Number(value.integer);
  if (value.kind === "float64") return Buffer.from(value.float64Bits, "hex").readDoubleBE(0);
  throw new TypeError(`unsupported typed GoScript value kind ${value.kind}`);
};
const expectTraceProjection = (trace) => trace.ticks.map(({ index, message, dispatchId, state, requestedEffects, completedEffects, view }) =>
  ({ index, message, dispatchId, state, requestedEffects, completedEffects, view }));

const artifacts = await readJSON(resolve(evidenceDir, "artifacts-push-41178420647.json"));
const finalRun = await readJSON(resolve(evidenceDir, "run-push-41178420647-final.json"));
const jobs = await readJSON(resolve(evidenceDir, "jobs-push-41178420647-final.json"));
const artifact = artifacts.artifacts.find(({ id }) => id === 13034915662);
assert.ok(artifact, "primary workflow artifact ID is missing");
assert.equal(artifact.name, "gobi-compiled-lifecycle-artifacts");
assert.equal(artifact.size_in_bytes, 47035803);
assert.equal(artifact.digest, "sha256:6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4");
assert.equal(artifact.workflow_run.id, 41178420647);
assert.equal(artifact.workflow_run.head_sha, "49cc2b96c8817a47319d5b7bd484184a22fa984b");
assert.equal(finalRun.id, 41178420647);
assert.equal(finalRun.head_sha, "49cc2b96c8817a47319d5b7bd484184a22fa984b");
assert.equal(finalRun.status, "completed");
assert.equal(finalRun.conclusion, "failure");
assert.equal(jobs.jobs.length, 1);
assert.equal(jobs.jobs[0].conclusion, "failure");

const matrix = file("matrix");
const run = await readJSON(resolve(matrix, "lifecycle.run.json"));
const failure = await readJSON(resolve(matrix, "lifecycle.failed.json"));
const nativeStandalone = await readJSON(resolve(matrix, "native-cli.json"));
const direct = await readJSON(resolve(matrix, "lifecycle.direct.json"));
const browser = await readJSON(resolve(matrix, "lifecycle.browser.capture.json"));
const runtimeTests = await readFile(file("logs/lifecycle-compiled-runtime-tests.stdout.log"), "utf8");
const execution = await readJSON(file("execution.json"));

assert.equal(run.status, "rejected");
assert.equal(run.sourceStableThroughCheck, true);
assert.equal(run.buildOutputsStableThroughCheck, true);
assert.equal(run.sourcePinsBefore.length, 178);
assert.deepEqual(run.sourcePinsBefore, run.sourcePinsAfter);
assert.deepEqual(run.sourcePinsAfter, run.sourcePinsFinal);
assert.equal(run.buildOutputPinsBeforeCheck.length, 8);
assert.deepEqual(run.buildOutputPinsBeforeCheck, run.buildOutputPinsAfterCheck);
assert.equal(run.stages.find(({ name }) => name === "native-go-script-cli-replay")?.status, "failed");
assert.equal(run.stages.find(({ name }) => name === "direct-emitted-module-replay")?.status, "completed");
assert.equal(run.stages.find(({ name }) => name === "react-dom-and-alternating-swap-browser-profiles")?.status, "completed");
assert.match(run.failures[0].message, /spawnSync \/home\/runner\/work\/gondola\/gondola\/go ENOENT/);
assert.deepEqual(run.nativeCommand, [
  "/home/runner/work/gondola/gondola/go", "run", "./cmd/compiled-lifecycle-native", "--script",
  "/home/runner/work/gondola/gondola/fixtures/compiled/lifecycle/scenario.json",
]);
assert.ok(!("check" in run.outputPaths) || !(await exists(resolve(matrix, "lifecycle.check.json"))),
  "a full lifecycle check unexpectedly exists despite native-stage failure");
assert.equal(await exists(resolve(matrix, "lifecycle.native.json")), false,
  "a native lifecycle trace unexpectedly exists despite native-stage failure");
assert.equal(failure.stages.find(({ name }) => name === "native-go-script-cli-replay")?.error?.message,
  run.failures[0].message);
assert.deepEqual(failure.errors.map(({ message }) => message), [
  run.failures[0].message,
  "full conformance check withheld because a required evidence stage failed",
]);

const expectedEvidencePins = new Map([
  ["compiled-lifecycle/conformance/evidence/attempt-00/lifecycle.browser.capture.json", await hashFile(file("matrix/lifecycle.browser.capture.json"))],
  ["compiled-lifecycle/conformance/evidence/attempt-00/lifecycle.browser.json", await hashFile(file("matrix/lifecycle.browser.json"))],
  ["compiled-lifecycle/conformance/evidence/attempt-00/lifecycle.direct.json", await hashFile(file("matrix/lifecycle.direct.json"))],
  ["compiled-lifecycle/conformance/evidence/attempt-00/lifecycle.failed.json", await hashFile(file("matrix/lifecycle.failed.json"))],
]);
assert.deepEqual(run.evidencePins.map(({ path, sha256 }) => [path, sha256]).sort((a, b) => a[0].localeCompare(b[0])),
  [...expectedEvidencePins.entries()].sort((a, b) => a[0].localeCompare(b[0])));

assert.equal(direct.trace.schema, "gobi.trace/v1");
assert.equal(direct.trace.ticks.length, 26);
assert.equal(direct.steps.length, 26);
assert.deepEqual(direct.pending, []);
assert.equal(nativeStandalone.schema, "gobi.compiled-lifecycle-native/v1");
assert.equal(nativeStandalone.steps.length, 26);
assert.equal(nativeStandalone.componentID, direct.componentID);
assert.deepEqual(decodeGobiValue(direct.trace.ticks[0].state), nativeStandalone.initialState);
for (let index = 0; index < direct.steps.length; index += 1) {
  const compiled = direct.steps[index];
  const native = nativeStandalone.steps[index];
  assert.equal(compiled.eventIndex, native.index);
  assert.equal(compiled.event.kind, native.kind);
  assert.deepEqual(compiled.message, native.message);
  assert.deepEqual(decodeGobiValue(compiled.state), native.state);
  assert.deepEqual(compiled.view.tree, native.view);
  assert.deepEqual(compiled.requestedEffects.map(({ effect }) => effect), native.effects);
}
const staleTokens = ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"];
for (let offset = 0; offset < staleTokens.length; offset += 1) {
  const index = 11 + offset;
  const step = direct.steps[index];
  const previous = direct.steps[index - 1];
  assert.equal(step.outcome, "stale-no-op");
  assert.deepEqual(step.message, { name: "complete", arg: staleTokens[offset] });
  assert.deepEqual(step.state, previous.state, `direct GoScript state changed on stale ${staleTokens[offset]}`);
  assert.deepEqual(step.view, previous.view, `direct GoScript view changed on stale ${staleTokens[offset]}`);
  assert.deepEqual(step.requestedEffects, []);
  assert.equal(step.tickAfter, step.tickBefore + 1, "direct stale message must be recorded as a Go tick");
  assert.deepEqual(step.pending, [{ token: "sibling:g1:r4", dispatchId: "dispatch-0008", effectIndex: 0 }]);
  assert.deepEqual(nativeStandalone.steps[index].state, nativeStandalone.steps[index - 1].state,
    `native state changed on stale ${staleTokens[offset]}`);
  assert.deepEqual(nativeStandalone.steps[index].view, nativeStandalone.steps[index - 1].view,
    `native view changed on stale ${staleTokens[offset]}`);
}
for (const index of [15, 25]) {
  assert.equal(direct.steps[index].outcome, "duplicate-no-op");
  assert.deepEqual(direct.steps[index].state, direct.steps[index - 1].state);
  assert.deepEqual(direct.steps[index].view, direct.steps[index - 1].view);
  assert.deepEqual(direct.steps[index].requestedEffects, []);
}

const directRecords = direct.effectRecords;
assert.deepEqual(directRecords.filter(({ kind }) => kind === "request").map(({ token }) => token), [
  "parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4",
  "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7",
]);
const directCancels = directRecords.filter(({ kind }) => kind === "cancel");
assert.deepEqual(directCancels.map(({ token }) => token), staleTokens);
assert.deepEqual(directCancels.map(({ effectIndex }) => effectIndex), [0, 1, 2]);
const requestCorrelation = new Map(directRecords.filter(({ kind }) => kind === "request")
  .map(({ token, dispatchId, effectIndex }) => [token, { dispatchId, effectIndex }]));
for (const cancel of directCancels) assert.deepEqual(cancel.target, requestCorrelation.get(cancel.token));
assert.deepEqual(directRecords.filter(({ kind }) => kind === "deliver").map(({ token }) => token), [
  "sibling:g1:r4", "grandchild:g2:r7", "child:g2:r6", "parent:g2:r5",
]);
assert.deepEqual(nativeStandalone.steps[9].effects.map(({ arg }) => arg), staleTokens,
  "standalone native Go CLI cancellation order differs");
assert.deepEqual(nativeStandalone.steps[9].effects.map(({ kind }) => kind), [
  "lifecycle.cancel", "lifecycle.cancel", "lifecycle.cancel",
]);

assert.deepEqual(Object.keys(browser.profiles).sort(), ["dom", "react", "swap"]);
assert.deepEqual(browser.pageErrors, []);
const browserSummaries = {};
for (const name of ["react", "dom", "swap"]) {
  const profile = browser.profiles[name];
  assert.equal(profile.events.length, 26);
  assert.equal(profile.actions.length, 16);
  assert.equal(profile.trace.ticks.length, 26);
  assert.deepEqual(profile.pageErrors, []);
  assert.deepEqual(expectTraceProjection(direct.trace), expectTraceProjection(profile.trace),
    `${name} compiled browser Go projection differs from direct emitted-module trace`);
  const actionMismatches = direct.trace.ticks.flatMap((tick, index) =>
    JSON.stringify(tick.action) === JSON.stringify(profile.trace.ticks[index].action) ? [] : [{
      index,
      message: tick.message,
      direct: tick.action,
      browser: profile.trace.ticks[index].action,
    }]);
  const expectedActionMismatchIndexes = [11, 12, 13, 15, 25];
  assert.deepEqual(actionMismatches.map(({ index }) => index), expectedActionMismatchIndexes,
    `${name} direct/browser action metadata mismatch locations differ`);
  for (const mismatch of actionMismatches) {
    assert.equal(mismatch.direct, null);
    assert.deepEqual(mismatch.browser, { path: "", event: "click", value: "" });
  }
  const records = profile.effectRecords;
  assert.equal(records.length, 17);
  assert.deepEqual(records.filter(({ kind }) => kind === "cancel").map(({ token }) => token), staleTokens);
  assert.deepEqual(records.filter(({ kind }) => kind === "force-deliver-retired").map(({ token }) => token), staleTokens);
  for (const record of records.filter(({ kind }) => kind === "force-deliver-retired")) {
    assert.equal(record.outcome, "rejected");
    assert.deepEqual(record.runtimeResult, { accepted: false, error: "unknown or extra effect completion" });
  }
  for (const token of staleTokens) {
    const probe = profile.probes.find((entry) => entry.token === token && entry.expectRuntimeCompletion === "rejected-cancelled");
    assert.ok(probe, `${name} missing retired callback probe for ${token}`);
    assert.equal(probe.result.accepted, false);
    assert.equal(probe.result.error, "unknown or extra effect completion");
    assert.equal(probe.tickCount, 10, "retired completion must not add a browser Go tick");
  }
  const duplicateProbes = profile.probes.filter((entry) => entry.expectRuntimeCompletion === "rejected-duplicate");
  assert.deepEqual(duplicateProbes.map(({ token }) => token), ["sibling:g1:r4", "child:g2:r6"]);
  assert.deepEqual(duplicateProbes.map(({ result }) => result), [
    { accepted: false, error: "effect completion already delivered" },
    { accepted: false, error: "effect completion already delivered" },
  ]);
  assert.deepEqual(duplicateProbes.map(({ tickCount }) => tickCount), [15, 25]);
  assert.deepEqual(records.filter(({ kind }) => kind === "deliver").map(({ token }) => token), [
    "sibling:g1:r4", "grandchild:g2:r7", "child:g2:r6", "parent:g2:r5",
  ]);
  assert.deepEqual(profile.pendingAtEnd, []);

  const stale = profile.stalePhysicalClicks[0];
  assert.equal(profile.stalePhysicalClicks.length, 1);
  assert.equal(stale.eventIndex, 10);
  assert.equal(stale.attempts.length, 6);
  const expectedStalePaths = ["0/1", "0/2", "0/3/1", "0/3/2", "0/3/3/1", "0/3/3/2"];
  assert.deepEqual(stale.attempts.map(({ path }) => path), expectedStalePaths);
  for (const item of stale.attempts) {
    assert.equal(item.attempted, true);
    assert.equal(item.method, "retained-detached-HTMLElement.click");
    assert.equal(item.targetBefore.connected, false);
    assert.equal(item.targetConnectedAfter, false);
  }
  for (const key of ["trace", "snapshot", "callbacks", "pending", "effectRecords", "physicalHTML"]) {
    assert.deepEqual(stale.before[key], stale.after[key], `${name} detached clicks changed ${key}`);
  }

  assert.equal(profile.unmount.result, true);
  assert.deepEqual(profile.unmount.pendingBefore, [], "browser unmount happened after pending work drained");
  assert.deepEqual(profile.unmount.physicalDOM, { html: "", controls: 0 });
  assert.deepEqual(profile.unmount.rendererSnapshot, { normalization: "outerHTML-v1", html: "", controls: [] });

  browserSummaries[name] = {
    events: profile.events.length,
    ticks: profile.trace.ticks.length,
    effects: records.length,
    staleGoMessagesAreNoOps: true,
    duplicateGoMessagesAreNoOps: true,
    retiredHostCallbacksRejected: staleTokens.length,
    detachedClicks: stale.attempts.length,
    pageErrors: profile.pageErrors.length,
    pendingAtEnd: profile.pendingAtEnd.length,
    unmountPhysicalControls: profile.unmount.physicalDOM.controls,
    directBrowserActionMismatchIndexes: actionMismatches.map(({ index }) => index),
  };
}

const swap = browser.profiles.swap;
const fixedSwap = swap.swaps.find(({ reason }) => reason === "fixture-renderer-swap-8");
assert.ok(fixedSwap);
const expectedPendingAtSwap = ["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4"];
assert.deepEqual(fixedSwap.before.pending.map(({ token }) => token), expectedPendingAtSwap);
assert.deepEqual(fixedSwap.after.pending.map(({ token }) => token), expectedPendingAtSwap);
const eligibleSwapRecords = swap.swaps.filter(({ after }) => after.retiredCallbacks.eligible);
const ineligibleSwapRecords = swap.swaps.filter(({ after }) => !after.retiredCallbacks.eligible);
assert.equal(swap.swaps.length, 17);
assert.equal(eligibleSwapRecords.length, 16);
assert.equal(ineligibleSwapRecords.length, 1);
for (const record of eligibleSwapRecords) {
  const retired = record.after.retiredCallbacks;
  for (const callback of [retired.dispatch, retired.stale]) {
    assert.equal(callback.accepted, false);
    assert.equal(callback.stale, true);
    assert.equal(callback.error, "renderer callback fenced after replacement");
  }
}
const retiredFenceCount = eligibleSwapRecords.reduce((sum, record) => sum +
  record.after.retiredCallbacks.after.diagnostics.fencedCallbacks.length -
  record.after.retiredCallbacks.before.diagnostics.fencedCallbacks.length, 0);
assert.equal(retiredFenceCount, 32);

assert.match(runtimeTests, /# tests 10/);
assert.match(runtimeTests, /# pass 10/);
assert.match(runtimeTests, /# fail 0/);
for (const requiredTest of [
  "host unmount retires pending sibling requests and releases every callback",
  "rejected completion-time unmount leaves the lifecycle driver and pending callbacks live",
  "deferred core unmount retires effect callbacks after the host finishes the current dispatch",
]) assert.ok(runtimeTests.includes(requiredTest));
assert.equal(execution.stages.find(({ name }) => name === "compiled-lifecycle-runtime-tests")?.status, "passed");

const pinnedInputs = [
  "execution.json", "logs/lifecycle-compiled-runtime-tests.stdout.log", "logs/lifecycle-conformance.stdout.log",
  "logs/lifecycle-conformance.stderr.log", "matrix/lifecycle.run.json", "matrix/lifecycle.failed.json",
  "matrix/native-cli.json", "matrix/lifecycle.direct.json", "matrix/lifecycle.browser.capture.json", "matrix/lifecycle.browser.json",
  "react/build-record.json", "dom/build-record.json", "react/output/buildmanifest.json", "dom/output/buildmanifest.json",
  "react/output/apps/lifecycle-7e6575d90707/app-ir.json", "react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs",
  "react/output/apps/lifecycle-7e6575d90707/encoder.mjs", "dom/output/apps/lifecycle-7e6575d90707/app-ir.json",
  "dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs", "dom/output/apps/lifecycle-7e6575d90707/encoder.mjs",
];
const inputHashes = {};
for (const path of pinnedInputs) inputHashes[path] = await hashFile(file(path));

const result = {
  schema: "gobi.compiled-lifecycle-ci-order-audit/v1",
  result: "bounded_matches_with_native_matrix_unavailable",
  artifact: {
    id: artifact.id,
    name: artifact.name,
    sizeBytes: artifact.size_in_bytes,
    sha256: artifact.digest.slice("sha256:".length),
    workflowRun: artifact.workflow_run.id,
    headSHA: artifact.workflow_run.head_sha,
    workflowConclusion: finalRun.conclusion,
  },
  attempt: relative(process.cwd(), attempt),
  failures: {
    matrixRunStatus: run.status,
    nativeGoExecutable: run.nativeCommand[0],
    nativeSpawnError: run.failures[0].message,
    fullCheckWithheld: run.failures.some(({ message }) => message.includes("full conformance check withheld")),
    checkFilePresent: await exists(resolve(matrix, "lifecycle.check.json")),
    nativeTracePresent: await exists(resolve(matrix, "lifecycle.native.json")),
    sourceStableThroughCheck: run.sourceStableThroughCheck,
    identicalSourcePinSets: run.sourcePinsBefore.length,
    buildOutputsStableThroughCheck: run.buildOutputsStableThroughCheck,
    identicalBuildOutputPinSets: run.buildOutputPinsBeforeCheck.length,
  },
  compiledGoScript: {
    directTicks: direct.trace.ticks.length,
    directSteps: direct.steps.length,
    directPendingAtEnd: direct.pending.length,
    staleDirectGoMessages: staleTokens.map((token) => ({ token, outcome: "stale-no-op", stateAndViewUnchanged: true })),
    cancellationOrder: directCancels.map(({ token }) => token),
    cancellationsTargetOriginalCorrelations: true,
    successfulDeliveries: directRecords.filter(({ kind }) => kind === "deliver").map(({ token }) => token),
    browserDirectProjectionMatches: Object.fromEntries(Object.keys(browser.profiles).map((name) => [name, true])),
  },
  standaloneNativeGo: {
    artifact: "matrix/native-cli.json",
    stage: "native-cli passed in the E-BUILD execution",
    steps: nativeStandalone.steps.length,
    directCompiledStateViewMessageAndEffectMatch: true,
    staleDirectMessagesPreserveStateAndView: staleTokens,
    cancellationOrder: nativeStandalone.steps[9].effects.map(({ arg }) => arg),
  },
  browser: {
    profiles: browserSummaries,
    directBrowserActionMetadataNotComparedByCoreProjection: [11, 12, 13, 15, 25].map((index) => ({
      index,
      direct: null,
      browser: { path: "", event: "click", value: "" },
    })),
    directBrowserStateViewMessageAndEffectProjectionsMatch: true,
    pendingSurvivedFixedSwap: expectedPendingAtSwap,
    eligibleRendererSwapFences: eligibleSwapRecords.length,
    ineligibleRendererSwap: ineligibleSwapRecords[0].after.retiredCallbacks.reason,
    retiredRendererFenceRecords: retiredFenceCount,
    forceRetiredCallbacksRejectedBeforeFreshGeneration2Requests: staleTokens,
    note: "The primary script force-delivers canceled generation-1 callbacks after removeParent and before generation-2 requests; it does not cover the stronger stale-while-generation-2-pending ordering.",
  },
  runtimeUnitSuite: {
    tests: 10,
    passed: 10,
    failed: 0,
    covered: [
      "pending sibling unmount retires callbacks",
      "rejected reentrant unmount preserves pending callbacks",
      "deferred core unmount retires callbacks after dispatch",
    ],
  },
  unavailable: [
    "Conformance runner native Go lifecycle replay: bare --native-go go resolved to /home/runner/work/gondola/gondola/go and failed ENOENT; matrix/lifecycle.native.json is absent. A separate E-BUILD standalone native CLI replay exists and matches direct compiled steps, but it does not make the rejected orchestrated matrix/check complete.",
    "Full lifecycle conformance check and its mutation controls: deliberately withheld after the conformance runner native stage failure.",
    "The E-LIVE-REPLY stronger live-generation-2-pending probe is separate supplementary evidence and did not run inside this CI artifact.",
    "Browser unmount occurs after pending work is empty; pending-work unmount behavior is covered only by the runtime unit test, not the browser scenario.",
    "Direct and browser trace action metadata differs at injected Go-message ticks 11, 12, 13, 15, and 25 (direct null; browser blank click action). The canonical direct/browser Go projection excludes action; click-action assertions validate the 16 physical fixture clicks, not these injected Go messages. This observation is un-compared metadata, not a reported conformance failure.",
  ],
  hashes: inputHashes,
};
console.log(`${JSON.stringify(result, null, 2)}\n`);

async function exists(path) {
  try { await readFile(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
