import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const nodePaths = [join(root, "node_modules"), join(root, "interaction/node_modules")];

function argument(name) {
  const matches = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (matches.length !== 1) throw new Error(`${matches.length ? "duplicate" : "missing"} ${name}`);
  const value = process.argv[matches[0] + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing value for ${name}`);
  return value;
}

function exactBuildIndex(index) {
  if (index?.schema !== "gobi.module-effects-build-index/v1" || !index.builds?.react || !index.builds?.dom) {
    throw new Error("build index must contain independently compiled React and DOM module effects profiles");
  }
  for (const backend of ["react", "dom"]) {
    for (const role of ["parent", "child"]) {
      const build = index.builds[backend][role];
      if (!build || build.backend !== backend || build.role !== role || !build.manifestPath || !build.artifacts?.moduleABI?.sha256) {
        throw new Error(`build index is missing ${backend}/${role} artifact pins`);
      }
    }
  }
}

const buildIndexPath = resolve(argument("--build-index"));
const output = resolve(argument("--output"));
const indexBytes = await readFile(buildIndexPath);
const index = JSON.parse(indexBytes.toString("utf8"));
exactBuildIndex(index);

const loader = await import(pathToFileURL(join(root, "compiled-module-effects/build/module-loader.mjs")).href);
if (typeof loader.loadModuleEffectsBuilds !== "function" || typeof loader.browserSideImports !== "function" ||
    typeof loader.browserModuleSideSource !== "function") {
  throw new Error("module-effects build loader is missing its browser bundle exports");
}
const loaded = await loader.loadModuleEffectsBuilds(buildIndexPath);
if (loaded.schema !== "gobi.module-effects-build-index/v1" || !loaded.profiles?.react || !loaded.profiles?.dom) {
  throw new Error("module-effects build loader returned an incomplete React/DOM profile set");
}
if (!Array.isArray(loaded.closedEffectDescriptors) || loaded.closedEffectDescriptors.length !== 2) {
  throw new Error("module-effects build loader omitted the closed request/cancel descriptors");
}

const sourceFiles = [
  "compiled-module-effects/demo/app.mjs",
  "compiled-module-effects/demo/index.html",
  "compiled-module-effects/demo/build.mjs",
];
const sourcePins = {};
for (const path of sourceFiles) {
  const bytes = await readFile(join(root, path));
  sourcePins[path] = { bytes: bytes.length, sha256: sha256(bytes) };
}

const prefixes = new Map();
const imports = [];
for (const backend of ["react", "dom"]) {
  for (const role of ["parent", "child"]) {
    const profileBuild = loaded.builds[backend];
    const compiledSide = profileBuild.pair[role];
    const side = {
      ...loaded.profiles[backend][role],
      modulePath: compiledSide.modulePath,
      encoderPath: compiledSide.encoderPath,
    };
    const prefix = `${backend}${role[0].toUpperCase()}${role.slice(1)}`;
    const helperPath = role === "parent" ? profileBuild.helperPath : null;
    const helperExport = profileBuild.helperExportName ?? "gobiKeyedModuleHelpers";
    if (role === "parent" && (!side.keyed || !side.keyedSidecar || !helperPath)) {
      throw new Error(`${backend} parent profile is missing the pinned PR22 keyed helper`);
    }
    imports.push(loader.browserSideImports(prefix, side, role === "parent" ? helperPath : null, helperExport));
    prefixes.set(`${backend}/${role}`, { prefix, side, helperExport });
  }
}

const lines = [
  ...imports,
  "const decodeBytes = (encoded) => Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));",
  `import { startModuleEffectsDemo } from ${JSON.stringify(join(here, "app.mjs"))};`,
  "const profiles = {",
];
for (const backend of ["react", "dom"]) {
  const parent = prefixes.get(`${backend}/parent`);
  const child = prefixes.get(`${backend}/child`);
  const parentHelper = `${parent.prefix}Keyed`;
  lines.push(`  ${backend}: { parent: ${loader.browserModuleSideSource(parent.prefix, parent.side, parentHelper)}, child: ${loader.browserModuleSideSource(child.prefix, child.side)} },`);
}
lines.push("};", "startModuleEffectsDemo({ profiles });", "");

await mkdir(output, { recursive: true });
const entryPath = join(output, "demo-entry.mjs");
await writeFile(entryPath, lines.join("\n"), { flag: "wx" });
const esbuild = await import(pathToFileURL(join(root, "interaction/node_modules/esbuild/lib/main.js")).href);
const bundlePath = join(output, "demo.bundle.mjs");
const bundle = await esbuild.build({
  entryPoints: [entryPath], outfile: bundlePath, bundle: true, format: "esm", platform: "browser",
  target: "es2022", nodePaths, logLevel: "silent", metafile: true,
});
const html = await readFile(join(here, "index.html"));
const siteHTMLPath = join(output, "index.html");
await writeFile(siteHTMLPath, html, { flag: "wx" });
const bundleBytes = await readFile(bundlePath);
const result = {
  schema: "gobi.module-effects-demo-build/v1", status: "passed",
  buildIndex: { path: buildIndexPath, bytes: indexBytes.length, sha256: sha256(indexBytes) },
  profiles: Object.fromEntries(["react", "dom"].map((backend) => [backend, {
    parent: { packagePath: loaded.profiles[backend].parent.packagePath, componentId: loaded.profiles[backend].parent.componentId,
      abiSHA256: loaded.profiles[backend].parent.descriptor.abiSHA256 },
    child: { packagePath: loaded.profiles[backend].child.packagePath, componentId: loaded.profiles[backend].child.componentId,
      abiSHA256: loaded.profiles[backend].child.descriptor.abiSHA256 },
  }])),
  sourcePins,
  bundleInputs: Object.keys(bundle.metafile.inputs).sort(),
  output: { path: bundlePath, bytes: bundleBytes.length, sha256: sha256(bundleBytes) },
  html: { path: siteHTMLPath, bytes: html.length, sha256: sha256(html) },
  site: output,
};
await writeFile(join(output, "demo-build.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(result)}\n`);
