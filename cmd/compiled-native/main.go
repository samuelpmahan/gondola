package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func main() {
	appIRPath := flag.String("app-ir", "", "path to one AppIR JSON object emitted in BuildResult.apps")
	scriptPath := flag.String("script", "", "path to one gobi.fixture-script/v1 JSON file")
	flag.Parse()
	if *appIRPath == "" || *scriptPath == "" || flag.NArg() != 0 {
		fatal(errors.New("usage: compiled-native --app-ir <app-ir.json> --script <fixture-script.json>"))
	}
	var appIR compilercontract.AppIR
	if err := readStrictJSON(*appIRPath, &appIR); err != nil {
		fatal(fmt.Errorf("load AppIR: %w", err))
	}
	var script fixtureScript
	if err := readStrictJSON(*scriptPath, &script); err != nil {
		fatal(fmt.Errorf("load fixture script: %w", err))
	}
	trace, err := replay(appIR, script)
	if err != nil {
		fatal(err)
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(trace); err != nil {
		fatal(fmt.Errorf("encode trace: %w", err))
	}
}

func readStrictJSON(path string, target any) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return errors.New("trailing JSON value")
		}
		return err
	}
	return nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
