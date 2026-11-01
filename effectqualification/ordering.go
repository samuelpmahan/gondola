package effectqualification

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

// CheckOrdering checks the finite asynchronous lifecycle captured for one
// renderer profile against a native replay. The expected value is the decoded
// gobi.module-effects-native/v1 replay; actual is one direct.* or browser.*
// profile capture, not the browser profile index.
func CheckOrdering(expected, actual map[string]any) error {
	if expected == nil || actual == nil {
		return fmt.Errorf("ordering: expected and actual captures are required")
	}
	if schema, _ := expected["schema"].(string); schema != "gobi.module-effects-native/v1" {
		return fmt.Errorf("ordering: expected schema must be gobi.module-effects-native/v1")
	}
	profile, _ := actual["profile"].(string)
	if !orderingKnownProfile(profile) {
		return fmt.Errorf("ordering: unsupported actual profile %q", profile)
	}
	if schema, _ := actual["schema"].(string); schema != "gobi.module-effects-capture/v1" {
		return fmt.Errorf("ordering: actual schema must be gobi.module-effects-capture/v1")
	}

	expectedEvents, ok := orderingArray(expected["events"])
	if !ok || len(expectedEvents) == 0 {
		return fmt.Errorf("ordering: expected.events must be a non-empty array")
	}
	actualEvents, ok := orderingArray(actual["events"])
	if !ok || len(actualEvents) != len(expectedEvents) {
		return fmt.Errorf("ordering: events length mismatch: expected %d, got %d", len(expectedEvents), orderingLength(actual["events"]))
	}
	if err := orderingCheckEvents(expectedEvents, actualEvents, profile); err != nil {
		return err
	}
	if err := orderingCheckTransport(expected, actual, expectedEvents, actualEvents); err != nil {
		return err
	}
	if err := orderingCheckEffectLedger(expected, actual, expectedEvents, actualEvents); err != nil {
		return err
	}
	if err := orderingCheckPendingCounts(expected, actual, expectedEvents, actualEvents); err != nil {
		return err
	}
	if err := orderingCheckRenderLifecycle(expected, actual, expectedEvents, actualEvents); err != nil {
		return err
	}
	if err := orderingCheckRetirement(expected, actual, expectedEvents, actualEvents); err != nil {
		return err
	}
	if err := orderingCheckSwaps(actual, actualEvents, profile); err != nil {
		return err
	}
	return nil
}

func orderingKnownProfile(profile string) bool {
	switch profile {
	case "direct.react", "direct.dom", "browser.react", "browser.dom", "browser.swap":
		return true
	default:
		return false
	}
}

func orderingCheckEvents(expectedEvents, actualEvents []any, profile string) error {
	for index := range expectedEvents {
		expected, ok := orderingMap(expectedEvents[index])
		if !ok {
			return fmt.Errorf("ordering: expected.events[%d] must be an object", index)
		}
		actual, ok := orderingMap(actualEvents[index])
		if !ok {
			return fmt.Errorf("ordering: events[%d] must be an object", index)
		}
		if got, ok := orderingInt(actual["eventIndex"]); !ok || got != int64(index) {
			return fmt.Errorf("ordering: events[%d].eventIndex mismatch", index)
		}
		source, ok := orderingMap(actual["sourceEvent"])
		if !ok {
			return fmt.Errorf("ordering: events[%d].sourceEvent must be an object", index)
		}
		if err := orderingMatchSource(index, expected, source); err != nil {
			return err
		}
		wantAccepted, ok := orderingBool(expected["accepted"])
		if !ok {
			return fmt.Errorf("ordering: expected.events[%d].accepted must be boolean", index)
		}
		gotAccepted, ok := orderingBool(actual["accepted"])
		if !ok || gotAccepted != wantAccepted {
			return fmt.Errorf("ordering: events[%d].accepted mismatch", index)
		}
		nativeExpected, exists := actual["nativeExpected"]
		if !exists {
			return fmt.Errorf("ordering: events[%d].nativeExpected missing", index)
		}
		if err := orderingCheckNativeEventProjection(index, expected, nativeExpected); err != nil {
			return err
		}
		if err := orderingCheckEventResult(index, expected, actual, source, profile); err != nil {
			return err
		}
		if err := orderingCheckHostEventIndex(index, actual); err != nil {
			return err
		}
		if kind, _ := expected["kind"].(string); kind == "stale-callback" {
			if err := orderingCheckStaleSource(index, expected, expectedEvents); err != nil {
				return err
			}
		}
	}
	return nil
}

func orderingMatchSource(index int, expected, source map[string]any) error {
	for _, field := range []string{"kind", "target", "key", "generation", "token", "to", "sourceEvent"} {
		want, wantExists := expected[field]
		got, gotExists := source[field]
		if wantExists != gotExists || (wantExists && !reflect.DeepEqual(want, got)) {
			return fmt.Errorf("ordering: events[%d].sourceEvent.%s mismatch", index, field)
		}
	}
	if want, exists := expected["action"]; exists {
		got, ok := source["action"]
		if !ok || !reflect.DeepEqual(want, got) {
			return fmt.Errorf("ordering: events[%d].sourceEvent.action mismatch", index)
		}
	}
	return nil
}

func orderingCheckNativeEventProjection(index int, expected map[string]any, projection any) error {
	actual, ok := orderingMap(projection)
	if !ok {
		return fmt.Errorf("ordering: events[%d].nativeExpected must be an object", index)
	}
	for _, field := range []string{"accepted", "stateIndex", "effectIndices"} {
		if !reflect.DeepEqual(expected[field], actual[field]) {
			return fmt.Errorf("ordering: events[%d].nativeExpected.%s mismatch", index, field)
		}
	}
	wantDeclared := expected["message"]
	if !reflect.DeepEqual(wantDeclared, actual["declaredMessage"]) {
		return fmt.Errorf("ordering: events[%d].nativeExpected.declaredMessage mismatch", index)
	}
	wantMessage := wantDeclared
	if accepted, _ := orderingBool(expected["accepted"]); !accepted {
		wantMessage = nil
	}
	if !reflect.DeepEqual(wantMessage, actual["message"]) {
		return fmt.Errorf("ordering: events[%d].nativeExpected.message mismatch", index)
	}
	return nil
}

