package main

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestMountBoundaryCLIEmitsGoOwnedStatesAndEffects(t *testing.T) {
	var output bytes.Buffer
	if err := runMountBoundaries(&output); err != nil {
		t.Fatal(err)
	}
	var result mountBoundaryOutput
	if err := json.Unmarshal(output.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Schema != mountBoundarySchema || len(result.Cases) != 10 {
		t.Fatalf("boundary schema/case count = %q/%d", result.Schema, len(result.Cases))
	}
	accepted := map[string]bool{"max-safe": true, "max-safe-cancel-retry": true}
	for _, testCase := range result.Cases {
		wantSteps := 1
		switch testCase.Name {
		case "max-safe":
			wantSteps = 3
		case "max-safe-cancel-retry":
			wantSteps = 5
		}
		if len(testCase.Steps) != wantSteps || testCase.Steps[0].Message != "mount" || testCase.Steps[0].Arg != testCase.Arg {
			t.Fatalf("case %q steps = %#v", testCase.Name, testCase.Steps)
		}
		if accepted[testCase.Name] {
			if !testCase.Steps[0].State.Mounted || testCase.Steps[0].State.Generation != 9007199254740991 {
				t.Fatalf("max-safe mount state = %#v", testCase.Steps[0].State)
			}
			if !testCase.Steps[1].State.Pending || testCase.Steps[1].State.Token != "a:g9007199254740991:r1" ||
				len(testCase.Steps[1].Effects) != 1 || testCase.Steps[1].Effects[0].Kind != "fixture.request" {
				t.Fatalf("max-safe request step = %#v", testCase.Steps[1])
			}
			if testCase.Name == "max-safe" {
				if testCase.Steps[2].State.Pending || testCase.Steps[2].State.Reply != "a:g9007199254740991:r1" || len(testCase.Steps[2].Effects) != 0 {
					t.Fatalf("max-safe reply step = %#v", testCase.Steps[2])
				}
			} else if testCase.Steps[2].State.Pending || testCase.Steps[2].State.RequestID != 1 ||
				len(testCase.Steps[2].Effects) != 1 || testCase.Steps[2].Effects[0].Kind != "lifecycle.cancel" ||
				!testCase.Steps[3].State.Pending || testCase.Steps[3].State.Token != "a:g9007199254740991:r2" ||
				len(testCase.Steps[3].Effects) != 1 || testCase.Steps[3].Effects[0].Kind != "fixture.request" ||
				testCase.Steps[4].State.Pending || testCase.Steps[4].State.Reply != "a:g9007199254740991:r2" {
				t.Fatalf("max-safe cancel/retry steps = %#v", testCase.Steps[2:])
			}
		} else {
			if testCase.Steps[0].State.Mounted || testCase.Steps[0].State.Generation != 0 || len(testCase.Steps[0].Effects) != 0 {
				t.Fatalf("invalid mount case %q changed Go state: %#v", testCase.Name, testCase.Steps[0])
			}
		}
	}
}
