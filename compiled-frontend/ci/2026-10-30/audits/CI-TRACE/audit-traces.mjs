import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const [traceModule, fixtureModule, domModule, conformanceModule] = await Promise.all([
  import(pathToFileURL(join(root, 'compiled-frontend/conformance/trace.mjs'))),
  import(pathToFileURL(join(root, 'compiled-frontend/conformance/fixture-expectations.mjs'))),
  import(pathToFileURL(join(root, 'compiled-frontend/conformance/dom-oracle.mjs'))),
  import(pathToFileURL(join(root, 'compiled-frontend/conformance/check.mjs'))),
]);

const profiles = [
  { name: 'counter', app: 'counter', fixture: 'compiled-frontend/fixtures/counter.json' },
  { name: 'form', app: 'form', fixture: 'compiled-frontend/fixtures/form.json' },
  { name: 'list', app: 'list', fixture: 'compiled-frontend/fixtures/list.json' },
  { name: 'effect', app: 'effect', fixture: 'compiled-frontend/fixtures/effect.json' },
  { name: 'list-growth', app: 'list', fixture: 'compiled-frontend/conformance/fixtures/list-growth.json' },
];

function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function bytes(path) { return readFile(path); }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
function traceOf(raw) { return raw?.trace ?? raw; }
function fail(message) { throw new Error(message); }
function firstDiff(a, b, path = '$') {
  if (Object.is(a, b)) return null;
  if (a === null || b === null || typeof a !== typeof b) return path;
  if (typeof a !== 'object') return path;
  if (Array.isArray(a) !== Array.isArray(b)) return path;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}.length`;
    for (let i = 0; i < a.length; i += 1) {
      const diff = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (!isDeepStrictEqual(ak, bk)) return path;
  for (const key of ak) {
    const diff = firstDiff(a[key], b[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}
function withoutDOM(trace) {
  return { ...trace, ticks: trace.ticks.map((tick) => ({ ...tick, dom: null })) };
}
function fieldValue(value, name) {
  if (!value || typeof value !== 'object') return undefined;
  if (value.kind === 'struct' && Array.isArray(value.fields)) {
    const hit = value.fields.find((field) => field.name === name);
    if (hit) return hit.value;
    for (const field of value.fields) {
      const nested = fieldValue(field.value, name);
      if (nested !== undefined) return nested;
    }
  }
  if (Array.isArray(value.items)) {
    for (const item of value.items) {
      const nested = fieldValue(item, name);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}
function collectIntegerValues(value, table, path, result = []) {
  const info = table.get(value.typeId);
  if (!info) fail(`${path} has undeclared type ${value.typeId}`);
  if (info.kind === 'int' || info.kind === 'uint') {
    const integer = BigInt(value.integer);
    if (info.jsRepresentation === 'number' &&
        (integer < -9007199254740991n || integer > 9007199254740991n)) {
      fail(`${path} exceeds the safe-integer range for Number-backed ${info.id}`);
    }
    result.push({ path, typeId: info.id, kind: info.kind, bits: info.bits,
      jsRepresentation: info.jsRepresentation, value: value.integer });
  } else if (info.kind === 'struct') {
    for (const field of value.fields) collectIntegerValues(field.value, table, `${path}.${field.name}`, result);
  } else if (info.kind === 'slice' || info.kind === 'array') {
    for (let index = 0; index < value.items.length; index += 1) {
      collectIntegerValues(value.items[index], table, `${path}[${index}]`, result);
    }
  }
  return result;
}

if (process.argv.length !== 3) fail('usage: node audit-traces.mjs <directory-containing-execution.json>');
const artifactDir = resolve(process.argv[2]);
const executionPath = join(artifactDir, 'execution.json');
const executionBytes = await bytes(executionPath);
const execution = JSON.parse(executionBytes.toString('utf8'));
if (execution.schema !== 'gobi.compiled-execution/v1') fail('unexpected execution receipt schema');
if (execution.status !== 'passed') fail(`primary execution status is ${JSON.stringify(execution.status)}`);
if (!Array.isArray(execution.sourceBefore) || !Array.isArray(execution.sourceAfter)) fail('source pins are missing');
assert.deepEqual(execution.sourceBefore, execution.sourceAfter, 'source pins changed during the CI run');

const sourcePinChecks = [];
for (const pin of execution.sourceBefore) {
  const path = resolve(root, pin.path);
  const contents = await bytes(path);
  const actual = sha(contents);
  sourcePinChecks.push({ path: pin.path, expected: pin.sha256, actual, matches: actual === pin.sha256 });
}
const pinMismatches = sourcePinChecks.filter((pin) => !pin.matches);
if (pinMismatches.length) fail(`local evidence checkout disagrees with ${pinMismatches.length} CI source pins`);

const logChecks = [];
const commandNames = new Set((execution.commands ?? []).map((entry) => entry.name));
for (const entry of execution.commands ?? []) {
  if (entry.exitCode !== 0 || entry.error !== null) fail(`command ${entry.name} did not exit cleanly`);
  for (const [stream, expected] of [['stdout', entry.stdoutSha256], ['stderr', entry.stderrSha256]]) {
    const path = join(artifactDir, 'logs', `${entry.name}.${stream}.log`);
    const actual = sha(await bytes(path));
    logChecks.push({ name: entry.name, stream, expected, actual, matches: actual === expected });
    if (actual !== expected) fail(`${entry.name} ${stream} log hash differs from execution receipt`);
  }
}
const requiredCommands = [
  'version-go', 'version-root-go', 'root-go-tests', 'root-go-race', 'root-go-vet',
  'go-tests', 'go-race', 'go-vet', 'node-tests', 'compile-four', 'build-native',
  ...profiles.flatMap(({ name }) => [`${name}-native`, `${name}-direct`, `${name}-browser`, `${name}-compare`]),
  'build-demo', 'demo-smoke',
];
for (const name of requiredCommands) if (!commandNames.has(name)) fail(`execution receipt lacks command ${name}`);

const build = await json(join(artifactDir, 'build-result.json'));
if (build.ok !== true || build.diagnostics?.length || build.apps?.length !== 4) fail('four-app build receipt is not clean');
const outputHashes = [];
for (const output of execution.outputPinsBefore ?? []) {
  const path = join(artifactDir, 'compiled', output.path);
  const content = await bytes(path);
  const actual = sha(content);
  outputHashes.push({ path: output.path, expectedSha256: output.sha256, actualSha256: actual,
    expectedBytes: output.bytes, actualBytes: content.length, matches: actual === output.sha256 && content.length === output.bytes });
  if (actual !== output.sha256 || content.length !== output.bytes) fail(`build output pin mismatch: ${output.path}`);
}
assert.deepEqual(execution.outputPinsBefore, execution.outputPinsAfter, 'build output inventory changed during CI');

const evidence = [];
for (const profile of profiles) {
  const fixture = await json(join(root, profile.fixture));
  const appIRItem = build.outputs.find((item) => item.path.endsWith('/app-ir.json') && item.path.includes(`/${profile.app}-`));
  if (!appIRItem) fail(`AppIR output is missing for ${profile.name}`);
  const app = await json(join(artifactDir, 'compiled', appIRItem.path));
  const [nativeBytes, directBytes, browserBytes, reportBytes] = await Promise.all([
    bytes(join(artifactDir, `${profile.name}.native.json`)),
    bytes(join(artifactDir, `${profile.name}.direct.json`)),
    bytes(join(artifactDir, `${profile.name}.browser.json`)),
    bytes(join(artifactDir, `${profile.name}.check.json`)),
  ]);
  const nativeRaw = JSON.parse(nativeBytes.toString('utf8'));
  const directRaw = JSON.parse(directBytes.toString('utf8'));
  const browser = JSON.parse(browserBytes.toString('utf8'));
  const report = JSON.parse(reportBytes.toString('utf8'));
  const directManifestBytes = await bytes(join(artifactDir, `${profile.name}.direct.manifest.json`));
  const directManifest = JSON.parse(directManifestBytes.toString('utf8'));
  const native = traceOf(nativeRaw);
  const direct = traceOf(directRaw);
  const browserTrace = browser.trace;
  if (!browserTrace) fail(`${profile.name} browser artifact has no trace`);
  if (directManifest.schema !== 'gobi.direct-js-manifest/v1' ||
      directManifest.traceBytes !== directBytes.length || directManifest.traceSha256 !== sha(directBytes)) {
    fail(`${profile.name} direct trace manifest does not bind the raw trace bytes`);
  }
  if (browser.traceSha256 !== sha(Buffer.from(JSON.stringify(browserTrace)))) {
    fail(`${profile.name} browser embedded trace hash does not match its trace`);
  }
  const browserBaseInputs = browser.provenanceBase?.inputs;
  const browserRunInputs = browser.provenance?.inputs;
  if (!Array.isArray(browserBaseInputs) || !Array.isArray(browserRunInputs)) fail(`${profile.name} browser source provenance is missing`);
  const browserBundleInputs = browserRunInputs.filter((input) => input.path.endsWith('/browser-entry.bundle.mjs'));
  const browserInputsWithoutBundle = browserRunInputs.filter((input) => !input.path.endsWith('/browser-entry.bundle.mjs'));
  if (browserBundleInputs.length !== 1 || !isDeepStrictEqual(browserBaseInputs, browserInputsWithoutBundle)) {
    fail(`${profile.name} browser source inputs changed between base and bundled execution`);
  }
  if (!isDeepStrictEqual(native, direct)) {
    fail(`${profile.name} native/direct traces differ at ${firstDiff(native, direct)}`);
  }
  if (!isDeepStrictEqual(withoutDOM(native), withoutDOM(browserTrace))) {
    fail(`${profile.name} native/browser trace cores differ at ${firstDiff(withoutDOM(native), withoutDOM(browserTrace))}`);
  }
  traceModule.validateTrace(native, app);
  traceModule.validateTrace(direct, app);
  traceModule.validateTrace(browserTrace, app);
  traceModule.validateHostScript(fixture.hostScript, native);
  traceModule.validateHostScript(fixture.hostScript, direct);
  traceModule.validateHostScript(fixture.hostScript, browserTrace);
  fixtureModule.validateFixtureExpectations(native, fixture, app);
  fixtureModule.validateFixtureExpectations(direct, fixture, app);
  fixtureModule.validateFixtureExpectations(browserTrace, fixture, app);
  const domSnapshots = domModule.expectedDOMSnapshots(fixture);
  if (domSnapshots.length !== browserTrace.ticks.length) fail(`${profile.name} DOM oracle tick count differs`);
  for (let index = 0; index < browserTrace.ticks.length; index += 1) {
    assert.deepEqual(browserTrace.ticks[index].dom, domSnapshots[index], `${profile.name} browser DOM tick ${index}`);
  }
  if (report.schema !== 'gobi.conformance-report/v1' || report.status !== 'matched' || report.ticks !== native.ticks.length) {
    fail(`${profile.name} conformance report does not match raw trace`);
  }
  const actionTicks = native.ticks.filter((tick) => tick.action !== null);
  if (actionTicks.length !== fixture.actions.length) fail(`${profile.name} action tick count differs from fixture`);
  for (let index = 0; index < fixture.actions.length; index += 1) {
    assert.deepEqual(actionTicks[index].action, fixture.actions[index], `${profile.name} action intent ${index}`);
    const expectation = fixture.expectations.find((entry) => entry.actionIndex === index);
    assert.deepEqual(actionTicks[index].message, expectation.message, `${profile.name} message ${index}`);
  }
  if (!Array.isArray(browser.actions) || browser.actions.length !== fixture.actions.length) fail(`${profile.name} browser action evidence is incomplete`);
  for (let index = 0; index < fixture.actions.length; index += 1) {
    const observation = browser.actions[index];
    assert.deepEqual(observation.intent, fixture.actions[index], `${profile.name} browser requested intent ${index}`);
    const tick = browserTrace.ticks[observation.traceTick?.index];
    if (!tick || !isDeepStrictEqual(tick, observation.traceTick)) fail(`${profile.name} browser traceTick ${index} does not index the recorded trace`);
    const expected = fixture.expectations.find((entry) => entry.actionIndex === index);
    assert.deepEqual(observation.expectedMessage, expected.message, `${profile.name} browser expected message ${index}`);
    assert.deepEqual(tick.message, expected.message, `${profile.name} browser delivered message ${index}`);
    if (expected.message !== null) {
      assert.deepEqual(observation.observedAction, {
        path: fixture.actions[index].path,
        event: fixture.actions[index].event,
        value: observation.observedAction?.value,
      }, `${profile.name} physical action shape ${index}`);
      if (observation.intent.event === 'click') {
        assert.equal(observation.observedAction.value, observation.targetValueAtDispatch,
          `${profile.name} click target value ${index}`);
      } else {
        assert.equal(observation.observedAction.value, observation.intent.value,
          `${profile.name} bound target value ${index}`);
      }
    }
  }
  const independentlyReplayedReport = conformanceModule.checkConformance({
    app, fixture, nativeTrace: native, directTrace: direct, browserEvidence: browser,
  });
  assert.deepEqual(report, independentlyReplayedReport, `${profile.name} saved conformance report differs from raw evidence replay`);
  const typeTable = new Map(app.types.map((type) => [type.id, type]));
  const integerValues = native.ticks.flatMap((tick, tickIndex) =>
    collectIntegerValues(tick.state, typeTable, `ticks[${tickIndex}].state`));
  const integerTypes = app.types.filter((type) => type.kind === 'int' || type.kind === 'uint')
    .map(({ id, kind, bits, jsRepresentation }) => ({ id, kind, bits, jsRepresentation }));
  const rawFiles = [
    [`${profile.name}.native.json`, nativeBytes], [`${profile.name}.direct.json`, directBytes],
    [`${profile.name}.browser.json`, browserBytes], [`${profile.name}.check.json`, reportBytes],
  ];
  evidence.push({
    profile: profile.name,
    fixture: fixture.name,
    packagePath: fixture.packagePath,
    appId: native.appId,
    ticks: native.ticks.length,
    actionTicks: actionTicks.length,
    replyTicks: native.ticks.filter((tick) => tick.action === null && tick.index !== 0).length,
    dispatches: native.ticks.filter((tick) => tick.dispatchId !== null).map((tick) => tick.dispatchId),
    effectsRequested: native.ticks.flatMap((tick) => tick.requestedEffects),
    effectsCompleted: native.ticks.flatMap((tick) => tick.completedEffects),
    integerTypes,
    integerValues,
    reports: { status: report.status, mutationControls: report.mutationControls?.length ?? null },
    raw: await Promise.all(rawFiles.map(async ([name, content]) => ({ name, bytes: content.length, sha256: sha(content) }))),
    provenance: {
      directInputs: directManifest.provenance?.inputs?.length ?? null,
      browserBaseInputs: browserBaseInputs.length,
      browserBundle: { path: browserBundleInputs[0].path, sha256: browserBundleInputs[0].sha256, bytes: browserBundleInputs[0].bytes },
    },
    directManifest: { bytes: directManifestBytes.length, sha256: sha(directManifestBytes), traceSha256: directManifest.traceSha256 },
  });
}

const list = evidence.find((item) => item.profile === 'list');
const listGrowth = evidence.find((item) => item.profile === 'list-growth');
const effect = evidence.find((item) => item.profile === 'effect');
const listInitial = fieldValue((await json(join(artifactDir, 'list.native.json'))).trace?.ticks?.[0]?.state ?? (await json(join(artifactDir, 'list.native.json'))).ticks?.[0]?.state, 'Rows');
const listEmpty = fieldValue((await json(join(artifactDir, 'list.native.json'))).trace?.ticks?.at(-1)?.state ?? (await json(join(artifactDir, 'list.native.json'))).ticks?.at(-1)?.state, 'Rows');
if (!listInitial || listInitial.kind !== 'slice' || listInitial.isNil !== true || listInitial.items.length !== 0) fail('list initial state does not preserve nil slice');
if (!listEmpty || listEmpty.kind !== 'slice' || listEmpty.isNil !== false || listEmpty.items.length !== 0) fail('list final state does not preserve empty non-nil slice');
const growthRaw = await json(join(artifactDir, 'list-growth.native.json'));
const growthTrace = traceOf(growthRaw);
const effectRaw = await json(join(artifactDir, 'effect.native.json'));
const effectTrace = traceOf(effectRaw);
for (const tick of effectTrace.ticks) {
  const zero = fieldValue(tick.state, 'NegativeZeroBits');
  if (!zero || zero.kind !== 'float64' || zero.float64Bits !== '8000000000000000') fail(`effect tick ${tick.index} lost IEEE-754 negative zero`);
}
const formAppItem = build.outputs.find((item) => item.path.endsWith('/app-ir.json') && item.path.includes('/form-'));
const formApp = await json(join(artifactDir, 'compiled', formAppItem.path));
const integerRepresentations = formApp.types.filter((type) => type.kind === 'int' || type.kind === 'uint').map(({ id, kind, bits, jsRepresentation }) => ({ id, kind, bits, jsRepresentation }));

const summary = {
  schema: 'gobi.ci-trace-audit/v1',
  outcome: 'confirmed_reuse',
  primaryExecutionStatus: execution.status,
  executionSha256: sha(executionBytes),
  sourcePins: { count: sourcePinChecks.length, matchedLocalCheckout: true, runBeforeAfterEqual: true },
  commandLogs: { checked: logChecks.length, allMatchReceipt: true, commandCount: execution.commands.length },
  versions: execution.versions,
  outputPins: { count: outputHashes.length, allMatch: true },
  profiles: evidence,
  totals: {
    apps: build.apps.length,
    scripts: evidence.length,
    ticks: evidence.reduce((total, item) => total + item.ticks, 0),
    actions: evidence.reduce((total, item) => total + item.actionTicks, 0),
    mismatches: 0,
  },
  sentinels: {
    nilSlicePreserved: true,
    emptyNonNilSlicePreserved: true,
    negativeZeroBitsPreservedOnEveryEffectTick: true,
    integerTypeRepresentations: integerRepresentations,
    listGrowthTicks: listGrowth.ticks,
    effectTicks: effect.ticks,
  },
  sourcePinChecks,
  commandLogChecks: logChecks,
  outputHashes,
};
const output = `${JSON.stringify(summary, null, 2)}\n`;
await writeFile(join(here, 'raw-evidence.json'), output);
process.stdout.write(`${JSON.stringify({ status: 'audited', artifactDir, output: join(here, 'raw-evidence.json'), ...summary.totals })}\n`);
