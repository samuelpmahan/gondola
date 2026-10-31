// Package modulequalification composes the finite native checks for captured
// independently compiled module runs.
package modulequalification

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulechild"
	"github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent"
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	"github.com/samuelpmahan/gondola/gobi"
)

const (
	captureScenarioSchema = "gobi.compiled-modules-scenario/v1"
	captureNativeSchema   = "gobi.compiled-modules-native/v1"
	captureDirectSchema   = "gobi.compiled-modules-direct/v1"
	captureBrowserSchema  = "gobi.compiled-modules-browser/v1"
	captureFixtureName    = "independent-module-pair-v1"
	fixedScenarioSHA256   = "9b99a2d7ac7f9d044bcc590414787ea4a9d934f180503a45aac7684778f94539"
	maxCaptureFileBytes   = 96 << 20
	parentStateTypeID     = "github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent.State"
	childStateTypeID      = "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild.State"
	counterStateTypeID    = "github.com/samuelpmahan/gondola/counter.State"
)

// CaptureReport summarizes only capture families whose source events and Go
// state transitions have been independently replayed by CheckCaptures.
// MutationControls remains zero: captured producer claims are not Go-run tests.
type CaptureReport struct {
	Profiles         int   `json:"profiles"`
	Events           int   `json:"events"`
	Updates          int   `json:"updates"`
	Seeds            []int `json:"seeds"`
	MutationControls int   `json:"mutationControls"`
}

type moduleScenario struct {
	Schema string          `json:"schema"`
	Name   string          `json:"name"`
	Events []scenarioEvent `json:"events"`
}

type scenarioEvent struct {
	Kind        string                         `json:"kind"`
	Target      string                         `json:"target,omitempty"`
	Action      *compilercontract.Action       `json:"action,omitempty"`
	Message     *compilercontract.MessageValue `json:"message,omitempty"`
	From        string                         `json:"from,omitempty"`
	To          string                         `json:"to,omitempty"`
	Expect      string                         `json:"expect,omitempty"`
	SourceEvent *int                           `json:"sourceEvent,omitempty"`
}

type captureExpectations struct {
	Schema   string `json:"schema"`
	Scenario struct {
		Schema           string `json:"schema"`
		Name             string `json:"name"`
		SourceEvents     int    `json:"sourceEvents"`
		GoUpdates        int    `json:"goUpdates"`
		StateCheckpoints int    `json:"stateCheckpoints"`
	} `json:"scenario"`
	Seeded struct {
		Seeds                  []int    `json:"seeds"`
		EventsPerSeed          int      `json:"eventsPerSeed"`
		BrowserProfilesPerSeed []string `json:"browserProfilesPerSeed"`
	} `json:"seeded"`
	Profiles                []string `json:"profiles"`
	OracleModule            string   `json:"oracleModule"`
	LiteralProjectionPolicy string   `json:"literalProjectionPolicy"`
}

type nativeBridge struct {
	Call        string                  `json:"call"`
	Input       *modulewire.Input       `json:"input"`
	Publication *modulewire.Publication `json:"publication"`
}

type nativeEvent struct {
	EventIndex  int                            `json:"eventIndex"`
	Kind        string                         `json:"kind"`
	Target      string                         `json:"target,omitempty"`
	Action      *compilercontract.Action       `json:"action,omitempty"`
	Message     *compilercontract.MessageValue `json:"message"`
	Disabled    *bool                          `json:"disabled,omitempty"`
	From        string                         `json:"from,omitempty"`
	To          string                         `json:"to,omitempty"`
	Expect      string                         `json:"expect,omitempty"`
	SourceEvent *int                           `json:"sourceEvent,omitempty"`
	StepIndex   *int                           `json:"stepIndex"`
}

type nativeCheckpoint struct {
	ParentState moduleparent.State          `json:"parentState"`
	ChildState  modulechild.State           `json:"childState"`
	ParentView  compilercontract.NodeRecord `json:"parentView"`
	ChildView   compilercontract.NodeRecord `json:"childView"`
	Bridges     []nativeBridge              `json:"bridges"`
}

type nativeStep struct {
	EventIndex  int                            `json:"eventIndex"`
	Kind        string                         `json:"kind"`
	Target      string                         `json:"target"`
	Message     compilercontract.MessageValue  `json:"message"`
	Effects     []compilercontract.EffectValue `json:"effects"`
	Bridges     []nativeBridge                 `json:"bridges"`
	ParentState moduleparent.State             `json:"parentState"`
	ChildState  modulechild.State              `json:"childState"`
	ParentView  compilercontract.NodeRecord    `json:"parentView"`
	ChildView   compilercontract.NodeRecord    `json:"childView"`
}

type nativeCapture struct {
	Schema  string           `json:"schema"`
	Name    string           `json:"name"`
	Events  []nativeEvent    `json:"events"`
	Initial nativeCheckpoint `json:"initial"`
	Steps   []nativeStep     `json:"steps"`
}

type domPair struct {
	Parent compilercontract.DOMSnapshot `json:"parent"`
	Child  compilercontract.DOMSnapshot `json:"child"`
}

type directCounts struct {
	ParentInit   int `json:"parentInit"`
	ChildInit    int `json:"childInit"`
	ParentUpdate int `json:"parentUpdate"`
	ChildUpdate  int `json:"childUpdate"`
	Output       int `json:"output"`
	Input        int `json:"input"`
	Publication  int `json:"publication"`
	Receive      int `json:"receive"`
}

type roleCounts struct {
	ParentInit   int `json:"parentInit"`
	ChildInit    int `json:"childInit"`
	ParentUpdate int `json:"parentUpdate"`
	ChildUpdate  int `json:"childUpdate"`
	ParentView   int `json:"parentView"`
	ChildView    int `json:"childView"`
	Output       int `json:"output"`
	Input        int `json:"input"`
	Publication  int `json:"publication"`
	Receive      int `json:"receive"`
}

type logicalState struct {
	StateIndex       int
	SourceEventIndex *int
	Parent           moduleparent.State
	Child            modulechild.State
	ParentView       compilercontract.NodeRecord
	ChildView        compilercontract.NodeRecord
	ParentDOM        compilercontract.DOMSnapshot
	ChildDOM         compilercontract.DOMSnapshot
	Bridges          []nativeBridge
	BrowserBridges   []browserBridge
	EventCalls       []callOrderRecord
	Counts           roleCounts
	ParentValue      compilercontract.Value
	ChildValue       compilercontract.Value
}

type replayResult struct {
	Script              moduleScenario
	Initial             nativeCheckpoint
	Events              []nativeEvent
	Steps               []nativeStep
	States              []logicalState // initial plus one entry per dispatched Go Update
	EventStateIndexes   []int          // state index after each source event
	EventBridges        [][]nativeBridge
	EventCalls          [][]callOrderRecord
	EventBrowserBridges [][]browserBridge
	CallCounts          directCounts
	BrowserBridges      []browserBridge
	BrowserCallOrder    []callOrderRecord
	FinalRenderer       string
}

type browserBridge struct {
	Sequence int    `json:"sequence"`
	Role     string `json:"role"`
	Owner    string `json:"owner"`
	Input    any    `json:"input"`
	Output   any    `json:"output"`
}

type callOrderRecord struct {
	Sequence int    `json:"sequence"`
	Owner    string `json:"owner"`
	Role     string `json:"role"`
}

type seedSummaryRecord struct {
	Seed              int      `json:"seed"`
	Events            int      `json:"events"`
	GoUpdates         int      `json:"goUpdates"`
	StateCheckpoints  int      `json:"stateCheckpoints"`
	NativeTraceSHA256 string   `json:"nativeTraceSHA256"`
	Generator         string   `json:"generator"`
	BrowserProfiles   []string `json:"browserProfiles"`
	BrowserMounted    bool     `json:"browserMounted"`
	Status            string   `json:"status"`
}

type browserProfileIndex struct {
	Schema      string `json:"schema"`
	CapturePath string `json:"capturePath"`
	Profiles    map[string]struct {
		SourceEvents   int    `json:"sourceEvents"`
		Updates        int    `json:"updates"`
		Checkpoints    int    `json:"checkpoints"`
		InitialBackend string `json:"initialBackend"`
		FinalBackend   string `json:"finalBackend"`
		Failures       int    `json:"failures"`
	} `json:"profiles"`
	SeededProfiles      []string `json:"seededProfiles"`
	BrowserProfileCount int      `json:"browserProfileCount"`
}

