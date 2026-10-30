package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"reflect"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/fixtures/compiled/effect"
	"github.com/samuelpmahan/gondola/fixtures/compiled/form"
	"github.com/samuelpmahan/gondola/fixtures/compiled/list"
	"github.com/samuelpmahan/gondola/gobi"
)

const fixtureScriptSchema = "gobi.fixture-script/v1"
const maxNativeDispatches = 256

type fixtureScript struct {
	Schema         string                      `json:"schema"`
	Name           string                      `json:"name"`
	PackagePath    string                      `json:"packagePath"`
	Actions        []compilercontract.Action   `json:"actions"`
	HostScript     compilercontract.HostScript `json:"hostScript"`
	FocusWitnesses []focusWitness              `json:"focusWitnesses"`
	InitialState   json.RawMessage             `json:"initialState"`
	Expectations   []expectedTick              `json:"expectations"`
}

type focusWitness struct {
	BeforeActionIndex  int    `json:"beforeActionIndex"`
	AfterActionIndex   int    `json:"afterActionIndex"`
	Key                string `json:"key"`
	SelectionStart     int    `json:"selectionStart"`
	SelectionEnd       int    `json:"selectionEnd"`
	SelectionDirection string `json:"selectionDirection"`
	DispatchMethod     string `json:"dispatchMethod"`
}

type expectedTick struct {
	ActionIndex      *int                                `json:"actionIndex"`
	CompletionIndex  *int                                `json:"completionIndex"`
	Message          *compilercontract.MessageValue      `json:"message"`
	DispatchID       *string                             `json:"dispatchId"`
	State            json.RawMessage                     `json:"state"`
	RequestedEffects []compilercontract.EffectRequest    `json:"requestedEffects"`
	CompletedEffects []compilercontract.EffectCompletion `json:"completedEffects"`
}

type appAdapter struct {
	packagePath string
	init        func() any
	update      func(any, gobi.Message) (any, []gobi.Effect)
	view        func(any) compilercontract.View
	decodeState func(json.RawMessage) (any, error)
}

type replayState struct {
	appIR                 compilercontract.AppIR
	component             compilercontract.Component
	app                   appAdapter
	script                fixtureScript
	state                 any
	trace                 compilercontract.Trace
	nextDispatch          uint64
	nextHostStep          int
	requests              []compilercontract.EffectRequest
	completions           []compilercontract.EffectCompletion
	actionTickIndexes     []uint64
	completionTickIndexes []uint64
}

