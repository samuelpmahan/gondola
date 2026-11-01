package main

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild"
)

func TestLiteralReplayComposesCounterChildrenWithDeferredEffects(t *testing.T) {
	script := loadLiteral(t)
	got, err := replay(script)
	if err != nil {
		t.Fatal(err)
	}
	if got.Schema != outputSchema || got.Name != "module-effects-literal" || len(got.Events) != 31 || len(got.States) != 32 {
		t.Fatalf("trace identity/events/states = %q/%q/%d/%d", got.Schema, got.Name, len(got.Events), len(got.States))
	}
	initial := got.States[got.InitialStateIndex]
	if initial.Parent.ChildCount != 2 || len(initial.Children) != 2 || childState(t, initial, "a").Core.InputRevision != 1 || childState(t, initial, "b").Core.InputRevision != 1 {
		t.Fatalf("initial keyed children did not receive standard parent input: %#v", initial)
	}
	if got.Events[0].Accepted || got.Events[0].Message == nil || got.Events[0].Message.Name != "reset" {
		t.Fatalf("reset-at-zero click should resolve disabled in Go View: %#v", got.Events[0])
	}
	if !got.Events[1].Accepted || childState(t, got.States[got.Events[1].StateIndex], "a").Core.Counter.Count != 1 || childState(t, got.States[got.Events[1].StateIndex], "b").Core.Counter.Count != 0 {
		t.Fatalf("counter Add did not update only keyed child a: %#v", got.Events[1])
	}
	if !got.Events[2].Accepted || childState(t, got.States[got.Events[2].StateIndex], "a").Token != "a:g1:r1" || !childState(t, got.States[got.Events[2].StateIndex], "a").Pending {
		t.Fatalf("request Go state was not captured: %#v", got.Events[2])
	}
	if len(got.Effects) != 10 || got.Effects[0].Effect != (effectValue("fixture.request", "save", "a:g1:r1", "complete")) {
		t.Fatalf("ordered effect ledger = %#v", got.Effects)
	}
	if got.Events[7].TransportOutcome != "rejected-duplicate" || got.Events[8].TransportOutcome != "rejected-cancelled" ||
		got.Events[18].TransportOutcome != "rejected-cancelled" || got.Events[21].TransportOutcome != "rejected-duplicate" {
		t.Fatalf("duplicate, canceled, or reused-generation reply outcomes = %#v", []string{
			got.Events[7].TransportOutcome, got.Events[8].TransportOutcome, got.Events[18].TransportOutcome, got.Events[21].TransportOutcome,
		})
	}
	if got.Events[11].RendererSwap == nil || got.Events[11].RendererSwap.To != "react" || !got.Events[12].Accepted {
		t.Fatalf("renderer swap drained pending transport or lost reply: %#v / %#v", got.Events[11], got.Events[12])
	}
	if len(got.PendingTransports) != 0 || len(got.TransportLedger) != 20 {
		t.Fatalf("final pending/transport ledger = %#v / %d rows", got.PendingTransports, len(got.TransportLedger))
	}
	final := got.States[got.Events[30].StateIndex]
	if childState(t, final, "a").Core.Counter.Count != 0 || childState(t, final, "b").Core.Counter.Count != 1 {
		t.Fatalf("child reset/add isolation failed: a=%#v b=%#v", childState(t, final, "a").Core, childState(t, final, "b").Core)
	}
}

