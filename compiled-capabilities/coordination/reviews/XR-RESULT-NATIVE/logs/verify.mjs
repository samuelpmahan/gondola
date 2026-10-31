import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const root = process.cwd();
const attempt = 'compiled-capabilities/builds/attempts/attempt-20261031T095356051Z';
const read = async (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse((await read(path)).toString('utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pin = async (path) => { const b = await read(path); return { bytes: b.length, sha256: sha(b) }; };
const same = (a, b, label) => assert.deepStrictEqual(b, a, label);
const n2ReceiptPath = 'compiled-capabilities/coordination/receipts/E-RESULT-NATIVE.json';
const n2ReportPath = 'compiled-capabilities/coordination/reports/E-RESULT-NATIVE.md';
const n2 = await json(n2ReceiptPath);
const n2Report = await read(n2ReportPath);
same(sha(n2Report), n2.report.sha256, 'N2 report receipt pin');
same(n2.job_id, 'E-RESULT-NATIVE', 'N2 job id');
same(n2.status, 'closed_partial_failed_source', 'N2 status');
same(n2.outcome, 'insufficient_evidence', 'N2 outcome');
const binding = await json('compiled-capabilities/coordination/publication-binding.json');
same(binding.local.commit, n2.sourceIdentity.localCommit, 'local source commit binding');
same(binding.remote.commit, n2.sourceIdentity.publishedCommit, 'published source commit binding');
same(binding.remote.tree, n2.sourceIdentity.tree, 'published source tree binding');
same(binding.base.commit, n2.sourceIdentity.baseCommit, 'base commit binding');

const executionPath = `${attempt}/execution.json`;
const execution = await json(executionPath);
same(await pin(executionPath), { bytes: (await read(executionPath)).length, sha256: n2.localExecution.receiptSha256 }, 'N2 execution receipt hash');
same(execution.status, 'failed', 'outer E-BUILD status');
same(execution.mode, 'full', 'E-BUILD mode');
same(execution.sourceBefore.length, 161, 'source-before pin count');
same(execution.sourceAfter.length, 161, 'source-after pin count');
same(execution.sourcePinsMatch, true, 'outer source pins match');
same(execution.sourceBefore, execution.sourceAfter, 'source-before and source-after pin arrays');
same(execution.m0Preservation.entryCount, 24, 'M0 preservation entry count');
assert(execution.m0Preservation.entries.every((row) => row.matches === true && row.sha256 === row.expectedSha256), 'all captured M0 rows must match');
same(execution.failures.length, 1, 'outer failure count');
same(execution.failures[0], { name: 'stage:inherited-static-and-interaction-lifecycle', error: 'fresh lifecycle receipt does not confirm the inherited full compiled-methods regression chain' }, 'outer failure');
same(execution.commands.length, 16, 'command count');
assert(execution.commands.every((row) => row.exitCode === 0 && row.signal === null && row.error === null), 'all recorded commands must have exited zero');
same(n2.localExecution.rootObservedProcessExitCode, 0, 'root-observed process exit');
same(n2.localExecution.sourcePinCount, execution.sourceBefore.length, 'N2 source pin count');
same(execution.versions.node, 'v22.23.4', 'Node version');
same(execution.versions.rootGo, 'go version go1.24.0 linux/amd64', 'root Go version');
same(execution.versions.compiledGo, 'go version go1.27.3 linux/amd64', 'compiler Go version');

const fixturePath = 'fixtures/compiled/lifecycle/scenario.json';
const fixture = await json(fixturePath);
same(fixture.events.length, 26, 'fixture event count');
same(sha(await read(fixturePath)), n2.nativeAudit.fixture.sha256, 'fixture hash');
const oracle = await import(new URL('../../../../../compiled-lifecycle/browser/lifecycle-oracle.mjs', import.meta.url));
const { encodeFixtureState } = await import(new URL('../../../../../compiled-frontend/conformance/fixture-expectations.mjs', import.meta.url));
const reactAppIR = await json(`${attempt}/react/output/apps/lifecycle-7e6575d90707/app-ir.json`);
const reactComponent = reactAppIR.components.find((row) => row.packagePath === fixture.packagePath);
assert(reactComponent, 'React AppIR component missing');
const nativePath = `${attempt}/matrix/capabilities.lifecycle.native.json`;
const directPath = `${attempt}/matrix/capabilities.lifecycle.direct.json`;
const native = await json(nativePath);
const direct = await json(directPath);
same(native.steps.length, 26, 'native step count');
same(direct.steps.length, 26, 'direct step count');
same(direct.trace.ticks.length, 26, 'direct tick count');
same(sha(await read(nativePath)), n2.nativeAudit.native.sha256, 'native hash');
same(sha(await read(directPath)), n2.nativeAudit.direct.sha256, 'direct hash');
same(sha(await read(`${attempt}/matrix/capabilities.lifecycle.run.json`)), n2.source_sha256[`${attempt}/matrix/capabilities.lifecycle.run.json`], 'lifecycle run hash');
same(sha(await read(`${attempt}/matrix/capabilities.lifecycle.check.json`)), n2.source_sha256[`${attempt}/matrix/capabilities.lifecycle.check.json`], 'lifecycle check hash');

const expected = oracle.LIFECYCLE_STEPS;
same(expected.length, 26, 'frozen oracle step count');
const requests = [];
const cancellations = [];
for (let i = 0; i < expected.length; i++) {
  const item = expected[i];
  const n = native.steps[i];
  const d = direct.steps[i];
  const expectedState = oracle.expectedLifecycleStateAtTick(item.stateIndex);
  const typedState = encodeFixtureState(expectedState, reactComponent.stateType, reactAppIR.types);
  same(n.index, i, `native index ${i}`);
  same(n.kind, item.kind, `native kind ${i}`);
  same(n.effects, item.effects ?? [], `native effects ${i}`);
  same(n.state, expectedState, `native state ${i}`);
  same(n.view, oracle.expectedLifecycleView(expectedState).tree, `native view ${i}`);
  same(d.eventIndex, i, `direct index ${i}`);
  same(d.event, fixture.events[i], `direct fixture event ${i}`);
  same(d.state, typedState, `direct typed state ${i}`);
  same(d.view, oracle.expectedLifecycleView(expectedState), `direct view/bindings ${i}`);
  for (const effect of item.effects ?? []) {
    if (effect.kind === 'fixture.request') requests.push(effect.arg);
    if (effect.kind === 'lifecycle.cancel') cancellations.push(effect.arg);
  }
}
same(requests, ['parent:g1:r1','child:g1:r2','grandchild:g1:r3','sibling:g1:r4','parent:g2:r5','child:g2:r6','grandchild:g2:r7'], 'request tokens');
same(cancellations, ['grandchild:g1:r3','child:g1:r2','parent:g1:r1'], 'child-first cancellation tokens');
same(direct.effectRecords.filter((x) => x.kind === 'request').map((x) => x.token), requests, 'direct request records');
same(direct.effectRecords.filter((x) => x.kind === 'cancel').map((x) => x.token), cancellations, 'direct cancellation records');
same(direct.effectRecords.filter((x) => x.kind === 'deliver').length, 4, 'direct accepted deliveries');
same(direct.pending, [], 'no pending requests at end');

const conformanceRun = await json(`${attempt}/matrix/capabilities.lifecycle.run.json`);
const conformanceCheck = await json(`${attempt}/matrix/capabilities.lifecycle.check.json`);
same(conformanceRun.status, 'matched', 'conformance run status');
same(conformanceRun.sourceStableThroughCheck, true, 'source stability through conformance check');
same(conformanceRun.buildOutputsStableThroughCheck, true, 'build output stability through conformance check');
same(conformanceCheck.status, 'matched', 'conformance check status');
same([conformanceCheck.events, conformanceCheck.ticks, conformanceCheck.clicks, conformanceCheck.requests, conformanceCheck.cancellations], [26,26,16,7,3], 'conformance summary');

const buildSummaries = {};
for (const backend of ['react', 'dom']) {
  const backendPath = `${attempt}/${backend}`;
  const result = await json(`${backendPath}/result.json`);
  const record = await json(`${backendPath}/build-record.json`);
  const outputRoot = resolve(root, `${backendPath}/output`);
  same(result.schema, 'gobi.build-result/v1', `${backend} result schema`);
  same(result.ok, true, `${backend} result success`);
  same(result.outputs.length, 67, `${backend} result output row count`);
  same(record.outputPins.length, 67, `${backend} recorded output row count`);
  const recorded = [...record.outputPins].sort((a,b)=>a.path.localeCompare(b.path));
  same([...result.outputs].sort((a,b)=>a.path.localeCompare(b.path)), recorded, `${backend} result/record inventories`);
  const actualPaths = [];
  async function walk(dir) {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const full = resolve(dir, ent.name);
      const st = await lstat(full);
      assert(!st.isSymbolicLink(), `${backend} output symlink ${full}`);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile()) actualPaths.push(relative(outputRoot, full).split(sep).join('/'));
      else assert.fail(`${backend} unexpected file type ${full}`);
    }
  }
  await walk(outputRoot);
  same(actualPaths.sort(), recorded.map((x) => x.path).sort(), `${backend} physical file inventory`);
  for (const row of recorded) {
    const full = resolve(outputRoot, row.path);
    assert(full.startsWith(`${outputRoot}${sep}`), `${backend} output path escapes root`);
    same(await pin(relative(root, full)), { bytes: row.bytes, sha256: row.sha256 }, `${backend} physical output hash ${row.path}`);
  }
  const app = record.app;
  const appIRPath = `${backendPath}/output/${app.paths.appIR}`;
  const encoderPath = `${backendPath}/output/${app.paths.encoder}`;
  const modulePath = `${backendPath}/output/${app.paths.module}`;
  const appIR = await read(appIRPath);
  const encoder = await read(encoderPath);
  const appJSON = JSON.parse(appIR.toString('utf8'));
  const component = appJSON.components.find((x) => x.packagePath === fixture.packagePath);
  same(component.capabilities, ['view.node','numeric.safe-integer','numeric.float64','effect.request-reply','effect.cancel'], `${backend} AppIR capabilities`);
  const entry = appJSON.components.find((x) => x.packagePath === fixture.packagePath);
  assert(entry, `${backend} component missing`);
  buildSummaries[backend] = { outputCount: recorded.length, appIRSha256: sha(appIR), encoderSha256: sha(encoder), moduleSha256: sha(await read(modulePath)) };
}
same(buildSummaries.react.appIRSha256, buildSummaries.dom.appIRSha256, 'React/DOM AppIR hash equality');
same(buildSummaries.react.encoderSha256, buildSummaries.dom.encoderSha256, 'React/DOM encoder hash equality');
same(buildSummaries.react.outputCount, 67, 'React output count summary');
same(buildSummaries.dom.outputCount, 67, 'DOM output count summary');

const auditPath = 'compiled-capabilities/ci/2026-10-31/lanes/native/audit.json';
const audit = await json(auditPath);
same(sha(await read(auditPath)), n2.nativeAudit.outputSha256, 'author audit output pin');
same(audit.status, 'matched', 'author audit result');
same(audit.execution.status, 'failed', 'author audit preserves failed outer receipt');
same(audit.lifecycle.nativeSteps, 26, 'audit native steps');
same(audit.lifecycle.directSteps, 26, 'audit direct steps');
same(audit.lifecycle.requestEffects, 7, 'audit request count');
same(audit.lifecycle.cancellationEffects, 3, 'audit cancel count');

const sourceChecks = {};
for (const [path, expectedHash] of Object.entries(n2.source_sha256)) {
  const bytes = await read(path);
  same(sha(bytes), expectedHash, `N2 source pin ${path}`);
  sourceChecks[path] = expectedHash;
}

const output = {
  schema: 'gobi.compiled-capabilities-independent-native-review/v1',
  decision: 'accepted',
  packetOutcome: 'insufficient_evidence',
  fullRunAcceptance: false,
  sourceBinding: n2.sourceIdentity,
  checked: {
    n2ReportSha256: sha(n2Report),
    n2ReceiptSourcesAllMatched: Object.keys(sourceChecks).length,
    executionReceiptSha256: sha(await read(executionPath)),
    executionStatus: execution.status,
    failedStage: execution.failures[0],
    recordedCommands: execution.commands.length,
    recordedCommandFailures: 0,
    sourcePinCount: execution.sourceBefore.length,
    fixtureEvents: fixture.events.length,
    nativeSteps: native.steps.length,
    directSteps: direct.steps.length,
    directTicks: direct.trace.ticks.length,
    requestCount: requests.length,
    cancellationCount: cancellations.length,
    deliveryCount: direct.effectRecords.filter((x) => x.kind === 'deliver').length,
    cancellationOrder: cancellations,
    conformanceRun: conformanceRun.status,
    conformanceCheck: conformanceCheck.status,
    builds: buildSummaries,
    allOutputFilesRehashed: true,
    authorAuditJsonSha256: sha(await read(auditPath)),
  },
  hostedArtifact: { inspectedByThisReview: false, owner: 'N4' },
  limits: [
    'This review accepts only accuracy of N2 native/direct and actual GoScript output evidence for the named local attempt.',
    'The outer E-BUILD receipt remains failed despite all recorded subprocesses and observed runner exit code being zero; integrated capability acceptance is not established.',
    'Hosted artifact contents, browser behavior, and full acceptance were not reviewed here.',
    'No build or full suite was rerun.'
  ]
};
await (await import('node:fs/promises')).writeFile(resolve(root, 'compiled-capabilities/coordination/reviews/XR-RESULT-NATIVE/logs/verification.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
