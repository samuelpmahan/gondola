package analyze

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadSourcesRejectsMutablePackageGlobalsAndInitFunctions(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	probeDir, err := os.MkdirTemp(root, "analyze-package-state-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(probeDir)
	const source = `package globalprobe

import "github.com/samuelpmahan/gondola/gobi"

var Current int64

type State struct{ Count int64 }

func init() { Current = 1 }
func Init() State { return State{} }
func Update(state State, message gobi.Message) (State, []gobi.Effect) { return state, nil }
func View(State) gobi.Node { return gobi.Txt("global probe") }
`
	if err := os.WriteFile(filepath.Join(probeDir, "probe.go"), []byte(source), 0o600); err != nil {
		t.Fatal(err)
	}
	moduleBytes, err := os.ReadFile(filepath.Join(root, "go.mod"))
	if err != nil {
		t.Fatal(err)
	}
	modulePath := ""
	for _, line := range strings.Split(string(moduleBytes), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[0] == "module" {
			modulePath = strings.Trim(fields[1], "\"`")
			break
		}
	}
	if modulePath == "" {
		t.Fatal("root go.mod has no module path")
	}
	entry := modulePath + "/" + filepath.Base(probeDir)
	_, diagnostics := LoadSources(root, []string{entry})
	found := map[string]bool{}
	for _, diagnostic := range diagnostics {
		found[diagnostic.Code] = true
		if diagnostic.Span.File != filepath.ToSlash(filepath.Join(filepath.Base(probeDir), "probe.go")) || diagnostic.Span.EndByte <= diagnostic.Span.StartByte {
			t.Errorf("package-state diagnostic has no source-relative span: %+v", diagnostic)
		}
	}
	for _, code := range []string{"source.package-global", "source.init-function"} {
		if !found[code] {
			t.Errorf("LoadSources did not reject %s; diagnostics: %+v", code, diagnostics)
		}
	}
}
