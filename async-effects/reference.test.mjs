import assert from "node:assert/strict";
import test from "node:test";

import {
  createAsyncReference,
  initialAsyncState,
  MAX_REQUEST_ID,
  projectAsyncSnapshot,
} from "./build/reference.bundle.mjs";
import {
  DEFAULT_SEEDS,
  defaultSeededScripts,
  fixedScripts,
  seededScripts,
} from "./scripts.mjs";

const input = (value) => ({ Path: "0", Event: "input", Value: value });
const button = (path) => ({ Path: path, Event: "click", Value: "literal arg ignored" });
const complete = (oracle, ID, Value = "", Error = "") => oracle.complete({ ID, Value, Error });

test("initial oracle snapshot and extended projection match the frozen contract", () => {
  const oracle = createAsyncReference();
  const snapshot = oracle.init();
  assert.deepEqual(snapshot.state, initialAsyncState());
  assert.equal(snapshot.tree.Kids.length, 8);
  assert.equal(snapshot.tree.Kids[5].Kids[0].Text, "Cancel");
  assert.deepEqual(snapshot.bindings, [
    { Path: "0", Event: "input", Message: "edit", Source: "target.value" },
  ]);
  assert.deepEqual(snapshot.messages, []);
  assert.deepEqual(oracle.effects(), []);
  assert.deepEqual(oracle.audit(), []);
  assert.equal(snapshot.tree.Kids[3].Attrs.some((attr) => attr.Name === "disabled"), true);
  assert.equal(snapshot.tree.Kids[4].Attrs.some((attr) => attr.Name === "disabled"), true);
  assert.equal(snapshot.tree.Kids[5].Attrs.some((attr) => attr.Name === "disabled"), true);

  const afterResetWithID = projectAsyncSnapshot(
    { ...initialAsyncState(), NextID: 9 },
    [],
  );
  assert.equal(afterResetWithID.state.NextID, 9);
  assert.equal(afterResetWithID.tree.Kids[4].Attrs.some((attr) => attr.Name === "disabled"), true,
    "NextID alone must not enable Reset");
});

test("replacement saves capture exact drafts and audit out-of-order full reply history", () => {
  const oracle = createAsyncReference();
  oracle.init();
  oracle.dispatch(input("  first\n"));
  oracle.dispatch(button("3"));
  assert.deepEqual(oracle.effects(), [{ Kind: "start", ID: 1, Value: "  first\n" }]);

  oracle.dispatch(input("second"));
  oracle.dispatch(button("3"));
  assert.deepEqual(oracle.effects(), [
    { Kind: "cancel", ID: 1, Value: "" },
    { Kind: "start", ID: 2, Value: "second" },
  ]);
  assert.equal(oracle.snapshot().state.PendingID, 2);

  complete(oracle, 2, "accepted server text");
  complete(oracle, 1, "", "late failure");
  const snapshot = oracle.snapshot();
  assert.deepEqual(snapshot.state, {
    Draft: "second", Saved: "accepted server text", Saves: 1,
    NextID: 2, PendingID: 0, Status: "saved",
  });
  assert.deepEqual(snapshot.messages, [
    { Name: "edit", Arg: "  first\n" },
    { Name: "save", Arg: "" },
    { Name: "edit", Arg: "second" },
    { Name: "save", Arg: "" },
    { Name: "reply", Arg: "2" },
    { Name: "reply", Arg: "1" },
  ]);
  assert.deepEqual(oracle.audit(), [
    { ID: 2, Value: "accepted server text", Error: "", Accepted: true, Reason: "saved" },
    { ID: 1, Value: "", Error: "late failure", Accepted: false, Reason: "stale" },
  ]);
  assert.deepEqual(oracle.effects(), []);
});

