package main

import "testing"

func TestFixtureMatrixCoversVersionedContractBoundaries(t *testing.T) {
	fixtures, err := generateFixtures()
	if err != nil {
		t.Fatal(err)
	}
	required := []string{
		"valid-controlled-keyed-view",
		"valid-root-text",
		"valid-empty-text",
		"valid-adjacent-text-nodes",
		"valid-keyed-sibling-reorder",
		"valid-max-depth-boundary",
		"valid-max-node-boundary",
		"schema-missing-envelope-field",
		"schema-extra-envelope-field",
		"schema-case-mismatched-envelope-field",
		"schema-null-bindings",
		"binding-unsupported-event",
		"binding-missing-controlled-value",
		"keys-duplicate-global-key",
		"keys-invalid-character",
		"kind-fragment-outside-v1",
		"kind-style-attribute-outside-v1",
		"depth-over-limit",
		"nodes-over-limit",
		"raw-json-only-duplicate-envelope-key",
		"raw-json-only-malformed-json",
		"message-handler-u0085-only",
		"message-handler-ufeff-only",
		"message-binding-u0085-only",
		"message-binding-ufeff-only",
	}
	if len(fixtures) != 36 {
		t.Fatalf("generated %d fixtures, want 36", len(fixtures))
	}
	byName := make(map[string]fixture, len(fixtures))
	for _, item := range fixtures {
		if _, duplicate := byName[item.Name]; duplicate {
			t.Fatalf("duplicate fixture name %q", item.Name)
		}
		byName[item.Name] = item
	}
	for _, name := range required {
		if _, ok := byName[name]; !ok {
			t.Errorf("missing required fixture %q", name)
		}
	}
	for _, name := range required[len(required)-4:] {
		item := byName[name]
		if item.Name == "" || item.Category != "message" || item.Admission != "snapshot" || item.ExpectedValid {
			t.Errorf("message blank-name fixture %q has wrong classification: %#v", name, item)
		}
	}
	for _, item := range fixtures {
		if item.Admission == "raw-json-only" && item.ExpectedValid {
			t.Errorf("raw JSON only fixture %q cannot be valid", item.Name)
		}
		if item.Admission != "snapshot" && item.Admission != "raw-json-only" {
			t.Errorf("fixture %q has unknown admission mode %q", item.Name, item.Admission)
		}
		if item.ExpectedValid && item.ExpectedHTML == nil {
			t.Errorf("valid fixture %q lacks the Go HTML reference", item.Name)
		}
		if !item.ExpectedValid && item.ExpectedHTML != nil {
			t.Errorf("invalid fixture %q has an HTML reference", item.Name)
		}
	}
}
