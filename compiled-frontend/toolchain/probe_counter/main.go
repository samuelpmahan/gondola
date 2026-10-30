package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/s4wave/goscript/compiler"
)

func main() {
	outFlag := flag.String("out", "", "directory for generated TypeScript")
	flag.Parse()
	if *outFlag == "" {
		fmt.Fprintln(os.Stderr, "-out is required")
		os.Exit(2)
	}
	out, err := filepath.Abs(*outFlag)
	if err != nil {
		fatal(err)
	}
	root, err := filepath.Abs("..")
	if err != nil {
		fatal(err)
	}
	if err := os.MkdirAll(out, 0o755); err != nil {
		fatal(err)
	}
	compilePackage(root, out, "./counter")
	compiledFrontend, err := filepath.Abs(".")
	if err != nil {
		fatal(err)
	}
	compilePackage(compiledFrontend, out, "./toolchain/probe_counter/semantics")
	compilePackage(compiledFrontend, out, "./toolchain/probe_counter/adapter")
	fmt.Printf("output=%s\n", out)
}

func compilePackage(dir, out, pattern string) {
	comp, err := compiler.NewCompiler(&compiler.Config{Dir: dir, OutputPath: out}, nil, nil)
	if err != nil {
		fatal(err)
	}
	result, err := comp.CompilePackages(context.Background(), pattern)
	if err != nil {
		fatal(err)
	}
	for _, diag := range result.Diagnostics {
		if diag.Severity == compiler.DiagnosticSeverityError {
			fatal(compiler.NewCompileError(result.Diagnostics))
		}
	}
	fmt.Printf("compiled=%v copied=%v\n", result.CompiledPackages, result.CopiedPackages)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
