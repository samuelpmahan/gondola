// Package list is a keyed collection fixture with stable row identities.
package list

import (
	"strconv"

	"github.com/samuelpmahan/gondola/gobi"
)

type Row struct {
	ID      uint64
	Label   string
	Checked bool
}

type State struct {
	Rows   []Row
	NextID uint64
}

// Init deliberately uses a nil Rows slice. Reset below creates a non-nil empty
// slice so trace encoding can prove nil and [] are distinct states.
func Init() State { return State{Rows: nil} }

func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	switch message.Name {
	case "add":
		if state.NextID < 9007199254740991 {
			state.NextID++
			if state.Rows == nil {
				state.Rows = make([]Row, 0)
			}
			state.Rows = append(state.Rows, Row{ID: state.NextID})
		}
	case "reset":
		state.Rows = make([]Row, 0)
	default:
		state = updateRows(state, message)
	}
	return state, nil
}

func updateRows(state State, message gobi.Message) State {
	for index := 0; index < len(state.Rows); index++ {
		id := strconv.FormatUint(state.Rows[index].ID, 10)
		if message.Name == "edit/"+id {
			state.Rows[index].Label = message.Arg
		} else if message.Name == "check/"+id && (message.Arg == "true" || message.Arg == "false") {
			state.Rows[index].Checked = message.Arg == "true"
		} else if message.Name == "move-up/"+id && index > 0 {
			state.Rows[index], state.Rows[index-1] = state.Rows[index-1], state.Rows[index]
			return state
		} else if message.Name == "remove/"+id {
			state.Rows = append(state.Rows[:index], state.Rows[index+1:]...)
			if len(state.Rows) == 0 {
				state.Rows = make([]Row, 0)
			}
			return state
		}
	}
	return state
}
