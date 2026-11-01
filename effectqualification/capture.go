package effectqualification

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/effectsreplay"
	"github.com/samuelpmahan/gondola/gobi"
)

const (
	moduleEffectsScenarioSchema = "gobi.module-effects-scenario/v1"
	moduleEffectsCaptureSchema  = "gobi.module-effects-capture/v1"
	maxCaptureJSONBytes         = 96 << 20
)

var captureProfiles = []string{
	"direct.react",
	"direct.dom",
	"browser.react",
	"browser.dom",
	"browser.swap",
}

type scenarioPin struct {
	label      string
	name       string
	eventCount int
	sha256     string
	seed       int
}

// These pins define the finite scenario suite accepted by this package. They
// prevent an internally consistent replacement scenario from weakening the
// qualification cases while continuing to report a successful producer run.
var captureScenarios = []scenarioPin{
	{label: "literal", name: "module-effects-literal", eventCount: 31, sha256: "6bb440be0d2356e205fc0ecdb0eb26147fccde50633db0027cc870e8bc0c0291"},
	{label: "seed-20261104", name: "module-effects-seed-20261104", eventCount: 49, sha256: "13057b06bfbf3305cca2582602d3c79a9e11a1fb71210f70011385a7436282a5", seed: 20261104},
	{label: "seed-20261105", name: "module-effects-seed-20261105", eventCount: 50, sha256: "00b9f3a00d4b9bbf3ab534c78dd5751c5dc3e07857d14c1b54c1f2c5d6bf1781", seed: 20261105},
	{label: "seed-20261106", name: "module-effects-seed-20261106", eventCount: 48, sha256: "03834f539b084995b382e72c4dc9b247f88a1beec840e304090f5362568e8714", seed: 20261106},
}

// CaptureReport records the Go-replayed finite suite. Counts are scenario
// totals; Profiles counts each of the five direct/browser profiles per case.
type CaptureReport struct {
	Scenarios       int   `json:"scenarios"`
	Profiles        int   `json:"profiles"`
	Events          int   `json:"events"`
	States          int   `json:"states"`
	Effects         int   `json:"effects"`
	TransportEvents int   `json:"transportEvents"`
	Seeds           []int `json:"seeds"`
}

// CheckCaptures recomputes the four pinned PR23 scenarios with the Go replay
// package, then checks the native outputs and all five profile captures.
// root may name either an attempt directory or its conformance subdirectory.
func CheckCaptures(root string) (CaptureReport, error) {
	conformanceDir, err := resolveCaptureConformanceDir(root)
	if err != nil {
		return CaptureReport{}, err
	}

	report := CaptureReport{Scenarios: len(captureScenarios), Seeds: []int{}}
	for _, pin := range captureScenarios {
		scenarioPath := "effects." + pin.label + ".scenario.json"
		scenarioBytes, err := readCaptureFile(conformanceDir, scenarioPath)
		if err != nil {
			return CaptureReport{}, err
		}
		scenarioHash := sha256.Sum256(scenarioBytes)
		rawScenarioHash := hex.EncodeToString(scenarioHash[:])
		if rawScenarioHash != pin.sha256 {
			return CaptureReport{}, fmt.Errorf("scenario conformance/%s has SHA-256 %s, want %s", scenarioPath, rawScenarioHash, pin.sha256)
		}
		compactScenario, err := compactJSON(scenarioBytes)
		if err != nil {
			return CaptureReport{}, fmt.Errorf("compact scenario conformance/%s: %w", scenarioPath, err)
		}
		canonicalHash := sha256.Sum256(compactScenario)
		scenarioDigest := hex.EncodeToString(canonicalHash[:])
		scenario, err := decodeMapStrict(scenarioBytes)
		if err != nil {
			return CaptureReport{}, fmt.Errorf("scenario conformance/%s: %w", scenarioPath, err)
		}
		if err := validateScenario(scenario, pin, scenarioPath); err != nil {
			return CaptureReport{}, err
		}

		replayedBytes, err := effectsreplay.ReplayJSON(scenarioBytes)
		if err != nil {
			return CaptureReport{}, fmt.Errorf("Go replay conformance/%s: %w", scenarioPath, err)
		}
		replayed, err := decodeMapStrict(replayedBytes)
		if err != nil {
			return CaptureReport{}, fmt.Errorf("Go replay result for conformance/%s: %w", scenarioPath, err)
		}
		nativePath := "effects." + pin.label + ".native.json"
		nativeBytes, err := readCaptureFile(conformanceDir, nativePath)
		if err != nil {
			return CaptureReport{}, err
		}
		if !bytes.Equal(nativeBytes, replayedBytes) {
			return CaptureReport{}, fmt.Errorf("capture conformance/%s differs from effectsreplay.ReplayJSON output", nativePath)
		}
		native, err := decodeMapStrict(nativeBytes)
		if err != nil {
			return CaptureReport{}, fmt.Errorf("capture conformance/%s: %w", nativePath, err)
		}
		if err := validateNativeCounts(native, pin, scenarioPath); err != nil {
			return CaptureReport{}, err
		}

		stateRows, _ := requireArray(native, "states", "native replay")
		effectRows, _ := requireArray(native, "effects", "native replay")
		transportRows, _ := requireArray(native, "transportLedger", "native replay")
		report.Events += pin.eventCount
		report.States += len(stateRows)
		report.Effects += len(effectRows)
		report.TransportEvents += len(transportRows)
		if pin.seed != 0 {
			report.Seeds = append(report.Seeds, pin.seed)
		}

		for _, profile := range captureProfiles {
			capturePath := "effects." + pin.label + "." + profile + ".json"
			captureBytes, err := readCaptureFile(conformanceDir, capturePath)
			if err != nil {
				return CaptureReport{}, err
			}
			capture, err := decodeMapStrict(captureBytes)
			if err != nil {
				return CaptureReport{}, fmt.Errorf("capture conformance/%s: %w", capturePath, err)
			}
			if err := validateProfile(capture, scenario, native, pin, profile, scenarioPath, capturePath, scenarioDigest); err != nil {
				return CaptureReport{}, err
			}
			if err := CheckOrdering(replayed, capture); err != nil {
				return CaptureReport{}, fmt.Errorf("capture conformance/%s ordering: %w", capturePath, err)
			}
			report.Profiles++
		}
	}
	return report, nil
}

