// Command composition-replay executes typed composition actions and emits one
// complete state frame after each operation for browser/native comparison.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/samuelpmahan/gondola/collection"
	"github.com/samuelpmahan/gondola/composition"
	"github.com/samuelpmahan/gondola/httpwire"
	"github.com/samuelpmahan/gondola/multisession"
)

type replayFrame struct {
	Action replayAction     `json:"action"`
	Result any              `json:"result"`
	Frame  compositionFrame `json:"frame"`
}

type compositionFrame struct {
	Tree     []multisession.SessionInfo `json:"tree"`
	Sessions []sessionFrame             `json:"sessions"`
	Changes  []multisession.SessionID   `json:"changes"`
}

type sessionFrame struct {
	ID       multisession.SessionID `json:"id"`
	Snapshot composition.Snapshot   `json:"snapshot"`
}

type replayOutput struct {
	Frames []replayFrame `json:"frames"`
}

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	if len(args) > 1 {
		fmt.Fprintf(os.Stderr, "usage: %s [actions.json|-]\n", "composition-replay")
		return 2
	}
	var reader io.Reader = os.Stdin
	if len(args) == 1 && args[0] != "-" {
		file, err := os.Open(args[0])
		if err != nil {
			fmt.Fprintln(os.Stderr, "composition-replay:", err)
			return 2
		}
		defer file.Close()
		reader = file
	}
	encoded, err := io.ReadAll(reader)
	if err != nil {
		fmt.Fprintln(os.Stderr, "composition-replay: read input:", err)
		return 2
	}
	actions, err := decodeReplayInput(encoded)
	if err != nil {
		fmt.Fprintln(os.Stderr, "composition-replay: invalid input:", err)
		return 2
	}
	manager := composition.NewManager()
	frames := make([]replayFrame, 0, len(actions))
	for _, action := range actions {
		result := executeAction(manager, action)
		frame, err := captureFrame(manager)
		if err != nil {
			fmt.Fprintln(os.Stderr, "composition-replay: capture frame:", err)
			return 2
		}
		frames = append(frames, replayFrame{Action: action, Result: result, Frame: frame})
	}
	if err := json.NewEncoder(os.Stdout).Encode(replayOutput{Frames: frames}); err != nil {
		fmt.Fprintln(os.Stderr, "composition-replay: encode output:", err)
		return 2
	}
	return 0
}

