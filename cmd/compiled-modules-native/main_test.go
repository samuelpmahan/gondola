package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulechild"
	"github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent"
)

func TestRunRecordsTheFrozenBridgeOrderAndSourceEvents(t *testing.T) {
	scriptPath := filepath.Join("..", "..", scenarioPath)
	var output bytes.Buffer
	if err := run(scriptPath, &output); err != nil {
		t.Fatal(err)
	}
	var got replayOutput
	if err := json.Unmarshal(output.Bytes(), &got); err != nil {
		t.Fatalf("decode native replay: %v", err)
	}
	if got.Schema != outputSchema || got.Name != "independent-module-pair-v1" {
		t.Fatalf("native header = %q / %q", got.Schema, got.Name)
	}
	if len(got.Events) != 24 || len(got.Steps) != 16 {
		t.Fatalf("events/steps = %d/%d, want 24/16", len(got.Events), len(got.Steps))
	}
	wantInitialCalls := []string{"parent.Init", "child.Init", "parent.Output", "child.Input", "child.Publication", "parent.Receive"}
	if calls := bridgeCalls(got.Initial.Bridges); !reflect.DeepEqual(calls, wantInitialCalls) {
		t.Fatalf("initial bridge order = %#v, want %#v", calls, wantInitialCalls)
	}
	if got.Initial.ParentState.Step != 1 || got.Initial.ParentState.Revision != 1 ||
		got.Initial.ChildState.Step != 1 || got.Initial.ChildState.InputRevision != 1 ||
		got.Initial.ParentState.PublishedRevision != 1 {
		t.Fatalf("initial synchronized state = %#v / %#v", got.Initial.ParentState, got.Initial.ChildState)
	}
	wantEventIndexes := []int{0, 1, 2, 3, 5, 7, 9, 10, 13, 14, 15, 17, 18, 19, 21, 22}
	for index, want := range wantEventIndexes {
		step := got.Steps[index]
		if step.EventIndex != want {
			t.Fatalf("step %d source index = %d, want %d", index, step.EventIndex, want)
		}
		if len(step.Effects) != 0 {
			t.Fatalf("step %d effects = %#v", index, step.Effects)
		}
		if got.Events[want].StepIndex == nil || *got.Events[want].StepIndex != index {
			t.Fatalf("source event %d stepIndex = %#v, want %d", want, got.Events[want].StepIndex, index)
		}
	}
	for _, noTickIndex := range []int{4, 6, 8, 11, 12, 16, 20, 23} {
		if got.Events[noTickIndex].StepIndex != nil || got.Events[noTickIndex].Message != nil {
			t.Fatalf("no-tick event %d = %#v", noTickIndex, got.Events[noTickIndex])
		}
	}
	for _, index := range []int{4, 6, 8, 16, 20} {
		if got.Events[index].Action == nil || got.Events[index].Target == "" {
			t.Fatalf("disabled action %d lost source action metadata: %#v", index, got.Events[index])
		}
	}
	if got.Events[0].Action == nil || got.Events[0].Action.Path != "2/1" || got.Events[0].Target != "child" {
		t.Fatalf("first action metadata = %#v", got.Events[0])
	}
	if got.Events[12].SourceEvent == nil || *got.Events[12].SourceEvent != 0 {
		t.Fatalf("stale callback source metadata = %#v", got.Events[12])
	}
	if got.Steps[0].ChildState.Counter.Count != 1 || got.Steps[0].ParentState.PublishedCount != 1 {
		t.Fatalf("step-1 add state = %#v / %#v", got.Steps[0].ChildState, got.Steps[0].ParentState)
	}
	if got.Steps[2].ChildState.Counter.Count != 3 || got.Steps[2].ChildState.Step != 2 || got.Steps[2].ParentState.PublishedCount != 3 {
		t.Fatalf("step-2 add state = %#v / %#v", got.Steps[2].ChildState, got.Steps[2].ParentState)
	}
	if got.Steps[4].ChildState.Counter.Count != 0 || !got.Steps[4].ChildState.Locked || got.Steps[4].ParentState.PublishedCount != 0 {
		t.Fatalf("reset while locked state = %#v / %#v", got.Steps[4].ChildState, got.Steps[4].ParentState)
	}
	if got.Steps[12].ChildState.Counter.Count != 0 || got.Steps[12].ChildState.InputRevision != 7 {
		t.Fatalf("direct locked add state = %#v", got.Steps[12].ChildState)
	}
	if got.Steps[14].ChildState.Counter.Count != 1 || got.Steps[14].ChildState.InputRevision != 8 || got.Steps[14].ParentState.Revision != 8 {
		t.Fatalf("final add input state = %#v / %#v", got.Steps[14].ChildState, got.Steps[14].ParentState)
	}
}