test("cancel and reset make late replies stale while request IDs stay monotonic", () => {
  const oracle = createAsyncReference();
  oracle.dispatch(input("cancel me"));
  oracle.dispatch(button("3"));
  oracle.dispatch(button("5"));
  assert.deepEqual(oracle.effects(), [
    { Kind: "start", ID: 1, Value: "cancel me" },
    { Kind: "cancel", ID: 1, Value: "" },
  ]);
  assert.equal(oracle.snapshot().state.Status, "cancelled");
  assert.equal(oracle.snapshot().tree.Kids[4].Attrs.some((attr) => attr.Name === "disabled"), false);

  oracle.dispatch(button("4"));
  assert.deepEqual(oracle.snapshot().state, {
    Draft: "", Saved: "", Saves: 0, NextID: 1, PendingID: 0, Status: "idle",
  });
  complete(oracle, 1, "too late");
  assert.equal(oracle.snapshot().state.Status, "idle");
  oracle.dispatch(input("fresh request"));
  oracle.dispatch(button("3"));
  assert.equal(oracle.snapshot().state.PendingID, 2);
  assert.deepEqual(oracle.effects(), [{ Kind: "start", ID: 2, Value: "fresh request" }]);
});

test("duplicate completion is stale and active errors preserve prior saved data for retry", () => {
  const oracle = createAsyncReference();
  oracle.dispatch(input("one"));
  oracle.dispatch(button("3"));
  complete(oracle, 1, "saved before error");
  oracle.dispatch(input("two"));
  oracle.dispatch(button("3"));
  complete(oracle, 2, "", "temporary");
  const afterError = oracle.snapshot();
  assert.deepEqual(afterError.state, {
    Draft: "two", Saved: "saved before error", Saves: 1,
    NextID: 2, PendingID: 0, Status: "error: temporary",
  });
  assert.equal(afterError.tree.Kids[4].Attrs.some((attr) => attr.Name === "disabled"), false);
  complete(oracle, 2, "duplicate success");
  assert.deepEqual(oracle.snapshot().state, afterError.state);
  assert.deepEqual(oracle.audit().slice(-2), [
    { ID: 2, Value: "", Error: "temporary", Accepted: true, Reason: "error" },
    { ID: 2, Value: "duplicate success", Error: "", Accepted: false, Reason: "stale" },
  ]);
  oracle.dispatch(button("3"));
  assert.equal(oracle.snapshot().state.PendingID, 3);
  complete(oracle, 3, "retry result");
  assert.equal(oracle.snapshot().state.Saved, "retry result");
  assert.equal(oracle.snapshot().state.Saves, 2);
});

test("disabled actions are inert and invalid dispatch or reply input is atomic", () => {
  const oracle = createAsyncReference();
  const initial = oracle.snapshot();
  oracle.dispatch(button("3"));
  oracle.dispatch(button("4"));
  oracle.dispatch(button("5"));
  oracle.dispatch({ Path: "5", Event: "input", Value: "ignored because Cancel is disabled" });
  assert.deepEqual(oracle.snapshot(), initial);

  assert.throws(() => oracle.dispatch({ Path: "90", Event: "click", Value: "" }), /path|handler/i);
  assert.throws(() => oracle.dispatch({ Path: "0", Event: "input", Value: 5 }), /Value/);
  assert.throws(() => oracle.dispatch({ Path: "0", Event: "input" }), /exactly Event, Path, Value/);
  assert.throws(() => oracle.dispatch({ Event: "input", Value: "x" }), /exactly Event, Path, Value/);
  assert.throws(() => oracle.dispatch({ Path: "0", Value: "x" }), /exactly Event, Path, Value/);
  assert.throws(() => oracle.dispatch({ Path: null, Event: "input", Value: "x" }), /must be strings/);
  assert.throws(() => oracle.dispatch({ Path: "0", Event: null, Value: "x" }), /must be strings/);
  assert.throws(() => oracle.dispatch({ Path: "0", Event: "input", Value: null }), /must be strings/);
  assert.throws(() => oracle.dispatch({ Path: "0", Event: "input", Value: "x", Extra: true }), /exactly Event, Path, Value/);
  assert.throws(() => oracle.complete({ ID: 0, Value: "", Error: "" }), /ID/);
  assert.throws(() => oracle.complete({ ID: MAX_REQUEST_ID + 1, Value: "", Error: "" }), /ID/);
  assert.throws(() => oracle.complete({ ID: 1, Value: 9, Error: "" }), /Value and Error/);
  assert.throws(() => oracle.complete({ ID: 1, Value: null, Error: "" }), /Value and Error/);
  assert.throws(() => oracle.complete({ ID: 1, Value: "", Error: null }), /Value and Error/);
  assert.throws(() => oracle.complete({ ID: 1, Value: "", Error: 9 }), /Value and Error/);
  assert.throws(() => oracle.complete({ ID: 1, Value: "" }), /exactly Error, ID, Value/);
  assert.throws(() => oracle.complete({ ID: 1, Error: "" }), /exactly Error, ID, Value/);
  assert.throws(() => oracle.complete({ ID: 1, Value: "", Error: "", Extra: true }), /exactly Error, ID, Value/);
  assert.deepEqual(oracle.snapshot(), initial);
  assert.deepEqual(oracle.audit(), []);
  assert.deepEqual(oracle.effects(), []);
});

