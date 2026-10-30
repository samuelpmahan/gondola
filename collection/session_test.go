package collection

import (
	"encoding/json"
	"reflect"
	"strconv"
	"testing"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/gobi"
)

func dispatch(t *testing.T, session *Session, path, event, value, key string) Snapshot {
	t.Helper()
	snapshot, err := session.Dispatch(Step{Path: path, Event: event, Value: value, Key: key})
	if err != nil {
		t.Fatalf("Dispatch(%+v): %v", Step{Path: path, Event: event, Value: value, Key: key}, err)
	}
	return snapshot
}

func TestSnapshotHasExactEnvelopeAndInitialTree(t *testing.T) {
	session := NewSession()
	snapshot := session.Snapshot()

	encoded, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &envelope); err != nil {
		t.Fatal(err)
	}
	if got := sortedKeys(envelope); !reflect.DeepEqual(got, []string{"bindings", "messages", "state", "tree"}) {
		t.Fatalf("snapshot envelope keys = %v", got)
	}
	if snapshot.State.Rows == nil || snapshot.Bindings == nil || snapshot.Messages == nil {
		t.Fatalf("initial collections must be non-null: %#v", snapshot)
	}
	if snapshot.State.NextID != 0 || snapshot.State.NextRequestID != 0 {
		t.Fatalf("initial counters = (%d, %d), want (0, 0)", snapshot.State.NextID, snapshot.State.NextRequestID)
	}
	root := snapshot.Tree
	if root.Tag != "div" || root.Key != "collection" || len(root.Kids) != 3 || attrValue(root, "class") != "collection" {
		t.Fatalf("unexpected root: %#v", root)
	}
	if root.Kids[0].Key != "add" || textContent(root.Kids[0]) != "Add row" || root.Kids[0].On[0].Message != "add" {
		t.Fatalf("unexpected add button: %#v", root.Kids[0])
	}
	if root.Kids[1].Key != "reset" || !hasFlag(root.Kids[1], "disabled") {
		t.Fatalf("initial reset must be disabled: %#v", root.Kids[1])
	}
	if rows := root.Kids[2]; rows.Key != "rows" || rows.Kids != nil {
		t.Fatalf("initial rows container must be empty with nil kids: %#v", rows)
	}
}

func TestSnapshotEffectsAndAuditReturnOwnedCopies(t *testing.T) {
	session := NewSession()
	dispatch(t, session, "0", "click", "", "add")
	dispatch(t, session, "2/0/0", "input", "draft", "row-1-input")
	dispatch(t, session, "2/0/5", "click", "", "row-1-save")

	snapshot := session.Snapshot()
	snapshot.State.Rows[0].Draft = "caller mutation"
	snapshot.Messages[0].Name = "caller mutation"
	if got := session.Snapshot(); got.State.Rows[0].Draft != "draft" || got.Messages[0].Name != "add" {
		t.Fatalf("snapshot shares mutable state/message slices with session: %#v", got)
	}

	effects := session.Effects()
	if len(effects) != 1 || effects[0].Value != "draft" {
		t.Fatalf("drained effects = %#v", effects)
	}
	effects[0].Value = "caller mutation"
	if got := session.Effects(); len(got) != 0 {
		t.Fatalf("Effects must drain its outbox: %#v", got)
	}

	if _, err := session.Complete(asyncsave.Reply{ID: 1, Value: "saved"}); err != nil {
		t.Fatal(err)
	}
	audit := session.Audit()
	audit[0].Value = "caller mutation"
	if got := session.Audit(); len(got) != 1 || got[0].Value != "saved" {
		t.Fatalf("Audit shares mutable storage with session: %#v", got)
	}
}

