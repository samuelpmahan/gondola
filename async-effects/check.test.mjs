import test from "node:test";
import assert from "node:assert/strict";
import {
  compareObservations,
  compareSnapshots,
  nativeStep,
  nativeTick,
  parseArgs,
  parseSeedList,
} from "./check.mjs";

function snapshot() {
  return {
    state: { Draft: "draft", Saved: "saved", Saves: 1, NextID: 2, PendingID: 2, Status: "pending" },
    tree: { Kind: 1, Tag: "div", Kids: [{ Kind: 2, Text: "editor" }] },
    bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
    messages: [{ Name: "save", Arg: "" }],
  };
}

function observation() {
  const dom = {
    html: '<div class="editor"><input value="draft"><button>Save</button></div>',
    root: '<div class="editor"><input value="draft"><button>Save</button></div>',
    disabled: ["4"],
    inputPath: "0",
    inputValue: "draft",
    inputDisabled: false,
    controlProperties: [
      { path: "0", tag: "input", value: "draft", disabled: false, checked: null },
      { path: "3", tag: "button", value: "", disabled: false, checked: null },
      { path: "4", tag: "button", value: "", disabled: true, checked: null },
    ],
    reportedHTML: '<div class="editor"><input value="draft"><button>Save</button></div>',
    reportedDisabled: ["4"],
  };
  const transportLog = [{ kind: "start", command: { Kind: "start", ID: 2, Value: "draft" } }];
  return {
    snapshot: snapshot(),
    audit: [{ ID: 1, Value: "saved", Error: "", Accepted: true, Reason: "saved" }],
    transportLog,
    pending: [{ Kind: "start", ID: 2, Value: "draft" }],
    dom,
  };
}

test("identical full observations compare cleanly", () => {
  assert.deepEqual(compareObservations(observation(), observation()), []);
});

test("snapshot comparison checks state, tree, bindings and ordered messages", () => {
  for (const field of ["state", "tree", "bindings", "messages"]) {
    const actual = snapshot();
    const expected = snapshot();
    if (field === "state") actual.state.Status = "error: offline";
    else if (field === "tree") actual.tree.Kids[0].Text = "different";
    else if (field === "bindings") actual.bindings[0].Source = "wrong";
    else actual.messages.push({ Name: "reply", Arg: "2" });
    assert.deepEqual(compareSnapshots(actual, expected).map(({ field: changed }) => changed), [field]);
  }
});

test("full observation comparison catches audit, transport order and pending drift", () => {
  for (const field of ["audit", "transportLog", "pending"]) {
    const actual = observation();
    const expected = observation();
    actual[field].push(field === "audit"
      ? { ID: 2, Value: "", Error: "late", Accepted: false, Reason: "stale" }
      : field === "transportLog"
        ? { kind: "cancel", id: 2 }
        : { Kind: "start", ID: 3, Value: "new" });
    assert.deepEqual(compareObservations(actual, expected).map(({ field: changed }) => changed), [field]);
  }
});

test("full observation comparison catches each raw DOM and property drift", () => {
  const domFields = [
    "html", "root", "disabled", "inputPath", "inputValue", "inputDisabled", "controlProperties",
    "reportedHTML", "reportedDisabled",
  ];
  for (const field of domFields) {
    const actual = observation();
    const expected = observation();
    actual.dom[field] = field === "controlProperties" ? [{ path: "0", disabled: true }] : `different:${field}`;
    const mismatches = compareObservations(actual, expected);
    assert(mismatches.some(({ field: changed }) => changed === `dom.${field}`), `missed ${field} drift`);
  }
});

test("renderer DOM reports must match the captured live DOM", () => {
  const actual = observation();
  const expected = observation();
  actual.dom.reportedHTML = "<unreported />";
  actual.dom.reportedDisabled = [];
  assert.deepEqual(compareObservations(actual, expected).map(({ field }) => field), [
    "dom.reportedHTML", "dom.reportedDisabled", "actual.dom.reportedHTML", "actual.dom.reportedDisabled",
  ]);
});

test("native ticks retain existing CompareInteraction fields and extended diagnostics", () => {
  const item = observation();
  const initial = nativeTick(0, null, item);
  assert.deepEqual(initial.Step, { Path: "", Event: "", Value: "" });
  assert.equal(initial.State, JSON.stringify(item.snapshot.state));
  assert.equal(initial.Tree, JSON.stringify(item.snapshot.tree));
  assert.equal(initial.DOM, item.dom.root);
  assert.equal(initial.InputValue, "draft");
  assert.equal(initial.InputDisabled, false);
  assert.equal(initial.Bindings, JSON.stringify(item.snapshot.bindings));
  assert.equal(initial.Messages, JSON.stringify(item.snapshot.messages));
  assert.equal(initial.Audit, JSON.stringify(item.audit));
  assert.equal(initial.Transport, JSON.stringify(item.transportLog));
});

test("native steps encode every user-visible action family", () => {
  assert.deepEqual(nativeStep({ kind: "fill", value: "edit" }), { Path: "0", Event: "input", Value: "edit" });
  assert.deepEqual(nativeStep({ kind: "type-char", resultingValue: "draft!" }), { Path: "0", Event: "input", Value: "draft!" });
  assert.deepEqual(nativeStep({ kind: "stale-input", value: "ignored" }), { Path: "0", Event: "input", Value: "ignored" });
  assert.deepEqual(nativeStep({ kind: "click", button: "cancel", Path: "5" }), { Path: "5", Event: "click", Value: "" });
  assert.deepEqual(nativeStep({ kind: "reply", id: 7 }), { Path: "", Event: "reply", Value: "7" });
  assert.deepEqual(nativeStep({ kind: "swap", host: "dom", backend: "react" }), { Path: "", Event: "backend", Value: "dom:react" });
});

test("CLI defaults and seed validation preserve the required two-seed run", () => {
  assert.deepEqual(parseArgs([]), {
    seeds: [20261030, 20261031], cases: 30, maxActions: 40, output: null, headed: false,
  });
  assert.deepEqual(parseSeedList("20261030,20261031"), [20261030, 20261031]);
  assert.deepEqual(parseArgs(["--seed", "13", "--cases", "0", "--max-actions", "7"]), {
    seeds: [13], cases: 0, maxActions: 7, output: null, headed: false,
  });
  assert.throws(() => parseSeedList("1,1"), /unique/);
  assert.throws(() => parseArgs(["--max-actions", "41"]), /1 through 40/);
});
