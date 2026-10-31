import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const expectedPackage = "github.com/samuelpmahan/gondola/fixtures/compiled/methods";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

const compiled = resolve(option("--compiled"));
const output = resolve(option("--output"));
const backend = option("--backend");
if (!new Set(["react", "dom"]).has(backend)) throw new Error("--backend must be react or dom");
const manifestPath = join(compiled, "buildmanifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!Array.isArray(manifest.apps) || manifest.apps.length !== 1) throw new Error("method build manifest must list exactly one app");
const app = manifest.apps[0];
if (app.packagePath !== expectedPackage || app.backend !== backend) throw new Error("build manifest does not identify the requested method app/backend");

function resolveBuildOutput(relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/")) throw new Error("invalid app output path");
  const target = resolve(compiled, relativePath);
  if (!target.startsWith(compiled + sep)) throw new Error(`build output escapes app directory: ${relativePath}`);
  return target;
}

const paths = Object.fromEntries(["appIR", "module", "encoder"].map((key) => [key, resolveBuildOutput(app[key])]));
for (const path of Object.values(paths)) await readFile(path);
await mkdir(output, { recursive: true });

const entryPath = join(output, "entry.mjs");
const appPath = resolve(here, "app.mjs");
const entry = [
  `import { gobiCompiled as methodsModule } from ${JSON.stringify(paths.module)};`,
  `import * as methodsEncoder from ${JSON.stringify(paths.encoder)};`,
  `import { startMethodDemo } from ${JSON.stringify(appPath)};`,
  "startMethodDemo(methodsModule, methodsEncoder);",
  "",
].join("\n");
await writeFile(entryPath, entry);

const esbuild = await import(pathToFileURL(join(root, "interaction/node_modules/esbuild/lib/main.js")).href);
const buildResult = await esbuild.build({
  entryPoints: [entryPath],
  outfile: join(output, "demo.bundle.mjs"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  nodePaths: [join(root, "interaction/node_modules")],
  logLevel: "silent",
  metafile: true,
});
await copyFile(join(here, "index.html"), join(output, "index.html"));
await copyFile(join(here, "demo.css"), join(output, "demo.css"));

const buildRecord = {
  schema: "gobi.compiled-methods-demo-build/v1",
  backend,
  packagePath: app.packagePath,
  appIR: { path: app.appIR, ...await hashPath(paths.appIR) },
  module: { path: app.module, ...await hashPath(paths.module) },
  encoder: { path: app.encoder, ...await hashPath(paths.encoder) },
  sourceFiles: {
    "compiled-methods/demo/app.mjs": sha256(await readFile(join(here, "app.mjs"))),
    "compiled-methods/demo/index.html": sha256(await readFile(join(here, "index.html"))),
    "compiled-methods/demo/demo.css": sha256(await readFile(join(here, "demo.css"))),
  },
  bundleInputs: Object.keys(buildResult.metafile.inputs).sort(),
  output: "demo.bundle.mjs",
};
await writeFile(join(output, "demo-build.json"), `${JSON.stringify(buildRecord, null, 2)}\n`);
const bundle = await readFile(join(output, "demo.bundle.mjs"));
console.log(JSON.stringify({
  schema: "gobi.compiled-methods-demo-build-result/v1",
  backend,
  app: app.packagePath,
  bundle: { bytes: bundle.length, sha256: sha256(bundle) },
  output,
}));

async function hashPath(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}
