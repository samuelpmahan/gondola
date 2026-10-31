package analyze

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func writeAnalyzerProbe(t *testing.T, root, source string) string {
	t.Helper()
	dir, err := os.MkdirTemp(root, "analyze-method-probe-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	if err := os.WriteFile(filepath.Join(dir, "app.go"), []byte(source), 0o600); err != nil {
		t.Fatal(err)
	}
	module, err := modulePath(root)
	if err != nil {
		t.Fatal(err)
	}
	return module + "/" + filepath.Base(dir)
}

func loadAndAnalyzeProbe(t *testing.T, root, source string) (string, compilercontract.TypedProgram, compilercontract.AnalysisResult) {
	t.Helper()
	entry := writeAnalyzerProbe(t, root, source)
	program, loadDiagnostics := LoadSources(root, []string{entry})
	if len(loadDiagnostics) != 0 {
		t.Fatalf("LoadSources diagnostics: %+v", loadDiagnostics)
	}
	result := Analyze(program, compilercontract.AnalyzeOptions{EntryPackages: []string{entry}})
	return entry, program, result
}

func symbolByID(t *testing.T, app compilercontract.AppIR, id compilercontract.SymbolID) compilercontract.Symbol {
	t.Helper()
	for _, symbol := range app.Symbols {
		if symbol.ID == id {
			return symbol
		}
	}
	t.Fatalf("AppIR omits symbol %q; symbols=%+v", id, app.Symbols)
	return compilercontract.Symbol{}
}

func hasCall(calls []compilercontract.SymbolID, want compilercontract.SymbolID) bool {
	for _, call := range calls {
		if call == want {
			return true
		}
	}
	return false
}

func TestLoadAndAnalyzeStaticallyLowersValueReceiverMethods(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	const source = `package methodprobe

import "github.com/samuelpmahan/gondola/gobi"

type Left struct { Value float64 }
type Right struct { Value float64 }
type State struct { Left Left; Right Right }

func Init() State { return State{} }
func Update(state State, _ gobi.Message) (State, []gobi.Effect) { return state.AddBoth(), nil }
func View(State) gobi.Node { return gobi.Txt("method probe") }

func (state State) AddBoth() State {
	state.Left = state.Left.Add()
	state.Right = state.Right.Add()
	return state
}
func (left Left) Add() Left { left.Value++; return left }
func (right Right) Add() Right { right.Value += 2; return right }
`
	entry, _, result := loadAndAnalyzeProbe(t, root, source)
	if len(result.Diagnostics) != 0 {
		t.Fatalf("Analyze diagnostics: %+v", result.Diagnostics)
	}
	if len(result.Apps) != 1 {
		t.Fatalf("Analyze produced %d apps, want one", len(result.Apps))
	}
	app := result.Apps[0]
	stateMethod := compilercontract.SymbolID(entry + ".State.AddBoth")
	leftMethod := compilercontract.SymbolID(entry + ".Left.Add")
	rightMethod := compilercontract.SymbolID(entry + ".Right.Add")
	stateType := compilercontract.TypeID(entry + ".State")
	update := symbolByID(t, app, compilercontract.SymbolID(entry+".Update"))
	state := symbolByID(t, app, stateMethod)
	left := symbolByID(t, app, leftMethod)
	right := symbolByID(t, app, rightMethod)

	if !hasCall(update.Calls, stateMethod) {
		t.Fatalf("Update calls = %v, want %q", update.Calls, stateMethod)
	}
	if !hasCall(state.Calls, leftMethod) || !hasCall(state.Calls, rightMethod) {
		t.Fatalf("AddBoth calls = %v, want both receiver-specific Add IDs", state.Calls)
	}
	if left.ID == right.ID || left.PackagePath != entry || right.PackagePath != entry {
		t.Fatalf("same-named methods collided or lost package ownership: left=%+v right=%+v", left, right)
	}
	for _, method := range []compilercontract.Symbol{state, left, right} {
		if len(method.Signature.Params) == 0 {
			t.Fatalf("method %q lacks receiver-first formal: %+v", method.ID, method.Signature)
		}
	}
	if state.Signature.Params[0] != stateType || left.Signature.Params[0] != compilercontract.TypeID(entry+".Left") || right.Signature.Params[0] != compilercontract.TypeID(entry+".Right") {
		t.Fatalf("receiver-first parameters are wrong: state=%v left=%v right=%v", state.Signature.Params, left.Signature.Params, right.Signature.Params)
	}
}

func TestReachableValueReceiverMethodBodyUsesNumericGuards(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	const source = `package methodnumeric

import "github.com/samuelpmahan/gondola/gobi"

type Counter struct { Count int64 }
type State struct { Counter Counter }

func Init() State { return State{} }
func Update(state State, _ gobi.Message) (State, []gobi.Effect) { return state.Advance(), nil }
func View(State) gobi.Node { return gobi.Txt("numeric method probe") }
func (state State) Advance() State { state.Counter.Count++; return state }
`
	_, _, result := loadAndAnalyzeProbe(t, root, source)
	if !hasDiagnostic(result.Diagnostics, "analyze.numeric-profile", "/app.go") {
		t.Fatalf("unguarded integer operation in reachable receiver method was not diagnosed: %+v", result.Diagnostics)
	}
}

