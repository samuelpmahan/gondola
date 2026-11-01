// Package keyedmoduleparent adds bounded keyed membership around the existing
// parent module. Child implementations remain independent host instances.
package keyedmoduleparent

import (
	"strconv"

	"github.com/samuelpmahan/gondola/fixtures/compiled/keyedmodulewire"
	"github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	"github.com/samuelpmahan/gondola/gobi"
)

const maxSafeGeneration = 9007199254740991
const maxSafePublicationCount = 9007199254740991

type ChildSlot = keyedmodulewire.ChildRef

type SlotState struct {
	Key               string
	Generation        int
	Mounted           bool
	PublishedCount    float64
	PublishedRevision int
}

// State keeps the legacy parent state and fixed a/b slot records. The order is
// represented by two strings so it stays simple to encode in compiled state.
type State struct {
	Parent     moduleparent.State
	A          SlotState
	B          SlotState
	First      string
	Second     string
	ChildCount int
}

func Init() State {
	return State{
		Parent: moduleparent.Init(),
		A:      SlotState{Key: "a", Generation: 1, Mounted: true},
		B:      SlotState{Key: "b", Generation: 1, Mounted: true},
		First:  "a", Second: "b", ChildCount: 2,
	}
}

// Update owns membership and forwards the established parent input messages.
func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	switch message.Name {
	case "child.add":
		state = Add(state, message.Arg)
	case "child.remove":
		state = Remove(state, message.Arg)
	case "children.reorder":
		state = Reorder(state, message.Arg)
	default:
		parent, effects := moduleparent.Update(state.Parent, message)
		state.Parent = parent
		return state, effects
	}
	return state, []gobi.Effect{}
}

func Output(state State) modulewire.Input {
	return modulewire.Input{Step: state.Parent.Step, Locked: state.Parent.Locked, Revision: state.Parent.Revision}
}

// Receive exists for module ABI admission. Actual keyed child publications must
// enter through ReceiveKeyed so a key and mount generation are always checked.
func Receive(state State, publication modulewire.Publication) State {
	return state
}

func Add(state State, key string) State {
	if state.ChildCount >= 2 || !validKey(key) {
		return state
	}
	slot := slotFor(state, key)
	if slot.Mounted {
		return state
	}
	if slot.Generation < maxSafeGeneration {
		slot.Generation++
	} else {
		return state
	}
	slot.Mounted = true
	slot.PublishedCount = 0
	slot.PublishedRevision = 0
	state = setSlot(state, key, slot)
	if state.ChildCount == 0 {
		state.First = key
	} else {
		state.Second = key
	}
	if state.ChildCount < 2 {
		state.ChildCount++
	}
	return state
}

func Remove(state State, key string) State {
	if !validKey(key) {
		return state
	}
	slot := slotFor(state, key)
	if !slot.Mounted {
		return state
	}
	slot.Mounted = false
	state = setSlot(state, key, slot)
	if state.ChildCount == 2 {
		if state.First == key {
			state.First = state.Second
		}
		state.Second = ""
	} else {
		state.First = ""
		state.Second = ""
	}
	if state.ChildCount > 0 {
		state.ChildCount--
	}
	return state
}

func Reorder(state State, order string) State {
	if state.ChildCount != 2 || !state.A.Mounted || !state.B.Mounted {
		return state
	}
	if order == "a,b" {
		state.First, state.Second = "a", "b"
	} else if order == "b,a" {
		state.First, state.Second = "b", "a"
	} else {
		return state
	}
	return state
}

// Children returns mounted identities in the parent's current view order.
func Children(state State) []ChildSlot {
	children := make([]ChildSlot, 0, state.ChildCount)
	if state.ChildCount > 0 {
		children = append(children, refFor(state, state.First))
	}
	if state.ChildCount > 1 {
		children = append(children, refFor(state, state.Second))
	}
	return children
}

func IsCurrent(state State, key string, generation int) bool {
	if !validKey(key) || generation < 1 {
		return false
	}
	slot := slotFor(state, key)
	return slot.Mounted && slot.Generation == generation
}

// ReceiveKeyed accepts a publication only for the live key generation and the
// current parent input revision. Each slot stores its own publication snapshot.
func ReceiveKeyed(state State, key string, generation int, publication modulewire.Publication) State {
	if !IsCurrent(state, key, generation) || publication.Revision != state.Parent.Revision ||
		publication.Count < 0 || publication.Count > float64(maxSafePublicationCount) ||
		publication.Count != publication.Count {
		return state
	}
	slot := slotFor(state, key)
	slot.PublishedCount = publication.Count
	slot.PublishedRevision = publication.Revision
	state = setSlot(state, key, slot)
	return state
}

func View(state State) gobi.Node {
	root := moduleparent.View(state.Parent)
	root.Key = "keyed-module-parent"
	controls := gobi.El("section",
		membershipButton("Mount a", "child.add", "a", canAdd(state.A, state.ChildCount)),
		membershipButton("Remove a", "child.remove", "a", state.A.Mounted),
		membershipButton("Mount b", "child.add", "b", canAdd(state.B, state.ChildCount)),
		membershipButton("Remove b", "child.remove", "b", state.B.Mounted),
		gobi.El("button", gobi.Txt("Reorder children")).Set("class", "keyed-reorder-children").Handle("click", "children.reorder", reversedOrder(state)),
	).Set("class", "keyed-membership-controls").Keyed("keyed-membership-controls")
	if state.ChildCount != 2 {
		controls.Kids[4] = controls.Kids[4].Flag("disabled")
	}
	children := gobi.El("section").Set("class", "keyed-child-summaries").Keyed("keyed-child-summaries")
	for _, child := range Children(state) {
		slot := slotFor(state, child.Key)
		label := child.Key + " generation " + strconv.Itoa(child.Generation) + " publication count " + strconv.FormatFloat(slot.PublishedCount, 'f', -1, 64)
		if slot.PublishedRevision > 0 {
			label += " at revision " + strconv.Itoa(slot.PublishedRevision)
		}
		children.Kids = append(children.Kids, gobi.El("p", gobi.Txt(label)).Set("class", "keyed-child-summary").Keyed(child.Key))
	}
	root.Kids = append(root.Kids, controls, children)
	return root
}

func membershipButton(label, message, key string, enabled bool) gobi.Node {
	button := gobi.El("button", gobi.Txt(label)).Set("class", "keyed-"+key+"-"+message).Handle("click", message, key)
	if !enabled {
		button = button.Flag("disabled")
	}
	return button
}

func canAdd(slot SlotState, childCount int) bool {
	return !slot.Mounted && childCount < 2 && slot.Generation < maxSafeGeneration
}

func reversedOrder(state State) string {
	if state.First == "a" {
		return "b,a"
	}
	return "a,b"
}

func validKey(key string) bool { return key == "a" || key == "b" }

func slotFor(state State, key string) SlotState {
	if key == "a" {
		return state.A
	}
	return state.B
}

func setSlot(state State, key string, slot SlotState) State {
	if key == "a" {
		state.A = slot
	} else {
		state.B = slot
	}
	return state
}

func refFor(state State, key string) ChildSlot {
	slot := slotFor(state, key)
	return ChildSlot{Key: slot.Key, Generation: slot.Generation}
}
