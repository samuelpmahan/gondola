import assert from "node:assert/strict";

// Resolve the reviewed modules relative to this checked-in probe so it can be
// rerun from any checkout location.
const { compareObservations, classifyConsoleDiagnostics, validateExpectedNetworkResponses,
  requireNativeComparison, scriptCoverage, requireScriptCoverage } = await import(
  new URL("../../check.mjs", import.meta.url),
);
const { fixedScripts } = await import(new URL("../../scripts.mjs", import.meta.url));

const base = {
  snapshot: { state: { Draft: "x" }, tree: { Kind: 1 }, bindings: [], messages: [] },
  audit: [], transportLog: [], serverRequests: [], pending: [],
  dom: { html: "<p>x</p>", root: "<p>x</p>", disabled: [], inputPath: "0", inputValue: "x", inputDisabled: false,
    controlProperties: [], reportedHTML: "<p>x</p>", reportedDisabled: [] },
};
const mutations = [
  ["state", (x) => { x.snapshot.state.Draft = "bad"; }],
  ["tree", (x) => { x.snapshot.tree.Kind = 2; }],
  ["bindings", (x) => { x.snapshot.bindings.push({ Path: "0" }); }],
  ["messages", (x) => { x.snapshot.messages.push({ Name: "bad" }); }],
  ["audit", (x) => { x.audit.push({ ID: 1 }); }],
  ["transportLog", (x) => { x.transportLog.push({ Kind: "cancel", ID: 1 }); }],
  ["serverRequests", (x) => { x.serverRequests.push({ ID: 1, State: "cancelled" }); }],
  ["pending", (x) => { x.pending.push(1); }],
  ["dom.html", (x) => { x.dom.html = "<p>bad</p>"; }],
  ["dom.root", (x) => { x.dom.root = "<p>bad</p>"; }],
  ["dom.disabled", (x) => { x.dom.disabled.push("1"); }],
  ["dom.inputPath", (x) => { x.dom.inputPath = "9"; }],
  ["dom.inputValue", (x) => { x.dom.inputValue = "bad"; }],
  ["dom.inputDisabled", (x) => { x.dom.inputDisabled = true; }],
  ["dom.controlProperties", (x) => { x.dom.controlProperties.push({ disabled: true }); }],
  ["dom.reportedHTML", (x) => { x.dom.reportedHTML = "<broken>"; }],
  ["dom.reportedDisabled", (x) => { x.dom.reportedDisabled.push("9"); }],
];
for (const [field, mutate] of mutations) {
  const actual = structuredClone(base);
  mutate(actual);
  assert.ok(compareObservations(actual, base).some((item) => item.field === field), `must detect ${field}`);
}

const url = "http://127.0.0.1:9000/api/save?lane=x&mode=status";
const expected = [{ method: "POST", url, status: 503, mode: "status", script: "negative", requestID: 1 }];
for (const observed of [[], [{ method: "POST", url, status: 200 }],
  [{ method: "POST", url, status: 503 }, { method: "POST", url, status: 503 }]]) {
  assert.equal(validateExpectedNetworkResponses(expected, observed)[0].field, "network.expected-response");
}
const manifest = [{ ...expected[0], reason: "save-http-status" }];
const event = { text: "Failed to load resource: the server responded with a status of 503 (Unavailable)", location: { url } };
assert.equal(classifyConsoleDiagnostics([event], [{ method: "POST", url, status: 503 }], manifest).expected.length, 1);
assert.equal(classifyConsoleDiagnostics([event], [{ method: "POST", url: `${url}&extra=1`, status: 503 }], manifest).unexpected.length, 1);
assert.equal(classifyConsoleDiagnostics([event], [{ method: "POST", url, status: 200 }], manifest).unexpected.length, 1);
assert.throws(() => requireNativeComparison({ status: "matched", scenarios: [] }), /required/);
assert.throws(() => requireNativeComparison({ status: "unavailable", scenarios: [] }), /required/);
assert.doesNotThrow(() => requireScriptCoverage(scriptCoverage(fixedScripts)));
const missingStatus = scriptCoverage(fixedScripts.filter((script) => script.name !== "http-status-error"));
assert.equal(missingStatus["http-status-503"], false);
assert.throws(() => requireScriptCoverage(missingStatus), /http-status-503/);

process.stdout.write(`negative probes passed: ${mutations.length} observation mutations; wrong/missing/duplicate status responses; wrong URL/status diagnostic; unavailable/empty native trace; missing required fixture\n`);
