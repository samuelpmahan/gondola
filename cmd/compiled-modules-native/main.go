// Command compiled-modules-native runs the canonical parent/child source
// scenario directly through the Go fixtures and records deterministic pair
// checkpoints. It performs no browser or JavaScript state transitions.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulechild"
	"github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	"github.com/samuelpmahan/gondola/gobi"
)

const (
	scenarioSchema = "gobi.compiled-modules-scenario/v1"
	outputSchema   = "gobi.compiled-modules-native/v1"
	scenarioPath   = "fixtures/compiled/moduleparent/scenario.json"
)

type scenario struct {
	Schema string          `json:"schema"`
	Name   string          `json:"name"`
	Events []scenarioEvent `json:"events"`
}

type scenarioEvent struct {
	Kind        string                         `json:"kind"`
	Target      string                         `json:"target,omitempty"`
	Action      *compilercontract.Action       `json:"action,omitempty"`
	Message     *compilercontract.MessageValue `json:"message,omitempty"`
	From        string                         `json:"from,omitempty"`
	To          string                         `json:"to,omitempty"`
	Expect      string                         `json:"expect,omitempty"`
	SourceEvent *int                           `json:"sourceEvent,omitempty"`
}

type eventRecord struct {
	EventIndex  int                            `json:"eventIndex"`
	Kind        string                         `json:"kind"`
	Target      string                         `json:"target,omitempty"`
	Action      *compilercontract.Action       `json:"action,omitempty"`
	Message     *compilercontract.MessageValue `json:"message"`
	Disabled    *bool                          `json:"disabled,omitempty"`
	From        string                         `json:"from,omitempty"`
	To          string                         `json:"to,omitempty"`
	Expect      string                         `json:"expect,omitempty"`
	SourceEvent *int                           `json:"sourceEvent,omitempty"`
	StepIndex   *int                           `json:"stepIndex"`
}

type bridgeRecord struct {
	Call        string                  `json:"call"`
	Input       *modulewire.Input       `json:"input"`
	Publication *modulewire.Publication `json:"publication"`
}

type pairCheckpoint struct {
	EventIndex  int                            `json:"eventIndex"`
	Kind        string                         `json:"kind"`
	Target      string                         `json:"target"`
	Message     compilercontract.MessageValue  `json:"message"`
	Effects     []compilercontract.EffectValue `json:"effects"`
	Bridges     []bridgeRecord                 `json:"bridges"`
	ParentState moduleparent.State             `json:"parentState"`
	ChildState  modulechild.State              `json:"childState"`
	ParentView  compilercontract.NodeRecord    `json:"parentView"`
	ChildView   compilercontract.NodeRecord    `json:"childView"`
}

type initialCheckpoint struct {
	ParentState moduleparent.State          `json:"parentState"`
	ChildState  modulechild.State           `json:"childState"`
	ParentView  compilercontract.NodeRecord `json:"parentView"`
	ChildView   compilercontract.NodeRecord `json:"childView"`
	Bridges     []bridgeRecord              `json:"bridges"`
}

type replayOutput struct {
	Schema  string            `json:"schema"`
	Name    string            `json:"name"`
	Events  []eventRecord     `json:"events"`
	Initial initialCheckpoint `json:"initial"`
	Steps   []pairCheckpoint  `json:"steps"`
}

func main() {
	script := flag.String("script", scenarioPath, "parent/child source scenario JSON")
	flag.Parse()
	if err := run(*script, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(scriptPath string, output io.Writer) error {
	data, err := os.ReadFile(scriptPath)
	if err != nil {
		return fmt.Errorf("read compiled-modules scenario: %w", err)
	}
	var script scenario
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&script); err != nil {
		return fmt.Errorf("decode compiled-modules scenario: %w", err)
	}
	if err := requireJSONEOF(decoder); err != nil {
		return fmt.Errorf("decode compiled-modules scenario: %w", err)
	}
	if err := validateScenario(script); err != nil {
		return err
	}
	result, err := replay(script)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(output)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("encode compiled-modules trace: %w", err)
	}
	return nil
}

