package build

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestPublishKeepsPreviousTreeWhenProducerFails(t *testing.T) {
	output := filepath.Join(t.TempDir(), "compiled")
	if err := os.MkdirAll(output, 0o755); err != nil {
		t.Fatal(err)
	}
	oldFile := filepath.Join(output, "old.mjs")
	if err := os.WriteFile(oldFile, []byte("previous-good"), 0o644); err != nil {
		t.Fatal(err)
	}

	preserved, err := Publish(output, func(stage string) error {
		if err := os.WriteFile(filepath.Join(stage, "partial.mjs"), []byte("partial"), 0o644); err != nil {
			return err
		}
		return errors.New("deliberate build failure")
	})

	if err == nil || err.Error() != "deliberate build failure" {
		t.Fatalf("Publish error = %v, want producer failure", err)
	}
	if !preserved {
		t.Fatal("Publish reported that the prior output was not preserved")
	}
	got, err := os.ReadFile(oldFile)
	if err != nil {
		t.Fatalf("previous output was removed: %v", err)
	}
	if string(got) != "previous-good" {
		t.Fatalf("previous output changed to %q", got)
	}
	if _, err := os.Stat(filepath.Join(output, "partial.mjs")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("partial build output leaked into published tree: %v", err)
	}
}

func TestPublishReplacesOutputOnlyAfterProducerSucceeds(t *testing.T) {
	output := filepath.Join(t.TempDir(), "compiled")
	if err := os.MkdirAll(output, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(output, "old.mjs"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}

	preserved, err := Publish(output, func(stage string) error {
		return os.WriteFile(filepath.Join(stage, "gobi-compiled.mjs"), []byte("complete"), 0o644)
	})
	if err != nil {
		t.Fatal(err)
	}
	if preserved {
		t.Fatal("successful publication must not report preservation of the replaced output")
	}
	if _, err := os.Stat(filepath.Join(output, "old.mjs")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("old output remains after successful publication: %v", err)
	}
	got, err := os.ReadFile(filepath.Join(output, "gobi-compiled.mjs"))
	if err != nil {
		t.Fatalf("new output missing: %v", err)
	}
	if string(got) != "complete" {
		t.Fatalf("published output = %q", got)
	}
}
