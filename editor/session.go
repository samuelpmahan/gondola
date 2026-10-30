package editor

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inputbinding"
)

// Snapshot is the current application state, rendered tree, binding sidecar,
// and cumulative ordered message history.
type Snapshot struct {
	State    State                  `json:"state"`
	Tree     gobi.Node              `json:"tree"`
	Bindings []inputbinding.Binding `json:"bindings"`
	Messages []gobi.Message         `json:"messages"`
}

// Session owns one editor state and its delivered message history.
type Session struct {
	state    State
	messages []gobi.Message
}

// NewSession initializes an empty editor session.
func NewSession() *Session {
	return &Session{state: Init(), messages: []gobi.Message{}}
}

// Snapshot returns the current state, fresh view, and a copy of message history.
func (s *Session) Snapshot() Snapshot {
	view := View(s.state)
	messages := make([]gobi.Message, len(s.messages))
	copy(messages, s.messages)
	return Snapshot{State: s.state, Tree: view.Tree, Bindings: view.Bindings, Messages: messages}
}

// Dispatch sends the event declared at step.Path through the binding resolver.
// Disabled targets ignore events. Errors leave both state and history unchanged.
func (s *Session) Dispatch(step gobi.Step) (Snapshot, error) {
	view := View(s.state)
	if err := inputbinding.Validate(view); err != nil {
		return s.Snapshot(), fmt.Errorf("invalid editor view: %w", err)
	}
	target, err := nodeAtPath(view.Tree, step.Path)
	if err != nil {
		return s.Snapshot(), err
	}
	if isDisabled(target) {
		return s.Snapshot(), nil
	}

	message, err := inputbinding.Resolve(view, step)
	if err != nil {
		return s.Snapshot(), err
	}
	nextState, effects := Update(s.state, message)
	if len(effects) != 0 {
		return s.Snapshot(), fmt.Errorf("editor dispatch produced %d unsupported effect(s)", len(effects))
	}

	// Commit only after every validation and update check succeeds.
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
