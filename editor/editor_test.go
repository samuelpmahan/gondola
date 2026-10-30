package editor

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inputbinding"
)

func TestViewHasStableEditorTopologyAndBinding(t *testing.T) {
	view := View(State{Draft: "draft", Saved: "old", Saves: 2})
	if view.Tree.Kind != gobi.Element || view.Tree.Tag != "div" || attrValue(view.Tree, "class") != "editor" {
		t.Fatalf("root = %#v, want div.editor", view.Tree)
	}
	if len(view.Tree.Kids) != 5 {
		t.Fatalf("root has %d children, want 5", len(view.Tree.Kids))
	}
	input := view.Tree.Kids[0]
	if input.Kind != gobi.Element || input.Tag != "input" || len(input.On) != 0 {
		t.Fatalf("input = %#v; dynamic value must not use gobi.On", input)
	}
	if attrValue(input, "type") != "text" || attrValue(input, "value") != "draft" || attrValue(input, "aria-label") != "Draft" {
		t.Fatalf("input attributes = %#v", input.Attrs)
	}
	if got := textContent(view.Tree.Kids[1]); got != "Saved: old" {
		t.Errorf("saved display = %q", got)
	}
	if got := textContent(view.Tree.Kids[2]); got != "Saves: 2" {
		t.Errorf("saves display = %q", got)
	}
	if attrValue(view.Tree.Kids[3], "class") != "save" || !hasHandler(view.Tree.Kids[3], gobi.On{Event: "click", Message: "save", Arg: ""}) {
		t.Errorf("save button = %#v", view.Tree.Kids[3])
	}
	if attrValue(view.Tree.Kids[4], "class") != "reset" || !hasHandler(view.Tree.Kids[4], gobi.On{Event: "click", Message: "reset", Arg: ""}) {
		t.Errorf("reset button = %#v", view.Tree.Kids[4])
	}
	if len(view.Bindings) != 1 || view.Bindings[0].Path != "0" || view.Bindings[0].Event != "input" || view.Bindings[0].Message != "edit" || view.Bindings[0].Source != "target.value" {
		t.Fatalf("bindings = %#v", view.Bindings)
	}
	if isFlag(view.Tree.Kids[3], "disabled") || isFlag(view.Tree.Kids[4], "disabled") {
		t.Fatal("save/reset disabled states do not match nonempty draft and state")
	}
	if err := inputbinding.Validate(view); err != nil {
		t.Fatalf("inputbinding.Validate(view) error = %v", err)
	}
}

func TestUpdateEditSaveRepeatAndReset(t *testing.T) {
	state := Init()
	state, _ = Update(state, gobi.Message{Name: "edit", Arg: "  exact ✨ draft  "})
	if state.Draft != "  exact ✨ draft  " || state.Saved != "" || state.Saves != 0 {
		t.Fatalf("edit state = %#v", state)
	}
	state, _ = Update(state, gobi.Message{Name: "save"})
	state, _ = Update(state, gobi.Message{Name: "save"})
	if state.Saved != state.Draft || state.Saves != 2 {
		t.Fatalf("repeated save state = %#v", state)
	}
	unchanged, _ := Update(state, gobi.Message{Name: "unknown", Arg: "ignored"})
	if unchanged != state {
		t.Fatalf("unknown message changed state: %#v -> %#v", state, unchanged)
	}
	state, _ = Update(state, gobi.Message{Name: "reset"})
	if state != (State{}) {
		t.Fatalf("reset state = %#v, want zero", state)
	}

	empty, _ := Update(Init(), gobi.Message{Name: "save"})
	if empty != (State{}) {
		t.Fatalf("save empty draft changed state: %#v", empty)
	}
}

func TestSessionDispatchesInputAndLiteralActionsInOrder(t *testing.T) {
	session := NewSession()
	for _, step := range []gobi.Step{
		{Path: "0", Event: "input", Value: "first"},
		{Path: "3", Event: "click", Value: "browser-value-must-not-replace-literal"},
		{Path: "0", Event: "input", Value: "latest"},
		{Path: "3", Event: "click"},
	} {
		if _, err := session.Dispatch(step); err != nil {
			t.Fatalf("Dispatch(%#v): %v", step, err)
		}
	}
	snapshot := session.Snapshot()
	if snapshot.State != (State{Draft: "latest", Saved: "latest", Saves: 2}) {
		t.Fatalf("state = %#v", snapshot.State)
	}
	want := []gobi.Message{{Name: "edit", Arg: "first"}, {Name: "save"}, {Name: "edit", Arg: "latest"}, {Name: "save"}}
	if !reflect.DeepEqual(snapshot.Messages, want) {
		t.Fatalf("messages = %#v, want %#v", snapshot.Messages, want)
	}
}

func TestSessionSuppressesDisabledControlsAndResetAtZero(t *testing.T) {
	session := NewSession()
	for _, step := range []gobi.Step{{Path: "3", Event: "click"}, {Path: "4", Event: "click"}} {
		if _, err := session.Dispatch(step); err != nil {
			t.Fatalf("Dispatch(disabled %#v): %v", step, err)
		}
	}
	if got := session.Snapshot(); got.State != (State{}) || len(got.Messages) != 0 {
		t.Fatalf("disabled actions changed snapshot: %#v", got)
	}
	if session.Snapshot().Messages == nil {
		t.Fatal("empty messages must serialize as [] rather than null")
	}
}

