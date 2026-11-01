package effectqualification

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestDecodeMapStrictPreservesNumberAndRejectsAmbiguousJSON(t *testing.T) {
	decoded, err := decodeMapStrict([]byte(`{"count":9007199254740993,"nested":{"ok":true}}`))
	if err != nil {
		t.Fatalf("decodeMapStrict: %v", err)
	}
	if got, ok := decoded["count"].(json.Number); !ok || got.String() != "9007199254740993" {
		t.Fatalf("count = %#v (%T), want exact json.Number", decoded["count"], decoded["count"])
	}
	for _, input := range []string{
		`{"same":1,"same":2}`,
		`{"same":1,"nested":{"same":1,"same":2}}`,
		`{"value":1} {"value":2}`,
		`null`,
		`{"value":"\ud800"}`,
	} {
		if _, err := decodeMapStrict([]byte(input)); err == nil {
			t.Errorf("decodeMapStrict accepted ambiguous or non-object JSON %s", input)
		}
	}
}

func TestDecodeJSONStrictRejectsFieldAliases(t *testing.T) {
	type payload struct {
		Value int `json:"value"`
	}
	for _, input := range []string{`{"Value":1}`, `{"value":1,"extra":2}`} {
		var decoded payload
		if err := decodeJSONStrict([]byte(input), &decoded); err == nil {
			t.Errorf("decodeJSONStrict accepted non-exact struct field spelling %s", input)
		}
	}
}

func TestCheckCapturesRejectsMissingRequiredSuite(t *testing.T) {
	root := t.TempDir()
	if _, err := CheckCaptures(root); err == nil || !strings.Contains(err.Error(), "conformance directory") {
		t.Fatalf("CheckCaptures(%q) error = %v, want missing conformance directory", root, err)
	}
}

func TestCheckCapturesAgainstExplicitFixture(t *testing.T) {
	root := os.Getenv("GOBI_EFFECTS_QUALIFICATION_INPUT")
	if root == "" {
		t.Skip("set GOBI_EFFECTS_QUALIFICATION_INPUT to an explicit effects attempt or conformance directory")
	}
	if _, err := os.Stat(filepath.Clean(root)); err != nil {
		t.Fatalf("GOBI_EFFECTS_QUALIFICATION_INPUT=%q: %v", root, err)
	}
	report, err := CheckCaptures(root)
	if err != nil {
		t.Fatalf("CheckCaptures(%q): %v", root, err)
	}
	want := CaptureReport{
		Scenarios:       4,
		Profiles:        20,
		Events:          178,
		States:          182,
		Effects:         58,
		TransportEvents: 116,
		Seeds:           []int{20261104, 20261105, 20261106},
	}
	if !reflect.DeepEqual(report, want) {
		t.Fatalf("CheckCaptures report = %+v, want %+v", report, want)
	}
}
