package main

import (
	"bytes"
	"flag"
	"fmt"
	"os"

	"github.com/samuelpmahan/gondola/reactmap"
)

// emitReact writes react-map.gen.mjs from the Go tables; with --check it only compares the file with what would be written.
func emitReact(args []string) int {
	flags := flag.NewFlagSet("emit react", flag.ContinueOnError)
	out := flags.String("out", "react-map.gen.mjs", "file to write")
	check := flags.Bool("check", false, "compare instead of writing")
	if flags.Parse(args) != nil {
		return 2
	}
	want := []byte(reactmap.Generate())
	if *check {
		have, err := os.ReadFile(*out)
		if err != nil || !bytes.Equal(have, want) {
			fmt.Printf("ERROR %s is out of date; run: go run ./cmd/gobi emit react\n", *out)
			return 1
		}
		return 0
	}
	if err := os.WriteFile(*out, want, 0o644); err != nil {
		fmt.Println("ERROR infrastructure:", err)
		return 2
	}
	fmt.Println("wrote", *out)
	return 0
}

// writeReactMap is emitReact without the chatter, for `check html`, which must print only its verdict.
func writeReactMap(path string) error {
	return os.WriteFile(path, []byte(reactmap.Generate()), 0o644)
}
