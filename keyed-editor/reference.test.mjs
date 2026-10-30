import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_COLLECTION_ID,
  MAX_ROWS,
  createCollectionReference,
} from "./model.mjs";

const add = () => ({ Path: "0", Event: "click", Value: "ignored", Key: "add" });
const reset = () => ({ Path: "1", Event: "click", Value: "ignored", Key: "reset" });
const input = (path, key, Value) => ({ Path: path, Event: "input", Value, Key: key });
const click = (path, key) => ({ Path: path, Event: "click", Value: "ignored", Key: key });

function element(tag, key, attrs = [], kids = null, on = null) {
  return { Kind: 1, Tag: tag, Key: key, Attrs: attrs, On: on, Kids: kids, Text: "" };
}

function text(Text) {
  return { Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text };
}

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const literal = (Event, Message, Arg = "") => ({ Event, Message, Arg });

test("independent collection model projects the exact empty Go snapshot shape", () => {
  const reference = createCollectionReference();
  const snapshot = reference.init();
  assert.deepEqual(snapshot, {
    state: { Rows: [], NextID: 0, NextRequestID: 0 },
    tree: element("div", "collection", [attr("class", "collection")], [
      element("button", "add", [attr("class", "add")], [text("Add row")], [literal("click", "add")]),
      element("button", "reset", [attr("class", "reset"), attr("disabled", "", true)], [text("Reset")], [literal("click", "reset")]),
      element("div", "rows", [attr("class", "rows")], null),
    ]),
    bindings: [],
    messages: [],
  });
  assert.deepEqual(reference.effects(), []);
  assert.deepEqual(reference.audit(), []);
});

test("rows add, edit, reorder, remove, and reset without reusing row IDs", () => {
  const reference = createCollectionReference();
  reference.init();
  reference.dispatch(add());
  reference.dispatch(add());
  reference.dispatch(input("2/1/0", "row-2-input", "second"));
  reference.dispatch(click("2/1/7", "row-2-up"));
  assert.deepEqual(reference.snapshot().state.Rows.map(({ ID, Draft }) => ({ ID, Draft })), [
    { ID: 2, Draft: "second" },
    { ID: 1, Draft: "" },
  ]);
  assert.deepEqual(reference.snapshot().bindings, [
    { Path: "2/0/0", Event: "input", Message: "edit/2", Source: "target.value" },
    { Path: "2/1/0", Event: "input", Message: "edit/1", Source: "target.value" },
  ]);
  reference.dispatch(click("2/0/6", "row-2-remove"));
  reference.dispatch(reset());
  reference.dispatch(add());
  assert.equal(reference.snapshot().state.Rows[0].ID, 3);
  assert.equal(reference.snapshot().state.NextID, 3);
});

test("four-row connection cap disables Add atomically without allocating an identity", () => {
  const reference = createCollectionReference();
  reference.init();
  for (let index = 0; index < MAX_ROWS; index++) reference.dispatch(add());
  const before = reference.snapshot();
  assert.equal(before.state.Rows.length, MAX_ROWS);
  assert.deepEqual(before.tree.Kids[0].Attrs, [attr("class", "add"), attr("disabled", "", true)]);
  reference.dispatch(add());
  assert.deepEqual(reference.snapshot(), before);
  assert.deepEqual(reference.effects(), []);
  assert.equal(reference.snapshot().state.NextID, MAX_ROWS);
});

test("save effects are per row; reset and remove cancel before removal; late audit retains row ID", () => {
  const reference = createCollectionReference();
  reference.init();
  reference.dispatch(add());
  reference.dispatch(add());
  reference.dispatch(input("2/0/0", "row-1-input", "one"));
  reference.dispatch(input("2/1/0", "row-2-input", "two"));
  reference.dispatch(click("2/0/5", "row-1-save"));
  reference.dispatch(click("2/1/5", "row-2-save"));
  assert.deepEqual(reference.effects(), [
    { Kind: "start", ID: 1, Value: "one" },
    { Kind: "start", ID: 2, Value: "two" },
  ]);
  reference.dispatch(click("2/0/6", "row-1-remove"));
  assert.deepEqual(reference.effects(), [{ Kind: "cancel", ID: 1, Value: "" }]);
  reference.complete({ ID: 1, Value: "late", Error: "" });
  assert.deepEqual(reference.audit(), [
    { ID: 1, RowID: 1, Value: "late", Error: "", Accepted: false, Reason: "stale" },
  ]);
  reference.dispatch(reset());
  assert.deepEqual(reference.effects(), [{ Kind: "cancel", ID: 2, Value: "" }]);
  reference.complete({ ID: 2, Value: "also late", Error: "" });
  assert.deepEqual(reference.audit()[1], {
    ID: 2, RowID: 2, Value: "also late", Error: "", Accepted: false, Reason: "stale",
  });
});

