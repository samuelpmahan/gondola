import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, lstat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const [outputArg, resultArg, failureArg, duplicateArg, missingArg] = process.argv.slice(2);
assert.ok(outputArg && resultArg && failureArg && duplicateArg && missingArg, "expected output and four result paths");
const outputRoot = resolve(outputArg);
const buildResult = JSON.parse(await readFile(resolve(resultArg), "utf8"));
assert.equal(buildResult.schema, "gobi.build-result/v1");
assert.equal(buildResult.ok, true);
assert.equal(buildResult.preservedPreviousOutput, false);
const manifest = JSON.parse(await readFile(join(outputRoot, "buildmanifest.json"), "utf8"));
assert.equal(manifest.schema, "gobi.build-manifest/v1");
assert.equal(manifest.forwarderModule, "gobi.generated/compiled");
assert.equal(manifest.apps.length, 4);
assert.equal(manifest.emittedTypeScript.length, 186);
assert.equal(manifest.forwarderSources.length, 5);
assert.equal(manifest.forwarderSources.filter((item) => item.endsWith(".go")).length, 4);
assert.ok(manifest.forwarderSources.includes("forwarders/go.mod"));
const forwarderGoMod = await readFile(join(outputRoot, manifest.forwarderGoMod), "utf8");
assert.match(forwarderGoMod, /^module gobi\.generated\/compiled$/m);
assert.match(forwarderGoMod, /replace github\.com\/samuelpmahan\/gondola => "\/workspace\/scratch\/39a56936f173\/gondola-compiled"/);

async function walk(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`unexpected symlink in output: ${relativePath}`);
    if (entry.isDirectory()) files.push(...await walk(path, relativePath));
    else if (entry.isFile()) files.push(relativePath);
    else throw new Error(`unexpected output entry type: ${relativePath}`);
  }
  return files;
}

const diskFiles = (await walk(outputRoot)).sort();
const resultFiles = buildResult.outputs.map((item) => item.path).sort();
assert.equal(buildResult.outputs.length, 209);
assert.equal(diskFiles.length, 209);
assert.deepEqual(diskFiles, resultFiles, "output tree and BuildResult inventory differ");
const digestList = [];
for (const item of buildResult.outputs) {
  assert.ok(!item.path.startsWith("/") && !item.path.split("/").includes(".."), `unsafe output path: ${item.path}`);
  const file = resolve(outputRoot, item.path);
  assert.ok(file.startsWith(`${outputRoot}${sep}`), `output path escaped root: ${item.path}`);
  const data = await readFile(file);
  assert.equal(data.byteLength, item.bytes, `${item.path}: byte count mismatch`);
  const sha256 = createHash("sha256").update(data).digest("hex");
  assert.equal(sha256, item.sha256, `${item.path}: hash mismatch`);
  digestList.push({ path: item.path, sha256, bytes: data.byteLength });
}

