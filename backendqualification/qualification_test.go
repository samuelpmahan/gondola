package backendqualification

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type testCase struct {
	id, backend, fault string
	activationEvent    *int
	activationTarget   string
	expectedChannels   []string
	allowedChannels    []string
	channelRule        string
}

func testCases() []testCase {
	zero := 0
	return []testCase{
		{id: "healthy-react", backend: "react", fault: "none", channelRule: "exact"},
		{id: "healthy-dom", backend: "dom", fault: "none", channelRule: "exact"},
		{id: "healthy-swap", backend: "swap", fault: "none", channelRule: "exact"},
		{id: "fault-react-text-corruption", backend: "react", fault: "text-corruption", activationTarget: "0/0/0", expectedChannels: []string{"dom"}, allowedChannels: []string{"dom"}, channelRule: "all"},
		{id: "fault-react-key-order", backend: "react", fault: "key-order", activationTarget: "1", expectedChannels: []string{"dom"}, allowedChannels: []string{"dom"}, channelRule: "all"},
		{id: "fault-react-enabled-control", backend: "react", fault: "enabled-control", activationTarget: "0/1", expectedChannels: []string{"disabled"}, allowedChannels: []string{"disabled", "dom"}, channelRule: "all"},
		{id: "fault-react-drop-click", backend: "react", fault: "drop-click", activationEvent: &zero, activationTarget: "1/0/1", expectedChannels: []string{"dispatch-count", "trace-count", "state"}, allowedChannels: []string{"dispatch-count", "trace-count", "state", "dom"}, channelRule: "any"},
		{id: "fault-react-duplicate-click", backend: "react", fault: "duplicate-click", activationEvent: &zero, activationTarget: "1/0/1", expectedChannels: []string{"dispatch-count"}, allowedChannels: []string{"dispatch-count", "trace-count", "state", "dom"}, channelRule: "all"},
		{id: "fault-dom-text-corruption", backend: "dom", fault: "text-corruption", activationTarget: "0/0/0", expectedChannels: []string{"dom"}, allowedChannels: []string{"dom"}, channelRule: "all"},
		{id: "fault-dom-key-order", backend: "dom", fault: "key-order", activationTarget: "1", expectedChannels: []string{"dom"}, allowedChannels: []string{"dom"}, channelRule: "all"},
		{id: "fault-dom-enabled-control", backend: "dom", fault: "enabled-control", activationTarget: "0/1", expectedChannels: []string{"disabled"}, allowedChannels: []string{"disabled", "dom"}, channelRule: "all"},
		{id: "fault-dom-drop-click", backend: "dom", fault: "drop-click", activationEvent: &zero, activationTarget: "1/0/1", expectedChannels: []string{"dispatch-count", "trace-count", "state"}, allowedChannels: []string{"dispatch-count", "trace-count", "state", "dom"}, channelRule: "any"},
		{id: "fault-dom-duplicate-click", backend: "dom", fault: "duplicate-click", activationEvent: &zero, activationTarget: "1/0/1", expectedChannels: []string{"dispatch-count"}, allowedChannels: []string{"dispatch-count", "trace-count", "state", "dom"}, channelRule: "all"},
	}
}

type runFixture struct {
	root      string
	inputPath string
	results   []map[string]any
	evidence  map[string]map[string]any
	omit      map[string]bool
}

