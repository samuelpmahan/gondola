import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const MODULE_EFFECTS_SCENARIOS = Object.freeze([
  "literal", "seed-20261104", "seed-20261105", "seed-20261106",
]);
export const MODULE_EFFECTS_PROFILES = Object.freeze([
  "direct.react", "direct.dom", "browser.react", "browser.dom", "browser.swap",
]);
export const CAPTURE_MUTATION_CONTROL_IDS = Object.freeze([
  "bypass-go-cancellation",
  "cancel-sibling-pending-request",
  "accept-duplicate-reply",
  "accept-wrong-correlation-tuple",
  "accept-old-generation-reply",
  "confuse-renderer-epoch-with-reply-correlation",
  "start-before-commit-render",
  "call-transport-cancel-before-retiring-correlation",
  "accept-reply-without-correlation",
  "accept-reply-with-wrong-state-event-index",
  "accept-reply-with-extra-correlation-field",
  "accept-reply-with-wrong-dispatch-correlation",
  "accept-reply-with-wrong-effect-correlation",
  "accept-duplicate-reply-with-wrong-state-event-index",
  "accept-cancelled-reply-without-correlation",
  "accept-cancelled-reply-with-wrong-state-event-index",
]);
export const BUILD_MUTATION_CONTROL_IDS = Object.freeze([
  "remove-cancel-descriptor",
  "remove-cancel-capability",
  "unadmit-react-child",
  "wrong-dom-child-package",
  "remove-react-keyed-helper",
  "drop-source-pin",
  "replace-dom-child-uint64-with-number",
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const EXPECTED_SCENARIO_COUNTS = Object.freeze({
  literal: 31,
  "seed-20261104": 49,
  "seed-20261105": 50,
  "seed-20261106": 48,
});
const PROFILE_ARRAYS = Object.freeze([
  "events", "snapshots", "ledger", "orderedLedger", "effectLedger", "lifecycleLedger",
  "retiredChildren", "callOrder", "transportLedger",
]);
const SUMMARY_ARRAYS = Object.freeze([
  "events", "snapshots", "ledger", "orderedLedger", "transportLedger",
]);
const BACKEND_FOR_PROFILE = Object.freeze({
  "direct.react": "react", "direct.dom": "dom", "browser.react": "react",
  "browser.dom": "dom", "browser.swap": "dom",
});

function fail(path, detail) {
  throw new TypeError(`delivery-contract.${path}: ${detail}`);
}

function record(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value;
}

function list(value, path, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) fail(path, "must be an array");
  return value;
}

function string(value, path) {
  if (typeof value !== "string" || value.length === 0) fail(path, "must be a nonempty string");
  return value;
}

function count(value, path, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) fail(path, "must be a safe nonnegative integer");
  return value;
}

function equal(actual, expected, path) {
  if (!isDeepStrictEqual(actual, expected)) fail(path, "does not match its producer contract");
}

function pinShape(value, path) {
  record(value, path);
  string(value.path, `${path}.path`);
  count(value.bytes, `${path}.bytes`, { positive: true });
  if (!/^[0-9a-f]{64}$/.test(value.sha256 ?? "")) fail(`${path}.sha256`, "must be a lowercase SHA-256 digest");
  return value;
}

export function validateMutationControlReport(report, {
  path = "mutationControls",
  requiredIds,
  allowAdditionalControls,
  normalizeIdFromName = false,
} = {}) {
  record(report, path);
  if (report.status !== "detected") fail(`${path}.status`, "must be detected");
  if (report.allowAdditionalControls !== allowAdditionalControls) {
    fail(`${path}.allowAdditionalControls`, `must be ${allowAdditionalControls}`);
  }
  const required = list(report.requiredControlIds, `${path}.requiredControlIds`, { allowEmpty: false });
  if (required.some((id) => typeof id !== "string" || id.length === 0) || new Set(required).size !== required.length) {
    fail(`${path}.requiredControlIds`, "must contain unique nonempty control IDs");
  }
  equal(new Set(required), new Set(requiredIds), `${path}.requiredControlIds`);
  const rejected = list(report.rejected, `${path}.rejected`, { allowEmpty: false });
  count(report.total, `${path}.total`);
  if (report.total !== rejected.length) fail(`${path}.total`, "must equal the actual rejected row count");
  const ids = [];
  for (let index = 0; index < rejected.length; index += 1) {
    const row = record(rejected[index], `${path}.rejected[${index}]`);
    const name = string(row.name, `${path}.rejected[${index}].name`);
    const id = row.id ?? (normalizeIdFromName ? name : undefined);
    string(id, `${path}.rejected[${index}].id`);
    if (id !== name) fail(`${path}.rejected[${index}]`, "id and name must identify the same control");
    if (row.rejected !== true) fail(`${path}.rejected[${index}].rejected`, "must be true");
    string(row.path, `${path}.rejected[${index}].path`);
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) fail(`${path}.rejected`, "control IDs must be unique");
  const missing = requiredIds.filter((id) => !ids.includes(id));
  const extra = ids.filter((id) => !requiredIds.includes(id));
  if (missing.length !== 0) fail(`${path}.rejected`, `missing required controls: ${missing.join(", ")}`);
  if (!allowAdditionalControls && extra.length !== 0) fail(`${path}.rejected`, `unexpected controls: ${extra.join(", ")}`);
  return { ...report, rejected: rejected.map((row, index) => ({ ...row, id: ids[index] })) };
}

