// Package lifecycle is a finite Go-owned lifecycle fixture. The fixed value
// slots make parent, child, grandchild, and independent sibling ownership
// explicit without claiming compilation of a pointer-based Manager.
package lifecycle

import (
	"strconv"

	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/gobi"
)

const maxSafeID uint64 = 9007199254740991

// NodeState is one value-owned slot in the fixture's finite tree.
type NodeState struct {
	ID         string
	ParentID   string
	Generation uint64
	RequestID  uint64
	Alive      bool
	Requested  bool
	Pending    bool
	Token      string
	Reply      string
	Counter    counter.State
}

// State is the entire finite topology. Sibling is a separate root so that
// removing Parent proves an unrelated branch's pending request survives.
type State struct {
	Parent        NodeState
	Child         NodeState
	Grandchild    NodeState
	Sibling       NodeState
	NextRequestID uint64
}

func Init() State {
	return State{
		Parent:     NodeState{ID: "parent", ParentID: "", Generation: 1, Alive: true, Counter: counter.Init()},
		Child:      NodeState{ID: "child", ParentID: "parent", Generation: 1, Alive: true, Counter: counter.Init()},
		Grandchild: NodeState{ID: "grandchild", ParentID: "child", Generation: 1, Alive: true, Counter: counter.Init()},
		Sibling:    NodeState{ID: "sibling", ParentID: "", Generation: 1, Alive: true, Counter: counter.Init()},
	}
}

func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	switch message.Name {
	case "addParent":
		if state.Parent.Alive {
			state.Parent.Counter, _ = counter.Update(state.Parent.Counter, gobi.Message{Name: "add"})
		}
	case "addChild":
		if state.Child.Alive {
			state.Child.Counter, _ = counter.Update(state.Child.Counter, gobi.Message{Name: "add"})
		}
	case "addGrandchild":
		if state.Grandchild.Alive {
			state.Grandchild.Counter, _ = counter.Update(state.Grandchild.Counter, gobi.Message{Name: "add"})
		}
	case "addSibling":
		if state.Sibling.Alive {
			state.Sibling.Counter, _ = counter.Update(state.Sibling.Counter, gobi.Message{Name: "add"})
		}
	case "requestParent":
		return requestParent(state)
	case "requestChild":
		return requestChild(state)
	case "requestGrandchild":
		return requestGrandchild(state)
	case "requestSibling":
		return requestSibling(state)
	case "removeParent":
		return removeParent(state)
	case "remountParent":
		return remountParent(state)
	case "complete":
		return complete(state, message.Arg)
	}
	return state, []gobi.Effect{}
}

func requestParent(state State) (State, []gobi.Effect) {
	if !state.Parent.Alive || state.Parent.Requested {
		return state, []gobi.Effect{}
	}
	if state.NextRequestID < maxSafeID {
		state.NextRequestID++
		state.Parent.Requested = true
		state.Parent.Pending = true
		state.Parent.RequestID = state.NextRequestID
		state.Parent.Token = tokenFor("parent", state.Parent.Generation, state.Parent.RequestID)
		return state, []gobi.Effect{requestEffect(state.Parent.Token)}
	}
	return state, []gobi.Effect{}
}

func requestChild(state State) (State, []gobi.Effect) {
	if !state.Child.Alive || state.Child.Requested {
		return state, []gobi.Effect{}
	}
	if state.NextRequestID < maxSafeID {
		state.NextRequestID++
		state.Child.Requested = true
		state.Child.Pending = true
		state.Child.RequestID = state.NextRequestID
		state.Child.Token = tokenFor("child", state.Child.Generation, state.Child.RequestID)
		return state, []gobi.Effect{requestEffect(state.Child.Token)}
	}
	return state, []gobi.Effect{}
}

func requestGrandchild(state State) (State, []gobi.Effect) {
	if !state.Grandchild.Alive || state.Grandchild.Requested {
		return state, []gobi.Effect{}
	}
	if state.NextRequestID < maxSafeID {
		state.NextRequestID++
		state.Grandchild.Requested = true
		state.Grandchild.Pending = true
		state.Grandchild.RequestID = state.NextRequestID
		state.Grandchild.Token = tokenFor("grandchild", state.Grandchild.Generation, state.Grandchild.RequestID)
		return state, []gobi.Effect{requestEffect(state.Grandchild.Token)}
	}
	return state, []gobi.Effect{}
}

