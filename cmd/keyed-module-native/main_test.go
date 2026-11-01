package main

import (
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func TestLiteralReplayFencesRemovedGenerationAndPreservesSibling(t *testing.T) {
	script := literalScenario()
	got, err := replay(script)
	if err != nil {
		t.Fatal(err)
	}
	if got.Schema != outputSchema || len(got.Events) != 18 {
		t.Fatalf("trace identity/events = %q/%d", got.Schema, len(got.Events))
	}
	if len(got.Initial.Children) != 2 || got.Initial.Children[0].Key != "a" || got.Initial.Children[1].Key != "b" {
		t.Fatalf("initial children = %#v", got.Initial.Children)
	}
	if got.Initial.Children[0].Generation != 1 || got.Initial.Children[1].Generation != 1 {
		t.Fatalf("initial generations = %#v", got.Initial.Children)
	}
	if got.Events[3].Accepted || got.Events[3].Message == nil || got.Events[3].Message.Name != "add" {
		t.Fatalf("locked disabled child click = %#v", got.Events[3])
	}
	if !got.Events[2].Snapshot.Children[0].ChildState.Locked || !got.Events[2].Snapshot.Children[1].ChildState.Locked ||
		got.Events[2].Snapshot.Children[0].ChildState.InputRevision != 2 || got.Events[2].Snapshot.Children[1].ChildState.InputRevision != 2 {
		t.Fatalf("parent lock did not propagate to both child instances: %#v", got.Events[2].Snapshot.Children)
	}
	if got.Events[4].Snapshot.Children[0].ChildState.Locked || got.Events[4].Snapshot.Children[1].ChildState.Locked {
		t.Fatalf("parent unlock did not propagate to both child instances: %#v", got.Events[4].Snapshot.Children)
	}
	if got.Events[6].Accepted || got.Events[6].Message == nil || got.Events[6].Message.Name != "reset" {
		t.Fatalf("empty reset click = %#v", got.Events[6])
	}
	if got.Events[5].Snapshot.Children[0].ChildState.Count != 0 || got.Events[5].Snapshot.Children[1].ChildState.Count != 1 {
		t.Fatalf("reset a changed sibling b: %#v", got.Events[5].Snapshot.Children)
	}
	if got.Events[8].Snapshot.Children[0].Key != "b" || got.Events[8].Snapshot.Children[1].Key != "a" {
		t.Fatalf("reorder snapshot = %#v", got.Events[8].Snapshot.Children)
	}
	if !got.Events[10].Accepted || len(got.Events[10].Snapshot.Children) != 1 || got.Events[10].Snapshot.Children[0].Key != "b" {
		t.Fatalf("remove a snapshot = %#v", got.Events[10])
	}
	if got.Events[11].Accepted || got.Events[12].Accepted || got.Events[15].Accepted || got.Events[16].Accepted {
		t.Fatalf("stale callback/publication was accepted: %#v %#v %#v %#v", got.Events[11], got.Events[12], got.Events[15], got.Events[16])
	}
	if got.Events[13].Snapshot.Children[1].Key != "a" || got.Events[13].Snapshot.Children[1].Generation != 2 {
		t.Fatalf("remount snapshot = %#v", got.Events[13].Snapshot.Children)
	}
	if got.Events[14].Snapshot.Children[1].ChildState.Count != 1 || got.Events[14].Snapshot.Children[0].ChildState.Count != 2 {
		t.Fatalf("remounted child/sibling counts = %#v", got.Events[14].Snapshot.Children)
	}
	if got.Events[17].Snapshot.Children[0].ChildState.Count != 0 || got.Events[17].Snapshot.Children[1].ChildState.Count != 1 {
		t.Fatalf("reset b affected a or failed to reset b: %#v", got.Events[17].Snapshot.Children)
	}
}

func TestClickResolutionUsesCurrentGoViewAndDisabledFlags(t *testing.T) {
	script := scenario{
		Schema: scenarioSchema,
		Name:   "view-resolution",
		Events: []scenarioEvent{
			{Kind: "click", Target: "parent", Action: &compilercontract.Action{Path: "6/4", Event: "click", Value: ""}},
			{Kind: "click", Target: "child", Key: "a", Generation: 1, Action: &compilercontract.Action{Path: "2/1", Event: "click", Value: ""}},
		},
	}
	got, err := replay(script)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Events[0].Accepted || got.Events[0].Message == nil || *got.Events[0].Message != (compilercontract.MessageValue{Name: "children.reorder", Arg: "b,a"}) {
		t.Fatalf("parent click resolution = %#v", got.Events[0])
	}
	if got.Events[1].Message == nil || *got.Events[1].Message != (compilercontract.MessageValue{Name: "add", Arg: ""}) || !got.Events[1].Accepted {
		t.Fatalf("child click resolution = %#v", got.Events[1])
	}
	if got.Events[1].Snapshot.Children[1].ChildState.Count != 1 {
		t.Fatalf("child click did not update Go-owned state: %#v", got.Events[1].Snapshot.Children)
	}
}

func TestStaleSourceEventsMustReferenceEarlierCapturedChildClick(t *testing.T) {
	script := scenario{
		Schema: scenarioSchema,
		Name:   "invalid-source",
		Events: []scenarioEvent{{Kind: "stale-callback", Key: "a", Generation: 1, SourceEvent: intPointer(0)}},
	}
	if _, err := replay(script); err == nil {
		t.Fatal("stale callback accepted a forward/self reference")
	}
}

func literalScenario() scenario {
	return scenario{
		Schema: scenarioSchema,
		Name:   "keyed-modules-literal",
		Events: []scenarioEvent{
			childClick("a", 1, "2/1"),
			childClick("b", 1, "2/1"),
			parentClick("3"),
			childClick("a", 1, "2/1"),
			parentClick("3"),
			childClick("a", 1, "2/2"),
			childClick("a", 1, "2/2"),
			childClick("b", 1, "2/1"),
			parentClick("6/4"),
			childClick("a", 1, "2/1"),
			parentClick("6/1"),
			{Kind: "stale-callback", Key: "a", Generation: 1, SourceEvent: intPointer(9)},
			{Kind: "publication", Key: "a", Generation: 1, SourceEvent: intPointer(9)},
			parentClick("6/0"),
			childClick("a", 2, "2/1"),
			{Kind: "stale-callback", Key: "a", Generation: 1, SourceEvent: intPointer(9)},
			{Kind: "publication", Key: "a", Generation: 1, SourceEvent: intPointer(9)},
			childClick("b", 1, "2/2"),
		},
	}
}

func childClick(key string, generation int, path string) scenarioEvent {
	return scenarioEvent{Kind: "click", Target: "child", Key: key, Generation: generation,
		Action: &compilercontract.Action{Path: path, Event: "click", Value: ""}}
}

func parentClick(path string) scenarioEvent {
	return scenarioEvent{Kind: "click", Target: "parent",
		Action: &compilercontract.Action{Path: path, Event: "click", Value: ""}}
}

func intPointer(value int) *int { return &value }
