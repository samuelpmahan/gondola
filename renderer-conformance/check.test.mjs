import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareObservations,
  nativeStep,
  nativeTick,
  compareEveryTick,
  validateObservationShape,
  validateNativeFrames,
  parseArgs,
  requireNativeComparison,
  selectGoCommand,
  startLabServer,
  stopLabServer,
  validateContractSnapshots,
} from "./check.mjs";
import { expectedProbeNames, validateProbeSet } from "./adversarial.mjs";

const snapshot = () => ({
  state: { Rows: [{ ID: 1, Draft: "a", Saved: "", Saves: 0, PendingID: 0, Status: "idle" }], NextID: 1, NextRequestID: 0 },
  tree: { Kind: 1, Tag: "div", Key: "collection", Attrs: null, On: null, Kids: [], Text: "" },
  bindings: [{ Path: "2/0/0", Event: "input", Message: "edit/1", Source: "target.value" }],
  messages: [{ Name: "add", Arg: "" }],
});

const dom = () => ({
  html: '<div class="collection"></div>',
  root: '<div class="collection"></div>',
  disabled: ["1"],
  inputPath: "2/0/0",
  inputValue: "a",
  inputDisabled: false,
  controls: [{ path: "1", tag: "button", value: null, disabled: true }],
  order: [1, 2],
  reportedHTML: '<div class="collection"></div>',
  reportedDisabled: ["1"],
});

const liveProps = () => [{ path: "2/0/0", tag: "input", value: "a", defaultValue: "a", disabled: false, checked: false, type: "text" }];

const observation = () => ({
  snapshot: snapshot(),
  audit: [{ ID: 2, RowID: 1, Value: "a", Error: "", Accepted: true, Reason: "saved" }],
  transportLog: [{ Kind: "start", ID: 2, Value: "a" }],
  serverRequests: [{ ID: 2, State: "completed", Mode: "success" }],
  pending: [],
  serverLane: "lane-test",
  dom: dom(),
  liveProps: liveProps(),
  focus: null,
  backendName: "dom",
  runtimeCalls: { init: 1, snapshot: 1, dispatch: 0, complete: 0, effects: 0, audit: 1, encodeHTTP: 0, decodeHTTP: 0 },
});

const laneObservations = () => Object.fromEntries(["dom", "react", "godom", "reference"].map((name) => [name, {
  ...observation(), serverLane: `lane-${name}`, backendName: name,
}]));

function oneTickScenario(action = { kind: "add" }) {
  const before = laneObservations();
  const after = laneObservations();
  const enabled = action.kind === "add";
  for (const name of Object.keys(before)) {
    if (enabled) {
      before[name].snapshot.tree.Kids = [{ Kind: 1, Tag: "button", Key: "add", On: [{ Event: "click", Message: "add", Arg: "" }], Kids: [], Attrs: [] }];
      before[name].snapshot.messages = [];
      before[name].dom.controls = [{ path: "0", tag: "button", disabled: false }];
      after[name].snapshot.messages = [{ Name: "add", Arg: "" }];
      after[name].snapshot.messages.push({ Name: "reply", Arg: "1" });
      after[name].snapshot.state.Rows = [{ ID: 1, Draft: "", Saved: "", Saves: 0, PendingID: 0, Status: "idle" }];
      after[name].runtimeCalls.dispatch = 1;
    }
  }
  const step = { Path: "0", Event: "click", Value: "" };
  return {
    name: "receipt-regression", seed: 1,
    actions: [action],
    ticks: [
      { index: 0, action: null, step: null, observations: before, deliveries: null },
      {
        index: 1, action, step, observations: after,
        deliveries: Object.fromEntries(Object.keys(after).map((name) => [name, { dispatchDelta: enabled ? 1 : 0, disabledTarget: !enabled }])),
      },
    ],
  };
}

function nativeFrame(index, action, observation, step) {
  return nativeTick(index, step, observation);
}

