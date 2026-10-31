package modulequalification

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDecodeStrictUsesNumberAndAcceptsValidSurrogatePair(t *testing.T) {
	var decoded map[string]any
	if err := DecodeStrict([]byte(`{"count":9007199254740993,"label":"Step \uD83D\uDE00"}`), &decoded); err != nil {
		t.Fatal(err)
	}
	if got, ok := decoded["count"].(json.Number); !ok || got.String() != "9007199254740993" {
		t.Fatalf("count = %#v (%T), want exact json.Number", decoded["count"], decoded["count"])
	}
	if got, want := decoded["label"], "Step 😀"; got != want {
		t.Fatalf("label = %#v, want %q", got, want)
	}
}

func TestDecodeStrictRejectsDuplicateKeysAtEveryDepth(t *testing.T) {
	for _, input := range []string{
		`{"x":1,"x":2}`,
		`{"outer":{"x":1,"x":2}}`,
		`{"x":1,"\u0078":2}`,
	} {
		t.Run(input, func(t *testing.T) {
			var decoded map[string]any
			if err := DecodeStrict([]byte(input), &decoded); err == nil || !strings.Contains(err.Error(), "duplicate") {
				t.Fatalf("DecodeStrict error = %v, want duplicate-key rejection", err)
			}
		})
	}
}

func TestDecodeStrictRejectsInvalidUTF8AndUnpairedSurrogates(t *testing.T) {
	cases := map[string][]byte{
		"invalid utf8":      {'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'},
		"unpaired high":     []byte(`{"x":"\uD800"}`),
		"unpaired low":      []byte(`{"x":"\uDC00"}`),
		"high then non-low": []byte(`{"x":"\uD800\u0041"}`),
	}
	for name, input := range cases {
		t.Run(name, func(t *testing.T) {
			var decoded map[string]any
			if err := DecodeStrict(input, &decoded); err == nil {
				t.Fatal("DecodeStrict accepted invalid Unicode")
			}
		})
	}
}

func TestDecodeStrictRejectsTrailingValuesAndUnknownStructFields(t *testing.T) {
	type closed struct {
		Known int `json:"known"`
	}
	for _, input := range []string{`{"known":1} {"next":2}`, `{"known":1} trailing`, `{"known":1,"extra":2}`, `{"KNOWN":1}`} {
		var decoded closed
		if err := DecodeStrict([]byte(input), &decoded); err == nil {
			t.Errorf("DecodeStrict accepted %s", input)
		}
	}
}
