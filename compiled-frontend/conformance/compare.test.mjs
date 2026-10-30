import test from "node:test";
import assert from "node:assert/strict";

import { assertExactTraceValue, TraceMismatchError } from "./compare.mjs";

test("compares closed objects independent of JSON object key order", () => {
  assert.doesNotThrow(() => assertExactTraceValue(
    { version: 1, nested: { value: "x", enabled: true } },
    { nested: { enabled: true, value: "x" }, version: 1 },
  ));
});

test("rejects missing and extra object fields", () => {
  assert.throws(() => assertExactTraceValue({ tick: 1, state: {} }, { tick: 1 }), (error) => {
    assert.ok(error instanceof TraceMismatchError);
    assert.equal(error.path, "$.state");
    return true;
  });
  assert.throws(() => assertExactTraceValue({ tick: 1 }, { tick: 1, injected: true }), (error) => {
    assert.ok(error instanceof TraceMismatchError);
    assert.equal(error.path, "$.injected");
    return true;
  });
});

test("preserves ordered array length and positions", () => {
  assert.throws(() => assertExactTraceValue({ ticks: [0, 1] }, { ticks: [1, 0] }), /\$\.ticks\[0\]/);
  assert.throws(() => assertExactTraceValue({ effects: ["start"] }, { effects: ["start", "reply"] }), /\$\.effects\.length/);
});

test("keeps nil distinct from empty arrays", () => {
  assert.throws(() => assertExactTraceValue({ state: { rows: null } }, { state: { rows: [] } }), /\$\.state\.rows/);
  assert.throws(() => assertExactTraceValue({ rows: [] }, { rows: null }), /\$\.rows/);
});

test("uses exact floating point values and distinguishes negative zero", () => {
  assert.doesNotThrow(() => assertExactTraceValue({ value: 0.1 + 0.2 }, { value: 0.1 + 0.2 }));
  assert.throws(() => assertExactTraceValue({ value: 0 }, { value: -0 }), /\$\.value/);
  assert.throws(() => assertExactTraceValue({ bits: "8000000000000000" }, { bits: "0000000000000000" }), /\$\.bits/);
});

test("rejects values that cannot be part of a lossless JSON trace", () => {
  assert.throws(() => assertExactTraceValue({ value: Number.NaN }, { value: Number.NaN }), /non-finite number/);
  assert.throws(() => assertExactTraceValue({ value: undefined }, { value: undefined }), /unsupported value/);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => assertExactTraceValue(sparse, sparse), /sparse array/);
  const accessor = {};
  Object.defineProperty(accessor, "value", { enumerable: true, get() { throw new Error("must not execute"); } });
  assert.throws(() => assertExactTraceValue({ value: 1 }, accessor), /accessor or non-enumerable property/);
});
