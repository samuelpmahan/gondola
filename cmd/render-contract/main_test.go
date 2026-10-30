package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

const validInput = `{"state":{},"tree":{"Kind":2,"Tag":"","Key":"","Attrs":null,"On":null,"Kids":null,"Text":"text"},"bindings":[],"messages":[]}`

func TestManifestCommandPrintsTheGoOwnedJSONContract(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run([]string{"manifest"}, strings.NewReader(""), &stdout, &stderr)
	if code != 0 || stderr.Len() != 0 {
		t.Fatalf("manifest exit=%d stderr=%q", code, stderr.String())
	}
	var manifest map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &manifest); err != nil {
		t.Fatalf("manifest output is not JSON: %s: %v", stdout.String(), err)
	}
	if manifest["protocol"] != "gobi.keyed-renderer" || manifest["version"] != float64(1) || manifest["maxNodes"] != float64(4096) {
		t.Fatalf("manifest output = %#v", manifest)
	}
	if _, exists := manifest["nodeKinds"].([]any); !exists {
		t.Fatalf("nodeKinds must be a JSON array: %#v", manifest["nodeKinds"])
	}
}

func TestValidateCommandPrintsOneValidResult(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run([]string{"validate"}, strings.NewReader(validInput), &stdout, &stderr)
	if code != 0 || stderr.Len() != 0 || stdout.String() != "{\"valid\":true}\n" {
		t.Fatalf("validate exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}

func TestValidateCommandReportsInvalidSnapshotAndReturnsNonzero(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run([]string{"validate"}, strings.NewReader(`{"state":null}`), &stdout, &stderr)
	if code == 0 || stderr.Len() != 0 {
		t.Fatalf("invalid validate exit=%d stderr=%q", code, stderr.String())
	}
	var response struct {
		Valid bool   `json:"valid"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
		t.Fatalf("invalid response is not JSON: %s: %v", stdout.String(), err)
	}
	if response.Valid || response.Error == "" {
		t.Fatalf("invalid response = %#v", response)
	}
}

func TestCLIRejectsUnknownCommandsAndExtraArguments(t *testing.T) {
	for _, args := range [][]string{{"other"}, {"manifest", "extra"}, {"validate", "extra"}} {
		var stdout, stderr bytes.Buffer
		if code := run(args, strings.NewReader(""), &stdout, &stderr); code == 0 || stderr.Len() == 0 {
			t.Fatalf("run(%v) = exit %d, stderr %q", args, code, stderr.String())
		}
	}
}
