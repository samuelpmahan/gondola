package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/samuelpmahan/gondola/rendercontract"
)

type validationResult struct {
	Valid bool   `json:"valid"`
	Error string `json:"error,omitempty"`
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(args) != 1 {
		fmt.Fprintln(stderr, "usage: render-contract manifest|validate")
		return 2
	}
	switch args[0] {
	case "manifest":
		manifest, err := json.Marshal(rendercontract.DefaultManifest())
		if err != nil {
			fmt.Fprintf(stderr, "render-contract: encode manifest: %v\n", err)
			return 1
		}
		if _, err := fmt.Fprintf(stdout, "%s\n", manifest); err != nil {
			fmt.Fprintf(stderr, "render-contract: write manifest: %v\n", err)
			return 1
		}
		return 0
	case "validate":
		raw, err := io.ReadAll(stdin)
		if err != nil {
			return writeValidation(stdout, validationResult{Valid: false, Error: fmt.Sprintf("read snapshot: %v", err)}, 1)
		}
		if _, err := rendercontract.ParseSnapshot(raw); err != nil {
			return writeValidation(stdout, validationResult{Valid: false, Error: err.Error()}, 1)
		}
		return writeValidation(stdout, validationResult{Valid: true}, 0)
	default:
		fmt.Fprintln(stderr, "usage: render-contract manifest|validate")
		return 2
	}
}

func writeValidation(stdout io.Writer, result validationResult, exitCode int) int {
	if err := json.NewEncoder(stdout).Encode(result); err != nil {
		return 1
	}
	return exitCode
}
