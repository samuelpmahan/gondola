package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func TestScenarioTraceSeparatesGoTicksFromNoTickEvents(t *testing.T) {
	var output bytes.Buffer
	if err := run(filepath.Join("..", "..", "fixtures", "compiled", "children", "scenario.json"), &output); err != nil {
		t.Fatal(err)
	}
	var trace replayOutput
	if err := json.Unmarshal(output.Bytes(), &trace); err != nil {
		t.Fatal(err)
	}
	if trace.Schema != outputSchema || trace.PackagePath != packagePath || trace.ComponentID != componentID {
		t.Fatalf("trace identity = %#v", trace)
	}
	if len(trace.Events) != 42 || len(trace.Steps) != 38 {
		t.Fatalf("trace events/steps = %d/%d, want 42/38", len(trace.Events), len(trace.Steps))
	}
	if trace.InitialState.Parent.Generation != 1 || len(trace.InitialState.Children) != 2 || trace.InitialState.Children[0].Key != "oak" || trace.InitialState.Children[1].Key != "elm" {
		t.Fatalf("initial state = %#v", trace.InitialState)
	}
	for _, index := range []int{9, 10, 11, 12} {
		if trace.Events[index].StepIndex != nil {
			t.Fatalf("no-tick event %d has step index %d", index, *trace.Events[index].StepIndex)
		}
	}
	if trace.Events[11].SourceEvent == nil || *trace.Events[11].SourceEvent != 0 || trace.Events[11].Message == nil || *trace.Events[11].Message != (compilercontract.MessageValue{Name: "counter.add", Arg: "oak"}) {
		t.Fatalf("stale callback metadata = %#v", trace.Events[11])
	}
	if trace.Steps[7].State.Children[0].Key != "oak" || trace.Steps[7].State.Children[1].Key != "ash" || trace.Steps[8].State.Children[0].Key != "ash" || trace.Steps[8].State.Children[1].Key != "oak" {
		t.Fatalf("move history was not retained: %#v / %#v", trace.Steps[7].State.Children, trace.Steps[8].State.Children)
	}
	remove := stepForEvent(t, trace, 14)
	if !reflect.DeepEqual(remove.Effects, []compilercontract.EffectValue{{Kind: "lifecycle.cancel", Name: "cancel", Arg: "child:oak:g2:r1", Reply: ""}}) {
		t.Fatalf("selective remove effects = %#v", remove.Effects)
	}
	clear := stepForEvent(t, trace, 24)
	wantClear := []compilercontract.EffectValue{
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "child:oak:g5:r2", Reply: ""},
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "child:elm:g3:r2", Reply: ""},
	}
	if !reflect.DeepEqual(clear.Effects, wantClear) || len(clear.State.Children) != 0 || !clear.State.Parent.Pending {
		t.Fatalf("clear state/effects = %#v / %#v", clear.State, clear.Effects)
	}
	removeParent := stepForEvent(t, trace, 31)
	wantRemoveParent := []compilercontract.EffectValue{
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "child:oak:g7:r1", Reply: ""},
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "child:pine:g6:r1", Reply: ""},
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "parent:g1:r2", Reply: ""},
	}
	if !reflect.DeepEqual(removeParent.Effects, wantRemoveParent) || removeParent.State.Parent.Alive || len(removeParent.State.Children) != 0 {
		t.Fatalf("parent removal state/effects = %#v / %#v", removeParent.State, removeParent.Effects)
	}
	remount := stepForEvent(t, trace, 35)
	if !remount.State.Parent.Alive || remount.State.Parent.Generation != 8 || remount.State.NextGeneration != 8 || remount.State.Children == nil || len(remount.State.Children) != 0 {
		t.Fatalf("remount state = %#v", remount.State)
	}
}

func TestScenarioRejectsClickPathAndMessageMismatch(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "fixtures", "compiled", "children", "scenario.json"))
	if err != nil {
		t.Fatal(err)
	}
	var script scenario
	if err := json.Unmarshal(data, &script); err != nil {
		t.Fatal(err)
	}
	script.Events[0].Message = &compilercontract.MessageValue{Name: "counter.add", Arg: "elm"}
	mutated, err := json.Marshal(script)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "bad-scenario.json")
	if err := os.WriteFile(path, mutated, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := run(path, &bytes.Buffer{}); err == nil {
		t.Fatal("native trace accepted a click whose expected message disagreed with the Gobi view")
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
			data, err := json.Marshal(script)
			if err != nil {
				t.Fatal(err)
			}
			path := filepath.Join(t.TempDir(), "scenario.json")
			if err := os.WriteFile(path, data, 0o600); err != nil {
				t.Fatal(err)
			}
			if err := run(path, &bytes.Buffer{}); err == nil {
				t.Fatal("native host accepted a reply without a live pending correlation")
			}
		})
	}
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
