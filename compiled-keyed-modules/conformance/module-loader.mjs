import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadCompiledModuleBuild } from "../../compiled-modules/conformance/module-loader.mjs";

const INDEX_SCHEMA = "gobi.keyed-module-build-index/v1";
const PARENT_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent";
const CHILD_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild";
const HELPER_DESCRIPTOR_SCHEMA = "gobi.keyed-module-helpers/v1";
const HELPER_MEMBERS = Object.freeze(["children", "receiveKeyed", "isCurrent"]);
const WIRE_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/modulewire";
const KEYED_WIRE_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmodulewire";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateKeyedHelperDescriptor(descriptor, expected) {
  if (descriptor?.schema !== HELPER_DESCRIPTOR_SCHEMA) throw new TypeError("keyed helper descriptor schema is invalid");
  for (const key of ["backend", "packagePath", "componentId", "exportName"]) {
    if (descriptor[key] !== expected[key]) throw new TypeError(`keyed helper descriptor ${key} source identity mismatch`);
  }
  if (!same(descriptor.members, expected.members) || !same(descriptor.members, HELPER_MEMBERS)) {
    throw new TypeError("keyed helper descriptor members do not match the frozen helper API");
  }
  for (const section of ["appIR", "moduleABI", "helperArtifact"]) {
    if (!same(descriptor[section], expected[section])) throw new TypeError(`keyed helper descriptor ${section} pin mismatch`);
  }
  if (!same(descriptor.sourceIdentity, expected.sourceIdentity)) throw new TypeError("keyed helper source identity pins mismatch");
  if (!Array.isArray(descriptor.symbols) || descriptor.symbols.length !== expected.symbols.length) {
    throw new TypeError("keyed helper descriptor symbol inventory mismatch");
  }
  for (let index = 0; index < expected.symbols.length; index += 1) {
    if (!same(descriptor.symbols[index], expected.symbols[index])) {
      throw new TypeError(`keyed helper descriptor symbol ${index} source mismatch`);
    }
  }
  if (descriptor.childProjection !== "children(state) copies the GoScript slice window into a frozen native array of {key,generation} rows") {
    throw new TypeError("keyed helper descriptor child projection claim is missing or changed");
  }
  if (!same(descriptor.stateSemantics, expected.stateSemantics)) throw new TypeError("keyed helper state semantics/scope claim mismatch");
  return true;
}

async function verifySourceIdentity(sourceIdentity, expected, indexRoot) {
  if (!same(sourceIdentity, expected)) throw new TypeError("keyed helper source identity differs from the build index");
  const fixture = sourceIdentity?.fixtureSource;
  if (!fixture || typeof fixture.path !== "string" || !Number.isSafeInteger(fixture.bytes) ||
      typeof fixture.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(fixture.sha256)) {
    throw new TypeError("keyed helper fixture source pin is malformed");
  }
  const fixtureBytes = await readFile(resolve(ROOT, fixture.path));
  if (fixtureBytes.byteLength !== fixture.bytes || sha256(fixtureBytes) !== fixture.sha256) {
    throw new TypeError("keyed helper fixture source does not match its source identity pin");
  }
  if (!Array.isArray(sourceIdentity.emittedGoScriptSources) || sourceIdentity.emittedGoScriptSources.length !== 2) {
    throw new TypeError("keyed helper emitted GoScript source inventory is malformed");
  }
  for (const source of sourceIdentity.emittedGoScriptSources) {
    if (typeof source.path !== "string" || !Number.isSafeInteger(source.bytes) || typeof source.sha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(source.sha256)) throw new TypeError("keyed helper emitted GoScript source pin is malformed");
    const sourceBytes = await readFile(resolve(indexRoot, source.path));
    if (sourceBytes.byteLength !== source.bytes || sha256(sourceBytes) !== source.sha256) {
      throw new TypeError(`keyed helper emitted GoScript source does not match its pin: ${source.path}`);
    }
  }
}

function moduleInput(side) {
  return {
    module: { schema: side.compiled.schema, appIR: side.compiled.appIR, symbols: side.compiled.symbols },
    bridges: side.bridges,
    encoder: side.encoder,
    descriptor: side.descriptor,
    descriptorBytes: side.descriptorBytes,
    artifactBytes: side.artifactBytes,
    componentId: side.componentId,
    packagePath: side.packagePath,
    backend: side.backend,
  };
}

