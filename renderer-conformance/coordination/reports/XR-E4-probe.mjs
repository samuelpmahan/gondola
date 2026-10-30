#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareFixtureAdmissions } from "../../fixture-check.mjs";
import { validateSnapshotAgainstManifest } from "../../protocol.mjs";
import { BACKENDS, fixedScripts, makeScripts } from "../../scripts.mjs";

const HERE = new URL(".", import.meta.url);
const REPO_ROOT = resolve(fileURLToPath(new URL("../../../", HERE)));
const BUNDLE_PATH = resolve(REPO_ROOT, "renderer-conformance/build/fixtures.json");
const CONTRACT = resolve(REPO_ROOT, "renderer-conformance/build/render-contract");
const bundle = JSON.parse(readFileSync(BUNDLE_PATH, "utf8"));

function nativeValid(raw) {
  const result = spawnSync(CONTRACT, ["validate"], {
    cwd: REPO_ROOT,
    input: raw,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(typeof payload.valid, "boolean");
  return { valid: payload.valid, exitCode: result.status, error: payload.error ?? null };
}

function javascriptValid(snapshot) {
  try { validateSnapshotAgainstManifest(snapshot, bundle.manifest); return true; }
  catch { return false; }
}

const fixtureSummary = await compareFixtureAdmissions(bundle);
assert.equal(bundle.fixtures.length, 36);
assert.equal(fixtureSummary.accepted, 7);
assert.equal(fixtureSummary.rejected, 29);
assert.equal(fixtureSummary.javascriptCompared, 33);
assert.equal(fixtureSummary.rawJsonOnly, 3);

const byName = new Map(bundle.fixtures.map((fixture) => [fixture.name, fixture]));
const fourWhitespaceMutants = [
  "message-handler-u0085-only",
  "message-handler-ufeff-only",
  "message-binding-u0085-only",
  "message-binding-ufeff-only",
];
const whitespaceResults = fourWhitespaceMutants.map((name) => {
  const fixture = byName.get(name);
  assert.ok(fixture, `missing ${name}`);
  const snapshot = JSON.parse(fixture.raw);
  const native = nativeValid(fixture.raw);
  const javascript = javascriptValid(snapshot);
  assert.equal(native.valid, false, `${name} passed the Go CLI`);
  assert.notEqual(native.exitCode, 0, `${name} did not produce a native rejection status`);
  assert.equal(javascript, false, `${name} passed JS manifest admission`);
  return { name, category: fixture.category, native, javascript };
});

const boundaryNames = [
  "valid-max-depth-boundary", "depth-over-limit",
  "valid-max-node-boundary", "nodes-over-limit",
];
const boundaryResults = boundaryNames.map((name) => {
  const fixture = byName.get(name);
  assert.ok(fixture, `missing ${name}`);
  const native = nativeValid(fixture.raw);
  const javascript = javascriptValid(JSON.parse(fixture.raw));
  assert.equal(native.valid, fixture.expectedValid, `${name} disagrees with native expectedValid`);
  assert.equal(javascript, fixture.expectedValid, `${name} disagrees with JS expectedValid`);
  return { name, expectedValid: fixture.expectedValid, native, javascript };
});

const rawOnlyResults = bundle.fixtures
  .filter((fixture) => fixture.admission === "raw-json-only")
  .map((fixture) => {
    const native = nativeValid(fixture.raw);
    assert.equal(native.valid, false, `${fixture.name} passed the Go parser`);
    let parsed = true;
    let parsedObject = null;
    try { parsedObject = JSON.parse(fixture.raw); }
    catch { parsed = false; }
    if (fixture.name === "raw-json-only-duplicate-envelope-key") {
      assert.equal(parsed, true, "duplicate-key JSON remains parseable by a browser");
      assert.ok(parsedObject && Object.hasOwn(parsedObject, "state"));
    } else {
      assert.equal(parsed, false, `${fixture.name} should have no browser-object equivalent`);
    }
    return { name: fixture.name, native, browserJSONParseable: parsed };
  });

const expectedHTML = Object.fromEntries([
  "valid-controlled-keyed-view",
  "valid-root-text",
  "valid-empty-text",
  "valid-adjacent-text-nodes",
  "valid-keyed-sibling-reorder",
].map((name) => [name, byName.get(name)?.expectedHTML]));
assert.equal(expectedHTML["valid-empty-text"], "");
assert.equal(expectedHTML["valid-adjacent-text-nodes"], "<div>left &lt;&amp;&gt; right</div>");
assert.ok(expectedHTML["valid-controlled-keyed-view"].includes("typed text &lt;&amp;&gt; café 😀"));
assert.ok(expectedHTML["valid-controlled-keyed-view"].includes("aria-label=\"Save &amp; continue\" disabled=\"\""));

const schedule = makeScripts();
const generated = schedule.slice(fixedScripts.length);
assert.equal(fixedScripts.length, 11);
assert.equal(generated.length, 60);
assert.ok(generated.every((script) => script.actions.length <= 40));
assert.ok(generated.every((script) => script.actions.some((action) => action.kind === "swap" && action.host === "godom")),
  "each default generated script must exercise the GoDOM actor context");
const focused = fixedScripts.find((script) => script.name === "keyed-reorder-keeps-logical-focus-and-selection");
assert.deepEqual(focused.actions.filter((action) => action.kind === "swap").map((action) => action.backend), ["react", "godom", "dom"]);
const current = Object.fromEntries(BACKENDS.map((backend) => [backend, backend]));
const edges = new Set();
for (const action of fixedScripts.at(-1).actions) {
  const from = current[action.host];
  edges.add(`${from}->${action.backend}`);
  current[action.host] = action.backend;
}
assert.deepEqual([...edges].sort(), ["dom->godom", "dom->react", "godom->dom", "godom->react", "react->dom", "react->godom"]);

const browserCommand = [process.execPath, resolve(REPO_ROOT, "renderer-conformance/fixture-check.browser.mjs")];
const browserRun = spawnSync(browserCommand[0], browserCommand.slice(1), {
  cwd: REPO_ROOT,
  encoding: "utf8",
  env: { ...process.env, CHROMIUM_EXECUTABLE_PATH: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/tmp/chromium" },
  maxBuffer: 8 * 1024 * 1024,
});
assert.ifError(browserRun.error);
assert.equal(browserRun.status, 0, browserRun.stderr || browserRun.stdout);
const browserResult = JSON.parse(browserRun.stdout.trim().split(/\r?\n/).at(-1));
assert.equal(browserResult.backendRenderCount, browserResult.positiveFixtures * 3);
assert.equal(browserResult.negativeAtomicityChecks, browserResult.objectNegativeFixtures * 3);
assert.equal(browserResult.positiveFixtures, 7);
assert.equal(browserResult.objectNegativeFixtures, 26);
assert.equal(browserResult.rawJsonOnlyFixtures, 3);

const report = {
  fixtureBundle: { path: BUNDLE_PATH, fixtures: bundle.fixtures.length, manifestVersion: bundle.manifest.version, ...fixtureSummary },
  htmlOracle: {
    source: "cmd/conformance-fixtures/main.go: addSnapshot calls gobi.HTML(snapshot.Tree)",
    canonicalization: "browser <template>.innerHTML compared to each live renderer root.innerHTML",
    representativeExpectedHTML: expectedHTML,
  },
  rawSyntax: rawOnlyResults,
  whitespaceMutants: whitespaceResults,
  depthNodeBoundaries: boundaryResults,
  schedules: {
    backends: BACKENDS,
    fixed: fixedScripts.length,
    generated: generated.length,
    generatedWithGoDOMActorTransition: generated.filter((script) => script.actions.some((action) => action.kind === "swap" && action.host === "godom")).length,
    maximumGeneratedActions: Math.max(...generated.map((script) => script.actions.length)),
    directedEdges: [...edges].sort(),
    focusedReorderTargets: focused.actions.filter((action) => action.kind === "swap").map((action) => action.backend),
  },
  browserGate: {
    command: ["CHROMIUM_EXECUTABLE_PATH=/tmp/chromium", ...browserCommand],
    exitCode: browserRun.status,
    stdout: browserRun.stdout.trim(),
    stderr: browserRun.stderr.trim(),
    ...browserResult,
  },
};
const reportPath = fileURLToPath(new URL("./XR-E4-probe.json", import.meta.url));
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report)}\n`);