func orderingCheckEventResult(index int, expected, actual, source map[string]any, profile string) error {
	kind, _ := expected["kind"].(string)
	wantAccepted, _ := orderingBool(expected["accepted"])
	result, resultExists := orderingMap(actual["result"])

	if kind == "renderer-swap" {
		if actual["message"] != nil || actual["manualReply"] != nil || actual["retainedCallback"] != nil {
			return fmt.Errorf("ordering: events[%d] has unrelated message or callback data", index)
		}
		if profile == "browser.dom" || profile == "browser.react" {
			if actual["result"] != nil {
				return fmt.Errorf("ordering: events[%d].result must be null for fixed browser profile swap", index)
			}
			return nil
		}
		if !resultExists {
			return fmt.Errorf("ordering: events[%d].result missing renderer swap", index)
		}
		if accepted, ok := orderingBool(result["accepted"]); !ok || !accepted {
			return fmt.Errorf("ordering: events[%d].result rejected renderer swap", index)
		}
		to, _ := source["to"].(string)
		if got, _ := result["to"].(string); got != to {
			return fmt.Errorf("ordering: events[%d].result.to mismatch", index)
		}
		return nil
	}

	if !wantAccepted && kind == "click" {
		// Direct profiles call the renderer callback even for a disabled node and
		// record a suppressed result. A real browser has no callback for disabled
		// controls and records null. Both represent the native rejected event.
		if actual["result"] == nil {
			if actual["message"] != nil || actual["manualReply"] != nil || actual["retainedCallback"] != nil {
				return fmt.Errorf("ordering: events[%d] has unrelated data for suppressed click", index)
			}
			return nil
		}
		if !resultExists {
			return fmt.Errorf("ordering: events[%d].result must be null or a suppressed click", index)
		}
		suppressed, _ := orderingBool(result["suppressed"])
		accepted, _ := orderingBool(result["accepted"])
		if !suppressed || !accepted {
			return fmt.Errorf("ordering: events[%d].result must be a suppressed click", index)
		}
		if actual["message"] != nil || actual["manualReply"] != nil || actual["retainedCallback"] != nil {
			return fmt.Errorf("ordering: events[%d] has unrelated data for suppressed click", index)
		}
		return nil
	}
	if !resultExists {
		return fmt.Errorf("ordering: events[%d].result missing", index)
	}
	resultAccepted, acceptedExists := orderingBool(result["accepted"])
	if !acceptedExists || resultAccepted != wantAccepted {
		return fmt.Errorf("ordering: events[%d].result.accepted mismatch", index)
	}
	switch kind {
	case "click":
		wantMessage, _ := orderingMap(expected["message"])
		gotMessage, _ := orderingMap(actual["message"])
		if wantAccepted && !orderingMessagesEqual(wantMessage, gotMessage) {
			return fmt.Errorf("ordering: events[%d].message mismatch", index)
		}
		if wantAccepted && !orderingResultMessageEqual(wantMessage, result["message"]) {
			return fmt.Errorf("ordering: events[%d].result.message mismatch", index)
		}
		if actual["manualReply"] != nil || actual["retainedCallback"] != nil {
			return fmt.Errorf("ordering: events[%d] has unrelated reply or callback data", index)
		}
	case "transport-reply":
		if actual["message"] != nil || actual["retainedCallback"] != nil {
			return fmt.Errorf("ordering: events[%d] has unrelated message or callback data", index)
		}
		outcome, _ := expected["transportOutcome"].(string)
		wantOutcome := "accepted"
		if outcome == "rejected-duplicate" {
			wantOutcome = "ignored-delivered"
		} else if outcome == "rejected-cancelled" {
			wantOutcome = "ignored-cancelled"
		} else if outcome != "accepted" {
			return fmt.Errorf("ordering: expected.events[%d].transportOutcome is unsupported", index)
		}
		if got, _ := result["outcome"].(string); got != wantOutcome {
			return fmt.Errorf("ordering: events[%d].result.outcome mismatch", index)
		}
		if !wantAccepted {
			stale, _ := orderingBool(result["stale"])
			if !stale {
				return fmt.Errorf("ordering: events[%d].result.stale must be true for retired reply", index)
			}
		}
		manualReply, _ := orderingMap(actual["manualReply"])
		token, _ := source["token"].(string)
		if manualReply == nil || manualReply["Name"] != "complete" || manualReply["Arg"] != token {
			return fmt.Errorf("ordering: events[%d].manualReply mismatch", index)
		}
	case "stale-callback":
		if actual["message"] != nil || actual["manualReply"] != nil {
			return fmt.Errorf("ordering: events[%d] has unrelated message or reply data", index)
		}
		stale, _ := orderingBool(result["stale"])
		if wantAccepted || !stale {
			return fmt.Errorf("ordering: events[%d].result must reject stale callback", index)
		}
		retained, ok := orderingMap(actual["retainedCallback"])
		if !ok {
			return fmt.Errorf("ordering: events[%d].retainedCallback missing", index)
		}
		retainedAccepted, ok := orderingBool(retained["accepted"])
		if !ok || retainedAccepted {
			return fmt.Errorf("ordering: events[%d].retainedCallback was accepted", index)
		}
		for _, field := range []string{"sourceEvent", "key", "generation"} {
			if !reflect.DeepEqual(source[field], retained[field]) {
				return fmt.Errorf("ordering: events[%d].retainedCallback.%s mismatch", index, field)
			}
		}
	default:
		return fmt.Errorf("ordering: events[%d].kind %q is unsupported", index, kind)
	}
	return nil
}

func orderingResultMessageEqual(expected map[string]any, actual any) bool {
	message, ok := orderingMap(actual)
	if !ok || expected == nil {
		return false
	}
	name, _ := expected["name"].(string)
	arg, _ := expected["arg"].(string)
	actualName, _ := message["Name"].(string)
	actualArg, _ := message["Arg"].(string)
	return name == actualName && arg == actualArg
}

func orderingCheckHostEventIndex(index int, event map[string]any) error {
	result, resultOK := orderingMap(event["result"])
	if !resultOK {
		if event["hostEventIndex"] != nil {
			return fmt.Errorf("ordering: events[%d].hostEventIndex must be null without a result", index)
		}
		return nil
	}
	resultIndex, resultHasIndex := orderingInt(result["eventIndex"])
	hostIndex, hostHasIndex := orderingInt(event["hostEventIndex"])
	if resultHasIndex != hostHasIndex || (resultHasIndex && resultIndex != hostIndex) {
		return fmt.Errorf("ordering: events[%d].hostEventIndex mismatch", index)
	}
	return nil
}

func orderingCheckStaleSource(index int, stale map[string]any, events []any) error {
	sourceIndex, ok := orderingInt(stale["sourceEvent"])
	if !ok || sourceIndex < 0 || sourceIndex >= int64(index) {
		return fmt.Errorf("ordering: events[%d].sourceEvent does not reference an earlier event", index)
	}
	oldEvent, _ := orderingMap(events[sourceIndex])
	oldKey, _ := stale["key"].(string)
	oldGeneration, _ := orderingInt(stale["generation"])
	if oldEvent["kind"] != "click" || oldEvent["target"] != "child" || oldEvent["key"] != oldKey {
		return fmt.Errorf("ordering: events[%d].sourceEvent is not the retired child click", index)
	}
	oldMessage, _ := orderingMap(oldEvent["message"])
	if oldMessage["name"] != "request" {
		return fmt.Errorf("ordering: events[%d].sourceEvent is not the retired request click", index)
	}
	if generation, ok := orderingInt(oldEvent["generation"]); !ok || generation != oldGeneration {
		return fmt.Errorf("ordering: events[%d].sourceEvent generation mismatch", index)
	}
	removed := false
	remounted := false
	newGeneration := false
	for next := int(sourceIndex) + 1; next < index; next++ {
		row, _ := orderingMap(events[next])
		kind, _ := row["kind"].(string)
		message, _ := orderingMap(row["message"])
		if kind == "click" && message["name"] == "child.remove" && message["arg"] == oldKey {
			removed = true
		}
		if removed && kind == "click" && message["name"] == "child.add" && message["arg"] == oldKey {
			remounted = true
		}
		key, _ := row["key"].(string)
		generation, generationOK := orderingInt(row["generation"])
		if remounted && kind == "click" && key == oldKey && generationOK && generation > oldGeneration {
			newGeneration = true
		}
	}
	if !removed || !remounted || !newGeneration {
		return fmt.Errorf("ordering: events[%d] stale callback is not retired by a newer generation", index)
	}
	return nil
}

func orderingMessagesEqual(expected, actual map[string]any) bool {
	if expected == nil || actual == nil {
		return expected == nil && actual == nil
	}
	name, _ := expected["name"].(string)
	arg, _ := expected["arg"].(string)
	actualName, _ := actual["name"].(string)
	actualArg, _ := actual["arg"].(string)
	return name == actualName && arg == actualArg
}

