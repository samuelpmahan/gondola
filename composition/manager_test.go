package composition

import (
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"unicode/utf8"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/collection"
	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/multisession"
)

func TestSetChildInputsRequiresImmediateLiveParentAndAdvancesRevision(t *testing.T) {
	m := NewManager()
	root := mustCreate(t, m)
	child := mustCreateChild(t, m, root)
	sibling := mustCreateChild(t, m, root)
	grandchild := mustCreateChild(t, m, child)

	first, err := m.SetChildInputs(root, child, Inputs{Title: "child", ReadOnly: true})
	if err != nil {
		t.Fatalf("SetChildInputs() error = %v", err)
	}
	if first.State.InputRevision != 1 || first.State.Inputs != (Inputs{Title: "child", ReadOnly: true}) {
		t.Fatalf("first child state = %#v", first.State)
	}
	second, err := m.SetChildInputs(root, child, Inputs{Title: "child", ReadOnly: true})
	if err != nil {
		t.Fatalf("equal SetChildInputs() error = %v", err)
	}
	if second.State.InputRevision != 2 {
		t.Fatalf("equal input update revision = %d, want 2", second.State.InputRevision)
	}

	before, err := m.Snapshot(child)
	if err != nil {
		t.Fatal(err)
	}
	for _, pair := range [][2]multisession.SessionID{{sibling, child}, {root, grandchild}} {
		if _, err := m.SetChildInputs(pair[0], pair[1], Inputs{Title: "wrong parent"}); err == nil {
			t.Errorf("SetChildInputs(%d, %d) unexpectedly succeeded", pair[0], pair[1])
		}
	}
	after, err := m.Snapshot(child)
	if err != nil {
		t.Fatal(err)
	}
	if after.State.Inputs != before.State.Inputs || after.State.InputRevision != before.State.InputRevision {
		t.Fatalf("failed parent checks changed child state: before=%#v after=%#v", before.State, after.State)
	}
	grandchildState, err := m.SetChildInputs(child, grandchild, Inputs{Title: "direct"})
	if err != nil || grandchildState.State.InputRevision != 1 {
		t.Fatalf("immediate child input update = %#v, %v", grandchildState.State, err)
	}
}

func TestSetChildInputsValidatesUTF8ByteLimitAndSafeRevisionAtomically(t *testing.T) {
	m := NewManager()
	root := mustCreate(t, m)
	child := mustCreateChild(t, m, root)
	if _, err := m.SetChildInputs(root, child, Inputs{Title: strings.Repeat("x", 257)}); err == nil {
		t.Fatal("overlong title unexpectedly succeeded")
	}
	if _, err := m.SetChildInputs(root, child, Inputs{Title: string([]byte{0xff})}); err == nil {
		t.Fatal("invalid UTF-8 title unexpectedly succeeded")
	}
	valid := strings.Repeat("é", 128)
	if len(valid) != 256 || !utf8.ValidString(valid) {
		t.Fatal("test title construction is invalid")
	}
	if _, err := m.SetChildInputs(root, child, Inputs{Title: valid}); err != nil {
		t.Fatalf("256-byte title rejected: %v", err)
	}
	if got := m.Changes(); !equalIDs(got, []SessionID{child}) {
		t.Fatalf("Changes() after accepted update = %v", got)
	}

	m.mu.Lock()
	m.sessions[child].inputRevision = collection.MaxID
	m.mu.Unlock()
	before, err := m.Snapshot(child)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.SetChildInputs(root, child, Inputs{Title: "cannot commit"}); err == nil {
		t.Fatal("revision exhaustion unexpectedly succeeded")
	}
	after, err := m.Snapshot(child)
	if err != nil {
		t.Fatal(err)
	}
	if before.State.Inputs != after.State.Inputs || before.State.InputRevision != after.State.InputRevision {
		t.Fatalf("revision exhaustion changed state: before=%#v after=%#v", before.State, after.State)
	}
	if got := m.Changes(); len(got) != 0 {
		t.Fatalf("failed revision update dirtied IDs: %v", got)
	}
}

