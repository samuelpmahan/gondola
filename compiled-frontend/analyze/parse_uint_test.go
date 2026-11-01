package analyze

import (
	"path/filepath"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func TestAnalyzeBoundsParseUintIntrinsicToSafeDecimalWidth(t *testing.T) {
	cases := []struct {
		name     string
		base     string
		bitSize  string
		wantSafe bool
	}{
		{name: "safe decimal 53-bit", base: "10", bitSize: "53", wantSafe: true},
		{name: "64-bit result", base: "10", bitSize: "64"},
		{name: "dynamic base", base: "state.Base", bitSize: "53"},
		{name: "dynamic bit size", base: "10", bitSize: "state.Bits"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			root := filepath.Clean(filepath.Join("..", ".."))
			source := `package parseuintprobe

import (
	"strconv"
	"github.com/samuelpmahan/gondola/gobi"
)

type State struct { Value uint64; Base int; Bits int }
func Init() State { return State{Base: 10, Bits: 53} }
func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	value, err := strconv.ParseUint(message.Arg, ` + testCase.base + `, ` + testCase.bitSize + `)
	if err == nil && value > 0 && strconv.FormatUint(value, 10) == message.Arg { state.Value = value }
	return state, nil
}
func View(State) gobi.Node { return gobi.Txt("parse uint probe") }
`
			entry, _, result := loadAndAnalyzeProbe(t, root, source)
			if testCase.wantSafe {
				if len(result.Diagnostics) != 0 || len(result.Apps) != 1 {
					t.Fatalf("safe 53-bit decimal ParseUint was rejected: %+v", result.Diagnostics)
				}
				return
			}
			found := false
			for _, diagnostic := range result.Diagnostics {
				if diagnostic.Code == "analyze.numeric-profile" && diagnostic.Message == "strconv.ParseUint is supported only with constant base 10 and bitSize 53" {
					found = true
				}
			}
			if !found {
				t.Fatalf("unsafe ParseUint call was accepted or rejected for another reason: entry=%s diagnostics=%+v", entry, result.Diagnostics)
			}
		})
	}
}

func TestSafeParseUintIntrinsicRequiresExactCallAndArguments(t *testing.T) {
	operation := compilercontract.Operation{
		Kind:     compilercontract.OpCall,
		SymbolID: "strconv.ParseUint",
		Children: []compilercontract.Operation{
			{}, {}, integerLiteralOperation("10"), integerLiteralOperation("53"),
		},
	}
	if !safeParseUintCall(operation) {
		t.Fatal("constant base 10 and bitSize 53 were not admitted")
	}
	operation.Children[2] = integerLiteralOperation("16")
	if safeParseUintCall(operation) {
		t.Fatal("non-decimal base was admitted")
	}
	operation.Children[2] = integerLiteralOperation("10")
	operation.Children[3] = integerLiteralOperation("64")
	if safeParseUintCall(operation) {
		t.Fatal("64-bit parse result was admitted")
	}
	operation.Children[3] = compilercontract.Operation{Kind: compilercontract.OpIdent, Operator: "bits"}
	if safeParseUintCall(operation) {
		t.Fatal("dynamic bit size was admitted")
	}
	operation.Kind = compilercontract.OpUnsupported
	if safeParseUintCall(operation) {
		t.Fatal("non-call operation was admitted")
	}
}

func integerLiteralOperation(value string) compilercontract.Operation {
	integer := value
	return compilercontract.Operation{
		Kind:    compilercontract.OpLiteral,
		Literal: &compilercontract.Value{Kind: compilercontract.KindInt, Integer: &integer},
	}
}
