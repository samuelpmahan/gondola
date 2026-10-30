package interaction

import (
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
)

func TestDispatchRepeatedAddClicks(t *testing.T) {
	session := New()
	for i := 0; i < 2; i++ {
		if _, err := session.Dispatch(gobi.Step{Path: "1", Event: "click"}); err != nil {
			t.Fatalf("dispatch add click %d: %v", i+1, err)
		}
	}

	snapshot := session.Snapshot()
	if snapshot.State.Count != 2 {
		t.Fatalf("count = %v, want 2", snapshot.State.Count)
	}
	if len(snapshot.Messages) != 2 {
		t.Fatalf("messages = %v, want two add messages", snapshot.Messages)
	}
	for i, message := range snapshot.Messages {
		if message != (gobi.Message{Name: "add"}) {
			t.Errorf("message %d = %#v, want add", i, message)
		}
	}
}

func TestDisabledResetAtZeroIsIgnored(t *testing.T) {
	session := New()
	snapshot, err := session.Dispatch(gobi.Step{Path: "2", Event: "click"})
	if err != nil {
		t.Fatalf("dispatch disabled reset: %v", err)
	}
	if snapshot.State.Count != 0 || len(snapshot.Messages) != 0 {
		t.Fatalf("disabled reset changed session: %#v", snapshot)
	}
}

func TestDispatchResetAndReinitialize(t *testing.T) {
	session := New()
	for _, step := range []gobi.Step{
		{Path: "1", Event: "click"},
		{Path: "2", Event: "click"},
		{Path: "1", Event: "click"},
	} {
		if _, err := session.Dispatch(step); err != nil {
			t.Fatalf("dispatch %#v: %v", step, err)
		}
	}
	snapshot := session.Snapshot()
	if snapshot.State.Count != 1 {
		t.Fatalf("count after add/reset/add = %v, want 1", snapshot.State.Count)
	}
	if len(snapshot.Messages) != 3 || snapshot.Messages[1].Name != "reset" {
		t.Fatalf("messages = %#v, want add/reset/add", snapshot.Messages)
	}

	reset := New().Snapshot()
	if reset.State.Count != 0 || len(reset.Messages) != 0 {
		t.Fatalf("fresh session snapshot = %#v, want zero state and empty messages", reset)
	}
	if reset.Messages == nil {
		t.Fatal("empty messages slice is nil")
	}
}

func TestDispatchRejectsMissingTargetAndEvent(t *testing.T) {
	tests := []struct {
		name string
		step gobi.Step
	}{
		{name: "missing child", step: gobi.Step{Path: "3", Event: "click"}},
		{name: "node has no handler", step: gobi.Step{Path: "0", Event: "click"}},
		{name: "event not declared", step: gobi.Step{Path: "1", Event: "mouseover"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			session := New()
			_, err := session.Dispatch(test.step)
			if err == nil {
				t.Fatalf("Dispatch(%#v) unexpectedly succeeded", test.step)
			}
			if snapshot := session.Snapshot(); snapshot.State.Count != 0 || len(snapshot.Messages) != 0 {
				t.Fatalf("failed dispatch changed session: %#v", snapshot)
			}
		})
	}
}
