package analyze

import (
	"path/filepath"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func TestLoadAndAnalyzeCompiledFixtures(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	entries := []string{
		"github.com/samuelpmahan/gondola/counter",
		"github.com/samuelpmahan/gondola/fixtures/compiled/form",
		"github.com/samuelpmahan/gondola/fixtures/compiled/list",
		"github.com/samuelpmahan/gondola/fixtures/compiled/effect",
		"github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle",
	}
	program, diagnostics := LoadSources(root, entries)
	if len(diagnostics) != 0 {
		t.Fatalf("LoadSources diagnostics: %+v", diagnostics)
	}
	if len(program.Packages) != len(entries) {
		t.Fatalf("LoadSources returned %d packages, want %d", len(program.Packages), len(entries))
	}
	result := Analyze(program, compilercontract.AnalyzeOptions{EntryPackages: entries})
	if len(result.Diagnostics) != 0 {
		t.Fatalf("Analyze diagnostics: %+v", result.Diagnostics)
	}
	if len(result.Apps) != len(entries) {
		t.Fatalf("Analyze returned %d apps, want %d", len(result.Apps), len(entries))
	}
	capabilityPresent := func(app compilercontract.AppIR, capability compilercontract.Capability) bool {
		for _, declared := range app.Components[0].Capabilities {
			if declared == capability {
				return true
			}
		}
		return false
	}
	for _, app := range result.Apps {
		switch app.PackagePath {
		case "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle":
			if !capabilityPresent(app, compilercontract.CapabilityEffectCancel) {
				t.Error("reachable lifecycle fixture cancel descriptor did not declare effect.cancel")
			}
		case "github.com/samuelpmahan/gondola/fixtures/compiled/effect":
			if capabilityPresent(app, compilercontract.CapabilityEffectCancel) {
				t.Error("legacy request-only fixture unexpectedly declared effect.cancel")
			}
		case "github.com/samuelpmahan/gondola/counter":
			if capabilityPresent(app, compilercontract.CapabilityEffectCancel) {
				t.Error("legacy counter unexpectedly declared effect.cancel")
			}
		}
	}
}

func TestAnalyzeIncludesOnlyCompleteTypedModuleBridgePairsAndTheirTypeClosure(t *testing.T) {
	for _, side := range []string{"parent", "child"} {
		t.Run(side, func(t *testing.T) {
			program, entry := moduleBridgeProbeProgram(side)
			result := Analyze(program, compilercontract.AnalyzeOptions{EntryPackages: []string{entry}})
			if len(result.Diagnostics) != 0 || len(result.Apps) != 1 {
				t.Fatalf("Analyze diagnostics: apps=%d diagnostics=%+v", len(result.Apps), result.Diagnostics)
			}
			app := result.Apps[0]
			want := []string{"Init", "Update", "View"}
			if side == "parent" {
				want = append(want, "Output", "Receive")
			} else {
				want = append(want, "Input", "Publication")
			}
			got := make(map[string]bool, len(app.Symbols))
			for _, symbol := range app.Symbols {
				got[symbol.Name] = true
			}
			for _, name := range want {
				if !got[name] {
					t.Errorf("AppIR omits %s module/app role: symbols=%+v", name, app.Symbols)
				}
			}
			for _, id := range []compilercontract.TypeID{
				"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire.Input",
				"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire.Publication",
			} {
				found := false
				for _, info := range app.Types {
					if info.ID == id {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("AppIR type closure omits imported wire type %q: types=%+v", id, app.Types)
				}
			}
		})
	}
}

func TestAnalyzeRejectsPartialOrWrongModuleBridgeRoleSet(t *testing.T) {
	for name, configure := range map[string]func(*compilercontract.TypedPackage){
		"partial parent": func(pkg *compilercontract.TypedPackage) {
			pkg.Functions = append(pkg.Functions, moduleBridgeFunction(pkg.ImportPath, "Output", []compilercontract.TypeID{"probe.State"}, []compilercontract.TypeID{"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire.Input"}))
		},
		"wrong parent port": func(pkg *compilercontract.TypedPackage) {
			pkg.Functions = append(pkg.Functions,
				moduleBridgeFunction(pkg.ImportPath, "Output", []compilercontract.TypeID{"probe.State"}, []compilercontract.TypeID{"float64"}),
				moduleBridgeFunction(pkg.ImportPath, "Receive", []compilercontract.TypeID{"probe.State", "github.com/samuelpmahan/gondola/fixtures/compiled/modulewire.Publication"}, []compilercontract.TypeID{"probe.State"}),
			)
		},
	} {
		t.Run(name, func(t *testing.T) {
			program, entry := moduleBridgeProbeProgram("legacy")
			pkg := &program.Packages[0]
			configure(pkg)
			result := Analyze(program, compilercontract.AnalyzeOptions{EntryPackages: []string{entry}})
			if len(result.Diagnostics) == 0 {
				t.Fatal("invalid module bridge role set was accepted")
			}
		})
	}
	t.Run("mixed parent and child roles", func(t *testing.T) {
		program, entry := moduleBridgeProbeProgram("parent")
		program.Packages[0].Functions = append(program.Packages[0].Functions,
			moduleBridgeFunction(entry, "Input", []compilercontract.TypeID{"probe.State", "github.com/samuelpmahan/gondola/fixtures/compiled/modulewire.Input"}, []compilercontract.TypeID{"probe.State"}),
			moduleBridgeFunction(entry, "Publication", []compilercontract.TypeID{"probe.State"}, []compilercontract.TypeID{"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire.Publication"}),
		)
		result := Analyze(program, compilercontract.AnalyzeOptions{EntryPackages: []string{entry}})
		if len(result.Diagnostics) == 0 {
			t.Fatal("mixed parent and child module bridge roles were accepted")
		}
	})
	t.Run("wrong wire field order", func(t *testing.T) {
		program, entry := moduleBridgeProbeProgram("parent")
		wirePackage := "github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
		for packageIndex := range program.Packages {
			if program.Packages[packageIndex].ImportPath != wirePackage {
				continue
			}
			for typeIndex := range program.Packages[packageIndex].Types {
				if program.Packages[packageIndex].Types[typeIndex].ID == compilercontract.TypeID(wirePackage+".Input") {
					fields := program.Packages[packageIndex].Types[typeIndex].Fields
					fields[0], fields[1] = fields[1], fields[0]
					program.Packages[packageIndex].Types[typeIndex].Fields = fields
				}
			}
		}
		result := Analyze(program, compilercontract.AnalyzeOptions{EntryPackages: []string{entry}})
		if len(result.Diagnostics) == 0 {
			t.Fatal("wire type with a different field order was accepted")
		}
	})
}

func moduleBridgeProbeProgram(side string) (compilercontract.TypedProgram, string) {
	const entry = "probe"
	const gobiPackage = "github.com/samuelpmahan/gondola/gobi"
	const wirePackage = "github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	state := compilercontract.TypeID(entry + ".State")
	message := compilercontract.TypeID(gobiPackage + ".Message")
	node := compilercontract.TypeID(gobiPackage + ".Node")
	effect := compilercontract.TypeID(gobiPackage + ".Effect")
	effects := compilercontract.TypeID("[]" + string(effect))
	input := compilercontract.TypeID(wirePackage + ".Input")
	publication := compilercontract.TypeID(wirePackage + ".Publication")
	stringType := compilercontract.TypeInfo{ID: "string", Kind: compilercontract.KindString, JSRepresentation: compilercontract.JSDirect}
	intType := compilercontract.TypeInfo{ID: "int", Kind: compilercontract.KindInt, Bits: 64, JSRepresentation: compilercontract.JSNumber}
	boolType := compilercontract.TypeInfo{ID: "bool", Kind: compilercontract.KindBool, JSRepresentation: compilercontract.JSDirect}
	floatType := compilercontract.TypeInfo{ID: "float64", Kind: compilercontract.KindFloat64, JSRepresentation: compilercontract.JSNumber}
	appTypes := []compilercontract.TypeInfo{
		stringType,
		intType,
		boolType,
		floatType,
		{ID: state, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Count", Type: "float64"}}},
		{ID: message, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Name", Type: "string"}, {Name: "Arg", Type: "string"}}},
		{ID: node, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Tag", Type: "string"}}},
		{ID: effect, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Kind", Type: "string"}, {Name: "Name", Type: "string"}, {Name: "Arg", Type: "string"}, {Name: "Reply", Type: "string"}}},
		{ID: effects, Kind: compilercontract.KindSlice, ElemType: effect, JSRepresentation: compilercontract.JSArrayOrSlice},
	}
	gobiTypes := []compilercontract.TypeInfo{
		{ID: message, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Name", Type: "string"}, {Name: "Arg", Type: "string"}}},
		{ID: node, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Tag", Type: "string"}}},
		{ID: effect, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Kind", Type: "string"}, {Name: "Name", Type: "string"}, {Name: "Arg", Type: "string"}, {Name: "Reply", Type: "string"}}},
		{ID: effects, Kind: compilercontract.KindSlice, ElemType: effect, JSRepresentation: compilercontract.JSArrayOrSlice},
	}
	wireTypes := []compilercontract.TypeInfo{
		intType, boolType, floatType,
		{ID: input, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Step", Type: "int"}, {Name: "Locked", Type: "bool"}, {Name: "Revision", Type: "int"}}},
		{ID: publication, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Count", Type: "float64"}, {Name: "Revision", Type: "int"}}},
	}
	functions := []compilercontract.TypedFunction{
		moduleBridgeFunction(entry, "Init", nil, []compilercontract.TypeID{state}),
		moduleBridgeFunction(entry, "Update", []compilercontract.TypeID{state, message}, []compilercontract.TypeID{state, effects}),
		moduleBridgeFunction(entry, "View", []compilercontract.TypeID{state}, []compilercontract.TypeID{node}),
	}
	if side == "parent" {
		functions = append(functions,
			moduleBridgeFunction(entry, "Output", []compilercontract.TypeID{state}, []compilercontract.TypeID{input}),
			moduleBridgeFunction(entry, "Receive", []compilercontract.TypeID{state, publication}, []compilercontract.TypeID{state}),
		)
	} else if side == "child" {
		functions = append(functions,
			moduleBridgeFunction(entry, "Input", []compilercontract.TypeID{state, input}, []compilercontract.TypeID{state}),
			moduleBridgeFunction(entry, "Publication", []compilercontract.TypeID{state}, []compilercontract.TypeID{publication}),
		)
	}
	appPackage := compilercontract.TypedPackage{ImportPath: entry, Types: appTypes, Functions: functions}
	program := compilercontract.TypedProgram{Packages: []compilercontract.TypedPackage{
		appPackage,
		{ImportPath: gobiPackage, Types: gobiTypes},
		{ImportPath: wirePackage, Types: wireTypes},
	}}
	return program, entry
}

func moduleBridgeFunction(packagePath, name string, params, results []compilercontract.TypeID) compilercontract.TypedFunction {
	return compilercontract.TypedFunction{
		ID: compilercontract.SymbolID(packagePath + "." + name), PackagePath: packagePath, Name: name,
		Signature: compilercontract.Signature{Params: append([]compilercontract.TypeID{}, params...), Results: append([]compilercontract.TypeID{}, results...)},
		Span:      compilercontract.Span{File: "probe.go", StartByte: 0, EndByte: 1}, Body: []compilercontract.Operation{},
	}
}

func TestEffectCancelCapabilityRequiresReachableTypedDescriptor(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	const prelude = `package effectcancelprobe
import "github.com/samuelpmahan/gondola/gobi"
type State struct{ Count float64 }
func Init() State { return State{} }
func View(State) gobi.Node { return gobi.Node{} }
`
	t.Run("transitive helper and unrelated decoy", func(t *testing.T) {
		source := prelude + `
func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	return state, cancelEffects(message.Arg)
}
func cancelEffects(token string) []gobi.Effect { return []gobi.Effect{cancelEffect(token)} }
func cancelEffect(token string) gobi.Effect {
	return gobi.Effect{Kind: "lifecycle.cancel", Name: "cancel", Arg: token, Reply: ""}
}
func unrelatedText() string { return "lifecycle.cancel" }
`
		_, _, result := loadAndAnalyzeProbe(t, root, source)
		if len(result.Diagnostics) != 0 || len(result.Apps) != 1 {
			t.Fatalf("Analyze diagnostics: apps=%d diagnostics=%+v", len(result.Apps), result.Diagnostics)
		}
		if !hasCapability(result.Apps[0], compilercontract.CapabilityEffectCancel) {
			t.Fatal("transitively reachable typed cancel descriptor did not declare effect.cancel")
		}
	})

	t.Run("unrelated and mismatched strings", func(t *testing.T) {
		source := prelude + `
func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	_ = "lifecycle.cancel"
	return state, []gobi.Effect{{Kind: "lifecycle.cancel", Name: "lookup", Arg: message.Arg, Reply: ""}}
}
`
		_, _, result := loadAndAnalyzeProbe(t, root, source)
		if len(result.Diagnostics) != 0 || len(result.Apps) != 1 {
			t.Fatalf("Analyze diagnostics: apps=%d diagnostics=%+v", len(result.Apps), result.Diagnostics)
		}
		if hasCapability(result.Apps[0], compilercontract.CapabilityEffectCancel) {
			t.Fatal("unrelated text or mismatched effect descriptor declared effect.cancel")
		}
	})

	t.Run("unreachable descriptor", func(t *testing.T) {
		source := prelude + `
func Update(state State, _ gobi.Message) (State, []gobi.Effect) { return state, nil }
func unusedCancel(token string) gobi.Effect {
	return gobi.Effect{Kind: "lifecycle.cancel", Name: "cancel", Arg: token, Reply: ""}
}
`
		_, _, result := loadAndAnalyzeProbe(t, root, source)
		if len(result.Diagnostics) != 0 || len(result.Apps) != 1 {
			t.Fatalf("Analyze diagnostics: apps=%d diagnostics=%+v", len(result.Apps), result.Diagnostics)
		}
		if hasCapability(result.Apps[0], compilercontract.CapabilityEffectCancel) {
			t.Fatal("unreachable cancel descriptor declared effect.cancel")
		}
	})

	t.Run("computed descriptor field fails closed", func(t *testing.T) {
		source := prelude + `
func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	kind := "lifecycle.cancel"
	return state, []gobi.Effect{{Kind: kind, Name: "cancel", Arg: message.Arg, Reply: ""}}
}
`
		_, _, result := loadAndAnalyzeProbe(t, root, source)
		if len(result.Diagnostics) != 0 || len(result.Apps) != 1 {
			t.Fatalf("Analyze diagnostics: apps=%d diagnostics=%+v", len(result.Apps), result.Diagnostics)
		}
		if hasCapability(result.Apps[0], compilercontract.CapabilityEffectCancel) {
			t.Fatal("computed lifecycle kind incorrectly declared effect.cancel")
		}
	})

	for _, tc := range []struct {
		name string
		arg  string
	}{
		{name: "direct empty Arg", arg: `""`},
		{name: "parenthesized empty Arg", arg: `("")`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			source := prelude + `
func Update(state State, _ gobi.Message) (State, []gobi.Effect) {
	return state, []gobi.Effect{{Kind: "lifecycle.cancel", Name: "cancel", Arg: ` + tc.arg + `, Reply: ""}}
}
`
			_, _, result := loadAndAnalyzeProbe(t, root, source)
			if len(result.Diagnostics) != 0 || len(result.Apps) != 1 {
				t.Fatalf("Analyze diagnostics: apps=%d diagnostics=%+v", len(result.Apps), result.Diagnostics)
			}
			if !hasCapability(result.Apps[0], compilercontract.CapabilityEffectCancel) {
				t.Fatal("empty string Arg did not consistently declare effect.cancel")
			}
		})
	}
}

func TestEffectCancelCapabilityUsesGoZeroValueForOmittedReply(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	const prelude = `package effectcancelzerovalueprobe
import "github.com/samuelpmahan/gondola/gobi"
type State struct{ Count float64 }
func Init() State { return State{} }
func View(State) gobi.Node { return gobi.Node{} }
`
	cases := []struct {
		name       string
		replyField string
		want       bool
	}{
		{name: "omitted reply is Go zero value", want: true},
		{name: "explicit empty reply", replyField: `, Reply: ""`, want: true},
		{name: "nonempty literal reply", replyField: `, Reply: "complete"`, want: false},
		{name: "computed reply", replyField: `, Reply: message.Arg`, want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			source := prelude + `
func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	return state, []gobi.Effect{{Kind: "lifecycle.cancel", Name: "cancel", Arg: message.Arg` + tc.replyField + `}}
}
`
			_, _, result := loadAndAnalyzeProbe(t, root, source)
			if len(result.Diagnostics) != 0 || len(result.Apps) != 1 {
				t.Fatalf("Analyze diagnostics: apps=%d diagnostics=%+v", len(result.Apps), result.Diagnostics)
			}
			if got := hasCapability(result.Apps[0], compilercontract.CapabilityEffectCancel); got != tc.want {
				t.Fatalf("effect.cancel capability = %v, want %v", got, tc.want)
			}
		})
	}

	t.Run("wrong effect type", func(t *testing.T) {
		source := prelude + `
type OtherEffect struct { Kind, Name, Arg, Reply string }
func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	_ = OtherEffect{Kind: "lifecycle.cancel", Name: "cancel", Arg: message.Arg}
	return state, nil
}
`
		_, _, result := loadAndAnalyzeProbe(t, root, source)
		if len(result.Diagnostics) != 0 || len(result.Apps) != 1 {
			t.Fatalf("Analyze diagnostics: apps=%d diagnostics=%+v", len(result.Apps), result.Diagnostics)
		}
		if hasCapability(result.Apps[0], compilercontract.CapabilityEffectCancel) {
			t.Fatal("wrong effect type declared effect.cancel")
		}
	})
}

func hasCapability(app compilercontract.AppIR, capability compilercontract.Capability) bool {
	for _, component := range app.Components {
		for _, declared := range component.Capabilities {
			if declared == capability {
				return true
			}
		}
	}
	return false
}

func TestValidateOperationsRejectsUnknownCallAndUnsupportedNode(t *testing.T) {
	span := compilercontract.Span{File: "app.go", StartByte: 10, EndByte: 14}
	program := compilercontract.TypedProgram{Packages: []compilercontract.TypedPackage{{
		ImportPath: "example.test/app",
		Functions: []compilercontract.TypedFunction{{
			ID: "example.test/app.Init", Name: "Init", PackagePath: "example.test/app",
			Body: []compilercontract.Operation{{Kind: compilercontract.OpCall, Span: span, SymbolID: "example.test/unknown.Run", Children: []compilercontract.Operation{}},
				{Kind: compilercontract.OpUnsupported, Span: span, Operator: "go statement", Children: []compilercontract.Operation{}}},
		}},
	}}}
	diagnostics := ValidateOperations(program, []compilercontract.SymbolID{"example.test/app.Init"})
	if len(diagnostics) != 2 {
		t.Fatalf("ValidateOperations diagnostics = %+v, want unsupported call and node", diagnostics)
	}
	if diagnostics[0].Span.File != span.File || diagnostics[1].Span.StartByte != span.StartByte {
		t.Fatalf("diagnostics lost source spans: %+v", diagnostics)
	}
}

func TestValidateOperationsRequiresSafeIntegerBounds(t *testing.T) {
	span := compilercontract.Span{File: "app.go", StartByte: 20, EndByte: 24}
	variable := compilercontract.Operation{Kind: compilercontract.OpIdent, TypeID: "int", Operator: "Count", Span: span, Children: []compilercontract.Operation{}}
	maximum := compilercontract.Operation{Kind: compilercontract.OpLiteral, TypeID: "int", Span: span, Literal: &compilercontract.Value{TypeID: "int", Kind: compilercontract.KindInt, Integer: stringPointer(maxSafeInteger)}, Children: []compilercontract.Operation{}}
	condition := compilercontract.Operation{Kind: compilercontract.OpBinary, TypeID: "bool", Operator: "<", Span: span, Children: []compilercontract.Operation{variable, maximum}}
	increment := compilercontract.Operation{Kind: compilercontract.OpIncDec, Operator: "++", Span: span, Children: []compilercontract.Operation{variable}}
	function := compilercontract.TypedFunction{ID: "example.test/app.Update", PackagePath: "example.test/app", Name: "Update", Body: []compilercontract.Operation{{Kind: compilercontract.OpIf, Operator: "noInit", Span: span, Children: []compilercontract.Operation{condition, {Kind: compilercontract.OpBlock, Span: span, Children: []compilercontract.Operation{increment}}}}}}
	program := compilercontract.TypedProgram{Packages: []compilercontract.TypedPackage{{
		ImportPath: "example.test/app",
		Types:      []compilercontract.TypeInfo{{ID: "bool", Kind: compilercontract.KindBool}, {ID: "int", Kind: compilercontract.KindInt, Bits: 64}},
		Functions:  []compilercontract.TypedFunction{function},
	}}}
	if diagnostics := ValidateOperations(program, []compilercontract.SymbolID{function.ID}); len(diagnostics) != 0 {
		t.Fatalf("bounded safe increment rejected: %+v", diagnostics)
	}
	program.Packages[0].Functions[0].Body = []compilercontract.Operation{increment}
	diagnostics := ValidateOperations(program, []compilercontract.SymbolID{function.ID})
	if len(diagnostics) != 1 || diagnostics[0].Code != "analyze.numeric-profile" || diagnostics[0].Span != span {
		t.Fatalf("unbounded integer increment was not source-located: %+v", diagnostics)
	}
}

func stringPointer(value string) *string { return &value }
