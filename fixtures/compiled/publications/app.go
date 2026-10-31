// Package publications combines typed parent inputs with a Go-owned delayed
// publication queue over a dynamic, keyed child slice.
package publications

import (
	"strconv"

	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/gobi"
)

const maxSafeID uint64 = 9007199254740991

type ParentInput struct {
	Step     int
	Locked   bool
	Revision uint64
}

type ParentState struct {
	Alive          bool
	Generation     uint64
	RequestSeq     uint64
	Pending        bool
	Token          string
	Reply          string
	PublishedKey   string
	PublishedValue float64
	Accepted       uint64
	Rejected       uint64
}

type ChildState struct {
	Key                     string
	Counter                 counter.State
	Generation              uint64
	RequestSeq              uint64
	Pending                 bool
	Token                   string
	Reply                   string
	LastAcceptedPublication uint64
}

type Publication struct {
	ID               uint64
	Key              string
	ParentGeneration uint64
	ChildGeneration  uint64
	InputRevision    uint64
	Value            float64
}

type State struct {
	Parent          ParentState
	Children        []ChildState
	NextGeneration  uint64
	Input           ParentInput
	Publications    []Publication
	NextPublication uint64
	LastDecision    string
}

// AddFromInput is a value-receiver child operation. The caller assigns the
// returned child back into State.Children after applying the same typed input.
func (child ChildState) AddFromInput(input ParentInput) ChildState {
	if input.Locked || input.Step < 1 || input.Step > 3 {
		return child
	}
	if input.Step == 1 && child.Counter.Count+1 <= float64(maxSafeID) {
		child.Counter, _ = counter.Update(child.Counter, gobi.Message{Name: "add"})
		return child
	}
	if input.Step == 2 && child.Counter.Count+2 <= float64(maxSafeID) {
		child.Counter, _ = counter.Update(child.Counter, gobi.Message{Name: "add"})
		child.Counter, _ = counter.Update(child.Counter, gobi.Message{Name: "add"})
		return child
	}
	if input.Step == 3 && child.Counter.Count+3 <= float64(maxSafeID) {
		child.Counter, _ = counter.Update(child.Counter, gobi.Message{Name: "add"})
		child.Counter, _ = counter.Update(child.Counter, gobi.Message{Name: "add"})
		child.Counter, _ = counter.Update(child.Counter, gobi.Message{Name: "add"})
	}
	return child
}

