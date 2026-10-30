package asyncsave

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/editor"
	"github.com/samuelpmahan/gondola/gobi"
)

const maxSafeID uint64 = 9007199254740991

func dispatch(t *testing.T, s *Session, path, event, value string) Snapshot {
	t.Helper()
	snapshot, err := s.Dispatch(gobi.Step{Path: path, Event: event, Value: value})
	if err != nil {
		t.Fatalf("Dispatch(%q, %q, %q): %v", path, event, value, err)
	}
	return snapshot
}

func TestInitialSnapshotAndViewContract(t *testing.T) {
	s := NewSession()
	snapshot := s.Snapshot()
	if snapshot.State.Draft != "" || snapshot.State.Saved != "" || snapshot.State.Saves != 0 || snapshot.State.NextID != 0 || snapshot.State.PendingID != 0 || snapshot.State.Status != "idle" {
		t.Fatalf("unexpected initial state: %+v", snapshot.State)
	}
	if len(snapshot.Tree.Kids) != 8 {
		t.Fatalf("view has %d children, want 8", len(snapshot.Tree.Kids))
	}
	if len(snapshot.Bindings) != 1 || snapshot.Bindings[0].Path != "0" || snapshot.Bindings[0].Event != "input" || snapshot.Bindings[0].Message != "edit" || string(snapshot.Bindings[0].Source) != "target.value" {
		t.Fatalf("editor input binding changed: %+v", snapshot.Bindings)
	}
	if got := snapshot.Tree.Kids[0].Attrs[1].Value; got != "" {
		t.Fatalf("initial input value = %q", got)
	}
	if got := snapshot.Tree.Kids[5].Kids[0].Text; got != "Cancel" {
		t.Fatalf("cancel label = %q", got)
	}
	if !hasFlag(snapshot.Tree.Kids[5], "disabled") {
		t.Fatal("cancel must start disabled")
	}
	if got := snapshot.Tree.Kids[6].Kids[0].Text; got != "Status: idle" {
		t.Fatalf("status text = %q", got)
	}
	if got := snapshot.Tree.Kids[7].Kids[0].Text; got != "Pending: 0" {
		t.Fatalf("pending text = %q", got)
	}
	if snapshot.Messages == nil || len(snapshot.Messages) != 0 {
		t.Fatalf("initial messages must be an empty array: %#v", snapshot.Messages)
	}
	if effects := s.Effects(); effects == nil || len(effects) != 0 {
		t.Fatalf("initial effects must be empty: %#v", effects)
	}
	if audit := s.Audit(); audit == nil || len(audit) != 0 {
		t.Fatalf("initial audit must be empty: %#v", audit)
	}
}

func TestSaveCapturesExactDraftAndOutOfOrderReplyIsAudited(t *testing.T) {
	s := NewSession()
	dispatch(t, s, "0", "input", "  alpha\n")
	dispatch(t, s, "3", "click", "ignored")
	first := s.Snapshot()
	if first.State.NextID != 1 || first.State.PendingID != 1 || first.State.Status != "pending" {
		t.Fatalf("first save state: %+v", first.State)
	}
	if got := s.Effects(); !reflect.DeepEqual(got, []Command{{Kind: "start", ID: 1, Value: "  alpha\n"}}) {
		t.Fatalf("first effect = %#v", got)
	}

	// Editing does not cancel the captured request. The next save retires it and
	// allocates a strictly larger ID with the new exact draft.
	dispatch(t, s, "0", "input", "beta")
	dispatch(t, s, "3", "click", "")
	second := s.Snapshot()
	if second.State.Draft != "beta" || second.State.NextID != 2 || second.State.PendingID != 2 || second.State.Status != "pending" {
		t.Fatalf("second save state: %+v", second.State)
	}
	wantEffects := []Command{
		{Kind: "cancel", ID: 1},
		{Kind: "start", ID: 2, Value: "beta"},
	}
	if got := s.Effects(); !reflect.DeepEqual(got, wantEffects) {
		t.Fatalf("replacement effects = %#v, want %#v", got, wantEffects)
	}

	accepted, err := s.Complete(Reply{ID: 2, Value: "server value\n"})
	if err != nil {
		t.Fatalf("complete active reply: %v", err)
	}
	if accepted.State.Saved != "server value\n" || accepted.State.Saves != 1 || accepted.State.PendingID != 0 || accepted.State.Status != "saved" {
		t.Fatalf("accepted state: %+v", accepted.State)
	}
	beforeStale := accepted.State
	stale, err := s.Complete(Reply{ID: 1, Value: "late first"})
	if err != nil {
		t.Fatalf("complete stale reply: %v", err)
	}
	if stale.State != beforeStale {
		t.Fatalf("stale reply changed state: before=%+v after=%+v", beforeStale, stale.State)
	}
	if len(stale.Messages) != 6 || stale.Messages[4] != (gobi.Message{Name: "reply", Arg: "2"}) || stale.Messages[5] != (gobi.Message{Name: "reply", Arg: "1"}) {
		t.Fatalf("completion messages not retained in delivery order: %#v", stale.Messages)
	}
	wantAudit := []Outcome{
		{ID: 2, Value: "server value\n", Accepted: true, Reason: "saved"},
		{ID: 1, Value: "late first", Accepted: false, Reason: "stale"},
	}
	if got := s.Audit(); !reflect.DeepEqual(got, wantAudit) {
		t.Fatalf("audit = %#v, want %#v", got, wantAudit)
	}
	if effects := s.Effects(); len(effects) != 0 {
		t.Fatalf("completion produced effects: %#v", effects)
	}
}

