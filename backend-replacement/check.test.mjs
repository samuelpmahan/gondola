import test from "node:test";
import assert from "node:assert/strict";
import { compareBrowserErrors, compareSnapshots, nativeStep, parseArgs } from "./check.mjs";
import { BUTTON_PATH, fixedScripts, seededScripts } from "./scripts.mjs";

const snapshot = () => ({
  state: { Count: 1 },
  tree: {
    Kind: 1,
    Tag: "div",
    Key: "",
    Attrs: [{ Name: "class", Value: "counter", Flag: false, Style: null }],
    On: null,
    Kids: [{ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text: "1" }],
    Text: "",
  },
  messages: [{ Name: "add", Arg: "" }],
});

const dom = () => ({
  html: '<div class="counter"><p>Count: 1</p><button class="add">+</button><button>Reset</button></div>',
  root: '<div class="counter"><p>Count: 1</p><button class="add">+</button><button>Reset</button></div>',
  disabled: [],
  reportedHTML: '<div class="counter"><p>Count: 1</p><button class="add">+</button><button>Reset</button></div>',
  reportedDisabled: [],
});

test("three matching snapshot channels have no differences", () => {
  assert.deepEqual(compareSnapshots(snapshot(), dom(), snapshot(), dom()), []);
});

test("comparison is strict for state, full Node tree, and ordered messages", () => {
  const actual = snapshot();
  const expected = snapshot();
  expected.state.Count = 2;
  expected.tree.Kids[0].Text = "2";
  expected.messages.push({ Name: "reset", Arg: "" });
  assert.deepEqual(
    compareSnapshots(actual, dom(), expected, dom()).map(({ field }) => field),
    ["state", "tree", "messages"],
  );
});

test("comparison checks actual HTML, disabled paths, and root outerHTML independently", () => {
  const actualDOM = dom();
  const expectedDOM = dom();
  expectedDOM.html = "<main></main>";
  expectedDOM.root = "<main></main>";
  expectedDOM.disabled = ["2"];
  actualDOM.reportedHTML = "<div>adapter disagrees</div>";
  actualDOM.reportedDisabled = ["unexpected"];
  assert.deepEqual(
    compareSnapshots(snapshot(), actualDOM, snapshot(), expectedDOM).map(({ field }) => field),
    ["dom.html", "dom.disabled", "dom.root", "dom.reportedHTML", "dom.reportedDisabled"],
  );
});

test("fixed scripts include clicks, repeated mid-session swaps, and unknown backend failures", () => {
  assert.ok(fixedScripts.some(({ actions }) => actions.some(({ kind }) => kind === "unknown-backend")));
  for (const host of ["dom", "react"]) {
    assert.ok(fixedScripts.some(({ actions }) => actions.some((action) => action.kind === "swap" && action.host === host)));
  }
  assert.ok(fixedScripts.some(({ actions }) => actions.filter(({ kind }) => kind === "swap").length >= 4));
});

test("seeded scripts are deterministic, bounded, and exercise both hosts when budget permits", () => {
  const options = { cases: 12, maxActions: 9 };
  const first = seededScripts(20261030, options);
  assert.deepEqual(first, seededScripts(20261030, options));
  assert.equal(first.length, options.cases);
  for (const script of first) {
    assert.ok(script.actions.length <= options.maxActions);
    const swapHosts = script.actions.filter(({ kind }) => kind === "swap").map(({ host }) => host);
    assert.ok(swapHosts.length > 0);
    if (script.actions.length >= 2) {
      assert.ok(swapHosts.includes("dom"));
      assert.ok(swapHosts.includes("react"));
    }
  }
});

test("short generated scripts respect maxActions and retain at least one replacement", () => {
  const onlyOne = seededScripts(9, { cases: 4, maxActions: 1 });
  for (const script of onlyOne) {
    assert.equal(script.actions.length, 1);
    assert.equal(script.actions[0].kind, "swap");
  }
  assert.deepEqual(seededScripts(9, { cases: 0, maxActions: 1 }), []);
});

test("native steps distinguish backend swaps and preserve real click input", () => {
  assert.deepEqual(nativeStep({ kind: "click", action: "add", Path: BUTTON_PATH.add, Event: "click", Value: "" }), {
    Path: "1", Event: "click", Value: "",
  });
  assert.deepEqual(nativeStep({ kind: "swap", host: "dom", backend: "react" }), {
    Path: "", Event: "backend:react", Value: "dom",
  });
  assert.deepEqual(nativeStep({ kind: "unknown-backend", host: "react" }), {
    Path: "", Event: "backend:unknown", Value: "react",
  });
});

const expectedRuntimeError = "backend host: runtime.dispatch() returned a runtime error: __EXPECTED_RUNTIME_FAILURE__";
const expectedErrorManifest = () => [{
  probe: "runtime errors fail closed and preserve the last snapshot",
  source: "window.error",
  message: expectedRuntimeError,
}];

test("scoped expected runtime failure passes only with an exact manifest and no global browser errors", () => {
  assert.deepEqual(compareBrowserErrors([], expectedErrorManifest(), 7), []);
});

test("unrelated browser errors remain fatal when the expected error was scoped", () => {
  const mismatches = compareBrowserErrors(["Unexpected page error"], expectedErrorManifest(), 7);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].kind, "browser-error");
  assert.equal(mismatches[0].actual, "Unexpected page error");
});

test("a duplicate sentinel in global errors remains fatal", () => {
  const mismatches = compareBrowserErrors([expectedRuntimeError], expectedErrorManifest(), 7);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].kind, "browser-error");
  assert.equal(mismatches[0].actual, expectedRuntimeError);
});

test("CLI options default to the required seed and generated trace size", () => {
  assert.deepEqual(parseArgs([]), {
    seed: 20261030,
    cases: 100,
    maxActions: 80,
    output: null,
    headed: false,
  });
  assert.deepEqual(parseArgs(["--seed", "7", "--cases", "2", "--max-actions", "4", "--output", "report.json", "--headed"]), {
    seed: 7,
    cases: 2,
    maxActions: 4,
    output: resolvePathForTest("report.json"),
    headed: true,
  });
});

function resolvePathForTest(path) {
  return new URL(path, `file://${process.cwd()}/`).pathname;
}

test("CLI rejects malformed ranges and unknown flags", () => {
  for (const args of [
    ["--seed", "-1"],
    ["--seed", "4294967296"],
    ["--cases", "-1"],
    ["--max-actions", "0"],
    ["--mystery"],
  ]) assert.throws(() => parseArgs(args));
});
