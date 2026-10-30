package analyze

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

// TestLoadSourcesAndAnalyzeRejectsUnsafeIntegerSource keeps the numeric
// security probes at the real AST/go-types boundary. The snippets are
// intentionally source-level so they exercise guard projection, branch
// selection, and mutation handling rather than only a hand-built Operation.
func TestLoadSourcesAndAnalyzeRejectsUnsafeIntegerSource(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	probeDir, err := os.MkdirTemp(root, "analyze-numeric-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(probeDir)

	const source = `package numericprobe

import "github.com/samuelpmahan/gondola/gobi"

const maxSafeConstant = 9007199254740991
const unsafeNumberConstant = 9007199254740992

type State struct {
	Mutated int64
	Add int64
	Subtract int64
	SwitchOr int64
	Inclusive int64
	Product int64
	Loop int64
	Eight int8
	ThirtyTwo int32
	SafeEight int8
	SafeThirtyTwo int32
	Safe64 int64
	Else int64
	Negative int64
	TupleX int64
	TupleY int64
	Converted uint64
	ConstValue int64
	SafeConst int64
}

func Init() State { return State{} }

func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	switch message.Name {
	case "mutated":
		if state.Mutated < 9007199254740991 {
			state.Mutated = 9007199254740991
			state.Mutated++
		}
	case "compound-add":
		if state.Add < 9007199254740991 {
			state.Add += 9007199254740991
		}
	case "compound-subtract":
		if state.Subtract > 0 {
			state.Subtract -= 9007199254740991
		}
	case "switch-or":
		switch {
		case state.SwitchOr < 9007199254740991, true:
			state.SwitchOr++
		}
	case "inclusive":
		if state.Inclusive <= 9007199254740991 {
			state.Inclusive++
		}
	case "else":
		if state.Else < 9007199254740991 {
		} else {
			state.Else++
		}
	case "negative":
		if state.Negative < 9007199254740991 {
			state.Negative--
		}
	case "tuple":
		if state.TupleY < 9007199254740991 {
			state.TupleX, state.TupleY = 0, 9007199254740991
			state.TupleY++
		}
	case "shadow":
		shadow := int64(0)
		if shadow < 9007199254740991 {
			{
				shadow := int64(9007199254740991)
				shadow++
			}
		}
	case "conversion":
		state.Converted = uint64(state.Negative)
	case "constant":
		state.ConstValue = unsafeNumberConstant
	case "safe-constant":
		if state.SafeConst < maxSafeConstant {
			state.SafeConst++
		}
	case "product":
		if state.Product < 9007199254740991 {
			state.Product = state.Product * state.Product
		}
	case "loop":
		for index := int64(9007199254740991); index <= 9007199254740991; index++ {
			state.Loop = index
		}
	case "small-bounds":
		if state.Eight <= 127 {
			state.Eight++
		}
		if state.ThirtyTwo <= 2147483647 {
			state.ThirtyTwo++
		}
		if state.SafeEight < 127 {
			state.SafeEight++
		}
		if state.SafeThirtyTwo < 2147483647 {
			state.SafeThirtyTwo++
		}
		if state.Safe64 < 9007199254740991 {
			state.Safe64++
		}
	}
	return state, nil
}

func View(State) gobi.Node { return gobi.Txt("numeric probe") }
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
	program, loadDiagnostics := LoadSources(root, []string{entry})
	if len(loadDiagnostics) != 0 {
		t.Fatalf("LoadSources diagnostics: %+v", loadDiagnostics)
	}
	result := Analyze(program, compilercontract.AnalyzeOptions{EntryPackages: []string{entry}})
	if len(result.Diagnostics) == 0 {
		t.Fatal("Analyze accepted every adversarial integer source probe")
	}
	expectedSourcePath := filepath.ToSlash(filepath.Join(filepath.Base(probeDir), "probe.go"))
	for _, diagnostic := range result.Diagnostics {
		if diagnostic.Code == "analyze.numeric-profile" && (diagnostic.Span.File != expectedSourcePath || diagnostic.Span.EndByte <= diagnostic.Span.StartByte) {
			t.Errorf("numeric diagnostic does not retain a source-relative non-empty span: %+v; want file %q", diagnostic, expectedSourcePath)
		}
	}

	unsafeLines := []string{
		"state.Mutated++",
		"state.Add += 9007199254740991",
		"state.Subtract -= 9007199254740991",
		"state.SwitchOr++",
		"state.Inclusive++",
		"state.Else++",
		"state.Negative--",
		"state.TupleY++",
		"shadow++",
		"state.Converted = uint64(state.Negative)",
		"state.ConstValue = unsafeNumberConstant",
		"state.Product = state.Product * state.Product",
		"for index := int64(9007199254740991); index <= 9007199254740991; index++ {",
		"state.Eight++",
		"state.ThirtyTwo++",
	}
	for _, expression := range unsafeLines {
		lineStart, lineEnd, ok := sourceLineBounds(source, expression)
		if !ok {
			t.Fatalf("probe expression %q not found in source", expression)
		}
		found := false
		for _, diagnostic := range result.Diagnostics {
			if diagnostic.Code == "analyze.numeric-profile" && diagnostic.Span.StartByte >= lineStart && diagnostic.Span.StartByte < lineEnd {
				found = true
				break
			}
		}
		if !found {
			line := strings.TrimSpace(source[lineStart:lineEnd])
			t.Errorf("unsafe source line was accepted without a numeric-profile diagnostic: %s", line)
		}
	}

	for _, expression := range []string{
		"if state.Safe64 < 9007199254740991 {",
		"state.Safe64++",
		"if state.SafeEight < 127 {",
		"state.SafeEight++",
		"if state.SafeThirtyTwo < 2147483647 {",
		"state.SafeThirtyTwo++",
		"if state.SafeConst < maxSafeConstant {",
		"state.SafeConst++",
	} {
		lineStart, lineEnd, ok := sourceLineBounds(source, expression)
		if !ok {
			t.Fatalf("safe control %q not found in source", expression)
		}
		for _, diagnostic := range result.Diagnostics {
			if diagnostic.Code == "analyze.numeric-profile" && diagnostic.Span.StartByte >= lineStart && diagnostic.Span.StartByte < lineEnd {
				t.Errorf("safe bounded source line was rejected: %s (%s)", strings.TrimSpace(source[lineStart:lineEnd]), diagnostic.Message)
			}
		}
	}
}

func sourceLineBounds(source, needle string) (int, int, bool) {
	position := strings.Index(source, needle)
	if position < 0 {
		return 0, 0, false
	}
	start := strings.LastIndex(source[:position], "\n") + 1
	end := strings.Index(source[position:], "\n")
	if end < 0 {
		end = len(source)
	} else {
		end += position
	}
	return start, end, true
}
