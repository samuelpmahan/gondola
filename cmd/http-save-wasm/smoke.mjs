import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const [wasmPath, wasmExecPath] = process.argv.slice(2);
if (!wasmPath || !wasmExecPath) {
  throw new Error("usage: node smoke.mjs <http-save.wasm> <wasm_exec.js>");
}

createRequire(import.meta.url)(resolve(wasmExecPath));
const go = new globalThis.Go();
const wasm = await readFile(resolve(wasmPath));
const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
const execution = go.run(instance);

let api;
for (let attempt = 0; attempt < 100; attempt += 1) {
  api = globalThis.gobiHTTPSave;
  if (api) break;
  await new Promise((resolveTurn) => setImmediate(resolveTurn));
}
assert.ok(api, "WASM must publish gobiHTTPSave before entering its event loop");

const request = api.encodeHTTP(7, "line \"one\"\\two\n雪");
assert.equal(request, `{"ID":7,"Value":"line \\\"one\\\"\\\\two\\n雪"}`);
assert.equal(api.encodeHTTP(Number.MAX_SAFE_INTEGER, "x"), `{"ID":9007199254740991,"Value":"x"}`);
assert.equal(api.encodeHTTP(0, "x").error?.length > 0, true, "ID zero must be rejected at the bridge");
assert.equal(api.encodeHTTP(1.5, "x").error?.length > 0, true, "fractional IDs must be rejected");
assert.equal(api.encodeHTTP(2 ** 53, "x").error?.length > 0, true, "unsafe IDs must be rejected");
assert.equal(api.encodeHTTP(1, "x", "extra").error?.length > 0, true, "extra arguments must be rejected");
assert.equal(api.encodeHTTP(1, new String("x")).error?.length > 0, true, "boxed strings must be rejected");

const valid = api.decodeHTTP(7, 200, ` {"ID":7,"Value":"saved","Error":""} \n`);
assert.deepEqual({ ID: valid.ID, Value: valid.Value, Error: valid.Error }, { ID: 7, Value: "saved", Error: "" });
assert.deepEqual(api.decodeHTTP(7, 200, `{"ID":7,"ID":7,"Value":"x","Error":""}`), {
  ID: 7, Value: "", Error: "invalid response",
});
assert.deepEqual(api.decodeHTTP(7, 200, `{"ID":8,"Value":"x","Error":""}`), {
  ID: 7, Value: "", Error: "invalid response",
});
assert.deepEqual(api.decodeHTTP(7, 200, `{"ID":7,"Value":"\\uD800","Error":""}`), {
  ID: 7, Value: "", Error: "invalid response",
});
assert.equal(api.decodeHTTP(7, 200, `{"ID":7,"Value":"\\uD83E\\uDDEA","Error":""}`).Value, "🧪");
assert.deepEqual(api.decodeHTTP(7, 503, "not json"), {
  ID: 7, Value: "", Error: "http status 503",
});
assert.equal(api.decodeHTTP(1, 600, "{}").error?.length > 0, true, "out-of-range statuses must be rejected");
assert.deepEqual(api.decodeHTTP(Number.MAX_SAFE_INTEGER, 503, "not json"), {
  ID: Number.MAX_SAFE_INTEGER, Value: "", Error: "http status 503",
});
assert.equal(api.decodeHTTP(1.25, 200, "{}").error?.length > 0, true, "fractional IDs must be rejected");
assert.equal(api.decodeHTTP(1, 200, {}).error?.length > 0, true, "body must be a primitive string");
assert.equal(api.decodeHTTP(1, 200, "{}", "extra").error?.length > 0, true, "extra arguments must be rejected");

let snapshot = api.init();
assert.equal(snapshot.state.Status, "idle");
assert.equal(api.init("extra").error?.length > 0, true, "init must reject extra arguments");
assert.equal(api.dispatch({ Path: "0", Event: "input", Value: "draft", extra: true }).error?.length > 0, true);
assert.equal(api.dispatch({ Path: "0", Event: "input", Value: "draft" }, "extra").error?.length > 0, true);
assert.equal(api.dispatch(new Proxy({}, { get() { throw new Error("hostile getter"); } })).error?.length > 0, true);
snapshot = api.dispatch({ Path: "0", Event: "input", Value: "draft" });
assert.equal(snapshot.state.Draft, "draft");
snapshot = api.dispatch({ Path: "3", Event: "click", Value: "" });
assert.equal(snapshot.state.PendingID, 1);
assert.deepEqual(api.effects(), [{ Kind: "start", ID: 1, Value: "draft" }]);
assert.deepEqual(api.effects(), []);
assert.equal(api.effects("extra").error?.length > 0, true);
snapshot = api.complete(api.decodeHTTP(1, 200, `{"ID":1,"Value":"saved","Error":""}`));
assert.equal(snapshot.state.Saved, "saved");
assert.equal(snapshot.state.Saves, 1);
assert.deepEqual(api.audit(), [{ ID: 1, Value: "saved", Error: "", Accepted: true, Reason: "saved" }]);
assert.equal(api.audit("extra").error?.length > 0, true, "audit must reject extra arguments");
assert.equal(api.complete({ ID: 1, Value: "x", Error: "" }, "extra").error?.length > 0, true);
assert.equal(api.complete(new Proxy({}, { get() { throw new Error("hostile getter"); } })).error?.length > 0, true);

// The Go program intentionally blocks in select{}; exit only after the native
// Go WASM API assertions above have run to completion.
void execution;
process.stdout.write("http-save-wasm bridge smoke passed\n");
process.exit(0);