test("completion updates only its matching row and preserves edited drafts", () => {
  const reference = createCollectionReference();
  reference.init();
  reference.dispatch(add());
  reference.dispatch(add());
  reference.dispatch(input("2/0/0", "row-1-input", "first request"));
  reference.dispatch(click("2/0/5", "row-1-save"));
  reference.dispatch(input("2/0/0", "row-1-input", "new draft"));
  reference.dispatch(input("2/1/0", "row-2-input", "other request"));
  reference.dispatch(click("2/1/5", "row-2-save"));
  reference.complete({ ID: 2, Value: "saved two", Error: "" });
  reference.complete({ ID: 1, Value: "", Error: "service unavailable" });
  assert.deepEqual(reference.snapshot().state.Rows.map(({ Draft, Saved, Saves, Status, PendingID }) => ({
    Draft, Saved, Saves, Status, PendingID,
  })), [
    { Draft: "new draft", Saved: "", Saves: 0, Status: "error: service unavailable", PendingID: 0 },
    { Draft: "other request", Saved: "saved two", Saves: 1, Status: "saved", PendingID: 0 },
  ]);
});

test("wrong key, malformed path, and invalid exact fields reject atomically", () => {
  const reference = createCollectionReference();
  reference.init();
  reference.dispatch(add());
  reference.dispatch(add());
  const before = reference.snapshot();
  assert.throws(() => reference.dispatch(input("2/0/0", "row-2-input", "cross-row")), /key/i);
  assert.throws(() => reference.dispatch(click("2/0/7", "row-2-up")), /key/i,
    "key identity is checked before disabled suppression");
  assert.throws(() => reference.dispatch(input("2/00/0", "row-1-input", "bad path")), /path|index/i);
  assert.throws(() => reference.dispatch({ Path: "0", Event: "click", Value: "", Key: "add", Extra: true }), /exactly/);
  assert.throws(() => reference.dispatch({ Path: "0", Event: "click", Value: "", Key: 8 }), /strings/);
  assert.throws(() => reference.complete({ ID: 1, Value: 8, Error: "" }), /strings/);
  assert.deepEqual(reference.snapshot(), before);
  assert.deepEqual(reference.effects(), []);
  assert.deepEqual(reference.audit(), []);
});

test("disabled targets suppress handler resolution after matching key validation", () => {
  const reference = createCollectionReference();
  reference.init();
  reference.dispatch(add());
  const before = reference.snapshot();
  reference.dispatch({ Path: "2/0/5", Event: "made-up-event", Value: "ignored", Key: "row-1-save" });
  reference.dispatch(click("2/0/7", "row-1-up"));
  assert.deepEqual(reference.snapshot(), before);
});

test("public reference carries the independent HTTP wire codec", () => {
  const reference = createCollectionReference();
  assert.equal(reference.encodeHTTP(12, "wire value"), '{"ID":12,"Value":"wire value"}');
  assert.deepEqual(reference.decodeHTTP(12, 200, '{"ID":12,"Value":"answer","Error":""}'), {
    ID: 12, Value: "answer", Error: "",
  });
  assert.deepEqual(reference.decodeHTTP(12, 503, "ignored"), {
    ID: 12, Value: "", Error: "http status 503",
  });
  assert.deepEqual(reference.decodeHTTP(12, 200, '{"ID":13,"Value":"wrong","Error":""}'), {
    ID: 12, Value: "", Error: "invalid response",
  });
  assert.throws(() => reference.encodeHTTP(0, "bad"), /request ID/);
});

test("stale reply to an unknown request uses RowID zero and the largest safe ID stays exact", () => {
  const reference = createCollectionReference();
  reference.complete({ ID: MAX_COLLECTION_ID, Value: "", Error: "" });
  reference.complete({ ID: 3, Value: "unknown", Error: "" });
  assert.deepEqual(reference.snapshot().messages, [
    { Name: "reply", Arg: "9007199254740991" },
    { Name: "reply", Arg: "3" },
  ]);
  assert.deepEqual(reference.audit(), [
    { ID: MAX_COLLECTION_ID, RowID: 0, Value: "", Error: "", Accepted: false, Reason: "stale" },
    { ID: 3, RowID: 0, Value: "unknown", Error: "", Accepted: false, Reason: "stale" },
  ]);
});


