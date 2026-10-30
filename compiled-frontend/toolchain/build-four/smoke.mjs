import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? "/tmp/gondola-compiled-atomic");
const resultPath = process.argv[3];
const here = resolve(".");
const { bindCompiledComponent } = await import(pathToFileURL(join(here, "frontend/react/bindings.mjs")));
const manifest = JSON.parse(await readFile(join(root, "buildmanifest.json"), "utf8"));
assert.equal(manifest.schema, "gobi.build-manifest/v1");
assert.equal(manifest.apps.length, 4);
if (resultPath) {
  const buildResult = JSON.parse(await readFile(resolve(resultPath), "utf8"));
  assert.equal(buildResult.schema, "gobi.build-result/v1");
  assert.equal(buildResult.ok, true);
  assert.equal(buildResult.preservedPreviousOutput, false);
  for (const item of buildResult.outputs) {
    const bytes = await readFile(join(root, item.path));
    assert.equal(bytes.byteLength, item.bytes, `${item.path}: output byte count mismatch`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), item.sha256, `${item.path}: output hash mismatch`);
  }
}
assert.equal(manifest.forwarderModule, "gobi.generated/compiled");
assert.equal(manifest.forwarderGoMod, "forwarders/go.mod");
assert.ok(Array.isArray(manifest.forwarderSources) && manifest.forwarderSources.includes("forwarders/go.mod"));
assert.ok(Array.isArray(manifest.emittedTypeScript) && manifest.emittedTypeScript.length > 0);
for (const relative of manifest.emittedTypeScript) {
  assert.ok(relative.endsWith(".ts"), `non-TypeScript emitted source ${relative}`);
  await readFile(join(root, relative), "utf8");
}
const results = [];
for (const item of manifest.apps) {
  assert.equal(item.roleBindings.length, 3);
  assert.deepEqual(item.roleBindings.map((binding) => binding.role), ["init", "update", "view"]);
  assert.deepEqual(item.roleBindings.map((binding) => binding.appIRSymbol), [item.componentId + ".Init", item.componentId + ".Update", item.componentId + ".View"]);
  const facadeSource = `forwarders/facades/${item.forwarderPackage.split("/").at(-1)}/forwarder.go`;
  assert.ok(manifest.forwarderSources.includes(facadeSource), `${item.packagePath}: forwarder source missing from manifest`);
  const forwarderSource = await readFile(join(root, facadeSource), "utf8");
  assert.match(forwarderSource, /func GobiCompiledUpdate\(/);
  const emittedForwarder = `emitted-ts/@goscript/${item.forwarderPackage}/forwarder.gs.ts`;
  assert.ok(manifest.emittedTypeScript.includes(emittedForwarder), `${item.packagePath}: emitted Go forwarder missing from manifest`);
  const emittedForwarderSource = await readFile(join(root, emittedForwarder), "utf8");
  assert.match(emittedForwarderSource, /\.Update\(\(state\)\.clone\(\), message\)/, `${item.packagePath}: emitted GoScript forwarder did not apply Go value copying`);
  const { gobiCompiled } = await import(pathToFileURL(join(root, item.module)));
  const appIR = JSON.parse(await readFile(join(root, item.appIR), "utf8"));
  const { component, Init, Update, View } = bindCompiledComponent(gobiCompiled, item.componentId);
  assert.equal(component.packagePath, item.packagePath);
  const state = Init();
  const [next, effects] = Update(state, { Name: "__n1-unhandled-probe__", Arg: "" });
  assert.notEqual(next, state, `${item.packagePath}: Update did not apply the value-copy facade`);
  assert.ok(effects === null || Array.isArray(effects) || (effects && typeof effects === "object"), `${item.packagePath}: unexpected effect value`);
  const view = View(next);
  assert.ok(view && typeof view === "object", `${item.packagePath}: View returned no object`);
  const encoder = await import(pathToFileURL(join(root, item.encoder)));
  const encoded = encoder.gobiEncodeState(next, component.stateType);
  assert.equal(encoded.typeId, component.stateType);
  assert.equal(encoded.kind, "struct");
  assert.deepEqual(Object.keys(gobiCompiled.symbols).sort(), [component.init, component.update, component.view].sort());
  results.push({ packagePath: item.packagePath, componentId: item.componentId, stateType: component.stateType, viewType: view.constructor?.name ?? typeof view, effectsNil: effects === null, stateEncodingKind: encoded.kind, symbolCount: Object.keys(gobiCompiled.symbols).length });
}
console.log(JSON.stringify({ schema: manifest.schema, apps: results }));