func replay(appIR compilercontract.AppIR, script fixtureScript) (compilercontract.Trace, error) {
	if script.Schema != fixtureScriptSchema {
		return compilercontract.Trace{}, fmt.Errorf("fixture script schema must be %q", fixtureScriptSchema)
	}
	if script.Name == "" || script.PackagePath == "" {
		return compilercontract.Trace{}, errors.New("fixture script name and packagePath are required")
	}
	if script.Actions == nil || script.FocusWitnesses == nil || script.Expectations == nil {
		return compilercontract.Trace{}, errors.New("fixture script actions, focusWitnesses, and expectations must be arrays")
	}
	if script.InitialState == nil {
		return compilercontract.Trace{}, errors.New("fixture script initialState is required")
	}
	if script.HostScript.Schema != compilercontract.HostScriptSchema || script.HostScript.Steps == nil {
		return compilercontract.Trace{}, errors.New("fixture script must carry a v1 hostScript with a non-null steps array")
	}
	if appIR.Schema != compilercontract.AppIRSchema {
		return compilercontract.Trace{}, fmt.Errorf("AppIR schema must be %q", compilercontract.AppIRSchema)
	}
	if diagnostics := compilercontract.ValidateAppIR(appIR); len(diagnostics) != 0 {
		return compilercontract.Trace{}, fmt.Errorf("invalid AppIR: %+v", diagnostics)
	}
	if appIR.PackagePath != script.PackagePath {
		return compilercontract.Trace{}, fmt.Errorf("AppIR packagePath %q does not match script %q", appIR.PackagePath, script.PackagePath)
	}
	adapter, ok := adapterFor(script.PackagePath)
	if !ok {
		return compilercontract.Trace{}, fmt.Errorf("no direct Go fixture registered for %q", script.PackagePath)
	}
	component, err := findComponent(appIR, script.PackagePath)
	if err != nil {
		return compilercontract.Trace{}, err
	}
	if !hasType(appIR.Types, component.StateType) {
		return compilercontract.Trace{}, fmt.Errorf("AppIR has no state type %q", component.StateType)
	}
	r := &replayState{
		appIR: appIR, component: component, app: adapter, script: script,
		state: adapter.init(), trace: compilercontract.NewTrace(component.ID),
		requests: []compilercontract.EffectRequest{}, completions: []compilercontract.EffectCompletion{},
		actionTickIndexes: make([]uint64, len(script.Actions)), completionTickIndexes: []uint64{},
	}
	if err := r.checkExpectedState(script.InitialState, r.state, "initialState"); err != nil {
		return compilercontract.Trace{}, err
	}
	if _, err := r.appendTick(nil, nil, nil, []compilercontract.EffectRequest{}, []compilercontract.EffectCompletion{}); err != nil {
		return compilercontract.Trace{}, err
	}
	for i := range script.Actions {
		action := script.Actions[i]
		message, err := resolveAction(r.app.view(r.state), action)
		if err != nil {
			return compilercontract.Trace{}, fmt.Errorf("action %d: %w", i, err)
		}
		if message == nil {
			r.actionTickIndexes[i] = uint64(len(r.trace.Ticks))
			if _, err := r.appendTick(&action, nil, nil, []compilercontract.EffectRequest{}, []compilercontract.EffectCompletion{}); err != nil {
				return compilercontract.Trace{}, err
			}
			continue
		}
		index, err := r.dispatch(&action, *message, []compilercontract.EffectCompletion{})
		if err != nil {
			return compilercontract.Trace{}, fmt.Errorf("action %d: %w", i, err)
		}
		// dispatch appends the tick before processing any replies; the action
		// tick is the first index returned.
		r.actionTickIndexes[i] = index
	}
	if r.nextHostStep != len(script.HostScript.Steps) {
		return compilercontract.Trace{}, fmt.Errorf("unused host steps: consumed %d of %d", r.nextHostStep, len(script.HostScript.Steps))
	}
	if diagnostics := compilercontract.ValidateHostScript(script.HostScript, r.requests, r.completions); len(diagnostics) != 0 {
		return compilercontract.Trace{}, fmt.Errorf("invalid HostScript: %+v", diagnostics)
	}
	if err := r.checkExpectations(); err != nil {
		return compilercontract.Trace{}, err
	}
	if diagnostics := compilercontract.ValidateTrace(r.trace, appIR); len(diagnostics) != 0 {
		return compilercontract.Trace{}, fmt.Errorf("invalid native trace: %+v", diagnostics)
	}
	return r.trace, nil
}

func (r *replayState) dispatch(action *compilercontract.Action, message compilercontract.MessageValue, completed []compilercontract.EffectCompletion) (uint64, error) {
	if r.nextDispatch >= maxNativeDispatches {
		return 0, errors.New("native replay exceeded dispatch limit")
	}
	r.nextDispatch++
	dispatchID := fmt.Sprintf("dispatch-%04d", r.nextDispatch)
	nextState, effects := r.app.update(r.state, gobi.Message{Name: message.Name, Arg: message.Arg})
	r.state = nextState
	requested := make([]compilercontract.EffectRequest, len(effects))
	for i, effectValue := range effects {
		if effectValue.Kind != string(compilercontract.EffectKindRequest) {
			return 0, fmt.Errorf("unsupported effect kind %q", effectValue.Kind)
		}
		request := compilercontract.EffectRequest{
			DispatchID: dispatchID, EffectIndex: uint64(i), Effect: compilercontract.EffectFromGobi(effectValue),
		}
		requested[i] = request
		r.requests = append(r.requests, request)
	}
	actionIndex, err := r.appendTick(action, &message, &dispatchID, requested, completed)
	if err != nil {
		return 0, err
	}
	for _, request := range requested {
		if err := r.deliverRequest(request); err != nil {
			return 0, err
		}
	}
	return actionIndex, nil
}

func (r *replayState) deliverRequest(request compilercontract.EffectRequest) error {
	if r.nextHostStep >= len(r.script.HostScript.Steps) {
		return fmt.Errorf("effect request %+v has no HostScript step", request)
	}
	step := r.script.HostScript.Steps[r.nextHostStep]
	r.nextHostStep++
	if step.Request != request {
		return fmt.Errorf("HostScript request %d does not match native request", r.nextHostStep-1)
	}
	if step.Completion == nil {
		return nil
	}
	if step.Completion.Name != request.Effect.Reply {
		return fmt.Errorf("HostScript completion name %q does not match effect reply %q", step.Completion.Name, request.Effect.Reply)
	}
	completion := compilercontract.EffectCompletion{
		DispatchID: request.DispatchID, EffectIndex: request.EffectIndex, Message: *step.Completion,
	}
	r.completions = append(r.completions, completion)
	index, err := r.dispatch(nil, *step.Completion, []compilercontract.EffectCompletion{completion})
	if err != nil {
		return fmt.Errorf("effect completion: %w", err)
	}
	r.completionTickIndexes = append(r.completionTickIndexes, index)
	return nil
}