function deriveBuildPins(index, backend) {
  const pair = index.builds?.[backend];
  const admission = index.admission?.[backend];
  if (!pair?.parent || !pair?.child || !admission?.parentABIComparison) {
    fail(`buildIndex.${backend}`, "is missing the parent/child build or admitted ABI comparison");
  }
  const helper = pair.parent.keyedHelper;
  const parentABI = pair.parent.artifacts?.moduleABI?.abiSHA256;
  const childABI = pair.child.artifacts?.moduleABI?.abiSHA256;
  const parentAppIR = pair.parent.artifacts?.appIR?.sha256;
  const values = {
    parentABI,
    childABI,
    helperSHA256: helper?.sha256,
    parentAppIRSHA256: parentAppIR,
    helperDescriptorSHA256: helper?.descriptorSha256,
    normalizedParentModuleSHA256: admission.parentABIComparison.normalizedParentModuleSHA256,
    normalizedParentHelperSHA256: admission.parentABIComparison.normalizedParentHelperSHA256,
  };
  for (const [name, value] of Object.entries(values)) {
    if (!/^[0-9a-f]{64}$/.test(value ?? "")) fail(`buildIndex.${backend}.pins.${name}`, "is missing a build-index SHA-256 pin");
  }
  return values;
}

function validateBuildSummary(summary, context) {
  const build = record(summary.buildIndex, "buildIndex");
  pinShape(build, "buildIndex");
  equal(resolve(build.path), resolve(context.buildIndexPath), "buildIndex.path");
  equal(build.bytes, context.buildIndexBytes.length, "buildIndex.bytes");
  equal(build.sha256, sha256(context.buildIndexBytes), "buildIndex.sha256");
  const index = record(context.buildIndex, "buildIndexArtifact");
  if (index.schema !== "gobi.module-effects-build-index/v1" || build.schema !== index.schema) {
    fail("buildIndex.schema", "does not identify the verified module-effects build index");
  }
  equal(build.admission, index.admission, "buildIndex.admission");
  equal(build.admission, context.buildSummary.admission, "buildIndex.admission.buildResult");
  equal(build.closedEffectDescriptors, index.closedEffectDescriptors, "buildIndex.closedEffectDescriptors");
  const pins = record(build.pins, "buildIndex.pins");
  for (const backend of ["react", "dom"]) equal(pins[backend], deriveBuildPins(index, backend), `buildIndex.pins.${backend}`);
  const oracle = record(build.oracle, "buildIndex.oracle");
  const descriptorCount = list(index.closedEffectDescriptors, "buildIndexArtifact.closedEffectDescriptors", { allowEmpty: false }).length;
  const inventoryCount = list(index.inventory, "buildIndexArtifact.inventory", { allowEmpty: false }).length;
  const capabilityNames = new Set();
  for (const backend of ["react", "dom"]) {
    const capabilities = list(index.admission?.[backend]?.effectCapabilityExtension?.capabilities,
      `buildIndexArtifact.admission.${backend}.effectCapabilityExtension.capabilities`, { allowEmpty: false });
    for (const capability of capabilities) capabilityNames.add(capability);
  }
  equal(oracle.schema, index.schema, "buildIndex.oracle.schema");
  equal(oracle.backendBuilds, Object.keys(index.builds ?? {}).length, "buildIndex.oracle.backendBuilds");
  equal(oracle.independentApps, inventoryCount, "buildIndex.oracle.independentApps");
  equal(oracle.effects, descriptorCount, "buildIndex.oracle.effects");
  equal(oracle.capabilities, capabilityNames.size, "buildIndex.oracle.capabilities");
  const boundary = record(oracle.uint64Boundary, "buildIndex.oracle.uint64Boundary");
  const boundaryMetadata = record(index.nativeMountBoundaries, "buildIndexArtifact.nativeMountBoundaries");
  const boundaryNames = list(boundaryMetadata.caseNames, "buildIndexArtifact.nativeMountBoundaries.caseNames", { allowEmpty: false });
  equal(context.buildSummary.nativeMountBoundaries, boundaryMetadata, "buildIndexArtifact.nativeMountBoundaries.buildResult");
  for (const backend of ["react", "dom"]) {
    const actual = record(boundary[backend], `buildIndex.oracle.uint64Boundary.${backend}`);
    equal(actual.cases, boundaryNames.length, `buildIndex.oracle.uint64Boundary.${backend}.cases`);
    count(actual.validMountCases, `buildIndex.oracle.uint64Boundary.${backend}.validMountCases`);
    if (actual.validMountCases > actual.cases) fail(`buildIndex.oracle.uint64Boundary.${backend}.validMountCases`, "cannot exceed the mounted boundary case count");
    equal(actual.bigintFields, ["Generation", "RequestID"], `buildIndex.oracle.uint64Boundary.${backend}.bigintFields`);
    equal(actual.encodedSafeRange, String(Number.MAX_SAFE_INTEGER), `buildIndex.oracle.uint64Boundary.${backend}.encodedSafeRange`);
  }
  validateMutationControlReport(build.mutationControls, {
    path: "buildIndex.mutationControls", requiredIds: BUILD_MUTATION_CONTROL_IDS, allowAdditionalControls: false,
  });
}

