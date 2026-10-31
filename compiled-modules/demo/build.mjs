import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const nodePaths = [join(root, "node_modules"), join(root, "interaction/node_modules")];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expectedPackages = {
  parent: "github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent",
  child: "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild",
};

function uniqueArgument(name, { required = true } = {}) {
  const positions = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (positions.length > 1) throw new Error(`duplicate ${name}`);
  if (positions.length === 0) {
    if (required) throw new Error(`missing ${name}`);
    return null;
  }
  const value = process.argv[positions[0] + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing value for ${name}`);
  return value;
}

const output = resolve(uniqueArgument("--output"));
const manifests = {
  react: {
    parent: resolve(uniqueArgument("--parent-react-manifest")),
    child: resolve(uniqueArgument("--child-react-manifest")),
  },
  dom: {
    parent: resolve(uniqueArgument("--parent-dom-manifest")),
    child: resolve(uniqueArgument("--child-dom-manifest")),
  },
};
const profileSources = {};
const sourcePins = {};
const manifestRecords = {};

async function readModule(backend, role, manifestPath) {
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.schema !== "gobi.build-manifest/v1" || !Array.isArray(manifest.apps) || manifest.apps.length !== 1) {
    throw new Error(`${backend}/${role} manifest must identify exactly one app`);
  }
  const app = manifest.apps[0];
  if (app.backend !== backend || app.packagePath !== expectedPackages[role]) {
    throw new Error(`${backend}/${role} manifest identifies the wrong backend or package`);
  }
  if (typeof app.componentId !== "string" || app.componentId.length === 0 ||
      typeof app.moduleABI !== "string" || app.moduleABI.length === 0) {
    throw new Error(`${backend}/${role} manifest must include componentId and moduleABI`);
  }
  const base = dirname(manifestPath);
  const outputPaths = new Map();
  for (const key of ["appIR", "module", "encoder", "components", "moduleABI"]) {
    const relative = app[key];
    if (typeof relative !== "string" || !relative || relative.startsWith("/")) {
      throw new Error(`${backend}/${role} manifest has an invalid ${key} path`);
    }
    const absolute = resolve(base, relative);
    if (!absolute.startsWith(`${base}${sep}`)) throw new Error(`${backend}/${role} ${key} path escapes its build root`);
    outputPaths.set(key, { relative, absolute });
  }
  const [appIRBytes, descriptorBytes] = await Promise.all([
    readFile(outputPaths.get("appIR").absolute),
    readFile(outputPaths.get("moduleABI").absolute),
  ]);
  const appIR = JSON.parse(appIRBytes.toString("utf8"));
  const descriptor = JSON.parse(descriptorBytes.toString("utf8"));
  const component = appIR.components?.find((candidate) => candidate.id === app.componentId);
  if (!component || component.packagePath !== expectedPackages[role] || appIR.packagePath !== expectedPackages[role]) {
    throw new Error(`${backend}/${role} AppIR component does not match its manifest`);
  }
  if (descriptor.schema !== "gobi.module-abi/v1" || descriptor.componentID !== app.componentId ||
      descriptor.packagePath !== expectedPackages[role]) {
    throw new Error(`${backend}/${role} module ABI descriptor does not match its AppIR`);
  }
  const expectedRoles = role === "parent" ? ["Output", "Receive"] : ["Input", "Publication"];
  const roleNames = descriptor.roles?.map((entry) => entry.name) ?? [];
  for (const name of expectedRoles) if (!roleNames.includes(name)) throw new Error(`${backend}/${role} ABI is missing ${name}`);
  const oppositeRoles = role === "parent" ? ["Input", "Publication"] : ["Output", "Receive"];
  if (oppositeRoles.some((name) => roleNames.includes(name))) throw new Error(`${backend}/${role} ABI has incompatible bridge roles`);
  if (!Array.isArray(descriptor.artifacts) || descriptor.artifacts.length !== 4) {
    throw new Error(`${backend}/${role} ABI must pin exactly four generated artifacts`);
  }
  const artifactBytes = [];
  for (const artifact of descriptor.artifacts) {
    if (typeof artifact.path !== "string" || artifact.path.startsWith("/") ||
        artifact.path.split("/").some((part) => part === "" || part === "." || part === "..")) {
      throw new Error(`${backend}/${role} ABI contains an invalid artifact path`);
    }
    const bytes = await readFile(resolve(base, artifact.path));
    const digest = sha256(bytes);
    if (bytes.length !== artifact.bytes || digest !== artifact.sha256) {
      throw new Error(`${backend}/${role} ABI artifact mismatch: ${artifact.path}`);
    }
    artifactBytes.push({ path: artifact.path, bytes, digest });
  }
  for (const [key, value] of outputPaths) {
    const bytes = await readFile(value.absolute);
    sourcePins[`${backend}/${role}/${value.relative}`] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  const modulePath = outputPaths.get("module").absolute;
  const encoderPath = outputPaths.get("encoder").absolute;
  profileSources[backend] ??= {};
  profileSources[backend][role] = {
    modulePath,
    encoderPath,
    descriptor,
    descriptorBytes,
    appIR,
    componentId: app.componentId,
    artifactBytes,
  };
  manifestRecords[`${backend}/${role}`] = {
    path: manifestPath,
    bytes: manifestBytes.length,
    sha256: sha256(manifestBytes),
    componentId: app.componentId,
    packagePath: app.packagePath,
    moduleABI: descriptor.abiSHA256,
    artifacts: artifactBytes.map(({ path, bytes, digest }) => ({ path, bytes: bytes.length, sha256: digest })),
  };
}

for (const backend of ["react", "dom"]) {
  for (const role of ["parent", "child"]) await readModule(backend, role, manifests[backend][role]);
}

await mkdir(output, { recursive: true });
const entryPath = join(output, "demo-entry.mjs");
const lines = [];
for (const backend of ["react", "dom"]) {
  for (const role of ["parent", "child"]) {
    const name = `${backend}${role[0].toUpperCase()}${role.slice(1)}`;
    const item = profileSources[backend][role];
    lines.push(`import { gobiCompiled as ${name}Module, gobiModuleBridges as ${name}Bridges } from ${JSON.stringify(item.modulePath)};`);
    lines.push(`import * as ${name}EncoderModule from ${JSON.stringify(item.encoderPath)};`);
    lines.push(`const ${name}Encoder = Object.freeze({ gobiEncodeState: ${name}EncoderModule.gobiEncodeState });`);
    lines.push(`const ${name}Descriptor = ${JSON.stringify(item.descriptor)};`);
    lines.push(`const ${name}DescriptorBytes = Uint8Array.from(atob(${JSON.stringify(item.descriptorBytes.toString("base64"))}), (character) => character.charCodeAt(0));`);
    lines.push(`const ${name}ArtifactBytes = new Map(${JSON.stringify(item.artifactBytes.map(({ path, bytes }) => [path, bytes.toString("base64")]))}.map(([path, encoded]) => [path, Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))]));`);
  }
}
lines.push(`import { startCompiledModulesDemo } from ${JSON.stringify(join(here, "app.mjs"))};`);
lines.push("const side = (module, bridges, encoder, descriptor, descriptorBytes, artifactBytes, componentId) => ({ module, bridges, encoder, descriptor, descriptorBytes, artifactBytes, componentId });");
lines.push("const profiles = {");
for (const backend of ["react", "dom"]) {
  const parent = `${backend}Parent`;
  const child = `${backend}Child`;
  lines.push(`  ${backend}: { parent: side(${parent}Module, ${parent}Bridges, ${parent}Encoder, ${parent}Descriptor, ${parent}DescriptorBytes, ${parent}ArtifactBytes, ${JSON.stringify(profileSources[backend].parent.componentId)}), child: side(${child}Module, ${child}Bridges, ${child}Encoder, ${child}Descriptor, ${child}DescriptorBytes, ${child}ArtifactBytes, ${JSON.stringify(profileSources[backend].child.componentId)}) },`);
}
lines.push("};");
lines.push("startCompiledModulesDemo({ profiles });");
lines.push("");
await writeFile(entryPath, lines.join("\n"), { flag: "wx" });

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
  nodePaths,
  logLevel: "silent",
  metafile: true,
});
await copyFile(join(here, "index.html"), join(output, "index.html"));
const cssPath = join(here, "demo.css");
try { await copyFile(cssPath, join(output, "demo.css")); } catch (error) { if (error?.code !== "ENOENT") throw error; }

const sourceFiles = ["app.mjs", "index.html", "build.mjs"];
for (const name of sourceFiles) {
  const bytes = await readFile(join(here, name));
  sourcePins[`compiled-modules/demo/${name}`] = { bytes: bytes.length, sha256: sha256(bytes) };
}
const bundleBytes = await readFile(bundlePath);
const result = {
  schema: "gobi.compiled-modules-demo-build/v1",
  status: "passed",
  profiles: Object.fromEntries(Object.entries(manifestRecords)),
  sourcePins,
  bundleInputs: Object.keys(bundled.metafile.inputs).sort(),
  output: { path: bundlePath, bytes: bundleBytes.length, sha256: sha256(bundleBytes) },
  site: output,
};
await writeFile(join(output, "demo-build.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(result)}\n`);