function nativeScenario() {
  const actions = [null, { kind: "add" }];
  const ticks = actions.map((action, index) => ({
    index,
    action,
    step: index === 0 ? null : { Path: "0", Event: "click", Value: "" },
    observations: laneObservations(),
  }));
  const nativeTicks = ticks.map((tick) => Object.fromEntries(Object.entries(tick.observations).map(([name, value]) => [
    name,
    nativeFrame(tick.index, tick.action, value, tick.action ? { Path: "0", Event: "click", Value: "" } : null),
  ])));
  return { name: "native-validation", actions: [actions[1]], ticks, nativeTicks };
}

function focusScenario(action, draft, focusForActor = () => ({
  key: `row-${action.rowID}-input`,
  selectionStart: action.selectionStart,
  selectionEnd: action.selectionEnd,
  selectionDirection: action.selectionDirection ?? "none",
})) {
  const scenario = oneTickScenario(action);
  scenario.ticks[1].step = { Path: "0", Event: "focus", Value: "" };
  for (const name of ["dom", "react", "godom", "reference"]) {
    scenario.ticks[0].observations[name].snapshot.state.Rows[0].Draft = draft;
    scenario.ticks[1].observations[name].snapshot.state.Rows[0].Draft = draft;
    scenario.ticks[1].observations[name].focus = focusForActor(name);
  }
  return scenario;
}

function fillScenario(action) {
  const scenario = oneTickScenario(action);
  scenario.ticks[1].step = { Path: "0", Event: "input", Value: action.value };
  const clean = String(action.value).replace(/[\r\n]/g, "");
  for (const name of ["dom", "react", "godom", "reference"]) {
    const before = scenario.ticks[0].observations[name];
    const after = scenario.ticks[1].observations[name];
    before.snapshot.state.Rows[0].Draft = "before";
    before.snapshot.messages = [];
    before.snapshot.tree.Kids = [{
      Kind: 1, Tag: "input", Key: "row-1-input", Attrs: [{ Name: "type", Value: "text", Flag: false, Style: null }],
      On: null, Kids: null, Text: "",
    }];
    before.snapshot.bindings = [{ Path: "0", Event: "input", Message: "edit/1", Source: "target.value" }];
    before.dom.controls = [{ path: "0", tag: "input", disabled: false, value: "before" }];
    before.liveProps = [{ path: "0", tag: "input", value: "before", defaultValue: "before", disabled: false, checked: null, type: "text" }];
    after.snapshot.state.Rows[0].Draft = clean;
    after.snapshot.messages = [{ Name: "edit/1", Arg: clean }];
    after.runtimeCalls.dispatch = before.runtimeCalls.dispatch + 1;
    scenario.ticks[1].deliveries[name] = { dispatchDelta: 1, disabledTarget: false };
  }
  return scenario;
}

test("observation comparison catches every required snapshot, HTTP, and raw DOM channel", () => {
  assert.deepEqual(compareObservations(observation(), observation()), []);
  const mutations = [
    ["state", (value) => { value.snapshot.state.Rows[0].Draft = "wrong"; }],
    ["tree", (value) => { value.snapshot.tree.Key = "wrong"; }],
    ["bindings", (value) => { value.snapshot.bindings[0].Path = "2/1/0"; }],
    ["messages", (value) => { value.snapshot.messages[0].Name = "remove"; }],
    ["audit", (value) => { value.audit[0].Accepted = false; }],
    ["transportLog", (value) => { value.transportLog[0].Kind = "cancel"; }],
    ["serverRequests", (value) => { value.serverRequests[0].State = "cancelled"; }],
    ["pending", (value) => { value.pending = [{ ID: 3, Value: "pending" }]; }],
    ["dom.html", (value) => { value.dom.html += " "; value.dom.reportedHTML += " "; }],
    ["dom.root", (value) => { value.dom.root += " "; }],
    ["dom.disabled", (value) => { value.dom.disabled = []; value.dom.reportedDisabled = []; }],
    ["dom.inputValue", (value) => { value.dom.inputValue = "stale"; }],
    ["dom.controls", (value) => { value.dom.controls[0].disabled = false; }],
    ["dom.order", (value) => { value.dom.order.reverse(); }],
    ["liveProps", (value) => { value.liveProps[0].value = "live mutation"; }],
  ];
  for (const [field, mutate] of mutations) {
    const actual = observation();
    mutate(actual);
    assert.ok(compareObservations(actual, observation()).some((mismatch) => mismatch.field === field), field);
  }
});

