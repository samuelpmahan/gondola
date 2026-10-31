import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const evidence = resolve(root, "compiled-lifecycle/conformance/evidence/attempt-05");
const readJSON = async (name) => JSON.parse(await readFile(resolve(evidence, name), "utf8"));
const [run, manifest, check, browser] = await Promise.all([
  readJSON("lifecycle.run.json"),
  readJSON("lifecycle.manifest.json"),
  readJSON("lifecycle.check.json"),
  readJSON("lifecycle.browser.json"),
]);

assert.equal(run.status, "matched");
assert.equal(run.sourcesStable, true);
assert.equal(run.sourceStableThroughCheck, true);
assert.equal(run.buildOutputsStableThroughCheck, true);
assert.equal(manifest.status, "matched");
assert.equal(check.status, "matched");
assert.equal(check.appId, "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle");
assert.equal(check.nativeTraceCheckedAgainstLiteralOracle, true);
assert.equal(check.directTraceCheckedAgainstLiteralOracle, true);
assert.equal(check.browserTracesCheckedAgainstLiteralOracle, true);
assert.equal(check.physicalDOMCheckedAgainstLiteralOracle, true);
assert.deepEqual(check.browserProfiles, ["react", "dom", "swap"]);
assert.deepEqual(browser.pageErrors, []);

const profileResults = {};
for (const name of check.browserProfiles) {
  const profile = browser.profiles[name];
  assert(profile, `missing browser profile ${name}`);
  assert.equal(profile.snapshots.length, 27);
  assert.deepEqual(profile.pageErrors, []);
  for (let index = 0; index < profile.snapshots.length; index += 1) {
    const snapshot = profile.snapshots[index];
    assert.equal(snapshot.physicalDOM.normalization, "outerHTML-v1");
    assert.equal(typeof snapshot.physicalDOM.html, "string");
    assert.deepEqual(snapshot.physicalDOM, snapshot.expectedDOM,
      `${name} physical DOM differs from literal at snapshot ${index}`);
    assert.deepEqual(snapshot.rendererSnapshot, snapshot.expectedDOM,
      `${name} renderer snapshot differs from literal at snapshot ${index}`);
  }
  profileResults[name] = {
    snapshots: profile.snapshots.length,
    physical_dom_matches_all: true,
    renderer_snapshot_matches_all: true,
    page_errors: 0,
  };
}

const pin = (path) => run.sourcePinsFinal.find((item) => item.path === path)?.sha256 ?? null;
const pins = {
  oracle: pin("compiled-lifecycle/browser/lifecycle-oracle.mjs"),
  original_test: pin("compiled-lifecycle/browser/lifecycle-oracle.test.mjs"),
  scenario: pin("fixtures/compiled/lifecycle/scenario.json"),
};
assert.deepEqual(pins, {
  oracle: "795ba7fef0ff680019f4988aba5cfcecb25b205516a2c7058bfc720fc217cb82",
  original_test: "18c88acd3e9028af30b1f737599ae537fc1354ea65f37037e5c9f89281ebae6d",
  scenario: "45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650",
});

const result = {
  status: "verified",
  run_status: run.status,
  sources_stable: run.sourcesStable,
  source_stable_through_check: run.sourceStableThroughCheck,
  build_outputs_stable_through_check: run.buildOutputsStableThroughCheck,
  check_status: check.status,
  component_id: check.appId,
  native_direct_browser_literal_checks: true,
  physical_dom_definition: "actual mounted outerHTML-v1 plus live element properties, compared to expectedDOM",
  profiles: profileResults,
  source_pins_in_run: pins,
  fixed_matrix_scope: {
    events: check.events,
    ticks: check.ticks,
    clicks: check.clicks,
    requests: check.requests,
    cancellations: check.cancellations,
    cancellation_order: check.cancellationOrder,
    retired_renderer_fences: check.retiredRendererFences,
    mutation_controls_detected: check.mutationControlsDetected,
  },
  note: "This audits the retained attempt-05 evidence only; it does not rerun fresh builds or the browser matrix.",
};
await writeFile(resolve(root, "compiled-lifecycle/coordination/reviews/xr-oracle-repair/attempt05-audit.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
