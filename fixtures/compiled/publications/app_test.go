package publications

import (
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
)

func TestCaptureSnapshotsInputAndCountImmutably(t *testing.T) {
	initial := Init()
	state, _ := applyMessage(initial, "counter.add", "oak")
	state, _ = applyMessage(state, "input.step", "3")
	state, _ = applyMessage(state, "counter.add", "oak")
	beforeCapture := state
	state, _ = applyMessage(state, "child.capture", "oak")

	if len(state.Publications) != 1 {
		t.Fatalf("publications after capture = %d, want 1", len(state.Publications))
	}
	want := Publication{ID: 1, Key: "oak", ParentGeneration: 1, ChildGeneration: 2, InputRevision: 2, Value: 4}
	if state.Publications[0] != want {
		t.Fatalf("captured publication = %#v, want %#v", state.Publications[0], want)
	}

	state, _ = applyMessage(state, "counter.add", "oak")
	if state.Children[0].Counter.Count != 7 {
		t.Fatalf("edited child count = %v, want 7", state.Children[0].Counter.Count)
	}
	if state.Publications[0] != want {
		t.Fatalf("later counter edit mutated captured publication: %#v", state.Publications[0])
	}
	if len(beforeCapture.Publications) != 0 || beforeCapture.Children[0].Counter.Count != 4 {
		t.Fatalf("Update mutated prior state: %#v", beforeCapture)
	}
	if len(initial.Publications) != 0 || initial.Children[0].Counter.Count != 0 || initial.Input.Step != 1 {
		t.Fatalf("Update mutated Init value: %#v", initial)
	}
}

func TestDeliveryConsumesOutOfOrderPublicationExactlyOnce(t *testing.T) {
	state := Init()
	state, _ = applyMessage(state, "input.step", "3")
	state, _ = applyMessage(state, "counter.add", "oak")
	state, _ = applyMessage(state, "child.capture", "oak") // id 1, value 3
	state, _ = applyMessage(state, "counter.add", "oak")
	state, _ = applyMessage(state, "child.capture", "oak") // id 2, value 6

	state, _ = applyMessage(state, "publication.deliver", "2")
	if state.Parent.PublishedKey != "oak" || state.Parent.PublishedValue != 6 || state.Parent.Accepted != 1 {
		t.Fatalf("newer publication not accepted: %#v", state.Parent)
	}
	if state.Children[0].LastAcceptedPublication != 2 || len(state.Publications) != 1 || state.Publications[0].ID != 1 {
		t.Fatalf("delivery did not consume only id 2: %#v", state)
	}
	state, _ = applyMessage(state, "publication.deliver", "1")
	if state.Parent.PublishedValue != 6 || state.Parent.Accepted != 1 || state.Parent.Rejected != 1 || len(state.Publications) != 0 || state.LastDecision != "rejected:stale-id:1" {
		t.Fatalf("older publication should be rejected and consumed: %#v", state)
	}
	beforeDuplicate := state
	state, _ = applyMessage(state, "publication.deliver", "1")
	if !reflect.DeepEqual(state, beforeDuplicate) {
		t.Fatalf("duplicate delivery changed state: before=%#v after=%#v", beforeDuplicate, state)
	}
}

func TestAcceptedPublicationWatermarkSurvivesChildUpdatesAndReorder(t *testing.T) {
	state := Init()
	state, _ = applyMessage(state, "child.capture", "oak") // id 1
	state, _ = applyMessage(state, "counter.add", "oak")
	state, _ = applyMessage(state, "child.capture", "oak") // id 2
	state, _ = applyMessage(state, "publication.deliver", "2")
	if state.Children[0].LastAcceptedPublication != 2 {
		t.Fatalf("accepted publication watermark = %d, want 2", state.Children[0].LastAcceptedPublication)
	}

	state, effects := applyMessage(state, "child.request", "oak")
	if len(effects) != 1 || !state.Children[0].Pending {
		t.Fatalf("child request did not preserve the accepted child: state=%#v effects=%#v", state, effects)
	}
	state, _ = applyMessage(state, "counter.add", "oak")
	state, _ = applyMessage(state, "children.swap", "oak:elm")
	state, _ = applyMessage(state, "publication.deliver", "1")

	if len(state.Children) != 2 || state.Children[1].Key != "oak" {
		t.Fatalf("reordered children = %#v, want oak in row 1", state.Children)
	}
	oak := state.Children[1]
	if oak.LastAcceptedPublication != 2 || !oak.Pending || oak.Token != "child:oak:g2:r1" || oak.Counter.Count != 2 {
		t.Fatalf("child updates reset its watermark or other state: %#v", oak)
	}
	if state.Parent.Accepted != 1 || state.Parent.Rejected != 1 || state.LastDecision != "rejected:stale-id:1" {
		t.Fatalf("older publication was not rejected after child updates: parent=%#v decision=%q", state.Parent, state.LastDecision)
	}
}

func TestDeliveryRejectsStaleInputRevision(t *testing.T) {
	state := Init()
	state, _ = applyMessage(state, "input.step", "3")
	state, _ = applyMessage(state, "counter.add", "oak")
	state, _ = applyMessage(state, "child.capture", "oak")
	captured := state.Publications[0]
	state, _ = applyMessage(state, "input.step", "2")
	state, _ = applyMessage(state, "publication.deliver", "1")

	if state.Parent.Accepted != 0 || state.Parent.Rejected != 1 || state.Parent.PublishedKey != "" || state.LastDecision != "rejected:stale-input:1" {
		t.Fatalf("stale input revision accepted: %#v", state)
	}
	if captured.InputRevision != 2 || state.Input.Revision != 3 || len(state.Publications) != 0 {
		t.Fatalf("stale-input record was not consumed or revision changed unexpectedly: %#v", state)
	}
}

