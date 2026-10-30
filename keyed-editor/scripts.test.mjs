import assert from "node:assert/strict";
import test from "node:test";

import { createCollectionReference } from "./model.mjs";
import {
  DEFAULT_SEEDS,
  HTTP_MODES,
  HTTP_RELEASE_MODES,
  fixedScripts,
  makeScripts,
  parseSeedList,
  seededScripts,
} from "./scripts.mjs";

test("fixed schedules cover each required identity, focus, and HTTP outcome", () => {
  const names = fixedScripts.map(({ name }) => name);
  for (const expected of [
    "four-row-cap-keeps-add-disabled-and-identity-stable",
    "keyed-reorder-keeps-logical-focus-and-selection",
    "pending-save-edit-reorder-and-live-completion",
    "remove-pending-add-new-id-path-reuse-and-detached-event",
    "reset-cancels-in-row-order-and-never-reuses-identities",
    "repeat-save-cancel-and-late-replies",
    "http-error-retry-wrong-id-malformed-status-and-drop",
    "independent-row-completions-preserve-other-row",
    "old-path-old-key-cannot-edit-row-after-up",
    "deleting-focused-row-does-not-transfer-logical-focus",
  ]) assert.ok(names.includes(expected), `missing fixed scenario ${expected}`);

  const actions = fixedScripts.flatMap(({ actions: scriptActions }) => scriptActions);
  for (const kind of ["add", "fill", "click", "mode", "release", "swap", "focus", "raw-dispatch", "detached-input"]) {
    assert.ok(actions.some((action) => action.kind === kind), `fixed scenarios omit ${kind}`);
  }
  assert.deepEqual([...new Set(actions.filter(({ kind }) => kind === "mode").map(({ mode }) => mode))].sort(),
    [...HTTP_MODES].sort());
  assert.ok(actions.some(({ kind, mode }) => kind === "release" && mode === "error"));
  for (const action of actions.filter(({ kind }) => kind === "release")) {
    assert.ok(HTTP_RELEASE_MODES.includes(action.mode));
    assert.ok([202, 409].includes(action.expectedStatus));
  }
  assert.deepEqual(DEFAULT_SEEDS, [20261030, 20261031]);
});

test("removed last row path is reused by a new ID and rejects the old key atomically", () => {
  const script = fixedScripts.find(({ name }) => name === "remove-pending-add-new-id-path-reuse-and-detached-event");
  const model = createCollectionReference();
  model.init();
  const oldPaths = new Map();
  let reusedPathChecked = false;
  let detachedInputIncluded = false;

  const rowIndex = (rowID) => model.snapshot().state.Rows.findIndex((row) => row.ID === rowID);
  const dispatchButton = (action, rowID) => {
    if (action === "reset") return model.dispatch({ Path: "1", Event: "click", Value: "", Key: "reset" });
    const index = rowIndex(rowID);
    assert.notEqual(index, -1, `row ${rowID} exists before ${action}`);
    const child = { save: 5, remove: 6, up: 7, cancel: 8 }[action];
    assert.notEqual(child, undefined, `known row action ${action}`);
    return model.dispatch({
      Path: `2/${index}/${child}`,
      Event: "click",
      Value: "",
      Key: `row-${rowID}-${action}`,
    });
  };

  for (const action of script.actions) {
    switch (action.kind) {
      case "add":
        model.dispatch({ Path: "0", Event: "click", Value: "", Key: "add" });
        break;
      case "fill": {
        const index = rowIndex(action.rowID);
        assert.notEqual(index, -1, `row ${action.rowID} exists before fill`);
        model.dispatch({
          Path: `2/${index}/0`, Event: "input", Value: action.value, Key: `row-${action.rowID}-input`,
        });
        break;
      }
      case "click": {
        if (action.action === "remove") {
          const before = model.snapshot();
          const index = rowIndex(action.rowID);
          oldPaths.set(action.rowID, before.bindings[index].Path);
        }
        dispatchButton(action.action, action.rowID);
        break;
      }
      case "mode":
        break;
      case "release":
        model.complete({ ID: action.id, Value: "late response", Error: "" });
        break;
      case "raw-dispatch": {
        const before = model.snapshot();
        const newRow = before.state.Rows.find((row) => row.ID === 3);
        const oldPath = oldPaths.get(2);
        const newBinding = before.bindings.find(({ Message }) => Message === "edit/3");
        assert.ok(newRow, "replacement row has a new logical ID");
        assert.equal(oldPath, "2/1/0", "the removed last row used the captured path");
        assert.equal(newBinding.Path, oldPath, "the new row occupies the removed row's former path");
        assert.equal(action.step.Path, oldPath, "stale dispatch uses the reused path");
        assert.equal(action.step.Key, "row-2-input", "stale dispatch retains the removed row's key");
        assert.equal(before.tree.Kids[2].Kids[1].Kids[0].Key, "row-3-input");
        assert.deepEqual(before.state.Rows.map(({ ID }) => ID), [1, 3]);
        assert.throws(() => model.dispatch(action.step), /key/i);
        assert.deepEqual(model.snapshot(), before, "rejected stale dispatch is atomic");
        reusedPathChecked = true;
        break;
      }
      case "detached-input":
        detachedInputIncluded = action.rowID === 2;
        break;
      default:
        assert.fail(`unexpected action ${action.kind} in ${script.name}`);
    }
  }

  assert.ok(reusedPathChecked, "the fixed script includes the reused-path stale-key probe");
  assert.ok(detachedInputIncluded, "the removed row also has a detached-event probe");
  assert.deepEqual(model.audit(), [{
    ID: 1, RowID: 2, Value: "late response", Error: "", Accepted: false, Reason: "stale",
  }]);
});

