package compilercontract

import (
	"encoding/json"
	"math"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
)

type encodeRow struct {
	ID   uint64
	Done bool
}

type encodeState struct {
	Rows         []encodeRow
	NegativeZero float64
}

func valueTypes() []TypeInfo {
	return []TypeInfo{
		{ID: "bool", Kind: KindBool},
		{ID: "string", Kind: KindString},
		{ID: "uint64", Kind: KindUint, Bits: 64, JSRepresentation: JSBigInt},
		{ID: "float64", Kind: KindFloat64},
		{ID: "fixture.Row", Kind: KindStruct, Fields: []TypeField{{Name: "ID", Type: "uint64"}, {Name: "Done", Type: "bool"}}},
		{ID: "[]fixture.Row", Kind: KindSlice, ElemType: "fixture.Row"},
		{ID: "fixture.State", Kind: KindStruct, Fields: []TypeField{{Name: "Rows", Type: "[]fixture.Row"}, {Name: "NegativeZero", Type: "float64"}}},
	}
}

func TestEncodeValuePreservesNilEmptyAndNegativeZero(t *testing.T) {
	types := valueTypes()
	nilState := encodeState{Rows: nil, NegativeZero: math.Copysign(0, -1)}
	nilValue, err := EncodeValue(nilState, "fixture.State", types)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateValue(nilValue, types); err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(nilValue)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	if !strings.Contains(text, "\"isNil\":true,\"items\":[]") {
		t.Fatalf("nil slice marker missing: %s", text)
	}
	if !strings.Contains(text, "\"float64Bits\":\"8000000000000000\"") {
		t.Fatalf("negative zero bits missing: %s", text)
	}

	emptyState := encodeState{Rows: []encodeRow{}, NegativeZero: 0}
	emptyValue, err := EncodeValue(emptyState, "fixture.State", types)
	if err != nil {
		t.Fatal(err)
	}
	emptyRaw, err := json.Marshal(emptyValue)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(emptyRaw), "\"isNil\":false,\"items\":[]") {
		t.Fatalf("empty slice marker missing: %s", emptyRaw)
	}
	if string(raw) == string(emptyRaw) {
		t.Fatal("nil and empty slices encoded identically")
	}
}

func TestEncodeValuePreservesFullWidthIntegersAndRejectsNonFiniteFloats(t *testing.T) {
	types := valueTypes()
	value, err := EncodeValue(^uint64(0), "uint64", types)
	if err != nil {
		t.Fatal(err)
	}
	if value.Integer == nil || *value.Integer != "18446744073709551615" {
		t.Fatalf("uint64 was not encoded exactly: %+v", value)
	}
	if _, err := EncodeValue(math.Inf(1), "float64", types); err == nil {
		t.Fatal("infinite float accepted")
	}
	if _, err := EncodeValue(math.NaN(), "float64", types); err == nil {
		t.Fatal("NaN accepted")
	}
}

func TestEncodeValueMatchesNumberAndBigIntIntegerABI(t *testing.T) {
	types := []TypeInfo{
		{ID: "int", Kind: KindInt, Bits: 64, JSRepresentation: JSNumber},
		{ID: "uint", Kind: KindUint, Bits: 64, JSRepresentation: JSNumber},
		{ID: "int64", Kind: KindInt, Bits: 64, JSRepresentation: JSBigInt},
		{ID: "uint64", Kind: KindUint, Bits: 64, JSRepresentation: JSBigInt},
	}
	for _, test := range []struct {
		name   string
		value  any
		typeID TypeID
	}{
		{name: "int above safe", value: int(9007199254740992), typeID: "int"},
		{name: "int below safe", value: int(-9007199254740992), typeID: "int"},
		{name: "uint above safe", value: uint(9007199254740992), typeID: "uint"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := EncodeValue(test.value, test.typeID, types); err == nil {
				t.Fatalf("Number-backed integer outside the safe range was accepted: %v", test.value)
			}
		})
	}
	for _, test := range []struct {
		name   string
		value  any
		typeID TypeID
		want   string
	}{
		{name: "int safe max", value: int(9007199254740991), typeID: "int", want: "9007199254740991"},
		{name: "int safe min", value: int(-9007199254740991), typeID: "int", want: "-9007199254740991"},
		{name: "uint safe max", value: uint(9007199254740991), typeID: "uint", want: "9007199254740991"},
		{name: "int64 full max", value: int64(^uint64(0) >> 1), typeID: "int64", want: "9223372036854775807"},
		{name: "int64 full min", value: int64(-1 << 63), typeID: "int64", want: "-9223372036854775808"},
		{name: "uint64 full max", value: ^uint64(0), typeID: "uint64", want: "18446744073709551615"},
	} {
		t.Run(test.name, func(t *testing.T) {
			encoded, err := EncodeValue(test.value, test.typeID, types)
			if err != nil {
				t.Fatalf("valid integer encoding failed: %v", err)
			}
			if encoded.Integer == nil || *encoded.Integer != test.want {
				t.Fatalf("encoded integer = %v, want %s", encoded.Integer, test.want)
			}
		})
	}

	unsafe := "9007199254740992"
	if err := ValidateValue(Value{TypeID: "int", Kind: KindInt, Integer: &unsafe}, types); err == nil {
		t.Fatal("Number-backed tagged integer outside the safe range was accepted")
	}
	if _, err := DecodeValueJSON([]byte(`{"typeId":"uint","kind":"uint","integer":"9007199254740992"}`), types); err == nil {
		t.Fatal("Number-backed JSON integer outside the safe range was accepted")
	}
}