func orderingCheckTransport(expected, actual map[string]any, expectedEvents, actualEvents []any) error {
	expectedLedger, ok := orderingArray(expected["transportLedger"])
	if !ok {
		return fmt.Errorf("ordering: expected.transportLedger must be an array")
	}
	actualLedger, ok := orderingArray(actual["transportLedger"])
	if !ok || len(actualLedger) != len(expectedLedger) {
		return fmt.Errorf("ordering: transportLedger length mismatch: expected %d, got %d", len(expectedLedger), orderingLength(actual["transportLedger"]))
	}
	orderedLedger, ok := orderingArray(actual["orderedLedger"])
	if !ok {
		return fmt.Errorf("ordering: orderedLedger must be an array")
	}
	if err := orderingSequences(orderedLedger, "orderedLedger", true); err != nil {
		return err
	}
	orderedTransport := make([]map[string]any, 0, len(expectedLedger))
	for _, value := range orderedLedger {
		row, _ := orderingMap(value)
		kind, _ := row["kind"].(string)
		if kind == "start" || kind == "cancel" || kind == "reply" {
			orderedTransport = append(orderedTransport, row)
		}
	}
	if len(orderedTransport) != len(actualLedger) {
		return fmt.Errorf("ordering: orderedLedger transport action count mismatch: expected %d, got %d", len(actualLedger), len(orderedTransport))
	}

	starts := make(map[string]map[string]any)
	ended := make(map[string]string)
	for index := range expectedLedger {
		want, ok := orderingMap(expectedLedger[index])
		if !ok {
			return fmt.Errorf("ordering: expected.transportLedger[%d] must be an object", index)
		}
		got, ok := orderingMap(actualLedger[index])
		if !ok {
			return fmt.Errorf("ordering: transportLedger[%d] must be an object", index)
		}
		ordered := orderedTransport[index]
		wantSequence := int64(index)
		if n, ok := orderingInt(got["sequence"]); !ok || n != wantSequence {
			return fmt.Errorf("ordering: transportLedger[%d].sequence mismatch", index)
		}
		wantToken, _ := want["token"].(string)
		gotToken, _ := got["token"].(string)
		if wantToken == "" || gotToken != wantToken {
			return fmt.Errorf("ordering: transportLedger[%d].token mismatch", index)
		}
		wantAction, _ := want["action"].(string)
		gotKind, _ := got["kind"].(string)
		orderedKind, _ := ordered["kind"].(string)
		if !orderingTransportKindMatches(wantAction, gotKind) || !orderingOrderedKindMatches(wantAction, orderedKind) {
			return fmt.Errorf("ordering: transportLedger[%d].kind mismatch for %s", index, wantAction)
		}
		if !reflect.DeepEqual(ordered["token"], got["token"]) {
			return fmt.Errorf("ordering: orderedLedger transport token mismatch at action %d", index)
		}
		for _, field := range []string{"key", "generation"} {
			if want[field] != nil {
				if !reflect.DeepEqual(want[field], ordered[field]) {
					return fmt.Errorf("ordering: orderedLedger transport %s mismatch at action %d", field, index)
				}
			}
		}
		wantStatus, _ := want["status"].(string)
		gotStatus, _ := got["status"].(string)
		if gotStatus != orderingActualStatus(wantAction, wantStatus) {
			return fmt.Errorf("ordering: transportLedger[%d].status mismatch", index)
		}
		if gotOutcome, _ := got["outcome"].(string); gotOutcome != orderingTransportOutcome(wantAction) {
			return fmt.Errorf("ordering: transportLedger[%d].outcome mismatch", index)
		}
		if orderedStatus, _ := ordered["status"].(string); orderedStatus != orderingOrderedStatus(wantAction) {
			return fmt.Errorf("ordering: orderedLedger transport status mismatch at action %d", index)
		}
		if orderedOutcome, _ := ordered["outcome"].(string); orderedOutcome != orderingOrderedOutcome(wantAction) {
			return fmt.Errorf("ordering: orderedLedger transport outcome mismatch at action %d", index)
		}
		if err := orderingCheckOrderedCorrelation(wantAction, got, ordered, starts); err != nil {
			return fmt.Errorf("ordering: transportLedger[%d].correlation: %w", index, err)
		}
		switch wantAction {
		case "start":
			if _, exists := starts[wantToken]; exists {
				return fmt.Errorf("ordering: duplicate transport start for %q", wantToken)
			}
			starts[wantToken] = got
			ended[wantToken] = "pending"
		case "cancel":
			if ended[wantToken] != "pending" {
				return fmt.Errorf("ordering: transport cancel without a pending start for %q", wantToken)
			}
			ended[wantToken] = "cancelled"
		case "complete":
			if ended[wantToken] != "pending" {
				return fmt.Errorf("ordering: transport completion without a pending start for %q", wantToken)
			}
			ended[wantToken] = "completed"
		case "reject-duplicate":
			if ended[wantToken] != "completed" {
				return fmt.Errorf("ordering: duplicate transport reply before completion for %q", wantToken)
			}
		case "reject-cancelled":
			if ended[wantToken] != "cancelled" {
				return fmt.Errorf("ordering: late transport reply before cancellation for %q", wantToken)
			}
		default:
			return fmt.Errorf("ordering: expected.transportLedger[%d].action %q is unsupported", index, wantAction)
		}
		if err := orderingCheckTransportEvent(index, want, got, expectedEvents, actualEvents); err != nil {
			return err
		}
	}
	for token, state := range ended {
		if state == "pending" {
			return fmt.Errorf("ordering: transport %q remains pending after scenario", token)
		}
	}
	return nil
}

func orderingCheckEffectLedger(expected, actual map[string]any, expectedEvents, actualEvents []any) error {
	expectedTransport, _ := orderingArray(expected["transportLedger"])
	actualTransport, _ := orderingArray(actual["transportLedger"])
	effectLedger, ok := orderingArray(actual["effectLedger"])
	if !ok {
		return fmt.Errorf("ordering: effectLedger must be an array")
	}
	if err := orderingSequences(effectLedger, "effectLedger", true); err != nil {
		return err
	}
	wantCount := 0
	for _, value := range expectedTransport {
		row, _ := orderingMap(value)
		if row["action"] == "start" {
			wantCount += 2 // request queued, then transport started
		} else {
			wantCount++
		}
	}
	if len(effectLedger) != wantCount {
		return fmt.Errorf("ordering: effectLedger length mismatch: expected %d, got %d", wantCount, len(effectLedger))
	}
	startCorrelations := make(map[string]any)
	ordered, _ := orderingArray(actual["orderedLedger"])
	orderedActions := make([]map[string]any, 0)
	for _, value := range ordered {
		row, _ := orderingMap(value)
		kind, _ := row["kind"].(string)
		if kind == "start" || kind == "cancel" || kind == "reply" {
			orderedActions = append(orderedActions, row)
		}
	}
	ledgerIndex := 0
	orderedIndex := 0
	for transportIndex, value := range expectedTransport {
		want, _ := orderingMap(value)
		action, _ := want["action"].(string)
		token, _ := want["token"].(string)
		transport, _ := orderingMap(actualTransport[transportIndex])
		key, _ := want["key"].(string)
		generation, _ := orderingInt(want["generation"])
		if action == "start" {
			for _, kind := range []string{"request", "start"} {
				row, ok := orderingMap(effectLedger[ledgerIndex])
				if !ok {
					return fmt.Errorf("ordering: effectLedger[%d] must be an object", ledgerIndex)
				}
				if got, _ := row["kind"].(string); got != kind {
					return fmt.Errorf("ordering: effectLedger[%d].kind mismatch", ledgerIndex)
				}
				if err := orderingEffectIdentity(ledgerIndex, row, token, key, generation); err != nil {
					return err
				}
				if !orderingSameCorrelation(row["correlation"], transport["correlation"]) {
					return fmt.Errorf("ordering: effectLedger[%d].correlation mismatch", ledgerIndex)
				}
				if kind == "request" {
					if row["status"] != "queued" || row["outcome"] != "queued" {
						return fmt.Errorf("ordering: effectLedger[%d] queued request mismatch", ledgerIndex)
					}
				} else if row["status"] != "pending" || row["outcome"] != "started" {
					return fmt.Errorf("ordering: effectLedger[%d] start status mismatch", ledgerIndex)
				}
				if err := orderingCheckEffectHostIndex(ledgerIndex, row, want, actualEvents); err != nil {
					return err
				}
				ledgerIndex++
			}
			startCorrelations[token] = transport["correlation"]
			if !orderingSameCorrelation(orderedActions[orderedIndex]["correlation"], transport["correlation"]) {
				return fmt.Errorf("ordering: orderedLedger start correlation mismatch at action %d", transportIndex)
			}
			orderedIndex++
			continue
		}

		row, ok := orderingMap(effectLedger[ledgerIndex])
		if !ok {
			return fmt.Errorf("ordering: effectLedger[%d] must be an object", ledgerIndex)
		}
		wantKind := "reply"
		if action == "cancel" {
			wantKind = "cancel"
		}
		if got, _ := row["kind"].(string); got != wantKind {
			return fmt.Errorf("ordering: effectLedger[%d].kind mismatch", ledgerIndex)
		}
		if err := orderingEffectIdentity(ledgerIndex, row, token, key, generation); err != nil {
			return err
		}
		if orderedIndex >= len(orderedActions) {
			return fmt.Errorf("ordering: orderedLedger action is missing at %d", transportIndex)
		}
		orderedAction := orderedActions[orderedIndex]
		if action == "cancel" {
			startCorrelation := startCorrelations[token]
			if !orderingSameCorrelation(transport["correlation"], startCorrelation) || !orderingSameCorrelation(row["targetCorrelation"], startCorrelation) || !orderingSameCorrelation(orderedAction["targetCorrelation"], startCorrelation) {
				return fmt.Errorf("ordering: effectLedger[%d].targetCorrelation mismatch", ledgerIndex)
			}
			if !orderingSameCorrelation(row["correlation"], orderedAction["correlation"]) {
				return fmt.Errorf("ordering: effectLedger[%d].correlation mismatch", ledgerIndex)
			}
			if row["status"] != "cancelled" || row["outcome"] != "cancelled" {
				return fmt.Errorf("ordering: effectLedger[%d] cancellation status mismatch", ledgerIndex)
			}
		} else {
			if !orderingSameCorrelation(row["correlation"], startCorrelations[token]) || !orderingSameCorrelation(orderedAction["correlation"], startCorrelations[token]) {
				return fmt.Errorf("ordering: effectLedger[%d].correlation mismatch", ledgerIndex)
			}
			wantStatus := "delivered"
			if action == "reject-cancelled" {
				wantStatus = "cancelled"
			}
			if row["status"] != wantStatus || row["outcome"] != orderingOrderedOutcome(action) {
				return fmt.Errorf("ordering: effectLedger[%d] reply status/outcome mismatch", ledgerIndex)
			}
		}
		if err := orderingCheckEffectHostIndex(ledgerIndex, row, want, actualEvents); err != nil {
			return err
		}
		ledgerIndex++
		orderedIndex++
	}
	return nil
}

