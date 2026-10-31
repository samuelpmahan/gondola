import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const expectedPackage = "github.com/samuelpmahan/gondola/fixtures/compiled/publications";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function argument(name) {
  const first = process.argv.indexOf(name);
  if (first < 0) throw new Error(`missing ${name}`);
  if (process.argv.indexOf(name, first + 1) >= 0) throw new Error(`duplicate ${name}`);
  const value = process.argv[first + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing value for ${name}`);
  return value;
}

const manifestPath = resolve(argument("--react-manifest"));
const output = resolve(argument("--output"));
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (!Array.isArray(manifest.apps) || manifest.apps.length !== 1) {
  throw new Error("React build manifest must contain exactly one compiled app");
}
const app = manifest.apps[0];
if (app.packagePath !== expectedPackage || app.backend !== "react") {
  throw new Error("build manifest does not identify the compiled publications React app");
}

function manifestPathFor(key) {
  const value = app[key];
  if (typeof value !== "string" || !value || value.startsWith("/")) {
    throw new Error(`invalid manifest path for ${key}`);
  }
  const path = resolve(dirname(manifestPath), value);
  if (!path.startsWith(dirname(manifestPath) + sep)) {
    throw new Error(`${key} escapes the compiler output directory`);
  }
  return path;
}

const artifacts = Object.fromEntries(["appIR", "module", "encoder"].map((key) => [key, manifestPathFor(key)]));
const artifactBytes = Object.fromEntries(await Promise.all(Object.entries(artifacts).map(async ([key, path]) => [key, await readFile(path)])));
const appIR = JSON.parse(artifactBytes.appIR.toString("utf8"));
const component = appIR.components?.find((item) => item.id === app.packagePath && item.packagePath === expectedPackage);
if (!component || component.id !== app.packagePath || !Array.isArray(component.capabilities)) {
  throw new Error("compiled AppIR does not contain the expected publications component");
}
for (const required of ["view.node", "effect.request-reply", "effect.cancel"]) {
  if (!component.capabilities.includes(required)) throw new Error(`AppIR is missing ${required}`);
}

await mkdir(output, { recursive: true });
const entryPath = join(output, "demo-entry.mjs");
const entry = [
  `import { gobiCompiled as publicationsModule } from ${JSON.stringify(artifacts.module)};`,
  `import * as publicationsEncoder from ${JSON.stringify(artifacts.encoder)};`,
  `import { startPublicationsDemo } from ${JSON.stringify(join(here, "app.mjs"))};`,
  "startPublicationsDemo(publicationsModule, publicationsEncoder);",
  "",
].join("\n");
await writeFile(entryPath, entry, "utf8");

const esbuildPath = join(root, "interaction/node_modules/esbuild/lib/main.js");
const esbuild = await import(pathToFileURL(esbuildPath).href);
const bundlePath = join(output, "demo.bundle.mjs");
const bundled = await esbuild.build({
  entryPoints: [entryPath],
  outfile: bundlePath,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  nodePaths: [join(root, "interaction/node_modules")],
  logLevel: "silent",
  metafile: true,
});
await Promise.all([
  copyFile(join(here, "index.html"), join(output, "index.html")),
  copyFile(join(here, "demo.css"), join(output, "demo.css")),
]);

const sourceFiles = ["app.mjs", "build.mjs", "demo.css", "index.html"].map((name) => `compiled-publications/demo/${name}`);
const sourcePins = {};
for (const relative of sourceFiles) sourcePins[relative] = sha256(await readFile(join(root, relative)));
const bundleBytes = await readFile(bundlePath);
const record = {
  schema: "gobi.compiled-publications-demo-build/v1",
  packagePath: app.packagePath,
  componentId: component.id,
  requirements: component.capabilities,
  manifest: { path: manifestPath, bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
  artifacts: Object.fromEntries(Object.entries(artifacts).map(([key, path]) => [key, {
    path,
    bytes: artifactBytes[key].length,
    sha256: sha256(artifactBytes[key]),
  }])),
  sourcePins,
  bundleInputs: Object.keys(bundled.metafile.inputs).sort(),
  output: { path: bundlePath, bytes: bundleBytes.length, sha256: sha256(bundleBytes) },
};
await writeFile(join(output, "demo-build.json"), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  schema: "gobi.compiled-publications-demo-build-result/v1",
  status: "passed",
  packagePath: app.packagePath,
  componentId: component.id,
  bundle: record.output,
  output,
})}\n`);
