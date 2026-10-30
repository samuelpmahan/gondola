// Package collection models an editable ordered collection of keyed rows.
// Row identity and asynchronous request identity are deliberately distinct.
package collection

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inputbinding"
)

// MaxID is the largest identifier that can cross the JavaScript number
// boundary without losing integer precision.
const MaxID uint64 = asyncsave.MaxID

const (
	maxRowID     RowID     = RowID(MaxID)
	maxRequestID RequestID = RequestID(MaxID)
)

// RowID identifies one logical row for its lifetime within a session.
type RowID uint64

// RequestID identifies one asynchronous save request.
type RequestID uint64

// RowLimit is the bounded keyed editor capacity used to preserve room for
// control requests while row-specific saves are pending.
type RowLimit int

// State is the complete collection domain state. NextID and NextRequestID are
// the largest allocated identities; both survive reset and are never reused.
type State struct {
	Rows          []Row
	NextID        RowID
	NextRequestID RequestID
}

// Row is one independently editable and saveable collection item.
type Row struct {
	ID        RowID
	Draft     string
	Saved     string
	Saves     int
	PendingID RequestID
	Status    string
}

// MaxRows bounds one session to four keyed rows.
const MaxRows RowLimit = 4

// Step is the browser-facing event descriptor. Key is checked against the
// current node at Path before disabled suppression or binding resolution.
type Step struct {
	Path  string
	Event string
	Value string
	Key   string
}

// Snapshot pairs domain state with the current tree, input bindings, and
// cumulative message history.
type Snapshot struct {
	State    State                  `json:"state"`
	Tree     gobi.Node              `json:"tree"`
	Bindings []inputbinding.Binding `json:"bindings"`
	Messages []gobi.Message         `json:"messages"`
}

// Command and Reply retain the existing asyncsave and HTTP effect wire types.
type Command = asyncsave.Command
type Reply = asyncsave.Reply

// Outcome records one valid completion delivery, including the original row
// identity even when that row has since been removed or reset.
type Outcome struct {
	ID       RequestID
	RowID    RowID
	Value    string
	Error    string
	Accepted bool
	Reason   string
}

// Session owns collection state, messages, pending effect commands, request
// history, and the completion audit.
type Session struct {
	state      State
	messages   []gobi.Message
	outbox     []asyncsave.Command
	requestRow map[RequestID]RowID
	audit      []Outcome
}

// NewSession creates a collection with no rows and zeroed monotonic counters.
func NewSession() *Session {
	return &Session{
		state:      State{Rows: []Row{}},
		messages:   []gobi.Message{},
		outbox:     []asyncsave.Command{},
		requestRow: map[RequestID]RowID{},
		audit:      []Outcome{},
	}
}

// View projects a state into the keyed Gobi tree and its controlled-input
// bindings. The projection is freshly allocated on every call.
func View(state State) inputbinding.View {
	bindings := make([]inputbinding.Binding, 0, len(state.Rows))
	rowNodes := make([]gobi.Node, len(state.Rows))
	for index, row := range state.Rows {
		rowNodes[index] = rowView(row, index)
		bindings = append(bindings, inputbinding.Binding{
			Path:    "2/" + strconv.Itoa(index) + "/0",
			Event:   "input",
			Message: "edit/" + strconv.FormatUint(uint64(row.ID), 10),
			Source:  inputbinding.TargetValue,
		})
	}

	add := button("add", "add", "Add row", "add", "", len(state.Rows) >= int(MaxRows))
	reset := button("reset", "reset", "Reset", "reset", "", len(state.Rows) == 0)
	rows := gobi.El("div").Keyed("rows").Set("class", "rows")
	if len(rowNodes) != 0 {
		rows.Kids = rowNodes
	}
	tree := gobi.El("div", add, reset, rows).Keyed("collection").Set("class", "collection")
	return inputbinding.View{Tree: tree, Bindings: bindings}
}

func rowView(row Row, index int) gobi.Node {
	id := strconv.FormatUint(uint64(row.ID), 10)
	input := gobi.El("input").Keyed("row-"+id+"-input").
		Set("type", "text").
		Set("value", row.Draft).
		Set("aria-label", "Row "+id)

	saved := gobi.El("p", gobi.Txt("Saved: "), gobi.Txt(row.Saved)).Keyed("row-" + id + "-saved")
	saves := gobi.El("p", gobi.Txt("Saves: "), gobi.Txt(strconv.Itoa(row.Saves))).Keyed("row-" + id + "-saves")
	status := gobi.El("p", gobi.Txt("Status: "+row.Status)).Keyed("row-" + id + "-status")
	pending := gobi.El("p", gobi.Txt("Pending: "+strconv.FormatUint(uint64(row.PendingID), 10))).Keyed("row-" + id + "-pending")

	children := []gobi.Node{
		input,
		saved,
		saves,
		status,
		pending,
		button("row-"+id+"-save", "save", "Save", "save", id, row.Draft == ""),
		button("row-"+id+"-remove", "remove", "Remove", "remove", id, false),
		button("row-"+id+"-up", "up", "Up", "up", id, index == 0),
		button("row-"+id+"-cancel", "cancel", "Cancel", "cancel", id, row.PendingID == 0),
	}
	return gobi.El("div", children...).Keyed("row-"+id).Set("class", "row")
}

