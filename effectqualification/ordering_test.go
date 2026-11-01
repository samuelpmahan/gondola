package effectqualification

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const orderingFixtureAttempt = "../compiled-module-effects/output/attempts/attempt-20261101T042914069Z-2-7d158b7a"

func TestCheckOrderingRealLiteralProfiles(t *testing.T) {
	attempt := orderingTestAttempt(t)
	conformance := filepath.Join(attempt, "conformance")
	expected := orderingReadMap(t, filepath.Join(conformance, "effects.literal.native.json"))
	for _, profile := range []string{"direct.dom", "direct.react", "browser.dom", "browser.react", "browser.swap"} {
		t.Run(profile, func(t *testing.T) {
			actual := orderingReadMap(t, filepath.Join(conformance, "effects.literal."+profile+".json"))
			if err := CheckOrdering(expected, actual); err != nil {
				t.Fatalf("real capture rejected: %v", err)
			}
		})
	}
}

func TestCheckOrderingRealSeededCapture(t *testing.T) {
	attempt := orderingTestAttempt(t)
	conformance := filepath.Join(attempt, "conformance")
	expected := orderingReadMap(t, filepath.Join(conformance, "effects.seed-20261104.native.json"))
	actual := orderingReadMap(t, filepath.Join(conformance, "effects.seed-20261104.browser.swap.json"))
	if err := CheckOrdering(expected, actual); err != nil {
		t.Fatalf("real seeded capture rejected: %v", err)
	}
}

func TestCheckOrderingRejectsEventOrderMutation(t *testing.T) {
	expected, actual := orderingTestPair(t, "direct.dom")
	events, ok := actual["events"].([]any)
	if !ok || len(events) < 8 {
		t.Fatal("fixture does not have the expected event prefix")
	}
	events[6], events[7] = events[7], events[6]
	if err := CheckOrdering(expected, actual); err == nil || err.Error() != "ordering: events[6].eventIndex mismatch" {
		t.Fatalf("event order mutation error = %v", err)
	}
}

func TestCheckOrderingRejectsTransportCorrelationMutation(t *testing.T) {
	expected, actual := orderingTestPair(t, "browser.swap")
	first := orderingTestArrayAt(t, actual, "transportLedger", 0)
	correlation := orderingTestMapField(t, first, "correlation")
	correlation["effectIndex"] = json.Number("991")
	if err := CheckOrdering(expected, actual); err == nil || err.Error() != "ordering: transportLedger[0].correlation: start correlation differs from ordered action" {
		t.Fatalf("transport correlation mutation error = %v", err)
	}
}

func TestCheckOrderingRejectsEffectCorrelationMutation(t *testing.T) {
	expected, actual := orderingTestPair(t, "direct.dom")
	first := orderingTestArrayAt(t, actual, "effectLedger", 0)
	correlation := orderingTestMapField(t, first, "correlation")
	correlation["effectIndex"] = json.Number("991")
	if err := CheckOrdering(expected, actual); err == nil || err.Error() != "ordering: effectLedger[0].correlation mismatch" {
		t.Fatalf("effect correlation mutation error = %v", err)
	}
}

func TestCheckOrderingBindsPendingCountsToGoState(t *testing.T) {
	for _, ledger := range []string{"orderedLedger", "effectLedger"} {
		for _, kind := range []string{"request", "start", "cancel", "reply"} {
			t.Run(ledger+"/"+kind+"/wrong_count", func(t *testing.T) {
				expected, actual := orderingTestPair(t, "browser.swap")
				row := orderingPendingTestRow(t, actual, ledger, kind)
				row["pendingCount"] = json.Number("99")
				err := CheckOrdering(expected, actual)
				if err == nil || !strings.Contains(err.Error(), ledger+"[") || !strings.Contains(err.Error(), ".pendingCount mismatch") {
					t.Fatalf("pending count mutation error = %v", err)
				}
			})

			t.Run(ledger+"/"+kind+"/missing_count", func(t *testing.T) {
				expected, actual := orderingTestPair(t, "browser.swap")
				row := orderingPendingTestRow(t, actual, ledger, kind)
				delete(row, "pendingCount")
				err := CheckOrdering(expected, actual)
				if err == nil || !strings.Contains(err.Error(), ledger+"[") || !strings.Contains(err.Error(), ".pendingCount is missing") {
					t.Fatalf("missing pending count error = %v", err)
				}
			})

			t.Run(ledger+"/"+kind+"/wrong_numeric_type", func(t *testing.T) {
				expected, actual := orderingTestPair(t, "browser.swap")
				row := orderingPendingTestRow(t, actual, ledger, kind)
				row["pendingCount"] = float64(1)
				err := CheckOrdering(expected, actual)
				if err == nil || !strings.Contains(err.Error(), ".pendingCount must be a canonical non-negative integer") {
					t.Fatalf("wrong pending count type error = %v", err)
				}
			})

			t.Run(ledger+"/"+kind+"/noncanonical_numeric_encoding", func(t *testing.T) {
				expected, actual := orderingTestPair(t, "browser.swap")
				row := orderingPendingTestRow(t, actual, ledger, kind)
				row["pendingCount"] = json.Number("1e0")
				err := CheckOrdering(expected, actual)
				if err == nil || !strings.Contains(err.Error(), ".pendingCount must be a canonical non-negative integer") {
					t.Fatalf("noncanonical pending count error = %v", err)
				}
			})
		}
	}
}

