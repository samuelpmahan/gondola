package effectqualification

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveEffectsQualificationInput(t *testing.T) {
	t.Run("default fixture available", func(t *testing.T) {
		sourceFile := selectionSourceFile(t)
		want := defaultSelectionFixture(t, sourceFile)
		if err := os.MkdirAll(want, 0o755); err != nil {
			t.Fatal(err)
		}

		root, available, err := resolveEffectsQualificationInput("", sourceFile)
		if err != nil || !available || root != want {
			t.Fatalf("resolve default fixture = (%q, %v, %v), want (%q, true, nil)", root, available, err, want)
		}
	})

	t.Run("default fixture absent is skippable", func(t *testing.T) {
		sourceFile := selectionSourceFile(t)
		want := defaultSelectionFixture(t, sourceFile)

		root, available, err := resolveEffectsQualificationInput("", sourceFile)
		if err != nil || available || root != want {
			t.Fatalf("resolve missing default fixture = (%q, %v, %v), want (%q, false, nil)", root, available, err, want)
		}
	})

	t.Run("explicit fixture available", func(t *testing.T) {
		want := t.TempDir()

		root, available, err := resolveEffectsQualificationInput(want, "")
		if err != nil || !available || root != want {
			t.Fatalf("resolve explicit fixture = (%q, %v, %v), want (%q, true, nil)", root, available, err, want)
		}
	})

	t.Run("explicit missing path is an error", func(t *testing.T) {
		missing := filepath.Join(t.TempDir(), "missing-attempt")

		root, available, err := resolveEffectsQualificationInput(missing, "")
		if err == nil || available || root != "" || !strings.Contains(err.Error(), qualificationInputEnv) {
			t.Fatalf("resolve explicit missing path = (%q, %v, %v), want empty/unavailable/error naming %s", root, available, err, qualificationInputEnv)
		}
	})

	t.Run("explicit non-directory path is an error", func(t *testing.T) {
		file := filepath.Join(t.TempDir(), "not-an-attempt")
		if err := os.WriteFile(file, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}

		root, available, err := resolveEffectsQualificationInput(file, "")
		if err == nil || available || root != "" || !strings.Contains(err.Error(), qualificationInputEnv) {
			t.Fatalf("resolve explicit file path = (%q, %v, %v), want empty/unavailable/error naming %s", root, available, err, qualificationInputEnv)
		}
	})
}

func selectionSourceFile(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, "effectqualification")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "integration_test.go")
	if err := os.WriteFile(path, []byte("package effectqualification\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func defaultSelectionFixture(t *testing.T, sourceFile string) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join(filepath.Dir(sourceFile), "..", "compiled-module-effects", "output", "attempts", pr23FixtureAttempt))
	if err != nil {
		t.Fatal(err)
	}
	return root
}
