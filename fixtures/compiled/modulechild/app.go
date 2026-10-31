// Package modulechild is an independently compiled counter module. It only
// imports the shared typed wire records and does not import its parent.
package modulechild

import (
	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	"github.com/samuelpmahan/gondola/gobi"
)

const maxSafeInputRevision = 9007199254740991
const maxSafePublicationCount = 9007199254740991

type State struct {
	Counter       counter.State
	Step          int
	Locked        bool
	InputRevision int
}

func Init() State {
	return State{Counter: counter.Init(), Step: 1}
}

func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	switch message.Name {
	case "add":
		if message.Arg == "" && !state.Locked {
			switch state.Step {
			case 1:
				if state.Counter.Count >= 0 && state.Counter.Count < maxSafePublicationCount {
					state.Counter, _ = counter.Update(state.Counter, gobi.Message{Name: "add"})
				}
			case 2:
				if state.Counter.Count >= 0 && state.Counter.Count <= maxSafePublicationCount-2 {
					state.Counter, _ = counter.Update(state.Counter, gobi.Message{Name: "add"})
					state.Counter, _ = counter.Update(state.Counter, gobi.Message{Name: "add"})
				}
			case 3:
				if state.Counter.Count >= 0 && state.Counter.Count <= maxSafePublicationCount-3 {
					state.Counter, _ = counter.Update(state.Counter, gobi.Message{Name: "add"})
					state.Counter, _ = counter.Update(state.Counter, gobi.Message{Name: "add"})
					state.Counter, _ = counter.Update(state.Counter, gobi.Message{Name: "add"})
				}
			}
		}
	case "reset":
		if message.Arg == "" && state.Counter.Count > 0 {
			state.Counter, _ = counter.Update(state.Counter, gobi.Message{Name: "reset"})
		}
	}
	return state, []gobi.Effect{}
}

// Input applies a newer valid parent input. Conflicting equal revisions and
// all stale or malformed values leave the child unchanged.
func Input(state State, input modulewire.Input) State {
	if input.Step < 1 || input.Step > 3 || input.Revision < 1 || input.Revision > maxSafeInputRevision {
		return state
	}
	if input.Revision < state.InputRevision {
		return state
	}
	if input.Revision == state.InputRevision {
		if input.Step != state.Step || input.Locked != state.Locked {
			return state
		}
		return state
	}
	state.Step = input.Step
	state.Locked = input.Locked
	state.InputRevision = input.Revision
	return state
}

// Publication snapshots the current Go-owned counter and the input revision
// that governed its transitions.
func Publication(state State) modulewire.Publication {
	return modulewire.Publication{Count: state.Counter.Count, Revision: state.InputRevision}
}
