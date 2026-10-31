package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/samuelpmahan/gondola/backendqualification"
)

const usage = "usage: backend-qualification --input <raw.json> --output <certificate.json>"

func main() {
	if err := run(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("backend-qualification", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.Usage = func() {}
	inputPath := flags.String("input", "", "path to the raw qualification report")
	outputPath := flags.String("output", "", "path for the Go-certified result")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Fprintln(stdout, usage)
			return nil
		}
		return fmt.Errorf("%s: %w", usage, err)
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("%s: unexpected positional arguments", usage)
	}
	if strings.TrimSpace(*inputPath) == "" || strings.TrimSpace(*outputPath) == "" {
		return errors.New(usage + ": both --input and --output are required")
	}
	same, err := sameFilesystemPath(*inputPath, *outputPath)
	if err != nil {
		return fmt.Errorf("resolve input/output paths: %w", err)
	}
	if same {
		return errors.New("input and output paths must be different")
	}

	certificate, err := backendqualification.CertifyFile(*inputPath)
	if err != nil {
		return fmt.Errorf("certify qualification report: %w", err)
	}
	if err := backendqualification.WriteCertificate(*outputPath, certificate); err != nil {
		return fmt.Errorf("write qualification certificate: %w", err)
	}
	return nil
}

func sameFilesystemPath(inputPath, outputPath string) (bool, error) {
	inputAbsolute, err := filepath.Abs(inputPath)
	if err != nil {
		return false, err
	}
	outputAbsolute, err := filepath.Abs(outputPath)
	if err != nil {
		return false, err
	}
	inputResolved, err := filepath.EvalSymlinks(inputAbsolute)
	if err != nil {
		return false, fmt.Errorf("resolve input %q: %w", inputPath, err)
	}
	outputResolved := outputAbsolute
	if resolved, resolveErr := filepath.EvalSymlinks(outputAbsolute); resolveErr == nil {
		outputResolved = resolved
	} else if !errors.Is(resolveErr, os.ErrNotExist) {
		return false, fmt.Errorf("resolve output %q: %w", outputPath, resolveErr)
	}
	return filepath.Clean(inputResolved) == filepath.Clean(outputResolved), nil
}
