package multisession

import (
	"reflect"
	"strconv"
	"testing"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/collection"
)

func createSession(t *testing.T, manager *Manager) SessionID {
	t.Helper()
	id, err := manager.Create()
	if err != nil {
		t.Fatalf("Create(): %v", err)
	}
	return id
}

func snapshot(t *testing.T, manager *Manager, id SessionID) collection.Snapshot {
	t.Helper()
	value, err := manager.Snapshot(id)
	if err != nil {
		t.Fatalf("Snapshot(%d): %v", id, err)
	}
	return value
}

func effects(t *testing.T, manager *Manager, id SessionID) []collection.Command {
	t.Helper()
	value, err := manager.Effects(id)
	if err != nil {
		t.Fatalf("Effects(%d): %v", id, err)
	}
	return value
}

func audit(t *testing.T, manager *Manager, id SessionID) []collection.Outcome {
	t.Helper()
	value, err := manager.Audit(id)
	if err != nil {
		t.Fatalf("Audit(%d): %v", id, err)
	}
	return value
}

func dispatch(t *testing.T, manager *Manager, id SessionID, path, event, value, key string) collection.Snapshot {
	t.Helper()
	snapshot, err := manager.Dispatch(id, collection.Step{Path: path, Event: event, Value: value, Key: key})
	if err != nil {
		t.Fatalf("Dispatch(%d, %+v): %v", id, collection.Step{Path: path, Event: event, Value: value, Key: key}, err)
	}
	return snapshot
}

func prepareSave(t *testing.T, manager *Manager, id SessionID, value string) {
	t.Helper()
	dispatch(t, manager, id, "0", "click", "", "add")
	dispatch(t, manager, id, "2/0/0", "input", value, "row-1-input")
	dispatch(t, manager, id, "2/0/5", "click", "", "row-1-save")
}

func preparePendingRows(t *testing.T, manager *Manager, id SessionID, values []string) {
	t.Helper()
	for index, value := range values {
		dispatch(t, manager, id, "0", "click", "", "add")
		rowIndex := strconv.Itoa(index)
		rowID := strconv.Itoa(index + 1)
		dispatch(t, manager, id, "2/"+rowIndex+"/0", "input", value, "row-"+rowID+"-input")
		dispatch(t, manager, id, "2/"+rowIndex+"/5", "click", "", "row-"+rowID+"-save")
	}
}

func TestCreateAllocatesMonotonicIDsAndListIsSorted(t *testing.T) {
	manager := NewManager()
	first := createSession(t, manager)
	second := createSession(t, manager)
	third := createSession(t, manager)
	if first != 1 || second != 2 || third != 3 {
		t.Fatalf("created IDs = %d, %d, %d; want 1, 2, 3", first, second, third)
	}
	if _, err := manager.Dispose(second); err != nil {
		t.Fatalf("Dispose(%d): %v", second, err)
	}
	fourth := createSession(t, manager)
	if fourth != 4 {
		t.Fatalf("ID after disposal = %d; want 4", fourth)
	}
	if got, want := manager.List(), []SessionID{first, third, fourth}; !reflect.DeepEqual(got, want) {
		t.Fatalf("List() = %v; want %v", got, want)
	}
}

