// Package effectsreplay provides the deterministic Go-owned replay for compiled
// keyed module effect scenarios.
package effectsreplay

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild"
	"github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	"github.com/samuelpmahan/gondola/gobi"
)

const (
	scenarioSchema = "gobi.module-effects-scenario/v1"
	outputSchema   = "gobi.module-effects-native/v1"
)

type scenario struct {
	Schema string          `json:"schema"`
	Name   string          `json:"name"`
	Events []scenarioEvent `json:"events"`
}

type scenarioEvent struct {
	Kind        string                   `json:"kind"`
	Target      string                   `json:"target,omitempty"`
	Key         string                   `json:"key,omitempty"`
	Generation  int                      `json:"generation,omitempty"`
	Action      *compilercontract.Action `json:"action,omitempty"`
	Token       string                   `json:"token,omitempty"`
	To          string                   `json:"to,omitempty"`
	SourceEvent *int                     `json:"sourceEvent,omitempty"`
}

type childInstance struct {
	Key        string
	Generation uint64
	State      effectmodulechild.State
}

type app struct {
	Parent   keyedmoduleparent.State
	Children map[string]childInstance
}

type stateSnapshot struct {
	Parent     keyedmoduleparent.State     `json:"parent"`
	Children   []childSnapshot             `json:"children"`
	ParentView compilercontract.NodeRecord `json:"parentView"`
}

type childSnapshot struct {
	Key         string                      `json:"key"`
	Generation  uint64                      `json:"generation"`
	State       effectmodulechild.State     `json:"state"`
	View        compilercontract.NodeRecord `json:"view"`
	Publication modulewire.Publication      `json:"publication"`
}

type replayEvent struct {
	Index            int                            `json:"index"`
	Kind             string                         `json:"kind"`
	Target           string                         `json:"target,omitempty"`
	Key              string                         `json:"key,omitempty"`
	Generation       int                            `json:"generation,omitempty"`
	Action           *compilercontract.Action       `json:"action,omitempty"`
	Token            string                         `json:"token,omitempty"`
	To               string                         `json:"to,omitempty"`
	Message          *compilercontract.MessageValue `json:"message,omitempty"`
	Accepted         bool                           `json:"accepted"`
	StateIndex       int                            `json:"stateIndex"`
	EffectIndices    []int                          `json:"effectIndices"`
	TransportOutcome string                         `json:"transportOutcome,omitempty"`
	RendererSwap     *rendererSwap                  `json:"rendererSwap,omitempty"`
	SourceEvent      *int                           `json:"sourceEvent,omitempty"`
}

type rendererSwap struct {
	From   string `json:"from,omitempty"`
	To     string `json:"to"`
	Target string `json:"target"`
}

type effectRecord struct {
	Index      int                          `json:"index"`
	EventIndex int                          `json:"eventIndex"`
	Key        string                       `json:"key"`
	Generation uint64                       `json:"generation"`
	Effect     compilercontract.EffectValue `json:"effect"`
}

type transportRecord struct {
	Sequence    int    `json:"sequence"`
	EventIndex  int    `json:"eventIndex"`
	Action      string `json:"action"`
	Token       string `json:"token"`
	Key         string `json:"key,omitempty"`
	Generation  uint64 `json:"generation,omitempty"`
	EffectIndex int    `json:"effectIndex"`
	Status      string `json:"status"`
	Outcome     string `json:"outcome,omitempty"`
}

type pendingTransport struct {
	Token       string `json:"token"`
	Key         string `json:"key"`
	Generation  uint64 `json:"generation"`
	EffectIndex int    `json:"effectIndex"`
}

type transportState struct {
	Entry  pendingTransport
	Status string
}

type lifecycleRecord struct {
	Sequence    int                            `json:"sequence"`
	EventIndex  int                            `json:"eventIndex"`
	Action      string                         `json:"action"`
	Key         string                         `json:"key"`
	Generation  uint64                         `json:"generation"`
	Message     *compilercontract.MessageValue `json:"message,omitempty"`
	State       *effectmodulechild.State       `json:"state,omitempty"`
	EffectIndex int                            `json:"effectIndex,omitempty"`
	Token       string                         `json:"token,omitempty"`
}

