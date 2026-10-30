package main

import (
	"encoding/json"
	"math"
	"testing"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/collection"
	"github.com/samuelpmahan/gondola/multisession"
)

func TestDecodeStepJSONRequiresExactStringObject(t *testing.T) {
	got, err := decodeStepJSON(`{"Path":"2/0/0","Event":"input","Value":"draft","Key":"row-1-input"}`)
	if err != nil {
		t.Fatalf("decodeStepJSON() error = %v", err)
	}
	want := collection.Step{Path: "2/0/0", Event: "input", Value: "draft", Key: "row-1-input"}
	if got != want {
		t.Fatalf("decodeStepJSON() = %#v, want %#v", got, want)
	}
	for _, input := range []string{
		`null`,
		`[]`,
		`{"Path":"0","Event":"click","Value":"","Key":"add","extra":true}`,
		`{"Path":"0","Event":"click","Value":"","Key":"add","Key":"add"}`,
		`{"Path":"0","Event":"click","Value":"","Key":"add","K\u0065y":"add"}`,
		`{"Path":"0","Event":"click","Value":"","Key":null}`,
		`{"Path":"0","Event":"click","Key":"add"}`,
		`{"Path":"0","Event":"click","Value":"","Key":"add"} {}`,
	} {
		t.Run(input, func(t *testing.T) {
			if got, err := decodeStepJSON(input); err == nil {
				t.Fatalf("decodeStepJSON(%s) = %#v, want error", input, got)
			}
		})
	}
}

func TestDecodeReplyJSONRequiresExactCorrelatedShape(t *testing.T) {
	got, err := decodeReplyJSON(` {"ID":7,"Value":"saved","Error":""} `)
	if err != nil {
		t.Fatalf("decodeReplyJSON() error = %v", err)
	}
	want := asyncsave.Reply{ID: 7, Value: "saved", Error: ""}
	if got != want {
		t.Fatalf("decodeReplyJSON() = %#v, want %#v", got, want)
	}

	for _, input := range []string{
		`null`,
		`[]`,
		`{"ID":7,"Value":"x","Error":"","extra":true}`,
		`{"ID":7,"ID":7,"Value":"x","Error":""}`,
		`{"ID":7,"I\u0044":7,"Value":"x","Error":""}`,
		`{"ID":"7","Value":"x","Error":""}`,
		`{"ID":7.0,"Value":"x","Error":""}`,
		`{"ID":7e0,"Value":"x","Error":""}`,
		`{"ID":-1,"Value":"x","Error":""}`,
		`{"ID":0,"Value":"x","Error":""}`,
		`{"ID":9007199254740992,"Value":"x","Error":""}`,
		`{"ID":7,"Value":null,"Error":""}`,
		`{"ID":7,"Value":"x","Error":false}`,
		`{"ID":7,"Value":"x","Error":""} {}`,
	} {
		t.Run(input, func(t *testing.T) {
			if got, err := decodeReplyJSON(input); err == nil {
				t.Fatalf("decodeReplyJSON(%s) = %#v, want error", input, got)
			}
		})
	}
}

func TestParsePositiveSafeUintEnforcesJavaScriptIntegerRange(t *testing.T) {
	for _, tc := range []struct {
		input string
		want  uint64
		valid bool
	}{
		{input: `1`, want: 1, valid: true},
		{input: `9007199254740991`, want: asyncsave.MaxID, valid: true},
		{input: `0`},
		{input: `-1`},
		{input: `1.0`},
		{input: `1e0`},
		{input: `"1"`},
		{input: `true`},
		{input: `9007199254740992`},
		{input: `18446744073709551616`},
	} {
		got, err := parsePositiveSafeUint(json.RawMessage(tc.input), "ID")
		if tc.valid {
			if err != nil || got != tc.want {
				t.Errorf("parsePositiveSafeUint(%s) = %d, %v; want %d, nil", tc.input, got, err, tc.want)
			}
		} else if err == nil {
			t.Errorf("parsePositiveSafeUint(%s) = %d, want error", tc.input, got)
		}
	}
}

func TestSafeJSIntegerBoundaries(t *testing.T) {
	if asyncsave.MaxID != 9007199254740991 {
		t.Fatalf("asyncsave.MaxID = %d, want JavaScript's maximum safe integer", asyncsave.MaxID)
	}
	for _, tc := range []struct {
		number float64
		want   multisession.SessionID
		valid  bool
	}{
		{number: 1, want: 1, valid: true},
		{number: float64(multisession.MaxSessionID), want: multisession.SessionID(multisession.MaxSessionID), valid: true},
		{number: 0},
		{number: -1},
		{number: 1.5},
		{number: math.NaN()},
		{number: math.Inf(1)},
		{number: float64(multisession.MaxSessionID) + 1},
	} {
		got, err := sessionIDFromNumber(tc.number)
		if tc.valid {
			if err != nil || got != tc.want {
				t.Errorf("sessionIDFromNumber(%v) = %d, %v; want %d, nil", tc.number, got, err, tc.want)
			}
		} else if err == nil {
			t.Errorf("sessionIDFromNumber(%v) = %d, want error", tc.number, got)
		}
	}
}
