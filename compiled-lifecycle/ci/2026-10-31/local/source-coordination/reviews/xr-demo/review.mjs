import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { encodeFixtureState } from "../../../../compiled-frontend/conformance/fixture-expectations.mjs";
import { expectedLifecycleDOM, expectedLifecycleStateAtTick, expectedLifecycleView } from "../../../browser/lifecycle-oracle.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ATTEMPT = resolve(ROOT, "compiled-lifecycle/builds/feasibility/bridge-green-02");
const REVIEW = resolve(ROOT, "compiled-lifecycle/coordination/reviews/xr-demo");
const GO = "/tmp/gondola-go/bin/go";
const NODE = "/tmp/gondola-node22/node_modules/node/bin/node";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJSON = async (path) => JSON.parse(await readFile(path, "utf8"));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function same(expected, actual, label) {
  assert.deepStrictEqual(actual, expected, label);
}

function effectSignature(effects) {
  return effects.map(({ kind, name, arg, reply }) => ({ kind, name, arg, reply }));
}

function fieldsByName(value) {
  assert.equal(value?.kind, "struct");
  return Object.fromEntries(value.fields.map(({ name, value: field }) => [name, field]));
}

function scalar(value) {
  if (value.kind === "bool") return value.bool;
  if (value.kind === "string") return value.string;
  if (value.kind === "int" || value.kind === "uint") return BigInt(value.integer);
  if (value.kind === "float64") return Buffer.from(value.float64Bits, "hex").readDoubleBE(0);
  throw new TypeError(`unsupported Go Value kind ${value.kind}`);
}

function decodeNode(stateValue, name) {
  const node = fieldsByName(fieldsByName(stateValue)[name]);
  const counter = fieldsByName(node.Counter);
  return {
    id: scalar(node.ID),
    parentId: scalar(node.ParentID),
    generation: scalar(node.Generation),
    requestId: scalar(node.RequestID),
    alive: scalar(node.Alive),
    requested: scalar(node.Requested),
    pending: scalar(node.Pending),
    token: scalar(node.Token),
    reply: scalar(node.Reply),
    count: scalar(counter.Count),
  };
}