func TestCancelResetAndLateReplyPreserveMonotonicIDs(t *testing.T) {
	s := NewSession()
	dispatch(t, s, "0", "input", "one")
	dispatch(t, s, "3", "click", "")
	s.Effects()
	dispatch(t, s, "5", "click", "")
	cancelled := s.Snapshot()
	if cancelled.State.PendingID != 0 || cancelled.State.Status != "cancelled" || cancelled.State.Draft != "one" {
		t.Fatalf("cancel state: %+v", cancelled.State)
	}
	if got := s.Effects(); !reflect.DeepEqual(got, []Command{{Kind: "cancel", ID: 1}}) {
		t.Fatalf("cancel effect = %#v", got)
	}
	if hasFlag(cancelled.Tree.Kids[4], "disabled") {
		t.Fatal("reset should be enabled after cancellation even with unchanged editor fields")
	}
	reset := dispatch(t, s, "4", "click", "").State
	if reset != (State{State: editor.State{}, NextID: 1, Status: "idle"}) {
		t.Fatalf("reset must clear editor work and preserve next ID: %+v", reset)
	}
	late, err := s.Complete(Reply{ID: 1, Value: "must not apply"})
	if err != nil {
		t.Fatalf("complete late cancelled reply: %v", err)
	}
	if late.State != reset || s.Audit()[0].Reason != "stale" {
		t.Fatalf("late cancelled reply was not fenced: state=%+v audit=%+v", late.State, s.Audit())
	}
	dispatch(t, s, "0", "input", "two")
	dispatch(t, s, "3", "click", "")
	if got := s.Snapshot().State; got.NextID != 2 || got.PendingID != 2 {
		t.Fatalf("reset reused a request ID: %+v", got)
	}
}

func TestResetPendingAndActiveErrorPreserveExpectedStateAndAllowRetry(t *testing.T) {
	s := NewSession()
	dispatch(t, s, "0", "input", "kept")
	dispatch(t, s, "3", "click", "")
	s.Effects()
	if _, err := s.Complete(Reply{ID: 1, Value: "old saved"}); err != nil {
		t.Fatal(err)
	}
	dispatch(t, s, "0", "input", "will reset")
	dispatch(t, s, "3", "click", "")
	s.Effects()
	dispatch(t, s, "4", "click", "")
	reset := s.Snapshot()
	if reset.State != (State{NextID: 2, Status: "idle"}) {
		t.Fatalf("reset pending state: %+v", reset.State)
	}
	if got := s.Effects(); !reflect.DeepEqual(got, []Command{{Kind: "cancel", ID: 2}}) {
		t.Fatalf("reset pending effect = %#v", got)
	}
	if _, err := s.Complete(Reply{ID: 2, Error: "network failed"}); err != nil {
		t.Fatal(err)
	}
	// The late reply remains stale, so it does not turn idle into error.
	if got := s.Snapshot().State; got.Status != "idle" || got.Saved != "" || got.Saves != 0 || got.NextID != 2 {
		t.Fatalf("late error changed reset state: %+v", got)
	}
	if got := s.Audit()[1]; got.Accepted || got.Reason != "stale" || got.Error != "network failed" {
		t.Fatalf("late error audit = %+v", got)
	}

	dispatch(t, s, "0", "input", "retry me")
	dispatch(t, s, "3", "click", "")
	s.Effects()
	if _, err := s.Complete(Reply{ID: 3, Value: "new saved"}); err != nil {
		t.Fatal(err)
	}
	dispatch(t, s, "0", "input", "error attempt")
	dispatch(t, s, "3", "click", "")
	s.Effects()
	if _, err := s.Complete(Reply{ID: 4, Error: "temporary"}); err != nil {
		t.Fatal(err)
	}
	errorState := s.Snapshot().State
	if errorState.Saved != "new saved" || errorState.Saves != 1 || errorState.PendingID != 0 || errorState.Status != "error: temporary" {
		t.Fatalf("active error state: %+v", errorState)
	}
	if got := s.Audit()[3]; !got.Accepted || got.Reason != "error" || got.Error != "temporary" {
		t.Fatalf("active error audit = %+v", got)
	}
	if hasFlag(s.Snapshot().Tree.Kids[4], "disabled") {
		t.Fatal("reset should remain enabled after an active error")
	}
	dispatch(t, s, "3", "click", "")
	if got := s.Snapshot().State; got.NextID != 5 || got.PendingID != 5 || got.Status != "pending" {
		t.Fatalf("retry did not use fresh ID: %+v", got)
	}
	if got := s.Effects(); !reflect.DeepEqual(got, []Command{{Kind: "start", ID: 5, Value: "error attempt"}}) {
		t.Fatalf("retry effect = %#v", got)
	}
}