test("fixed and seeded action objects follow the frozen harness schema", () => {
  const scripts = [...fixedScripts, ...seededScripts(20261030, { cases: 12, maxActions: 24 })];
  for (const script of scripts) {
    assert.equal(typeof script.name, "string");
    assert.ok(Array.isArray(script.actions));
    assert.ok(script.actions.length > 0 && script.actions.length <= 40);
    for (const action of script.actions) {
      switch (action.kind) {
        case "add":
        case "reset":
          assert.deepEqual(Object.keys(action), ["kind"]);
          break;
        case "fill":
          assert.ok(Number.isSafeInteger(action.rowID) && action.rowID > 0);
          assert.equal(typeof action.value, "string");
          break;
        case "click":
          assert.ok(["save", "remove", "up", "cancel", "reset"].includes(action.action));
          if (action.action !== "reset") assert.ok(Number.isSafeInteger(action.rowID) && action.rowID > 0);
          break;
        case "mode":
          assert.ok(HTTP_MODES.includes(action.mode));
          break;
        case "release":
          assert.ok(Number.isSafeInteger(action.id) && action.id > 0);
          assert.ok(HTTP_RELEASE_MODES.includes(action.mode));
          assert.ok([202, 409].includes(action.expectedStatus));
          break;
        case "swap":
          assert.ok(["dom", "react"].includes(action.host));
          assert.ok(["dom", "react"].includes(action.backend));
          break;
        case "focus":
          assert.ok(Number.isSafeInteger(action.rowID) && action.rowID > 0);
          assert.ok(Number.isSafeInteger(action.selectionStart) && action.selectionStart >= 0);
          assert.ok(Number.isSafeInteger(action.selectionEnd) && action.selectionEnd >= action.selectionStart);
          assert.ok(["none", "forward", "backward"].includes(action.selectionDirection));
          break;
        case "raw-dispatch":
          assert.deepEqual(Object.keys(action.step).sort(), ["Event", "Key", "Path", "Value"]);
          for (const field of ["Path", "Key", "Event", "Value"]) assert.equal(typeof action.step[field], "string");
          break;
        case "detached-input":
          assert.ok(Number.isSafeInteger(action.rowID) && action.rowID > 0);
          assert.equal(typeof action.value, "string");
          break;
        default:
          assert.fail(`unknown action ${String(action.kind)} in ${script.name}`);
      }
    }
  }
});

test("seeded scripts are reproducible, bounded, and avoid allocating more than four live rows", () => {
  assert.deepEqual(makeScripts(), [
    ...fixedScripts,
    ...seededScripts(DEFAULT_SEEDS[0]),
    ...seededScripts(DEFAULT_SEEDS[1]),
  ]);
  assert.deepEqual(makeScripts({ seeds: [7, 8], cases: 3, maxActions: 12 }),
    makeScripts({ seeds: [7, 8], cases: 3, maxActions: 12 }));
  assert.equal(makeScripts({ seeds: [7], cases: 2, maxActions: 12 }).length, fixedScripts.length + 2);
  for (let maxActions = 1; maxActions <= 40; maxActions++) {
    for (const script of seededScripts(9, { cases: 3, maxActions })) {
      assert.ok(script.actions.length <= maxActions,
        `${script.name} exceeds maxActions=${maxActions}`);
      let rowCount = 0;
      for (const action of script.actions) {
        if (action.kind === "add") rowCount = Math.min(4, rowCount + 1);
        else if (action.kind === "click" && action.action === "remove") rowCount = Math.max(0, rowCount - 1);
        else if (action.kind === "reset") rowCount = 0;
        assert.ok(rowCount <= 4, `${script.name} exceeded the four-row cap`);
      }
    }
  }
});

test("seed parsing rejects empty, duplicate, and out-of-range seeds", () => {
  assert.deepEqual(parseSeedList("7, 8"), [7, 8]);
  assert.throws(() => parseSeedList("7,7"), /unique/);
  assert.throws(() => parseSeedList("7,"), /comma-separated/);
  assert.throws(() => parseSeedList("4294967296"), /comma-separated/);
  assert.throws(() => makeScripts({ seeds: [1, 1] }), /unique/);
  assert.throws(() => makeScripts({ seeds: [1], cases: -1 }), /cases/);
  assert.throws(() => makeScripts({ seeds: [1], maxActions: 41 }), /maxActions/);
});