// orderingCheckPendingCounts binds every declared async pendingCount to the Go
// replay state after the source event. The capture's pendingGo arrays and its
// counts are both producer observations, so neither is used to derive the
// expected count.
func orderingCheckPendingCounts(expected, actual map[string]any, expectedEvents, actualEvents []any) error {
	expectedTransport, ok := orderingArray(expected["transportLedger"])
	if !ok {
		return fmt.Errorf("ordering: expected.transportLedger must be an array")
	}
	goPendingByAction := make([][]orderingPendingIdentity, len(expectedTransport))
	actions := make([]string, len(expectedTransport))
	tokens := make([]string, len(expectedTransport))
	for index, value := range expectedTransport {
		transport, ok := orderingMap(value)
		if !ok {
			return fmt.Errorf("ordering: expected.transportLedger[%d] must be an object", index)
		}
		action, _ := transport["action"].(string)
		actions[index] = action
		tokens[index], _ = transport["token"].(string)
		eventIndex, ok := orderingInt(transport["eventIndex"])
		if !ok || eventIndex < 0 || eventIndex >= int64(len(expectedEvents)) {
			return fmt.Errorf("ordering: expected.transportLedger[%d].eventIndex is invalid", index)
		}
		pending, err := orderingGoPendingForEvent(expected, expectedEvents, int(eventIndex))
		if err != nil {
			return fmt.Errorf("ordering: expected.transportLedger[%d] Go pending state: %w", index, err)
		}
		if tokens[index] == "" {
			return fmt.Errorf("ordering: expected.transportLedger[%d].token is invalid", index)
		}
		if action == "start" {
			identity, exists := pending[tokens[index]]
			if !exists {
				return fmt.Errorf("ordering: expected.transportLedger[%d] started token is absent from Go pending state", index)
			}
			key, keyOK := transport["key"].(string)
			generation, generationOK := orderingInt(transport["generation"])
			if !keyOK || key != identity.key || !generationOK || generation != identity.generation {
				return fmt.Errorf("ordering: expected.transportLedger[%d] start identity differs from Go pending state", index)
			}
		} else if _, exists := pending[tokens[index]]; exists {
			return fmt.Errorf("ordering: expected.transportLedger[%d] ended token remains in Go pending state", index)
		}
		goPendingByAction[index] = orderingPendingIdentities(pending)
	}

	ordered, ok := orderingArray(actual["orderedLedger"])
	if !ok {
		return fmt.Errorf("ordering: orderedLedger must be an array")
	}
	orderedRows, err := orderingPendingRows(ordered, "orderedLedger")
	if err != nil {
		return err
	}
	effectLedger, ok := orderingArray(actual["effectLedger"])
	if !ok {
		return fmt.Errorf("ordering: effectLedger must be an array")
	}
	effectRows, err := orderingPendingRows(effectLedger, "effectLedger")
	if err != nil {
		return err
	}
	orderedWant, effectWant := orderingPendingActionKinds(actions)
	if len(orderedRows) != len(orderedWant) {
		return fmt.Errorf("ordering: orderedLedger async pendingCount row count mismatch: expected %d, got %d", len(orderedWant), len(orderedRows))
	}
	if len(effectRows) != len(effectWant) {
		return fmt.Errorf("ordering: effectLedger pendingCount row count mismatch: expected %d, got %d", len(effectWant), len(effectRows))
	}
	if err := orderingCheckPendingActionRows("orderedLedger", orderedRows, actions, tokens, goPendingByAction); err != nil {
		return err
	}
	if err := orderingCheckPendingActionRows("effectLedger", effectRows, actions, tokens, goPendingByAction); err != nil {
		return err
	}

	// Lifecycle commits are another capture-side projection of Go pending state.
	// Check their full token/key/generation set against the same Go snapshots so
	// coherently forged pendingGo and pendingCount fields cannot validate each
	// other.
	goPendingByHostIndex := make(map[int64][]orderingPendingIdentity)
	for eventIndex, value := range actualEvents {
		actualEvent, ok := orderingMap(value)
		if !ok {
			return fmt.Errorf("ordering: events[%d] must be an object", eventIndex)
		}
		result, _ := orderingMap(actualEvent["result"])
		hostIndex, ok := orderingInt(result["eventIndex"])
		if !ok {
			continue
		}
		pending, err := orderingGoPendingForEvent(expected, expectedEvents, eventIndex)
		if err != nil {
			return fmt.Errorf("ordering: events[%d] Go pending state: %w", eventIndex, err)
		}
		identities := orderingPendingIdentities(pending)
		if prior, exists := goPendingByHostIndex[hostIndex]; exists && !reflect.DeepEqual(prior, identities) {
			return fmt.Errorf("ordering: host event %d maps to conflicting Go pending states", hostIndex)
		}
		goPendingByHostIndex[hostIndex] = identities
	}
	lifecycle, ok := orderingArray(actual["lifecycleLedger"])
	if !ok {
		return fmt.Errorf("ordering: lifecycleLedger must be an array")
	}
	for index, value := range lifecycle {
		row, ok := orderingMap(value)
		if !ok {
			return fmt.Errorf("ordering: lifecycleLedger[%d] must be an object", index)
		}
		kind, _ := row["kind"].(string)
		if kind != "renderer-commit" && kind != "go-commit-render" {
			continue
		}
		hostIndex, ok := orderingInt(row["stateEventIndex"])
		if !ok {
			return fmt.Errorf("ordering: lifecycleLedger[%d].stateEventIndex is invalid", index)
		}
		want, exists := goPendingByHostIndex[hostIndex]
		if !exists {
			return fmt.Errorf("ordering: lifecycleLedger[%d] has no Go state for host event %d", index, hostIndex)
		}
		pending, ok := orderingArray(row["pendingGo"])
		if !ok {
			return fmt.Errorf("ordering: lifecycleLedger[%d].pendingGo must be an array", index)
		}
		got, err := orderingCapturePendingIdentities(pending, index)
		if err != nil {
			return err
		}
		if !orderingSamePendingIdentities(want, got) {
			return fmt.Errorf("ordering: lifecycleLedger[%d].pendingGo differs from Go replay state", index)
		}
	}
	return nil
}

type orderingPendingIdentity struct {
	key        string
	generation int64
	token      string
}

type orderingPendingRow struct {
	index int
	kind  string
	row   map[string]any
}

func orderingGoPendingForEvent(expected map[string]any, expectedEvents []any, eventIndex int) (map[string]orderingPendingIdentity, error) {
	if eventIndex < 0 || eventIndex >= len(expectedEvents) {
		return nil, fmt.Errorf("event index is out of range")
	}
	event, ok := orderingMap(expectedEvents[eventIndex])
	if !ok {
		return nil, fmt.Errorf("event must be an object")
	}
	stateIndex, ok := orderingInt(event["stateIndex"])
	if !ok || stateIndex < 0 {
		return nil, fmt.Errorf("event stateIndex is invalid")
	}
	states, ok := orderingArray(expected["states"])
	if !ok || stateIndex >= int64(len(states)) {
		return nil, fmt.Errorf("stateIndex is out of range")
	}
	state, ok := orderingMap(states[stateIndex])
	if !ok {
		return nil, fmt.Errorf("state row must be an object")
	}
	children, ok := orderingArray(state["children"])
	if !ok {
		return nil, fmt.Errorf("state children must be an array")
	}
	pending := make(map[string]orderingPendingIdentity)
	for childIndex, value := range children {
		child, ok := orderingMap(value)
		if !ok {
			return nil, fmt.Errorf("state children[%d] must be an object", childIndex)
		}
		childState, ok := orderingMap(child["state"])
		if !ok {
			return nil, fmt.Errorf("state children[%d].state must be an object", childIndex)
		}
		isPending, ok := orderingBool(childState["Pending"])
		if !ok {
			return nil, fmt.Errorf("state children[%d].state.Pending must be boolean", childIndex)
		}
		if !isPending {
			continue
		}
		key, keyOK := child["key"].(string)
		token, tokenOK := childState["Token"].(string)
		generation, generationOK := orderingInt(child["generation"])
		if !keyOK || key == "" || !tokenOK || token == "" || !generationOK || generation < 0 {
			return nil, fmt.Errorf("state children[%d] pending identity is invalid", childIndex)
		}
		if _, exists := pending[token]; exists {
			return nil, fmt.Errorf("state contains duplicate pending token %q", token)
		}
		pending[token] = orderingPendingIdentity{key: key, generation: generation, token: token}
	}
	return pending, nil
}

func orderingPendingIdentities(pending map[string]orderingPendingIdentity) []orderingPendingIdentity {
	identities := make([]orderingPendingIdentity, 0, len(pending))
	for _, identity := range pending {
		identities = append(identities, identity)
	}
	sort.Slice(identities, func(i, j int) bool { return identities[i].token < identities[j].token })
	return identities
}