func (r *replayState) appendTick(action *compilercontract.Action, message *compilercontract.MessageValue, dispatchID *string, requested []compilercontract.EffectRequest, completed []compilercontract.EffectCompletion) (uint64, error) {
	state, err := compilercontract.EncodeValue(r.state, r.component.StateType, r.appIR.Types)
	if err != nil {
		return 0, fmt.Errorf("encode state at tick %d: %w", len(r.trace.Ticks), err)
	}
	view := r.app.view(r.state)
	if err := validateView(view); err != nil {
		return 0, fmt.Errorf("validate view at tick %d: %w", len(r.trace.Ticks), err)
	}
	index := uint64(len(r.trace.Ticks))
	tick := compilercontract.Tick{
		Index: index, Action: action, Message: message, DispatchID: dispatchID,
		State: state, RequestedEffects: requested, CompletedEffects: completed,
		View: compilercontract.ViewRecordFromView(view), DOM: nil,
	}
	if err := compilercontract.AppendTick(&r.trace, tick); err != nil {
		return 0, fmt.Errorf("append trace tick: %w", err)
	}
	return index, nil
}

func resolveAction(view compilercontract.View, action compilercontract.Action) (*compilercontract.MessageValue, error) {
	target, ok, err := nodeAtPath(view.Tree, action.Path)
	if err != nil {
		return nil, err
	}
	if !ok || isDisabled(target) {
		return nil, nil
	}
	for _, binding := range view.Bindings {
		if binding.Path != action.Path || binding.Event != action.Event {
			continue
		}
		message := compilercontract.MessageValue{Name: binding.Message}
		switch binding.Source {
		case compilercontract.TargetValue:
			message.Arg = action.Value
		case compilercontract.TargetChecked:
			if action.Value != "true" && action.Value != "false" {
				return nil, fmt.Errorf("target.checked action value must be exactly true or false")
			}
			message.Arg = action.Value
		default:
			return nil, fmt.Errorf("unsupported binding source %q", binding.Source)
		}
		return &message, nil
	}
	var match *gobi.On
	for i := range target.On {
		if target.On[i].Event != action.Event {
			continue
		}
		if match != nil {
			return nil, fmt.Errorf("ambiguous literal event %q at path %q", action.Event, action.Path)
		}
		match = &target.On[i]
	}
	if match == nil {
		return nil, nil
	}
	// Action.Value is intentionally ignored here. On.Arg always remains a
	// literal, even when its contents resemble a binding source.
	return &compilercontract.MessageValue{Name: match.Message, Arg: match.Arg}, nil
}

func validateView(view compilercontract.View) error {
	seen := make(map[string]bool, len(view.Bindings))
	for i, binding := range view.Bindings {
		key := binding.Path + "\x00" + binding.Event
		if binding.Path == "" || binding.Event == "" || binding.Message == "" || seen[key] {
			return fmt.Errorf("binding %d has missing or duplicate path/event/message", i)
		}
		seen[key] = true
		target, ok, err := nodeAtPath(view.Tree, binding.Path)
		if err != nil || !ok {
			return fmt.Errorf("binding %d target path %q does not exist", i, binding.Path)
		}
		if target.Kind != gobi.Element || target.Tag != "input" {
			return fmt.Errorf("binding %d target must be an input element", i)
		}
		inputType := attrValue(target, "type")
		switch binding.Source {
		case compilercontract.TargetValue:
			if inputType != "text" || !hasAttribute(target, "value") {
				return fmt.Errorf("target.value binding %d requires an input type=text with a value", i)
			}
		case compilercontract.TargetChecked:
			if inputType != "checkbox" {
				return fmt.Errorf("target.checked binding %d requires an input type=checkbox", i)
			}
		default:
			return fmt.Errorf("binding %d has unsupported source %q", i, binding.Source)
		}
		for _, handler := range target.On {
			if handler.Event == binding.Event {
				return fmt.Errorf("binding %d collides with a literal handler", i)
			}
		}
	}
	return validateUniqueSiblingKeys(view.Tree)
}

