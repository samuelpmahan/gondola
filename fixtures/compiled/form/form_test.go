package form

import (
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
)

func TestTextCheckboxSaveAndReset(t *testing.T) {
	state := Init()
	if state != (State{}) {
		t.Fatalf("Init() = %#v, want zero State", state)
	}

	state, effects := Update(state, gobi.Message{Name: "edit", Arg: "  target.value  "})
	if state.Draft != "  target.value  " || len(effects) != 0 {
		t.Fatalf("edit = %#v, effects %#v; want exact text and no effects", state, effects)
	}
	state, effects = Update(state, gobi.Message{Name: "checked", Arg: "true"})
	if !state.Checked || len(effects) != 0 {
		t.Fatalf("checked true = %#v, effects %#v", state, effects)
	}
	state, _ = Update(state, gobi.Message{Name: "checked", Arg: "True"})
	if state.Checked {
		t.Fatal("checked must be true only for the exact string true")
	}
	state, _ = Update(state, gobi.Message{Name: "literal", Arg: "target.value"})
	if state.Literal != "target.value" {
		t.Fatalf("literal argument = %q; want unchanged target.value", state.Literal)
	}
	state, _ = Update(state, gobi.Message{Name: "boundary"})
	if state.Saves != 9007199254740990 {
		t.Fatalf("boundary seed = %d; want max safe integer minus one", state.Saves)
	}

	state, _ = Update(state, gobi.Message{Name: "save"})
	if state.Saved != state.Draft || state.Saves != 9007199254740991 {
		t.Fatalf("save = %#v, want exact saved draft and max safe count", state)
	}
	state, _ = Update(state, gobi.Message{Name: "save"})
	if state.Saves != 9007199254740991 {
		t.Fatalf("second save crossed safe integer boundary: %#v", state)
	}
	state, _ = Update(state, gobi.Message{Name: "reset"})
	if state != (State{}) {
		t.Fatalf("reset = %#v, want zero State", state)
	}
}

func TestUnknownMessageDoesNotChangeState(t *testing.T) {
	want := State{Draft: "kept", Checked: true, Saved: "old", Saves: 2}
	got, effects := Update(want, gobi.Message{Name: "unknown", Arg: "ignored"})
	if got != want || len(effects) != 0 {
		t.Fatalf("unknown message = %#v, effects %#v; want %#v and no effects", got, effects, want)
	}
}

func TestSaveCountStopsAtSafeIntegerBoundary(t *testing.T) {
	want := State{Draft: "last", Saves: 9007199254740991}
	got, _ := Update(want, gobi.Message{Name: "save"})
	if got.Saves != want.Saves || got.Saved != "last" {
		t.Fatalf("save at safe integer limit = %#v", got)
	}
}

func TestViewKeepsLiteralArgSeparateFromTypedBindings(t *testing.T) {
	view := View(State{Draft: "visible", Checked: true, Saved: "prior", Saves: 1})
	if len(view.Tree.Kids) != 9 {
		t.Fatalf("View child count = %d, want 9", len(view.Tree.Kids))
	}
	if len(view.Bindings) != 2 || view.Bindings[0].Path != "0" || view.Bindings[0].Source != "target.value" || view.Bindings[0].Message != "edit" {
		t.Fatalf("text binding = %#v", view.Bindings)
	}
	if view.Bindings[1].Path != "1" || view.Bindings[1].Event != "change" || view.Bindings[1].Source != "target.checked" || view.Bindings[1].Message != "checked" {
		t.Fatalf("checkbox binding = %#v", view.Bindings[1])
	}
	literal := view.Tree.Kids[2]
	if len(literal.On) != 1 || literal.On[0] != (gobi.On{Event: "click", Message: "literal", Arg: "target.value"}) {
		t.Fatalf("literal handler changed into a binding: %#v", literal.On)
	}
	checked := view.Tree.Kids[1]
	if !hasFlag(checked, "checked") {
		t.Fatal("checked state is missing the checked flag")
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
