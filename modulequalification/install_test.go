package modulequalification

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestInstallDirectoryNoReplaceCreatesMissingDestination(t *testing.T) {
	parent := t.TempDir()
	stage := filepath.Join(parent, "stage")
	dest := filepath.Join(parent, "dest")
	if err := os.Mkdir(stage, 0o700); err != nil {
		t.Fatal(err)
	}
	want := []byte("verified contents")
	if err := os.WriteFile(filepath.Join(stage, "item.txt"), want, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := installDirectoryNoReplace(stage, dest); err != nil {
		t.Fatalf("publish to missing destination: %v", err)
	}
	if _, err := os.Lstat(stage); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stage remains after publish: %v", err)
	}
	got, err := os.ReadFile(filepath.Join(dest, "item.txt"))
	if err != nil || string(got) != string(want) {
		t.Fatalf("published contents = %q, %v; want %q", got, err, want)
	}
}

func TestInstallDirectoryNoReplacePreservesExistingEmptyDestination(t *testing.T) {
	parent := t.TempDir()
	stage := filepath.Join(parent, "stage")
	dest := filepath.Join(parent, "dest")
	if err := os.Mkdir(stage, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stage, "item.txt"), []byte("stage"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(dest, 0o700); err != nil {
		t.Fatal(err)
	}
	before, err := os.Stat(dest)
	if err != nil {
		t.Fatal(err)
	}
	if err := installDirectoryNoReplace(stage, dest); !errors.Is(err, os.ErrExist) {
		t.Fatalf("publish over existing empty destination error = %v, want os.ErrExist", err)
	}
	after, err := os.Stat(dest)
	if err != nil {
		t.Fatal(err)
	}
	if !os.SameFile(before, after) {
		t.Fatal("existing destination inode was replaced")
	}
	entries, err := os.ReadDir(dest)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("existing empty destination now contains %d entries", len(entries))
	}
	if got, err := os.ReadFile(filepath.Join(stage, "item.txt")); err != nil || string(got) != "stage" {
		t.Fatalf("failed install changed stage: %q %v", got, err)
	}
}
