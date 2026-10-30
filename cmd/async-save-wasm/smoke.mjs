#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";

const [wasmPath, wasmExecPath] = process.argv.slice(2);
if (!wasmPath || !wasmExecPath) {
  throw new Error("Usage: node cmd/async-save-wasm/smoke.mjs PATH_TO_WASM PATH_TO_wasm_exec.js");
}

globalThis.crypto ??= webcrypto;
createRequire(import.meta.url)(wasmExecPath);
const go = new Go();
const wasm = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
const run = go.run(instance);
run.catch((error) => {
  globalThis.__asyncSaveGoError = String(error?.stack || error);
});

for (let attempt = 0; attempt < 500 && !globalThis.gobiAsyncSave; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

const api = globalThis.gobiAsyncSave;
const assertError = (result) => assert.equal(typeof result?.error, "string");
assert.equal(typeof api?.init, "function");
assert.equal(typeof api?.dispatch, "function");
assert.equal(typeof api?.complete, "function");
assert.equal(typeof api?.effects, "function");
assert.equal(typeof api?.audit, "function");

const initial = api.init();
assert.equal(initial.state.Status, "idle");
assert.deepEqual(Object.keys(initial), ["state", "tree", "bindings", "messages"]);
assert.deepEqual(Object.keys(initial.state), ["Draft", "Saved", "Saves", "NextID", "PendingID", "Status"]);

for (const step of [
  { Path: "0", Event: "input", Value: null },
  { Path: "0", Event: "input" },
  { Path: null, Event: "input", Value: "bad" },
  { Path: "0", Event: 4, Value: "bad" },
  { Path: "0", Event: "input", Value: 4 },
  { Path: "0", Event: "input", Value: new String("bad") },
  { Path: "0", Event: "input", Value: "bad", Extra: true },
  null,
  [],
]) {
  assertError(api.dispatch(step));
}
const unchangedAfterBadSteps = api.dispatch({ Path: "3", Event: "click", Value: "" });
assert.equal(unchangedAfterBadSteps.state.Draft, "");
assert.deepEqual(unchangedAfterBadSteps.messages, []);
assert.deepEqual(api.effects(), []);

assert.equal(api.dispatch({ Path: "0", Event: "input", Value: "wasm value" }).state.Draft, "wasm value");
const pending = api.dispatch({ Path: "3", Event: "click", Value: "" });
assert.equal(pending.state.PendingID, 1);
assert.deepEqual(api.effects(), [{ Kind: "start", ID: 1, Value: "wasm value" }]);
assert.deepEqual(api.effects(), []);

for (const reply of [
  { ID: 1, Value: null, Error: null },
  { ID: 1, Value: "", Error: null },
  { ID: 1, Value: "" },
  { ID: 1, Error: "" },
  { ID: null, Value: "", Error: "" },
  { ID: 0, Value: "", Error: "" },
  { ID: -1, Value: "", Error: "" },
  { ID: "1", Value: "", Error: "" },
  { ID: 1.5, Value: "", Error: "" },
  { ID: true, Value: "", Error: "" },
  { ID: new Number(1), Value: "", Error: "" },
  { ID: 1, Value: new String("bad"), Error: "" },
  { ID: Number.MAX_SAFE_INTEGER + 1, Value: "", Error: "" },
  { ID: 1, Value: "", Error: 2 },
  { ID: 1, Value: "", Error: "", Extra: true },
  null,
  [],
]) {
  assertError(api.complete(reply));
}
for (const step of [
  { Path: "0", Event: "input", Value: null },
  { Path: "0", Event: "input" },
]) {
  assertError(api.dispatch(step));
}
assert.deepEqual(api.effects(), [], "malformed inputs must not queue commands");

const valid = api.complete({ ID: 1, Value: "delivered", Error: "" });
assert.equal(valid.state.Saved, "delivered");
assert.equal(valid.state.Saves, 1);
assert.equal(valid.state.PendingID, 0, "malformed replies must leave the pending request active until valid delivery");
assert.deepEqual(valid.messages, [
  { Name: "edit", Arg: "wasm value" },
  { Name: "save", Arg: "" },
  { Name: "reply", Arg: "1" },
], "malformed inputs must not append messages");
const duplicate = api.complete({ ID: 1, Value: "stale", Error: "" });
assert.equal(duplicate.state.Saved, "delivered");
assert.equal(api.audit().length, 2);
assert.deepEqual(api.audit().map(({ Accepted, Reason }) => [Accepted, Reason]), [[true, "saved"], [false, "stale"]]);

const cycleStep = { Path: "0", Event: "input", Value: "bad" };
cycleStep.self = cycleStep;
assertError(api.dispatch(cycleStep));
const cycleReply = { ID: 1, Value: "bad", Error: "" };
cycleReply.self = cycleReply;
assertError(api.complete(cycleReply));
assertError(api.dispatch({ Path: "0", Event: "input", Value: "bad", toJSON() { throw new Error("blocked serializer"); } }));
assertError(api.complete({ ID: 1, Value: "bad", Error: "", toJSON() { throw new Error("blocked serializer"); } }));
assertError(api.dispatch({ Path: "0", Event: "input", Value: 1n }));
assertError(api.complete({ ID: Number.MAX_SAFE_INTEGER + 1, Value: "unsafe", Error: "" }));
assert.equal(api.dispatch({ Path: "0", Event: "input", Value: "still alive" }).state.Draft, "still alive");
assert.equal(globalThis.__asyncSaveGoError, undefined);

console.log("WASM API smoke passed: exact Step/Reply schemas, atomic malformed-input rejection, valid reply recovery, outbox drain, audit, safe IDs, and unserializable-input recovery.");
process.exit(0);
