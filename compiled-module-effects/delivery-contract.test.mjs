import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  aggregateMutationControlReports, assertUnmountLifecycleOrder, BUILD_MUTATION_CONTROL_IDS, CAPTURE_MUTATION_CONTROL_IDS,
  MODULE_EFFECTS_PROFILES, MODULE_EFFECTS_SCENARIOS, validateConformanceSummary,
  verifyConformanceProducerSummary,
} from "./delivery-contract.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytesFor = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function rejectedRows(ids) {
  return ids.map((id) => ({ id, name: id, rejected: true, path: `oracle.${id}` }));
}

function mutationReport(ids, allowAdditionalControls) {
  const rejected = rejectedRows(ids);
  return { status: "detected", total: rejected.length, requiredControlIds: [...ids], allowAdditionalControls, rejected };
}

function makeBoundaryResult() {
  const names = [
    "max-safe", "max-safe-cancel-retry", "max-safe-plus-one", "zero", "leading-zero",
    "malformed", "uint64-max", "uint64-overflow", "non-ascii-digit", "other-byte",
  ];
  return {
    schema: "gobi.module-effects-mount-boundaries/v1",
    cases: names.map((name, index) => ({ name, steps: [{ state: { Mounted: index < 2 } }] })),
  };
}

function makeBuildIndex(boundaryPin) {
  const capabilities = ["effect.cancel", "effect.request-reply", "numeric.float64", "numeric.safe-integer", "view.node"];
  const descriptors = [
    { kind: "fixture.request", name: "save", argument: "opaque token", reply: "complete" },
    { kind: "lifecycle.cancel", name: "cancel", argument: "opaque token", reply: "" },
  ];
  const builds = {};
  const admission = {};
  const inventory = [];
  for (const backend of ["react", "dom"]) {
    const backendSeed = backend === "react" ? "a" : "b";
    const parentABI = backendSeed.repeat(64);
    const childABI = backend === "react" ? "c".repeat(64) : "d".repeat(64);
    const helper = backend === "react" ? "e".repeat(64) : "f".repeat(64);
    const appIR = "1".repeat(64);
    const descriptor = "2".repeat(64);
    const normalizedModule = "3".repeat(64);
    const normalizedHelper = "4".repeat(64);
    builds[backend] = {
      parent: {
        packagePath: "parent", artifacts: {
          moduleABI: { abiSHA256: parentABI }, appIR: { sha256: appIR },
        }, keyedHelper: { sha256: helper, descriptorSha256: descriptor },
      },
      child: { packagePath: "child", artifacts: { moduleABI: { abiSHA256: childABI } } },
    };
    admission[backend] = {
      effectCapabilityExtension: { capabilities },
      parentABIComparison: { normalizedParentModuleSHA256: normalizedModule, normalizedParentHelperSHA256: normalizedHelper },
    };
    inventory.push({ backend, role: "parent" }, { backend, role: "child" });
  }
  return {
    schema: "gobi.module-effects-build-index/v1", builds, admission, inventory, closedEffectDescriptors: descriptors,
    nativeMountBoundaries: {
      schema: "gobi.module-effects-mount-boundaries/v1", path: "metadata/native-mount-boundaries/result.json",
      bytes: boundaryPin.bytes, sha256: boundaryPin.sha256, caseNames: boundaryPin.value.cases.map((item) => item.name),
    },
  };
}

function expectedPins(index, backend) {
  const pair = index.builds[backend];
  const admission = index.admission[backend];
  return {
    parentABI: pair.parent.artifacts.moduleABI.abiSHA256,
    childABI: pair.child.artifacts.moduleABI.abiSHA256,
    helperSHA256: pair.parent.keyedHelper.sha256,
    parentAppIRSHA256: pair.parent.artifacts.appIR.sha256,
    helperDescriptorSHA256: pair.parent.keyedHelper.descriptorSha256,
    normalizedParentModuleSHA256: admission.parentABIComparison.normalizedParentModuleSHA256,
    normalizedParentHelperSHA256: admission.parentABIComparison.normalizedParentHelperSHA256,
  };
}