export async function loadKeyedModuleBuilds(buildIndexPath) {
  const indexFile = resolve(buildIndexPath);
  const indexBytes = await readFile(indexFile);
  const index = JSON.parse(indexBytes.toString("utf8"));
  if (index.schema !== INDEX_SCHEMA || !index.builds || typeof index.builds !== "object") {
    throw new TypeError(`build index must use ${INDEX_SCHEMA}`);
  }
  const indexRoot = dirname(indexFile);
  const result = { schema: index.schema, indexPath: indexFile, indexSHA256: sha256(indexBytes), builds: {} };
  for (const backend of ["react", "dom"]) {
    const record = index.builds[backend];
    if (!record?.parent?.manifestPath || !record?.child?.manifestPath || !record?.parent?.keyedHelper?.path) {
      throw new TypeError(`${backend} build-index entry is missing the parent, child or keyed helper artifact`);
    }
    const [parentCompiled, childCompiled] = await Promise.all([
      loadCompiledModuleBuild({ manifestPath: resolve(indexRoot, record.parent.manifestPath), packagePath: PARENT_PACKAGE }),
      loadCompiledModuleBuild({ manifestPath: resolve(indexRoot, record.child.manifestPath), packagePath: CHILD_PACKAGE }),
    ]);
    const helperPath = resolve(indexRoot, record.parent.keyedHelper.path);
    const helperBytes = await readFile(helperPath);
    const parentAppIRBytes = await readFile(parentCompiled.appIRPath);
    const parentModuleABIBytes = await readFile(parentCompiled.descriptorPath);
    const helperPin = record.parent.keyedHelper;
    if (sha256(helperBytes) !== helperPin.sha256 || helperBytes.byteLength !== helperPin.bytes) {
      throw new TypeError(`${backend} keyed helper bytes do not match the build index pin`);
    }
    const helperDescriptorPath = resolve(indexRoot, helperPin.descriptorPath);
    const helperDescriptorBytes = await readFile(helperDescriptorPath);
    if (helperDescriptorBytes.byteLength !== helperPin.descriptorBytes || sha256(helperDescriptorBytes) !== helperPin.descriptorSha256) {
      throw new TypeError(`${backend} keyed helper descriptor bytes do not match the build index pin`);
    }
    const helperDescriptor = JSON.parse(helperDescriptorBytes.toString("utf8"));
    const appIRArtifact = parentCompiled.descriptor.artifacts.find((artifact) => artifact.path.endsWith("/app-ir.json"));
    const appIRPin = record.parent.artifacts.appIR;
    const moduleABIPin = {
      path: record.parent.artifacts.moduleABI.path,
      bytes: parentModuleABIBytes.byteLength,
      sha256: sha256(parentModuleABIBytes),
      abiSHA256: parentCompiled.descriptor.abiSHA256,
    };
    if (appIRPin.bytes !== parentAppIRBytes.byteLength || appIRPin.sha256 !== sha256(parentAppIRBytes) ||
        record.parent.artifacts.moduleABI.bytes !== parentModuleABIBytes.byteLength ||
        record.parent.artifacts.moduleABI.sha256 !== sha256(parentModuleABIBytes)) {
      throw new TypeError(`${backend} build-index parent artifact pins disagree with loaded bytes`);
    }
    const parentStateType = parentCompiled.compiled.appIR.components[0]?.stateType;
    if (typeof parentStateType !== "string") throw new TypeError(`${backend} parent AppIR state type is missing`);
    const expectedSymbols = [
      { name: "Children", symbol: `${PARENT_PACKAGE}.Children`, signature: { params: [parentStateType], results: [`[]${KEYED_WIRE_PACKAGE}.ChildRef`] } },
      { name: "ReceiveKeyed", symbol: `${PARENT_PACKAGE}.ReceiveKeyed`, signature: {
        params: [parentStateType, "string", "int", `${WIRE_PACKAGE}.Publication`], results: [parentStateType],
      } },
      { name: "IsCurrent", symbol: `${PARENT_PACKAGE}.IsCurrent`, signature: {
        params: [parentStateType, "string", "int"], results: ["bool"],
      } },
    ];
    const appChildren = parentCompiled.compiled.appIR.symbols.find((item) => item.id === expectedSymbols[0].symbol);
    if (!appChildren || !same(appChildren.signature, expectedSymbols[0].signature)) {
      throw new TypeError(`${backend} reachable Children signature differs from the helper contract`);
    }
    const sourceIdentity = helperPin.sourceIdentity;
    const stateSemantics = helperDescriptor.stateSemantics;
    const expectedStateSemantics = {
      helperFunctions: ["Children", "ReceiveKeyed", "IsCurrent"],
      pureStateHelpers: true,
      usesSharedGlobalState: false,
      receiveKeyedClonesPrimaryGoScriptState: true,
      analyzerReachability: "Children is reachable through View; ReceiveKeyed and IsCurrent are exported GoScript functions but are not AppIR-reachability-admitted by the unchanged shared analyzer",
    };
    await verifySourceIdentity(helperDescriptor.sourceIdentity, sourceIdentity, indexRoot);
    if (!same(stateSemantics, expectedStateSemantics)) throw new TypeError(`${backend} helper descriptor reachability scope is not explicit`);
    const helperArtifactPin = { path: helperPin.path, bytes: helperBytes.byteLength, sha256: sha256(helperBytes) };
    validateKeyedHelperDescriptor(helperDescriptor, {
      schema: HELPER_DESCRIPTOR_SCHEMA,
      backend,
      packagePath: PARENT_PACKAGE,
      componentId: parentCompiled.componentId,
      appIR: appIRPin,
      moduleABI: moduleABIPin,
      helperArtifact: helperArtifactPin,
      exportName: helperPin.exportName,
      members: HELPER_MEMBERS,
      symbols: expectedSymbols,
      sourceIdentity,
      stateSemantics: expectedStateSemantics,
    });
    if (!appIRArtifact || helperDescriptor.appIR.sha256 !== sha256(parentAppIRBytes) ||
        helperDescriptor.moduleABI.abiSHA256 !== parentCompiled.descriptor.abiSHA256) {
      throw new TypeError(`${backend} helper descriptor is not bound to its compiled parent AppIR and module ABI`);
    }
    const helperModule = await import(pathToFileURL(helperPath).href);
    const helpers = helperModule[helperPin.exportName];
    if (!helpers || HELPER_MEMBERS.some((member) => typeof helpers[member] !== "function")) {
      throw new TypeError(`${backend} keyed helper module does not export the frozen helper API`);
    }
    const keyedSidecar = {
      bytes: new Uint8Array(helperBytes),
      byteLength: helperBytes.byteLength,
      sha256: sha256(helperBytes),
      backend,
      packagePath: PARENT_PACKAGE,
      componentId: parentCompiled.componentId,
      moduleABI: parentCompiled.descriptor.abiSHA256,
      appIR: sha256(parentAppIRBytes),
    };
    result.builds[backend] = {
      backend,
      parent: { ...moduleInput(parentCompiled), keyed: helpers, keyedSidecar },
      child: moduleInput(childCompiled),
      helperPath,
      helperBytes: new Uint8Array(helperBytes),
      helperExportName: helperPin.exportName,
      pair: { parent: parentCompiled, child: childCompiled },
      pins: {
        parentABI: parentCompiled.descriptor.abiSHA256,
        childABI: childCompiled.descriptor.abiSHA256,
        helperSHA256: keyedSidecar.sha256,
        parentAppIRSHA256: keyedSidecar.appIR,
        helperDescriptorSHA256: helperPin.descriptorSha256,
      },
    };
  }
  return result;
}

