package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"reflect"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
	"github.com/samuelpmahan/gondola/gobi"
)

const (
	scenarioSchema = "gobi.compiled-lifecycle-fixture/v1"
	outputSchema   = "gobi.compiled-lifecycle-native/v1"
	packagePath    = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
	componentID    = packagePath
)

type scenario struct {
	Schema          string              `json:"schema"`
	Name            string              `json:"name"`
	PackagePath     string              `json:"packagePath"`
	ComponentID     string              `json:"componentID"`
	Events          []scenarioEvent     `json:"events"`
	ExpectedEffects []effectExpectation `json:"expectedEffects"`
	ExpectedStates  []stateExpectation  `json:"expectedStates"`
	InitialState    lifecycle.State     `json:"-"`
	InitialWire     json.RawMessage     `json:"initialState"`
}

type scenarioEvent struct {
	Kind    string                         `json:"kind"`
	Path    string                         `json:"path,omitempty"`
	Event   string                         `json:"event,omitempty"`
	Value   string                         `json:"value,omitempty"`
	From    string                         `json:"from,omitempty"`
	To      string                         `json:"to,omitempty"`
	Target  string                         `json:"target,omitempty"`
	Token   string                         `json:"token,omitempty"`
	Message *compilercontract.MessageValue `json:"message,omitempty"`
	Expect  string                         `json:"expect,omitempty"`
}

type effectExpectation struct {
	AfterEvent int                            `json:"afterEvent"`
	Effects    []compilercontract.EffectValue `json:"effects"`
}

type stateExpectation struct {
	AfterEvent    int       `json:"afterEvent"`
	NextRequestID uint64    `json:"nextRequestID"`
	Generations   []uint64  `json:"generations"`
	RequestIDs    []uint64  `json:"requestIDs"`
	Alive         []bool    `json:"alive"`
	Requested     []bool    `json:"requested"`
	Pending       []bool    `json:"pending"`
	Tokens        []string  `json:"tokens"`
	Replies       []string  `json:"replies"`
	Counts        []float64 `json:"counts"`
}

type rendererSwap struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Target string `json:"target"`
}

type replayStep struct {
	Index    int                            `json:"index"`
	Kind     string                         `json:"kind"`
	Message  *compilercontract.MessageValue `json:"message"`
	Effects  []compilercontract.EffectValue `json:"effects"`
	State    lifecycle.State                `json:"state"`
	View     compilercontract.NodeRecord    `json:"view"`
	Renderer *rendererSwap                  `json:"rendererSwap"`
	Outcome  string                         `json:"outcome,omitempty"`
}

type replayOutput struct {
	Schema       string          `json:"schema"`
	Name         string          `json:"name"`
	PackagePath  string          `json:"packagePath"`
	ComponentID  string          `json:"componentID"`
	InitialState lifecycle.State `json:"initialState"`
	Steps        []replayStep    `json:"steps"`
}