func TestRemovedChildGoUnmountPrecedesCancellationAndRendererTeardown(t *testing.T) {
	got, err := replay(loadLiteral(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(got.RetiredChildren) != 1 {
		t.Fatalf("retired child snapshots = %#v", got.RetiredChildren)
	}
	retired := got.RetiredChildren[0]
	if retired.Key != "a" || retired.Generation != 1 || retired.State.Mounted || retired.State.Pending ||
		retired.State.RequestID != 4 || retired.State.Token != "a:g1:r4" {
		t.Fatalf("retired generation did not preserve its last Go state after unmount: %#v", retired)
	}
	want := []string{"go.update.unmount", "go.state.unmounted", "go.effect.cancel", "transport.cancel", "renderer.teardown"}
	if len(got.LifecycleLedger) != len(want) {
		t.Fatalf("lifecycle ledger = %#v", got.LifecycleLedger)
	}
	for index, action := range want {
		if got.LifecycleLedger[index].Action != action || got.LifecycleLedger[index].EventIndex != 15 {
			t.Fatalf("lifecycle order = %#v", got.LifecycleLedger)
		}
	}
	if got.LifecycleLedger[0].State == nil || !got.LifecycleLedger[0].State.Mounted || !got.LifecycleLedger[0].State.Pending ||
		got.LifecycleLedger[1].State == nil || got.LifecycleLedger[1].State.Mounted || got.LifecycleLedger[1].State.Pending ||
		got.LifecycleLedger[2].EffectIndex != 6 || got.LifecycleLedger[2].Token != "a:g1:r4" {
		t.Fatalf("Go-before/after/cancel record = %#v", got.LifecycleLedger)
	}
	if row := got.TransportLedger[11]; row.EventIndex != 15 || row.Action != "cancel" || row.Token != "a:g1:r4" || row.Status != "cancelled" {
		t.Fatalf("transport cancellation did not follow Go cancellation: %#v", row)
	}
	if !got.Events[15].Accepted || len(got.Events[15].EffectIndices) != 1 || got.Events[15].EffectIndices[0] != 6 {
		t.Fatalf("parent removal did not carry Go-declared cancellation effect: %#v", got.Events[15])
	}
}

func TestStaleRetainedCallbackCannotReachRemountedGenerationOrSibling(t *testing.T) {
	got, err := replay(loadLiteral(t))
	if err != nil {
		t.Fatal(err)
	}
	before := got.States[got.Events[18].StateIndex]
	after := got.States[got.Events[19].StateIndex]
	if got.Events[19].Accepted || got.Events[19].Message == nil || got.Events[19].TransportOutcome != "rejected-stale-generation" {
		t.Fatalf("retained UI callback result = %#v", got.Events[19])
	}
	if !reflect.DeepEqual(before.Parent, after.Parent) || !reflect.DeepEqual(before.Children, after.Children) {
		t.Fatalf("retained callback mutated remounted child or sibling: before=%#v after=%#v", before, after)
	}
	newChild := childState(t, after, "a")
	if newChild.Generation != 2 || newChild.RequestID != 1 || newChild.Token != "a:g2:r1" || !newChild.Pending {
		t.Fatalf("new generation did not reuse only local request ID under generation fence: %#v", newChild)
	}
}

func TestScenarioValidationRequiresFrozenSchemaAndEventArray(t *testing.T) {
	for _, script := range []scenario{
		{Schema: "wrong", Name: "bad", Events: []scenarioEvent{}},
		{Schema: scenarioSchema, Name: "", Events: []scenarioEvent{}},
		{Schema: scenarioSchema, Name: "missing-events"},
	} {
		if validateScenario(script) == nil {
			t.Fatalf("invalid scenario accepted: %#v", script)
		}
	}
}

func TestMountBoundaryCLIEmitsGoOwnedStatesAndEffects(t *testing.T) {
	var output bytes.Buffer
	if err := runMountBoundaries(&output); err != nil {
		t.Fatal(err)
	}
	var result mountBoundaryOutput
	if err := json.Unmarshal(output.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Schema != mountBoundarySchema || len(result.Cases) != 10 {
		t.Fatalf("boundary schema/case count = %q/%d", result.Schema, len(result.Cases))
	}
	accepted := map[string]bool{"max-safe": true, "max-safe-cancel-retry": true}
	for _, testCase := range result.Cases {
		wantSteps := 1
		switch testCase.Name {
		case "max-safe":
			wantSteps = 3
		case "max-safe-cancel-retry":
			wantSteps = 5
		}
		if len(testCase.Steps) != wantSteps || testCase.Steps[0].Message != "mount" || testCase.Steps[0].Arg != testCase.Arg {
			t.Fatalf("case %q steps = %#v", testCase.Name, testCase.Steps)
		}
		if accepted[testCase.Name] {
			if !testCase.Steps[0].State.Mounted || testCase.Steps[0].State.Generation != 9007199254740991 {
				t.Fatalf("max-safe mount state = %#v", testCase.Steps[0].State)
			}
			if !testCase.Steps[1].State.Pending || testCase.Steps[1].State.Token != "a:g9007199254740991:r1" ||
				len(testCase.Steps[1].Effects) != 1 || testCase.Steps[1].Effects[0].Kind != "fixture.request" {
				t.Fatalf("max-safe request step = %#v", testCase.Steps[1])
			}
			if testCase.Name == "max-safe" {
				if testCase.Steps[2].State.Pending || testCase.Steps[2].State.Reply != "a:g9007199254740991:r1" || len(testCase.Steps[2].Effects) != 0 {
					t.Fatalf("max-safe reply step = %#v", testCase.Steps[2])
				}
			} else if testCase.Steps[2].State.Pending || testCase.Steps[2].State.RequestID != 1 ||
				len(testCase.Steps[2].Effects) != 1 || testCase.Steps[2].Effects[0].Kind != "lifecycle.cancel" ||
				!testCase.Steps[3].State.Pending || testCase.Steps[3].State.Token != "a:g9007199254740991:r2" ||
				len(testCase.Steps[3].Effects) != 1 || testCase.Steps[3].Effects[0].Kind != "fixture.request" ||
				testCase.Steps[4].State.Pending || testCase.Steps[4].State.Reply != "a:g9007199254740991:r2" {
				t.Fatalf("max-safe cancel/retry steps = %#v", testCase.Steps[2:])
			}
		} else {
			if testCase.Steps[0].State.Mounted || testCase.Steps[0].State.Generation != 0 || len(testCase.Steps[0].Effects) != 0 {
				t.Fatalf("invalid mount case %q changed Go state: %#v", testCase.Name, testCase.Steps[0])
			}
		}
	}
}

func loadLiteral(t *testing.T) scenario {
	t.Helper()
	data, err := os.ReadFile("../../fixtures/compiled/effectmodulechild/scenario.json")
	if err != nil {
		t.Fatal(err)
	}
	var script scenario
	if err := json.Unmarshal(data, &script); err != nil {
		t.Fatal(err)
	}
	if err := validateScenario(script); err != nil {
		t.Fatal(err)
	}
	return script
}

func childState(t *testing.T, state stateSnapshot, key string) effectmodulechild.State {
	t.Helper()
	for _, child := range state.Children {
		if child.Key == key {
			return child.State
		}
	}
	t.Fatalf("child %q missing from state snapshot: %#v", key, state.Children)
	return effectmodulechild.State{}
}

func effectValue(kind, name, arg, reply string) compilercontract.EffectValue {
	return compilercontract.EffectValue{Kind: kind, Name: name, Arg: arg, Reply: reply}
}
