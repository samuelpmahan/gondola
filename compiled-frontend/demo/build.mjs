import { readFile, readdir, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
function flag(name) { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw new Error(`missing ${name}`); return resolve(process.argv[i + 1]); }
const compiled = flag('--compiled'), output = flag('--output');
await mkdir(output, { recursive: true });
const entries = [];
for (const name of ['counter', 'form', 'list', 'effect']) {
  const dirs = (await readdir(join(compiled, 'apps'))).filter(p => p.startsWith(`${name}-`));
  if (dirs.length !== 1) throw new Error(`expected one compiled ${name} app`);
  const dir = join(compiled, 'apps', dirs[0]);
  entries.push(`import {gobiCompiled as ${name}} from ${JSON.stringify(join(dir, 'gobi-compiled.mjs'))};\nimport * as ${name}Encoder from ${JSON.stringify(join(dir, 'encoder.mjs'))};`);
}
entries.push(`import {startDemo} from ${JSON.stringify(join(here, 'app.mjs'))};\nstartDemo([${['counter', 'form', 'list', 'effect'].map(name => `{name:${JSON.stringify(name)},module:${name},encoder:${name}Encoder}`).join(',')}]);`);
const entry = join(output, 'entry.mjs');
await writeFile(entry, entries.join('\n'));
const { build } = await import(pathToFileURL(join(root, 'interaction/node_modules/esbuild/lib/main.js')).href);
await build({ entryPoints: [entry], outfile: join(output, 'demo.bundle.mjs'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', nodePaths: [join(root, 'interaction/node_modules')], logLevel: 'silent' });
await copyFile(join(here, 'index.html'), join(output, 'index.html'));
console.log(JSON.stringify({ apps: 4, output }));
