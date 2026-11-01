package effectqualification

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var requiredEffectSourcePaths = []string{
	"EXPECTED.json",
	"SHA256SUMS",
	"go.mod",
	"cmd/module-effects-native/main.go",
	"compilercontract/contract.go",
	"compilercontract/json.go",
	"compilercontract/js_encoder.go",
	"compilercontract/trace.go",
	"compilercontract/validation.go",
	"compilercontract/value.go",
	"compilercontract/view.go",
	"counter/counter.go",
	"fixtures/compiled/effectmodulechild/app.go",
	"fixtures/compiled/effectmodulechild/app_test.go",
	"fixtures/compiled/effectmodulechild/scenario.json",
	"fixtures/compiled/effectmodulechild/view.go",
	"fixtures/compiled/keyedmoduleparent/app.go",
	"fixtures/compiled/keyedmoduleparent/app_test.go",
	"fixtures/compiled/keyedmoduleparent/scenario.json",
	"fixtures/compiled/keyedmodulewire/keyedmodulewire.go",
	"fixtures/compiled/keyedmodulewire/keyedmodulewire_test.go",
	"fixtures/compiled/modulechild/app.go",
	"fixtures/compiled/modulechild/app_test.go",
	"fixtures/compiled/modulechild/view.go",
	"fixtures/compiled/moduleparent/app.go",
	"fixtures/compiled/moduleparent/app_test.go",
	"fixtures/compiled/moduleparent/scenario.json",
	"fixtures/compiled/modulewire/modulewire.go",
	"fixtures/compiled/modulewire/modulewire_test.go",
	"gobi/build.go",
	"gobi/html.go",
	"gobi/node.go",
	"moduleabi/descriptor.go",
	"compiled-module-effects/build/abi-admission.mjs",
	"compiled-module-effects/conformance/browser.mjs",
	"compiled-module-effects/conformance/direct.mjs",
	"compiled-module-effects/conformance/run.mjs",
	"compiled-module-effects/conformance/scenarios.mjs",
	"compiled-module-effects/oracle/oracle.mjs",
}

// VerifyDirectory admits one complete asynchronous module-effects attempt.
// Every regular input is hashed before and after validation, source pins are
// recomputed from archived bytes, ABI claims are derived from exact generated
// artifact bytes, and capture semantics are replayed by Go.
func VerifyDirectory(root string) (Report, error) {
	if strings.TrimSpace(root) == "" {
		return Report{}, errors.New("effects qualification root is required")
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return Report{}, fmt.Errorf("resolve effects qualification root: %w", err)
	}
	info, err := os.Lstat(absRoot)
	if err != nil {
		return Report{}, fmt.Errorf("inspect effects qualification root %q: %w", root, err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return Report{}, fmt.Errorf("effects qualification root %q must be a real directory", root)
	}

	inputsBefore, err := hashInputs(absRoot)
	if err != nil {
		return Report{}, fmt.Errorf("hash inputs before validation: %w", err)
	}
	identity, sourcePins, err := readSourceIdentity(absRoot)
	if err != nil {
		return Report{}, fmt.Errorf("source identity: %w", err)
	}
	if err := requireEffectSourcePaths(sourcePins); err != nil {
		return Report{}, fmt.Errorf("source closure: %w", err)
	}

	abiErr := checkEffectBuilds(absRoot)
	capture, captureErr := CheckCaptures(absRoot)
	if abiErr != nil || captureErr != nil {
		parts := make([]string, 0, 2)
		if abiErr != nil {
			parts = append(parts, "ABI: "+abiErr.Error())
		}
		if captureErr != nil {
			parts = append(parts, "capture: "+captureErr.Error())
		}
		return Report{}, errors.New("effects qualification failed: " + strings.Join(parts, "; "))
	}

	inputsAfter, err := hashInputs(absRoot)
	if err != nil {
		return Report{}, fmt.Errorf("hash inputs after validation: %w", err)
	}
	if !sameInputPins(inputsBefore, inputsAfter) {
		return Report{}, errors.New("input files changed during effects qualification")
	}
	for _, source := range sourcePins {
		wantPath := "source/" + source.path
		found := false
		for _, input := range inputsAfter {
			if input.Path == wantPath {
				found = input.Bytes == source.pin.Bytes && input.SHA256 == source.pin.SHA256
				break
			}
		}
		if !found {
			return Report{}, fmt.Errorf("source identity inventory changed after pin check at %s", wantPath)
		}
	}

	return Report{
		Schema:         "gobi.module-effects-qualification-report/v1",
		SourceCommit:   identity.Head,
		SourceIdentity: identity,
		Inputs:         inputsBefore,
		Capture:        capture,
		ABI:            ABICheck{Status: "passed", Builds: 4, Pairs: 2},
		Scope: []string{
			"source pin manifests were checked against every regular byte in source/; source identity booleans were consistency checks, not standalone proof",
			"the source commit is a canonical, internally consistent identifier; this offline report does not authenticate Git history or verifier-build provenance",
			"four React/DOM parent/child build trees and two ABI pairs were checked from exact AppIR and generated artifact bytes",
			"build manifests and result metadata are hashed but do not prove a compiler invocation; this verifier does not execute or authenticate the compiler toolchain",
			"closed request and cancellation capabilities are checked against child ABI and Go-replayed effect captures",
			"Go-native capture validation recomputes replay and checks captured states, effects, trees, DOM, disabled values, and finite ordering profiles",
			"the verifier does not launch a browser or treat producer mutation-control booleans as Go-executed negative-control proof",
		},
	}, nil
}

func requireEffectSourcePaths(pins []namedSourcePin) error {
	available := make(map[string]struct{}, len(pins))
	for _, source := range pins {
		available[source.path] = struct{}{}
	}
	for _, name := range requiredEffectSourcePaths {
		if _, ok := available[name]; !ok {
			return fmt.Errorf("required source pin %q is absent", name)
		}
	}
	return nil
}

func sameInputPins(a, b []InputPin) bool {
	if len(a) != len(b) {
		return false
	}
	for index := range a {
		if a[index] != b[index] {
			return false
		}
	}
	return true
}
