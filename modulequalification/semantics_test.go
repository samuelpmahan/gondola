package modulequalification

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

func TestCheckCapturesAgainstRestoredModuleRun(t *testing.T) {
	root := os.Getenv("GOBI_MODULE_CAPTURE_ROOT")
	if root == "" {
		root = "/tmp/gobi-published-restore-check"
	}
	if _, err := os.Stat(filepath.Join(root, "conformance", "module-pair.fixed.native.json")); err != nil {
		t.Skipf("restored module capture not present; set GOBI_MODULE_CAPTURE_ROOT: %v", err)
	}

	report, err := CheckCaptures(root)
	if err != nil {
		t.Fatalf("CheckCaptures(%q): %v", root, err)
	}
	want := CaptureReport{
		Profiles:         12,
		Events:           144,
		Updates:          99,
		Seeds:            []int{20261031, 20261032, 20261033},
		MutationControls: 0,
	}
	if !reflect.DeepEqual(report, want) {
		t.Fatalf("capture report = %+v, want %+v", report, want)
	}
}

func TestCheckCapturesRejectsMissingCaptureDirectory(t *testing.T) {
	root := t.TempDir()
	if _, err := CheckCaptures(root); err == nil {
		t.Fatal("missing capture evidence must be rejected")
	}
}

func TestCheckCapturesAcceptsConformanceDirectory(t *testing.T) {
	root := os.Getenv("GOBI_MODULE_CAPTURE_ROOT")
	if root == "" {
		root = "/tmp/gobi-published-restore-check"
	}
	conformance := filepath.Join(root, "conformance")
	if _, err := os.Stat(filepath.Join(conformance, "module-pair.fixed.native.json")); err != nil {
		t.Skipf("restored module capture not present; set GOBI_MODULE_CAPTURE_ROOT: %v", err)
	}
	if _, err := CheckCaptures(conformance); err != nil {
		t.Fatalf("CheckCaptures(conformance directory): %v", err)
	}
}

func TestCheckCapturesRejectsCoherenceAndMissingTypedFields(t *testing.T) {
	root := capturedRoot(t)
	cases := []struct {
		name, file, pointer, operation, replacement, wantError string
	}{
		{"react initial backend mismatch", "conformance/module-pair.browser.json", "/profiles/react/initialBackend", "replace-string", `"dom"`, "initialBackend"},
		{"react trace backend mismatch", "conformance/module-pair.browser.json", "/profiles/react/trace/backend", "replace-string", `"dom"`, "trace.backend"},
		{"fixed swap result backend mismatch", "conformance/module-pair.browser.json", "/profiles/swap/events/11/operation/swap/result/backend", "replace-string", `"dom"`, "result.backend"},
		{"callback backend after swap mismatch", "conformance/module-pair.browser.json", "/profiles/swap/events/13/physicalClick/observed/rendererKind", "replace-string", `"dom"`, "rendererKind"},
		{"final swap backend mismatch", "conformance/module-pair.browser.json", "/profiles/swap/finalSnapshot/backend", "replace-string", `"react"`, "finalSnapshot.backend"},
		{"seeded swap sequence mismatch", "conformance/module-pair.browser.json", "/profiles/seeded/seed-20261031-swap/events/32/operation/swap/from", "replace-string", `"dom"`, "operation.swap"},
		{"seed metadata mismatch", "conformance/module-pair.browser.json", "/profiles/seeded/seed-20261031-react/seed", "replace-number", `20261032`, "seed"},
		{"null initial child count", "conformance/module-pair.fixed.native.json", "/initial/childState/Counter/Count", "replace-number", `null`, "Counter.Count"},
		{"missing initial child count", "conformance/module-pair.fixed.native.json", "/initial/childState/Counter/Count", "delete", "", "Counter.Count"},
		{"null initial parent count", "conformance/module-pair.fixed.native.json", "/initial/parentState/PublishedCount", "replace-number", `null`, "PublishedCount"},
		{"null zero-valued bool", "conformance/module-pair.fixed.native.json", "/initial/parentState/Locked", "replace-boolean", `null`, "Locked"},
		{"missing zero-valued bool", "conformance/module-pair.fixed.native.json", "/initial/parentState/Locked", "delete", "", "Locked"},
		{"null whole counter state", "conformance/module-pair.fixed.native.json", "/initial/childState/Counter", "replace-number", `null`, "Counter"},
		{"missing whole counter state", "conformance/module-pair.fixed.native.json", "/initial/childState/Counter", "delete", "", "Counter"},
		{"null zero count in update frame", "conformance/module-pair.fixed.native.json", "/steps/4/childState/Counter/Count", "replace-number", `null`, "Counter.Count"},
		{"missing zero count in update frame", "conformance/module-pair.fixed.native.json", "/steps/4/childState/Counter/Count", "delete", "", "Counter.Count"},
		{"null false input bridge field", "conformance/module-pair.fixed.native.json", "/initial/bridges/2/input/Locked", "replace-boolean", `null`, "bridges[2].input.Locked"},
		{"missing false input bridge field", "conformance/module-pair.fixed.native.json", "/initial/bridges/2/input/Locked", "delete", "", "bridges[2].input.Locked"},
		{"null zero publication bridge field", "conformance/module-pair.fixed.native.json", "/initial/bridges/4/publication/Count", "replace-number", `null`, "bridges[4].publication.Count"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			overlay := hardlinkOverlay(t, root)
			path := filepath.Join(overlay, filepath.FromSlash(tc.file))
			if tc.operation == "delete" {
				deleteCaptureJSONField(t, path, tc.pointer)
			} else {
				mutateCapturedFile(t, path, mutationCase{ID: tc.name, File: tc.file, Pointer: tc.pointer, Mutation: tc.operation, Value: json.RawMessage(tc.replacement)})
			}
			_, err := CheckCaptures(overlay)
			if err == nil {
				t.Fatalf("checker accepted mutation of %s %s", tc.file, tc.pointer)
			}
			if !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(tc.wantError)) {
				t.Fatalf("rejected for unrelated reason: wanted error containing %q, got %v", tc.wantError, err)
			}
		})
	}
}

func deleteCaptureJSONField(t *testing.T, path, pointer string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read mutation target %s: %v", path, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var root any
	if err := decoder.Decode(&root); err != nil {
		t.Fatalf("decode mutation target %s: %v", path, err)
	}
	parts := strings.Split(strings.TrimPrefix(pointer, "/"), "/")
	var current any = root
	for _, part := range parts[:len(parts)-1] {
		switch value := current.(type) {
		case map[string]any:
			next, exists := value[part]
			if !exists {
				t.Fatalf("mutation path %s is missing member %q", pointer, part)
			}
			current = next
		case []any:
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(value) {
				t.Fatalf("mutation path %s has invalid array index %q", pointer, part)
			}
			current = value[index]
		default:
			t.Fatalf("mutation path %s descends through %T", pointer, current)
		}
	}
	object, ok := current.(map[string]any)
	if !ok {
		t.Fatalf("mutation parent at %s is %T, want object", pointer, current)
	}
	key := parts[len(parts)-1]
	if _, exists := object[key]; !exists {
		t.Fatalf("mutation path %s is already missing", pointer)
	}
	delete(object, key)
	changed, err := json.Marshal(root)
	if err != nil {
		t.Fatalf("encode mutated JSON %s: %v", path, err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("unlink hard-linked target before mutation: %v", err)
	}
	if err := os.WriteFile(path, changed, 0o644); err != nil {
		t.Fatalf("write mutated JSON %s: %v", path, err)
	}
}