func TestDispatchUsesParentThenInputOrChildThenPublicationOrder(t *testing.T) {
	parentState := moduleparent.Init()
	childState := modulechild.Init()
	parentCheckpoint, err := dispatchMessage(0, "go-message", "parent", compilercontract.MessageValue{Name: "step.up"}, &parentState, &childState)
	if err != nil {
		t.Fatal(err)
	}
	if calls := bridgeCalls(parentCheckpoint.Bridges); !reflect.DeepEqual(calls, []string{"parent.Update", "parent.Output", "child.Input"}) {
		t.Fatalf("parent event bridge order = %#v", calls)
	}
	childCheckpoint, err := dispatchMessage(1, "go-message", "child", compilercontract.MessageValue{Name: "add"}, &parentState, &childState)
	if err != nil {
		t.Fatal(err)
	}
	if calls := bridgeCalls(childCheckpoint.Bridges); !reflect.DeepEqual(calls, []string{"child.Update", "child.Publication", "parent.Receive"}) {
		t.Fatalf("child event bridge order = %#v", calls)
	}
	if parentState.PublishedCount != 2 || parentState.PublishedRevision != 2 {
		t.Fatalf("child publication did not reach parent: %#v", parentState)
	}
}

func TestGenericClicksResolveDisabledControlsFromCurrentGoViews(t *testing.T) {
	script := scenario{
		Schema: scenarioSchema,
		Name:   "generic-disabled-clicks",
		Events: []scenarioEvent{
			{Kind: "click", Target: "child", Action: &compilercontract.Action{Path: "2/2", Event: "click", Value: ""}},
			{Kind: "click", Target: "parent", Action: &compilercontract.Action{Path: "3", Event: "click", Value: ""}},
			{Kind: "click", Target: "child", Action: &compilercontract.Action{Path: "2/1", Event: "click", Value: ""}},
			{Kind: "click", Target: "parent", Action: &compilercontract.Action{Path: "1", Event: "click", Value: ""}},
			{Kind: "click", Target: "parent", Action: &compilercontract.Action{Path: "4", Event: "click", Value: ""}},
			{Kind: "click", Target: "child", Action: &compilercontract.Action{Path: "2/1", Event: "click", Value: ""}},
		},
	}
	got, err := replay(script)
	if err != nil {
		t.Fatalf("generic click should be resolved against the current Go view: %v", err)
	}
	if len(got.Steps) != 3 {
		t.Fatalf("steps = %d, want lock toggle, input reset, and enabled Add", len(got.Steps))
	}
	for _, index := range []int{0, 2, 3} {
		if got.Events[index].Message != nil || got.Events[index].StepIndex != nil {
			t.Fatalf("disabled click %d dispatched: %#v", index, got.Events[index])
		}
		if got.Events[index].Action == nil || got.Events[index].Target == "" {
			t.Fatalf("disabled click %d lost source action: %#v", index, got.Events[index])
		}
	}
	if got.Events[1].Message == nil || got.Events[4].Message == nil || got.Events[5].Message == nil {
		t.Fatalf("enabled clicks did not dispatch: %#v", got.Events)
	}
	if got.Events[5].Message.Name != "add" || got.Events[5].StepIndex == nil || *got.Events[5].StepIndex != 2 {
		t.Fatalf("enabled Add event = %#v", got.Events[5])
	}
	if calls := bridgeCalls(got.Steps[0].Bridges); !reflect.DeepEqual(calls, []string{"parent.Update", "parent.Output", "child.Input"}) {
		t.Fatalf("lock toggle bridges = %#v", calls)
	}
	if calls := bridgeCalls(got.Steps[2].Bridges); !reflect.DeepEqual(calls, []string{"child.Update", "child.Publication", "parent.Receive"}) {
		t.Fatalf("enabled Add bridges = %#v", calls)
	}
	var serialized struct {
		Events []map[string]any `json:"events"`
	}
	data, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &serialized); err != nil {
		t.Fatal(err)
	}
	for _, index := range []int{0, 2, 3} {
		if serialized.Events[index]["disabled"] != true {
			t.Fatalf("disabled flag for click %d = %#v", index, serialized.Events[index]["disabled"])
		}
	}
	for _, index := range []int{1, 4, 5} {
		if serialized.Events[index]["disabled"] != false {
			t.Fatalf("enabled flag for click %d = %#v", index, serialized.Events[index]["disabled"])
		}
	}
}

