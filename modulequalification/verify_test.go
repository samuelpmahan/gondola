package modulequalification

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestN5ReadSourceIdentityChecksArchivedSourceBytes(t *testing.T) {
	root := writeN5IdentityFixture(t)
	identity, pins, err := readSourceIdentity(root)
	if err != nil {
		t.Fatalf("read valid source identity: %v", err)
	}
	if identity.Head != "0123456789abcdef0123456789abcdef01234567" || !identity.SourcePinsMatch || identity.Dirty {
		t.Fatalf("unexpected identity: %+v", identity)
	}
	if identity.SourcePinCount != 1 || len(pins) != 1 {
		t.Fatalf("expected one verified source pin, got identity=%+v pins=%v", identity, pins)
	}

	if err := os.WriteFile(filepath.Join(root, "source", "example.go"), []byte("package changed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, _, err := readSourceIdentity(root); err == nil || !strings.Contains(err.Error(), "source/example.go") {
		t.Fatalf("changed archived source must fail with the path, got %v", err)
	}
}

func TestN5ReadSourceIdentityRejectsMetadataDisagreement(t *testing.T) {
	root := writeN5IdentityFixture(t)
	afterPath := filepath.Join(root, "metadata", "source-pins-after.json")
	if err := os.WriteFile(afterPath, []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, _, err := readSourceIdentity(root); err == nil || !strings.Contains(err.Error(), "source pin manifests") {
		t.Fatalf("disagreeing pin manifests must fail, got %v", err)
	}
}

func TestN5HashInputFilesIsSortedAndRejectsSymlinks(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "z.txt"), []byte("z"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "nested", "a.txt"), []byte("a"), 0o644); err != nil {
		t.Fatal(err)
	}
	pins, err := hashInputFiles(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(pins) != 2 || pins[0].Path != "nested/a.txt" || pins[1].Path != "z.txt" {
		t.Fatalf("inventory must be sorted normalized relative paths, got %+v", pins)
	}

	if err := os.Symlink(filepath.Join(root, "z.txt"), filepath.Join(root, "link.txt")); err != nil {
		t.Fatal(err)
	}
	if _, err := hashInputFiles(root); err == nil || !strings.Contains(err.Error(), "link.txt") {
		t.Fatalf("inventory must reject symlinks, got %v", err)
	}
}

func TestN5VerifyDirectoryComposesABIAndCaptureChecks(t *testing.T) {
	root := writeN5IdentityFixture(t)
	_, err := VerifyDirectory(root)
	if err == nil {
		t.Fatal("empty profile root should fail both ABI and capture validation")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "abi") || !strings.Contains(strings.ToLower(err.Error()), "capture") {
		t.Fatalf("want both composed validation failures in error, got %v", err)
	}
}

func writeN5IdentityFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "metadata"), 0o755); err != nil {
		t.Fatal(err)
	}
	content := []byte("package example\n")
	sum := sha256.Sum256(content)
	pin := SourcePin{Bytes: int64(len(content)), SHA256: hex.EncodeToString(sum[:])}
	pins := map[string]SourcePin{"example.go": pin}
	if err := os.MkdirAll(filepath.Join(root, "source"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "source", "example.go"), content, 0o644); err != nil {
		t.Fatal(err)
	}
	writeN5JSON(t, filepath.Join(root, "metadata", "source-pins-before.json"), pins)
	writeN5JSON(t, filepath.Join(root, "metadata", "source-pins-after.json"), pins)
	writeN5JSON(t, filepath.Join(root, "metadata", "git-source-closure.json"), map[string]any{
		"head": "0123456789abcdef0123456789abcdef01234567", "dirty": false, "status": "",
		"sourcePinsMatch": true, "sourcePinMismatches": []string{},
	})
	writeN5JSON(t, filepath.Join(root, "metadata", "git-source-closure-after.json"), map[string]any{
		"head": "0123456789abcdef0123456789abcdef01234567", "dirty": false, "status": "",
	})
	writeN5JSON(t, filepath.Join(root, "metadata", "runner-context.json"), map[string]any{
		"schema":            "gobi.compiled-modules-run-context/v1",
		"sourceCommit":      "0123456789abcdef0123456789abcdef01234567",
		"verifierGitHead":   "0123456789abcdef0123456789abcdef01234567",
		"verifierGitDirty":  false,
		"verifierGitStatus": "",
		"tools":             map[string]string{},
		"fixture":           map[string]string{"path": "example.go", "sha256": pin.SHA256},
	})
	writeN5JSON(t, filepath.Join(root, "execution-before-archive.json"), map[string]any{
		"schema":                      "gobi.compiled-modules-execution-snapshot/v1",
		"sourceCommit":                "0123456789abcdef0123456789abcdef01234567",
		"verifierGitHead":             "0123456789abcdef0123456789abcdef01234567",
		"verifierGitDirty":            false,
		"verifierSourcePinsMatch":     true,
		"verifierSourcePinMismatches": []string{},
		"sourcePins":                  pins,
		"commands":                    []json.RawMessage{},
		"moduleCounts":                map[string]int{"parent": 2, "child": 2, "pairs": 2},
	})
	return root
}

func writeN5JSON(t *testing.T, path string, value any) {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
}