test("focus and selection parity is gated by an explicit focus action and enforced on follow-up ticks", () => {
  const actual = observation();
  const expected = observation();
  actual.focus = { key: "row-1-input", selectionStart: 2, selectionEnd: 5, selectionDirection: "forward" };
  expected.focus = { key: "row-1-input", selectionStart: 3, selectionEnd: 5, selectionDirection: "forward" };
  assert.deepEqual(compareObservations(actual, expected), [], "do not infer focus behavior without an explicit action");
  assert.deepEqual(compareObservations(actual, expected, { compareFocus: true }).map(({ field }) => field), ["focus"]);

  const lanes = { dom: "lane-dom", react: "lane-react", godom: "lane-godom", reference: "lane-reference" };
  const makeTick = (index, action, start) => ({
    index,
    action,
    observations: Object.fromEntries(Object.entries(lanes).map(([participant, serverLane]) => [participant, {
      ...observation(),
      serverLane,
      focus: {
        key: "row-1-input",
        selectionStart: start + (participant === "react" ? 1 : 0),
        selectionEnd: 5,
        selectionDirection: "forward",
      },
    }])),
  });
  const result = {
    scenarios: [{
      name: "focus-follow-up",
      actions: [{ kind: "focus", rowID: 1 }, { kind: "release", id: 1 }],
      ticks: [makeTick(0, null, 1), makeTick(1, { kind: "focus", rowID: 1 }, 2), makeTick(2, { kind: "release", id: 1 }, 3)],
    }],
    adversarial: { ok: true, moduleExpectedProbeNames: [], probes: [] },
    goErrors: [],
    pageErrors: [],
  };
  const focusMismatches = compareEveryTick(result, [7]).filter(({ field }) => field === "focus");
  assert.ok(focusMismatches.length > 0);
  assert.ok(focusMismatches.every(({ tick }) => tick === 1 || tick === 2));
  assert.ok(!focusMismatches.some(({ tick }) => tick === 0), "ignore focus differences before explicit focus");

  const collapsed = observation();
  const collapsedPeer = observation();
  collapsed.focus = { key: "row-1-input", selectionStart: 0, selectionEnd: 0, selectionDirection: "backward" };
  collapsedPeer.focus = { key: "row-1-input", selectionStart: 0, selectionEnd: 0, selectionDirection: "forward" };
  assert.deepEqual(compareObservations(collapsed, collapsedPeer, { compareFocus: true }), [], "collapsed direction is browser-normalized");
});

test("required observation channels fail closed when omitted synchronously", () => {
  for (const field of ["audit", "transportLog", "serverRequests", "pending", "dom", "liveProps", "runtimeCalls"]) {
    const incomplete = observation();
    delete incomplete[field];
    assert.ok(validateObservationShape(incomplete).some((issue) => issue.field === field), field);
  }
  const allMissing = laneObservations();
  for (const value of Object.values(allMissing)) {
    for (const field of ["audit", "transportLog", "serverRequests", "pending", "dom", "liveProps", "runtimeCalls"]) delete value[field];
  }
  const result = { scenarios: [{ name: "omissions", actions: [], ticks: [{ index: 0, action: null, observations: allMissing }] }], adversarial: { ok: true, expectedProbeNames: [], probes: [] } };
  assert.ok(compareEveryTick(result, [1]).some((mismatch) => mismatch.field.startsWith("observation-shape.")));
});

