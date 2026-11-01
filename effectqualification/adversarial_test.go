package effectqualification

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// TestPR23CaptureSemanticMutationControls is a positive-control-backed set of
// native semantic negatives. Each modified profile capture is rehashed into
// the producer's summary/check inventory so a stale digest cannot masquerade
// as semantic detection. The original PR23 capture tree remains immutable.
func TestPR23CaptureSemanticMutationControls(t *testing.T) {
	root := effectsQualificationInput(t)
	if _, err := CheckCaptures(root); err != nil {
		t.Fatalf("unmodified PR23 capture set is not a positive control: %v", err)
	}

	target := filepath.Join("conformance", "effects.literal.browser.dom.json")
	cases := []struct {
		name       string
		pointer    string
		value      any
		wantReason string
	}{
		{
			name:       "Go state",
			pointer:    "/snapshots/0/snapshot/children/0/goState/Core/Step",
			value:      json.Number("17"),
			wantReason: "snapshots[0].snapshot.children[0].goState differs from replayed Go value",
		},
		{
			name:       "Go view tree",
			pointer:    "/snapshots/0/snapshot/children/0/view/tree/kids/0/kids/1/text",
			value:      "forged tree text",
			wantReason: "snapshots[0].snapshot.children[0].view.tree differs from replayed Go value",
		},
		{
			name:       "rendered DOM",
			pointer:    "/snapshots/0/dom/html",
			value:      "<section>forged DOM</section>",
			wantReason: "Go-rendered DOM differs",
		},
		{
			name:       "disabled browser control",
			pointer:    "/events/0/domClick/disabledBefore",
			value:      false,
			wantReason: "events[0].domClick.disabledBefore differs from Go-rendered view",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			baselineHash := qualificationFileSHA256(t, filepath.Join(root, target))
			overlay := hardlinkConformanceOverlay(t, root)
			capturePath := filepath.Join(overlay, target)
			capture := readQualificationJSONMap(t, capturePath)
			if err := setQualificationJSONPointer(capture, tc.pointer, tc.value); err != nil {
				t.Fatalf("mutate %s: %v", tc.pointer, err)
			}
			writeQualificationJSON(t, capturePath, capture)
			refreshCaptureInventory(t, overlay, "literal", "browser.dom", filepath.Base(capturePath))

			_, err := CheckCaptures(overlay)
			if err == nil {
				t.Fatalf("CheckCaptures accepted mutation at %s", tc.pointer)
			}
			if !strings.Contains(err.Error(), tc.wantReason) {
				t.Fatalf("mutation at %s was rejected for an unrelated reason; wanted %q, got: %v", tc.pointer, tc.wantReason, err)
			}
			if got := qualificationFileSHA256(t, filepath.Join(root, target)); got != baselineHash {
				t.Fatalf("mutation changed immutable PR23 capture: before=%s after=%s", baselineHash, got)
			}
			t.Logf("mutated %s; CheckCaptures rejected it for %q: %v", tc.pointer, tc.wantReason, err)
		})
	}
}

// TestPR23OrderingRejectsEventAndCorrelationForgery invokes CheckOrdering
// directly with the real native replay and browser.swap capture. Its positive
// control prevents these negatives from passing because the baseline shape is
// incompatible with the ordering API.
func TestPR23OrderingRejectsEventAndCorrelationForgery(t *testing.T) {
	root := effectsQualificationInput(t)
	conformance := filepath.Join(root, "conformance")
	expectedPath := filepath.Join(conformance, "effects.literal.native.json")
	actualPath := filepath.Join(conformance, "effects.literal.browser.swap.json")
	expected := readQualificationJSONMap(t, expectedPath)
	actual := readQualificationJSONMap(t, actualPath)
	if err := CheckOrdering(expected, actual); err != nil {
		t.Fatalf("unmodified browser.swap ordering is not a positive control: %v", err)
	}

	cases := []struct {
		name       string
		pointer    string
		value      any
		wantReason string
	}{
		{
			name:       "event sequence",
			pointer:    "/events/1/eventIndex",
			value:      json.Number("2"),
			wantReason: "eventIndex",
		},
		{
			name:       "transport correlation",
			pointer:    "/transportLedger/0/correlation/effectIndex",
			value:      json.Number("91"),
			wantReason: "start correlation differs from ordered action",
		},
		{
			name:       "effect correlation",
			pointer:    "/effectLedger/0/correlation/effectIndex",
			value:      json.Number("91"),
			wantReason: "effectLedger[0].correlation mismatch",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mutated := readQualificationJSONMap(t, actualPath)
			if err := setQualificationJSONPointer(mutated, tc.pointer, tc.value); err != nil {
				t.Fatalf("mutate %s: %v", tc.pointer, err)
			}
			err := CheckOrdering(expected, mutated)
			if err == nil {
				t.Fatalf("CheckOrdering accepted mutation at %s", tc.pointer)
			}
			if !strings.Contains(err.Error(), tc.wantReason) {
				t.Fatalf("mutation at %s was rejected for an unrelated reason; wanted %q, got: %v", tc.pointer, tc.wantReason, err)
			}
			t.Logf("mutated %s; CheckOrdering rejected it for %q: %v", tc.pointer, tc.wantReason, err)
		})
	}
}