func validateUniqueSiblingKeys(node gobi.Node) error {
	keys := make(map[string]bool, len(node.Kids))
	for _, child := range node.Kids {
		if child.Key != "" {
			if keys[child.Key] {
				return fmt.Errorf("duplicate sibling key %q", child.Key)
			}
			keys[child.Key] = true
		}
		if err := validateUniqueSiblingKeys(child); err != nil {
			return err
		}
	}
	return nil
}

func nodeAtPath(root gobi.Node, path string) (gobi.Node, bool, error) {
	if path == "" {
		return root, true, nil
	}
	current := root
	for _, part := range strings.Split(path, "/") {
		if part == "" {
			return gobi.Node{}, false, fmt.Errorf("invalid empty child index in path %q", path)
		}
		index, err := strconv.Atoi(part)
		if err != nil || index < 0 || strconv.Itoa(index) != part {
			return gobi.Node{}, false, fmt.Errorf("invalid child index %q in path %q", part, path)
		}
		if index >= len(current.Kids) {
			return gobi.Node{}, false, nil
		}
		current = current.Kids[index]
	}
	return current, true, nil
}

func isDisabled(node gobi.Node) bool {
	for _, attr := range node.Attrs {
		if attr.Name == "disabled" && attr.Flag {
			return true
		}
	}
	return false
}

func attrValue(node gobi.Node, name string) string {
	for _, attr := range node.Attrs {
		if attr.Name == name && !attr.Flag {
			return attr.Value
		}
	}
	return ""
}

func hasAttribute(node gobi.Node, name string) bool {
	for _, attr := range node.Attrs {
		if attr.Name == name && !attr.Flag {
			return true
		}
	}
	return false
}

func findComponent(appIR compilercontract.AppIR, packagePath string) (compilercontract.Component, error) {
	var found *compilercontract.Component
	for i := range appIR.Components {
		component := &appIR.Components[i]
		if component.PackagePath != packagePath {
			continue
		}
		if found != nil {
			return compilercontract.Component{}, fmt.Errorf("AppIR has multiple components in %q", packagePath)
		}
		found = component
	}
	if found == nil {
		return compilercontract.Component{}, fmt.Errorf("AppIR has no component for %q", packagePath)
	}
	if found.ID == "" || found.StateType == "" || found.Init == "" || found.Update == "" || found.View == "" {
		return compilercontract.Component{}, fmt.Errorf("AppIR component for %q is missing required symbols", packagePath)
	}
	return *found, nil
}

func hasType(types []compilercontract.TypeInfo, id compilercontract.TypeID) bool {
	for _, info := range types {
		if info.ID == id {
			return true
		}
	}
	return false
}

func adapterFor(packagePath string) (appAdapter, bool) {
	switch packagePath {
	case "github.com/samuelpmahan/gondola/counter":
		return appAdapter{
			packagePath: packagePath,
			init:        func() any { return counter.Init() },
			update: func(state any, message gobi.Message) (any, []gobi.Effect) {
				return counter.Update(state.(counter.State), message)
			},
			view: func(state any) compilercontract.View {
				return compilercontract.NewView(counter.View(state.(counter.State)))
			},
			decodeState: func(raw json.RawMessage) (any, error) {
				var state counter.State
				err := decodeExact(raw, &state)
				return state, err
			},
		}, true
	case "github.com/samuelpmahan/gondola/fixtures/compiled/form":
		return appAdapter{
			packagePath: packagePath,
			init:        func() any { return form.Init() },
			update: func(state any, message gobi.Message) (any, []gobi.Effect) {
				return form.Update(state.(form.State), message)
			},
			view: func(state any) compilercontract.View { return form.View(state.(form.State)) },
			decodeState: func(raw json.RawMessage) (any, error) {
				var state form.State
				err := decodeExact(raw, &state)
				return state, err
			},
		}, true
	case "github.com/samuelpmahan/gondola/fixtures/compiled/list":
		return appAdapter{
			packagePath: packagePath,
			init:        func() any { return list.Init() },
			update: func(state any, message gobi.Message) (any, []gobi.Effect) {
				return list.Update(state.(list.State), message)
			},
			view: func(state any) compilercontract.View { return list.View(state.(list.State)) },
			decodeState: func(raw json.RawMessage) (any, error) {
				var state list.State
				err := decodeExact(raw, &state)
				return state, err
			},
		}, true
	case "github.com/samuelpmahan/gondola/fixtures/compiled/effect":
		return appAdapter{
			packagePath: packagePath,
			init:        func() any { return effect.Init() },
			update: func(state any, message gobi.Message) (any, []gobi.Effect) {
				return effect.Update(state.(effect.State), message)
			},
			view:        func(state any) compilercontract.View { return effect.View(state.(effect.State)) },
			decodeState: decodeEffectState,
		}, true
	default:
		return appAdapter{}, false
	}
}

