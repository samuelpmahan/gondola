import assert from "node:assert/strict";
import test from "node:test";

import {
  createHTTPReferenceRuntime,
  decodeHTTP,
  encodeHTTP,
  MAX_HTTP_BODY_BYTES,
} from "./reference.mjs";

test("HTTP encoder emits the exact Go request wire shape and validates values", () => {
  assert.equal(encodeHTTP(9, '  café\n"\u0000'), '{"ID":9,"Value":"  café\\n\\\"\\u0000"}');
  assert.equal(encodeHTTP(Number.MAX_SAFE_INTEGER, "🌘<&"),
    '{"ID":9007199254740991,"Value":"🌘<&"}');
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "1"]) {
    assert.throws(() => encodeHTTP(id, "value"), /ID/);
  }
  for (const value of [new String("value"), 3, null, undefined]) {
    assert.throws(() => encodeHTTP(1, value), /Value/);
  }
  assert.throws(() => encodeHTTP(1, "value", "extra"), /arguments/);
});

test("HTTP decoder preserves only exact correlated replies", () => {
  assert.deepEqual(decodeHTTP(7, 200, '{"ID":7,"Value":"saved","Error":""}'), {
    ID: 7, Value: "saved", Error: "",
  });
  assert.deepEqual(decodeHTTP(7, 200, '{"ID":7,"Value":"","Error":"denied"}'), {
    ID: 7, Value: "", Error: "denied",
  });

  const invalid = [
    "",
    "null",
    "[]",
    '{"ID":7,"Value":"x"}',
    '{"ID":7,"Value":"x","Error":"","Extra":0}',
    '{"ID":7,"ID":7,"Value":"x","Error":""}',
    '{"ID":7,"\\u0049D":7,"Value":"x","Error":""}',
    '{"ID":7,"Value":"x","Error":"","Error":"again"}',
    '{"ID":"7","Value":"x","Error":""}',
    '{"ID":7.0,"Value":"x","Error":""}',
    '{"ID":7e0,"Value":"x","Error":""}',
    '{"ID":7.5,"Value":"x","Error":""}',
    '{"ID":8,"Value":"x","Error":""}',
    '{"ID":7,"Value":false,"Error":""}',
    '{"ID":7,"Value":"x","Error":null}',
    '{"ID":7,"Value":"x","Error":""} trailing',
    '{"ID":7,"Value":"\\ud800","Error":""}',
    '{"ID":7,"Value":"\\udc00","Error":""}',
    '{"ID":7,"Value":"\\ud800\\u0041","Error":""}',
  ];
  for (const body of invalid) {
    assert.deepEqual(decodeHTTP(7, 200, body), { ID: 7, Value: "", Error: "invalid response" }, body);
  }
  assert.deepEqual(decodeHTTP(7, 200, '{"ID":7,"Value":"\\ud83c\\udf18","Error":""}'), {
    ID: 7, Value: "🌘", Error: "",
  }, "valid surrogate pairs match Go encoding/json decoding");
  assert.deepEqual(decodeHTTP(7, 200, `{"ID":7,"Value":"${"\ud800"}","Error":""}`), {
    ID: 7, Value: "\ufffd", Error: "",
  }, "a raw JS lone surrogate is normalized like browser text decoding");

  assert.deepEqual(decodeHTTP(7, 503, "not JSON"), {
    ID: 7, Value: "", Error: "http status 503",
  });
  assert.deepEqual(decodeHTTP(7, 200, "x".repeat(MAX_HTTP_BODY_BYTES + 1)), {
    ID: 7, Value: "", Error: "invalid response",
  });
  assert.deepEqual(decodeHTTP(7, 200, `{"ID":7,"Value":"${"é".repeat(MAX_HTTP_BODY_BYTES / 2)}","Error":""}`), {
    ID: 7, Value: "", Error: "invalid response",
  }, "UTF-8 byte length, not UTF-16 character count, enforces the limit");
  assert.throws(() => decodeHTTP(0, 200, "{}"), /ID/);
  assert.throws(() => decodeHTTP(1, 99, "{}"), /status/);
  assert.throws(() => decodeHTTP(1, 600, "{}"), /status/);
  assert.throws(() => decodeHTTP(1, 200, new String("{}")), /body/);
  assert.throws(() => decodeHTTP(1, 200, "{}", "extra"), /arguments/);
});

test("HTTP reference runtime keeps the async model API and exposes independent codecs", () => {
  const runtime = createHTTPReferenceRuntime();
  for (const method of ["init", "dispatch", "complete", "effects", "audit", "snapshot", "encodeHTTP", "decodeHTTP"]) {
    assert.equal(typeof runtime[method], "function", `${method} is available`);
  }

  runtime.init();
  runtime.dispatch({ Path: "0", Event: "input", Value: "draft" });
  runtime.dispatch({ Path: "3", Event: "click", Value: "" });
  assert.deepEqual(runtime.effects(), [{ Kind: "start", ID: 1, Value: "draft" }]);
  runtime.complete(runtime.decodeHTTP(1, 200, '{"ID":1,"Value":"from server","Error":""}'));
  assert.equal(runtime.snapshot().state.Saved, "from server");
  assert.equal(runtime.audit()[0].Reason, "saved");
});
