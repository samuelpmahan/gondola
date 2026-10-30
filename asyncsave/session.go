// Package asyncsave models a controlled text editor whose save work is handed
// to an explicit asynchronous effect host.
package asyncsave

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/editor"
	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inputbinding"
)

// MaxID is the largest request identifier that can be represented exactly by
// a JavaScript number.
const MaxID uint64 = 9007199254740991

// State combines the existing editor state with asynchronous request state.
// Embedding keeps Draft, Saved, and Saves flattened in JSON snapshots.
type State struct {
	editor.State
	NextID    uint64
	PendingID uint64
	Status    string
}

// Reply is one delivered completion. A non-empty Error marks failure;
// otherwise Value is saved exactly as supplied.
type Reply struct {
	ID    uint64
	Value string
	Error string
}

// Command describes asynchronous work for the effect host. Commands carry
// values only; the Go application never performs transport or networking.
type Command struct {
	Kind  string
	ID    uint64
	Value string
}

// Outcome is a durable record of one valid delivered completion.
type Outcome struct {
	ID       uint64
	Value    string
	Error    string
	Accepted bool
	Reason   string
}

// Snapshot is the current state, rendered tree, input bindings, and ordered
// message history. Its JSON envelope matches editor.Snapshot.
type Snapshot struct {
	State    State                  `json:"state"`
	Tree     gobi.Node              `json:"tree"`
	Bindings []inputbinding.Binding `json:"bindings"`
	Messages []gobi.Message         `json:"messages"`
}

// Session owns one application state, message history, pending effect outbox,
// and cumulative completion audit.
type Session struct {
	state    State
	messages []gobi.Message
	outbox   []Command
	audit    []Outcome
}

// Init constructs the application's initial idle state.
func Init() State { return State{State: editor.Init(), Status: "idle"} }

// NewSession returns a fresh idle session.
func NewSession() *Session {
	return &Session{
		state:    Init(),
		messages: []gobi.Message{},
		outbox:   []Command{},
		audit:    []Outcome{},
	}
}

// Update applies one resolved application message and returns its next state
// plus explicit asynchronous commands. It is pure: an error returns the input
// state and no commands.
func Update(state State, message gobi.Message) (State, []Command, error) {
	next := state
	var commands []Command
	switch message.Name {
	case "edit":
		next.Draft = message.Arg
	case "save":
		if next.Draft == "" {
			return state, nil, nil
		}
		if next.NextID >= MaxID {
			return state, nil, fmt.Errorf("request ID space exhausted at %d", next.NextID)
		}
		if next.PendingID != 0 {
			commands = append(commands, Command{Kind: "cancel", ID: next.PendingID})
		}
		next.NextID++
		next.PendingID = next.NextID
		next.Status = "pending"
		commands = append(commands, Command{Kind: "start", ID: next.PendingID, Value: next.Draft})
	case "cancel":
		if next.PendingID == 0 {
			return state, nil, nil
		}
		commands = append(commands, Command{Kind: "cancel", ID: next.PendingID})
		next.PendingID = 0
		next.Status = "cancelled"
	case "reset":
		if next.PendingID != 0 {
			commands = append(commands, Command{Kind: "cancel", ID: next.PendingID})
		}
		next.State = editor.Init()
		next.PendingID = 0
		next.Status = "idle"
	default:
		return state, nil, fmt.Errorf("unsupported async save message %q", message.Name)
	}
	if commands == nil {
		commands = []Command{}
	}
	return next, commands, nil
}

// View extends the stable editor view with Cancel, status, and request ID
// output while retaining the editor's first five children and input binding.
func View(state State) inputbinding.View {
	view := editor.View(state.State)
	// editor.View bases Reset solely on editor fields. Async work also makes
	// Reset meaningful, including a cancelled or failed request after the user
	// has cleared every editor field. The request counter by itself is not work.
	resetEnabled := state.State != (editor.State{}) || state.PendingID != 0 || state.Status != "idle"
	if resetEnabled {
		reset := view.Tree.Kids[4]
		attrs := make([]gobi.Attr, 0, len(reset.Attrs))
		for _, attr := range reset.Attrs {
			if attr.Name != "disabled" {
				attrs = append(attrs, attr)
			}
		}
		reset.Attrs = attrs
		view.Tree.Kids[4] = reset
	}
	kids := append(view.Tree.Kids[:len(view.Tree.Kids):len(view.Tree.Kids)],
		cancelButton(state.PendingID),
		gobi.El("p", gobi.Txt("Status: "+state.Status)),
		gobi.El("p", gobi.Txt("Pending: "+strconv.FormatUint(state.PendingID, 10))),
	)
	view.Tree.Kids = kids
	return view
}

func cancelButton(pendingID uint64) gobi.Node {
	button := gobi.El("button", gobi.Txt("Cancel")).
		Set("class", "cancel").
		Handle("click", "cancel", "")
	if pendingID == 0 {
		button = button.Flag("disabled")
	}
	return button
}

// Snapshot returns a fresh view and copies cumulative message history.
func (s *Session) Snapshot() Snapshot {
	view := View(s.state)
	messages := make([]gobi.Message, len(s.messages))
	copy(messages, s.messages)
	return Snapshot{State: s.state, Tree: view.Tree, Bindings: view.Bindings, Messages: messages}
}

// Dispatch applies a bound editor event or literal action. State, messages,
// and effects are changed only after all path, binding, and allocation checks
// have succeeded.
func (s *Session) Dispatch(step gobi.Step) (Snapshot, error) {
	view := View(s.state)
	if err := inputbinding.Validate(view); err != nil {
		return s.Snapshot(), fmt.Errorf("invalid async save view: %w", err)
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

	next, newEffects, err := Update(s.state, message)
	if err != nil {
		return s.Snapshot(), err
	}

	s.state = next
	s.messages = append(s.messages, message)
	s.outbox = append(s.outbox, newEffects...)
	return s.Snapshot(), nil
}

// Complete records every valid completion delivery. Only the currently
// pending ID can change application state; duplicate, cancelled, reset, and
// out-of-order replies are retained as stale messages and audit outcomes.
func (s *Session) Complete(reply Reply) (Snapshot, error) {
	if reply.ID == 0 || reply.ID > MaxID {
		return s.Snapshot(), fmt.Errorf("reply ID %d is outside the supported range 1..%d", reply.ID, MaxID)
	}

	s.messages = append(s.messages, gobi.Message{Name: "reply", Arg: strconv.FormatUint(reply.ID, 10)})
	outcome := Outcome{ID: reply.ID, Value: reply.Value, Error: reply.Error}
	if reply.ID != s.state.PendingID || s.state.PendingID == 0 {
		outcome.Reason = "stale"
		s.audit = append(s.audit, outcome)
		return s.Snapshot(), nil
	}

	next := s.state
	next.PendingID = 0
	outcome.Accepted = true
	if reply.Error != "" {
		next.Status = "error: " + reply.Error
		outcome.Reason = "error"
	} else {
		next.Saved = reply.Value
		next.Saves++
		next.Status = "saved"
		outcome.Reason = "saved"
	}
	s.state = next
	s.audit = append(s.audit, outcome)
	return s.Snapshot(), nil
}

// Effects returns and clears all currently queued commands.
func (s *Session) Effects() []Command {
	effects := make([]Command, len(s.outbox))
	copy(effects, s.outbox)
	s.outbox = []Command{}
	return effects
}

// Audit returns a copy of all valid completion outcomes in delivery order.
func (s *Session) Audit() []Outcome {
	results := make([]Outcome, len(s.audit))
	copy(results, s.audit)
	return results
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
