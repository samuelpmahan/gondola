import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ownDir = dirname(fileURLToPath(import.meta.url));
const next = resolve(ownDir, "../../../..");
const archive = resolve(next, "../gondola-children-archive");
const pin = async (base, relative) => {
  const bytes = await readFile(resolve(base, relative));
  return { path: relative, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
};
const json = async (base, relative) => JSON.parse(await readFile(resolve(base, relative), "utf8"));
const receiptPath = "compiled-children/coordination/receipts/E-RELEASE-CONTRACT-MATRIX.json";
const reportPath = "compiled-children/coordination/reports/E-RELEASE-CONTRACT-MATRIX.md";
const receipt = await json(next, receiptPath);
const report = await readFile(resolve(next, reportPath), "utf8");
const attempt = "compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7";
const outerPath = "compiled-children/coordination/failed-full-source-978/E-DELIVERY.json";
const inheritedPath = "compiled-children/coordination/failed-full-source-978/inherited-E-BUILD.json";
const outer = await json(archive, outerPath);
const inherited = await json(archive, inheritedPath);
const check = await json(archive, `${attempt}/harness/run.check.json`);
const seeded = await json(archive, `${attempt}/harness/run.seeded.json`);
const smoke = await json(archive, `${attempt}/demo/smoke.json`);
const rawRun = await json(archive, `${attempt}/harness/run.run.json`);
const browser = await json(archive, `${attempt}/harness/run.browser.json`);

const hashPins = [];
function collectPins(value) {
  if (!value || typeof value !== "object") return;
  if (typeof value.path === "string" && Number.isSafeInteger(value.bytes) && /^[a-f0-9]{64}$/.test(value.sha256 ?? "")) {
    hashPins.push(value);
  }
  for (const child of Object.values(value)) collectPins(child);
}
collectPins(receipt);
const verifiedPins = [];
for (const item of hashPins) {
  const preferred = item.path.includes("E-RELEASE-CONTRACT-MATRIX") &&
    (item.path.includes("/reports/") || item.path.includes("/receipts/") || item.path.includes("/rawlogs/"))
    ? [next, archive] : [archive, next];
  let match = null;
  for (const base of preferred) {
    try {
      const actual = await pin(base, item.path);
      if (actual.bytes === item.bytes && actual.sha256 === item.sha256) {
        match = { ...actual, worktree: base === archive ? "source462-archive" : "coordination-next" };
        break;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  assert.ok(match, `receipt pin failed byte/hash verification: ${item.path}`);
  verifiedPins.push(match);
}

assert.equal(receipt.job_id, "E-RELEASE-CONTRACT-MATRIX");
assert.equal(receipt.worker, "N1");
assert.equal(receipt.outcome, "confirmed_reuse");
assert.deepEqual(await pin(next, reportPath), {
  path: reportPath,
  bytes: receipt.report.bytes,
  sha256: receipt.report.sha256,
});
const sourceHead = "462a9827bfe1980600456b00d0a67843eaa9756d";
assert.equal(receipt.evidenceSource.activeWorktree, archive);
assert.equal(receipt.evidenceSource.sourceSnapshotContext.source.split(" ")[0], sourceHead);
const archiveContract = await pin(archive, "compiled-children/CONTRACT.md");
const archiveApp = await pin(archive, "fixtures/compiled/children/app.go");
const archiveView = await pin(archive, "fixtures/compiled/children/view.go");
const archiveCapabilityRunner = await pin(archive, "compiled-capabilities/run.mjs");
assert.equal(archiveApp.sha256, receipt.verifiedObservations.source978AppGoSha256);
assert.equal(archiveCapabilityRunner.sha256, receipt.verifiedObservations.currentCapabilitiesRunnerSha256);
assert.equal(archiveContract.sha256, receipt.verifiedObservations.evidencePins.contract.sha256);
assert.equal(archiveView.sha256, receipt.verifiedObservations.evidencePins.goView.sha256);

assert.equal(outer.status, "failed");
assert.equal(outer.mode, "full");
assert.equal(outer.failures.length, 2);
assert.deepEqual(outer.mismatches, []);
const stageNames = outer.stages.map((stage) => stage.name);
const inheritedStage = stageNames.indexOf("fresh-full-inherited-capabilities-chain");
assert.equal(inheritedStage, 1);
const afterInherited = outer.stages.slice(inheritedStage + 1);
const nonInheritedStages = outer.stages.filter((stage) => stage.name !== "fresh-full-inherited-capabilities-chain");
assert.equal(afterInherited.length, 8);
assert.ok(afterInherited.every((stage) => stage.status === "passed"));
assert.equal(nonInheritedStages.length, receipt.verifiedObservations.source978.newStageCount);
assert.ok(nonInheritedStages.every((stage) => stage.status === "passed"));
assert.equal(inherited.status, "failed");
assert.equal(inherited.failures.some((failure) => failure.error.includes('"tests":5') && failure.error.includes("three clean TAP passes")), true);
assert.equal(inherited.failures.some((failure) => failure.name === "source-pins-prearchive"), true);
assert.equal(receipt.verifiedObservations.source978.archiveHelperGateActual.tests, 5);
assert.equal(receipt.verifiedObservations.source978.archiveHelperGateActual.pass, 5);

assert.equal(check.status, "matched");
assert.deepEqual([check.events, check.goUpdates, check.stateCheckpoints], [42, 38, 39]);
assert.deepEqual([check.swaps, check.acceptedCompatibleSwaps, check.rejectedIncompatibleSwaps], [2, 1, 1]);
assert.equal(check.mutationControlsDetected, 12);
assert.deepEqual(check.browserProfiles, ["react", "dom", "swap"]);
assert.equal(check.disabledActionsFenced, 1);
assert.equal(check.nativeStateCheckedAgainstLiteralOracle, true);
assert.equal(check.directTypedStateCheckedAgainstLiteralOracle, true);
assert.equal(check.browserRawDOMCheckedAgainstLiteralOracle, true);
assert.equal(rawRun.status, "matched");
assert.deepEqual(seeded.results.map(({ seed, events, goUpdates }) => ({ seed, events, goUpdates })), [
  { seed: 20261031, events: 60, goUpdates: 59 },
  { seed: 20261032, events: 60, goUpdates: 59 },
  { seed: 20261033, events: 60, goUpdates: 59 },
]);
assert.deepEqual(seeded.results.filter((item) => item.outputs.browser).map((item) => item.seed), [20261031]);
assert.equal(smoke.status, "passed");
assert.equal(smoke.checks.length, 32);
assert.equal(browser.profiles.swap.swaps.length, 2);
assert.equal(browser.profiles.swap.swaps.filter((item) => item.accepted).length, 1);
assert.equal(browser.profiles.swap.swaps.filter((item) => !item.accepted).length, 1);
assert.ok(browser.profiles.swap.actions.every((action) => action.method === "HTMLElement.click" && action.attempted === true));
const disabled = browser.profiles.swap.events.find((event) => event.event.kind === "disabled-action");
assert.equal(disabled.operation.targetBefore.disabled, true);
assert.equal(disabled.operation.method, "disabled-HTMLElement.click");
assert.equal(disabled.operation.attempted, true);
assert.equal(disabled.stepIndex, null);
assert.equal(disabled.operation.before.trace.ticks.length, disabled.operation.after.trace.ticks.length);

const contractText = await readFile(resolve(archive, "compiled-children/CONTRACT.md"), "utf8");
const appText = await readFile(resolve(archive, "fixtures/compiled/children/app.go"), "utf8");
const viewText = await readFile(resolve(archive, "fixtures/compiled/children/view.go"), "utf8");
const hostText = await readFile(resolve(archive, "compiled-children/runtime/runtime.mjs"), "utf8");
const designText = await readFile(resolve(archive, "typed-composition/DESIGN.md"), "utf8");
assert.match(contractText, /not arbitrary graphs/i);
assert.match(contractText, /disabled request behavior/i);
assert.match(contractText, /explicit request\/cancel host capabilities/i);
assert.match(appText, /Children\s+\[\]ChildState/);
assert.match(appText, /Generation\s+uint64/);
assert.match(appText, /RequestSeq\s+uint64/);
assert.match(appText, /cancelChildren\(state\.Children\)/);
assert.match(viewText, /Keyed\("child-" \+ key\)/);
assert.match(hostText, /effect\.request-reply/);
assert.match(hostText, /effect\.cancel/);
assert.match(hostText, /mountCompiledChildrenApp/);
assert.match(designText, /live immediate parent/);
assert.match(designText, /InputRevision/);
assert.match(designText, /Publish accepts only a live non-root child/);
assert.match(report, /dynamically keyed child identities/);
assert.match(report, /not a guarantee of this fixture/);

const reportLines = report.split("\n");
const inaccurateStageCountLine = reportLines.findIndex((line) => line.includes("nine stages after inherited execution passed"));
assert.notEqual(inaccurateStageCountLine, -1, "expected the report's stage-order wording to be present for targeted review");

const output = {
  schema: "gobi.xr-release-contract-matrix-audit/v1",
  status: "amend",
  scope: { activeSourceWorktree: archive, sourceCommit: sourceHead, authorPacketWorktree: next },
  validatedPins: { count: verifiedPins.length, pins: verifiedPins },
  source462: { contract: archiveContract, app: archiveApp, view: archiveView, capabilitiesRunner: archiveCapabilityRunner },
  source978: {
    overallStatus: outer.status,
    fullMode: outer.mode,
    failures: outer.failures.length,
    semanticMismatches: outer.mismatches.length,
    inheritedGate: {
      status: inherited.status,
      archiveHelperTests: 5,
      expectedArchiveHelperTests: 3,
      sourcePinBoundaryFailed: true,
    },
    stages: { total: outer.stages.length, beforeInherited: inheritedStage, afterInherited: afterInherited.length,
      afterInheritedPassed: afterInherited.length, allNonInheritedPassed: nonInheritedStages.length },
    fixedReplay: { events: check.events, goUpdates: check.goUpdates, checkpoints: check.stateCheckpoints,
      swaps: check.swaps, accepted: check.acceptedCompatibleSwaps, rejected: check.rejectedIncompatibleSwaps,
      mutations: check.mutationControlsDetected, disabledActionsFenced: check.disabledActionsFenced },
    seeds: seeded.results.map(({ seed, events, goUpdates, outputs }) => ({ seed, events, goUpdates, browserMounted: Boolean(outputs.browser) })),
    httpSmokeChecks: smoke.checks.length,
  },
  contractReview: {
    goOwnedOrderedChildrenAndGenerationState: true,
    cancellationReuseRemountAndStaleCompletion: true,
    closedHostCapabilitiesAndSharedRuntime: true,
    disabledBoundaryObservedOnce: true,
    treeDOMAndClickClaimsRemainFixtureBounded: true,
    futureTypedInputsAndPublicationAreSeparateFromCurrentFixture: true,
  },
  finding: {
    id: "XR-RELEASE-CONTRACT-MATRIX-1",
    severity: "must-fix-wording",
    path: reportPath,
    line: inaccurateStageCountLine + 1,
    summary: "The report says nine stages passed after the inherited stage; the source978 manifest has eight stages after it. Nine is the count of all non-inherited stages, including the preflight stage that ran before inherited execution.",
    correction: "Say that all nine non-inherited stages passed (preflight plus eight after the inherited stage), or report the eight post-inherited stages separately.",
  },
  limitations: [
    "No full harness, full pipeline, or test suite was rerun; this audit only validated pinned existing evidence and frozen source.",
    "Source462 full/CI acceptance remains pending per root; the source978 delivery remains failed overall.",
  ],
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
