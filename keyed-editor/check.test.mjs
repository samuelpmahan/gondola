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
  parseArgs,
  requireNativeComparison,
  selectGoCommand,
  startLabServer,
  stopLabServer,
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

const observation = () => ({
  snapshot: snapshot(),
  audit: [{ ID: 2, RowID: 1, Value: "a", Error: "", Accepted: true, Reason: "saved" }],
  transportLog: [{ Kind: "start", ID: 2, Value: "a" }],
  serverRequests: [{ ID: 2, State: "completed", Mode: "success" }],
  dom: dom(),
});

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
    ["dom.html", (value) => { value.dom.html += " "; value.dom.reportedHTML += " "; }],
    ["dom.root", (value) => { value.dom.root += " "; }],
    ["dom.disabled", (value) => { value.dom.disabled = []; value.dom.reportedDisabled = []; }],
    ["dom.inputValue", (value) => { value.dom.inputValue = "stale"; }],
    ["dom.controls", (value) => { value.dom.controls[0].disabled = false; }],
    ["dom.order", (value) => { value.dom.order.reverse(); }],
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

  const lanes = { dom: "lane-dom", react: "lane-react", reference: "lane-reference" };
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

test("native comparison is a required gate and cannot pass with an empty trace set", () => {
  assert.deepEqual(requireNativeComparison({ status: "matched", scenarios: [{ script: "fixed", candidate: "dom" }] }), {
    status: "matched", scenarios: [{ script: "fixed", candidate: "dom" }],
  });
  for (const value of [null, { status: "unavailable", scenarios: [] }, { status: "matched", scenarios: [] }]) {
    assert.throws(() => requireNativeComparison(value), /required and must match/);
  }
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
  const passing = expectedProbeNames.map((name) => ({ name, kind: "real-go", pass: true }));
  assert.equal(validateProbeSet(passing).ok, true);
  assert.throws(() => validateProbeSet(passing.slice(1)), /missing required adversarial probes/);
  assert.throws(() => validateProbeSet([...passing, passing[0]]), /duplicate adversarial probes/);
  assert.equal(validateProbeSet(passing.map((probe, index) => index === 0 ? { ...probe, pass: false } : probe)).ok, false);
});