func executeAction(manager *composition.Manager, action replayAction) any {
	fail := func(err error) any { return map[string]string{"error": err.Error()} }
	if err := exactActionArgs(action, expectedArity(action.Method)); err != nil {
		return fail(err)
	}
	args := action.Args
	decodeID := func(index int, name string) (multisession.SessionID, error) {
		return decodeSessionIDJSON(args[index], name)
	}
	decodeString := func(index int, name string) (string, error) {
		var value string
		if err := json.Unmarshal(args[index], &value); err != nil || !rawStartsWith(args[index], '"') {
			return "", fmt.Errorf("argument %d (%s) must be a string", index, name)
		}
		return value, nil
	}
	switch action.Method {
	case "create":
		id, err := manager.Create()
		if err != nil {
			return fail(err)
		}
		return id
	case "createChild":
		parent, err := decodeID(0, "parentID")
		if err != nil {
			return fail(err)
		}
		id, err := manager.CreateChild(parent)
		if err != nil {
			return fail(err)
		}
		return id
	case "tree":
		tree := manager.Tree()
		if tree == nil {
			tree = []multisession.SessionInfo{}
		}
		return tree
	case "list":
		ids := manager.List()
		if ids == nil {
			ids = []multisession.SessionID{}
		}
		return ids
	case "snapshot":
		id, err := decodeID(0, "sessionID")
		if err != nil {
			return fail(err)
		}
		snapshot, err := manager.Snapshot(id)
		if err != nil {
			return fail(err)
		}
		return snapshot
	case "dispatch":
		id, err := decodeID(0, "sessionID")
		if err != nil {
			return fail(err)
		}
		step, err := decodeStepJSON(string(args[1]))
		if err != nil {
			return fail(fmt.Errorf("invalid step: %w", err))
		}
		snapshot, err := manager.Dispatch(id, step)
		if err != nil {
			return fail(err)
		}
		return snapshot
	case "effects":
		id, err := decodeID(0, "sessionID")
		if err != nil {
			return fail(err)
		}
		commands, err := manager.Effects(id)
		if err != nil {
			return fail(err)
		}
		if commands == nil {
			commands = []collection.Command{}
		}
		return commands
	case "complete":
		id, err := decodeID(0, "sessionID")
		if err != nil {
			return fail(err)
		}
		reply, err := decodeReplyJSON(string(args[1]))
		if err != nil {
			return fail(fmt.Errorf("invalid reply: %w", err))
		}
		snapshot, err := manager.Complete(id, reply)
		if err != nil {
			return fail(err)
		}
		return snapshot
	case "audit":
		id, err := decodeID(0, "sessionID")
		if err != nil {
			return fail(err)
		}
		outcomes, err := manager.Audit(id)
		if err != nil {
			return fail(err)
		}
		if outcomes == nil {
			outcomes = []collection.Outcome{}
		}
		return outcomes
	case "dispose":
		id, err := decodeID(0, "sessionID")
		if err != nil {
			return fail(err)
		}
		commands, err := manager.Dispose(id)
		if err != nil {
			return fail(err)
		}
		if commands == nil {
			commands = []collection.Command{}
		}
		return commands
	case "disposeTree":
		id, err := decodeID(0, "sessionID")
		if err != nil {
			return fail(err)
		}
		disposals, err := manager.DisposeTree(id)
		if err != nil {
			return fail(err)
		}
		if disposals == nil {
			disposals = []multisession.Disposal{}
		}
		return disposals
	case "setChildInputs":
		parent, err := decodeID(0, "parentID")
		if err != nil {
			return fail(err)
		}
		child, err := decodeID(1, "childID")
		if err != nil {
			return fail(err)
		}
		inputs, err := decodeInputsJSON(string(args[2]))
		if err != nil {
			return fail(fmt.Errorf("invalid inputs: %w", err))
		}
		snapshot, err := manager.SetChildInputs(parent, child, inputs)
		if err != nil {
			return fail(err)
		}
		return snapshot
	case "publish":
		child, err := decodeID(0, "childID")
		if err != nil {
			return fail(err)
		}
		row, err := decodeRowIDJSON(args[1])
		if err != nil {
			return fail(err)
		}
		revision, err := decodeRevisionJSON(args[2])
		if err != nil {
			return fail(err)
		}
		publication, err := manager.Publish(child, row, revision)
		if err != nil {
			return fail(err)
		}
		return publication
	case "changes":
		ids := manager.Changes()
		if ids == nil {
			ids = []multisession.SessionID{}
		}
		return ids
	case "encodeHTTP":
		id, err := parsePositiveSafeUint(args[0], "requestID")
		if err != nil {
			return fail(err)
		}
		value, err := decodeString(1, "value")
		if err != nil {
			return fail(err)
		}
		body, err := httpwire.EncodeRequest(id, value)
		if err != nil {
			return fail(err)
		}
		return string(body)
	case "decodeHTTP":
		id, err := parsePositiveSafeUint(args[0], "requestID")
		if err != nil {
			return fail(err)
		}
		status, err := decodeStatusJSON(args[1])
		if err != nil {
			return fail(err)
		}
		body, err := decodeString(2, "body")
		if err != nil {
			return fail(err)
		}
		return httpwire.DecodeResponse(id, status, []byte(body))
	default:
		return fail(fmt.Errorf("unknown composition method %q", action.Method))
	}
}

func expectedArity(method string) int {
	switch method {
	case "create", "tree", "list", "changes":
		return 0
	case "createChild", "snapshot", "effects", "audit", "dispose", "disposeTree":
		return 1
	case "dispatch", "complete", "encodeHTTP":
		return 2
	case "setChildInputs":
		return 3
	case "publish", "decodeHTTP":
		return 3
	default:
		return -1
	}
}

func exactActionArgs(action replayAction, arity int) error {
	if arity < 0 {
		return fmt.Errorf("unknown composition method %q", action.Method)
	}
	if len(action.Args) != arity {
		return fmt.Errorf("%s requires exactly %d argument(s), got %d", action.Method, arity, len(action.Args))
	}
	return nil
}

func captureFrame(manager *composition.Manager) (compositionFrame, error) {
	tree := manager.Tree()
	if tree == nil {
		tree = []multisession.SessionInfo{}
	}
	ids := manager.List()
	if ids == nil {
		ids = []multisession.SessionID{}
	}
	sessions := make([]sessionFrame, 0, len(ids))
	for _, id := range ids {
		snapshot, err := manager.Snapshot(id)
		if err != nil {
			return compositionFrame{}, err
		}
		sessions = append(sessions, sessionFrame{ID: id, Snapshot: snapshot})
	}
	changes := manager.Changes()
	if changes == nil {
		changes = []multisession.SessionID{}
	}
	return compositionFrame{Tree: tree, Sessions: sessions, Changes: changes}, nil
}

func rawStartsWith(raw json.RawMessage, prefix byte) bool {
	for _, value := range raw {
		if value != ' ' && value != '\n' && value != '\r' && value != '\t' {
			return value == prefix
		}
	}
	return false
}
