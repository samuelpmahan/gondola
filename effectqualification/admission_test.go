package effectqualification

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHashInputsSortsFilesAndRejectsSymlinks(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "z.txt"), []byte("z"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "nested", "a.txt"), []byte("a"), 0o644); err != nil {
		t.Fatal(err)
	}
	pins, err := hashInputs(root)
	if err != nil {
		t.Fatalf("hash inputs: %v", err)
	}
	if len(pins) != 2 || pins[0].Path != "nested/a.txt" || pins[1].Path != "z.txt" {
		t.Fatalf("inventory must contain sorted normalized file paths, got %+v", pins)
	}

	if err := os.Symlink(filepath.Join(root, "z.txt"), filepath.Join(root, "link.txt")); err != nil {
		t.Fatal(err)
	}
	if _, err := hashInputs(root); err == nil || !strings.Contains(err.Error(), "link.txt") {
		t.Fatalf("inventory must reject symlink inputs with their path, got %v", err)
	}
}

func TestHashInputsRejectsSymlinkedRoot(t *testing.T) {
	parent := t.TempDir()
	root := filepath.Join(parent, "root")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	alias := filepath.Join(parent, "alias")
	if err := os.Symlink(root, alias); err != nil {
		t.Fatal(err)
	}
	if _, err := hashInputs(alias); err == nil {
		t.Fatal("root reached through a symbolic link was accepted")
	}
}

