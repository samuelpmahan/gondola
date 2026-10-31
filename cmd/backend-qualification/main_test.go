package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func invoke(args ...string) (string, string, error) {
	var stdout, stderr bytes.Buffer
	err := run(args, &stdout, &stderr)
	return stdout.String(), stderr.String(), err
}

func TestHelpPrintsUsage(t *testing.T) {
	stdout, stderr, err := invoke("--help")
	if err != nil {
		t.Fatalf("--help failed: %v", err)
	}
	if !strings.Contains(stdout, usage) {
		t.Fatalf("help output %q does not contain usage %q", stdout, usage)
	}
	if stderr != "" {
		t.Fatalf("help wrote unexpected stderr: %q", stderr)
	}
}

func TestInvalidFlagsAndArgumentsFail(t *testing.T) {
	cases := []struct {
		name string
		args []string
	}{
		{name: "missing flags"},
		{name: "missing output", args: []string{"--input", "run.json"}},
		{name: "missing input", args: []string{"--output", "certificate.json"}},
		{name: "unknown flag", args: []string{"--bogus", "value"}},
		{name: "positional argument", args: []string{"--input", "run.json", "--output", "certificate.json", "extra"}},
		{name: "empty input", args: []string{"--input", "", "--output", "certificate.json"}},
		{name: "empty output", args: []string{"--input", "run.json", "--output", ""}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, err := invoke(tc.args...); err == nil {
				t.Fatal("invalid invocation was accepted")
			}
		})
	}
}

func TestInputAndOutputCannotAlias(t *testing.T) {
	path := filepath.Join(t.TempDir(), "run.json")
	original := []byte("preserve this raw report")
	if err := os.WriteFile(path, original, 0o600); err != nil {
		t.Fatal(err)
	}
	_, _, err := invoke("--input", path, "--output", path)
	if err == nil || !strings.Contains(err.Error(), "must be different") {
		t.Fatalf("same-path invocation error = %v", err)
	}
	after, readErr := os.ReadFile(path)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if !bytes.Equal(after, original) {
		t.Fatalf("input changed after rejected same-path invocation: %q", after)
	}
}

func TestMalformedOrMissingInputDoesNotCreateCertificate(t *testing.T) {
	t.Run("malformed JSON", func(t *testing.T) {
		dir := t.TempDir()
		input := filepath.Join(dir, "run.json")
		output := filepath.Join(dir, "certificate.json")
		if err := os.WriteFile(input, []byte("{not-json"), 0o600); err != nil {
			t.Fatal(err)
		}
		_, _, err := invoke("--input", input, "--output", output)
		if err == nil {
			t.Fatal("malformed input was accepted")
		}
		if _, statErr := os.Stat(output); !os.IsNotExist(statErr) {
			t.Fatalf("certificate exists after failed certification, stat error: %v", statErr)
		}
	})

	t.Run("missing input", func(t *testing.T) {
		dir := t.TempDir()
		output := filepath.Join(dir, "certificate.json")
		_, _, err := invoke("--input", filepath.Join(dir, "missing.json"), "--output", output)
		if err == nil {
			t.Fatal("missing input was accepted")
		}
		if _, statErr := os.Stat(output); !os.IsNotExist(statErr) {
			t.Fatalf("certificate exists after failed input open, stat error: %v", statErr)
		}
	})
}
