import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadCompiledModuleBuild } from "../../compiled-modules/conformance/module-loader.mjs";
import {
  closedEffectDescriptors,
  pr22ParentPins,
  validateModuleEffectsPair,
} from "./abi-admission.mjs";
import {
  normalizeGeneratedArtifactText,
  verifyGeneratedArtifactNormalization,
} from "./source-comments.mjs";

const INDEX_SCHEMA = "gobi.module-effects-build-index/v1";
const MOUNT_BOUNDARY_SCHEMA = "gobi.module-effects-mount-boundaries/v1";
const EXPECTED_MOUNT_BOUNDARY_CASES = Object.freeze([
  { name: "max-safe", arg: "a:g9007199254740991", accepted: true },
  { name: "max-safe-cancel-retry", arg: "a:g9007199254740991", accepted: true },
  { name: "max-safe-plus-one", arg: "a:g9007199254740992", accepted: false },
  { name: "zero", arg: "a:g0", accepted: false },
  { name: "leading-zero", arg: "a:g01", accepted: false },
  { name: "malformed", arg: "a:g1x", accepted: false },
  { name: "uint64-max", arg: "a:g18446744073709551615", accepted: false },
  { name: "uint64-overflow", arg: "a:g18446744073709551616", accepted: false },
  { name: "non-ascii-digit", arg: "a:g١", accepted: false },
  { name: "other-byte", arg: "a:g1!", accepted: false },
]);
const PARENT_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent";
const CHILD_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild";
const HELPER_DESCRIPTOR_SCHEMA = "gobi.keyed-module-helpers/v1";
const HELPER_MEMBERS = Object.freeze(["children", "receiveKeyed", "isCurrent"]);
const WIRE_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/modulewire";
const KEYED_WIRE_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmodulewire";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseRecordedJSON(text, label) {
  const trimmed = text.trim();
  if (!trimmed) throw new TypeError(`${label} is empty`);
  try { return JSON.parse(trimmed); } catch { /* inspect the final JSON line below */ }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch { /* continue toward the last valid JSON record */ }
  }
  throw new TypeError(`${label} does not contain a JSON record`);
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
    manifestPath: side.manifestPath,
    appIRPath: side.appIRPath,
    modulePath: side.modulePath,
    encoderPath: side.encoderPath,
    descriptorPath: side.descriptorPath,
  };
}

function assertSafeRelative(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/") || value.includes("\\") || value.includes("\0") ||
      value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new TypeError(`${label} must be a normalized relative path`);
  }
}

function resolvePinned(root, value, label) {
  assertSafeRelative(value, label);
  const result = resolve(root, value);
  if (!result.startsWith(`${root}/`)) throw new TypeError(`${label} escapes its pinned root`);
  return result;
}

async function verifyBuildRecord({ record, expectedPackage, backend, indexRoot }) {
  if (record.backend !== backend || record.packagePath !== expectedPackage || record.componentId !== expectedPackage ||
      !Number.isSafeInteger(record.outputCount) || record.outputCount <= 0 || !Array.isArray(record.outputs) ||
      record.outputs.length !== record.outputCount || !record.manifest || !record.artifacts?.moduleABI) {
    throw new TypeError(`${backend} build record does not describe one independent ${expectedPackage} application`);
  }
  const outputRoot = resolvePinned(indexRoot, record.outputDir, `${backend} output directory`);
  const manifestPath = resolvePinned(indexRoot, record.manifestPath, `${backend} manifest path`);
  const resultPath = resolvePinned(indexRoot, record.resultPath, `${backend} result path`);
  if (!record.result || record.result.path !== record.resultPath || !Number.isSafeInteger(record.result.bytes) ||
      !/^[0-9a-f]{64}$/.test(record.result.sha256)) {
    throw new TypeError(`${backend} BuildResult pin is malformed`);
  }
  const [manifestBytes, resultBytes] = await Promise.all([readFile(manifestPath), readFile(resultPath)]);
  if (manifestBytes.byteLength !== record.manifest.bytes || sha256(manifestBytes) !== record.manifest.sha256) {
    throw new TypeError(`${backend} manifest bytes differ from their build index pin`);
  }
  if (resultBytes.byteLength !== record.result.bytes || sha256(resultBytes) !== record.result.sha256) {
    throw new TypeError(`${backend} BuildResult bytes differ from their build index pin`);
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const result = JSON.parse(resultBytes.toString("utf8"));
  const app = manifest.apps?.[0];
  if (manifest.schema !== "gobi.build-manifest/v1" || manifest.apps?.length !== 1 || app.backend !== backend ||
      app.packagePath !== expectedPackage || app.componentId !== expectedPackage ||
      result.schema !== "gobi.build-result/v1" || result.ok !== true || result.preservedPreviousOutput !== false ||
      result.apps?.length !== 1 || result.apps[0].packagePath !== expectedPackage ||
      result.outputs?.length !== record.outputCount || !same(result.outputs, record.outputs)) {
    throw new TypeError(`${backend} manifest or actual compiler BuildResult differs from the independent build record`);
  }
  for (const output of record.outputs) {
    const outputPath = resolvePinned(outputRoot, output.path, `${backend} compiler output path`);
    const bytes = await readFile(outputPath);
    if (bytes.byteLength !== output.bytes || sha256(bytes) !== output.sha256) {
      throw new TypeError(`${backend} compiler output bytes differ from BuildResult: ${output.path}`);
    }
  }
  for (const name of ["appIR", "module", "encoder", "components", "moduleABI"]) {
    const pin = record.artifacts[name];
    if (!pin) throw new TypeError(`${backend} build index is missing ${name}`);
    const path = resolvePinned(indexRoot, pin.path, `${backend} ${name} artifact path`);
    const bytes = await readFile(path);
    if (bytes.byteLength !== pin.bytes || sha256(bytes) !== pin.sha256) throw new TypeError(`${backend} ${name} artifact differs from its build index pin`);
  }
  const descriptor = JSON.parse((await readFile(resolvePinned(indexRoot, record.artifacts.moduleABI.path, `${backend} module ABI path`))).toString("utf8"));
  if (descriptor.abiSHA256 !== record.artifacts.moduleABI.abiSHA256 ||
      descriptor.artifactSHA256 !== record.artifacts.moduleABI.artifactSHA256) {
    throw new TypeError(`${backend} module ABI digest metadata differs from its artifact`);
  }
  return { app, manifest, outputRoot, result };
}

function moduleAbiInput(side) {
  const appIRArtifact = side.descriptor.artifacts.find((artifact) => artifact.path.endsWith("/app-ir.json"));
  if (!appIRArtifact) throw new TypeError(`${side.packagePath} ABI does not inventory app-ir.json`);
  return {
    descriptor: side.descriptor,
    descriptorBytes: side.descriptorBytes,
    appIR: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(side.artifactBytes.get(appIRArtifact.path))),
    artifactBytes: side.artifactBytes,
  };
}