func TestAddEditReorderAndStrictPathKeyIdentity(t *testing.T) {
	session := NewSession()
	dispatch(t, session, "0", "click", "", "add")
	dispatch(t, session, "0", "click", "", "add")
	dispatch(t, session, "2/0/0", "input", "first draft", "row-1-input")
	dispatch(t, session, "2/1/0", "input", "second draft", "row-2-input")

	before := session.Snapshot()
	if _, err := session.Dispatch(Step{Path: "2/0/0", Event: "input", Value: "wrong row", Key: "row-2-input"}); err == nil {
		t.Fatal("dispatch with an old path and another row's key succeeded")
	}
	if got := session.Snapshot(); !reflect.DeepEqual(got, before) {
		t.Fatalf("identity rejection changed session\n got: %#v\nwant: %#v", got, before)
	}

	dispatch(t, session, "2/1/7", "click", "", "row-2-up")
	snapshot := session.Snapshot()
	rows := snapshot.State.Rows
	if len(rows) != 2 || rows[0].ID != 2 || rows[1].ID != 1 || rows[0].Draft != "second draft" || rows[1].Draft != "first draft" {
		t.Fatalf("up did not move the complete row state: %#v", rows)
	}
	if snapshot.Tree.Kids[2].Kids[0].Key != "row-2" || snapshot.Tree.Kids[2].Kids[1].Key != "row-1" {
		t.Fatalf("tree keys did not follow the reordered state: %#v", snapshot.Tree.Kids[2].Kids)
	}
	if got := snapshot.Bindings; len(got) != 2 || got[0].Path != "2/0/0" || got[0].Message != "edit/2" || got[1].Path != "2/1/0" || got[1].Message != "edit/1" {
		t.Fatalf("bindings do not follow the new row paths: %#v", got)
	}
	if got := snapshot.Messages[len(snapshot.Messages)-1]; got != (gobi.Message{Name: "up", Arg: "2"}) {
		t.Fatalf("up message = %#v", got)
	}
}

func TestFourRowLimitDisablesAddAndRejectsDirectTransitionAtomically(t *testing.T) {
	session := NewSession()
	for range int(MaxRows) {
		dispatch(t, session, "0", "click", "", "add")
	}
	before := session.Snapshot()
	if len(before.State.Rows) != int(MaxRows) || before.State.NextID != RowID(MaxRows) || !hasFlag(before.Tree.Kids[0], "disabled") {
		t.Fatalf("capacity view/state = %#v", before)
	}
	if got, err := session.Dispatch(Step{Path: "0", Event: "click", Key: "add"}); err != nil || !reflect.DeepEqual(got, before) {
		t.Fatalf("disabled add should be a no-op; snapshot=%#v error=%v", got, err)
	}
	if got, commands, started, err := transition(session.state, gobi.Message{Name: "add"}); err == nil || started != nil || len(commands) != 0 || !reflect.DeepEqual(got, session.state) {
		t.Fatalf("direct add at capacity must reject atomically: state=%#v commands=%#v started=%#v error=%v", got, commands, started, err)
	}
	if got := session.Effects(); len(got) != 0 {
		t.Fatalf("capacity rejection enqueued effects: %#v", got)
	}
}

func TestKeyIdentityIsCheckedBeforeDisabledSuppression(t *testing.T) {
	session := NewSession()
	before := session.Snapshot()
	if _, err := session.Dispatch(Step{Path: "1", Event: "click", Key: "old-row-reset"}); err == nil {
		t.Fatal("stale key on disabled reset was silently suppressed")
	}
	if got := session.Snapshot(); !reflect.DeepEqual(got, before) {
		t.Fatalf("stale disabled dispatch changed session: %#v", got)
	}
	// Correct identity reaches the disabled check and is a no-op.
	dispatch(t, session, "1", "click", "", "reset")
	if got := session.Snapshot(); !reflect.DeepEqual(got, before) {
		t.Fatalf("disabled reset changed session: %#v", got)
	}
}

func TestTreeKeysBindingsAndDisabledFlagsFollowContract(t *testing.T) {
	session := NewSession()
	initialReset := session.Snapshot().Tree.Kids[1]
	if len(initialReset.Attrs) != 2 || initialReset.Attrs[1].Name != "disabled" || !initialReset.Attrs[1].Flag {
		t.Fatalf("reset attributes must be class then disabled when empty: %#v", initialReset.Attrs)
	}
	dispatch(t, session, "0", "click", "", "add")
	snapshot := session.Snapshot()
	row := snapshot.Tree.Kids[2].Kids[0]
	if row.Key != "row-1" || len(row.Kids) != 9 {
		t.Fatalf("row shape = %#v", row)
	}
	if input := row.Kids[0]; input.Key != "row-1-input" || input.Tag != "input" || !reflect.DeepEqual(attrNames(input), []string{"type", "value", "aria-label"}) || attrValue(input, "aria-label") != "Row 1" {
		t.Fatalf("input shape/attribute order = %#v", input)
	}
	if got := row.Kids[1]; got.Key != "row-1-saved" || textContent(got) != "Saved: " {
		t.Fatalf("saved projection = %#v", got)
	}
	if got := row.Kids[2]; got.Key != "row-1-saves" || textContent(got) != "Saves: 0" {
		t.Fatalf("saves projection = %#v", got)
	}
	if got := row.Kids[3]; got.Key != "row-1-status" || textContent(got) != "Status: idle" {
		t.Fatalf("status projection = %#v", got)
	}
	if got := row.Kids[4]; got.Key != "row-1-pending" || textContent(got) != "Pending: 0" {
		t.Fatalf("pending projection = %#v", got)
	}
	for index, action := range []string{"save", "remove", "up", "cancel"} {
		button := row.Kids[5+index]
		if button.Key != "row-1-"+action || attrValue(button, "class") != action || button.On[0].Message != action || button.On[0].Arg != "1" {
			t.Fatalf("%s button = %#v", action, button)
		}
	}
	if !hasFlag(row.Kids[5], "disabled") || !hasFlag(row.Kids[7], "disabled") || !hasFlag(row.Kids[8], "disabled") || hasFlag(row.Kids[6], "disabled") {
		t.Fatalf("initial row button disabled states are wrong: %#v", row.Kids[5:])
	}
}

