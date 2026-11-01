package analyze

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func TestLoadSourcesProjectsNestedLocalDependenciesAndTypedChildBridgeRoles(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	entry := "github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild"
	program, diagnostics := LoadSources(root, []string{entry})
	if len(diagnostics) != 0 {
		t.Fatalf("LoadSources diagnostics: %+v", diagnostics)
	}

	functions := make(map[compilercontract.SymbolID]bool)
	for _, pkg := range program.Packages {
		for _, function := range pkg.Functions {
			functions[function.ID] = true
		}
	}
	want := []compilercontract.SymbolID{
		compilercontract.SymbolID(entry + ".Input"),
		compilercontract.SymbolID(entry + ".Publication"),
		"github.com/samuelpmahan/gondola/fixtures/compiled/modulechild.Init",
		"github.com/samuelpmahan/gondola/fixtures/compiled/modulechild.Update",
		"github.com/samuelpmahan/gondola/fixtures/compiled/modulechild.View",
		"github.com/samuelpmahan/gondola/fixtures/compiled/modulechild.Input",
		"github.com/samuelpmahan/gondola/fixtures/compiled/modulechild.Publication",
		"github.com/samuelpmahan/gondola/counter.Init",
		"github.com/samuelpmahan/gondola/counter.Update",
		"github.com/samuelpmahan/gondola/counter.View",
	}
	for _, id := range want {
		if !functions[id] {
			t.Errorf("TypedProgram omits reachable local function %q", id)
		}
	}
}

func TestAnalyzeRejectsUnsafeIntegerOperationInSecondDepthDependency(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	probeDir, err := os.MkdirTemp(root, "analyze-transitive-guard-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(probeDir) })
	for _, dir := range []string{"app", "middle", "leaf"} {
		if err := os.Mkdir(filepath.Join(probeDir, dir), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	module, err := modulePath(root)
	if err != nil {
		t.Fatal(err)
	}
	probeModule := module + "/" + filepath.Base(probeDir)
	sources := map[string]string{
		"leaf/leaf.go": `package leaf
func Advance(value int64) int64 { value++; return value }
`,
		"middle/middle.go": `package middle
import "` + probeModule + `/leaf"
func Advance(value int64) int64 { return leaf.Advance(value) }
`,
		"app/app.go": `package app
import (
	"` + probeModule + `/middle"
	"github.com/samuelpmahan/gondola/gobi"
)
type State struct { Count int64 }
func Init() State { return State{} }
func Update(state State, _ gobi.Message) (State, []gobi.Effect) {
	state.Count = middle.Advance(state.Count)
	return state, nil
}
func View(State) gobi.Node { return gobi.Txt("transitive guard probe") }
`,
	}
	for path, source := range sources {
		if err := os.WriteFile(filepath.Join(probeDir, filepath.FromSlash(path)), []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	entry := probeModule + "/app"
	program, loadDiagnostics := LoadSources(root, []string{entry})
	if len(loadDiagnostics) != 0 {
		t.Fatalf("LoadSources diagnostics: %+v", loadDiagnostics)
	}
	result := Analyze(program, compilercontract.AnalyzeOptions{EntryPackages: []string{entry}})
	for _, diagnostic := range result.Diagnostics {
		if diagnostic.Code == "analyze.numeric-profile" && strings.HasSuffix(diagnostic.Span.File, "/leaf/leaf.go") {
			return
		}
	}
	t.Fatalf("unsafe integer increment in second-depth local dependency was not rejected: %+v", result.Diagnostics)
}
