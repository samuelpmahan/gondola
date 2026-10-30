package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func TestFixtureScriptsReplayActualGoFunctions(t *testing.T) {
	cases := []struct {
		file        string
		packagePath string
		stateType   compilercontract.TypeID
		types       []compilercontract.TypeInfo
		wantTicks   int
	}{
		{"counter.json", "github.com/samuelpmahan/gondola/counter", "counter.State", counterTypes(), 5},
		{"form.json", "github.com/samuelpmahan/gondola/fixtures/compiled/form", "form.State", formTypes(), 10},
		{"list.json", "github.com/samuelpmahan/gondola/fixtures/compiled/list", "list.State", listTypes(), 11},
		{"effect.json", "github.com/samuelpmahan/gondola/fixtures/compiled/effect", "effect.State", effectTypes(), 5},
	}
	for _, test := range cases {
		t.Run(test.file, func(t *testing.T) {
			script := readFixtureScript(t, test.file)
			appIR := testAppIR(test.packagePath, test.stateType, test.types)
			trace, err := replay(appIR, script)
			if err != nil {
				t.Fatal(err)
			}
			if len(trace.Ticks) != test.wantTicks {
				t.Fatalf("trace ticks = %d, want %d", len(trace.Ticks), test.wantTicks)
			}
			if trace.Schema != compilercontract.TraceSchema || trace.AppID != "fixture-test" {
				t.Fatalf("trace identity = %#v", trace)
			}
			for i, tick := range trace.Ticks {
				if tick.Index != uint64(i) || tick.DOM != nil || tick.RequestedEffects == nil || tick.CompletedEffects == nil || tick.View.Bindings == nil {
					t.Fatalf("tick %d violates native trace envelope: %#v", i, tick)
				}
			}
		})
	}
}

func TestNativeLiteralOnArgDoesNotReadActionValue(t *testing.T) {
	app, ok := adapterFor("github.com/samuelpmahan/gondola/fixtures/compiled/form")
	if !ok {
		t.Fatal("form adapter missing")
	}
	view := app.view(app.init())
	action := compilercontract.Action{Path: "2", Event: "click", Value: "must not replace literal"}
	message, err := resolveAction(view, action)
	if err != nil {
		t.Fatal(err)
	}
	if message == nil || *message != (compilercontract.MessageValue{Name: "literal", Arg: "target.value"}) {
		t.Fatalf("literal click resolved as %#v", message)
	}
}

func TestFormTraceKeepsScriptIntentSeparateFromLiteralMessage(t *testing.T) {
	script := readFixtureScript(t, "form.json")
	trace, err := replay(testAppIR(script.PackagePath, "form.State", formTypes()), script)
	if err != nil {
		t.Fatal(err)
	}
	tick := trace.Ticks[3]
	if tick.Action == nil || tick.Action.Value != "must not replace literal" {
		t.Fatalf("script intent was not preserved: %#v", tick.Action)
	}
	if tick.Message == nil || *tick.Message != (compilercontract.MessageValue{Name: "literal", Arg: "target.value"}) {
		t.Fatalf("literal handler was interpreted as a binding: %#v", tick.Message)
	}
}

func TestResolveActionUsesTypedBindingAndSuppressesDisabledOrDetached(t *testing.T) {
	app, _ := adapterFor("github.com/samuelpmahan/gondola/fixtures/compiled/form")
	view := app.view(formStateForTest())
	textMessage, err := resolveAction(view, compilercontract.Action{Path: "0", Event: "input", Value: "dynamic"})
	if err != nil || textMessage == nil || *textMessage != (compilercontract.MessageValue{Name: "edit", Arg: "dynamic"}) {
		t.Fatalf("target.value binding = %#v, %v", textMessage, err)
	}
	checkedMessage, err := resolveAction(view, compilercontract.Action{Path: "1", Event: "change", Value: "true"})
	if err != nil || checkedMessage == nil || *checkedMessage != (compilercontract.MessageValue{Name: "checked", Arg: "true"}) {
		t.Fatalf("target.checked binding = %#v, %v", checkedMessage, err)
	}
	if _, err := resolveAction(view, compilercontract.Action{Path: "1", Event: "change", Value: "yes"}); err == nil {
		t.Fatal("invalid target.checked value accepted")
	}
	disabled := view
	disabled.Tree.Kids[6] = disabled.Tree.Kids[6].Flag("disabled")
	message, err := resolveAction(disabled, compilercontract.Action{Path: "6", Event: "click", Value: ""})
	if err != nil || message != nil {
		t.Fatalf("disabled action = %#v, %v; want no dispatch", message, err)
	}
	message, err = resolveAction(view, compilercontract.Action{Path: "90/0", Event: "input", Value: "stale"})
	if err != nil || message != nil {
		t.Fatalf("detached action = %#v, %v; want no dispatch", message, err)
	}
}

