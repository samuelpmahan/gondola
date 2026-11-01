package effectmodulechild

import (
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	"github.com/samuelpmahan/gondola/gobi"
)

func TestMountIsSingleGenerationAndUsesCanonicalSafeTuple(t *testing.T) {
	state := Init()
	if state.Mounted || state.Key != "" || state.Generation != 0 {
		t.Fatalf("Init must be unmounted without an assigned identity: %#v", state)
	}

	state, effects := Update(state, gobi.Message{Name: "mount", Arg: "a:g4"})
	if len(effects) != 0 || !state.Mounted || state.Key != "a" || state.Generation != 4 {
		t.Fatalf("first mount = %#v, effects %#v", state, effects)
	}
	before := state
	for _, arg := range []string{"a:g4", "b:g5", "a:g0", "a:g04", "a:g9007199254740992", "c:g4", "a:g4:extra"} {
		got, effects := Update(state, gobi.Message{Name: "mount", Arg: arg})
		if len(effects) != 0 || !reflect.DeepEqual(got, before) {
			t.Fatalf("duplicate/malformed mount %q changed state: %#v, effects %#v", arg, got, effects)
		}
	}
}

func TestMountGenerationDecimalBoundaries(t *testing.T) {
	cases := []struct {
		arg        string
		generation uint64
		wantMount  bool
	}{
		{arg: "a:g9007199254740991", generation: maxSafeID, wantMount: true},
		{arg: "a:g9007199254740992"},
		{arg: "a:g0"},
		{arg: "a:g01"},
		{arg: "a:g18446744073709551615"},
		{arg: "a:g18446744073709551616"},
		{arg: "a:g١"},
		{arg: "a:g1!"},
		{arg: "a:g"},
	}
	for _, testCase := range cases {
		state, effects := Update(Init(), gobi.Message{Name: "mount", Arg: testCase.arg})
		if len(effects) != 0 || state.Mounted != testCase.wantMount || state.Generation != testCase.generation {
			t.Errorf("mount boundary %q = %#v, effects %#v; want mounted=%t generation=%d", testCase.arg, state, effects, testCase.wantMount, testCase.generation)
		}
	}
}

func TestRequestCommitsSafeTokenBeforeEffectAndAcceptsOnlyExactSingleReply(t *testing.T) {
	state := mounted(t, "a", 3)
	state, effects := Update(state, gobi.Message{Name: "request"})
	wantEffect := gobi.Effect{Kind: "fixture.request", Name: "save", Arg: "a:g3:r1", Reply: "complete"}
	if len(effects) != 1 || effects[0] != wantEffect {
		t.Fatalf("request effects = %#v, want %#v", effects, wantEffect)
	}
	if !state.Pending || state.RequestID != 1 || state.Token != "a:g3:r1" || state.Reply != "" {
		t.Fatalf("request state was not committed before effect: %#v", state)
	}
	if got, effects := Update(state, gobi.Message{Name: "request"}); len(effects) != 0 || !reflect.DeepEqual(got, state) {
		t.Fatalf("duplicate pending request changed state: %#v, effects %#v", got, effects)
	}

	for _, token := range []string{"a:g3:r2", "a:g2:r1", "b:g3:r1", "a:g03:r1", "a:g3:r01", "malformed"} {
		got, effects := Update(state, gobi.Message{Name: "complete", Arg: token})
		if len(effects) != 0 || !reflect.DeepEqual(got, state) {
			t.Fatalf("invalid/stale reply %q changed state: %#v, effects %#v", token, got, effects)
		}
	}

	state, effects = Update(state, gobi.Message{Name: "complete", Arg: "a:g3:r1"})
	if len(effects) != 0 || state.Pending || state.Reply != "a:g3:r1" || state.Token != "a:g3:r1" {
		t.Fatalf("exact reply = %#v, effects %#v", state, effects)
	}
	completed := state
	state, effects = Update(state, gobi.Message{Name: "complete", Arg: "a:g3:r1"})
	if len(effects) != 0 || !reflect.DeepEqual(state, completed) {
		t.Fatalf("duplicate reply changed state: %#v, effects %#v", state, effects)
	}

	state, effects = Update(state, gobi.Message{Name: "request"})
	if len(effects) != 1 || effects[0].Arg != "a:g3:r2" || state.RequestID != 2 || !state.Pending {
		t.Fatalf("second request did not advance the safe per-mount ID: %#v, effects %#v", state, effects)
	}
}