// TestPR23StrictJSONRejectsDuplicateCaptureKeys proves the native capture
// reader rejects duplicate object members rather than accepting the final
// decoded value. The capture inventory is refreshed so the expected failure
// is the duplicate-key diagnostic, not a stale capture digest.
func TestPR23StrictJSONRejectsDuplicateCaptureKeys(t *testing.T) {
	root := effectsQualificationInput(t)
	if _, err := CheckCaptures(root); err != nil {
		t.Fatalf("unmodified PR23 captures are not a positive control: %v", err)
	}
	overlay := hardlinkConformanceOverlay(t, root)
	file := filepath.Join(overlay, "conformance", "effects.literal.browser.dom.json")
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatalf("read capture for duplicate-key mutation: %v", err)
	}
	if len(data) < 2 || data[0] != '{' {
		t.Fatalf("capture is not a top-level JSON object: %s", file)
	}
	changed := append([]byte(`{"schema":"duplicate-key-control",`), data[1:]...)
	writeQualificationBytes(t, file, changed)
	refreshCaptureInventory(t, overlay, "literal", "browser.dom", filepath.Base(file))

	_, err = CheckCaptures(overlay)
	if err == nil {
		t.Fatal("CheckCaptures accepted a duplicate top-level schema key")
	}
	if !strings.Contains(err.Error(), `duplicate key "schema"`) {
		t.Fatalf("duplicate-key capture was rejected for an unrelated reason; got: %v", err)
	}
}

// TestPR23RequiredSeedCannotBeRemoved coherently removes one entire seeded
// scenario and all five associated profiles, then updates producer summary
// and check inventory. Acceptance of the remaining three scenarios would
// therefore be a real suite-downgrade bug, not merely a stale-file-hash case.
func TestPR23RequiredSeedCannotBeRemoved(t *testing.T) {
	root := effectsQualificationInput(t)
	if _, err := CheckCaptures(root); err != nil {
		t.Fatalf("unmodified PR23 captures are not a positive control: %v", err)
	}
	overlay := hardlinkConformanceOverlay(t, root)
	const removed = "seed-20261106"
	for _, suffix := range []string{
		"scenario.json", "native.json", "direct.react.json", "direct.dom.json",
		"browser.react.json", "browser.dom.json", "browser.swap.json",
	} {
		path := filepath.Join(overlay, "conformance", "effects."+removed+"."+suffix)
		if err := os.Remove(path); err != nil {
			t.Fatalf("remove required PR23 capture %s: %v", filepath.Base(path), err)
		}
	}
	removeScenarioFromProducerInventory(t, overlay, removed)

	_, err := CheckCaptures(overlay)
	if err == nil {
		t.Fatal("CheckCaptures accepted a coherently reduced three-scenario suite")
	}
	if !strings.Contains(err.Error(), "missing required capture") || !strings.Contains(err.Error(), "effects.seed-20261106.scenario.json") {
		t.Fatalf("suite downgrade was rejected for an unrelated reason; wanted the required seed scenario, got: %v", err)
	}
}