func replay(script scenario) (replayOutput, error) {
	parentState := moduleparent.Init()
	childState := modulechild.Init()
	initialBridges := []bridgeRecord{{Call: "parent.Init", Input: nil, Publication: nil}, {Call: "child.Init", Input: nil, Publication: nil}}
	initialInput := moduleparent.Output(parentState)
	initialBridges = append(initialBridges, bridgeRecord{Call: "parent.Output", Input: inputPointer(initialInput), Publication: nil})
	childState = modulechild.Input(childState, initialInput)
	initialBridges = append(initialBridges, bridgeRecord{Call: "child.Input", Input: inputPointer(initialInput), Publication: nil})
	initialPublication := modulechild.Publication(childState)
	initialBridges = append(initialBridges, bridgeRecord{Call: "child.Publication", Input: nil, Publication: publicationPointer(initialPublication)})
	parentState = moduleparent.Receive(parentState, initialPublication)
	initialBridges = append(initialBridges, bridgeRecord{Call: "parent.Receive", Input: nil, Publication: publicationPointer(initialPublication)})

	result := replayOutput{
		Schema: outputSchema,
		Name:   script.Name,
		Events: make([]eventRecord, 0, len(script.Events)),
		Initial: initialCheckpoint{
			ParentState: parentState, ChildState: childState,
			ParentView: compilercontract.NodeRecordFromGobi(moduleparent.View(parentState)),
			ChildView:  compilercontract.NodeRecordFromGobi(modulechild.View(childState)),
			Bridges:    initialBridges,
		},
		Steps: make([]pairCheckpoint, 0, len(script.Events)),
	}
	currentRenderer := "dom"
	for index, event := range script.Events {
		entry := eventRecord{
			EventIndex: index, Kind: event.Kind, Target: event.Target, Action: copyAction(event.Action),
			Message: nil, From: event.From, To: event.To, Expect: event.Expect,
			SourceEvent: intPointerCopy(event.SourceEvent), StepIndex: nil,
		}
		message, dispatch, disabled, err := resolveEvent(parentState, childState, script.Events, index, event, currentRenderer)
		if err != nil {
			return replayOutput{}, fmt.Errorf("event %d: %w", index, err)
		}
		entry.Disabled = disabled
		if event.Kind == "renderer-swap" && event.Expect == "accepted" {
			currentRenderer = event.To
		}
		if dispatch {
			entry.Message = messagePointer(message)
			checkpoint, err := dispatchMessage(index, event.Kind, event.Target, message, &parentState, &childState)
			if err != nil {
				return replayOutput{}, fmt.Errorf("event %d: %w", index, err)
			}
			checkpoint.ParentView = compilercontract.NodeRecordFromGobi(moduleparent.View(parentState))
			checkpoint.ChildView = compilercontract.NodeRecordFromGobi(modulechild.View(childState))
			checkpoint.EventIndex = index
			checkpoint.ParentState = parentState
			checkpoint.ChildState = childState
			checkpoint.Kind = event.Kind
			checkpoint.Target = event.Target
			checkpoint.Message = message
			stepIndex := len(result.Steps)
			entry.StepIndex = &stepIndex
			result.Steps = append(result.Steps, checkpoint)
		}
		result.Events = append(result.Events, entry)
	}
	return result, nil
}

func dispatchMessage(index int, kind, target string, message compilercontract.MessageValue, parentState *moduleparent.State, childState *modulechild.State) (pairCheckpoint, error) {
	checkpoint := pairCheckpoint{Effects: []compilercontract.EffectValue{}, Bridges: []bridgeRecord{}}
	goMessage := gobi.Message{Name: message.Name, Arg: message.Arg}
	if target == "parent" {
		updated, effects := moduleparent.Update(*parentState, goMessage)
		if len(effects) != 0 {
			return pairCheckpoint{}, errors.New("parent emitted an effect in the finite effect-free ABI")
		}
		*parentState = updated
		input := moduleparent.Output(*parentState)
		*childState = modulechild.Input(*childState, input)
		checkpoint.Bridges = append(checkpoint.Bridges,
			bridgeRecord{Call: "parent.Update", Input: nil, Publication: nil},
			bridgeRecord{Call: "parent.Output", Input: inputPointer(input), Publication: nil},
			bridgeRecord{Call: "child.Input", Input: inputPointer(input), Publication: nil},
		)
		return checkpoint, nil
	}
	if target != "child" {
		return pairCheckpoint{}, fmt.Errorf("unsupported event target %q", target)
	}
	updated, effects := modulechild.Update(*childState, goMessage)
	if len(effects) != 0 {
		return pairCheckpoint{}, errors.New("child emitted an effect in the finite effect-free ABI")
	}
	*childState = updated
	publication := modulechild.Publication(*childState)
	*parentState = moduleparent.Receive(*parentState, publication)
	checkpoint.Bridges = append(checkpoint.Bridges,
		bridgeRecord{Call: "child.Update", Input: nil, Publication: nil},
		bridgeRecord{Call: "child.Publication", Input: nil, Publication: publicationPointer(publication)},
		bridgeRecord{Call: "parent.Receive", Input: nil, Publication: publicationPointer(publication)},
	)
	return checkpoint, nil
}

