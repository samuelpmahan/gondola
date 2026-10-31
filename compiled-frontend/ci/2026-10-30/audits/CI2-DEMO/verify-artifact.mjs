import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const repo = process.cwd();
const ci = join(repo, 'compiled-frontend/ci/2026-10-30');
const provider = join(ci, 'provider');
const extracted = join(provider, 'repaired-extracted');
const artifactRoot = join(extracted, 'compiled-frontend/artifacts');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const checkHash = async (path, expectedHash, expectedBytes, label) => {
  const bytes = await readFile(path);
  assert.equal(bytes.length, expectedBytes, `${label}: byte count`);
  assert.equal(sha(bytes), expectedHash, `${label}: sha256`);
  return { sha256: expectedHash, bytes: bytes.length };
};

const completed = await json(join(provider, 'repaired-completed.json'));
const extraction = await json(join(extracted, 'extraction-manifest.json'));
const execution = await json(join(artifactRoot, 'execution.json'));
const request = await json(join(artifactRoot, 'request.json'));
const build = await json(join(artifactRoot, 'build-result.json'));
const buildManifest = await json(join(artifactRoot, 'compiled/buildmanifest.json'));
const smoke = await json(join(artifactRoot, 'demo-smoke.json'));
const outputPaths = new Set(build.outputs.map(item => item.path));
const nodeTestsLog = await readFile(join(artifactRoot, 'logs/node-tests.stdout.log'), 'utf8');
const nodeTestSummary = Object.fromEntries([...nodeTestsLog.matchAll(/^# (tests|pass|fail) (\d+)$/gm)]
  .map(match => [match[1], Number(match[2])]));

assert.equal(completed.run.id, 41144116537);
assert.equal(completed.run.status, 'completed');
assert.equal(completed.run.conclusion, 'success');
assert.equal(completed.run.head_sha, '184ccdaabe9e6e46e1052ee79cd7e0be26fe3281');
assert.equal(completed.run.head_commit.tree_id, 'ca99e9432dca87a6bf6718c20186b1223b870126');
assert.equal(completed.artifacts.artifacts[0].id, 13020568606);
assert.equal(completed.artifacts.artifacts[0].digest, `sha256:${extraction.archiveSha256}`);

const extractedResults = [];
for (const item of extraction.compilerFiles) {
  const path = resolve(extracted, item.path);
  assert.ok(path.startsWith(resolve(extracted) + sep), `manifest path contained: ${item.path}`);
  extractedResults.push(await checkHash(path, item.sha256, item.bytes, item.path));
}

assert.equal(extraction.compilerFiles.length, 309);
assert.equal(execution.status, 'passed');
assert.equal(execution.mismatches, 0);
assert.equal(execution.commands.length, 33);
assert.deepEqual(execution.commands.filter(command => command.exitCode !== 0), []);
const commandLogs = [];
for (const command of execution.commands) {
  for (const suffix of ['stdout', 'stderr']) {
    const path = join(artifactRoot, 'logs', `${command.name}.${suffix}.log`);
    const bytes = await readFile(path);
    const expected = command[`${suffix}Sha256`];
    assert.equal(sha(bytes), expected, `${command.name} ${suffix} command log hash`);
    commandLogs.push({ command: command.name, stream: suffix, sha256: expected, bytes: bytes.length });
  }
}
assert.equal(execution.versions.go, 'go version go1.27.3 linux/amd64');
assert.equal(execution.versions.rootGo, 'go version go1.24.13 linux/amd64');
assert.equal(execution.versions.node, 'v22.23.4');
assert.equal(execution.versions.react, '19.3.1');
assert.equal(execution.versions['react-dom'], '19.3.1');
assert.equal(execution.versions.esbuild, '0.28.2');
assert.equal(execution.versions.playwright, '1.64.1');
assert.deepEqual(nodeTestSummary, { tests: 81, pass: 81, fail: 0 });
assert.deepEqual(execution.sourceBefore, execution.sourceAfter);
assert.equal(execution.sourceBefore.length, 116);
const sourceMismatches = [];
for (const pin of execution.sourceBefore) {
  const path = resolve(repo, pin.path);
  if (!path.startsWith(resolve(repo) + sep)) { sourceMismatches.push({ path: pin.path, reason: 'outside-source-root' }); continue; }
  try { if (sha(await readFile(path)) !== pin.sha256) sourceMismatches.push({ path: pin.path, reason: 'hash-mismatch' }); }
  catch { sourceMismatches.push({ path: pin.path, reason: 'missing' }); }
}
assert.deepEqual(sourceMismatches, []);

assert.equal(request.backend, 'react');
assert.deepEqual(request.entryPackages, [
  'github.com/samuelpmahan/gondola/counter',
  'github.com/samuelpmahan/gondola/fixtures/compiled/form',
  'github.com/samuelpmahan/gondola/fixtures/compiled/list',
  'github.com/samuelpmahan/gondola/fixtures/compiled/effect',
]);
assert.equal(build.ok, true);
assert.deepEqual(build.diagnostics, []);
assert.equal(build.apps.length, 4);
assert.equal(build.outputs.length, 209);
assert.equal(buildManifest.apps.length, 4);
assert.ok(buildManifest.emittedTypeScript.length > 0);
assert.ok(buildManifest.emittedTypeScript.every(path => path.endsWith('.ts')));
assert.ok(buildManifest.emittedTypeScript.every(path => outputPaths.has(path)));
assert.ok(buildManifest.forwarderSources.every(path => outputPaths.has(path)));
assert.ok(outputPaths.has(buildManifest.forwarderGoMod));
assert.ok(outputPaths.has('react-map.gen.mjs'));
assert.equal(await stat(join(artifactRoot, 'compiled/react-map.gen.mjs')).then(s => s.isFile()), true);
assert.deepEqual(execution.outputPinsBefore, execution.outputPinsAfter);
assert.equal(execution.outputPinsBefore.length, build.outputs.length);

const outputRoot = join(artifactRoot, 'compiled');
const outputRecords = [];
for (const item of build.outputs) {
  assert.ok(!isAbsolute(item.path) && !item.path.split('/').includes('..'), `relative output path: ${item.path}`);
  outputRecords.push({ path: item.path, ...(await checkHash(join(outputRoot, item.path), item.sha256, item.bytes, `build output ${item.path}`)) });
}
for (const pin of execution.outputPinsBefore) {
  const item = build.outputs.find(output => output.path === pin.path);
  assert.ok(item, `output pin corresponds to build output ${pin.path}`);
  assert.equal(pin.sha256, item.sha256, `output pin digest ${pin.path}`);
  assert.equal(pin.bytes, item.bytes, `output pin size ${pin.path}`);
}

const expectedApps = ['counter', 'form', 'list', 'effect'];
const profiles = [...expectedApps, 'list-growth'];
const profileResults = [];
for (const name of profiles) {
  const check = await json(join(artifactRoot, `${name}.check.json`));
  const browser = await json(join(artifactRoot, `${name}.browser.json`));
  assert.equal(check.status, 'matched', `${name} comparison`);
  assert.equal(browser.browser, '156.0.8078.4', `${name} browser version`);
  profileResults.push({ name, status: check.status, ticks: check.ticks, browser: browser.browser, noWasm: check.noWasm });
}
assert.deepEqual(profileResults.map(x => x.ticks), [5, 10, 11, 5, 12]);
assert.equal(profileResults.reduce((n, x) => n + x.ticks, 0), 43);
assert.ok(profileResults.every(x => x.noWasm.wasmRequests.length === 0 && x.noWasm.wasmAPIAttempts.length === 0));

const expectedChecks = [
  'all four compiled Go components mounted',
  'counter Add/Add/Reset and disabled Reset',
  'controlled text/checkbox save and literal argument',
  'keyed list edit and reorder',
  'effect pending DOM then one manual captured reply',
];
assert.equal(smoke.status, 'passed');
assert.deepEqual(smoke.checks, expectedChecks);
assert.deepEqual(smoke.failures, []);
assert.deepEqual(smoke.errors, []);
assert.deepEqual(smoke.wasmRequests, []);
assert.equal(smoke.browser, '156.0.8078.4');
assert.equal(execution.commands.at(-2).name, 'build-demo');
assert.equal(execution.commands.at(-1).name, 'demo-smoke');

const demoDir = join(artifactRoot, 'demo');
const entry = await readFile(join(demoDir, 'entry.mjs'), 'utf8');
const html = await readFile(join(demoDir, 'index.html'));
assert.match(html.toString('utf8'), /\.\/demo\.bundle\.mjs/);
const manifestByPackage = new Map(buildManifest.apps.map(item => [item.packagePath, item]));
for (const pkg of request.entryPackages) {
  const app = manifestByPackage.get(pkg);
  assert.ok(app, `build manifest contains ${pkg}`);
  for (const relativePath of [app.module, app.encoder]) {
    // The generated entry records the CI checkout's absolute output directory,
    // which is carried by request.json and intentionally differs after extract.
    const abs = join(request.outputDir, relativePath);
    assert.ok(entry.includes(JSON.stringify(abs)), `demo entry imports generated ${relativePath}`);
  }
}
const demoAssets = {};
for (const [name, path] of Object.entries({
  'demo/entry.mjs': join(demoDir, 'entry.mjs'),
  'demo/demo.bundle.mjs': join(demoDir, 'demo.bundle.mjs'),
  'demo/index.html': join(demoDir, 'index.html'),
  'demo-smoke.json': join(artifactRoot, 'demo-smoke.json'),
  'demo.png': join(artifactRoot, 'demo.png'),
})) {
  const bytes = await readFile(path);
  demoAssets[name] = { sha256: sha(bytes), bytes: bytes.length };
}
const png = await readFile(join(artifactRoot, 'demo.png'));
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
const pngSize = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };

const result = {
  schema: 'gobi.ci2-demo-verification/v1',
  completedRun: {
    runId: completed.run.id,
    jobId: completed.jobs.jobs[0].id,
    jobConclusion: completed.jobs.jobs[0].conclusion,
    head: completed.run.head_sha,
    tree: completed.run.head_commit.tree_id,
    artifactId: completed.artifacts.artifacts[0].id,
    artifactBytes: completed.artifacts.artifacts[0].size_in_bytes,
    archiveSha256: extraction.archiveSha256,
  },
  extractedArtifactInventory: { files: extraction.compilerFiles.length, mismatches: 0 },
  execution: {
    status: execution.status,
    commandCount: execution.commands.length,
    failedCommands: 0,
    versions: execution.versions,
    browser: smoke.browser,
    sourcePins: { before: execution.sourceBefore.length, after: execution.sourceAfter.length, stable: true, localMismatches: sourceMismatches.length },
    generatedCompilerOutputs: { count: build.outputs.length, beforeAfterStable: true, byteHashVerified: outputRecords.length },
    commandLogsVerified: commandLogs.length,
    nodeTests: { total: nodeTestSummary.tests, passed: nodeTestSummary.pass, failed: nodeTestSummary.fail },
  },
  generatedBuild: {
    appPackages: request.entryPackages,
    appCount: build.apps.length,
    emittedTypeScriptFiles: buildManifest.emittedTypeScript.length,
    goForwarderSources: buildManifest.forwarderSources.length - 1,
    forwarderGoModule: buildManifest.forwarderGoMod,
    reactMapPresent: true,
    demoEntryImportsGeneratedModulesAndEncoders: true,
    demoAssets,
  },
  conformance: { profiles: profileResults, totalMatchedTicks: 43 },
  httpDemo: {
    status: smoke.status,
    checks: smoke.checks,
    failures: smoke.failures,
    pageErrors: smoke.errors,
    wasmRequests: smoke.wasmRequests,
    screenshot: { path: 'compiled-frontend/artifacts/demo.png', ...demoAssets['demo.png'], ...pngSize, validPngHeader: true },
    screenshotVisualInspection: 'Nonblank 1280x1252 full-page capture shows all four app cards in their expected final interaction state; counter reset is disabled and the effect host is complete with one completion.',
  },
  evidenceHashes: {
    repairedCompletedMetadata: sha(await readFile(join(provider, 'repaired-completed.json'))),
    extractionRecoveryNote: sha(await readFile(join(provider, 'extraction-recovery.json'))),
    extractionManifest: sha(await readFile(join(extracted, 'extraction-manifest.json'))),
    executionJson: sha(await readFile(join(artifactRoot, 'execution.json'))),
    requestJson: sha(await readFile(join(artifactRoot, 'request.json'))),
    buildResultJson: sha(await readFile(join(artifactRoot, 'build-result.json'))),
    buildManifestJson: sha(await readFile(join(artifactRoot, 'compiled/buildmanifest.json'))),
    demoSmokeJson: sha(await readFile(join(artifactRoot, 'demo-smoke.json'))),
  },
  scopeLimits: [
    'Source and generated compiler output pins are verified against this exact evidence checkout; the compiled demo bundle and screenshot hashes are measured from the immutable artifact, since execution.json does not include a separate demo-bundle output inventory.',
    'The smoke records pageerror, runtime failures, and .wasm requests; it does not separately record console.error, requestfailed, navigation response status, or an API-attempt counter in the demo-smoke file.',
    'The screenshot is visual evidence for the final state; transient effect-pending state is proven by the smoke assertions rather than by the final screenshot.',
  ],
};
await import('node:fs/promises').then(({ writeFile }) => writeFile(join(ci, 'audits/CI2-DEMO/verification.json'), `${JSON.stringify(result, null, 2)}\n`));
console.log(JSON.stringify(result, null, 2));