test("explicit focus action requires each actor to witness the requested key and selection", () => {
  const scenario = oneTickScenario({ kind: "focus", rowID: 1, selectionStart: 2, selectionEnd: 4, selectionDirection: "forward" });
  scenario.ticks[1].step = { Path: "2/0/0", Event: "focus", Value: "" };
  for (const [name, value] of Object.entries(scenario.ticks[1].observations)) {
    value.focus = { key: "row-1-input", selectionStart: 2, selectionEnd: 4, selectionDirection: "forward" };
    if (name === "godom") value.focus = null;
  }
  const result = { scenarios: [scenario], adversarial: { ok: true, expectedProbeNames: [], probes: [] } };
  assert.ok(compareEveryTick(result, [1]).some((mismatch) => mismatch.field === "focus-witness" && mismatch.candidate === "godom"));
});

test("focus witnesses apply browser range clamping and ignore direction for collapsed selections", () => {
  const collapsed = { kind: "focus", rowID: 1, selectionStart: 0, selectionEnd: 0, selectionDirection: "backward" };
  const accepted = focusScenario(collapsed, "a", () => ({
    key: "row-1-input", selectionStart: 0, selectionEnd: 0, selectionDirection: "forward",
  }));
  assert.deepEqual(compareEveryTick({ scenarios: [accepted], adversarial: { ok: true, expectedProbeNames: [], probes: [] } }, [1]), []);
  accepted.ticks[1].observations.dom.focus.selectionDirection = "backward";
  assert.deepEqual(compareEveryTick({ scenarios: [accepted], adversarial: { ok: true, expectedProbeNames: [], probes: [] } }, [1]), [],
    "one actor may report a different collapsed-range direction");

  const clamped = focusScenario({ ...collapsed, selectionEnd: 50 }, "abc", () => ({
    key: "row-1-input", selectionStart: 0, selectionEnd: 3, selectionDirection: "backward",
  }));
  assert.deepEqual(compareEveryTick({ scenarios: [clamped], adversarial: { ok: true, expectedProbeNames: [], probes: [] } }, [1]), []);

  const wrongSelection = structuredClone(clamped);
  wrongSelection.ticks[1].observations.godom.focus.selectionEnd = 2;
  assert.ok(compareEveryTick({ scenarios: [wrongSelection], adversarial: { ok: true, expectedProbeNames: [], probes: [] } }, [1])
    .some((mismatch) => mismatch.field === "focus-witness" && mismatch.candidate === "godom"));

  const noncollapsed = focusScenario({ ...collapsed, selectionStart: 0, selectionEnd: 2, selectionDirection: "backward" }, "abc", () => ({
    key: "row-1-input", selectionStart: 0, selectionEnd: 2, selectionDirection: "forward",
  }));
  assert.ok(compareEveryTick({ scenarios: [noncollapsed], adversarial: { ok: true, expectedProbeNames: [], probes: [] } }, [1])
    .some((mismatch) => mismatch.field === "focus-witness"));

  const undirected = focusScenario({ ...collapsed, selectionStart: 0, selectionEnd: 2, selectionDirection: "none" }, "abc", () => ({
    key: "row-1-input", selectionStart: 0, selectionEnd: 2, selectionDirection: "forward",
  }));
  assert.deepEqual(compareEveryTick({ scenarios: [undirected], adversarial: { ok: true, expectedProbeNames: [], probes: [] } }, [1]), [],
    "requested none leaves the browser's native direction unspecified");
  undirected.ticks[1].observations.godom.focus.selectionDirection = "backward";
  assert.ok(compareEveryTick({ scenarios: [undirected], adversarial: { ok: true, expectedProbeNames: [], probes: [] } }, [1])
    .some((mismatch) => mismatch.field === "focus" && mismatch.candidate === "godom"),
  "actual focus directions still require actor parity");
});

test("fill message witness strips only browser-sanitized CR/LF and preserves exact whitespace", () => {
  const action = { kind: "fill", rowID: 1, value: "  exact whitespace\n" };
  const accepted = fillScenario(action);
  assert.deepEqual(compareEveryTick({ scenarios: [accepted], adversarial: { ok: true, expectedProbeNames: [], probes: [] } }, [1]), []);

  const trimmed = structuredClone(accepted);
  trimmed.ticks[1].observations.godom.snapshot.messages[0].Arg = "exact whitespace";
  assert.ok(compareEveryTick({ scenarios: [trimmed], adversarial: { ok: true, expectedProbeNames: [], probes: [] } }, [1])
    .some((mismatch) => mismatch.field === "dispatch-message" && mismatch.candidate === "godom"));
});

