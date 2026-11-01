// Command keyed-module-native composes the keyed parent with independent child
// module instances and emits a deterministic Go-owned replay trace.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent"
	"github.com/samuelpmahan/gondola/fixtures/compiled/keyedmodulewire"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulechild"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	"github.com/samuelpmahan/gondola/gobi"
)

const (
	scenarioSchema = "gobi.keyed-modules-scenario/v1"
	outputSchema   = "gobi.keyed-module-native/v1"
	scenarioPath   = "fixtures/compiled/keyedmoduleparent/scenario.json"
)

type scenario struct {
	Schema string          `json:"schema"`
	Name   string          `json:"name"`
	Events []scenarioEvent `json:"events"`
}

type scenarioEvent struct {
	Kind        string                         `json:"kind"`
	Target      string                         `json:"target,omitempty"`
	Key         string                         `json:"key,omitempty"`
	Generation  int                            `json:"generation,omitempty"`
	Action      *compilercontract.Action       `json:"action,omitempty"`
	Message     *compilercontract.MessageValue `json:"message,omitempty"`
	Publication *modulewire.Publication        `json:"publication,omitempty"`
	SourceEvent *int                           `json:"sourceEvent,omitempty"`
}

type inputSnapshot struct {
	Step     int  `json:"step"`
	Locked   bool `json:"locked"`
	Revision int  `json:"revision"`
}

type childStateSnapshot struct {
	Count         float64 `json:"count"`
	Step          int     `json:"step"`
	Locked        bool    `json:"locked"`
	InputRevision int     `json:"inputRevision"`
}

type publicationSnapshot struct {
	Key        string  `json:"key"`
	Generation int     `json:"generation"`
	Count      float64 `json:"count"`
	Revision   int     `json:"revision"`
}

type childSnapshot struct {
	Key         string                      `json:"key"`
	Generation  int                         `json:"generation"`
	Input       inputSnapshot               `json:"input"`
	ChildState  childStateSnapshot          `json:"childState"`
	Publication publicationSnapshot         `json:"publication"`
	View        compilercontract.NodeRecord `json:"view"`
}

type parentStateSnapshot struct {
	Step              int     `json:"step"`
	Locked            bool    `json:"locked"`
	Revision          int     `json:"revision"`
	PublishedCount    float64 `json:"publishedCount"`
	PublishedRevision int     `json:"publishedRevision"`
}

type childSlotSnapshot struct {
	Key               string  `json:"key"`
	Generation        int     `json:"generation"`
	Mounted           bool    `json:"mounted"`
	PublishedCount    float64 `json:"publishedCount"`
	PublishedRevision int     `json:"publishedRevision"`
}

type controllerStateSnapshot struct {
	A          childSlotSnapshot `json:"a"`
	B          childSlotSnapshot `json:"b"`
	First      string            `json:"first"`
	Second     string            `json:"second"`
	ChildCount int               `json:"childCount"`
}

type stateSnapshot struct {
	ParentState     parentStateSnapshot         `json:"parentState"`
	ControllerState controllerStateSnapshot     `json:"controllerState"`
	Children        []childSnapshot             `json:"children"`
	ParentView      compilercontract.NodeRecord `json:"parentView"`
}

type eventRecord struct {
	Index       int                            `json:"index"`
	Kind        string                         `json:"kind"`
	Target      string                         `json:"target,omitempty"`
	Key         string                         `json:"key,omitempty"`
	Generation  int                            `json:"generation,omitempty"`
	Action      *compilercontract.Action       `json:"action,omitempty"`
	Message     *compilercontract.MessageValue `json:"message,omitempty"`
	Publication *publicationSnapshot           `json:"publication,omitempty"`
	SourceEvent *int                           `json:"sourceEvent,omitempty"`
	Accepted    bool                           `json:"accepted"`
	BridgeCalls []string                       `json:"bridgeCalls"`
	Snapshot    stateSnapshot                  `json:"snapshot"`
}

type replayOutput struct {
	Schema  string        `json:"schema"`
	Name    string        `json:"name"`
	Initial stateSnapshot `json:"initial"`
	Events  []eventRecord `json:"events"`
}

type childInstance struct {
	Generation int
	State      modulechild.State
}

