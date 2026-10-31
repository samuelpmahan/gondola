// Package methods exercises value-receiver application methods over nested
// counter state values. Its package-level functions keep the normal Gobi roles.
package methods

import (
	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/gobi"
)

type State struct {
	Parent     counter.State
	Child      counter.State
	ReadOnly   bool
	SavedChild float64
}

func Init() State {
	var state State
	return state.Initialize()
}

func (state State) Initialize() State {
	state.Parent = counter.Init()
	state.Child = counter.Init()
	return state
}

func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	return state.Reduce(message)
}

func (state State) Reduce(message gobi.Message) (State, []gobi.Effect) {
	switch message.Name {
	case "parentAdd":
		return state.AddParent()
	case "parentReset":
		return state.ResetParent()
	case "childAdd":
		return state.AddChild()
	case "childReset":
		return state.ResetChild()
	case "toggleReadOnly":
		return state.ToggleReadOnly()
	case "captureChild":
		return state.CaptureChild()
	case "publishSaved":
		return state.PublishSaved()
	default:
		return state, nil
	}
}

func (state State) AddParent() (State, []gobi.Effect) {
	parent, effects := counter.Update(state.Parent, gobi.Message{Name: "add"})
	state.Parent = parent
	return state, effects
}

func (state State) ResetParent() (State, []gobi.Effect) {
	parent, effects := counter.Update(state.Parent, gobi.Message{Name: "reset"})
	state.Parent = parent
	return state, effects
}

func (state State) AddChild() (State, []gobi.Effect) {
	if state.ReadOnly {
		return state, nil
	}
	child, effects := counter.Update(state.Child, gobi.Message{Name: "add"})
	state.Child = child
	return state, effects
}

func (state State) ResetChild() (State, []gobi.Effect) {
	if state.ReadOnly {
		return state, nil
	}
	child, effects := counter.Update(state.Child, gobi.Message{Name: "reset"})
	state.Child = child
	return state, effects
}

func (state State) ToggleReadOnly() (State, []gobi.Effect) {
	state.ReadOnly = !state.ReadOnly
	return state, nil
}

func (state State) CaptureChild() (State, []gobi.Effect) {
	state.SavedChild = state.Child.Count
	return state, nil
}

func (state State) PublishSaved() (State, []gobi.Effect) {
	state.Parent.Count = state.SavedChild
	return state, nil
}
