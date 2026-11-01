package keyedmoduleparent

import (
	"math"
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	"github.com/samuelpmahan/gondola/gobi"
)

func TestInitExposesTwoMountedChildrenInStableOrder(t *testing.T) {
	state := Init()
	children := Children(state)
	if len(children) != 2 || children[0].Key != "a" || children[0].Generation != 1 || children[1].Key != "b" || children[1].Generation != 1 {
		t.Fatalf("initial children = %#v, want a/b at generation 1", children)
	}
	if !IsCurrent(state, "a", 1) || !IsCurrent(state, "b", 1) || IsCurrent(state, "a", 2) {
		t.Fatalf("initial generation membership = %#v", children)
	}
	if got := Output(state); got.Step != 1 || got.Locked || got.Revision != 1 {
		t.Fatalf("initial output = %#v", got)
	}
}

func TestReorderAndRemountPreserveSiblingStateAndFenceOldGeneration(t *testing.T) {
	state := Init()
	state = ReceiveKeyed(state, "a", 1, modulewire.Publication{Count: 4, Revision: 1})
	state = ReceiveKeyed(state, "b", 1, modulewire.Publication{Count: 7, Revision: 1})

	state = Reorder(state, "b,a")
	if got := Children(state); len(got) != 2 || got[0].Key != "b" || got[1].Key != "a" {
		t.Fatalf("reordered children = %#v", got)
	}
	if state.A.PublishedCount != 4 || state.B.PublishedCount != 7 {
		t.Fatalf("reorder moved per-key publication state: a=%#v b=%#v", state.A, state.B)
	}

	state = Remove(state, "a")
	if IsCurrent(state, "a", 1) || len(Children(state)) != 1 || Children(state)[0].Key != "b" {
		t.Fatalf("removed a remains active: %#v", Children(state))
	}
	removed := state
	state = ReceiveKeyed(state, "a", 1, modulewire.Publication{Count: 99, Revision: 1})
	if !reflect.DeepEqual(state, removed) {
		t.Fatalf("removed generation publication changed state: got %#v want %#v", state, removed)
	}

	state = Add(state, "a")
	if !IsCurrent(state, "a", 2) || IsCurrent(state, "a", 1) {
		t.Fatalf("remount generations = %#v", Children(state))
	}
	if got := Children(state); len(got) != 2 || got[0].Key != "b" || got[1].Key != "a" {
		t.Fatalf("remounted order = %#v", got)
	}
	if state.A.PublishedCount != 0 || state.A.PublishedRevision != 0 || state.B.PublishedCount != 7 || state.B.PublishedRevision != 1 {
		t.Fatalf("remount did not reset only a's published snapshot: a=%#v b=%#v", state.A, state.B)
	}

	before := state
	state = ReceiveKeyed(state, "a", 1, modulewire.Publication{Count: 100, Revision: 1})
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("old generation publication changed remounted state: got %#v want %#v", state, before)
	}
	state = ReceiveKeyed(state, "a", 2, modulewire.Publication{Count: 2, Revision: 1})
	if state.A.PublishedCount != 2 || state.B.PublishedCount != 7 {
		t.Fatalf("current a publication was not isolated: a=%#v b=%#v", state.A, state.B)
	}
}

func TestInvalidMembershipAndStaleRevisionAreNoOps(t *testing.T) {
	state := Init()
	unchanged := state
	for _, message := range []gobi.Message{
		{Name: "child.add", Arg: "c"},
		{Name: "child.remove", Arg: "c"},
		{Name: "children.reorder", Arg: "a,a"},
		{Name: "children.reorder", Arg: "a,b,extra"},
		{Name: "child.add", Arg: "a"},
	} {
		state, _ = Update(state, message)
	}
	if !reflect.DeepEqual(state, unchanged) {
		t.Fatalf("invalid or redundant add messages changed state: got %#v want %#v", state, unchanged)
	}
	state, _ = Update(state, gobi.Message{Name: "child.remove", Arg: "a"})
	removed := state
	state, _ = Update(state, gobi.Message{Name: "child.remove", Arg: "a"})
	if !reflect.DeepEqual(state, removed) {
		t.Fatalf("redundant remove changed state: got %#v want %#v", state, removed)
	}
	state = ReceiveKeyed(state, "a", 1, modulewire.Publication{Count: 3, Revision: 0})
	if !reflect.DeepEqual(state, removed) {
		t.Fatalf("stale revision publication changed state: got %#v want %#v", state, removed)
	}
}