test("the largest safe reply ID is valid and retained as an exact decimal message", () => {
  const oracle = createAsyncReference();
  complete(oracle, MAX_REQUEST_ID);
  assert.deepEqual(oracle.snapshot().messages, [
    { Name: "reply", Arg: "9007199254740991" },
  ]);
  assert.deepEqual(oracle.audit(), [
    { ID: MAX_REQUEST_ID, Value: "", Error: "", Accepted: false, Reason: "stale" },
  ]);
});

test("snapshots, effects, and audit receipts are copied", () => {
  const oracle = createAsyncReference();
  oracle.dispatch(input("copy me"));
  oracle.dispatch(button("3"));
  const first = oracle.snapshot();
  first.state.Draft = "corrupt";
  first.tree.Kids[0].Attrs[1].Value = "corrupt";
  first.messages[0].Arg = "corrupt";
  const effects = oracle.effects();
  effects[0].Value = "corrupt";
  complete(oracle, 1, "answer");
  const receipts = oracle.audit();
  receipts[0].Value = "corrupt";
  assert.equal(oracle.snapshot().state.Draft, "copy me");
  assert.equal(oracle.snapshot().messages[0].Arg, "copy me");
  assert.deepEqual(oracle.audit(), [
    { ID: 1, Value: "answer", Error: "", Accepted: true, Reason: "saved" },
  ]);
});

test("fixed and seeded schedules are deterministic, bounded, and only reply to allocated IDs", () => {
  assert.deepEqual(DEFAULT_SEEDS, [20261030, 20261031]);
  assert.equal(fixedScripts.length >= 7, true);
  assert.deepEqual(defaultSeededScripts(), [
    ...seededScripts(DEFAULT_SEEDS[0]),
    ...seededScripts(DEFAULT_SEEDS[1]),
  ]);

  const scripts = [...fixedScripts, ...defaultSeededScripts()];
  for (const script of scripts) {
    assert.ok(script.actions.length <= 40, `${script.name} exceeds 40 actions`);
    const oracle = createAsyncReference();
    const allocated = new Set();
    for (const action of script.actions) {
      if (action.kind === "fill") oracle.dispatch(input(action.value));
      else if (action.kind === "type") {
        const draft = oracle.snapshot().state.Draft + action.value;
        oracle.dispatch(input(draft));
      } else if (action.kind === "click") oracle.dispatch(button(action.Path));
      else if (action.kind === "reply") {
        assert.ok(allocated.has(action.id) || action.id <= oracle.snapshot().state.NextID,
          `${script.name} replies to unallocated request ${action.id}`);
        complete(oracle, action.id, action.value, action.error);
      }

      const generatedEffects = oracle.effects();
      for (const effect of generatedEffects) {
        if (effect.Kind === "start") allocated.add(effect.ID);
      }
    }
  }
});