func Init() State {
	return State{
		Parent: ParentState{Alive: true, Generation: 1},
		Children: []ChildState{
			{Key: "oak", Generation: 2, Counter: counter.Init()},
			{Key: "elm", Generation: 3, Counter: counter.Init()},
		},
		NextGeneration: 3,
		Input:          ParentInput{Step: 1, Revision: 1},
		Publications:   make([]Publication, 0),
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
	case "children.clear":
		if message.Arg != "" || !state.Parent.Alive {
			return state, []gobi.Effect{}
		}
		effects := cancelChildren(state.Children)
		state.Children = make([]ChildState, 0)
		return state, effects
	case "counter.add":
		return addCounter(state, message.Arg), []gobi.Effect{}
	case "child.capture":
		return captureChild(state, message.Arg), []gobi.Effect{}
	case "publication.deliver":
		return deliverPublication(state, message.Arg), []gobi.Effect{}
	case "child.request":
		return requestChild(state, message.Arg)
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
		return remountParent(state), []gobi.Effect{}
	case "input.step":
		return setInputStep(state, message.Arg), []gobi.Effect{}
	case "input.toggleLock":
		if message.Arg != "" {
			return state, []gobi.Effect{}
		}
		return toggleInputLock(state), []gobi.Effect{}
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
	if state.Publications != nil {
		publications := make([]Publication, 0, len(state.Publications))
		publications = append(publications, state.Publications...)
		state.Publications = publications
	}
	return state
}

func addChild(state State, key string) (State, []gobi.Effect) {
	if !state.Parent.Alive || !validKey(key) || childIndex(state.Children, key) >= 0 {
		return state, []gobi.Effect{}
	}
	if state.NextGeneration < maxSafeID {
		state.NextGeneration++
		state.Children = append(state.Children, ChildState{Key: key, Generation: state.NextGeneration, Counter: counter.Init()})
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
	if !state.Parent.Alive || len(argument) > 33 {
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
	if !state.Parent.Alive || state.Input.Locked || !validKey(key) {
		return state
	}
	index := childIndex(state.Children, key)
	if index < 0 {
		return state
	}
	child := state.Children[index].AddFromInput(state.Input)
	state.Children[index] = child
	return state
}

func captureChild(state State, key string) State {
	if !state.Parent.Alive || state.Input.Locked || !validKey(key) {
		return state
	}
	index := childIndex(state.Children, key)
	if index < 0 {
		return state
	}
	child := state.Children[index]
	if state.NextPublication < maxSafeID {
		state.NextPublication++
		publication := Publication{
			ID: state.NextPublication, Key: child.Key,
			ParentGeneration: state.Parent.Generation, ChildGeneration: child.Generation,
			InputRevision: state.Input.Revision, Value: child.Counter.Count,
		}
		state.Publications = append(state.Publications, publication)
	}
	return state
}

func deliverPublication(state State, argument string) State {
	index := publicationIndex(state.Publications, argument)
	if index < 0 {
		return state
	}
	publication := state.Publications[index]
	decision := rejectionReason(state, publication)
	if decision != "" {
		if state.Parent.Rejected < maxSafeID {
			state.Publications = append(state.Publications[:index], state.Publications[index:][1:]...)
			if len(state.Publications) == 0 {
				state.Publications = make([]Publication, 0)
			}
			state.Parent.Rejected++
			state.LastDecision = "rejected:" + decision + ":" + strconv.FormatUint(publication.ID, 10)
		}
		return state
	}
	if state.Parent.Accepted < maxSafeID {
		childIndexValue := childIndex(state.Children, publication.Key)
		child := state.Children[childIndexValue]
		child.LastAcceptedPublication = publication.ID
		state.Children[childIndexValue] = child
		state.Parent.PublishedKey = publication.Key
		state.Parent.PublishedValue = publication.Value
		state.Publications = append(state.Publications[:index], state.Publications[index:][1:]...)
		if len(state.Publications) == 0 {
			state.Publications = make([]Publication, 0)
		}
		state.Parent.Accepted++
		state.LastDecision = "accepted:" + publication.Key + ":" + strconv.FormatUint(publication.ID, 10)
	}
	return state
}

func rejectionReason(state State, publication Publication) string {
	if !state.Parent.Alive {
		return "parent-dead"
	}
	if publication.ParentGeneration != state.Parent.Generation {
		return "parent-generation"
	}
	if state.Input.Locked {
		return "locked"
	}
	if publication.InputRevision != state.Input.Revision {
		return "stale-input"
	}
	index := childIndex(state.Children, publication.Key)
	if index < 0 {
		return "missing-child"
	}
	child := state.Children[index]
	if publication.ChildGeneration != child.Generation {
		return "child-generation"
	}
	if publication.ID <= child.LastAcceptedPublication {
		return "stale-id"
	}
	return ""
}

func publicationIndex(publications []Publication, argument string) int {
	if len(argument) == 0 || len(argument) > 16 {
		return -1
	}
	for index := 0; index < len(publications); index++ {
		if strconv.FormatUint(publications[index].ID, 10) == argument {
			return index
		}
	}
	return -1
}

func setInputStep(state State, argument string) State {
	if !state.Parent.Alive {
		return state
	}
	step := 0
	switch argument {
	case "1":
		step = 1
	case "2":
		step = 2
	case "3":
		step = 3
	default:
		return state
	}
	if step == state.Input.Step {
		return state
	}
	if state.Input.Revision < maxSafeID {
		state.Input.Step = step
		state.Input.Revision++
	}
	return state
}

func toggleInputLock(state State) State {
	if !state.Parent.Alive {
		return state
	}
	if state.Input.Revision < maxSafeID {
		state.Input.Locked = !state.Input.Locked
		state.Input.Revision++
	}
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

func remountParent(state State) State {
	if state.Parent.Alive {
		return state
	}
	if state.NextGeneration < maxSafeID {
		state.NextGeneration++
		state.Parent = ParentState{Alive: true, Generation: state.NextGeneration}
		state.Children = make([]ChildState, 0)
		state.LastDecision = ""
	}
	return state
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
