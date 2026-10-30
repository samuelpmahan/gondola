// Package editor is a small controlled-text editor built on Gobi's value-based
// Init/Update/View model.
package editor

import (
	"strconv"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inputbinding"
)

// State is the editor's complete application state.
type State struct {
	Draft string
	Saved string
	Saves int
}

// Init returns an empty editor.
func Init() State { return State{} }

// Update applies one declared editor message. The editor has no effects.
func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	switch message.Name {
	case "edit":
		state.Draft = message.Arg
	case "save":
		if state.Draft != "" {
			state.Saved = state.Draft
			state.Saves++
		}
	case "reset":
		state = State{}
	}
	return state, nil
}

// View projects state to the stable editor tree and its explicit input binding.
func View(state State) inputbinding.View {
	input := gobi.El("input").
		Set("type", "text").
		Set("value", state.Draft).
		Set("aria-label", "Draft")

	save := gobi.El("button", gobi.Txt("Save")).
		Set("class", "save").
		Handle("click", "save", "")
	if state.Draft == "" {
		save = save.Flag("disabled")
	}

	reset := gobi.El("button", gobi.Txt("Reset")).
		Set("class", "reset").
		Handle("click", "reset", "")
	if state == (State{}) {
		reset = reset.Flag("disabled")
	}

	tree := gobi.El("div",
		input,
		gobi.El("p", gobi.Txt("Saved: "), gobi.Txt(state.Saved)),
		gobi.El("p", gobi.Txt("Saves: "), gobi.Txt(strconv.Itoa(state.Saves))),
		save,
		reset,
	).Set("class", "editor")

	return inputbinding.View{
		Tree: tree,
		Bindings: []inputbinding.Binding{{
			Path: "0", Event: "input", Message: "edit", Source: inputbinding.TargetValue,
		}},
	}
}
