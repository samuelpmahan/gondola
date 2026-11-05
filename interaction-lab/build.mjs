import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../interaction/node_modules/esbuild/lib/main.js';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const archive = join(root, 'compiled-frontend/evidence/compiled-artifacts.tar.xz');
const archiveSHA = 'd88b651a05f5c085f33a7763b7a5e2e7c14c9dfd7df6641e99885463aa344f66';
if (sha(await readFile(archive)) !== archiveSHA) throw Error('Accepted Go artifact archive changed. Review its provenance before replacing the pin.');
const restored = join(here, '.compiled'), out = join(here, 'dist');
await mkdir(restored, { recursive: true }); await mkdir(out, { recursive: true });
const apps = { form: 'form-a3fe6b48b000', list: 'list-f8359aa2866d', effect: 'effect-ff8449e8f5b2' };
execFileSync('tar', ['-xJf', archive, '-C', restored, ...Object.values(apps).map(name => './compiled/apps/' + name)]);
const fixtures = [];
for (const [name, folder] of Object.entries(apps)) {
  const module = join(restored, 'compiled/apps', folder, 'gobi-compiled.mjs');
  const encoder = join(restored, 'compiled/apps', folder, 'encoder.mjs');
  fixtures.push('import {gobiCompiled as ' + name + '} from ' + JSON.stringify(module) + ';\nimport * as ' + name + 'Encoder from ' + JSON.stringify(encoder) + ';');
}
fixtures.push('export const compiled = {' + Object.keys(apps).map(n => n + ': {module:' + n + ',encoder:' + n + 'Encoder}').join(',') + '};');
await writeFile(join(restored, 'fixtures.mjs'), fixtures.join('\n'));
const pins = {};
for (const path of ['go-host.mjs', 'motion.mjs', 'journal.mjs', 'registry.mjs', 'variants.mjs', 'app.mjs', 'motion-view.mjs', 'styles.css', 'index.html', 'build.mjs', 'verify.mjs']) {
  pins['interaction-lab/' + path] = sha(await readFile(join(here, path)));
}
for (const path of ['compiled-frontend/frontend/runtime/runtime.mjs', 'compiled-frontend/frontend/dom/renderer.mjs', 'compiled-frontend/frontend/react/renderer.mjs', 'compiled-frontend/frontend/shared/view.mjs']) pins[path] = sha(await readFile(join(root, path)));
for (const path of ['index.html', 'styles.css', 'verify.html', 'responsive.html']) await copyFile(join(here, path), join(out, path));
const result = await build({ entryPoints: [join(here, 'app.mjs'), join(here, 'verify.mjs')], outdir: out, bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022', nodePaths: [join(root, 'interaction/node_modules')], metafile: true, logLevel: 'silent' });
const outputs = {};
for (const [path, info] of Object.entries(result.metafile.outputs)) outputs[path.replace(root + '/', '')] = { bytes: info.bytes, sha256: sha(await readFile(path)) };
await writeFile(join(out, 'build-receipt.json'), JSON.stringify({ schema: 'gondola.interaction-lab-build/v1', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), workingTree: execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim() ? 'modified' : 'clean', artifactArchive: { path: 'compiled-frontend/evidence/compiled-artifacts.tar.xz', sha256: archiveSHA, restoredApps: apps, mode: 'restore accepted compiled Go, not fresh Go compilation' }, sourcePins: pins, outputs }, null, 2));
console.log('Built interaction-lab/dist · 6 experiments · Go archive verified · ' + Object.keys(outputs).length + ' bundled outputs');
