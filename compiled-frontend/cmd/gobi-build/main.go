package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/samuelpmahan/gondola/compiled-frontend/build"
	"github.com/samuelpmahan/gondola/compilercontract"
)

func main() {
	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		writeFailure(fmt.Errorf("read build request: %w", err))
	}
	request, err := build.DecodeRequest(data)
	if err != nil {
		writeFailure(err)
	}
	result := build.Build(request)
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(result); err != nil {
		fmt.Fprintln(os.Stderr, "encode build result:", err)
		os.Exit(1)
	}
	if !result.OK {
		os.Exit(1)
	}
}

func writeFailure(err error) {
	fmt.Fprintln(os.Stderr, err)
	result := compilercontract.BuildResult{
		Schema:      compilercontract.BuildResultSchema,
		OK:          false,
		Apps:        []compilercontract.AppIR{},
		Outputs:     []compilercontract.OutputFile{},
		Diagnostics: []compilercontract.Diagnostic{{Code: "build.request", Severity: "error", Message: err.Error(), Related: []compilercontract.Span{}}},
	}
	_ = json.NewEncoder(os.Stdout).Encode(result)
	os.Exit(1)
}