export function browserModuleSideSource(prefix, side, helperImportName = null) {
  const artifactEntries = [...side.artifactBytes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, bytes]) => `[${JSON.stringify(path)},decodeBytes(${JSON.stringify(Buffer.from(bytes).toString("base64"))})]`)
    .join(",");
  const keyed = helperImportName
    ? `keyed: ${helperImportName}, keyedSidecar: { ...${JSON.stringify({
      byteLength: side.keyedSidecar.byteLength,
      sha256: side.keyedSidecar.sha256,
      backend: side.keyedSidecar.backend,
      packagePath: side.keyedSidecar.packagePath,
      componentId: side.keyedSidecar.componentId,
      moduleABI: side.keyedSidecar.moduleABI,
      appIR: side.keyedSidecar.appIR,
    })}, bytes: decodeBytes(${JSON.stringify(Buffer.from(side.keyedSidecar.bytes).toString("base64"))}) }`
    : "";
  return `{
    module: { schema: ${prefix}Compiled.schema, appIR: ${prefix}Compiled.appIR, symbols: ${prefix}Compiled.symbols },
    bridges: ${prefix}Bridges,
    encoder: { gobiEncodeState: ${prefix}Encoder.gobiEncodeState },
    descriptor: ${JSON.stringify(side.descriptor)},
    descriptorBytes: decodeBytes(${JSON.stringify(Buffer.from(side.descriptorBytes).toString("base64"))}),
    artifactBytes: new Map([${artifactEntries}]),
    componentId: ${JSON.stringify(side.componentId)},
    ${keyed}
  }`;
}

export function browserSideImports(prefix, side, helperPath = null, helperExportName = "gobiKeyedModuleHelpers") {
  const lines = [
    `import { gobiCompiled as ${prefix}Compiled, gobiModuleBridges as ${prefix}Bridges } from ${JSON.stringify(side.modulePath)};`,
    `import * as ${prefix}Encoder from ${JSON.stringify(side.encoderPath)};`,
  ];
  if (helperPath) lines.push(`import { ${helperExportName} as ${prefix}Keyed } from ${JSON.stringify(helperPath)};`);
  return lines.join("\n");
}