test("synchronized no-op add is rejected without a per-actor dispatch receipt and message witness", () => {
  const scenario = oneTickScenario({ kind: "add" });
  const result = { scenarios: [scenario], adversarial: { ok: true, expectedProbeNames: [], probes: [] } };
  assert.deepEqual(compareEveryTick(result, [1]), []);

  const bypass = structuredClone(scenario);
  bypass.ticks[1].observations = structuredClone(bypass.ticks[0].observations);
  bypass.ticks[1].deliveries = Object.fromEntries(["dom", "react", "godom", "reference"].map((name) => [name, { dispatchDelta: 0, disabledTarget: false }]));
  const rejected = compareEveryTick({ scenarios: [bypass], adversarial: { ok: true, expectedProbeNames: [], probes: [] } }, [1]);
  assert.ok(rejected.some((mismatch) => mismatch.field === "dispatch-delivery"));
  assert.ok(rejected.some((mismatch) => mismatch.field === "dispatch-message"));
});

test("native frames must be nonempty and match every captured browser observation and action step", () => {
  const scenario = nativeScenario();
  assert.deepEqual(validateNativeFrames(scenario), []);
  const blank = structuredClone(scenario);
  for (const actorFrames of blank.nativeTicks) {
    for (const frame of Object.values(actorFrames)) {
      frame.State = "";
      frame.Tree = "";
      frame.DOM = "";
      frame.Step = { Path: "", Event: "", Value: "" };
    }
  }
  const issues = validateNativeFrames(blank);
  assert.ok(issues.some(({ field }) => field === "State"));
  assert.ok(issues.some(({ field }) => field === "Tree"));
  assert.ok(issues.some(({ field }) => field === "DOM"));
  assert.ok(issues.some(({ field, tick }) => field === "Step" && tick === 1));

  const inconsistent = structuredClone(scenario);
  inconsistent.nativeTicks[1].dom.Index = 7;
  assert.ok(validateNativeFrames(inconsistent).some(({ field, participant }) => field === "Index" && participant === "dom"));
});

test("native envelopes include all observable trace fields while using the supported step tuple", () => {
  assert.deepEqual(nativeStep({ kind: "fill", rowID: 7, value: "draft", path: "2/0/0", key: "row-7-input" }), {
    Path: "2/0/0", Event: "input", Value: "draft",
  });
  assert.deepEqual(nativeStep({ kind: "click", action: "up", rowID: 7, path: "2/0/7", key: "row-7-up" }), {
    Path: "2/0/7", Event: "click", Value: "",
  });
  assert.deepEqual(nativeTick(1, { Path: "2/0/0", Event: "input", Value: "draft" }, observation()), {
    Index: 1,
    Step: { Path: "2/0/0", Event: "input", Value: "draft" },
    State: JSON.stringify(snapshot().state),
    Tree: JSON.stringify(snapshot().tree),
    DOM: dom().root,
    Pixels: "",
    Mutations: 0,
    Bindings: JSON.stringify(snapshot().bindings),
    Messages: JSON.stringify(snapshot().messages),
    InputValue: "a",
    Disabled: JSON.stringify(dom().controls),
    ServerRequests: JSON.stringify(observation().serverRequests),
    Transport: JSON.stringify(observation().transportLog),
    Audit: JSON.stringify(observation().audit),
  });
});

test("native comparison is required for all three candidates and cannot pass with an incomplete trace set", () => {
  const complete = { status: "matched", scenarios: ["dom", "react", "godom"].map((candidate) => ({ script: "fixed", candidate, status: "matched" })) };
  assert.deepEqual(requireNativeComparison(complete), complete);
  for (const value of [null, { status: "unavailable", scenarios: [] }, { status: "matched", scenarios: [] }]) {
    assert.throws(() => requireNativeComparison(value), /required and must match/);
  }
  assert.throws(() => requireNativeComparison({ status: "matched", scenarios: [{ candidate: "dom", status: "matched" }] }), /dom\/react\/godom/);
});

