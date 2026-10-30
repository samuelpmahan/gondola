import test from "node:test";
import assert from "node:assert/strict";
import { createMultiRootReference } from "./reference.mjs";

test("independent reference sessions may reuse row and request IDs without sharing state or effects", () => {
  const reference = createMultiRootReference();
  const a = reference.create();
  const b = reference.create();
  const c = reference.create();
  for (const id of [a, b, c]) {
    reference.dispatch(id, { Path: "0", Event: "click", Value: "", Key: "add" });
    reference.dispatch(id, { Path: "2/0/0", Event: "input", Value: "same", Key: "row-1-input" });
  }
  for (const id of [a, b, c]) {
    reference.dispatch(id, { Path: "2/0/5", Event: "click", Value: "", Key: "row-1-save" });
  }
  assert.deepEqual([a, b, c], [1, 2, 3]);
  for (const id of [a, b, c]) {
    assert.deepEqual(reference.snapshot(id).state.Rows.map(({ ID }) => ID), [1]);
    assert.equal(reference.snapshot(id).state.NextRequestID, 1);
    assert.deepEqual(reference.effects(id), [{ Kind: "start", ID: 1, Value: "same" }]);
  }
  reference.complete(b, { ID: 1, Value: "beta saved", Error: "" });
  assert.equal(reference.snapshot(b).state.Rows[0].Saved, "beta saved");
  assert.equal(reference.snapshot(a).state.Rows[0].Saved, "");
  assert.equal(reference.snapshot(c).state.Rows[0].Saved, "");
});

test("disposing and reusing a reference root rejects the old session and gives the new one fresh state", () => {
  const reference = createMultiRootReference();
  const first = reference.create();
  reference.dispatch(first, { Path: "0", Event: "click", Value: "", Key: "add" });
  reference.dispatch(first, { Path: "2/0/0", Event: "input", Value: "held", Key: "row-1-input" });
  reference.dispatch(first, { Path: "2/0/5", Event: "click", Value: "", Key: "row-1-save" });
  assert.deepEqual(reference.dispose(first), [{ Kind: "cancel", ID: 1, Value: "" }]);
  assert.throws(() => reference.complete(first, { ID: 1, Value: "late", Error: "" }), /unknown or disposed/);
  const second = reference.create();
  assert.equal(second, 2, "session IDs remain monotonic after root reuse");
  assert.deepEqual(reference.snapshot(second).state, { Rows: [], NextID: 0, NextRequestID: 0 });
});
