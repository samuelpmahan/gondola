package main

import (
	"bytes"
	"reflect"
	"strings"
	"testing"
)

func TestParseArgsAcceptsOneDirectoryOrEffectsArchiveMode(t *testing.T) {
	for _, test := range []struct {
		name string
		args []string
		mode string
	}{
		{name: "directory", args: []string{"--directory", "/tmp/effects"}, mode: "directory"},
		{name: "archive", args: []string{"--archive", "/tmp/effects.tar.gz", "--manifest", "/tmp/effects.manifest.json"}, mode: "archive"},
		{name: "archive flags reversed", args: []string{"--manifest", "/tmp/effects.manifest.json", "--archive", "/tmp/effects.tar.gz"}, mode: "archive"},
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

func TestParseArgsRejectsAmbiguousIncompleteAndUnknownModes(t *testing.T) {
	for _, args := range [][]string{
		{},
		{"--directory", "/tmp/effects", "--archive", "/tmp/effects.tar.gz", "--manifest", "/tmp/effects.manifest.json"},
		{"--directory", "/tmp/one", "--directory", "/tmp/two"},
		{"--archive", "/tmp/effects.tar.gz"},
		{"--manifest", "/tmp/effects.manifest.json"},
		{"--archive", "/tmp/effects.tar.gz", "--manifest", "/tmp/one", "--manifest", "/tmp/two"},
		{"--directory"},
		{"--directory", "--archive"},
		{"--unknown", "x"},
		{"--help", "--directory", "/tmp/effects"},
	} {
		if _, err := parseArgs(args); err == nil {
			t.Errorf("parseArgs(%q) unexpectedly succeeded", args)
		}
	}
}

func TestParseArgsHelpIsStandalone(t *testing.T) {
	got, err := parseArgs([]string{"--help"})
	if err != nil {
		t.Fatal(err)
	}
	if !got.help || !reflect.DeepEqual(got, options{help: true}) {
		t.Fatalf("parseArgs(--help) = %#v, want standalone help", got)
	}
}

func TestRunHelpAndVerificationFailureKeepStdoutClean(t *testing.T) {
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
	if stdout.Len() != 0 || !strings.Contains(stderr.String(), "module-effects-qualify:") {
		t.Fatalf("failure must have no partial JSON stdout: stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
}