func orderingPendingActionKinds(actions []string) ([]string, []string) {
	var ordered, effect []string
	for _, action := range actions {
		switch action {
		case "start":
			ordered = append(ordered, "request", "start")
			effect = append(effect, "request", "start")
		case "cancel":
			ordered = append(ordered, "cancel")
			effect = append(effect, "cancel")
		case "complete", "reject-duplicate", "reject-cancelled":
			ordered = append(ordered, "reply")
			effect = append(effect, "reply")
		default:
			// The transport checker reports unsupported transitions with the
			// detailed source row. Keep the projection empty for unknown actions.
		}
	}
	return ordered, effect
}

func orderingPendingRows(rows []any, field string) ([]orderingPendingRow, error) {
	var pendingRows []orderingPendingRow
	for index, value := range rows {
		row, ok := orderingMap(value)
		if !ok {
			return nil, fmt.Errorf("ordering: %s[%d] must be an object", field, index)
		}
		kind, _ := row["kind"].(string)
		asyncKind := kind == "request" || kind == "start" || kind == "cancel" || kind == "reply"
		_, declaresCount := row["pendingCount"]
		if !asyncKind {
			if declaresCount {
				return nil, fmt.Errorf("ordering: %s[%d].pendingCount is not declared for kind %q", field, index, kind)
			}
			continue
		}
		if !declaresCount {
			return nil, fmt.Errorf("ordering: %s[%d].pendingCount is missing", field, index)
		}
		pendingRows = append(pendingRows, orderingPendingRow{index: index, kind: kind, row: row})
	}
	return pendingRows, nil
}

func orderingCheckPendingActionRows(field string, rows []orderingPendingRow, actions []string, tokens []string, states [][]orderingPendingIdentity) error {
	rowIndex := 0
	for actionIndex, action := range actions {
		wantKinds := []string{}
		switch action {
		case "start":
			wantKinds = []string{"request", "start"}
		case "cancel":
			wantKinds = []string{"cancel"}
		case "complete", "reject-duplicate", "reject-cancelled":
			wantKinds = []string{"reply"}
		default:
			continue
		}
		for _, wantKind := range wantKinds {
			if rowIndex >= len(rows) || rows[rowIndex].kind != wantKind {
				return fmt.Errorf("ordering: %s async row %d kind mismatch", field, rowIndex)
			}
			row := rows[rowIndex]
			if got, _ := row.row["token"].(string); got != tokens[actionIndex] {
				return fmt.Errorf("ordering: %s[%d].token mismatch for pending count", field, row.index)
			}
			wantCount := int64(len(states[actionIndex]))
			gotCount, ok := orderingCanonicalPendingCount(row.row["pendingCount"])
			if !ok {
				return fmt.Errorf("ordering: %s[%d].pendingCount must be a canonical non-negative integer", field, row.index)
			}
			if gotCount != wantCount {
				return fmt.Errorf("ordering: %s[%d].pendingCount mismatch: expected %d, got %d", field, row.index, wantCount, gotCount)
			}
			rowIndex++
		}
	}
	if rowIndex != len(rows) {
		return fmt.Errorf("ordering: %s has unexpected async pendingCount rows", field)
	}
	return nil
}

func orderingCanonicalPendingCount(value any) (int64, bool) {
	switch number := value.(type) {
	case json.Number:
		parsed, err := strconv.ParseInt(number.String(), 10, 64)
		if err != nil || parsed < 0 || strconv.FormatInt(parsed, 10) != number.String() {
			return 0, false
		}
		return parsed, true
	case int:
		if number < 0 {
			return 0, false
		}
		return int64(number), true
	case int32:
		if number < 0 {
			return 0, false
		}
		return int64(number), true
	case int64:
		if number < 0 {
			return 0, false
		}
		return number, true
	case uint:
		if uint64(number) > uint64(^uint64(0)>>1) {
			return 0, false
		}
		return int64(number), true
	case uint64:
		if number > uint64(^uint64(0)>>1) {
			return 0, false
		}
		return int64(number), true
	default:
		return 0, false
	}
}

func orderingCapturePendingIdentities(rows []any, lifecycleIndex int) ([]orderingPendingIdentity, error) {
	pending := make([]orderingPendingIdentity, 0, len(rows))
	seen := make(map[string]struct{}, len(rows))
	for index, value := range rows {
		row, ok := orderingMap(value)
		if !ok {
			return nil, fmt.Errorf("ordering: lifecycleLedger[%d].pendingGo[%d] must be an object", lifecycleIndex, index)
		}
		key, keyOK := row["key"].(string)
		token, tokenOK := row["token"].(string)
		generation, generationOK := orderingInt(row["generation"])
		if !keyOK || key == "" || !tokenOK || token == "" || !generationOK || generation < 0 {
			return nil, fmt.Errorf("ordering: lifecycleLedger[%d].pendingGo[%d] identity is invalid", lifecycleIndex, index)
		}
		if _, exists := seen[token]; exists {
			return nil, fmt.Errorf("ordering: lifecycleLedger[%d].pendingGo has duplicate token %q", lifecycleIndex, token)
		}
		seen[token] = struct{}{}
		pending = append(pending, orderingPendingIdentity{key: key, generation: generation, token: token})
	}
	sort.Slice(pending, func(i, j int) bool { return pending[i].token < pending[j].token })
	return pending, nil
}

func orderingSamePendingIdentities(left, right []orderingPendingIdentity) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func orderingEffectIdentity(index int, row map[string]any, token, key string, generation int64) error {
	if row["token"] != token || row["key"] != key {
		return fmt.Errorf("ordering: effectLedger[%d] token/key mismatch", index)
	}
	if got, ok := orderingInt(row["generation"]); !ok || got != generation {
		return fmt.Errorf("ordering: effectLedger[%d].generation mismatch", index)
	}
	return nil
}

func orderingCheckEffectHostIndex(index int, row, expectedTransport map[string]any, actualEvents []any) error {
	eventIndex, ok := orderingInt(expectedTransport["eventIndex"])
	if !ok || eventIndex < 0 || eventIndex >= int64(len(actualEvents)) {
		return fmt.Errorf("ordering: effectLedger[%d] source event is invalid", index)
	}
	actualEvent, _ := orderingMap(actualEvents[eventIndex])
	result, _ := orderingMap(actualEvent["result"])
	hostIndex, hostOK := orderingInt(result["eventIndex"])
	if expectedTransport["action"] == "reject-duplicate" || expectedTransport["action"] == "reject-cancelled" {
		if _, ok := orderingInt(row["stateEventIndex"]); !ok {
			return fmt.Errorf("ordering: effectLedger[%d].stateEventIndex is invalid", index)
		}
		return nil
	}
	rowIndex, rowOK := orderingInt(row["stateEventIndex"])
	if !hostOK || !rowOK || rowIndex != hostIndex {
		return fmt.Errorf("ordering: effectLedger[%d].stateEventIndex mismatch", index)
	}
	return nil
}

func orderingTransportKindMatches(action, kind string) bool {
	switch action {
	case "start":
		return kind == "start"
	case "cancel":
		return kind == "cancel"
	case "complete":
		return kind == "deliver"
	case "reject-duplicate", "reject-cancelled":
		return kind == "force-deliver-retained"
	default:
		return false
	}
}

func orderingOrderedKindMatches(action, kind string) bool {
	switch action {
	case "start":
		return kind == "start"
	case "cancel":
		return kind == "cancel"
	case "complete", "reject-duplicate", "reject-cancelled":
		return kind == "reply"
	default:
		return false
	}
}

func orderingActualStatus(action, expectedStatus string) string {
	switch action {
	case "start":
		return "pending"
	case "cancel":
		return "cancelled"
	case "complete":
		return "accepted"
	case "reject-duplicate", "reject-cancelled":
		return "rejected"
	default:
		return ""
	}
}

func orderingTransportOutcome(action string) string {
	switch action {
	case "complete":
		return "accepted"
	case "reject-duplicate":
		return "effect request is delivered"
	case "reject-cancelled":
		return "effect request is cancelled"
	default:
		return ""
	}
}

func orderingOrderedStatus(action string) string {
	switch action {
	case "start":
		return "pending"
	case "cancel":
		return "cancelled"
	case "complete":
		return "delivered"
	case "reject-duplicate":
		return "delivered"
	case "reject-cancelled":
		return "cancelled"
	default:
		return ""
	}
}

func orderingOrderedOutcome(action string) string {
	switch action {
	case "start":
		return "started"
	case "cancel":
		return "cancelled"
	case "complete":
		return "accepted"
	case "reject-duplicate":
		return "ignored-delivered"
	case "reject-cancelled":
		return "ignored-cancelled"
	default:
		return ""
	}
}