func TestCompositionViewPositionsAndReadonlyControls(t *testing.T) {
	m := NewManager()
	root := mustCreate(t, m)
	child := mustCreateChild(t, m, root)
	if _, err := m.Dispatch(child, collection.Step{Path: "0", Event: "click", Key: "add"}); err != nil {
		t.Fatal(err)
	}
	if _, err := m.SetChildInputs(root, child, Inputs{Title: "Notes", ReadOnly: true}); err != nil {
		t.Fatal(err)
	}
	snapshot, err := m.Snapshot(child)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Tree.Kids) != 5 || snapshot.Tree.Kids[0].Key != "add" || snapshot.Tree.Kids[1].Key != "reset" || snapshot.Tree.Kids[2].Key != "rows" || snapshot.Tree.Kids[3].Key != "composition-title" || snapshot.Tree.Kids[4].Key != "composition-inbox" {
		t.Fatalf("root child positions/keys changed: %#v", snapshot.Tree.Kids)
	}
	if got := snapshot.Tree.Kids[3].Kids[0].Text; got != "Title: Notes" {
		t.Fatalf("title text = %q", got)
	}
	if got := snapshot.Tree.Kids[4].Kids[0].Text; got != "Published: 0" {
		t.Fatalf("inbox text = %q", got)
	}
	row := snapshot.Tree.Kids[2].Kids[0]
	if len(row.Kids) != 10 {
		t.Fatalf("row has %d controls, want 10", len(row.Kids))
	}
	publish := row.Kids[9]
	if publish.Key != "row-1-publish" || publish.Attrs[0].Value != "publish" || publish.Kids[0].Text != "Publish" || publish.On[0] != (gobi.On{Event: "click", Message: "publish", Arg: "1/1"}) {
		t.Fatalf("publish node = %#v", publish)
	}
	if !hasDisabled(publish) {
		t.Fatal("read-only publish control is enabled")
	}
	if len(snapshot.Bindings) != 1 || snapshot.Bindings[0].Path != "2/0/0" {
		t.Fatalf("read-only input binding was removed or moved: %#v", snapshot.Bindings)
	}
	if !hasDisabled(row.Kids[0]) {
		t.Fatal("read-only input is enabled")
	}
	if err := walkCheckDisabled(snapshot.Tree); err != nil {
		t.Fatal(err)
	}
	if got, err := m.Dispatch(child, collection.Step{Path: "2/0/0", Event: "input", Key: "row-1-input", Value: "ignored"}); err != nil || got.State.Rows[0].Draft != "" {
		t.Fatalf("valid readonly input was not suppressed: snapshot=%#v error=%v", got.State, err)
	}
	if _, err := m.Dispatch(child, collection.Step{Path: "2/0/0", Event: "change", Key: "row-1-input"}); err == nil {
		t.Fatal("readonly input accepted a noncanonical event")
	}
	if _, err := m.Dispatch(child, collection.Step{Path: "2/0/9", Event: "click", Value: "1/1", Key: "row-1-publish"}); err != nil {
		t.Fatalf("valid readonly publish should be suppressed: %v", err)
	}
	if got := m.Changes(); !equalIDs(got, []SessionID{child}) {
		t.Fatalf("only the accepted input update should be dirty before drain: %v", got)
	}
}