function makeCaptureControls() {
  return mutationReport(CAPTURE_MUTATION_CONTROL_IDS, true);
}

function makeBuildControls() {
  return mutationReport(BUILD_MUTATION_CONTROL_IDS, false);
}

async function writePinnedJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const bytes = bytesFor(value);
  await writeFile(path, bytes);
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}

async function makeProducerFixture() {
  const root = await mkdtemp(join(tmpdir(), "gobi-effects-delivery-contract-"));
  const attemptRoot = join(root, "attempt");
  const outputPrefix = join(attemptRoot, "conformance/effects");
  const buildIndexPath = join(attemptRoot, "builds/build-index.json");
  const boundaryResult = makeBoundaryResult();
  const boundaryPath = join(dirname(buildIndexPath), "metadata/native-mount-boundaries/result.json");
  const boundaryBytes = bytesFor(boundaryResult);
  await mkdir(dirname(boundaryPath), { recursive: true });
  await writeFile(boundaryPath, boundaryBytes);
  const boundaryPin = { value: boundaryResult, bytes: boundaryBytes.length, sha256: sha256(boundaryBytes) };
  const buildIndex = makeBuildIndex(boundaryPin);
  const buildIndexBytes = bytesFor(buildIndex);
  await mkdir(dirname(buildIndexPath), { recursive: true });
  await writeFile(buildIndexPath, buildIndexBytes);
  const context = {
    root: join(root, "checkout"), attemptRoot, outputPrefix, buildIndexPath, buildIndexBytes, buildIndex,
    nativeGo: join(root, "go/bin/go"), nativeGoVersion: "go version go1.27.3 linux/amd64",
    chromium: join(root, "chromium"), browserVersion: "153.0.8010.0",
    nodeExecutable: join(root, "node/bin/node"), nodeVersion: "v22.23.4",
    compilerGo: "go1.27.3 linux/amd64", playwright: "1.64.1",
    expectedCommand: [
      join(root, "node/bin/node"), join(root, "checkout/compiled-module-effects/conformance/run.mjs"),
      "--native-go", join(root, "go/bin/go"), "--build-index", buildIndexPath,
      "--chromium", join(root, "chromium"), "--output", outputPrefix,
    ],
    buildSummary: { admission: buildIndex.admission, nativeMountBoundaries: buildIndex.nativeMountBoundaries },
  };
  const indexPin = {
    path: buildIndexPath, bytes: buildIndexBytes.length, sha256: sha256(buildIndexBytes),
  };
  const buildRef = {
    ...indexPin, schema: buildIndex.schema, admission: buildIndex.admission,
    closedEffectDescriptors: buildIndex.closedEffectDescriptors,
    pins: { react: expectedPins(buildIndex, "react"), dom: expectedPins(buildIndex, "dom") },
    oracle: {
      schema: buildIndex.schema, backendBuilds: 2, independentApps: 4, effects: 2, capabilities: 5,
      uint64Boundary: Object.fromEntries(["react", "dom"].map((backend) => [backend, {
        cases: boundaryResult.cases.length, validMountCases: 2, bigintFields: ["Generation", "RequestID"],
        encodedSafeRange: String(Number.MAX_SAFE_INTEGER),
      }])),
    },
    mutationControls: makeBuildControls(),
  };
  const summary = {
    schema: "gobi.module-effects-conformance-summary/v1", status: "matched", worker: "N4", job_id: "E-HARNESS",
    buildIndex: buildRef, captureMutationControls: makeCaptureControls(),
    nativeGo: context.nativeGo, nativeGoVersion: context.nativeGoVersion, chromium: context.chromium,
    versions: {
      node: context.nodeVersion, nodeExecutable: context.nodeExecutable, nativeGo: context.nativeGoVersion,
      compilerGo: context.compilerGo, browser: context.browserVersion, playwright: context.playwright,
    },
    command: context.expectedCommand, scenarioCount: 4, fixedEventCount: 31,
    seededSeeds: [20261104, 20261105, 20261106], seededEventCounts: {},
    profiles: [...MODULE_EFFECTS_PROFILES], profileCountPerScenario: 5,
    nativeEvents: 0, nativeEffects: 0, transportEvents: 0, profileEvents: 0,
    scenarios: [], captures: {},
    conformanceScope: {
      browserClicks: "real HTMLElement.click() on a current rendered button",
      applicationTransitions: "native Go replay is the expected transition source",
      transport: "deterministic deferred manual completion queue",
      lifetime: "callbacks remain valid across renderer swaps",
    },
  };
  const eventCounts = { literal: 31, "seed-20261104": 49, "seed-20261105": 50, "seed-20261106": 48 };
  const effectCounts = { literal: 10, "seed-20261104": 16, "seed-20261105": 16, "seed-20261106": 16 };
  const transportCounts = { literal: 20, "seed-20261104": 32, "seed-20261105": 32, "seed-20261106": 32 };
  for (const scenarioLabel of MODULE_EFFECTS_SCENARIOS) {
    const eventCount = eventCounts[scenarioLabel];
    const seed = scenarioLabel === "literal" ? null : Number(scenarioLabel.slice("seed-".length));
    const scenario = {
      schema: "gobi.module-effects-scenario/v1",
      name: scenarioLabel === "literal" ? "module-effects-literal" : `module-effects-seed-${seed}`,
      events: Array.from({ length: eventCount }, (_, index) => ({ index })),
    };
    const scenarioPin = await writePinnedJSON(join(attemptRoot, `conformance/effects.${scenarioLabel}.scenario.json`), scenario);
    const native = {
      schema: "gobi.module-effects-native/v1", name: scenario.name,
      events: Array.from({ length: eventCount }, (_, index) => ({ index })),
      states: Array.from({ length: eventCount + 1 }, (_, index) => ({ index })),
      effects: Array.from({ length: effectCounts[scenarioLabel] }, (_, index) => ({
        index, effect: { kind: "fixture.request", name: "save", arg: `a:g1:r${index + 1}`, reply: "complete" },
      })),
      transportLedger: Array.from({ length: transportCounts[scenarioLabel] }, (_, index) => ({ index })),
      lifecycleLedger: [{ kind: "mount" }], retiredChildren: [],
    };
    const nativePin = await writePinnedJSON(join(attemptRoot, `conformance/effects.${scenarioLabel}.native.json`), native);
    const argv = [context.nativeGo, "run", "./cmd/module-effects-native", "-script", scenarioPin.path];
    const profileRefs = {};
    const profileCounts = {};
    for (const profile of MODULE_EFFECTS_PROFILES) {
      const backend = profile.endsWith("react") ? "react" : "dom";
      const capture = {
        schema: "gobi.module-effects-capture/v1", profile, backend,
        scenarioName: scenario.name, scenario, seed, sourceEventCount: eventCount,
        modulePins: {
          parentABI: expectedPins(buildIndex, backend).parentABI,
          childABI: expectedPins(buildIndex, backend).childABI,
          helperSHA256: expectedPins(buildIndex, backend).helperSHA256,
          parentAppIRSHA256: expectedPins(buildIndex, backend).parentAppIRSHA256,
          helperDescriptorSHA256: expectedPins(buildIndex, backend).helperDescriptorSHA256,
        },
        versions: profile.startsWith("direct.")
          ? { node: context.nodeVersion }
          : { chromium: context.browserVersion, playwright: context.playwright },
        events: Array.from({ length: eventCount }, (_, index) => ({ index })),
        snapshots: Array.from({ length: eventCount + 1 }, (_, index) => ({ index })),
        ledger: [{ index: 0 }], orderedLedger: [{ sequence: 0 }],
        effectLedger: [{ index: 0 }], lifecycleLedger: [{ index: 0 }], retiredChildren: [],
        callOrder: [{ index: 0 }],
        transportLedger: Array.from({ length: transportCounts[scenarioLabel] }, (_, index) => ({ index })),
        rendererSwaps: [],
      };
      profileCounts[profile] = {
        events: capture.events.length, snapshots: capture.snapshots.length, ledger: capture.ledger.length,
        orderedLedger: capture.orderedLedger.length, transportLedger: capture.transportLedger.length,
      };
      profileRefs[profile] = await writePinnedJSON(join(attemptRoot, `conformance/effects.${scenarioLabel}.${profile}.json`), capture);
      summary.profileEvents += capture.events.length;
    }
    const scenarioRow = {
      label: scenarioLabel, seed, generator: null,
      scenario: { name: scenario.name, events: eventCount, ...scenarioPin },
      nativeCommand: { argv, cwd: context.root, envOverrides: { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" } },
      eventCount, nativeEventCount: eventCount, stateCount: native.states.length,
      effectCount: native.effects.length, transportEventCount: native.transportLedger.length,
      profileArrayCounts: profileCounts,
      nativeCheck: {
        events: native.events.length, states: native.states.length, effects: native.effects.length,
        transportEvents: native.transportLedger.length, lifecycleEvents: native.lifecycleLedger.length,
      },
      parity: {
        status: "matched", schema: "gobi.module-effects-oracle/v1", scenario: scenario.name,
        events: eventCount, profiles: MODULE_EFFECTS_PROFILES.length, effects: native.effects.length,
        requestTokens: native.effects.length, cancellationTokens: 0, replyTransitions: native.transportLedger.length,
      },
      browser: { version: context.browserVersion, playwright: context.playwright, pageErrors: [] },
    };
    summary.scenarios.push(scenarioRow);
    summary.captures[scenarioLabel] = {
      scenario: scenarioPin,
      native: {
        ...nativePin, command: argv, commandCwd: context.root,
        commandEnvironment: { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
      },
      profiles: profileRefs,
    };
    if (seed !== null) summary.seededEventCounts[String(seed)] = eventCount;
    summary.nativeEvents += native.events.length;
    summary.nativeEffects += native.effects.length;
    summary.transportEvents += native.transportLedger.length;
  }
  const summaryPath = `${outputPrefix}.summary.json`;
  const summaryBytes = bytesFor(summary);
  await mkdir(dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, summaryBytes);
  const check = {
    schema: "gobi.module-effects-conformance-check/v1", status: "matched",
    summary: { path: summaryPath, bytes: summaryBytes.length, sha256: sha256(summaryBytes) },
  };
  await writeFile(`${outputPrefix}.check.json`, bytesFor(check));
  return { root, context, summary };
}

test("delivery contract verifies the complete frozen E-HARNESS public report and artifact pins", async (t) => {
  const fixture = await makeProducerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const structural = validateConformanceSummary(fixture.summary, fixture.context);
  assert.deepEqual(structural.scenarioNames, MODULE_EFFECTS_SCENARIOS);
  assert.deepEqual(structural.profileNames, MODULE_EFFECTS_PROFILES);
  assert.equal(structural.captureMutationControlCount, CAPTURE_MUTATION_CONTROL_IDS.length);
  assert.equal(structural.buildMutationControlCount, BUILD_MUTATION_CONTROL_IDS.length);

  const verified = await verifyConformanceProducerSummary(fixture.summary, fixture.context);
  assert.equal(verified.profileCaptures.length, 20);
  assert.equal(verified.counts.nativeEvents, 178);
  assert.equal(verified.counts.nativeEffects, 58);
  assert.equal(verified.counts.nativeTransportEvents, 116);
  assert.equal(verified.counts.profileEvents, 890);
  assert.equal(verified.captureMutationControls.rejected.length, 16);
  assert.equal(verified.buildAdmissionMutationControls.rejected.length, 7);

  const missingHash = structuredClone(fixture.summary);
  delete missingHash.captures.literal.native.sha256;
  assert.throws(() => validateConformanceSummary(missingHash, fixture.context), /summary\.captures\.literal\.native\.sha256/);

  const malformedHash = structuredClone(fixture.summary);
  malformedHash.captures.literal.native.sha256 = "not-a-sha256";
  assert.throws(() => validateConformanceSummary(malformedHash, fixture.context), /summary\.captures\.literal\.native\.sha256/);

  await writeFile(fixture.summary.captures.literal.native.path, "changed after producer pin\n");
  await assert.rejects(verifyConformanceProducerSummary(fixture.summary, fixture.context), /artifact bytes or SHA-256 differ/);
});

test("independent mutation application aggregation requires all 16 controls in each scenario", () => {
  const reports = MODULE_EFFECTS_SCENARIOS.map(() => ({ status: "detected", total: CAPTURE_MUTATION_CONTROL_IDS.length,
    requiredControlIds: [...CAPTURE_MUTATION_CONTROL_IDS], allowAdditionalControls: false,
    rejected: rejectedRows(CAPTURE_MUTATION_CONTROL_IDS) }));
  const result = aggregateMutationControlReports(reports);
  assert.equal(result.status, "detected");
  assert.equal(result.total, 64);
  assert.equal(result.rejected.length, 64);
  assert.equal(result.mutationControlsDetected, 64);
  assert.equal(result.distinctControlIds.length, 16);
  assert.deepEqual(result.scenarios.map((item) => item.scenario), MODULE_EFFECTS_SCENARIOS);

  const omitted = structuredClone(reports);
  omitted[2].rejected.pop();
  omitted[2].total -= 1;
  assert.throws(() => aggregateMutationControlReports(omitted), /total|missing required controls/);

  const accepted = structuredClone(reports);
  accepted[1].rejected[0].rejected = false;
  assert.throws(() => aggregateMutationControlReports(accepted), /must be true/);
});

test("unmount order is tied to the exact child state event, not an earlier unrelated commit", () => {
  const rows = [
    { sequence: 1, kind: "go-state-commit", stateEventIndex: 9, eventKind: "renderer-action", key: "b", generation: 1, mounted: true, pending: true, token: "b:g1:r1" },
    { sequence: 2, kind: "go-update-unmount", stateEventIndex: 10, key: "b", generation: 1,
      before: { Token: "b:g1:r1", Mounted: true, Pending: true }, after: { Token: "b:g1:r1", Mounted: false, Pending: false } },
    { sequence: 3, kind: "go-state-commit", stateEventIndex: 10, eventKind: "child-unmount", key: "b", generation: 1, mounted: false, pending: false, token: "b:g1:r1" },
    { sequence: 4, kind: "go-cancel-effect", stateEventIndex: 10, key: "b", generation: 1, token: "b:g1:r1", pendingAfter: false,
      descriptor: { kind: "lifecycle.cancel", arg: "b:g1:r1" } },
    { sequence: 5, kind: "transport-cancel-call", stateEventIndex: 10, key: "b", generation: 1, token: "b:g1:r1", retiredBeforeCall: true },
    { sequence: 6, kind: "transport-cancel", stateEventIndex: 10, key: "b", generation: 1, token: "b:g1:r1", outcome: "cancelled" },
    { sequence: 7, kind: "renderer-unmount", stateEventIndex: 10, key: "b", generation: 1 },
  ];
  const accepted = assertUnmountLifecycleOrder(rows, { key: "b", generation: 1 });
  assert.equal(accepted.stateEventIndex, 10);
  assert.deepEqual(Object.values(accepted.sequence), [2, 3, 4, 5, 6, 7]);

  const reversed = structuredClone(rows);
  reversed[1].sequence = 4;
  reversed[2].sequence = 3;
  assert.throws(() => assertUnmountLifecycleOrder(reversed, { key: "b", generation: 1 }), /strictly ordered/);

  const missingCommit = rows.filter((row) => !(row.kind === "go-state-commit" && row.stateEventIndex === 10));
  assert.throws(() => assertUnmountLifecycleOrder(missingCommit, { key: "b", generation: 1 }), /exactly one matching row/);
});
