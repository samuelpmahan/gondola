import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const expectedPackage = "github.com/samuelpmahan/gondola/fixtures/compiled/children";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    if (fallback !== null) return fallback;
    throw new Error(`missing ${name}`);
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing value for ${name}`);
  if (process.argv.indexOf(name, index + 1) !== -1) throw new Error(`duplicate ${name}`);
  return value;
}

const compiled = resolve(argument("--compiled"));
const output = resolve(argument("--output"));
const backend = argument("--backend", "react");
if (backend !== "react") throw new Error("--backend must be react; the browser demo swaps renderers at runtime");

const manifestBytes = await readFile(join(compiled, "buildmanifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (!Array.isArray(manifest.apps) || manifest.apps.length !== 1) throw new Error("compiled build must contain one app");
const app = manifest.apps[0];
if (app.packagePath !== expectedPackage || app.backend !== backend) throw new Error("manifest does not identify the requested compiled children app");

function outputPath(value) {
  if (typeof value !== "string" || !value || value.startsWith("/")) throw new Error("invalid app output path");
  const path = resolve(compiled, value);
  if (!path.startsWith(compiled + sep)) throw new Error(`compiled output escapes build directory: ${value}`);
  return path;
}

const appPaths = Object.fromEntries(["appIR", "module", "encoder"].map((key) => [key, outputPath(app[key])]));
for (const path of Object.values(appPaths)) await readFile(path);
const appIR = JSON.parse(await readFile(appPaths.appIR, "utf8"));
const component = appIR.components?.find((item) => item.packagePath === expectedPackage);
if (!component || component.id !== expectedPackage || !Array.isArray(component.capabilities)) {
  throw new Error("AppIR has no compiled children component or capability list");
}
for (const capability of ["view.node", "effect.request-reply", "effect.cancel"]) {
  if (!component.capabilities.includes(capability)) throw new Error(`compiled children app is missing ${capability}`);
}

await mkdir(output, { recursive: true });
const entryPath = join(output, "entry.mjs");
const entry = [
  `import { gobiCompiled as childrenModule } from ${JSON.stringify(appPaths.module)};`,
  `import * as childrenEncoder from ${JSON.stringify(appPaths.encoder)};`,
  `import { startChildrenDemo } from ${JSON.stringify(resolve(here, "app.mjs"))};`,
  "startChildrenDemo(childrenModule, childrenEncoder);",
  "",
].join("\n");
await writeFile(entryPath, entry);

const esbuild = await import(pathToFileURL(join(root, "interaction/node_modules/esbuild/lib/main.js")).href);
const result = await esbuild.build({
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

const sourceFiles = ["app.mjs", "build.mjs", "demo.css", "index.html"].map((name) => `compiled-children/demo/${name}`);
const sourcePins = {};
for (const relativePath of sourceFiles) sourcePins[relativePath] = digest(await readFile(join(root, relativePath)));
const bundle = await readFile(join(output, "demo.bundle.mjs"));
const record = {
  schema: "gobi.compiled-children-demo-build/v1",
  backend,
  packagePath: app.packagePath,
  componentId: component.id,
  requirements: component.capabilities,
  appIR: { path: app.appIR, ...await hashPath(appPaths.appIR) },
  module: { path: app.module, ...await hashPath(appPaths.module) },
  encoder: { path: app.encoder, ...await hashPath(appPaths.encoder) },
  manifest: { path: "buildmanifest.json", bytes: manifestBytes.length, sha256: digest(manifestBytes) },
  sourcePins,
  bundleInputs: Object.keys(result.metafile.inputs).sort(),
  output: { path: "demo.bundle.mjs", bytes: bundle.length, sha256: digest(bundle) },
};
await writeFile(join(output, "demo-build.json"), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ schema: "gobi.compiled-children-demo-build-result/v1", status: "passed", backend, packagePath: app.packagePath, componentId: component.id, bundle: record.output, output })}\n`);

async function hashPath(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: digest(bytes) };
}