func newRunFixture(t *testing.T) *runFixture {
	t.Helper()
	root := t.TempDir()
	f := &runFixture{
		root:      root,
		inputPath: filepath.Join(root, "run.json"),
		evidence:  make(map[string]map[string]any),
		omit:      make(map[string]bool),
	}
	for _, spec := range testCases() {
		faulted := spec.fault != "none"
		eventIndex := any(nil)
		eventsObserved, traceTicks, stateIndex := 50, 46, 45
		dispatchExpected, dispatchObserved := 34, 34
		dispatchFaultExpected, dispatchFaultObserved := 34, 34
		disabledExpected, disabledObserved := false, false
		stateExpected := map[string]any{"counter": 1, "inputRevision": 1}
		stateObserved := map[string]any{"counter": 1, "inputRevision": 1}
		domExpected, domObserved := "<main>healthy</main>", "<main>healthy</main>"
		observedTraceTicks := traceTicks
		if faulted {
			eventsObserved, traceTicks, stateIndex = 0, 1, 0
			dispatchExpected, dispatchObserved = 0, 0
			dispatchFaultExpected, dispatchFaultObserved = 0, 0
			disabledExpected, disabledObserved = true, true
			if spec.activationEvent != nil {
				eventIndex = *spec.activationEvent
				eventsObserved, traceTicks, stateIndex = 1, 2, 1
				dispatchExpected, dispatchObserved = 1, 1
				dispatchFaultExpected, dispatchFaultObserved = 1, 1
			}
			if spec.fault == "text-corruption" || spec.fault == "key-order" {
				domObserved = "<main>mutated</main>"
			}
			if spec.fault == "enabled-control" {
				disabledExpected, disabledObserved = true, false
			}
			if spec.fault == "drop-click" {
				dispatchFaultObserved = 0
				dispatchObserved = 0
				observedTraceTicks = 1
				stateObserved = map[string]any{"counter": 0, "inputRevision": 1}
				domObserved = "<main>before-click</main>"
			}
			if spec.fault == "duplicate-click" {
				dispatchFaultObserved = 2
				dispatchObserved = 2
			}
		}
		if spec.fault != "drop-click" {
			observedTraceTicks = traceTicks
		}
		activationCount := 0
		var targetPath any
		callbackInvocations := 0
		observedCallbackInvocations := dispatchObserved
		activationRecords := []any{}
		if faulted {
			activationCount = 1
			targetPath = spec.activationTarget
			activationRecords = []any{map[string]any{
				"fault":      spec.fault,
				"backend":    spec.backend,
				"eventIndex": eventIndex,
				"target":     map[string]any{"path": targetPath},
			}}
			if spec.activationEvent != nil {
				callbackInvocations = dispatchFaultObserved
			}
		} else {
			observedCallbackInvocations = 34
		}
		dispatchFaultExpected, dispatchFaultObserved = dispatchExpected, dispatchObserved
		if faulted && spec.activationEvent == nil {
			dispatchFaultExpected, dispatchFaultObserved = 0, 0
		}
		compare := map[string]any{
			"dom": map[string]any{"expected": domExpected, "observed": domObserved},
			"disabled": map[string]any{
				"expected": []any{map[string]any{"path": "0/1", "disabled": disabledExpected}},
				"observed": []any{map[string]any{"path": "0/1", "disabled": disabledObserved}},
			},
			"dispatch-count": map[string]any{"expected": dispatchFaultExpected, "observed": dispatchFaultObserved},
			"trace-count":    map[string]any{"expected": traceTicks, "observed": observedTraceTicks},
			"state":          map[string]any{"expected": stateExpected, "observed": stateObserved},
		}
		observedChannels := []string{}
		for _, channel := range []string{"dom", "disabled", "dispatch-count", "trace-count", "state"} {
			pair := compare[channel].(map[string]any)
			if !reflect.DeepEqual(pair["expected"], pair["observed"]) {
				observedChannels = append(observedChannels, channel)
			}
		}
		view := map[string]any{"kind": "node", "text": "healthy"}
		callbackCounts := map[string]any{"dispatch": dispatchObserved, "stale": 0}
		var activation any
		if faulted {
			activation = map[string]any{
				"activated":           true,
				"activationCount":     activationCount,
				"eventIndex":          eventIndex,
				"targetPath":          targetPath,
				"records":             activationRecords,
				"callbackInvocations": callbackInvocations,
			}
		}
		disabledControl := func(disabled bool) []any {
			return []any{map[string]any{"path": "0/1", "key": "input-step-1", "tag": "button", "disabled": disabled}}
		}
		expectedDOM := map[string]any{"normalization": "outerHTML-v1", "html": domExpected, "controls": disabledControl(disabledExpected)}
		observedDOM := map[string]any{"normalization": "outerHTML-v1", "html": domObserved, "controls": disabledControl(disabledObserved)}
		expectedRecord := map[string]any{
			"stateIndex":     stateIndex,
			"state":          stateExpected,
			"dom":            expectedDOM,
			"disabled":       map[string]any{"path": "0/1", "value": disabledExpected},
			"traceTicks":     traceTicks,
			"eventsObserved": eventsObserved,
		}
		if faulted {
			expectedRecord["dispatchCountDelta"] = dispatchExpected
		} else {
			expectedRecord["dispatchCount"] = dispatchExpected
		}
		evidence := map[string]any{
			"schema":          "gobi.backend-qualification-case-evidence/v1",
			"id":              spec.id,
			"backend":         spec.backend,
			"fault":           spec.fault,
			"activated":       faulted,
			"activationCount": activationCount,
			"activation":      activation,
			"expected":        expectedRecord,
			"observed": map[string]any{
				"state":               stateObserved,
				"view":                view,
				"dom":                 observedDOM,
				"trace":               map[string]any{"ticks": observedTraceTicks},
				"rendererDOM":         observedDOM,
				"callbackCounts":      callbackCounts,
				"callbackInvocations": observedCallbackInvocations,
				"effects":             []any{},
				"eventsObserved":      eventsObserved,
				"traceTicks":          observedTraceTicks,
			},
			"channelComparisons":   compare,
			"observedChannels":     observedChannels,
			"derivedChannels":      observedChannels,
			"eventsObserved":       eventsObserved,
			"traceTicks":           observedTraceTicks,
			"probeException":       nil,
			"infrastructureErrors": []any{},
			"pageErrors":           []any{},
		}
		f.evidence[spec.id] = evidence
		f.results = append(f.results, map[string]any{
			"id":                   spec.id,
			"backend":              spec.backend,
			"fault":                spec.fault,
			"activated":            faulted,
			"activationCount":      activationCount,
			"observedChannels":     observedChannels,
			"probeException":       nil,
			"infrastructureErrors": []any{},
			"pageErrors":           []any{},
			"eventsObserved":       eventsObserved,
			"traceTicks":           observedTraceTicks,
			"evidencePath":         "cases/" + spec.id + ".json",
			"evidenceSHA256":       "",
		})
	}
	f.write(t)
	return f
}

