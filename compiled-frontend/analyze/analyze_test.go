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