func TestSessionResetClearsStateAndRecordsMessage(t *testing.T) {
	session := NewSession()
	for _, step := range []gobi.Step{
		{Path: "0", Event: "input", Value: "to be erased"},
		{Path: "3", Event: "click"},
		{Path: "4", Event: "click"},
	} {
		if _, err := session.Dispatch(step); err != nil {
			t.Fatalf("Dispatch(%#v): %v", step, err)
		}
	}
	snapshot := session.Snapshot()
	if snapshot.State != (State{}) {
		t.Fatalf("state after reset = %#v", snapshot.State)
	}
	want := []gobi.Message{{Name: "edit", Arg: "to be erased"}, {Name: "save"}, {Name: "reset"}}
	if !reflect.DeepEqual(snapshot.Messages, want) {
		t.Fatalf("messages = %#v, want %#v", snapshot.Messages, want)
	}
	if !isFlag(snapshot.Tree.Kids[3], "disabled") || !isFlag(snapshot.Tree.Kids[4], "disabled") {
		t.Fatal("both controls must be disabled after reset")
	}
}

func TestInvalidDispatchIsAtomic(t *testing.T) {
	session := NewSession()
	if _, err := session.Dispatch(gobi.Step{Path: "0", Event: "input", Value: "stable"}); err != nil {
		t.Fatal(err)
	}
	before := session.Snapshot()
	for _, step := range []gobi.Step{
		{Path: "0/", Event: "input", Value: "bad"},
		{Path: "2", Event: "mouseover"},
		{Path: "99", Event: "click"},
	} {
		if _, err := session.Dispatch(step); err == nil {
			t.Errorf("Dispatch(%#v) unexpectedly succeeded", step)
		}
		if after := session.Snapshot(); !reflect.DeepEqual(after, before) {
			t.Fatalf("failed dispatch changed session:\nbefore %#v\nafter  %#v", before, after)
		}
	}
}

func TestSnapshotMutationDoesNotChangeSession(t *testing.T) {
	session := NewSession()
	for _, step := range []gobi.Step{{Path: "0", Event: "input", Value: "stable"}, {Path: "3", Event: "click"}} {
		if _, err := session.Dispatch(step); err != nil {
			t.Fatal(err)
		}
	}

	returned := session.Snapshot()
	returned.Messages[0].Arg = "mutated message"
	returned.Tree.Kids[0].Attrs[1].Value = "mutated tree"
	returned.Bindings[0].Message = "mutated binding"

	next := session.Snapshot()
	if next.State != (State{Draft: "stable", Saved: "stable", Saves: 1}) {
		t.Fatalf("state after snapshot mutation = %#v", next.State)
	}
	if next.Messages[0] != (gobi.Message{Name: "edit", Arg: "stable"}) {
		t.Fatalf("message history was exposed by Snapshot: %#v", next.Messages)
	}
	if attrValue(next.Tree.Kids[0], "value") != "stable" || next.Bindings[0].Message != "edit" {
		t.Fatalf("view was exposed by Snapshot: tree=%#v bindings=%#v", next.Tree, next.Bindings)
	}
}

func TestSnapshotUsesRequiredJSONEnvelopeAndPreservesGoFieldNames(t *testing.T) {
	snapshot := NewSession().Snapshot()
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"state", "tree", "bindings", "messages"} {
		if _, ok := decoded[key]; !ok {
			t.Errorf("snapshot JSON missing key %q: %s", key, encoded)
		}
	}
	var state map[string]json.RawMessage
	if err := json.Unmarshal(decoded["state"], &state); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"Draft", "Saved", "Saves"} {
		if _, ok := state[key]; !ok {
			t.Errorf("state JSON missing Go field %q", key)
		}
	}
	var bindings []map[string]json.RawMessage
	if err := json.Unmarshal(decoded["bindings"], &bindings); err != nil {
		t.Fatal(err)
	}
	if len(bindings) != 1 || string(bindings[0]["Source"]) != `"target.value"` {
		t.Errorf("bindings JSON = %s", decoded["bindings"])
	}
}

func isFlag(node gobi.Node, name string) bool {
	for _, attr := range node.Attrs {
		if attr.Name == name && attr.Flag {
			return true
		}
	}
	return false
}

func attrValue(node gobi.Node, name string) string {
	for _, attr := range node.Attrs {
		if attr.Name == name && !attr.Flag {
			return attr.Value
		}
	}
	return ""
}

func hasHandler(node gobi.Node, want gobi.On) bool {
	for _, handler := range node.On {
		if handler == want {
			return true
		}
	}
	return false
}

func textContent(node gobi.Node) string {
	if node.Kind == gobi.Text {
		return node.Text
	}
	content := node.Text
	for _, child := range node.Kids {
		content += textContent(child)
	}
	return content
}
