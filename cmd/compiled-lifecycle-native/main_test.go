package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
)

func TestNativeAdapterReplaysFrozenGoLifecycle(t *testing.T) {
	var output bytes.Buffer
	if err := run(filepath.Join("..", "..", "fixtures", "compiled", "lifecycle", "scenario.json"), &output); err != nil {
		t.Fatal(err)
	}
	var result replayOutput
	if err := json.Unmarshal(output.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Schema != outputSchema || result.ComponentID != packagePath || len(result.Steps) != 26 {
		t.Fatalf("native trace identity/length = %q, %q, %d", result.Schema, result.ComponentID, len(result.Steps))
	}
	if result.Steps[8].Kind != "renderer-swap" || result.Steps[8].Message != nil ||
		!reflect.DeepEqual(result.Steps[7].State, result.Steps[8].State) {
		t.Fatalf("renderer swap dispatched or changed Go state: %#v", result.Steps[8])
	}
	wantCancels := []compilercontract.EffectValue{
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "grandchild:g1:r3"},
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "child:g1:r2"},
		{Kind: "lifecycle.cancel", Name: "cancel", Arg: "parent:g1:r1"},
	}
	if !reflect.DeepEqual(result.Steps[9].Effects, wantCancels) {
		t.Fatalf("remove effects = %#v, want %#v", result.Steps[9].Effects, wantCancels)
	}
	if result.Steps[10].State.Parent.Generation != 2 || result.Steps[10].State.Child.Generation != 2 ||
		result.Steps[10].State.Grandchild.Generation != 2 || result.Steps[10].State.Sibling.Generation != 1 {
		t.Fatalf("remount generations = %#v", result.Steps[10].State)
	}
	for _, index := range []int{11, 12, 13} {
		if result.Steps[index].Outcome != "stale-no-op" {
			t.Fatalf("old reply event %d outcome = %q", index, result.Steps[index].Outcome)
		}
	}
	if result.Steps[14].Outcome != "go-accepted" || result.Steps[15].Outcome != "duplicate-no-op" {
		t.Fatalf("sibling reply outcomes = %q/%q", result.Steps[14].Outcome, result.Steps[15].Outcome)
	}
	final := result.Steps[25].State
	if final.NextRequestID != 7 || final.Parent.Token != "parent:g2:r5" || final.Child.Token != "child:g2:r6" ||
		final.Grandchild.Token != "grandchild:g2:r7" || final.Sibling.Reply != "sibling:g1:r4" {
		t.Fatalf("final state differs from frozen expectation: %#v", final)
	}
	if !final.Parent.Alive || !final.Child.Alive || !final.Grandchild.Alive || !final.Sibling.Alive ||
		final.Parent.Pending || final.Child.Pending || final.Grandchild.Pending || final.Sibling.Pending {
		t.Fatalf("final lifecycle states are not all live and settled: %#v", final)
	}
}

func TestNativeAdapterRejectsScriptThatDisagreesWithGobiView(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "fixtures", "compiled", "lifecycle", "scenario.json"))
	if err != nil {
		t.Fatal(err)
	}
	data = bytes.Replace(data,
		[]byte(`"message": { "name": "addParent", "arg": "" }`),
		[]byte(`"message": { "name": "wrongMessage", "arg": "" }`), 1)
	path := filepath.Join(t.TempDir(), "scenario.json")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	err = run(path, &output)
	if err == nil || !strings.Contains(err.Error(), "script expects") {
		t.Fatalf("mismatched fixture click error = %v", err)
	}
}

func TestInitialStateWiresCounterAndTopology(t *testing.T) {
	state := lifecycle.Init()
	view := compilercontract.NodeRecordFromGobi(lifecycle.View(state))
	if state.Parent.ID != "parent" || state.Child.ParentID != "parent" || state.Grandchild.ParentID != "child" ||
		state.Sibling.ParentID != "" || view.Tag != "main" || view.Key != "lifecycle" || len(view.Kids) != 3 {
		t.Fatalf("initial Go state/view differ from frozen topology: %#v / %#v", state, view)
	}
}