func resolveCaptureConformanceDir(root string) (string, error) {
	if strings.TrimSpace(root) == "" {
		return "", errors.New("capture root is empty")
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve capture root: %w", err)
	}
	info, err := os.Stat(abs)
	if err != nil {
		return "", fmt.Errorf("capture root %q: %w", root, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("capture root %q is not a directory", root)
	}
	if filepath.Base(abs) == "conformance" {
		return abs, nil
	}
	conformanceDir := filepath.Join(abs, "conformance")
	info, err = os.Stat(conformanceDir)
	if err != nil {
		return "", fmt.Errorf("capture root %q has no conformance directory: %w", root, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("capture root %q conformance path is not a directory", root)
	}
	return conformanceDir, nil
}

func readCaptureFile(conformanceDir, name string) ([]byte, error) {
	path := filepath.Join(conformanceDir, name)
	pathInfo, err := os.Lstat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("capture conformance/%s: missing required capture", name)
		}
		return nil, fmt.Errorf("capture conformance/%s: stat: %w", name, err)
	}
	if pathInfo.Mode()&os.ModeSymlink != 0 || !pathInfo.Mode().IsRegular() {
		return nil, fmt.Errorf("capture conformance/%s: required capture is not a regular file", name)
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("capture conformance/%s: open: %w", name, err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("capture conformance/%s: stat opened file: %w", name, err)
	}
	if !info.Mode().IsRegular() || !os.SameFile(pathInfo, info) {
		return nil, fmt.Errorf("capture conformance/%s: file changed or is not a regular file", name)
	}
	if info.Size() < 0 || info.Size() > maxCaptureJSONBytes {
		return nil, fmt.Errorf("capture conformance/%s: size %d exceeds the %d-byte limit", name, info.Size(), maxCaptureJSONBytes)
	}
	data, err := io.ReadAll(io.LimitReader(file, maxCaptureJSONBytes+1))
	if err != nil {
		return nil, fmt.Errorf("capture conformance/%s: read: %w", name, err)
	}
	if len(data) > maxCaptureJSONBytes {
		return nil, fmt.Errorf("capture conformance/%s: input exceeds the %d-byte limit", name, maxCaptureJSONBytes)
	}
	return data, nil
}

func validateScenario(scenario map[string]any, pin scenarioPin, path string) error {
	if err := requireStringEqual(scenario, "schema", moduleEffectsScenarioSchema, "scenario conformance/"+path); err != nil {
		return err
	}
	if err := requireStringEqual(scenario, "name", pin.name, "scenario conformance/"+path); err != nil {
		return err
	}
	events, err := requireArray(scenario, "events", "scenario conformance/"+path)
	if err != nil {
		return err
	}
	if len(events) != pin.eventCount {
		return fmt.Errorf("scenario conformance/%s has %d events, want %d", path, len(events), pin.eventCount)
	}
	for index, event := range events {
		if _, ok := event.(map[string]any); !ok {
			return fmt.Errorf("scenario conformance/%s events[%d] must be an object", path, index)
		}
	}
	return nil
}

func validateNativeCounts(native map[string]any, pin scenarioPin, scenarioPath string) error {
	if err := requireStringEqual(native, "schema", "gobi.module-effects-native/v1", "native replay for "+scenarioPath); err != nil {
		return err
	}
	if err := requireStringEqual(native, "name", pin.name, "native replay for "+scenarioPath); err != nil {
		return err
	}
	events, err := requireArray(native, "events", "native replay for "+scenarioPath)
	if err != nil {
		return err
	}
	if len(events) != pin.eventCount {
		return fmt.Errorf("native replay for %s has %d events, want %d", scenarioPath, len(events), pin.eventCount)
	}
	states, err := requireArray(native, "states", "native replay for "+scenarioPath)
	if err != nil {
		return err
	}
	if len(states) != pin.eventCount+1 {
		return fmt.Errorf("native replay for %s has %d states, want %d", scenarioPath, len(states), pin.eventCount+1)
	}
	for _, field := range []string{"effects", "transportLedger", "lifecycleLedger", "pendingTransports", "retiredChildren"} {
		if _, err := requireArray(native, field, "native replay for "+scenarioPath); err != nil {
			return err
		}
	}
	return nil
}

func validateProfile(capture, scenario, native map[string]any, pin scenarioPin, profile, scenarioPath, capturePath, scenarioDigest string) error {
	where := "capture conformance/" + capturePath
	if err := requireStringEqual(capture, "schema", moduleEffectsCaptureSchema, where); err != nil {
		return err
	}
	if err := requireStringEqual(capture, "profile", profile, where); err != nil {
		return err
	}
	if err := requireStringEqual(capture, "scenarioName", pin.name, where); err != nil {
		return err
	}
	if err := requireStringEqual(capture, "scenarioSHA256", scenarioDigest, where); err != nil {
		return err
	}
	if scenarioValue, exists := capture["scenario"]; !exists || !reflect.DeepEqual(scenarioValue, scenario) {
		return fmt.Errorf("%s scenario differs from pinned conformance/%s", where, scenarioPath)
	}
	if err := requireIntEqual(capture, "sourceEventCount", pin.eventCount, where); err != nil {
		return err
	}
	if profile == "direct.react" || profile == "browser.react" {
		if err := requireStringEqual(capture, "backend", "react", where); err != nil {
			return err
		}
	} else if profile == "direct.dom" || profile == "browser.dom" || profile == "browser.swap" {
		if err := requireStringEqual(capture, "backend", "dom", where); err != nil {
			return err
		}
	}
	if pin.seed == 0 {
		if seed, exists := capture["seed"]; !exists || seed != nil {
			return fmt.Errorf("%s seed must be null for the literal scenario", where)
		}
	} else if err := requireIntEqual(capture, "seed", pin.seed, where); err != nil {
		return err
	}

	scenarioEvents, err := requireArray(scenario, "events", "scenario")
	if err != nil {
		return err
	}
	nativeEvents, err := requireArray(native, "events", "native replay")
	if err != nil {
		return err
	}
	profileEvents, err := requireArray(capture, "events", where)
	if err != nil {
		return err
	}
	if len(profileEvents) != len(scenarioEvents) || len(nativeEvents) != len(scenarioEvents) {
		return fmt.Errorf("%s events has %d rows; scenario and Go replay require %d", where, len(profileEvents), len(scenarioEvents))
	}
	for index, source := range scenarioEvents {
		row, ok := profileEvents[index].(map[string]any)
		if !ok {
			return fmt.Errorf("%s events[%d] must be an object", where, index)
		}
		if err := requireIntEqual(row, "eventIndex", index, where+" events["+strconv.Itoa(index)+"]"); err != nil {
			return err
		}
		if got, exists := row["sourceEvent"]; !exists || !reflect.DeepEqual(got, source) {
			return fmt.Errorf("%s events[%d].sourceEvent differs from pinned scenario event", where, index)
		}
		nativeRow, ok := nativeEvents[index].(map[string]any)
		if !ok {
			return fmt.Errorf("native replay for %s events[%d] must be an object", scenarioPath, index)
		}
		if err := compareNativeExpected(row, nativeRow, index, where); err != nil {
			return err
		}
		if err := comparePhysicalClick(row, source, native, profile, index, where); err != nil {
			return err
		}
	}
	if err := compareProfileEffects(capture, native, where); err != nil {
		return err
	}
	if err := compareProfileSnapshots(capture, native, profile, where); err != nil {
		return err
	}
	return nil
}

func compareNativeExpected(capturedEvent, nativeEvent map[string]any, index int, where string) error {
	accepted, err := requireBool(nativeEvent, "accepted", fmt.Sprintf("native replay events[%d]", index))
	if err != nil {
		return err
	}
	// The replay schema omits a nil declared message on rejected transport and
	// renderer events; absence and explicit null both mean no declared message.
	declared := nativeEvent["message"]
	message := any(nil)
	if accepted {
		message = declared
	}
	stateIndex, exists := nativeEvent["stateIndex"]
	if !exists {
		return fmt.Errorf("native replay events[%d] is missing stateIndex", index)
	}
	effectIndices, exists := nativeEvent["effectIndices"]
	if !exists {
		return fmt.Errorf("native replay events[%d] is missing effectIndices", index)
	}
	if _, ok := effectIndices.([]any); !ok {
		return fmt.Errorf("native replay events[%d].effectIndices must be an array", index)
	}
	want := map[string]any{
		"accepted":        accepted,
		"declaredMessage": declared,
		"message":         message,
		"stateIndex":      stateIndex,
		"effectIndices":   effectIndices,
	}
	got, exists := capturedEvent["nativeExpected"]
	if !exists || !reflect.DeepEqual(got, want) {
		return fmt.Errorf("%s events[%d].nativeExpected differs from Go replay", where, index)
	}
	gotAccepted, err := requireBool(capturedEvent, "accepted", fmt.Sprintf("%s events[%d]", where, index))
	if err != nil {
		return err
	}
	if gotAccepted != accepted {
		return fmt.Errorf("%s events[%d].accepted differs from Go replay", where, index)
	}
	gotMessage, exists := capturedEvent["message"]
	wantCaptureMessage := any(nil)
	if source, ok := capturedEvent["sourceEvent"].(map[string]any); ok && source["kind"] == "click" {
		wantCaptureMessage = message
	}
	if !exists || !reflect.DeepEqual(gotMessage, wantCaptureMessage) {
		return fmt.Errorf("%s events[%d].message differs from Go replay", where, index)
	}
	return nil
}

func comparePhysicalClick(capturedEvent map[string]any, sourceValue any, native map[string]any, profile string, index int, where string) error {
	source, ok := sourceValue.(map[string]any)
	if !ok {
		return fmt.Errorf("scenario event %d must be an object", index)
	}
	kind, err := requireString(source, "kind", fmt.Sprintf("scenario events[%d]", index))
	if err != nil {
		return err
	}
	domClickValue, exists := capturedEvent["domClick"]
	if !exists {
		return fmt.Errorf("%s events[%d] is missing domClick", where, index)
	}
	browser := strings.HasPrefix(profile, "browser.")
	if !browser || kind != "click" {
		if domClickValue != nil {
			return fmt.Errorf("%s events[%d].domClick must be null for profile %s and event kind %s", where, index, profile, kind)
		}
		return nil
	}
	domClick, ok := domClickValue.(map[string]any)
	if !ok {
		return fmt.Errorf("%s events[%d].domClick must be an object for a browser click", where, index)
	}
	stateRows, err := requireArray(native, "states", "native replay")
	if err != nil {
		return err
	}
	if index >= len(stateRows) {
		return fmt.Errorf("native replay has no pre-event state for event %d", index)
	}
	state, ok := stateRows[index].(map[string]any)
	if !ok {
		return fmt.Errorf("native replay states[%d] must be an object", index)
	}
	view, err := eventTargetView(state, source)
	if err != nil {
		return fmt.Errorf("%s events[%d] Go view: %w", where, index, err)
	}
	action, err := requireMap(source, "action", fmt.Sprintf("scenario events[%d]", index))
	if err != nil {
		return err
	}
	actionPath, err := requireString(action, "path", fmt.Sprintf("scenario events[%d].action", index))
	if err != nil {
		return err
	}
	target, err := findViewPath(view, actionPath)
	if err != nil {
		return fmt.Errorf("%s events[%d].domClick Go view path %q: %w", where, index, actionPath, err)
	}
	if target.Kind != gobi.Element || target.Tag != "button" {
		return fmt.Errorf("%s events[%d].domClick targets Go view node %q, want button", where, index, actionPath)
	}
	disabled := nodeIsDisabled(target)
	gotDisabled, err := requireBool(domClick, "disabledBefore", fmt.Sprintf("%s events[%d].domClick", where, index))
	if err != nil {
		return err
	}
	if gotDisabled != disabled {
		return fmt.Errorf("%s events[%d].domClick.disabledBefore differs from Go-rendered view (want %t)", where, index, disabled)
	}
	for key, want := range map[string]any{
		"usedHTMLElementClick": true,
		"tag":                  "button",
		"connectedBefore":      true,
		"type":                 nodeType(target),
		"text":                 nodeText(target),
		"outerHTMLBefore":      gobi.HTML(target),
		"callbackDelta":        json.Number(strconv.Itoa(boolInt(!disabled))),
	} {
		if err := requireEqual(domClick, key, want, fmt.Sprintf("%s events[%d].domClick", where, index)); err != nil {
			return err
		}
	}
	nativeExpected, err := requireMap(capturedEvent, "nativeExpected", fmt.Sprintf("%s events[%d]", where, index))
	if err != nil {
		return err
	}
	wantMessage := nativeExpected["message"]
	if err := requireEqual(domClick, "observedMessage", wantMessage, fmt.Sprintf("%s events[%d].domClick", where, index)); err != nil {
		return err
	}
	callbackResult, exists := domClick["callbackResult"]
	if !exists {
		return fmt.Errorf("%s events[%d].domClick is missing callbackResult", where, index)
	}
	result, exists := capturedEvent["result"]
	if !exists {
		return fmt.Errorf("%s events[%d] is missing result", where, index)
	}
	if !reflect.DeepEqual(callbackResult, result) {
		return fmt.Errorf("%s events[%d].domClick.callbackResult differs from event result", where, index)
	}
	return nil
}

func eventTargetView(state, source map[string]any) (gobi.Node, error) {
	target, err := requireString(source, "target", "scenario click event")
	if err != nil {
		return gobi.Node{}, err
	}
	var view map[string]any
	switch target {
	case "parent":
		var exists bool
		view, exists = state["parentView"].(map[string]any)
		if !exists {
			return gobi.Node{}, errors.New("native replay state is missing parentView")
		}
	case "child":
		key, err := requireString(source, "key", "scenario child click event")
		if err != nil {
			return gobi.Node{}, err
		}
		children, err := requireArray(state, "children", "native replay state")
		if err != nil {
			return gobi.Node{}, err
		}
		found := false
		for index, value := range children {
			child, ok := value.(map[string]any)
			if !ok {
				return gobi.Node{}, fmt.Errorf("native replay state.children[%d] must be an object", index)
			}
			if child["key"] == key {
				view, err = requireMap(child, "view", "native replay child")
				if err != nil {
					return gobi.Node{}, err
				}
				found = true
				break
			}
		}
		if !found {
			return gobi.Node{}, fmt.Errorf("native replay state has no mounted child %q", key)
		}
	default:
		return gobi.Node{}, fmt.Errorf("unsupported click target %q", target)
	}
	return decodeGobiNode(view)
}

func findViewPath(root gobi.Node, path string) (gobi.Node, error) {
	if path == "" {
		return gobi.Node{}, errors.New("path is empty")
	}
	current := root
	for _, part := range strings.Split(path, "/") {
		index, err := strconv.Atoi(part)
		if err != nil || index < 0 || index >= len(current.Kids) {
			return gobi.Node{}, fmt.Errorf("invalid child index %q", part)
		}
		current = current.Kids[index]
	}
	return current, nil
}

func nodeIsDisabled(node gobi.Node) bool {
	for _, attr := range node.Attrs {
		if attr.Name == "disabled" && attr.Flag {
			return true
		}
	}
	return false
}

func nodeType(node gobi.Node) string {
	for _, attr := range node.Attrs {
		if attr.Name == "type" {
			return attr.Value
		}
	}
	if node.Tag == "button" {
		return "submit"
	}
	return ""
}

func nodeText(node gobi.Node) string {
	var text strings.Builder
	appendNodeText(&text, node)
	return text.String()
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func compareProfileEffects(capture, native map[string]any, where string) error {
	expected, err := requireArray(native, "effects", "native replay")
	if err != nil {
		return err
	}
	actual, err := requireArray(capture, "effectLedger", where)
	if err != nil {
		return err
	}
	gotDescriptors := make([]any, 0, len(expected))
	for index, rowValue := range actual {
		row, ok := rowValue.(map[string]any)
		if !ok {
			return fmt.Errorf("%s effectLedger[%d] must be an object", where, index)
		}
		// Start/reply rows omit descriptor because only request/cancel rows
		// carry a Go effect descriptor. A missing field is therefore null here.
		descriptor := row["descriptor"]
		if descriptor != nil {
			gotDescriptors = append(gotDescriptors, descriptor)
		}
	}
	wantDescriptors := make([]any, 0, len(expected))
	for index, rowValue := range expected {
		row, ok := rowValue.(map[string]any)
		if !ok {
			return fmt.Errorf("native replay effects[%d] must be an object", index)
		}
		descriptor, exists := row["effect"]
		if !exists || descriptor == nil {
			return fmt.Errorf("native replay effects[%d] is missing effect descriptor", index)
		}
		wantDescriptors = append(wantDescriptors, descriptor)
	}
	if !reflect.DeepEqual(gotDescriptors, wantDescriptors) {
		return fmt.Errorf("%s effectLedger descriptors differ from Go replay effects", where)
	}
	return nil
}

func compareProfileSnapshots(capture, native map[string]any, profile, where string) error {
	wantStates, err := requireArray(native, "states", "native replay")
	if err != nil {
		return err
	}
	gotRows, err := requireArray(capture, "snapshots", where)
	if err != nil {
		return err
	}
	if len(gotRows) != len(wantStates) {
		return fmt.Errorf("%s snapshots has %d rows; Go replay requires %d", where, len(gotRows), len(wantStates))
	}
	for stateIndex, stateValue := range wantStates {
		state, ok := stateValue.(map[string]any)
		if !ok {
			return fmt.Errorf("native replay states[%d] must be an object", stateIndex)
		}
		row, ok := gotRows[stateIndex].(map[string]any)
		if !ok {
			return fmt.Errorf("%s snapshots[%d] must be an object", where, stateIndex)
		}
		wantEventIndex := stateIndex - 1
		if err := requireIntEqual(row, "eventIndex", wantEventIndex, fmt.Sprintf("%s snapshots[%d]", where, stateIndex)); err != nil {
			return err
		}
		snapshot, err := requireMap(row, "snapshot", fmt.Sprintf("%s snapshots[%d]", where, stateIndex))
		if err != nil {
			return err
		}
		if err := compareSnapshotState(snapshot, state, capture, native, stateIndex, where); err != nil {
			return err
		}
		if strings.HasPrefix(profile, "browser.") {
			if err := compareBrowserDOM(row, state, profile, stateIndex, where); err != nil {
				return err
			}
		} else if dom, exists := row["dom"]; !exists || dom != nil {
			return fmt.Errorf("%s snapshots[%d].dom must be null for a direct profile", where, stateIndex)
		}
	}
	return nil
}

func compareSnapshotState(snapshot, expected, capture, native map[string]any, stateIndex int, where string) error {
	path := fmt.Sprintf("%s snapshots[%d].snapshot", where, stateIndex)
	if err := requireStringEqual(snapshot, "schema", "gobi.module-effects-snapshot/v1", path); err != nil {
		return err
	}
	wantParent, err := requireMap(expected, "parent", "native replay state")
	if err != nil {
		return err
	}
	wantParentState, err := requireMap(wantParent, "Parent", "native replay state.parent")
	if err != nil {
		return err
	}
	wantParentView, err := requireMap(expected, "parentView", "native replay state")
	if err != nil {
		return err
	}
	parent, err := requireMap(snapshot, "parent", path)
	if err != nil {
		return err
	}
	if err := requireEqual(parent, "goState", wantParent, path+".parent"); err != nil {
		return err
	}
	if err := requireEqual(parent, "state", wantParentState, path+".parent"); err != nil {
		return err
	}
	controller, err := expectedControllerState(wantParent)
	if err != nil {
		return err
	}
	if err := requireEqual(parent, "controllerState", controller, path+".parent"); err != nil {
		return err
	}
	parentView, err := requireMap(parent, "view", path+".parent")
	if err != nil {
		return err
	}
	if err := requireEqual(parentView, "tree", wantParentView, path+".parent.view"); err != nil {
		return err
	}
	if err := requireEmptyArray(parentView, "bindings", path+".parent.view"); err != nil {
		return err
	}

	wantChildren, err := requireArray(expected, "children", "native replay state")
	if err != nil {
		return err
	}
	children, err := requireArray(snapshot, "children", path)
	if err != nil {
		return err
	}
	if len(children) != len(wantChildren) {
		return fmt.Errorf("%s.children has %d rows; Go replay requires %d", path, len(children), len(wantChildren))
	}
	for index, expectedValue := range wantChildren {
		wantChild, ok := expectedValue.(map[string]any)
		if !ok {
			return fmt.Errorf("native replay state.children[%d] must be an object", index)
		}
		child, ok := children[index].(map[string]any)
		if !ok {
			return fmt.Errorf("%s.children[%d] must be an object", path, index)
		}
		childPath := fmt.Sprintf("%s.children[%d]", path, index)
		for _, field := range []string{"key", "generation"} {
			if err := requireEqual(child, field, wantChild[field], childPath); err != nil {
				return err
			}
		}
		wantState, err := requireMap(wantChild, "state", "native replay child")
		if err != nil {
			return err
		}
		if err := requireEqual(child, "state", wantState, childPath); err != nil {
			return err
		}
		if err := requireEqual(child, "goState", wantState, childPath); err != nil {
			return err
		}
		wantView, err := requireMap(wantChild, "view", "native replay child")
		if err != nil {
			return err
		}
		view, err := requireMap(child, "view", childPath)
		if err != nil {
			return err
		}
		if err := requireEqual(view, "tree", wantView, childPath+".view"); err != nil {
			return err
		}
		if err := requireEmptyArray(view, "bindings", childPath+".view"); err != nil {
			return err
		}
		input, err := expectedChildInput(wantState)
		if err != nil {
			return err
		}
		if err := requireEqual(child, "input", input, childPath); err != nil {
			return err
		}
	}
	if err := compareEffectPending(snapshot, expected, capture, native, path); err != nil {
		return err
	}
	return nil
}

func compareEffectPending(snapshot, expectedState, capture, native map[string]any, path string) error {
	wantChildren, err := requireArray(expectedState, "children", "native replay state")
	if err != nil {
		return err
	}
	actualPending, err := requireArray(snapshot, "effectPending", path)
	if err != nil {
		return err
	}
	nativeEffects, err := requireArray(native, "effects", "native replay")
	if err != nil {
		return err
	}
	capturedLedger, err := requireArray(capture, "effectLedger", "capture")
	if err != nil {
		return err
	}
	type pendingExpectation struct {
		sequence int
		row      map[string]any
	}
	wantPending := make([]pendingExpectation, 0)
	for index, childValue := range wantChildren {
		child, ok := childValue.(map[string]any)
		if !ok {
			return fmt.Errorf("native replay state.children[%d] must be an object", index)
		}
		state, err := requireMap(child, "state", "native replay child")
		if err != nil {
			return err
		}
		pending, err := requireBool(state, "Pending", "native replay child state")
		if err != nil {
			return err
		}
		if !pending {
			continue
		}
		key, err := requireString(child, "key", "native replay child")
		if err != nil {
			return err
		}
		generation, exists := child["generation"]
		if !exists {
			return fmt.Errorf("native replay child %q is missing generation", key)
		}
		token, err := requireString(state, "Token", "native replay child state")
		if err != nil {
			return err
		}
		var descriptor any
		for effectIndex, effectValue := range nativeEffects {
			effectRow, ok := effectValue.(map[string]any)
			if !ok {
				return fmt.Errorf("native replay effects[%d] must be an object", effectIndex)
			}
			if effectRow["key"] != key || !reflect.DeepEqual(effectRow["generation"], generation) {
				continue
			}
			effect, err := requireMap(effectRow, "effect", "native replay effect")
			if err != nil {
				return err
			}
			if effect["kind"] == "fixture.request" && effect["arg"] == token {
				if descriptor != nil {
					return fmt.Errorf("native replay has duplicate request effects for token %q", token)
				}
				descriptor = effect
			}
		}
		if descriptor == nil {
			return fmt.Errorf("native replay has no fixture.request effect for pending token %q", token)
		}
		var requestLedger map[string]any
		for ledgerIndex, ledgerValue := range capturedLedger {
			ledgerRow, ok := ledgerValue.(map[string]any)
			if !ok {
				return fmt.Errorf("capture effectLedger[%d] must be an object", ledgerIndex)
			}
			if ledgerRow["kind"] == "request" && ledgerRow["token"] == token {
				if requestLedger != nil {
					return fmt.Errorf("capture effectLedger has duplicate request rows for token %q", token)
				}
				requestLedger = ledgerRow
			}
		}
		if requestLedger == nil || !reflect.DeepEqual(requestLedger["descriptor"], descriptor) {
			return fmt.Errorf("%s has no matching Go request descriptor for pending token %q", path, token)
		}
		correlation, err := requireMap(requestLedger, "correlation", "capture request effect ledger")
		if err != nil {
			return err
		}
		dispatchID, err := requireString(correlation, "dispatchId", "capture request effect correlation")
		if err != nil {
			return err
		}
		if dispatchID == "" {
			return fmt.Errorf("capture request effect for token %q has empty dispatchId", token)
		}
		effectIndex, exists := correlation["effectIndex"]
		if !exists {
			return fmt.Errorf("capture request effect for token %q is missing effectIndex", token)
		}
		stateEventIndex, exists := requestLedger["stateEventIndex"]
		if !exists {
			return fmt.Errorf("capture request effect for token %q is missing stateEventIndex", token)
		}
		ledgerSequence, exists := requestLedger["sequence"]
		if !exists {
			return fmt.Errorf("capture request effect for token %q is missing sequence", token)
		}
		sequence, err := jsonInt(ledgerSequence)
		if err != nil {
			return fmt.Errorf("capture request effect for token %q sequence: %w", token, err)
		}
		status, err := requireString(requestLedger, "status", "capture request effect ledger")
		if err != nil {
			return err
		}
		if status != "queued" {
			return fmt.Errorf("capture request effect for pending token %q has status %q, want queued", token, status)
		}
		wantPending = append(wantPending, pendingExpectation{sequence: sequence, row: map[string]any{
			"sequence": dispatchID, "dispatchId": dispatchID, "effectIndex": effectIndex,
			"token": token, "key": key, "generation": generation, "effect": descriptor,
			"status": "pending", "stateEventIndex": stateEventIndex,
		}})
	}
	sort.Slice(wantPending, func(i, j int) bool { return wantPending[i].sequence < wantPending[j].sequence })
	if len(actualPending) != len(wantPending) {
		return fmt.Errorf("%s.effectPending has %d rows; Go replay requires %d", path, len(actualPending), len(wantPending))
	}
	for index := range wantPending {
		got, ok := actualPending[index].(map[string]any)
		if !ok {
			return fmt.Errorf("%s.effectPending[%d] must be an object", path, index)
		}
		if !reflect.DeepEqual(got, wantPending[index].row) {
			return fmt.Errorf("%s.effectPending[%d] differs from Go child state and request effect", path, index)
		}
	}
	return nil
}

func expectedControllerState(parent map[string]any) (map[string]any, error) {
	convertSlot := func(name string) (map[string]any, error) {
		slot, err := requireMap(parent, name, "native replay state.parent")
		if err != nil {
			return nil, err
		}
		fields := [][2]string{{"Key", "key"}, {"Generation", "generation"}, {"Mounted", "mounted"}, {"PublishedCount", "publishedCount"}, {"PublishedRevision", "publishedRevision"}}
		result := make(map[string]any, len(fields))
		for _, field := range fields {
			value, exists := slot[field[0]]
			if !exists {
				return nil, fmt.Errorf("native replay state.parent.%s is missing %s", name, field[0])
			}
			result[field[1]] = value
		}
		return result, nil
	}
	a, err := convertSlot("A")
	if err != nil {
		return nil, err
	}
	b, err := convertSlot("B")
	if err != nil {
		return nil, err
	}
	first, ok := parent["First"]
	if !ok {
		return nil, errors.New("native replay state.parent is missing First")
	}
	second, ok := parent["Second"]
	if !ok {
		return nil, errors.New("native replay state.parent is missing Second")
	}
	childCount, ok := parent["ChildCount"]
	if !ok {
		return nil, errors.New("native replay state.parent is missing ChildCount")
	}
	return map[string]any{"a": a, "b": b, "first": first, "second": second, "childCount": childCount}, nil
}

func expectedChildInput(state map[string]any) (map[string]any, error) {
	core, err := requireMap(state, "Core", "native replay child state")
	if err != nil {
		return nil, err
	}
	step, hasStep := core["Step"]
	locked, hasLocked := core["Locked"]
	revision, hasRevision := core["InputRevision"]
	if !hasStep || !hasLocked || !hasRevision {
		return nil, errors.New("native replay child state.Core is missing Step, Locked, or InputRevision")
	}
	return map[string]any{"Step": step, "Locked": locked, "Revision": revision}, nil
}

func compareBrowserDOM(row, state map[string]any, profile string, stateIndex int, where string) error {
	path := fmt.Sprintf("%s snapshots[%d].dom", where, stateIndex)
	dom, err := requireMap(row, "dom", fmt.Sprintf("%s snapshots[%d]", where, stateIndex))
	if err != nil {
		return err
	}
	expectedHTML, expectedControls, err := renderGoDOM(state)
	if err != nil {
		return fmt.Errorf("%s Go render: %w", path, err)
	}
	gotHTML, err := requireString(dom, "html", path)
	if err != nil {
		return err
	}
	if gotHTML != expectedHTML {
		return fmt.Errorf("%s Go-rendered DOM differs from Go view markup", path)
	}
	controls, err := requireArray(dom, "controls", path)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(controls, expectedControls) {
		return fmt.Errorf("%s controls or disabled properties differ from Go-rendered views for %s", path, profile)
	}
	return nil
}

func renderGoDOM(state map[string]any) (string, []any, error) {
	parentValue, err := requireMap(state, "parentView", "native replay state")
	if err != nil {
		return "", nil, err
	}
	parent, err := decodeGobiNode(parentValue)
	if err != nil {
		return "", nil, fmt.Errorf("decode Go parent view: %w", err)
	}
	children, err := requireArray(state, "children", "native replay state")
	if err != nil {
		return "", nil, err
	}
	roots := make([]gobi.Node, 0, len(children)+1)
	parentRoot := gobi.El("div", parent).Set("data-gobi-module-root", "parent")
	roots = append(roots, parentRoot)
	controls := make([]any, 0)
	collectDOMControls(parent, nil, nil, &controls)
	for index, childValue := range children {
		child, ok := childValue.(map[string]any)
		if !ok {
			return "", nil, fmt.Errorf("native replay state.children[%d] must be an object", index)
		}
		key, err := requireString(child, "key", "native replay child")
		if err != nil {
			return "", nil, err
		}
		generation, exists := child["generation"]
		if !exists {
			return "", nil, errors.New("native replay child is missing generation")
		}
		generationString := fmt.Sprint(generation)
		viewValue, err := requireMap(child, "view", "native replay child")
		if err != nil {
			return "", nil, err
		}
		view, err := decodeGobiNode(viewValue)
		if err != nil {
			return "", nil, fmt.Errorf("decode Go child %q view: %w", key, err)
		}
		childRoot := gobi.El("div", view).
			Set("data-gobi-module-root", "child-"+key).
			Set("data-gobi-key", key).
			Set("data-gobi-generation", generationString)
		roots = append(roots, childRoot)
		collectDOMControls(view, &key, &generationString, &controls)
	}
	return gobi.HTML(gobi.Frag(roots...)), controls, nil
}

func decodeGobiNode(record map[string]any) (gobi.Node, error) {
	encoded, err := json.Marshal(record)
	if err != nil {
		return gobi.Node{}, err
	}
	var node moduleNodeRecord
	if err := decodeJSONStrict(encoded, &node); err != nil {
		return gobi.Node{}, err
	}
	return node.toGobi(), nil
}

type moduleNodeRecord struct {
	Kind  gobi.Kind          `json:"kind"`
	Tag   string             `json:"tag"`
	Key   string             `json:"key"`
	Attrs []moduleAttrRecord `json:"attrs"`
	On    []moduleOnRecord   `json:"on"`
	Kids  []moduleNodeRecord `json:"kids"`
	Text  string             `json:"text"`
}

type moduleAttrRecord struct {
	Name  string              `json:"name"`
	Value string              `json:"value"`
	Flag  bool                `json:"flag"`
	Style []moduleStyleRecord `json:"style"`
}

type moduleStyleRecord struct {
	Property string `json:"property"`
	Value    string `json:"value"`
}

type moduleOnRecord struct {
	Event   string `json:"event"`
	Message string `json:"message"`
	Arg     string `json:"arg"`
}

func (record moduleNodeRecord) toGobi() gobi.Node {
	node := gobi.Node{Kind: record.Kind, Tag: record.Tag, Key: record.Key, Text: record.Text}
	if record.Attrs != nil {
		node.Attrs = make([]gobi.Attr, 0, len(record.Attrs))
		for _, attr := range record.Attrs {
			converted := gobi.Attr{Name: attr.Name, Value: attr.Value, Flag: attr.Flag}
			if attr.Style != nil {
				converted.Style = make([]gobi.Style, 0, len(attr.Style))
				for _, style := range attr.Style {
					converted.Style = append(converted.Style, gobi.Style{Property: style.Property, Value: style.Value})
				}
			}
			node.Attrs = append(node.Attrs, converted)
		}
	}
	if record.On != nil {
		node.On = make([]gobi.On, 0, len(record.On))
		for _, handler := range record.On {
			node.On = append(node.On, gobi.On{Event: handler.Event, Message: handler.Message, Arg: handler.Arg})
		}
	}
	if record.Kids != nil {
		node.Kids = make([]gobi.Node, 0, len(record.Kids))
		for _, child := range record.Kids {
			node.Kids = append(node.Kids, child.toGobi())
		}
	}
	return node
}

func collectDOMControls(node gobi.Node, parentKey, parentGeneration *string, output *[]any) {
	if node.Kind == gobi.Element && isDOMControl(node.Tag) {
		get := func(name string) string {
			for _, attr := range node.Attrs {
				if attr.Name == name {
					return attr.Value
				}
			}
			return ""
		}
		disabled := false
		for _, attr := range node.Attrs {
			if attr.Name == "disabled" && attr.Flag {
				disabled = true
			}
		}
		text := strings.Builder{}
		for _, child := range node.Kids {
			appendNodeText(&text, child)
		}
		var key any
		var generation any
		if parentKey != nil {
			key = *parentKey
		}
		if parentGeneration != nil {
			generation = *parentGeneration
		}
		typeValue := get("type")
		if typeValue == "" && node.Tag == "button" {
			typeValue = "submit"
		}
		*output = append(*output, map[string]any{
			"tag": node.Tag, "type": typeValue, "text": text.String(), "value": get("value"),
			"disabled": disabled, "connected": true, "className": get("class"),
			"parentKey": key, "parentGeneration": generation,
		})
	}
	for _, child := range node.Kids {
		collectDOMControls(child, parentKey, parentGeneration, output)
	}
}

func appendNodeText(output *strings.Builder, node gobi.Node) {
	if node.Kind == gobi.Text {
		output.WriteString(node.Text)
		return
	}
	for _, child := range node.Kids {
		appendNodeText(output, child)
	}
}

func isDOMControl(tag string) bool {
	switch tag {
	case "button", "input", "select", "textarea":
		return true
	default:
		return false
	}
}

func requireMap(object map[string]any, key, path string) (map[string]any, error) {
	value, exists := object[key]
	if !exists {
		return nil, fmt.Errorf("%s is missing %s", path, key)
	}
	result, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s.%s must be an object, got %T", path, key, value)
	}
	return result, nil
}

func requireArray(object map[string]any, key, path string) ([]any, error) {
	value, exists := object[key]
	if !exists {
		return nil, fmt.Errorf("%s is missing %s", path, key)
	}
	result, ok := value.([]any)
	if !ok {
		return nil, fmt.Errorf("%s.%s must be an array, got %T", path, key, value)
	}
	return result, nil
}

func requireString(object map[string]any, key, path string) (string, error) {
	value, exists := object[key]
	if !exists {
		return "", fmt.Errorf("%s is missing %s", path, key)
	}
	result, ok := value.(string)
	if !ok {
		return "", fmt.Errorf("%s.%s must be a string, got %T", path, key, value)
	}
	return result, nil
}

func requireBool(object map[string]any, key, path string) (bool, error) {
	value, exists := object[key]
	if !exists {
		return false, fmt.Errorf("%s is missing %s", path, key)
	}
	result, ok := value.(bool)
	if !ok {
		return false, fmt.Errorf("%s.%s must be a boolean, got %T", path, key, value)
	}
	return result, nil
}

func requireStringEqual(object map[string]any, key, want, path string) error {
	got, err := requireString(object, key, path)
	if err != nil {
		return err
	}
	if got != want {
		return fmt.Errorf("%s.%s = %q, want %q", path, key, got, want)
	}
	return nil
}

func requireIntEqual(object map[string]any, key string, want int, path string) error {
	value, exists := object[key]
	if !exists {
		return fmt.Errorf("%s is missing %s", path, key)
	}
	got, err := jsonInt(value)
	if err != nil {
		return fmt.Errorf("%s.%s: %w", path, key, err)
	}
	if got != want {
		return fmt.Errorf("%s.%s = %d, want %d", path, key, got, want)
	}
	return nil
}

func requireEqual(object map[string]any, key string, want any, path string) error {
	got, exists := object[key]
	if !exists {
		return fmt.Errorf("%s is missing %s", path, key)
	}
	if !reflect.DeepEqual(got, want) {
		return fmt.Errorf("%s.%s differs from replayed Go value", path, key)
	}
	return nil
}

func requireEmptyArray(object map[string]any, key, path string) error {
	array, err := requireArray(object, key, path)
	if err != nil {
		return err
	}
	if len(array) != 0 {
		return fmt.Errorf("%s.%s has %d bindings; want empty", path, key, len(array))
	}
	return nil
}

func jsonInt(value any) (int, error) {
	var number string
	switch typed := value.(type) {
	case json.Number:
		number = typed.String()
	case int:
		return typed, nil
	case int64:
		return int(typed), nil
	default:
		return 0, fmt.Errorf("want integer, got %T", value)
	}
	parsed, err := strconv.ParseInt(number, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("want integer, got %q", number)
	}
	return int(parsed), nil
}