func TestSessionsKeepSameRowAndRequestIDsIndependent(t *testing.T) {
	manager := NewManager()
	first := createSession(t, manager)
	second := createSession(t, manager)
	prepareSave(t, manager, first, "first draft")
	prepareSave(t, manager, second, "second draft")

	firstSnapshot := snapshot(t, manager, first)
	secondSnapshot := snapshot(t, manager, second)
	if firstSnapshot.State.Rows[0].ID != 1 || secondSnapshot.State.Rows[0].ID != 1 ||
		firstSnapshot.State.Rows[0].PendingID != 1 || secondSnapshot.State.Rows[0].PendingID != 1 {
		t.Fatalf("per-session IDs unexpectedly differ: first=%#v second=%#v", firstSnapshot.State.Rows[0], secondSnapshot.State.Rows[0])
	}
	if got, want := effects(t, manager, first), []collection.Command{{Kind: "start", ID: 1, Value: "first draft"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("first Effects() = %#v; want %#v", got, want)
	}
	if got, want := effects(t, manager, second), []collection.Command{{Kind: "start", ID: 1, Value: "second draft"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("second Effects() = %#v; want %#v", got, want)
	}
}

func TestDisposeReturnsPendingCancelsInRowOrderAndRemovesSession(t *testing.T) {
	manager := NewManager()
	id := createSession(t, manager)
	for i := range 3 {
		dispatch(t, manager, id, "0", "click", "", "add")
		dispatch(t, manager, id, "2/"+string(rune('0'+i))+"/0", "input", "draft", "row-"+string(rune('1'+i))+"-input")
		dispatch(t, manager, id, "2/"+string(rune('0'+i))+"/5", "click", "", "row-"+string(rune('1'+i))+"-save")
	}
	// The start effects have already been handed to their effect host. Disposal
	// must still return cancels for all live requests in visible row order.
	if _, err := manager.Effects(id); err != nil {
		t.Fatal(err)
	}

	got, err := manager.Dispose(id)
	if err != nil {
		t.Fatalf("Dispose(%d): %v", id, err)
	}
	want := []collection.Command{{Kind: "cancel", ID: 1}, {Kind: "cancel", ID: 2}, {Kind: "cancel", ID: 3}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Dispose() cancels = %#v; want %#v", got, want)
	}
	if listed := manager.List(); len(listed) != 0 {
		t.Fatalf("List() after disposal = %v", listed)
	}
	if _, err := manager.Snapshot(id); err == nil {
		t.Fatal("Snapshot on disposed session succeeded")
	}
	if _, err := manager.Complete(id, collection.Reply{ID: 1, Value: "late reply"}); err == nil {
		t.Fatal("Complete on disposed session succeeded")
	}
	if _, err := manager.Dispose(id); err == nil {
		t.Fatal("second Dispose succeeded")
	}
}

func TestDisposeReturnsCancelsEvenWhenStartEffectsRemainQueued(t *testing.T) {
	manager := NewManager()
	id := createSession(t, manager)
	prepareSave(t, manager, id, "queued start")
	if got, err := manager.Dispose(id); err != nil || !reflect.DeepEqual(got, []collection.Command{{Kind: "cancel", ID: 1}}) {
		t.Fatalf("Dispose() = %#v, %v; want cancel 1", got, err)
	}
	if got := manager.List(); len(got) != 0 {
		t.Fatalf("List() after queued-start disposal = %v", got)
	}
}

func TestDisposeReturnsQueuedCancelAfterRemoveBeforeDispose(t *testing.T) {
	manager := NewManager()
	id := createSession(t, manager)
	prepareSave(t, manager, id, "remove draft")
	dispatch(t, manager, id, "2/0/6", "click", "", "row-1-remove")

	got, err := manager.Dispose(id)
	want := []collection.Command{{Kind: "cancel", ID: 1}}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("Dispose after queued remove cancel = %#v, %v; want %#v", got, err, want)
	}
}

func TestDisposeReturnsQueuedCancelAfterCancelBeforeDispose(t *testing.T) {
	manager := NewManager()
	id := createSession(t, manager)
	prepareSave(t, manager, id, "cancel draft")
	dispatch(t, manager, id, "2/0/8", "click", "", "row-1-cancel")

	got, err := manager.Dispose(id)
	want := []collection.Command{{Kind: "cancel", ID: 1}}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("Dispose after queued cancel action = %#v, %v; want %#v", got, err, want)
	}
}

func TestDisposeReturnsQueuedResetCancelsBeforeDispose(t *testing.T) {
	manager := NewManager()
	id := createSession(t, manager)
	preparePendingRows(t, manager, id, []string{"one", "two", "three"})
	dispatch(t, manager, id, "1", "click", "", "reset")

	got, err := manager.Dispose(id)
	want := []collection.Command{{Kind: "cancel", ID: 1}, {Kind: "cancel", ID: 2}, {Kind: "cancel", ID: 3}}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("Dispose after queued reset cancels = %#v, %v; want %#v", got, err, want)
	}
}

func TestDisposeCombinesQueuedAndPendingCancelsInOrderWithoutDuplicates(t *testing.T) {
	manager := NewManager()
	id := createSession(t, manager)
	preparePendingRows(t, manager, id, []string{"one", "two", "three", "four"})
	// These transitions queue cancels in request order 2, 1, 4 while request 3
	// and replacement request 5 remain pending in visible row order.
	dispatch(t, manager, id, "2/1/8", "click", "", "row-2-cancel")
	dispatch(t, manager, id, "2/0/6", "click", "", "row-1-remove")
	dispatch(t, manager, id, "2/2/0", "input", "four revised", "row-4-input")
	dispatch(t, manager, id, "2/2/5", "click", "", "row-4-save")

	got, err := manager.Dispose(id)
	want := []collection.Command{
		{Kind: "cancel", ID: 2},
		{Kind: "cancel", ID: 1},
		{Kind: "cancel", ID: 4},
		{Kind: "cancel", ID: 3},
		{Kind: "cancel", ID: 5},
	}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("combined disposal cancels = %#v, %v; want %#v", got, err, want)
	}
	seen := make(map[uint64]bool, len(got))
	for _, command := range got {
		if command.Kind != "cancel" || seen[command.ID] {
			t.Fatalf("disposal returned a non-cancel or duplicate command: %#v", got)
		}
		seen[command.ID] = true
	}
}

