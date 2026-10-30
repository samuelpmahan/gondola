import test from "node:test";
import assert from "node:assert/strict";
import {
  compareObservations,
  classifyConsoleDiagnostics,
  nativeStep,
  parseArgs,
  requireNativeComparison,
  validateExpectedNetworkResponses,
} from "./check.mjs";

function observation(overrides = {}) {
  return {
    snapshot: {
      state: { Draft: "draft" },
      tree: { Kind: 1 },
      bindings: [{ Path: "0", Event: "input" }],
      messages: [{ Name: "edit", Arg: "draft" }],
    },
    audit: [],
    transportLog: [{ Kind: "start", ID: 1, Value: "draft" }],
    serverRequests: [{ ID: 1, State: "held" }],
    dom: {
      html: "<div><input value=\"draft\"></div>",
      root: "<div><input value=\"draft\"></div>",
      disabled: [],
      inputPath: "0",
      inputValue: "draft",
      inputDisabled: false,
      controlProperties: [{ path: "0", tag: "input", value: "draft", disabled: false }],
      reportedHTML: "<div><input value=\"draft\"></div>",
      reportedDisabled: [],
    },
    ...overrides,
  };
}

test("comparison covers runtime, audit, real DOM controls, transport order, and server records", () => {
  const expected = observation();
  assert.deepEqual(compareObservations(expected, expected), []);

  const changed = observation({
    snapshot: { ...expected.snapshot, bindings: [{ Path: "0", Event: "change" }] },
    audit: [{ ID: 1, Accepted: false }],
    transportLog: [...expected.transportLog, { Kind: "cancel", ID: 1 }],
    serverRequests: [{ ID: 1, State: "cancelled" }],
    dom: { ...expected.dom, inputValue: "stale", disabled: ["1"] },
  });
  const fields = compareObservations(changed, expected).map((difference) => difference.field);
  assert.ok(fields.includes("bindings"));
  assert.ok(fields.includes("audit"));
  assert.ok(fields.includes("transportLog"));
  assert.ok(fields.includes("serverRequests"));
  assert.ok(fields.includes("dom.inputValue"));
  assert.ok(fields.includes("dom.disabled"));
});

test("comparison flags reported renderer snapshots that disagree with live DOM", () => {
  const actual = observation({ dom: { ...observation().dom, reportedHTML: "<broken>" } });
  const mismatches = compareObservations(actual, observation());
  assert.ok(mismatches.some((difference) => difference.field === "actual.dom.reportedHTML"));
});

test("native input steps preserve browser actions and deterministic control actions", () => {
  assert.deepEqual(nativeStep(null), { Path: "", Event: "", Value: "" });
  assert.deepEqual(nativeStep({ kind: "fill", value: "a<&" }), { Path: "0", Event: "input", Value: "a<&" });
  assert.deepEqual(nativeStep({ kind: "type-char", resultingValue: "ab" }), { Path: "0", Event: "input", Value: "ab" });
  assert.deepEqual(nativeStep({ kind: "click", button: "save" }), { Path: "3", Event: "click", Value: "" });
  assert.deepEqual(nativeStep({ kind: "release", id: 2, mode: "success" }), { Path: "", Event: "release:success", Value: "2" });
  assert.deepEqual(nativeStep({ kind: "mode", mode: "held" }), { Path: "", Event: "mode:held", Value: "" });
});

test("CLI parsing accepts reproducible seeds and rejects invalid limits", () => {
  assert.deepEqual(parseArgs(["--seeds", "20261030,20261031", "--cases", "2", "--max-actions", "12"]), {
    seeds: [20261030, 20261031], cases: 2, maxActions: 12, output: null, headed: false, help: false,
  });
  assert.throws(() => parseArgs(["--seeds", "1,1"]), /unique/);
  assert.throws(() => parseArgs(["--cases", "-1"]), /non-negative/);
  assert.throws(() => parseArgs(["--max-actions", "0"]), /1 through 40/);
});

test("native comparator is a required gate", () => {
  assert.equal(requireNativeComparison({ status: "matched", scenarios: [{ status: "matched" }] }).status, "matched");
  assert.throws(() => requireNativeComparison({ status: "unavailable", message: "missing" }), /required/);
  assert.throws(() => requireNativeComparison({ status: "failed" }), /required/);
});

test("only console diagnostics matching an expected API URL and observed status are classified", () => {
  const url = "http://127.0.0.1:9000/api/release?lane=e4-0-dom&id=1&mode=success";
  const duplicateURL = "http://127.0.0.1:9000/api/save?lane=e4-0-dom&mode=drop";
  const manifest = [{ method: "POST", url, status: 409, mode: "success", reason: "release-after-cancel", script: "held-cancel", requestID: 1 }];
  const responses = [{ method: "POST", url, status: 409 }, { method: "POST", url: duplicateURL, status: 409 }];
  const consoleEvents = [
    { text: "Failed to load resource: the server responded with a status of 409 (Conflict)", location: { url: duplicateURL } },
    { text: "Failed to load resource: the server responded with a status of 409 (Conflict)", location: { url } },
  ];
  const classified = classifyConsoleDiagnostics(consoleEvents, responses, manifest);
  assert.equal(classified.expected.length, 1);
  assert.equal(classified.expected[0].url, url);
  assert.equal(classified.unexpected.length, 1);

  const unrelated = classifyConsoleDiagnostics(consoleEvents.slice(1), [{ method: "POST", url: "http://127.0.0.1:9000/elsewhere", status: 409 }], manifest);
  assert.equal(unrelated.unexpected.length, 1);
});

test("expected non-success API routes require exactly the declared URL and status count", () => {
  const expected = [{ method: "POST", url: "http://127.0.0.1:9000/api/save?lane=e4-0-dom&mode=status", status: 503, mode: "status", script: "status", requestID: 1 }];
  assert.deepEqual(validateExpectedNetworkResponses(expected, [{ method: "POST", url: expected[0].url, status: 503 }]), []);
  assert.equal(validateExpectedNetworkResponses(expected, [{ method: "POST", url: expected[0].url, status: 200 }])[0].field, "network.expected-response");
  assert.equal(validateExpectedNetworkResponses(expected, [])[0].field, "network.expected-response");
});

test("partial-body network diagnostics are scoped to an observed mode=drop URL and status", () => {
  const url = "http://127.0.0.1:9000/api/save?lane=e4-0-dom&mode=drop";
  const expected = [{ method: "POST", url, status: 200, mode: "drop", reason: "save-network-drop", script: "drop", requestID: 1 }];
  const responses = [{ method: "POST", url, status: 200 }];
  const events = [{ text: "Failed to load resource: net::ERR_CONTENT_LENGTH_MISMATCH", location: { url } }];
  const classified = classifyConsoleDiagnostics(events, responses, expected);
  assert.equal(classified.expected[0].reason, "save-network-drop");
  assert.equal(classified.expected[0].status, 200);
  assert.deepEqual(classified.unexpected, []);
});