type replayOutput struct {
	Schema            string             `json:"schema"`
	Name              string             `json:"name"`
	PackagePath       string             `json:"packagePath"`
	ComponentID       string             `json:"componentID"`
	InitialStateIndex int                `json:"initialStateIndex"`
	States            []stateSnapshot    `json:"states"`
	Events            []replayEvent      `json:"events"`
	Effects           []effectRecord     `json:"effects"`
	TransportLedger   []transportRecord  `json:"transportLedger"`
	PendingTransports []pendingTransport `json:"pendingTransports"`
	LifecycleLedger   []lifecycleRecord  `json:"lifecycleLedger"`
	RetiredChildren   []childSnapshot    `json:"retiredChildren"`
}

type replayContext struct {
	App            app
	Output         replayOutput
	Transport      map[string]*transportState
	ActiveRenderer string
	EventEffects   []int
}

// ReplayJSON validates and replays one scenario, returning the exact JSON
// representation emitted by cmd/module-effects-native.
func ReplayJSON(input []byte) ([]byte, error) {
	decoder := json.NewDecoder(bytes.NewReader(input))
	decoder.DisallowUnknownFields()
	var script scenario
	if err := decoder.Decode(&script); err != nil {
		return nil, fmt.Errorf("decode module effects scenario: %w", err)
	}
	if err := requireJSONEOF(decoder); err != nil {
		return nil, err
	}
	if err := validateScenario(script); err != nil {
		return nil, err
	}
	result, err := replay(script)
	if err != nil {
		return nil, err
	}
	var output bytes.Buffer
	encoder := json.NewEncoder(&output)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func replay(script scenario) (replayOutput, error) {
	parent := keyedmoduleparent.Init()
	ctx := &replayContext{
		App:            app{Parent: parent, Children: map[string]childInstance{}},
		Transport:      map[string]*transportState{},
		ActiveRenderer: "dom",
	}
	ctx.Output = replayOutput{
		Schema: outputSchema, Name: script.Name,
		PackagePath: "github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild",
		ComponentID: "github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild",
		States:      []stateSnapshot{}, Events: []replayEvent{}, Effects: []effectRecord{},
		TransportLedger: []transportRecord{}, PendingTransports: []pendingTransport{},
		LifecycleLedger: []lifecycleRecord{}, RetiredChildren: []childSnapshot{},
	}
	for _, ref := range keyedmoduleparent.Children(ctx.App.Parent) {
		instance := newMountedChild(ref.Key, uint64(ref.Generation))
		instance.State = effectmodulechild.Input(instance.State, keyedmoduleparent.Output(ctx.App.Parent))
		ctx.App.Children[ref.Key] = instance
		ctx.App.Parent = keyedmoduleparent.ReceiveKeyed(ctx.App.Parent, ref.Key, ref.Generation, effectmodulechild.Publication(instance.State))
	}
	ctx.Output.InitialStateIndex = 0
	initial, err := ctx.snapshot()
	if err != nil {
		return replayOutput{}, fmt.Errorf("initial snapshot: %w", err)
	}
	ctx.Output.States = append(ctx.Output.States, initial)

	for index, event := range script.Events {
		row := replayEvent{Index: index, Kind: event.Kind, Target: event.Target, Key: event.Key,
			Generation: event.Generation, Action: copyAction(event.Action), Token: event.Token, To: event.To,
			EffectIndices: []int{}}
		if event.SourceEvent != nil {
			row.SourceEvent = intPointerCopy(event.SourceEvent)
		}
		message, dispatch, err := ctx.resolve(index, event)
		if err != nil {
			return replayOutput{}, fmt.Errorf("event %d: %w", index, err)
		}
		if message != nil {
			row.Message = messagePointer(*message)
		}
		if event.Kind == "click" {
			if dispatch {
				row.Accepted = true
				if event.Target == "parent" {
					if err := ctx.dispatchParent(index, *message); err != nil {
						return replayOutput{}, fmt.Errorf("event %d parent update: %w", index, err)
					}
				} else {
					row.Accepted, err = ctx.dispatchChild(index, event.Key, uint64(event.Generation), *message)
					if err != nil {
						return replayOutput{}, fmt.Errorf("event %d child update: %w", index, err)
					}
				}
			}
		} else {
			switch event.Kind {
			case "transport-reply":
				row.Accepted, row.TransportOutcome, err = ctx.deliver(index, event.Token)
				if err != nil {
					return replayOutput{}, fmt.Errorf("event %d transport reply: %w", index, err)
				}
				if row.Accepted {
					row.Message = &compilercontract.MessageValue{Name: "complete", Arg: event.Token}
				}
			case "renderer-swap":
				row.RendererSwap = &rendererSwap{From: ctx.ActiveRenderer, To: event.To, Target: "root"}
				ctx.ActiveRenderer = event.To
			case "stale-callback":
				row.TransportOutcome = "rejected-stale-generation"
			}
		}
		row.EffectIndices = append(row.EffectIndices, ctx.EventEffects...)
		ctx.EventEffects = nil
		state, err := ctx.snapshot()
		if err != nil {
			return replayOutput{}, fmt.Errorf("event %d snapshot: %w", index, err)
		}
		row.StateIndex = len(ctx.Output.States)
		ctx.Output.States = append(ctx.Output.States, state)
		ctx.Output.Events = append(ctx.Output.Events, row)
	}
	ctx.finishTransports()
	return ctx.Output, nil
}

func (ctx *replayContext) resolve(index int, event scenarioEvent) (*compilercontract.MessageValue, bool, error) {
	switch event.Kind {
	case "click":
		if event.Action == nil || event.Action.Path == "" || event.Action.Event == "" || event.Target == "" {
			return nil, false, errors.New("click requires target and action path/event/value")
		}
		var view gobi.Node
		if event.Target == "parent" {
			view = keyedmoduleparent.View(ctx.App.Parent)
		} else if event.Target == "child" {
			instance, ok := ctx.App.Children[event.Key]
			if !ok || int(instance.Generation) != event.Generation || !keyedmoduleparent.IsCurrent(ctx.App.Parent, event.Key, event.Generation) {
				return nil, false, fmt.Errorf("click child %q generation %d is not mounted", event.Key, event.Generation)
			}
			view = effectmodulechild.View(instance.State)
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
	case "transport-reply":
		if event.Token == "" {
			return nil, false, errors.New("transport-reply requires a token")
		}
		return nil, false, nil
	case "renderer-swap":
		if event.To != "dom" && event.To != "react" {
			return nil, false, fmt.Errorf("renderer-swap target %q must be dom or react", event.To)
		}
		return nil, false, nil
	case "stale-callback":
		if !validKey(event.Key) || event.Generation < 1 || event.SourceEvent == nil || *event.SourceEvent < 0 || *event.SourceEvent >= index {
			return nil, false, errors.New("stale-callback requires key, positive generation, and an earlier sourceEvent")
		}
		source := ctx.Output.Events[*event.SourceEvent]
		if source.Kind != "click" || source.Target != "child" || source.Key != event.Key || source.Generation != event.Generation ||
			source.Message == nil || !source.Accepted {
			return nil, false, fmt.Errorf("sourceEvent %d does not identify an accepted child click for %s generation %d", *event.SourceEvent, event.Key, event.Generation)
		}
		return copyMessageValue(source.Message), false, nil
	default:
		return nil, false, fmt.Errorf("unsupported event kind %q", event.Kind)
	}
}

func (ctx *replayContext) dispatchParent(eventIndex int, message compilercontract.MessageValue) error {
	before := ctx.App.Parent
	updated, effects := keyedmoduleparent.Update(ctx.App.Parent, gobi.Message{Name: message.Name, Arg: message.Arg})
	if len(effects) != 0 {
		return errors.New("keyed parent emitted effects in this profile")
	}
	ctx.App.Parent = updated
	for _, ref := range keyedmoduleparent.Children(before) {
		if keyedmoduleparent.IsCurrent(updated, ref.Key, ref.Generation) {
			continue
		}
		instance, ok := ctx.App.Children[ref.Key]
		if !ok || uint64(ref.Generation) != instance.Generation {
			return fmt.Errorf("removed child %s generation %d has no matching Go instance", ref.Key, ref.Generation)
		}
		if err := ctx.unmountChild(eventIndex, ref.Key, instance); err != nil {
			return err
		}
		delete(ctx.App.Children, ref.Key)
	}
	for _, ref := range keyedmoduleparent.Children(ctx.App.Parent) {
		instance, ok := ctx.App.Children[ref.Key]
		if !ok || instance.Generation != uint64(ref.Generation) {
			instance = newMountedChild(ref.Key, uint64(ref.Generation))
			ctx.App.Children[ref.Key] = instance
		}
		instance.State = effectmodulechild.Input(instance.State, keyedmoduleparent.Output(ctx.App.Parent))
		ctx.App.Children[ref.Key] = instance
	}
	for _, ref := range keyedmoduleparent.Children(ctx.App.Parent) {
		instance := ctx.App.Children[ref.Key]
		ctx.App.Parent = keyedmoduleparent.ReceiveKeyed(ctx.App.Parent, ref.Key, ref.Generation, effectmodulechild.Publication(instance.State))
	}
	return nil
}

func (ctx *replayContext) dispatchChild(eventIndex int, key string, generation uint64, message compilercontract.MessageValue) (bool, error) {
	instance, exists := ctx.App.Children[key]
	if !exists || !keyedmoduleparent.IsCurrent(ctx.App.Parent, key, int(generation)) || instance.Generation != generation || !instance.State.Mounted {
		return false, nil
	}
	updated, effects := effectmodulechild.Update(instance.State, gobi.Message{Name: message.Name, Arg: message.Arg})
	instance.State = updated
	ctx.App.Children[key] = instance
	if err := ctx.recordEffects(eventIndex, key, generation, effects); err != nil {
		return false, err
	}
	ctx.App.Parent = keyedmoduleparent.ReceiveKeyed(ctx.App.Parent, key, int(generation), effectmodulechild.Publication(instance.State))
	return true, nil
}

func (ctx *replayContext) unmountChild(eventIndex int, key string, instance childInstance) error {
	message := gobi.Message{Name: "unmount", Arg: mountArg(key, instance.Generation)}
	messageRecord := compilercontract.MessageValue{Name: message.Name, Arg: message.Arg}
	before := instance.State
	ctx.lifecycle("go.update.unmount", eventIndex, key, instance.Generation, &messageRecord, &before, -1, "")
	updated, effects := effectmodulechild.Update(instance.State, message)
	instance.State = updated
	after := instance.State
	ctx.lifecycle("go.state.unmounted", eventIndex, key, instance.Generation, nil, &after, -1, "")
	ctx.Output.RetiredChildren = append(ctx.Output.RetiredChildren, childSnapshot{
		Key: key, Generation: instance.Generation, State: after,
		View:        compilercontract.NodeRecordFromGobi(effectmodulechild.View(after)),
		Publication: effectmodulechild.Publication(after),
	})
	for _, effect := range effects {
		index := ctx.appendEffectRow(eventIndex, key, instance.Generation, effect)
		if effect.Kind == "lifecycle.cancel" {
			ctx.lifecycle("go.effect.cancel", eventIndex, key, instance.Generation, nil, &after, index, effect.Arg)
		}
		if err := ctx.processEffect(eventIndex, key, instance.Generation, effect, index); err != nil {
			return err
		}
		if effect.Kind == "lifecycle.cancel" {
			ctx.lifecycle("transport.cancel", eventIndex, key, instance.Generation, nil, nil, index, effect.Arg)
		}
	}
	ctx.lifecycle("renderer.teardown", eventIndex, key, instance.Generation, nil, nil, -1, "")
	return nil
}

func (ctx *replayContext) deliver(eventIndex int, token string) (bool, string, error) {
	transport, exists := ctx.Transport[token]
	if !exists {
		ctx.transport(eventIndex, "reject-unknown", token, "unknown", -1, "rejected-unknown")
		return false, "rejected-unknown", nil
	}
	switch transport.Status {
	case "cancelled":
		ctx.transport(eventIndex, "reject-cancelled", token, transport.Status, transport.Entry.EffectIndex, "rejected-cancelled")
		return false, "rejected-cancelled", nil
	case "completed":
		ctx.transport(eventIndex, "reject-duplicate", token, transport.Status, transport.Entry.EffectIndex, "rejected-duplicate")
		return false, "rejected-duplicate", nil
	case "pending":
		instance, ok := ctx.App.Children[transport.Entry.Key]
		if !ok || instance.Generation != transport.Entry.Generation || !instance.State.Mounted || !keyedmoduleparent.IsCurrent(ctx.App.Parent, transport.Entry.Key, int(transport.Entry.Generation)) {
			transport.Status = "stale"
			ctx.transport(eventIndex, "reject-stale", token, transport.Status, transport.Entry.EffectIndex, "rejected-stale-generation")
			return false, "rejected-stale-generation", nil
		}
		updated, effects := effectmodulechild.Update(instance.State, gobi.Message{Name: "complete", Arg: token})
		if len(effects) != 0 {
			return false, "", errors.New("Go complete emitted an effect")
		}
		if updated == instance.State {
			transport.Status = "stale"
			ctx.transport(eventIndex, "reject-stale", token, transport.Status, transport.Entry.EffectIndex, "rejected-go-guard")
			return false, "rejected-go-guard", nil
		}
		instance.State = updated
		ctx.App.Children[transport.Entry.Key] = instance
		ctx.App.Parent = keyedmoduleparent.ReceiveKeyed(ctx.App.Parent, transport.Entry.Key, int(transport.Entry.Generation), effectmodulechild.Publication(instance.State))
		transport.Status = "completed"
		ctx.transport(eventIndex, "complete", token, transport.Status, transport.Entry.EffectIndex, "accepted")
		return true, "accepted", nil
	default:
		return false, "", fmt.Errorf("token %q has invalid transport state %q", token, transport.Status)
	}
}

func (ctx *replayContext) recordEffects(eventIndex int, key string, generation uint64, effects []gobi.Effect) error {
	for _, effect := range effects {
		index := ctx.appendEffectRow(eventIndex, key, generation, effect)
		if err := ctx.processEffect(eventIndex, key, generation, effect, index); err != nil {
			return err
		}
	}
	return nil
}

func (ctx *replayContext) appendEffectRow(eventIndex int, key string, generation uint64, effect gobi.Effect) int {
	index := len(ctx.Output.Effects)
	record := effectRecord{Index: index, EventIndex: eventIndex, Key: key, Generation: generation, Effect: compilercontract.EffectFromGobi(effect)}
	ctx.Output.Effects = append(ctx.Output.Effects, record)
	ctx.EventEffects = append(ctx.EventEffects, index)
	return index
}

func (ctx *replayContext) processEffect(eventIndex int, key string, generation uint64, effect gobi.Effect, index int) error {
	switch effect.Kind {
	case "fixture.request":
		parsedKey, parsedGeneration, _, ok := parseToken(effect.Arg)
		if !ok || parsedKey != key || parsedGeneration != generation || effect.Name != "save" || effect.Reply != "complete" {
			return fmt.Errorf("unsupported or mismatched request effect %#v", effect)
		}
		if current, exists := ctx.Transport[effect.Arg]; exists && current.Status == "pending" {
			return fmt.Errorf("duplicate pending transport token %q", effect.Arg)
		}
		entry := pendingTransport{Token: effect.Arg, Key: key, Generation: generation, EffectIndex: index}
		ctx.Transport[effect.Arg] = &transportState{Entry: entry, Status: "pending"}
		ctx.transport(eventIndex, "start", effect.Arg, "pending", index, "accepted")
	case "lifecycle.cancel":
		if effect.Name != "cancel" || effect.Reply != "" {
			return fmt.Errorf("unsupported cancellation descriptor %#v", effect)
		}
		if err := ctx.cancelTransport(eventIndex, effect.Arg, index); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported Go effect %#v", effect)
	}
	return nil
}

func (ctx *replayContext) cancelTransport(eventIndex int, token string, effectIndex int) error {
	transport, exists := ctx.Transport[token]
	if !exists || transport.Status != "pending" {
		return fmt.Errorf("Go cancellation for token %q has no pending transport", token)
	}
	transport.Status = "cancelled"
	ctx.transport(eventIndex, "cancel", token, transport.Status, effectIndex, "accepted")
	return nil
}

func (ctx *replayContext) transport(eventIndex int, action, token, status string, effectIndex int, outcome string) {
	key := ""
	var generation uint64
	if current, ok := ctx.Transport[token]; ok {
		key, generation = current.Entry.Key, current.Entry.Generation
	}
	ctx.Output.TransportLedger = append(ctx.Output.TransportLedger, transportRecord{
		Sequence: len(ctx.Output.TransportLedger), EventIndex: eventIndex, Action: action,
		Token: token, Key: key, Generation: generation, EffectIndex: effectIndex,
		Status: status, Outcome: outcome,
	})
}

func (ctx *replayContext) lifecycle(action string, eventIndex int, key string, generation uint64, message *compilercontract.MessageValue, state *effectmodulechild.State, effectIndex int, token string) {
	var stateCopy *effectmodulechild.State
	if state != nil {
		copy := *state
		stateCopy = &copy
	}
	ctx.Output.LifecycleLedger = append(ctx.Output.LifecycleLedger, lifecycleRecord{
		Sequence: len(ctx.Output.LifecycleLedger), EventIndex: eventIndex, Action: action,
		Key: key, Generation: generation, Message: message, State: stateCopy,
		EffectIndex: effectIndex, Token: token,
	})
}

func (ctx *replayContext) snapshot() (stateSnapshot, error) {
	children := make([]childSnapshot, 0, len(ctx.App.Children))
	for _, ref := range keyedmoduleparent.Children(ctx.App.Parent) {
		instance, ok := ctx.App.Children[ref.Key]
		if !ok || instance.Generation != uint64(ref.Generation) || !instance.State.Mounted {
			return stateSnapshot{}, fmt.Errorf("mounted child %s generation %d has no matching Go instance", ref.Key, ref.Generation)
		}
		children = append(children, childSnapshot{
			Key: ref.Key, Generation: instance.Generation, State: instance.State,
			View:        compilercontract.NodeRecordFromGobi(effectmodulechild.View(instance.State)),
			Publication: effectmodulechild.Publication(instance.State),
		})
	}
	return stateSnapshot{
		Parent: ctx.App.Parent, Children: children,
		ParentView: compilercontract.NodeRecordFromGobi(keyedmoduleparent.View(ctx.App.Parent)),
	}, nil
}

func (ctx *replayContext) finishTransports() {
	entries := make([]pendingTransport, 0)
	for _, state := range ctx.Transport {
		if state.Status == "pending" {
			entries = append(entries, state.Entry)
		}
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Key != entries[j].Key {
			return entries[i].Key < entries[j].Key
		}
		if entries[i].Generation != entries[j].Generation {
			return entries[i].Generation < entries[j].Generation
		}
		return entries[i].Token < entries[j].Token
	})
	ctx.Output.PendingTransports = entries
}

func newMountedChild(key string, generation uint64) childInstance {
	state := effectmodulechild.Init()
	state, _ = effectmodulechild.Update(state, gobi.Message{Name: "mount", Arg: mountArg(key, generation)})
	return childInstance{Key: key, Generation: generation, State: state}
}

func mountArg(key string, generation uint64) string {
	return key + ":g" + strconv.FormatUint(generation, 10)
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

func validKey(key string) bool { return key == "a" || key == "b" }

func parseToken(token string) (string, uint64, uint64, bool) {
	parts := strings.Split(token, ":")
	if len(parts) != 3 || !validKey(parts[0]) || !strings.HasPrefix(parts[1], "g") || !strings.HasPrefix(parts[2], "r") {
		return "", 0, 0, false
	}
	generation, ok := parseSafeInteger(strings.TrimPrefix(parts[1], "g"))
	if !ok {
		return "", 0, 0, false
	}
	requestID, ok := parseSafeInteger(strings.TrimPrefix(parts[2], "r"))
	if !ok {
		return "", 0, 0, false
	}
	return parts[0], generation, requestID, true
}

func parseSafeInteger(value string) (uint64, bool) {
	if value == "" {
		return 0, false
	}
	parsed, err := strconv.ParseUint(value, 10, 64)
	return parsed, err == nil && parsed > 0 && parsed <= 9007199254740991 && strconv.FormatUint(parsed, 10) == value
}

func copyAction(action *compilercontract.Action) *compilercontract.Action {
	if action == nil {
		return nil
	}
	copy := *action
	return &copy
}

func copyMessageValue(message *compilercontract.MessageValue) *compilercontract.MessageValue {
	if message == nil {
		return nil
	}
	copy := *message
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
