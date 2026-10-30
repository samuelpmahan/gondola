import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const out = join(here, 'artifacts');
await mkdir(join(out, 'logs'), { recursive: true });
const receipt = { schema: 'gobi.compiled-execution/v1', startedAt: new Date().toISOString(), commands: [], status: 'running', environment: Object.fromEntries(['GOTOOLCHAIN', 'GOFLAGS', 'CHROMIUM_PATH', 'CHROMIUM_EXECUTABLE_PATH'].map(name => [name, process.env[name] ?? null])) };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
async function save() { await writeFile(join(out, 'execution.json'), `${JSON.stringify(receipt, null, 2)}\n`); }
function run(name, command, args, { cwd = root, input, env = {} } = {}) {
  const startedAt = new Date().toISOString();
  process.stdout.write(`${name}: ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, { cwd, input, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: { ...process.env, ...env } });
  const stdout = result.stdout ?? '', stderr = result.stderr ?? '';
  const entry = { name, command, args, cwd, environmentOverrides: env, startedAt, finishedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal, error: result.error?.message ?? null, stdoutSha256: hash(stdout), stderrSha256: hash(stderr) };
  receipt.commands.push(entry);
  return { result, stdout, stderr, entry };
}
async function execute(name, command, args, options) {
  const value = run(name, command, args, options);
  await Promise.all([
    writeFile(join(out, 'logs', `${name}.stdout.log`), value.stdout),
    writeFile(join(out, 'logs', `${name}.stderr.log`), value.stderr),
  ]);
  await save();
  if (value.result.status !== 0 || value.result.error) throw new Error(`${name} failed; see compiled-frontend/artifacts/logs/${name}.*.log`);
  return value.stdout;
}
async function files(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await files(p));
    else if (entry.isFile()) result.push(p);
  }
  return result;
}
async function sourcePins() {
  const directories = ['counter', 'gobi', 'reactmap', 'compilercontract', 'fixtures/compiled', 'cmd/compiled-native', ...['analyze', 'build', 'cmd', 'emit', 'semantic', 'frontend', 'fixtures', 'demo'].map(x => `compiled-frontend/${x}`)];
  let paths = ['run-compiled-frontend.sh', 'go.mod', 'package.json', 'package-lock.json', 'interaction/package.json', 'interaction/package-lock.json', 'compiled-frontend/run.mjs', 'compiled-frontend/go.mod', 'compiled-frontend/go.sum', 'compiled-frontend/package.json', 'compiled-frontend/package-lock.json'].map(path => join(root, path));
  for (const dir of directories) paths.push(...await files(join(root, dir)));
  paths.push(...(await files(join(here, 'conformance'))).filter(p =>
    !p.startsWith(join(here, 'conformance/raw') + sep) &&
    (p.endsWith('.mjs') || (p.startsWith(join(here, 'conformance/fixtures') + sep) && p.endsWith('.json')))));
  const pins = [];
  for (const path of [...new Set(paths)].sort()) pins.push({ path: relative(root, path), sha256: hash(await readFile(path)) });
  return pins;
}
async function verifyOutputs(directory, outputs) {
  if (!Array.isArray(outputs) || outputs.length === 0) throw new Error('build output inventory is empty');
  const seen = new Set();
  for (const item of outputs) {
    if (typeof item.path !== 'string' || !item.path || isAbsolute(item.path) || seen.has(item.path)) throw new Error('invalid or duplicate build output path');
    const path = resolve(directory, item.path);
    if (!path.startsWith(resolve(directory) + sep)) throw new Error('build output escapes publication directory');
    seen.add(item.path);
    const bytes = await readFile(path);
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256) throw new Error(`build output hash/size mismatch: ${item.path}`);
  }
  return outputs.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }));
}
// Fence stale successful receipts before any synchronous build/test command.
await save();
try {
  receipt.versions = { go: (await execute('version-go', 'go', ['version'])).trim(), node: process.version };
  for (const name of ['react', 'react-dom', 'esbuild', 'playwright']) receipt.versions[name] = (await json(join(root, 'interaction/node_modules', name, 'package.json'))).version;
  receipt.sourceBefore = await sourcePins();
  receipt.versions.rootGo = (await execute('version-root-go', 'go', ['version'], { env: { GOTOOLCHAIN: 'local' } })).trim();
  if (!receipt.versions.rootGo.includes('go1.24.')) throw new Error('root contract compatibility gate requires Go1.24.x on PATH');
  const rootPackages = ['./compilercontract', './fixtures/compiled/...', './cmd/compiled-native'];
  await execute('root-go-tests', 'go', ['test', ...rootPackages], { env: { GOTOOLCHAIN: 'local' } });
  await execute('root-go-race', 'go', ['test', '-race', ...rootPackages], { env: { GOTOOLCHAIN: 'local' } });
  await execute('root-go-vet', 'go', ['vet', ...rootPackages], { env: { GOTOOLCHAIN: 'local' } });
  // Historical audit programs are evidence, not compiler packages; run them via
  // their recorded commands rather than discovering their fixture directories.
  const compilerPackages = ['./analyze', './build', './cmd/...', './emit'];
  await execute('go-tests', 'go', ['test', ...compilerPackages], { cwd: here });
  await execute('go-race', 'go', ['test', '-race', ...compilerPackages], { cwd: here });
  await execute('go-vet', 'go', ['vet', ...compilerPackages], { cwd: here });
  const tests = (await files(join(here, 'frontend'))).concat(await files(join(here, 'conformance'))).filter(p => p.endsWith('.test.mjs'));
  await execute('node-tests', process.execPath, ['--test', ...tests]);
  const packagePrefix = 'github.com/samuelpmahan/gondola';
  const names = ['counter', 'form', 'list', 'effect'];
  const entryPackages = names.map(name => name === 'counter' ? `${packagePrefix}/counter` : `${packagePrefix}/fixtures/compiled/${name}`);
  const profiles = names.map(name => ({ name, app: name, fixture: join(here, 'fixtures', `${name}.json`) }));
  profiles.push({ name: 'list-growth', app: 'list', fixture: join(here, 'conformance/fixtures/list-growth.json') });
  const request = { schema: 'gobi.build-request/v1', sourceRoot: root, entryPackages, backend: 'react', outputDir: join(out, 'compiled') };
  await writeFile(join(out, 'request.json'), `${JSON.stringify(request, null, 2)}\n`);
  const buildText = await execute('compile-four', 'go', ['run', './cmd/gobi-build'], { cwd: here, input: JSON.stringify(request) });
  const build = JSON.parse(buildText);
  if (!build.ok || build.diagnostics.length || build.apps.length !== 4) throw new Error('four-app build did not return a clean success');
  receipt.outputPinsBefore = await verifyOutputs(request.outputDir, build.outputs);
  await writeFile(join(out, 'build-result.json'), buildText);
  await execute('build-native', 'go', ['build', '-o', join(out, 'compiled-native'), './cmd/compiled-native']);
  receipt.apps = [];
  for (const { name, app: appName, fixture } of profiles) {
    const app = build.apps.find(app => app.packagePath === entryPackages[names.indexOf(appName)]);
    const appIRItem = build.outputs.find(item => item.path.endsWith('/app-ir.json') && item.path.includes(`/` + appName + '-'));
    if (!app || !appIRItem) throw new Error(`missing build outputs for ${name}`);
    const dir = dirname(join(request.outputDir, appIRItem.path));
    const paths = { native: join(out, `${name}.native.json`), direct: join(out, `${name}.direct.json`), browser: join(out, `${name}.browser.json`), report: join(out, `${name}.check.json`) };
    const native = await execute(`${name}-native`, join(out, 'compiled-native'), ['--app-ir', join(dir, 'app-ir.json'), '--script', fixture]);
    await writeFile(paths.native, native);
    const common = ['--compiled', join(dir, 'gobi-compiled.mjs'), '--helpers', join(dir, 'encoder.mjs'), '--fixture', fixture];
    await execute(`${name}-direct`, process.execPath, [join(here, 'conformance/direct-js.mjs'), ...common, '--output', paths.direct, '--manifest', join(out, `${name}.direct.manifest.json`)]);
    await execute(`${name}-browser`, process.execPath, [join(here, 'conformance/browser.mjs'), ...common, '--output', paths.browser]);
    await execute(`${name}-compare`, process.execPath, [join(here, 'conformance/check.mjs'), '--app-ir', join(dir, 'app-ir.json'), '--fixture', fixture, '--native', paths.native, '--direct', paths.direct, '--browser', paths.browser, '--output', paths.report]);
    receipt.apps.push(await json(paths.report));
  }
  await execute('build-demo', process.execPath, [join(here, 'demo/build.mjs'), '--compiled', request.outputDir, '--output', join(out, 'demo')]);
  await execute('demo-smoke', process.execPath, [join(here, 'demo/smoke.mjs')]);
  receipt.outputPinsAfter = await verifyOutputs(request.outputDir, build.outputs);
  receipt.sourceAfter = await sourcePins();
  if (JSON.stringify(receipt.sourceBefore) !== JSON.stringify(receipt.sourceAfter)) throw new Error('sources changed during execution; mixed-source run is not accepted');
  receipt.status = 'passed';
  receipt.mismatches = 0;
  receipt.finishedAt = new Date().toISOString();
  await save();
  console.log(JSON.stringify({ status: receipt.status, apps: build.apps.length, scripts: receipt.apps.length, ticks: receipt.apps.reduce((n, app) => n + app.ticks, 0), mismatches: 0, receipt: relative(root, join(out, 'execution.json')) }));
} catch (error) {
  receipt.status = 'failed'; receipt.finishedAt = new Date().toISOString(); receipt.error = error.message;
  await save();
  console.error(error.message); process.exitCode = 1;
}