func TestValidateValueRejectsWrongTaggedUnionShape(t *testing.T) {
	types := valueTypes()
	zero := "0"
	falseValue := false
	bad := Value{TypeID: "uint64", Kind: KindUint, Integer: &zero, Bool: &falseValue}
	if err := ValidateValue(bad, types); err == nil {
		t.Fatal("unexpected bool payload accepted")
	}
}

func TestDecodeValueJSONIsClosedAndRejectsTrailingData(t *testing.T) {
	types := valueTypes()
	for _, input := range []string{
		"{\"typeId\":\"bool\",\"kind\":\"bool\",\"bool\":true,\"extra\":1}",
		"{\"typeId\":\"bool\",\"kind\":\"bool\",\"bool\":true} {}",
		"{\"typeId\":\"string\",\"kind\":\"string\",\"string\":\"\\ud800\"}",
	} {
		if _, err := DecodeValueJSON([]byte(input), types); err == nil {
			t.Fatalf("invalid JSON accepted: %s", input)
		}
	}
}

func TestHostScriptChecksRequestAndCompletionOrderExactly(t *testing.T) {
	requests := []EffectRequest{
		{DispatchID: "d1", EffectIndex: 0, Effect: EffectValue{Kind: string(EffectKindRequest), Name: "lookup", Arg: "x", Reply: "complete"}},
		{DispatchID: "d2", EffectIndex: 0, Effect: EffectValue{Kind: string(EffectKindRequest), Name: "lookup", Arg: "y", Reply: "complete"}},
	}
	completions := []EffectCompletion{
		{DispatchID: "d1", EffectIndex: 0, Message: MessageValue{Name: "complete", Arg: "x"}},
		{DispatchID: "d2", EffectIndex: 0, Message: MessageValue{Name: "complete", Arg: "y"}},
	}
	script := HostScript{Schema: HostScriptSchema, Steps: []HostStep{
		{Request: requests[0], Completion: &completions[0].Message},
		{Request: requests[1], Completion: &completions[1].Message},
	}}
	if got := ValidateHostScript(script, requests, completions); len(got) != 0 {
		t.Fatalf("positive host script rejected: %+v", got)
	}
	script.Steps[0], script.Steps[1] = script.Steps[1], script.Steps[0]
	if got := ValidateHostScript(script, requests, completions); len(got) == 0 {
		t.Fatal("reordered requests accepted")
	}
}

func TestTraceInitAndProtocolArrays(t *testing.T) {
	trace := NewTrace("form")
	if trace.Schema != TraceSchema || trace.Ticks == nil || len(trace.Ticks) != 0 {
		t.Fatalf("bad trace initializer: %+v", trace)
	}
	zero := Value{TypeID: "fixture.State", Kind: KindStruct, Fields: &[]FieldValue{}}
	tick := Tick{
		Index: 0, State: zero,
		RequestedEffects: []EffectRequest{}, CompletedEffects: []EffectCompletion{},
		View: ViewRecord{Tree: NodeRecord{Kind: gobi.Text, Attrs: []AttrRecord{}, On: []HandlerRecord{}, Kids: []NodeRecord{}}, Bindings: []Binding{}},
	}
	if err := AppendTick(&trace, tick); err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(trace)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"\"requestedEffects\":[]", "\"completedEffects\":[]", "\"bindings\":[]"} {
		if !strings.Contains(string(raw), field) {
			t.Fatalf("required empty array %s missing: %s", field, raw)
		}
	}
}

