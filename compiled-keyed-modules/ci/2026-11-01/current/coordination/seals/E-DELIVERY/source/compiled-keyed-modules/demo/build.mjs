import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const nodePaths = [join(root, "node_modules"), join(root, "interaction/node_modules")];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expectedPackages = {
  parent: "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent",
  child: "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild",
};

function argument(name) {
  const matches = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (matches.length !== 1) throw new Error(`${matches.length ? "duplicate" : "missing"} ${name}`);
  const value = process.argv[matches[0] + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing value for ${name}`);
  return value;
}

function relativeFile(base, value, label) {
  if (typeof value !== "string" || !value || isAbsolute(value) || value.includes("\\") ||
      value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${label} must be a normalized relative path`);
  }
  const path = resolve(base, value);
  if (!path.startsWith(`${base}${sep}`)) throw new Error(`${label} escapes its root`);
  return path;
}

async function verifyPin(base, record, label) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${label} pin is malformed`);
  const path = relativeFile(base, record.path, `${label} path`);
  const bytes = await readFile(path);
  const digest = sha256(bytes);
  if (bytes.length !== record.bytes || digest !== record.sha256) throw new Error(`${label} digest does not match the build index`);
  return { path, bytes, digest };
}

const buildRoot = resolve(argument("--build-root"));
const output = resolve(argument("--output"));
const indexPath = join(buildRoot, "build-index.json");
const indexBytes = await readFile(indexPath);
const index = JSON.parse(indexBytes.toString("utf8"));
if (index.schema !== "gobi.keyed-module-build-index/v1" || !index.builds) {
  throw new Error("keyed module build index has the wrong schema or no build matrix");
}

const sourcePins = {
  "compiled-keyed-modules/demo/app.mjs": null,
  "compiled-keyed-modules/demo/index.html": null,
  "compiled-keyed-modules/demo/build.mjs": null,
};
for (const source of Object.keys(sourcePins)) {
  const bytes = await readFile(join(root, source));
  sourcePins[source] = { bytes: bytes.length, sha256: sha256(bytes) };
}

const profiles = {};
const records = {};
const moduleNames = {};
for (const backend of ["react", "dom"]) {
  const buildProfile = index.builds[backend];
  if (!buildProfile || Object.keys(buildProfile).sort().join(",") !== "child,parent") {
    throw new Error(`build index must contain exactly parent and child under ${backend}`);
  }
  profiles[backend] = {};
  for (const role of ["parent", "child"]) {
    const build = buildProfile[role];
    if (build.packagePath !== expectedPackages[role]) throw new Error(`${backend}/${role} build has the wrong package path`);
    const outputDir = relativeFile(buildRoot, build.outputDir, `${backend}/${role} outputDir`);
    const manifestRecord = await verifyPin(buildRoot, { path: build.manifestPath, ...build.manifest }, `${backend}/${role} manifest`);
    const manifest = JSON.parse(manifestRecord.bytes.toString("utf8"));
    if (manifest.schema !== "gobi.build-manifest/v1" || manifest.apps?.length !== 1) {
      throw new Error(`${backend}/${role} manifest must contain exactly one app`);
    }
    const app = manifest.apps[0];
    if (app.backend !== backend || app.packagePath !== expectedPackages[role] || app.componentId !== build.componentId) {
      throw new Error(`${backend}/${role} manifest does not match its build index`);
    }
    if (build.outputCount !== build.outputs?.length || !Number.isSafeInteger(build.outputCount)) {
      throw new Error(`${backend}/${role} output inventory count is inconsistent`);
    }
    const resultPath = relativeFile(buildRoot, build.resultPath, `${backend}/${role} resultPath`);
    const resultBytes = await readFile(resultPath);
    const buildResult = JSON.parse(resultBytes.toString("utf8"));
    if (buildResult.schema !== "gobi.build-result/v1" || buildResult.ok !== true ||
        buildResult.apps?.length !== 1 || buildResult.apps[0].packagePath !== expectedPackages[role] ||
        buildResult.outputs?.length !== build.outputCount || JSON.stringify(buildResult.outputs) !== JSON.stringify(build.outputs)) {
      throw new Error(`${backend}/${role} BuildResult does not describe its independent app`);
    }
    for (const outputPin of build.outputs) {
      const file = await verifyPin(outputDir, outputPin, `${backend}/${role} output`);
      if (!file.path.startsWith(`${outputDir}${sep}`)) throw new Error(`${backend}/${role} output escapes its output directory`);
    }

    const artifacts = {};
    for (const key of ["appIR", "module", "encoder", "components", "moduleABI"]) {
      artifacts[key] = await verifyPin(buildRoot, build.artifacts?.[key], `${backend}/${role}/${key}`);
      if (!artifacts[key].path.startsWith(`${outputDir}${sep}`)) throw new Error(`${backend}/${role}/${key} escapes its output directory`);
    }
    if (artifacts.moduleABI.bytes.length === 0) throw new Error(`${backend}/${role} ABI descriptor is empty`);
    const descriptor = JSON.parse(artifacts.moduleABI.bytes.toString("utf8"));
    const descriptorRoles = descriptor.roles?.map((entry) => entry.name) ?? [];
    const expectedRoles = role === "parent" ? ["Output", "Receive"] : ["Input", "Publication"];
    if (descriptor.schema !== "gobi.module-abi/v1" || descriptor.componentID !== build.componentId ||
        descriptor.packagePath !== expectedPackages[role] || expectedRoles.some((name) => !descriptorRoles.includes(name)) ||
        descriptor.artifacts?.length !== 4) {
      throw new Error(`${backend}/${role} ABI descriptor does not match its build index or module role`);
    }
    for (const artifact of descriptor.artifacts) {
      const file = await verifyPin(outputDir, artifact, `${backend}/${role} ABI artifact ${artifact.path}`);
      if (!file.path.startsWith(`${outputDir}${sep}`)) throw new Error(`${backend}/${role} ABI artifact escapes its output directory`);
    }

    let keyedHelper = null;
    if (role === "parent") {
      const helper = build.keyedHelper;
      if (!helper || helper.exportName !== "gobiKeyedModuleHelpers" ||
          JSON.stringify(helper.members) !== JSON.stringify(["children", "receiveKeyed", "isCurrent"])) {
        throw new Error(`${backend}/parent build is missing the keyed helper export contract`);
      }
      keyedHelper = await verifyPin(buildRoot, helper, `${backend}/parent keyed helper`);
      const helperDescriptor = await verifyPin(buildRoot, {
        path: helper.descriptorPath,
        bytes: helper.descriptorBytes,
        sha256: helper.descriptorSha256,
      }, `${backend}/parent keyed helper descriptor`);
      const helperDescriptorJSON = JSON.parse(helperDescriptor.bytes.toString("utf8"));
      if (helperDescriptorJSON.schema !== "gobi.keyed-module-helpers/v1" || helperDescriptorJSON.backend !== backend ||
          helperDescriptorJSON.packagePath !== expectedPackages.parent || helperDescriptorJSON.componentId !== build.componentId ||
          helperDescriptorJSON.moduleABI?.abiSHA256 !== descriptor.abiSHA256 ||
          helperDescriptorJSON.appIR?.sha256 !== artifacts.appIR.digest ||
          helperDescriptorJSON.helperArtifact?.sha256 !== keyedHelper.digest ||
          helperDescriptorJSON.exportName !== helper.exportName ||
          JSON.stringify(helperDescriptorJSON.members) !== JSON.stringify(helper.members)) {
        throw new Error(`${backend}/parent keyed helper descriptor does not match its AppIR, ABI, export, or artifact`);
      }
      keyedHelper.descriptor = helperDescriptorJSON;
      keyedHelper.descriptorRecord = {
        path: helper.descriptorPath,
        bytes: helperDescriptor.bytes.length,
        sha256: sha256(helperDescriptor.bytes),
      };
    }

    const component = JSON.parse((await readFile(artifacts.appIR.path)).toString("utf8"))
      .components?.find((candidate) => candidate.id === build.componentId);
    if (!component || component.packagePath !== expectedPackages[role]) throw new Error(`${backend}/${role} AppIR does not contain its manifest component`);

    const name = `${backend}${role[0].toUpperCase()}${role.slice(1)}`;
    moduleNames[`${backend}/${role}`] = name;
    const modulePath = artifacts.module.path;
    const encoderPath = artifacts.encoder.path;
    const moduleURL = modulePath;
    const encoderURL = encoderPath;
    const helperURL = keyedHelper ? keyedHelper.path : null;
    const artifactBytes = descriptor.artifacts.map((artifact) => {
      const bytes = requireArtifactBytes(outputDir, artifact.path);
      return [artifact.path, bytes.toString("base64")];
    });
    profiles[backend][role] = {
      name,
      moduleURL,
      encoderURL,
      helperURL,
      descriptor,
      descriptorBytes: artifacts.moduleABI.bytes,
      artifactBytes,
      packagePath: expectedPackages[role],
      componentId: build.componentId,
      keyedSidecar: keyedHelper ? {
        bytes: keyedHelper.bytes,
        byteLength: keyedHelper.bytes.length,
        sha256: keyedHelper.digest,
        backend,
        packagePath: expectedPackages.parent,
        componentId: build.componentId,
        moduleABI: descriptor.abiSHA256,
        appIR: artifacts.appIR.digest,
      } : null,
      manifest: { path: build.manifestPath, bytes: manifestRecord.bytes.length, sha256: manifestRecord.digest },
      result: { path: build.resultPath, bytes: resultBytes.length, sha256: sha256(resultBytes) },
      outputDir: build.outputDir,
      artifacts: Object.fromEntries(Object.entries(artifacts).map(([key, value]) => [key, {
        path: relative(buildRoot, value.path).split(sep).join("/"), bytes: value.bytes.length, sha256: value.digest,
      }])),
      keyedHelper: keyedHelper ? {
        path: relative(buildRoot, keyedHelper.path).split(sep).join("/"),
        bytes: keyedHelper.bytes.length,
        sha256: keyedHelper.digest,
        descriptorPath: keyedHelper.descriptorRecord.path,
        descriptorBytes: keyedHelper.descriptorRecord.bytes,
        descriptorSha256: keyedHelper.descriptorRecord.sha256,
      } : null,
    };
    records[`${backend}/${role}`] = {
      packagePath: expectedPackages[role],
      componentId: build.componentId,
      manifest: profiles[backend][role].manifest,
      result: profiles[backend][role].result,
      outputDir: build.outputDir,
      outputCount: build.outputCount,
      artifacts: profiles[backend][role].artifacts,
      keyedHelper: profiles[backend][role].keyedHelper,
      abiSHA256: descriptor.abiSHA256,
      artifactSHA256: descriptor.artifactSHA256,
    };
  }
}

function requireArtifactBytes(base, artifactPath) {
  const fullPath = relativeFile(base, artifactPath, "ABI artifact path");
  return readFileSync(fullPath);
}

// Artifact reads above are synchronous by design after the path was checked;
// importing the generated modules and bundle inputs does not mutate build output.
import { readFileSync } from "node:fs";

await mkdir(output, { recursive: true });
const entryPath = join(output, "demo-entry.mjs");
const lines = [];
for (const backend of ["react", "dom"]) {
  for (const role of ["parent", "child"]) {
    const item = profiles[backend][role];
    const name = item.name;
    lines.push(`import { gobiCompiled as ${name}Module, gobiModuleBridges as ${name}Bridges } from ${JSON.stringify(item.moduleURL)};`);
    lines.push(`import * as ${name}EncoderModule from ${JSON.stringify(item.encoderURL)};`);
    if (item.helperURL) lines.push(`import { gobiKeyedModuleHelpers as ${name}Keyed } from ${JSON.stringify(item.helperURL)};`);
    lines.push(`const ${name}Encoder = Object.freeze({ gobiEncodeState: ${name}EncoderModule.gobiEncodeState });`);
    lines.push(`const ${name}Descriptor = ${JSON.stringify(item.descriptor)};`);
    lines.push(`const ${name}DescriptorBytes = Uint8Array.from(atob(${JSON.stringify(item.descriptorBytes.toString("base64"))}), (character) => character.charCodeAt(0));`);
    lines.push(`const ${name}ArtifactBytes = new Map(${JSON.stringify(item.artifactBytes)}.map(([path, encoded]) => [path, Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))]));`);
    if (item.keyedSidecar) {
      lines.push(`const ${name}KeyedSidecar = { ...${JSON.stringify({ ...item.keyedSidecar, bytes: undefined })}, bytes: Uint8Array.from(atob(${JSON.stringify(item.keyedSidecar.bytes.toString("base64"))}), (character) => character.charCodeAt(0)) };`);
    }
  }
}
lines.push(`import { startKeyedModulesDemo } from ${JSON.stringify(join(here, "app.mjs"))};`);
lines.push("const side = (module, bridges, encoder, descriptor, descriptorBytes, artifactBytes, packagePath, componentId, backend, keyed = null, keyedSidecar = null) => ({ module, bridges, encoder, descriptor, descriptorBytes, artifactBytes, packagePath, componentId, backend, ...(keyed ? { keyed, keyedSidecar } : {}) });");
lines.push("const profiles = {");
for (const backend of ["react", "dom"]) {
  const parent = moduleNames[`${backend}/parent`];
  const child = moduleNames[`${backend}/child`];
  lines.push(`  ${backend}: { parent: side(${parent}Module, ${parent}Bridges, ${parent}Encoder, ${parent}Descriptor, ${parent}DescriptorBytes, ${parent}ArtifactBytes, ${JSON.stringify(profiles[backend].parent.packagePath)}, ${JSON.stringify(profiles[backend].parent.componentId)}, ${JSON.stringify(backend)}, ${parent}Keyed, ${parent}KeyedSidecar), child: side(${child}Module, ${child}Bridges, ${child}Encoder, ${child}Descriptor, ${child}DescriptorBytes, ${child}ArtifactBytes, ${JSON.stringify(profiles[backend].child.packagePath)}, ${JSON.stringify(profiles[backend].child.componentId)}, ${JSON.stringify(backend)}) },`);
}
lines.push("};");
lines.push("startKeyedModulesDemo({ profiles });");
lines.push("");
await writeFile(entryPath, lines.join("\n"), { flag: "wx" });

const esbuild = await import(pathToFileURL(join(root, "interaction/node_modules/esbuild/lib/main.js")).href);
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
const bundleBytes = await readFile(bundlePath);
const result = {
  schema: "gobi.keyed-modules-demo-build/v1",
  status: "passed",
  buildIndex: { path: indexPath, bytes: indexBytes.length, sha256: sha256(indexBytes) },
  profiles: records,
  sourcePins,
  bundleInputs: Object.keys(bundled.metafile.inputs).sort(),
  output: { path: bundlePath, bytes: bundleBytes.length, sha256: sha256(bundleBytes) },
  site: output,
};
await writeFile(join(output, "demo-build.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(result)}\n`);
