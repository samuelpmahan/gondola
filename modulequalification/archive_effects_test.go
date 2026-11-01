package modulequalification

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

const effectsFixtureCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

type effectsFixtureOptions struct {
	mutateManifest func(map[string]any)
	mutateSnapshot func(map[string]any)
}

type effectsFixture struct {
	archivePath  string
	manifestPath string
	dest         string
}

func makeEffectsArchiveFixture(t *testing.T, options effectsFixtureOptions) effectsFixture {
	t.Helper()
	root := t.TempDir()
	archivePath := filepath.Join(root, "effects.tar.gz")
	manifestPath := filepath.Join(root, "effects.manifest.json")
	dest := filepath.Join(root, "extracted")

	sourceFiles := map[string][]byte{
		"go.mod":                                 []byte("module example.invalid/effects\n\ngo 1.24\n"),
		"cmd/module-effects-native/main_test.go": []byte("package main\n"),
		"compiled-frontend/coordination/go.mod":  []byte("module example.invalid/compiler-tests\n\ngo 1.27.3\n"),
	}
	sourcePins := make(map[string]any, len(sourceFiles))
	members := make([]map[string]any, 0, len(sourceFiles)+1)
	for name, data := range sourceFiles {
		sourcePins[name] = effectsFixturePin(data)
		members = append(members, effectsFixtureMember("source/"+name, data))
	}

	scope := map[string]any{
		"directories":            []string{"cmd/module-effects-native"},
		"explicitFiles":          []string{"go.mod", "compiled-frontend/coordination/go.mod"},
		"rootGoSum":              map[string]any{"path": "go.sum", "present": false, "evidencePath": "go.mod", "reason": "root module has no external dependencies"},
		"excludedDirectoryNames": []string{".git", "coordination", "output"},
		"excludedFiles":          []string{},
		"excludedCompilerLogs":   true,
	}
	testFiles := []string{"cmd/module-effects-native/main_test.go"}
	snapshot := map[string]any{
		"schema":                  "gobi.module-effects-execution-snapshot/v1",
		"sourceCommit":            effectsFixtureCommit,
		"verifierGitHead":         effectsFixtureCommit,
		"verifierGitDirty":        false,
		"verifierSourcePinsMatch": true,
		"sourcePinMismatches":     []string{},
		"sourcePins":              sourcePins,
		"testSourceFilesPinned":   testFiles,
		"sourceClosureScope":      scope,
		"counts": map[string]any{
			"builds": 4,
			"conformance": map[string]any{
				"scenarios":    map[string]any{"literal": 1, "seed-20261104": 1, "seed-20261105": 1, "seed-20261106": 1},
				"nativeEvents": 1, "nativeStates": 1, "nativeEffects": 1, "nativeTransportEvents": 1,
				"nativeLifecycleEvents": 1, "retiredChildren": 1, "profileEvents": 1, "snapshots": 1,
				"profileTransportEvents": 1, "ledgerEvents": 1, "orderedLedgerEvents": 1, "effectLedgerEvents": 1,
				"lifecycleLedgerEvents": 1, "profileRetiredChildren": 1, "callOrderEvents": 1, "rendererSwaps": 1,
			},
			"nodeTests": 1, "conformanceCaptureMutationControls": 1, "buildAdmissionMutationControls": 1,
			"independentCaptureMutationControls": 1, "independentCaptureMutationControlApplications": 1,
		},
		"commands": []any{map[string]any{
			"name": "go-version", "command": "go", "args": []string{"version"}, "cwd": "/repo", "environment": map[string]string{},
			"startedAt": "2026-11-01T04:29:14.077Z", "completedAt": "2026-11-01T04:29:14.077Z",
			"exitCode": 0, "signal": nil, "spawnError": nil,
			"stdout": effectsFixturePin([]byte("go version go1.24.0 linux/amd64\n")), "stderr": effectsFixturePin(nil),
			"stdoutLog": nil, "stderrLog": nil,
		}},
	}
	if options.mutateSnapshot != nil {
		options.mutateSnapshot(snapshot)
	}
	snapshotBytes, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	members = append(members, effectsFixtureMember("execution-before-archive.json", snapshotBytes))

	archiveBytes := effectsFixtureTarGzip(t, members)
	if err := os.WriteFile(archivePath, archiveBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	manifestMembers := make([]map[string]any, 0, len(members))
	for _, member := range members {
		manifestMembers = append(manifestMembers, map[string]any{
			"path": member["path"], "bytes": member["bytes"], "sha256": member["sha256"],
		})
	}
	manifest := map[string]any{
		"schema":                  "gobi.module-effects-archive-manifest/v1",
		"sourceCommit":            effectsFixtureCommit,
		"verifierGitHead":         effectsFixtureCommit,
		"verifierGitDirty":        false,
		"verifierSourcePinsMatch": true,
		"sourcePinMismatches":     []string{},
		"testSourceFilesPinned":   testFiles,
		"sourceClosureScope":      scope,
		"excludedDuplicateLogs":   []any{},
		"excludedRegenerableBundles": []any{
			map[string]any{"path": "conformance/effects.literal.browser.bundle.mjs", "bytes": 1, "sha256": effectsFixtureSHA([]byte("a"))},
			map[string]any{"path": "conformance/effects.seed-20261104.browser.bundle.mjs", "bytes": 1, "sha256": effectsFixtureSHA([]byte("b"))},
			map[string]any{"path": "conformance/effects.seed-20261105.browser.bundle.mjs", "bytes": 1, "sha256": effectsFixtureSHA([]byte("c"))},
			map[string]any{"path": "conformance/effects.seed-20261106.browser.bundle.mjs", "bytes": 1, "sha256": effectsFixtureSHA([]byte("d"))},
		},
		"members":                  manifestMembers,
		"archive":                  map[string]any{"path": archivePath, "bytes": len(archiveBytes), "sha256": effectsFixtureSHA(archiveBytes)},
		"sourcePins":               sourcePins,
		"archivedSnapshotVerified": true,
	}
	if options.mutateManifest != nil {
		options.mutateManifest(manifest)
	}
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manifestPath, manifestBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	return effectsFixture{archivePath: archivePath, manifestPath: manifestPath, dest: dest}
}

func effectsFixtureTarGzip(t *testing.T, members []map[string]any) []byte {
	t.Helper()
	var compressed bytes.Buffer
	gz := gzip.NewWriter(&compressed)
	tarWriter := tar.NewWriter(gz)
	for _, item := range members {
		name := item["path"].(string)
		data := item["data"].([]byte)
		header := &tar.Header{Name: name, Mode: 0o600, Size: int64(len(data)), Typeflag: tar.TypeReg, Format: tar.FormatUSTAR}
		if err := tarWriter.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if _, err := tarWriter.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	return compressed.Bytes()
}

func effectsFixtureMember(name string, data []byte) map[string]any {
	pin := effectsFixturePin(data)
	return map[string]any{"path": name, "bytes": pin["bytes"], "sha256": pin["sha256"], "data": data}
}

func effectsFixturePin(data []byte) map[string]any {
	return map[string]any{"bytes": len(data), "sha256": effectsFixtureSHA(data)}
}

func effectsFixtureSHA(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func TestVerifyEffectsArchiveExtractsStrictModuleEffectsBundle(t *testing.T) {
	fixture := makeEffectsArchiveFixture(t, effectsFixtureOptions{})
	report, err := VerifyEffectsArchive(fixture.archivePath, fixture.manifestPath, fixture.dest)
	if err != nil {
		t.Fatal(err)
	}
	if report.SourceCommit != effectsFixtureCommit || report.Bytes <= 0 || report.Members != 4 {
		t.Fatalf("archive report = %#v, want commit %q and four members", report, effectsFixtureCommit)
	}
	for _, path := range []string{"source/go.mod", "source/cmd/module-effects-native/main_test.go", "source/compiled-frontend/coordination/go.mod", "execution-before-archive.json"} {
		if _, err := os.Stat(filepath.Join(fixture.dest, filepath.FromSlash(path))); err != nil {
			t.Errorf("verified extraction is missing %s: %v", path, err)
		}
	}
}

func TestVerifyArchiveDoesNotAcceptModuleEffectsSchema(t *testing.T) {
	fixture := makeEffectsArchiveFixture(t, effectsFixtureOptions{})
	if _, err := VerifyArchive(fixture.archivePath, fixture.manifestPath, fixture.dest); err == nil {
		t.Fatal("compiled-module archive verifier accepted the separate module-effects schema")
	}
	if _, err := os.Lstat(fixture.dest); !os.IsNotExist(err) {
		t.Fatalf("rejected archive published extraction destination: stat error %v", err)
	}
}

func TestVerifyEffectsArchiveRejectsFalseOrUnboundSnapshotClaims(t *testing.T) {
	tests := []struct {
		name    string
		options effectsFixtureOptions
	}{
		{
			name: "dirty verifier claim",
			options: effectsFixtureOptions{mutateManifest: func(manifest map[string]any) {
				manifest["verifierGitDirty"] = true
			}},
		},
		{
			name: "source pin mismatch claim",
			options: effectsFixtureOptions{mutateManifest: func(manifest map[string]any) {
				manifest["sourcePinMismatches"] = []string{"go.mod"}
			}},
		},
		{
			name: "snapshot source pins diverge from archived source",
			options: effectsFixtureOptions{mutateSnapshot: func(snapshot map[string]any) {
				pins := snapshot["sourcePins"].(map[string]any)
				pins["go.mod"] = map[string]any{"bytes": 1, "sha256": effectsFixtureSHA([]byte("x"))}
			}},
		},
		{
			name: "unknown snapshot field",
			options: effectsFixtureOptions{mutateSnapshot: func(snapshot map[string]any) {
				snapshot["producerSaysPassed"] = true
			}},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			fixture := makeEffectsArchiveFixture(t, test.options)
			if _, err := VerifyEffectsArchive(fixture.archivePath, fixture.manifestPath, fixture.dest); err == nil {
				t.Fatal("VerifyEffectsArchive accepted inconsistent module-effects archive evidence")
			}
			if _, err := os.Lstat(fixture.dest); !os.IsNotExist(err) {
				t.Fatalf("rejected archive published extraction destination: stat error %v", err)
			}
		})
	}
}
