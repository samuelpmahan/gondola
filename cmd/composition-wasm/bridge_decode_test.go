package main

import (
	"testing"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/collection"
)

func TestDecodeReplayInputRequiresClosedActionObjects(t *testing.T) {
	actions, err := decodeReplayInput([]byte(`{"actions":[{"method":"dispatch","args":[1,{"Path":"2/0/0","Event":"input","Value":"draft","Key":"row-1-input"}]}]}`))
	if err != nil {
		t.Fatalf("decodeReplayInput() error = %v", err)
	}
	if len(actions) != 1 || actions[0].Method != "dispatch" || len(actions[0].Args) != 2 {
		t.Fatalf("decodeReplayInput() = %#v, want one dispatch action", actions)
	}
	step, err := decodeStepJSON(string(actions[0].Args[1]))
	want := collection.Step{Path: "2/0/0", Event: "input", Value: "draft", Key: "row-1-input"}
	if err != nil || step != want {
		t.Fatalf("decodeStepJSON() = %#v, %v; want %#v", step, err, want)
	}

	for _, input := range []string{
		`null`,
		`[]`,
		`{"actions":null}`,
		`{"actions":[],"extra":true}`,
		`{"actions":[],"actions":[]}`,
		`{"actions":[],"a\u0063tions":[]}`,
		`{"actions":[]} {}`,
		`{"actions":[{"method":"create","args":[],"extra":0}]}`,
		`{"actions":[{"method":"create","method":"list","args":[]}]}`,
		`{"actions":[{"method":"create","args":null}]}`,
		`{"actions":[{"method":"create","args":[]}],"bad":"\uD800"}`,
	} {
		t.Run(input, func(t *testing.T) {
			if got, err := decodeReplayInput([]byte(input)); err == nil {
				t.Fatalf("decodeReplayInput(%s) = %#v, want error", input, got)
			}
		})
	}
}

func TestDecodeInputsJSONUsesExactPrimitiveFieldsAndUnicode(t *testing.T) {
	got, err := decodeInputsJSON(`{"Title":"Research","ReadOnly":true}`)
	if err != nil || got.Title != "Research" || !got.ReadOnly {
		t.Fatalf("decodeInputsJSON() = %#v, %v", got, err)
	}
	for _, input := range []string{
		`null`,
		`{"Title":"x"}`,
		`{"Title":"x","ReadOnly":true,"extra":0}`,
		`{"Title":"x","Title":"y","ReadOnly":true}`,
		`{"Title":"x","ReadOnly":1}`,
		`{"Title":"x","ReadOnly":"true"}`,
		`{"Title":"\uD800","ReadOnly":false}`,
		`{"Title":"\uDC00","ReadOnly":false}`,
	} {
		t.Run(input, func(t *testing.T) {
			if got, err := decodeInputsJSON(input); err == nil {
				t.Fatalf("decodeInputsJSON(%s) = %#v, want error", input, got)
			}
		})
	}
}

func TestDecodeStepAndReplyUseExactFieldsAndTypes(t *testing.T) {
	step, err := decodeStepJSON(`{"Path":"0","Event":"click","Value":"","Key":"add"}`)
	if err != nil || step != (collection.Step{Path: "0", Event: "click", Key: "add"}) {
		t.Fatalf("decodeStepJSON() = %#v, %v", step, err)
	}
	reply, err := decodeReplyJSON(`{"ID":7,"Value":"saved","Error":""}`)
	if err != nil || reply != (asyncsave.Reply{ID: 7, Value: "saved"}) {
		t.Fatalf("decodeReplyJSON() = %#v, %v", reply, err)
	}
	for _, input := range []string{
		`{"Path":"0","Event":"click","Value":"","Key":"add","x":0}`,
		`{"Path":"0","Event":"click","Value":"","Key":null}`,
	} {
		t.Run(input, func(t *testing.T) {
			if got, err := decodeStepJSON(input); err == nil {
				t.Fatalf("decodeStepJSON(%s) = %#v, want error", input, got)
			}
		})
	}
	for _, input := range []string{
		`{"ID":7,"Value":"saved","Error":"","extra":0}`,
		`{"ID":7.0,"Value":"saved","Error":""}`,
		`{"ID":9007199254740992,"Value":"saved","Error":""}`,
	} {
		t.Run(input, func(t *testing.T) {
			if got, err := decodeReplyJSON(input); err == nil {
				t.Fatalf("decodeReplyJSON(%s) = %#v, want error", input, got)
			}
		})
	}
}

func TestParseSafeUintRequiresCanonicalSafeInteger(t *testing.T) {
	for _, tc := range []struct {
		raw  string
		want uint64
		ok   bool
	}{
		{`0`, 0, true},
		{`1`, 1, true},
		{`9007199254740991`, asyncsave.MaxID, true},
		{`-1`, 0, false},
		{`1.0`, 0, false},
		{`1e0`, 0, false},
		{`1.5`, 0, false},
		{`"1"`, 0, false},
		{`true`, 0, false},
		{`9007199254740992`, 0, false},
	} {
		got, err := parseSafeUint([]byte(tc.raw), "value")
		if tc.ok && (err != nil || got != tc.want) {
			t.Errorf("parseSafeUint(%s) = %d, %v; want %d", tc.raw, got, err, tc.want)
		}
		if !tc.ok && err == nil {
			t.Errorf("parseSafeUint(%s) = %d, want error", tc.raw, got)
		}
	}
}
