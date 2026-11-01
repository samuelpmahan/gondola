// Package effectmodulechild wraps the existing counter child with a closed,
// Go-owned request/cancel/reply lifecycle for one keyed mount generation.
package effectmodulechild

import (
	"strconv"

	"github.com/samuelpmahan/gondola/fixtures/compiled/modulechild"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	"github.com/samuelpmahan/gondola/gobi"
)

const maxSafeID uint64 = 9007199254740991

// State is one independently mounted keyed child. RequestID is local to this
// key/generation; including both in Token fences replies across remounts.
type State struct {
	Core       modulechild.State
	Key        string
	Generation uint64
	Mounted    bool
	RequestID  uint64
	Pending    bool
	Token      string
	Reply      string
}

// Init creates a fresh unmounted wrapper around the existing child Core.
func Init() State {
	return State{Core: modulechild.Init()}
}

// Update owns mount identity, request IDs, pending/reply state, and lifecycle
// effects. Counter messages continue through the established modulechild.Core.
func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	switch message.Name {
	case "mount":
		if state.Mounted || state.Key != "" || state.Generation != 0 || state.RequestID != 0 || state.Pending || state.Token != "" || state.Reply != "" {
			break
		}
		key, generation, ok := parseMountArg(message.Arg)
		if !ok {
			break
		}
		state.Key = key
		state.Generation = generation
		state.Mounted = true
	case "unmount":
		key, generation, ok := parseMountArg(message.Arg)
		if !ok || !isCurrentMount(state, key, generation) {
			break
		}
		// Retire Go state before returning cancellation to the host.
		state.Mounted = false
		if state.Pending && validStoredToken(state) {
			token := state.Token
			state.Pending = false
			return state, []gobi.Effect{cancelEffect(token)}
		}
		state.Pending = false
	case "add", "reset":
		if message.Arg == "" && validMountedState(state) {
			state.Core, _ = modulechild.Update(state.Core, message)
		}
	case "request":
		if message.Arg == "" && validMountedState(state) && !state.Pending && state.RequestID < maxSafeID {
			state.RequestID++
			state.Pending = true
			state.Token = tokenFor(state.Key, state.Generation, state.RequestID)
			state.Reply = ""
			return state, []gobi.Effect{requestEffect(state.Token)}
		}
	case "cancel":
		if message.Arg == "" && validMountedState(state) && state.Pending && validStoredToken(state) {
			token := state.Token
			state.Pending = false
			return state, []gobi.Effect{cancelEffect(token)}
		}
	case "complete":
		if !validMountedState(state) || !state.Pending || !validStoredToken(state) || message.Arg != state.Token {
			break
		}
		state.Pending = false
		state.Reply = message.Arg
	}
	return state, []gobi.Effect{}
}

// Input preserves the standard typed child input role and its old revision
// guards while keeping inactive keyed generations inert.
func Input(state State, input modulewire.Input) State {
	if !validMountedState(state) {
		return state
	}
	state.Core = modulechild.Input(state.Core, input)
	return state
}

// Publication preserves the standard typed module publication role.
func Publication(state State) modulewire.Publication {
	return modulechild.Publication(state.Core)
}

func parseMountArg(arg string) (string, uint64, bool) {
	if len(arg) < 4 || arg[1:3] != ":g" || !validKey(arg[:1]) {
		return "", 0, false
	}
	generation, ok := parseSafePositive(arg[3:])
	if !ok {
		return "", 0, false
	}
	return arg[:1], generation, true
}

func parseSafePositive(value string) (uint64, bool) {
	if value == "" || len(value) > 1 && value[0] == '0' {
		return 0, false
	}
	// A 53-bit parse is bounded by JavaScript's largest exact integer. The
	// round-trip keeps mount generations in the canonical decimal spelling.
	parsed, err := strconv.ParseUint(value, 10, 53)
	if err != nil || parsed == 0 || parsed > maxSafeID || strconv.FormatUint(parsed, 10) != value {
		return 0, false
	}
	return parsed, true
}

func validKey(key string) bool { return key == "a" || key == "b" }

func validMountedState(state State) bool {
	return state.Mounted && validKey(state.Key) && state.Generation > 0 && state.Generation <= maxSafeID
}

func isCurrentMount(state State, key string, generation uint64) bool {
	return validMountedState(state) && state.Key == key && state.Generation == generation
}

func validStoredToken(state State) bool {
	return validKey(state.Key) && state.Generation > 0 && state.Generation <= maxSafeID &&
		state.RequestID > 0 && state.RequestID <= maxSafeID &&
		state.Token == tokenFor(state.Key, state.Generation, state.RequestID)
}

func tokenFor(key string, generation, requestID uint64) string {
	return key + ":g" + strconv.FormatUint(generation, 10) + ":r" + strconv.FormatUint(requestID, 10)
}

func requestEffect(token string) gobi.Effect {
	return gobi.Effect{Kind: "fixture.request", Name: "save", Arg: token, Reply: "complete"}
}

func cancelEffect(token string) gobi.Effect {
	return gobi.Effect{Kind: "lifecycle.cancel", Name: "cancel", Arg: token, Reply: ""}
}
