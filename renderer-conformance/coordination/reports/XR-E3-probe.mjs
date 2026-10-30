import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createKeyedHost } from "../../../keyed-editor/host.mjs";
import { compareFixtureAdmissions, loadFixtureBundle } from "../../fixture-check.mjs";
import { descriptor, createNegotiatedHost } from "../../registry.mjs";
import { validateManifest, validateSnapshotAgainstManifest } from "../../protocol.mjs";

const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)));
const REPO = resolve(HERE, "../../..");
const GO_CLI = process.env.RENDER_CONTRACT_BIN;
if (!GO_CLI) throw new Error("set RENDER_CONTRACT_BIN to a fresh Go-built cmd/render-contract binary");

const generatedManifest = JSON.parse(execFileSync(GO_CLI, ["manifest"], { encoding: "utf8" }));
validateManifest(generatedManifest);
const checkedInBuildManifest = JSON.parse(readFileSync(resolve(REPO, "renderer-conformance/build/manifest.json"), "utf8"));
assert.deepEqual(checkedInBuildManifest, generatedManifest, "the browser bundle manifest must match a fresh Go CLI result");

function validSnapshot(state = { opaque: { marker: "from-runtime", list: [3, null, false] } }) {
  return {
    state,
    tree: {
      Kind: 1, Tag: "div", Key: "root", Attrs: null, On: null, Text: "",
      Kids: [{
        Kind: 1, Tag: "button", Key: "action", Attrs: null,
        On: [{ Event: "click", Message: "go", Arg: "" }],
        Kids: [{ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text: "Go" }],
        Text: "",
      }],
    },
    bindings: [],
    messages: [],
  };
}

function bindingSnapshot(message) {
  return {
    state: { opaque: true },
    tree: {
      Kind: 1, Tag: "div", Key: "root", Attrs: null, On: null, Text: "",
      Kids: [{
        Kind: 1, Tag: "input", Key: "field",
        Attrs: [
          { Name: "type", Value: "text", Flag: false, Style: null },
          { Name: "value", Value: "", Flag: false, Style: null },
        ],
        On: null, Kids: null, Text: "",
      }],
    },
    bindings: [{ Path: "0", Event: "input", Message: message, Source: "target.value" }],
    messages: [],
  };
}

function handlerSnapshot(message) {
  const snapshot = validSnapshot();
  snapshot.tree.On = [{ Event: "click", Message: message, Arg: "" }];
  return snapshot;
}

