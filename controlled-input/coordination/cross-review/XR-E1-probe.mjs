#!/usr/bin/env node
// Exercise the public editor WASM API with malformed JavaScript values. Build
// `controlled-input/build/editor.wasm` and copy Go's `wasm_exec.js` there first.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = resolve(HERE, "../../build/editor.wasm");
const WASM_EXEC_PATH = resolve(HERE, "../../build/wasm_exec.js");
const require = createRequire(import.meta.url);

require(WASM_EXEC_PATH);
assert.equal(typeof globalThis.Go, "function", "wasm_exec.js must publish Go");

const bytes = await readFile(WASM_PATH);
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
void go.run(instance).catch((error) => {
  console.error("Go runtime rejected:", error);
  process.exitCode = 1;
});

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
for (let attempt = 0; attempt < 200; attempt++) {
  if (globalThis.gobiEditor?.dispatch) break;
  await wait(5);
}
assert.equal(typeof globalThis.gobiEditor?.dispatch, "function", "gobiEditor API was not published");

const circular = {};
circular.self = circular;
const throwingToJSON = { toJSON() { throw new Error("toJSON exploded"); } };
const cases = [
  ["undefined argument", undefined],
  ["null argument", null],
  ["number", 42],
  ["string", "not a step"],
  ["array", []],
  ["function", () => {}],
  ["symbol", Symbol("step")],
  ["bigint", 1n],
  ["circular object", circular],
  ["throwing toJSON", throwingToJSON],
];

for (const [name, value] of cases) {
  const result = globalThis.gobiEditor.dispatch(value);
  assert.ok(result && typeof result.error === "string" && result.error.length > 0,
    `${name} must return an explicit error object; got ${String(result)}`);
  console.log(`PASS ${name}: ${result.error}`);
}

const valid = globalThis.gobiEditor.dispatch({ Path: "0", Event: "input", Value: "recovered" });
assert.equal(valid.error, undefined, `valid dispatch returned an error: ${JSON.stringify(valid)}`);
assert.equal(valid.state?.Draft, "recovered", "valid dispatch after malformed values must still update Go state");
assert.equal(valid.messages?.length, 1, "the recovered session must record the valid edit");
console.log("PASS valid dispatch after malformed values: runtime remained usable");

// The Go main loop intentionally remains active for the lifetime of the WASM
// runtime, so terminate this one-shot probe after its assertions complete.
process.exit(process.exitCode ?? 0);