func TestReadSourceIdentityChecksEveryPinnedSourceByte(t *testing.T) {
	root := writeAdmissionSourceFixture(t)
	identity, pins, err := readSourceIdentity(root)
	if err != nil {
		t.Fatalf("read valid source identity: %v", err)
	}
	if identity.Head != admissionFixtureSourceCommit || identity.Dirty || !identity.SourcePinsMatch {
		t.Fatalf("unexpected source identity: %+v", identity)
	}
	if identity.SourcePinCount != 3 || len(pins) != 3 {
		t.Fatalf("expected three exact source pins, got identity=%+v pins=%d", identity, len(pins))
	}

	if err := os.WriteFile(filepath.Join(root, "source", "example.go"), []byte("package changed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, _, err := readSourceIdentity(root); err == nil || !strings.Contains(err.Error(), "source/example.go") {
		t.Fatalf("changed source bytes must fail with the pinned path, got %v", err)
	}
}

func TestReadSourceIdentityRejectsDisagreeingPinManifests(t *testing.T) {
	root := writeAdmissionSourceFixture(t)
	writeAdmissionJSON(t, filepath.Join(root, "metadata", "source-pins-after.json"), map[string]any{})
	if _, _, err := readSourceIdentity(root); err == nil || !strings.Contains(err.Error(), "source pin manifests") {
		t.Fatalf("disagreeing pin manifests must fail, got %v", err)
	}
}

func TestReadSourceIdentityAcceptsFreshInternallyConsistentCommit(t *testing.T) {
	root := writeAdmissionSourceFixture(t)
	freshHead := "0123456789abcdef0123456789abcdef01234567"
	for _, name := range []string{
		filepath.Join(root, "metadata", "git-source-closure.json"),
		filepath.Join(root, "metadata", "git-source-closure-after.json"),
		filepath.Join(root, "metadata", "runner-context.json"),
		filepath.Join(root, "execution-before-archive.json"),
	} {
		var value map[string]any
		data, err := os.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(data, &value); err != nil {
			t.Fatal(err)
		}
		if name == filepath.Join(root, "metadata", "git-source-closure.json") || name == filepath.Join(root, "metadata", "git-source-closure-after.json") {
			value["head"] = freshHead
		} else {
			value["sourceCommit"] = freshHead
			value["verifierGitHead"] = freshHead
		}
		writeAdmissionJSON(t, name, value)
	}
	identity, _, err := readSourceIdentity(root)
	if err != nil {
		t.Fatalf("fresh internally consistent source identity should be accepted: %v", err)
	}
	if identity.Head != freshHead {
		t.Fatalf("head = %q, want fresh source identity %q", identity.Head, freshHead)
	}
}

func TestRequiredEffectSourcePinsRejectMissingFixtureSource(t *testing.T) {
	pins := make([]namedSourcePin, 0, len(requiredEffectSourcePaths))
	for _, name := range requiredEffectSourcePaths {
		if name == "fixtures/compiled/effectmodulechild/app.go" {
			continue
		}
		pins = append(pins, namedSourcePin{path: name})
	}
	if err := requireEffectSourcePaths(pins); err == nil || !strings.Contains(err.Error(), "fixtures/compiled/effectmodulechild/app.go") {
		t.Fatalf("missing required effects fixture source must fail even when absent from the pin list, got %v", err)
	}
}

func TestBuildIndexEnvelopeAcceptsPR23FourBuildFixture(t *testing.T) {
	root := effectsQualificationInput(t)
	report, err := VerifyDirectory(root)
	if err != nil {
		t.Fatalf("VerifyDirectory rejected the real PR23 build envelope: %v", err)
	}
	if report.ABI.Status != "passed" || report.ABI.Builds != 4 || report.ABI.Pairs != 2 {
		t.Fatalf("expected the real four-build/two-pair ABI check, got %+v", report.ABI)
	}

	index := readAdmissionBuildIndex(t, root)
	if len(index) != 15 {
		t.Fatalf("PR23 build index has %d top-level keys, want 15", len(index))
	}
	var builds map[string]json.RawMessage
	if err := json.Unmarshal(index["builds"], &builds); err != nil {
		t.Fatal(err)
	}
	for _, profile := range effectBuildProfiles {
		var backend map[string]json.RawMessage
		if err := json.Unmarshal(builds[profile.backend], &backend); err != nil {
			t.Fatal(err)
		}
		var record map[string]json.RawMessage
		if err := json.Unmarshal(backend[profile.role], &record); err != nil {
			t.Fatal(err)
		}
		want := 12
		if profile.role == "parent" {
			want = 13
			if _, ok := record["keyedHelper"]; !ok {
				t.Fatalf("%s parent record is missing keyedHelper", profile.backend)
			}
		} else if _, ok := record["keyedHelper"]; ok {
			t.Fatalf("%s child record unexpectedly contains keyedHelper", profile.backend)
		}
		if len(record) != want {
			t.Fatalf("%s %s record has %d keys, want %d", profile.backend, profile.role, len(record), want)
		}
	}
}

func TestBuildIndexEnvelopeRejectsAliasesUnknownAndMissingFields(t *testing.T) {
	actualRoot := effectsQualificationInput(t)
	tests := []struct {
		name       string
		mutate     func(map[string]json.RawMessage)
		wantReason string
	}{
		{
			name: "case alias beside canonical key",
			mutate: func(index map[string]json.RawMessage) {
				index["ClosedEffectDescriptors"] = index["closedEffectDescriptors"]
			},
			wantReason: `unknown or incorrectly-cased field "ClosedEffectDescriptors"`,
		},
		{
			name: "unknown field",
			mutate: func(index map[string]json.RawMessage) {
				index["unrecognizedField"] = json.RawMessage(`true`)
			},
			wantReason: `unknown or incorrectly-cased field "unrecognizedField"`,
		},
		{
			name: "missing required semantic field",
			mutate: func(index map[string]json.RawMessage) {
				delete(index, "actualBuildCount")
			},
			wantReason: `missing required field "actualBuildCount"`,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			index := readAdmissionBuildIndex(t, actualRoot)
			tc.mutate(index)
			root := writeAdmissionBuildIndexOnly(t, index)
			err := checkEffectBuilds(root)
			if err == nil || !strings.Contains(err.Error(), tc.wantReason) {
				t.Fatalf("build index mutation must fail with %q, got %v", tc.wantReason, err)
			}
		})
	}
}