func TestPerRowSaveCancelRemoveAndLateReplyAudit(t *testing.T) {
	session := NewSession()
	dispatch(t, session, "0", "click", "", "add")
	dispatch(t, session, "0", "click", "", "add")
	dispatch(t, session, "2/0/0", "input", "first", "row-1-input")
	dispatch(t, session, "2/0/5", "click", "", "row-1-save")
	dispatch(t, session, "2/1/0", "input", "second", "row-2-input")
	dispatch(t, session, "2/1/5", "click", "", "row-2-save")

	if got := session.Effects(); !reflect.DeepEqual(got, []asyncsave.Command{
		{Kind: "start", ID: 1, Value: "first"},
		{Kind: "start", ID: 2, Value: "second"},
	}) {
		t.Fatalf("first save effects = %#v", got)
	}
	// A repeated save cancels the first request for row 1 before capturing a new draft.
	dispatch(t, session, "2/0/0", "input", "first retry", "row-1-input")
	dispatch(t, session, "2/0/5", "click", "", "row-1-save")
	if got := session.Effects(); !reflect.DeepEqual(got, []asyncsave.Command{
		{Kind: "cancel", ID: 1},
		{Kind: "start", ID: 3, Value: "first retry"},
	}) {
		t.Fatalf("repeat-save effects = %#v", got)
	}
	dispatch(t, session, "2/1/6", "click", "", "row-2-remove")
	if got := session.Effects(); !reflect.DeepEqual(got, []asyncsave.Command{{Kind: "cancel", ID: 2}}) {
		t.Fatalf("remove effects = %#v", got)
	}

	snapshot, err := session.Complete(asyncsave.Reply{ID: 2, Value: "late second"})
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.State.Rows) != 1 || snapshot.State.Rows[0].ID != 1 || snapshot.State.Rows[0].Saved != "" {
		t.Fatalf("late removed-row reply mutated current rows: %#v", snapshot.State.Rows)
	}
	if got := session.Audit(); !reflect.DeepEqual(got, []Outcome{{ID: 2, RowID: 2, Value: "late second", Reason: "stale"}}) {
		t.Fatalf("removed-row audit = %#v", got)
	}

	snapshot, err = session.Complete(asyncsave.Reply{ID: 3, Value: "saved first"})
	if err != nil {
		t.Fatal(err)
	}
	row := snapshot.State.Rows[0]
	if row.Draft != "first retry" || row.Saved != "saved first" || row.Saves != 1 || row.PendingID != 0 || row.Status != "saved" {
		t.Fatalf("accepted reply state = %#v", row)
	}
	if got := session.Audit()[1]; got != (Outcome{ID: 3, RowID: 1, Value: "saved first", Accepted: true, Reason: "saved"}) {
		t.Fatalf("accepted audit = %#v", got)
	}
}

func TestResetCancelsInRowOrderAndNeverReusesIDs(t *testing.T) {
	session := NewSession()
	for range 3 {
		dispatch(t, session, "0", "click", "", "add")
	}
	for index, value := range []string{"one", "two", "three"} {
		path := "2/" + strconv.Itoa(index)
		key := "row-" + strconv.Itoa(index+1)
		dispatch(t, session, path+"/0", "input", value, key+"-input")
		dispatch(t, session, path+"/5", "click", "", key+"-save")
	}
	_ = session.Effects()
	dispatch(t, session, "1", "click", "", "reset")
	if got := session.Effects(); !reflect.DeepEqual(got, []asyncsave.Command{
		{Kind: "cancel", ID: 1}, {Kind: "cancel", ID: 2}, {Kind: "cancel", ID: 3},
	}) {
		t.Fatalf("reset cancellation order = %#v", got)
	}
	snapshot := session.Snapshot()
	if len(snapshot.State.Rows) != 0 || snapshot.State.NextID != 3 || snapshot.State.NextRequestID != 3 || !hasFlag(snapshot.Tree.Kids[1], "disabled") {
		t.Fatalf("reset state = %#v", snapshot)
	}
	dispatch(t, session, "0", "click", "", "add")
	if got := session.Snapshot().State.Rows[0].ID; got != 4 {
		t.Fatalf("row ID reused after reset: %d", got)
	}
	if _, err := session.Complete(asyncsave.Reply{ID: 1, Value: "cancelled"}); err != nil {
		t.Fatal(err)
	}
	if got := session.Audit()[0]; got.RowID != 1 || got.Reason != "stale" {
		t.Fatalf("reset reply lost request→row history: %#v", got)
	}
}