func button(key, class, label, message, arg string, disabled bool) gobi.Node {
	node := gobi.El("button", gobi.Txt(label)).Keyed(key).
		Set("class", class).
		Handle("click", message, arg)
	if disabled {
		node = node.Flag("disabled")
	}
	return node
}

// Snapshot returns a new tree and copies every mutable slice held by the
// session. Mutating the returned value cannot alter future snapshots.
func (s *Session) Snapshot() Snapshot {
	state := cloneState(s.state)
	view := View(state)
	messages := make([]gobi.Message, len(s.messages))
	copy(messages, s.messages)
	return Snapshot{State: state, Tree: view.Tree, Bindings: view.Bindings, Messages: messages}
}

// Dispatch validates current path/key identity, resolves the declared input
// binding or literal handler, then commits one state transition atomically.
func (s *Session) Dispatch(step Step) (Snapshot, error) {
	view := View(s.state)
	if err := validateView(view); err != nil {
		return s.Snapshot(), fmt.Errorf("invalid collection view: %w", err)
	}
	target, err := nodeAtPath(view.Tree, step.Path)
	if err != nil {
		return s.Snapshot(), err
	}
	if target.Key != step.Key {
		return s.Snapshot(), fmt.Errorf("stale node key %q at path %q; current key is %q", step.Key, step.Path, target.Key)
	}
	if isDisabled(target) {
		return s.Snapshot(), nil
	}

	message, err := inputbinding.Resolve(view, gobi.Step{Path: step.Path, Event: step.Event, Value: step.Value})
	if err != nil {
		return s.Snapshot(), err
	}
	next, commands, started, err := transition(s.state, message)
	if err != nil {
		return s.Snapshot(), err
	}

	// All validation, message resolution, and allocation checks are complete.
	s.state = next
	s.messages = append(s.messages, message)
	s.outbox = append(s.outbox, commands...)
	if started != nil {
		s.requestRow[started.request] = started.row
	}
	return s.Snapshot(), nil
}

type startedRequest struct {
	request RequestID
	row     RowID
}

func transition(state State, message gobi.Message) (State, []asyncsave.Command, *startedRequest, error) {
	next := cloneState(state)
	commands := []asyncsave.Command{}
	var started *startedRequest
	switch message.Name {
	case "add":
		if message.Arg != "" {
			return state, nil, nil, fmt.Errorf("add message must have an empty argument")
		}
		if len(next.Rows) >= int(MaxRows) {
			return state, nil, nil, fmt.Errorf("collection is at its %d-row limit", MaxRows)
		}
		if next.NextID >= maxRowID {
			return state, nil, nil, fmt.Errorf("row ID space exhausted at %d", next.NextID)
		}
		next.NextID++
		next.Rows = append(next.Rows, Row{ID: next.NextID, Status: "idle"})
	case "reset":
		if message.Arg != "" {
			return state, nil, nil, fmt.Errorf("reset message must have an empty argument")
		}
		for _, row := range next.Rows {
			if row.PendingID != 0 {
				commands = append(commands, asyncsave.Command{Kind: "cancel", ID: uint64(row.PendingID)})
			}
		}
		next.Rows = []Row{}
	case "save", "cancel", "remove", "up":
		rowID, err := parseRowID(message.Arg)
		if err != nil {
			return state, nil, nil, err
		}
		index := rowIndex(next.Rows, rowID)
		if index < 0 {
			return state, nil, nil, fmt.Errorf("row %d no longer exists", rowID)
		}
		row := &next.Rows[index]
		switch message.Name {
		case "save":
			if row.Draft == "" {
				return state, nil, nil, fmt.Errorf("cannot save an empty draft")
			}
			if next.NextRequestID >= maxRequestID {
				return state, nil, nil, fmt.Errorf("request ID space exhausted at %d", next.NextRequestID)
			}
			if row.PendingID != 0 {
				commands = append(commands, asyncsave.Command{Kind: "cancel", ID: uint64(row.PendingID)})
			}
			next.NextRequestID++
			row.PendingID = next.NextRequestID
			row.Status = "pending"
			commands = append(commands, asyncsave.Command{Kind: "start", ID: uint64(row.PendingID), Value: row.Draft})
			started = &startedRequest{request: row.PendingID, row: row.ID}
		case "cancel":
			if row.PendingID == 0 {
				return state, nil, nil, fmt.Errorf("row %d has no pending request", rowID)
			}
			commands = append(commands, asyncsave.Command{Kind: "cancel", ID: uint64(row.PendingID)})
			row.PendingID = 0
			row.Status = "cancelled"
		case "remove":
			if row.PendingID != 0 {
				commands = append(commands, asyncsave.Command{Kind: "cancel", ID: uint64(row.PendingID)})
			}
			next.Rows = append(next.Rows[:index], next.Rows[index+1:]...)
			if next.Rows == nil {
				next.Rows = []Row{}
			}
		case "up":
			if index == 0 {
				return state, nil, nil, fmt.Errorf("row %d is already first", rowID)
			}
			next.Rows[index], next.Rows[index-1] = next.Rows[index-1], next.Rows[index]
		}
	default:
		if strings.HasPrefix(message.Name, "edit/") {
			rowID, err := parseRowID(strings.TrimPrefix(message.Name, "edit/"))
			if err != nil {
				return state, nil, nil, err
			}
			index := rowIndex(next.Rows, rowID)
			if index < 0 {
				return state, nil, nil, fmt.Errorf("row %d no longer exists", rowID)
			}
			next.Rows[index].Draft = message.Arg
		} else {
			return state, nil, nil, fmt.Errorf("unsupported collection message %q", message.Name)
		}
	}
	return next, commands, started, nil
}

