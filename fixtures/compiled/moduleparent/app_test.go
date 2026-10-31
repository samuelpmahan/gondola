package moduleparent

import (
	"math"
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	"github.com/samuelpmahan/gondola/gobi"
)

func TestParentInputAndPublicationTransitions(t *testing.T) {
	state := Init()
	if state.Step != 1 || state.Locked || state.Revision != 1 {
		t.Fatalf("initial state = %#v", state)
	}

	state, _ = Update(state, gobi.Message{Name: "step.up"})
	if state.Step != 2 || state.Revision != 2 {
		t.Fatalf("step.up state = %#v", state)
	}
	state, _ = Update(state, gobi.Message{Name: "lock.toggle"})
	if !state.Locked || state.Revision != 3 {
		t.Fatalf("lock.toggle state = %#v", state)
	}
	state, _ = Update(state, gobi.Message{Name: "input.reset"})
	if state.Step != 1 || state.Locked || state.Revision != 4 {
		t.Fatalf("input.reset state = %#v", state)
	}
	state, _ = Update(state, gobi.Message{Name: "input.reset"})
	if state.Revision != 5 {
		t.Fatalf("repeated reset must advance revision: %#v", state)
	}
	if got, want := Output(state), (modulewire.Input{Step: 1, Locked: false, Revision: 5}); !reflect.DeepEqual(got, want) {
		t.Fatalf("Output = %#v, want %#v", got, want)
	}

	state = Receive(state, modulewire.Publication{Count: 4, Revision: 5})
	if state.PublishedCount != 4 || state.PublishedRevision != 5 {
		t.Fatalf("current publication not received: %#v", state)
	}
	state = Receive(state, modulewire.Publication{Count: 0.5, Revision: 5})
	if state.PublishedCount != 0.5 || state.PublishedRevision != 5 {
		t.Fatalf("finite fractional float64 publication was rejected: %#v", state)
	}
	before := state
	state = Receive(state, modulewire.Publication{Count: 8, Revision: 4})
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("stale publication changed state: got %#v, want %#v", state, before)
	}
}

func TestParentRejectsInvalidActionsAndPublications(t *testing.T) {
	state := Init()
	unchanged := state
	for _, message := range []gobi.Message{
		{Name: "step.up", Arg: "unexpected"},
		{Name: "step.down"},
		{Name: "unknown"},
	} {
		state, _ = Update(state, message)
		if !reflect.DeepEqual(state, unchanged) {
			t.Fatalf("invalid message %#v changed state: %#v", message, state)
		}
	}
	for _, count := range []float64{-1, math.NaN(), math.Inf(1)} {
		got := Receive(state, modulewire.Publication{Count: count, Revision: state.Revision})
		if !reflect.DeepEqual(got, unchanged) {
			t.Fatalf("invalid publication count %v changed state: %#v", count, got)
		}
	}
	if got := Receive(state, modulewire.Publication{Count: 3, Revision: 0}); !reflect.DeepEqual(got, unchanged) {
		t.Fatalf("initially stale publication changed state: %#v", got)
	}
}

func TestParentUpdatePreservesPreviousValue(t *testing.T) {
	initial := Init()
	updated, _ := Update(initial, gobi.Message{Name: "step.up"})
	if initial.Step != 1 || initial.Revision != 1 || updated.Step != 2 || updated.Revision != 2 {
		t.Fatalf("value transition mutated old state: before=%#v after=%#v", initial, updated)
	}
}

func TestStepBoundsAndRevisionOverflowAreNoOps(t *testing.T) {
	state := Init()
	state, _ = Update(state, gobi.Message{Name: "step.up"})
	state, _ = Update(state, gobi.Message{Name: "step.up"})
	if state.Step != 3 || state.Revision != 3 {
		t.Fatalf("step upper bound state = %#v", state)
	}
	before := state
	state, _ = Update(state, gobi.Message{Name: "step.up"})
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("step.up exceeded upper bound: %#v", state)
	}
	state, _ = Update(state, gobi.Message{Name: "step.down"})
	state, _ = Update(state, gobi.Message{Name: "step.down"})
	if state.Step != 1 || state.Revision != 5 {
		t.Fatalf("step lower bound state = %#v", state)
	}
	before = state
	state, _ = Update(state, gobi.Message{Name: "step.down"})
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("step.down exceeded lower bound: %#v", state)
	}
	state.Revision = maxSafeRevision
	before = state
	for _, message := range []gobi.Message{{Name: "step.up"}, {Name: "lock.toggle"}, {Name: "input.reset"}} {
		state, _ = Update(state, message)
	}
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("input revision overflow changed state: %#v", state)
	}
}
