import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  compareSnapshots,
  nativeStep,
  nativeTick,
  parseArgs,
} from "./check.mjs";
import {
  BUTTON_PATH,
  fixedScripts,
  seededScripts,
} from "./scripts.mjs";

const snapshot = () => ({
  state: { Draft: "hello", Saved: "", Saves: 0 },
  tree: {
    Kind: 1,
    Tag: "div",
    Key: "",
    Attrs: [{ Name: "class", Value: "editor", Flag: false, Style: null }],
    On: null,
    Kids: [{ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text: "hello" }],
    Text: "",
  },
  bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
  messages: [{ Name: "edit", Arg: "hello" }],
});

const dom = () => ({
  html: '<div class="editor"><input aria-label="Draft" type="text" value="hello"><button class="save">Save</button></div>',
  root: '<div class="editor"><input aria-label="Draft" type="text" value="hello"><button class="save">Save</button></div>',
  disabled: ["4"],
  inputValue: "hello",
  disabledProperties: [{ path: "3", disabled: false }, { path: "4", disabled: true }],
  reportedHTML: '<div class="editor"><input aria-label="Draft" type="text" value="hello"><button class="save">Save</button></div>',
  reportedDisabled: ["4"],
});

function copy(value) {
  return structuredClone(value);
}

test("matching snapshot and browser observations have no differences", () => {
  assert.deepEqual(compareSnapshots(snapshot(), dom(), snapshot(), dom()), []);
});

test("snapshot comparison rejects state, tree, bindings, and ordered-message differences independently", () => {
  const cases = [
    ["state", (value) => { value.state.Draft = "different"; }],
    ["tree", (value) => { value.tree.Kids[0].Text = "different"; }],
    ["bindings", (value) => { value.bindings[0].Source = "wrong.source"; }],
    ["messages", (value) => { value.messages.push({ Name: "save", Arg: "" }); }],
  ];
  for (const [field, mutate] of cases) {
    const actual = snapshot();
    mutate(actual);
    assert.deepEqual(compareSnapshots(actual, dom(), snapshot(), dom()).map(({ field: got }) => got), [field]);
  }
});

test("browser comparison checks raw HTML, value property, disabled paths, and disabled properties separately", () => {
  const cases = [
    ["dom.html", (value) => { value.html += " "; value.reportedHTML += " "; }],
    ["dom.root", (value) => { value.root += " "; }],
    ["dom.inputValue", (value) => { value.inputValue = "property-only"; }],
    ["dom.disabled", (value) => { value.disabled = []; value.reportedDisabled = []; }],
    ["dom.disabledProperties", (value) => { value.disabledProperties[1].disabled = false; }],
  ];
  for (const [field, mutate] of cases) {
    const actualDOM = dom();
    mutate(actualDOM);
    assert.deepEqual(compareSnapshots(snapshot(), actualDOM, snapshot(), dom()).map(({ field: got }) => got), [field]);
  }
});

test("renderer-reported DOM channels are checked against actual DOM independently", () => {
  const actualDOM = dom();
  actualDOM.reportedHTML = "renderer claim";
  actualDOM.reportedDisabled = [];
  assert.deepEqual(
    compareSnapshots(snapshot(), actualDOM, snapshot(), dom()).map(({ field }) => field),
    ["actual.dom.reportedHTML", "actual.dom.reportedDisabled"],
  );
});

test("native steps preserve browser input values and literal button arguments", () => {
  assert.deepEqual(nativeStep({ kind: "fill", value: "draft🙂" }), {
    Path: "0", Event: "input", Value: "draft🙂",
  });
  assert.deepEqual(nativeStep({ kind: "type-char", character: "x", resultingValue: "draftx" }), {
    Path: "0", Event: "input", Value: "draftx",
  });
  assert.deepEqual(nativeStep({ kind: "click", button: "save", Path: BUTTON_PATH.save }), {
    Path: "3", Event: "click", Value: "",
  });
  assert.deepEqual(nativeStep({ kind: "swap", host: "react", backend: "dom" }), {
    Path: "", Event: "backend:dom", Value: "react",
  });
  assert.deepEqual(nativeStep(null), { Path: "", Event: "", Value: "" });
});

