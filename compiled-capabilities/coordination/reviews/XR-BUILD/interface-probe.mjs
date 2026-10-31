import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "../../../conformance/run.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (path) => readFile(join(root, path), "utf8");
const runner = await read("compiled-capabilities/run.mjs");
const n3 = await read("compiled-capabilities/conformance/run.mjs");
const lifecycle = await read("compiled-lifecycle/conformance/run.mjs");
const browserEntry = await read("compiled-lifecycle/conformance/browser-entry.mjs");
const n4 = await read("compiled-capabilities/oracle/literal-oracle.test.mjs");
const n5Build = await read("compiled-capabilities/demo/build.mjs");
const n5Smoke = await read("compiled-capabilities/demo/smoke.mjs");

const n3Flags = [
  "--react-app-ir", "--react-compiled", "--react-helpers", "--react-manifest",
  "--dom-app-ir", "--dom-compiled", "--dom-helpers", "--dom-manifest",
  "--native-go", "--fixture", "--expectations", "--chromium", "--output",
];
for (const flag of n3Flags) assert.ok(n3.includes(JSON.stringify(flag)), `N3 parser is missing ${flag}`);

const reactRoot = "compiled-capabilities/builds/feasibility/react/output";
const domRoot = "compiled-capabilities/builds/feasibility/dom/output";
const appName = "lifecycle-7e6575d90707";
const output = "compiled-capabilities/conformance/evidence/attempt-00/capabilities";
const values = [
  "--react-app-ir", join(root, reactRoot, "apps", appName, "app-ir.json"),
  "--react-compiled", join(root, reactRoot, "apps", appName, "gobi-compiled.mjs"),
  "--react-helpers", join(root, reactRoot, "apps", appName, "encoder.mjs"),
  "--react-manifest", join(root, reactRoot, "buildmanifest.json"),
  "--dom-app-ir", join(root, domRoot, "apps", appName, "app-ir.json"),
  "--dom-compiled", join(root, domRoot, "apps", appName, "gobi-compiled.mjs"),
  "--dom-helpers", join(root, domRoot, "apps", appName, "encoder.mjs"),
  "--dom-manifest", join(root, domRoot, "buildmanifest.json"),
  "--native-go", "/tmp/gondola-go/bin/go",
  "--fixture", join(root, "fixtures/compiled/lifecycle/scenario.json"),
  "--expectations", join(root, "compiled-capabilities/oracle/expectations.json"),
  "--chromium", "/tmp/chromium",
  "--output", join(root, output),
];
const parsed = parseArgs(values);
assert.equal(parsed.nativeGo, "/tmp/gondola-go/bin/go", "--native-go must remain a Go executable path");
assert.ok(lifecycle.includes('[goPath, "run", "./cmd/compiled-lifecycle-native"'), "native projection must execute `go run`");
assert.ok(/"--native-go",\s*nativeGo/.test(runner), "N6 must forward the Go command to N3");
assert.ok(browserEntry.includes("viewCapabilities: core.viewCapabilities"), "inherited browser adapter must forward the renderer view profile");

assert.ok(n3.includes("capabilityBrowser: `${capabilityBrowserStem}.browser.capture.json`"), "N3 capability capture path must match its stem");
assert.ok(runner.split('"capability.browser.capture.json"').length - 1 >= 2, "N6 must copy and require N3's dotted browser capture output");

assert.ok(runner.includes('process.execPath, ["--test", oracleTest]'), "N4 must run under the Node test runner");
assert.ok(n4.includes("expectations.json"), "N4 must consume the literal expectation file");
for (const flag of ["--compiled", "--output", "--backend"]) assert.ok(n5Build.includes(JSON.stringify(flag)));
for (const flag of ["--demo", "--output", "--screenshot", "--port"]) assert.ok(n5Smoke.includes(JSON.stringify(flag)));
assert.ok(runner.includes("gobi.compiled-capabilities-demo-smoke/v1"));
assert.ok(n5Smoke.includes("gobi.compiled-capabilities-demo-smoke/v1"));

console.log(JSON.stringify({
  status: "passed",
  n3RequiredFlags: n3Flags.length,
  nativeGo: parsed.nativeGo,
  nativeCommand: "go run ./cmd/compiled-lifecycle-native --script <fixture>",
  n3Capture: "<prefix>.capability.browser.capture.json",
  n6CaptureSuffix: "capability.browser.capture.json",
  inheritedAdapterProfile: "core.viewCapabilities forwarded",
  n4: "Node --test with the checked-in literal expectations",
  n5: "builder, smoke, and versioned output schema match",
}));
