// Command module-effects-native composes the existing keyed parent with
// independently stateful effectmodulechild instances and records a replay.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/samuelpmahan/gondola/effectsreplay"
	"github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild"
	"github.com/samuelpmahan/gondola/gobi"
)

const (
	scenarioPath        = "fixtures/compiled/effectmodulechild/scenario.json"
	mountBoundarySchema = "gobi.module-effects-mount-boundaries/v1"
)

type mountBoundaryOutput struct {
	Schema string              `json:"schema"`
	Cases  []mountBoundaryCase `json:"cases"`
}

type mountBoundaryCase struct {
	Name  string         `json:"name"`
	Arg   string         `json:"arg"`
	Steps []boundaryStep `json:"steps"`
}

type boundaryStep struct {
	Message string                  `json:"message"`
	Arg     string                  `json:"arg,omitempty"`
	State   effectmodulechild.State `json:"state"`
	Effects []gobi.Effect           `json:"effects"`
}

func main() {
	script := flag.String("script", scenarioPath, "module effects scenario JSON")
	mountBoundaries := flag.Bool("mount-boundaries", false, "emit Go-owned mount parser boundary states and effects")
	flag.Parse()
	if *mountBoundaries {
		if err := runMountBoundaries(os.Stdout); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	if err := run(*script, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runMountBoundaries(output io.Writer) error {
	inputs := []struct {
		name string
		arg  string
	}{
		{name: "max-safe", arg: "a:g9007199254740991"},
		{name: "max-safe-cancel-retry", arg: "a:g9007199254740991"},
		{name: "max-safe-plus-one", arg: "a:g9007199254740992"},
		{name: "zero", arg: "a:g0"},
		{name: "leading-zero", arg: "a:g01"},
		{name: "malformed", arg: "a:g1x"},
		{name: "uint64-max", arg: "a:g18446744073709551615"},
		{name: "uint64-overflow", arg: "a:g18446744073709551616"},
		{name: "non-ascii-digit", arg: "a:g١"},
		{name: "other-byte", arg: "a:g1!"},
	}
	result := mountBoundaryOutput{Schema: mountBoundarySchema, Cases: []mountBoundaryCase{}}
	for _, input := range inputs {
		state := effectmodulechild.Init()
		caseOutput := mountBoundaryCase{Name: input.name, Arg: input.arg, Steps: []boundaryStep{}}
		step := func(message, arg string) {
			var effects []gobi.Effect
			state, effects = effectmodulechild.Update(state, gobi.Message{Name: message, Arg: arg})
			if effects == nil {
				effects = []gobi.Effect{}
			}
			caseOutput.Steps = append(caseOutput.Steps, boundaryStep{Message: message, Arg: arg, State: state, Effects: effects})
		}
		step("mount", input.arg)
		if state.Mounted {
			step("request", "")
			if state.Pending {
				token := state.Token
				if input.name == "max-safe-cancel-retry" {
					step("cancel", "")
					step("request", "")
					token = state.Token
				}
				step("complete", token)
			}
		}
		result.Cases = append(result.Cases, caseOutput)
	}
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	return encoder.Encode(result)
}

func run(scriptPath string, output io.Writer) error {
	data, err := os.ReadFile(scriptPath)
	if err != nil {
		return fmt.Errorf("read module effects scenario: %w", err)
	}
	encoded, err := effectsreplay.ReplayJSON(data)
	if err != nil {
		return err
	}
	written, err := output.Write(encoded)
	if err == nil && written != len(encoded) {
		return io.ErrShortWrite
	}
	return err
}