func TestNativeListTraceRetainsNilVsEmptyAndDetachedNoop(t *testing.T) {
	script := readFixtureScript(t, "list.json")
	appIR := testAppIR(script.PackagePath, "list.State", listTypes())
	trace, err := replay(appIR, script)
	if err != nil {
		t.Fatal(err)
	}
	initial := (*trace.Ticks[0].State.Fields)[0].Value
	if initial.Kind != compilercontract.KindSlice || initial.IsNil == nil || !*initial.IsNil || len(*initial.Items) != 0 {
		t.Fatalf("initial Rows is not encoded as nil: %#v", initial)
	}
	resetRows := (*trace.Ticks[9].State.Fields)[0].Value
	if resetRows.IsNil == nil || *resetRows.IsNil || len(*resetRows.Items) != 0 {
		t.Fatalf("last removal Rows is not encoded as empty: %#v", resetRows)
	}
	stale := trace.Ticks[8]
	if stale.Action == nil || stale.Message != nil || stale.DispatchID != nil {
		t.Fatalf("detached action was not suppressed: %#v", stale)
	}
}

func TestEffectTraceCommitsBeforeOneReplyAndPreservesNegativeZero(t *testing.T) {
	script := readFixtureScript(t, "effect.json")
	trace, err := replay(testAppIR(script.PackagePath, "effect.State", effectTypes()), script)
	if err != nil {
		t.Fatal(err)
	}
	request := trace.Ticks[3]
	if request.State.Kind != compilercontract.KindStruct || len(*request.State.Fields) != 7 {
		t.Fatalf("request state shape = %#v", request.State)
	}
	fields := *request.State.Fields
	if *fields[3].Value.Bool != true || *fields[4].Value.Integer != "1" || *fields[5].Value.Integer != "0" {
		t.Fatalf("request did not commit before reply: %#v", fields)
	}
	if len(request.RequestedEffects) != 1 || request.RequestedEffects[0].DispatchID != "dispatch-0002" || request.RequestedEffects[0].EffectIndex != 0 {
		t.Fatalf("request effect = %#v", request.RequestedEffects)
	}
	reply := trace.Ticks[4]
	if reply.Action != nil || reply.Message == nil || *reply.Message != (compilercontract.MessageValue{Name: "complete", Arg: "reply value"}) || reply.DispatchID == nil || *reply.DispatchID != "dispatch-0003" {
		t.Fatalf("reply tick = %#v", reply)
	}
	if len(reply.CompletedEffects) != 1 || reply.CompletedEffects[0].DispatchID != "dispatch-0002" || reply.CompletedEffects[0].EffectIndex != 0 {
		t.Fatalf("completion correlation = %#v", reply.CompletedEffects)
	}
	negativeZero := fields[6].Value
	if negativeZero.Float64Bits == nil || *negativeZero.Float64Bits != "8000000000000000" {
		t.Fatalf("negative zero bits = %#v", negativeZero)
	}
}

func readFixtureScript(t *testing.T, filename string) fixtureScript {
	t.Helper()
	path := filepath.Join("..", "..", "compiled-frontend", "fixtures", filename)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var script fixtureScript
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&script); err != nil {
		t.Fatal(err)
	}
	return script
}

func testAppIR(packagePath string, stateType compilercontract.TypeID, types []compilercontract.TypeInfo) compilercontract.AppIR {
	initID := compilercontract.SymbolID(packagePath + ".Init")
	updateID := compilercontract.SymbolID(packagePath + ".Update")
	viewID := compilercontract.SymbolID(packagePath + ".View")
	span := compilercontract.Span{File: "fixture.go", StartByte: 0, EndByte: 1}
	caps := []compilercontract.Capability{
		compilercontract.CapabilityViewNode, compilercontract.CapabilityBindingValue,
		compilercontract.CapabilityBindingChecked, compilercontract.CapabilityEffectRequest,
		compilercontract.CapabilitySafeInteger, compilercontract.CapabilityFloat64,
	}
	baseTypes := []compilercontract.TypeInfo{
		{ID: "bool", Kind: compilercontract.KindBool, JSRepresentation: compilercontract.JSDirect},
		{ID: "string", Kind: compilercontract.KindString, JSRepresentation: compilercontract.JSDirect},
		{ID: "int", Kind: compilercontract.KindInt, Bits: uint8(strconv.IntSize), JSRepresentation: compilercontract.JSNumber},
		{ID: "uint64", Kind: compilercontract.KindUint, Bits: 64, JSRepresentation: compilercontract.JSBigInt},
		{ID: "float64", Kind: compilercontract.KindFloat64, JSRepresentation: compilercontract.JSNumber},
	}
	allTypes := []compilercontract.TypeInfo{}
	seenTypes := map[compilercontract.TypeID]bool{}
	inputTypes := append(append(append([]compilercontract.TypeInfo{}, baseTypes...), types...), commonTypes()...)
	for _, info := range inputTypes {
		if !seenTypes[info.ID] {
			seenTypes[info.ID] = true
			allTypes = append(allTypes, info)
		}
	}
	return compilercontract.AppIR{
		Schema: compilercontract.AppIRSchema, PackagePath: packagePath,
		Components: []compilercontract.Component{{ID: "fixture-test", PackagePath: packagePath, StateType: stateType, MessageType: "gobi.Message", Init: initID, Update: updateID, View: viewID, Capabilities: caps}},
		Symbols: []compilercontract.Symbol{
			{ID: initID, PackagePath: packagePath, Name: "Init", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{}, Results: []compilercontract.TypeID{stateType}}, Span: span, Calls: []compilercontract.SymbolID{}},
			{ID: updateID, PackagePath: packagePath, Name: "Update", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{stateType, "gobi.Message"}, Results: []compilercontract.TypeID{stateType, "[]gobi.Effect"}}, Span: span, Calls: []compilercontract.SymbolID{}},
			{ID: viewID, PackagePath: packagePath, Name: "View", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{stateType}, Results: []compilercontract.TypeID{"compilercontract.View"}}, Span: span, Calls: []compilercontract.SymbolID{}},
		},
		Types: allTypes,
	}
}