func TestCancelAndUnmountReturnDeclaredCancellationAndFenceLateReplies(t *testing.T) {
	state := mounted(t, "b", 8)
	state, effects := Update(state, gobi.Message{Name: "request"})
	if len(effects) != 1 || effects[0].Arg != "b:g8:r1" {
		t.Fatalf("initial request = %#v, effects %#v", state, effects)
	}

	canceled, effects := Update(state, gobi.Message{Name: "cancel"})
	wantCancel := gobi.Effect{Kind: "lifecycle.cancel", Name: "cancel", Arg: "b:g8:r1", Reply: ""}
	if len(effects) != 1 || effects[0] != wantCancel || canceled.Pending || !canceled.Mounted {
		t.Fatalf("cancel = %#v, effects %#v", canceled, effects)
	}
	if got, effects := Update(state, gobi.Message{Name: "cancel", Arg: "b:g8:r1"}); len(effects) != 0 || !reflect.DeepEqual(got, state) {
		t.Fatalf("cancel with an undeclared argument changed state: %#v, effects %#v", got, effects)
	}
	if got, effects := Update(canceled, gobi.Message{Name: "complete", Arg: "b:g8:r1"}); len(effects) != 0 || !reflect.DeepEqual(got, canceled) {
		t.Fatalf("late canceled reply changed state: %#v, effects %#v", got, effects)
	}
	if got, effects := Update(canceled, gobi.Message{Name: "cancel"}); len(effects) != 0 || !reflect.DeepEqual(got, canceled) {
		t.Fatalf("duplicate cancel changed state: %#v, effects %#v", got, effects)
	}

	canceled, effects = Update(canceled, gobi.Message{Name: "request"})
	if len(effects) != 1 || effects[0].Arg != "b:g8:r2" {
		t.Fatalf("retry request = %#v, effects %#v", canceled, effects)
	}
	if got, effects := Update(canceled, gobi.Message{Name: "complete", Arg: "b:g8:r1"}); len(effects) != 0 || !reflect.DeepEqual(got, canceled) {
		t.Fatalf("old request reply changed newer pending state: %#v, effects %#v", got, effects)
	}
	unmounted, effects := Update(canceled, gobi.Message{Name: "unmount", Arg: "b:g8"})
	if len(effects) != 1 || effects[0] != (gobi.Effect{Kind: "lifecycle.cancel", Name: "cancel", Arg: "b:g8:r2"}) ||
		unmounted.Mounted || unmounted.Pending {
		t.Fatalf("unmount should retire Go state before returning cancellation: %#v, effects %#v", unmounted, effects)
	}
	if got, effects := Update(unmounted, gobi.Message{Name: "complete", Arg: "b:g8:r2"}); len(effects) != 0 || !reflect.DeepEqual(got, unmounted) {
		t.Fatalf("late unmounted reply changed state: %#v, effects %#v", got, effects)
	}
	for _, arg := range []string{"b:g8", "b:g9"} {
		if got, effects := Update(unmounted, gobi.Message{Name: "mount", Arg: arg}); len(effects) != 0 || !reflect.DeepEqual(got, unmounted) {
			t.Fatalf("remount message %q reused a retired wrapper: %#v, effects %#v", arg, got, effects)
		}
	}
	for _, name := range []string{"request", "add", "reset"} {
		got, effects := Update(unmounted, gobi.Message{Name: name})
		if len(effects) != 0 || !reflect.DeepEqual(got, unmounted) {
			t.Fatalf("%s after unmount changed state: %#v, effects %#v", name, got, effects)
		}
	}
}

func TestMalformedUnmountAndSafeIDBoundaryAreNoOps(t *testing.T) {
	state := mounted(t, "a", 1)
	state, effects := Update(state, gobi.Message{Name: "request"})
	if len(effects) != 1 {
		t.Fatalf("request effects = %#v", effects)
	}
	before := state
	for _, arg := range []string{"b:g1", "a:g2", "a:g01", "a:g0", "a:g9007199254740992", "a:g1:extra"} {
		got, effects := Update(state, gobi.Message{Name: "unmount", Arg: arg})
		if len(effects) != 0 || !reflect.DeepEqual(got, before) {
			t.Fatalf("stale/malformed unmount %q changed state: %#v, effects %#v", arg, got, effects)
		}
	}
	state.RequestID = maxSafeID
	state.Pending = false
	state.Token = ""
	state.Reply = ""
	before = state
	if got, effects := Update(state, gobi.Message{Name: "request"}); len(effects) != 0 || !reflect.DeepEqual(got, before) {
		t.Fatalf("request at safe ID boundary changed state: %#v, effects %#v", got, effects)
	}
}