test("Go contract CLI validation is required per candidate observation and caches exact snapshots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "renderer-contract-cli-"));
  const validator = join(directory, "render-contract");
  await writeFile(validator, "#!/bin/sh\ncat >/dev/null\nprintf '{\"valid\":true}\\n'\n");
  await chmod(validator, 0o755);
  const same = snapshot();
  const result = validateContractSnapshots({ scenarios: [{
    name: "fixed",
    seed: null,
    ticks: [0, 1].map((index) => ({ index, observations: Object.fromEntries(["dom", "react", "godom"].map((candidate) => [candidate, { snapshot: same }])) })),
  }] }, { status: "ready", file: validator });
  assert.equal(result.status, "matched");
  assert.equal(result.observations, 6);
  assert.equal(result.uniqueSnapshots, 1);
  assert.equal(result.cachedObservations, 5);
  assert.ok(result.records.every((record) => record.status === "valid"));
  await rm(directory, { recursive: true, force: true });
});

test("CLI requires deterministic seeds and rejects missing or invalid ranges", () => {
  assert.deepEqual(parseArgs([]), {
    seeds: [20261030, 20261031], cases: 30, maxActions: 40, output: null, headed: false, help: false,
  });
  assert.deepEqual(parseArgs(["--seeds", "17,19", "--cases", "4", "--max-actions", "5", "--headed"]), {
    seeds: [17, 19], cases: 4, maxActions: 5, output: null, headed: true, help: false,
  });
  for (const args of [["--seeds", "1,1"], ["--seed", "-1"], ["--cases", "-1"], ["--max-actions", "41"], ["--unknown"]]) {
    assert.throws(() => parseArgs(args));
  }
});

test("HTTP lab readiness failures clear timers and terminate and reap the child", async () => {
  const directory = await mkdtemp(join(tmpdir(), "keyed-e5-startup-"));
  const fakeLab = join(directory, "fake-lab.js");
  const pidFile = join(directory, "child.pid");
  const invalidExecutable = join(directory, "invalid-executable");
  await writeFile(fakeLab, `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(process.env.KEYED_E5_FAKE_LAB_PID_FILE, String(process.pid));
if (process.env.KEYED_E5_FAKE_LAB_MODE === "malformed") process.stdout.write("{bad readiness\\n");
if (process.env.KEYED_E5_FAKE_LAB_MODE === "invalid-url") process.stdout.write(JSON.stringify({ url: "file:///tmp/lab" }) + "\\n");
setInterval(() => {}, 1000);
`);
  await chmod(fakeLab, 0o755);
  await writeFile(invalidExecutable, "#!/definitely/missing/keyed-e5-interpreter\n");
  await chmod(invalidExecutable, 0o755);

  const oldLab = process.env.HTTP_LAB_BIN;
  const oldMode = process.env.KEYED_E5_FAKE_LAB_MODE;
  const oldPIDFile = process.env.KEYED_E5_FAKE_LAB_PID_FILE;
  function assertGone(pid) {
    assert.throws(() => process.kill(pid, 0), (error) => error?.code === "ESRCH", `child ${pid} must be gone`);
  }
  try {
    process.env.HTTP_LAB_BIN = fakeLab;
    process.env.KEYED_E5_FAKE_LAB_PID_FILE = pidFile;
    for (const [mode, expectedError, timeout] of [
      ["malformed", /invalid readiness JSON/, 1_000],
      ["invalid-url", /readiness URL is invalid/, 1_000],
      ["silent", /timed out waiting for HTTP lab readiness/, 200],
    ]) {
      process.env.KEYED_E5_FAKE_LAB_MODE = mode;
      await rm(pidFile, { force: true });
      await assert.rejects(startLabServer({ readyTimeoutMs: timeout }), expectedError);
      const pid = Number(await readFile(pidFile, "utf8"));
      assert.ok(Number.isSafeInteger(pid) && pid > 0, `${mode} child PID was recorded`);
      assertGone(pid);
    }

    process.env.HTTP_LAB_BIN = invalidExecutable;
    await assert.rejects(startLabServer({ readyTimeoutMs: 200 }), /could not start HTTP lab server/);
  } finally {
    if (oldLab === undefined) delete process.env.HTTP_LAB_BIN;
    else process.env.HTTP_LAB_BIN = oldLab;
    if (oldMode === undefined) delete process.env.KEYED_E5_FAKE_LAB_MODE;
    else process.env.KEYED_E5_FAKE_LAB_MODE = oldMode;
    if (oldPIDFile === undefined) delete process.env.KEYED_E5_FAKE_LAB_PID_FILE;
    else process.env.KEYED_E5_FAKE_LAB_PID_FILE = oldPIDFile;
    await rm(directory, { recursive: true, force: true });
  }
});