func counterTypes() []compilercontract.TypeInfo {
	return []compilercontract.TypeInfo{
		{ID: "float64", Kind: compilercontract.KindFloat64, JSRepresentation: compilercontract.JSNumber},
		{ID: "counter.State", Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Count", Type: "float64"}}},
	}
}

func formTypes() []compilercontract.TypeInfo {
	return []compilercontract.TypeInfo{
		{ID: "string", Kind: compilercontract.KindString, JSRepresentation: compilercontract.JSDirect},
		{ID: "bool", Kind: compilercontract.KindBool, JSRepresentation: compilercontract.JSDirect},
		{ID: "int", Kind: compilercontract.KindInt, Bits: uint8(strconv.IntSize), JSRepresentation: compilercontract.JSNumber},
		{ID: "form.State", Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Draft", Type: "string"}, {Name: "Checked", Type: "bool"}, {Name: "Saved", Type: "string"}, {Name: "Saves", Type: "int"}, {Name: "Literal", Type: "string"}}},
	}
}

func listTypes() []compilercontract.TypeInfo {
	return []compilercontract.TypeInfo{
		{ID: "bool", Kind: compilercontract.KindBool, JSRepresentation: compilercontract.JSDirect},
		{ID: "string", Kind: compilercontract.KindString, JSRepresentation: compilercontract.JSDirect},
		{ID: "uint64", Kind: compilercontract.KindUint, Bits: 64, JSRepresentation: compilercontract.JSBigInt},
		{ID: "list.Row", Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "ID", Type: "uint64"}, {Name: "Label", Type: "string"}, {Name: "Checked", Type: "bool"}}},
		{ID: "[]list.Row", Kind: compilercontract.KindSlice, ElemType: "list.Row", JSRepresentation: compilercontract.JSArrayOrSlice},
		{ID: "list.State", Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Rows", Type: "[]list.Row"}, {Name: "NextID", Type: "uint64"}}},
	}
}

func effectTypes() []compilercontract.TypeInfo {
	return []compilercontract.TypeInfo{
		{ID: "string", Kind: compilercontract.KindString, JSRepresentation: compilercontract.JSDirect},
		{ID: "bool", Kind: compilercontract.KindBool, JSRepresentation: compilercontract.JSDirect},
		{ID: "int", Kind: compilercontract.KindInt, Bits: uint8(strconv.IntSize), JSRepresentation: compilercontract.JSNumber},
		{ID: "float64", Kind: compilercontract.KindFloat64, JSRepresentation: compilercontract.JSNumber},
		{ID: "effect.State", Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Input", Type: "string"}, {Name: "Value", Type: "string"}, {Name: "Status", Type: "string"}, {Name: "Pending", Type: "bool"}, {Name: "Requests", Type: "int"}, {Name: "Completions", Type: "int"}, {Name: "NegativeZero", Type: "float64"}}},
	}
}

func commonTypes() []compilercontract.TypeInfo {
	return []compilercontract.TypeInfo{
		{ID: "gobi.Message", Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Name", Type: "string"}, {Name: "Arg", Type: "string"}}},
		{ID: "gobi.Effect", Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Kind", Type: "string"}, {Name: "Name", Type: "string"}, {Name: "Arg", Type: "string"}, {Name: "Reply", Type: "string"}}},
		{ID: "[]gobi.Effect", Kind: compilercontract.KindSlice, ElemType: "gobi.Effect", JSRepresentation: compilercontract.JSArrayOrSlice},
		{ID: "compilercontract.View", Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Tree", Type: "string"}}},
	}
}

func formStateForTest() any {
	adapter, _ := adapterFor("github.com/samuelpmahan/gondola/fixtures/compiled/form")
	return adapter.init()
}
