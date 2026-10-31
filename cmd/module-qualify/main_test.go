package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestParseArgsAcceptsOneDirectoryOrArchiveMode(t *testing.T) {
	for _, test := range []struct {
		name string
		args []string
		mode string
	}{
		{name: "directory", args: []string{"--directory", "/tmp/profile"}, mode: "directory"},
		{name: "archive", args: []string{"--archive", "/tmp/profile.tar.gz", "--manifest", "/tmp/profile.manifest.json"}, mode: "archive"},
		{name: "archive flags in reverse order", args: []string{"--manifest", "/tmp/profile.manifest.json", "--archive", "/tmp/profile.tar.gz"}, mode: "archive"},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, err := parseArgs(test.args)
			if err != nil {
				t.Fatal(err)
			}
			if got.mode != test.mode {
				t.Fatalf("mode=%q, want %q", got.mode, test.mode)
			}
		})
	}
}

func TestParseArgsRejectsAmbiguousAndMalformedModes(t *testing.T) {
	for _, args := range [][]string{
		{},
		{"--directory", "/tmp/profile", "--archive", "/tmp/profile.tar.gz", "--manifest", "/tmp/profile.manifest.json"},
		{"--directory", "/tmp/one", "--directory", "/tmp/two"},
		{"--archive", "/tmp/profile.tar.gz"},
		{"--manifest", "/tmp/profile.manifest.json"},
		{"--archive", "/tmp/profile.tar.gz", "--manifest", "/tmp/one", "--manifest", "/tmp/two"},
		{"--directory"},
		{"--directory", "--archive"},
		{"--unknown", "x"},
		{"--help", "--directory", "/tmp/profile"},
	} {
		if _, err := parseArgs(args); err == nil {
			t.Errorf("parseArgs(%q) unexpectedly succeeded", args)
		}
	}
}

func TestRunHelpAndFailureKeepStdoutClean(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if code := run([]string{"--help"}, &stdout, &stderr); code != 0 {
		t.Fatalf("help exit=%d, want 0", code)
	}
	if !strings.Contains(stdout.String(), "--directory ROOT") || stderr.Len() != 0 {
		t.Fatalf("unexpected help output: stdout=%q stderr=%q", stdout.String(), stderr.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := run([]string{"--directory", "/path/that/does/not/exist"}, &stdout, &stderr); code == 0 {
		t.Fatal("missing directory unexpectedly passed")
	}
	if stdout.Len() != 0 || !strings.Contains(stderr.String(), "module-qualify:") {
		t.Fatalf("failure must have no partial JSON stdout: stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
}