func resolveEvent(parentState moduleparent.State, childState modulechild.State, events []scenarioEvent, index int, event scenarioEvent, currentRenderer string) (compilercontract.MessageValue, bool, *bool, error) {
	switch event.Kind {
	case "click", "disabled-action":
		if event.Target != "parent" && event.Target != "child" {
			return compilercontract.MessageValue{}, false, nil, fmt.Errorf("action target %q must be parent or child", event.Target)
		}
		if event.Action == nil || event.Action.Path == "" || event.Action.Event == "" {
			return compilercontract.MessageValue{}, false, nil, errors.New("action requires path, event, and value")
		}
		view := viewFor(event.Target, parentState, childState)
		node, err := nodeAtPath(view, event.Action.Path)
		if err != nil {
			return compilercontract.MessageValue{}, false, nil, err
		}
		message, found := handlerMessage(node, event.Action.Event)
		if !found {
			return compilercontract.MessageValue{}, false, nil, fmt.Errorf("path %q has no %q handler", event.Action.Path, event.Action.Event)
		}
		disabled := nodeDisabled(node)
		if event.Kind == "disabled-action" {
			if !disabled {
				return compilercontract.MessageValue{}, false, boolPointer(false), fmt.Errorf("disabled-action path %q is enabled", event.Action.Path)
			}
			return compilercontract.MessageValue{}, false, boolPointer(true), nil
		}
		if disabled {
			return compilercontract.MessageValue{}, false, boolPointer(true), nil
		}
		return message, true, boolPointer(false), nil
	case "go-message":
		if (event.Target != "parent" && event.Target != "child") || event.Message == nil || event.Message.Name == "" {
			return compilercontract.MessageValue{}, false, nil, errors.New("go-message requires target=parent|child and a named message")
		}
		return *event.Message, true, nil, nil
	case "renderer-swap":
		if event.From != currentRenderer || event.To == "" || event.To == event.From ||
			(event.To != "dom" && event.To != "react") || (event.Expect != "accepted" && event.Expect != "rejected") {
			return compilercontract.MessageValue{}, false, nil, fmt.Errorf("renderer-swap from=%q to=%q expect=%q is invalid for current renderer %q", event.From, event.To, event.Expect, currentRenderer)
		}
		return compilercontract.MessageValue{}, false, nil, nil
	case "stale-callback":
		if event.SourceEvent == nil || *event.SourceEvent < 0 || *event.SourceEvent >= index {
			return compilercontract.MessageValue{}, false, nil, errors.New("stale-callback requires an earlier sourceEvent")
		}
		source := events[*event.SourceEvent]
		if source.Kind != "click" || source.Action == nil || (source.Target != "parent" && source.Target != "child") {
			return compilercontract.MessageValue{}, false, nil, errors.New("stale-callback sourceEvent must reference an earlier click")
		}
		return compilercontract.MessageValue{}, false, nil, nil
	default:
		return compilercontract.MessageValue{}, false, nil, fmt.Errorf("unsupported scenario event kind %q", event.Kind)
	}
}

func validateScenario(script scenario) error {
	if script.Schema != scenarioSchema {
		return fmt.Errorf("scenario schema = %q, want %q", script.Schema, scenarioSchema)
	}
	if script.Name == "" {
		return errors.New("scenario name is empty")
	}
	if script.Events == nil {
		return errors.New("scenario events must be an array")
	}
	return nil
}

func viewFor(target string, parentState moduleparent.State, childState modulechild.State) gobi.Node {
	if target == "parent" {
		return moduleparent.View(parentState)
	}
	return modulechild.View(childState)
}

func nodeAtPath(root gobi.Node, path string) (gobi.Node, error) {
	if path == "" {
		return root, nil
	}
	node := root
	for _, part := range strings.Split(path, "/") {
		index, err := strconv.Atoi(part)
		if err != nil || index < 0 || index >= len(node.Kids) {
			return gobi.Node{}, fmt.Errorf("path %q does not resolve in the current view", path)
		}
		node = node.Kids[index]
	}
	return node, nil
}

func handlerMessage(node gobi.Node, event string) (compilercontract.MessageValue, bool) {
	var found compilercontract.MessageValue
	count := 0
	for _, handler := range node.On {
		if handler.Event == event {
			found = compilercontract.MessageValue{Name: handler.Message, Arg: handler.Arg}
			count++
		}
	}
	return found, count == 1
}

func nodeDisabled(node gobi.Node) bool {
	for _, attr := range node.Attrs {
		if attr.Name == "disabled" && attr.Flag {
			return true
		}
	}
	return false
}

func inputPointer(value modulewire.Input) *modulewire.Input { return &value }

func publicationPointer(value modulewire.Publication) *modulewire.Publication { return &value }

func messagePointer(value compilercontract.MessageValue) *compilercontract.MessageValue {
	return &value
}

func boolPointer(value bool) *bool { return &value }

func copyAction(value *compilercontract.Action) *compilercontract.Action {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func intPointerCopy(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func requireJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return errors.New("scenario contains more than one JSON value")
		}
		return err
	}
	return nil
}
