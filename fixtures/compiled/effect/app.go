// Package effect models a deterministic request/reply without real networking.
package effect

import "github.com/samuelpmahan/gondola/gobi"

type State struct {
	Input        string
	Value        string
	Status       string
	Pending      bool
	Requests     int
	Completions  int
	NegativeZero float64
}

func Init() State {
	negative := -1.0
	zero := 0.0
	return State{Status: "idle", NegativeZero: negative * zero}
}

func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	switch message.Name {
	case "edit":
		state.Input = message.Arg
	case "request":
		if !state.Pending && state.Input != "" && state.Requests < 9007199254740991 {
			state.Pending = true
			state.Status = "pending"
			state.Requests++
			return state, []gobi.Effect{{Kind: "fixture.request", Name: "lookup", Arg: state.Input, Reply: "complete"}}
		}
	case "complete":
		if state.Pending && state.Completions < 9007199254740991 {
			state.Pending = false
			state.Status = "complete"
			state.Value = message.Arg
			state.Completions++
		}
	}
	return state, nil
}