func orderingCheckOrderedCorrelation(action string, transport, ordered map[string]any, starts map[string]map[string]any) error {
	token, _ := transport["token"].(string)
	if action == "start" {
		if !orderingSameCorrelation(transport["correlation"], ordered["correlation"]) {
			return fmt.Errorf("start correlation differs from ordered action")
		}
		return nil
	}
	start := starts[token]
	if start == nil {
		return fmt.Errorf("missing original start correlation for %q", token)
	}
	startCorrelation := start["correlation"]
	if action == "cancel" {
		if !orderingSameCorrelation(transport["correlation"], startCorrelation) {
			return fmt.Errorf("cancel does not target original start for %q", token)
		}
		if !orderingSameCorrelation(ordered["targetCorrelation"], startCorrelation) {
			return fmt.Errorf("ordered cancel target differs from original start for %q", token)
		}
		return nil
	}
	if !orderingSameCorrelation(ordered["correlation"], startCorrelation) {
		return fmt.Errorf("reply correlation differs from original start for %q", token)
	}
	if !orderingSameReply(transport["reply"], token) {
		return fmt.Errorf("reply does not carry complete token %q", token)
	}
	return nil
}

func orderingSameCorrelation(left, right any) bool {
	l, lok := orderingMap(left)
	r, rok := orderingMap(right)
	if !lok || !rok {
		return false
	}
	leftID, leftOK := l["dispatchId"].(string)
	rightID, rightOK := r["dispatchId"].(string)
	leftEffect, leftEffectOK := orderingInt(l["effectIndex"])
	rightEffect, rightEffectOK := orderingInt(r["effectIndex"])
	return leftOK && rightOK && leftID != "" && leftID == rightID && leftEffectOK && rightEffectOK && leftEffect == rightEffect
}

func orderingSameReply(value any, token string) bool {
	reply, ok := orderingMap(value)
	return ok && reply["Name"] == "complete" && reply["Arg"] == token
}

func orderingCheckTransportEvent(index int, want, got map[string]any, expectedEvents, actualEvents []any) error {
	eventIndex, ok := orderingInt(want["eventIndex"])
	if !ok || eventIndex < 0 || eventIndex >= int64(len(expectedEvents)) {
		return fmt.Errorf("ordering: expected.transportLedger[%d].eventIndex is out of range", index)
	}
	transportAction, _ := want["action"].(string)
	if transportAction == "start" || transportAction == "cancel" {
		event, _ := orderingMap(expectedEvents[eventIndex])
		effectIndex, ok := orderingInt(want["effectIndex"])
		if !ok {
			return fmt.Errorf("ordering: expected.transportLedger[%d].effectIndex is invalid", index)
		}
		effectIndices, ok := orderingArray(event["effectIndices"])
		if !ok || !orderingContainsInt(effectIndices, effectIndex) {
			return fmt.Errorf("ordering: expected transport action %d is not attached to its source event", index)
		}
	}
	actualEvent, _ := orderingMap(actualEvents[eventIndex])
	result, _ := orderingMap(actualEvent["result"])
	_, resultIndexOK := orderingInt(result["eventIndex"])
	if transportAction == "start" || transportAction == "cancel" {
		if !resultIndexOK {
			return fmt.Errorf("ordering: events[%d] has no host event for transport action", eventIndex)
		}
	}
	if transportAction == "complete" || transportAction == "reject-duplicate" || transportAction == "reject-cancelled" {
		token, _ := got["token"].(string)
		source, _ := orderingMap(actualEvent["sourceEvent"])
		if source["token"] != token {
			return fmt.Errorf("ordering: events[%d].sourceEvent.token does not match transportLedger[%d]", eventIndex, index)
		}
	}
	return nil
}