func TestPublishCapturesGoStateOrdersMessagesAndTargetsDirectParent(t *testing.T) {
	m := NewManager()
	root := mustCreate(t, m)
	child := mustCreateChild(t, m, root)
	grandchild := mustCreateChild(t, m, child)
	row := mustAddSavedRow(t, m, child, "alpha")
	grandRow := mustAddSavedRow(t, m, grandchild, "nested")

	firstSnapshot, err := m.Dispatch(child, collection.Step{Path: "2/0/9", Event: "click", Value: "1/0", Key: "row-1-publish"})
	if err != nil {
		t.Fatalf("Dispatch(publish) error = %v", err)
	}
	if len(firstSnapshot.State.Inbox) != 0 || len(firstSnapshot.Messages) != 5 {
		t.Fatalf("child publication snapshot = %#v", firstSnapshot)
	}
	rootAfterDispatch, err := m.Snapshot(root)
	if err != nil || len(rootAfterDispatch.State.Inbox) != 1 {
		t.Fatalf("typed dispatch did not publish to parent: %#v, %v", rootAfterDispatch.State.Inbox, err)
	}
	first := rootAfterDispatch.State.Inbox[0]
	second, err := m.Publish(child, row, 0)
	if err != nil {
		t.Fatalf("repeated Publish() error = %v", err)
	}
	if first.Sequence != 1 || second.Sequence != 2 || first.Saved != "alpha" || first.Saves != 1 || first.ParentID != root || first.ChildID != child {
		t.Fatalf("publication receipts = %#v then %#v", first, second)
	}
	childSnapshot, err := m.Snapshot(child)
	if err != nil {
		t.Fatal(err)
	}
	if got := childSnapshot.Messages; len(got) != 6 || got[4] != (gobi.Message{Name: "publish", Arg: "1/0"}) || got[5] != (gobi.Message{Name: "publish", Arg: "1/0"}) {
		t.Fatalf("child messages do not preserve edit/save/reply/publish order: %#v", got)
	}
	rootSnapshot, err := m.Snapshot(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(rootSnapshot.State.Inbox) != 2 || rootSnapshot.State.Inbox[0].Sequence != 1 || rootSnapshot.State.Inbox[1].Sequence != 2 {
		t.Fatalf("root inbox = %#v", rootSnapshot.State.Inbox)
	}
	if len(rootSnapshot.State.Inbox) == 0 || rootSnapshot.State.Inbox[0].Saved != "alpha" {
		t.Fatalf("root inbox did not capture saved content: %#v", rootSnapshot.State.Inbox)
	}
	if _, err := m.Publish(grandchild, grandRow, 0); err != nil {
		t.Fatalf("grandchild Publish() error = %v", err)
	}
	childSnapshot, err = m.Snapshot(child)
	if err != nil {
		t.Fatal(err)
	}
	if len(childSnapshot.State.Inbox) != 1 || childSnapshot.State.Inbox[0].ParentID != child || childSnapshot.State.Inbox[0].ChildID != grandchild {
		t.Fatalf("grandchild publication was not delivered to direct parent: %#v", childSnapshot.State.Inbox)
	}
	rootSnapshot, err = m.Snapshot(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(rootSnapshot.State.Inbox) != 2 {
		t.Fatalf("grandchild publication leaked to root: %#v", rootSnapshot.State.Inbox)
	}
	if _, err := m.Publish(root, row, 0); err == nil {
		t.Fatal("root publication unexpectedly succeeded")
	}
	if got := m.Changes(); !equalIDs(got, []SessionID{root, child, grandchild}) {
		t.Fatalf("publish changes = %v", got)
	}
}

func TestDispatchPublishRequiresCurrentLiteralRevision(t *testing.T) {
	m := NewManager()
	root := mustCreate(t, m)
	child := mustCreateChild(t, m, root)
	row := mustAddSavedRow(t, m, child, "saved")
	if row != 1 {
		t.Fatalf("helper row = %d", row)
	}
	if got := m.Changes(); len(got) != 0 {
		t.Fatalf("unexpected setup changes: %v", got)
	}
	for _, step := range []collection.Step{
		{Path: "2/0/9", Event: "click", Value: "1/1", Key: "row-1-publish"},
		{Path: "2/0/9", Event: "click", Value: "01/0", Key: "row-1-publish"},
	} {
		if _, err := m.Dispatch(child, step); err == nil {
			t.Errorf("invalid publish step %#v unexpectedly succeeded", step)
		}
	}
	if parent, err := m.Snapshot(root); err != nil || len(parent.State.Inbox) != 0 {
		t.Fatalf("invalid publish dispatch changed inbox: %#v, %v", parent.State.Inbox, err)
	}
	if childSnapshot, err := m.Snapshot(child); err != nil || len(childSnapshot.Messages) != 4 {
		t.Fatalf("invalid publish dispatch changed messages: %#v, %v", childSnapshot.Messages, err)
	}
	if got := m.Changes(); len(got) != 0 {
		t.Fatalf("invalid publish dispatch dirtied IDs: %v", got)
	}
}

func TestPublishRejectsPolicyAndRevisionWithoutSideEffects(t *testing.T) {
	m := NewManager()
	root := mustCreate(t, m)
	child := mustCreateChild(t, m, root)
	row := mustAddSavedRow(t, m, child, "saved")
	if got := m.Changes(); len(got) != 0 {
		t.Fatalf("Changes() should have been drained by helper setup, got %v", got)
	}
	if _, err := m.Publish(child, row, 1); err == nil {
		t.Fatal("stale input revision unexpectedly published")
	}
	if _, err := m.Publish(child, collection.RowID(99), 0); err == nil {
		t.Fatal("unknown row unexpectedly published")
	}
	if _, err := m.SetChildInputs(root, child, Inputs{ReadOnly: true}); err != nil {
		t.Fatal(err)
	}
	if got := m.Changes(); !equalIDs(got, []SessionID{child}) {
		t.Fatalf("input change = %v", got)
	}
	if _, err := m.Publish(child, row, 1); err == nil {
		t.Fatal("read-only publication unexpectedly succeeded")
	}
	if snapshot, err := m.Snapshot(root); err != nil || len(snapshot.State.Inbox) != 0 {
		t.Fatalf("rejected publications changed inbox: %#v, %v", snapshot.State.Inbox, err)
	}
	if snapshot, err := m.Snapshot(child); err != nil || len(snapshot.Messages) != 4 {
		t.Fatalf("rejected publications changed messages: %#v, %v", snapshot.Messages, err)
	}
	if got := m.Changes(); len(got) != 0 {
		t.Fatalf("rejected publications dirtied IDs: %v", got)
	}
}

func TestReadonlyDoesNotCancelPendingAndCompleteStillApplies(t *testing.T) {
	m := NewManager()
	root := mustCreate(t, m)
	child := mustCreateChild(t, m, root)
	row := mustAddDraftRow(t, m, child, "pending draft")
	if _, err := m.Dispatch(child, collection.Step{Path: "2/0/5", Event: "click", Key: "row-1-save"}); err != nil {
		t.Fatal(err)
	}
	effects, err := m.Effects(child)
	if err != nil || len(effects) != 1 || effects[0].Kind != "start" {
		t.Fatalf("save effects = %#v, %v", effects, err)
	}
	if _, err := m.SetChildInputs(root, child, Inputs{ReadOnly: true}); err != nil {
		t.Fatal(err)
	}
	if cancel, err := m.Effects(child); err != nil || len(cancel) != 0 {
		t.Fatalf("read-only update unexpectedly canceled pending request: %#v, %v", cancel, err)
	}
	snapshot, err := m.Complete(child, asyncsave.Reply{ID: uint64(snapshotRowPending(t, m, child, row)), Value: "reply"})
	if err != nil {
		t.Fatalf("Complete() in readonly mode error = %v", err)
	}
	if snapshot.State.Rows[0].Saved != "reply" || snapshot.State.Rows[0].Saves != 1 || snapshot.State.Rows[0].PendingID != 0 {
		t.Fatalf("reply was not applied while read-only: %#v", snapshot.State.Rows[0])
	}
	if got := snapshot.Messages[len(snapshot.Messages)-1]; got != (gobi.Message{Name: "reply", Arg: "1"}) {
		t.Fatalf("completion message = %#v", got)
	}
	if got := m.Changes(); !equalIDs(got, []SessionID{child}) {
		t.Fatalf("completion did not dirty target: %v", got)
	}
}

func TestCompleteRejectsInvalidReplyIDsWithoutChangingState(t *testing.T) {
	m := NewManager()
	id := mustCreate(t, m)
	before, err := m.Snapshot(id)
	if err != nil {
		t.Fatal(err)
	}
	for _, reply := range []asyncsave.Reply{
		{ID: 0, Value: "zero"},
		{ID: asyncsave.MaxID + 1, Value: "unsafe"},
	} {
		after, completeErr := m.Complete(id, reply)
		if completeErr == nil {
			t.Errorf("Complete(%#v) unexpectedly succeeded", reply)
		}
		if !reflect.DeepEqual(after, before) {
			t.Errorf("Complete(%#v) changed state on rejection: before=%#v after=%#v", reply, before, after)
		}
	}
	if audit, err := m.Audit(id); err != nil || len(audit) != 0 {
		t.Fatalf("invalid replies changed completion audit: %#v, %v", audit, err)
	}
	if got := m.Changes(); len(got) != 0 {
		t.Fatalf("invalid replies dirtied IDs: %v", got)
	}
}

func TestDispatchValidatesDisabledAndReadonlyPathsBeforeSuppression(t *testing.T) {
	m := NewManager()
	root := mustCreate(t, m)
	child := mustCreateChild(t, m, root)
	if _, err := m.Dispatch(child, collection.Step{Path: "0", Event: "click", Key: "add"}); err != nil {
		t.Fatal(err)
	}
	if _, err := m.SetChildInputs(root, child, Inputs{ReadOnly: true}); err != nil {
		t.Fatal(err)
	}
	valid := collection.Step{Path: "0", Event: "click", Key: "add"}
	if _, err := m.Dispatch(child, valid); err != nil {
		t.Fatalf("valid disabled event rejected: %v", err)
	}
	for _, step := range []collection.Step{
		{Path: "00", Event: "click", Key: "add"},
		{Path: "0", Event: "input", Key: "add"},
		{Path: "0", Event: "click", Key: "wrong"},
	} {
		if _, err := m.Dispatch(child, step); err == nil {
			t.Errorf("invalid disabled step %#v unexpectedly succeeded", step)
		}
	}
	if got := m.Changes(); !equalIDs(got, []SessionID{child}) {
		t.Fatalf("only prior add and input update should be dirty: %v", got)
	}
}

func TestSnapshotAndChangesAreDefensiveAndSorted(t *testing.T) {
	m := NewManager()
	root := mustCreate(t, m)
	childB := mustCreateChild(t, m, root)
	childA := mustCreateChild(t, m, root)
	row := mustAddSavedRow(t, m, childA, "captured")
	if _, err := m.Publish(childA, row, 0); err != nil {
		t.Fatal(err)
	}
	snapshot, err := m.Snapshot(root)
	if err != nil {
		t.Fatal(err)
	}
	mutated := snapshot
	mutated.State.Inbox[0].Saved = "corrupt"
	mutated.Tree.Kids[3].Kids[0].Text = "corrupt"
	mutated.Bindings = append(mutated.Bindings, snapshot.Bindings...)
	mutated.Messages = append(mutated.Messages, gobi.Message{Name: "fake"})
	current, err := m.Snapshot(root)
	if err != nil {
		t.Fatal(err)
	}
	if current.State.Inbox[0].Saved != "captured" || current.Tree.Kids[3].Kids[0].Text != "Title: " || len(current.Bindings) != 0 || len(current.Messages) != 0 {
		t.Fatalf("snapshot mutation leaked into manager: %#v", current)
	}
	changes := m.Changes()
	if !equalIDs(changes, []SessionID{root, childA}) {
		t.Fatalf("changes not sorted/unique: %v", changes)
	}
	changes[0] = childB
	if next := m.Changes(); next == nil || len(next) != 0 {
		t.Fatalf("drained Changes() = %#v, want nonnil empty slice", next)
	}
}

func TestDisposePreservesParentInboxAndGlobalSequence(t *testing.T) {
	m := NewManager()
	root := mustCreate(t, m)
	child := mustCreateChild(t, m, root)
	row := mustAddSavedRow(t, m, child, "before disposal")
	first, err := m.Publish(child, row, 0)
	if err != nil {
		t.Fatal(err)
	}
	m.Changes()
	if _, err := m.Dispose(child); err != nil {
		t.Fatal(err)
	}
	if got := m.Changes(); len(got) != 0 {
		t.Fatalf("disposal left dead IDs dirty: %v", got)
	}
	parent, err := m.Snapshot(root)
	if err != nil || len(parent.State.Inbox) != 1 || parent.State.Inbox[0].Saved != "before disposal" {
		t.Fatalf("parent inbox did not survive child disposal: %#v, %v", parent.State.Inbox, err)
	}
	child2 := mustCreateChild(t, m, root)
	row2 := mustAddSavedRow(t, m, child2, "after disposal")
	second, err := m.Publish(child2, row2, 0)
	if err != nil {
		t.Fatal(err)
	}
	if second.Sequence != first.Sequence+1 {
		t.Fatalf("sequence reused after disposal: first=%d second=%d", first.Sequence, second.Sequence)
	}
	if _, err := m.Dispose(root); err == nil {
		t.Fatal("Dispose() accepted a parent with children")
	}
	if _, err := m.DisposeTree(root); err != nil {
		t.Fatal(err)
	}
	if got := m.Changes(); got == nil || len(got) != 0 {
		t.Fatalf("DisposeTree left dirty IDs: %#v", got)
	}
}

func TestPublishSequenceExhaustionIsAtomic(t *testing.T) {
	m := NewManager()
	root := mustCreate(t, m)
	child := mustCreateChild(t, m, root)
	row := mustAddSavedRow(t, m, child, "saved")
	m.mu.Lock()
	m.nextSequence = collection.MaxID
	m.mu.Unlock()
	if _, err := m.Publish(child, row, 0); err == nil {
		t.Fatal("sequence exhaustion unexpectedly succeeded")
	}
	parent, err := m.Snapshot(root)
	if err != nil || len(parent.State.Inbox) != 0 {
		t.Fatalf("sequence exhaustion changed inbox: %#v, %v", parent.State.Inbox, err)
	}
	if got := m.Changes(); len(got) != 0 {
		t.Fatalf("sequence exhaustion dirtied IDs: %v", got)
	}
}

func TestConcurrentInputRevisionsAndPublishesAreSerialized(t *testing.T) {
	m := NewManager()
	root := mustCreate(t, m)
	child := mustCreateChild(t, m, root)
	row := mustAddSavedRow(t, m, child, "parallel")
	const updates = 40
	var wg sync.WaitGroup
	errCh := make(chan error, updates)
	for i := 0; i < updates; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := m.SetChildInputs(root, child, Inputs{Title: fmt.Sprintf("title-%d", i)})
			errCh <- err
		}(i)
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil {
			t.Fatalf("concurrent input update error = %v", err)
		}
	}
	const publishes = 40
	pubErrCh := make(chan error, publishes)
	for i := 0; i < publishes; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := m.Publish(child, row, updates)
			pubErrCh <- err
		}()
	}
	wg.Wait()
	close(pubErrCh)
	for err := range pubErrCh {
		if err != nil {
			t.Fatalf("concurrent publish error = %v", err)
		}
	}
	parent, err := m.Snapshot(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := len(parent.State.Inbox); got != publishes {
		t.Fatalf("concurrent inbox count = %d, want %d", got, publishes)
	}
	for i, publication := range parent.State.Inbox {
		if publication.Sequence != uint64(i+1) {
			t.Fatalf("inbox sequence[%d] = %d", i, publication.Sequence)
		}
	}
	childSnapshot, err := m.Snapshot(child)
	if err != nil {
		t.Fatal(err)
	}
	if childSnapshot.State.InputRevision != updates || len(childSnapshot.Messages) != publishes+4 {
		t.Fatalf("concurrent child state revision/messages = %d/%d", childSnapshot.State.InputRevision, len(childSnapshot.Messages))
	}
	changes := m.Changes()
	if !equalIDs(changes, []SessionID{root, child}) {
		t.Fatalf("concurrent changes = %v", changes)
	}
}

