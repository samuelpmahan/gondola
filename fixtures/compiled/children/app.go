// Package children is a bounded Go-owned keyed collection fixture. Children
// are values in presentation order; their keys identify each value across
// moves, while generations isolate removed and re-created keys.
package children

import (
	"strconv"

	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/gobi"
)

const maxSafeID uint64 = 9007199254740991

type ParentState struct {
	Alive      bool
	Generation uint64
	RequestSeq uint64
	Pending    bool
	Token      string
	Reply      string
}

type ChildState struct {
	Key        string
	Counter    counter.State
	Generation uint64
	RequestSeq uint64
	Pending    bool
	Token      string
	Reply      string
}

type State struct {
	Parent         ParentState
	Children       []ChildState
	NextGeneration uint64
}

func Init() State {
	return State{
		Parent:         ParentState{Alive: true, Generation: 1},
		Children:       []ChildState{{Key: "oak", Generation: 2, Counter: counter.Init()}, {Key: "elm", Generation: 3, Counter: counter.Init()}},
		NextGeneration: 3,
	}
}

func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	state = cloneState(state)
	switch message.Name {
	case "child.add":
		return addChild(state, message.Arg)
	case "child.remove":
		return removeChild(state, message.Arg)
	case "children.swap":
		return swapChildren(state, message.Arg), []gobi.Effect{}
	case "counter.add":
		return addCounter(state, message.Arg), []gobi.Effect{}
	case "child.request":
		return requestChild(state, message.Arg)
	case "children.clear":
		if message.Arg != "" || !state.Parent.Alive {
			return state, []gobi.Effect{}
		}
		effects := cancelChildren(state.Children)
		state.Children = make([]ChildState, 0)
		return state, effects
	case "parent.request":
		if message.Arg != "" {
			return state, []gobi.Effect{}
		}
		return requestParent(state)
	case "parent.remove":
		if message.Arg != "" {
			return state, []gobi.Effect{}
		}
		return removeParent(state)
	case "parent.remount":
		if message.Arg != "" {
			return state, []gobi.Effect{}
		}
		return remountParent(state)
	case "complete":
		return complete(state, message.Arg), []gobi.Effect{}
	default:
		return state, []gobi.Effect{}
	}
}

func cloneState(state State) State {
	if state.Children != nil {
		children := make([]ChildState, 0, len(state.Children))
		children = append(children, state.Children...)
		state.Children = children
	}
	return state
}

func addChild(state State, key string) (State, []gobi.Effect) {
	if !state.Parent.Alive || !validKey(key) || childIndex(state.Children, key) >= 0 {
		return state, []gobi.Effect{}
	}
	if state.NextGeneration < maxSafeID {
		state.NextGeneration++
		state.Children = append(state.Children, ChildState{
			Key: key, Generation: state.NextGeneration, Counter: counter.Init(),
		})
		return state, []gobi.Effect{}
	}
	return state, []gobi.Effect{}
}

func removeChild(state State, key string) (State, []gobi.Effect) {
	if !state.Parent.Alive || !validKey(key) {
		return state, []gobi.Effect{}
	}
	index := childIndex(state.Children, key)
	if index < 0 {
		return state, []gobi.Effect{}
	}
	effects := []gobi.Effect{}
	if state.Children[index].Pending {
		effects = append(effects, cancelEffect(state.Children[index].Token))
	}
	state.Children = append(state.Children[:index], state.Children[index:][1:]...)
	if len(state.Children) == 0 {
		state.Children = make([]ChildState, 0)
	}
	return state, effects
}

func swapChildren(state State, argument string) State {
	if !state.Parent.Alive {
		return state
	}
	if len(argument) > 33 {
		return state
	}
	separator := -1
	for index := 0; index < len(argument) && index < 33; index++ {
		if argument[index] == ':' {
			if separator >= 0 {
				return state
			}
			separator = index
		}
	}
	if separator <= 0 {
		return state
	}
	first := argument[:separator]
	rest := argument[separator:]
	second := rest[1:]
	if !validKey(first) || !validKey(second) || first == second {
		return state
	}
	firstIndex := childIndex(state.Children, first)
	secondIndex := childIndex(state.Children, second)
	if firstIndex < 0 || secondIndex < 0 {
		return state
	}
	state.Children[firstIndex], state.Children[secondIndex] = state.Children[secondIndex], state.Children[firstIndex]
	return state
}