// CheckCaptures validates the fixed scenario and three deterministic seeds.
// It runs the real Go parent and child roles in-process, derives their views and
// DOM projections, then checks native, direct React/DOM, and all 12 mounted
// browser captures against those independently computed values.
func CheckCaptures(root string) (CaptureReport, error) {
	bundleRoot, conformanceRoot, err := captureRoots(root)
	if err != nil {
		return CaptureReport{}, err
	}
	canonicalScenarioBytes, err := captureReadRegularFile(bundleRoot, "source/fixtures/compiled/moduleparent/scenario.json", maxCaptureFileBytes)
	if err != nil {
		return CaptureReport{}, fmt.Errorf("canonical source fixture: %w", err)
	}
	canonicalScenarioHash := sha256.Sum256(canonicalScenarioBytes)
	if fmt.Sprintf("%x", canonicalScenarioHash) != fixedScenarioSHA256 {
		return CaptureReport{}, errors.New("canonical fixed scenario bytes differ from the pinned 24-event fixture")
	}

	var expectations captureExpectations
	if err := decodeCaptureFile(bundleRoot, "source/compiled-modules/oracle/expectations.json", &expectations); err != nil {
		return CaptureReport{}, fmt.Errorf("source/compiled-modules/oracle/expectations.json: %w", err)
	}
	if err := validateCaptureExpectations(expectations); err != nil {
		return CaptureReport{}, err
	}

	var fixedScript moduleScenario
	if err := decodeCaptureFile(bundleRoot, "source/fixtures/compiled/moduleparent/scenario.json", &fixedScript); err != nil {
		return CaptureReport{}, fmt.Errorf("source/fixtures/compiled/moduleparent/scenario.json: %w", err)
	}
	if fixedScript.Name != expectations.Scenario.Name {
		return CaptureReport{}, fmt.Errorf("source/fixtures/compiled/moduleparent/scenario.json.name = %q, expected %q", fixedScript.Name, expectations.Scenario.Name)
	}
	var fixedInputCopy moduleScenario
	if err := decodeCaptureFile(conformanceRoot, "module-pair.inputs.fixed.scenario.json", &fixedInputCopy); err != nil {
		return CaptureReport{}, fmt.Errorf("conformance/module-pair.inputs.fixed.scenario.json: %w", err)
	}
	if !reflect.DeepEqual(fixedInputCopy, fixedScript) {
		return CaptureReport{}, errors.New("conformance fixed scenario differs from the canonical source fixture")
	}
	fixed, err := replayScenario(fixedScript)
	if err != nil {
		return CaptureReport{}, fmt.Errorf("fixed Go replay: %w", err)
	}
	if len(fixed.Events) != expectations.Scenario.SourceEvents || len(fixed.Steps) != expectations.Scenario.GoUpdates || len(fixed.States) != expectations.Scenario.StateCheckpoints {
		return CaptureReport{}, fmt.Errorf("fixed Go replay counts = events %d, updates %d, checkpoints %d; expected %d, %d, %d", len(fixed.Events), len(fixed.Steps), len(fixed.States), expectations.Scenario.SourceEvents, expectations.Scenario.GoUpdates, expectations.Scenario.StateCheckpoints)
	}

	var native nativeCapture
	if err := decodeNativeCaptureFile(conformanceRoot, "module-pair.fixed.native.json", &native); err != nil {
		return CaptureReport{}, fmt.Errorf("conformance/module-pair.fixed.native.json: %w", err)
	}
	if err := checkNativeCapture("conformance/module-pair.fixed.native.json", native, fixed); err != nil {
		return CaptureReport{}, err
	}

	fixedDirect, err := decodeObjectFile(conformanceRoot, "module-pair.fixed.direct.json")
	if err != nil {
		return CaptureReport{}, fmt.Errorf("conformance/module-pair.fixed.direct.json: %w", err)
	}
	if err := checkDirectPair("conformance/module-pair.fixed.direct.json", fixedDirect, fixed, fixedScript.Name); err != nil {
		return CaptureReport{}, err
	}

	browser, err := decodeObjectFile(conformanceRoot, "module-pair.browser.json")
	if err != nil {
		return CaptureReport{}, fmt.Errorf("conformance/module-pair.browser.json: %w", err)
	}
	if err := checkBrowserHeader(browser, fixedScript.Name); err != nil {
		return CaptureReport{}, err
	}

	var profileIndex browserProfileIndex
	if err := decodeCaptureFile(conformanceRoot, "module-pair.fixed.browser-profiles.json", &profileIndex); err != nil {
		return CaptureReport{}, fmt.Errorf("conformance/module-pair.fixed.browser-profiles.json: %w", err)
	}
	if err := checkFixedProfileIndex(profileIndex, fixed); err != nil {
		return CaptureReport{}, err
	}

	browserProfiles, err := objectField(browser, "profiles", "conformance/module-pair.browser.json")
	if err != nil {
		return CaptureReport{}, err
	}
	fixedProfiles, err := objectField(browserProfiles, "", "conformance/module-pair.browser.json.profiles")
	if err != nil {
		return CaptureReport{}, err
	}
	for _, name := range []string{"react", "dom", "swap"} {
		profile, err := rawField(fixedProfiles, name, "conformance/module-pair.browser.json.profiles")
		if err != nil {
			return CaptureReport{}, err
		}
		if err := checkBrowserProfile("conformance/module-pair.browser.json.profiles."+name, profile, fixed, name, nil); err != nil {
			return CaptureReport{}, err
		}
	}

	seedDirect, err := decodeObjectFile(conformanceRoot, "module-pair.seeded.direct.json")
	if err != nil {
		return CaptureReport{}, fmt.Errorf("conformance/module-pair.seeded.direct.json: %w", err)
	}
	seededProfiles, err := objectField(browserProfiles, "seeded", "conformance/module-pair.browser.json.profiles")
	if err != nil {
		return CaptureReport{}, err
	}
	var seededSummary []seedSummaryRecord
	if err := decodeCaptureFile(conformanceRoot, "module-pair.seeded.summary.json", &seededSummary); err != nil {
		return CaptureReport{}, fmt.Errorf("conformance/module-pair.seeded.summary.json: %w", err)
	}
	if len(seededSummary) != len(expectations.Seeded.Seeds) {
		return CaptureReport{}, fmt.Errorf("conformance/module-pair.seeded.summary.json has %d seeds, want %d", len(seededSummary), len(expectations.Seeded.Seeds))
	}

	report := CaptureReport{Profiles: 3, Events: len(fixed.Events), Updates: len(fixed.Steps), Seeds: append([]int{}, expectations.Seeded.Seeds...), MutationControls: 0}
	for seedIndex, seed := range expectations.Seeded.Seeds {
		seedName := strconv.Itoa(seed)
		scenarioPath := fmt.Sprintf("module-pair.inputs.seed-%d.scenario.json", seed)
		var script moduleScenario
		if err := decodeCaptureFile(conformanceRoot, scenarioPath, &script); err != nil {
			return CaptureReport{}, fmt.Errorf("conformance/%s: %w", scenarioPath, err)
		}
		if script.Name != fmt.Sprintf("seeded-module-pair-%d", seed) {
			return CaptureReport{}, fmt.Errorf("conformance/%s.name = %q, want seeded-module-pair-%d", scenarioPath, script.Name, seed)
		}
		if len(script.Events) != expectations.Seeded.EventsPerSeed {
			return CaptureReport{}, fmt.Errorf("conformance/%s.events has %d entries, want %d", scenarioPath, len(script.Events), expectations.Seeded.EventsPerSeed)
		}
		if generated := generateCaptureSeedScenario(seed, expectations.Seeded.EventsPerSeed); !reflect.DeepEqual(generated, script) {
			return CaptureReport{}, fmt.Errorf("conformance/%s does not match the frozen uint32 seeded action generator", scenarioPath)
		}
		replayed, err := replayScenario(script)
		if err != nil {
			return CaptureReport{}, fmt.Errorf("seed %d Go replay: %w", seed, err)
		}
		nativePath := fmt.Sprintf("module-pair.seed-%d.native.json", seed)
		var seedNative nativeCapture
		if err := decodeNativeCaptureFile(conformanceRoot, nativePath, &seedNative); err != nil {
			return CaptureReport{}, fmt.Errorf("conformance/%s: %w", nativePath, err)
		}
		if err := checkNativeCapture("conformance/"+nativePath, seedNative, replayed); err != nil {
			return CaptureReport{}, err
		}
		seedRaw, err := rawField(seedDirect, seedName, "conformance/module-pair.seeded.direct.json")
		if err != nil {
			return CaptureReport{}, err
		}
		seedPair, err := decodeRawObject(seedRaw, "conformance/module-pair.seeded.direct.json."+seedName)
		if err != nil {
			return CaptureReport{}, err
		}
		if err := checkDirectPair("conformance/module-pair.seeded.direct.json."+seedName, seedPair, replayed, script.Name); err != nil {
			return CaptureReport{}, err
		}
		if err := checkSeedSummary(conformanceRoot, seededSummary[seedIndex], seed, replayed, nativePath); err != nil {
			return CaptureReport{}, err
		}

		for _, backend := range expectations.Seeded.BrowserProfilesPerSeed {
			profileName := fmt.Sprintf("seed-%d-%s", seed, backend)
			profile, err := rawField(seededProfiles, profileName, "conformance/module-pair.browser.json.profiles.seeded")
			if err != nil {
				return CaptureReport{}, err
			}
			if err := checkBrowserProfile("conformance/module-pair.browser.json.profiles.seeded."+profileName, profile, replayed, backend, &seed); err != nil {
				return CaptureReport{}, err
			}
			report.Profiles++
		}
		report.Events += len(replayed.Events)
		report.Updates += len(replayed.Steps)
	}
	if report.Profiles != 12 {
		return CaptureReport{}, fmt.Errorf("validated %d browser profiles, want 12", report.Profiles)
	}
	return report, nil
}

func captureRoots(input string) (string, string, error) {
	if strings.TrimSpace(input) == "" {
		return "", "", errors.New("module capture root is required")
	}
	absolute, err := filepath.Abs(input)
	if err != nil {
		return "", "", fmt.Errorf("resolve capture root: %w", err)
	}
	info, err := os.Lstat(absolute)
	if err != nil {
		return "", "", fmt.Errorf("inspect capture root %q: %w", absolute, err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return "", "", fmt.Errorf("capture root %q must be a real directory", absolute)
	}
	bundleRoot := absolute
	conformanceRoot := filepath.Join(absolute, "conformance")
	if filepath.Base(absolute) == "conformance" {
		conformanceRoot = absolute
		bundleRoot = filepath.Dir(absolute)
	}
	conformanceInfo, err := os.Lstat(conformanceRoot)
	if err != nil {
		return "", "", fmt.Errorf("inspect conformance directory %q: %w", conformanceRoot, err)
	}
	if conformanceInfo.Mode()&os.ModeSymlink != 0 || !conformanceInfo.IsDir() {
		return "", "", fmt.Errorf("conformance path %q must be a real directory", conformanceRoot)
	}
	bundleInfo, err := os.Lstat(bundleRoot)
	if err != nil {
		return "", "", fmt.Errorf("inspect bundle directory %q: %w", bundleRoot, err)
	}
	if bundleInfo.Mode()&os.ModeSymlink != 0 || !bundleInfo.IsDir() {
		return "", "", fmt.Errorf("bundle path %q must be a real directory", bundleRoot)
	}
	return bundleRoot, conformanceRoot, nil
}

func validateCaptureExpectations(value captureExpectations) error {
	if value.Schema != "gobi.compiled-modules-oracle-expectations/v1" || value.Scenario.Schema != captureScenarioSchema || value.Scenario.Name != captureFixtureName {
		return errors.New("source oracle expectations have an unsupported schema or fixed scenario identity")
	}
	if value.Scenario.SourceEvents != 24 || value.Scenario.GoUpdates != 16 || value.Scenario.StateCheckpoints != 17 {
		return fmt.Errorf("source oracle fixed counts must be 24 events, 16 updates, 17 checkpoints; got %d, %d, %d", value.Scenario.SourceEvents, value.Scenario.GoUpdates, value.Scenario.StateCheckpoints)
	}
	if !reflect.DeepEqual(value.Profiles, []string{"react", "dom", "swap"}) {
		return fmt.Errorf("source oracle profiles = %v, want [react dom swap]", value.Profiles)
	}
	if !reflect.DeepEqual(value.Seeded.Seeds, []int{20261031, 20261032, 20261033}) || value.Seeded.EventsPerSeed != 40 || !reflect.DeepEqual(value.Seeded.BrowserProfilesPerSeed, []string{"react", "dom", "swap"}) {
		return errors.New("source oracle seeded profile contract is not the three 40-event React/DOM/swap seeds")
	}
	if value.OracleModule != "oracle.mjs" || strings.TrimSpace(value.LiteralProjectionPolicy) == "" {
		return errors.New("source oracle expectations lack the independent literal projection declaration")
	}
	return nil
}

func decodeCaptureFile(root, relative string, out any) error {
	data, err := captureReadRegularFile(root, filepath.ToSlash(relative), maxCaptureFileBytes)
	if err != nil {
		return err
	}
	if err := DecodeStrict(data, out); err != nil {
		return err
	}
	return nil
}

// decodeNativeCaptureFile checks JSON field presence before decoding typed
// native states. encoding/json otherwise turns absent or null scalar fields
// into valid zero values, which can make an incomplete state look correct
// when its expected value is zero or false.
func decodeNativeCaptureFile(root, relative string, out *nativeCapture) error {
	data, err := captureReadRegularFile(root, filepath.ToSlash(relative), maxCaptureFileBytes)
	if err != nil {
		return err
	}
	if err := validateCaptureJSONFields(data, reflect.TypeOf(nativeCapture{}), relative); err != nil {
		return err
	}
	if err := DecodeStrict(data, out); err != nil {
		return err
	}
	return nil
}

// validateCaptureJSONFields requires every non-omitempty struct field to be
// present and rejects null for scalar or struct values before typed decoding.
// Nullable pointer fields and nil slices remain representable where the Go
// capture types explicitly allow them; subsequent replay comparison checks
// their actual expected values.
func validateCaptureJSONFields(data []byte, typ reflect.Type, path string) error {
	if typ.Kind() == reflect.Pointer {
		if strings.TrimSpace(string(data)) == "null" {
			return nil
		}
		return validateCaptureJSONFields(data, typ.Elem(), path)
	}
	switch typ.Kind() {
	case reflect.Struct:
		var object map[string]json.RawMessage
		if err := DecodeStrict(data, &object); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		if object == nil {
			return fmt.Errorf("%s must be an object", path)
		}
		for index := 0; index < typ.NumField(); index++ {
			field := typ.Field(index)
			if field.PkgPath != "" {
				continue
			}
			name, omitEmpty := captureJSONField(field)
			if name == "-" {
				continue
			}
			value, present := object[name]
			fieldPath := path + "." + name
			if !present {
				if omitEmpty {
					continue
				}
				return fmt.Errorf("%s is missing", fieldPath)
			}
			if err := validateCaptureJSONFields(value, field.Type, fieldPath); err != nil {
				return err
			}
		}
	case reflect.Slice, reflect.Array:
		if strings.TrimSpace(string(data)) == "null" {
			if typ.Kind() == reflect.Slice {
				return nil
			}
			return fmt.Errorf("%s must be an array", path)
		}
		var values []json.RawMessage
		if err := DecodeStrict(data, &values); err != nil {
			return fmt.Errorf("%s must be an array: %w", path, err)
		}
		if typ.Kind() == reflect.Array && len(values) != typ.Len() {
			return fmt.Errorf("%s has %d elements, want %d", path, len(values), typ.Len())
		}
		for index, value := range values {
			if err := validateCaptureJSONFields(value, typ.Elem(), fmt.Sprintf("%s[%d]", path, index)); err != nil {
				return err
			}
		}
	case reflect.Map:
		if strings.TrimSpace(string(data)) == "null" {
			return nil
		}
		var object map[string]json.RawMessage
		if err := DecodeStrict(data, &object); err != nil {
			return fmt.Errorf("%s must be an object: %w", path, err)
		}
		for key, value := range object {
			if err := validateCaptureJSONFields(value, typ.Elem(), path+"."+key); err != nil {
				return err
			}
		}
	default:
		if strings.TrimSpace(string(data)) == "null" {
			return fmt.Errorf("%s must not be null", path)
		}
	}
	return nil
}

func captureJSONField(field reflect.StructField) (string, bool) {
	parts := strings.Split(field.Tag.Get("json"), ",")
	name := parts[0]
	if name == "" {
		name = field.Name
	}
	omitEmpty := false
	for _, option := range parts[1:] {
		if option == "omitempty" {
			omitEmpty = true
		}
	}
	return name, omitEmpty
}

func decodeObjectFile(root, relative string) (map[string]json.RawMessage, error) {
	data, err := captureReadRegularFile(root, filepath.ToSlash(relative), maxCaptureFileBytes)
	if err != nil {
		return nil, err
	}
	return decodeRawObject(data, filepath.ToSlash(relative))
}

func decodeRawObject(data []byte, path string) (map[string]json.RawMessage, error) {
	var object map[string]json.RawMessage
	if err := DecodeStrict(data, &object); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if object == nil {
		return nil, fmt.Errorf("%s must be a JSON object", path)
	}
	return object, nil
}

func rawField(object map[string]json.RawMessage, key, path string) (json.RawMessage, error) {
	value, ok := object[key]
	if !ok {
		return nil, fmt.Errorf("%s.%s is missing", path, key)
	}
	return value, nil
}

func objectField(object map[string]json.RawMessage, key, path string) (map[string]json.RawMessage, error) {
	if key == "" {
		return object, nil
	}
	raw, err := rawField(object, key, path)
	if err != nil {
		return nil, err
	}
	return decodeRawObject(raw, path+"."+key)
}

func checkAllowedKeys(object map[string]json.RawMessage, path string, allowed ...string) error {
	set := make(map[string]bool, len(allowed))
	for _, key := range allowed {
		set[key] = true
	}
	keys := make([]string, 0, len(object))
	for key := range object {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if !set[key] {
			return fmt.Errorf("%s has unknown field %q", path, key)
		}
	}
	return nil
}

func validateScenario(script moduleScenario) error {
	if script.Schema != captureScenarioSchema || script.Name == "" || script.Events == nil {
		return errors.New("scenario must have the compiled-modules schema, name, and non-null events array")
	}
	return nil
}

func readJSONNumber(data json.RawMessage, path string) (int, error) {
	var value json.Number
	if err := DecodeStrict(data, &value); err != nil {
		return 0, fmt.Errorf("%s: %w", path, err)
	}
	parsed, err := value.Int64()
	if err != nil || int64(int(parsed)) != parsed {
		return 0, fmt.Errorf("%s must be an integer", path)
	}
	return int(parsed), nil
}

func rawNullableInt(data json.RawMessage, path string) (*int, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("%s is missing", path)
	}
	if strings.TrimSpace(string(data)) == "null" {
		return nil, nil
	}
	value, err := readJSONNumber(data, path)
	if err != nil {
		return nil, err
	}
	return &value, nil
}

