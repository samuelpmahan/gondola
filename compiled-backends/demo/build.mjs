import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const packages = {
  counter: "github.com/samuelpmahan/gondola/counter",
  form: "github.com/samuelpmahan/gondola/fixtures/compiled/form",
  list: "github.com/samuelpmahan/gondola/fixtures/compiled/list",
  effect: "github.com/samuelpmahan/gondola/fixtures/compiled/effect",
};

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return resolve(process.argv[index + 1]);
}

const compiled = option("--compiled");
const output = option("--output");
const backendIndex = process.argv.indexOf("--backend");
const backend = backendIndex >= 0 ? process.argv[backendIndex + 1] : "";
if (!["react", "dom"].includes(backend)) {
  throw new Error("--backend must be react or dom");
}
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile(join(compiled, "buildmanifest.json"), "utf8"));
if (!Array.isArray(manifest.apps) || manifest.apps.length !== 4) throw new Error("build manifest must list all four apps");
const imports = [];
const modules = [];
for (const [name, packagePath] of Object.entries(packages)) {
  const entry = manifest.apps.find(app => app.packagePath === packagePath);
  if (!entry) throw new Error(`build manifest has no ${name} app`);
  if (entry.backend !== backend) throw new Error(`${name} manifest backend must be ${backend}`);
  const modulePath = resolve(compiled, entry.module);
  const encoderPath = resolve(compiled, entry.encoder);
  imports.push(`import {gobiCompiled as ${name}Module} from ${JSON.stringify(modulePath)};`);
  imports.push(`import * as ${name}Encoder from ${JSON.stringify(encoderPath)};`);
  modules.push({ name, packagePath, module: entry.module, encoder: entry.encoder, backend: entry.backend });
}
imports.push(`import {startDemo} from ${JSON.stringify(join(here, "app.mjs"))};`);
imports.push(`startDemo([${Object.keys(packages).map(name => `{name:${JSON.stringify(name)},module:${name}Module,encoder:${name}Encoder}`).join(",")}]);`);
const entryPath = join(output, "entry.mjs");
await writeFile(entryPath, `${imports.join("\n")}\n`);

const { build } = await import(pathToFileURL(join(root, "interaction/node_modules/esbuild/lib/main.js")).href);
await build({
  entryPoints: [entryPath],
  outfile: join(output, "demo.bundle.mjs"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  nodePaths: [join(root, "interaction/node_modules")],
  logLevel: "silent",
});
await copyFile(join(here, "index.html"), join(output, "index.html"));
await writeFile(join(output, "demo-build.json"), `${JSON.stringify({ schema: "gobi.compiled-backends-demo-build/v1", backend, apps: modules }, null, 2)}\n`);
console.log(JSON.stringify({ schema: "gobi.compiled-backends-demo-build-result/v1", backend, apps: modules.length, output }));
