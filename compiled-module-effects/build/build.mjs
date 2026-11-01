import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  closedEffectDescriptors as admittedEffectDescriptors,
  pr22ParentPins,
  validateModuleEffectsPair,
} from "./abi-admission.mjs";
import {
  createGeneratedSourceCommentPolicy,
  normalizeGeneratedArtifactText,
  verifyGeneratedArtifactNormalization,
} from "./source-comments.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const compilerDir = join(root, "compiled-frontend");
const compilerBundle = join(compilerDir, "build/bundle.mjs");
const wirePackage = "github.com/samuelpmahan/gondola/fixtures/compiled/modulewire";
const keyedWirePackage = "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmodulewire";
const packagePaths = Object.freeze({
  parent: "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent",
  child: "github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild",
});
const helperExport = "gobiKeyedModuleHelpers";
const helperMembers = Object.freeze(["children", "receiveKeyed", "isCurrent"]);
const helperSchema = "gobi.keyed-module-helpers/v1";
const indexSchema = "gobi.module-effects-build-index/v1";
const mountBoundarySchema = "gobi.module-effects-mount-boundaries/v1";
const expectedMountBoundaryCases = Object.freeze([
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
const rootGoEnv = { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" };
const compilerEnv = { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const commandRecords = [];

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = { output: join(here, "output/E-BUILD-final") };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--help") return { help: true };
    if (name !== "--output") throw new Error(`unknown argument ${name}`);
    if (seen.has(name)) throw new Error(`${name} may only appear once`);
    seen.add(name);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    args.output = resolve(value);
  }
  return args;
}

function findExecutable(name) {
  const pathValue = process.env.PATH ?? "";
  const delimiter = process.platform === "win32" ? ";" : ":";
  for (const directory of pathValue.split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    const result = spawnSync("test", ["-x", candidate], { encoding: "utf8" });
    if (result.status === 0) return candidate;
  }
  return name;
}

const goExecutable = process.env.GOBI_GO_BIN ? resolve(process.env.GOBI_GO_BIN) : findExecutable("go");
const nodeExecutable = process.env.GOBI_NODE_BIN ? resolve(process.env.GOBI_NODE_BIN) : process.execPath;

async function writeJSON(path, value, { exclusive = false } = {}) {
  await mkdir(dirname(path), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await writeFile(path, bytes, { flag: exclusive ? "wx" : "w", mode: 0o644 });
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}

async function filePin(path, base = root) {
  const bytes = await readFile(path);
  return { path: relative(base, path).split(sep).join("/"), bytes: bytes.length, sha256: sha256(bytes) };
}

function assertSafeRelative(path, label) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") ||
      path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new TypeError(`${label} contains an invalid relative path`);
  }
}

async function walkRegularFiles(directory) {
  const files = [];
  const visit = async (current) => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new TypeError(`compiler output contains a non-regular entry: ${path}`);
    }
  };
  await visit(directory);
  return files;
}

async function runRecorded(name, command, args, { cwd, env, input, metadataDir, maxBuffer = 256 * 1024 * 1024 }) {
  await mkdir(metadataDir, { recursive: true });
  const inputBytes = input === undefined ? null : Buffer.from(input);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    input: inputBytes ?? undefined,
    maxBuffer,
  });
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  const record = {
    name,
    command,
    args,
    cwd,
    environment: env,
    exitCode: result.status,
    signal: result.signal ?? null,
    spawnError: result.error ? String(result.error.message ?? result.error) : null,
    stdin: inputBytes ? { bytes: inputBytes.length, sha256: sha256(inputBytes) } : null,
    stdout: { bytes: stdout.length, sha256: sha256(stdout) },
    stderr: { bytes: stderr.length, sha256: sha256(stderr) },
  };
  await Promise.all([
    writeFile(join(metadataDir, `${name}.stdout.bin`), stdout, { flag: "w" }),
    writeFile(join(metadataDir, `${name}.stderr.bin`), stderr, { flag: "w" }),
    ...(inputBytes ? [writeFile(join(metadataDir, `${name}.stdin.bin`), inputBytes, { flag: "w" })] : []),
    writeJSON(join(metadataDir, `${name}.command.json`), record),
  ]);
  commandRecords.push(record);
  if (result.error || result.status !== 0) {
    const details = stderr.toString("utf8").trim();
    throw new Error(`${name} failed (${result.status ?? result.signal ?? "spawn error"})${details ? `: ${details}` : ""}`);
  }
  return stdout.toString("utf8");
}

function parseSingleJSON(text, label) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`${label} produced empty stdout`);
  try { return JSON.parse(trimmed); } catch { /* use the final JSON line if the tool logged first */ }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch { /* keep searching */ }
  }
  throw new Error(`${label} produced no parseable JSON result`);
}

