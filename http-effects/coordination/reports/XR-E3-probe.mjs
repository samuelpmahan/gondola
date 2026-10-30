#!/usr/bin/env node
// Reproducible differential probe for the E3 JavaScript decoder. This is a
// diagnostic receipt, not a production harness component.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const [wasmArg, wasmExecArg, extraArg] = process.argv.slice(2);
if (extraArg !== undefined) {
  throw new Error("usage: node XR-E3-probe.mjs [http-save.wasm [wasm_exec.js]]");
}
const wasmPath = resolve(wasmArg ?? resolve(repoRoot, "http-effects/build/http-save.wasm"));
const wasmExecPath = resolve(wasmExecArg ?? resolve(repoRoot, "http-effects/build/wasm_exec.js"));
const referenceURL = pathToFileURL(resolve(repoRoot, "http-effects/reference.mjs"));
const { decodeHTTP } = await import(referenceURL.href);
const { seededScripts } = await import(pathToFileURL(resolve(repoRoot, "http-effects/scripts.mjs")).href);

createRequire(import.meta.url)(wasmExecPath);
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(await readFile(wasmPath), go.importObject);
void go.run(instance);

let candidate;
for (let attempt = 0; attempt < 100; attempt += 1) {
  candidate = globalThis.gobiHTTPSave;
  if (candidate) break;
  await new Promise((ready) => setImmediate(ready));
}
assert.ok(candidate, "Go WASM must publish gobiHTTPSave");

const ID = 7;
const valid = '{"ID":7,"Value":"x","Error":""}';
const bodies = [
  valid,
  ' \r\n { "Error" : "", "Value" : "🌘 café", "ID" : 7 } \t',
  '{"ID":7,"Value":"<&>\u2028\u2029","Error":""}',
  '{"ID":7,"Value":"\\uD800","Error":""}',
  '{"ID":7,"Value":"\\\\uD800","Error":""}',
  '{"ID":7,"Value":"\\\"","Error":""}',
  '{"ID":7,"ID":7,"Value":"x","Error":""}',
  '{"ID":7,"I\\u0044":7,"Value":"x","Error":""}',
  '{"ID":7,"Value":"x","Error":"","Error":""}',
  '{"ID":7,"Value":"x","Error":"","Extra":0}',
  '{"ID":7,"Value":{"nested":true},"Error":""}',
  '{"ID":7,"Value":["nested"],"Error":""}',
  '{"ID":7.0,"Value":"x","Error":""}',
  '{"ID":7e0,"Value":"x","Error":""}',
  '{"ID":7,"Value":"\\ud800","Error":""}',
  '{"ID":7,"Value":"\\udc00","Error":""}',
  '{"ID":7,"Value":"\\ud800\\u0041","Error":""}',
  '{"ID":7,"Value":"\\ud800\\udc00","Error":""}',
  '{"ID":7,"Value":"x","Error":""} trailing',
  valid + " ".repeat(65_536 - valid.length),
  valid + " ".repeat(65_537 - valid.length),
];

let manualComparisons = 0;
for (const body of bodies) {
  assert.deepEqual(candidate.decodeHTTP(ID, 200, body), decodeHTTP(ID, 200, body), body.slice(0, 100));
  manualComparisons += 1;
}
for (const status of [100, 201, 404, 503, 599]) {
  const body = "x".repeat(70_000);
  assert.deepEqual(candidate.decodeHTTP(ID, status, body), decodeHTTP(ID, status, body), `status ${status}`);
  manualComparisons += 1;
}

// Preserve the original adversarial-case generator: xorshift32 with seed
// 202409, 2,500 generated top-level objects, the same key/value pools, the
// same four whitespace choices, and the same trailing-content predicate.
let state = 202409 >>> 0;
const random = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
};
const keys = [
  '"ID"', '"I\\u0044"', '"Value"', '"V\\u0061lue"', '"Error"', '"Extra"', '"a\\\"b"',
];
const values = [
  '""', '"plain"', '"x } , ] [ { , y"', '"\\\\uD800"', '"\\uD83C\\uDF18"',
  '"\\uD800"', '"\\uDC00"', 'null', 'true', '0', '7.0', '7e0', '{}', '[]',
  '["}","]"]', '{"nested":[1,{"q":"\\\"},]"}]}', '"bad\\q"', '"unterminated', '01',
];
const separators = [" ", "\n", "\r\t", ""];
let generatedComparisons = 0;
for (let index = 0; index < 2_500; index += 1) {
  const members = [];
  const count = random() % 7;
  for (let member = 0; member < count; member += 1) {
    members.push(`${keys[random() % keys.length]}:${values[random() % values.length]}`);
  }
  const body = `${separators[random() % 4]}{${separators[random() % 4]}${members.join(`,${separators[random() % 4]}`)}${separators[random() % 4]}}${random() % 3 === 0 ? " trailing" : ""}`;
  assert.deepEqual(candidate.decodeHTTP(ID, 200, body), decodeHTTP(ID, 200, body), `case ${index}: ${body}`);
  generatedComparisons += 1;
}

// Keep the separate seed-script receipt reproducible alongside the codec
// probe. This uses E3's seededScripts generator, also with seed 202409.
const scriptOptions = { cases: 30, maxActions: 40 };
const scriptsA = seededScripts(202409, scriptOptions);
const scriptsB = seededScripts(202409, scriptOptions);
assert.deepEqual(scriptsA, scriptsB);
assert.equal(scriptsA.length, 30);
assert.ok(scriptsA.every((script, index) =>
  script.name === `seed-202409-case-${index}` && script.actions.length <= scriptOptions.maxActions));
const scriptBytes = JSON.stringify(scriptsA);
const scriptHash = createHash("sha256").update(scriptBytes).digest("hex");

console.log(JSON.stringify({
  manualComparisons,
  generatedComparisons,
  adversarialSeed: 202409,
  scriptSeed: 202409,
  scriptCases: scriptsA.length,
  scriptActions: scriptsA.reduce((count, script) => count + script.actions.length, 0),
  scriptJSONBytes: Buffer.byteLength(scriptBytes),
  scriptSHA256: scriptHash,
  wasmSHA256: createHash("sha256").update(await readFile(wasmPath)).digest("hex"),
}));
process.exit(0);