func TestDisposeCancelCollectionDeduplicatesAndPreservesFirstOccurrenceOrder(t *testing.T) {
	queued := []collection.Command{
		{Kind: "start", ID: 9},
		{Kind: "cancel", ID: 2},
		{Kind: "cancel", ID: 1},
		{Kind: "cancel", ID: 2},
		{Kind: "start", ID: 7},
	}
	rows := []collection.Row{{PendingID: 7}, {PendingID: 3}, {PendingID: 1}}
	got := collectDisposeCancels(queued, rows)
	want := []collection.Command{
		{Kind: "cancel", ID: 2},
		{Kind: "cancel", ID: 1},
		{Kind: "cancel", ID: 7},
		{Kind: "cancel", ID: 3},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("collectDisposeCancels() = %#v; want %#v", got, want)
	}
}

func TestCompleteAndAuditAreScopedToOneSession(t *testing.T) {
	manager := NewManager()
	first := createSession(t, manager)
	second := createSession(t, manager)
	prepareSave(t, manager, first, "first")
	prepareSave(t, manager, second, "second")

	if _, err := manager.Complete(first, collection.Reply{ID: 1, Value: "first saved"}); err != nil {
		t.Fatal(err)
	}
	if got, want := audit(t, manager, first), []collection.Outcome{{ID: 1, RowID: 1, Value: "first saved", Accepted: true, Reason: "saved"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("first Audit() = %#v; want %#v", got, want)
	}
	if got := audit(t, manager, second); len(got) != 0 {
		t.Fatalf("second Audit() = %#v; want empty", got)
	}
	if _, err := manager.Complete(second, collection.Reply{ID: 1, Value: "second saved"}); err != nil {
		t.Fatal(err)
	}
	if got := snapshot(t, manager, first).State.Rows[0].Saved; got != "first saved" {
		t.Fatalf("first saved value = %q", got)
	}
	if got := snapshot(t, manager, second).State.Rows[0].Saved; got != "second saved" {
		t.Fatalf("second saved value = %q", got)
	}
}

func TestUnknownSessionIDsAreRejectedByEveryScopedMethod(t *testing.T) {
	manager := NewManager()
	id := SessionID(0)
	if _, err := manager.Snapshot(id); err == nil {
		t.Fatal("Snapshot(0) succeeded")
	}
	if _, err := manager.Dispatch(id, collection.Step{}); err == nil {
		t.Fatal("Dispatch(0) succeeded")
	}
	if _, err := manager.Effects(id); err == nil {
		t.Fatal("Effects(0) succeeded")
	}
	if _, err := manager.Complete(id, collection.Reply{ID: 1}); err == nil {
		t.Fatal("Complete(0) succeeded")
	}
	if _, err := manager.Audit(id); err == nil {
		t.Fatal("Audit(0) succeeded")
	}
	if _, err := manager.Dispose(id); err == nil {
		t.Fatal("Dispose(0) succeeded")
	}
}

func TestManagerOutputsAreMutationIsolated(t *testing.T) {
	manager := NewManager()
	id := createSession(t, manager)
	prepareSave(t, manager, id, "safe draft")

	snapshot, err := manager.Snapshot(id)
	if err != nil {
		t.Fatal(err)
	}
	snapshot.State.Rows[0].Draft = "mutated state"
	snapshot.Messages[0].Name = "mutated message"
	snapshot.Tree.Kids[2].Kids[0].Kids[0].Attrs[1].Value = "mutated tree"
	snapshot.Bindings[0].Message = "mutated binding"
	again, err := manager.Snapshot(id)
	if err != nil {
		t.Fatal(err)
	}
	if again.State.Rows[0].Draft != "safe draft" || again.Messages[0].Name != "add" ||
		again.Tree.Kids[2].Kids[0].Kids[0].Attrs[1].Value != "safe draft" ||
		again.Bindings[0].Message != "edit/1" {
		t.Fatalf("Snapshot shares mutable storage: %#v", again)
	}

	queuedEffects := effects(t, manager, id)
	if len(queuedEffects) != 1 || queuedEffects[0].Value != "safe draft" {
		t.Fatalf("Effects() = %#v", queuedEffects)
	}
	queuedEffects[0].Value = "mutated effect"
	if remaining, err := manager.Effects(id); err != nil || len(remaining) != 0 {
		t.Fatalf("Effects() did not drain once: %#v, %v", remaining, err)
	}

	if _, err := manager.Complete(id, asyncsave.Reply{ID: 1, Value: "audited"}); err != nil {
		t.Fatal(err)
	}
	audited := audit(t, manager, id)
	audited[0].Value = "mutated audit"
	if got := audit(t, manager, id); len(got) != 1 || got[0].Value != "audited" {
		t.Fatalf("Audit() shares mutable storage: %#v", got)
	}

	listed := manager.List()
	listed[0] = 99
	if got := manager.List(); !reflect.DeepEqual(got, []SessionID{id}) {
		t.Fatalf("List() shares mutable storage: %v", got)
	}
}

func TestCreateRejectsExhaustedSafeIntegerSessionIDSpace(t *testing.T) {
	manager := NewManager()
	manager.nextID = SessionID(MaxSessionID)
	if _, err := manager.Create(); err == nil {
		t.Fatal("Create succeeded after exhausting JavaScript-safe session IDs")
	}
}
