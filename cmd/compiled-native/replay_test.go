package main

import (
	"bytes"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/fixtures/compiled/methods"
	"github.com/samuelpmahan/gondola/gobi"
)

func TestFixtureScriptsReplayActualGoFunctions(t *testing.T) {
	cases := []struct {
		file        string
		scriptPath  string
		packagePath string
		stateType   compilercontract.TypeID
		types       []compilercontract.TypeInfo
		wantTicks   int
	}{
		{file: "counter.json", scriptPath: "compiled-frontend/fixtures/counter.json", packagePath: "github.com/samuelpmahan/gondola/counter", stateType: "counter.State", types: counterTypes(), wantTicks: 5},
		{file: "form.json", scriptPath: "compiled-frontend/fixtures/form.json", packagePath: "github.com/samuelpmahan/gondola/fixtures/compiled/form", stateType: "form.State", types: formTypes(), wantTicks: 10},
		{file: "list.json", scriptPath: "compiled-frontend/fixtures/list.json", packagePath: "github.com/samuelpmahan/gondola/fixtures/compiled/list", stateType: "list.State", types: listTypes(), wantTicks: 11},
		{file: "effect.json", scriptPath: "compiled-frontend/fixtures/effect.json", packagePath: "github.com/samuelpmahan/gondola/fixtures/compiled/effect", stateType: "effect.State", types: effectTypes(), wantTicks: 5},
		{file: "methods.json", scriptPath: "compiled-methods/conformance/fixtures/methods.json", packagePath: "github.com/samuelpmahan/gondola/fixtures/compiled/methods", stateType: "github.com/samuelpmahan/gondola/fixtures/compiled/methods.State", types: methodsTypes(), wantTicks: 19},
	}
	for _, test := range cases {
		t.Run(test.file, func(t *testing.T) {
			script := readFixtureScriptAt(t, test.scriptPath)
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

func TestMethodCompositionUsesSavedValueAndReadOnlyPolicy(t *testing.T) {
	const packagePath = "github.com/samuelpmahan/gondola/fixtures/compiled/methods"
	script := readFixtureScriptAt(t, "compiled-methods/conformance/fixtures/methods.json")
	trace, err := replay(testAppIR(packagePath, compilercontract.TypeID(packagePath+".State"), methodsTypes()), script)
	if err != nil {
		t.Fatal(err)
	}
	if len(trace.Ticks) != 19 {
		t.Fatalf("trace ticks = %d, want 19", len(trace.Ticks))
	}

	assertMethodState(t, trace.Ticks[0].State, 0, 0, false, 0)
	assertMethodState(t, trace.Ticks[3].State, 0, 2, false, 2)
	assertMethodState(t, trace.Ticks[4].State, 0, 3, false, 2)
	assertMethodState(t, trace.Ticks[5].State, 2, 3, false, 2)
	assertMethodState(t, trace.Ticks[9].State, 2, 1, true, 2)
	assertMethodState(t, trace.Ticks[12].State, 3, 1, true, 2)
	assertMethodState(t, trace.Ticks[13].State, 3, 1, true, 1)
	assertMethodState(t, trace.Ticks[14].State, 1, 1, true, 1)
	assertMethodState(t, trace.Ticks[16].State, 1, 2, false, 1)
	assertMethodState(t, trace.Ticks[17].State, 0, 2, false, 1)
	assertMethodState(t, trace.Ticks[18].State, 0, 2, false, 1)

	for _, tickIndex := range []int{7, 10, 11, 18} {
		tick := trace.Ticks[tickIndex]
		if tick.Message != nil || tick.DispatchID != nil || len(tick.RequestedEffects) != 0 || len(tick.CompletedEffects) != 0 {
			t.Fatalf("disabled action tick %d dispatched or emitted effects: %#v", tickIndex, tick)
		}
	}
	if tick := trace.Ticks[9]; tick.Message == nil || tick.Message.Name != "toggleReadOnly" {
		t.Fatalf("lock transition was not dispatched: %#v", tick)
	}
	if tick := trace.Ticks[12]; tick.Message == nil || tick.Message.Name != "parentAdd" {
		t.Fatalf("parent Add was not available while child was read-only: %#v", tick)
	}
}

func TestMethodValueReceiversDoNotMutateOriginalNestedState(t *testing.T) {
	original := methods.State{
		Parent: counter.State{Count: 1},
		Child:  counter.State{Count: 2},
	}

	captured, effects := original.CaptureChild()
	if len(effects) != 0 {
		t.Fatalf("capture effects = %#v, want none", effects)
	}
	assertMethodsGoState(t, original, 1, 2, false, 0)
	assertMethodsGoState(t, captured, 1, 2, false, 2)

	edited, effects := captured.AddChild()
	if len(effects) != 0 {
		t.Fatalf("child Add effects = %#v, want none", effects)
	}
	assertMethodsGoState(t, original, 1, 2, false, 0)
	assertMethodsGoState(t, captured, 1, 2, false, 2)
	assertMethodsGoState(t, edited, 1, 3, false, 2)

	published, effects := edited.PublishSaved()
	if len(effects) != 0 {
		t.Fatalf("publish effects = %#v, want none", effects)
	}
	assertMethodsGoState(t, original, 1, 2, false, 0)
	assertMethodsGoState(t, captured, 1, 2, false, 2)
	assertMethodsGoState(t, edited, 1, 3, false, 2)
	assertMethodsGoState(t, published, 2, 3, false, 2)

	updatedPublish, effects := methods.Update(edited, gobi.Message{Name: "publishSaved"})
	if len(effects) != 0 {
		t.Fatalf("Update publish effects = %#v, want none", effects)
	}
	assertMethodsGoState(t, edited, 1, 3, false, 2)
	assertMethodsGoState(t, updatedPublish, 2, 3, false, 2)

	secondPublishInput := methods.State{
		Parent:     counter.State{Count: 3},
		Child:      counter.State{Count: 1},
		ReadOnly:   true,
		SavedChild: 1,
	}
	secondPublish, effects := methods.Update(secondPublishInput, gobi.Message{Name: "publishSaved"})
	if len(effects) != 0 {
		t.Fatalf("second Update publish effects = %#v, want none", effects)
	}
	assertMethodsGoState(t, secondPublishInput, 3, 1, true, 1)
	assertMethodsGoState(t, secondPublish, 1, 1, true, 1)

	lockedInput := methods.State{
		Parent:     counter.State{Count: 3},
		Child:      counter.State{Count: 1},
		ReadOnly:   true,
		SavedChild: 1,
	}
	for _, name := range []string{"childAdd", "childReset"} {
		lockedResult, effects := methods.Update(lockedInput, gobi.Message{Name: name})
		if len(effects) != 0 {
			t.Fatalf("locked %s effects = %#v, want none", name, effects)
		}
		assertMethodsGoState(t, lockedInput, 3, 1, true, 1)
		assertMethodsGoState(t, lockedResult, 3, 1, true, 1)
	}

	updated, effects := methods.Update(original, gobi.Message{Name: "parentAdd"})
	if len(effects) != 0 {
		t.Fatalf("parent Add effects = %#v, want none", effects)
	}
	assertMethodsGoState(t, original, 1, 2, false, 0)
	assertMethodsGoState(t, updated, 2, 2, false, 0)
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
	return readFixtureScriptAt(t, filepath.ToSlash(filepath.Join("compiled-frontend", "fixtures", filename)))
}

func readFixtureScriptAt(t *testing.T, repoRelativePath string) fixtureScript {
	t.Helper()
	path := filepath.Join("..", "..", filepath.FromSlash(repoRelativePath))
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

func methodsTypes() []compilercontract.TypeInfo {
	const counterState = compilercontract.TypeID("github.com/samuelpmahan/gondola/counter.State")
	const methodsState = compilercontract.TypeID("github.com/samuelpmahan/gondola/fixtures/compiled/methods.State")
	return []compilercontract.TypeInfo{
		{ID: "float64", Kind: compilercontract.KindFloat64, JSRepresentation: compilercontract.JSNumber},
		{ID: "bool", Kind: compilercontract.KindBool, JSRepresentation: compilercontract.JSDirect},
		{ID: counterState, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass,
			Fields: []compilercontract.TypeField{{Name: "Count", Type: "float64"}}},
		{ID: methodsState, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass,
			Fields: []compilercontract.TypeField{
				{Name: "Parent", Type: counterState},
				{Name: "Child", Type: counterState},
				{Name: "ReadOnly", Type: "bool"},
				{Name: "SavedChild", Type: "float64"},
			}},
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

func assertMethodsGoState(t *testing.T, state methods.State, parent, child float64, readOnly bool, savedChild float64) {
	t.Helper()
	if state.Parent.Count != parent || state.Child.Count != child || state.ReadOnly != readOnly || state.SavedChild != savedChild {
		t.Fatalf("methods state = %#v, want Parent=%v Child=%v ReadOnly=%v SavedChild=%v",
			state, parent, child, readOnly, savedChild)
	}
}

func assertMethodState(t *testing.T, state compilercontract.Value, parent, child float64, readOnly bool, savedChild float64) {
	t.Helper()
	parentState := methodStateField(t, state, "Parent")
	childState := methodStateField(t, state, "Child")
	if got := methodFloatField(t, parentState, "Count"); got != parent {
		t.Fatalf("Parent.Count = %v, want %v", got, parent)
	}
	if got := methodFloatField(t, childState, "Count"); got != child {
		t.Fatalf("Child.Count = %v, want %v", got, child)
	}
	readOnlyValue := methodStateField(t, state, "ReadOnly")
	if readOnlyValue.Bool == nil || *readOnlyValue.Bool != readOnly {
		t.Fatalf("ReadOnly = %#v, want %v", readOnlyValue, readOnly)
	}
	if got := methodFloatField(t, state, "SavedChild"); got != savedChild {
		t.Fatalf("SavedChild = %v, want %v", got, savedChild)
	}
}

func methodStateField(t *testing.T, state compilercontract.Value, name string) compilercontract.Value {
	t.Helper()
	if state.Kind != compilercontract.KindStruct || state.Fields == nil {
		t.Fatalf("state %q is not an encoded struct: %#v", name, state)
	}
	for _, field := range *state.Fields {
		if field.Name == name {
			return field.Value
		}
	}
	t.Fatalf("state has no field %q: %#v", name, state)
	return compilercontract.Value{}
}

func methodFloatField(t *testing.T, state compilercontract.Value, name string) float64 {
	t.Helper()
	value := state
	if state.Kind == compilercontract.KindStruct || name != "" {
		value = methodStateField(t, state, name)
	}
	if value.Kind != compilercontract.KindFloat64 || value.Float64Bits == nil {
		t.Fatalf("field %q is not encoded float64: %#v", name, value)
	}
	bits, err := strconv.ParseUint(*value.Float64Bits, 16, 64)
	if err != nil {
		t.Fatalf("parse field %q float bits %q: %v", name, *value.Float64Bits, err)
	}
	return math.Float64frombits(bits)
}
