import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const directSource = await readFile(new URL("./direct-js.mjs", import.meta.url), "utf8");
const browserSource = await readFile(new URL("./browser.mjs", import.meta.url), "utf8");

test("direct replay pins compiled module, encoder, and fixture before loading them", () => {
  const pin = directSource.indexOf("const provenanceBefore = await captureConformanceProvenance");
  const imports = directSource.indexOf("const [compiledModule, helperModule, fixtureScript]");
  assert.notEqual(pin, -1);
  assert.notEqual(imports, -1);
  assert.ok(pin < imports);
});

test("browser pins inputs before loading and checks those pins after bundling", () => {
  const pin = browserSource.indexOf("baseProvenanceBefore = await captureConformanceProvenance");
  const fixtureLoad = browserSource.indexOf("fixtureScript = JSON.parse(await readFile(fixturePath");
  const moduleLoad = browserSource.indexOf("const compiledModule = await import(pathToFileURL(resolve(compiledPath))");
  const bundle = browserSource.indexOf("bundlePath = await buildBrowserBundle(");
  const bundlePins = browserSource.indexOf("provenanceBefore = await captureConformanceProvenance({", bundle);
  const verify = browserSource.indexOf("assertStableProvenance(baseProvenanceBefore, withoutBrowserBundle(provenanceBefore, bundlePath))", bundlePins);
  const launch = browserSource.indexOf("browser = await chromium.launch(", verify);
  for (const position of [pin, fixtureLoad, moduleLoad, bundle, bundlePins, verify, launch]) assert.notEqual(position, -1);
  assert.ok(pin < fixtureLoad && pin < moduleLoad);
  assert.ok(bundle < bundlePins && bundlePins < verify && verify < launch);
});
