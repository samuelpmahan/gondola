package children

import (
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/gobi"
)

func TestInitHasValueOwnedOrderedChildren(t *testing.T) {
	state := Init()
	if state.Parent.Generation != 1 || !state.Parent.Alive || state.NextGeneration != 3 {
		t.Fatalf("initial parent/generation = %#v / %d", state.Parent, state.NextGeneration)
	}
	if len(state.Children) != 2 || state.Children[0].Key != "oak" || state.Children[0].Generation != 2 || state.Children[1].Key != "elm" || state.Children[1].Generation != 3 {
		t.Fatalf("initial children = %#v", state.Children)
	}
}

func TestReorderRemoveReuseAndStaleReplyIsolation(t *testing.T) {
	state := Init()
	state, _ = Update(state, gobi.Message{Name: "child.add", Arg: "ash"})
	state, _ = Update(state, gobi.Message{Name: "counter.add", Arg: "oak"})
	state, _ = Update(state, gobi.Message{Name: "counter.add", Arg: "elm"})
	state, effects := Update(state, gobi.Message{Name: "child.request", Arg: "oak"})
	oakOld := childToken("oak", 2, 1)
	if !reflect.DeepEqual(effects, []gobi.Effect{requestEffect(oakOld)}) {
		t.Fatalf("oak request effects = %#v", effects)
	}
	state, _ = Update(state, gobi.Message{Name: "child.request", Arg: "elm"})
	state, _ = Update(state, gobi.Message{Name: "children.swap", Arg: "oak:ash"})
	if got := []string{state.Children[0].Key, state.Children[1].Key, state.Children[2].Key}; !reflect.DeepEqual(got, []string{"ash", "elm", "oak"}) {
		t.Fatalf("swap order = %#v", got)
	}
	state, effects = Update(state, gobi.Message{Name: "child.remove", Arg: "oak"})
	if !reflect.DeepEqual(effects, []gobi.Effect{cancelEffect(oakOld)}) {
		t.Fatalf("remove oak effects = %#v", effects)
	}
	state, _ = Update(state, gobi.Message{Name: "child.add", Arg: "oak"})
	if got := state.Children[2].Generation; got != 5 {
		t.Fatalf("reused oak generation = %d, want 5", got)
	}
	state, effects = Update(state, gobi.Message{Name: "child.request", Arg: "oak"})
	oakNew := childToken("oak", 5, 1)
	if !reflect.DeepEqual(effects, []gobi.Effect{requestEffect(oakNew)}) {
		t.Fatalf("reused oak request effects = %#v", effects)
	}
	state, effects = Update(state, gobi.Message{Name: "complete", Arg: oakOld})
	if len(effects) != 0 || !state.Children[2].Pending || state.Children[2].Reply != "" {
		t.Fatalf("stale reply mutated reused child: %#v / %#v", state.Children[2], effects)
	}
	state, _ = Update(state, gobi.Message{Name: "complete", Arg: oakNew})
	if state.Children[2].Pending || state.Children[2].Reply != oakNew {
		t.Fatalf("current reply not applied: %#v", state.Children[2])
	}
	if state.Children[0].Counter.Count != 0 || state.Children[1].Counter.Count != 1 {
		t.Fatalf("counts no longer follow their keys: %#v", state.Children)
	}
}

func TestClearPreservesParentRequestAndCancelsReversePresentationOrder(t *testing.T) {
	state := Init()
	state, _ = Update(state, gobi.Message{Name: "child.add", Arg: "ash"})
	state, _ = Update(state, gobi.Message{Name: "child.request", Arg: "oak"})
	state, _ = Update(state, gobi.Message{Name: "child.request", Arg: "elm"})
	state, _ = Update(state, gobi.Message{Name: "child.request", Arg: "ash"})
	state, _ = Update(state, gobi.Message{Name: "parent.request"})
	parentToken := parentToken(1, 1)
	state, _ = Update(state, gobi.Message{Name: "children.swap", Arg: "oak:ash"})
	state, effects := Update(state, gobi.Message{Name: "children.clear"})
	want := []gobi.Effect{cancelEffect(childToken("oak", 2, 1)), cancelEffect(childToken("elm", 3, 1)), cancelEffect(childToken("ash", 4, 1))}
	if !reflect.DeepEqual(effects, want) {
		t.Fatalf("clear effects = %#v, want %#v", effects, want)
	}
	if state.Children == nil || len(state.Children) != 0 || !state.Parent.Pending || state.Parent.Token != parentToken {
		t.Fatalf("clear state = %#v", state)
	}
}

