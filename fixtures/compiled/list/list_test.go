package list

import (
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
)

func TestKeyedRowsRetainIdentityAcrossMoveAndRemove(t *testing.T) {
	state := Init()
	if state.Rows != nil {
		t.Fatalf("Init Rows = %#v, want nil slice", state.Rows)
	}

	state, effects := Update(state, gobi.Message{Name: "add"})
	if len(effects) != 0 || len(state.Rows) != 1 || state.Rows[0].ID != 1 {
		t.Fatalf("first add = %#v, effects %#v", state, effects)
	}
	state, _ = Update(state, gobi.Message{Name: "edit/1", Arg: "one"})
	state, _ = Update(state, gobi.Message{Name: "add"})
	state, _ = Update(state, gobi.Message{Name: "edit/2", Arg: "two"})
	state, _ = Update(state, gobi.Message{Name: "move-up/2"})
	if len(state.Rows) != 2 || state.Rows[0].ID != 2 || state.Rows[0].Label != "two" || state.Rows[1].ID != 1 || state.Rows[1].Label != "one" {
		t.Fatalf("move-up lost row identity or value: %#v", state.Rows)
	}
	state, _ = Update(state, gobi.Message{Name: "remove/2"})
	if len(state.Rows) != 1 || state.Rows[0].ID != 1 || state.Rows[0].Label != "one" {
		t.Fatalf("remove did not preserve remaining row: %#v", state.Rows)
	}
	state, _ = Update(state, gobi.Message{Name: "remove/1"})
	if state.Rows == nil || len(state.Rows) != 0 {
		t.Fatalf("last remove Rows = %#v; want non-nil empty slice", state.Rows)
	}
}

func TestNilAndEmptyRowsRemainDistinct(t *testing.T) {
	initial := Init()
	if initial.Rows != nil {
		t.Fatalf("Init Rows = %#v, want nil", initial.Rows)
	}
	empty, effects := Update(initial, gobi.Message{Name: "reset"})
	if len(effects) != 0 || empty.Rows == nil || len(empty.Rows) != 0 {
		t.Fatalf("reset Rows = %#v, effects %#v; want non-nil empty slice", empty.Rows, effects)
	}
	if initial.Rows != nil {
		t.Fatal("reset mutated the initial nil slice")
	}
}

func TestViewUsesStableKeysAndIdentityMessages(t *testing.T) {
	view := View(State{Rows: []Row{{ID: 8, Label: "eight"}, {ID: 3, Label: "three"}}, NextID: 8})
	rows := view.Tree.Kids[2].Kids
	if len(rows) != 2 || rows[0].Key != "row-8" || rows[1].Key != "row-3" {
		t.Fatalf("row keys/order = %#v", rows)
	}
	if len(view.Bindings) != 4 || view.Bindings[0].Path != "2/0/0" || view.Bindings[0].Message != "edit/8" || view.Bindings[2].Path != "2/1/0" || view.Bindings[2].Message != "edit/3" {
		t.Fatalf("row bindings = %#v", view.Bindings)
	}
	if rows[0].Kids[2].On[0].Message != "move-up/8" || rows[1].Kids[3].On[0].Message != "remove/3" {
		t.Fatalf("keyed handlers do not use stable IDs: %#v", rows)
	}
	if view.Bindings[1].Source != "target.checked" || rows[1].Kids[1].Tag != "input" {
		t.Fatalf("checkbox sidecar/target = %#v / %#v", view.Bindings[1], rows[1].Kids[1])
	}
}

func TestEmptyListViewHasNoStaleRowBindings(t *testing.T) {
	view := View(Init())
	if len(view.Tree.Kids[2].Kids) != 0 || len(view.Bindings) != 0 {
		t.Fatalf("empty view still has rows/bindings: %#v", view)
	}
}

func TestAddStopsAtSafeUnsignedIntegerBoundary(t *testing.T) {
	want := State{Rows: []Row{}, NextID: 9007199254740991}
	got, effects := Update(want, gobi.Message{Name: "add"})
	if len(effects) != 0 || got.NextID != want.NextID || len(got.Rows) != 0 || got.Rows == nil {
		t.Fatalf("add at safe integer limit = %#v, effects %#v", got, effects)
	}
}