func (f *runFixture) write(t *testing.T) {
	t.Helper()
	for i, result := range f.results {
		id := result["id"].(string)
		if f.omit[id] {
			continue
		}
		body, err := json.Marshal(f.evidence[id])
		if err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(f.root, filepath.FromSlash(result["evidencePath"].(string)))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, body, 0o644); err != nil {
			t.Fatal(err)
		}
		digest := sha256.Sum256(body)
		f.results[i]["evidenceSHA256"] = hex.EncodeToString(digest[:])
	}
	f.writeRaw(t)
}

func (f *runFixture) writeRaw(t *testing.T) {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"schema":       "gobi.backend-qualification-run/v1",
		"sourceCommit": "0123456789abcdef0123456789abcdef01234567",
		"results":      f.results,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(f.inputPath, body, 0o644); err != nil {
		t.Fatal(err)
	}
}

func resultByID(t *testing.T, f *runFixture, id string) map[string]any {
	t.Helper()
	for _, result := range f.results {
		if result["id"] == id {
			return result
		}
	}
	t.Fatalf("test case %q missing from fixture", id)
	return nil
}

func TestCertifyFileAcceptsThirteenEvidenceBackedCases(t *testing.T) {
	f := newRunFixture(t)
	certificate, err := CertifyFile(f.inputPath)
	if err != nil {
		t.Fatalf("CertifyFile rejected valid evidence: %v", err)
	}
	if certificate.Schema != "gobi.backend-qualification-certificate/v1" || !certificate.Qualified {
		t.Fatalf("unexpected certificate header: %+v", certificate)
	}
	if len(certificate.Results) != 13 {
		t.Fatalf("certificate has %d cases, want 13", len(certificate.Results))
	}
	for _, result := range certificate.Results {
		if !result.Passed {
			t.Errorf("case %s did not pass: %+v", result.ID, result)
		}
	}
}