func TestParentInputTransitionDoesNotCoupleKeyedPublications(t *testing.T) {
	state := Init()
	state = ReceiveKeyed(state, "a", 1, modulewire.Publication{Count: 2, Revision: 1})
	state = ReceiveKeyed(state, "b", 1, modulewire.Publication{Count: 5, Revision: 1})
	state, effects := Update(state, gobi.Message{Name: "step.up"})
	if len(effects) != 0 || Output(state) != (modulewire.Input{Step: 2, Revision: 2}) {
		t.Fatalf("parent input transition = %#v effects=%#v", Output(state), effects)
	}
	if state.A.PublishedCount != 2 || state.B.PublishedCount != 5 {
		t.Fatalf("input update overwrote keyed publications: a=%#v b=%#v", state.A, state.B)
	}
	before := state
	state = Receive(state, modulewire.Publication{Count: 999, Revision: 2})
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("unkeyed ABI Receive bypassed keyed admission: got %#v want %#v", state, before)
	}
}

func TestInvalidPublicationAndGenerationOverflowAreRejected(t *testing.T) {
	state := Init()
	for _, count := range []float64{-1, math.NaN(), math.Inf(1), math.Inf(-1), float64(maxSafePublicationCount + 1)} {
		before := state
		state = ReceiveKeyed(state, "a", 1, modulewire.Publication{Count: count, Revision: 1})
		if !reflect.DeepEqual(state, before) {
			t.Fatalf("invalid count %v changed state: got %#v want %#v", count, state, before)
		}
	}

	state = Remove(state, "a")
	state.A.Generation = maxSafeGeneration
	before := state
	state = Add(state, "a")
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("generation overflow remounted child: got %#v want %#v", state, before)
	}
	controls := View(state).Kids[6]
	if !hasDisabled(controls.Kids[0]) {
		t.Fatalf("mount button was enabled at generation limit: %#v", controls.Kids[0])
	}
}

func TestViewContainsKeyedControlsAndStableSlotKeys(t *testing.T) {
	state := Init()
	view := View(state)
	if view.Kind != gobi.Element || view.Tag != "main" || view.Key != "keyed-module-parent" {
		t.Fatalf("root view = %#v", view)
	}
	if len(view.Kids) < 7 {
		t.Fatalf("view has no keyed control group: %#v", view.Kids)
	}
	controls := view.Kids[6]
	if controls.Key != "keyed-membership-controls" || len(controls.Kids) != 5 {
		t.Fatalf("membership controls = %#v", controls)
	}
	if controls.Kids[0].On[0].Message != "child.add" || controls.Kids[0].On[0].Arg != "a" || !hasDisabled(controls.Kids[0]) {
		t.Fatalf("mounted a button = %#v", controls.Kids[0])
	}
	if controls.Kids[1].On[0].Message != "child.remove" || controls.Kids[1].On[0].Arg != "a" || hasDisabled(controls.Kids[1]) {
		t.Fatalf("remove a button = %#v", controls.Kids[1])
	}
	children := view.Kids[7]
	if children.Key != "keyed-child-summaries" || len(children.Kids) != 2 || children.Kids[0].Key != "a" || children.Kids[1].Key != "b" {
		t.Fatalf("child summary identities = %#v", children)
	}
}

func hasDisabled(node gobi.Node) bool {
	for _, attr := range node.Attrs {
		if attr.Name == "disabled" && attr.Flag {
			return true
		}
	}
	return false
}