const apps = [];
for (const app of manifest.apps) {
  assert.equal(app.roleBindings.length, 3);
  assert.deepEqual(app.roleBindings.map((binding) => binding.role), ["init", "update", "view"]);
  assert.deepEqual(app.roleBindings.map((binding) => binding.appIRSymbol), [
    `${app.componentId}.Init`, `${app.componentId}.Update`, `${app.componentId}.View`,
  ]);
  const appIR = JSON.parse(await readFile(join(outputRoot, app.appIR), "utf8"));
  const component = appIR.components.find((candidate) => candidate.id === app.componentId);
  assert.ok(component, `${app.packagePath}: component missing from AppIR`);
  for (const binding of app.roleBindings) assert.equal(component[binding.role], binding.appIRSymbol);

  const forwarderPath = `forwarders/facades/${basename(app.forwarderPackage)}/forwarder.go`;
  assert.ok(manifest.forwarderSources.includes(forwarderPath));
  const forwarderGo = await readFile(join(outputRoot, forwarderPath), "utf8");
  assert.ok(forwarderGo.includes(`"${app.packagePath}"`), `${app.packagePath}: forwarder does not import its original Go package`);
  for (const role of ["Init", "Update", "View"]) {
    assert.match(forwarderGo, new RegExp(`return gobiApp\\.${role}\\(`), `${app.packagePath}: Go ${role} forwarder missing direct app call`);
  }
  const componentsSource = await readFile(join(outputRoot, `apps/${basename(app.forwarderPackage)}/components.gen.mjs`), "utf8");
  assert.match(componentsSource, /Generated from validated compilercontract\.AppIR/);
  assert.doesNotMatch(componentsSource, /\bfunction\s+(?:Init|Update|View)\s*\(/, `${app.packagePath}: components metadata contains a JavaScript role implementation`);
  const emittedForwarder = `emitted-ts/@goscript/${app.forwarderPackage}/forwarder.gs.ts`;
  assert.ok(manifest.emittedTypeScript.includes(emittedForwarder));
  const emittedTs = await readFile(join(outputRoot, emittedForwarder), "utf8");
  assert.match(emittedTs, /export function GobiCompiledUpdate\(/);
  assert.match(emittedTs, /Update\(\(state\)\.clone\(\), message\)/, `${app.packagePath}: emitted GoScript Update lacks Go value-copy clone`);

  const moduleUrl = pathToFileURL(join(outputRoot, app.module));
  const { gobiCompiled } = await import(moduleUrl);
  const symbols = gobiCompiled.symbols;
  const symbolKeys = Object.keys(symbols).sort();
  assert.deepEqual(symbolKeys, [component.init, component.update, component.view].sort());
  const init = symbols[component.init];
  const update = symbols[component.update];
  const view = symbols[component.view];
  for (const [name, fn] of [["Init", init], ["Update", update], ["View", view]]) assert.equal(typeof fn, "function", `${app.packagePath}: ${name} export not callable`);
  const state = init();
  const message = app.packagePath.endsWith("/counter") ? { Name: "add", Arg: "" } : { Name: "__n5-unhandled-probe__", Arg: "" };
  const [next, effects] = update(state, message);
  assert.notEqual(next, state, `${app.packagePath}: forwarding Update did not return a cloned value`);
  const viewValue = view(next);
  assert.ok(viewValue && typeof viewValue === "object", `${app.packagePath}: View returned no object`);
  const encoder = await import(pathToFileURL(join(outputRoot, app.encoder)));
  const encoded = encoder.gobiEncodeState(next, component.stateType);
  assert.equal(encoded.typeId, component.stateType);
  assert.equal(encoded.kind, "struct");
  if (app.packagePath.endsWith("/counter")) {
    assert.equal(state.Count, 0, "counter Update mutated the input instead of its forwarded clone");
    assert.equal(next.Count, 1, "counter Update did not execute actual add transition");
  }
  apps.push({
    packagePath: app.packagePath,
    componentId: app.componentId,
    roleSymbols: symbolKeys,
    initType: state.constructor?.name ?? typeof state,
    updateReturnedDistinctValue: next !== state,
    viewType: viewValue.constructor?.name ?? typeof viewValue,
    goForwarderCallsOriginalPackage: true,
    componentModuleIsMetadataOnly: true,
    effectsShape: effects === null ? "nil" : Array.isArray(effects) ? "array" : typeof effects,
    encodedStateKind: encoded.kind,
    counterBusinessTransition: app.packagePath.endsWith("/counter") ? { inputCount: state.Count, outputCount: next.Count } : null,
  });
}

async function readResult(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}
const failure = await readResult(failureArg);
const duplicate = await readResult(duplicateArg);
const missing = await readResult(missingArg);
for (const [label, result] of [["source failure", failure], ["duplicate field", duplicate], ["missing field", missing]]) {
  assert.equal(result.schema, "gobi.build-result/v1", `${label}: result schema`);
  assert.equal(result.ok, false, `${label}: result unexpectedly ok`);
}
assert.equal(failure.preservedPreviousOutput, true);
assert.equal(failure.outputs.length, 0);
for (const item of buildResult.outputs) {
  const bytes = await readFile(join(outputRoot, item.path));
  assert.equal(bytes.byteLength, item.bytes, `${item.path}: failed attempt changed output byte count`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), item.sha256, `${item.path}: failed attempt changed old output hash`);
}
assert.ok(failure.diagnostics.some((item) => /does-not-exist/.test(item.message)), "failure result lacks missing-package diagnostic");
assert.ok(duplicate.diagnostics.some((item) => /duplicate build request field/.test(item.message)), "duplicate request lacks strict duplicate-field diagnostic");
assert.ok(missing.diagnostics.some((item) => /missing required build request field/.test(item.message)), "missing request lacks required-field diagnostic");

console.log(JSON.stringify({
  schema: "gobi.n5-semantic-audit/v1",
  toolchain: { node: process.version, outputDirectory: outputRoot },
  output: { manifestCount: buildResult.outputs.length, diskCount: diskFiles.length, allHashesAndByteCountsMatched: true, buildManifestListed: resultFiles.includes("buildmanifest.json") },
  inventory: { emittedTypeScript: manifest.emittedTypeScript.length, forwarderSources: manifest.forwarderSources.length, forwarderGoFiles: manifest.forwarderSources.filter((item) => item.endsWith(".go")).length, apps: apps.length },
  apps,
  failedBuildPreservation: { exitCode: 1, ok: failure.ok, preservedPreviousOutput: failure.preservedPreviousOutput, outputCount: failure.outputs.length, previousFilesReverified: buildResult.outputs.length },
  closedRequests: {
    duplicateField: { exitCode: 1, ok: duplicate.ok, diagnostic: duplicate.diagnostics[0]?.message },
    missingField: { exitCode: 1, ok: missing.ok, diagnostic: missing.diagnostics[0]?.message },
  },
  pinnedSourcePaths: { buildManifest: "buildmanifest.json", roleManifest: "roleBindings", outputHashEntries: digestList.length },
}));