func requestSibling(state State) (State, []gobi.Effect) {
	if !state.Sibling.Alive || state.Sibling.Requested {
		return state, []gobi.Effect{}
	}
	if state.NextRequestID < maxSafeID {
		state.NextRequestID++
		state.Sibling.Requested = true
		state.Sibling.Pending = true
		state.Sibling.RequestID = state.NextRequestID
		state.Sibling.Token = tokenFor("sibling", state.Sibling.Generation, state.Sibling.RequestID)
		return state, []gobi.Effect{requestEffect(state.Sibling.Token)}
	}
	return state, []gobi.Effect{}
}

func removeParent(state State) (State, []gobi.Effect) {
	if !state.Parent.Alive {
		return state, []gobi.Effect{}
	}
	effects := []gobi.Effect{}
	if state.Grandchild.Pending {
		effects = append(effects, cancelEffect(state.Grandchild.Token))
	}
	if state.Child.Pending {
		effects = append(effects, cancelEffect(state.Child.Token))
	}
	if state.Parent.Pending {
		effects = append(effects, cancelEffect(state.Parent.Token))
	}
	state.Grandchild.Alive = false
	state.Grandchild.Pending = false
	state.Grandchild.Token = ""
	state.Child.Alive = false
	state.Child.Pending = false
	state.Child.Token = ""
	state.Parent.Alive = false
	state.Parent.Pending = false
	state.Parent.Token = ""
	return state, effects
}

func remountParent(state State) (State, []gobi.Effect) {
	if state.Parent.Alive {
		return state, []gobi.Effect{}
	}
	if state.Parent.Generation >= maxSafeID || state.Child.Generation >= maxSafeID || state.Grandchild.Generation >= maxSafeID {
		return state, []gobi.Effect{}
	}
	if state.Parent.Generation < maxSafeID {
		state.Parent.Generation++
	}
	if state.Child.Generation < maxSafeID {
		state.Child.Generation++
	}
	if state.Grandchild.Generation < maxSafeID {
		state.Grandchild.Generation++
	}
	state.Parent.Alive = true
	state.Parent.Requested = false
	state.Parent.Pending = false
	state.Parent.RequestID = 0
	state.Parent.Token = ""
	state.Parent.Reply = ""
	state.Parent.Counter = counter.Init()
	state.Child.Alive = true
	state.Child.Requested = false
	state.Child.Pending = false
	state.Child.RequestID = 0
	state.Child.Token = ""
	state.Child.Reply = ""
	state.Child.Counter = counter.Init()
	state.Grandchild.Alive = true
	state.Grandchild.Requested = false
	state.Grandchild.Pending = false
	state.Grandchild.RequestID = 0
	state.Grandchild.Token = ""
	state.Grandchild.Reply = ""
	state.Grandchild.Counter = counter.Init()
	return state, []gobi.Effect{}
}

func complete(state State, token string) (State, []gobi.Effect) {
	if state.Parent.Alive && state.Parent.Pending && state.Parent.Token == token {
		state.Parent.Pending = false
		state.Parent.Reply = token
	} else if state.Child.Alive && state.Child.Pending && state.Child.Token == token {
		state.Child.Pending = false
		state.Child.Reply = token
	} else if state.Grandchild.Alive && state.Grandchild.Pending && state.Grandchild.Token == token {
		state.Grandchild.Pending = false
		state.Grandchild.Reply = token
	} else if state.Sibling.Alive && state.Sibling.Pending && state.Sibling.Token == token {
		state.Sibling.Pending = false
		state.Sibling.Reply = token
	}
	return state, []gobi.Effect{}
}

func tokenFor(scope string, generation, requestID uint64) string {
	return scope + ":g" + strconv.FormatUint(generation, 10) + ":r" + strconv.FormatUint(requestID, 10)
}

func requestEffect(token string) gobi.Effect {
	return gobi.Effect{Kind: "fixture.request", Name: "lookup", Arg: token, Reply: "complete"}
}

func cancelEffect(token string) gobi.Effect {
	return gobi.Effect{Kind: "lifecycle.cancel", Name: "cancel", Arg: token, Reply: ""}
}