func TestExplicitDisabledActionStillAssertsGoViewState(t *testing.T) {
	disabled := scenario{Schema: scenarioSchema, Name: "disabled-action", Events: []scenarioEvent{{
		Kind: "disabled-action", Target: "child", Action: &compilercontract.Action{Path: "2/2", Event: "click", Value: ""},
	}}}
	got, err := replay(disabled)
	if err != nil {
		t.Fatalf("disabled-action on Go-disabled Reset should pass: %v", err)
	}
	if len(got.Steps) != 0 || got.Events[0].Message != nil || got.Events[0].StepIndex != nil {
		t.Fatalf("disabled-action dispatched: %#v", got)
	}
	data, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	var serialized struct {
		Events []map[string]any `json:"events"`
	}
	if err := json.Unmarshal(data, &serialized); err != nil {
		t.Fatal(err)
	}
	if serialized.Events[0]["disabled"] != true {
		t.Fatalf("disabled-action flag = %#v", serialized.Events[0]["disabled"])
	}

	enabled := scenario{Schema: scenarioSchema, Name: "invalid-disabled-action", Events: []scenarioEvent{{
		Kind: "disabled-action", Target: "child", Action: &compilercontract.Action{Path: "2/1", Event: "click", Value: ""},
	}}}
	if _, err := replay(enabled); err == nil {
		t.Fatal("disabled-action on Go-enabled Add was accepted")
	}
}

func TestScenarioRejectsUnknownFieldsAndMalformedActions(t *testing.T) {
	for _, input := range []string{
		`{"schema":"gobi.compiled-modules-scenario/v1","name":"bad","events":[],"extra":true}`,
		`{"schema":"gobi.compiled-modules-scenario/v1","name":"bad","events":[{"kind":"click","target":"child","action":{"path":"9","event":"click","value":""}}]}`,
	} {
		path := filepath.Join(t.TempDir(), "scenario.json")
		if err := os.WriteFile(path, []byte(input), 0o600); err != nil {
			t.Fatal(err)
		}
		var output bytes.Buffer
		if err := run(path, &output); err == nil {
			t.Fatalf("run accepted malformed scenario %s", input)
		}
		if output.Len() != 0 {
			t.Fatalf("malformed scenario wrote output: %s", output.String())
		}
	}
}

func bridgeCalls(records []bridgeRecord) []string {
	calls := make([]string, len(records))
	for index, record := range records {
		calls[index] = record.Call
	}
	return calls
}