func TestBuildRecordEnvelopeRejectsAliasesAndUnknownFields(t *testing.T) {
	actualRoot := effectsQualificationInput(t)
	index := readAdmissionBuildIndex(t, actualRoot)
	var builds map[string]json.RawMessage
	if err := json.Unmarshal(index["builds"], &builds); err != nil {
		t.Fatal(err)
	}
	var react map[string]json.RawMessage
	if err := json.Unmarshal(builds["react"], &react); err != nil {
		t.Fatal(err)
	}
	var canonical map[string]json.RawMessage
	if err := json.Unmarshal(react["child"], &canonical); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name       string
		mutate     func(map[string]json.RawMessage)
		wantReason string
	}{
		{
			name: "case alias beside canonical key",
			mutate: func(record map[string]json.RawMessage) {
				record["OutputDir"] = record["outputDir"]
			},
			wantReason: `unknown or incorrectly-cased field "OutputDir"`,
		},
		{
			name: "unknown field",
			mutate: func(record map[string]json.RawMessage) {
				record["unrecognizedField"] = json.RawMessage(`true`)
			},
			wantReason: `unknown or incorrectly-cased field "unrecognizedField"`,
		},
		{
			name: "missing required semantic field",
			mutate: func(record map[string]json.RawMessage) {
				delete(record, "outputDir")
			},
			wantReason: `missing required field "outputDir"`,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			record := make(map[string]json.RawMessage, len(canonical)+1)
			for key, value := range canonical {
				record[key] = value
			}
			tc.mutate(record)
			raw, err := json.Marshal(record)
			if err != nil {
				t.Fatal(err)
			}
			_, err = checkOneEffectBuild(t.TempDir(), effectBuildProfiles[1], raw)
			if err == nil || !strings.Contains(err.Error(), tc.wantReason) {
				t.Fatalf("build record mutation must fail with %q, got %v", tc.wantReason, err)
			}
		})
	}

	var parent map[string]json.RawMessage
	if err := json.Unmarshal(react["parent"], &parent); err != nil {
		t.Fatal(err)
	}
	delete(parent, "keyedHelper")
	parentRaw, err := json.Marshal(parent)
	if err != nil {
		t.Fatal(err)
	}
	_, err = checkOneEffectBuild(t.TempDir(), effectBuildProfiles[0], parentRaw)
	if err == nil || !strings.Contains(err.Error(), `missing required field "keyedHelper"`) {
		t.Fatalf("parent build record must require keyedHelper, got %v", err)
	}
}

func readAdmissionBuildIndex(t *testing.T, root string) map[string]json.RawMessage {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, "builds", "build-index.json"))
	if err != nil {
		t.Fatalf("read actual PR23 build index: %v", err)
	}
	var index map[string]json.RawMessage
	if err := json.Unmarshal(data, &index); err != nil {
		t.Fatalf("decode actual PR23 build index: %v", err)
	}
	return index
}

func writeAdmissionBuildIndexOnly(t *testing.T, index map[string]json.RawMessage) string {
	t.Helper()
	root := t.TempDir()
	builds := filepath.Join(root, "builds")
	if err := os.MkdirAll(builds, 0o755); err != nil {
		t.Fatal(err)
	}
	writeAdmissionJSON(t, filepath.Join(builds, "build-index.json"), index)
	return root
}

func writeAdmissionSourceFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for _, dir := range []string{"metadata", "source"} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	contents := map[string][]byte{
		"example.go":    []byte("package example\n"),
		"EXPECTED.json": []byte("{\"seed\":20261030}\n"),
		"SHA256SUMS":    []byte("frozen M0 checksums\n"),
	}
	pins := make(map[string]map[string]any, len(contents))
	for name, data := range contents {
		if err := os.WriteFile(filepath.Join(root, "source", name), data, 0o644); err != nil {
			t.Fatal(err)
		}
		digest := sha256.Sum256(data)
		pins[name] = map[string]any{"bytes": len(data), "sha256": hex.EncodeToString(digest[:])}
	}
	writeAdmissionJSON(t, filepath.Join(root, "metadata", "source-pins-before.json"), pins)
	writeAdmissionJSON(t, filepath.Join(root, "metadata", "source-pins-after.json"), pins)
	writeAdmissionJSON(t, filepath.Join(root, "metadata", "git-source-closure.json"), map[string]any{
		"head": admissionFixtureSourceCommit, "dirty": false, "status": "", "sourcePinsMatch": true, "sourcePinMismatches": []string{},
	})
	writeAdmissionJSON(t, filepath.Join(root, "metadata", "git-source-closure-after.json"), map[string]any{
		"head": admissionFixtureSourceCommit, "dirty": false, "status": "",
	})
	writeAdmissionJSON(t, filepath.Join(root, "metadata", "runner-context.json"), map[string]any{
		"schema": "gobi.module-effects-run-context/v1", "sourceCommit": admissionFixtureSourceCommit,
		"verifierGitHead": admissionFixtureSourceCommit, "verifierGitDirty": false,
		"verifierSourcePinsMatch": true, "sourcePinMismatches": []string{},
	})
	writeAdmissionJSON(t, filepath.Join(root, "execution-before-archive.json"), map[string]any{
		"schema": "gobi.module-effects-execution-snapshot/v1", "sourceCommit": admissionFixtureSourceCommit,
		"verifierGitHead": admissionFixtureSourceCommit, "verifierGitDirty": false,
		"verifierSourcePinsMatch": true, "sourcePinMismatches": []string{}, "sourcePins": pins,
		"commands": []any{}, "counts": map[string]any{},
	})
	return root
}

func writeAdmissionJSON(t *testing.T, name string, value any) {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(name, append(data, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
}
