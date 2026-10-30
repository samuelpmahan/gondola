// compare-interaction reads two Gobi traces from JSON, compares them at SameDOM,
// and writes the resulting Diff as JSON.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/samuelpmahan/gondola/gobi"
)

type input struct {
	Golden    *gobi.Trace `json:"golden"`
	Candidate *gobi.Trace `json:"candidate"`
}

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	if len(args) != 1 {
		fmt.Fprintf(os.Stderr, "usage: %s <trace.json>\n", filepath.Base(os.Args[0]))
		return 2
	}

	data, err := os.ReadFile(args[0])
	if err != nil {
		fmt.Fprintln(os.Stderr, "compare-interaction:", err)
		return 2
	}
	var traces input
	if err := json.Unmarshal(data, &traces); err != nil {
		fmt.Fprintln(os.Stderr, "compare-interaction: invalid JSON:", err)
		return 2
	}
	if traces.Golden == nil || traces.Candidate == nil {
		fmt.Fprintln(os.Stderr, "compare-interaction: input must contain golden and candidate traces")
		return 2
	}

	diff := gobi.CompareInteraction(*traces.Golden, *traces.Candidate, gobi.SameDOM)
	if err := json.NewEncoder(os.Stdout).Encode(diff); err != nil {
		fmt.Fprintln(os.Stderr, "compare-interaction: encode diff:", err)
		return 2
	}
	if diff.Found {
		return 1
	}
	return 0
}