async function main() {
  await mkdir(REVIEW, { recursive: true });
  const receipt = await readJSON(resolve(ROOT, "compiled-lifecycle/coordination/receipts/E-DEMO.json"));
  const reportPath = resolve(ROOT, receipt.report.path);
  const reportBytes = await readFile(reportPath);
  same(receipt.report.sha256, sha256(reportBytes), "E-DEMO report receipt hash");
  const oraclePath = resolve(ROOT, "compiled-lifecycle/browser/lifecycle-oracle.mjs");
  const oracleHash = sha256(await readFile(oraclePath));
  same("795ba7fef0ff680019f4988aba5cfcecb25b205516a2c7058bfc720fc217cb82", oracleHash,
    "independent N4 lifecycle oracle source pin");
  const attempt = await readJSON(resolve(ATTEMPT, "attempt.json"));
  const smoke = await readJSON(resolve(ATTEMPT, "demo-smoke.json"));
  const archiveManifest = await readJSON(resolve(ATTEMPT, "archive-manifest.json"));
  const fixture = await readJSON(resolve(ROOT, "fixtures/compiled/lifecycle/scenario.json"));
  const [reactManifest, domManifest, reactAppIR, domAppIR, reactModule, domModule, reactResult, domResult, demoBuild] = await Promise.all([
    readJSON(resolve(ATTEMPT, "react/output/buildmanifest.json")),
    readJSON(resolve(ATTEMPT, "dom/output/buildmanifest.json")),
    readJSON(resolve(ATTEMPT, "react/output/apps/lifecycle-7e6575d90707/app-ir.json")),
    readJSON(resolve(ATTEMPT, "dom/output/apps/lifecycle-7e6575d90707/app-ir.json")),
    import(pathToFileURL(resolve(ATTEMPT, "react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs")).href),
    import(pathToFileURL(resolve(ATTEMPT, "dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs")).href),
    readJSON(resolve(ATTEMPT, "react/result.json")),
    readJSON(resolve(ATTEMPT, "dom/result.json")),
    readJSON(resolve(ATTEMPT, "demo-site/demo-build.json")),
  ]);
  same(false, attempt.acceptanceRun, "demo attempt is not a final acceptance run");
  same("preintegration-pass", attempt.status, "demo attempt scope status");
  same("preintegration-demo-only", receipt.attempt_kind, "demo receipt scope boundary");
  same(false, receipt.acceptanceRun, "demo receipt is not final acceptance");
  for (const [name, result, build] of [
    ["React", reactResult, attempt.builds.react],
    ["DOM", domResult, attempt.builds.dom],
  ]) {
    same(0, build.exitCode, `${name} compiler command exit code`);
    same(true, result.ok, `${name} compiler result`);
    same([], result.diagnostics, `${name} compiler diagnostics`);
    same(67, build.BuildResultOutputs, `${name} compiler outputs`);
    same(0, build.stderr.bytes, `${name} compiler stderr bytes`);
  }
  same(0, attempt.demo.buildExitCode, "static demo build exit code");
  same(0, attempt.demo.smokeExitCode, "HTTP smoke exit code");
  const appTypes = reactAppIR.types;
  const componentId = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle";
  same(componentId, fixture.componentID, "fixture canonical component ID");
  same(componentId, reactManifest.apps[0].componentId, "React manifest component ID");
  same(componentId, domManifest.apps[0].componentId, "DOM manifest component ID");
  same(reactAppIR, domAppIR, "React/DOM AppIR parity");
  same(reactAppIR, reactModule.gobiCompiled.appIR, "React emitted module AppIR");
  same(domAppIR, domModule.gobiCompiled.appIR, "DOM emitted module AppIR");
  assert.ok(reactAppIR.components[0].capabilities.includes("effect.request-reply"));
  assert.ok(domAppIR.components[0].capabilities.includes("effect.request-reply"));
  assert.ok(reactAppIR.components[0].capabilities.includes("view.node"));
  assert.ok(domAppIR.components[0].capabilities.includes("view.node"));
  same("react", reactManifest.apps[0].backend, "React build backend");
  same("dom", domManifest.apps[0].backend, "DOM build backend");
  same(componentId, demoBuild.componentId, "demo bundle canonical component identity");
  same("react", demoBuild.backend, "demo bundle compiled module backend");
  same([], demoBuild.diagnostics ?? [], "demo build diagnostics");
  same("compiled-lifecycle-demo", smoke.finalTrace.appId, "demo host app ID");

  const nativeCommand = [GO, "run", "./cmd/compiled-lifecycle-native", "--script", "fixtures/compiled/lifecycle/scenario.json"];
  const nativeRun = spawnSync(nativeCommand[0], nativeCommand.slice(1), {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (nativeRun.error || nativeRun.status !== 0) {
    throw new Error(`native lifecycle CLI failed: ${nativeRun.stderr || nativeRun.error?.message || nativeRun.status}`);
  }
  const native = JSON.parse(nativeRun.stdout);
  await writeFile(resolve(REVIEW, "native-go.json"), json(native));
  same("gobi.compiled-lifecycle-native/v1", native.schema, "native Go output schema");
  same(componentId, native.componentID, "native component ID");
  same(fixture.name, native.name, "native fixture name");
  same(26, native.steps.length, "native scripted event count");
  same(3, native.steps[9].effects.length, "native cancellation effect count");
  same(["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"], native.steps[9].effects.map((item) => item.arg),
    "native child-first cancellation order");

  const duplicateGoNoops = native.steps.filter((step) => step.kind === "go-message" && step.outcome === "duplicate-no-op");
  same([15, 25], duplicateGoNoops.map((step) => step.index), "native fixture duplicate no-op events");
  const expectedGoSteps = native.steps.filter((step) => step.kind !== "renderer-swap" &&
    !(step.kind === "go-message" && step.outcome === "duplicate-no-op"));
  same(23, expectedGoSteps.length, "smoke's Go Update call count after omitting two fixture duplicate messages");
  same(24, smoke.finalTicks, "smoke final tick count including Init");
  same(24, smoke.finalTrace.ticks.length, "smoke raw trace tick count");
  same("gobi.trace/v1", smoke.finalTrace.schema, "smoke trace schema");

  const tickRows = [];
  const initState = encodeFixtureState(native.initialState, reactAppIR.components[0].stateType, appTypes);
  same(initState, smoke.finalTrace.ticks[0].state, "smoke Init state vs native Go Init");
  same(expectedLifecycleView(expectedLifecycleStateAtTick(0)), smoke.finalTrace.ticks[0].view,
    "smoke Init View vs independent literal oracle");
  same(native.steps[0].view, smoke.finalTrace.ticks[1].view.tree, "smoke first Go View vs native Go View");
  let expectedRequestForToken = new Map();
  for (let index = 0; index < expectedGoSteps.length; index += 1) {
    const nativeStep = expectedGoSteps[index];
    const tick = smoke.finalTrace.ticks[index + 1];
    const fixtureEvent = fixture.events[nativeStep.index];
    const label = `smoke tick ${index + 1} (fixture event ${nativeStep.index})`;
    same(index + 1, tick.index, `${label} index`);
    same(nativeStep.message, tick.message, `${label} message`);
    same(`dispatch-${String(index + 1).padStart(4, "0")}`, tick.dispatchId, `${label} dispatch ID`);
    same(encodeFixtureState(nativeStep.state, reactAppIR.components[0].stateType, appTypes), tick.state, `${label} full native Go state`);
    same(nativeStep.view, tick.view.tree, `${label} Go View tree`);
    same([], tick.view.bindings, `${label} View bindings`);
    same(effectSignature(nativeStep.effects ?? []), effectSignature((tick.requestedEffects ?? []).map((item) => item.effect)),
      `${label} Go requested effects`);
    same((nativeStep.effects ?? []).map((_, effectIndex) => ({
      dispatchId: tick.dispatchId,
      effectIndex,
    })), (tick.requestedEffects ?? []).map(({ dispatchId, effectIndex }) => ({ dispatchId, effectIndex })),
    `${label} effect request correlation`);
    if (nativeStep.kind === "click") {
      same({ path: fixtureEvent.path, event: fixtureEvent.event, value: fixtureEvent.value }, tick.action,
        `${label} fixture physical action`);
    }
    if (nativeStep.kind === "effect-reply") {
      const request = smoke.finalTrace.ticks.find((candidate) => candidate.requestedEffects?.some((item) =>
        item.effect?.arg === nativeStep.message.arg));
      assert.ok(request, `${label} reply has an earlier Go request`);
      same([{
        dispatchId: request.dispatchId,
        effectIndex: 0,
        message: nativeStep.message,
      }], tick.completedEffects, `${label} completion correlation`);
    } else {
      same([], tick.completedEffects, `${label} must not claim a completion`);
    }
    for (const effect of nativeStep.effects ?? []) {
      if (effect.kind === "fixture.request") expectedRequestForToken.set(effect.arg, tick.dispatchId);
    }
    tickRows.push({ tick: tick.index, event: nativeStep.index, message: nativeStep.message.name, dispatchId: tick.dispatchId });
  }

  same(4, smoke.rendererSwaps, "four interactive renderer swaps");
  same("dom", smoke.finalBackend, "smoke final renderer");
  same([], smoke.pendingAtEnd, "no pending effects at smoke end");
  same([], smoke.failures, "demo runtime failures");
  same([], smoke.browserErrors, "browser errors");
  same([], smoke.consoleErrors, "browser console errors");
  same([], smoke.failedRequests, "failed HTTP requests");
  same([], smoke.wasmRequests, "WebAssembly network requests");
  same([], smoke.noWasm.wasmRequests, "no-Wasm guard network requests");
  same([], smoke.noWasm.wasmAPIAttempts, "no-Wasm API attempts");
  same(12, smoke.checks.length, "scenario check count");
  same(3, smoke.retiredReplyProbeOutcomes.length, "retired host callback probes");
  same(["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"], smoke.retiredReplyProbeOutcomes.map((item) => item.token),
    "retired host callback probe order");
  assert.ok(smoke.retiredReplyProbeOutcomes.every((item) => item.outcome === "rejected"));
  same(["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"], smoke.goMessageProbeResults.map((item) => item.token),
    "direct old Go complete probe order");
  same(["dispatch-0011", "dispatch-0012", "dispatch-0013"], smoke.goMessageProbeResults.map((item) => item.dispatchId),
    "direct old Go update dispatch IDs");
  assert.ok(smoke.goMessageProbeResults.every((item) => item.stateUnchanged));
  same(3, smoke.requests.length, "HTTP asset requests");
  same([
    { path: "/", status: 200, bytes: 4546 },
    { path: "/demo.css", status: 200, bytes: 6573 },
    { path: "/demo.bundle.mjs", status: 200, bytes: 1837423 },
  ], smoke.requests, "static HTTP asset responses");

  const cancelRows = smoke.effectRecords.filter((record) => record.kind === "cancel");
  same(["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"], cancelRows.map((record) => record.token),
    "manual-host cancellation order");
  for (const record of cancelRows) {
    same({ dispatchId: expectedRequestForToken.get(record.token), effectIndex: 0 }, record.target,
      `cancel correlation for ${record.token}`);
  }
  const requestRows = smoke.effectRecords.filter((record) => record.kind === "request");
  same(["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4", "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7"],
    requestRows.map((record) => record.token), "manual-host request order");
  const retirementRows = smoke.effectRecords.filter((record) => record.kind === "force-deliver-retired");
  same(3, retirementRows.length, "retired completion driver records");
  assert.ok(retirementRows.every((record) => record.outcome === "rejected"));
  const duplicateRows = smoke.effectRecords.filter((record) => record.kind === "deliver" && record.outcome === "rejected");
  same(["sibling:g1:r4", "child:g2:r6"], duplicateRows.map((record) => record.token), "host duplicate completion probes");
  const acceptedDeliveries = smoke.effectRecords.filter((record) => record.kind === "deliver" && record.outcome === "accepted");
  same(["sibling:g1:r4", "grandchild:g2:r7", "child:g2:r6", "parent:g2:r5"],
    acceptedDeliveries.map((record) => record.token), "accepted host completion order");
  same(19, smoke.effectRecords.length, "complete host effect/cancel/probe record count");

  const stateAfterRemoval = smoke.finalTrace.ticks[9].state;
  const stateAfterRemount = smoke.finalTrace.ticks[10].state;
  const stateAfterOldReplies = smoke.finalTrace.ticks.slice(11, 14).map((tick) => tick.state);
  const removeState = fieldsByName(stateAfterRemoval);
  for (const node of ["Parent", "Child", "Grandchild"]) {
    same(false, scalar(fieldsByName(removeState[node]).Alive), `removal ${node} alive flag`);
    same(false, scalar(fieldsByName(removeState[node]).Pending), `removal ${node} pending flag`);
  }
  same("sibling:g1:r4", scalar(fieldsByName(removeState.Sibling).Token), "sibling token survives removal");
  same(true, scalar(fieldsByName(removeState.Sibling).Pending), "sibling pending survives removal");
  for (const staleState of stateAfterOldReplies) same(stateAfterRemount, staleState, "old Go completion leaves remount and sibling state unchanged");

  const finalStateFromTrace = decodeNode(smoke.finalTrace.ticks.at(-1).state, "Parent");
  same("parent:g2:r5", finalStateFromTrace.reply, "final parent reply");
  same("parent:g2:r5", smoke.finalState.parent.reply, "summary final parent reply");
  same("child:g2:r6", smoke.finalState.child.reply, "summary final child reply");
  same("grandchild:g2:r7", smoke.finalState.grandchild.reply, "summary final grandchild reply");
  same("sibling:g1:r4", smoke.finalState.sibling.reply, "summary final sibling reply");
  same([], smoke.finalDOM.controls.filter((control) => control.disabled === false && control.key.endsWith("request")),
    "all final request controls disabled");
  same(["parent-request", "child-request", "grandchild-request", "sibling-request", "parent-remount"],
    smoke.finalDOM.controls.filter((control) => control.disabled).map((control) => control.key),
    "literal final disabled control keys");
  same(expectedLifecycleDOM(expectedLifecycleStateAtTick(25)), smoke.finalDOM, "final DOM vs independent lifecycle oracle");

  const appManifest = await readJSON(resolve(ATTEMPT, "demo-site/demo-build.json"));
  same(componentId, appManifest.componentId, "demo bundle canonical component identity");
  same("react", appManifest.backend, "demo renderer build target");

  const archivePath = resolve(ATTEMPT, "artifacts.tar.gz");
  const archiveBytes = await readFile(archivePath);
  same(attempt.archive.sha256, sha256(archiveBytes), "attempt archive hash");
  same(archiveManifest.members.length, attempt.archive.memberCount, "archive manifest count vs attempt record");
  same(152, archiveManifest.members.length, "expected archive member count");
  const listed = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
    .trimEnd().split("\n");
  same(archiveManifest.members.map((member) => member.path), listed, "archive member order and names");
  const archiveMembersVerified = [];
  for (const member of archiveManifest.members) {
    const bytes = execFileSync("tar", ["-xOzf", archivePath, member.path], { maxBuffer: 16 * 1024 * 1024 });
    same(member.bytes, bytes.length, `archive byte length ${member.path}`);
    same(member.sha256, sha256(bytes), `archive hash ${member.path}`);
    archiveMembersVerified.push(member.path);
  }

  const currentPins = [];
  const sourceCandidates = [
    "cmd/compiled-lifecycle-native/main.go",
    "compiled-frontend/frontend/runtime/runtime.mjs",
    "compiled-frontend/frontend/runtime/runtime.test.mjs",
    "compiled-lifecycle/demo/app.mjs",
    "compiled-lifecycle/demo/build.mjs",
    "compiled-lifecycle/demo/demo.css",
    "compiled-lifecycle/demo/index.html",
    "compiled-lifecycle/demo/smoke.mjs",
    "compiled-lifecycle/runtime/runtime.mjs",
    "fixtures/compiled/lifecycle/app.go",
    "fixtures/compiled/lifecycle/scenario.json",
    "fixtures/compiled/lifecycle/view.go",
  ];
  for (const path of sourceCandidates) {
    const bytes = await readFile(resolve(ROOT, path));
    currentPins.push({ path, sha256: sha256(bytes), bytes: bytes.length });
  }
  const originalRuntimePin = "c6fad592554dda059c45ecdb1db55ab62283783de1b1d76c0f320f44fbdf7166";
  const currentRuntime = currentPins.find((item) => item.path === "compiled-lifecycle/runtime/runtime.mjs");
  same(originalRuntimePin, receipt.sourcePins.find((item) => item.path === "compiled-lifecycle/runtime/runtime.mjs")?.sha256,
    "E-DEMO receipt lifecycle wrapper pin");
  assert.notEqual(originalRuntimePin, currentRuntime.sha256, "current lifecycle wrapper differs from preintegration wrapper");
  same("9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed", currentRuntime.sha256,
    "current frozen R-UNMOUNT lifecycle wrapper hash");
  const sourcePinComparisons = attempt.sourceSnapshot.files.map((pin) => {
    const actual = currentPins.find((item) => item.path === pin.path);
    return { path: pin.path, recorded: pin.sha256, current: actual?.sha256 ?? null,
      matches: actual?.sha256 === pin.sha256 };
  });
  const receiptSourcePinComparisons = receipt.sourcePins.map((pin) => {
    const actual = currentPins.find((item) => item.path === pin.path);
    return { path: pin.path, recorded: pin.sha256, current: actual?.sha256 ?? null,
      matches: actual?.sha256 === pin.sha256 };
  });
  assert.ok(receiptSourcePinComparisons.every((pin) => pin.current), "all E-DEMO source pins resolved locally");
  same(["compiled-lifecycle/runtime/runtime.mjs"],
    receiptSourcePinComparisons.filter((pin) => !pin.matches).map((pin) => pin.path),
    "only the explicitly superseded wrapper differs from E-DEMO source pins");

  const evidenceFiles = [
    "demo-smoke.json", "demo.png", "demo-site/demo.bundle.mjs", "artifacts.tar.gz",
    "react/output/apps/lifecycle-7e6575d90707/app-ir.json",
    "react/output/apps/lifecycle-7e6575d90707/encoder.mjs",
    "react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs",
    "dom/output/apps/lifecycle-7e6575d90707/app-ir.json",
    "dom/output/apps/lifecycle-7e6575d90707/encoder.mjs",
    "dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs",
  ];
  const evidencePins = [];
  for (const path of evidenceFiles) {
    const bytes = await readFile(resolve(ATTEMPT, path));
    evidencePins.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const screenshotRecord = receipt.artifacts.screenshot;
  const screenshot = evidencePins.find((item) => item.path === "demo.png");
  same(screenshotRecord.sha256, screenshot.sha256, "raw screenshot hash vs smoke record");
  const bundleRecord = evidencePins.find((item) => item.path === "demo-site/demo.bundle.mjs");
  same(archiveManifest.members.find((member) => member.path === "demo-site/demo.bundle.mjs").sha256,
    bundleRecord.sha256, "static bundle hash vs archive manifest");

  const output = {
    schema: "gobi.compiled-lifecycle-xr-demo-review/v1",
    decision: "accepted",
    scope: "N6 bridge-green-02 preintegration HTTP demo only; not final source-pinned harness acceptance",
    checks: {
      reportReceiptHash: "verified",
      reactDOMAppIRParity: true,
      appIRComponentID: componentId,
      nativeGoCLI: { schema: native.schema, events: native.steps.length, matchingSmokeTicks: tickRows.length },
      smoke: {
        status: smoke.status,
        scenarioChecks: smoke.checks.length,
        finalTicks: smoke.finalTicks,
        rendererSwaps: smoke.rendererSwaps,
        effectRecords: smoke.effectRecords.length,
        pendingAtEnd: smoke.pendingAtEnd.length,
        cancellationOrder: cancelRows.map((record) => record.token),
        staleHostProbesRejected: retirementRows.length,
        staleGoMessagesNoOp: smoke.goMessageProbeResults.length,
        duplicateHostDeliveriesRejected: duplicateRows.map((record) => record.token),
        siblingSurvivedSubtreeRemovalPending: true,
        physicalControlsMatchIndependentOracle: true,
        httpAssetRequests: smoke.requests.length,
        allHttpRequestsSucceeded: true,
        browserErrors: smoke.browserErrors.length,
        consoleErrors: smoke.consoleErrors.length,
        failedRequests: smoke.failedRequests.length,
        wasmRequests: smoke.wasmRequests.length,
        wasmAPIAttempts: smoke.noWasm.wasmAPIAttempts.length,
      },
      archive: {
        members: archiveMembersVerified.length,
        namesMatchManifest: true,
        hashesMatchManifest: true,
        sha256: sha256(archiveBytes),
      },
      preintegrationWrapper: {
        recordedSourceHash: originalRuntimePin,
        currentSourceHash: currentRuntime.sha256,
        explicitlyBoundedToEarlierR_Effect_SliceVersion: true,
        currentRUnmountHashNotClaimedAsDemoInput: true,
      },
      sourcePinComparisons,
      receiptSourcePinComparisons,
      smokeTickComparison: tickRows,
      currentPins,
      artifacts: evidencePins,
      versions: attempt.versions,
      reportSHA256: receipt.report.sha256,
      receiptSummarySHA256: receipt.summary_sha256,
      independentOracleSHA256: oracleHash,
    },
    limitations: [
      "E-DEMO packet itself records a post-run source snapshot and does not claim a before/after source-stability pin.",
      "This smoke used the earlier R-EFFECT-SLICE lifecycle wrapper hash c6fad592…; the current wrapper is the later R-UNMOUNT hash 9c2a0652…. The packet explicitly marks acceptanceRun=false and preintegration-demo-only.",
      "The static demo exercises this fixed value-owned fixture and manual effect host; it does not establish arbitrary pointer Manager support, production transport behavior, or final source-pinned cross-profile conformance."
    ],
  };
  await writeFile(resolve(REVIEW, "review.json"), json(output));
  await writeFile(resolve(REVIEW, "native-go.stdout.json"), json(native));
  await writeFile(resolve(REVIEW, "native-go.stderr.log"), nativeRun.stderr ?? "", "utf8");
  process.stdout.write(`${JSON.stringify({ decision: output.decision, archiveMembers: archiveMembersVerified.length,
    ticks: smoke.finalTicks, swaps: smoke.rendererSwaps, smokeChecks: smoke.checks.length,
    currentWrapper: currentRuntime.sha256, oldWrapper: originalRuntimePin, review: resolve(REVIEW, "review.json") })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
