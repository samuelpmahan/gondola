package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/fixtures/compiled/publications"
	"github.com/samuelpmahan/gondola/gobi"
)

const (
	scenarioSchema = "gobi.compiled-publications-scenario/v1"
	outputSchema   = "gobi.compiled-publications-native/v1"
	packagePath    = "github.com/samuelpmahan/gondola/fixtures/compiled/publications"
	componentID    = packagePath
)

type scenario struct {
	Schema      string          `json:"schema"`
	Name        string          `json:"name"`
	PackagePath string          `json:"packagePath"`
	ComponentID string          `json:"componentID"`
	Events      []scenarioEvent `json:"events"`
}

type scenarioEvent struct {
	Kind        string                         `json:"kind"`
	Action      *compilercontract.Action       `json:"action,omitempty"`
	Path        string                         `json:"path,omitempty"`
	Event       string                         `json:"event,omitempty"`
	Value       string                         `json:"value,omitempty"`
	Message     *compilercontract.MessageValue `json:"message,omitempty"`
	Token       string                         `json:"token,omitempty"`
	From        string                         `json:"from,omitempty"`
	To          string                         `json:"to,omitempty"`
	Target      string                         `json:"target,omitempty"`
	Expect      string                         `json:"expect,omitempty"`
	SourceEvent *int                           `json:"sourceEvent,omitempty"`
}

type replayEvent struct {
	Index       int                            `json:"index"`
	Kind        string                         `json:"kind"`
	Action      *compilercontract.Action       `json:"action,omitempty"`
	Path        string                         `json:"path,omitempty"`
	Event       string                         `json:"event,omitempty"`
	Value       *string                        `json:"value,omitempty"`
	Message     *compilercontract.MessageValue `json:"message"`
	Token       string                         `json:"token,omitempty"`
	From        string                         `json:"from,omitempty"`
	To          string                         `json:"to,omitempty"`
	Target      string                         `json:"target,omitempty"`
	Expect      string                         `json:"expect,omitempty"`
	SourceEvent *int                           `json:"sourceEvent,omitempty"`
	StepIndex   *int                           `json:"stepIndex,omitempty"`
}

type replayStep struct {
	EventIndex int                            `json:"eventIndex"`
	Kind       string                         `json:"kind"`
	Message    compilercontract.MessageValue  `json:"message"`
	Effects    []compilercontract.EffectValue `json:"effects"`
	State      publications.State             `json:"state"`
	View       compilercontract.NodeRecord    `json:"view"`
}

type replayOutput struct {
	Schema       string                      `json:"schema"`
	Name         string                      `json:"name"`
	PackagePath  string                      `json:"packagePath"`
	ComponentID  string                      `json:"componentID"`
	InitialState publications.State          `json:"initialState"`
	InitialView  compilercontract.NodeRecord `json:"initialView"`
	Events       []replayEvent               `json:"events"`
	Steps        []replayStep                `json:"steps"`
}

