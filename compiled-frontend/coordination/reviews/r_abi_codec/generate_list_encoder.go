package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: generate_list_encoder <app-ir.json> <encoder.mjs>")
		os.Exit(2)
	}
	data, err := os.ReadFile(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	var app compilercontract.AppIR
	if err := json.Unmarshal(data, &app); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	module, err := compilercontract.GenerateValueEncoder(app.Types)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := os.WriteFile(os.Args[2], []byte(module), 0o600); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