func TestStandardInputPublicationAndExistingCounterRolesArePreserved(t *testing.T) {
	state := mounted(t, "a", 1)
	state = Input(state, modulewire.Input{Step: 3, Locked: true, Revision: 1})
	if state.Core.Step != 3 || !state.Core.Locked || state.Core.InputRevision != 1 {
		t.Fatalf("typed input was not delegated to existing Core: %#v", state.Core)
	}
	state, effects := Update(state, gobi.Message{Name: "add"})
	if len(effects) != 0 || state.Core.Counter.Count != 0 {
		t.Fatalf("locked Add must remain a Core no-op: %#v, effects %#v", state.Core, effects)
	}
	state, effects = Update(state, gobi.Message{Name: "reset"})
	if len(effects) != 0 || state.Core.Counter.Count != 0 {
		t.Fatalf("zero Reset must remain a Core no-op: %#v, effects %#v", state.Core, effects)
	}
	state = Input(state, modulewire.Input{Step: 3, Locked: false, Revision: 2})
	state, effects = Update(state, gobi.Message{Name: "add"})
	if len(effects) != 0 || state.Core.Counter.Count != 3 {
		t.Fatalf("step-three Add did not delegate to existing Core: %#v, effects %#v", state.Core, effects)
	}
	if got := Publication(state); got.Count != 3 || got.Revision != 2 {
		t.Fatalf("Publication = %#v", got)
	}
	if got := Input(state, modulewire.Input{Step: 1, Revision: 1}); !reflect.DeepEqual(got, state) {
		t.Fatalf("stale typed Input changed wrapper state: %#v", got)
	}
}

func TestViewAppendsPendingAwareRequestAndCancelControls(t *testing.T) {
	state := mounted(t, "a", 1)
	view := View(state)
	if view.Kind != gobi.Element || view.Kids[2].Kids[0].Kids[0].Text != "Count: " || len(view.Kids) != 5 {
		t.Fatalf("view should preserve Core and append one effect section: %#v", view)
	}
	request := view.Kids[3].Kids[0]
	cancel := view.Kids[3].Kids[1]
	if !hasHandler(request, "request") || hasFlag(request, "disabled") || !hasHandler(cancel, "cancel") || !hasFlag(cancel, "disabled") {
		t.Fatalf("idle effect controls = %#v", view.Kids[3])
	}
	state.Pending = true
	view = View(state)
	request = view.Kids[3].Kids[0]
	cancel = view.Kids[3].Kids[1]
	if !hasFlag(request, "disabled") || hasFlag(cancel, "disabled") {
		t.Fatalf("pending effect controls should permit cancellation only: %#v", view.Kids[3])
	}
	if nodeAt(t, view, "2/1").On[0].Message != "add" || nodeAt(t, view, "2/2").On[0].Message != "reset" {
		t.Fatalf("existing Core control paths changed: %#v", view.Kids[2])
	}
}

func TestInitialCoreAndInactiveWrapperStayValueOwned(t *testing.T) {
	state := Init()
	if !reflect.DeepEqual(state.Core.Counter, counter.Init()) {
		t.Fatalf("Core initialization diverged from counter.Init: %#v", state.Core)
	}
	state, effects := Update(state, gobi.Message{Name: "request"})
	if len(effects) != 0 || state.Mounted || state.RequestID != 0 {
		t.Fatalf("inactive wrapper accepted request: %#v, effects %#v", state, effects)
	}
}

func mounted(t *testing.T, key string, generation uint64) State {
	t.Helper()
	arg := key + ":g" + strconv.FormatUint(generation, 10)
	state, effects := Update(Init(), gobi.Message{Name: "mount", Arg: arg})
	if len(effects) != 0 || !state.Mounted {
		t.Fatalf("mount %s generation %d = %#v, effects %#v", key, generation, state, effects)
	}
	return state
}

func hasHandler(node gobi.Node, name string) bool {
	for _, handler := range node.On {
		if handler.Message == name {
			return true
		}
	}
	return false
}

func hasFlag(node gobi.Node, name string) bool {
	for _, attr := range node.Attrs {
		if attr.Name == name && attr.Flag {
			return true
		}
	}
	return false
}

func nodeAt(t *testing.T, root gobi.Node, path string) gobi.Node {
	t.Helper()
	current := root
	for _, part := range strings.Split(path, "/") {
		index, err := strconv.Atoi(part)
		if err != nil || index < 0 || index >= len(current.Kids) {
			t.Fatalf("path %q does not resolve in %#v", path, current)
		}
		current = current.Kids[index]
	}
	return current
}