func hardlinkConformanceOverlay(t *testing.T, sourceRoot string) string {
	t.Helper()
	destRoot := t.TempDir()
	source := filepath.Join(sourceRoot, "conformance")
	dest := filepath.Join(destRoot, "conformance")
	if err := os.MkdirAll(dest, 0o755); err != nil {
		t.Fatalf("create conformance overlay: %v", err)
	}
	err := filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		out := filepath.Join(dest, rel)
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("conformance input contains unsupported symlink %s", rel)
		}
		if entry.IsDir() {
			return os.MkdirAll(out, info.Mode().Perm())
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("conformance input contains non-regular file %s (%s)", rel, info.Mode())
		}
		if err := os.Link(path, out); err == nil {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(out, data, info.Mode().Perm())
	})
	if err != nil {
		t.Fatalf("create hard-link overlay of real PR23 conformance files: %v", err)
	}
	return destRoot
}

func refreshCaptureInventory(t *testing.T, overlayRoot, scenario, profile, filename string) {
	t.Helper()
	conformance := filepath.Join(overlayRoot, "conformance")
	target := filepath.Join(conformance, filename)
	captureBytes, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read changed capture for inventory refresh: %v", err)
	}
	updateProducerInventory(t, overlayRoot, func(summary map[string]any) {
		captures := qualificationObject(t, summary["captures"], "summary.captures")
		scenarioRecord := qualificationObject(t, captures[scenario], "summary.captures."+scenario)
		var pin map[string]any
		if profile == "native" {
			pin = qualificationObject(t, scenarioRecord["native"], "summary capture native")
		} else {
			profiles := qualificationObject(t, scenarioRecord["profiles"], "summary capture profiles")
			pin = qualificationObject(t, profiles[profile], "summary capture profile "+profile)
		}
		absTarget, err := filepath.Abs(target)
		if err != nil {
			t.Fatalf("resolve changed capture path: %v", err)
		}
		pin["path"] = absTarget
		pin["bytes"] = json.Number(strconv.Itoa(len(captureBytes)))
		pin["sha256"] = qualificationBytesSHA256(captureBytes)
	})
}

func removeScenarioFromProducerInventory(t *testing.T, overlayRoot, label string) {
	t.Helper()
	removedRecord := make(map[string]any)
	updateProducerInventory(t, overlayRoot, func(summary map[string]any) {
		scenarios := qualificationArray(t, summary["scenarios"], "summary.scenarios")
		kept := make([]any, 0, len(scenarios)-1)
		found := false
		for _, raw := range scenarios {
			item := qualificationObject(t, raw, "summary scenario")
			if item["label"] == label {
				removedRecord = item
				found = true
				continue
			}
			kept = append(kept, item)
		}
		if !found {
			t.Fatalf("producer summary does not contain scenario %q", label)
		}
		summary["scenarios"] = kept
		summary["scenarioCount"] = json.Number(strconv.Itoa(len(kept)))
		captures := qualificationObject(t, summary["captures"], "summary.captures")
		delete(captures, label)

		seed := qualificationInt(t, removedRecord["seed"], "removed scenario seed")
		seeds := qualificationArray(t, summary["seededSeeds"], "summary.seededSeeds")
		keptSeeds := make([]any, 0, len(seeds)-1)
		for _, raw := range seeds {
			if qualificationInt(t, raw, "summary seed") != seed {
				keptSeeds = append(keptSeeds, raw)
			}
		}
		summary["seededSeeds"] = keptSeeds
		seededEvents := qualificationObject(t, summary["seededEventCounts"], "summary.seededEventCounts")
		delete(seededEvents, strconv.Itoa(seed))

		decrementSummaryCount(t, summary, "nativeEvents", qualificationInt(t, removedRecord["nativeEventCount"], "removed native event count"))
		decrementSummaryCount(t, summary, "nativeEffects", qualificationInt(t, removedRecord["effectCount"], "removed effect count"))
		decrementSummaryCount(t, summary, "transportEvents", qualificationInt(t, removedRecord["transportEventCount"], "removed transport count"))
		decrementSummaryCount(t, summary, "profileEvents", qualificationInt(t, removedRecord["eventCount"], "removed profile event count")*qualificationInt(t, summary["profileCountPerScenario"], "profile count per scenario"))
	})
}

func decrementSummaryCount(t *testing.T, summary map[string]any, key string, amount int) {
	t.Helper()
	current := qualificationInt(t, summary[key], "summary."+key)
	if amount > current {
		t.Fatalf("invalid inventory decrement for %s: current=%d amount=%d", key, current, amount)
	}
	summary[key] = json.Number(strconv.Itoa(current - amount))
}

