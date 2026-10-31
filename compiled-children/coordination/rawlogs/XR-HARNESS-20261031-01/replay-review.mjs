import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkChildrenConformance, checkSeededChildrenReplay } from "../../../conformance/check.mjs";
import { generateSeededChildrenScenario } from "../../../conformance/seeded.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
const archiveDirectory = resolve(root, "compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJSON = async (path) => JSON.parse(await readFile(path, "utf8"));
const report = JSON.parse(await readFile(resolve(archiveDirectory, "trace-index.json"), "utf8"));
const archiveData = new Map();
const verifiedArchives = [];

for (const artifact of report.traceArtifacts) {
  const archiveBytes = await readFile(resolve(root, artifact.path));
  assert.equal(archiveBytes.length, artifact.archiveBytes, `${artifact.path} archive byte count`);
  assert.equal(sha256(archiveBytes), artifact.archiveSha256, `${artifact.path} archive SHA-256`);
  const sourceBytes = gunzipSync(archiveBytes);
  assert.equal(sourceBytes.length, artifact.sourceBytes, `${artifact.path} uncompressed byte count`);
  assert.equal(sha256(sourceBytes), artifact.sourceSha256, `${artifact.path} uncompressed SHA-256`);
  const key = artifact.path.split("/").at(-1).replace(/\.json\.gz$/, "");
  if (artifact.path.endsWith(".json.gz")) archiveData.set(key, JSON.parse(sourceBytes.toString("utf8")));
  verifiedArchives.push({ path: artifact.path, archiveSha256: sha256(archiveBytes), sourceSha256: sha256(sourceBytes), sourceBytes: sourceBytes.length });
}

const run = archiveData.get("run");
const checkCapture = archiveData.get("check");
const native = archiveData.get("native");
const directReact = archiveData.get("direct-react");
const directDom = archiveData.get("direct-dom");
const browser = archiveData.get("browser");
const seeded = archiveData.get("seeded");
const manifest = archiveData.get("manifest");
const receipt = await readJSON(resolve(root, "compiled-children/coordination/receipts/E-HARNESS.json"));

assert.equal(run.status, "matched");
assert.equal(run.sourcesStable, true);
assert.equal(run.buildOutputsStable, true);
assert.deepEqual(run.sourcePinsBefore, run.sourcePinsAfter, "source pins changed during the run");
assert.deepEqual(run.buildOutputPinsBeforeCheck, run.buildOutputPinsAfterCheck, "build pins changed during the run");
assert.deepEqual(manifest.sourcePins.before, run.sourcePinsBefore);
assert.deepEqual(manifest.sourcePins.after, run.sourcePinsAfter);
assert.deepEqual(manifest.buildOutputPins.beforeCheck, run.buildOutputPinsBeforeCheck);
assert.deepEqual(manifest.buildOutputPins.afterCheck, run.buildOutputPinsAfterCheck);
assert.match(receipt.inputPinScope, /oracle custody repair artifacts are separately owned and are excluded/i);
assert.ok(run.sourcePinsBefore.every(({ path }) => !path.split("/").includes("custody")),
  "oracle custody directory was included in source pins");

for (const pin of [...run.sourcePinsBefore, ...run.buildOutputPinsBeforeCheck]) {
  const bytes = await readFile(resolve(root, pin.path));
  assert.equal(bytes.length, pin.bytes, `${pin.path} current byte count differs from pinned evidence`);
  assert.equal(sha256(bytes), pin.sha256, `${pin.path} current SHA-256 differs from pinned evidence`);
}

const fixture = await readJSON(resolve(root, "fixtures/compiled/children/scenario.json"));
const expectations = await readJSON(resolve(root, "compiled-children/oracle/expectations.json"));
const reactAppIR = await readJSON(run.builds.react.appIR);
const domAppIR = await readJSON(run.builds.dom.appIR);
assert.equal(native.events.length, 42);
assert.equal(native.steps.length, 38);
assert.equal(expectations.stateProjections.length, 39);
assert.equal(browser.profilesRun.join(","), "react,dom,swap");
assert.equal(browser.noWasm.apiAttempts.length, 0);
assert.equal(browser.noWasm.wasmRequests.length, 0);
for (const profile of Object.values(browser.profiles)) {
  assert.equal(profile.events.length, 42);
  assert.equal(profile.snapshots.length, 43);
  assert.equal(profile.actions.length, 27);
  assert.ok(profile.actions.every((action) => action.method === "HTMLElement.click" && action.attempted));
}

const replayedCheck = checkChildrenConformance({
  native, directReact, directDom, browser, fixture, expectations, reactAppIR, domAppIR,
});
replayedCheck.seededRuns = checkCapture.seededRuns;
assert.deepEqual(replayedCheck, checkCapture, "replayed fixed capture check differs from its archived result");

const swap = browser.profiles.swap;
const accepted = swap.swaps.find(({ eventIndex }) => eventIndex === expectations.probes.compatibleSwap.eventIndex);
const rejected = swap.swaps.find(({ eventIndex }) => eventIndex === expectations.probes.incompatibleSwap.eventIndex);
assert.equal(accepted.accepted, true);
assert.deepEqual(accepted.before.pending.map(({ token }) => token), accepted.after.pending.map(({ token }) => token));
assert.deepEqual(accepted.after.rootMutationEvidence,
  { childListRecords: 2, oldRootRemoved: true, newRootAdded: true, emptyAfterOldRemoval: true });
assert.equal(accepted.after.renderer.backend, "react");
assert.equal(rejected.accepted, false);
assert.equal(rejected.error.name, "TypeError");
assert.equal(rejected.after.renderer.backend, "react");
assert.deepEqual(rejected.before.pending.map(({ token }) => token), rejected.after.pending.map(({ token }) => token));
assert.deepEqual(swap.events[13].operation.observed.backend, "react");
assert.equal(swap.events[9].operation.targetBefore.disabled, true);
assert.equal(swap.events[11].operation.result.stale, true);
assert.equal(swap.staleDeliveries[0].result.outcome, "rejected");

const cancellationOrder = swap.effectRecords.filter((row) => row.kind === "cancel").map(({ token }) => token);
assert.deepEqual(cancellationOrder, [
  "child:oak:g2:r1",
  "child:oak:g5:r2",
  "child:elm:g3:r2",
  "child:oak:g7:r1",
  "child:pine:g6:r1",
  "parent:g1:r2",
]);

const seedReviews = [];
for (const result of seeded.results) {
  const generated = generateSeededChildrenScenario(result.seed);
  const outputs = result.outputs;
  const scenario = await readJSON(outputs.scenario);
  const seedNative = await readJSON(outputs.native);
  const seedReact = await readJSON(outputs.directReact);
  const seedDom = await readJSON(outputs.directDom);
  assert.deepEqual(scenario, generated.scenario, `seed ${result.seed} schedule differs from its current deterministic generator`);
  assert.equal(seedNative.events.length, 60);
  assert.equal(seedNative.steps.length, 59);
  let seedBrowser = null;
  if (outputs.browser) {
    seedBrowser = await readJSON(outputs.browser);
    assert.deepEqual(seedBrowser.profilesRun, ["swap"]);
    assert.equal(seedBrowser.profiles.swap.events.length, 60);
    assert.equal(seedBrowser.profiles.swap.snapshots.length, 61);
    assert.equal(seedBrowser.profiles.swap.actions.length, 1);
    assert.equal(seedBrowser.profiles.swap.actions[0].method, "HTMLElement.click");
    assert.equal(seedBrowser.profiles.swap.actions[0].observed.backend, "dom");
    assert.equal(seedBrowser.noWasm.apiAttempts.length, 0);
    assert.equal(seedBrowser.noWasm.wasmRequests.length, 0);
  }
  const seedCheck = checkSeededChildrenReplay({
    native: seedNative,
    directReact: seedReact,
    directDom: seedDom,
    browser: seedBrowser,
    fixture: generated.scenario,
    seed: result.seed,
    appIR: reactAppIR,
  });
  assert.deepEqual(seedCheck, {
    seed: result.seed,
    events: 60,
    goUpdates: 59,
    stateTreeDomParity: seedBrowser !== null,
    oracle: "native-direct differential; no extra per-seed literal oracle",
  });
  seedReviews.push({ seed: result.seed, events: 60, goUpdates: 59, browser: seedBrowser !== null });
}

// Probe whether a capture with an incorrect claimed active renderer survives
// the current checker. This is deliberately read-only and uses a clone.
const wrongActiveBackend = structuredClone(browser);
const wrongSwap = wrongActiveBackend.profiles.swap;
wrongSwap.swaps.find(({ eventIndex }) => eventIndex === expectations.probes.compatibleSwap.eventIndex).after.renderer.backend = "dom";
wrongSwap.swaps.find(({ eventIndex }) => eventIndex === expectations.probes.compatibleSwap.eventIndex).after.renderer.id = 1;
wrongSwap.events[13].operation.observed.backend = "dom";
wrongSwap.events[13].operation.observed.rendererId = 1;
wrongSwap.actions.find(({ eventIndex }) => eventIndex === 13).observed.backend = "dom";
wrongSwap.actions.find(({ eventIndex }) => eventIndex === 13).observed.rendererId = 1;
wrongSwap.observations.dispatch.find(({ eventIndex }) => eventIndex === 13).backend = "dom";
wrongSwap.observations.dispatch.find(({ eventIndex }) => eventIndex === 13).rendererId = 1;
let wrongBackendCheck = null;
const wrongBackendAccepted = (() => {
  try {
    wrongBackendCheck = checkChildrenConformance({
      native, directReact, directDom, browser: wrongActiveBackend, fixture, expectations, reactAppIR, domAppIR,
    });
    return true;
  } catch {
    return false;
  }
})();
const witnessBytes = Buffer.from(JSON.stringify(wrongActiveBackend));
const witnessGzip = gzipSync(witnessBytes, { level: 6 });
const witnessPath = resolve(dirname(fileURLToPath(import.meta.url)), "wrong-active-renderer-browser.json.gz");
await writeFile(witnessPath, witnessGzip);

const summary = {
  schema: "gobi.compiled-children-harness-review-replay/v1",
  status: "checked",
  verifiedArchives,
  sourcePinCount: run.sourcePinsBefore.length,
  buildOutputPinCount: run.buildOutputPinsBeforeCheck.length,
  sourcePinsStable: run.sourcesStable,
  buildOutputsStable: run.buildOutputsStable,
  oracleCustodyPathsExcluded: run.sourcePinsBefore.every(({ path }) => !path.split("/").includes("custody")),
  fixedReplay: {
    status: replayedCheck.status,
    events: native.events.length,
    goUpdates: native.steps.length,
    stateCheckpoints: expectations.stateProjections.length,
    physicalClicksPerProfile: browser.profiles.react.actions.length,
    profiles: browser.profilesRun,
    mutationsDetected: replayedCheck.mutationControlsDetected,
    noWasm: browser.noWasm,
    compatibleSwap: { accepted: accepted.accepted, backendAfter: accepted.after.renderer.backend,
      pendingPreserved: true, oldRootRemoved: accepted.after.rootMutationEvidence.oldRootRemoved,
      replacementRootAdded: accepted.after.rootMutationEvidence.newRootAdded },
    incompatibleSwap: { accepted: rejected.accepted, error: rejected.error.name,
      backendAfter: rejected.after.renderer.backend, pendingPreserved: true },
    cancellationOrder,
    disabledClickFenced: swap.events[9].operation.targetBefore.disabled,
    retiredCallbackRejected: swap.events[11].operation.result.stale,
    cancelledReplyRejected: swap.staleDeliveries[0].result.outcome,
  },
  seededReplay: seedReviews,
  checkerMissedWrongActiveRendererMutation: wrongBackendAccepted,
  wrongActiveRendererWitness: {
    path: "compiled-children/coordination/rawlogs/XR-HARNESS-20261031-01/wrong-active-renderer-browser.json.gz",
    compressedSha256: sha256(witnessGzip),
    compressedBytes: witnessGzip.length,
    uncompressedSha256: sha256(witnessBytes),
    uncompressedBytes: witnessBytes.length,
    checkerResult: wrongBackendCheck,
    mutations: [
      "browser.profiles.swap.swaps[eventIndex=10].after.renderer.backend: react -> dom",
      "browser.profiles.swap.swaps[eventIndex=10].after.renderer.id: 2 -> 1",
      "browser.profiles.swap.events[eventIndex=13].operation.observed backend/rendererId: react/2 -> dom/1",
      "browser.profiles.swap.actions[eventIndex=13].observed backend/rendererId: react/2 -> dom/1",
      "browser.profiles.swap.observations.dispatch[eventIndex=13] backend/rendererId: react/2 -> dom/1",
    ],
    originalBrowserArchiveSha256: report.traceArtifacts.find((item) => item.path.endsWith("/browser.json.gz")).archiveSha256,
    originalBrowserSourceSha256: report.traceArtifacts.find((item) => item.path.endsWith("/browser.json.gz")).sourceSha256,
  },
};
console.log(JSON.stringify(summary, null, 2));