func captureStringField(object map[string]json.RawMessage, key, path string) (string, error) {
	raw, err := rawField(object, key, path)
	if err != nil {
		return "", err
	}
	var value string
	if err := DecodeStrict(raw, &value); err != nil {
		return "", fmt.Errorf("%s.%s: %w", path, key, err)
	}
	return value, nil
}

func checkStringField(object map[string]json.RawMessage, key, path, want string) error {
	raw, err := rawField(object, key, path)
	if err != nil {
		return err
	}
	var got string
	if err := DecodeStrict(raw, &got); err != nil {
		return fmt.Errorf("%s.%s: %w", path, key, err)
	}
	if got != want {
		return fmt.Errorf("%s.%s = %q, want %q", path, key, got, want)
	}
	return nil
}

// replayScenario runs only the real Go application roles. It does not consume
// any captured state, event resolution, or rendered output as an input.
func replayScenario(script moduleScenario) (replayResult, error) {
	if err := validateScenario(script); err != nil {
		return replayResult{}, err
	}
	parent := moduleparent.Init()
	child := modulechild.Init()
	bridges := []nativeBridge{{Call: "parent.Init"}, {Call: "child.Init"}}
	input := moduleparent.Output(parent)
	bridges = append(bridges, nativeBridge{Call: "parent.Output", Input: inputPointer(input)})
	child = modulechild.Input(child, input)
	bridges = append(bridges, nativeBridge{Call: "child.Input", Input: inputPointer(input)})
	publication := modulechild.Publication(child)
	bridges = append(bridges, nativeBridge{Call: "child.Publication", Publication: publicationPointer(publication)})
	parent = moduleparent.Receive(parent, publication)
	bridges = append(bridges, nativeBridge{Call: "parent.Receive", Publication: publicationPointer(publication)})
	initial, err := makeLogicalState(0, nil, parent, child, bridges)
	if err != nil {
		return replayResult{}, err
	}
	result := replayResult{
		Script:  script,
		Initial: nativeCheckpoint{ParentState: parent, ChildState: child, ParentView: initial.ParentView, ChildView: initial.ChildView, Bridges: bridges},
		Events:  make([]nativeEvent, 0, len(script.Events)), Steps: make([]nativeStep, 0, len(script.Events)),
		States: []logicalState{initial}, EventStateIndexes: make([]int, len(script.Events)),
		EventBridges: make([][]nativeBridge, len(script.Events)), EventCalls: make([][]callOrderRecord, len(script.Events)), EventBrowserBridges: make([][]browserBridge, len(script.Events)),
		CallCounts: directCounts{ParentInit: 1, ChildInit: 1, Output: 1, Input: 1, Publication: 1, Receive: 1},
	}
	result.BrowserCallOrder = []callOrderRecord{
		{Sequence: 0, Owner: "parent", Role: "Init"}, {Sequence: 1, Owner: "child", Role: "Init"},
		{Sequence: 2, Owner: "parent", Role: "output"}, {Sequence: 3, Owner: "child", Role: "input"},
		{Sequence: 4, Owner: "child", Role: "publication"}, {Sequence: 5, Owner: "parent", Role: "receive"},
		{Sequence: 6, Owner: "parent", Role: "View"}, {Sequence: 7, Owner: "child", Role: "View"},
	}
	result.BrowserBridges = []browserBridge{
		{Sequence: 0, Role: "output", Owner: "parent", Output: input},
		{Sequence: 1, Role: "input", Owner: "child", Input: input, Output: initial.ChildValue},
		{Sequence: 2, Role: "publication", Owner: "child", Output: publication},
		{Sequence: 3, Role: "receive", Owner: "parent", Input: publication, Output: initial.ParentValue},
	}
	currentRenderer := "dom"
	for eventIndex, event := range script.Events {
		result.EventBridges[eventIndex] = []nativeBridge{}
		result.EventCalls[eventIndex] = []callOrderRecord{}
		result.EventBrowserBridges[eventIndex] = []browserBridge{}
		msg, dispatch, disabled, stale, err := resolveCaptureEvent(parent, child, script.Events, eventIndex, event, currentRenderer)
		if err != nil {
			return replayResult{}, fmt.Errorf("event %d: %w", eventIndex, err)
		}
		entry := nativeEvent{EventIndex: eventIndex, Kind: event.Kind, Target: event.Target, Action: copyCaptureAction(event.Action), Message: nil,
			From: event.From, To: event.To, Expect: event.Expect, SourceEvent: copyCaptureInt(event.SourceEvent), StepIndex: nil}
		if disabled != nil {
			entry.Disabled = disabled
		}
		if event.Kind == "renderer-swap" && event.Expect == "accepted" {
			currentRenderer = event.To
		}
		if stale {
			// A saved callback is intentionally retired before dispatch.
			entry.Message = nil
		}
		result.EventStateIndexes[eventIndex] = len(result.States) - 1
		if dispatch {
			entry.Message = &msg
			stepBridges, callRows, parentAfter, childAfter, err := runCaptureUpdate(parent, child, event.Target, msg, &result.CallCounts)
			if err != nil {
				return replayResult{}, fmt.Errorf("event %d: %w", eventIndex, err)
			}
			parent, child = parentAfter, childAfter
			state, err := makeLogicalState(len(result.States), &eventIndex, parent, child, stepBridges)
			if err != nil {
				return replayResult{}, fmt.Errorf("event %d snapshot: %w", eventIndex, err)
			}
			result.States = append(result.States, state)
			result.EventStateIndexes[eventIndex] = state.StateIndex
			stepIndex := len(result.Steps)
			entry.StepIndex = &stepIndex
			result.Steps = append(result.Steps, nativeStep{EventIndex: eventIndex, Kind: event.Kind, Target: event.Target, Message: msg,
				Effects: []compilercontract.EffectValue{}, Bridges: stepBridges, ParentState: parent, ChildState: child,
				ParentView: state.ParentView, ChildView: state.ChildView})
			result.EventBridges[eventIndex] = stepBridges
			callRows = append(callRows, callOrderRecord{Owner: "parent", Role: "View"}, callOrderRecord{Owner: "child", Role: "View"})
			for callIndex := range callRows {
				callRows[callIndex].Sequence = len(result.BrowserCallOrder) + callIndex
			}
			result.EventCalls[eventIndex] = callRows
			result.BrowserCallOrder = append(result.BrowserCallOrder, callRows...)
			browserRows := browserBridgesForUpdate(len(result.BrowserBridges), event.Target, stepBridges, state)
			result.EventBrowserBridges[eventIndex] = browserRows
			result.BrowserBridges = append(result.BrowserBridges, browserRows...)
		}
		result.Events = append(result.Events, entry)
	}
	result.FinalRenderer = currentRenderer
	return result, nil
}

func makeLogicalState(index int, sourceEvent *int, parent moduleparent.State, child modulechild.State, bridges []nativeBridge) (logicalState, error) {
	parentNode, childNode := moduleparent.View(parent), modulechild.View(child)
	parentDOM, err := domSnapshot(parentNode)
	if err != nil {
		return logicalState{}, err
	}
	childDOM, err := domSnapshot(childNode)
	if err != nil {
		return logicalState{}, err
	}
	types := captureTypeInfos()
	parentValue, err := compilercontract.EncodeValue(parent, compilercontract.TypeID(parentStateTypeID), types)
	if err != nil {
		return logicalState{}, fmt.Errorf("encode parent Go state: %w", err)
	}
	childValue, err := compilercontract.EncodeValue(child, compilercontract.TypeID(childStateTypeID), types)
	if err != nil {
		return logicalState{}, fmt.Errorf("encode child Go state: %w", err)
	}
	return logicalState{StateIndex: index, SourceEventIndex: copyCaptureInt(sourceEvent), Parent: parent, Child: child,
		ParentView: compilercontract.NodeRecordFromGobi(parentNode), ChildView: compilercontract.NodeRecordFromGobi(childNode),
		ParentDOM: parentDOM, ChildDOM: childDOM, Bridges: append([]nativeBridge{}, bridges...),
		ParentValue: parentValue, ChildValue: childValue}, nil
}

