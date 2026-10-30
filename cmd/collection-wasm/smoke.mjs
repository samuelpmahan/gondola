import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const [wasmPath, wasmExecPath] = process.argv.slice(2);
if (!wasmPath || !wasmExecPath) {
  throw new Error("usage: node smoke.mjs <collection.wasm> <wasm_exec.js>");
}

createRequire(import.meta.url)(resolve(wasmExecPath));
const wasm = await readFile(resolve(wasmPath));
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
const execution = go.run(instance);

let api;
for (let attempt = 0; attempt < 100; attempt += 1) {
  api = globalThis.gobiCollection;
  if (api) break;
  await new Promise((resolveTurn) => setImmediate(resolveTurn));
}
assert.ok(api, "WASM must publish gobiCollection before entering its event loop");
assert.deepEqual(Object.keys(api).sort(), [
  "audit",
  "complete",
  "decodeHTTP",
  "dispatch",
  "effects",
  "encodeHTTP",
  "init",
  "snapshot",
]);

const keys = (object) => Object.keys(object).sort();
const isError = (value) => value && typeof value === "object" && typeof value.error === "string";
const add = () => api.dispatch({ Path: "0", Event: "click", Value: "", Key: "add" });
const rowAction = (rowID, action, index, event = action === "input" ? "input" : "click") => api.dispatch({
  Path: `2/${index}/${action === "input" ? 0 : ({ save: 5, remove: 6, up: 7, cancel: 8 })[action]}`,
  Event: event,
  Value: action === "input" ? "draft" : "",
  Key: `row-${rowID}-${action === "input" ? "input" : action}`,
});

let snapshot = api.init();
assert.deepEqual(keys(snapshot), ["bindings", "messages", "state", "tree"]);
assert.deepEqual(snapshot.state, { Rows: [], NextID: 0, NextRequestID: 0 });
assert.deepEqual(snapshot.bindings, []);
assert.deepEqual(snapshot.messages, []);
assert.equal(snapshot.tree.Key, "collection");
assert.deepEqual(keys(api.snapshot()), ["bindings", "messages", "state", "tree"]);

for (const invalid of [
  () => api.init("extra"),
  () => api.dispatch({ Path: "0", Event: "click", Value: "", Key: "add" }, "extra"),
  () => api.complete({ ID: 1, Value: "x", Error: "" }, "extra"),
  () => api.effects("extra"),
  () => api.audit("extra"),
  () => api.encodeHTTP(1, "x", "extra"),
  () => api.decodeHTTP(1, 200, "{}", "extra"),
]) {
  assert.ok(isError(invalid()), "wrong argument count must return a bridge error");
}
assert.deepEqual(api.snapshot(), snapshot, "invalid arity must not mutate the current session");

snapshot = add();
assert.equal(snapshot.state.Rows[0].ID, 1);
assert.equal(snapshot.state.Rows[0].Status, "idle");
assert.equal(snapshot.tree.Kids[2].Kids[0].Key, "row-1");

for (const invalidStep of [
  { Path: "2/0/0", Event: "input", Value: "x" },
  { Path: "2/0/0", Event: "input", Value: "x", Key: "row-1-input", extra: true },
  { Path: "2/0/0", Event: new String("input"), Value: "x", Key: "row-1-input" },
  { Path: "2/0/0", Event: "input", Value: "x", Key: "other-key" },
]) {
  const before = api.snapshot();
  assert.ok(isError(api.dispatch(invalidStep)), "malformed or stale-key dispatch must return an error");
  assert.deepEqual(api.snapshot(), before, "invalid dispatch must preserve the complete snapshot");
}
const throwingGetter = { Path: "2/0/0", Event: "input", Value: "x" };
Object.defineProperty(throwingGetter, "Key", { get() { throw new Error("hostile getter"); } });
const beforeGetter = api.snapshot();
assert.ok(isError(api.dispatch(throwingGetter)), "throwing getter must be contained by the bridge");
assert.deepEqual(api.snapshot(), beforeGetter);
const throwingProxy = new Proxy({}, { ownKeys() { throw new Error("hostile proxy"); } });
assert.ok(isError(api.dispatch(throwingProxy)), "proxy serialization failure must be contained");
assert.deepEqual(api.snapshot(), beforeGetter);

