package main

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/qualificationarchive"
)

func TestHelpPrintsUsage(t *testing.T) {
	var stdout bytes.Buffer
	if err := runWithVerifier([]string{"--help"}, &stdout, nil); err != nil {
		t.Fatalf("help failed: %v", err)
	}
	if !strings.Contains(stdout.String(), usage) {
		t.Fatalf("help output %q does not contain usage %q", stdout.String(), usage)
	}
}

func TestStrictArgumentsRejectInvalidAndRepeatedFlags(t *testing.T) {
	cases := []struct {
		name string
		args []string
	}{
		{name: "missing required flags"},
		{name: "missing manifest", args: []string{"--archive", "archive.tgz", "--source-commit", "commit"}},
		{name: "missing source commit", args: []string{"--archive", "archive.tgz", "--manifest", "manifest.json"}},
		{name: "unknown flag", args: []string{"--archive", "archive.tgz", "--manifest", "manifest.json", "--source-commit", "commit", "--unknown", "x"}},
		{name: "malformed flag prefix", args: []string{"---archive", "archive.tgz", "--manifest", "manifest.json", "--source-commit", "commit"}},
		{name: "positional argument", args: []string{"--archive", "archive.tgz", "--manifest", "manifest.json", "--source-commit", "commit", "extra"}},
		{name: "empty required value", args: []string{"--archive", " ", "--manifest", "manifest.json", "--source-commit", "commit"}},
		{name: "repeated flag", args: []string{"--archive", "one.tgz", "--archive", "two.tgz", "--manifest", "manifest.json", "--source-commit", "commit"}},
		{name: "empty optional output", args: []string{"--archive", "archive.tgz", "--manifest", "manifest.json", "--source-commit", "commit", "--output", ""}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			called := false
			var stdout bytes.Buffer
			err := runWithVerifier(tc.args, &stdout, func(string, string, string) (qualificationarchive.Receipt, error) {
				called = true
				return qualificationarchive.Receipt{}, nil
			})
			if err == nil {
				t.Fatal("invalid invocation was accepted")
			}
			if called {
				t.Fatal("verifier ran for invalid arguments")
			}
			if stdout.Len() != 0 {
				t.Fatalf("invalid invocation wrote stdout before the caller reported the error: %q", stdout.String())
			}
		})
	}
}

func TestSuccessWritesDeterministicJSONToStdoutAndNewOutput(t *testing.T) {
	dir := t.TempDir()
	outputPath := filepath.Join(dir, "receipt.json")
	args := []string{"--archive", "archive.tgz", "--manifest", "manifest.json", "--source-commit", "abc", "--output", outputPath}
	var stdout bytes.Buffer
	var calledWith []string
	receipt := qualificationarchive.Receipt{}
	verify := func(archivePath, manifestPath, expectedCommit string) (qualificationarchive.Receipt, error) {
		calledWith = []string{archivePath, manifestPath, expectedCommit}
		return receipt, nil
	}
	if err := runWithVerifier(args, &stdout, verify); err != nil {
		t.Fatalf("runWithVerifier failed: %v", err)
	}
	if !reflect.DeepEqual(calledWith, []string{"archive.tgz", "manifest.json", "abc"}) {
		t.Fatalf("verifier arguments = %#v", calledWith)
	}
	want, err := marshalReceipt(receipt)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(stdout.Bytes(), want) {
		t.Fatalf("stdout JSON differs from deterministic receipt encoding\n got: %q\nwant: %q", stdout.Bytes(), want)
	}
	fileBytes, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if !bytes.Equal(fileBytes, want) {
		t.Fatalf("output file differs from stdout JSON\n got: %q\nwant: %q", fileBytes, want)
	}
}

func TestOutputIsOptional(t *testing.T) {
	var stdout bytes.Buffer
	if err := runWithVerifier([]string{"--archive=a.tgz", "--manifest=m.json", "--source-commit=abc"}, &stdout,
		func(string, string, string) (qualificationarchive.Receipt, error) {
			return qualificationarchive.Receipt{}, nil
		}); err != nil {
		t.Fatalf("run without output failed: %v", err)
	}
	if stdout.Len() == 0 {
		t.Fatalf("success omitted stdout JSON: %q", stdout.String())
	}
}

func TestVerifierFailureDoesNotCreateOutputOrPrintSuccess(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "receipt.json")
	var stdout bytes.Buffer
	err := runWithVerifier([]string{"--archive", "bad.tgz", "--manifest", "bad.json", "--source-commit", "abc", "--output", outputPath}, &stdout,
		func(string, string, string) (qualificationarchive.Receipt, error) {
			return qualificationarchive.Receipt{}, errors.New("verification failed")
		})
	if err == nil || !strings.Contains(err.Error(), "verification failed") {
		t.Fatalf("verification error = %v", err)
	}
	if stdout.Len() != 0 {
		t.Fatalf("failure wrote success output: %q", stdout.String())
	}
	if _, statErr := os.Stat(outputPath); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("output exists after verification failure: %v", statErr)
	}
}

func TestExistingOutputIsNotClobbered(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "receipt.json")
	original := []byte("keep this file")
	if err := os.WriteFile(outputPath, original, 0o600); err != nil {
		t.Fatal(err)
	}
	var stdout bytes.Buffer
	err := runWithVerifier([]string{"--archive", "archive.tgz", "--manifest", "manifest.json", "--source-commit", "abc", "--output", outputPath}, &stdout,
		func(string, string, string) (qualificationarchive.Receipt, error) {
			return qualificationarchive.Receipt{}, nil
		})
	if err == nil || !strings.Contains(err.Error(), "create output") {
		t.Fatalf("existing-output error = %v", err)
	}
	after, readErr := os.ReadFile(outputPath)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if !bytes.Equal(after, original) {
		t.Fatalf("existing output changed: %q", after)
	}
	if stdout.Len() != 0 {
		t.Fatalf("failure wrote success JSON: %q", stdout.String())
	}
}

func TestOutputCreatedBeforeStdoutFailureIsRemoved(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "receipt.json")
	err := runWithVerifier([]string{"--archive", "archive.tgz", "--manifest", "manifest.json", "--source-commit", "abc", "--output", outputPath}, failingWriter{},
		func(string, string, string) (qualificationarchive.Receipt, error) {
			return qualificationarchive.Receipt{}, nil
		})
	if err == nil || !strings.Contains(err.Error(), "write JSON to stdout") {
		t.Fatalf("stdout failure = %v", err)
	}
	if _, statErr := os.Stat(outputPath); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("partial success file remains after stdout failure: %v", statErr)
	}
}

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) { return 0, errors.New("writer failed") }
