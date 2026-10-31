package emit

import (
	"bytes"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/reactmap"
)

func testAppIR() compilercontract.AppIR {
	const (
		packagePath = "example/counter"
		stateID     = compilercontract.TypeID("example/counter.State")
		messageID   = compilercontract.TypeID("example/counter.Message")
		effectID    = compilercontract.TypeID("gobi.Effect")
		effectsID   = compilercontract.TypeID("[]gobi.Effect")
		stringID    = compilercontract.TypeID("string")
		intID       = compilercontract.TypeID("int")
		boolID      = compilercontract.TypeID("bool")
		kindID      = compilercontract.TypeID("gobi.Kind")
		nodeID      = compilercontract.TypeID("gobi.Node")
		attrID      = compilercontract.TypeID("gobi.Attr")
		styleID     = compilercontract.TypeID("gobi.Style")
		onID        = compilercontract.TypeID("gobi.On")
		attrsID     = compilercontract.TypeID("[]gobi.Attr")
		stylesID    = compilercontract.TypeID("[]gobi.Style")
		onsID       = compilercontract.TypeID("[]gobi.On")
		kidsID      = compilercontract.TypeID("[]gobi.Node")
	)
	span := compilercontract.Span{File: "counter.go", StartByte: 0, EndByte: 1}
	return compilercontract.AppIR{
		Schema:      compilercontract.AppIRSchema,
		PackagePath: packagePath,
		Components: []compilercontract.Component{{
			ID: packagePath + ".Counter", PackagePath: packagePath, StateType: stateID, MessageType: messageID,
			Init: "example/counter.Init", Update: "example/counter.Update", View: "example/counter.View",
			Capabilities: []compilercontract.Capability{compilercontract.CapabilityViewNode},
		}},
		Symbols: []compilercontract.Symbol{
			{ID: "example/counter.Init", PackagePath: packagePath, Name: "Init", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{}, Results: []compilercontract.TypeID{stateID}}, Span: span, Calls: []compilercontract.SymbolID{}},
			{ID: "example/counter.Update", PackagePath: packagePath, Name: "Update", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{stateID, messageID}, Results: []compilercontract.TypeID{stateID, effectsID}}, Span: span, Calls: []compilercontract.SymbolID{}},
			{ID: "example/counter.View", PackagePath: packagePath, Name: "View", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{stateID}, Results: []compilercontract.TypeID{nodeID}}, Span: span, Calls: []compilercontract.SymbolID{}},
		},
		Types: []compilercontract.TypeInfo{
			{ID: boolID, Kind: compilercontract.KindBool, JSRepresentation: compilercontract.JSDirect},
			{ID: stringID, Kind: compilercontract.KindString, JSRepresentation: compilercontract.JSDirect},
			{ID: intID, Kind: compilercontract.KindInt, Bits: 64, JSRepresentation: compilercontract.JSNumber},
			{ID: kindID, Kind: compilercontract.KindUint, Bits: 8, JSRepresentation: compilercontract.JSNumber},
			{ID: stateID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Count", Type: intID}}},
			{ID: messageID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Name", Type: stringID}, {Name: "Arg", Type: stringID}}},
			{ID: effectID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Kind", Type: stringID}, {Name: "Name", Type: stringID}, {Name: "Arg", Type: stringID}, {Name: "Reply", Type: stringID}}},
			{ID: effectsID, Kind: compilercontract.KindSlice, ElemType: effectID, JSRepresentation: compilercontract.JSSliceWrapper},
			{ID: styleID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Property", Type: stringID}, {Name: "Value", Type: stringID}}},
			{ID: stylesID, Kind: compilercontract.KindSlice, ElemType: styleID, JSRepresentation: compilercontract.JSArrayOrSlice},
			{ID: attrID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Name", Type: stringID}, {Name: "Value", Type: stringID}, {Name: "Flag", Type: boolID}, {Name: "Style", Type: stylesID}}},
			{ID: attrsID, Kind: compilercontract.KindSlice, ElemType: attrID, JSRepresentation: compilercontract.JSSliceWrapper},
			{ID: onID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Event", Type: stringID}, {Name: "Message", Type: stringID}, {Name: "Arg", Type: stringID}}},
			{ID: onsID, Kind: compilercontract.KindSlice, ElemType: onID, JSRepresentation: compilercontract.JSSliceWrapper},
			{ID: kidsID, Kind: compilercontract.KindSlice, ElemType: nodeID, JSRepresentation: compilercontract.JSArrayOrSlice},
			{ID: nodeID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Kind", Type: kindID}, {Name: "Tag", Type: stringID}, {Name: "Key", Type: stringID}, {Name: "Attrs", Type: attrsID}, {Name: "On", Type: onsID}, {Name: "Kids", Type: kidsID}, {Name: "Text", Type: stringID}}},
		},
	}
}

func testLegacyApp() gobi.App {
	return gobi.App{
		Module: "example",
		Root:   "example/counter",
		Components: []gobi.Component{{
			Package: "example/counter", State: "State", Messages: []string{"add"}, Uses: []string{},
		}},
	}
}

func fileByPath(files []gobi.File, path string) ([]byte, bool) {
	for _, file := range files {
		if file.Path == path {
			return file.Bytes, true
		}
	}
	return nil, false
}

func TestEmitProducesDeterministicReactMapAndVerifiedRoleMetadata(t *testing.T) {
	app := testAppIR()
	first, err := NewBackend().Emit(app)
	if err != nil {
		t.Fatal(err)
	}
	second, err := NewBackend().Emit(app)
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != 2 || len(second) != 2 {
		t.Fatalf("emitted files = %d / %d, want map and component metadata", len(first), len(second))
	}
	mapFile, ok := fileByPath(first, ReactMapFile)
	if !ok || string(mapFile) != reactmap.Generate() {
		t.Fatal("React mapping output does not match the existing Go mapping table")
	}
	components, ok := fileByPath(first, ComponentsFile)
	if !ok {
		t.Fatal("components.gen.mjs missing")
	}
	for _, text := range []string{
		"export const appIR = Object.freeze(",
		"export const componentRoles = Object.freeze(",
		`"init":"example/counter.Init"`,
		`"update":"example/counter.Update"`,
		`"view":"example/counter.View"`,
	} {
		if !strings.Contains(string(components), text) {
			t.Errorf("components.gen.mjs missing %q", text)
		}
	}
	for index := range first {
		if first[index].Path != second[index].Path || !bytes.Equal(first[index].Bytes, second[index].Bytes) {
			t.Fatalf("emission differs at file %d", index)
		}
	}
}

func TestReactAndDOMEmitIdenticalBackendNeutralAppIRArtifacts(t *testing.T) {
	app := testAppIR()
	react, err := NewBackendFor("react")
	if err != nil {
		t.Fatal(err)
	}
	dom, err := NewBackendFor("dom")
	if err != nil {
		t.Fatal(err)
	}
	if react.Name() != "react" || dom.Name() != "dom" {
		t.Fatalf("selected emitter names = %q / %q", react.Name(), dom.Name())
	}
	reactFiles, err := react.Emit(app)
	if err != nil {
		t.Fatal(err)
	}
	domFiles, err := dom.Emit(app)
	if err != nil {
		t.Fatal(err)
	}
	if len(reactFiles) != len(domFiles) {
		t.Fatalf("React/DOM emitted file counts = %d / %d", len(reactFiles), len(domFiles))
	}
	for index := range reactFiles {
		if reactFiles[index].Path != domFiles[index].Path || !bytes.Equal(reactFiles[index].Bytes, domFiles[index].Bytes) {
			t.Fatalf("backend-neutral AppIR output differs at index %d: %q / %q", index, reactFiles[index].Path, domFiles[index].Path)
		}
	}
	if got, ok := fileByPath(domFiles, ReactMapFile); !ok || string(got) != reactmap.Generate() {
		t.Fatal("DOM emission omitted the shared Gobi node mapping")
	}
}

func TestEmitRejectsInvalidAppIRWithoutReturningPartialFiles(t *testing.T) {
	app := testAppIR()
	app.Schema = "unknown"
	files, err := NewBackend().Emit(app)
	if err == nil || len(files) != 0 {
		t.Fatalf("Emit(invalid AppIR) = %d files, %v; want no files and validation error", len(files), err)
	}
}

func TestConfiguredGobiBackendChecksTheCapturedLegacyIdentity(t *testing.T) {
	identity := testLegacyApp()
	backend, err := NewGobiBackend(testAppIR(), identity)
	if err != nil {
		t.Fatal(err)
	}
	if backend.Name() != "react" {
		t.Fatalf("Name() = %q, want react", backend.Name())
	}
	files, err := backend.Emit(identity)
	if err != nil || len(files) != 2 {
		t.Fatalf("Emit(configured identity) = %d files, %v", len(files), err)
	}
	identity.Components[0].State = "OtherState"
	if files, err := backend.Emit(identity); err == nil || len(files) != 0 {
		t.Fatalf("Emit(changed identity) = %d files, %v; want rejected", len(files), err)
	}
}

func TestGobiBackendEmitErrorsForNilReceiverAndUninitializedAdapter(t *testing.T) {
	cases := []struct {
		name    string
		backend *GobiBackend
		wantErr string
	}{
		{name: "nil receiver", backend: nil, wantErr: "nil configured Gobi backend"},
		{name: "zero value", backend: &GobiBackend{}, wantErr: "invalid AppIR for React emission"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			files, err := testCase.backend.Emit(gobi.App{})
			if err == nil || len(files) != 0 {
				t.Fatalf("Emit(zero App) = %d files, %v; want no files and a configuration error", len(files), err)
			}
			if !strings.Contains(err.Error(), testCase.wantErr) {
				t.Fatalf("Emit(zero App) error = %q, want error containing %q", err, testCase.wantErr)
			}
		})
	}
}

func TestConfiguredGobiBackendRejectsIdentityOutsideValidatedAppIR(t *testing.T) {
	identity := testLegacyApp()
	identity.Root = "example/other"
	if _, err := NewGobiBackend(testAppIR(), identity); err == nil {
		t.Fatal("NewGobiBackend accepted a Root unrelated to the validated AppIR")
	}
}

func TestConfiguredDOMGobiBackendKeepsLegacyIdentityGuard(t *testing.T) {
	identity := testLegacyApp()
	backend, err := NewGobiBackendFor("dom", testAppIR(), identity)
	if err != nil {
		t.Fatal(err)
	}
	if backend.Name() != "dom" {
		t.Fatalf("Name() = %q, want dom", backend.Name())
	}
	files, err := backend.Emit(identity)
	if err != nil || len(files) != 2 {
		t.Fatalf("Emit(configured identity) = %d files, %v", len(files), err)
	}
	identity.Components[0].Uses = []string{"other/component"}
	if files, err := backend.Emit(identity); err == nil || len(files) != 0 {
		t.Fatalf("Emit(changed identity) = %d files, %v; want rejected", len(files), err)
	}
}
