import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const compilerDir = join(root, "compiled-frontend");
const compilerBundle = join(compilerDir, "build/bundle.mjs");
const wirePackage = "github.com/samuelpmahan/gondola/fixtures/compiled/modulewire";
const keyedWirePackage = "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmodulewire";
const packagePaths = Object.freeze({
  parent: "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent",
  child: "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild",
});
const helperExport = "gobiKeyedModuleHelpers";
const helperMembers = Object.freeze(["children", "receiveKeyed", "isCurrent"]);
const helperSchema = "gobi.keyed-module-helpers/v1";
const indexSchema = "gobi.keyed-module-build-index/v1";
const rootGoEnv = { GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" };
const compilerEnv = { GOTOOLCHAIN: "go1.27.3", GOFLAGS: "-buildvcs=false" };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const commandRecords = [];

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = { output: join(here, "output") };
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

async function buildHelperAdapter({ backend, outputDir, outputRoot, build, metadataDir }) {
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
    descriptor: helperDescriptor,
  };
}

async function verifyCompiledModulePair({ backend, outputRoot, buildRecords }) {
  const { loadModulePairBuilds } = await import(pathToFileURL(join(root, "compiled-modules/conformance/module-loader.mjs")).href);
  const { validateModulePair } = await import(pathToFileURL(join(root, "compiled-modules/abi/validate.mjs")).href);
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
  const admission = await validateModulePair({ parent: abiInput(pair.parent), child: abiInput(pair.child) });
  if (pair.backend !== backend || admission.parent.descriptor.packagePath !== packagePaths.parent ||
      admission.child.descriptor.packagePath !== packagePaths.child) {
    throw new Error(`${backend} independently built parent/child pair was not admitted under the module ABI`);
  }
  return {
    backend,
    parentABISHA256: admission.parent.abiSHA256,
    childABISHA256: admission.child.abiSHA256,
    parentArtifactSHA256: admission.parent.artifactSHA256,
    childArtifactSHA256: admission.child.artifactSHA256,
    admitted: true,
  };
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
  const stdout = await runRecorded(`build-${backend}-${role}`, goExecutable, ["run", "./cmd/gobi-build"], {
    cwd: compilerDir,
    env: { ...compilerEnv, GOBI_NODE: nodeExecutable, GOBI_GO_BIN: goExecutable },
    input: requestBytes,
    metadataDir,
  });
  const buildResult = parseSingleJSON(stdout, `build-${backend}-${role}`);
  await writeJSON(join(metadataDir, "build-result.json"), buildResult, { exclusive: true });
  const verified = await verifyCompilerBuild({ backend, role, outputRoot, outputDir, buildResult });
  verified.resultPath = relative(outputRoot, join(metadataDir, "build-result.json")).split(sep).join("/");
  verified.outputs = buildResult.outputs;
  return verified;
}

async function addBuildRecord({ outputRoot, build, helper }) {
  const baseDir = build.outputDir;
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
    } } : {}),
  };
}

async function buildAll(outputRoot) {
  await mkdir(outputRoot, { recursive: true });
  const existing = await readdir(outputRoot);
  if (existing.length !== 0) throw new Error(`output directory must be empty before starting: ${outputRoot}`);
  const metadataRoot = join(outputRoot, "metadata");
  await mkdir(metadataRoot, { recursive: true });
  const toolchain = await collectToolchain(join(metadataRoot, "toolchain"));
  const builds = { react: {}, dom: {} };
  const verified = { react: {}, dom: {} };
  for (const backend of ["react", "dom"]) {
    for (const role of ["parent", "child"]) {
      const build = await buildOne({ backend, role, outputRoot, metadataRoot });
      verified[backend][role] = build;
      const helper = role === "parent"
        ? await buildHelperAdapter({ backend, outputDir: join(outputRoot, build.outputDir), outputRoot, build, metadataDir: join(metadataRoot, `${backend}-${role}`) })
        : null;
      builds[backend][role] = await addBuildRecord({ outputRoot, build, helper });
    }
  }

  const admission = {};
  const adapterChecks = {};
  for (const backend of ["react", "dom"]) {
    admission[backend] = await verifyCompiledModulePair({ backend, outputRoot, buildRecords: builds });
    adapterChecks[backend] = await verifyHelperRuntime({ outputRoot, backend, parentBuild: verified[backend].parent, helper: builds[backend].parent.keyedHelper });
  }
  const index = {
    schema: indexSchema,
    parentPackagePath: packagePaths.parent,
    childPackagePath: packagePaths.child,
    outputRoot: ".",
    toolchain,
    builds,
    admission,
    adapterChecks,
    commands: commandRecords,
  };
  const indexPin = await writeJSON(join(outputRoot, "build-index.json"), index, { exclusive: true });
  return {
    schema: "gobi.keyed-module-build-result/v1",
    outputRoot,
    buildIndex: { path: indexPin.path, bytes: indexPin.bytes, sha256: indexPin.sha256 },
    toolchain,
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
    commands: commandRecords,
  };
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Usage: node compiled-keyed-modules/build/build.mjs --output <empty-output-directory>\n");
  } else {
    const summary = await buildAll(args.output);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }
} catch (error) {
  die(error?.stack ?? String(error));
}