func mustCreate(t *testing.T, m *Manager) SessionID {
	t.Helper()
	id, err := m.Create()
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func mustCreateChild(t *testing.T, m *Manager, parent SessionID) SessionID {
	t.Helper()
	id, err := m.CreateChild(parent)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func mustAddDraftRow(t *testing.T, m *Manager, id SessionID, draft string) collection.RowID {
	t.Helper()
	if _, err := m.Dispatch(id, collection.Step{Path: "0", Event: "click", Key: "add"}); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Dispatch(id, collection.Step{Path: "2/0/0", Event: "input", Key: "row-1-input", Value: draft}); err != nil {
		t.Fatal(err)
	}
	m.Changes()
	return 1
}

func mustAddSavedRow(t *testing.T, m *Manager, id SessionID, saved string) collection.RowID {
	t.Helper()
	row := mustAddDraftRow(t, m, id, saved)
	if _, err := m.Dispatch(id, collection.Step{Path: "2/0/5", Event: "click", Key: "row-1-save"}); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Complete(id, asyncsave.Reply{ID: 1, Value: saved}); err != nil {
		t.Fatal(err)
	}
	m.Changes()
	return row
}

func snapshotRowPending(t *testing.T, m *Manager, id SessionID, row collection.RowID) collection.RequestID {
	t.Helper()
	snapshot, err := m.Snapshot(id)
	if err != nil {
		t.Fatal(err)
	}
	for _, candidate := range snapshot.State.Rows {
		if candidate.ID == row {
			return candidate.PendingID
		}
	}
	t.Fatalf("row %d is absent", row)
	return 0
}

func hasDisabled(node gobi.Node) bool {
	for _, attr := range node.Attrs {
		if attr.Name == "disabled" && attr.Flag {
			return true
		}
	}
	return false
}

func walkCheckDisabled(node gobi.Node) error {
	if node.Kind == gobi.Element && (node.Tag == "button" || node.Tag == "input") && !hasDisabled(node) {
		return fmt.Errorf("%s node %q is not disabled", node.Tag, node.Key)
	}
	for _, child := range node.Kids {
		if err := walkCheckDisabled(child); err != nil {
			return err
		}
	}
	return nil
}

func equalIDs(left, right []SessionID) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}