func updateProducerInventory(t *testing.T, overlayRoot string, update func(summary map[string]any)) {
	t.Helper()
	conformance := filepath.Join(overlayRoot, "conformance")
	summaryPath := filepath.Join(conformance, "effects.summary.json")
	summary := readQualificationJSONMap(t, summaryPath)
	update(summary)
	summaryBytes, err := json.MarshalIndent(summary, "", "  ")
	if err != nil {
		t.Fatalf("encode updated producer summary: %v", err)
	}
	summaryBytes = append(summaryBytes, '\n')
	writeQualificationBytes(t, summaryPath, summaryBytes)

	checkPath := filepath.Join(conformance, "effects.check.json")
	check := readQualificationJSONMap(t, checkPath)
	checkSummary := qualificationObject(t, check["summary"], "check.summary")
	absSummaryPath, err := filepath.Abs(summaryPath)
	if err != nil {
		t.Fatalf("resolve updated summary path: %v", err)
	}
	checkSummary["path"] = absSummaryPath
	checkSummary["bytes"] = json.Number(strconv.Itoa(len(summaryBytes)))
	checkSummary["sha256"] = qualificationBytesSHA256(summaryBytes)
	writeQualificationJSON(t, checkPath, check)
}

func writeQualificationJSON(t *testing.T, path string, value any) {
	t.Helper()
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("encode JSON overlay %s: %v", path, err)
	}
	data = append(data, '\n')
	writeQualificationBytes(t, path, data)
}

func writeQualificationBytes(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		t.Fatalf("unlink hard-linked overlay file %s: %v", path, err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write overlay file %s: %v", path, err)
	}
}

func setQualificationJSONPointer(root map[string]any, pointer string, value any) error {
	if pointer == "" || pointer[0] != '/' {
		return fmt.Errorf("invalid JSON pointer %q", pointer)
	}
	parts := strings.Split(pointer[1:], "/")
	for i := range parts {
		parts[i] = strings.ReplaceAll(strings.ReplaceAll(parts[i], "~1", "/"), "~0", "~")
	}
	var visit func(any, int) error
	visit = func(current any, index int) error {
		if index >= len(parts) {
			return fmt.Errorf("pointer %q has no target", pointer)
		}
		last := index == len(parts)-1
		switch node := current.(type) {
		case map[string]any:
			key := parts[index]
			child, ok := node[key]
			if !ok {
				return fmt.Errorf("pointer %q has no object member %q", pointer, key)
			}
			if last {
				node[key] = value
				return nil
			}
			return visit(child, index+1)
		case []any:
			position, err := strconv.Atoi(parts[index])
			if err != nil || position < 0 || position >= len(node) {
				return fmt.Errorf("pointer %q has invalid array index %q", pointer, parts[index])
			}
			if last {
				node[position] = value
				return nil
			}
			return visit(node[position], index+1)
		default:
			return fmt.Errorf("pointer %q traverses non-container %T", pointer, current)
		}
	}
	return visit(root, 0)
}

func qualificationObject(t *testing.T, value any, name string) map[string]any {
	t.Helper()
	object, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("%s is %T, want object", name, value)
	}
	return object
}

func qualificationArray(t *testing.T, value any, name string) []any {
	t.Helper()
	array, ok := value.([]any)
	if !ok {
		t.Fatalf("%s is %T, want array", name, value)
	}
	return array
}

func qualificationInt(t *testing.T, value any, name string) int {
	t.Helper()
	text, ok := value.(json.Number)
	if !ok {
		return intFromJSONValue(t, value, name)
	}
	parsed, err := text.Int64()
	if err != nil {
		t.Fatalf("%s is not an integer: %v", name, err)
	}
	return int(parsed)
}

func intFromJSONValue(t *testing.T, value any, name string) int {
	t.Helper()
	if value == nil {
		t.Fatalf("%s is nil, want an integer", name)
	}
	text := fmt.Sprint(value)
	parsed, err := strconv.Atoi(text)
	if err != nil {
		t.Fatalf("%s %v is not an integer: %v", name, value, err)
	}
	return parsed
}

func qualificationFileSHA256(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file for SHA-256 %s: %v", path, err)
	}
	return qualificationBytesSHA256(data)
}

func qualificationBytesSHA256(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}
