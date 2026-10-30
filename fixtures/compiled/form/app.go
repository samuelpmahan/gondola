// Package form is a small compiled-frontend fixture with text, checkbox,
// save/reset, and a literal handler argument that resembles an input binding.
package form

import "github.com/samuelpmahan/gondola/gobi"

type State struct {
	Draft   string
	Checked bool
	Saved   string
	Saves   int
	Literal string
}

func Init() State { return State{} }

func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	switch message.Name {
	case "edit":
		state.Draft = message.Arg
	case "checked":
		state.Checked = message.Arg == "true"
	case "literal":
		state.Literal = message.Arg
	case "boundary":
		state.Saves = 9007199254740990
	case "save":
		if state.Draft != "" {
			state.Saved = state.Draft
			if state.Saves < 9007199254740991 {
				state.Saves++
			}
		}
	case "reset":
		state = State{}
	}
	return state, nil
}
