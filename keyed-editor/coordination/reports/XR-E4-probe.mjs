import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { createCollectionReferenceRuntime } from "../../model.mjs";

const here = new URL(".", import.meta.url);
createRequire(import.meta.url)(fileURLToPath(new URL("../../build/wasm_exec.js", here)));
const go = new Go();
const wasm = await readFile(new URL("../../build/keyed-collection.wasm", here));
const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
void go.run(instance);
const native = globalThis.gobiCollection;
assert.ok(native, "Go WASM bridge must publish gobiCollection");

let reference;
let checkpoints = 0;
let lastEffects = [];
function compare(label) {
  assert.deepEqual(native.snapshot(), reference.snapshot(), `${label}: snapshot`);
  assert.deepEqual(native.audit(), reference.audit(), `${label}: audit`);
  const nativeEffects = native.effects();
  const referenceEffects = reference.effects();
  assert.deepEqual(nativeEffects, referenceEffects, `${label}: effects`);
  lastEffects = nativeEffects;
  checkpoints++;
}

function findPath(node, key, path = "") {
  if (node.Key === key) return path;
  for (let i = 0; i < (node.Kids ?? []).length; i++) {
    const childPath = path === "" ? String(i) : `${path}/${i}`;
    const found = findPath(node.Kids[i], key, childPath);
    if (found !== null) return found;
  }
  return null;
}

function dispatch(key, Event = "click", Value = "") {
  const Path = findPath(reference.snapshot().tree, key);
  assert.notEqual(Path, null, `reference key ${key} is present`);
  const step = { Path, Event, Value, Key: key };
  const expected = reference.dispatch(step);
  const actual = native.dispatch(step);
  assert.deepEqual(actual, expected, `${key}/${Event}: return snapshot`);
  compare(`${key}/${Event}`);
}

function reply(ID, Value = "", Error = "") {
  const expected = reference.complete({ ID, Value, Error });
  const actual = native.complete({ ID, Value, Error });
  assert.deepEqual(actual, expected, `reply ${ID}: return snapshot`);
  compare(`reply ${ID}`);
}

function rejectAtomically(label, step) {
  const beforeSnapshot = reference.snapshot();
  const beforeAudit = reference.audit();
  assert.throws(() => reference.dispatch(step), undefined, `${label}: independent model rejects`);
  const actual = native.dispatch(step);
  assert.equal(typeof actual?.error, "string", `${label}: Go bridge rejects`);
  assert.deepEqual(native.snapshot(), beforeSnapshot, `${label}: Go snapshot unchanged`);
  assert.deepEqual(reference.snapshot(), beforeSnapshot, `${label}: reference snapshot unchanged`);
  assert.deepEqual(native.audit(), beforeAudit, `${label}: Go audit unchanged`);
  assert.deepEqual(reference.audit(), beforeAudit, `${label}: reference audit unchanged`);
  assert.deepEqual(native.effects(), [], `${label}: Go outbox unchanged`);
  assert.deepEqual(reference.effects(), [], `${label}: reference outbox unchanged`);
  checkpoints++;
}

function resetCase(label) {
  reference = createCollectionReferenceRuntime();
  assert.deepEqual(native.init(), reference.init(), `${label}: init`);
  compare(`${label}: init`);
}

resetCase("capacity-order-and-disabled-add");
for (let i = 0; i < 4; i++) dispatch("add");
const capacity = reference.snapshot();
assert.equal(capacity.state.NextID, 4);
assert.equal(capacity.state.Rows.length, 4);
dispatch("add");
assert.deepEqual(reference.snapshot(), capacity, "fifth disabled Add is a no-op");
dispatch("row-4-input", "input", "fourth row");
dispatch("row-4-up");
assert.deepEqual(reference.snapshot().state.Rows.map((row) => row.ID), [1, 2, 4, 3]);
dispatch("row-2-up");
assert.deepEqual(reference.snapshot().state.Rows.map((row) => row.ID), [2, 1, 4, 3]);
assert.deepEqual(reference.snapshot().bindings.map((binding) => binding.Message), ["edit/2", "edit/1", "edit/4", "edit/3"]);
compare("reordered bindings are rebuilt from current order");