func addCounter(state State, key string) State {
	if !state.Parent.Alive || !validKey(key) {
		return state
	}
	index := childIndex(state.Children, key)
	if index < 0 || state.Children[index].Counter.Count >= float64(maxSafeID) {
		return state
	}
	state.Children[index].Counter, _ = counter.Update(state.Children[index].Counter, gobi.Message{Name: "add"})
	return state
}

func requestChild(state State, key string) (State, []gobi.Effect) {
	if !state.Parent.Alive || !validKey(key) {
		return state, []gobi.Effect{}
	}
	index := childIndex(state.Children, key)
	if index < 0 || state.Children[index].Pending {
		return state, []gobi.Effect{}
	}
	child := state.Children[index]
	if child.RequestSeq < maxSafeID {
		child.RequestSeq++
		child.Pending = true
		child.Token = childToken(child.Key, child.Generation, child.RequestSeq)
		child.Reply = ""
		state.Children[index] = child
		return state, []gobi.Effect{requestEffect(child.Token)}
	}
	return state, []gobi.Effect{}
}

func requestParent(state State) (State, []gobi.Effect) {
	if !state.Parent.Alive || state.Parent.Pending {
		return state, []gobi.Effect{}
	}
	if state.Parent.RequestSeq < maxSafeID {
		state.Parent.RequestSeq++
		state.Parent.Pending = true
		state.Parent.Token = parentToken(state.Parent.Generation, state.Parent.RequestSeq)
		state.Parent.Reply = ""
		return state, []gobi.Effect{requestEffect(state.Parent.Token)}
	}
	return state, []gobi.Effect{}
}

func removeParent(state State) (State, []gobi.Effect) {
	if !state.Parent.Alive {
		return state, []gobi.Effect{}
	}
	effects := cancelChildren(state.Children)
	if state.Parent.Pending {
		effects = append(effects, cancelEffect(state.Parent.Token))
	}
	state.Children = make([]ChildState, 0)
	state.Parent.Alive = false
	state.Parent.Pending = false
	state.Parent.Token = ""
	return state, effects
}

func remountParent(state State) (State, []gobi.Effect) {
	if state.Parent.Alive {
		return state, []gobi.Effect{}
	}
	if state.NextGeneration < maxSafeID {
		state.NextGeneration++
		state.Parent = ParentState{Alive: true, Generation: state.NextGeneration}
		state.Children = make([]ChildState, 0)
		return state, []gobi.Effect{}
	}
	return state, []gobi.Effect{}
}

func complete(state State, token string) State {
	if token == "" {
		return state
	}
	if state.Parent.Alive && state.Parent.Pending && state.Parent.Token == token {
		state.Parent.Pending = false
		state.Parent.Reply = token
		return state
	}
	for index := 0; index < len(state.Children); index++ {
		child := state.Children[index]
		if child.Pending && child.Token == token {
			child.Pending = false
			child.Reply = token
			state.Children[index] = child
			return state
		}
	}
	return state
}

func cancelChildren(children []ChildState) []gobi.Effect {
	effects := []gobi.Effect{}
	for index := 0; index < len(children); index++ {
		if children[index].Pending {
			effects = append([]gobi.Effect{cancelEffect(children[index].Token)}, effects...)
		}
	}
	return effects
}

func childIndex(children []ChildState, key string) int {
	for index := 0; index < len(children); index++ {
		if children[index].Key == key {
			return index
		}
	}
	return -1
}

func validKey(key string) bool {
	if len(key) == 0 || len(key) > 16 || key[0] < 'a' || key[0] > 'z' {
		return false
	}
	for index, value := range key {
		if index == 0 {
			continue
		}
		if (value < 'a' || value > 'z') && (value < '0' || value > '9') && value != '_' && value != '-' {
			return false
		}
	}
	return true
}

func childToken(key string, generation, requestSeq uint64) string {
	return "child:" + key + ":g" + strconv.FormatUint(generation, 10) + ":r" + strconv.FormatUint(requestSeq, 10)
}

func parentToken(generation, requestSeq uint64) string {
	return "parent:g" + strconv.FormatUint(generation, 10) + ":r" + strconv.FormatUint(requestSeq, 10)
}

func requestEffect(token string) gobi.Effect {
	return gobi.Effect{Kind: "fixture.request", Name: "lookup", Arg: token, Reply: "complete"}
}

func cancelEffect(token string) gobi.Effect {
	return gobi.Effect{Kind: "lifecycle.cancel", Name: "cancel", Arg: token, Reply: ""}
}
