package main

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/composition"
	"github.com/samuelpmahan/gondola/multisession"
)

func rawArgs(values ...string) []json.RawMessage {
	result := make([]json.RawMessage, len(values))
	for index, value := range values {
		result[index] = json.RawMessage(value)
	}
	return result
}

func TestReplayCapturesFullFramesAndDrainsChanges(t *testing.T) {
	manager := composition.NewManager()
	createRoot := replayAction{Method: "create", Args: rawArgs()}
	if got := executeAction(manager, createRoot); got != multisession.SessionID(1) {
		t.Fatalf("create result = %#v, want 1", got)
	}
	frame, err := captureFrame(manager)
	if err != nil {
		t.Fatal(err)
	}
	if len(frame.Tree) != 1 || frame.Tree[0].SessionID != 1 || len(frame.Sessions) != 1 || frame.Sessions[0].ID != 1 {
		t.Fatalf("create frame = %#v, want full root snapshot", frame)
	}
	if len(frame.Sessions[0].Snapshot.State.Inbox) != 0 || frame.Changes == nil || len(frame.Changes) != 0 {
		t.Fatalf("create frame slices/changes = %#v, want empty nonnil slices", frame)
	}

	if got := executeAction(manager, replayAction{Method: "createChild", Args: rawArgs(`1`)}); got != multisession.SessionID(2) {
		t.Fatalf("createChild result = %#v, want 2", got)
	}
	_, err = captureFrame(manager)
	if err != nil {
		t.Fatal(err)
	}
	inputs := replayAction{Method: "setChildInputs", Args: rawArgs(`1`, `2`, `{"Title":"Notebook","ReadOnly":false}`)}
	updated := executeAction(manager, inputs).(composition.Snapshot)
	if updated.State.Inputs.Title != "Notebook" || updated.State.InputRevision != 1 {
		t.Fatalf("setChildInputs result state = %#v", updated.State)
	}
	frame, err = captureFrame(manager)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(frame.Changes, []multisession.SessionID{2}) {
		t.Fatalf("dirty changes = %#v, want [2]", frame.Changes)
	}
	if len(frame.Sessions) != 2 || frame.Sessions[1].Snapshot.State.Inputs.Title != "Notebook" {
		t.Fatalf("full live snapshots missing child input: %#v", frame.Sessions)
	}
	if changes := executeAction(manager, replayAction{Method: "changes", Args: rawArgs()}); !reflect.DeepEqual(changes, []multisession.SessionID{}) {
		t.Fatalf("changes result after frame drain = %#v, want empty", changes)
	}

	before, err := manager.Snapshot(2)
	if err != nil {
		t.Fatal(err)
	}
	invalid := replayAction{Method: "setChildInputs", Args: rawArgs(`1`, `2`, `{"Title":"bad","ReadOnly":false,"extra":true}`)}
	if result := executeAction(manager, invalid); !isErrorResult(result) {
		t.Fatalf("malformed setChildInputs result = %#v, want error object", result)
	}
	after, err := manager.Snapshot(2)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Fatalf("invalid action changed child snapshot: before %#v after %#v", before, after)
	}

	removed := executeAction(manager, replayAction{Method: "disposeTree", Args: rawArgs(`1`)}).([]multisession.Disposal)
	if len(removed) != 2 || removed[0].SessionID != 2 || removed[1].SessionID != 1 {
		t.Fatalf("disposeTree result = %#v, want child-first postorder", removed)
	}
	frame, err = captureFrame(manager)
	if err != nil {
		t.Fatal(err)
	}
	if len(frame.Tree) != 0 || len(frame.Sessions) != 0 || frame.Tree == nil || frame.Sessions == nil || frame.Changes == nil {
		t.Fatalf("disposed frame = %#v, want empty nonnil full frame", frame)
	}
}

func TestReplayWrongArityAndUnknownMethodsAreErrorsWithoutMutation(t *testing.T) {
	manager := composition.NewManager()
	for _, action := range []replayAction{
		{Method: "create", Args: rawArgs(`1`)},
		{Method: "unknown", Args: rawArgs()},
	} {
		if result := executeAction(manager, action); !isErrorResult(result) {
			t.Errorf("executeAction(%#v) = %#v, want error object", action, result)
		}
	}
	if got := manager.List(); len(got) != 0 {
		t.Fatalf("failed actions created sessions: %#v", got)
	}
}

func isErrorResult(value any) bool {
	result, ok := value.(map[string]string)
	return ok && len(result) == 1 && result["error"] != ""
}
