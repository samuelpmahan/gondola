// Package interaction connects a Gobi tree to the component's update function.
package interaction

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/gobi"
)

// Snapshot is the serializable state and view after a user interaction.
// The lowercase top-level names are part of the wasm runtime's public API.
type Snapshot struct {
	State    counter.State  `json:"state"`
	Tree     gobi.Node      `json:"tree"`
	Messages []gobi.Message `json:"messages"`
}

// Session owns one counter state and the messages delivered to it.
type Session struct {
	state    counter.State
	messages []gobi.Message
}

// New initializes a fresh component session.
func New() *Session {
	return &Session{state: counter.Init(), messages: []gobi.Message{}}
}

// Snapshot returns the current state, a newly rendered tree, and a copy of
// the messages delivered so far. Messages is always a non-nil slice.
func (s *Session) Snapshot() Snapshot {
	messages := make([]gobi.Message, len(s.messages))
	copy(messages, s.messages)
	return Snapshot{State: s.state, Tree: counter.View(s.state), Messages: messages}
}

// Dispatch sends the event declared on the node at step.Path to Update.
// Paths are child indexes separated by slashes; the empty path names the root.
// A disabled target ignores the event, as a disabled DOM control would.
func (s *Session) Dispatch(step gobi.Step) (Snapshot, error) {
	tree := counter.View(s.state)
	target, err := nodeAtPath(tree, step.Path)
	if err != nil {
		return s.Snapshot(), err
	}
	if isDisabled(target) {
		return s.Snapshot(), nil
	}

	var handler *gobi.On
	for i := range target.On {
		if target.On[i].Event == step.Event {
			handler = &target.On[i]
			break
		}
	}
	if handler == nil {
		return s.Snapshot(), fmt.Errorf("no %q handler at path %q", step.Event, step.Path)
	}

	message := gobi.Message{Name: handler.Message, Arg: handler.Arg}
	nextState, effects := counter.Update(s.state, message)
	if len(effects) != 0 {
		return s.Snapshot(), fmt.Errorf("dispatch produced %d unsupported effect(s)", len(effects))
	}
	s.state = nextState
	s.messages = append(s.messages, message)
	return s.Snapshot(), nil
}

func nodeAtPath(root gobi.Node, path string) (gobi.Node, error) {
	if path == "" {
		return root, nil
	}
	current := root
	for _, part := range strings.Split(path, "/") {
		if part == "" {
			return gobi.Node{}, fmt.Errorf("invalid child path %q", path)
		}
		index, err := strconv.Atoi(part)
		if err != nil || index < 0 || strconv.Itoa(index) != part {
			return gobi.Node{}, fmt.Errorf("invalid child index %q in path %q", part, path)
		}
		if index >= len(current.Kids) {
			return gobi.Node{}, fmt.Errorf("child index %d out of range in path %q", index, path)
		}
		current = current.Kids[index]
	}
	return current, nil
}

func isDisabled(node gobi.Node) bool {
	for _, attr := range node.Attrs {
		if attr.Name == "disabled" && attr.Flag {
			return true
		}
	}
	return false
}
