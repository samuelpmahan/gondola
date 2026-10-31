package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/fixtures/compiled/publications"
)

func TestScenarioTracePreservesPR16EnvelopeAndPublicationSnapshots(t *testing.T) {
	var output bytes.Buffer
	if err := run(filepath.Join("..", "..", "fixtures", "compiled", "publications", "scenario.json"), &output); err != nil {
		t.Fatal(err)
	}
	var trace replayOutput
	if err := json.Unmarshal(output.Bytes(), &trace); err != nil {
		t.Fatal(err)
	}
	if trace.Schema != outputSchema || trace.PackagePath != packagePath || trace.ComponentID != componentID {
		t.Fatalf("trace identity = %#v", trace)
	}
	if len(trace.Events) != 50 || len(trace.Steps) != 45 {
		t.Fatalf("trace events/steps = %d/%d, want 50/45", len(trace.Events), len(trace.Steps))
	}
	for index, event := range trace.Events {
		if event.Action == nil {
			continue
		}
		if event.Value == nil || *event.Value != event.Action.Value || event.Path != event.Action.Path || event.Event != event.Action.Event {
			t.Fatalf("event %d nested/flattened action metadata differs: %#v", index, event)
		}
	}
	initial := trace.InitialState
	if initial.Parent.Generation != 1 || len(initial.Children) != 2 || initial.Children[0].Key != "oak" || initial.Children[0].Generation != 2 || initial.Children[1].Key != "elm" || initial.Children[1].Generation != 3 {
		t.Fatalf("initial state = %#v", initial)
	}
	if initial.NextGeneration != 3 || initial.Input != (publications.ParentInput{Step: 1, Revision: 1}) || initial.Publications == nil || len(initial.Publications) != 0 || initial.NextPublication != 0 {
		t.Fatalf("initial publication state = %#v", initial)
	}

	if trace.Events[0].Action == nil || *trace.Events[0].Action != (compilercontract.Action{Path: "1/0/1", Event: "click", Value: ""}) || trace.Events[0].Value == nil || *trace.Events[0].Value != "" {
		t.Fatalf("click action metadata = %#v", trace.Events[0].Action)
	}
	for _, index := range []int{6, 7, 26, 27, 28} {
		if trace.Events[index].StepIndex != nil {
			t.Fatalf("non-dispatch event %d has step index %d", index, *trace.Events[index].StepIndex)
		}
		if trace.Events[index].Message != nil {
			t.Fatalf("non-dispatch event %d has resolved message %#v", index, *trace.Events[index].Message)
		}
	}
	for _, index := range []int{6, 7, 27} {
		if trace.Events[index].Action == nil || trace.Events[index].Value == nil {
			t.Fatalf("source action metadata was dropped at event %d", index)
		}
	}
	if trace.Events[27].SourceEvent == nil || *trace.Events[27].SourceEvent != 0 || trace.Events[27].From != "dom" || trace.Events[27].Expect != "suppressed" {
		t.Fatalf("stale callback metadata = %#v", trace.Events[27])
	}
	if trace.Events[26].From != "dom" || trace.Events[26].To != "react" || trace.Events[26].Target != "root" || trace.Events[28].From != "react" || trace.Events[28].Target != "root" || trace.Events[28].To != "incompatible" || trace.Events[28].Expect != "rejected" {
		t.Fatalf("renderer swap metadata = %#v / %#v", trace.Events[26], trace.Events[28])
	}
	if trace.Events[29].Token != "parent:g1:r1" || trace.Events[29].Message == nil || *trace.Events[29].Message != (compilercontract.MessageValue{Name: "complete", Arg: "parent:g1:r1"}) {
		t.Fatalf("reply metadata = %#v", trace.Events[29])
	}

	captured := stepForEvent(t, trace, 3)
	if len(captured.State.Publications) != 1 || captured.State.Publications[0] != (publications.Publication{
		ID: 1, Key: "oak", ParentGeneration: 1, ChildGeneration: 2, InputRevision: 2, Value: 4,
	}) {
		t.Fatalf("first captured publication = %#v", captured.State.Publications)
	}
	laterCount := stepForEvent(t, trace, 4)
	if laterCount.State.Children[0].Counter.Count != 7 || laterCount.State.Publications[0].Value != 4 {
		t.Fatalf("later count edit mutated captured publication: %#v", laterCount.State)
	}
	staleInput := stepForEvent(t, trace, 21)
	if staleInput.State.LastDecision != "rejected:stale-input:1" || len(staleInput.State.Publications) != 0 || staleInput.State.Parent.Rejected != 2 {
		t.Fatalf("stale input delivery = %#v", staleInput.State)
	}
	for _, eventIndex := range []int{22, 48, 49} {
		before := stepForEvent(t, trace, eventIndex-1)
		after := stepForEvent(t, trace, eventIndex)
		if !reflect.DeepEqual(before.State, after.State) {
			t.Fatalf("unknown/double/noncanonical delivery at event %d changed state: %#v -> %#v", eventIndex, before.State, after.State)
		}
	}
	staleChild := stepForEvent(t, trace, 35)
	if staleChild.State.LastDecision != "rejected:child-generation:5" || len(staleChild.State.Publications) != 0 || staleChild.State.NextPublication != 5 {
		t.Fatalf("reused-key delivery = %#v", staleChild.State)
	}

	removeParent := stepForEvent(t, trace, 42)
	wantCancel := []string{"child:elm:g4:r1", "child:oak:g2:r2", "parent:g1:r2"}
	if removeParent.State.Parent.Alive || len(removeParent.State.Children) != 0 || len(removeParent.Effects) != len(wantCancel) {
		t.Fatalf("parent removal state/effects = %#v / %#v", removeParent.State, removeParent.Effects)
	}
	for index, token := range wantCancel {
		if removeParent.Effects[index].Kind != "lifecycle.cancel" || removeParent.Effects[index].Arg != token {
			t.Fatalf("parent cancellation order = %#v", removeParent.Effects)
		}
	}
	remount := stepForEvent(t, trace, 43)
	if !remount.State.Parent.Alive || remount.State.Parent.Generation != 5 || len(remount.State.Children) != 0 || remount.State.NextGeneration != 5 {
		t.Fatalf("parent remount state = %#v", remount.State)
	}
	if len(remount.State.Publications) != 1 || remount.State.Publications[0].ID != 7 || remount.State.Publications[0].ParentGeneration != 1 {
		t.Fatalf("remount did not preserve old queued publication: %#v", remount.State.Publications)
	}
	oldParent := stepForEvent(t, trace, 46)
	if oldParent.State.LastDecision != "rejected:parent-generation:7" || len(oldParent.State.Publications) != 1 || oldParent.State.Publications[0].ID != 8 {
		t.Fatalf("old parent generation delivery = %#v", oldParent.State)
	}
}