func TestReachableValueReceiverMethodInLocalDependencyUsesNumericGuards(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	dir, err := os.MkdirTemp(root, "analyze-method-dependency-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	depDir := filepath.Join(dir, "counter")
	if err := os.Mkdir(depDir, 0o700); err != nil {
		t.Fatal(err)
	}
	depSource := `package counter
type State struct { Count int64 }
func Init() State { return State{} }
func (state State) Advance() State { state.Count++; return state }
`
	if err := os.WriteFile(filepath.Join(depDir, "counter.go"), []byte(depSource), 0o600); err != nil {
		t.Fatal(err)
	}
	module, err := modulePath(root)
	if err != nil {
		t.Fatal(err)
	}
	entry := module + "/" + filepath.Base(dir) + "/app"
	appDir := filepath.Join(dir, "app")
	if err := os.Mkdir(appDir, 0o700); err != nil {
		t.Fatal(err)
	}
	appSource := `package app
import (
	"` + module + `/` + filepath.Base(dir) + `/counter"
	"github.com/samuelpmahan/gondola/gobi"
)
type State struct { Counter counter.State }
func Init() State { return State{Counter: counter.Init()} }
func Update(state State, _ gobi.Message) (State, []gobi.Effect) { state.Counter = state.Counter.Advance(); return state, nil }
func View(State) gobi.Node { return gobi.Txt("dependency method probe") }
`
	if err := os.WriteFile(filepath.Join(appDir, "app.go"), []byte(appSource), 0o600); err != nil {
		t.Fatal(err)
	}
	program, loadDiagnostics := LoadSources(root, []string{entry})
	if len(loadDiagnostics) != 0 {
		t.Fatalf("LoadSources diagnostics: %+v", loadDiagnostics)
	}
	result := Analyze(program, compilercontract.AnalyzeOptions{EntryPackages: []string{entry}})
	if !hasDiagnostic(result.Diagnostics, "analyze.numeric-profile", "counter.go") {
		t.Fatalf("unguarded integer operation in reachable dependency method was not diagnosed: %+v", result.Diagnostics)
	}
}

func TestReachableLocalDependencyFunctionsJoinMethodCallGraph(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	const source = `package methoddependency

import (
	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/gobi"
)

type State struct { Parent counter.State }

func Init() State { return State{}.Initialize() }
func Update(state State, message gobi.Message) (State, []gobi.Effect) { return state.Add(message) }
func View(State) gobi.Node { return gobi.Txt("dependency probe") }
func (state State) Initialize() State { state.Parent = counter.Init(); return state }
func (state State) Add(message gobi.Message) (State, []gobi.Effect) {
	parent, effects := counter.Update(state.Parent, message)
	state.Parent = parent
	return state, effects
}
`
	entry, _, result := loadAndAnalyzeProbe(t, root, source)
	if len(result.Diagnostics) != 0 {
		t.Fatalf("Analyze diagnostics: %+v", result.Diagnostics)
	}
	app := result.Apps[0]
	initMethod := compilercontract.SymbolID(entry + ".State.Initialize")
	addMethod := compilercontract.SymbolID(entry + ".State.Add")
	counterInit := compilercontract.SymbolID("github.com/samuelpmahan/gondola/counter.Init")
	counterUpdate := compilercontract.SymbolID("github.com/samuelpmahan/gondola/counter.Update")
	init := symbolByID(t, app, initMethod)
	add := symbolByID(t, app, addMethod)
	_ = symbolByID(t, app, counterInit)
	_ = symbolByID(t, app, counterUpdate)
	if !hasCall(init.Calls, counterInit) {
		t.Fatalf("Initialize calls = %v, want counter.Init", init.Calls)
	}
	if !hasCall(add.Calls, counterUpdate) {
		t.Fatalf("Add calls = %v, want counter.Update", add.Calls)
	}
}

func TestUnsupportedMethodDispatchFormsFailClosed(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	const source = `package methodboundary

import "github.com/samuelpmahan/gondola/gobi"

type Counter struct { Count float64 }
func (counter Counter) Bump() Counter { counter.Count++; return counter }
func (counter *Counter) PointerBump() *Counter { counter.Count++; return counter }
type Bumper interface { Bump() Counter }
type Embedded struct { Counter }
type Box[T any] struct { Value T }
func (box Box[T]) Unbox() T { return box.Value }
type State struct { Counter Counter; Embedded Embedded }

func Init() State { return State{} }
func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	switch message.Name {
	case "pointer":
		state.Counter.PointerBump()
	case "interface":
		var target Bumper = state.Counter
		target.Bump()
	case "method-value":
		bump := state.Counter.Bump
		state.Counter = bump()
	case "method-expression":
		state.Counter = Counter.Bump(state.Counter)
	case "promoted":
		state.Embedded.Bump()
	case "generic":
		box := Box[int]{Value: 1}
		_ = box.Unbox()
	}
	return state, nil
}
func View(State) gobi.Node { return gobi.Txt("method boundary probe") }
`
	_, _, result := loadAndAnalyzeProbe(t, root, source)
	want := []string{
		"pointer method receiver",
		"interface method dispatch",
		"method value",
		"method expression",
		"promoted method selection",
		"generic or non-concrete method receiver",
	}
	for _, fragment := range want {
		found := false
		for _, diagnostic := range result.Diagnostics {
			if strings.Contains(diagnostic.Message, fragment) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("unsupported method form %q was not explicitly rejected: %+v", fragment, result.Diagnostics)
		}
	}
}

func hasDiagnostic(diagnostics []compilercontract.Diagnostic, code, fileSuffix string) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Code == code && strings.HasSuffix(diagnostic.Span.File, fileSuffix) {
			return true
		}
	}
	return false
}
