package qualificationarchive

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/backendqualification"
)

func TestCertificateEqualUsesSemanticProbeExceptionJSON(t *testing.T) {
	left := backendqualification.Certificate{
		Schema:       "gobi.backend-qualification-certificate/v1",
		SourceCommit: "77f7ce36439f1ae457a397269ea5a8c6d2db1cb2",
		Qualified:    true,
		Results: []backendqualification.CertificateResult{{
			ID:                   "healthy-react",
			Backend:              "react",
			Fault:                "none",
			ExpectedChannels:     []string{},
			AllowedChannels:      []string{},
			ChannelRule:          "exact",
			ObservedChannels:     []string{},
			ProbeException:       json.RawMessage(`{"ok":true,"details":{"count":1,"label":"ready"}}`),
			InfrastructureErrors: []string{},
			PageErrors:           []string{},
			Passed:               true,
		}},
	}
	right := left
	right.Results = cloneCertificateResults(left.Results)
	right.Results[0].ProbeException = json.RawMessage(" { \"details\" : {\"label\":\"ready\",\"count\":1.0}, \"ok\":true } ")
	if !certificateEqual(left, right) {
		t.Fatal("certificate equality should ignore JSON whitespace, object order, and equivalent numeric spellings")
	}
	right.Results[0].ProbeException = json.RawMessage(`{"ok":true,"details":{"count":2,"label":"ready"}}`)
	if certificateEqual(left, right) {
		t.Fatal("certificate equality accepted a changed probe exception")
	}
	duplicate := json.RawMessage(`{"ok":true,"ok":true}`)
	if equalJSONSemantics(duplicate, duplicate) {
		t.Fatal("semantic JSON equality accepted duplicate object keys")
	}
	right = left
	right.Results = cloneCertificateResults(left.Results)
	right.Results[0].ProbeException = json.RawMessage(`{"ok":true,"details":{"count":1,"label":"ready"},"producerExtra":"value"}`)
	if certificateEqual(left, right) {
		t.Fatal("certificate equality dropped an extra probe exception field")
	}
	right = left
	right.Results = cloneCertificateResults(left.Results)
	right.Results[0].EventsObserved = 1
	if certificateEqual(left, right) {
		t.Fatal("certificate equality accepted a changed measured field")
	}
}

func TestStrictCertificateJSONRejectsDuplicateKeys(t *testing.T) {
	var target struct {
		Schema string `json:"schema"`
	}
	if err := decodeStrictJSON([]byte(`{"schema":"one","schema":"two"}`), &target); err == nil {
		t.Fatal("strict certificate JSON accepted a duplicate field")
	}
	var certificate backendqualification.Certificate
	if err := decodeStrictJSON([]byte(`{"schema":"gobi.backend-qualification-certificate/v1","sourceCommit":"77f7ce36439f1ae457a397269ea5a8c6d2db1cb2","qualified":true,"results":[],"unknown":1}`), &certificate); err == nil {
		t.Fatal("strict certificate JSON accepted an unknown top-level field")
	}
}

func TestVerifyReferencesBindBytesAndAttemptPath(t *testing.T) {
	root := t.TempDir()
	attempt := "attempt-20261031T181327827Z-18"
	rel := filepath.Join("qualification", "qualification.raw.json")
	body := []byte(`{"schema":"gobi.backend-qualification-run/v1"}`)
	if err := os.MkdirAll(filepath.Join(root, "qualification"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, rel), body, 0o600); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(body)
	sha := hex.EncodeToString(digest[:])
	path := "backend-qualification/output/attempts/" + attempt + "/qualification/qualification.raw.json"
	ref := &fileReference{Path: &path, Bytes: int64Pointer(int64(len(body))), SHA256: &sha}
	if err := verifyAttemptReferenceFromDisk(root, attempt, ref, "qualification/qualification.raw.json"); err != nil {
		t.Fatalf("valid attempt reference rejected: %v", err)
	}

	wrongSHA := strings.Repeat("0", 64)
	badHash := *ref
	badHash.SHA256 = &wrongSHA
	if err := verifyAttemptReferenceFromDisk(root, attempt, &badHash, "qualification/qualification.raw.json"); err == nil {
		t.Fatal("reference with a wrong SHA-256 was accepted")
	}
	wrongAttemptPath := "backend-qualification/output/attempts/attempt-other/qualification/qualification.raw.json"
	badAttempt := *ref
	badAttempt.Path = &wrongAttemptPath
	if err := verifyAttemptReferenceFromDisk(root, attempt, &badAttempt, "qualification/qualification.raw.json"); err == nil {
		t.Fatal("reference from another attempt was accepted")
	}
	traversalPath := "backend-qualification/output/attempts/" + attempt + "/qualification/../../source/evil"
	badTraversal := *ref
	badTraversal.Path = &traversalPath
	if err := verifyAttemptReferenceFromDisk(root, attempt, &badTraversal, ""); err == nil {
		t.Fatal("attempt reference path traversal was accepted")
	}
}

func TestSourcePinComparisonAndPathValidation(t *testing.T) {
	bytesA := int64(5)
	shaA := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	a := sourcePinMap{"fixtures/app.go": {Bytes: &bytesA, SHA256: &shaA}}
	b := sourcePinMap{"fixtures/app.go": {Bytes: &bytesA, SHA256: &shaA}}
	if !sourcePinMapsEqual(a, b) {
		t.Fatal("identical source pin maps did not compare equal")
	}
	otherSHA := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	b["fixtures/app.go"] = filePin{Bytes: &bytesA, SHA256: &otherSHA}
	if sourcePinMapsEqual(a, b) {
		t.Fatal("source pin comparison ignored a different digest")
	}
	for _, path := range []string{"../outside", "/absolute", `a\\b`, "a/../../b", "a/./b", "a:\\x"} {
		if isSafeRelativePath(path) {
			t.Errorf("unsafe path %q was accepted", path)
		}
	}
	for _, path := range []string{"source.go", "fixtures/compiled/publications/app.go"} {
		if !isSafeRelativePath(path) {
			t.Errorf("valid relative path %q was rejected", path)
		}
	}
}

func int64Pointer(value int64) *int64 { return &value }
