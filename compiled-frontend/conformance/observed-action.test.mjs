import test from "node:test";
import assert from "node:assert/strict";

import { associateObservedAction } from "./observed-action.mjs";

test("keeps script intent separate from an exact lowerCamel renderer observation", () => {
  const intent = { path: "2", event: "click", value: "must not replace literal" };
  const observed = { path: "2", event: "click", value: "" };
  const copy = structuredClone(observed);

  assert.deepEqual(associateObservedAction(observed, intent), intent);
  assert.deepEqual(observed, copy);
  assert.notEqual(observed.value, intent.value);
});

test("rejects legacy casing, extra fields, and path/event drift", () => {
  const intent = { path: "2", event: "click", value: "intent" };
  assert.throws(() => associateObservedAction({ Path: "2", Event: "click", Value: "" }, intent), /exactly path, event, and value/);
  assert.throws(() => associateObservedAction({ path: "2", event: "click", value: "", extra: true }, intent), /exactly path, event, and value/);
  assert.throws(() => associateObservedAction({ path: "1", event: "click", value: "" }, intent), /value differs/);
  assert.throws(() => associateObservedAction({ path: "2", event: "input", value: "" }, intent), /value differs/);
});