func main() {
	script := flag.String("script", scenarioPath, "keyed module scenario JSON")
	flag.Parse()
	if err := run(*script, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(scriptPath string, output io.Writer) error {
	data, err := os.ReadFile(scriptPath)
	if err != nil {
		return fmt.Errorf("read keyed module scenario: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var script scenario
	if err := decoder.Decode(&script); err != nil {
		return fmt.Errorf("decode keyed module scenario: %w", err)
	}
	if err := requireJSONEOF(decoder); err != nil {
		return fmt.Errorf("decode keyed module scenario: %w", err)
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
		return fmt.Errorf("encode keyed module trace: %w", err)
	}
	return nil
}

func replay(script scenario) (replayOutput, error) {
	if err := validateScenario(script); err != nil {
		return replayOutput{}, err
	}
	parentState := keyedmoduleparent.Init()
	instances := make(map[string]childInstance, 2)
	for _, child := range keyedmoduleparent.Children(parentState) {
		instance := modulechild.Init()
		instance = modulechild.Input(instance, keyedmoduleparent.Output(parentState))
		publication := modulechild.Publication(instance)
		parentState = keyedmoduleparent.ReceiveKeyed(parentState, child.Key, child.Generation, publication)
		instances[child.Key] = childInstance{Generation: child.Generation, State: instance}
	}
	initial, err := snapshot(parentState, instances)
	if err != nil {
		return replayOutput{}, fmt.Errorf("initial snapshot: %w", err)
	}
	result := replayOutput{
		Schema:  outputSchema,
		Name:    script.Name,
		Initial: initial,
		Events:  make([]eventRecord, 0, len(script.Events)),
	}
	for index, event := range script.Events {
		entry := eventRecord{
			Index: index, Kind: event.Kind, Target: event.Target, Key: event.Key,
			Generation: event.Generation, Action: copyAction(event.Action),
			BridgeCalls: []string{},
		}
		if event.SourceEvent != nil {
			entry.SourceEvent = intPointerCopy(event.SourceEvent)
		}
		message, dispatch, err := resolveEvent(parentState, instances, result.Events, index, event)
		if err != nil {
			return replayOutput{}, fmt.Errorf("event %d: %w", index, err)
		}
		if message != nil {
			entry.Message = messagePointer(*message)
		}
		if event.Kind == "parent-message" || (event.Kind == "click" && event.Target == "parent" && dispatch) {
			if dispatch {
				parentState, instances, entry.BridgeCalls, err = dispatchParent(*message, parentState, instances)
				if err != nil {
					return replayOutput{}, fmt.Errorf("event %d: %w", index, err)
				}
				entry.Accepted = true
			}
		} else if event.Kind == "child-message" || event.Kind == "stale-callback" ||
			(event.Kind == "click" && event.Target == "child" && dispatch) {
			if dispatch && message != nil {
				parentState, instances, entry.Publication, entry.BridgeCalls, entry.Accepted, err = dispatchChild(
					parentState, instances, event.Key, event.Generation, *message,
				)
				if err != nil {
					return replayOutput{}, fmt.Errorf("event %d: %w", index, err)
				}
			}
		} else if event.Kind == "publication" {
			publication, err := resolvePublication(result.Events, index, event)
			if err != nil {
				return replayOutput{}, fmt.Errorf("event %d: %w", index, err)
			}
			entry.Publication = keyedPublication(event.Key, event.Generation, publication)
			entry.Accepted = validKeyedPublication(parentState, event.Key, event.Generation, publication)
			parentState = keyedmoduleparent.ReceiveKeyed(parentState, event.Key, event.Generation, publication)
			entry.BridgeCalls = append(entry.BridgeCalls, "parent.ReceiveKeyed")
		}
		entry.Snapshot, err = snapshot(parentState, instances)
		if err != nil {
			return replayOutput{}, fmt.Errorf("event %d snapshot: %w", index, err)
		}
		result.Events = append(result.Events, entry)
	}
	return result, nil
}

func dispatchParent(message compilercontract.MessageValue, parentState keyedmoduleparent.State, instances map[string]childInstance) (keyedmoduleparent.State, map[string]childInstance, []string, error) {
	updated, effects := keyedmoduleparent.Update(parentState, gobi.Message{Name: message.Name, Arg: message.Arg})
	if len(effects) != 0 {
		return parentState, instances, nil, errors.New("parent emitted an effect in the finite effect-free profile")
	}
	calls := []string{"parent.Update"}
	previous := make(map[string]childInstance, len(instances))
	for key, instance := range instances {
		previous[key] = instance
	}
	children := keyedmoduleparent.Children(updated)
	current := make(map[string]childInstance, len(children))
	for _, child := range children {
		instance, exists := previous[child.Key]
		if !exists || instance.Generation != child.Generation {
			instance = childInstance{Generation: child.Generation, State: modulechild.Init()}
			calls = append(calls, "child.Init")
		}
		calls = append(calls, "parent.Output", "child.Input")
		instance.State = modulechild.Input(instance.State, keyedmoduleparent.Output(updated))
		current[child.Key] = instance
	}
	instances = current
	for _, child := range children {
		instance := instances[child.Key]
		publication := modulechild.Publication(instance.State)
		calls = append(calls, "child.Publication", "parent.ReceiveKeyed")
		updated = keyedmoduleparent.ReceiveKeyed(updated, child.Key, child.Generation, publication)
	}
	return updated, instances, calls, nil
}

func dispatchChild(parentState keyedmoduleparent.State, instances map[string]childInstance, key string, generation int, message compilercontract.MessageValue) (keyedmoduleparent.State, map[string]childInstance, *publicationSnapshot, []string, bool, error) {
	instance, exists := instances[key]
	if !keyedmoduleparent.IsCurrent(parentState, key, generation) || !exists || instance.Generation != generation {
		return parentState, instances, nil, []string{"keyedmoduleparent.IsCurrent"}, false, nil
	}
	updated, effects := modulechild.Update(instance.State, gobi.Message{Name: message.Name, Arg: message.Arg})
	if len(effects) != 0 {
		return parentState, instances, nil, nil, false, errors.New("child emitted an effect in the finite effect-free profile")
	}
	instance.State = updated
	instances[key] = instance
	publication := modulechild.Publication(updated)
	parentState = keyedmoduleparent.ReceiveKeyed(parentState, key, generation, publication)
	return parentState, instances, keyedPublication(key, generation, publication), []string{"child.Update", "child.Publication", "parent.ReceiveKeyed"}, true, nil
}

func resolveEvent(parentState keyedmoduleparent.State, instances map[string]childInstance, previous []eventRecord, index int, event scenarioEvent) (*compilercontract.MessageValue, bool, error) {
	switch event.Kind {
	case "click":
		if event.Action == nil || event.Action.Path == "" || event.Action.Event == "" || event.Target == "" {
			return nil, false, errors.New("click requires target and action path/event/value")
		}
		var view gobi.Node
		if event.Target == "parent" {
			view = keyedmoduleparent.View(parentState)
		} else if event.Target == "child" {
			instance, ok := instances[event.Key]
			if !ok || instance.Generation != event.Generation || !keyedmoduleparent.IsCurrent(parentState, event.Key, event.Generation) {
				return nil, false, fmt.Errorf("click child %q generation %d is not mounted", event.Key, event.Generation)
			}
			view = modulechild.View(instance.State)
		} else {
			return nil, false, fmt.Errorf("click target %q must be parent or child", event.Target)
		}
		node, err := nodeAtPath(view, event.Action.Path)
		if err != nil {
			return nil, false, err
		}
		message, found := handlerMessage(node, event.Action.Event)
		if !found {
			return nil, false, fmt.Errorf("path %q has no unique %q handler", event.Action.Path, event.Action.Event)
		}
		if nodeDisabled(node) {
			return messagePointer(message), false, nil
		}
		return messagePointer(message), true, nil
	case "parent-message":
		if event.Message == nil || event.Message.Name == "" {
			return nil, false, errors.New("parent-message requires a named message")
		}
		return messagePointer(*event.Message), true, nil
	case "child-message":
		if event.Message == nil || event.Message.Name == "" || event.Key == "" || event.Generation < 1 {
			return nil, false, errors.New("child-message requires key, positive generation, and named message")
		}
		return messagePointer(*event.Message), true, nil
	case "stale-callback":
		if event.Key == "" || event.Generation < 1 || event.SourceEvent == nil {
			return nil, false, errors.New("stale-callback requires key, positive generation, and sourceEvent")
		}
		source, err := sourceEvent(previous, index, event.SourceEvent)
		if err != nil {
			return nil, false, err
		}
		if source.Kind != "click" || source.Target != "child" || source.Key != event.Key || source.Generation != event.Generation || source.Message == nil || !source.Accepted {
			return nil, false, fmt.Errorf("sourceEvent %d does not identify an accepted child click for %s generation %d", *event.SourceEvent, event.Key, event.Generation)
		}
		return messagePointer(*source.Message), true, nil
	case "publication":
		if event.Key == "" || event.Generation < 1 || (event.SourceEvent == nil && event.Publication == nil) {
			return nil, false, errors.New("publication requires key, positive generation, and sourceEvent or publication")
		}
		if event.SourceEvent != nil {
			source, err := sourceEvent(previous, index, event.SourceEvent)
			if err != nil {
				return nil, false, err
			}
			if source.Target != "child" || source.Key != event.Key || source.Generation != event.Generation || source.Publication == nil || !source.Accepted {
				return nil, false, fmt.Errorf("sourceEvent %d does not identify an accepted child publication for %s generation %d", *event.SourceEvent, event.Key, event.Generation)
			}
		}
		return nil, false, nil
	default:
		return nil, false, fmt.Errorf("unsupported event kind %q", event.Kind)
	}
}

func resolvePublication(previous []eventRecord, index int, event scenarioEvent) (modulewire.Publication, error) {
	if event.SourceEvent != nil {
		source, err := sourceEvent(previous, index, event.SourceEvent)
		if err != nil {
			return modulewire.Publication{}, err
		}
		if source.Publication == nil || source.Publication.Key != event.Key || source.Publication.Generation != event.Generation {
			return modulewire.Publication{}, fmt.Errorf("sourceEvent %d has no matching keyed publication", *event.SourceEvent)
		}
		return modulewire.Publication{Count: source.Publication.Count, Revision: source.Publication.Revision}, nil
	}
	return *event.Publication, nil
}

func sourceEvent(previous []eventRecord, index int, sourceIndex *int) (eventRecord, error) {
	if sourceIndex == nil || *sourceIndex < 0 || *sourceIndex >= index || *sourceIndex >= len(previous) {
		return eventRecord{}, errors.New("sourceEvent must reference an earlier event")
	}
	return previous[*sourceIndex], nil
}

func snapshot(parent keyedmoduleparent.State, instances map[string]childInstance) (stateSnapshot, error) {
	result := stateSnapshot{
		ParentState: parentStateSnapshot{
			Step: parent.Parent.Step, Locked: parent.Parent.Locked, Revision: parent.Parent.Revision,
			PublishedCount: parent.Parent.PublishedCount, PublishedRevision: parent.Parent.PublishedRevision,
		},
		ControllerState: controllerStateSnapshot{
			A: slotSnapshot(parent.A), B: slotSnapshot(parent.B),
			First: parent.First, Second: parent.Second, ChildCount: parent.ChildCount,
		},
		Children:   make([]childSnapshot, 0, len(instances)),
		ParentView: compilercontract.NodeRecordFromGobi(keyedmoduleparent.View(parent)),
	}
	for _, ref := range keyedmoduleparent.Children(parent) {
		instance, ok := instances[ref.Key]
		if !ok || instance.Generation != ref.Generation {
			return stateSnapshot{}, fmt.Errorf("mounted child %s generation %d has no matching Go instance", ref.Key, ref.Generation)
		}
		input := modulewire.Input{Step: instance.State.Step, Locked: instance.State.Locked, Revision: instance.State.InputRevision}
		stored := parent.A
		if ref.Key == "b" {
			stored = parent.B
		}
		result.Children = append(result.Children, childSnapshot{
			Key: ref.Key, Generation: ref.Generation,
			Input:       inputSnapshot{Step: input.Step, Locked: input.Locked, Revision: input.Revision},
			ChildState:  childStateSnapshot{Count: instance.State.Counter.Count, Step: instance.State.Step, Locked: instance.State.Locked, InputRevision: instance.State.InputRevision},
			Publication: publicationSnapshot{Key: ref.Key, Generation: ref.Generation, Count: stored.PublishedCount, Revision: stored.PublishedRevision},
			View:        compilercontract.NodeRecordFromGobi(modulechild.View(instance.State)),
		})
	}
	return result, nil
}

func slotSnapshot(slot keyedmoduleparent.SlotState) childSlotSnapshot {
	return childSlotSnapshot{
		Key: slot.Key, Generation: slot.Generation, Mounted: slot.Mounted,
		PublishedCount: slot.PublishedCount, PublishedRevision: slot.PublishedRevision,
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

func validKeyedPublication(parent keyedmoduleparent.State, key string, generation int, publication modulewire.Publication) bool {
	return keyedmoduleparent.IsCurrent(parent, key, generation) && publication.Revision == keyedmoduleparent.Output(parent).Revision &&
		publication.Count >= 0 && publication.Count <= float64(9007199254740991) && !math.IsNaN(publication.Count) && !math.IsInf(publication.Count, 0)
}

func keyedPublication(key string, generation int, publication modulewire.Publication) *publicationSnapshot {
	keyed := keyedmodulewire.KeyedPublication{Key: key, Generation: generation, Count: publication.Count, Revision: publication.Revision}
	return &publicationSnapshot{Key: keyed.Key, Generation: keyed.Generation, Count: keyed.Count, Revision: keyed.Revision}
}

func nodeAtPath(root gobi.Node, path string) (gobi.Node, error) {
	if path == "" {
		return root, nil
	}
	node := root
	for _, part := range strings.Split(path, "/") {
		index, err := strconv.Atoi(part)
		if err != nil || index < 0 || index >= len(node.Kids) {
			return gobi.Node{}, fmt.Errorf("path %q does not resolve in the current Go view", path)
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

func copyAction(action *compilercontract.Action) *compilercontract.Action {
	if action == nil {
		return nil
	}
	copy := *action
	return &copy
}

func messagePointer(message compilercontract.MessageValue) *compilercontract.MessageValue {
	return &message
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