function validateTopLevel(summary, context) {
  record(summary, "summary");
  if (summary.schema !== "gobi.module-effects-conformance-summary/v1" || summary.status !== "matched" ||
      summary.worker !== "N4" || summary.job_id !== "E-HARNESS") {
    fail("summary", "does not identify a matched E-HARNESS producer result");
  }
  equal(summary.command, context.expectedCommand, "summary.command");
  equal(summary.nativeGo, context.nativeGo, "summary.nativeGo");
  equal(summary.nativeGoVersion, context.nativeGoVersion, "summary.nativeGoVersion");
  equal(summary.chromium, context.chromium, "summary.chromium");
  const versions = record(summary.versions, "summary.versions");
  equal(versions.node, context.nodeVersion, "summary.versions.node");
  equal(versions.nodeExecutable, context.nodeExecutable, "summary.versions.nodeExecutable");
  equal(versions.nativeGo, context.nativeGoVersion, "summary.versions.nativeGo");
  equal(versions.compilerGo, context.compilerGo, "summary.versions.compilerGo");
  equal(versions.playwright, context.playwright, "summary.versions.playwright");
  if (typeof versions.browser !== "string" || versions.browser.length === 0 ||
      context.browserVersion !== undefined && versions.browser !== context.browserVersion) {
    fail("summary.versions.browser", "does not match the pinned Chromium executable");
  }
  equal(summary.profiles, MODULE_EFFECTS_PROFILES, "summary.profiles");
  equal(summary.profileCountPerScenario, MODULE_EFFECTS_PROFILES.length, "summary.profileCountPerScenario");
  equal(summary.scenarioCount, MODULE_EFFECTS_SCENARIOS.length, "summary.scenarioCount");
  equal(summary.fixedEventCount, EXPECTED_SCENARIO_COUNTS.literal, "summary.fixedEventCount");
  equal(summary.seededSeeds, MODULE_EFFECTS_SCENARIOS.slice(1).map((name) => Number(name.slice("seed-".length))), "summary.seededSeeds");
  validateMutationControlReport(summary.captureMutationControls, {
    path: "summary.captureMutationControls", requiredIds: CAPTURE_MUTATION_CONTROL_IDS, allowAdditionalControls: true,
  });
  validateBuildSummary(summary, context);
  const conformanceScope = record(summary.conformanceScope, "summary.conformanceScope");
  if (!string(conformanceScope.browserClicks, "summary.conformanceScope.browserClicks").includes("HTMLElement.click()") ||
      !string(conformanceScope.applicationTransitions, "summary.conformanceScope.applicationTransitions").includes("native Go replay") ||
      !string(conformanceScope.transport, "summary.conformanceScope.transport").includes("deferred") ||
      !string(conformanceScope.lifetime, "summary.conformanceScope.lifetime").includes("renderer swaps")) {
    fail("summary.conformanceScope", "omits the producer's browser-input, replay, transport, or lifetime boundary");
  }
  const captures = record(summary.captures, "summary.captures");
  equal(Object.keys(captures).sort(), [...MODULE_EFFECTS_SCENARIOS].sort(), "summary.captures.keys");
  const rows = list(summary.scenarios, "summary.scenarios", { allowEmpty: false });
  equal(rows.map((row) => row?.label).sort(), [...MODULE_EFFECTS_SCENARIOS].sort(), "summary.scenarios.labels");
  const rowByLabel = new Map(rows.map((row) => [row.label, row]));
  const seededEventCounts = {};
  for (const label of MODULE_EFFECTS_SCENARIOS) {
    const captureRefs = record(captures[label], `summary.captures.${label}`);
    const row = record(rowByLabel.get(label), `summary.scenarios.${label}`);
    const eventCount = EXPECTED_SCENARIO_COUNTS[label];
    equal(row.label, label, `summary.scenarios.${label}.label`);
    equal(row.seed, label === "literal" ? null : Number(label.slice("seed-".length)), `summary.scenarios.${label}.seed`);
    equal(row.eventCount, eventCount, `summary.scenarios.${label}.eventCount`);
    equal(row.scenario?.events, eventCount, `summary.scenarios.${label}.scenario.events`);
    for (const key of ["path", "bytes", "sha256"]) equal(row.scenario?.[key], captureRefs.scenario?.[key], `summary.scenarios.${label}.scenario.${key}`);
    pinShape(captureRefs.scenario, `summary.captures.${label}.scenario`);
    pinShape(captureRefs.native, `summary.captures.${label}.native`);
    const scenarioPath = captureRefs.scenario.path;
    const expectedNativeArgv = [context.nativeGo, "run", "./cmd/module-effects-native", "-script", scenarioPath];
    const nativeCommand = record(row.nativeCommand, `summary.scenarios.${label}.nativeCommand`);
    equal(captureRefs.native.command, expectedNativeArgv, `summary.captures.${label}.native.command`);
    equal(captureRefs.native.commandCwd, context.root, `summary.captures.${label}.native.commandCwd`);
    equal(captureRefs.native.commandEnvironment, { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" }, `summary.captures.${label}.native.commandEnvironment`);
    equal(nativeCommand.argv, captureRefs.native.command, `summary.scenarios.${label}.nativeCommand.argv`);
    equal(nativeCommand.cwd, captureRefs.native.commandCwd, `summary.scenarios.${label}.nativeCommand.cwd`);
    equal(nativeCommand.envOverrides, captureRefs.native.commandEnvironment, `summary.scenarios.${label}.nativeCommand.envOverrides`);
    if (!isDeepStrictEqual(Object.keys(captureRefs.profiles ?? {}).sort(), [...MODULE_EFFECTS_PROFILES].sort())) {
      fail(`summary.captures.${label}.profiles`, "must contain exactly the five frozen profile references");
    }
    const counts = record(row.profileArrayCounts, `summary.scenarios.${label}.profileArrayCounts`);
    equal(Object.keys(counts).sort(), [...MODULE_EFFECTS_PROFILES].sort(), `summary.scenarios.${label}.profileArrayCounts.keys`);
    for (const profile of MODULE_EFFECTS_PROFILES) {
      pinShape(captureRefs.profiles[profile], `summary.captures.${label}.profiles.${profile}`);
      const profileCounts = record(counts[profile], `summary.scenarios.${label}.profileArrayCounts.${profile}`);
      for (const name of SUMMARY_ARRAYS) count(profileCounts[name], `summary.scenarios.${label}.profileArrayCounts.${profile}.${name}`);
      equal(profileCounts.events, eventCount, `summary.scenarios.${label}.profileArrayCounts.${profile}.events`);
      equal(profileCounts.snapshots, eventCount + 1, `summary.scenarios.${label}.profileArrayCounts.${profile}.snapshots`);
    }
    if (!row.browser || !Array.isArray(row.browser.pageErrors) || row.browser.pageErrors.length !== 0 ||
        row.browser.version !== versions.browser || row.browser.playwright !== versions.playwright) {
      fail(`summary.scenarios.${label}.browser`, "must report the pinned browser version and zero page errors");
    }
    equal(row.nativeCheck?.events, eventCount, `summary.scenarios.${label}.nativeCheck.events`);
    if (row.parity?.status !== "matched" || row.parity?.scenario !== row.scenario?.name ||
        row.parity?.events !== eventCount || row.parity?.profiles !== MODULE_EFFECTS_PROFILES.length ||
        row.parity?.effects !== row.effectCount || !Number.isSafeInteger(row.parity?.requestTokens) ||
        !Number.isSafeInteger(row.parity?.cancellationTokens) || !Number.isSafeInteger(row.parity?.replyTransitions)) {
      fail(`summary.scenarios.${label}.parity`, "does not report matched scenario/profile/effect parity");
    }
    if (label !== "literal") seededEventCounts[label.slice("seed-".length)] = eventCount;
  }
  equal(summary.seededEventCounts, seededEventCounts, "summary.seededEventCounts");
}

export function validateConformanceSummary(summary, context) {
  validateTopLevel(summary, context);
  return {
    scenarioNames: [...MODULE_EFFECTS_SCENARIOS],
    profileNames: [...MODULE_EFFECTS_PROFILES],
    captureMutationControlCount: summary.captureMutationControls.rejected.length,
    buildMutationControlCount: summary.buildIndex.mutationControls.rejected.length,
  };
}

async function readPinnedJSON(reference, label, { attemptRoot, canonicalAttemptRoot, seenPaths }) {
  pinShape(reference, label);
  if (!isAbsolute(reference.path)) fail(`${label}.path`, "must be an absolute public artifact path");
  const path = resolve(reference.path);
  const relativePath = relative(attemptRoot, path);
  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    fail(`${label}.path`, "must stay inside the current attempt directory");
  }
  if (seenPaths.has(path)) fail(`${label}.path`, "duplicates another public capture artifact path");
  seenPaths.add(path);
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`${label}.path`, "must identify a regular nonsymlink file");
  const canonicalPath = await realpath(path);
  const canonicalRelative = relative(canonicalAttemptRoot, canonicalPath);
  if (canonicalRelative === "" || canonicalRelative === ".." || canonicalRelative.startsWith(`..${sep}`) || isAbsolute(canonicalRelative)) {
    fail(`${label}.path`, "real path escaped the current attempt directory");
  }
  const bytes = await readFile(canonicalPath);
  if (bytes.length !== reference.bytes || sha256(bytes) !== reference.sha256) {
    fail(label, "artifact bytes or SHA-256 differ from the public producer pin");
  }
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(label, `artifact is not JSON: ${error.message}`); }
  record(value, label);
  return { value, path, bytes };
}

