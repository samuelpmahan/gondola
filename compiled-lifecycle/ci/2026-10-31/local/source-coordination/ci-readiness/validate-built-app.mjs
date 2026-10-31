import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  if (!key?.startsWith("--") || !process.argv[index + 1]) throw new Error(`invalid argument near ${key}`);
  args.set(key, process.argv[index + 1]);
}
for (const key of ["--app-dir", "--build-record", "--repo-root"]) {
  if (!args.has(key)) throw new Error(`missing ${key}`);
}

const appDir = resolve(args.get("--app-dir"));
const buildRecordPath = resolve(args.get("--build-record"));
const repoRoot = resolve(args.get("--repo-root"));
const packagePath = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle";
const readJSON = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const record = await readJSON(buildRecordPath);
const requestPath = resolve(repoRoot, record.request.path);
const resultPath = resolve(repoRoot, record.result.path);
const manifestPath = resolve(repoRoot, record.manifest.path);
const request = await readJSON(requestPath);
const result = await readJSON(resultPath);
const manifest = await readJSON(manifestPath);
const appIRPath = resolve(appDir, "app-ir.json");
const modulePath = resolve(appDir, "gobi-compiled.mjs");
const encoderPath = resolve(appDir, "encoder.mjs");
const appIR = await readJSON(appIRPath);

assert.equal(record.schema, "gobi.compiled-lifecycle-portability-build/v1");
assert.equal(record.exitCode, 0);
assert.equal(record.acceptanceClaim, false);
assert.equal(request.schema, "gobi.build-request/v1");
assert.equal(resolve(request.sourceRoot), repoRoot);
assert.deepEqual(request.entryPackages, [packagePath]);
assert.equal(request.backend, "react");
assert.equal(resolve(request.outputDir), dirname(dirname(appDir)));
assert.equal(result.schema, "gobi.build-result/v1");
assert.equal(result.ok, true);
assert.deepEqual(result.diagnostics, []);
assert.equal(result.outputs.length, 67);
assert.equal(record.packagePath, packagePath);
assert.equal(record.componentId, packagePath);
assert.equal(record.appDir, appDir);
assert.deepEqual(record.capabilities, [
  "view.node", "numeric.safe-integer", "numeric.float64", "effect.request-reply",
]);
assert.equal(manifest.schema, "gobi.build-manifest/v1");
assert.equal(manifest.apps.length, 1);
const app = manifest.apps[0];
assert.equal(app.backend, "react");
assert.equal(app.componentId, packagePath);
assert.equal(app.packagePath, packagePath);
for (const [key, path] of [["appIR", appIRPath], ["module", modulePath], ["encoder", encoderPath]]) {
  assert.equal(resolve(dirname(manifestPath), app[key]), path, `manifest ${key} path`);
}
assert.equal(appIR.schema, "gobi.app-ir/v1");
assert.equal(appIR.packagePath, packagePath);
assert.equal(appIR.components.length, 1);
const component = appIR.components[0];
assert.equal(component.id, packagePath);
assert.equal(component.packagePath, packagePath);
for (const capability of ["view.node", "effect.request-reply"]) {
  assert.ok(component.capabilities.includes(capability), `missing ${capability}`);
}
assert.equal(await sha256(appIRPath), record.appIR.sha256);
assert.equal(await sha256(modulePath), record.rawModule.sha256);
assert.equal(await sha256(encoderPath), record.encoder.sha256);
assert.equal(await sha256(manifestPath), record.manifest.sha256);
assert.equal(await sha256(requestPath), record.request.sha256);
assert.equal(await sha256(resultPath), record.result.sha256);

const importedModule = await import(pathToFileURL(modulePath).href);
const compiled = importedModule.gobiCompiled;
assert.equal(compiled.schema, "gobi.compiled-module/v1");
assert.ok(isDeepStrictEqual(compiled.appIR, appIR), "compiled module AppIR differs from generated app-ir.json");
for (const symbol of [component.init, component.update, component.view]) {
  assert.equal(typeof compiled.symbols[symbol], "function", `compiled role ${symbol} is missing`);
}
const encoder = await import(pathToFileURL(encoderPath).href);
assert.equal(typeof encoder.gobiEncodeState, "function");
const initialState = compiled.symbols[component.init]();
const encodedInitialState = encoder.gobiEncodeState(initialState, component.stateType);
assert.equal(encodedInitialState.typeId, component.stateType);
assert.equal(encodedInitialState.kind, "struct");
const view = compiled.symbols[component.view](initialState);
assert.ok(view && typeof view === "object", "compiled View did not return a Go node value");

const fixtureAppSource = await readFile(resolve(repoRoot, "fixtures/compiled/lifecycle/app.go"), "utf8");
const fixtureViewSource = await readFile(resolve(repoRoot, "fixtures/compiled/lifecycle/view.go"), "utf8");
const rootGoMod = await readFile(resolve(repoRoot, "go.mod"), "utf8");
assert.equal(rootGoMod.match(/^module\s+(\S+)/m)?.[1], "github.com/samuelpmahan/gondola");
assert.match(fixtureAppSource, /^package lifecycle\b/m);
assert.match(fixtureViewSource, /^package lifecycle\b/m);
const fixtureAppPath = resolve(repoRoot, "fixtures/compiled/lifecycle/app.go");
const fixtureViewPath = resolve(repoRoot, "fixtures/compiled/lifecycle/view.go");
const fixtureScenarioPath = resolve(repoRoot, "fixtures/compiled/lifecycle/scenario.json");
const goModPath = resolve(repoRoot, "go.mod");

process.stdout.write(`${JSON.stringify({
  schema: "gobi.compiled-lifecycle-ci-readiness-app-validation/v1",
  status: "passed",
  appDir,
  request: { sha256: await sha256(requestPath), sourceRoot: request.sourceRoot, entryPackages: request.entryPackages, backend: request.backend },
  result: { sha256: await sha256(resultPath), ok: result.ok, outputs: result.outputs.length, diagnostics: result.diagnostics.length },
  buildRecord: { path: buildRecordPath, sha256: await sha256(buildRecordPath), acceptanceClaim: record.acceptanceClaim },
  manifest: { path: manifestPath, sha256: await sha256(manifestPath), backend: app.backend, componentId: app.componentId, packagePath: app.packagePath },
  appIR: { path: appIRPath, sha256: await sha256(appIRPath), componentId: component.id, packagePath: appIR.packagePath, capabilities: component.capabilities },
  compiledModule: { path: modulePath, sha256: await sha256(modulePath), schema: compiled.schema, initUpdateViewCallable: true },
  encoder: { path: encoderPath, sha256: await sha256(encoderPath), generatedEncoderCallable: true, initialStateTypeId: encodedInitialState.typeId },
  sourceIdentity: {
    modulePath: "github.com/samuelpmahan/gondola",
    packagePath,
    fixtureFiles: await Promise.all([fixtureAppPath, fixtureViewPath, fixtureScenarioPath, goModPath].map(async (path) => ({
      path: path.replace(`${repoRoot}/`, ""), bytes: (await readFile(path)).length, sha256: await sha256(path),
    }))),
  },
}, null, 2)}\n`);