func orderingCheckRenderLifecycle(expected, actual map[string]any, expectedEvents, actualEvents []any) error {
	lifecycle, ok := orderingArray(actual["lifecycleLedger"])
	if !ok || len(lifecycle) == 0 {
		return fmt.Errorf("ordering: lifecycleLedger must be a non-empty array")
	}
	if err := orderingSequences(lifecycle, "lifecycleLedger", false); err != nil {
		return err
	}
	ordered, _ := orderingArray(actual["orderedLedger"])
	starts := make(map[string]map[string]any)
	for _, value := range lifecycle {
		row, _ := orderingMap(value)
		kind, _ := row["kind"].(string)
		if kind == "transport-start" {
			token, _ := row["token"].(string)
			if token == "" || starts[token] != nil {
				return fmt.Errorf("ordering: lifecycleLedger has duplicate or empty transport-start token")
			}
			starts[token] = row
		}
	}
	expectedTransport, _ := orderingArray(expected["transportLedger"])
	for _, value := range expectedTransport {
		want, _ := orderingMap(value)
		action, _ := want["action"].(string)
		if action != "start" {
			continue
		}
		token, _ := want["token"].(string)
		start := starts[token]
		if start == nil {
			return fmt.Errorf("ordering: lifecycleLedger missing transport-start for %q", token)
		}
		got, _ := orderingMap(actualTransportFind(actual, token, "start"))
		if !orderingSameCorrelation(start["correlation"], got["correlation"]) {
			return fmt.Errorf("ordering: lifecycleLedger transport-start correlation mismatch for %q", token)
		}
		eventIndex, ok := orderingInt(want["eventIndex"])
		if !ok || eventIndex < 0 || eventIndex >= int64(len(actualEvents)) {
			return fmt.Errorf("ordering: transport-start %q has invalid source event index", token)
		}
		actualEvent, _ := orderingMap(actualEvents[eventIndex])
		result, _ := orderingMap(actualEvent["result"])
		hostIndex, ok := orderingInt(result["eventIndex"])
		if !ok {
			return fmt.Errorf("ordering: request event %d has no rendered host event", eventIndex)
		}
		startStateIndex, ok := orderingInt(start["stateEventIndex"])
		if !ok || startStateIndex != hostIndex {
			return fmt.Errorf("ordering: transport-start %q is detached from request event", token)
		}
		startSequence, _ := orderingInt(start["sequence"])
		commitFound := false
		for _, commitValue := range lifecycle {
			commit, _ := orderingMap(commitValue)
			kind, _ := commit["kind"].(string)
			if kind != "renderer-commit" && kind != "go-commit-render" {
				continue
			}
			stateEventIndex, stateOK := orderingInt(commit["stateEventIndex"])
			sequence, seqOK := orderingInt(commit["sequence"])
			if !stateOK || !seqOK || stateEventIndex != hostIndex || sequence >= startSequence {
				continue
			}
			pending, pendingOK := orderingArray(commit["pendingGo"])
			if pendingOK && orderingPendingHas(pending, token) {
				commitFound = true
				break
			}
		}
		if !commitFound {
			return fmt.Errorf("ordering: transport-start %q preceded render of pending state", token)
		}
		if !orderingHasOrderedStart(ordered, token, start["correlation"]) {
			return fmt.Errorf("ordering: orderedLedger missing correlated start for %q", token)
		}
	}

	// An accepted reply must flow through a committed render that retires that
	// token from pending state. Rejected duplicate/late replies must not trigger
	// a second accepted render.
	for index, value := range expectedEvents {
		want, _ := orderingMap(value)
		kind, _ := want["kind"].(string)
		if kind != "transport-reply" || want["transportOutcome"] != "accepted" {
			continue
		}
		actualEvent, _ := orderingMap(actualEvents[index])
		result, _ := orderingMap(actualEvent["result"])
		hostIndex, ok := orderingInt(result["eventIndex"])
		if !ok {
			return fmt.Errorf("ordering: accepted reply event %d has no render event", index)
		}
		token, _ := want["token"].(string)
		found := false
		for _, value := range lifecycle {
			row, _ := orderingMap(value)
			rowKind, _ := row["kind"].(string)
			stateIndex, stateOK := orderingInt(row["stateEventIndex"])
			if rowKind != "renderer-commit" || !stateOK || stateIndex != hostIndex {
				continue
			}
			pending, pendingOK := orderingArray(row["pendingGo"])
			if pendingOK && !orderingPendingHas(pending, token) {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("ordering: accepted reply %q was not rendered out of pending state", token)
		}
	}
	if err := orderingCheckCancellationLifecycle(expected, actual, expectedTransport, actualEvents, lifecycle); err != nil {
		return err
	}
	if err := orderingCheckFinalPending(expected, lifecycle); err != nil {
		return err
	}
	return nil
}

func orderingCheckCancellationLifecycle(expected, actual map[string]any, expectedTransport, actualEvents, lifecycle []any) error {
	for actionIndex, value := range expectedTransport {
		want, _ := orderingMap(value)
		if want["action"] != "cancel" {
			continue
		}
		token, _ := want["token"].(string)
		eventIndex, ok := orderingInt(want["eventIndex"])
		if !ok || eventIndex < 0 || eventIndex >= int64(len(actualEvents)) {
			return fmt.Errorf("ordering: cancellation action %d has invalid source event", actionIndex)
		}
		event, _ := orderingMap(actualEvents[eventIndex])
		result, _ := orderingMap(event["result"])
		hostIndex, ok := orderingInt(result["eventIndex"])
		if !ok {
			return fmt.Errorf("ordering: cancellation event %d has no host event", eventIndex)
		}
		start := actualTransportFind(actual, token, "start")
		startRow, _ := orderingMap(start)
		startCorrelation := startRow["correlation"]
		var goCancel, cancelCall, cancel *map[string]any
		var stateCommit *map[string]any
		for _, value := range lifecycle {
			row, _ := orderingMap(value)
			if row["token"] != token {
				continue
			}
			switch row["kind"] {
			case "go-cancel-effect":
				copy := row
				goCancel = &copy
			case "transport-cancel-call":
				copy := row
				cancelCall = &copy
			case "transport-cancel":
				copy := row
				cancel = &copy
			case "go-state-commit", "go-unmounted-commit":
				stateIndex, stateIndexOK := orderingInt(row["stateEventIndex"])
				pending, pendingOK := orderingBool(row["pending"])
				if stateIndex == hostIndex && stateIndexOK && pendingOK && !pending {
					copy := row
					stateCommit = &copy
				}
			}
		}
		if goCancel == nil || cancelCall == nil || cancel == nil || stateCommit == nil {
			return fmt.Errorf("ordering: lifecycleLedger missing cancellation sequence for %q", token)
		}
		stateSequence, _ := orderingInt((*stateCommit)["sequence"])
		goCancelSequence, _ := orderingInt((*goCancel)["sequence"])
		callSequence, _ := orderingInt((*cancelCall)["sequence"])
		cancelSequence, _ := orderingInt((*cancel)["sequence"])
		if !(stateSequence < goCancelSequence && goCancelSequence < callSequence && callSequence < cancelSequence) {
			return fmt.Errorf("ordering: cancellation lifecycle order mismatch for %q", token)
		}
		if !orderingSameCorrelation((*goCancel)["targetCorrelation"], startCorrelation) || !orderingSameCorrelation((*cancelCall)["correlation"], startCorrelation) || !orderingSameCorrelation((*cancel)["correlation"], startCorrelation) {
			return fmt.Errorf("ordering: cancellation lifecycle correlation mismatch for %q", token)
		}
		stateIndex, _ := orderingInt((*cancel)["stateEventIndex"])
		if stateIndex != hostIndex {
			return fmt.Errorf("ordering: cancellation lifecycle event index mismatch for %q", token)
		}
		commitFound := false
		for _, value := range lifecycle {
			row, _ := orderingMap(value)
			if row["kind"] != "renderer-commit" {
				continue
			}
			rowStateIndex, stateIndexOK := orderingInt(row["stateEventIndex"])
			sequence, sequenceOK := orderingInt(row["sequence"])
			pending, pendingOK := orderingArray(row["pendingGo"])
			if stateIndexOK && sequenceOK && pendingOK && rowStateIndex == hostIndex && sequence > cancelSequence && !orderingPendingHas(pending, token) {
				commitFound = true
				break
			}
		}
		if !commitFound {
			return fmt.Errorf("ordering: cancelled request %q was not rendered out of pending state", token)
		}
	}
	return nil
}

func orderingCheckFinalPending(expected map[string]any, lifecycle []any) error {
	wantPending, ok := orderingArray(expected["pendingTransports"])
	if !ok {
		return fmt.Errorf("ordering: expected.pendingTransports must be an array")
	}
	wantTokens := make(map[string]struct{}, len(wantPending))
	for index, value := range wantPending {
		row, _ := orderingMap(value)
		token, _ := row["token"].(string)
		if token == "" {
			return fmt.Errorf("ordering: expected.pendingTransports[%d].token is invalid", index)
		}
		wantTokens[token] = struct{}{}
	}
	var finalCommit map[string]any
	finalSequence := int64(-1)
	for _, value := range lifecycle {
		row, _ := orderingMap(value)
		if row["kind"] != "renderer-commit" {
			continue
		}
		sequence, ok := orderingInt(row["sequence"])
		if ok && sequence > finalSequence {
			finalSequence = sequence
			finalCommit = row
		}
	}
	if finalCommit == nil {
		return fmt.Errorf("ordering: lifecycleLedger has no final renderer commit")
	}
	gotPending, ok := orderingArray(finalCommit["pendingGo"])
	if !ok || len(gotPending) != len(wantTokens) {
		return fmt.Errorf("ordering: final rendered pending set mismatch")
	}
	for _, value := range gotPending {
		row, _ := orderingMap(value)
		token, _ := row["token"].(string)
		if _, exists := wantTokens[token]; !exists {
			return fmt.Errorf("ordering: unexpected final pending transport %q", token)
		}
	}
	return nil
}

func actualTransportFind(actual map[string]any, token, kind string) any {
	rows, _ := orderingArray(actual["transportLedger"])
	for _, value := range rows {
		row, _ := orderingMap(value)
		if row["token"] == token && row["kind"] == kind {
			return value
		}
	}
	return nil
}

func orderingHasOrderedStart(ordered []any, token string, correlation any) bool {
	for _, value := range ordered {
		row, _ := orderingMap(value)
		if row["kind"] == "start" && row["token"] == token && orderingSameCorrelation(row["correlation"], correlation) && row["status"] == "pending" && row["outcome"] == "started" {
			return true
		}
	}
	return false
}

func orderingCheckRetirement(expected, actual map[string]any, expectedEvents, actualEvents []any) error {
	wantRetired, ok := orderingArray(expected["retiredChildren"])
	if !ok {
		return fmt.Errorf("ordering: expected.retiredChildren must be an array")
	}
	gotRetired, ok := orderingArray(actual["retiredChildren"])
	if !ok || len(gotRetired) != len(wantRetired) {
		return fmt.Errorf("ordering: retiredChildren length mismatch: expected %d, got %d", len(wantRetired), orderingLength(actual["retiredChildren"]))
	}
	lifecycle, _ := orderingArray(actual["lifecycleLedger"])
	for index := range wantRetired {
		want, _ := orderingMap(wantRetired[index])
		got, ok := orderingMap(gotRetired[index])
		if !ok || !reflect.DeepEqual(want["key"], got["key"]) || !reflect.DeepEqual(want["generation"], got["generation"]) {
			return fmt.Errorf("ordering: retiredChildren[%d] key/generation mismatch", index)
		}
		wantState, _ := orderingMap(want["state"])
		if mounted, _ := wantState["Mounted"].(bool); mounted {
			return fmt.Errorf("ordering: expected retired child is still mounted")
		}
		if pending, _ := wantState["Pending"].(bool); pending {
			return fmt.Errorf("ordering: expected retired child still has a pending request")
		}
		key, _ := want["key"].(string)
		generation, _ := orderingInt(want["generation"])
		if err := orderingCheckRetiredLifecycle(key, generation, lifecycle, expectedEvents, actualEvents); err != nil {
			return err
		}
	}
	return nil
}

func orderingCheckRetiredLifecycle(key string, generation int64, lifecycle, expectedEvents, actualEvents []any) error {
	var update, unmounted, rendererUnmount, cancelCall, cancel *map[string]any
	for _, value := range lifecycle {
		row, _ := orderingMap(value)
		rowKey, _ := row["key"].(string)
		rowGeneration, _ := orderingInt(row["generation"])
		if rowKey != key || rowGeneration != generation {
			continue
		}
		switch row["kind"] {
		case "go-update-unmount":
			copy := row
			update = &copy
		case "go-unmounted-commit":
			copy := row
			unmounted = &copy
		case "renderer-unmount":
			copy := row
			rendererUnmount = &copy
		case "transport-cancel-call":
			copy := row
			cancelCall = &copy
		case "transport-cancel":
			copy := row
			cancel = &copy
		}
	}
	if update == nil || unmounted == nil || rendererUnmount == nil {
		return fmt.Errorf("ordering: lifecycleLedger missing unmount retirement sequence for %s:g%d", key, generation)
	}
	updateSequence, _ := orderingInt((*update)["sequence"])
	unmountedSequence, _ := orderingInt((*unmounted)["sequence"])
	rendererSequence, _ := orderingInt((*rendererUnmount)["sequence"])
	if !(updateSequence < unmountedSequence && unmountedSequence < rendererSequence) {
		return fmt.Errorf("ordering: retirement lifecycle order mismatch for %s:g%d", key, generation)
	}
	if mounted, ok := orderingBool((*unmounted)["mounted"]); !ok || mounted {
		return fmt.Errorf("ordering: retired child %s:g%d has mounted state", key, generation)
	}
	if pending, ok := orderingBool((*unmounted)["pending"]); !ok || pending {
		return fmt.Errorf("ordering: retired child %s:g%d still pending at unmount", key, generation)
	}
	if cancelCall != nil || cancel != nil {
		if cancelCall == nil || cancel == nil {
			return fmt.Errorf("ordering: incomplete transport cancellation during retirement of %s:g%d", key, generation)
		}
		callSequence, _ := orderingInt((*cancelCall)["sequence"])
		cancelSequence, _ := orderingInt((*cancel)["sequence"])
		if !(unmountedSequence < callSequence && callSequence < cancelSequence && cancelSequence < rendererSequence) {
			return fmt.Errorf("ordering: retirement cancellation order mismatch for %s:g%d", key, generation)
		}
		if !orderingSameCorrelation((*cancelCall)["correlation"], (*cancel)["correlation"]) {
			return fmt.Errorf("ordering: retirement transport cancel correlation mismatch for %s:g%d", key, generation)
		}
	}
	return nil
}

func orderingCheckSwaps(actual map[string]any, events []any, profile string) error {
	initial := ""
	if strings.HasPrefix(profile, "direct.") {
		initial = strings.TrimPrefix(profile, "direct.")
	} else if profile == "browser.swap" {
		initial = "dom"
	} else {
		initial = strings.TrimPrefix(profile, "browser.")
	}
	swaps := make([]int, 0)
	for index, value := range events {
		row, _ := orderingMap(value)
		source, _ := orderingMap(row["sourceEvent"])
		if source["kind"] == "renderer-swap" {
			swaps = append(swaps, index)
		}
	}
	if profile == "browser.dom" || profile == "browser.react" {
		browserSwaps, ok := orderingArray(actual["rendererSwaps"])
		if !ok || len(browserSwaps) != 0 {
			return fmt.Errorf("ordering: fixed browser profile must not report rendererSwaps")
		}
		for _, name := range []string{"backend", "backendStart", "backendEnd", "rendererBackend"} {
			value, _ := actual[name].(string)
			if value != initial {
				return fmt.Errorf("ordering: fixed browser profile %s mismatch", name)
			}
		}
		if actual["failure"] != nil {
			return fmt.Errorf("ordering: fixed browser profile reports failure")
		}
		return nil
	}
	if profile == "browser.swap" {
		if actual["backend"] != "dom" || actual["backendStart"] != "dom" {
			return fmt.Errorf("ordering: browser.swap initial backend mismatch")
		}
		browserSwaps, ok := orderingArray(actual["rendererSwaps"])
		if !ok || len(browserSwaps) != len(swaps) {
			return fmt.Errorf("ordering: rendererSwaps length mismatch: expected %d, got %d", len(swaps), orderingLength(actual["rendererSwaps"]))
		}
		currentEpoch := int64(1)
		for position, index := range swaps {
			sourceRow, _ := orderingMap(events[index])
			source, _ := orderingMap(sourceRow["sourceEvent"])
			to, _ := source["to"].(string)
			row, _ := orderingMap(browserSwaps[position])
			from, _ := row["from"].(string)
			actualTo, _ := row["to"].(string)
			if from != initial || actualTo != to {
				return fmt.Errorf("ordering: rendererSwaps[%d] from/to mismatch", position)
			}
			if row["eventIndex"] == nil || !reflect.DeepEqual(row["eventIndex"], sourceRow["eventIndex"]) {
				return fmt.Errorf("ordering: rendererSwaps[%d].eventIndex mismatch", position)
			}
			unchanged, _ := orderingBool(row["snapshotUnchanged"])
			before, beforeOK := orderingInt(row["rendererEpochBefore"])
			after, afterOK := orderingInt(row["rendererEpochAfter"])
			if before != currentEpoch || from != to {
				currentEpoch++
			}
			if !unchanged || !beforeOK || !afterOK || before != currentEpoch-(boolToInt(from != to)) || after != currentEpoch {
				return fmt.Errorf("ordering: rendererSwaps[%d] did not preserve snapshot and advance epoch", position)
			}
			eventResult, _ := orderingMap(sourceRow["result"])
			if eventResult["from"] != from || eventResult["to"] != to {
				return fmt.Errorf("ordering: events[%d].result disagrees with rendererSwaps", index)
			}
			if got, ok := orderingInt(eventResult["rendererEpoch"]); !ok || got != after {
				return fmt.Errorf("ordering: events[%d].result.rendererEpoch mismatch", index)
			}
			initial = to
		}
		if actual["backendEnd"] != initial || actual["rendererBackend"] != initial {
			return fmt.Errorf("ordering: browser.swap final backend mismatch")
		}
		if actual["failure"] != nil {
			return fmt.Errorf("ordering: browser.swap reports failure")
		}
		return nil
	}

	currentEpoch := int64(1)
	for _, index := range swaps {
		event, _ := orderingMap(events[index])
		source, _ := orderingMap(event["sourceEvent"])
		result, _ := orderingMap(event["result"])
		to, _ := source["to"].(string)
		from, _ := result["from"].(string)
		actualTo, _ := result["to"].(string)
		if from != initial || actualTo != to {
			return fmt.Errorf("ordering: events[%d].result swap from/to mismatch", index)
		}
		if from != to {
			currentEpoch++
		}
		if got, ok := orderingInt(result["rendererEpoch"]); !ok || got != currentEpoch {
			return fmt.Errorf("ordering: events[%d].result.rendererEpoch mismatch", index)
		}
		initial = to
	}
	if profile == "direct.dom" || profile == "direct.react" {
		if actual["backend"] != strings.TrimPrefix(profile, "direct.") || actual["rendererBackend"] != "memory" {
			return fmt.Errorf("ordering: direct profile backend mismatch")
		}
		trace, ok := orderingMap(actual["trace"])
		if !ok {
			return fmt.Errorf("ordering: direct profile trace missing")
		}
		wantEpoch := int64(1)
		base := strings.TrimPrefix(profile, "direct.")
		for _, index := range swaps {
			event, _ := orderingMap(events[index])
			source, _ := orderingMap(event["sourceEvent"])
			to, _ := source["to"].(string)
			if base != to {
				wantEpoch++
			}
			base = to
		}
		if got, ok := orderingInt(trace["rendererEpoch"]); !ok || got != wantEpoch {
			return fmt.Errorf("ordering: trace.rendererEpoch mismatch")
		}
		if trace["failure"] != nil {
			return fmt.Errorf("ordering: direct profile reports failure")
		}
	}
	return nil
}

func boolToInt(value bool) int64 {
	if value {
		return 1
	}
	return 0
}

func orderingSequences(values []any, path string, contiguous bool) error {
	last := int64(-1)
	for index, value := range values {
		row, ok := orderingMap(value)
		if !ok {
			return fmt.Errorf("ordering: %s[%d] must be an object", path, index)
		}
		sequence, ok := orderingInt(row["sequence"])
		if !ok || sequence <= last || (contiguous && sequence != int64(index)) {
			return fmt.Errorf("ordering: %s[%d].sequence mismatch", path, index)
		}
		last = sequence
	}
	return nil
}

func orderingPendingHas(pending []any, token string) bool {
	for _, value := range pending {
		row, _ := orderingMap(value)
		if row["token"] == token {
			return true
		}
	}
	return false
}

func orderingContainsInt(values []any, target int64) bool {
	for _, value := range values {
		if got, ok := orderingInt(value); ok && got == target {
			return true
		}
	}
	return false
}

func orderingArray(value any) ([]any, bool) {
	values, ok := value.([]any)
	return values, ok
}

func orderingMap(value any) (map[string]any, bool) {
	row, ok := value.(map[string]any)
	return row, ok
}

func orderingBool(value any) (bool, bool) {
	result, ok := value.(bool)
	return result, ok
}

func orderingInt(value any) (int64, bool) {
	switch number := value.(type) {
	case json.Number:
		parsed, err := number.Int64()
		return parsed, err == nil
	case int:
		return int64(number), true
	case int32:
		return int64(number), true
	case int64:
		return number, true
	case uint:
		if uint64(number) > uint64(^uint64(0)>>1) {
			return 0, false
		}
		return int64(number), true
	case uint64:
		if number > uint64(^uint64(0)>>1) {
			return 0, false
		}
		return int64(number), true
	case float64:
		if number != float64(int64(number)) {
			return 0, false
		}
		return int64(number), true
	default:
		return 0, false
	}
}

func orderingLength(value any) int {
	values, ok := orderingArray(value)
	if !ok {
		return -1
	}
	return len(values)
}
