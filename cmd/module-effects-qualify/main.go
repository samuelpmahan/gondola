package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/samuelpmahan/gondola/effectqualification"
	"github.com/samuelpmahan/gondola/modulequalification"
)

const usage = `Usage:
  module-effects-qualify --directory ROOT
  module-effects-qualify --archive TAR --manifest MANIFEST

Verify a compiled module-effects capture with native Go checks.`

type options struct {
	mode     string
	root     string
	archive  string
	manifest string
	help     bool
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	parsed, err := parseArgs(args)
	if err != nil {
		fmt.Fprintf(stderr, "module-effects-qualify: %v\n%s\n", err, usage)
		return 2
	}
	if parsed.help {
		fmt.Fprintln(stdout, usage)
		return 0
	}

	var report effectqualification.Report
	if parsed.mode == "directory" {
		report, err = effectqualification.VerifyDirectory(parsed.root)
	} else {
		report, err = verifyArchive(parsed.archive, parsed.manifest)
	}
	if err != nil {
		fmt.Fprintf(stderr, "module-effects-qualify: %v\n", err)
		return 1
	}

	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Fprintf(stderr, "module-effects-qualify: encode report: %v\n", err)
		return 1
	}
	if _, err := stdout.Write(append(data, '\n')); err != nil {
		fmt.Fprintf(stderr, "module-effects-qualify: write report: %v\n", err)
		return 1
	}
	return 0
}

func parseArgs(args []string) (options, error) {
	if len(args) == 1 && args[0] == "--help" {
		return options{help: true}, nil
	}
	if len(args) == 0 {
		return options{}, errors.New("choose exactly one verification mode")
	}
	values := make(map[string]string, 3)
	for index := 0; index < len(args); index++ {
		name := args[index]
		if name != "--directory" && name != "--archive" && name != "--manifest" {
			return options{}, fmt.Errorf("unknown argument %q", name)
		}
		if _, exists := values[name]; exists {
			return options{}, fmt.Errorf("%s may only appear once", name)
		}
		if index+1 >= len(args) || args[index+1] == "" || strings.HasPrefix(args[index+1], "--") {
			return options{}, fmt.Errorf("%s requires a value", name)
		}
		values[name] = args[index+1]
		index++
	}

	directory, hasDirectory := values["--directory"]
	archive, hasArchive := values["--archive"]
	manifest, hasManifest := values["--manifest"]
	if hasDirectory {
		if hasArchive || hasManifest || len(values) != 1 {
			return options{}, errors.New("--directory cannot be combined with archive mode")
		}
		return options{mode: "directory", root: directory}, nil
	}
	if hasArchive != hasManifest || !hasArchive || len(values) != 2 {
		return options{}, errors.New("archive mode requires exactly --archive TAR and --manifest MANIFEST")
	}
	return options{mode: "archive", archive: archive, manifest: manifest}, nil
}

func verifyArchive(archivePath, manifestPath string) (effectqualification.Report, error) {
	tempRoot, err := os.MkdirTemp("", "gobi-module-effects-qualify-")
	if err != nil {
		return effectqualification.Report{}, fmt.Errorf("create private extraction parent: %w", err)
	}
	dest := filepath.Join(tempRoot, "bundle")
	archiveReport, verifyErr := modulequalification.VerifyEffectsArchive(archivePath, manifestPath, dest)
	var report effectqualification.Report
	if verifyErr == nil {
		report, verifyErr = effectqualification.VerifyDirectory(dest)
	}
	if verifyErr == nil && archiveReport.SourceCommit != report.SourceCommit {
		verifyErr = fmt.Errorf("archive source commit %q does not match verified profile source commit %q", archiveReport.SourceCommit, report.SourceCommit)
	}
	cleanupErr := os.RemoveAll(tempRoot)
	if verifyErr != nil {
		if cleanupErr != nil {
			verifyErr = errors.Join(verifyErr, fmt.Errorf("remove private extraction directory: %w", cleanupErr))
		}
		return effectqualification.Report{}, verifyErr
	}
	if cleanupErr != nil {
		return effectqualification.Report{}, fmt.Errorf("remove private extraction directory: %w", cleanupErr)
	}
	report.Archive = &effectqualification.ArchiveSummary{
		Members:      archiveReport.Members,
		Bytes:        archiveReport.Bytes,
		SourceCommit: archiveReport.SourceCommit,
	}
	return report, nil
}