func TestAcceptedErrorPreservesSavedValueAndAllowsRetry(t *testing.T) {
	session := NewSession()
	dispatch(t, session, "0", "click", "", "add")
	dispatch(t, session, "2/0/0", "input", "draft", "row-1-input")
	dispatch(t, session, "2/0/5", "click", "", "row-1-save")
	_ = session.Effects()
	if _, err := session.Complete(asyncsave.Reply{ID: 1, Error: "network"}); err != nil {
		t.Fatal(err)
	}
	row := session.Snapshot().State.Rows[0]
	if row.Saved != "" || row.Saves != 0 || row.PendingID != 0 || row.Status != "error: network" {
		t.Fatalf("accepted error changed saved values unexpectedly: %#v", row)
	}
	dispatch(t, session, "2/0/5", "click", "", "row-1-save")
	if got := session.Effects(); !reflect.DeepEqual(got, []asyncsave.Command{{Kind: "start", ID: 2, Value: "draft"}}) {
		t.Fatalf("retry effects = %#v", got)
	}
}

func TestAllocationAndInvalidReplyRejectionsAreAtomic(t *testing.T) {
	session := NewSession()
	dispatch(t, session, "0", "click", "", "add")
	dispatch(t, session, "2/0/0", "input", "draft", "row-1-input")
	session.state.Rows[0].PendingID = 1
	session.state.Rows[0].Status = "pending"
	session.state.NextRequestID = RequestID(MaxID)
	session.requestRow[RequestID(1)] = RowID(1)
	before := session.Snapshot()
	if _, err := session.Dispatch(Step{Path: "2/0/5", Event: "click", Key: "row-1-save"}); err == nil {
		t.Fatal("save allocated past JavaScript safe ID limit")
	}
	if got := session.Snapshot(); !reflect.DeepEqual(got, before) {
		t.Fatalf("request allocation overflow changed state/messages: %#v", got)
	}
	if got := session.Effects(); len(got) != 0 {
		t.Fatalf("request allocation overflow enqueued effects: %#v", got)
	}

	session.state.NextID = RowID(MaxID)
	before = session.Snapshot()
	if _, err := session.Dispatch(Step{Path: "0", Event: "click", Key: "add"}); err == nil {
		t.Fatal("add allocated past JavaScript safe ID limit")
	}
	if got := session.Snapshot(); !reflect.DeepEqual(got, before) {
		t.Fatalf("row allocation overflow changed state/messages: %#v", got)
	}

	for _, id := range []uint64{0, MaxID + 1} {
		before = session.Snapshot()
		beforeAudit := session.Audit()
		if _, err := session.Complete(asyncsave.Reply{ID: id}); err == nil {
			t.Fatalf("invalid reply ID %d was accepted", id)
		}
		if got := session.Snapshot(); !reflect.DeepEqual(got, before) {
			t.Fatalf("invalid reply ID %d changed state/messages: %#v", id, got)
		}
		if got := session.Audit(); !reflect.DeepEqual(got, beforeAudit) {
			t.Fatalf("invalid reply ID %d changed audit: %#v", id, got)
		}
	}
}

func sortedKeys(values map[string]json.RawMessage) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	// The snapshot envelope has a tiny fixed key set, so insertion sort keeps
	// this test helper independent of other packages.
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j] < keys[j-1]; j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}
	return keys
}

func attrValue(node gobi.Node, name string) string {
	for _, attr := range node.Attrs {
		if attr.Name == name && !attr.Flag {
			return attr.Value
		}
	}
	return ""
}

func attrNames(node gobi.Node) []string {
	names := make([]string, len(node.Attrs))
	for i, attr := range node.Attrs {
		names[i] = attr.Name
	}
	return names
}

func hasFlag(node gobi.Node, name string) bool {
	for _, attr := range node.Attrs {
		if attr.Name == name && attr.Flag {
			return true
		}
	}
	return false
}

func textContent(node gobi.Node) string {
	if node.Kind == gobi.Text {
		return node.Text
	}
	var text string
	for _, child := range node.Kids {
		text += textContent(child)
	}
	return text
}