test("CompareInteraction envelope carries extra binding, message, value, and disabled fields", () => {
  const envelopeTick = nativeTick(1, { Path: "0", Event: "input", Value: "hello" }, {
    snapshot: snapshot(),
    dom: dom(),
  });
  assert.deepEqual(envelopeTick, {
    Index: 1,
    Step: { Path: "0", Event: "input", Value: "hello" },
    State: JSON.stringify(snapshot().state),
    Tree: JSON.stringify(snapshot().tree),
    DOM: dom().root,
    Pixels: "",
    Mutations: 0,
    Bindings: JSON.stringify(snapshot().bindings),
    Messages: JSON.stringify(snapshot().messages),
    InputValue: "hello",
    Disabled: JSON.stringify(dom().disabledProperties),
  });
});

test("fixed scripts cover empty and repeated saves, reset at zero, Unicode, typing, swaps, and stale input", () => {
  const actions = fixedScripts.flatMap(({ actions: scriptActions }) => scriptActions);
  assert.ok(actions.some(({ kind, value }) => kind === "fill" && value === ""));
  assert.ok(actions.some(({ kind }) => kind === "type"));
  assert.ok(actions.some(({ kind }) => kind === "stale-input"));
  assert.ok(actions.some(({ kind }) => kind === "swap"));
  assert.ok(actions.some(({ kind, button }) => kind === "click" && button === "reset"));
  const repeatedSaveScript = fixedScripts.find(({ name }) => name === "repeated-saves-reset-and-reset-at-zero");
  assert.equal(repeatedSaveScript.actions.filter(({ kind, button }) => kind === "click" && button === "save").length, 2);
  const swapTyping = fixedScripts.find(({ name }) => name === "typing-after-unsaved-draft-swaps");
  assert.deepEqual(swapTyping.actions.map(({ kind }) => kind), ["fill", "swap", "type", "swap", "type", "click"]);
  const unicodeScript = fixedScripts.find(({ name }) => name === "unicode-and-html-escaping");
  assert.ok(unicodeScript.actions.some(({ kind, value }) => kind === "fill" && value.includes("🌍")));
});

test("seeded scripts are deterministic, bounded, and guarantee an edit plus swaps", () => {
  const options = { cases: 20, maxActions: 11 };
  const first = seededScripts(20261030, options);
  assert.deepEqual(first, seededScripts(20261030, options));
  assert.equal(first.length, options.cases);
  for (const [index, script] of first.entries()) {
    assert.equal(script.seed, 20261030);
    assert.equal(script.name, `seed-20261030-case-${index}`);
    assert.ok(script.actions.length <= options.maxActions);
    assert.equal(script.actions[0].kind, "fill");
    if (script.actions.length >= 2) assert.ok(script.actions.some(({ kind }) => kind === "swap"));
  }
  assert.deepEqual(seededScripts(7, { cases: 0, maxActions: 1 }), []);
  assert.throws(() => seededScripts(7, { cases: 1, maxActions: 81 }), /1 through 80/);
});

test("CLI defaults to both required seeds and accepts explicit seeds and report paths", () => {
  assert.deepEqual(parseArgs([]), {
    seeds: [20261030, 20261031],
    cases: 100,
    maxActions: 80,
    output: null,
    headed: false,
  });
  assert.deepEqual(parseArgs(["--seed", "17", "--cases", "2", "--max-actions", "4", "--output", "trace.json", "--headed"]), {
    seeds: [17],
    cases: 2,
    maxActions: 4,
    output: resolve("trace.json"),
    headed: true,
  });
  assert.deepEqual(parseArgs(["--seeds", "3,9"]), {
    seeds: [3, 9],
    cases: 100,
    maxActions: 80,
    output: null,
    headed: false,
  });
});

test("CLI rejects invalid ranges, duplicate seeds, and unknown flags", () => {
  for (const args of [
    ["--seed", "-1"],
    ["--seed", "4294967296"],
    ["--seeds", "8,8"],
    ["--seeds", "1,"],
    ["--cases", "-1"],
    ["--max-actions", "0"],
    ["--max-actions", "81"],
    ["--mystery"],
  ]) assert.throws(() => parseArgs(args));
});