func TestResetRemainsEnabledForNonIdleStatusWithEmptyEditorFields(t *testing.T) {
	s := NewSession()
	dispatch(t, s, "0", "input", "temporary")
	dispatch(t, s, "3", "click", "")
	s.Effects()
	dispatch(t, s, "0", "input", "")
	if _, err := s.Complete(Reply{ID: 1, Error: "failed"}); err != nil {
		t.Fatal(err)
	}
	state := s.Snapshot().State
	if state.State != (editor.State{}) || state.Status != "error: failed" {
		t.Fatalf("test setup did not reach empty editor/error state: %+v", state)
	}
	if hasFlag(s.Snapshot().Tree.Kids[4], "disabled") {
		t.Fatal("reset must be enabled when status is non-idle even if editor fields are empty")
	}
	reset := dispatch(t, s, "4", "click", "").State
	if reset != (State{State: editor.State{}, NextID: 1, Status: "idle"}) {
		t.Fatalf("reset from non-idle empty editor state = %+v", reset)
	}
}

func TestDuplicateReplyIsObservableButDoesNotApplyTwice(t *testing.T) {
	s := NewSession()
	dispatch(t, s, "0", "input", "draft")
	dispatch(t, s, "3", "click", "")
	first, err := s.Complete(Reply{ID: 1, Value: "answer"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.Complete(Reply{ID: 1, Value: "different"})
	if err != nil {
		t.Fatal(err)
	}
	if second.State != first.State {
		t.Fatalf("duplicate reply changed state: first=%+v second=%+v", first.State, second.State)
	}
	if len(second.Messages) != 4 || second.Messages[3] != (gobi.Message{Name: "reply", Arg: "1"}) {
		t.Fatalf("duplicate reply message missing: %#v", second.Messages)
	}
	if got := s.Audit()[1]; got.Accepted || got.Reason != "stale" || got.Value != "different" {
		t.Fatalf("duplicate reply audit = %+v", got)
	}
}

func TestDisabledActionsAndInvalidInputsAreAtomic(t *testing.T) {
	s := NewSession()
	initial := s.Snapshot()
	// A correctly addressed disabled Save/Reset/Cancel is a no-op.
	dispatch(t, s, "3", "click", "")
	dispatch(t, s, "4", "click", "")
	dispatch(t, s, "5", "click", "")
	if got := s.Snapshot(); !reflect.DeepEqual(got, initial) {
		t.Fatalf("disabled actions changed snapshot:\n before=%#v\n after=%#v", initial, got)
	}
	if effects := s.Effects(); len(effects) != 0 {
		t.Fatalf("disabled action effects: %#v", effects)
	}
	for _, reply := range []Reply{{ID: 0, Value: "bad"}, {ID: maxSafeID + 1, Value: "bad"}} {
		before := s.Snapshot()
		beforeAudit := s.Audit()
		if _, err := s.Complete(reply); err == nil {
			t.Fatalf("Complete(%+v) should reject invalid ID", reply)
		}
		if got := s.Snapshot(); !reflect.DeepEqual(got, before) {
			t.Fatalf("invalid reply changed session:\n before=%#v\n after=%#v", before, got)
		}
		if got := s.Audit(); !reflect.DeepEqual(got, beforeAudit) {
			t.Fatalf("invalid reply changed audit: before=%#v after=%#v", beforeAudit, got)
		}
	}
	if _, err := s.Dispatch(gobi.Step{Path: "99", Event: "click"}); err == nil {
		t.Fatal("invalid dispatch path should fail")
	}
	if got := s.Snapshot(); !reflect.DeepEqual(got, initial) {
		t.Fatalf("invalid dispatch changed snapshot: %#v", got)
	}
}

func TestAllocationAtSafeIntegerLimitRejectsAtomically(t *testing.T) {
	s := NewSession()
	s.state.NextID = maxSafeID
	dispatch(t, s, "0", "input", "at limit")
	before := s.Snapshot()
	if _, err := s.Dispatch(gobi.Step{Path: "3", Event: "click"}); err == nil {
		t.Fatal("allocation beyond max safe integer should fail")
	}
	if got := s.Snapshot(); !reflect.DeepEqual(got, before) {
		t.Fatalf("failed allocation changed snapshot:\n before=%#v\n after=%#v", before, got)
	}
	if effects := s.Effects(); len(effects) != 0 {
		t.Fatalf("failed allocation emitted effects: %#v", effects)
	}
}

func TestExhaustedReplacementDoesNotCancelCurrentRequestOrLogSave(t *testing.T) {
	s := NewSession()
	dispatch(t, s, "0", "input", "draft")
	dispatch(t, s, "3", "click", "")
	s.Effects()
	// This reachable boundary has one last safe ID already active.
	s.state.NextID = maxSafeID
	s.state.PendingID = maxSafeID
	before := s.Snapshot()
	if _, err := s.Dispatch(gobi.Step{Path: "3", Event: "click"}); err == nil {
		t.Fatal("replacement at the exhausted ID boundary should fail")
	}
	if got := s.Snapshot(); !reflect.DeepEqual(got, before) {
		t.Fatalf("exhausted replacement changed state or history:\n before=%#v\n after=%#v", before, got)
	}
	if effects := s.Effects(); len(effects) != 0 {
		t.Fatalf("exhausted replacement cancelled or started work: %#v", effects)
	}
}

func TestPureUpdateReturnsStateAndTypedCommands(t *testing.T) {
	state := Init()
	state.Draft = "captured"
	state.NextID = 7
	state.PendingID = 6
	state.Status = "pending"
	next, commands, err := Update(state, gobi.Message{Name: "save"})
	if err != nil {
		t.Fatal(err)
	}
	want := []Command{{Kind: "cancel", ID: 6}, {Kind: "start", ID: 8, Value: "captured"}}
	if !reflect.DeepEqual(commands, want) {
		t.Fatalf("Update commands = %#v, want %#v", commands, want)
	}
	if next.NextID != 8 || next.PendingID != 8 || next.Status != "pending" || next.Draft != "captured" {
		t.Fatalf("Update state = %+v", next)
	}
	if state.NextID != 7 || state.PendingID != 6 || state.Status != "pending" {
		t.Fatalf("Update mutated its input: %+v", state)
	}
}

func TestSnapshotAndReceiptCopiesAreIsolatedAndJSONShapeIsStable(t *testing.T) {
	s := NewSession()
	dispatch(t, s, "0", "input", "x")
	dispatch(t, s, "3", "click", "")
	snapshot := s.Snapshot()
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &envelope); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"state", "tree", "bindings", "messages"} {
		if _, ok := envelope[key]; !ok {
			t.Errorf("snapshot missing top-level %q: %s", key, encoded)
		}
	}
	var state map[string]json.RawMessage
	if err := json.Unmarshal(envelope["state"], &state); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"Draft", "Saved", "Saves", "NextID", "PendingID", "Status"} {
		if _, ok := state[key]; !ok {
			t.Errorf("flattened state missing %q", key)
		}
	}
	stateJSON := string(envelope["state"])
	orderedStateKeys := []string{`"Draft"`, `"Saved"`, `"Saves"`, `"NextID"`, `"PendingID"`, `"Status"`}
	previous := -1
	for _, key := range orderedStateKeys {
		at := strings.Index(stateJSON, key)
		if at <= previous {
			t.Fatalf("state JSON fields are out of contract order: %s", stateJSON)
		}
		previous = at
	}
	commandJSON, err := json.Marshal(Command{Kind: "start", ID: 7, Value: "x"})
	if err != nil || string(commandJSON) != `{"Kind":"start","ID":7,"Value":"x"}` {
		t.Fatalf("command JSON order/shape = %s, err=%v", commandJSON, err)
	}
	outcomeJSON, err := json.Marshal(Outcome{ID: 7, Value: "x", Error: "", Accepted: true, Reason: "saved"})
	if err != nil || string(outcomeJSON) != `{"ID":7,"Value":"x","Error":"","Accepted":true,"Reason":"saved"}` {
		t.Fatalf("outcome JSON order/shape = %s, err=%v", outcomeJSON, err)
	}
	snapshot.Messages[0].Arg = "mutated"
	snapshot.Tree.Kids[0].Attrs[1].Value = "mutated"
	if _, err := s.Complete(Reply{ID: 1, Value: "ok"}); err != nil {
		t.Fatal(err)
	}
	audit := s.Audit()
	audit[0].Value = "mutated"
	auditAgain := s.Audit()
	if auditAgain[0].Value != "ok" || s.Snapshot().Messages[0].Arg != "x" {
		t.Fatalf("returned snapshot or audit aliased session storage: audit=%+v messages=%+v", auditAgain, s.Snapshot().Messages)
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
