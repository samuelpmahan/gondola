import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const ci = path.join(root, 'compiled-frontend/ci/2026-10-30');
const provider = path.join(ci, 'provider');
const extracted = path.join(provider, 'repaired-extracted');
const artifactRoot = path.join(extracted, 'compiled-frontend/artifacts');
const auditDir = path.join(ci, 'audits/CI2-BROWSER');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const profiles = ['counter', 'form', 'list', 'effect', 'list-growth'];
const expectedCounts = { counter: { ticks: 5, mutations: 17 }, form: { ticks: 10, mutations: 18 }, list: { ticks: 11, mutations: 19 }, effect: { ticks: 5, mutations: 18 }, 'list-growth': { ticks: 12, mutations: 17 } };
const completed = readJson(path.join(provider, 'repaired-completed.json'));
const manifestPath = path.join(extracted, 'extraction-manifest.json');
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
const archivePath = path.join(provider, 'downloads/run-41144116537.zip');
const archiveSha = sha256(fs.readFileSync(archivePath));
const executionPath = path.join(artifactRoot, 'execution.json');
const executionBytes = fs.readFileSync(executionPath);
const execution = JSON.parse(executionBytes);
const nodeLogPath = path.join(artifactRoot, 'logs/node-tests.stdout.log');
const nodeLog = fs.readFileSync(nodeLogPath, 'utf8');
const hashRows = [];
const hashMismatches = [];
for (const item of manifest.compilerFiles ?? []) {
  const file = path.join(extracted, item.path);
  if (!fs.existsSync(file)) { hashMismatches.push({ path: item.path, issue: 'missing' }); continue; }
  const bytes = fs.readFileSync(file);
  if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) hashMismatches.push({ path: item.path, issue: 'hash-or-size-mismatch' });
  else hashRows.push(item.path);
}
const sourcePinsBefore = execution.sourceBefore ?? [];
const sourcePinsAfter = execution.sourceAfter ?? [];
const sourceMismatches = [];
const sourcePinsVerified = [];
for (const pin of sourcePinsBefore) {
  const file = path.resolve(root, pin.path);
  if (!fs.existsSync(file)) { sourceMismatches.push({ path: pin.path, issue: 'missing' }); continue; }
  const actual = sha256(fs.readFileSync(file));
  if (actual !== pin.sha256) sourceMismatches.push({ path: pin.path, expected: pin.sha256, actual });
  else sourcePinsVerified.push(pin.path);
}
const outputBefore = execution.outputPinsBefore ?? [];
const outputAfter = execution.outputPinsAfter ?? [];
const outputMismatches = [];
const outputsVerified = [];
for (const pin of outputBefore) {
  const file = path.join(artifactRoot, 'compiled', pin.path);
  if (!fs.existsSync(file)) { outputMismatches.push({ path: pin.path, issue: 'missing' }); continue; }
  const bytes = fs.readFileSync(file);
  if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) outputMismatches.push({ path: pin.path, issue: 'hash-or-size-mismatch' });
  else outputsVerified.push(pin.path);
}
const nodeCounts = Object.fromEntries([...nodeLog.matchAll(/^# (tests|pass|fail|skipped) (\d+)$/gm)].map((m) => [m[1], Number(m[2])]));
const nodeTestOutputHash = sha256(fs.readFileSync(nodeLogPath));
const offlineProfiles = [];
const browserProfiles = [];
const observedBrowserVersions = new Set();
const directBrowserPins = [];
const disabledByProfile = {};
for (const profile of profiles) {
  const capturedCheck = readJson(path.join(artifactRoot, `${profile}.check.json`));
  const offlineCheck = readJson(path.join(auditDir, `${profile}.check.json`));
  const checkCmp = spawnSync('cmp', [path.join(auditDir, `${profile}.check.json`), path.join(artifactRoot, `${profile}.check.json`)]);
  const browser = readJson(path.join(artifactRoot, `${profile}.browser.json`));
  const directManifest = readJson(path.join(artifactRoot, `${profile}.direct.manifest.json`));
  const directInputs = directManifest.provenance.inputs;
  const browserBaseInputs = browser.provenanceBase.inputs;
  const browserInputs = browser.provenance.inputs;
  const normalized = (rows) => rows.map(({ path: inputPath, sha256: digest, bytes }) => `${inputPath}\0${digest}\0${bytes}`);
  const sameInputs = (left, right) => JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
  const bundles = browserInputs.filter((input) => input.path.startsWith('/tmp/gobi-compiled-browser-'));
  const withoutBundle = browserInputs.filter((input) => !input.path.startsWith('/tmp/gobi-compiled-browser-'));
  let pinMismatchCount = 0;
  const unavailableDependencyPins = [];
  for (const input of browserBaseInputs) {
    const file = input.path.startsWith('compiled-frontend/artifacts/')
      ? path.resolve(extracted, input.path)
      : path.resolve(root, input.path);
    if (!fs.existsSync(file)) {
      if (input.path.startsWith('interaction/node_modules/')) unavailableDependencyPins.push(input.path);
      else pinMismatchCount++;
      continue;
    }
    const bytes = fs.readFileSync(file);
    if (bytes.length !== input.bytes || sha256(bytes) !== input.sha256) pinMismatchCount++;
  }
  const snapshot = browser.unmount;
  const noWasmClear = browser.noWasm?.wasmRequests?.length === 0 && browser.noWasm?.wasmAPIAttempts?.length === 0;
  const unmountEmpty = snapshot?.physicalDOM?.html === '' && snapshot.physicalDOM.controls === 0
    && snapshot?.rendererSnapshot?.html === '' && Array.isArray(snapshot.rendererSnapshot.controls) && snapshot.rendererSnapshot.controls.length === 0;
  const disabledActions = browser.actions.filter((action) => action.expectedMessage === null && action.observedAction === null);
  const staleActionsForProfile = browser.actions.filter((action) => action.targetConnectedBefore === false && action.expectedMessage === null);
  const disabledValid = disabledActions.length === capturedCheck.suppressedTicks - staleActionsForProfile.length && disabledActions.length > 0 && disabledActions.every((action) => {
    const beforeIndex = (action.traceTick?.index ?? -1) - 1;
    const preSnapshot = browser.domOracle[beforeIndex];
    const target = preSnapshot?.controls?.find((control) => control.path === action.intent?.path);
    return action.before?.ticks === action.afterPhysical?.ticks
      && action.before?.callbacks?.dispatch === action.afterPhysical?.callbacks?.dispatch
      && action.before?.callbacks?.stale === action.afterPhysical?.callbacks?.stale
      && action.traceTick?.message === null && target?.disabled === true;
  });
  const checkRow = {
    profile,
    capturedStatus: capturedCheck.status,
    offlineStatus: offlineCheck.status,
    capturedCheckerOutputByteIdentical: checkCmp.status === 0,
    ticks: capturedCheck.ticks,
    expectedTicks: expectedCounts[profile].ticks,
    mutationControls: capturedCheck.mutationControls.length,
    expectedMutationControls: expectedCounts[profile].mutations,
    browserVersion: browser.browser,
    noWasmClear,
    noPageErrors: Array.isArray(browser.pageErrors) && browser.pageErrors.length === 0,
    unmountEmpty,
    disabledPhysicalActions: disabledActions.length,
    staleNoDispatchActions: staleActionsForProfile.length,
    disabledActionsValid: disabledValid,
    focus: capturedCheck.focus,
    detachedHandler: capturedCheck.lifecycleEvidence?.detachedReactHandlerAfterNodeRemoval,
    retainedHandlerAfterRuntimeUnmount: capturedCheck.lifecycleEvidence?.retainedHandlerAfterRuntimeUnmount,
    provenance: {
      directInputCount: directInputs.length,
      browserBaseInputCount: browserBaseInputs.length,
      browserInputCount: browserInputs.length,
      bundleCount: bundles.length,
      directMatchesBrowserBase: sameInputs(directInputs, browserBaseInputs),
      browserMatchesAfterBundleRemoval: sameInputs(browserBaseInputs, withoutBundle),
      currentInputPinMismatches: pinMismatchCount,
      unavailableInstalledDependencyPins: unavailableDependencyPins
    }
  };
  observedBrowserVersions.add(browser.browser);
  disabledByProfile[profile] = { suppressedTicks: capturedCheck.suppressedTicks, detachedStaleNoDispatchActions: staleActionsForProfile.length, disabledActions: disabledActions.length, valid: disabledValid };
  directBrowserPins.push({ profile, directInputCount: directInputs.length, browserBaseInputCount: browserBaseInputs.length,
    browserInputCount: browserInputs.length, bundleCount: bundles.length, inputPinMismatches: pinMismatchCount,
    unavailableInstalledDependencyPins: unavailableDependencyPins, inputSetsEqual: sameInputs(directInputs, browserBaseInputs) && sameInputs(browserBaseInputs, withoutBundle) });
  offlineProfiles.push({ profile, status: offlineCheck.status, byteIdenticalToCaptured: checkCmp.status === 0,
    ticks: offlineCheck.ticks, mutationControls: offlineCheck.mutationControls.length });
  browserProfiles.push(checkRow);
}
const form = readJson(path.join(artifactRoot, 'form.browser.json'));
const literalAction = form.actions.find((action) => action.intent?.value === 'must not replace literal');
const literalHostObservation = form.hostObservations.dispatch.find((row) => row.message?.Name === 'literal');
const literalDom = form.domOracle[literalAction?.traceTick?.index ?? -1];
const draftControl = literalDom?.controls?.find((control) => control.key === 'form-draft');
const checkedControl = literalDom?.controls?.find((control) => control.key === 'form-checked');
const literalButtonControl = literalDom?.controls?.find((control) => control.key === 'form-literal');
const formLiteral = {
  intent: literalAction?.intent,
  observedAction: literalAction?.observedAction,
  targetValueAtDispatch: literalAction?.targetValueAtDispatch,
  traceMessage: literalAction?.traceTick?.message,
  goMessage: literalHostObservation?.message,
  liveDom: { draftValue: draftControl?.value, checkboxChecked: checkedControl?.checked, literalButtonValue: literalButtonControl?.value },
  pass: literalAction?.intent?.value === 'must not replace literal' && literalAction.observedAction?.value === ''
    && literalAction.targetValueAtDispatch === '' && literalAction.traceTick?.message?.name === 'literal'
    && literalAction.traceTick?.message?.arg === 'target.value' && literalHostObservation?.message?.Name === 'literal'
    && literalHostObservation?.message?.Arg === 'target.value'
    && draftControl?.value === 'typed draft' && checkedControl?.checked === true && literalButtonControl?.value === ''
};
const list = readJson(path.join(artifactRoot, 'list.browser.json'));
const focus = list.focus;
const focusValid = ['before', 'immediate', 'settled'].every((key) => focus?.[key]?.activeIsTarget === true
  && focus[key].start === 0 && focus[key].end === 2 && focus[key].direction === 'backward')
  && focus.immediate.sameKeyedNodeAtNewPath === true && focus.settled.sameKeyedNodeAtNewPath === true;
const detachedAction = list.actions.find((action) => action.targetConnectedBefore === false);
const detached = {
  actionIndex: detachedAction?.index,
  targetConnectedBefore: detachedAction?.targetConnectedBefore,
  staleMessage: detachedAction?.traceTick?.message,
  before: detachedAction?.before,
  after: detachedAction?.afterPhysical,
  hostStaleCount: list.hostObservations.stale.length,
  pass: detachedAction?.targetConnectedBefore === false && detachedAction?.traceTick?.message === null
    && detachedAction.before?.callbacks?.dispatch === detachedAction.afterPhysical?.callbacks?.dispatch
    && detachedAction.afterPhysical?.callbacks?.stale === detachedAction.before?.callbacks?.stale + 1
    && list.hostObservations.stale.length === 1
};
const effect = readJson(path.join(artifactRoot, 'effect.browser.json'));
const requestSnapshot = effect.hostObservations.requests[0];
const requestState = requestSnapshot?.snapshot?.state?.fields;
const requestDOM = requestSnapshot?.snapshot?.dom;
const pending = {
  dispatchId: requestSnapshot?.request?.dispatchId,
  tickCount: requestSnapshot?.tickCount,
  status: requestState?.find((field) => field.name === 'Status')?.value?.string,
  pending: requestState?.find((field) => field.name === 'Pending')?.value?.bool,
  requestButtonDisabled: requestDOM?.controls?.find((control) => control.key === 'effect-request')?.disabled,
  requestHtml: requestDOM?.html,
  completionDispatchId: effect.effectHostEvidence?.completions?.[0]?.dispatchId,
  duplicate: effect.duplicateCompletionEvidence,
  pass: requestSnapshot?.request?.dispatchId === 'dispatch-0002' && requestSnapshot.tickCount === 4
    && requestState?.find((field) => field.name === 'Status')?.value?.string === 'pending'
    && requestState?.find((field) => field.name === 'Pending')?.value?.bool === true
    && requestDOM?.controls?.find((control) => control.key === 'effect-request')?.disabled === true
    && requestDOM?.html?.includes('Status: pending') === true
    && effect.effectHostEvidence?.completions?.length === 1
    && effect.effectHostEvidence.completions[0].dispatchId === 'dispatch-0002'
    && effect.duplicateCompletionEvidence?.result?.accepted === false
    && effect.duplicateCompletionEvidence.beforeTickCount === effect.duplicateCompletionEvidence.afterTickCount
};
const rawSummary = (execution.apps ?? []).map((app) => ({ appId: app.appId, fixture: app.fixture, status: app.status, ticks: app.ticks, mutationControls: app.mutationControls?.length }));
const rawTicks = browserProfiles.reduce((sum, row) => sum + row.ticks, 0);
const mutationTotal = browserProfiles.reduce((sum, row) => sum + row.mutationControls, 0);
const commandFailures = execution.commands.filter((command) => command.exitCode !== 0);
const result = {
  schema: 'gobi.ci2-browser-offline-audit/v1',
  run: { runId: completed.run?.id, jobId: completed.jobs?.jobs?.[0]?.id, artifactId: completed.artifacts?.artifacts?.[0]?.id,
    head: completed.run?.head_sha, tree: completed.run?.head_commit?.tree_id, parent: completed.run?.head_commit?.parents?.[0]?.sha,
    status: completed.run?.status, conclusion: completed.run?.conclusion },
  artifact: { archivePath: 'compiled-frontend/ci/2026-10-30/provider/downloads/run-41144116537.zip', archiveBytes: fs.statSync(archivePath).size,
    archiveSha256: archiveSha, manifestSha256: sha256(manifestBytes), expectedArchiveSha256: manifest.archiveSha256,
    listedCompilerFiles: manifest.compilerFiles?.length, compilerFilesVerified: hashRows.length, compilerFileMismatches: hashMismatches,
    executionJsonSha256: sha256(executionBytes) },
  execution: { status: execution.status, commandCount: execution.commands.length, failedCommands: commandFailures,
    versions: execution.versions, environment: execution.environment, sourceBeforeCount: sourcePinsBefore.length,
    sourceAfterCount: sourcePinsAfter.length, sourceBeforeAfterEqual: JSON.stringify(sourcePinsBefore) === JSON.stringify(sourcePinsAfter),
    localSourcePinsVerified: sourcePinsVerified.length, sourcePinMismatches: sourceMismatches,
    outputBeforeCount: outputBefore.length, outputAfterCount: outputAfter.length,
    outputBeforeAfterEqual: JSON.stringify(outputBefore) === JSON.stringify(outputAfter), outputFilesVerified: outputsVerified.length,
    outputMismatches, nodeTests: nodeCounts, nodeTestLogSha256: nodeTestOutputHash },
  browser: { versions: [...observedBrowserVersions], versionUniform: observedBrowserVersions.size === 1,
    profiles: browserProfiles, totalTicks: rawTicks, totalMutationControls: mutationTotal,
    rawSummary: rawSummary, offlineCheckers: offlineProfiles, allCapturedCheckReportsMatchedOffline: offlineProfiles.every(p=>p.status==='matched'&&p.byteIdenticalToCaptured),
    disabledByProfile, formLiteral, listFocus: { pass: focusValid, witness: focus }, detachedCallback: detached, effectPendingAndDuplicate: pending,
    noWasmClearEveryProfile: browserProfiles.every(p=>p.noWasmClear), emptyUnmountEveryProfile: browserProfiles.every(p=>p.unmountEmpty),
    noPageErrorsEveryProfile: browserProfiles.every(p=>p.noPageErrors), provenance: directBrowserPins },
  limits: [
    'This review uses the captured CI browser outputs and offline checker only; no browser was relaunched.',
    'A callback retained after runtime unmount remains not tested; captured list evidence covers a removed DOM node before unmount.',
    'Acceptance is limited to PR11 head and the four pinned apps/five deterministic profiles.'
  ]
};
const allPassed = completed.run?.id === 41144116537 && completed.run?.head_sha === '184ccdaabe9e6e46e1052ee79cd7e0be26fe3281'
  && completed.run?.conclusion === 'success' && archiveSha === manifest.archiveSha256 && hashMismatches.length === 0
  && hashRows.length === 309 && execution.status === 'passed' && execution.commands.length === 33 && commandFailures.length === 0
  && nodeCounts.tests === 81 && nodeCounts.pass === 81 && nodeCounts.fail === 0
  && sourcePinsBefore.length === 116 && sourcePinsAfter.length === 116 && JSON.stringify(sourcePinsBefore) === JSON.stringify(sourcePinsAfter)
  && sourceMismatches.length === 0 && outputBefore.length === 209 && outputAfter.length === 209
  && JSON.stringify(outputBefore) === JSON.stringify(outputAfter) && outputMismatches.length === 0 && outputsVerified.length === 209
  && browserProfiles.length === 5 && browserProfiles.every((p) => p.capturedStatus === 'matched' && p.offlineStatus === 'matched'
    && p.capturedCheckerOutputByteIdentical && p.ticks === p.expectedTicks && p.mutationControls === p.expectedMutationControls
    && p.noWasmClear && p.noPageErrors && p.unmountEmpty && p.disabledActionsValid)
  && rawTicks === 43 && mutationTotal === 89 && observedBrowserVersions.size === 1 && formLiteral.pass && focusValid && detached.pass && pending.pass
  && directBrowserPins.every((p) => p.directInputCount === 98 && p.browserBaseInputCount === 98 && p.browserInputCount === 99 && p.bundleCount === 1 && p.inputPinMismatches === 0 && p.unavailableInstalledDependencyPins.length === 3 && p.inputSetsEqual);
result.allAcceptanceChecksPassed = allPassed;
const out = path.join(auditDir, 'browser-evidence.json');
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: out, allAcceptanceChecksPassed: allPassed, archiveSha256: archiveSha,
  compilerFilesVerified: hashRows.length, sourcePinsVerified: sourcePinsVerified.length, outputsVerified: outputsVerified.length,
  commands: execution.commands.length, failedCommands: commandFailures.length, nodeTests: nodeCounts, browserVersions: [...observedBrowserVersions],
  profileTicks: browserProfiles.map(p=>({profile:p.profile,status:p.capturedStatus,ticks:p.ticks,mutations:p.mutationControls})),
  totalTicks: rawTicks, totalMutationControls: mutationTotal, noWasmClear: result.browser.noWasmClearEveryProfile,
  emptyUnmount: result.browser.emptyUnmountEveryProfile, focusValid, detached: detached.pass, effect: pending.pass,
  formLiteral: formLiteral.pass, provenancePinsValid: directBrowserPins.every(p=>p.inputSetsEqual&&p.inputPinMismatches===0) }, null, 2));
if (!allPassed) process.exitCode = 1;