func main() {
	scriptPath := flag.String("script", "fixtures/compiled/lifecycle/scenario.json", "fixture scenario JSON")
	flag.Parse()
	if err := run(*scriptPath, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(scriptPath string, output io.Writer) error {
	data, err := os.ReadFile(scriptPath)
	if err != nil {
		return fmt.Errorf("read lifecycle scenario: %w", err)
	}
	var script scenario
	if err := json.Unmarshal(data, &script); err != nil {
		return fmt.Errorf("decode lifecycle scenario: %w", err)
	}
	if err := validateScenario(script); err != nil {
		return err
	}
	var initialWire struct {
		NextRequestID uint64 `json:"nextRequestID"`
		Nodes         []struct {
			ID         string  `json:"id"`
			ParentID   string  `json:"parentID"`
			Generation uint64  `json:"generation"`
			RequestID  uint64  `json:"requestID"`
			Alive      bool    `json:"alive"`
			Requested  bool    `json:"requested"`
			Pending    bool    `json:"pending"`
			Token      string  `json:"token"`
			Reply      string  `json:"reply"`
			Count      float64 `json:"count"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(script.InitialWire, &initialWire); err != nil {
		return fmt.Errorf("decode initial lifecycle state: %w", err)
	}
	state := lifecycle.Init()
	if err := matchInitialState(initialWire, state); err != nil {
		return err
	}
	wantStates := make(map[int]stateExpectation, len(script.ExpectedStates))
	for _, expected := range script.ExpectedStates {
		if _, exists := wantStates[expected.AfterEvent]; exists {
			return fmt.Errorf("duplicate expectedStates checkpoint after event %d", expected.AfterEvent)
		}
		wantStates[expected.AfterEvent] = expected
	}
	if expected, ok := wantStates[-1]; !ok || !matchesStateExpectation(state, expected) {
		return errors.New("initial state does not match expectedStates checkpoint -1")
	}
	result := replayOutput{
		Schema: outputSchema, Name: script.Name, PackagePath: script.PackagePath,
		ComponentID: script.ComponentID, InitialState: state, Steps: []replayStep{},
	}
	wantEffects := make(map[int][]compilercontract.EffectValue, len(script.ExpectedEffects))
	for _, expected := range script.ExpectedEffects {
		if _, exists := wantEffects[expected.AfterEvent]; exists {
			return fmt.Errorf("duplicate expectedEffects entry after event %d", expected.AfterEvent)
		}
		wantEffects[expected.AfterEvent] = expected.Effects
	}
	for index, event := range script.Events {
		message, effects, swap, outcome, err := applyEvent(&state, event)
		if err != nil {
			return fmt.Errorf("event %d: %w", index, err)
		}
		want, hasExpected := wantEffects[index]
		if !hasExpected {
			want = []compilercontract.EffectValue{}
		}
		if !sameEffects(effects, want) {
			return fmt.Errorf("event %d effects = %#v, want %#v", index, effects, want)
		}
		if expected, ok := wantStates[index]; ok && !matchesStateExpectation(state, expected) {
			return fmt.Errorf("event %d state does not match expectedStates checkpoint", index)
		}
		result.Steps = append(result.Steps, replayStep{
			Index: index, Kind: event.Kind, Message: message, Effects: effects,
			State: state, View: compilercontract.NodeRecordFromGobi(lifecycle.View(state)),
			Renderer: swap, Outcome: outcome,
		})
	}
	if len(wantEffects) != 8 {
		return fmt.Errorf("fixture must provide seven exact request and one removal effect expectations, got %d entries", len(wantEffects))
	}
	if len(wantStates) != 13 {
		return fmt.Errorf("fixture must provide 13 expected state checkpoints, got %d", len(wantStates))
	}
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("encode native lifecycle result: %w", err)
	}
	return nil
}

func validateScenario(script scenario) error {
	if script.Schema != scenarioSchema || script.Name == "" || script.PackagePath != packagePath || script.ComponentID != componentID {
		return fmt.Errorf("lifecycle scenario identity is invalid")
	}
	if len(script.Events) != 26 {
		return fmt.Errorf("lifecycle scenario has %d events; want 26", len(script.Events))
	}
	if len(script.ExpectedEffects) != 8 || script.ExpectedEffects[4].AfterEvent != 9 || script.ExpectedEffects[4].Effects == nil {
		return fmt.Errorf("lifecycle scenario must specify seven requests and the exact event-9 child-first cancellation slice")
	}
	if len(script.ExpectedStates) != 13 || script.ExpectedStates[0].AfterEvent != -1 {
		return fmt.Errorf("lifecycle scenario must specify 13 ordered initial/state checkpoints")
	}
	return nil
}

func matchesStateExpectation(state lifecycle.State, want stateExpectation) bool {
	nodes := []lifecycle.NodeState{state.Parent, state.Child, state.Grandchild, state.Sibling}
	if want.NextRequestID != state.NextRequestID || len(want.Generations) != len(nodes) || len(want.RequestIDs) != len(nodes) ||
		len(want.Alive) != len(nodes) || len(want.Requested) != len(nodes) || len(want.Pending) != len(nodes) ||
		len(want.Tokens) != len(nodes) || len(want.Replies) != len(nodes) || len(want.Counts) != len(nodes) {
		return false
	}
	for index, node := range nodes {
		if want.Generations[index] != node.Generation || want.RequestIDs[index] != node.RequestID || want.Alive[index] != node.Alive ||
			want.Requested[index] != node.Requested || want.Pending[index] != node.Pending || want.Tokens[index] != node.Token ||
			want.Replies[index] != node.Reply || want.Counts[index] != node.Counter.Count {
			return false
		}
	}
	return true
}

func matchInitialState(want struct {
	NextRequestID uint64 `json:"nextRequestID"`
	Nodes         []struct {
		ID         string  `json:"id"`
		ParentID   string  `json:"parentID"`
		Generation uint64  `json:"generation"`
		RequestID  uint64  `json:"requestID"`
		Alive      bool    `json:"alive"`
		Requested  bool    `json:"requested"`
		Pending    bool    `json:"pending"`
		Token      string  `json:"token"`
		Reply      string  `json:"reply"`
		Count      float64 `json:"count"`
	} `json:"nodes"`
}, got lifecycle.State) error {
	if want.NextRequestID != got.NextRequestID || len(want.Nodes) != 4 {
		return errors.New("initial state does not match Init(): request ID or node count differs")
	}
	nodes := []lifecycle.NodeState{got.Parent, got.Child, got.Grandchild, got.Sibling}
	for index, node := range nodes {
		expected := want.Nodes[index]
		if expected.ID != node.ID || expected.ParentID != node.ParentID || expected.Generation != node.Generation ||
			expected.RequestID != node.RequestID || expected.Alive != node.Alive || expected.Requested != node.Requested ||
			expected.Pending != node.Pending || expected.Token != node.Token || expected.Reply != node.Reply || expected.Count != node.Counter.Count {
			return fmt.Errorf("initial node %d does not match Init(): got %#v", index, node)
		}
	}
	return nil
}

func applyEvent(state *lifecycle.State, event scenarioEvent) (*compilercontract.MessageValue, []compilercontract.EffectValue, *rendererSwap, string, error) {
	var message gobi.Message
	var hasMessage bool
	switch event.Kind {
	case "click":
		resolved, err := resolveClick(lifecycle.View(*state), event.Path, event.Event)
		if err != nil {
			return nil, nil, nil, "", err
		}
		if event.Message == nil || *event.Message != (compilercontract.MessageValue{Name: resolved.Name, Arg: resolved.Arg}) {
			return nil, nil, nil, "", fmt.Errorf("view at %q resolves to %q/%q, script expects %#v", event.Path, resolved.Name, resolved.Arg, event.Message)
		}
		message = resolved
		hasMessage = true
	case "go-message", "effect-reply":
		if event.Message == nil {
			return nil, nil, nil, "", errors.New("message event is missing its Go Message")
		}
		if event.Kind == "effect-reply" && (event.Token == "" || event.Token != event.Message.Arg) {
			return nil, nil, nil, "", errors.New("effect-reply token must equal Message.Arg")
		}
		message = gobi.Message{Name: event.Message.Name, Arg: event.Message.Arg}
		hasMessage = true
	case "renderer-swap":
		if event.From != "dom" || event.To != "react" || event.Target != "root" {
			return nil, nil, nil, "", errors.New("renderer-swap must be root dom→react")
		}
		return nil, []compilercontract.EffectValue{}, &rendererSwap{From: event.From, To: event.To, Target: event.Target}, "state-preserved", nil
	default:
		return nil, nil, nil, "", fmt.Errorf("unsupported event kind %q", event.Kind)
	}
	if !hasMessage {
		return nil, nil, nil, "", errors.New("event did not resolve to a Go Message")
	}
	before := *state
	wasPending := event.Kind == "effect-reply" && pendingToken(before, event.Token)
	next, gobiEffects := lifecycle.Update(*state, message)
	*state = next
	effects := make([]compilercontract.EffectValue, len(gobiEffects))
	for index, effect := range gobiEffects {
		effects[index] = compilercontract.EffectFromGobi(effect)
	}
	outcome := ""
	if event.Kind == "effect-reply" {
		if wasPending && event.Expect != "accepted" {
			return nil, nil, nil, "", fmt.Errorf("effect-reply %q matched pending state but scenario expects %q", event.Token, event.Expect)
		}
		if !wasPending && event.Expect == "accepted" {
			return nil, nil, nil, "", fmt.Errorf("effect-reply %q did not match live pending state", event.Token)
		}
		if wasPending {
			outcome = "go-accepted"
		} else {
			outcome = "go-no-op"
		}
	} else if event.Kind == "go-message" && event.Expect != "" {
		if !reflect.DeepEqual(before, *state) || event.Expect != "stale-no-op" && event.Expect != "duplicate-no-op" {
			return nil, nil, nil, "", fmt.Errorf("direct message %q violated expected no-op %q", message.Arg, event.Expect)
		}
		outcome = event.Expect
	}
	messageRecord := compilercontract.MessageFromGobi(message)
	return &messageRecord, effects, nil, outcome, nil
}

func pendingToken(state lifecycle.State, token string) bool {
	return token != "" &&
		(state.Parent.Alive && state.Parent.Pending && state.Parent.Token == token ||
			state.Child.Alive && state.Child.Pending && state.Child.Token == token ||
			state.Grandchild.Alive && state.Grandchild.Pending && state.Grandchild.Token == token ||
			state.Sibling.Alive && state.Sibling.Pending && state.Sibling.Token == token)
}

func resolveClick(view gobi.Node, path, event string) (gobi.Message, error) {
	if event != "click" {
		return gobi.Message{}, fmt.Errorf("unsupported event %q", event)
	}
	node, ok, err := nodeAtPath(view, path)
	if err != nil || !ok {
		if err == nil {
			err = fmt.Errorf("no node at path %q", path)
		}
		return gobi.Message{}, err
	}
	for _, attr := range node.Attrs {
		if attr.Name == "disabled" && attr.Flag {
			return gobi.Message{}, fmt.Errorf("click path %q targets a disabled node", path)
		}
	}
	for _, handler := range node.On {
		if handler.Event == event {
			return gobi.Message{Name: handler.Message, Arg: handler.Arg}, nil
		}
	}
	return gobi.Message{}, fmt.Errorf("no %s handler at path %q", event, path)
}

func nodeAtPath(root gobi.Node, path string) (gobi.Node, bool, error) {
	if path == "" {
		return root, true, nil
	}
	current := root
	for _, part := range strings.Split(path, "/") {
		index, err := strconv.Atoi(part)
		if err != nil || index < 0 {
			return gobi.Node{}, false, fmt.Errorf("invalid path segment %q", part)
		}
		if index >= len(current.Kids) {
			return gobi.Node{}, false, nil
		}
		current = current.Kids[index]
	}
	return current, true, nil
}

func sameEffects(got, want []compilercontract.EffectValue) bool {
	return reflect.DeepEqual(got, want)
}