resetCase("request-row-history-replacement-and-stale-identity");
dispatch("add"); dispatch("add"); dispatch("add");
dispatch("row-1-input", "input", "captured one");
dispatch("row-2-input", "input", "captured two");
dispatch("row-3-input", "input", "captured three");
dispatch("row-1-save"); // request 1 -> row 1
dispatch("row-2-save"); // request 2 -> row 2
dispatch("row-1-input", "input", "new draft one");
dispatch("row-1-save"); // cancel 1, request 3 -> row 1
dispatch("row-2-remove"); // cancel 2; request->row history survives removal
dispatch("add"); // row 4 reuses the removed row's position
rejectAtomically("old path plus removed key", {
  Path: "2/1/0", Event: "input", Value: "must not edit row 4", Key: "row-2-input",
});
reply(2, "late removed row", "");
reply(1, "canceled first save", "");
reply(3, "accepted replacement", "");
assert.deepEqual(reference.audit().map(({ ID, RowID, Accepted, Reason }) => ({ ID, RowID, Accepted, Reason })), [
  { ID: 2, RowID: 2, Accepted: false, Reason: "stale" },
  { ID: 1, RowID: 1, Accepted: false, Reason: "stale" },
  { ID: 3, RowID: 1, Accepted: true, Reason: "saved" },
]);
assert.equal(reference.snapshot().state.Rows.find((row) => row.ID === 1).Draft, "new draft one");
assert.equal(reference.snapshot().state.Rows.find((row) => row.ID === 1).Saved, "accepted replacement");
compare("late and accepted replies retain original row ownership");

resetCase("reset-cancel-order-monotonic-ids-error-retry");
dispatch("add"); dispatch("add"); dispatch("add");
dispatch("row-1-input", "input", "first");
dispatch("row-2-input", "input", "second");
dispatch("row-3-input", "input", "third");
dispatch("row-1-save"); dispatch("row-2-save"); dispatch("row-3-save");
dispatch("reset");
assert.deepEqual(native.effects(), [
]);
assert.deepEqual(lastEffects, [
  { Kind: "cancel", ID: 1, Value: "" },
  { Kind: "cancel", ID: 2, Value: "" },
  { Kind: "cancel", ID: 3, Value: "" },
]);
compare("reset cancels requests in row order");
dispatch("add");
dispatch("row-4-input", "input", "retry draft");
dispatch("row-4-save");
reply(1, "late after reset");
reply(4, "", "service unavailable");
dispatch("row-4-save");
reply(5, "retry accepted");
assert.deepEqual(reference.snapshot().state, {
  Rows: [{ ID: 4, Draft: "retry draft", Saved: "retry accepted", Saves: 1, PendingID: 0, Status: "saved" }],
  NextID: 4,
  NextRequestID: 5,
});
compare("row and request IDs remain monotonic after reset and retry");
reply(Number.MAX_SAFE_INTEGER, "unknown max safe request");

resetCase("identity-validation-and-atomic-negative-probes");
dispatch("add"); dispatch("add");
rejectAtomically("mismatched key", {
  Path: "2/0/0", Event: "input", Value: "cross-row", Key: "row-2-input",
});
rejectAtomically("identity before disabled suppression", {
  Path: "2/0/7", Event: "click", Value: "", Key: "row-2-up",
});
rejectAtomically("noncanonical path", {
  Path: "2/00/0", Event: "input", Value: "bad path", Key: "row-1-input",
});
rejectAtomically("extra step field", {
  Path: "0", Event: "click", Value: "", Key: "add", Extra: true,
});
rejectAtomically("wrong primitive field type", {
  Path: "0", Event: "click", Value: "", Key: 7,
});

console.log(`XR-E4 probe passed: ${checkpoints} Go-WASM/reference checkpoints, four reset-isolated cases, five atomic negative probes`);
process.exit(0);