func TestParentRemoveCancelsChildrenBeforeParentAndRemountsFreshGeneration(t *testing.T) {
	state := Init()
	state, _ = Update(state, gobi.Message{Name: "child.add", Arg: "ash"})
	state, _ = Update(state, gobi.Message{Name: "parent.request"})
	state, _ = Update(state, gobi.Message{Name: "child.request", Arg: "oak"})
	state, _ = Update(state, gobi.Message{Name: "child.request", Arg: "elm"})
	state, _ = Update(state, gobi.Message{Name: "child.request", Arg: "ash"})
	state, _ = Update(state, gobi.Message{Name: "children.swap", Arg: "oak:ash"})
	state, effects := Update(state, gobi.Message{Name: "parent.remove"})
	want := []gobi.Effect{
		cancelEffect(childToken("oak", 2, 1)),
		cancelEffect(childToken("elm", 3, 1)),
		cancelEffect(childToken("ash", 4, 1)),
		cancelEffect(parentToken(1, 1)),
	}
	if !reflect.DeepEqual(effects, want) {
		t.Fatalf("parent remove effects = %#v, want %#v", effects, want)
	}
	if state.Parent.Alive || state.Parent.Pending || state.Parent.Token != "" || len(state.Children) != 0 {
		t.Fatalf("removed state = %#v", state)
	}
	removed := state
	state, effects = Update(state, gobi.Message{Name: "child.add", Arg: "pine"})
	if len(effects) != 0 || !reflect.DeepEqual(state, removed) {
		t.Fatalf("dead parent accepted child add: %#v / %#v", state, effects)
	}
	state, effects = Update(state, gobi.Message{Name: "parent.remount"})
	if len(effects) != 0 || !state.Parent.Alive || state.Parent.Generation != 5 || state.NextGeneration != 5 || state.Children == nil || len(state.Children) != 0 {
		t.Fatalf("remount = %#v / %#v", state, effects)
	}
}

func TestInvalidKeysUnknownActionsAndSafeIntegerLimitsAreNoOps(t *testing.T) {
	state := Init()
	unchanged := state
	for _, key := range []string{"", "Oak", "1oak", "oak:elm", "pine/pod", "abcdefghijklmnopq"} {
		state, effects := Update(state, gobi.Message{Name: "child.add", Arg: key})
		if len(effects) != 0 || !reflect.DeepEqual(state, unchanged) {
			t.Fatalf("invalid key %q changed state: %#v / %#v", key, state, effects)
		}
	}
	state, effects := Update(state, gobi.Message{Name: "children.swap", Arg: "oak:oak"})
	if len(effects) != 0 || !reflect.DeepEqual(state, unchanged) {
		t.Fatalf("same-key swap changed state: %#v / %#v", state, effects)
	}
	for _, argument := range []string{"", "oak", ":elm", "oak:", "oak:elm:ash", "oak:elm/invalid"} {
		state, effects = Update(state, gobi.Message{Name: "children.swap", Arg: argument})
		if len(effects) != 0 || !reflect.DeepEqual(state, unchanged) {
			t.Fatalf("malformed swap %q changed state: %#v / %#v", argument, state, effects)
		}
	}
	state.NextGeneration = maxSafeID
	unchanged = state
	state, effects = Update(state, gobi.Message{Name: "child.add", Arg: "pine"})
	if len(effects) != 0 || !reflect.DeepEqual(state, unchanged) {
		t.Fatalf("generation overflow was not a no-op: %#v / %#v", state, effects)
	}
	state.Children[0].RequestSeq = maxSafeID
	state.Children[0].Pending = false
	unchanged = state
	state, effects = Update(state, gobi.Message{Name: "child.request", Arg: "oak"})
	if len(effects) != 0 || !reflect.DeepEqual(state, unchanged) {
		t.Fatalf("request overflow was not a no-op: %#v / %#v", state, effects)
	}
	state.Parent.RequestSeq = maxSafeID
	state.Parent.Pending = false
	unchanged = state
	state, effects = Update(state, gobi.Message{Name: "parent.request"})
	if len(effects) != 0 || !reflect.DeepEqual(state, unchanged) {
		t.Fatalf("parent request overflow was not a no-op: %#v / %#v", state, effects)
	}
}