snapshot = api.dispatch({ Path: "2/0/0", Event: "input", Value: "first", Key: "row-1-input" });
assert.equal(snapshot.state.Rows[0].Draft, "first");
snapshot = api.dispatch({ Path: "2/0/5", Event: "click", Value: "", Key: "row-1-save" });
assert.equal(snapshot.state.Rows[0].PendingID, 1);
assert.deepEqual(api.effects(), [{ Kind: "start", ID: 1, Value: "first" }]);
assert.deepEqual(api.effects(), []);

snapshot = add();
assert.equal(snapshot.state.Rows[1].ID, 2);
snapshot = rowAction(2, "input", 1);
assert.equal(snapshot.state.Rows[1].Draft, "draft");
snapshot = rowAction(2, "save", 1);
assert.equal(snapshot.state.Rows[1].PendingID, 2);
assert.deepEqual(api.effects(), [{ Kind: "start", ID: 2, Value: "draft" }]);

snapshot = api.dispatch({ Path: "2/1/7", Event: "click", Value: "", Key: "row-2-up" });
assert.deepEqual(snapshot.state.Rows.map(({ ID }) => ID), [2, 1]);
const beforeStaleMovedRow = api.snapshot();
assert.ok(isError(api.dispatch({ Path: "2/0/0", Event: "input", Value: "bad", Key: "row-1-input" })));
assert.deepEqual(api.snapshot(), beforeStaleMovedRow, "old path/key pair must not edit the row now at that path");

snapshot = api.complete({ ID: 2, Value: "saved second", Error: "" });
assert.equal(snapshot.state.Rows[0].Saved, "saved second");
assert.equal(snapshot.state.Rows[0].Saves, 1);
assert.deepEqual(api.audit(), [{ ID: 2, RowID: 2, Value: "saved second", Error: "", Accepted: true, Reason: "saved" }]);

for (const invalidReply of [
  { ID: 1, Value: "x" },
  { ID: 1, Value: "x", Error: "", extra: true },
  { ID: 1.5, Value: "x", Error: "" },
  { ID: 2 ** 53, Value: "x", Error: "" },
  { ID: 1, Value: new String("x"), Error: "" },
]) {
  const before = api.snapshot();
  assert.ok(isError(api.complete(invalidReply)));
  assert.deepEqual(api.snapshot(), before, "invalid reply must preserve the complete snapshot");
}
const throwingReply = { ID: 1, Value: "x" };
Object.defineProperty(throwingReply, "Error", { get() { throw new Error("hostile getter"); } });
const beforeReplyGetter = api.snapshot();
assert.ok(isError(api.complete(throwingReply)));
assert.deepEqual(api.snapshot(), beforeReplyGetter);

const wireValue = `line "one"\\two\n雪`;
const encoded = api.encodeHTTP(Number.MAX_SAFE_INTEGER, wireValue);
assert.equal(encoded, JSON.stringify({ ID: Number.MAX_SAFE_INTEGER, Value: wireValue }));
assert.ok(isError(api.encodeHTTP(0, "x")));
assert.ok(isError(api.encodeHTTP(1.5, "x")));
assert.ok(isError(api.encodeHTTP(2 ** 53, "x")));
assert.ok(isError(api.encodeHTTP(1, new String("x"))));
const decoded = api.decodeHTTP(7, 200, ` {"ID":7,"Value":"saved","Error":""} \n`);
assert.deepEqual(decoded, { ID: 7, Value: "saved", Error: "" });
assert.deepEqual(api.decodeHTTP(7, 200, `{"ID":8,"Value":"wrong","Error":""}`), {
  ID: 7, Value: "", Error: "invalid response",
});
assert.deepEqual(api.decodeHTTP(7, 503, "not JSON"), { ID: 7, Value: "", Error: "http status 503" });
assert.ok(isError(api.decodeHTTP(7, 600, "{}")));
assert.ok(isError(api.decodeHTTP(7, 200, {})));

add();
add();
snapshot = api.snapshot();
assert.equal(snapshot.state.Rows.length, 4);
assert.equal(snapshot.tree.Kids[0].Attrs.some(({ Name, Flag }) => Name === "disabled" && Flag), true);
const beforeLimitedAdd = api.snapshot();
snapshot = add();
assert.deepEqual(snapshot, beforeLimitedAdd, "the four-row limit must suppress add without mutation");

// The Go program intentionally blocks in select{}; exit after all bridge checks.
void execution;
process.stdout.write("collection-wasm bridge smoke passed\n");
process.exit(0);
