package compilercontract

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerateValueEncoderGoScriptSpareCapacityShape(t *testing.T) {
	module, err := GenerateValueEncoder(spareCapacityTypes())
	if err != nil {
		t.Fatal(err)
	}
	node := spareCapacityNode(t)
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "encoder.mjs"), []byte(module), 0o600); err != nil {
		t.Fatal(err)
	}
	constScript := `import assert from "node:assert/strict";
import { gobiEncodeState } from "./encoder.mjs";

let factoryCalls = 0;
const marker = Symbol("goscript.spareZero");
const row = (id, label) => ({ ID: id, Label: label, Checked: false, __goStructValue: true });
const zeroFactory = () => { factoryCalls += 1; return row(0n, "zero"); };
Object.defineProperty(zeroFactory, "name", { value: "" });
const slice = (items, capacity, length = items.length, symbol = marker, factory = zeroFactory) => {
  const backing = new Array(capacity);
  for (let i = 0; i < items.length; i += 1) {
    if (Object.hasOwn(items, i)) backing[i] = items[i];
  }
  if (symbol !== null) {
    Object.defineProperty(backing, symbol, {
      value: factory, enumerable: true, writable: true, configurable: true,
    });
  }
  return { backing, offset: 0, length, capacity, target: undefined };
};
const state = ({ Rows, Bigs, Numbers, Floats, NilRows = null, EmptyRows = [] }) => ({
  Rows, Bigs, Numbers, Floats, NilRows, EmptyRows, NegativeZero: -0,
  __goStructValue: true,
});
const encode = (value) => gobiEncodeState(value, "fixture.State");
const field = (encoded, name) => encoded.fields.find((item) => item.name === name).value;

const rowOne = row(1n, "one");
const rowTwo = row(18446744073709551615n, "max");
const valid = encode(state({
  Rows: slice([rowOne, rowTwo], 4),
  Bigs: slice([3n, 18446744073709551615n], 4),
  Numbers: slice([7, 8], 4),
  Floats: new Float64Array([-0, 1.5]),
  EmptyRows: slice([], 0),
}));
assert.equal(field(valid, "Rows").items.length, 2);
assert.equal(field(valid, "Rows").items[1].fields.find((item) => item.name === "ID").value.integer, "18446744073709551615");
assert.equal(field(valid, "Bigs").items[1].integer, "18446744073709551615");
assert.deepEqual(field(valid, "Numbers").items.map((item) => item.integer), ["7", "8"]);
assert.equal(field(valid, "Floats").items[0].float64Bits, "8000000000000000");
assert.equal(field(valid, "NegativeZero").float64Bits, "8000000000000000");
assert.equal(field(valid, "NilRows").isNil, true);
assert.deepEqual(field(valid, "NilRows").items, []);
assert.equal(field(valid, "EmptyRows").isNil, false);
assert.deepEqual(field(valid, "EmptyRows").items, []);
assert.equal(factoryCalls, 0, "the spareZero factory must never be invoked during encoding");

const mustReject = (label, value) => assert.throws(() => encode(state({
  Rows: value,
  Bigs: [],
  Numbers: [],
  Floats: new Float64Array(),
})), undefined, label);

const visibleHole = slice([rowOne, , rowTwo], 4, 3);
mustReject("a visible backing hole is rejected", visibleHole);

const prefixHole = slice([rowOne], 3, 1);
prefixHole.backing[1] = rowOne;
delete prefixHole.backing[0];
prefixHole.offset = 1;
prefixHole.capacity = 2;
mustReject("holes before the visible window are rejected", prefixHole);

const outOfCapacityHole = slice([rowOne], 2, 1);
outOfCapacityHole.backing.length = 3;
outOfCapacityHole.capacity = 1;
mustReject("holes beyond unused slice capacity are rejected", outOfCapacityHole);

const unknownSymbolBacking = slice([rowOne], 3);
Object.defineProperty(unknownSymbolBacking.backing, Symbol("other"), { value: 1, enumerable: true, writable: true, configurable: true });
mustReject("unknown backing symbols are rejected", unknownSymbolBacking);

const badFactory = function namedFactory() {};
const badFactorySlice = slice([rowOne], 3, 1, marker, badFactory);
mustReject("a factory with a different own shape is rejected", badFactorySlice);

const globalMarkerSlice = slice([rowOne], 3, 1, Symbol.for("goscript.spareZero"), zeroFactory);
mustReject("a global symbol with the same description is not admitted", globalMarkerSlice);

const accessorBacking = slice([rowOne], 3);
Object.defineProperty(accessorBacking.backing, "extra", { get() { return 1; }, enumerable: true, configurable: true });
mustReject("extra backing accessors are rejected", accessorBacking);

const extraWrapperField = slice([rowOne], 3);
extraWrapperField.debug = true;
mustReject("GoSlice wrapper extras are rejected", extraWrapperField);

const nativeWithSymbol = [rowOne];
Object.defineProperty(nativeWithSymbol, Symbol("other"), { value: 1, enumerable: true, writable: true, configurable: true });
mustReject("ordinary native arrays remain closed", nativeWithSymbol);

const nativeWithHole = [rowOne, ,];
mustReject("ordinary native arrays remain dense", nativeWithHole);

const badBounds = slice([rowOne], 3, 1);
badBounds.offset = Number.MAX_SAFE_INTEGER;
badBounds.capacity = Number.MAX_SAFE_INTEGER;
mustReject("unsafe or overflowing GoSlice bounds are rejected", badBounds);

assert.equal(factoryCalls, 0, "rejected paths must not invoke the spareZero factory");
console.log(JSON.stringify({ ok: true, factoryCalls }));
`
	if err := os.WriteFile(filepath.Join(dir, "check.mjs"), []byte(constScript), 0o600); err != nil {
		t.Fatal(err)
	}
	command := exec.Command(node, filepath.Join(dir, "check.mjs"))
	command.Dir = dir
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("generated encoder Node regression failed: %v\n%s", err, output)
	}
	if !strings.Contains(string(output), `"ok":true`) || !strings.Contains(string(output), `"factoryCalls":0`) {
		t.Fatalf("generated encoder Node regression returned unexpected output: %s", output)
	}
}

