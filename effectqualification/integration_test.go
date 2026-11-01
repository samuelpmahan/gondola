package effectqualification

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

const (
	qualificationInputEnv = "GOBI_EFFECTS_QUALIFICATION_INPUT"
	pr23FixtureAttempt    = "attempt-20261101T042914069Z-2-7d158b7a"
	pr23SourceCommit      = "e0933465725e470dc610e3f81b4bbee95538c1d0"
)

// TestPR23DirectoryIsAccepted exercises the public directory API against the
// immutable PR23 producer bundle. Callers may point the test at an unpacked
// copy; clean checkouts without the bundled attempt skip only these integration
// checks, while an explicitly supplied missing path remains an error.
func TestPR23DirectoryIsAccepted(t *testing.T) {
	root := effectsQualificationInput(t)
	report, err := VerifyDirectory(root)
	if err != nil {
		t.Fatalf("VerifyDirectory rejected the unmodified PR23 bundle: %v", err)
	}
	expectedSourceCommit := os.Getenv("GOBI_EFFECTS_EXPECTED_SOURCE_COMMIT")
	if expectedSourceCommit == "" {
		expectedSourceCommit = pr23SourceCommit
	}
	if report.SourceCommit != expectedSourceCommit {
		t.Fatalf("source commit = %q, want %q", report.SourceCommit, expectedSourceCommit)
	}
	capture := report.Capture
	if capture.Scenarios != 4 || capture.Profiles != 20 || capture.Events != 178 ||
		capture.States != 182 || capture.Effects != 58 || capture.TransportEvents != 116 {
		t.Fatalf("capture report does not describe the complete PR23 suite: %+v", capture)
	}
	if !reflect.DeepEqual(capture.Seeds, []int{20261104, 20261105, 20261106}) {
		t.Fatalf("seed set = %v, want [20261104 20261105 20261106]", capture.Seeds)
	}
	if report.ABI.Status != "passed" || report.ABI.Builds != 4 || report.ABI.Pairs != 2 {
		t.Fatalf("four-build/two-pair ABI check missing from report: %+v", report.ABI)
	}
}

// TestPR23OrderingAPIHasPositiveControls verifies each renderer/backend
// profile against its native replay before the negative controls exercise the
// ordering checker. In particular, browser.swap covers lifecycle continuity
// across renderer epochs and retained asynchronous callbacks.
func TestPR23OrderingAPIHasPositiveControls(t *testing.T) {
	root := effectsQualificationInput(t)
	const scenario = "literal"
	native := readQualificationJSONMap(t, filepath.Join(root, "conformance", "effects."+scenario+".native.json"))
	profiles := []string{"direct.react", "direct.dom", "browser.react", "browser.dom", "browser.swap"}
	for _, profile := range profiles {
		t.Run(profile, func(t *testing.T) {
			actual := readQualificationJSONMap(t, filepath.Join(root, "conformance", "effects."+scenario+"."+profile+".json"))
			if err := CheckOrdering(native, actual); err != nil {
				t.Fatalf("CheckOrdering rejected actual PR23 %s capture: %v", profile, err)
			}
		})
	}
}

func effectsQualificationInput(t *testing.T) string {
	t.Helper()
	explicitRoot := os.Getenv(qualificationInputEnv)
	source := ""
	if explicitRoot == "" {
		_, callerSource, _, ok := runtime.Caller(0)
		if !ok {
			t.Fatal("cannot locate integration fixture relative to test source")
		}
		source = callerSource
	}
	root, available, err := resolveEffectsQualificationInput(explicitRoot, source)
	if err != nil {
		t.Fatalf("resolve %s=%q: %v", qualificationInputEnv, explicitRoot, err)
	}
	if !available {
		t.Skipf("default PR23 fixture is absent at %q; set %s to an attempt directory to run the integration checks", root, qualificationInputEnv)
	}
	return root
}

func resolveEffectsQualificationInput(explicitRoot, sourceFile string) (string, bool, error) {
	if explicitRoot != "" {
		root, err := filepath.Abs(explicitRoot)
		if err != nil {
			return "", false, err
		}
		info, err := os.Stat(root)
		if err != nil {
			return "", false, errors.New(qualificationInputEnv + " must name an existing PR23 attempt directory: " + err.Error())
		}
		if !info.IsDir() {
			return "", false, errors.New(qualificationInputEnv + " must name an existing PR23 attempt directory: path is not a directory")
		}
		return root, true, nil
	}
	if sourceFile == "" {
		return "", false, errors.New("cannot locate integration fixture relative to test source")
	}
	root, err := filepath.Abs(filepath.Join(filepath.Dir(sourceFile), "..", "compiled-module-effects", "output", "attempts", pr23FixtureAttempt))
	if err != nil {
		return "", false, err
	}
	info, err := os.Stat(root)
	if errors.Is(err, os.ErrNotExist) {
		return root, false, nil
	}
	if err != nil {
		return "", false, errors.New("inspect default PR23 fixture: " + err.Error())
	}
	if !info.IsDir() {
		return "", false, errors.New("default PR23 fixture exists but is not a directory: " + root)
	}
	return root, true, nil
}

func readQualificationJSONMap(t *testing.T, path string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read JSON map %s: %v", path, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		t.Fatalf("decode JSON map %s: %v", path, err)
	}
	return value
}
