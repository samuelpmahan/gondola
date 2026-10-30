package main

import (
	"strings"
	"testing"
)

func TestFailureLineKeepsLoneSurrogatesOnOneLine(t *testing.T) {
	line := failureLine("case-00001", "<p>\xed\xa0\x80\n</p>", "<p>\xef\xbf\xbd</p>")
	if strings.ContainsAny(line, "\n\r") || !strings.HasPrefix(line, "ERROR case-00001 want ") {
		t.Fatalf("bad line %q", line)
	}
	if !strings.Contains(line, "\\ud800\\n") || !strings.Contains(line, " got \"<p>\\ufffd</p>\"") {
		t.Errorf("surrogate or got missing: %s", line)
	}
}

func TestSummaryLine(t *testing.T) {
	if got := summaryLine(5000, 0); got != "same over 5000 inputs" {
		t.Error(got)
	}
	if got := summaryLine(5000, 3); got != "3 of 5000 inputs differ" {
		t.Error(got)
	}
}

func TestOrderedReceiptKeepsFieldOrder(t *testing.T) {
	text := string(orderedReceipt(map[string]any{"react": "1", "reactDom": "1", "fastCheck": "2", "seed": 7, "cases": 9,
		"casesSha256": "a", "verdictSha256": "b", "verdict": "same over 9 inputs"}))
	if !strings.HasPrefix(text, "{\n  \"react\": \"1\",\n  \"reactDom\"") || !strings.HasSuffix(text, "\"same over 9 inputs\"\n}\n") {
		t.Errorf("unexpected receipt:\n%s", text)
	}
}