func TestDecodeStrictRejectsDuplicateAndNoncanonicalStructKeys(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"duplicate-top-level-key", `{"schema":"one","schema":"one"}`},
		{"conflicting-duplicate-top-level-key", `{"schema":"one","schema":"two"}`},
		{"case-insensitive-field-alias", `{"Schema":"gobi.backend-qualification-run/v1"}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var target inputRun
			if err := decodeStrict([]byte(tc.body), &target); err == nil {
				t.Fatal("strict decoder accepted duplicate or noncanonical Go struct field")
			}
		})
	}

	// Raw JSON fields and map keys are intentionally opaque/case-sensitive.
	var target struct {
		Probe json.RawMessage       `json:"probe"`
		Pairs map[string]comparison `json:"pairs"`
	}
	if err := decodeStrict([]byte(`{"probe":{"Schema":"opaque"},"pairs":{"Schema":{"expected":1,"observed":1}}}`), &target); err != nil {
		t.Fatalf("strict decoder rejected opaque JSON or a case-sensitive map key: %v", err)
	}
	if err := decodeStrict([]byte(`{"probe":{"Schema":"one","Schema":"two"}}`), &target); err == nil {
		t.Fatal("strict decoder accepted duplicate keys inside an opaque JSON field")
	}
	var activation activationEvidence
	if err := decodeStrict([]byte(`{"Activated":true,"activationCount":1}`), &activation); err == nil {
		t.Fatal("strict decoder accepted a noncanonical nested Go field alias")
	}
}

func TestCertifyFileRejectsUnknownOrAliasedCaseEnvelopeAndDuplicateEvidenceKeys(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*testing.T, *runFixture)
	}{
		{"unknown-case-field", func(t *testing.T, f *runFixture) {
			f.evidence["healthy-react"]["reviewerUnknownField"] = map[string]any{"marker": "ignored before"}
			f.write(t)
		}},
		{"aliased-case-field", func(t *testing.T, f *runFixture) {
			f.write(t)
			path := filepath.Join(f.root, "cases", "healthy-react.json")
			body, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			body = bytes.Replace(body, []byte(`"backend":`), []byte(`"Backend":`), 1)
			if !bytes.Contains(body, []byte(`"Backend":`)) {
				t.Fatal("test fixture did not contain backend field")
			}
			if err := os.WriteFile(path, body, 0o644); err != nil {
				t.Fatal(err)
			}
			updateEvidenceHash(t, f, "healthy-react", body)
		}},
		{"duplicate-case-field", func(t *testing.T, f *runFixture) {
			f.write(t)
			path := filepath.Join(f.root, "cases", "healthy-react.json")
			body, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			marker := []byte(`"schema":"gobi.backend-qualification-case-evidence/v1"`)
			body = bytes.Replace(body, marker, append(marker, []byte(`,"schema":"gobi.backend-qualification-case-evidence/v1"`)...), 1)
			updateEvidenceHash(t, f, "healthy-react", body)
			if err := os.WriteFile(path, body, 0o644); err != nil {
				t.Fatal(err)
			}
		}},
		{"duplicate-raw-run-field", func(t *testing.T, f *runFixture) {
			f.write(t)
			body, err := os.ReadFile(f.inputPath)
			if err != nil {
				t.Fatal(err)
			}
			marker := []byte(`"sourceCommit":"0123456789abcdef0123456789abcdef01234567"`)
			body = bytes.Replace(body, marker, append(marker, []byte(`,"sourceCommit":"0123456789abcdef0123456789abcdef01234567"`)...), 1)
			if err := os.WriteFile(f.inputPath, body, 0o644); err != nil {
				t.Fatal(err)
			}
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newRunFixture(t)
			tc.mutate(t, f)
			if _, err := CertifyFile(f.inputPath); err == nil {
				t.Fatal("CertifyFile accepted invalid case/raw JSON envelope")
			}
		})
	}
}

func updateEvidenceHash(t *testing.T, f *runFixture, id string, body []byte) {
	t.Helper()
	digest := sha256.Sum256(body)
	resultByID(t, f, id)["evidenceSHA256"] = hex.EncodeToString(digest[:])
	f.writeRaw(t)
}

func TestCertifyFileRejectsIncompleteOrMisidentifiedCaseRegistry(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*testing.T, *runFixture)
	}{
		{"missing-case", func(t *testing.T, f *runFixture) { f.results = f.results[:12]; f.write(t) }},
		{"duplicate-case", func(t *testing.T, f *runFixture) { f.results = append(f.results, f.results[0]); f.write(t) }},
		{"unknown-case", func(t *testing.T, f *runFixture) {
			resultByID(t, f, "healthy-react")["id"] = "healthy-other"
			f.write(t)
		}},
		{"wrong-backend-pair", func(t *testing.T, f *runFixture) {
			resultByID(t, f, "fault-react-text-corruption")["backend"] = "dom"
			f.write(t)
		}},
		{"wrong-fault-pair", func(t *testing.T, f *runFixture) {
			resultByID(t, f, "fault-react-text-corruption")["fault"] = "key-order"
			f.write(t)
		}},
		{"claimed-verdict-field", func(t *testing.T, f *runFixture) { resultByID(t, f, "healthy-react")["passed"] = true; f.write(t) }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newRunFixture(t)
			tc.mutate(t, f)
			if _, err := CertifyFile(f.inputPath); err == nil {
				t.Fatal("CertifyFile accepted invalid case registry")
			}
		})
	}
}

func TestCertifyFileRequiresActivationAndMeasuredSemanticChannels(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*testing.T, *runFixture)
	}{
		{"unactivated-negative", func(t *testing.T, f *runFixture) {
			row := resultByID(t, f, "fault-react-text-corruption")
			row["activated"] = false
			f.write(t)
		}},
		{"activation-event-does-not-match-family", func(t *testing.T, f *runFixture) {
			f.evidence["fault-react-text-corruption"]["activation"].(map[string]any)["eventIndex"] = 0
			f.write(t)
		}},
		{"generic-exception-without-channel", func(t *testing.T, f *runFixture) {
			id := "fault-react-text-corruption"
			f.evidence[id]["probeException"] = "renderer threw an error"
			expected := f.evidence[id]["expected"].(map[string]any)
			observed := f.evidence[id]["observed"].(map[string]any)
			expectedDOM := expected["dom"].(map[string]any)
			observed["dom"] = expectedDOM
			pair := f.evidence[id]["channelComparisons"].(map[string]any)["dom"].(map[string]any)
			pair["observed"] = pair["expected"]
			f.evidence[id]["observedChannels"] = []string{}
			f.evidence[id]["derivedChannels"] = []string{}
			row := resultByID(t, f, id)
			row["probeException"] = "renderer threw an error"
			row["observedChannels"] = []string{}
			f.write(t)
		}},
		{"wrong-channel-without-required-witness", func(t *testing.T, f *runFixture) {
			id := "fault-react-drop-click"
			evidence := f.evidence[id]
			expected := evidence["expected"].(map[string]any)
			observed := evidence["observed"].(map[string]any)
			comparisons := evidence["channelComparisons"].(map[string]any)
			statePair := comparisons["state"].(map[string]any)
			statePair["observed"] = statePair["expected"]
			observed["state"] = expected["state"]
			dispatchPair := comparisons["dispatch-count"].(map[string]any)
			dispatchPair["observed"] = dispatchPair["expected"]
			observed["callbackCounts"].(map[string]any)["dispatch"] = dispatchPair["expected"]
			tracePair := comparisons["trace-count"].(map[string]any)
			tracePair["observed"] = tracePair["expected"]
			observed["traceTicks"] = tracePair["expected"]
			evidence["traceTicks"] = tracePair["expected"]
			row := resultByID(t, f, id)
			row["traceTicks"] = tracePair["expected"]
			domPair := comparisons["dom"].(map[string]any)
			domPair["observed"] = "<main>dom-side-effect</main>"
			observed["dom"].(map[string]any)["html"] = domPair["observed"]
			f.evidence[id]["observedChannels"] = []string{"dom"}
			f.evidence[id]["derivedChannels"] = []string{"dom"}
			row["observedChannels"] = []string{"dom"}
			f.write(t)
		}},
		{"raw-channel-list-disagrees-with-evidence", func(t *testing.T, f *runFixture) {
			resultByID(t, f, "fault-react-text-corruption")["observedChannels"] = []string{}
			f.write(t)
		}},
		{"unknown-observed-channel", func(t *testing.T, f *runFixture) {
			id := "fault-react-text-corruption"
			f.evidence[id]["channelComparisons"].(map[string]any)["gpu-pixels"] = map[string]any{"expected": "a", "observed": "b"}
			f.evidence[id]["observedChannels"] = []string{"dom", "gpu-pixels"}
			resultByID(t, f, id)["observedChannels"] = []string{"dom", "gpu-pixels"}
			f.write(t)
		}},
		{"duplicate-observed-channel", func(t *testing.T, f *runFixture) {
			id := "fault-react-text-corruption"
			f.evidence[id]["observedChannels"] = []string{"dom", "dom"}
			resultByID(t, f, id)["observedChannels"] = []string{"dom", "dom"}
			f.write(t)
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newRunFixture(t)
			tc.mutate(t, f)
			if _, err := CertifyFile(f.inputPath); err == nil {
				t.Fatal("CertifyFile accepted invalid activation/channel evidence")
			}
		})
	}
}

func TestCertifyFileRejectsUnknownAndDuplicateRawObservedChannels(t *testing.T) {
	tests := []struct {
		name     string
		caseID   string
		channels []string
		wantErr  string
	}{
		{"unknown-fault-channel", "fault-react-text-corruption", []string{"dom", "gpu-pixels"}, `unknown channel "gpu-pixels"`},
		{"duplicate-fault-channel", "fault-react-text-corruption", []string{"dom", "dom"}, `duplicate channel "dom"`},
		{"unknown-healthy-channel", "healthy-react", []string{"gpu-pixels"}, `unknown channel "gpu-pixels"`},
		{"duplicate-healthy-channel", "healthy-react", []string{"dom", "dom"}, `duplicate channel "dom"`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newRunFixture(t)
			resultByID(t, f, tc.caseID)["observedChannels"] = tc.channels
			// Rewrite only the raw report row. The referenced evidence bytes and
			// their hashes remain untouched, isolating the input-row validation.
			f.writeRaw(t)
			if _, err := CertifyFile(f.inputPath); err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("CertifyFile error = %v, want an error containing %q", err, tc.wantErr)
			}
		})
	}
}

func TestCertifyFileNormalizesRawObservedChannelOrder(t *testing.T) {
	f := newRunFixture(t)
	resultByID(t, f, "fault-react-drop-click")["observedChannels"] = []string{"state", "trace-count", "dispatch-count", "dom"}
	// Only the raw report ordering changes; the evidence remains pinned.
	f.writeRaw(t)

	certificate, err := CertifyFile(f.inputPath)
	if err != nil {
		t.Fatalf("CertifyFile rejected the same channels in a different order: %v", err)
	}
	for _, result := range certificate.Results {
		if result.ID != "fault-react-drop-click" {
			continue
		}
		want := []string{"dom", "dispatch-count", "trace-count", "state"}
		if !reflect.DeepEqual(result.ObservedChannels, want) {
			t.Fatalf("normalized channels = %v, want %v", result.ObservedChannels, want)
		}
		return
	}
	t.Fatal("certificate omitted fault-react-drop-click")
}

func TestCertifyFileRejectsInfrastructureAndEvidenceIntegrityFailures(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*testing.T, *runFixture)
	}{
		{"infrastructure-error", func(t *testing.T, f *runFixture) {
			id := "fault-react-text-corruption"
			f.evidence[id]["infrastructureErrors"] = []string{"browser disconnected"}
			resultByID(t, f, id)["infrastructureErrors"] = []string{"browser disconnected"}
			f.write(t)
		}},
		{"page-error", func(t *testing.T, f *runFixture) {
			id := "fault-react-text-corruption"
			f.evidence[id]["pageErrors"] = []string{"uncaught exception"}
			resultByID(t, f, id)["pageErrors"] = []string{"uncaught exception"}
			f.write(t)
		}},
		{"missing-evidence", func(t *testing.T, f *runFixture) {
			f.write(t)
			if err := os.Remove(filepath.Join(f.root, "cases/fault-react-text-corruption.json")); err != nil {
				t.Fatal(err)
			}
		}},
		{"bad-evidence-hash", func(t *testing.T, f *runFixture) {
			f.write(t)
			resultByID(t, f, "fault-react-text-corruption")["evidenceSHA256"] = "0000000000000000000000000000000000000000000000000000000000000000"
			f.writeRaw(t)
		}},
		{"unsafe-evidence-path", func(t *testing.T, f *runFixture) {
			resultByID(t, f, "fault-react-text-corruption")["evidencePath"] = "../outside.json"
			f.write(t)
		}},
		{"healthy-count-mismatch", func(t *testing.T, f *runFixture) {
			resultByID(t, f, "healthy-react")["eventsObserved"] = 49
			f.write(t)
		}},
		{"invalid-source-commit", func(t *testing.T, f *runFixture) {
			body := map[string]any{"schema": "gobi.backend-qualification-run/v1", "sourceCommit": "not-a-commit", "results": f.results}
			encoded, _ := json.Marshal(body)
			_ = os.WriteFile(f.inputPath, encoded, 0o644)
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newRunFixture(t)
			tc.mutate(t, f)
			if _, err := CertifyFile(f.inputPath); err == nil {
				t.Fatal("CertifyFile accepted infrastructure, provenance, or evidence integrity failure")
			}
		})
	}
}