async function verifyCompilerBuild({ backend, role, outputRoot, outputDir, buildResult }) {
  const packagePath = packagePaths[role];
  if (buildResult?.schema !== "gobi.build-result/v1" || buildResult.ok !== true ||
      buildResult.preservedPreviousOutput !== false || buildResult.diagnostics?.length !== 0 ||
      buildResult.apps?.length !== 1 || buildResult.apps[0].packagePath !== packagePath) {
    throw new Error(`${backend}/${role} GoScript build did not return one clean independent app`);
  }

  const manifestPath = join(outputDir, "buildmanifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest?.schema !== "gobi.build-manifest/v1" || manifest.apps?.length !== 1) {
    throw new Error(`${backend}/${role} buildmanifest does not identify exactly one app`);
  }
  const app = manifest.apps[0];
  if (app.backend !== backend || app.packagePath !== packagePath || app.componentId !== packagePath ||
      typeof app.moduleABI !== "string" || app.moduleABI === "") {
    throw new Error(`${backend}/${role} buildmanifest has the wrong backend/package/component or no ABI`);
  }

  const actual = [];
  for (const output of buildResult.outputs ?? []) {
    assertSafeRelative(output.path, `${backend}/${role} BuildResult`);
    const bytes = await readFile(join(outputDir, output.path));
    if (bytes.length !== output.bytes || sha256(bytes) !== output.sha256) {
      throw new Error(`${backend}/${role} BuildResult output digest mismatch: ${output.path}`);
    }
    actual.push(output.path);
  }
  if (new Set(actual).size !== actual.length) throw new Error(`${backend}/${role} BuildResult repeats an output path`);
  const files = (await walkRegularFiles(outputDir)).map((path) => relative(outputDir, path).split(sep).join("/")).sort();
  if (JSON.stringify(actual.sort()) !== JSON.stringify(files)) {
    throw new Error(`${backend}/${role} physical output set differs from GoScript BuildResult inventory`);
  }
  if (actual.length === 0) throw new Error(`${backend}/${role} GoScript build returned no artifacts`);

  const artifactKeys = ["appIR", "module", "encoder", "components", "moduleABI"];
  const artifactPaths = {};
  for (const key of artifactKeys) {
    const path = app[key];
    assertSafeRelative(path, `${backend}/${role} manifest ${key}`);
    artifactPaths[key] = path;
  }
  const [appIRBytes, descriptorBytes] = await Promise.all([
    readFile(join(outputDir, artifactPaths.appIR)),
    readFile(join(outputDir, artifactPaths.moduleABI)),
  ]);
  const appIR = JSON.parse(appIRBytes.toString("utf8"));
  const descriptor = JSON.parse(descriptorBytes.toString("utf8"));
  if (appIR.schema !== "gobi.app-ir/v1" || appIR.packagePath !== packagePath || appIR.components?.length !== 1 ||
      appIR.components[0].id !== packagePath || appIR.components[0].packagePath !== packagePath) {
    throw new Error(`${backend}/${role} AppIR identity does not match the independently requested package`);
  }
  if (descriptor.schema !== "gobi.module-abi/v1" || descriptor.componentID !== packagePath ||
      descriptor.packagePath !== packagePath || descriptor.artifacts?.length !== 4) {
    throw new Error(`${backend}/${role} compiler ABI descriptor does not bind the expected four module artifacts`);
  }
  const expectedABIPaths = [artifactPaths.appIR, artifactPaths.module, artifactPaths.encoder, artifactPaths.components].sort();
  const describedABIPaths = descriptor.artifacts.map((artifact) => artifact.path).sort();
  if (JSON.stringify(expectedABIPaths) !== JSON.stringify(describedABIPaths)) {
    throw new Error(`${backend}/${role} module ABI artifact paths differ from manifest artifacts`);
  }

  return {
    backend,
    role,
    packagePath,
    componentId: app.componentId,
    outputDir: relative(outputRoot, outputDir).split(sep).join("/"),
    manifestPath: relative(outputRoot, manifestPath).split(sep).join("/"),
    manifest: { bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
    buildResult: { outputCount: actual.length, outputs: buildResult.outputs },
    artifactPaths,
    appIR,
    appIRBytes,
    descriptor,
    descriptorBytes,
  };
}

async function verifyHelperSignatures(appIR, outputDir) {
  const state = appIR.components[0].stateType;
  const childSlot = `${keyedWirePackage}.ChildRef`;
  const publication = `${wirePackage}.Publication`;
  const expected = {
    Children: { params: [state], results: [`[]${childSlot}`] },
    ReceiveKeyed: { params: [state, "string", "int", publication], results: [state] },
    IsCurrent: { params: [state, "string", "int"], results: ["bool"] },
  };
  const source = await readFile(join(root, "fixtures/compiled/keyedmoduleparent/app.go"), "utf8");
  const sourceSignatures = [
    /func Children\(state State\) \[\]ChildSlot\s*\{/,
    /func ReceiveKeyed\(state State, key string, generation int, publication modulewire\.Publication\) State\s*\{/,
    /func IsCurrent\(state State, key string, generation int\) bool\s*\{/,
  ];
  for (const signature of sourceSignatures) {
    if (!signature.test(source)) throw new Error(`keyed parent source is missing frozen helper signature ${signature}`);
  }
  const emittedRoot = join(outputDir, "emitted-ts/@goscript", ...packagePaths.parent.split("/"));
  const [indexSource, appSource] = await Promise.all([
    readFile(join(emittedRoot, "index.ts"), "utf8"),
    readFile(join(emittedRoot, "app.gs.ts"), "utf8"),
  ]);
  for (const name of ["Children", "ReceiveKeyed", "IsCurrent"]) {
    if (!new RegExp(`\\b${name}\\b`).test(indexSource) || !new RegExp(`export function ${name}\\(`).test(appSource)) {
      throw new Error(`GoScript emitted source does not export keyed helper ${name}`);
    }
  }
  const symbols = {};
  for (const [name, signature] of Object.entries(expected)) {
    const candidates = appIR.symbols.filter((symbol) => symbol.packagePath === packagePaths.parent && symbol.name === name);
    if (candidates.length > 1 || (candidates.length === 1 && JSON.stringify(candidates[0].signature) !== JSON.stringify(signature))) {
      throw new Error(`parent AppIR ${name} signature differs from the frozen keyed helper contract`);
    }
    symbols[name] = candidates[0] ?? {
      id: `${packagePaths.parent}.${name}`,
      packagePath: packagePaths.parent,
      name,
      signature,
    };
  }
  return symbols;
}

function helperEntrySource(packagePath) {
  const appImport = JSON.stringify(`@goscript/${packagePath}/index.js`);
  const wireImport = JSON.stringify(`@goscript/${wirePackage}/index.js`);
  const builtinImport = JSON.stringify("@goscript/builtin/index.js");
  return [
    `import * as keyedApp from ${appImport};`,
    `import * as wire from ${wireImport};`,
    `import { goString as goScriptString } from ${builtinImport};`,
    "",
    "function own(value, key, label) {",
    "  if (value === null || (typeof value !== \"object\" && typeof value !== \"function\")) throw new TypeError(label + \" must be an object\");",
    "  const descriptor = Object.getOwnPropertyDescriptor(value, key);",
    "  if (!descriptor || !Object.hasOwn(descriptor, \"value\") || \"get\" in descriptor || \"set\" in descriptor) throw new TypeError(label + \".\" + key + \" must be an own data property\");",
    "  return descriptor.value;",
    "}",
    "function keyValue(value) {",
    "  if (value !== \"a\" && value !== \"b\") throw new TypeError(\"keyed helper key must be a or b\");",
    "  return goScriptString(value);",
    "}",
    "function positiveInteger(value, label) {",
    "  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(label + \" must be a positive safe integer\");",
    "  return value;",
    "}",
    "function publicationValue(value) {",
    "  const count = own(value, \"Count\", \"Publication\");",
    "  const revision = own(value, \"Revision\", \"Publication\");",
    "  if (typeof count !== \"number\" || !Number.isFinite(count) || count < 0 || count > Number.MAX_SAFE_INTEGER) throw new TypeError(\"Publication.Count is outside the keyed profile\");",
    "  positiveInteger(revision, \"Publication.Revision\");",
    "  return { count, revision };",
    "}",
    "function sliceItems(value) {",
    "  if (value === null || value === undefined) return [];",
    "  if (Array.isArray(value)) return value.slice();",
    "  const backing = own(value, \"backing\", \"Children\");",
    "  const offset = own(value, \"offset\", \"Children\");",
    "  const length = own(value, \"length\", \"Children\");",
    "  const capacity = own(value, \"capacity\", \"Children\");",
    "  const target = own(value, \"target\", \"Children\");",
    "  if (target !== undefined || !Array.isArray(backing) || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || !Number.isSafeInteger(capacity) || offset < 0 || length < 0 || capacity < length || offset + capacity > backing.length) throw new TypeError(\"Children returned an invalid GoScript slice\");",
    "  return backing.slice(offset, offset + length);",
    "}",
    "function publicChildren(state) {",
    "  const slots = sliceItems(keyedApp.Children(state));",
    "  const result = slots.map((slot, index) => {",
    "    const key = own(slot, \"Key\", \"Children[\" + index + \"]\");",
    "    const generation = own(slot, \"Generation\", \"Children[\" + index + \"]\");",
    "    if (key !== \"a\" && key !== \"b\") throw new TypeError(\"Children returned a key outside the frozen profile\");",
    "    positiveInteger(generation, \"Children.Generation\");",
    "    return Object.freeze({ key, generation });",
    "  });",
  "  return Object.freeze(result);",
  "}",
  "export const gobiKeyedModuleHelpers = Object.freeze({",
  "  children: publicChildren,",
  "  receiveKeyed(state, key, generation, publication) {",
  "    const input = publicationValue(publication);",
  "    if (!state || typeof state.clone !== \"function\") throw new TypeError(\"keyed parent state must support GoScript value cloning\");",
  "    return keyedApp.ReceiveKeyed(state.clone(), keyValue(key), positiveInteger(generation, \"generation\"), new wire.Publication(true, input.count, input.revision));",
  "  },",
  "  isCurrent(state, key, generation) {",
  "    return keyedApp.IsCurrent(state, keyValue(key), positiveInteger(generation, \"generation\"));",
  "  },",
  "});",
  "",
  `if (!keyedApp.Children || !keyedApp.ReceiveKeyed || !keyedApp.IsCurrent) throw new Error("GoScript keyed helper exports are incomplete for ${packagePath}");`,
  "",
  ].join("\n");
}

async function buildHelperAdapter({ backend, outputDir, outputRoot, build, metadataDir, buildContext }) {
  const appIR = build.appIR;
  const helperSymbols = await verifyHelperSignatures(appIR, outputDir);
  const app = JSON.parse((await readFile(join(outputDir, build.artifactPaths.appIR))).toString("utf8"));
  const adapterDir = join(outputRoot, "adapters", `${backend}-parent`);
  await mkdir(adapterDir, { recursive: true });
  const entryPath = join(adapterDir, ".gobi-keyed-helpers.entry.mjs");
  const helperPath = join(adapterDir, "gobi-keyed-helpers.mjs");
  await writeFile(entryPath, helperEntrySource(packagePaths.parent), { flag: "wx", mode: 0o644 });
  const bundleArgs = [compilerBundle, entryPath, helperPath, join(outputDir, "emitted-ts"), root];
  const bundleStdout = await runRecorded(`bundle-${backend}-parent-keyed-helpers`, nodeExecutable, bundleArgs, {
    cwd: compilerDir,
    env: {},
    metadataDir,
  });
  await rm(entryPath, { force: true });
  if (bundleStdout.trim()) throw new Error(`${backend} helper bundle unexpectedly wrote stdout`);

  const helperPin = await filePin(helperPath, outputRoot);
  const helperSource = await readFile(helperPath, "utf8");
  const helperSourceCommentPolicy = createGeneratedSourceCommentPolicy(helperSource, {
    artifactKind: "helper",
    backend,
    commentBase: buildContext.helperCommentBase,
    outputRoot: buildContext.outputRoot,
    goScriptTempRoot: buildContext.goScriptTempRoot,
  });
  const helperNormalization = verifyGeneratedArtifactNormalization(
    helperSource,
    `${backend} parent keyed helper`,
    helperSourceCommentPolicy,
    { artifactKind: "helper", backend, commentBase: buildContext.helperCommentBase,
      outputRoot: buildContext.outputRoot, goScriptTempRoot: buildContext.goScriptTempRoot },
  );
  const normalizedHelperSHA256 = sha256(Buffer.from(normalizeGeneratedArtifactText(helperSource, helperSourceCommentPolicy)));
  if (normalizedHelperSHA256 !== pr22ParentPins[backend].normalizedHelperSHA256) {
    throw new Error(`${backend} parent keyed helper executable bytes differ from the normalized PR22 output`);
  }
  const appIRPin = await filePin(join(outputDir, build.artifactPaths.appIR), outputRoot);
  const moduleABIPin = await filePin(join(outputDir, build.artifactPaths.moduleABI), outputRoot);
  const fixtureSourcePin = await filePin(join(root, "fixtures/compiled/keyedmoduleparent/app.go"), root);
  const emittedAppRoot = join(outputDir, "emitted-ts/@goscript", ...packagePaths.parent.split("/"));
  const emittedSourcePins = await Promise.all(["index.ts", "app.gs.ts"].map((name) =>
    filePin(join(emittedAppRoot, name), outputRoot)));
  const helperDescriptorPath = join(adapterDir, "keyed-helper-descriptor.json");
  const signatureRows = ["Children", "ReceiveKeyed", "IsCurrent"].map((name) => ({
    name,
    symbol: helperSymbols[name].id,
    signature: helperSymbols[name].signature,
  }));
  const helperDescriptor = {
    schema: helperSchema,
    backend,
    packagePath: packagePaths.parent,
    componentId: app.components[0].id,
    appIR: { path: appIRPin.path, bytes: appIRPin.bytes, sha256: appIRPin.sha256 },
    moduleABI: {
      path: moduleABIPin.path,
      bytes: moduleABIPin.bytes,
      sha256: moduleABIPin.sha256,
      abiSHA256: build.descriptor.abiSHA256,
    },
    helperArtifact: helperPin,
    sourceIdentity: {
      fixtureSource: fixtureSourcePin,
      emittedGoScriptSources: emittedSourcePins,
    },
    exportName: helperExport,
    members: helperMembers,
    symbols: signatureRows,
    childProjection: "children(state) copies the GoScript slice window into a frozen native array of {key,generation} rows",
    stateSemantics: {
      helperFunctions: ["Children", "ReceiveKeyed", "IsCurrent"],
      pureStateHelpers: true,
      usesSharedGlobalState: false,
      receiveKeyedClonesPrimaryGoScriptState: true,
      analyzerReachability: "Children is reachable through View; ReceiveKeyed and IsCurrent are exported GoScript functions but are not AppIR-reachability-admitted by the unchanged shared analyzer",
    },
  };
  const helperDescriptorPin = await writeJSON(helperDescriptorPath, helperDescriptor, { exclusive: true });
  return {
    path: helperPin.path,
    bytes: helperPin.bytes,
    sha256: helperPin.sha256,
    descriptorPath: relative(outputRoot, helperDescriptorPath).split(sep).join("/"),
    descriptorBytes: helperDescriptorPin.bytes,
    descriptorSha256: helperDescriptorPin.sha256,
    exportName: helperExport,
    members: [...helperMembers],
    normalization: {
      rawSHA256: helperPin.sha256,
      normalizedSHA256: normalizedHelperSHA256,
      controls: helperNormalization,
    },
    descriptor: helperDescriptor,
  };
}

async function verifyCompiledModulePair({ backend, outputRoot, buildRecords, toolchain, sourcePins, nativeMountBoundaries, buildContext }) {
  const { loadModulePairBuilds } = await import(pathToFileURL(join(root, "compiled-modules/conformance/module-loader.mjs")).href);
  const parentManifest = join(outputRoot, buildRecords[backend].parent.manifestPath);
  const childManifest = join(outputRoot, buildRecords[backend].child.manifestPath);
  const pair = await loadModulePairBuilds({
    parentManifest,
    childManifest,
    parentPackage: packagePaths.parent,
    childPackage: packagePaths.child,
  });
  const abiInput = (module) => ({
    descriptor: module.descriptor,
    descriptorBytes: module.descriptorBytes,
    appIR: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
      module.artifactBytes.get(module.descriptor.artifacts.find((artifact) => artifact.path.endsWith("/app-ir.json"))?.path),
    )),
    artifactBytes: module.artifactBytes,
  });
  const admission = await validateModuleEffectsPair({ parent: abiInput(pair.parent), child: abiInput(pair.child) });
  if (pair.backend !== backend || admission.parent.descriptor.packagePath !== packagePaths.parent ||
      admission.child.descriptor.packagePath !== packagePaths.child) {
    throw new Error(`${backend} independently built parent/child pair was not admitted under the module ABI`);
  }
  const parentBuild = pair.parent;
  const parentModuleBytes = await readFile(parentBuild.modulePath);
  const parentModuleText = parentModuleBytes.toString("utf8");
  const parentModuleSourceCommentPolicy = createGeneratedSourceCommentPolicy(parentModuleText, {
    artifactKind: "module",
    backend,
    commentBase: buildContext.compilerWorkingDirectory,
    outputRoot: buildContext.outputRoot,
    goScriptTempRoot: buildContext.goScriptTempRoot,
  });
  const parentModuleNormalization = verifyGeneratedArtifactNormalization(
    parentModuleText,
    `${backend} parent compiled module`,
    parentModuleSourceCommentPolicy,
    { artifactKind: "module", backend, commentBase: buildContext.compilerWorkingDirectory,
      outputRoot: buildContext.outputRoot, goScriptTempRoot: buildContext.goScriptTempRoot },
  );
  const normalizedModuleSHA256 = sha256(Buffer.from(normalizeGeneratedArtifactText(parentModuleText, parentModuleSourceCommentPolicy)));
  const parentHelperPin = buildRecords[backend].parent.keyedHelper;
  const parentHelperBytes = await readFile(join(outputRoot, parentHelperPin.path));
  const parentHelperText = parentHelperBytes.toString("utf8");
  const parentHelperSourceCommentPolicy = parentHelperPin.normalization.controls.sourceCommentPolicy;
  const parentHelperNormalization = verifyGeneratedArtifactNormalization(
    parentHelperText,
    `${backend} parent keyed helper`,
    parentHelperSourceCommentPolicy,
    { artifactKind: "helper", backend, commentBase: buildContext.helperCommentBase,
      outputRoot: buildContext.outputRoot, goScriptTempRoot: buildContext.goScriptTempRoot },
  );
  const normalizedHelperSHA256 = sha256(Buffer.from(normalizeGeneratedArtifactText(parentHelperText, parentHelperSourceCommentPolicy)));
  const parentSourcePin = sourcePins["fixtures/compiled/keyedmoduleparent/app.go"];
  if (buildRecords[backend].parent.artifacts.appIR.sha256 !== pr22ParentPins[backend].appIRSHA256 ||
      normalizedModuleSHA256 !== pr22ParentPins[backend].normalizedModuleSHA256 ||
      normalizedHelperSHA256 !== pr22ParentPins[backend].normalizedHelperSHA256 ||
      parentSourcePin?.sha256 !== pr22ParentPins[backend].sourceSHA256) {
    throw new Error(`${backend} keyed parent Go ABI/source/executable output differs from the normalized PR22 contract`);
  }
  const effectProbe = await probeCompiledEffects(pair.child, { backend, outputRoot, toolchain, sourcePins });
  const mountBoundaryProbe = await probeCompiledMountBoundaries(pair.child, nativeMountBoundaries, backend);
  return {
    backend,
    parentABISHA256: admission.parent.abiSHA256,
    childABISHA256: admission.child.abiSHA256,
    parentArtifactSHA256: admission.parent.artifactSHA256,
    childArtifactSHA256: admission.child.artifactSHA256,
    parentABIUnchanged: true,
    parentABIComparison: {
      basis: "exact PR22 AppIR SHA-256, exact parent source SHA-256, and exact executable module/helper bytes after removing only anchored generated source-path comment lines",
      rawParentABISHA256: admission.parent.abiSHA256,
      rawParentArtifactSHA256: admission.parent.artifactSHA256,
      rawParentModuleSHA256: sha256(parentModuleBytes),
      rawParentHelperSHA256: sha256(parentHelperBytes),
      normalizedParentAppIRSHA256: buildRecords[backend].parent.artifacts.appIR.sha256,
      normalizedParentModuleSHA256: normalizedModuleSHA256,
      normalizedParentHelperSHA256: normalizedHelperSHA256,
      sourceSHA256: parentSourcePin.sha256,
      sourcePathCommentControls: {
        module: parentModuleNormalization,
        helper: parentHelperNormalization,
      },
    },
    effectCapabilityExtension: {
      capabilities: [...admission.child.descriptor.capabilities],
      closedEffectDescriptors: admittedEffectDescriptors,
    },
    effectProbe,
    mountBoundaryProbe,
    admitted: true,
  };
}

function goSliceItems(value, label) {
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
  const generation = stateField(state, "Generation", label);
  const requestID = stateField(state, "RequestID", label);
  const asDecimal = (value, field) => typeof value === "bigint" ? value.toString(10) :
    Number.isSafeInteger(value) ? String(value) : (() => { throw new TypeError(`${label}.${field} is not a safe integer`); })();
  return {
    key: stateField(state, "Key", label),
    generation: asDecimal(generation, "Generation"),
    mounted: stateField(state, "Mounted", label),
    requestID: asDecimal(requestID, "RequestID"),
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
    const value = {};
    for (const key of ["Kind", "Name", "Arg", "Reply"]) {
      const descriptor = Object.getOwnPropertyDescriptor(effect, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string") {
        throw new TypeError(`${label}[${index}].${key} is not a native effect field`);
      }
      value[key.toLowerCase()] = descriptor.value;
    }
    return value;
  });
}

async function probeCompiledMountBoundaries(childBuild, nativeBoundaries, backend) {
  if (nativeBoundaries?.schema !== mountBoundarySchema || !Array.isArray(nativeBoundaries.cases) ||
      nativeBoundaries.cases.length !== expectedMountBoundaryCases.length) {
    throw new Error("native mount-boundary oracle does not contain the frozen boundary case inventory");
  }
  const expectedCases = new Map(expectedMountBoundaryCases.map((item) => [item.name, item]));
  const nativeByName = new Map(nativeBoundaries.cases.map((item) => [item.name, item]));
  if (nativeByName.size !== expectedCases.size) throw new Error("native mount-boundary oracle repeats a case name");
  const component = childBuild.compiled.appIR.components[0];
  const compiled = childBuild.compiled;
  const init = compiled.symbols[component.init];
  const update = compiled.symbols[component.update];
  const view = compiled.symbols[component.view];
  if (typeof init !== "function" || typeof update !== "function" || typeof view !== "function") {
    throw new Error(`${backend} compiled mount-boundary roles are incomplete`);
  }
  const caseResults = [];
  for (const expected of expectedMountBoundaryCases) {
    const nativeCase = nativeByName.get(expected.name);
    if (!nativeCase || nativeCase.arg !== expected.arg || !Array.isArray(nativeCase.steps) ||
        nativeCase.steps.length < 1 || nativeCase.steps[0].message !== "mount" || nativeCase.steps[0].arg !== expected.arg) {
      throw new Error(`native mount-boundary case ${expected.name} differs from its frozen argument/step contract`);
    }
    let state = init();
    const steps = [];
    for (let index = 0; index < nativeCase.steps.length; index += 1) {
      const nativeStep = nativeCase.steps[index];
      const arg = nativeStep.arg ?? "";
      const result = update(state, { Name: nativeStep.message, Arg: arg });
      if (!Array.isArray(result) || result.length !== 2) throw new Error(`${backend}/${expected.name} Update did not return [State,Effects]`);
      state = result[0];
      view(state);
      const fullState = compiledFullState(state, `${expected.name}/${nativeStep.message}`);
      verifyEncodedChildUint64s(childBuild.encoder, state, component.stateType, `${expected.name}/${nativeStep.message}`);
      const effects = goSliceItems(result[1], `${expected.name}/${nativeStep.message} effects`).map((effect, effectIndex) =>
        effectTuple(effect, `${expected.name}/${nativeStep.message} effects[${effectIndex}]`));
      const nativeState = nativeStep.state;
      const nativeEffects = nativeEffectTuples(nativeStep.effects, `${expected.name}/${nativeStep.message} effects`);
      if (JSON.stringify(fullState) !== JSON.stringify(nativeState) || JSON.stringify(effects) !== JSON.stringify(nativeEffects)) {
        throw new Error(`${backend}/${expected.name}/${nativeStep.message} compiled full state or effects differ from the native Go oracle`);
      }
      if (index === 0 && fullState.Mounted !== expected.accepted) {
        throw new Error(`${backend}/${expected.name} compiler mount acceptance differs from the safe-integer boundary`);
      }
      steps.push({ message: nativeStep.message, arg, state: fullState, effects });
    }
    if (expected.name === "max-safe" || expected.name === "max-safe-cancel-retry") {
      if (!steps.some((step) => step.message === "request" && step.state.Pending &&
          step.state.Generation === Number.MAX_SAFE_INTEGER &&
          step.effects.some((effect) => effect.kind === "fixture.request" && effect.arg === "a:g9007199254740991:r1"))) {
        throw new Error(`${backend}/${expected.name} did not format and commit a request at the maximum safe generation`);
      }
      if (expected.name === "max-safe" && !steps.some((step) => step.message === "complete" && !step.state.Pending &&
          step.state.Reply === "a:g9007199254740991:r1")) {
        throw new Error(`${backend}/max-safe did not complete a request at the maximum safe generation`);
      }
      if (expected.name === "max-safe-cancel-retry" && !steps.some((step) => step.message === "cancel" && !step.state.Pending &&
          step.effects.some((effect) => effect.kind === "lifecycle.cancel" && effect.arg === "a:g9007199254740991:r1"))) {
        throw new Error(`${backend}/max-safe-cancel did not cancel a request at the maximum safe generation`);
      }
    }
    caseResults.push({ name: expected.name, arg: expected.arg, accepted: expected.accepted, steps });
  }
  return { schema: mountBoundarySchema, backend, cases: caseResults, nativeParity: true };
}

async function probeCompiledEffects(childBuild, { backend, outputRoot, toolchain, sourcePins }) {
  const progress = [];
  const stateSnapshots = [];
  const probePath = join(outputRoot, "metadata", `${backend}-child`, "effect-probe.json");
  const sourcePin = sourcePins["fixtures/compiled/effectmodulechild/app.go"];
  const probe = {
    schema: "gobi.module-effects-compiled-probe/v1",
    status: "running",
    backend,
    packagePath: packagePaths.child,
    sourcePin,
    toolchain,
    steps: progress,
  };
  try {
  const [compiledModule, encoderModule] = await Promise.all([
    import(pathToFileURL(childBuild.modulePath).href),
    import(pathToFileURL(childBuild.encoderPath).href),
  ]);
  const compiled = compiledModule.gobiCompiled;
  const component = childBuild.compiled.appIR.components[0];
  const init = compiled?.symbols?.[component.init];
  const update = compiled?.symbols?.[component.update];
  const view = compiled?.symbols?.[component.view];
  if (typeof init !== "function" || typeof update !== "function" || typeof view !== "function" ||
      typeof compiledModule.gobiModuleBridges?.input !== "function" ||
      typeof compiledModule.gobiModuleBridges?.publication !== "function" || typeof encoderModule.gobiEncodeState !== "function") {
    throw new Error("compiled effect child standard module roles are incomplete");
  }
  const observations = [];
  const snapshot = (step, value) => {
    const row = { step, ...compiledStateSnapshot(value, step) };
    stateSnapshots.push(row);
    return row;
  };
  const tick = (state, name, arg = "") => {
    const result = update(state, { Name: name, Arg: arg });
    if (!Array.isArray(result) || result.length !== 2) throw new Error(`compiled effect child Update(${name}) did not return [State,Effects]`);
    return { state: result[0], effects: goSliceItems(result[1], `Update(${name}).Effects`).map((effect, index) => {
      const tuple = effectTuple(effect, `Update(${name}).Effects[${index}]`);
      observations.push(tuple);
      return tuple;
    }) };
  };
  let state = init();
  view(state);
  snapshot("initial", state);
  progress.push({ step: "Init+View", passed: true });
  let result = tick(state, "mount", "a:g1");
  state = result.state;
  if (result.effects.length !== 0) throw new Error("compiled mount emitted an effect");
  if (!snapshot("mount", state).mounted) throw new Error("compiled mount did not commit mounted state");
  progress.push({ step: "mount", effects: result.effects });
  state = compiledModule.gobiModuleBridges.input(state, { Step: 2, Locked: false, Revision: 1 });
  const inputState = snapshot("input", state);
  const publication = compiledModule.gobiModuleBridges.publication(state);
  if (publication?.Revision !== 1 || typeof publication.Count !== "number" ||
      inputState.coreStep !== 2 || inputState.coreLocked !== false || inputState.coreInputRevision !== 1) {
    throw new Error("compiled Input/Publication bridge roles returned an invalid projection or publication");
  }
  progress.push({ step: "Input+Publication", publication });
  view(state);
  result = tick(state, "request");
  state = result.state;
  const requestState = snapshot("request", state);
  if (JSON.stringify(result.effects) !== JSON.stringify([{ kind: "fixture.request", name: "save", arg: "a:g1:r1", reply: "complete" }])) {
    throw new Error("compiled request effect differs from the closed fixture.request descriptor");
  }
  if (!requestState.pending || requestState.requestID !== "1" || requestState.token !== "a:g1:r1") {
    throw new Error("compiled request did not commit Go-owned pending/token state before returning the effect");
  }
  progress.push({ step: "request", effects: result.effects });
  result = tick(state, "cancel");
  state = result.state;
  const cancelState = snapshot("cancel", state);
  if (JSON.stringify(result.effects) !== JSON.stringify([{ kind: "lifecycle.cancel", name: "cancel", arg: "a:g1:r1", reply: "" }])) {
    throw new Error("compiled explicit cancellation differs from the closed lifecycle.cancel descriptor");
  }
  if (cancelState.pending || cancelState.token !== "a:g1:r1") throw new Error("compiled cancellation did not clear pending state and retain request identity");
  progress.push({ step: "cancel", effects: result.effects });
  result = tick(state, "request");
  state = result.state;
  const retryState = snapshot("retry", state);
  if (JSON.stringify(result.effects) !== JSON.stringify([{ kind: "fixture.request", name: "save", arg: "a:g1:r2", reply: "complete" }])) {
    throw new Error("compiled request retry did not advance the Go-owned request ID");
  }
  if (!retryState.pending || retryState.requestID !== "2" || retryState.token !== "a:g1:r2") throw new Error("compiled retry state did not advance its Go-owned request ID");
  progress.push({ step: "retry", effects: result.effects });
  result = tick(state, "unmount", "a:g1");
  state = result.state;
  const unmountState = snapshot("unmount", state);
  if (JSON.stringify(result.effects) !== JSON.stringify([{ kind: "lifecycle.cancel", name: "cancel", arg: "a:g1:r2", reply: "" }])) {
    throw new Error("compiled unmount did not return Go-owned lifecycle cancellation");
  }
  if (unmountState.mounted || unmountState.pending) throw new Error("compiled unmount did not commit retired Go state before cancellation");
  progress.push({ step: "unmount", effects: result.effects });
  view(state);
  const beforeStale = JSON.stringify(encoderModule.gobiEncodeState(state, component.stateType));
  result = tick(state, "complete", "a:g1:r2");
  snapshot("stale-complete", result.state);
  const afterStale = JSON.stringify(encoderModule.gobiEncodeState(result.state, component.stateType));
  if (result.effects.length !== 0 || beforeStale !== afterStale) throw new Error("compiled stale completion mutated an unmounted child");
  const uniqueDescriptorCount = new Set(observations.map(({ kind, name, reply }) => JSON.stringify([kind, name, reply]))).size;
  if (observations.length !== 4 || uniqueDescriptorCount !== admittedEffectDescriptors.length) {
    throw new Error("compiled effect probe did not exercise exactly four effects across the two closed descriptors");
  }
  const resultRecord = {
    schema: "gobi.module-effects-compiled-probe/v1",
    status: "passed",
    backend,
    packagePath: packagePaths.child,
    observedCount: observations.length,
    uniqueDescriptorCount,
    observations,
    stateSnapshots,
    standardRoles: ["Init", "Update", "View", "Input", "Publication"],
    inputPublication: publication,
    requestAndCancelEffectsMatchClosedDescriptors: true,
    staleReplyNoopAfterUnmount: true,
    steps: progress,
  };
  await writeJSON(probePath, resultRecord, { exclusive: true });
  return resultRecord;
  } catch (error) {
    probe.status = "failed";
    probe.error = error?.stack ?? String(error);
    await writeJSON(probePath, probe, { exclusive: true });
    throw error;
  }
}

async function verifyHelperRuntime({ outputRoot, backend, parentBuild, helper }) {
  const modulePath = join(outputRoot, parentBuild.outputDir, parentBuild.artifactPaths.module);
  const encoderPath = join(outputRoot, parentBuild.outputDir, parentBuild.artifactPaths.encoder);
  const helperPath = join(outputRoot, helper.path);
  const [compiledModule, encoderModule, helperModule] = await Promise.all([
    import(pathToFileURL(modulePath).href),
    import(pathToFileURL(encoderPath).href),
    import(pathToFileURL(helperPath).href),
  ]);
  const keyed = helperModule[helperExport];
  if (!compiledModule.gobiCompiled || !compiledModule.gobiModuleBridges ||
      !encoderModule.gobiEncodeState || !keyed || helperMembers.some((name) => typeof keyed[name] !== "function")) {
    throw new Error(`${backend} parent module or keyed helper exports are incomplete`);
  }
  const component = parentBuild.appIR.components[0];
  const init = compiledModule.gobiCompiled.symbols[component.init];
  const update = compiledModule.gobiCompiled.symbols[component.update];
  const view = compiledModule.gobiCompiled.symbols[component.view];
  if (typeof init !== "function" || typeof update !== "function" || typeof view !== "function") {
    throw new Error(`${backend} parent's standard compiler symbols are incomplete`);
  }
  const state = init();
  const initialChildren = keyed.children(state);
  const expectedChildren = [{ key: "a", generation: 1 }, { key: "b", generation: 1 }];
  if (JSON.stringify(initialChildren) !== JSON.stringify(expectedChildren) ||
      !Object.isFrozen(initialChildren) || initialChildren.some((child) => !Object.isFrozen(child)) ||
      !keyed.isCurrent(state, "a", 1) || keyed.isCurrent(state, "a", 2)) {
    throw new Error(`${backend} keyed helper did not expose the initial Go-owned a/b generations safely`);
  }
  const beforeReceive = JSON.stringify(encoderModule.gobiEncodeState(state, component.stateType));
  const received = keyed.receiveKeyed(state, "a", 1, { Count: 2, Revision: 1 });
  const afterReceive = JSON.stringify(encoderModule.gobiEncodeState(state, component.stateType));
  if (received === state || beforeReceive !== afterReceive) throw new Error(`${backend} ReceiveKeyed changed its Go value input or returned the same state object`);
  const encoded = encoderModule.gobiEncodeState(received, component.stateType);
  if (!encoded || encoded.typeId !== component.stateType) throw new Error(`${backend} helper-produced state cannot be encoded by the compiler encoder`);
  const updateResult = update(received, { Name: "step.up", Arg: "" });
  if (!Array.isArray(updateResult) || updateResult.length !== 2) throw new Error(`${backend} standard Update rejected helper-produced state`);
  view(updateResult[0]);
  const output = compiledModule.gobiModuleBridges.output(updateResult[0]);
  if (!output || output.Step !== 2 || output.Locked !== false || output.Revision !== 2) {
    throw new Error(`${backend} standard Output rejected helper-produced state`);
  }
  const reordered = update(updateResult[0], { Name: "children.reorder", Arg: "b,a" });
  const reorderedChildren = keyed.children(reordered[0]);
  if (JSON.stringify(reorderedChildren) !== JSON.stringify([{ key: "b", generation: 1 }, { key: "a", generation: 1 }])) {
    throw new Error(`${backend} keyed helper did not preserve Go-owned reorder state`);
  }
  const removed = update(reordered[0], { Name: "child.remove", Arg: "a" });
  const remounted = update(removed[0], { Name: "child.add", Arg: "a" });
  if (keyed.isCurrent(remounted[0], "a", 1) || !keyed.isCurrent(remounted[0], "a", 2) ||
      JSON.stringify(keyed.children(remounted[0])) !== JSON.stringify([{ key: "b", generation: 1 }, { key: "a", generation: 2 }])) {
    throw new Error(`${backend} keyed helper did not fence the old generation after remount`);
  }
  return {
    backend,
    initialChildren,
    childSnapshotDetached: true,
    crossAdapterStateAccepted: true,
    parentStateNotMutatedByReceiveKeyed: true,
    remountGenerationFenced: true,
    standardOutput: output,
  };
}

async function collectToolchain(metadataDir) {
  const nodeVersion = process.version;
  if (Number(nodeVersion.split(".")[0].slice(1)) !== 22) throw new Error(`Node 22 is required, got ${nodeVersion}`);
  const goVersionText = await runRecorded("root-go-version", goExecutable, ["version"], {
    cwd: root,
    env: rootGoEnv,
    metadataDir,
  });
  if (!/go1\.24\./.test(goVersionText)) throw new Error(`Go 1.24 is required, got ${goVersionText.trim()}`);
  const compilerVersionText = await runRecorded("compiler-go-version", goExecutable, ["version"], {
    cwd: compilerDir,
    env: compilerEnv,
    metadataDir,
  });
  if (!/go1\.27\.3/.test(compilerVersionText)) throw new Error(`compiler Go 1.27.3 is required, got ${compilerVersionText.trim()}`);
  const goMod = await readFile(join(compilerDir, "go.mod"), "utf8");
  const goscript = goMod.match(/^\s*github\.com\/s4wave\/goscript\s+(\S+)/m)?.[1];
  if (goscript !== "v0.6.2") throw new Error(`GoScript v0.6.2 is required, got ${goscript ?? "missing"}`);
  const esbuildPkg = JSON.parse(await readFile(join(compilerDir, "node_modules/esbuild/package.json"), "utf8"));
  if (esbuildPkg.version !== "0.28.2") throw new Error(`esbuild 0.28.2 is required, got ${esbuildPkg.version}`);
  return {
    node: nodeVersion,
    rootGo: goVersionText.trim(),
    compilerGo: compilerVersionText.trim().replace(/^go version /, ""),
    goscript,
    esbuild: esbuildPkg.version,
  };
}

async function collectNativeMountBoundaries(outputRoot, metadataRoot) {
  const metadataDir = join(metadataRoot, "native-mount-boundaries");
  const stdout = await runRecorded("native-mount-boundaries", goExecutable, ["run", "./cmd/module-effects-native", "--mount-boundaries"], {
    cwd: root,
    env: rootGoEnv,
    metadataDir,
  });
  const native = parseSingleJSON(stdout, "native mount-boundary oracle");
  if (native?.schema !== mountBoundarySchema || !Array.isArray(native.cases)) {
    throw new Error("native mount-boundary command returned an invalid schema");
  }
  const resultPin = await writeJSON(join(metadataDir, "result.json"), native, { exclusive: true });
  const pin = await filePin(resultPin.path, outputRoot);
  const expectedNames = expectedMountBoundaryCases.map(({ name }) => name);
  if (JSON.stringify(native.cases.map(({ name }) => name)) !== JSON.stringify(expectedNames)) {
    throw new Error("native mount-boundary command returned a different closed case inventory");
  }
  return {
    native,
    record: { schema: native.schema, ...pin, caseNames: expectedNames },
  };
}

async function buildOne({ backend, role, outputRoot, metadataRoot }) {
  const outputDir = join(outputRoot, `${backend}-${role}`);
  const metadataDir = join(metadataRoot, `${backend}-${role}`);
  await mkdir(metadataDir, { recursive: true });
  const request = {
    schema: "gobi.build-request/v1",
    sourceRoot: root,
    entryPackages: [packagePaths[role]],
    backend,
    outputDir,
  };
  const requestBytes = Buffer.from(`${JSON.stringify(request)}\n`);
  await writeFile(join(metadataDir, "request.json"), requestBytes, { flag: "wx", mode: 0o644 });
  let stdout;
  try {
    stdout = await runRecorded(`build-${backend}-${role}`, goExecutable, ["run", "./cmd/gobi-build"], {
      cwd: compilerDir,
      env: { ...compilerEnv, GOBI_NODE: nodeExecutable, GOBI_GO_BIN: goExecutable },
      input: requestBytes,
      metadataDir,
    });
  } catch (error) {
    const rawStdout = await readFile(join(metadataDir, `build-${backend}-${role}.stdout.bin`), "utf8");
    try {
      const failedBuildResult = parseSingleJSON(rawStdout, `failed build-${backend}-${role}`);
      await writeJSON(join(metadataDir, "build-result.json"), failedBuildResult, { exclusive: true });
    } catch (parseError) {
      if (parseError?.code !== "EEXIST") {
        await writeJSON(join(metadataDir, "build-result-parse-failure.json"), {
          command: `build-${backend}-${role}`,
          error: String(parseError?.stack ?? parseError),
          stdout: { bytes: Buffer.byteLength(rawStdout), sha256: sha256(Buffer.from(rawStdout)) },
        }, { exclusive: true });
      }
    }
    throw error;
  }
  const buildResult = parseSingleJSON(stdout, `build-${backend}-${role}`);
  await writeJSON(join(metadataDir, "build-result.json"), buildResult, { exclusive: true });
  const verified = await verifyCompilerBuild({ backend, role, outputRoot, outputDir, buildResult });
  verified.resultPath = relative(outputRoot, join(metadataDir, "build-result.json")).split(sep).join("/");
  verified.outputs = buildResult.outputs;
  return verified;
}

async function addBuildRecord({ outputRoot, build, helper }) {
  const baseDir = build.outputDir;
  const resultPin = await filePin(join(outputRoot, build.resultPath), outputRoot);
  const pathPins = {};
  for (const [name, relativePath] of Object.entries(build.artifactPaths)) {
    pathPins[name] = await filePin(join(outputRoot, baseDir, relativePath), outputRoot);
  }
  const descriptorArtifacts = [];
  for (const item of build.descriptor.artifacts) {
    const path = join(outputRoot, baseDir, item.path);
    const pin = await filePin(path, outputRoot);
    if (pin.bytes !== item.bytes || pin.sha256 !== item.sha256) throw new Error(`${build.backend}/${build.role} ABI artifact digest mismatch: ${item.path}`);
    descriptorArtifacts.push(item);
  }
  const appIRPin = pathPins.appIR;
  const abiPin = pathPins.moduleABI;
  return {
    backend: build.backend,
    role: build.role,
    packagePath: build.packagePath,
    componentId: build.componentId,
    outputDir: baseDir,
    manifestPath: build.manifestPath,
    resultPath: build.resultPath,
    result: resultPin,
    manifest: build.manifest,
    outputCount: build.buildResult.outputCount,
    outputs: build.outputs,
    artifacts: {
      appIR: pathPins.appIR,
      module: pathPins.module,
      encoder: pathPins.encoder,
      components: pathPins.components,
      moduleABI: {
        ...abiPin,
        abiSHA256: build.descriptor.abiSHA256,
        artifactSHA256: build.descriptor.artifactSHA256,
        artifacts: descriptorArtifacts,
      },
    },
    ...(helper ? { keyedHelper: {
      path: helper.path,
      bytes: helper.bytes,
      sha256: helper.sha256,
      descriptorPath: helper.descriptorPath,
      descriptorBytes: helper.descriptorBytes,
      descriptorSha256: helper.descriptorSha256,
      exportName: helper.exportName,
      members: helper.members,
      sourceIdentity: helper.descriptor.sourceIdentity,
      normalization: helper.normalization,
    } } : {}),
  };
}

async function buildAll(outputRoot) {
  outputRoot = resolve(outputRoot);
  const buildContext = {
    schema: "gobi.module-effects-build-context/v1",
    repositoryRoot: root,
    compilerWorkingDirectory: compilerDir,
    outputRoot,
    goScriptTempRoot: tmpdir(),
    helperCommentBase: resolve(here, ".."),
  };
  await mkdir(outputRoot, { recursive: true });
  const existing = await readdir(outputRoot);
  if (existing.length !== 0) throw new Error(`output directory must be empty before starting: ${outputRoot}`);
  const metadataRoot = join(outputRoot, "metadata");
  await mkdir(metadataRoot, { recursive: true });
  const toolchain = await collectToolchain(join(metadataRoot, "toolchain"));
  await writeJSON(join(metadataRoot, "toolchain/toolchain.json"), toolchain, { exclusive: true });
  const sourcePins = await collectSourcePins();
  await writeJSON(join(metadataRoot, "source-pins.json"), sourcePins, { exclusive: true });
  const nativeMountBoundaries = await collectNativeMountBoundaries(outputRoot, metadataRoot);
  const builds = { react: {}, dom: {} };
  const verified = { react: {}, dom: {} };
  for (const backend of ["react", "dom"]) {
    for (const role of ["parent", "child"]) {
      const build = await buildOne({ backend, role, outputRoot, metadataRoot });
      verified[backend][role] = build;
      const helper = role === "parent"
        ? await buildHelperAdapter({ backend, outputDir: join(outputRoot, build.outputDir), outputRoot, build, metadataDir: join(metadataRoot, `${backend}-${role}`), buildContext })
        : null;
      builds[backend][role] = await addBuildRecord({ outputRoot, build, helper });
    }
  }

  const admission = {};
  const adapterChecks = {};
  for (const backend of ["react", "dom"]) {
    admission[backend] = await verifyCompiledModulePair({
      backend,
      outputRoot,
      buildRecords: builds,
      toolchain,
      sourcePins,
      nativeMountBoundaries: nativeMountBoundaries.native,
      buildContext,
    });
    adapterChecks[backend] = await verifyHelperRuntime({ outputRoot, backend, parentBuild: verified[backend].parent, helper: builds[backend].parent.keyedHelper });
  }
  const inventory = Object.entries(builds).flatMap(([backend, roles]) => Object.entries(roles).map(([role, build]) => ({
    backend,
    role,
    packagePath: build.packagePath,
    componentId: build.componentId,
    outputDir: build.outputDir,
    outputCount: build.outputCount,
    manifest: build.manifest,
    result: build.result,
    outputs: build.outputs,
    artifacts: build.artifacts,
    keyedHelper: build.keyedHelper ?? null,
  })));
  const actualBuildCount = commandRecords.filter((command) => /^build-(react|dom)-(parent|child)$/.test(command.name)).length;
  if (actualBuildCount !== 4) throw new Error(`expected four independent GoScript builds, observed ${actualBuildCount}`);
  const index = {
    schema: indexSchema,
    buildContext,
    parentPackagePath: packagePaths.parent,
    childPackagePath: packagePaths.child,
    outputRoot: ".",
    actualBuildCount,
    toolchain,
    closedEffectDescriptors: admittedEffectDescriptors,
    nativeMountBoundaries: nativeMountBoundaries.record,
    builds,
    inventory,
    sourcePins,
    admission,
    adapterChecks,
    commands: commandRecords,
  };
  const indexPin = await writeJSON(join(outputRoot, "build-index.json"), index, { exclusive: true });
  return {
    schema: "gobi.module-effects-build-result/v1",
    outputRoot,
    actualBuildCount: commandRecords.filter((command) => command.name.startsWith("build-") && command.name !== "build-index").length,
    buildIndex: { path: indexPin.path, bytes: indexPin.bytes, sha256: indexPin.sha256 },
    toolchain,
    nativeMountBoundaries: nativeMountBoundaries.record,
    inventory,
    builds: Object.fromEntries(Object.entries(builds).map(([backend, roles]) => [backend, Object.fromEntries(
      Object.entries(roles).map(([role, build]) => [role, {
        packagePath: build.packagePath,
        componentId: build.componentId,
        outputCount: build.outputCount,
        abiSHA256: build.artifacts.moduleABI.abiSHA256,
        helperSHA256: build.keyedHelper?.sha256 ?? null,
      }]),
    )])),
    admission,
    adapterChecks,
    sourcePins,
    commands: commandRecords,
  };
}

async function collectSourcePins() {
  const paths = new Set([
    "go.mod",
    "compiled-frontend/go.mod",
    "compiled-frontend/go.sum",
    "compiled-module-effects/build/build.mjs",
    "compiled-module-effects/build/abi-admission.mjs",
    "compiled-module-effects/build/module-loader.mjs",
    "compiled-module-effects/build/source-comments.mjs",
    "compiled-module-effects/build/path-normalization.test.mjs",
  ]);
  const directories = [
    "fixtures/compiled/effectmodulechild",
    "fixtures/compiled/keyedmoduleparent",
    "fixtures/compiled/modulechild",
    "fixtures/compiled/modulewire",
    "fixtures/compiled/keyedmodulewire",
    "counter",
    "cmd/module-effects-native",
    "gobi",
    "moduleabi",
    "compiled-frontend/analyze",
    "compiled-frontend/build",
    "compiled-frontend/emit",
    "compiled-frontend/cmd/gobi-build",
  ];
  for (const directory of directories) {
    for (const path of await walkRegularFiles(join(root, directory))) {
      const ext = path.slice(path.lastIndexOf("."));
      if ([".go", ".mjs", ".ts", ".json"].includes(ext)) paths.add(relative(root, path).split(sep).join("/"));
    }
  }
  const pins = {};
  for (const path of [...paths].sort()) pins[path] = await filePin(join(root, path), root);
  return pins;
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Usage: node compiled-module-effects/build/build.mjs --output <empty-output-directory>\n");
  } else {
    const summary = await buildAll(args.output);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }
} catch (error) {
  die(error?.stack ?? String(error));
}
