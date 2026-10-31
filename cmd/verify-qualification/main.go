package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/samuelpmahan/gondola/qualificationarchive"
)

const usage = "usage: verify-qualification --archive <runtime.tar.gz> --manifest <runtime.manifest.json> --source-commit <40-char-commit> [--output <receipt.json>]"

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

type options struct {
	archivePath    string
	manifestPath   string
	expectedCommit string
	outputPath     string
	outputSet      bool
}

func run(args []string, stdout io.Writer) error {
	return runWithVerifier(args, stdout, qualificationarchive.Verify)
}

func runWithVerifier(args []string, stdout io.Writer, verify func(archivePath, manifestPath, expectedCommit string) (qualificationarchive.Receipt, error)) error {
	parsed, help, err := parseArguments(args)
	if err != nil {
		return err
	}
	if help {
		_, err := io.WriteString(stdout, usage+"\n")
		if err != nil {
			return fmt.Errorf("write help: %w", err)
		}
		return nil
	}
	if verify == nil {
		return errors.New("internal error: verifier is not configured")
	}

	receipt, err := verify(parsed.archivePath, parsed.manifestPath, parsed.expectedCommit)
	if err != nil {
		return fmt.Errorf("verify qualification archive: %w", err)
	}
	payload, err := marshalReceipt(receipt)
	if err != nil {
		return fmt.Errorf("encode verification receipt: %w", err)
	}

	if parsed.outputSet {
		if err := writeNewFile(parsed.outputPath, payload); err != nil {
			return err
		}
		if err := writeAll(stdout, payload); err != nil {
			_ = os.Remove(parsed.outputPath)
			return fmt.Errorf("write JSON to stdout: %w", err)
		}
		return nil
	}
	if err := writeAll(stdout, payload); err != nil {
		return fmt.Errorf("write JSON to stdout: %w", err)
	}
	return nil
}

func parseArguments(args []string) (options, bool, error) {
	var parsed options
	seen := make(map[string]bool, 4)
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--help" || arg == "-h" {
			return options{}, true, nil
		}
		if !strings.HasPrefix(arg, "-") || arg == "-" || arg == "--" {
			return options{}, false, fmt.Errorf("%s: unexpected argument %q", usage, arg)
		}

		nameValue := arg
		if strings.HasPrefix(nameValue, "--") {
			nameValue = strings.TrimPrefix(nameValue, "--")
		} else {
			nameValue = strings.TrimPrefix(nameValue, "-")
		}
		if nameValue == "" || strings.HasPrefix(nameValue, "-") {
			return options{}, false, fmt.Errorf("%s: invalid flag %q", usage, arg)
		}
		name, value, hasValue := strings.Cut(nameValue, "=")
		if name != "archive" && name != "manifest" && name != "source-commit" && name != "output" {
			return options{}, false, fmt.Errorf("%s: unknown flag %q", usage, arg)
		}
		if seen[name] {
			return options{}, false, fmt.Errorf("%s: --%s may be provided only once", usage, name)
		}
		seen[name] = true
		if !hasValue {
			if i+1 >= len(args) {
				return options{}, false, fmt.Errorf("%s: --%s requires a value", usage, name)
			}
			i++
			value = args[i]
		}
		if strings.TrimSpace(value) == "" {
			return options{}, false, fmt.Errorf("%s: --%s requires a non-empty value", usage, name)
		}
		switch name {
		case "archive":
			parsed.archivePath = value
		case "manifest":
			parsed.manifestPath = value
		case "source-commit":
			parsed.expectedCommit = value
		case "output":
			parsed.outputPath = value
			parsed.outputSet = true
		}
	}
	if parsed.archivePath == "" || parsed.manifestPath == "" || parsed.expectedCommit == "" {
		return options{}, false, errors.New(usage + ": --archive, --manifest, and --source-commit are required")
	}
	return parsed, false, nil
}

func marshalReceipt(receipt qualificationarchive.Receipt) ([]byte, error) {
	payload, err := json.MarshalIndent(receipt, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(payload, '\n'), nil
}

func writeNewFile(path string, payload []byte) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create output %q without clobbering: %w", path, err)
	}
	keep := false
	defer func() {
		if !keep {
			_ = os.Remove(path)
		}
	}()
	if err := writeAll(file, payload); err != nil {
		_ = file.Close()
		return fmt.Errorf("write output %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close output %q: %w", path, err)
	}
	keep = true
	return nil
}

func writeAll(writer io.Writer, data []byte) error {
	for len(data) > 0 {
		written, err := writer.Write(data)
		if written > 0 {
			data = data[written:]
		}
		if err != nil {
			return err
		}
		if written == 0 {
			return io.ErrShortWrite
		}
	}
	return nil
}
