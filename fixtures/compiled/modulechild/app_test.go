package modulechild

import (
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	"github.com/samuelpmahan/gondola/gobi"
)

func TestTypedInputControlsCounterStepAndLock(t *testing.T) {
	state := Init()
	state = Input(state, modulewire.Input{Step: 2, Revision: 1})
	state, effects := Update(state, gobi.Message{Name: "add"})
	if len(effects) != 0 || state.Counter.Count != 2 || state.InputRevision != 1 {
		t.Fatalf("step-two add = %#v, effects %#v", state, effects)
	}

	state = Input(state, modulewire.Input{Step: 3, Locked: true, Revision: 2})
	view := View(state)
	if hasFlag(view.Kids[2].Kids[1], "disabled") == false || hasFlag(view.Kids[2].Kids[2], "disabled") {
		t.Fatalf("locked child controls should disable Add but leave positive-count Reset enabled: %#v", view.Kids[2])
	}
	before := state
	state, effects = Update(state, gobi.Message{Name: "add"})
	if len(effects) != 0 || !reflect.DeepEqual(state, before) {
		t.Fatalf("locked add changed state: %#v / %#v", state, effects)
	}
	state, effects = Update(state, gobi.Message{Name: "reset"})
	if len(effects) != 0 || state.Counter.Count != 0 {
		t.Fatalf("locked reset should clear a positive count: %#v / %#v", state, effects)
	}
	if got, want := Publication(state), (modulewire.Publication{Count: 0, Revision: 2}); !reflect.DeepEqual(got, want) {
		t.Fatalf("publication = %#v, want %#v", got, want)
	}
}

func TestStepThreeAddsThreeThroughCounterUpdate(t *testing.T) {
	state := Init()
	state = Input(state, modulewire.Input{Step: 3, Revision: 1})
	state, effects := Update(state, gobi.Message{Name: "add"})
	if len(effects) != 0 || state.Counter.Count != 3 {
		t.Fatalf("step-three add = %#v, effects %#v", state, effects)
	}
}

func TestChildRejectsMalformedOrStaleTypedInputs(t *testing.T) {
	state := Init()
	state = Input(state, modulewire.Input{Step: 2, Revision: 3})
	before := state
	for _, input := range []modulewire.Input{
		{Step: 0, Revision: 4},
		{Step: 4, Revision: 4},
		{Step: 1, Revision: 2},
		{Step: 1, Locked: true, Revision: 3},
	} {
		got := Input(state, input)
		if !reflect.DeepEqual(got, before) {
			t.Fatalf("invalid/stale input %#v changed state: %#v", input, got)
		}
	}
}

func TestChildResetAtZeroIsAnIdempotentNoOpAndViewDisablesIt(t *testing.T) {
	state := Init()
	state = Input(state, modulewire.Input{Step: 1, Revision: 1})
	before := state
	state, effects := Update(state, gobi.Message{Name: "reset"})
	if len(effects) != 0 || !reflect.DeepEqual(state, before) {
		t.Fatalf("reset at zero changed state: %#v / %#v", state, effects)
	}
	view := View(state)
	counterView := view.Kids[2]
	if !hasFlag(counterView.Kids[2], "disabled") {
		t.Fatalf("reset at zero is not disabled: %#v", counterView.Kids[2])
	}
}

func TestChildReusesCounterInitializationAndRendersCounterView(t *testing.T) {
	state := Init()
	if !reflect.DeepEqual(state.Counter, counter.Init()) {
		t.Fatalf("counter state = %#v, want Init()", state.Counter)
	}
	if node := View(state); node.Kind != gobi.Element || node.Kids[2].Tag != "div" || node.Kids[2].Kids[0].Kids[0].Text != "Count: " {
		t.Fatalf("composed counter view = %#v", node)
	}
}

func TestAddAtSafePublicationBoundaryIsAtomicAndAcceptedByParent(t *testing.T) {
	const maxSafeCount = float64(9007199254740991)
	tests := []struct {
		name      string
		step      int
		start     float64
		wantCount float64
	}{
		{name: "step one at max", step: 1, start: maxSafeCount, wantCount: maxSafeCount},
		{name: "step one reaches max", step: 1, start: maxSafeCount - 1, wantCount: maxSafeCount},
		{name: "step two reaches max", step: 2, start: maxSafeCount - 2, wantCount: maxSafeCount},
		{name: "step two overflow is atomic", step: 2, start: maxSafeCount - 1, wantCount: maxSafeCount - 1},
		{name: "step three reaches max", step: 3, start: maxSafeCount - 3, wantCount: maxSafeCount},
		{name: "step three overflow is atomic", step: 3, start: maxSafeCount - 2, wantCount: maxSafeCount - 2},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			state := Init()
			state.Counter.Count = test.start
			state = Input(state, modulewire.Input{Step: test.step, Revision: 1})

			state, effects := Update(state, gobi.Message{Name: "add"})
			if len(effects) != 0 {
				t.Fatalf("add effects = %#v", effects)
			}
			if state.Counter.Count != test.wantCount {
				t.Fatalf("count after add = %.0f, want %.0f", state.Counter.Count, test.wantCount)
			}
			publication := Publication(state)
			if publication.Revision != 1 || publication.Count > maxSafeCount {
				t.Fatalf("publication escaped current safe range: %#v", publication)
			}
			parent := moduleparent.Receive(moduleparent.Init(), publication)
			if parent.PublishedRevision != 1 || parent.PublishedCount != state.Counter.Count {
				t.Fatalf("parent rejected or diverged from publication: parent=%#v child=%#v", parent, state)
			}
		})
	}
}

func TestResetRemainsUsableAtSafePublicationBoundary(t *testing.T) {
	state := Init()
	state.Counter.Count = 9007199254740991
	state = Input(state, modulewire.Input{Step: 3, Locked: true, Revision: 1})
	state, effects := Update(state, gobi.Message{Name: "reset"})
	if len(effects) != 0 || state.Counter.Count != 0 {
		t.Fatalf("locked reset at max safe count = %#v / %#v", state, effects)
	}
	parent := moduleparent.Receive(moduleparent.Init(), Publication(state))
	if parent.PublishedRevision != 1 || parent.PublishedCount != 0 {
		t.Fatalf("parent rejected reset publication: %#v", parent)
	}
}

func hasFlag(node gobi.Node, name string) bool {
	for _, attr := range node.Attrs {
		if attr.Name == name && attr.Flag {
			return true
		}
	}
	return false
}
