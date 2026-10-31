package lifecycle

import (
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/gobi"
)

func TestRemoveParentCancelsInPostorderAndPreservesSibling(t *testing.T) {
	state := Init()
	for _, name := range []string{"addParent", "addChild", "addGrandchild", "addSibling"} {
		state, _ = Update(state, gobi.Message{Name: name})
	}
	for _, name := range []string{"requestParent", "requestChild", "requestGrandchild", "requestSibling"} {
		state, _ = Update(state, gobi.Message{Name: name})
	}
	input := state

	removed, effects := Update(state, gobi.Message{Name: "removeParent"})
	want := []gobi.Effect{
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "grandchild:g1:r3"},
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "child:g1:r2"},
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "parent:g1:r1"},
	}
	if !reflect.DeepEqual(effects, want) {
		t.Fatalf("remove effects = %#v, want child-first %#v", effects, want)
	}
	if !reflect.DeepEqual(state, input) {
		t.Fatal("Update mutated its value-owned input")
	}
	for name, node := range map[string]NodeState{
		"parent": removed.Parent, "child": removed.Child, "grandchild": removed.Grandchild,
	} {
		if node.Alive || node.Pending || node.Token != "" || node.RequestID == 0 || node.Counter.Count != 1 {
			t.Fatalf("removed %s state = %#v", name, node)
		}
	}
	if !removed.Sibling.Alive || !removed.Sibling.Pending || removed.Sibling.Token != "sibling:g1:r4" || removed.Sibling.Counter.Count != 1 {
		t.Fatalf("independent sibling did not survive pending: %#v", removed.Sibling)
	}
	if repeat, repeatEffects := Update(removed, gobi.Message{Name: "removeParent"}); !reflect.DeepEqual(repeat, removed) || len(repeatEffects) != 0 {
		t.Fatalf("duplicate remove changed state/effects: %#v, %#v", repeat, repeatEffects)
	}
}

func TestCancellationEffectsCoverEveryPendingCombinationInPostorder(t *testing.T) {
	for mask := 0; mask < 8; mask++ {
		state := Init()
		state.Parent.Pending = mask&1 != 0
		state.Parent.Token = "parent"
		state.Child.Pending = mask&2 != 0
		state.Child.Token = "child"
		state.Grandchild.Pending = mask&4 != 0
		state.Grandchild.Token = "grandchild"
		_, got := Update(state, gobi.Message{Name: "removeParent"})
		want := []gobi.Effect{}
		if state.Grandchild.Pending {
			want = append(want, gobi.Effect{Kind: "lifecycle.cancel", Name: "cancel", Arg: "grandchild"})
		}
		if state.Child.Pending {
			want = append(want, gobi.Effect{Kind: "lifecycle.cancel", Name: "cancel", Arg: "child"})
		}
		if state.Parent.Pending {
			want = append(want, gobi.Effect{Kind: "lifecycle.cancel", Name: "cancel", Arg: "parent"})
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("pending mask %03b remove effects = %#v, want %#v", mask, got, want)
		}
	}
}

func TestStaleAndDuplicateRepliesAreFencedByGenerationToken(t *testing.T) {
	state := Init()
	for _, name := range []string{"requestParent", "requestChild", "requestGrandchild", "requestSibling"} {
		state, _ = Update(state, gobi.Message{Name: name})
	}
	state, _ = Update(state, gobi.Message{Name: "removeParent"})
	state, _ = Update(state, gobi.Message{Name: "remountParent"})

	for _, token := range []string{"grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"} {
		before := state
		next, effects := Update(state, gobi.Message{Name: "complete", Arg: token})
		if len(effects) != 0 || !reflect.DeepEqual(next, before) {
			t.Fatalf("stale token %q changed remounted state: %#v, effects %#v", token, next, effects)
		}
	}
	if state.Parent.Generation != 2 || state.Child.Generation != 2 || state.Grandchild.Generation != 2 {
		t.Fatalf("remounted generations = %d/%d/%d", state.Parent.Generation, state.Child.Generation, state.Grandchild.Generation)
	}

	state, effects := Update(state, gobi.Message{Name: "requestChild"})
	if len(effects) != 1 || effects[0].Arg != "child:g2:r5" {
		t.Fatalf("generation-2 child request = %#v", effects)
	}
	state, _ = Update(state, gobi.Message{Name: "complete", Arg: "child:g2:r5"})
	if state.Child.Pending || state.Child.Reply != "child:g2:r5" {
		t.Fatalf("valid child reply was not accepted: %#v", state.Child)
	}
	completed := state
	state, effects = Update(state, gobi.Message{Name: "complete", Arg: "child:g2:r5"})
	if len(effects) != 0 || !reflect.DeepEqual(state, completed) {
		t.Fatalf("duplicate reply changed state: %#v, effects %#v", state, effects)
	}
}