func TestScenarioRejectsNestedActionMismatch(t *testing.T) {
	script := readScenario(t)
	script.Events[0].Action.Path = "1/0/0"
	if err := run(writeScenario(t, script), &bytes.Buffer{}); err == nil {
		t.Fatal("native CLI accepted nested action metadata that disagreed with flattened fields")
	}
}

func TestNativeEffectRepliesRequireLiveHostCorrelation(t *testing.T) {
	request := scenarioEvent{Kind: "go-message", Message: &compilercontract.MessageValue{Name: "child.request", Arg: "oak"}}
	remove := scenarioEvent{Kind: "go-message", Message: &compilercontract.MessageValue{Name: "child.remove", Arg: "oak"}}
	reply := scenarioEvent{Kind: "effect-reply", Token: "child:oak:g2:r1"}
	for name, events := range map[string][]scenarioEvent{
		"duplicate reply":          {request, reply, reply},
		"reply after cancellation": {request, remove, reply},
	} {
		t.Run(name, func(t *testing.T) {
			script := scenario{Schema: scenarioSchema, Name: "correlation-control", PackagePath: packagePath, ComponentID: componentID, Events: events}
			if err := run(writeScenario(t, script), &bytes.Buffer{}); err == nil {
				t.Fatal("native host accepted a reply without a live pending correlation")
			}
		})
	}
}

func TestSnapshotStateClonesChildrenAndPublicationsSlices(t *testing.T) {
	state := publications.Init()
	state.Publications = append(state.Publications, publications.Publication{ID: 1, Key: "oak", Value: 4})
	snapshot := snapshotState(state)
	if &snapshot.Children[0] == &state.Children[0] || &snapshot.Publications[0] == &state.Publications[0] {
		t.Fatal("snapshot shares mutable child or publication slice storage")
	}
	snapshot.Children[0].Key = "elm"
	snapshot.Publications[0].Value = 99
	if state.Children[0].Key != "oak" || state.Publications[0].Value != 4 {
		t.Fatalf("snapshot mutation escaped to source state: %#v", state)
	}
	if !reflect.DeepEqual(snapshot.Publications[0], publications.Publication{ID: 1, Key: "oak", Value: 99}) {
		t.Fatalf("snapshot publication = %#v", snapshot.Publications[0])
	}
}

func readScenario(t *testing.T) scenario {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "fixtures", "compiled", "publications", "scenario.json"))
	if err != nil {
		t.Fatal(err)
	}
	var script scenario
	if err := json.Unmarshal(data, &script); err != nil {
		t.Fatal(err)
	}
	return script
}

func writeScenario(t *testing.T, script scenario) string {
	t.Helper()
	data, err := json.Marshal(script)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "scenario.json")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func stepForEvent(t *testing.T, trace replayOutput, eventIndex int) replayStep {
	t.Helper()
	for _, step := range trace.Steps {
		if step.EventIndex == eventIndex {
			return step
		}
	}
	t.Fatalf("trace has no Go step for source event %d", eventIndex)
	return replayStep{}
}