export async function verifyConformanceProducerSummary(summary, context) {
  validateTopLevel(summary, context);
  const attemptRoot = resolve(context.attemptRoot);
  const canonicalAttemptRoot = await realpath(attemptRoot);
  const seenPaths = new Set();
  const buildRef = await readPinnedJSON(summary.buildIndex, "summary.buildIndex", {
    attemptRoot, canonicalAttemptRoot, seenPaths,
  });
  equal(buildRef.value, context.buildIndex, "summary.buildIndex.artifact");
  const boundaryMetadata = record(context.buildIndex.nativeMountBoundaries, "buildIndexArtifact.nativeMountBoundaries");
  const boundaryPath = resolve(dirname(context.buildIndexPath), string(boundaryMetadata.path, "buildIndexArtifact.nativeMountBoundaries.path"));
  const boundaryArtifact = await readPinnedJSON({
    path: boundaryPath, bytes: boundaryMetadata.bytes, sha256: boundaryMetadata.sha256,
  }, "buildIndexArtifact.nativeMountBoundaries.result", { attemptRoot, canonicalAttemptRoot, seenPaths });
  const boundary = boundaryArtifact.value;
  if (boundary.schema !== "gobi.module-effects-mount-boundaries/v1") {
    fail("buildIndexArtifact.nativeMountBoundaries.result.schema", "does not match the mounted-boundary probe schema");
  }
  const boundaryCases = list(boundary.cases, "buildIndexArtifact.nativeMountBoundaries.result.cases", { allowEmpty: false });
  const boundaryNames = boundaryCases.map((item) => string(item?.name, "buildIndexArtifact.nativeMountBoundaries.result.cases[].name"));
  equal(boundaryNames, boundaryMetadata.caseNames, "buildIndexArtifact.nativeMountBoundaries.result.caseNames");
  const validMountCases = boundaryCases.filter((item) => item.steps?.[0]?.state?.Mounted === true).length;
  for (const backend of ["react", "dom"]) {
    equal(summary.buildIndex.oracle.uint64Boundary[backend].validMountCases, validMountCases,
      `buildIndex.oracle.uint64Boundary.${backend}.validMountCases`);
  }
  const n4SummaryPath = `${context.outputPrefix}.summary.json`;
  const n4CheckPath = `${context.outputPrefix}.check.json`;
  const n4SummaryBytes = await readFile(n4SummaryPath);
  const n4Summary = JSON.parse(n4SummaryBytes.toString("utf8"));
  equal(n4Summary, summary, "conformance.summaryFile");
  const checkBytes = await readFile(n4CheckPath);
  const check = JSON.parse(checkBytes.toString("utf8"));
  if (check.schema !== "gobi.module-effects-conformance-check/v1" || check.status !== "matched") {
    fail("conformance.checkFile", "must be the producer's matched conformance-check document");
  }
  equal(check.summary, {
    path: n4SummaryPath, bytes: n4SummaryBytes.length, sha256: sha256(n4SummaryBytes),
  }, "conformance.checkFile.summaryPin");

  const profileCaptures = [];
  const nativeCommandEvidence = [];
  const counts = {
    scenarios: {}, nativeEvents: 0, nativeStates: 0, nativeEffects: 0, nativeTransportEvents: 0,
    nativeLifecycleEvents: 0, retiredChildren: 0, profileEvents: 0, snapshots: 0,
    profileTransportEvents: 0, ledgerEvents: 0, orderedLedgerEvents: 0,
    effectLedgerEvents: 0, lifecycleLedgerEvents: 0, profileRetiredChildren: 0,
    callOrderEvents: 0, rendererSwaps: 0,
  };
  const refs = summary.captures;
  for (const scenarioName of MODULE_EFFECTS_SCENARIOS) {
    const ref = refs[scenarioName];
    const scenarioArtifact = await readPinnedJSON(ref.scenario, `${scenarioName}.scenario`, {
      attemptRoot, canonicalAttemptRoot, seenPaths,
    });
    const nativeArtifact = await readPinnedJSON(ref.native, `${scenarioName}.native`, {
      attemptRoot, canonicalAttemptRoot, seenPaths,
    });
    const scenario = scenarioArtifact.value;
    const native = nativeArtifact.value;
    const expectedCount = EXPECTED_SCENARIO_COUNTS[scenarioName];
    if (scenario.schema !== "gobi.module-effects-scenario/v1" || scenario.name !== summary.scenarios.find((row) => row.label === scenarioName).scenario.name) {
      fail(`${scenarioName}.scenario`, "does not match its frozen scenario schema/name");
    }
    const scenarioEvents = list(scenario.events, `${scenarioName}.scenario.events`, { allowEmpty: false });
    equal(scenarioEvents.length, expectedCount, `${scenarioName}.scenario.events.length`);
    if (native.schema !== "gobi.module-effects-native/v1" || native.name !== scenario.name) {
      fail(`${scenarioName}.native`, "does not match its scenario name or native schema");
    }
    const nativeEvents = list(native.events, `${scenarioName}.native.events`);
    const nativeStates = list(native.states, `${scenarioName}.native.states`);
    const nativeEffects = list(native.effects, `${scenarioName}.native.effects`);
    const nativeTransport = list(native.transportLedger, `${scenarioName}.native.transportLedger`);
    const nativeLifecycle = list(native.lifecycleLedger, `${scenarioName}.native.lifecycleLedger`);
    const nativeRetired = list(native.retiredChildren, `${scenarioName}.native.retiredChildren`);
    equal(nativeEvents.length, expectedCount, `${scenarioName}.native.events.length`);
    equal(nativeStates.length, expectedCount + 1, `${scenarioName}.native.states.length`);
    const row = summary.scenarios.find((item) => item.label === scenarioName);
    for (const [field, actual] of [
      ["eventCount", scenarioEvents.length], ["nativeEventCount", nativeEvents.length], ["stateCount", nativeStates.length],
      ["effectCount", nativeEffects.length], ["transportEventCount", nativeTransport.length],
    ]) equal(row[field], actual, `${scenarioName}.${field}`);
    for (const [field, actual] of [
      ["events", nativeEvents.length], ["states", nativeStates.length], ["effects", nativeEffects.length],
      ["transportEvents", nativeTransport.length], ["lifecycleEvents", nativeLifecycle.length],
    ]) equal(row.nativeCheck?.[field], actual, `${scenarioName}.nativeCheck.${field}`);
    equal(row.parity.effects, nativeEffects.length, `${scenarioName}.parity.effects`);
    equal(row.parity.requestTokens, nativeEffects.filter((item) => item.effect?.kind === "fixture.request").length,
      `${scenarioName}.parity.requestTokens`);
    equal(row.parity.cancellationTokens, nativeEffects.filter((item) => item.effect?.kind === "lifecycle.cancel").length,
      `${scenarioName}.parity.cancellationTokens`);
    equal(row.parity.replyTransitions, nativeTransport.length, `${scenarioName}.parity.replyTransitions`);
    equal(row.profileArrayCounts && Object.keys(row.profileArrayCounts).sort(), [...MODULE_EFFECTS_PROFILES].sort(), `${scenarioName}.profileArrayCounts.keys`);
    counts.scenarios[scenarioName] = scenarioEvents.length;
    counts.nativeEvents += nativeEvents.length;
    counts.nativeStates += nativeStates.length;
    counts.nativeEffects += nativeEffects.length;
    counts.nativeTransportEvents += nativeTransport.length;
    counts.nativeLifecycleEvents += nativeLifecycle.length;
    counts.retiredChildren += nativeRetired.length;
    const expectedNativeCommand = [context.nativeGo, "run", "./cmd/module-effects-native", "-script", ref.scenario.path];
    nativeCommandEvidence.push({
      scenario: scenarioName, argv: expectedNativeCommand, cwd: context.root,
      envOverrides: { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" },
      capture: { path: relative(attemptRoot, nativeArtifact.path).split(sep).join("/"), bytes: nativeArtifact.bytes.length, sha256: sha256(nativeArtifact.bytes) },
    });
    for (const profile of MODULE_EFFECTS_PROFILES) {
      const artifact = await readPinnedJSON(ref.profiles[profile], `${scenarioName}.${profile}`, {
        attemptRoot, canonicalAttemptRoot, seenPaths,
      });
      const capture = artifact.value;
      if (capture.schema !== "gobi.module-effects-capture/v1" || capture.profile !== profile ||
          capture.backend !== BACKEND_FOR_PROFILE[profile] || capture.scenarioName !== scenario.name ||
          capture.sourceEventCount !== scenarioEvents.length || capture.seed !== row.seed) {
        fail(`${scenarioName}.${profile}`, "does not match profile, backend, scenario, seed, or source-event identity");
      }
      equal(capture.scenario, scenario, `${scenarioName}.${profile}.scenario`);
      const modulePins = record(capture.modulePins, `${scenarioName}.${profile}.modulePins`);
      const expectedPins = summary.buildIndex.pins[BACKEND_FOR_PROFILE[profile]];
      for (const name of ["parentABI", "childABI", "helperSHA256", "parentAppIRSHA256", "helperDescriptorSHA256"]) {
        equal(modulePins[name], expectedPins[name], `${scenarioName}.${profile}.modulePins.${name}`);
      }
      const actualArrays = {};
      for (const name of PROFILE_ARRAYS) actualArrays[name] = list(capture[name], `${scenarioName}.${profile}.${name}`);
      if (profile.startsWith("browser.")) actualArrays.rendererSwaps = list(capture.rendererSwaps, `${scenarioName}.${profile}.rendererSwaps`);
      else actualArrays.rendererSwaps = capture.rendererSwaps === undefined
        ? [] : list(capture.rendererSwaps, `${scenarioName}.${profile}.rendererSwaps`);
      const producerCounts = row.profileArrayCounts[profile];
      for (const name of SUMMARY_ARRAYS) equal(actualArrays[name].length, producerCounts[name], `${scenarioName}.${profile}.${name}.count`);
      equal(actualArrays.events.length, expectedCount, `${scenarioName}.${profile}.events.length`);
      equal(actualArrays.snapshots.length, expectedCount + 1, `${scenarioName}.${profile}.snapshots.length`);
      if (profile.startsWith("direct.")) {
        equal(capture.versions?.node, summary.versions.node, `${scenarioName}.${profile}.versions.node`);
      } else {
        equal(capture.versions?.chromium, summary.versions.browser, `${scenarioName}.${profile}.versions.chromium`);
        equal(capture.versions?.playwright, summary.versions.playwright, `${scenarioName}.${profile}.versions.playwright`);
      }
      counts.profileEvents += actualArrays.events.length;
      counts.snapshots += actualArrays.snapshots.length;
      counts.profileTransportEvents += actualArrays.transportLedger.length;
      counts.ledgerEvents += actualArrays.ledger.length;
      counts.orderedLedgerEvents += actualArrays.orderedLedger.length;
      counts.effectLedgerEvents += actualArrays.effectLedger.length;
      counts.lifecycleLedgerEvents += actualArrays.lifecycleLedger.length;
      counts.profileRetiredChildren += actualArrays.retiredChildren.length;
      counts.callOrderEvents += actualArrays.callOrder.length;
      counts.rendererSwaps += actualArrays.rendererSwaps.length;
      profileCaptures.push({ scenarioName, scenario, native, profile, capture });
    }
  }
  equal(summary.nativeEvents, counts.nativeEvents, "summary.nativeEvents");
  equal(summary.nativeEffects, counts.nativeEffects, "summary.nativeEffects");
  equal(summary.transportEvents, counts.nativeTransportEvents, "summary.transportEvents");
  equal(summary.profileEvents, counts.profileEvents, "summary.profileEvents");
  equal(counts.nativeEvents, Object.values(EXPECTED_SCENARIO_COUNTS).reduce((total, value) => total + value, 0), "summary.nativeEvents.expectedTotal");
  return {
    profileCaptures, counts, nativeCommandEvidence,
    captureMutationControls: validateMutationControlReport(summary.captureMutationControls, {
      path: "summary.captureMutationControls", requiredIds: CAPTURE_MUTATION_CONTROL_IDS, allowAdditionalControls: true,
    }),
    buildAdmissionMutationControls: validateMutationControlReport(summary.buildIndex.mutationControls, {
      path: "summary.buildIndex.mutationControls", requiredIds: BUILD_MUTATION_CONTROL_IDS, allowAdditionalControls: false,
    }),
    checkFile: { path: n4CheckPath, bytes: checkBytes.length, sha256: sha256(checkBytes) },
    summaryFile: { path: n4SummaryPath, bytes: n4SummaryBytes.length, sha256: sha256(n4SummaryBytes) },
  };
}

export function aggregateMutationControlReports(reports, scenarioLabels = MODULE_EFFECTS_SCENARIOS) {
  if (!Array.isArray(reports) || reports.length !== scenarioLabels.length) fail("oracleMutationControls.scenarios", "must contain one control report for every frozen scenario");
  const perScenario = [];
  const rejected = [];
  const expectedIds = [...CAPTURE_MUTATION_CONTROL_IDS];
  for (let index = 0; index < reports.length; index += 1) {
    const scenario = scenarioLabels[index];
    const report = validateMutationControlReport(reports[index], {
      path: `oracleMutationControls.${scenario}`, requiredIds: expectedIds,
      allowAdditionalControls: false, normalizeIdFromName: true,
    });
    perScenario.push({ scenario, status: report.status, total: report.total, rejected: report.rejected });
    for (const row of report.rejected) rejected.push({ scenario, ...row });
  }
  const distinctControlIds = [...new Set(rejected.map((row) => row.id))].sort();
  equal(new Set(distinctControlIds), new Set(expectedIds), "oracleMutationControls.distinctControlIds");
  return {
    status: "detected", total: rejected.length, rejected, scenarios: perScenario,
    distinctControlIds, mutationControlsDetected: rejected.filter((row) => row.rejected === true).length,
  };
}

export function assertUnmountLifecycleOrder(rows, { key, generation, path = "demo.remove" } = {}) {
  list(rows, `${path}.rows`);
  string(key, `${path}.key`);
  count(generation, `${path}.generation`, { positive: true });
  const sameChild = (row) => row?.key === key && row?.generation === generation;
  const unmountUpdates = rows.filter((row) => row?.kind === "go-update-unmount" && sameChild(row));
  if (unmountUpdates.length !== 1) fail(`${path}.go-update-unmount`, "must contain exactly one update for the retired child generation");
  const update = unmountUpdates[0];
  const eventIndex = count(update.stateEventIndex, `${path}.go-update-unmount.stateEventIndex`);
  const token = string(update.before?.Token, `${path}.go-update-unmount.before.Token`);
  if (update.after?.Mounted !== false || update.after?.Pending !== false || update.after?.Token !== token) {
    fail(`${path}.go-update-unmount.after`, "must commit the unmounted, nonpending Go state while retaining the token");
  }
  const eventRows = rows.filter((row) => sameChild(row) && row.stateEventIndex === eventIndex);
  const unique = (kind, predicate = () => true) => {
    const matches = eventRows.filter((row) => row.kind === kind && predicate(row));
    if (matches.length !== 1) fail(`${path}.${kind}`, `must contain exactly one matching row at state event ${eventIndex}`);
    return matches[0];
  };
  const commit = unique("go-state-commit", (row) => row.eventKind === "child-unmount" &&
    row.token === token && row.mounted === false && row.pending === false);
  const cancel = unique("go-cancel-effect", (row) => row.token === token && row.pendingAfter === false &&
    row.descriptor?.kind === "lifecycle.cancel" && row.descriptor?.arg === token);
  const transportCall = unique("transport-cancel-call", (row) => row.token === token && row.retiredBeforeCall === true);
  const transport = unique("transport-cancel", (row) => row.token === token && row.outcome === "cancelled");
  const teardown = unique("renderer-unmount");
  const ordered = [update, commit, cancel, transportCall, transport, teardown];
  for (let index = 1; index < ordered.length; index += 1) {
    if (!Number.isSafeInteger(ordered[index - 1].sequence) || !Number.isSafeInteger(ordered[index].sequence) ||
        ordered[index - 1].sequence >= ordered[index].sequence) {
      fail(`${path}.ordering`, "Go update, committed child state, Go cancel, transport cancel call/result, and renderer teardown must be strictly ordered");
    }
  }
  return {
    key, generation, token, stateEventIndex: eventIndex,
    sequence: Object.fromEntries(ordered.map((row) => [row.kind, row.sequence])),
  };
}