func TestPendingDuplicateRequestsAreSuppressed(t *testing.T) {
	state := Init()
	state, effects := Update(state, gobi.Message{Name: "child.request", Arg: "oak"})
	if len(effects) != 1 {
		t.Fatalf("first request effects = %#v", effects)
	}
	before := state
	state, effects = Update(state, gobi.Message{Name: "child.request", Arg: "oak"})
	if len(effects) != 0 || !reflect.DeepEqual(state, before) {
		t.Fatalf("duplicate child request = %#v / %#v", state, effects)
	}
	state, effects = Update(state, gobi.Message{Name: "parent.request"})
	if len(effects) != 1 {
		t.Fatalf("first parent request effects = %#v", effects)
	}
	before = state
	state, effects = Update(state, gobi.Message{Name: "parent.request"})
	if len(effects) != 0 || !reflect.DeepEqual(state, before) {
		t.Fatalf("duplicate parent request = %#v / %#v", state, effects)
	}
}

func TestUpdatePreservesPreviousSliceValuesAndRejectsMalformedParentArguments(t *testing.T) {
	initial := Init()
	updated, effects := Update(initial, gobi.Message{Name: "counter.add", Arg: "oak"})
	if len(effects) != 0 || initial.Children[0].Counter.Count != 0 || updated.Children[0].Counter.Count != 1 {
		t.Fatalf("Update changed prior value slice: before=%#v after=%#v effects=%#v", initial.Children, updated.Children, effects)
	}
	for _, name := range []string{"parent.request", "parent.remove", "parent.remount"} {
		before := updated
		got, gotEffects := Update(updated, gobi.Message{Name: name, Arg: "unexpected"})
		if len(gotEffects) != 0 || !reflect.DeepEqual(got, before) {
			t.Fatalf("malformed %s changed state: %#v / %#v", name, got, gotEffects)
		}
	}
}

func TestViewUsesStableKeysOrderAndDisabledRequestState(t *testing.T) {
	state := Init()
	state.Children[0].Counter = counter.State{Count: 2}
	state.Children[0].Pending = true
	state.Children[0].Token = childToken("oak", 2, 1)
	view := View(state)
	rows := view.Kids[1].Kids
	if len(rows) != 2 || rows[0].Key != "child-oak" || rows[1].Key != "child-elm" {
		t.Fatalf("row keys/order = %#v", rows)
	}
	if rows[0].Kids[2].On[0].Message != "child.request" || rows[0].Kids[2].On[0].Arg != "oak" || len(rows[0].Kids[2].Attrs) == 0 || rows[0].Kids[2].Attrs[len(rows[0].Kids[2].Attrs)-1].Name != "disabled" {
		t.Fatalf("pending request button not disabled/keyed: %#v", rows[0].Kids[2])
	}
	if rows[1].Kids[4].On[0].Message != "children.swap" || rows[1].Kids[4].On[0].Arg != "oak:elm" {
		t.Fatalf("move-up action = %#v", rows[1].Kids[4])
	}
}