function sliceItems(value, label) {
  if (Array.isArray(value)) return value.slice();
  if (value === null || typeof value !== "object") throw new TypeError(`${label} must be an emitted GoScript slice`);
  const own = (key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an own data field`);
    return descriptor.value;
  };
  const backing = own("backing");
  const offset = own("offset");
  const length = own("length");
  const capacity = own("capacity");
  const target = own("target");
  if (target !== undefined || !Array.isArray(backing) || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
      !Number.isSafeInteger(capacity) || offset < 0 || length < 0 || capacity < length || offset + capacity > backing.length) {
    throw new TypeError(`${label} is not a valid GoScript slice window`);
  }
  return backing.slice(offset, offset + length);
}

function effectTuple(effect, label) {
  if (!effect || typeof effect !== "object") throw new TypeError(`${label} is not a Go Effect`);
  const own = (key) => {
    const descriptor = Object.getOwnPropertyDescriptor(effect, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an own data field`);
    return descriptor.value;
  };
  const tuple = { kind: own("Kind"), name: own("Name"), arg: own("Arg"), reply: own("Reply") };
  if (Object.values(tuple).some((value) => typeof value !== "string")) throw new TypeError(`${label} has a nonstring field`);
  return tuple;
}

function stateField(state, key, label) {
  if (!state || typeof state !== "object") throw new TypeError(`${label} must be a compiled Go state record`);
  const descriptor = Object.getOwnPropertyDescriptor(state, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an own data field`);
  return descriptor.value;
}

function compiledStateSnapshot(state, label) {
  const core = stateField(state, "Core", label);
  const counter = stateField(core, "Counter", `${label}.Core`);
  const asDecimal = (value, field) => typeof value === "bigint" ? value.toString(10) :
    Number.isSafeInteger(value) ? String(value) : (() => { throw new TypeError(`${label}.${field} is not a safe integer`); })();
  return {
    key: stateField(state, "Key", label),
    generation: asDecimal(stateField(state, "Generation", label), "Generation"),
    mounted: stateField(state, "Mounted", label),
    requestID: asDecimal(stateField(state, "RequestID", label), "RequestID"),
    pending: stateField(state, "Pending", label),
    token: stateField(state, "Token", label),
    reply: stateField(state, "Reply", label),
    coreStep: stateField(core, "Step", `${label}.Core`),
    coreLocked: stateField(core, "Locked", `${label}.Core`),
    coreInputRevision: stateField(core, "InputRevision", `${label}.Core`),
    counterCount: stateField(counter, "Count", `${label}.Core.Counter`),
  };
}

function compiledFullState(state, label) {
  const core = stateField(state, "Core", label);
  const counter = stateField(core, "Counter", `${label}.Core`);
  const asSafeNumber = (value, field) => {
    const number = typeof value === "bigint" ? Number(value) : value;
    if (!Number.isSafeInteger(number)) throw new TypeError(`${label}.${field} is not a safe integer`);
    return number;
  };
  return {
    Core: {
      Counter: { Count: stateField(counter, "Count", `${label}.Core.Counter`) },
      Step: stateField(core, "Step", `${label}.Core`),
      Locked: stateField(core, "Locked", `${label}.Core`),
      InputRevision: asSafeNumber(stateField(core, "InputRevision", `${label}.Core`), "Core.InputRevision"),
    },
    Key: stateField(state, "Key", label),
    Generation: asSafeNumber(stateField(state, "Generation", label), "Generation"),
    Mounted: stateField(state, "Mounted", label),
    RequestID: asSafeNumber(stateField(state, "RequestID", label), "RequestID"),
    Pending: stateField(state, "Pending", label),
    Token: stateField(state, "Token", label),
    Reply: stateField(state, "Reply", label),
  };
}

function verifyEncodedChildUint64s(encoder, state, stateType, label) {
  if (typeof encoder?.gobiEncodeState !== "function") throw new TypeError(`${label} generated encoder is missing`);
  const encoded = encoder.gobiEncodeState(state, stateType);
  if (encoded?.typeId !== stateType || encoded.kind !== "struct" || !Array.isArray(encoded.fields)) {
    throw new TypeError(`${label} state encoder did not emit the pinned Go struct record`);
  }
  const encodedInteger = (name, expected) => {
    const matches = encoded.fields.filter((field) => field?.name === name);
    const value = matches[0]?.value;
    if (matches.length !== 1 || value?.typeId !== "uint64" || value.kind !== "uint" ||
        typeof value.integer !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value.integer)) {
      throw new TypeError(`${label}.${name} did not use the generated uint64 BigInt encoding`);
    }
    const integer = BigInt(value.integer);
    const expectedNumber = typeof expected === "bigint" ? Number(expected) : expected;
    if (!Number.isSafeInteger(expectedNumber) || integer < 0n || integer > BigInt(Number.MAX_SAFE_INTEGER) ||
        Number(integer) !== expectedNumber || String(expectedNumber) !== value.integer) {
      throw new TypeError(`${label}.${name} encoder output is outside the exact safe-integer profile`);
    }
  };
  encodedInteger("Generation", state.Generation);
  encodedInteger("RequestID", state.RequestID);
  return encoded;
}

function nativeEffectTuples(effects, label) {
  if (!Array.isArray(effects)) throw new TypeError(`${label} native effects must be an array`);
  return effects.map((effect, index) => {
    const tuple = {};
    for (const key of ["Kind", "Name", "Arg", "Reply"]) {
      const descriptor = Object.getOwnPropertyDescriptor(effect, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string") {
        throw new TypeError(`${label}[${index}].${key} is not a native effect field`);
      }
      tuple[key.toLowerCase()] = descriptor.value;
    }
    return tuple;
  });
}

export async function probeModuleEffectsMountBoundaries(side, nativeBoundaries, backend) {
  if (nativeBoundaries?.schema !== MOUNT_BOUNDARY_SCHEMA || !Array.isArray(nativeBoundaries.cases) ||
      nativeBoundaries.cases.length !== EXPECTED_MOUNT_BOUNDARY_CASES.length) {
    throw new TypeError("native mount-boundary oracle does not contain the frozen case inventory");
  }
  const nativeByName = new Map(nativeBoundaries.cases.map((item) => [item.name, item]));
  if (nativeByName.size !== EXPECTED_MOUNT_BOUNDARY_CASES.length) throw new TypeError("native mount-boundary oracle repeats a case name");
  const component = side.module?.appIR?.components?.[0];
  const init = side.module?.symbols?.[component?.init];
  const update = side.module?.symbols?.[component?.update];
  const view = side.module?.symbols?.[component?.view];
  if (!component || typeof init !== "function" || typeof update !== "function" || typeof view !== "function") {
    throw new TypeError(`${backend} compiled mount-boundary roles are incomplete`);
  }
  const cases = [];
  for (const expected of EXPECTED_MOUNT_BOUNDARY_CASES) {
    const nativeCase = nativeByName.get(expected.name);
    if (!nativeCase || nativeCase.arg !== expected.arg || !Array.isArray(nativeCase.steps) || nativeCase.steps.length < 1 ||
        nativeCase.steps[0].message !== "mount" || nativeCase.steps[0].arg !== expected.arg) {
      throw new TypeError(`native mount-boundary case ${expected.name} differs from the frozen argument/step contract`);
    }
    let state = init();
    const steps = [];
    for (let index = 0; index < nativeCase.steps.length; index += 1) {
      const nativeStep = nativeCase.steps[index];
      const arg = nativeStep.arg ?? "";
      const result = update(state, { Name: nativeStep.message, Arg: arg });
      if (!Array.isArray(result) || result.length !== 2) throw new TypeError(`${backend}/${expected.name} Update did not return [State,Effects]`);
      state = result[0];
      view(state);
      const fullState = compiledFullState(state, `${expected.name}/${nativeStep.message}`);
      verifyEncodedChildUint64s(side.encoder, state, component.stateType, `${expected.name}/${nativeStep.message}`);
      const effects = sliceItems(result[1], `${expected.name}/${nativeStep.message} effects`).map((effect, effectIndex) =>
        effectTuple(effect, `${expected.name}/${nativeStep.message} effects[${effectIndex}]`));
      const nativeEffects = nativeEffectTuples(nativeStep.effects, `${expected.name}/${nativeStep.message} effects`);
      if (!same(fullState, nativeStep.state) || !same(effects, nativeEffects)) {
        throw new TypeError(`${backend}/${expected.name}/${nativeStep.message} compiled full state or effects differ from native Go`);
      }
      if (index === 0 && fullState.Mounted !== expected.accepted) {
        throw new TypeError(`${backend}/${expected.name} mount acceptance differs from the safe-integer boundary`);
      }
      steps.push({ message: nativeStep.message, arg, state: fullState, effects });
    }
    if (expected.name === "max-safe" || expected.name === "max-safe-cancel-retry") {
      if (!steps.some((step) => step.message === "request" && step.state.Pending &&
          step.state.Generation === Number.MAX_SAFE_INTEGER &&
          step.effects.some((effect) => effect.kind === "fixture.request" && effect.arg === "a:g9007199254740991:r1"))) {
        throw new TypeError(`${backend}/${expected.name} did not format and commit a request at the maximum safe generation`);
      }
      if (expected.name === "max-safe" && !steps.some((step) => step.message === "complete" && !step.state.Pending &&
          step.state.Reply === "a:g9007199254740991:r1")) {
        throw new TypeError(`${backend}/max-safe did not complete a request at the maximum safe generation`);
      }
      if (expected.name === "max-safe-cancel-retry" && !steps.some((step) => step.message === "cancel" && !step.state.Pending &&
          step.effects.some((effect) => effect.kind === "lifecycle.cancel" && effect.arg === "a:g9007199254740991:r1"))) {
        throw new TypeError(`${backend}/max-safe-cancel-retry did not cancel a request at the maximum safe generation`);
      }
    }
    cases.push({ name: expected.name, arg: expected.arg, accepted: expected.accepted, steps });
  }
  return { schema: MOUNT_BOUNDARY_SCHEMA, backend, cases, nativeParity: true };
}

export async function probeModuleEffects(side) {
  const component = side.module?.appIR?.components?.[0];
  const init = side.module?.symbols?.[component?.init];
  const update = side.module?.symbols?.[component?.update];
  const view = side.module?.symbols?.[component?.view];
  if (!component || typeof init !== "function" || typeof update !== "function" || typeof view !== "function" ||
      typeof side.bridges?.input !== "function" || typeof side.bridges?.publication !== "function" ||
      typeof side.encoder?.gobiEncodeState !== "function") throw new TypeError("compiled effect child roles are incomplete");
  const observations = [];
  const stateSnapshots = [];
  const snapshot = (step, state) => {
    const row = { step, ...compiledStateSnapshot(state, step) };
    stateSnapshots.push(row);
    return row;
  };
  const tick = (state, name, arg = "") => {
    const result = update(state, { Name: name, Arg: arg });
    if (!Array.isArray(result) || result.length !== 2) throw new TypeError(`compiled Update(${name}) did not return [State,Effects]`);
    return { state: result[0], effects: sliceItems(result[1], `Update(${name}).Effects`).map((effect, index) => {
      const tuple = effectTuple(effect, `Update(${name}).Effects[${index}]`);
      observations.push(tuple);
      return tuple;
    }) };
  };
  let state = init();
  view(state);
  snapshot("initial", state);
  let result = tick(state, "mount", "a:g1");
  state = result.state;
  if (result.effects.length !== 0) throw new TypeError("compiled mount emitted an effect");
  if (!snapshot("mount", state).mounted) throw new TypeError("compiled mount did not commit mounted state");
  state = side.bridges.input(state, { Step: 2, Locked: false, Revision: 1 });
  const inputState = snapshot("input", state);
  const publication = side.bridges.publication(state);
  if (publication?.Revision !== 1 || typeof publication.Count !== "number" ||
      inputState.coreStep !== 2 || inputState.coreLocked !== false || inputState.coreInputRevision !== 1) {
    throw new TypeError("compiled Input/Publication bridge returned an invalid projection or publication");
  }
  view(state);
  result = tick(state, "request");
  state = result.state;
  const requestState = snapshot("request", state);
  if (!same(result.effects, [{ kind: "fixture.request", name: "save", arg: "a:g1:r1", reply: "complete" }])) {
    throw new TypeError("compiled request effect differs from fixture.request/save/complete");
  }
  if (!requestState.pending || requestState.requestID !== "1" || requestState.token !== "a:g1:r1") {
    throw new TypeError("compiled request did not commit Go-owned pending/token state before returning the effect");
  }
  result = tick(state, "cancel");
  state = result.state;
  const cancelState = snapshot("cancel", state);
  if (!same(result.effects, [{ kind: "lifecycle.cancel", name: "cancel", arg: "a:g1:r1", reply: "" }])) {
    throw new TypeError("compiled request cancellation differs from lifecycle.cancel/cancel/empty reply");
  }
  if (cancelState.pending || cancelState.token !== "a:g1:r1") throw new TypeError("compiled cancel did not retain its request token");
  result = tick(state, "request");
  state = result.state;
  const retryState = snapshot("retry", state);
  if (!same(result.effects, [{ kind: "fixture.request", name: "save", arg: "a:g1:r2", reply: "complete" }])) {
    throw new TypeError("compiled request retry did not advance its Go-owned request ID");
  }
  if (!retryState.pending || retryState.requestID !== "2" || retryState.token !== "a:g1:r2") {
    throw new TypeError("compiled retry state did not advance its Go-owned request ID");
  }
  result = tick(state, "unmount", "a:g1");
  state = result.state;
  const unmountState = snapshot("unmount", state);
  if (!same(result.effects, [{ kind: "lifecycle.cancel", name: "cancel", arg: "a:g1:r2", reply: "" }])) {
    throw new TypeError("compiled unmount did not return the Go-owned cancellation descriptor");
  }
  if (unmountState.mounted || unmountState.pending) throw new TypeError("compiled unmount did not retire Go state before cancellation");
  view(state);
  const beforeStale = JSON.stringify(side.encoder.gobiEncodeState(state, component.stateType));
  result = tick(state, "complete", "a:g1:r2");
  snapshot("stale-complete", result.state);
  const afterStale = JSON.stringify(side.encoder.gobiEncodeState(result.state, component.stateType));
  if (result.effects.length !== 0 || beforeStale !== afterStale) throw new TypeError("late completion changed unmounted state");
  const uniqueDescriptorCount = new Set(observations.map(({ kind, name, reply }) => JSON.stringify([kind, name, reply]))).size;
  if (observations.length !== 4 || uniqueDescriptorCount !== closedEffectDescriptors.length) {
    throw new TypeError("compiled effect probe did not exercise exactly four effects across the two closed descriptors");
  }
  return {
    observedCount: observations.length,
    uniqueDescriptorCount,
    observations,
    stateSnapshots,
    standardRoles: ["Init", "Update", "View", "Input", "Publication"],
    inputPublication: publication,
    requestAndCancelEffectsMatchClosedDescriptors: true,
    staleReplyNoopAfterUnmount: true,
  };
}

export async function loadModuleEffectsBuilds(buildIndexPath) {
  const indexFile = resolve(buildIndexPath);
  const indexBytes = await readFile(indexFile);
  const index = JSON.parse(indexBytes.toString("utf8"));
  if (index.schema !== INDEX_SCHEMA || !index.builds || typeof index.builds !== "object") {
    throw new TypeError(`build index must use ${INDEX_SCHEMA}`);
  }
  const buildContext = index.buildContext;
  if (buildContext?.schema !== "gobi.module-effects-build-context/v1" ||
      !["repositoryRoot", "compilerWorkingDirectory", "outputRoot", "goScriptTempRoot", "helperCommentBase"].every((key) =>
        typeof buildContext[key] === "string" && isAbsolute(buildContext[key])) ||
      buildContext.repositoryRoot !== ROOT || resolve(buildContext.compilerWorkingDirectory) !== resolve(ROOT, "compiled-frontend") ||
      resolve(buildContext.helperCommentBase) !== resolve(ROOT, "compiled-module-effects")) {
    throw new TypeError("build index generated-source context is malformed or belongs to a different checkout");
  }
  const indexRoot = dirname(indexFile);
  const result = { schema: index.schema, indexPath: indexFile, indexSHA256: sha256(indexBytes), builds: {}, profiles: {} };
  if (index.parentPackagePath !== PARENT_PACKAGE || index.childPackagePath !== CHILD_PACKAGE) {
    throw new TypeError("build index parent/child package identities differ from the frozen module profile");
  }
  if (!same(index.closedEffectDescriptors, closedEffectDescriptors)) {
    throw new TypeError("build index effect descriptors differ from the closed profile admission contract");
  }
  if (!index.toolchain || !/^v22\./.test(index.toolchain.node) || !/go1\.24\./.test(index.toolchain.rootGo) ||
      !/^go1\.27\.3/.test(index.toolchain.compilerGo) || index.toolchain.goscript !== "v0.6.2" || index.toolchain.esbuild !== "0.28.2") {
    throw new TypeError("build index toolchain differs from the pinned effects compiler matrix");
  }
  if (index.actualBuildCount !== 4 || !Array.isArray(index.inventory) || index.inventory.length !== 4) {
    throw new TypeError("build index must contain four actual independent builds");
  }
  for (const [relativePath, pin] of Object.entries(index.sourcePins ?? {})) {
    assertSafeRelative(relativePath, "source pin path");
    if (pin.path !== relativePath || !Number.isSafeInteger(pin.bytes) || !/^[0-9a-f]{64}$/.test(pin.sha256)) {
      throw new TypeError(`source pin is malformed: ${relativePath}`);
    }
    const sourceBytes = await readFile(resolve(ROOT, relativePath));
    if (sourceBytes.byteLength !== pin.bytes || sha256(sourceBytes) !== pin.sha256) throw new TypeError(`source pin mismatch: ${relativePath}`);
  }
  const expectedInventory = [];
  for (const backend of ["react", "dom"]) {
    for (const role of ["parent", "child"]) {
      const record = index.builds[backend]?.[role];
      if (!record) throw new TypeError(`${backend}/${role} build record is missing`);
      expectedInventory.push({
        backend,
        role,
        packagePath: record.packagePath,
        componentId: record.componentId,
        outputDir: record.outputDir,
        outputCount: record.outputCount,
        manifest: record.manifest,
        result: record.result,
        outputs: record.outputs,
        artifacts: record.artifacts,
        keyedHelper: record.keyedHelper ?? null,
      });
    }
  }
  if (!same(index.inventory, expectedInventory)) {
    throw new TypeError("build index inventory differs from its four independent parent/child records");
  }
  const buildCommands = (index.commands ?? []).filter((command) => /^build-(react|dom)-(parent|child)$/.test(command.name));
  if (buildCommands.length !== 4 || new Set(buildCommands.map((command) => command.name)).size !== 4) {
    throw new TypeError("build index command inventory does not contain exactly four independent GoScript builds");
  }
  for (const command of buildCommands) {
    if (command.exitCode !== 0 || command.signal !== null || command.spawnError !== null ||
        command.command === "" || !Array.isArray(command.args) || !command.args.includes("./cmd/gobi-build")) {
      throw new TypeError(`recorded compiler command ${command.name} did not complete successfully`);
    }
    const backendRole = command.name.slice("build-".length);
    const [backend, role] = backendRole.split("-");
    const metadataPath = resolvePinned(indexRoot, `metadata/${backend}-${role}`, `${command.name} metadata directory`);
    const buildRecord = index.builds[backend]?.[role];
    if (!buildRecord) throw new TypeError(`recorded compiler command has no build record: ${command.name}`);
    const [stdout, stderr, commandJSON, request, buildResult] = await Promise.all([
      readFile(resolve(metadataPath, `${command.name}.stdout.bin`)),
      readFile(resolve(metadataPath, `${command.name}.stderr.bin`)),
      readFile(resolve(metadataPath, `${command.name}.command.json`)),
      readFile(resolve(metadataPath, "request.json")),
      readFile(resolve(metadataPath, "build-result.json")),
    ]);
    const parsedCommand = JSON.parse(commandJSON.toString("utf8"));
    const requestObject = JSON.parse(request.toString("utf8"));
    const resultObject = JSON.parse(buildResult.toString("utf8"));
    const stdoutResult = parseRecordedJSON(stdout.toString("utf8"), `${command.name} stdout`);
    if (!same(parsedCommand, command) || stdout.byteLength !== command.stdout.bytes || sha256(stdout) !== command.stdout.sha256 ||
        stderr.byteLength !== command.stderr.bytes || sha256(stderr) !== command.stderr.sha256 ||
        request.byteLength !== command.stdin?.bytes || sha256(request) !== command.stdin?.sha256 ||
        requestObject.schema !== "gobi.build-request/v1" || requestObject.backend !== backend ||
        requestObject.sourceRoot !== buildContext.repositoryRoot || requestObject.entryPackages?.length !== 1 ||
        requestObject.entryPackages[0] !== buildRecord.packagePath || requestObject.outputDir !== resolve(buildContext.outputRoot, buildRecord.outputDir) ||
        command.cwd !== buildContext.compilerWorkingDirectory ||
        resultObject.schema !== "gobi.build-result/v1" || resultObject.ok !== true ||
        resultObject.apps?.length !== 1 || resultObject.apps[0].packagePath !== buildRecord.packagePath ||
        !same(resultObject.outputs, buildRecord.outputs) || !same(stdoutResult, resultObject)) {
      throw new TypeError(`recorded compiler command evidence is incomplete or inconsistent: ${command.name}`);
    }
  }
  const nativeBoundaryPin = index.nativeMountBoundaries;
  if (nativeBoundaryPin?.schema !== MOUNT_BOUNDARY_SCHEMA || !Array.isArray(nativeBoundaryPin.caseNames) ||
      !same(nativeBoundaryPin.caseNames, EXPECTED_MOUNT_BOUNDARY_CASES.map(({ name }) => name)) ||
      !Number.isSafeInteger(nativeBoundaryPin.bytes) || !/^[0-9a-f]{64}$/.test(nativeBoundaryPin.sha256)) {
    throw new TypeError("build index native mount-boundary result pin is malformed");
  }
  const nativeBoundaryPath = resolvePinned(indexRoot, nativeBoundaryPin.path, "native mount-boundary result path");
  const nativeBoundaryBytes = await readFile(nativeBoundaryPath);
  if (nativeBoundaryBytes.byteLength !== nativeBoundaryPin.bytes || sha256(nativeBoundaryBytes) !== nativeBoundaryPin.sha256) {
    throw new TypeError("native mount-boundary result differs from its build index pin");
  }
  const nativeMountBoundaries = JSON.parse(nativeBoundaryBytes.toString("utf8"));
  if (nativeMountBoundaries.schema !== MOUNT_BOUNDARY_SCHEMA || !Array.isArray(nativeMountBoundaries.cases) ||
      !same(nativeMountBoundaries.cases.map(({ name }) => name), nativeBoundaryPin.caseNames)) {
    throw new TypeError("native mount-boundary result differs from its closed case inventory");
  }
  const nativeCommand = (index.commands ?? []).filter((command) => command.name === "native-mount-boundaries");
  if (nativeCommand.length !== 1 || nativeCommand[0].exitCode !== 0 || nativeCommand[0].signal !== null ||
      nativeCommand[0].spawnError !== null || !nativeCommand[0].args?.includes("--mount-boundaries")) {
    throw new TypeError("build index does not pin one successful native mount-boundary command");
  }
  const nativeCommandRecord = nativeCommand[0];
  const nativeMetadata = resolvePinned(indexRoot, "metadata/native-mount-boundaries", "native mount-boundary metadata directory");
  const [nativeStdout, nativeStderr, nativeCommandBytes, nativeResultBytes] = await Promise.all([
    readFile(resolve(nativeMetadata, "native-mount-boundaries.stdout.bin")),
    readFile(resolve(nativeMetadata, "native-mount-boundaries.stderr.bin")),
    readFile(resolve(nativeMetadata, "native-mount-boundaries.command.json")),
    readFile(resolve(nativeMetadata, "result.json")),
  ]);
  if (!same(JSON.parse(nativeCommandBytes.toString("utf8")), nativeCommandRecord) ||
      nativeStdout.byteLength !== nativeCommandRecord.stdout.bytes || sha256(nativeStdout) !== nativeCommandRecord.stdout.sha256 ||
      nativeStderr.byteLength !== nativeCommandRecord.stderr.bytes || sha256(nativeStderr) !== nativeCommandRecord.stderr.sha256 ||
      !same(JSON.parse(nativeResultBytes.toString("utf8")), nativeMountBoundaries) ||
      !same(parseRecordedJSON(nativeStdout.toString("utf8"), "native mount-boundary stdout"), nativeMountBoundaries)) {
    throw new TypeError("recorded native mount-boundary command output is incomplete or inconsistent");
  }
  for (const backend of ["react", "dom"]) {
    const record = index.builds[backend];
    if (!record?.parent?.manifestPath || !record?.child?.manifestPath || !record?.parent?.keyedHelper?.path) {
      throw new TypeError(`${backend} build-index entry is missing the parent, child or keyed helper artifact`);
    }
    const [parentCompiled, childCompiled] = await Promise.all([
      loadCompiledModuleBuild({ manifestPath: resolve(indexRoot, record.parent.manifestPath), packagePath: PARENT_PACKAGE }),
      loadCompiledModuleBuild({ manifestPath: resolve(indexRoot, record.child.manifestPath), packagePath: CHILD_PACKAGE }),
    ]);
    await verifyBuildRecord({ record: record.parent, expectedPackage: PARENT_PACKAGE, backend, indexRoot });
    await verifyBuildRecord({ record: record.child, expectedPackage: CHILD_PACKAGE, backend, indexRoot });
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
    const parentAppIRSHA256 = sha256(parentAppIRBytes);
    const parentModuleBytes = await readFile(parentCompiled.modulePath);
    const parentModuleText = parentModuleBytes.toString("utf8");
    const parentHelperText = helperBytes.toString("utf8");
    const parentModuleSourceCommentPolicy = index.admission?.[backend]?.parentABIComparison?.sourcePathCommentControls?.module?.sourceCommentPolicy;
    const parentHelperSourceCommentPolicy = helperPin.normalization?.controls?.sourceCommentPolicy;
    const parentModuleContext = {
      artifactKind: "module", backend, commentBase: buildContext.compilerWorkingDirectory,
      outputRoot: buildContext.outputRoot, goScriptTempRoot: buildContext.goScriptTempRoot,
    };
    const parentHelperContext = {
      artifactKind: "helper", backend, commentBase: buildContext.helperCommentBase,
      outputRoot: buildContext.outputRoot, goScriptTempRoot: buildContext.goScriptTempRoot,
    };
    const parentModuleNormalization = verifyGeneratedArtifactNormalization(
      parentModuleText, `${backend} parent compiled module`, parentModuleSourceCommentPolicy, parentModuleContext,
    );
    const parentHelperNormalization = verifyGeneratedArtifactNormalization(
      parentHelperText, `${backend} parent keyed helper`, parentHelperSourceCommentPolicy, parentHelperContext,
    );
    const normalizedParentModuleSHA256 = sha256(Buffer.from(normalizeGeneratedArtifactText(parentModuleText, parentModuleSourceCommentPolicy)));
    const normalizedParentHelperSHA256 = sha256(Buffer.from(normalizeGeneratedArtifactText(parentHelperText, parentHelperSourceCommentPolicy)));
    const parentSourcePin = index.sourcePins?.["fixtures/compiled/keyedmoduleparent/app.go"];
    if (parentAppIRSHA256 !== pr22ParentPins[backend].appIRSHA256 ||
        normalizedParentModuleSHA256 !== pr22ParentPins[backend].normalizedModuleSHA256 ||
        normalizedParentHelperSHA256 !== pr22ParentPins[backend].normalizedHelperSHA256 ||
        parentSourcePin?.sha256 !== pr22ParentPins[backend].sourceSHA256) {
      throw new TypeError(`${backend} keyed parent source, AppIR or executable bytes differ from the normalized PR22 contract`);
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
    const abiAdmission = await validateModuleEffectsPair({
      parent: moduleAbiInput(parentCompiled),
      child: moduleAbiInput(childCompiled),
    });
    const indexedAdmission = index.admission?.[backend];
    if (!indexedAdmission?.admitted || indexedAdmission.parentABIUnchanged !== true ||
        indexedAdmission.parentABISHA256 !== abiAdmission.parent.abiSHA256 ||
        indexedAdmission.childABISHA256 !== abiAdmission.child.abiSHA256 ||
        indexedAdmission.parentABIComparison?.rawParentABISHA256 !== abiAdmission.parent.abiSHA256 ||
        indexedAdmission.parentABIComparison?.normalizedParentModuleSHA256 !== normalizedParentModuleSHA256 ||
        indexedAdmission.parentABIComparison?.normalizedParentHelperSHA256 !== normalizedParentHelperSHA256 ||
        !same(indexedAdmission.effectCapabilityExtension?.closedEffectDescriptors, closedEffectDescriptors) ||
        !same(indexedAdmission.effectCapabilityExtension?.capabilities, abiAdmission.child.descriptor.capabilities)) {
      throw new TypeError(`${backend} build-index admission does not match the original compiled modules`);
    }
    const childSide = { ...moduleInput(childCompiled), effectAdmission: abiAdmission, closedEffectDescriptors };
    const effectProbe = await probeModuleEffects(childSide);
    if (effectProbe.observedCount !== 4 || effectProbe.uniqueDescriptorCount !== closedEffectDescriptors.length ||
        !effectProbe.requestAndCancelEffectsMatchClosedDescriptors || !effectProbe.staleReplyNoopAfterUnmount) {
      throw new TypeError(`${backend} generated child failed the request/cancel/reply admission probe`);
    }
    const mountBoundaryProbe = await probeModuleEffectsMountBoundaries(childSide, nativeMountBoundaries, backend);
    if (!same(indexedAdmission.mountBoundaryProbe, mountBoundaryProbe)) {
      throw new TypeError(`${backend} recorded mount-boundary probe differs from emitted child/native parity`);
    }
    const loaded = {
      backend,
      parent: { ...moduleInput(parentCompiled), keyed: helpers, keyedSidecar },
      child: childSide,
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
        normalizedParentModuleSHA256,
        normalizedParentHelperSHA256,
      },
      admission: indexedAdmission,
      parentABIUnchanged: true,
      parentABIComparison: indexedAdmission.parentABIComparison,
      parentSourcePathCommentControls: { module: parentModuleNormalization, helper: parentHelperNormalization },
      effectProbe,
      mountBoundaryProbe,
    };
    result.builds[backend] = loaded;
    result.profiles[backend] = { backend, parent: loaded.parent, child: loaded.child };
  }
  result.admission = index.admission;
  result.closedEffectDescriptors = closedEffectDescriptors;
  result.nativeMountBoundaries = { ...nativeBoundaryPin, cases: nativeMountBoundaries.cases };
  result.inventory = index.inventory;
  result.sourcePins = index.sourcePins;
  result.toolchain = index.toolchain;
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