test("fresh layout prefers the inherited HTTP lab and performs real startup and cleanup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "keyed-e5-fresh-layout-"));
  const oldLab = process.env.HTTP_LAB_BIN;
  const oldGo = process.env.GO_BIN;
  const missingConfiguredLab = join(directory, "keyed-build-does-not-contain-http-lab");
  const missingGo = join(directory, "go-does-not-exist");
  const inheritedLab = resolve(dirname(fileURLToPath(import.meta.url)), "../http-effects/build/http-lab");
  let server = null;
  try {
    process.env.HTTP_LAB_BIN = missingConfiguredLab;
    process.env.GO_BIN = missingGo;
    server = await startLabServer({ readyTimeoutMs: 30_000 });
    assert.equal(server.binary, inheritedLab, "a fresh keyed build uses the lab built by the inherited runner");
    const response = await fetch(`${server.url}/api/requests?lane=fresh-ci-layout`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { lane: "fresh-ci-layout", requests: [] });
  } finally {
    if (server) await stopLabServer(server.child);
    if (oldLab === undefined) delete process.env.HTTP_LAB_BIN;
    else process.env.HTTP_LAB_BIN = oldLab;
    if (oldGo === undefined) delete process.env.GO_BIN;
    else process.env.GO_BIN = oldGo;
    await rm(directory, { recursive: true, force: true });
  }
  assert.ok(server.child.exitCode !== null || server.child.signalCode !== null, "real lab child is stopped");
  await assert.rejects(fetch(`${server.url}/api/requests?lane=fresh-ci-layout`), /fetch failed|ECONNREFUSED/);
});

test("Go fallback skips missing configured candidates and resolves PATH commands", async () => {
  const directory = await mkdtemp(join(tmpdir(), "keyed-e5-go-path-"));
  const fakeGo = join(directory, "go");
  const oldPath = process.env.PATH;
  await writeFile(fakeGo, "#!/bin/sh\nexit 0\n");
  await chmod(fakeGo, 0o755);
  try {
    process.env.PATH = `${directory}${delimiter}${oldPath ?? ""}`;
    assert.equal(await selectGoCommand([join(directory, "missing-go"), "go"]), "go");
    await assert.rejects(selectGoCommand([join(directory, "missing-go")]), /no executable Go command found/);
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    await rm(directory, { recursive: true, force: true });
  }
});

test("required adversarial checks must all run once and pass", () => {
  const registryName = "manifest-version-and-capability-reject-before-init-mount-or-transport";
  const passing = expectedProbeNames.map((name) => ({ name, kind: name === registryName ? "registry-contract" : "real-go", pass: true }));
  assert.equal(validateProbeSet(passing).ok, true);
  assert.throws(() => validateProbeSet(passing.slice(1)), /missing required adversarial probes/);
  assert.throws(() => validateProbeSet([...passing, passing[0]]), /duplicate adversarial probes/);
  assert.equal(validateProbeSet(passing.map((probe, index) => index === 0 ? { ...probe, pass: false } : probe)).ok, false);
});