function goValidate(snapshot) {
  const result = spawnSync(GO_CLI, ["validate"], {
    cwd: REPO,
    input: JSON.stringify(snapshot),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(typeof payload.valid, "boolean", "Go validate must emit a boolean validity result");
  assert.equal(result.status === 0, payload.valid, "Go validate exit status must agree with its JSON result");
  return payload.valid;
}

const runeSet = new Set(Array.from(generatedManifest.messageBlankRunes));
const blankMatrix = [
  ["empty", ""],
  ["ASCII whitespace run", " \t\r\n"],
  ["Go NEL", "\u0085"],
  ["BOM", "\uFEFF"],
  ["no-break space", "\u00A0"],
  ["em space", "\u2003"],
  ["zero-width space", "\u200B"],
  ["ordinary name", "go"],
];
const blankResults = [];
for (const [label, message] of blankMatrix) {
  const expectedValid = !Array.from(message).every((rune) => runeSet.has(rune));
  for (const [field, makeSnapshot] of [
    ["handler", handlerSnapshot],
    ["binding", bindingSnapshot],
  ]) {
    const snapshot = makeSnapshot(message);
    let javascriptValid = true;
    try { validateSnapshotAgainstManifest(snapshot, generatedManifest); }
    catch { javascriptValid = false; }
    const goValid = goValidate(snapshot);
    assert.equal(javascriptValid, expectedValid, `JS policy disagrees with Go-generated data for ${label}/${field}`);
    assert.equal(goValid, expectedValid, `Go CLI disagrees with its manifest for ${label}/${field}`);
    assert.equal(javascriptValid, goValid, `JS/Go admission disagrees for ${label}/${field}`);
    blankResults.push({ label, field, expectedValid, javascriptValid, goValid });
  }
}

const fixtureBundle = loadFixtureBundle(resolve(REPO, "renderer-conformance/build/fixtures.json"));
assert.deepEqual(fixtureBundle.manifest, generatedManifest, "E4 fixture bundle must contain the Go CLI manifest");
const fixtureSummary = await compareFixtureAdmissions(fixtureBundle);
assert.equal(fixtureSummary.nativeChecked, 36, "review must check every one of the 36 current fixtures natively");
assert.equal(fixtureSummary.javascriptCompared, 33);
assert.equal(fixtureSummary.rawJsonOnly, 3);

function rendererStub({ onClick, counts = {} } = {}) {
  let current = validSnapshot();
  const bump = (name) => { counts[name] = (counts[name] ?? 0) + 1; };
  return {
    update(snapshot) { bump("update"); current = snapshot; },
    snapshot() { bump("rendererSnapshot"); return current; },
    domSnapshot() { return { html: "<div><button>Go</button></div>", disabled: [] }; },
    click(path) { bump("click"); if (onClick) onClick(path); },
    focusState() { return null; },
    restoreFocus() { return false; },
    unmount() { bump("unmount"); },
  };
}

function baseRuntime(initial = validSnapshot(), overrides = {}) {
  const calls = { init: 0, dispatch: 0, complete: 0, effects: 0, audit: 0 };
  const runtime = {
    calls,
    init() { calls.init += 1; return initial; },
    dispatch() { calls.dispatch += 1; return initial; },
    complete() { calls.complete += 1; return initial; },
    effects() { calls.effects += 1; return []; },
    audit() { calls.audit += 1; return []; },
    ...overrides,
  };
  return runtime;
}

function fakeRoot() {
  return { clears: 0, replaceChildren() { this.clears += 1; } };
}

function makeTransport(counts) {
  return {
    start() { counts.starts += 1; },
    cancel() { counts.cancels += 1; },
  };
}

function counts() { return { starts: 0, cancels: 0 }; }

const metadataRows = [];
for (const [label, alter] of [
  ["protocol", (item) => { item.protocol = "gobi.other"; }],
  ["version", (item) => { item.version = generatedManifest.version + 1; }],
  ["missing capability", (item) => { item.capabilities = item.capabilities.filter((value) => value !== "logical-focus"); }],
  ["missing method", (item) => { item.methods = item.methods.filter((value) => value !== "snapshot"); }],
]) {
  const runtime = baseRuntime();
  const transportCalls = counts();
  const mountCalls = { count: 0 };
  const candidate = descriptor("candidate", () => {
    mountCalls.count += 1;
    return rendererStub();
  }, generatedManifest);
  alter(candidate);
  assert.throws(() => createNegotiatedHost(
    fakeRoot(), runtime, [candidate], makeTransport(transportCalls), "candidate", generatedManifest,
  ));
  assert.equal(runtime.calls.init, 0, `${label}: metadata rejection must precede app init`);
  assert.equal(mountCalls.count, 0, `${label}: metadata rejection must precede renderer mount`);
  assert.deepEqual(transportCalls, { starts: 0, cancels: 0 }, `${label}: metadata rejection must precede transport activity`);
  metadataRows.push(label);
}

for (const [label, invalidManifest] of [
  ["manifest protocol", { ...generatedManifest, protocol: "gobi.other" }],
  ["manifest version", { ...generatedManifest, version: generatedManifest.version + 1 }],
]) {
  const runtime = baseRuntime();
  const transportCalls = counts();
  const candidate = descriptor("candidate", () => rendererStub(), generatedManifest);
  assert.throws(() => createNegotiatedHost(
    fakeRoot(), runtime, [candidate], makeTransport(transportCalls), "candidate", invalidManifest,
  ));
  assert.equal(runtime.calls.init, 0, `${label}: manifest rejection must precede app init`);
  assert.deepEqual(transportCalls, { starts: 0, cancels: 0 });
  metadataRows.push(label);
}

const leaseMounts = { count: 0 };
const leaseCandidate = descriptor("candidate", () => {
  leaseMounts.count += 1;
  return rendererStub();
}, generatedManifest);
const legacyFirstRuntime = baseRuntime();
const legacyFirst = createKeyedHost(fakeRoot(), legacyFirstRuntime,
  { candidate: () => rendererStub() }, makeTransport(counts()), "candidate");
assert.throws(() => createNegotiatedHost(
  fakeRoot(), legacyFirstRuntime, [leaseCandidate], makeTransport(counts()), "candidate", generatedManifest,
), /already has a live keyed host/i);
assert.equal(legacyFirstRuntime.calls.init, 1, "negotiated creation after legacy cannot reset an owned runtime");
assert.equal(leaseMounts.count, 0);
legacyFirst.unmount();

const negotiatedFirstRuntime = baseRuntime();
const negotiatedFirst = createNegotiatedHost(fakeRoot(), negotiatedFirstRuntime,
  [leaseCandidate], makeTransport(counts()), "candidate", generatedManifest);
assert.throws(() => createKeyedHost(fakeRoot(), negotiatedFirstRuntime,
  { candidate: () => rendererStub() }, makeTransport(counts()), "candidate"), /already has a live keyed host/i);
assert.equal(negotiatedFirstRuntime.calls.init, 1, "legacy creation after negotiated cannot reset an owned runtime");
assert.equal(leaseMounts.count, 1);
negotiatedFirst.unmount();

const initialOutOfProfile = validSnapshot();
initialOutOfProfile.tree = {
  Kind: 3, Tag: "", Key: "", Attrs: null, On: null, Text: "",
  Kids: [initialOutOfProfile.tree],
};
const initialAdmissionRuntime = baseRuntime(initialOutOfProfile);
const initialAdmissionRoot = fakeRoot();
const initialAdmissionTransport = counts();
const initialAdmissionMounts = { count: 0 };
const initialAdmissionCandidate = descriptor("candidate", () => {
  initialAdmissionMounts.count += 1;
  return rendererStub();
}, generatedManifest);
assert.throws(() => createNegotiatedHost(
  initialAdmissionRoot, initialAdmissionRuntime, [initialAdmissionCandidate],
  makeTransport(initialAdmissionTransport), "candidate", generatedManifest,
), /kind|fragment/i, "initial snapshot must pass generated profile admission before candidate mount");
assert.equal(initialAdmissionRuntime.calls.init, 1, "valid metadata admits application init before initial snapshot inspection");
assert.equal(initialAdmissionMounts.count, 0, "profile-invalid initial snapshot must not mount a renderer");
assert.deepEqual(initialAdmissionTransport, { starts: 0, cancels: 0 });
assert.ok(initialAdmissionRoot.clears >= 1, "failed initial snapshot admission clears the root");

class OpaqueRuntime {
  #state = { token: "private-runtime-brand" };
  #snapshot = validSnapshot({ owner: "opaque", nested: { rune: "\u200B", keep: [1, false, null] } });
  calls = { init: 0, dispatch: 0, complete: 0, effects: 0, audit: 0 };
  init() { assert.equal(this.#state.token, "private-runtime-brand"); this.calls.init += 1; return this.#snapshot; }
  dispatch() { assert.equal(this.#state.token, "private-runtime-brand"); this.calls.dispatch += 1; return this.#snapshot; }
  complete() { assert.equal(this.#state.token, "private-runtime-brand"); this.calls.complete += 1; return this.#snapshot; }
  effects() { assert.equal(this.#state.token, "private-runtime-brand"); this.calls.effects += 1; return []; }
  audit() { assert.equal(this.#state.token, "private-runtime-brand"); this.calls.audit += 1; return []; }
}
const opaqueRuntime = new OpaqueRuntime();
const opaqueHost = createNegotiatedHost(fakeRoot(), opaqueRuntime,
  [descriptor("candidate", () => rendererStub(), generatedManifest)], makeTransport(counts()), "candidate", generatedManifest);
assert.deepEqual(opaqueHost.snapshot().state, {
  owner: "opaque", nested: { rune: "\u200B", keep: [1, false, null] },
}, "the host must preserve application JSON state without interpreting its shape");
assert.equal(opaqueRuntime.calls.init, 1, "class-private runtime state proves the original runtime receiver is used");
opaqueHost.unmount();

const tooDeep = validSnapshot();
let cursor = tooDeep.tree;
for (let depth = 1; depth <= generatedManifest.maxDepth + 1; depth += 1) {
  const child = {
    Kind: 1, Tag: "div", Key: `depth-${depth}`, Attrs: null, On: null, Kids: null, Text: "",
  };
  cursor.Kids = [child];
  cursor = child;
}
const failureCounts = { effects: 0, started: 0, updated: 0, unmounted: 0, notifications: 0 };
const failureRendererCounts = { update: 0, unmount: 0 };
const failingRuntime = baseRuntime(validSnapshot(), {
  dispatch() { this.calls.dispatch += 1; return tooDeep; },
  effects() { this.calls.effects += 1; failureCounts.effects += 1; return [{ Kind: "start", ID: 71, Value: "should-not-start" }]; },
});
const failureTransport = {
  start() { failureCounts.started += 1; },
  cancel() {},
};
const failureCandidate = descriptor("candidate", (_root, facade) => rendererStub({
  onClick() {
    try { facade.dispatch({ Path: "0", Event: "click", Value: "", Key: "action" }); }
    catch (error) {
      failureCounts.notifications += Number(facade.rendererFailed(error));
    }
  },
  counts: failureRendererCounts,
}), generatedManifest);
const failingHost = createNegotiatedHost(
  fakeRoot(), failingRuntime, [failureCandidate], failureTransport, "candidate", generatedManifest,
);
failingHost.click("0");
assert.throws(() => failingHost.snapshot(), /unusable|failed/i,
  "manifest-invalid dispatch must fence the host after notifying the failure lifecycle");
try { await failingHost.flush(); } catch { /* the host reports the renderer lifecycle failure */ }
assert.equal(failureCounts.notifications, 1, "rendererFailed must reach the underlying keyed host");
assert.equal(failureCounts.effects, 0, "failure notification must fence queued work before effects drain");
assert.equal(failureCounts.started, 0, "invalid profile output must not start transport work");
assert.equal(failingRuntime.calls.dispatch, 1);
assert.equal(failingRuntime.calls.effects, 0);
assert.equal(failureRendererCounts.update, 0, "profile-invalid snapshots must not reach candidate update");
assert.equal(failureRendererCounts.unmount, 1, "failure notification must unmount the failed renderer");
failureCounts.unmounted = failureRendererCounts.unmount;

const summary = {
  manifestSource: "fresh Go CLI manifest, compared with renderer-conformance/build/manifest.json and E4 bundle",
  messageBlankRunesCodePoints: Array.from(generatedManifest.messageBlankRunes).map((rune) => rune.codePointAt(0)),
  blankMatrixChecks: blankResults.length,
  blankMatrixMismatches: 0,
  fixtures: fixtureSummary,
  metadataRejectedBeforeInit: metadataRows,
  runtimeLeaseCreationOrders: ["legacy-then-negotiated", "negotiated-then-legacy"],
  opaqueStateRuntimeReceiver: "class-private state remained accessible",
  manifestFailureLifecycle: failureCounts,
  initialProfileRejection: {
    initCalls: initialAdmissionRuntime.calls.init,
    rendererMounts: initialAdmissionMounts.count,
    rootClears: initialAdmissionRoot.clears,
  },
};
process.stdout.write(`${JSON.stringify(summary)}\n`);