func main() {
	scriptPath := flag.String("script", "fixtures/compiled/publications/scenario.json", "fixture scenario JSON")
	flag.Parse()
	if err := run(*scriptPath, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(scriptPath string, output io.Writer) error {
	data, err := os.ReadFile(scriptPath)
	if err != nil {
		return fmt.Errorf("read compiled-publications scenario: %w", err)
	}
	var script scenario
	if err := json.Unmarshal(data, &script); err != nil {
		return fmt.Errorf("decode compiled-publications scenario: %w", err)
	}
	if err := validateScenario(script); err != nil {
		return err
	}
	state := publications.Init()
	result := replayOutput{
		Schema: outputSchema, Name: script.Name, PackagePath: script.PackagePath, ComponentID: script.ComponentID,
		InitialState: snapshotState(state), InitialView: compilercontract.NodeRecordFromGobi(publications.View(state)),
		Events: make([]replayEvent, 0, len(script.Events)), Steps: make([]replayStep, 0, len(script.Events)),
	}
	stepIndex := 0
	pendingTokens := make([]string, 0)
	for index, event := range script.Events {
		resolved, hasMessage, err := resolveEvent(state, script.Events, index, event)
		if err != nil {
			return fmt.Errorf("event %d: %w", index, err)
		}
		entry := replayEvent{
			Index: index, Kind: event.Kind, Path: event.Path, Event: event.Event,
			Token: event.Token, From: event.From, To: event.To, Target: event.Target, Expect: event.Expect,
		}
		if event.Action != nil {
			action := *event.Action
			entry.Action = &action
			value := event.Value
			entry.Value = &value
		} else if event.Value != "" {
			value := event.Value
			entry.Value = &value
		}
		if event.SourceEvent != nil {
			source := *event.SourceEvent
			entry.SourceEvent = &source
		}
		if hasMessage {
			message := resolved
			entry.Message = &message
			if event.Kind == "effect-reply" {
				var ok bool
				pendingTokens, ok = consumeToken(pendingTokens, event.Token)
				if !ok {
					return fmt.Errorf("event %d effect-reply token %q is not pending", index, event.Token)
				}
			}
			var effects []gobi.Effect
			state, effects = publications.Update(state, gobi.Message{Name: message.Name, Arg: message.Arg})
			pendingTokens, err = applyEffects(pendingTokens, effects)
			if err != nil {
				return fmt.Errorf("event %d host effects: %w", index, err)
			}
			effectValues := make([]compilercontract.EffectValue, len(effects))
			for effectIndex, effect := range effects {
				effectValues[effectIndex] = compilercontract.EffectValue{Kind: effect.Kind, Name: effect.Name, Arg: effect.Arg, Reply: effect.Reply}
			}
			step := replayStep{
				EventIndex: index, Kind: event.Kind, Message: message, Effects: effectValues,
				State: snapshotState(state), View: compilercontract.NodeRecordFromGobi(publications.View(state)),
			}
			result.Steps = append(result.Steps, step)
			entry.StepIndex = intPointer(stepIndex)
			stepIndex++
		}
		result.Events = append(result.Events, entry)
	}
	encoder := json.NewEncoder(output)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("encode compiled-publications trace: %w", err)
	}
	return nil
}

func validateScenario(script scenario) error {
	if script.Schema != scenarioSchema {
		return fmt.Errorf("scenario schema = %q, want %q", script.Schema, scenarioSchema)
	}
	if script.Name == "" {
		return errors.New("scenario name is empty")
	}
	if script.PackagePath != packagePath || script.ComponentID != componentID {
		return fmt.Errorf("scenario package/component = %q / %q, want %q / %q", script.PackagePath, script.ComponentID, packagePath, componentID)
	}
	if script.Events == nil {
		return errors.New("scenario events must be an array")
	}
	for index, event := range script.Events {
		if event.Kind == "" {
			return fmt.Errorf("scenario event %d has empty kind", index)
		}
	}
	return nil
}

func resolveEvent(state publications.State, events []scenarioEvent, index int, event scenarioEvent) (compilercontract.MessageValue, bool, error) {
	switch event.Kind {
	case "click":
		if event.Path == "" || event.Event == "" || event.Message == nil {
			return compilercontract.MessageValue{}, false, errors.New("click requires path, event, and expected message")
		}
		if err := validateNestedAction(event); err != nil {
			return compilercontract.MessageValue{}, false, err
		}
		node, err := nodeAtPath(publications.View(state), event.Path)
		if err != nil {
			return compilercontract.MessageValue{}, false, err
		}
		message, ok := handlerMessage(node, event.Event)
		if !ok {
			return compilercontract.MessageValue{}, false, fmt.Errorf("path %q has no %q handler", event.Path, event.Event)
		}
		if message != *event.Message {
			return compilercontract.MessageValue{}, false, fmt.Errorf("path %q %q message = %#v, want %#v", event.Path, event.Event, message, *event.Message)
		}
		if nodeDisabled(node) {
			return compilercontract.MessageValue{}, false, fmt.Errorf("click path %q targets a disabled node", event.Path)
		}
		return message, true, nil
	case "go-message":
		if event.Message == nil {
			return compilercontract.MessageValue{}, false, errors.New("go-message requires message")
		}
		return *event.Message, true, nil
	case "effect-reply":
		if event.Token == "" {
			return compilercontract.MessageValue{}, false, errors.New("effect-reply requires a nonempty token")
		}
		return compilercontract.MessageValue{Name: "complete", Arg: event.Token}, true, nil
	case "disabled-action":
		if event.Path == "" || event.Event == "" || event.Message == nil || event.Expect != "disabled" {
			return compilercontract.MessageValue{}, false, errors.New("disabled-action requires action, path, event, message, and expect=disabled")
		}
		if err := validateNestedAction(event); err != nil {
			return compilercontract.MessageValue{}, false, err
		}
		node, err := nodeAtPath(publications.View(state), event.Path)
		if err != nil {
			return compilercontract.MessageValue{}, false, err
		}
		message, ok := handlerMessage(node, event.Event)
		if !ok || message != *event.Message {
			return compilercontract.MessageValue{}, false, fmt.Errorf("disabled-action path %q does not resolve to expected message %#v", event.Path, *event.Message)
		}
		if !nodeDisabled(node) {
			return compilercontract.MessageValue{}, false, fmt.Errorf("disabled-action path %q is enabled", event.Path)
		}
		return compilercontract.MessageValue{}, false, nil
	case "stale-callback":
		if event.Path == "" || event.Event == "" || event.Message == nil || event.From != "dom" || event.Expect != "suppressed" || event.SourceEvent == nil {
			return compilercontract.MessageValue{}, false, errors.New("stale-callback requires sourceEvent, path, event, message, from=dom, and expect=suppressed")
		}
		if err := validateNestedAction(event); err != nil {
			return compilercontract.MessageValue{}, false, err
		}
		sourceIndex := *event.SourceEvent
		if sourceIndex < 0 || sourceIndex >= index {
			return compilercontract.MessageValue{}, false, fmt.Errorf("stale-callback sourceEvent %d is not an earlier event", sourceIndex)
		}
		source := events[sourceIndex]
		if source.Kind != "click" || source.Path != event.Path || source.Event != event.Event || source.Value != event.Value || source.Message == nil || *source.Message != *event.Message || !sameAction(source.Action, event.Action) {
			return compilercontract.MessageValue{}, false, fmt.Errorf("stale-callback sourceEvent %d does not match its captured click", sourceIndex)
		}
		return compilercontract.MessageValue{}, false, nil
	case "renderer-swap":
		if event.From == "" || event.To == "" || event.Target == "" || (event.Expect != "accepted" && event.Expect != "rejected") {
			return compilercontract.MessageValue{}, false, errors.New("renderer-swap requires from, to, target, and expect=accepted|rejected")
		}
		return compilercontract.MessageValue{}, false, nil
	default:
		return compilercontract.MessageValue{}, false, fmt.Errorf("unsupported scenario event kind %q", event.Kind)
	}
}

func validateNestedAction(event scenarioEvent) error {
	if event.Action == nil {
		return errors.New("UI event requires nested action metadata")
	}
	if event.Action.Path != event.Path || event.Action.Event != event.Event || event.Action.Value != event.Value {
		return fmt.Errorf("nested action = %#v, does not match flattened path/event/value %q/%q/%q", *event.Action, event.Path, event.Event, event.Value)
	}
	return nil
}

func sameAction(left, right *compilercontract.Action) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func applyEffects(pending []string, effects []gobi.Effect) ([]string, error) {
	for _, effect := range effects {
		switch effect.Kind {
		case "fixture.request":
			if effect.Name != "lookup" || effect.Reply != "complete" || effect.Arg == "" || hasToken(pending, effect.Arg) {
				return pending, fmt.Errorf("invalid or duplicate fixture.request token %q", effect.Arg)
			}
			pending = append(pending, effect.Arg)
		case "lifecycle.cancel":
			if effect.Name != "cancel" || effect.Reply != "" || effect.Arg == "" {
				return pending, fmt.Errorf("invalid lifecycle.cancel token %q", effect.Arg)
			}
			var ok bool
			pending, ok = consumeToken(pending, effect.Arg)
			if !ok {
				return pending, fmt.Errorf("lifecycle.cancel token %q is not pending", effect.Arg)
			}
		default:
			return pending, fmt.Errorf("unsupported effect kind %q", effect.Kind)
		}
	}
	return pending, nil
}

func hasToken(tokens []string, token string) bool {
	for _, candidate := range tokens {
		if candidate == token {
			return true
		}
	}
	return false
}

func consumeToken(tokens []string, token string) ([]string, bool) {
	for index, candidate := range tokens {
		if candidate == token {
			return append(tokens[:index], tokens[index+1:]...), true
		}
	}
	return tokens, false
}

func nodeAtPath(root gobi.Node, path string) (gobi.Node, error) {
	parts := strings.Split(path, "/")
	node := root
	for _, part := range parts {
		if part == "" {
			return gobi.Node{}, fmt.Errorf("path %q contains an empty segment", path)
		}
		index, err := strconv.Atoi(part)
		if err != nil || index < 0 || index >= len(node.Kids) {
			return gobi.Node{}, fmt.Errorf("path %q has invalid child index %q", path, part)
		}
		node = node.Kids[index]
	}
	return node, nil
}

func handlerMessage(node gobi.Node, event string) (compilercontract.MessageValue, bool) {
	for _, handler := range node.On {
		if handler.Event == event {
			return compilercontract.MessageValue{Name: handler.Message, Arg: handler.Arg}, true
		}
	}
	return compilercontract.MessageValue{}, false
}

func nodeDisabled(node gobi.Node) bool {
	for _, attr := range node.Attrs {
		if attr.Name == "disabled" && attr.Flag {
			return true
		}
	}
	return false
}

func snapshotState(state publications.State) publications.State {
	if state.Children != nil {
		state.Children = append(make([]publications.ChildState, 0, len(state.Children)), state.Children...)
	}
	if state.Publications != nil {
		state.Publications = append(make([]publications.Publication, 0, len(state.Publications)), state.Publications...)
	}
	return state
}

func intPointer(value int) *int { return &value }
