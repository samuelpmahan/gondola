package build

import (
	"errors"
	"reflect"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func TestStageFailureDiagnosticsPreserveCauseOnlyWhenNoStageDiagnosticExists(t *testing.T) {
	cause := errors.New("describe module ABI failed")
	withFallback := stageFailureDiagnostics(nil, &stageFailure{err: cause})
	if len(withFallback) != 1 || withFallback[0].Code != "build.stage" || withFallback[0].Message != cause.Error() {
		t.Fatalf("empty stage diagnostics lost the stage cause: %#v", withFallback)
	}

	existing := []compilercontract.Diagnostic{{Code: "moduleabi.capability", Severity: "error", Message: "closed capability rejection"}}
	withOriginal := stageFailureDiagnostics(nil, &stageFailure{diagnostics: existing, err: cause})
	if len(withOriginal) != 1 || !reflect.DeepEqual(withOriginal[0], existing[0]) {
		t.Fatalf("existing stage diagnostic was replaced or supplemented: %#v", withOriginal)
	}
}