func TestRequestTokensUseActualGenerationAndMonotonicRequestID(t *testing.T) {
	state := Init()
	state, effects := Update(state, gobi.Message{Name: "requestChild"})
	if len(effects) != 1 || effects[0].Arg != "child:g1:r1" || state.Child.RequestID != 1 {
		t.Fatalf("first out-of-order request = %#v, state %#v", effects, state.Child)
	}
	state, effects = Update(state, gobi.Message{Name: "requestParent"})
	if len(effects) != 1 || effects[0].Arg != "parent:g1:r2" || state.Parent.RequestID != 2 {
		t.Fatalf("second out-of-order request = %#v, state %#v", effects, state.Parent)
	}
	state, _ = Update(state, gobi.Message{Name: "removeParent"})
	state, _ = Update(state, gobi.Message{Name: "remountParent"})
	state, effects = Update(state, gobi.Message{Name: "requestParent"})
	if len(effects) != 1 || effects[0].Arg != "parent:g2:r3" || state.Parent.RequestID != 3 {
		t.Fatalf("generation-2 request = %#v, state %#v", effects, state.Parent)
	}
	state, _ = Update(state, gobi.Message{Name: "removeParent"})
	state, _ = Update(state, gobi.Message{Name: "remountParent"})
	state, effects = Update(state, gobi.Message{Name: "requestParent"})
	if len(effects) != 1 || effects[0].Arg != "parent:g3:r4" || state.Parent.RequestID != 4 {
		t.Fatalf("generation-3 request = %#v, state %#v", effects, state.Parent)
	}
}

func TestRequestAndRemountStopAtSafeIntegerBoundary(t *testing.T) {
	requestLimit := Init()
	requestLimit.NextRequestID = maxSafeID
	unchanged, effects := Update(requestLimit, gobi.Message{Name: "requestParent"})
	if len(effects) != 0 || !reflect.DeepEqual(unchanged, requestLimit) {
		t.Fatalf("request at safe ID boundary changed state/effects: %#v, %#v", unchanged, effects)
	}

	remountLimit := Init()
	remountLimit.Parent.Alive = false
	remountLimit.Child.Alive = false
	remountLimit.Grandchild.Alive = false
	remountLimit.Parent.Generation = maxSafeID
	before := remountLimit
	remounted, effects := Update(remountLimit, gobi.Message{Name: "remountParent"})
	if len(effects) != 0 || !reflect.DeepEqual(remounted, before) {
		t.Fatalf("remount at generation boundary changed state/effects: %#v, %#v", remounted, effects)
	}
}

func TestInitAndCounterMessagesStayValueOwned(t *testing.T) {
	original := Init()
	updated, effects := Update(original, gobi.Message{Name: "addChild"})
	if len(effects) != 0 {
		t.Fatalf("add emitted effects: %#v", effects)
	}
	if original.Child.Counter != (counter.State{}) || updated.Child.Counter.Count != 1 {
		t.Fatalf("counter update mutated input or missed output: original %#v, updated %#v", original.Child, updated.Child)
	}
	if original.Parent.ID != "parent" || original.Parent.ParentID != "" || original.Child.ParentID != "parent" ||
		original.Grandchild.ParentID != "child" || original.Sibling.ParentID != "" {
		t.Fatalf("initial topology is malformed: %#v", original)
	}
}
