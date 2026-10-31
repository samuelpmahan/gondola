package analyze

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func TestTrustedGobiBuilderSelectionShapes(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	const prelude = `package methodselection
import "github.com/samuelpmahan/gondola/gobi"
type State struct { Count float64 }
type Setter interface { Set(string, string) gobi.Node }
type embeddedNode struct { gobi.Node }
func Init() State { return State{} }
func View(State) gobi.Node { return gobi.Txt("method selection probe") }
`
	cases := []struct {
		name        string
		body        string
		wantReason  string
		wantTargets []compilercontract.SymbolID
	}{
		{
			name:       "method-expression",
			body:       `_ = gobi.Node.Set(gobi.El("div"), "class", "expression")`,
			wantReason: "method expression",
		},
		{
			name:       "promoted-method",
			body:       `wrapper := embeddedNode{gobi.El("div")}; _ = wrapper.Set("class", "promoted")`,
			wantReason: "promoted method selection",
		},
		{
			name:       "pointer-receiver-selection",
			body:       `node := gobi.El("div"); pointer := &node; _ = pointer.Set("class", "pointer")`,
			wantReason: "pointer method receiver",
		},
		{
			name:       "interface-dispatch",
			body:       `var target Setter = gobi.El("div"); _ = target.Set("class", "interface")`,
			wantReason: "interface method dispatch",
		},
		{
			name:        "direct-builder-chain",
			body:        `_ = gobi.El("div").Set("class", "direct").Flag("disabled")`,
			wantTargets: []compilercontract.SymbolID{"github.com/samuelpmahan/gondola/gobi.Set", "github.com/samuelpmahan/gondola/gobi.Flag"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			source := prelude + "\nfunc Update(state State, _ gobi.Message) (State, []gobi.Effect) {\n" + tc.body + "\nreturn state, nil\n}\n"
			_, program, result := loadAndAnalyzeProbe(t, root, source)
			if tc.wantReason != "" {
				for _, diagnostic := range result.Diagnostics {
					if diagnostic.Code == "analyze.unsupported-operation" && strings.Contains(diagnostic.Message, tc.wantReason) {
						return
					}
				}
				if len(result.Diagnostics) == 0 && len(result.Apps) == 1 {
					t.Errorf("unsupported selection was admitted as a valid app; wanted %q diagnostic", tc.wantReason)
				} else {
					t.Errorf("unsupported selection lacks bounded %q diagnostic: %+v", tc.wantReason, result.Diagnostics)
				}
				return
			}
			if len(result.Diagnostics) != 0 || len(result.Apps) != 1 {
				t.Fatalf("ordinary direct builder chain must remain accepted: apps=%d diagnostics=%+v", len(result.Apps), result.Diagnostics)
			}
			entry := program.Packages[0].ImportPath
			updateID := compilercontract.SymbolID(entry + ".Update")
			var update *compilercontract.TypedFunction
			for i := range program.Packages[0].Functions {
				if program.Packages[0].Functions[i].ID == updateID {
					update = &program.Packages[0].Functions[i]
					break
				}
			}
			if update == nil {
				t.Fatal("projected direct Update operation is missing")
			}
			for _, target := range tc.wantTargets {
				found := false
				walkOperations(update.Body, func(operation compilercontract.Operation) {
					if operation.Kind == compilercontract.OpCall && operation.SymbolID == target {
						found = true
					}
				})
				if !found {
					t.Errorf("ordinary builder chain lacks OpCall target %q", target)
				}
			}
		})
	}
}
