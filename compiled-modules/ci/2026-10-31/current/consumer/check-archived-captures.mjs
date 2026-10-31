#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [extractRootArg] = process.argv.slice(2);
if (!extractRootArg) throw new TypeError('usage: check-archived-captures.mjs <verified-extraction-root>');
const root = resolve(extractRootArg);
const sourceRoot = join(root, 'source');
const captureRoot = join(root, 'conformance');
const readJSON = async (path) => JSON.parse(await readFile(path, 'utf8'));
const importFromSource = async (relativePath) => import(pathToFileURL(join(sourceRoot, relativePath)).href);
const nativeSchema = 'gobi.compiled-modules-native/v1';
const expectedSeeds = [20261031, 20261032, 20261033];
const parentPackage = 'github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent';
const childPackage = 'github.com/samuelpmahan/gondola/fixtures/compiled/modulechild';

const [checker, loader, seedGenerator, abi] = await Promise.all([
  importFromSource('compiled-modules/conformance/check.mjs'),
  importFromSource('compiled-modules/conformance/module-loader.mjs'),
  importFromSource('compiled-modules/conformance/seeded.mjs'),
  importFromSource('compiled-modules/abi/validate.mjs'),
]);
const fixture = await readJSON(join(sourceRoot, 'fixtures/compiled/moduleparent/scenario.json'));
const expectations = await readJSON(join(sourceRoot, 'compiled-modules/oracle/expectations.json'));
const native = await readJSON(join(root, 'native/native-trace.json'));
const conformanceNative = await readJSON(join(captureRoot, 'module-pair.fixed.native.json'));
const fixedDirect = await readJSON(join(captureRoot, 'module-pair.fixed.direct.json'));
const seededDirect = await readJSON(join(captureRoot, 'module-pair.seeded.direct.json'));
const browser = await readJSON(join(captureRoot, 'module-pair.browser.json'));
const summary = await readJSON(join(captureRoot, 'module-pair.check.json'));
const fixedProfileIndex = await readJSON(join(captureRoot, 'module-pair.fixed.browser-profiles.json'));
const seededSummary = await readJSON(join(captureRoot, 'module-pair.seeded.summary.json'));

assert.equal(native.schema, nativeSchema);
assert.deepEqual(native, conformanceNative, 'attempt native and conformance native captures must be equal');
assert.equal(fixture.schema, expectations.scenario.schema);
assert.equal(fixture.name, expectations.scenario.name);
assert.equal(fixture.events.length, expectations.scenario.sourceEvents);
assert.deepEqual(summary.browserProfiles, [
  'react', 'dom', 'swap',
  ...expectedSeeds.flatMap((seed) => ['react', 'dom', 'swap'].map((kind) => `seed-${seed}-${kind}`)),
]);
assert.equal(summary.browserProfileCount, 12);
assert.equal(summary.status, 'matched');
assert.equal(summary.mutationControlsDetected, 6);
assert.deepEqual(seededSummary.map((item) => item.seed), expectedSeeds);
assert.deepEqual(seededSummary.map((item) => item.status), expectedSeeds.map(() => 'matched'));
assert.equal(fixedProfileIndex.browserProfileCount, 12);
assert.deepEqual(Object.keys(browser.profiles).sort(), ['dom', 'react', 'seeded', 'swap']);

const manifestFor = (backend, role) => join(root, 'builds', `${backend}-${role}`, 'output/buildmanifest.json');
const [reactPair, domPair] = await Promise.all([
  loader.loadModulePairBuilds({ parentManifest: manifestFor('react', 'parent'), childManifest: manifestFor('react', 'child'), parentPackage, childPackage }),
  loader.loadModulePairBuilds({ parentManifest: manifestFor('dom', 'parent'), childManifest: manifestFor('dom', 'child'), parentPackage, childPackage }),
]);
for (const pair of [reactPair, domPair]) {
  await abi.validateModulePair({
    parent: { descriptor: pair.parent.descriptor, descriptorBytes: pair.parent.descriptorBytes, appIR: pair.parent.compiled.appIR, artifactBytes: pair.parent.artifactBytes },
    child: { descriptor: pair.child.descriptor, descriptorBytes: pair.child.descriptorBytes, appIR: pair.child.compiled.appIR, artifactBytes: pair.child.artifactBytes },
  });
}

checker.assertNative(native, fixture);
checker.assertDirect(fixedDirect.react, native, fixture, fixedDirectModule(reactPair.parent), fixedDirectModule(reactPair.child));
checker.assertDirect(fixedDirect.dom, native, fixture, fixedDirectModule(domPair.parent), fixedDirectModule(domPair.child));
for (const kind of ['react', 'dom', 'swap']) {
  checker.assertBrowserProfile(browser.profiles[kind], kind, fixture, kind === 'dom' ? domPair : reactPair);
}
const mutationControls = checker.runMutationControls(browser, fixture, reactPair);
assert.equal(mutationControls.length, 6);

const seedReports = [];
for (const seed of expectedSeeds) {
  const label = `seed-${seed}`;
  const generated = seedGenerator.generateSeededModuleScenario(seed, seedGenerator.SEEDED_EVENT_COUNT);
  const scenario = await readJSON(join(captureRoot, `module-pair.inputs.${label}.scenario.json`));
  assert.deepEqual(scenario, generated.scenario, `${label} must match archived deterministic seed generator`);
  assert.equal(scenario.events.length, 40);
  const seedNative = await readJSON(join(captureRoot, `module-pair.${label}.native.json`));
  const browserProfiles = Object.fromEntries(['react', 'dom', 'swap'].map((kind) => [kind, browser.profiles.seeded[`${label}-${kind}`]]));
  assert(seedNative, `${label} native capture missing`);
  checker.assertSeededReplay({
    native: seedNative,
    directProfiles: seededDirect[seed],
    browserProfiles,
    fixture: scenario,
    modulePairs: { react: reactPair, dom: domPair },
    seed,
  });
  seedReports.push({ seed, sourceEvents: scenario.events.length, nativeUpdates: seedNative.steps.length, profiles: ['react', 'dom', 'swap'], status: 'matched' });
}

const result = {
  schema: 'gobi.compiled-modules-archived-conformance-consumer/v1',
  status: 'passed',
  mode: 'offline archived-source and captured-evidence replay; no browser launched',
  sourceCommit: JSON.parse(await readFile(join(root, 'execution-before-archive.json'), 'utf8')).sourceCommit,
  fixed: { sourceEvents: fixture.events.length, nativeUpdates: native.steps.length, directProfiles: ['react', 'dom'], browserProfiles: ['react', 'dom', 'swap'], status: 'matched' },
  seeded: seedReports,
  browserProfileCount: 12,
  fixedMutationControlsDetected: mutationControls,
  freshABIAdmissions: { react: true, dom: true },
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function fixedDirectModule(side) {
  return { ...side, abi: side.descriptor };
}