func TestGenerateGoScriptValueEncoderDecodesStrictUtf8WithoutChangingDefault(t *testing.T) {
	types := []TypeInfo{
		{ID: "string", Kind: KindString, JSRepresentation: JSDirect},
		{ID: "fixture.Row", Kind: KindStruct, JSRepresentation: JSClass, Fields: []TypeField{{Name: "Label", Type: "string"}}},
		{ID: "[]fixture.Row", Kind: KindSlice, ElemType: "fixture.Row", JSRepresentation: JSSliceWrapper},
		{ID: "fixture.State", Kind: KindStruct, JSRepresentation: JSClass, Fields: []TypeField{{Name: "Text", Type: "string"}, {Name: "Rows", Type: "[]fixture.Row"}}},
	}
	legacy, err := GenerateValueEncoder(types)
	if err != nil {
		t.Fatal(err)
	}
	goScript, err := GenerateGoScriptValueEncoder(types)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	for name, source := range map[string]string{"legacy.mjs": legacy, "goscript.mjs": goScript} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	constScript := `import assert from "node:assert/strict";
import { gobiEncodeState as encodeLegacy } from "./legacy.mjs";
import { gobiEncodeState as encodeGoScript } from "./goscript.mjs";

const toGoBytes = (text) => String.fromCharCode(...new TextEncoder().encode(text));
const text = "café 東京 🙂 −";
const row = { Label: toGoBytes(text), __goStructValue: true };
const slice = { backing: [row], offset: 0, length: 1, capacity: 1, target: undefined };
const state = { Text: toGoBytes(text), Rows: slice, __goStructValue: true };
const value = (record, name) => record.fields.find((field) => field.name === name).value;

assert.equal(value(encodeLegacy(state, "fixture.State"), "Text").string, toGoBytes(text),
  "default encoder keeps its historical GoScript byte-string behavior");
const encoded = encodeGoScript(state, "fixture.State");
assert.equal(value(encoded, "Text").string, text);
assert.equal(value(value(encoded, "Rows").items[0], "Label").string, text);

const invalidState = { ...state, Text: String.fromCharCode(0xc3, 0x28) };
assert.throws(() => encodeGoScript(invalidState, "fixture.State"), /invalid UTF-8/);
const nonByteState = { ...state, Text: "Ā" };
assert.throws(() => encodeGoScript(nonByteState, "fixture.State"), /GoScript byte string/);
console.log("strict GoScript encoder passed");
`
	if err := os.WriteFile(filepath.Join(dir, "check.mjs"), []byte(constScript), 0o600); err != nil {
		t.Fatal(err)
	}
	command := exec.Command(spareCapacityNode(t), filepath.Join(dir, "check.mjs"))
	command.Dir = dir
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("generated strict GoScript encoder failed: %v\n%s", err, output)
	}
	if !strings.HasSuffix(string(output), "strict GoScript encoder passed\n") {
		t.Fatalf("unexpected strict GoScript encoder output %q", output)
	}
}

func spareCapacityNode(t *testing.T) string {
	t.Helper()
	if node := os.Getenv("GONDOLA_NODE_BIN"); node != "" {
		if _, err := os.Stat(node); err != nil {
			t.Fatalf("GONDOLA_NODE_BIN is not executable: %v", err)
		}
		return node
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("Node is not installed; set GONDOLA_NODE_BIN to run generated-code assertions")
	}
	return node
}

func spareCapacityTypes() []TypeInfo {
	return []TypeInfo{
		{ID: "bool", Kind: KindBool, JSRepresentation: JSDirect},
		{ID: "string", Kind: KindString, JSRepresentation: JSDirect},
		{ID: "int", Kind: KindInt, Bits: 64, JSRepresentation: JSNumber},
		{ID: "uint64", Kind: KindUint, Bits: 64, JSRepresentation: JSBigInt},
		{ID: "float64", Kind: KindFloat64, JSRepresentation: JSNumber},
		{ID: "fixture.Row", Kind: KindStruct, JSRepresentation: JSClass, Fields: []TypeField{
			{Name: "ID", Type: "uint64"}, {Name: "Label", Type: "string"}, {Name: "Checked", Type: "bool"},
		}},
		{ID: "[]fixture.Row", Kind: KindSlice, ElemType: "fixture.Row", JSRepresentation: JSArrayOrSlice},
		{ID: "[]uint64", Kind: KindSlice, ElemType: "uint64", JSRepresentation: JSSliceWrapper},
		{ID: "[]int", Kind: KindSlice, ElemType: "int", JSRepresentation: JSArrayOrSlice},
		{ID: "[]float64", Kind: KindSlice, ElemType: "float64", JSRepresentation: JSFloat64Array},
		{ID: "fixture.State", Kind: KindStruct, JSRepresentation: JSClass, Fields: []TypeField{
			{Name: "Rows", Type: "[]fixture.Row"}, {Name: "Bigs", Type: "[]uint64"},
			{Name: "Numbers", Type: "[]int"}, {Name: "Floats", Type: "[]float64"},
			{Name: "NilRows", Type: "[]fixture.Row"}, {Name: "EmptyRows", Type: "[]fixture.Row"},
			{Name: "NegativeZero", Type: "float64"},
		}},
	}
}