func captureTypeInfos() []compilercontract.TypeInfo {
	intID, boolID, floatID := compilercontract.TypeID("int"), compilercontract.TypeID("bool"), compilercontract.TypeID("float64")
	return []compilercontract.TypeInfo{
		{ID: intID, Kind: compilercontract.KindInt, Bits: uint8(strconv.IntSize), JSRepresentation: compilercontract.JSNumber},
		{ID: boolID, Kind: compilercontract.KindBool, JSRepresentation: compilercontract.JSDirect},
		{ID: floatID, Kind: compilercontract.KindFloat64, JSRepresentation: compilercontract.JSNumber},
		{ID: compilercontract.TypeID(counterStateTypeID), Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Count", Type: floatID}}},
		{ID: compilercontract.TypeID(parentStateTypeID), Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{
			{Name: "Step", Type: intID}, {Name: "Locked", Type: boolID}, {Name: "Revision", Type: intID},
			{Name: "PublishedCount", Type: floatID}, {Name: "PublishedRevision", Type: intID},
		}},
		{ID: compilercontract.TypeID(childStateTypeID), Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{
			{Name: "Counter", Type: compilercontract.TypeID(counterStateTypeID)}, {Name: "Step", Type: intID},
			{Name: "Locked", Type: boolID}, {Name: "InputRevision", Type: intID},
		}},
	}
}

func domSnapshot(node gobi.Node) (compilercontract.DOMSnapshot, error) {
	out := compilercontract.DOMSnapshot{Normalization: "outerHTML-v1", HTML: gobi.HTML(node), Controls: []compilercontract.DOMControl{}}
	var walk func(gobi.Node, string)
	walk = func(current gobi.Node, path string) {
		if current.Kind == gobi.Element && (current.Tag == "button" || current.Tag == "input" || current.Tag == "select" || current.Tag == "textarea") {
			control := compilercontract.DOMControl{Path: path, Key: current.Key, Tag: current.Tag, Value: ""}
			if current.Tag == "button" {
				control.Type = "submit"
			}
			for _, attr := range current.Attrs {
				switch attr.Name {
				case "type":
					if !attr.Flag {
						control.Type = attr.Value
					}
				case "value":
					if !attr.Flag {
						control.Value = attr.Value
					}
				case "checked":
					control.Checked = attr.Flag
				case "disabled":
					control.Disabled = attr.Flag
				}
			}
			out.Controls = append(out.Controls, control)
		}
		for childIndex, child := range current.Kids {
			childPath := strconv.Itoa(childIndex)
			if path != "" {
				childPath = path + "/" + childPath
			}
			walk(child, childPath)
		}
	}
	walk(node, "")
	return out, nil
}

func resolveCaptureEvent(parent moduleparent.State, child modulechild.State, events []scenarioEvent, index int, event scenarioEvent, currentRenderer string) (compilercontract.MessageValue, bool, *bool, bool, error) {
	switch event.Kind {
	case "click", "disabled-action":
		if (event.Target != "parent" && event.Target != "child") || event.Action == nil || event.Action.Event == "" || event.Action.Path == "" {
			return compilercontract.MessageValue{}, false, nil, false, fmt.Errorf("%s requires parent|child target and a complete action", event.Kind)
		}
		root := moduleparent.View(parent)
		if event.Target == "child" {
			root = modulechild.View(child)
		}
		node, err := nodeAtCapturePath(root, event.Action.Path)
		if err != nil {
			return compilercontract.MessageValue{}, false, nil, false, err
		}
		message, count := handlerCaptureMessage(node, event.Action.Event)
		if count != 1 {
			return compilercontract.MessageValue{}, false, nil, false, fmt.Errorf("action path %q has %d matching handlers", event.Action.Path, count)
		}
		disabled := nodeHasFlag(node, "disabled")
		if event.Kind == "disabled-action" {
			if !disabled {
				return compilercontract.MessageValue{}, false, boolPtrCapture(false), false, fmt.Errorf("disabled-action %q resolves to an enabled control", event.Action.Path)
			}
			return compilercontract.MessageValue{}, false, boolPtrCapture(true), false, nil
		}
		if disabled {
			return compilercontract.MessageValue{}, false, boolPtrCapture(true), false, nil
		}
		return message, true, boolPtrCapture(false), false, nil
	case "go-message":
		if (event.Target != "parent" && event.Target != "child") || event.Message == nil || event.Message.Name == "" {
			return compilercontract.MessageValue{}, false, nil, false, errors.New("go-message requires target and named message")
		}
		return *event.Message, true, nil, false, nil
	case "renderer-swap":
		if event.From != currentRenderer || (event.To != "dom" && event.To != "react") || event.To == event.From || (event.Expect != "accepted" && event.Expect != "rejected") {
			return compilercontract.MessageValue{}, false, nil, false, fmt.Errorf("renderer swap does not match current renderer %q", currentRenderer)
		}
		return compilercontract.MessageValue{}, false, nil, false, nil
	case "stale-callback":
		if event.SourceEvent == nil || *event.SourceEvent < 0 || *event.SourceEvent >= index {
			return compilercontract.MessageValue{}, false, nil, false, errors.New("stale callback must cite an earlier click")
		}
		source := events[*event.SourceEvent]
		if source.Kind != "click" || source.Action == nil {
			return compilercontract.MessageValue{}, false, nil, false, errors.New("stale callback source is not a click")
		}
		return compilercontract.MessageValue{}, false, nil, true, nil
	default:
		return compilercontract.MessageValue{}, false, nil, false, fmt.Errorf("unsupported event kind %q", event.Kind)
	}
}

func nodeAtCapturePath(root gobi.Node, path string) (gobi.Node, error) {
	if path == "" {
		return root, errors.New("empty node path")
	}
	node := root
	for _, part := range strings.Split(path, "/") {
		index, err := strconv.Atoi(part)
		if err != nil || index < 0 || index >= len(node.Kids) {
			return gobi.Node{}, fmt.Errorf("path %q does not resolve in Go view", path)
		}
		node = node.Kids[index]
	}
	return node, nil
}

func handlerCaptureMessage(node gobi.Node, event string) (compilercontract.MessageValue, int) {
	var message compilercontract.MessageValue
	count := 0
	for _, handler := range node.On {
		if handler.Event == event {
			count++
			message = compilercontract.MessageValue{Name: handler.Message, Arg: handler.Arg}
		}
	}
	return message, count
}

func nodeHasFlag(node gobi.Node, name string) bool {
	for _, attr := range node.Attrs {
		if attr.Name == name && attr.Flag {
			return true
		}
	}
	return false
}

func runCaptureUpdate(parent moduleparent.State, child modulechild.State, target string, message compilercontract.MessageValue, counts *directCounts) ([]nativeBridge, []callOrderRecord, moduleparent.State, modulechild.State, error) {
	bridges := []nativeBridge{}
	goMessage := gobi.Message{Name: message.Name, Arg: message.Arg}
	if target == "parent" {
		parent, effects := moduleparent.Update(parent, goMessage)
		if len(effects) != 0 {
			return nil, nil, parent, child, errors.New("parent emitted forbidden effects")
		}
		counts.ParentUpdate++
		input := moduleparent.Output(parent)
		child = modulechild.Input(child, input)
		counts.Output++
		counts.Input++
		bridges = append(bridges, nativeBridge{Call: "parent.Update"}, nativeBridge{Call: "parent.Output", Input: inputPtrCapture(input)}, nativeBridge{Call: "child.Input", Input: inputPtrCapture(input)})
		return bridges, []callOrderRecord{{Owner: "parent", Role: "Update"}, {Owner: "parent", Role: "output"}, {Owner: "child", Role: "input"}}, parent, child, nil
	}
	if target != "child" {
		return nil, nil, parent, child, fmt.Errorf("unknown target %q", target)
	}
	child, effects := modulechild.Update(child, goMessage)
	if len(effects) != 0 {
		return nil, nil, parent, child, errors.New("child emitted forbidden effects")
	}
	counts.ChildUpdate++
	publication := modulechild.Publication(child)
	parent = moduleparent.Receive(parent, publication)
	counts.Publication++
	counts.Receive++
	bridges = append(bridges, nativeBridge{Call: "child.Update"}, nativeBridge{Call: "child.Publication", Publication: pubPtrCapture(publication)}, nativeBridge{Call: "parent.Receive", Publication: pubPtrCapture(publication)})
	return bridges, []callOrderRecord{{Owner: "child", Role: "Update"}, {Owner: "child", Role: "publication"}, {Owner: "parent", Role: "receive"}}, parent, child, nil
}

func browserBridgesForUpdate(start int, target string, bridges []nativeBridge, state logicalState) []browserBridge {
	out := make([]browserBridge, 0, len(bridges))
	for _, bridge := range bridges {
		row := browserBridge{Input: nil, Output: nil}
		switch bridge.Call {
		case "parent.Output":
			row.Role = "output"
			row.Owner = "parent"
			row.Output = *bridge.Input
		case "child.Input":
			row.Role = "input"
			row.Owner = "child"
			row.Input = *bridge.Input
			row.Output = state.ChildValue
		case "child.Publication":
			row.Role = "publication"
			row.Owner = "child"
			row.Output = *bridge.Publication
		case "parent.Receive":
			row.Role = "receive"
			row.Owner = "parent"
			row.Input = *bridge.Publication
			row.Output = state.ParentValue
		default:
			continue
		}
		row.Sequence = start + len(out)
		out = append(out, row)
	}
	return out
}

func checkNativeCapture(path string, got nativeCapture, want replayResult) error {
	if got.Schema != captureNativeSchema || got.Name != want.Script.Name {
		return fmt.Errorf("%s header schema/name mismatch", path)
	}
	if !reflect.DeepEqual(got.Events, want.Events) {
		return fmt.Errorf("%s events differ from Go replay", path)
	}
	if !reflect.DeepEqual(got.Initial, want.Initial) {
		return fmt.Errorf("%s initial Go state/view/bridge checkpoint differs from replay", path)
	}
	if !reflect.DeepEqual(got.Steps, want.Steps) {
		return fmt.Errorf("%s update steps differ from Go replay", path)
	}
	return nil
}

func checkDirectPair(path string, pair map[string]json.RawMessage, replay replayResult, fixture string) error {
	for _, side := range []string{"react", "dom"} {
		raw, err := rawField(pair, side, path)
		if err != nil {
			return err
		}
		profile, err := decodeRawObject(raw, path+"."+side)
		if err != nil {
			return err
		}
		if err := checkStringField(profile, "schema", path+"."+side, captureDirectSchema); err != nil {
			return err
		}
		if err := checkStringField(profile, "fixture", path+"."+side, fixture); err != nil {
			return err
		}
		if err := compareRawField(profile, "eventCount", len(replay.Events), path+"."+side); err != nil {
			return err
		}
		for _, checkpointIndex := range []int{0, len(replay.States) - 1} {
			key := "initial"
			if checkpointIndex > 0 {
				key = "final"
			}
			v, err := rawField(profile, key, path+"."+side)
			if err != nil {
				return err
			}
			if err := checkDirectCheckpoint(v, replay.States[checkpointIndex], path+"."+side+"."+key); err != nil {
				return err
			}
		}
		if err := checkDirectCheckpoints(profile, replay, path+"."+side); err != nil {
			return err
		}
		if err := checkDirectSteps(profile, replay, path+"."+side); err != nil {
			return err
		}
		if err := checkDirectEvents(profile, replay, path+"."+side); err != nil {
			return err
		}
		if err := checkDirectBridgeCalls(profile, replay, path+"."+side); err != nil {
			return err
		}
		if err := compareRawField(profile, "callCounts", replay.CallCounts, path+"."+side); err != nil {
			return err
		}
	}
	return nil
}

func checkDirectCheckpoint(raw json.RawMessage, state logicalState, path string) error {
	obj, err := decodeRawObject(raw, path)
	if err != nil {
		return err
	}
	return compareFields(obj, path, map[string]any{"stateIndex": state.StateIndex, "parentState": state.ParentValue, "childState": state.ChildValue,
		"parentView": compilercontract.ViewRecord{Tree: state.ParentView, Bindings: []compilercontract.Binding{}},
		"childView":  compilercontract.ViewRecord{Tree: state.ChildView, Bindings: []compilercontract.Binding{}}, "sourceEventIndex": state.SourceEventIndex, "bridges": state.Bridges})
}

func checkDirectCheckpoints(profile map[string]json.RawMessage, replay replayResult, path string) error {
	raw, err := rawField(profile, "checkpoints", path)
	if err != nil {
		return err
	}
	var rows []json.RawMessage
	if err := DecodeStrict(raw, &rows); err != nil {
		return fmt.Errorf("%s.checkpoints: %w", path, err)
	}
	if len(rows) != len(replay.States) {
		return fmt.Errorf("%s.checkpoints has %d rows, want %d", path, len(rows), len(replay.States))
	}
	for i, row := range rows {
		if err := checkDirectCheckpoint(row, replay.States[i], fmt.Sprintf("%s.checkpoints[%d]", path, i)); err != nil {
			return err
		}
	}
	return nil
}

func checkDirectSteps(profile map[string]json.RawMessage, replay replayResult, path string) error {
	raw, err := rawField(profile, "steps", path)
	if err != nil {
		return err
	}
	var rows []json.RawMessage
	if err := DecodeStrict(raw, &rows); err != nil {
		return err
	}
	if len(rows) != len(replay.Steps) {
		return fmt.Errorf("%s.steps has %d rows, want %d", path, len(rows), len(replay.Steps))
	}
	for i, row := range rows {
		step, err := decodeRawObject(row, fmt.Sprintf("%s.steps[%d]", path, i))
		if err != nil {
			return err
		}
		s := replay.Steps[i]
		state := replay.States[i+1]
		if err := compareFields(step, fmt.Sprintf("%s.steps[%d]", path, i), map[string]any{"stepIndex": i, "eventIndex": s.EventIndex, "kind": s.Kind, "target": s.Target, "message": s.Message, "bridges": s.Bridges, "parentState": state.ParentValue, "childState": state.ChildValue, "parentView": compilercontract.ViewRecord{Tree: state.ParentView, Bindings: []compilercontract.Binding{}}, "childView": compilercontract.ViewRecord{Tree: state.ChildView, Bindings: []compilercontract.Binding{}}}); err != nil {
			return err
		}
	}
	return nil
}

func checkDirectEvents(profile map[string]json.RawMessage, replay replayResult, path string) error {
	raw, err := rawField(profile, "events", path)
	if err != nil {
		return err
	}
	var rows []json.RawMessage
	if err := DecodeStrict(raw, &rows); err != nil {
		return err
	}
	if len(rows) != len(replay.Events) {
		return fmt.Errorf("%s.events has %d rows, want %d", path, len(rows), len(replay.Events))
	}
	counts := directCounts{ParentInit: 1, ChildInit: 1, Output: 1, Input: 1, Publication: 1, Receive: 1}
	for i, row := range rows {
		e := replay.Events[i]
		obj, err := decodeRawObject(row, fmt.Sprintf("%s.events[%d]", path, i))
		if err != nil {
			return err
		}
		before := counts
		bridges := replay.EventBridges[i]
		if len(bridges) > 0 {
			if e.Target == "parent" {
				counts.ParentUpdate++
				counts.Output++
				counts.Input++
			} else {
				counts.ChildUpdate++
				counts.Publication++
				counts.Receive++
			}
		}
		want := map[string]any{"eventIndex": i, "kind": e.Kind, "message": e.Message, "dispatched": len(bridges) > 0, "bridgeCalls": bridges, "callCountsBefore": before, "callCountsAfter": counts, "event": replay.Script.Events[i]}
		if e.Target != "" {
			want["target"] = e.Target
		}
		if e.Action != nil {
			want["action"] = e.Action
			want["suppressed"] = e.Disabled != nil && *e.Disabled
		}
		if err := compareFields(obj, fmt.Sprintf("%s.events[%d]", path, i), want); err != nil {
			return err
		}
	}
	return nil
}

func checkDirectBridgeCalls(profile map[string]json.RawMessage, replay replayResult, path string) error {
	want := []nativeBridge{}
	want = append(want, replay.Initial.Bridges...)
	for _, step := range replay.Steps {
		want = append(want, step.Bridges...)
	}
	raw, err := rawField(profile, "bridgeCalls", path)
	if err != nil {
		return err
	}
	return compareRaw(raw, want, path+".bridgeCalls")
}

func checkBrowserHeader(browser map[string]json.RawMessage, fixture string) error {
	if err := checkStringField(browser, "schema", "module-pair.browser.json", "gobi.compiled-modules-browser/v1"); err != nil {
		return err
	}
	if err := checkStringField(browser, "fixture", "module-pair.browser.json", fixture); err != nil {
		return err
	}
	pageErrors, err := rawField(browser, "pageErrors", "module-pair.browser.json")
	if err != nil {
		return err
	}
	var errorsList []json.RawMessage
	if err := DecodeStrict(pageErrors, &errorsList); err != nil {
		return err
	}
	if len(errorsList) != 0 {
		return errors.New("browser capture contains page errors")
	}
	return nil
}

func checkFixedProfileIndex(index browserProfileIndex, replay replayResult) error {
	if index.Schema != "gobi.compiled-modules-browser-profile-index/v1" || index.BrowserProfileCount != 12 {
		return fmt.Errorf("browser profile index schema/count mismatch: %q/%d", index.Schema, index.BrowserProfileCount)
	}
	for _, name := range []string{"react", "dom", "swap"} {
		p, ok := index.Profiles[name]
		if !ok {
			return fmt.Errorf("fixed browser profile index is missing %s", name)
		}
		if p.SourceEvents != len(replay.Events) || p.Updates != len(replay.Steps) || p.Checkpoints != len(replay.States) || p.Failures != 0 {
			return fmt.Errorf("fixed browser profile %s index counts/failures mismatch", name)
		}
	}
	return nil
}

func checkSeedSummary(root string, summary seedSummaryRecord, seed int, replay replayResult, nativePath string) error {
	if summary.Seed != seed || summary.Events != len(replay.Events) || summary.GoUpdates != len(replay.Steps) || summary.StateCheckpoints != len(replay.States) || summary.Generator != "gobi.compiled-modules-seeded-actions/v1" || summary.Status != "matched" || !summary.BrowserMounted || !reflect.DeepEqual(summary.BrowserProfiles, []string{"react", "dom", "swap"}) {
		return fmt.Errorf("seed %d summary does not match the independently replayed scenario", seed)
	}
	data, err := captureReadRegularFile(root, filepath.ToSlash(nativePath), maxCaptureFileBytes)
	if err != nil {
		return err
	}
	hash := sha256.Sum256(data)
	if fmt.Sprintf("%x", hash) != summary.NativeTraceSHA256 {
		return fmt.Errorf("seed %d native trace SHA-256 differs from seeded summary", seed)
	}
	return nil
}

func checkBrowserProfile(path string, raw json.RawMessage, replay replayResult, backend string, seed *int) error {
	profile, err := decodeRawObject(raw, path)
	if err != nil {
		return err
	}
	initialBackend := backend
	switch backend {
	case "react", "dom":
	case "swap":
		initialBackend = "dom"
	default:
		return fmt.Errorf("%s has unsupported browser profile %q", path, backend)
	}
	if err := checkStringField(profile, "profile", path, backend); err != nil {
		return err
	}
	if err := checkStringField(profile, "schema", path, "gobi.compiled-modules-browser-profile/v1"); err != nil {
		return err
	}
	if err := checkStringField(profile, "initialBackend", path, initialBackend); err != nil {
		return err
	}
	traceRaw, err := rawField(profile, "trace", path)
	if err != nil {
		return err
	}
	trace, err := decodeRawObject(traceRaw, path+".trace")
	if err != nil {
		return err
	}
	if err := checkStringField(trace, "backend", path+".trace", initialBackend); err != nil {
		return err
	}
	if err := compareRawField(profile, "seed", seed, path); err != nil {
		return err
	}
	if err := compareRawField(profile, "sourceEventCount", len(replay.Events), path); err != nil {
		return err
	}
	if err := compareBrowserSnapshots(profile, replay, path); err != nil {
		return err
	}
	if err := compareBrowserFinal(profile, replay, path); err != nil {
		return err
	}
	if err := compareBrowserEvents(profile, replay, path, backend); err != nil {
		return err
	}
	if err := checkBrowserRendererSequence(profile, replay, backend, path); err != nil {
		return err
	}
	if err := compareBrowserTrace(profile, replay, path, backend); err != nil {
		return err
	}
	if failures, err := rawField(profile, "failures", path); err != nil {
		return err
	} else {
		var list []json.RawMessage
		if err := DecodeStrict(failures, &list); err != nil {
			return err
		}
		if len(list) != 0 {
			return fmt.Errorf("%s has browser failures", path)
		}
	}
	return nil
}

func compareBrowserFinal(profile map[string]json.RawMessage, replay replayResult, path string) error {
	last := replay.States[len(replay.States)-1]
	physical, err := rawField(profile, "finalPhysical", path)
	if err != nil {
		return err
	}
	if err := compareRaw(physical, domPair{Parent: last.ParentDOM, Child: last.ChildDOM}, path+".finalPhysical"); err != nil {
		return err
	}
	finalRaw, err := rawField(profile, "finalSnapshot", path)
	if err != nil {
		return err
	}
	final, err := decodeRawObject(finalRaw, path+".finalSnapshot")
	if err != nil {
		return err
	}
	if err := checkStringField(final, "schema", path+".finalSnapshot", "gobi.module-pair-snapshot/v1"); err != nil {
		return err
	}
	if failed, err := rawField(final, "failed", path+".finalSnapshot"); err != nil {
		return err
	} else if strings.TrimSpace(string(failed)) != "null" {
		return fmt.Errorf("%s.finalSnapshot.failed must be null", path)
	}
	parentRaw, err := rawField(final, "parent", path+".finalSnapshot")
	if err != nil {
		return err
	}
	parent, err := decodeRawObject(parentRaw, path+".finalSnapshot.parent")
	if err != nil {
		return err
	}
	if err := compareFields(parent, path+".finalSnapshot.parent", map[string]any{"state": last.ParentValue, "view": compilercontract.ViewRecord{Tree: last.ParentView, Bindings: []compilercontract.Binding{}}, "dom": last.ParentDOM}); err != nil {
		return err
	}
	childRaw, err := rawField(final, "child", path+".finalSnapshot")
	if err != nil {
		return err
	}
	child, err := decodeRawObject(childRaw, path+".finalSnapshot.child")
	if err != nil {
		return err
	}
	if err := compareFields(child, path+".finalSnapshot.child", map[string]any{"state": last.ChildValue, "view": compilercontract.ViewRecord{Tree: last.ChildView, Bindings: []compilercontract.Binding{}}, "dom": last.ChildDOM}); err != nil {
		return err
	}
	return nil
}

func compareBrowserSnapshots(profile map[string]json.RawMessage, replay replayResult, path string) error {
	raw, err := rawField(profile, "snapshots", path)
	if err != nil {
		return err
	}
	var rows []json.RawMessage
	if err := DecodeStrict(raw, &rows); err != nil {
		return err
	}
	eventsRaw, err := rawField(profile, "events", path)
	if err != nil {
		return err
	}
	var eventRows []json.RawMessage
	if err := DecodeStrict(eventsRaw, &eventRows); err != nil {
		return err
	}
	if len(rows) != len(eventRows)+1 {
		return fmt.Errorf("%s snapshots has %d rows, want initial plus %d profile events", path, len(rows), len(eventRows))
	}
	currentStateIndex := 0
	for i, row := range rows {
		obj, err := decodeRawObject(row, fmt.Sprintf("%s.snapshots[%d]", path, i))
		if err != nil {
			return err
		}
		stateIndex := 0
		if i > 0 {
			profileEvent, err := decodeRawObject(eventRows[i-1], fmt.Sprintf("%s.events[%d]", path, i-1))
			if err != nil {
				return err
			}
			sourceIndex, err := rawNullableInt(profileEvent["sourceEventIndex"], fmt.Sprintf("%s.events[%d].sourceEventIndex", path, i-1))
			if err != nil {
				return err
			}
			if sourceIndex != nil {
				if *sourceIndex < 0 || *sourceIndex >= len(replay.Events) {
					return fmt.Errorf("%s.events[%d] has out of range sourceEventIndex", path, i-1)
				}
				stateIndex = replay.EventStateIndexes[*sourceIndex]
				currentStateIndex = stateIndex
			} else {
				stateIndex = currentStateIndex
			}
			var expectedEventIndex any
			if sourceIndex != nil {
				profileEventIndex, err := readJSONNumber(profileEvent["eventIndex"], fmt.Sprintf("%s.events[%d].eventIndex", path, i-1))
				if err != nil {
					return err
				}
				expectedEventIndex = profileEventIndex
			}
			if err := compareRawField(obj, "eventIndex", expectedEventIndex, fmt.Sprintf("%s.snapshots[%d]", path, i)); err != nil {
				return err
			}
		}
		s := replay.States[stateIndex]
		if err := compareFields(obj, fmt.Sprintf("%s.snapshots[%d]", path, i), map[string]any{"stateIndex": stateIndex}); err != nil {
			return err
		}
		snapshotRaw, err := rawField(obj, "snapshot", fmt.Sprintf("%s.snapshots[%d]", path, i))
		if err != nil {
			return err
		}
		snap, err := decodeRawObject(snapshotRaw, path+".snapshot")
		if err != nil {
			return err
		}
		if err := checkStringField(snap, "schema", path+".snapshot", "gobi.module-pair-snapshot/v1"); err != nil {
			return err
		}
		parentRaw, err := rawField(snap, "parent", path+".snapshot")
		if err != nil {
			return err
		}
		parent, err := decodeRawObject(parentRaw, path+".snapshot.parent")
		if err != nil {
			return err
		}
		if err := compareFields(parent, path+".snapshot.parent", map[string]any{"state": s.ParentValue, "view": compilercontract.ViewRecord{Tree: s.ParentView, Bindings: []compilercontract.Binding{}}, "dom": s.ParentDOM}); err != nil {
			return err
		}
		childRaw, err := rawField(snap, "child", path+".snapshot")
		if err != nil {
			return err
		}
		child, err := decodeRawObject(childRaw, path+".snapshot.child")
		if err != nil {
			return err
		}
		if err := compareFields(child, path+".snapshot.child", map[string]any{"state": s.ChildValue, "view": compilercontract.ViewRecord{Tree: s.ChildView, Bindings: []compilercontract.Binding{}}, "dom": s.ChildDOM}); err != nil {
			return err
		}
		physicalRaw, err := rawField(obj, "physical", path+".snapshots")
		if err != nil {
			return err
		}
		if err := compareRaw(physicalRaw, domPair{Parent: s.ParentDOM, Child: s.ChildDOM}, path+".snapshots.physical"); err != nil {
			return err
		}
	}
	return nil
}

func compareBrowserEvents(profile map[string]json.RawMessage, replay replayResult, path, backend string) error {
	raw, err := rawField(profile, "events", path)
	if err != nil {
		return err
	}
	var rows []json.RawMessage
	if err := DecodeStrict(raw, &rows); err != nil {
		return err
	}
	sourceCursor := 0
	bridgeSequence := 4
	syntheticSwaps := 0
	syntheticStale := 0
	for i, row := range rows {
		obj, err := decodeRawObject(row, fmt.Sprintf("%s.events[%d]", path, i))
		if err != nil {
			return err
		}
		sourceIndex, err := rawNullableInt(obj["sourceEventIndex"], fmt.Sprintf("%s.events[%d].sourceEventIndex", path, i))
		if err != nil {
			return err
		}
		var expectedEventIndex any
		if sourceIndex != nil {
			expectedEventIndex = *sourceIndex
		}
		if err := compareRawField(obj, "eventIndex", expectedEventIndex, fmt.Sprintf("%s.events[%d]", path, i)); err != nil {
			return err
		}
		if sourceIndex == nil {
			kind, err := captureStringField(obj, "kind", fmt.Sprintf("%s.events[%d]", path, i))
			if err != nil {
				return err
			}
			if kind != "renderer-swap" && kind != "stale-callback" {
				return fmt.Errorf("%s.events[%d] has unexpected synthetic kind %q", path, i, kind)
			}
			staleSynthetic := kind == "stale-callback"
			if staleSynthetic {
				syntheticStale++
			} else {
				syntheticSwaps++
			}
			if err := compareFields(obj, fmt.Sprintf("%s.events[%d]", path, i), map[string]any{"dispatched": false, "suppressed": false, "stale": staleSynthetic, "message": nil, "callOrder": []callOrderRecord{}, "bridgeCalls": []browserBridge{}}); err != nil {
				return err
			}
			operationRaw, err := rawField(obj, "operation", fmt.Sprintf("%s.events[%d]", path, i))
			if err != nil {
				return err
			}
			operation, err := decodeRawObject(operationRaw, path+".operation")
			if err != nil {
				return err
			}
			if staleSynthetic {
				if err := compareFields(operation, path+".operation", map[string]any{"stale": true, "sourceEvent": 0, "callbackInvocations": 1, "dispatched": false}); err != nil {
					return err
				}
			} else {
				swapRaw, err := rawField(operation, "swap", path+".operation")
				if err != nil {
					return err
				}
				swap, err := decodeRawObject(swapRaw, path+".operation.swap")
				if err != nil {
					return err
				}
				if err := compareRawField(swap, "accepted", true, path+".operation.swap"); err != nil {
					return err
				}
			}
			continue
		}
		if *sourceIndex != sourceCursor || sourceCursor >= len(replay.Events) {
			return fmt.Errorf("%s.events[%d] source event ordering differs from canonical scenario", path, i)
		}
		sourceCursor++
		e := replay.Events[*sourceIndex]
		dispatched := len(replay.EventBridges[*sourceIndex]) > 0
		stale := replay.Script.Events[*sourceIndex].Kind == "stale-callback" && backend == "swap"
		want := map[string]any{"sourceEventIndex": *sourceIndex, "sourceEvent": replay.Script.Events[*sourceIndex], "kind": e.Kind, "message": e.Message, "dispatched": dispatched, "suppressed": e.Disabled != nil && *e.Disabled, "stale": stale}
		if e.Target != "" {
			want["target"] = e.Target
		}
		if e.Action != nil {
			want["action"] = e.Action
		}
		if err := compareFields(obj, fmt.Sprintf("%s.events[%d]", path, i), want); err != nil {
			return err
		}
		if err := checkBrowserOperation(obj, replay.Script.Events[*sourceIndex], e.Message, dispatched, e.Disabled, stale, backend, fmt.Sprintf("%s.events[%d]", path, i)); err != nil {
			return err
		}
		if err := compareRawField(obj, "callOrder", replay.EventCalls[*sourceIndex], fmt.Sprintf("%s.events[%d]", path, i)); err != nil {
			return err
		}
		stateIndex := replay.EventStateIndexes[*sourceIndex]
		wantBridges := browserBridgesForUpdate(bridgeSequence, e.Target, replay.EventBridges[*sourceIndex], replay.States[stateIndex])
		if err := compareRawField(obj, "bridgeCalls", wantBridges, fmt.Sprintf("%s.events[%d]", path, i)); err != nil {
			return err
		}
		bridgeSequence += len(wantBridges)
		if e.Action != nil {
			physical, err := rawField(obj, "physicalClick", fmt.Sprintf("%s.events[%d]", path, i))
			if err != nil {
				return err
			}
			click, err := decodeRawObject(physical, path+".physicalClick")
			if err != nil {
				return err
			}
			targetBefore, err := rawField(click, "targetBefore", path+".physicalClick")
			if err != nil {
				return err
			}
			before, err := decodeRawObject(targetBefore, path+".targetBefore")
			if err != nil {
				return err
			}
			if err := compareRawField(before, "disabled", e.Disabled != nil && *e.Disabled, path+".targetBefore"); err != nil {
				return err
			}
			if err := compareRawField(click, "callbackInvocations", boolToIntCapture(dispatched), path+".physicalClick"); err != nil {
				return err
			}
		}
	}
	if sourceCursor != len(replay.Events) {
		return fmt.Errorf("%s contains %d canonical source events, want %d", path, sourceCursor, len(replay.Events))
	}
	if strings.Contains(path, "seeded") && strings.HasSuffix(path, "-swap") && (syntheticSwaps != 2 || syntheticStale != 1) {
		return fmt.Errorf("%s has %d injected renderer swaps and %d stale callbacks, want 2 and 1", path, syntheticSwaps, syntheticStale)
	}
	if (syntheticSwaps > 0 || syntheticStale > 0) && (!strings.Contains(path, "seeded") || !strings.HasSuffix(path, "-swap")) {
		return fmt.Errorf("%s has unexpected injected renderer events", path)
	}
	return nil
}

// checkBrowserRendererSequence binds profile identity to each renderer swap
// and to callbacks captured afterward. The profile label alone does not prove
// which renderer produced a view or handled a click.
func checkBrowserRendererSequence(profile map[string]json.RawMessage, replay replayResult, backend, path string) error {
	current := backend
	if backend == "swap" {
		current = "dom"
	}
	raw, err := rawField(profile, "events", path)
	if err != nil {
		return err
	}
	var events []json.RawMessage
	if err := DecodeStrict(raw, &events); err != nil {
		return err
	}
	for index, rawEvent := range events {
		rowPath := fmt.Sprintf("%s.events[%d]", path, index)
		event, err := decodeRawObject(rawEvent, rowPath)
		if err != nil {
			return err
		}
		sourceIndex, err := rawNullableInt(event["sourceEventIndex"], rowPath+".sourceEventIndex")
		if err != nil {
			return err
		}
		if sourceIndex == nil {
			kind, err := captureStringField(event, "kind", rowPath)
			if err != nil {
				return err
			}
			if kind != "renderer-swap" {
				continue
			}
			if backend != "swap" || !strings.Contains(path, "seeded") {
				return fmt.Errorf("%s has an injected renderer swap outside a seeded swap profile", rowPath)
			}
			next := "dom"
			if current == "dom" {
				next = "react"
			}
			sourceRaw, err := rawField(event, "sourceEvent", rowPath)
			if err != nil {
				return err
			}
			source, err := decodeRawObject(sourceRaw, rowPath+".sourceEvent")
			if err != nil {
				return err
			}
			if err := compareFields(source, rowPath+".sourceEvent", map[string]any{"kind": "renderer-swap", "from": current, "to": next, "expect": "accepted"}); err != nil {
				return err
			}
			if err := checkBrowserSwapResult(event, rowPath, current, next, true); err != nil {
				return err
			}
			current = next
			continue
		}
		if *sourceIndex < 0 || *sourceIndex >= len(replay.Script.Events) {
			return fmt.Errorf("%s has out-of-range source event index %d", rowPath, *sourceIndex)
		}
		source := replay.Script.Events[*sourceIndex]
		if source.Kind == "renderer-swap" {
			if backend == "swap" {
				if source.From != current {
					return fmt.Errorf("%s swap begins at %q, current renderer is %q", rowPath, source.From, current)
				}
				accepted := source.Expect == "accepted"
				next := current
				if accepted {
					next = source.To
				}
				if err := checkBrowserSwapResult(event, rowPath, current, source.To, accepted); err != nil {
					return err
				}
				current = next
			}
			continue
		}
		if source.Action == nil {
			continue
		}
		dispatchedRaw, err := rawField(event, "dispatched", rowPath)
		if err != nil {
			return err
		}
		var dispatched bool
		if err := DecodeStrict(dispatchedRaw, &dispatched); err != nil {
			return fmt.Errorf("%s.dispatched: %w", rowPath, err)
		}
		if !dispatched {
			continue
		}
		physicalRaw, err := rawField(event, "physicalClick", rowPath)
		if err != nil {
			return err
		}
		physical, err := decodeRawObject(physicalRaw, rowPath+".physicalClick")
		if err != nil {
			return err
		}
		observedRaw, err := rawField(physical, "observed", rowPath+".physicalClick")
		if err != nil {
			return err
		}
		observed, err := decodeRawObject(observedRaw, rowPath+".physicalClick.observed")
		if err != nil {
			return err
		}
		if err := checkStringField(observed, "rendererKind", rowPath+".physicalClick.observed", current); err != nil {
			return err
		}
	}
	finalRaw, err := rawField(profile, "finalSnapshot", path)
	if err != nil {
		return err
	}
	final, err := decodeRawObject(finalRaw, path+".finalSnapshot")
	if err != nil {
		return err
	}
	if err := checkStringField(final, "backend", path+".finalSnapshot", current); err != nil {
		return err
	}
	return nil
}

func checkBrowserSwapResult(event map[string]json.RawMessage, path, from, to string, accepted bool) error {
	operationRaw, err := rawField(event, "operation", path)
	if err != nil {
		return err
	}
	operation, err := decodeRawObject(operationRaw, path+".operation")
	if err != nil {
		return err
	}
	swapRaw, err := rawField(operation, "swap", path+".operation")
	if err != nil {
		return err
	}
	swap, err := decodeRawObject(swapRaw, path+".operation.swap")
	if err != nil {
		return err
	}
	if err := compareFields(swap, path+".operation.swap", map[string]any{"accepted": accepted, "from": from, "to": to}); err != nil {
		return err
	}
	resultRaw, err := rawField(swap, "result", path+".operation.swap")
	if err != nil {
		return err
	}
	result, err := decodeRawObject(resultRaw, path+".operation.swap.result")
	if err != nil {
		return err
	}
	resultBackend := from
	if accepted {
		resultBackend = to
	}
	return checkStringField(result, "backend", path+".operation.swap.result", resultBackend)
}

func checkBrowserOperation(eventObject map[string]json.RawMessage, source scenarioEvent, resolvedMessage *compilercontract.MessageValue, dispatched bool, disabled *bool, stale bool, backend, path string) error {
	raw, err := rawField(eventObject, "operation", path)
	if err != nil {
		return err
	}
	operation, err := decodeRawObject(raw, path+".operation")
	if err != nil {
		return err
	}
	suppressed := disabled != nil && *disabled
	switch source.Kind {
	case "click", "disabled-action", "go-message":
		var message any
		if dispatched {
			if resolvedMessage == nil {
				return fmt.Errorf("%s dispatched event has no resolved Go message", path)
			}
			message = *resolvedMessage
		}
		return compareFields(operation, path+".operation", map[string]any{"dispatched": dispatched, "suppressed": suppressed, "message": message})
	case "renderer-swap":
		if backend != "swap" {
			return compareFields(operation, path+".operation", map[string]any{"dispatched": false, "suppressed": false, "applied": false, "reason": "static-renderer-profile"})
		}
		swapRaw, err := rawField(operation, "swap", path+".operation")
		if err != nil {
			return err
		}
		swap, err := decodeRawObject(swapRaw, path+".operation.swap")
		if err != nil {
			return err
		}
		return compareFields(swap, path+".operation.swap", map[string]any{"accepted": source.Expect == "accepted", "from": source.From, "to": source.To})
	case "stale-callback":
		if backend != "swap" {
			return compareFields(operation, path+".operation", map[string]any{"dispatched": false, "stale": false, "applied": false, "reason": "static-renderer-profile"})
		}
		return compareFields(operation, path+".operation", map[string]any{"dispatched": false, "stale": true, "sourceEvent": *source.SourceEvent, "callbackInvocations": 1})
	default:
		return fmt.Errorf("%s has unsupported source operation kind %q", path, source.Kind)
	}
}

func compareBrowserTrace(profile map[string]json.RawMessage, replay replayResult, path, backend string) error {
	raw, err := rawField(profile, "trace", path)
	if err != nil {
		return err
	}
	trace, err := decodeRawObject(raw, path+".trace")
	if err != nil {
		return err
	}
	profileEventsRaw, err := rawField(profile, "events", path)
	if err != nil {
		return err
	}
	var profileEvents []json.RawMessage
	if err := DecodeStrict(profileEventsRaw, &profileEvents); err != nil {
		return err
	}
	traceEvents := len(profileEvents)
	if backend != "swap" {
		for _, event := range replay.Script.Events {
			if event.Kind == "renderer-swap" || event.Kind == "stale-callback" {
				traceEvents--
			}
		}
	}
	if err := compareRawField(trace, "eventCount", traceEvents, path+".trace"); err != nil {
		return err
	}
	if err := compareRaw(traceField(trace, "callOrder"), replay.BrowserCallOrder, path+".trace.callOrder"); err != nil {
		return err
	}
	if err := compareRaw(traceField(trace, "bridgeCalls"), replay.BrowserBridges, path+".trace.bridgeCalls"); err != nil {
		return err
	}
	wantCounts := roleCounts{ParentInit: 1, ChildInit: 1, ParentView: 1, ChildView: 1, Output: 1, Input: 1, Publication: 1, Receive: 1}
	for _, step := range replay.Steps {
		if step.Target == "parent" {
			wantCounts.ParentUpdate++
			wantCounts.Output++
			wantCounts.Input++
		} else {
			wantCounts.ChildUpdate++
			wantCounts.Publication++
			wantCounts.Receive++
		}
		wantCounts.ParentView++
		wantCounts.ChildView++
	}
	if err := compareRawField(trace, "callCounts", wantCounts, path+".trace"); err != nil {
		return err
	}
	if err := compareRawField(profile, "callCounts", wantCounts, path); err != nil {
		return err
	}
	if err := compareRawField(profile, "roleCallCounts", browserRoleCounts(wantCounts), path); err != nil {
		return err
	}
	if err := compareArrayLength(trace, "steps", len(replay.Steps), path+".trace"); err != nil {
		return err
	}
	if err := compareArrayLength(trace, "checkpoints", len(replay.States), path+".trace"); err != nil {
		return err
	}
	if err := checkBrowserTraceStateRows(trace, replay, profileEvents, path+".trace"); err != nil {
		return err
	}
	if err := checkBrowserRuntimeEventRows(trace, profileEvents, replay, path+".trace"); err != nil {
		return err
	}
	return nil
}

func checkBrowserTraceStateRows(trace map[string]json.RawMessage, replay replayResult, profileEvents []json.RawMessage, path string) error {
	runtimeIndexBySource := make(map[int]int, len(replay.Events))
	for profileIndex, rawEvent := range profileEvents {
		event, err := decodeRawObject(rawEvent, fmt.Sprintf("%s.profile.events[%d]", path, profileIndex))
		if err != nil {
			return err
		}
		sourceIndex, err := rawNullableInt(event["sourceEventIndex"], fmt.Sprintf("%s.profile.events[%d].sourceEventIndex", path, profileIndex))
		if err != nil {
			return err
		}
		if sourceIndex == nil {
			continue
		}
		rawRuntime, err := rawField(event, "runtimeEvent", fmt.Sprintf("%s.profile.events[%d]", path, profileIndex))
		if err != nil {
			return err
		}
		if strings.TrimSpace(string(rawRuntime)) == "null" {
			continue
		}
		runtime, err := decodeRawObject(rawRuntime, path+".runtimeEvent")
		if err != nil {
			return err
		}
		runtimeIndex, err := readJSONNumber(runtime["eventIndex"], path+".runtimeEvent.eventIndex")
		if err != nil {
			return err
		}
		runtimeIndexBySource[*sourceIndex] = runtimeIndex
	}
	initialRaw, err := rawField(trace, "initial", path)
	if err != nil {
		return err
	}
	if err := compareBrowserCheckpoint(initialRaw, replay.States[0], replay.BrowserBridges[:4], replay.BrowserCallOrder[:8], path+".initial"); err != nil {
		return err
	}
	checkpointRaw, err := rawField(trace, "checkpoints", path)
	if err != nil {
		return err
	}
	var checkpoints []json.RawMessage
	if err := DecodeStrict(checkpointRaw, &checkpoints); err != nil {
		return err
	}
	if len(checkpoints) != len(replay.States) {
		return fmt.Errorf("%s.checkpoints count mismatch", path)
	}
	for stateIndex, raw := range checkpoints {
		bridges, calls := replayPrefixesThroughState(replay, stateIndex)
		state := replay.States[stateIndex]
		if state.SourceEventIndex != nil {
			mapped, ok := runtimeIndexBySource[*state.SourceEventIndex]
			if !ok {
				return fmt.Errorf("%s has no runtime event for Go state checkpoint %d", path, stateIndex)
			}
			state.SourceEventIndex = &mapped
		}
		if err := compareBrowserCheckpoint(raw, state, bridges, calls, fmt.Sprintf("%s.checkpoints[%d]", path, stateIndex)); err != nil {
			return err
		}
	}
	stepsRaw, err := rawField(trace, "steps", path)
	if err != nil {
		return err
	}
	var steps []json.RawMessage
	if err := DecodeStrict(stepsRaw, &steps); err != nil {
		return err
	}
	if len(steps) != len(replay.Steps) {
		return fmt.Errorf("%s.steps count mismatch", path)
	}
	for stepIndex, raw := range steps {
		step, err := decodeRawObject(raw, fmt.Sprintf("%s.steps[%d]", path, stepIndex))
		if err != nil {
			return err
		}
		nativeStep := replay.Steps[stepIndex]
		state := replay.States[stepIndex+1]
		traceEventIndex, ok := runtimeIndexBySource[nativeStep.EventIndex]
		if !ok {
			return fmt.Errorf("%s has no runtime event for Go update at source event %d", path, nativeStep.EventIndex)
		}
		want := map[string]any{"eventIndex": traceEventIndex, "kind": nativeStep.Kind, "target": nativeStep.Target, "message": map[string]string{"Name": nativeStep.Message.Name, "Arg": nativeStep.Message.Arg},
			"bridges": replay.EventBrowserBridges[nativeStep.EventIndex], "parentState": state.ParentValue, "childState": state.ChildValue,
			"parentView": compilercontract.ViewRecord{Tree: state.ParentView, Bindings: []compilercontract.Binding{}},
			"childView":  compilercontract.ViewRecord{Tree: state.ChildView, Bindings: []compilercontract.Binding{}}}
		if err := compareFields(step, fmt.Sprintf("%s.steps[%d]", path, stepIndex), want); err != nil {
			return err
		}
	}
	finalRaw, err := rawField(trace, "final", path)
	if err != nil {
		return err
	}
	last := len(replay.States) - 1
	var finalBridges []browserBridge
	var finalCalls []callOrderRecord
	if last > 0 {
		event := replay.Steps[last-1].EventIndex
		finalBridges = replay.EventBrowserBridges[event]
		finalCalls = replay.EventCalls[event]
	}
	finalState := replay.States[last]
	if finalState.SourceEventIndex != nil {
		mapped, ok := runtimeIndexBySource[*finalState.SourceEventIndex]
		if !ok {
			return fmt.Errorf("%s has no runtime event for final Go state", path)
		}
		finalState.SourceEventIndex = &mapped
	}
	return compareBrowserCheckpoint(finalRaw, finalState, finalBridges, finalCalls, path+".final")
}

func replayPrefixesThroughState(replay replayResult, stateIndex int) ([]browserBridge, []callOrderRecord) {
	if stateIndex == 0 {
		return append([]browserBridge{}, replay.BrowserBridges[:4]...), append([]callOrderRecord{}, replay.BrowserCallOrder[:8]...)
	}
	lastSourceEvent := *replay.States[stateIndex].SourceEventIndex
	return replay.EventBrowserBridges[lastSourceEvent], replay.EventCalls[lastSourceEvent]
}

func compareBrowserCheckpoint(raw json.RawMessage, state logicalState, bridges []browserBridge, calls []callOrderRecord, path string) error {
	checkpoint, err := decodeRawObject(raw, path)
	if err != nil {
		return err
	}
	return compareFields(checkpoint, path, map[string]any{"stateIndex": state.StateIndex, "sourceEventIndex": state.SourceEventIndex,
		"parentState": state.ParentValue, "childState": state.ChildValue,
		"parentView": compilercontract.ViewRecord{Tree: state.ParentView, Bindings: []compilercontract.Binding{}},
		"childView":  compilercontract.ViewRecord{Tree: state.ChildView, Bindings: []compilercontract.Binding{}},
		"bridges":    bridges, "callOrder": calls, "dom": nil})
}

func checkBrowserRuntimeEventRows(trace map[string]json.RawMessage, profileEvents []json.RawMessage, replay replayResult, path string) error {
	raw, err := rawField(trace, "events", path)
	if err != nil {
		return err
	}
	var traceEvents []json.RawMessage
	if err := DecodeStrict(raw, &traceEvents); err != nil {
		return err
	}
	projected := make([]json.RawMessage, 0, len(profileEvents))
	runtimeSequence := 0
	for eventIndex, rawProfileEvent := range profileEvents {
		profileEvent, err := decodeRawObject(rawProfileEvent, fmt.Sprintf("%s.profile.events[%d]", path, eventIndex))
		if err != nil {
			return err
		}
		runtimeEvent, err := rawField(profileEvent, "runtimeEvent", fmt.Sprintf("%s.profile.events[%d]", path, eventIndex))
		if err != nil {
			return err
		}
		if strings.TrimSpace(string(runtimeEvent)) != "null" {
			runtimeObject, err := decodeRawObject(runtimeEvent, fmt.Sprintf("%s.profile.events[%d].runtimeEvent", path, eventIndex))
			if err != nil {
				return err
			}
			if err := compareRawField(runtimeObject, "eventIndex", runtimeSequence, fmt.Sprintf("%s.profile.events[%d].runtimeEvent", path, eventIndex)); err != nil {
				return err
			}
			sourceIndex, err := rawNullableInt(profileEvent["sourceEventIndex"], fmt.Sprintf("%s.profile.events[%d].sourceEventIndex", path, eventIndex))
			if err != nil {
				return err
			}
			var want map[string]any
			if sourceIndex != nil {
				e := replay.Events[*sourceIndex]
				runtimeKind := e.Kind
				// The source action remains a physical click in the profile, while
				// the runtime trace records that its disabled control suppressed it.
				if runtimeKind == "click" && e.Disabled != nil && *e.Disabled {
					runtimeKind = "disabled-action"
				}
				message := any(nil)
				if e.Message != nil {
					message = map[string]string{"Name": e.Message.Name, "Arg": e.Message.Arg}
				}
				source := replay.Script.Events[*sourceIndex]
				swapProfile := strings.Contains(path, "profiles.swap") || strings.HasSuffix(path, "-swap")
				want = map[string]any{"kind": runtimeKind, "message": message, "dispatched": len(replay.EventBridges[*sourceIndex]) > 0, "suppressed": e.Disabled != nil && *e.Disabled, "stale": source.Kind == "stale-callback" && swapProfile}
				if source.Kind == "stale-callback" {
					callback := replay.Script.Events[*source.SourceEvent]
					want["target"] = nil
					want["callbackTarget"] = callback.Target
					want["action"] = callback.Action
				} else {
					if e.Target != "" {
						want["target"] = e.Target
					} else {
						want["target"] = nil
					}
					if e.Action != nil {
						want["action"] = e.Action
					} else {
						want["action"] = nil
					}
				}
				wantBridges := replay.EventBrowserBridges[*sourceIndex]
				want["bridgeCalls"] = wantBridges
				want["callOrder"] = replay.EventCalls[*sourceIndex]
			} else {
				topKind, err := captureStringField(profileEvent, "kind", fmt.Sprintf("%s.profile.events[%d]", path, eventIndex))
				if err != nil {
					return err
				}
				stale := topKind == "stale-callback"
				want = map[string]any{"kind": topKind, "message": nil, "dispatched": false, "suppressed": false, "stale": stale, "target": nil, "action": nil, "bridgeCalls": []browserBridge{}, "callOrder": []callOrderRecord{}}
				if stale {
					sourceRaw, err := rawField(profileEvent, "sourceEvent", fmt.Sprintf("%s.profile.events[%d]", path, eventIndex))
					if err != nil {
						return err
					}
					sourceObj, err := decodeRawObject(sourceRaw, path+".sourceEvent")
					if err != nil {
						return err
					}
					sourceNumber, err := readJSONNumber(sourceObj["sourceEvent"], path+".sourceEvent.sourceEvent")
					if err != nil {
						return err
					}
					if sourceNumber < 0 || sourceNumber >= len(replay.Script.Events) {
						return fmt.Errorf("%s stale callback source index out of range", path)
					}
					callback := replay.Script.Events[sourceNumber]
					want["action"] = callback.Action
					want["callbackTarget"] = callback.Target
				}
			}
			if err := compareFields(runtimeObject, fmt.Sprintf("%s.profile.events[%d].runtimeEvent", path, eventIndex), want); err != nil {
				return err
			}
			runtimeSequence++
			projected = append(projected, runtimeEvent)
		}
	}
	if len(projected) != len(traceEvents) {
		return fmt.Errorf("%s runtime events count differs from the profile capture", path)
	}
	for i := range projected {
		if err := compareRaw(traceEvents[i], json.RawMessage(projected[i]), fmt.Sprintf("%s.events[%d]", path, i)); err != nil {
			return err
		}
	}
	return nil
}

func browserRoleCounts(c roleCounts) map[string]int {
	return map[string]int{"parent.Init": c.ParentInit, "child.Init": c.ChildInit, "parent.Update": c.ParentUpdate, "child.Update": c.ChildUpdate, "parent.View": c.ParentView, "child.View": c.ChildView, "parent.output": c.Output, "child.input": c.Input, "child.publication": c.Publication, "parent.receive": c.Receive}
}

func traceField(trace map[string]json.RawMessage, key string) json.RawMessage { return trace[key] }

func compareFields(object map[string]json.RawMessage, path string, want map[string]any) error {
	keys := make([]string, 0, len(want))
	for key := range want {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		raw, err := rawField(object, key, path)
		if err != nil {
			return err
		}
		if err := compareRaw(raw, want[key], path+"."+key); err != nil {
			return err
		}
	}
	return nil
}

func compareRawField(object map[string]json.RawMessage, key string, want any, path string) error {
	raw, err := rawField(object, key, path)
	if err != nil {
		return err
	}
	return compareRaw(raw, want, path+"."+key)
}

func compareArrayLength(object map[string]json.RawMessage, key string, want int, path string) error {
	raw, err := rawField(object, key, path)
	if err != nil {
		return err
	}
	var values []json.RawMessage
	if err := DecodeStrict(raw, &values); err != nil {
		return fmt.Errorf("%s.%s: %w", path, key, err)
	}
	if len(values) != want {
		return fmt.Errorf("%s.%s has %d entries, want %d", path, key, len(values), want)
	}
	return nil
}

func compareRaw(raw json.RawMessage, want any, path string) error {
	expected, err := json.Marshal(want)
	if err != nil {
		return fmt.Errorf("marshal expected %s: %w", path, err)
	}
	var gotValue, wantValue any
	if err := DecodeStrict(raw, &gotValue); err != nil {
		return fmt.Errorf("decode %s: %w", path, err)
	}
	if err := DecodeStrict(expected, &wantValue); err != nil {
		return fmt.Errorf("decode expected %s: %w", path, err)
	}
	if !reflect.DeepEqual(gotValue, wantValue) {
		return fmt.Errorf("%s differs from independently replayed Go value", path)
	}
	return nil
}

func inputPtrCapture(value modulewire.Input) *modulewire.Input           { return &value }
func pubPtrCapture(value modulewire.Publication) *modulewire.Publication { return &value }
func copyCaptureAction(a *compilercontract.Action) *compilercontract.Action {
	if a == nil {
		return nil
	}
	v := *a
	return &v
}
func copyCaptureInt(i *int) *int {
	if i == nil {
		return nil
	}
	v := *i
	return &v
}
func boolPtrCapture(v bool) *bool { return &v }
func boolToIntCapture(v bool) int {
	if v {
		return 1
	}
	return 0
}

func generateCaptureSeedScenario(seed, eventCount int) moduleScenario {
	random := captureSeedRandom(uint32(seed))
	events := []scenarioEvent{
		captureClick("child", "2/1"), captureClick("parent", "2"), captureClick("child", "2/1"), captureClick("parent", "3"),
		captureClick("child", "2/1"), captureClick("child", "2/2"), captureClick("parent", "4"), captureClick("child", "2/1"),
		captureClick("child", "2/2"), captureClick("parent", "1"), captureClick("parent", "2"), captureClick("parent", "3"),
	}
	operations := []scenarioEvent{captureClick("parent", "1"), captureClick("parent", "2"), captureClick("parent", "3"), captureClick("parent", "4"), captureClick("child", "2/1"), captureClick("child", "2/2")}
	for len(events) < eventCount {
		pick := int(random() * float64(len(operations)))
		events = append(events, operations[pick])
	}
	return moduleScenario{Schema: captureScenarioSchema, Name: fmt.Sprintf("seeded-module-pair-%d", seed), Events: events}
}

func captureClick(target, path string) scenarioEvent {
	return scenarioEvent{Kind: "click", Target: target, Action: &compilercontract.Action{Path: path, Event: "click", Value: ""}}
}

func captureSeedRandom(seed uint32) func() float64 {
	state := seed
	return func() float64 {
		state += 0x6d2b79f5
		value := state
		value = (value ^ (value >> 15)) * (value | 1)
		value ^= value + (value^(value>>7))*(value|61)
		value ^= value >> 14
		return float64(value) / 4294967296
	}
}

func captureReadRegularFile(root, relative string, maxBytes int64) ([]byte, error) {
	if filepath.IsAbs(relative) {
		return nil, fmt.Errorf("capture path %q must be relative", relative)
	}
	clean := filepath.Clean(filepath.FromSlash(relative))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return nil, fmt.Errorf("capture path %q escapes its root", relative)
	}
	current := root
	for _, part := range strings.Split(clean, string(filepath.Separator)) {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			return nil, fmt.Errorf("inspect capture file %q: %w", relative, err)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil, fmt.Errorf("capture path %q contains a symlink", relative)
		}
		if current != filepath.Join(root, clean) && !info.IsDir() {
			return nil, fmt.Errorf("capture path %q has a non-directory parent", relative)
		}
		if current == filepath.Join(root, clean) && !info.Mode().IsRegular() {
			return nil, fmt.Errorf("capture path %q is not a regular file", relative)
		}
	}
	info, err := os.Stat(filepath.Join(root, clean))
	if err != nil {
		return nil, err
	}
	if info.Size() < 0 || info.Size() > maxBytes {
		return nil, fmt.Errorf("capture file %q size %d exceeds limit %d", relative, info.Size(), maxBytes)
	}
	data, err := os.ReadFile(filepath.Join(root, clean))
	if err != nil {
		return nil, fmt.Errorf("read capture file %q: %w", relative, err)
	}
	return data, nil
}

func inputPointer(value modulewire.Input) *modulewire.Input                   { return &value }
func publicationPointer(value modulewire.Publication) *modulewire.Publication { return &value }