func TestViewWireIsClosedAndPreservesRawNodeSliceNullability(t *testing.T) {
	view := View{Tree: gobi.Node{Kind: gobi.Element, Tag: "div", Attrs: nil, On: []gobi.On{}, Kids: nil}}
	raw, err := json.Marshal(view)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"attrs":null`) || !strings.Contains(string(raw), `"on":[]`) || !strings.Contains(string(raw), `"kids":null`) || !strings.Contains(string(raw), `"bindings":[]`) {
		t.Fatalf("view wire lost raw node or protocol-array nullability: %s", raw)
	}
	var decoded View
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Tree.Attrs != nil || decoded.Tree.On == nil || decoded.Tree.Kids != nil || decoded.Bindings == nil {
		t.Fatalf("view round trip changed nil/empty semantics: %#v", decoded)
	}
	for _, invalid := range []string{
		`{"tree":{"kind":1,"tag":"div","key":"","attrs":null,"on":null,"kids":null,"text":"","extra":1},"bindings":[]}`,
		`{"tree":{"kind":1,"tag":"div","key":"","attrs":null,"on":null,"kids":null,"text":""}}`,
	} {
		if err := json.Unmarshal([]byte(invalid), &decoded); err == nil {
			t.Fatalf("invalid closed view accepted: %s", invalid)
		}
	}
}

func TestValidateTraceLinksCompletionToRequestNotReplyDispatch(t *testing.T) {
	app := effectTestAppIR()
	request := EffectRequest{
		DispatchID: "dispatch-0001", EffectIndex: 0,
		Effect: EffectValue{Kind: string(EffectKindRequest), Name: "lookup", Arg: "input", Reply: "complete"},
	}
	requestMessage := MessageValue{Name: "request", Arg: ""}
	replyMessage := MessageValue{Name: "complete", Arg: "reply"}
	dispatch1, dispatch2 := "dispatch-0001", "dispatch-0002"
	state := Value{TypeID: "example.State", Kind: KindStruct, Fields: &[]FieldValue{{Name: "Count", Value: Value{TypeID: "int", Kind: KindInt, Integer: stringPtr("0")}}}}
	tree := ViewRecord{Tree: NodeRecord{Kind: gobi.Text, Text: "ok"}, Bindings: []Binding{}}
	trace := Trace{Schema: TraceSchema, AppID: "effect", Ticks: []Tick{
		{Index: 0, State: state, RequestedEffects: []EffectRequest{}, CompletedEffects: []EffectCompletion{}, View: tree},
		{Index: 1, Message: &requestMessage, DispatchID: &dispatch1, Action: &Action{Path: "", Event: "click", Value: "script intent"}, State: state, RequestedEffects: []EffectRequest{request}, CompletedEffects: []EffectCompletion{}, View: tree},
		{Index: 2, Message: &replyMessage, DispatchID: &dispatch2, State: state, RequestedEffects: []EffectRequest{}, CompletedEffects: []EffectCompletion{{DispatchID: "dispatch-0001", EffectIndex: 0, Message: replyMessage}}, View: tree},
	}}
	if diagnostics := ValidateTrace(trace, app); len(diagnostics) != 0 {
		t.Fatalf("valid trace rejected: %+v", diagnostics)
	}
	trace.Ticks[2].DispatchID = &dispatch1
	if diagnostics := ValidateTrace(trace, app); len(diagnostics) == 0 {
		t.Fatal("reused originating request ID on reply dispatch was accepted")
	}
}

func TestGenerateValueEncoderRequiresPinnedSliceShapes(t *testing.T) {
	types := valueTypes()
	for i := range types {
		switch types[i].Kind {
		case KindBool, KindString:
			types[i].JSRepresentation = JSDirect
		case KindUint:
			types[i].JSRepresentation = JSBigInt
		case KindFloat64:
			types[i].JSRepresentation = JSNumber
		case KindStruct:
			types[i].JSRepresentation = JSClass
		case KindSlice:
			types[i].JSRepresentation = JSArrayOrSlice
		}
	}
	module, err := GenerateValueEncoder(types)
	if err != nil {
		t.Fatal(err)
	}
	for _, fragment := range []string{"export function gobiEncodeState", "__goStructValue", "array-or-goscript-slice", "Number.isSafeInteger", "float64Bits"} {
		if !strings.Contains(module, fragment) {
			t.Fatalf("generated encoder lacks %q", fragment)
		}
	}
	for i := range types {
		if types[i].ID == "[]fixture.Row" {
			types[i].JSRepresentation = JSFloat64ArrayOrSlice
		}
	}
	if _, err := GenerateValueEncoder(types); err == nil {
		t.Fatal("float64 slice with struct element accepted a float64-array representation")
	}
}

func TestValidateAppIRRecognizesEffectCancelCapability(t *testing.T) {
	app := effectTestAppIR()
	app.Components[0].Capabilities = append(app.Components[0].Capabilities, CapabilityEffectCancel)
	if diagnostics := ValidateAppIR(app); len(diagnostics) != 0 {
		t.Fatalf("effect.cancel capability rejected: %+v", diagnostics)
	}
	app.Components[0].Capabilities = append(app.Components[0].Capabilities, CapabilityEffectCancel)
	for _, diagnostic := range ValidateAppIR(app) {
		if diagnostic.Code == "app.capability-duplicate" {
			return
		}
	}
	t.Fatal("duplicate effect.cancel capability was accepted")
}

func effectTestAppIR() AppIR {
	return AppIR{
		Schema: AppIRSchema, PackagePath: "example",
		Components: []Component{{ID: "effect", PackagePath: "example", StateType: "example.State", MessageType: "gobi.Message", Init: "example.Init", Update: "example.Update", View: "example.View", Capabilities: []Capability{CapabilityViewNode}}},
		Symbols: []Symbol{
			{ID: "example.Init", PackagePath: "example", Name: "Init", Signature: Signature{Params: []TypeID{}, Results: []TypeID{"example.State"}}, Span: Span{File: "app.go", EndByte: 1}, Calls: []SymbolID{}},
			{ID: "example.Update", PackagePath: "example", Name: "Update", Signature: Signature{Params: []TypeID{"example.State", "gobi.Message"}, Results: []TypeID{"example.State", "[]gobi.Effect"}}, Span: Span{File: "app.go", EndByte: 2}, Calls: []SymbolID{}},
			{ID: "example.View", PackagePath: "example", Name: "View", Signature: Signature{Params: []TypeID{"example.State"}, Results: []TypeID{"gobi.Node"}}, Span: Span{File: "app.go", EndByte: 3}, Calls: []SymbolID{}},
		},
		Types: []TypeInfo{
			{ID: "bool", Kind: KindBool, JSRepresentation: JSDirect},
			{ID: "string", Kind: KindString, JSRepresentation: JSDirect},
			{ID: "int", Kind: KindInt, Bits: 64, JSRepresentation: JSNumber},
			{ID: "example.State", Kind: KindStruct, Fields: []TypeField{{Name: "Count", Type: "int"}}, JSRepresentation: JSClass},
			{ID: "gobi.Message", Kind: KindStruct, Fields: []TypeField{{Name: "Name", Type: "string"}, {Name: "Arg", Type: "string"}}, JSRepresentation: JSClass},
			{ID: "gobi.Effect", Kind: KindStruct, Fields: []TypeField{{Name: "Kind", Type: "string"}, {Name: "Name", Type: "string"}, {Name: "Arg", Type: "string"}, {Name: "Reply", Type: "string"}}, JSRepresentation: JSClass},
			{ID: "[]gobi.Effect", Kind: KindSlice, ElemType: "gobi.Effect", JSRepresentation: JSArrayOrSlice},
			{ID: "gobi.Node", Kind: KindStruct, Fields: []TypeField{{Name: "Tag", Type: "string"}}, JSRepresentation: JSClass},
		},
	}
}

func stringPtr(value string) *string { return &value }