func decodeExact(raw json.RawMessage, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != nil && !errors.Is(err, io.EOF) {
		return err
	} else if err == nil {
		return errors.New("trailing JSON value")
	}
	return nil
}

func decodeEffectState(raw json.RawMessage) (any, error) {
	var expected struct {
		Input            string
		Value            string
		Status           string
		Pending          bool
		Requests         int
		Completions      int
		NegativeZeroBits string
	}
	if err := decodeExact(raw, &expected); err != nil {
		return nil, err
	}
	if expected.NegativeZeroBits != "8000000000000000" {
		return nil, errors.New("effect expected state must preserve negative-zero bits")
	}
	return effect.State{
		Input: expected.Input, Value: expected.Value, Status: expected.Status,
		Pending: expected.Pending, Requests: expected.Requests, Completions: expected.Completions,
		NegativeZero: math.Float64frombits(0x8000000000000000),
	}, nil
}

func (r *replayState) checkExpectedState(raw json.RawMessage, actual any, label string) error {
	want, err := r.app.decodeState(raw)
	if err != nil {
		return fmt.Errorf("decode %s expectation: %w", label, err)
	}
	wantValue, err := compilercontract.EncodeValue(want, r.component.StateType, r.appIR.Types)
	if err != nil {
		return fmt.Errorf("encode %s expectation: %w", label, err)
	}
	gotValue, err := compilercontract.EncodeValue(actual, r.component.StateType, r.appIR.Types)
	if err != nil {
		return fmt.Errorf("encode %s actual state: %w", label, err)
	}
	if !reflect.DeepEqual(wantValue, gotValue) {
		return fmt.Errorf("%s state mismatch: expected %+v, got %+v", label, wantValue, gotValue)
	}
	return nil
}

func (r *replayState) checkExpectations() error {
	if len(r.script.Expectations) != len(r.script.Actions)+len(r.completionTickIndexes) {
		return fmt.Errorf("script has %d expectations for %d action and %d completion ticks", len(r.script.Expectations), len(r.script.Actions), len(r.completionTickIndexes))
	}
	for i, expected := range r.script.Expectations {
		var index uint64
		if expected.ActionIndex != nil && expected.CompletionIndex == nil {
			if *expected.ActionIndex < 0 || *expected.ActionIndex >= len(r.actionTickIndexes) {
				return fmt.Errorf("expectation %d has invalid actionIndex", i)
			}
			index = r.actionTickIndexes[*expected.ActionIndex]
		} else if expected.ActionIndex == nil && expected.CompletionIndex != nil {
			if *expected.CompletionIndex < 0 || *expected.CompletionIndex >= len(r.completionTickIndexes) {
				return fmt.Errorf("expectation %d has invalid completionIndex", i)
			}
			index = r.completionTickIndexes[*expected.CompletionIndex]
		} else {
			return fmt.Errorf("expectation %d must name exactly one actionIndex or completionIndex", i)
		}
		if index >= uint64(len(r.trace.Ticks)) {
			return fmt.Errorf("expectation %d resolves outside trace", i)
		}
		actual := r.trace.Ticks[index]
		if !reflect.DeepEqual(expected.Message, actual.Message) || !reflect.DeepEqual(expected.DispatchID, actual.DispatchID) {
			return fmt.Errorf("expectation %d message/dispatch mismatch", i)
		}
		if expected.State == nil {
			return fmt.Errorf("expectation %d is missing state", i)
		}
		wantState, err := r.app.decodeState(expected.State)
		if err != nil {
			return fmt.Errorf("expectation %d decode state: %w", i, err)
		}
		wantValue, err := compilercontract.EncodeValue(wantState, r.component.StateType, r.appIR.Types)
		if err != nil {
			return fmt.Errorf("expectation %d encode state: %w", i, err)
		}
		if !reflect.DeepEqual(wantValue, actual.State) {
			return fmt.Errorf("expectation %d state mismatch", i)
		}
		if expected.RequestedEffects == nil || expected.CompletedEffects == nil {
			return fmt.Errorf("expectation %d effects must be non-null arrays", i)
		}
		if !reflect.DeepEqual(expected.RequestedEffects, actual.RequestedEffects) || !reflect.DeepEqual(expected.CompletedEffects, actual.CompletedEffects) {
			return fmt.Errorf("expectation %d effect mismatch", i)
		}
	}
	return nil
}
