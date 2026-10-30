package effect

import (
	"math"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
)

func TestRequestCommitsBeforeSingleReplyCompletion(t *testing.T) {
	state := Init()
	state, effects := Update(state, gobi.Message{Name: "edit", Arg: "reply payload"})
	if len(effects) != 0 {
		t.Fatalf("edit emitted effects %#v", effects)
	}
	state, effects = Update(state, gobi.Message{Name: "request"})
	if len(effects) != 1 || effects[0] != (gobi.Effect{Kind: "fixture.request", Name: "lookup", Arg: "reply payload", Reply: "complete"}) {
		t.Fatalf("request state/effects = %#v, %#v", state, effects)
	}
	if !state.Pending || state.Status != "pending" || state.Requests != 1 || state.Completions != 0 {
		t.Fatalf("request must commit pending state before host reply: %#v", state)
	}
	state, effects = Update(state, gobi.Message{Name: "complete", Arg: "received"})
	if len(effects) != 0 || state.Pending || state.Status != "complete" || state.Value != "received" || state.Completions != 1 {
		t.Fatalf("completion = %#v, effects %#v", state, effects)
	}
	state, effects = Update(state, gobi.Message{Name: "complete", Arg: "duplicate"})
	if len(effects) != 0 || state.Value != "received" || state.Completions != 1 {
		t.Fatalf("duplicate completion changed state: %#v, effects %#v", state, effects)
	}
}

func TestNegativeZeroIsPresentInInitialState(t *testing.T) {
	state := Init()
	if !math.Signbit(state.NegativeZero) || state.NegativeZero != 0 {
		t.Fatalf("NegativeZero = %v; want IEEE-754 negative zero", state.NegativeZero)
	}
}

func TestCountersStayWithinSafeIntegerRange(t *testing.T) {
	requestLimit := State{Input: "x", Requests: 9007199254740991}
	got, effects := Update(requestLimit, gobi.Message{Name: "request"})
	if got != requestLimit || len(effects) != 0 {
		t.Fatalf("request at safe integer limit = %#v, effects %#v", got, effects)
	}
	completionLimit := State{Pending: true, Completions: 9007199254740991, Status: "pending"}
	got, effects = Update(completionLimit, gobi.Message{Name: "complete", Arg: "ignored"})
	if got != completionLimit || len(effects) != 0 {
		t.Fatalf("completion at safe integer limit = %#v, effects %#v", got, effects)
	}
}

func TestViewPublishesTypedInputAndPendingControl(t *testing.T) {
	view := View(State{Input: "lookup", Pending: true, Status: "pending", Requests: 1})
	if view.Bindings == nil || len(view.Bindings) != 1 || view.Bindings[0].Path != "0" || view.Bindings[0].Source != "target.value" {
		t.Fatalf("request input binding = %#v", view.Bindings)
	}
	request := view.Tree.Kids[1]
	for _, attr := range request.Attrs {
		if attr.Name == "disabled" && attr.Flag {
			return
		}
	}
	t.Fatalf("request button should be disabled while pending: %#v", request.Attrs)
}