func TestRemovedAndReusedKeyRejectsOldChildGeneration(t *testing.T) {
	state := Init()
	state, _ = applyMessage(state, "child.capture", "oak")
	oldGeneration := state.Children[0].Generation
	state, _ = applyMessage(state, "child.remove", "oak")
	state, _ = applyMessage(state, "child.add", "oak")
	if state.Children[1].Generation <= oldGeneration {
		t.Fatalf("reused key generation = %d, want > %d", state.Children[1].Generation, oldGeneration)
	}
	state, _ = applyMessage(state, "publication.deliver", "1")
	if state.Parent.Accepted != 0 || state.Parent.Rejected != 1 || state.LastDecision != "rejected:child-generation:1" || len(state.Publications) != 0 {
		t.Fatalf("old child generation publication not rejected: %#v", state)
	}
}

func TestRemovedParentRetainsQueueButRemountRejectsOldParentGeneration(t *testing.T) {
	state := Init()
	state, _ = applyMessage(state, "child.capture", "oak")
	state, effects := applyMessage(state, "parent.remove", "")
	if len(effects) != 0 || len(state.Publications) != 1 || state.Parent.Alive {
		t.Fatalf("parent removal should retain queued publication: state=%#v effects=%#v", state, effects)
	}
	state, _ = applyMessage(state, "parent.remount", "")
	state, _ = applyMessage(state, "child.add", "oak")
	state, _ = applyMessage(state, "publication.deliver", "1")
	if state.Parent.Generation != 4 || state.Parent.Accepted != 0 || state.Parent.Rejected != 1 || state.LastDecision != "rejected:parent-generation:1" {
		t.Fatalf("old parent publication not rejected after remount: %#v", state)
	}
}

func TestLockedInputFencesDirectMutationsAndSameStepIsNoop(t *testing.T) {
	state := Init()
	state, _ = applyMessage(state, "input.toggleLock", "")
	locked := state
	state, _ = applyMessage(state, "counter.add", "oak")
	state, _ = applyMessage(state, "child.capture", "oak")
	state, _ = applyMessage(state, "input.step", "1")
	if !reflect.DeepEqual(state, locked) {
		t.Fatalf("locked add/capture/same-step changed state: before=%#v after=%#v", locked, state)
	}
	state, _ = applyMessage(state, "input.step", "2")
	if state.Input.Step != 2 || state.Input.Revision != 3 || !state.Input.Locked {
		t.Fatalf("step change while locked = %#v", state.Input)
	}
	state, _ = applyMessage(state, "input.toggleLock", "")
	state, _ = applyMessage(state, "counter.add", "oak")
	if state.Children[0].Counter.Count != 2 || state.Input.Revision != 4 || state.Input.Locked {
		t.Fatalf("unlocked step was not applied: state=%#v", state)
	}
}

func TestParentRemovalCancelsInReversePresentationOrderAndRemountKeepsInput(t *testing.T) {
	state := Init()
	state, _ = applyMessage(state, "input.step", "3")
	state, _ = applyMessage(state, "input.toggleLock", "")
	state, parentEffects := applyMessage(state, "parent.request", "")
	state, _ = applyMessage(state, "child.request", "oak")
	state, _ = applyMessage(state, "child.request", "elm")
	state, effects := applyMessage(state, "parent.remove", "")
	if len(parentEffects) != 1 || len(effects) != 3 {
		t.Fatalf("request/removal effects = %#v / %#v", parentEffects, effects)
	}
	want := []gobi.Effect{
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "child:elm:g3:r1"},
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "child:oak:g2:r1"},
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "parent:g1:r1"},
	}
	if !reflect.DeepEqual(effects, want) {
		t.Fatalf("remove effects = %#v, want %#v", effects, want)
	}
	state, _ = applyMessage(state, "parent.remount", "")
	if state.Input.Step != 3 || !state.Input.Locked || state.Input.Revision != 3 {
		t.Fatalf("remount changed parent input configuration: %#v", state.Input)
	}
}

func TestMalformedAndUnknownPublicationIDsAreNoOps(t *testing.T) {
	for _, id := range []string{"", "0", "01", "+1", "-1", "99999999999999999999"} {
		state := Init()
		before := state
		state, _ = applyMessage(state, "publication.deliver", id)
		if !reflect.DeepEqual(state, before) {
			t.Fatalf("delivery id %q changed state: before=%#v after=%#v", id, before, state)
		}
	}
}

func TestSafeCeilingsFencePublicationAndRevisionIncrements(t *testing.T) {
	state := Init()
	state.NextPublication = maxSafeID
	before := state
	state, _ = applyMessage(state, "child.capture", "oak")
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("publication ID exhaustion changed state: %#v", state)
	}
	state = Init()
	state.Input.Revision = maxSafeID
	before = state
	state, _ = applyMessage(state, "input.step", "2")
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("input revision exhaustion changed state: %#v", state)
	}
}

func applyMessage(state State, name, arg string) (State, []gobi.Effect) {
	return Update(state, gobi.Message{Name: name, Arg: arg})
}