func TestCheckOrderingRejectsCoherentPendingForgery(t *testing.T) {
	expected, actual := orderingTestPair(t, "browser.swap")
	for _, ledger := range []string{"orderedLedger", "effectLedger"} {
		for _, kind := range []string{"request", "start"} {
			orderingPendingTestRow(t, actual, ledger, kind)["pendingCount"] = json.Number("2")
		}
	}
	lifecycle, ok := actual["lifecycleLedger"].([]any)
	if !ok {
		t.Fatal("lifecycleLedger is not an array")
	}
	for _, value := range lifecycle {
		row, ok := value.(map[string]any)
		if !ok || row["kind"] != "renderer-commit" || row["stateEventIndex"] != json.Number("2") {
			continue
		}
		pending, ok := row["pendingGo"].([]any)
		if !ok {
			t.Fatal("renderer commit pendingGo is not an array")
		}
		row["pendingGo"] = append(pending, map[string]any{
			"key":        "forged",
			"generation": json.Number("1"),
			"token":      "forged:g1:r1",
		})
		break
	}
	err := CheckOrdering(expected, actual)
	if err == nil || !strings.Contains(err.Error(), ".pendingCount mismatch: expected 1, got 2") {
		t.Fatalf("coherent pending metadata forgery error = %v", err)
	}
}

func TestCheckOrderingRejectsPendingGoForgeryAgainstGoState(t *testing.T) {
	expected, actual := orderingTestPair(t, "browser.swap")
	lifecycle, ok := actual["lifecycleLedger"].([]any)
	if !ok {
		t.Fatal("lifecycleLedger is not an array")
	}
	for _, value := range lifecycle {
		row, ok := value.(map[string]any)
		if !ok || row["kind"] != "renderer-commit" || row["stateEventIndex"] != json.Number("2") {
			continue
		}
		pending, ok := row["pendingGo"].([]any)
		if !ok {
			t.Fatal("renderer commit pendingGo is not an array")
		}
		row["pendingGo"] = append(pending, map[string]any{
			"key":        "forged",
			"generation": json.Number("1"),
			"token":      "forged:g1:r1",
		})
		break
	}
	err := CheckOrdering(expected, actual)
	if err == nil || !strings.Contains(err.Error(), ".pendingGo differs from Go replay state") {
		t.Fatalf("pendingGo mutation error = %v", err)
	}
}

func orderingPendingTestRow(t *testing.T, actual map[string]any, ledger, kind string) map[string]any {
	t.Helper()
	rows, ok := actual[ledger].([]any)
	if !ok {
		t.Fatalf("%s is not an array", ledger)
	}
	targetToken := "a:g1:r1"
	if kind == "reply" {
		targetToken = "b:g1:r1"
	}
	for _, value := range rows {
		row, ok := value.(map[string]any)
		if ok && row["kind"] == kind && row["token"] == targetToken {
			return row
		}
	}
	t.Fatalf("%s has no %s row for %s", ledger, kind, targetToken)
	return nil
}

func orderingTestPair(t *testing.T, profile string) (map[string]any, map[string]any) {
	t.Helper()
	attempt := orderingTestAttempt(t)
	conformance := filepath.Join(attempt, "conformance")
	return orderingReadMap(t, filepath.Join(conformance, "effects.literal.native.json")),
		orderingReadMap(t, filepath.Join(conformance, "effects.literal."+profile+".json"))
}

func orderingTestAttempt(t *testing.T) string {
	t.Helper()
	if root := os.Getenv("GOBI_EFFECTS_QUALIFICATION_INPUT"); root != "" {
		absolute, err := filepath.Abs(root)
		if err != nil {
			t.Fatal(err)
		}
		return absolute
	}
	absolute, err := filepath.Abs(orderingFixtureAttempt)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(absolute, "conformance", "effects.literal.native.json")); err != nil {
		t.Skip("set GOBI_EFFECTS_QUALIFICATION_INPUT to a real attempt directory to exercise capture ordering")
	}
	return absolute
}

func orderingReadMap(t *testing.T, path string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		t.Fatalf("decode %s: %v", path, err)
	}
	return value
}

func orderingTestArrayAt(t *testing.T, object map[string]any, key string, index int) map[string]any {
	t.Helper()
	value, ok := object[key]
	if !ok {
		t.Fatalf("missing object key %q", key)
	}
	array, ok := value.([]any)
	if !ok || index < 0 || index >= len(array) {
		t.Fatalf("%q[%d] is not an available row", key, index)
	}
	row, ok := array[index].(map[string]any)
	if !ok {
		t.Fatalf("%q[%d] is not an object", key, index)
	}
	return row
}

func orderingTestMapField(t *testing.T, object map[string]any, key string) map[string]any {
	t.Helper()
	value, ok := object[key]
	row, rowOK := value.(map[string]any)
	if !ok || !rowOK {
		t.Fatalf("%q is not an object", key)
	}
	return row
}