// Complete records a valid completion, accepting it only when its request
// still belongs to an existing row that has that request pending.
func (s *Session) Complete(reply asyncsave.Reply) (Snapshot, error) {
	if reply.ID == 0 || reply.ID > MaxID {
		return s.Snapshot(), fmt.Errorf("reply ID %d is outside the supported range 1..%d", reply.ID, MaxID)
	}

	requestID := RequestID(reply.ID)
	rowID := s.requestRow[requestID]
	outcome := Outcome{ID: requestID, RowID: rowID, Value: reply.Value, Error: reply.Error}
	next := cloneState(s.state)
	index := -1
	if rowID != 0 {
		index = rowIndex(next.Rows, rowID)
	}
	if index < 0 || next.Rows[index].PendingID != requestID {
		outcome.Reason = "stale"
	} else {
		row := &next.Rows[index]
		row.PendingID = 0
		outcome.Accepted = true
		if reply.Error != "" {
			row.Status = "error: " + reply.Error
			outcome.Reason = "error"
		} else {
			row.Saved = reply.Value
			row.Saves++
			row.Status = "saved"
			outcome.Reason = "saved"
		}
	}

	s.state = next
	s.messages = append(s.messages, gobi.Message{Name: "reply", Arg: strconv.FormatUint(reply.ID, 10)})
	s.audit = append(s.audit, outcome)
	return s.Snapshot(), nil
}

// Effects returns a copy of queued commands, then empties the outbox.
func (s *Session) Effects() []asyncsave.Command {
	effects := make([]asyncsave.Command, len(s.outbox))
	copy(effects, s.outbox)
	s.outbox = []asyncsave.Command{}
	return effects
}

// Audit returns a copy of completion outcomes in delivery order.
func (s *Session) Audit() []Outcome {
	results := make([]Outcome, len(s.audit))
	copy(results, s.audit)
	return results
}

func cloneState(state State) State {
	rows := make([]Row, len(state.Rows))
	copy(rows, state.Rows)
	state.Rows = rows
	return state
}

func rowIndex(rows []Row, id RowID) int {
	for index, row := range rows {
		if row.ID == id {
			return index
		}
	}
	return -1
}

func parseRowID(value string) (RowID, error) {
	if value == "" {
		return 0, fmt.Errorf("row ID is empty")
	}
	id, err := strconv.ParseUint(value, 10, 64)
	if err != nil || id == 0 || id > MaxID || strconv.FormatUint(id, 10) != value {
		return 0, fmt.Errorf("row ID %q is not a positive safe decimal identifier", value)
	}
	return RowID(id), nil
}

func validateView(view inputbinding.View) error {
	if err := inputbinding.Validate(view); err != nil {
		return err
	}
	seen := map[string]struct{}{}
	return validateKeys(view.Tree, seen)
}

func validateKeys(node gobi.Node, seen map[string]struct{}) error {
	switch node.Kind {
	case gobi.Element:
		if !validKey(node.Key) {
			return fmt.Errorf("element key %q is not a valid nonempty ASCII token", node.Key)
		}
		if _, exists := seen[node.Key]; exists {
			return fmt.Errorf("duplicate element key %q", node.Key)
		}
		seen[node.Key] = struct{}{}
	case gobi.Text:
		if node.Key != "" {
			return fmt.Errorf("text nodes must have empty keys, got %q", node.Key)
		}
	case gobi.Fragment:
		if node.Key != "" {
			return fmt.Errorf("fragments must have empty keys, got %q", node.Key)
		}
	default:
		return fmt.Errorf("unknown Gobi node kind %d", node.Kind)
	}
	for _, child := range node.Kids {
		if err := validateKeys(child, seen); err != nil {
			return err
		}
	}
	return nil
}

func validKey(value string) bool {
	if len(value) == 0 || len(value) > 64 || !asciiLetter(value[0]) {
		return false
	}
	for index := 1; index < len(value); index++ {
		character := value[index]
		if !asciiLetter(character) && (character < '0' || character > '9') && character != '-' {
			return false
		}
	}
	return true
}

func asciiLetter(character byte) bool {
	return character >= 'A' && character <= 'Z' || character >= 'a' && character <= 'z'
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
