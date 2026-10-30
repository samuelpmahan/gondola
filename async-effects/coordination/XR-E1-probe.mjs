#!/usr/bin/env node
// Independent malformed-input/recovery probe for the real async-save WASM API.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { webcrypto } from "node:crypto";

const [wasmArg, wasmExecArg] = process.argv.slice(2);
if (!wasmArg || !wasmExecArg) {
  throw new Error("Usage: node XR-E1-probe.mjs PATH_TO_async-save.wasm PATH_TO_wasm_exec.js");
}

const wasmPath = resolve(wasmArg);
const wasmExecPath = resolve(wasmExecArg);
globalThis.crypto ??= webcrypto;
createRequire(import.meta.url)(wasmExecPath);
const go = new Go();
const bytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
const run = go.run(instance);
run.catch((error) => {
  globalThis.__xrE1GoError = String(error?.stack ?? error);
});

for (let attempt = 0; attempt < 500 && !globalThis.gobiAsyncSave; attempt++) {
  await new Promise((resolveWait) => setTimeout(resolveWait, 10));
}
const api = globalThis.gobiAsyncSave;
assert.equal(typeof api?.init, "function", "WASM API did not initialize");
assert.equal(typeof api.dispatch, "function");
assert.equal(typeof api.complete, "function");
assert.equal(typeof api.effects, "function");
assert.equal(typeof api.audit, "function");

function requireError(result, label) {
  assert.equal(typeof result?.error, "string", `${label} must return an error object`);
  assert.equal(Object.hasOwn(result, "state"), false, `${label} must not return a partial snapshot`);
}

api.init();
const edit = api.dispatch({ Path: "0", Event: "input", Value: "recovery-draft" });
assert.equal(edit.state.Draft, "recovery-draft");
const start = api.dispatch({ Path: "3", Event: "click", Value: "" });
assert.equal(start.state.PendingID, 1);
assert.deepEqual(api.effects(), [{ Kind: "start", ID: 1, Value: "recovery-draft" }]);
assert.deepEqual(api.effects(), []);
assert.deepEqual(api.audit(), []);

const cycle = {};
cycle.self = cycle;
const throwingToJSON = { toJSON() { throw new Error("probe stringify failure"); } };
const malformedDispatches = [
  ["null dispatch", null],
  ["array dispatch", []],
  ["missing dispatch Path", { Event: "input", Value: "bad" }],
  ["missing dispatch Event", { Path: "0", Value: "bad" }],
  ["missing dispatch Value", { Path: "0", Event: "input" }],
  ["null dispatch Value", { Path: "0", Event: "input", Value: null }],
  ["numeric dispatch Value", { Path: "0", Event: "input", Value: 42 }],
  ["boolean dispatch Value", { Path: "0", Event: "input", Value: false }],
  ["boxed-string dispatch Path", { Path: new String("0"), Event: "input", Value: "bad" }],
  ["boxed-string dispatch Value", { Path: "0", Event: "input", Value: new String("bad") }],
  ["numeric dispatch Path", { Path: 0, Event: "input", Value: "bad" }],
  ["null dispatch Event", { Path: "0", Event: null, Value: "bad" }],
  ["extra dispatch field", { Path: "0", Event: "input", Value: "bad", Extra: true }],
  ["cyclic dispatch", cycle],
  ["throwing toJSON dispatch", throwingToJSON],
];
for (const [label, value] of malformedDispatches) {
  requireError(api.dispatch(value), label);
  assert.deepEqual(api.effects(), [], `${label} changed the effect outbox`);
  assert.deepEqual(api.audit(), [], `${label} changed completion audit`);
}

const malformedReplies = [
  ["null reply", null],
  ["array reply", []],
  ["missing reply ID", { Value: "bad", Error: "" }],
  ["missing reply Value", { ID: 1, Error: "" }],
  ["missing reply Error", { ID: 1, Value: "bad" }],
  ["null reply Value", { ID: 1, Value: null, Error: "" }],
  ["null reply Error", { ID: 1, Value: "bad", Error: null }],
  ["numeric reply Value", { ID: 1, Value: 42, Error: "" }],
  ["boolean reply Error", { ID: 1, Value: "bad", Error: false }],
  ["string reply ID", { ID: "1", Value: "bad", Error: "" }],
  ["fractional reply ID", { ID: 1.5, Value: "bad", Error: "" }],
  ["boolean reply ID", { ID: true, Value: "bad", Error: "" }],
  ["boxed-number reply ID", { ID: new Number(1), Value: "bad", Error: "" }],
  ["boxed-string reply Value", { ID: 1, Value: new String("bad"), Error: "" }],
  ["boxed-string reply Error", { ID: 1, Value: "bad", Error: new String("") }],
  ["null reply ID", { ID: null, Value: "bad", Error: "" }],
  ["zero reply ID", { ID: 0, Value: "bad", Error: "" }],
  ["unsafe reply ID", { ID: Number.MAX_SAFE_INTEGER + 1, Value: "bad", Error: "" }],
  ["extra reply field", { ID: 1, Value: "bad", Error: "", Extra: true }],
  ["cyclic reply", cycle],
  ["throwing toJSON reply", throwingToJSON],
];
for (const [label, value] of malformedReplies) {
  requireError(api.complete(value), label);
  assert.deepEqual(api.effects(), [], `${label} changed the effect outbox`);
  assert.deepEqual(api.audit(), [], `${label} changed completion audit`);
}

const recovered = api.complete({ ID: 1, Value: "valid-after-malformed", Error: "" });
assert.equal(recovered.state.Draft, "recovery-draft", "malformed dispatch changed the draft");
assert.equal(recovered.state.Saved, "valid-after-malformed", "valid reply did not recover after malformed inputs");
assert.equal(recovered.state.Saves, 1);
assert.equal(recovered.state.PendingID, 0);
assert.equal(recovered.state.Status, "saved");
assert.deepEqual(recovered.messages, [
  { Name: "edit", Arg: "recovery-draft" },
  { Name: "save", Arg: "" },
  { Name: "reply", Arg: "1" },
]);
assert.deepEqual(api.audit(), [{
  ID: 1,
  Value: "valid-after-malformed",
  Error: "",
  Accepted: true,
  Reason: "saved",
}]);
assert.deepEqual(api.effects(), []);
assert.equal(globalThis.__xrE1GoError, undefined, "malformed input terminated the Go WASM runtime");

console.log(`XR-E1 raw WASM probe passed: ${malformedDispatches.length} malformed dispatches, ${malformedReplies.length} malformed replies, atomic recovery.`);
process.exit(0);
