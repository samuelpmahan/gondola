import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const expectedPackage = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

const compiled = resolve(option("--compiled"));
const output = resolve(option("--output"));
const backend = option("--backend");
if (backend !== "react") throw new Error("--backend must be react; the demo switches renderers at runtime");

const manifestPath = join(compiled, "buildmanifest.json");
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (!Array.isArray(manifest.apps) || manifest.apps.length !== 1) {
  throw new Error("lifecycle build manifest must list exactly one app");
}
const app = manifest.apps[0];
if (app.packagePath !== expectedPackage || app.backend !== backend) {
  throw new Error("build manifest does not identify the requested compiled lifecycle app/backend");
}

function resolveBuildOutput(relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/")) {
    throw new Error("invalid app output path");
  }
  const target = resolve(compiled, relativePath);
  if (!target.startsWith(compiled + sep)) throw new Error(`build output escapes compiled directory: ${relativePath}`);
  return target;
}

const paths = Object.fromEntries(["appIR", "module", "encoder"].map((key) => [key, resolveBuildOutput(app[key])]));
for (const path of Object.values(paths)) await readFile(path);
const appIR = JSON.parse(await readFile(paths.appIR, "utf8"));
const componentId = appIR.components?.find((component) => component.packagePath === expectedPackage)?.id;
if (typeof componentId !== "string" || componentId.length === 0) throw new Error("AppIR has no lifecycle component ID");
await mkdir(output, { recursive: true });

const entryPath = join(output, "entry.mjs");
const appPath = resolve(here, "app.mjs");
const entry = [
  `import { gobiCompiled as lifecycleModule } from ${JSON.stringify(paths.module)};`,
  `import * as lifecycleEncoder from ${JSON.stringify(paths.encoder)};`,
  `import { startLifecycleDemo } from ${JSON.stringify(appPath)};`,
  "startLifecycleDemo(lifecycleModule, lifecycleEncoder);",
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

const sourceFiles = ["app.mjs", "build.mjs", "demo.css", "index.html"].map((name) => `compiled-lifecycle/demo/${name}`);
const sourcePins = {};
for (const relativePath of sourceFiles) {
  sourcePins[relativePath] = sha256(await readFile(join(root, relativePath)));
}
const buildRecord = {
  schema: "gobi.compiled-lifecycle-demo-build/v1",
  backend,
  packagePath: app.packagePath,
  componentId,
  appIR: { path: app.appIR, ...await hashPath(paths.appIR) },
  module: { path: app.module, ...await hashPath(paths.module) },
  encoder: { path: app.encoder, ...await hashPath(paths.encoder) },
  manifest: { path: "buildmanifest.json", bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
  sourcePins,
  bundleInputs: Object.keys(buildResult.metafile.inputs).sort(),
  output: "demo.bundle.mjs",
};
await writeFile(join(output, "demo-build.json"), `${JSON.stringify(buildRecord, null, 2)}\n`);
const bundle = await readFile(join(output, "demo.bundle.mjs"));
console.log(JSON.stringify({
  schema: "gobi.compiled-lifecycle-demo-build-result/v1",
  backend,
  app: app.packagePath,
  componentId,
  bundle: { bytes: bundle.length, sha256: sha256(bundle) },
  output,
}));

async function hashPath(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}
