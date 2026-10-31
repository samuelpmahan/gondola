package modulequalification

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

const archiveFixtureCommit = "7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0"

type archiveFixtureFile struct {
	path     string
	data     []byte
	typeflag byte
}

type archiveFixtureManifest struct {
	Schema                   string                 `json:"schema"`
	SourceCommit             string                 `json:"sourceCommit"`
	VerifierGitHead          string                 `json:"verifierGitHead"`
	VerifierGitDirty         bool                   `json:"verifierGitDirty"`
	VerifierSourcePinsMatch  bool                   `json:"verifierSourcePinsMatch"`
	Members                  []archiveFixtureMember `json:"members"`
	Archive                  archiveFixtureArchive  `json:"archive"`
	SourcePinsBefore         map[string]archivePin  `json:"sourcePinsBefore"`
	ArchivedSnapshotVerified bool                   `json:"archivedSnapshotVerified"`
}

type archiveFixtureMember struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type archiveFixtureArchive struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type archivePin struct {
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

func makeArchiveFixture(t *testing.T, input []archiveFixtureFile, listedPaths []string, editManifest func(*archiveFixtureManifest), editTar func(*tar.Writer) error) (archivePath, manifestPath, dest string) {
	t.Helper()
	root := t.TempDir()
	archivePath = filepath.Join(root, "runtime.tar.gz")
	manifestPath = filepath.Join(root, "runtime.manifest.json")
	dest = filepath.Join(root, "restored")

	files := append([]archiveFixtureFile(nil), input...)
	content := make(map[string][]byte, len(files)+2)
	for _, file := range files {
		content[file.path] = file.data
	}
	if _, exists := content["execution-before-archive.json"]; !exists {
		pinData := []byte("module/source fixture\n")
		sourcePins := map[string]archivePin{"fixtures/module.go": {Bytes: int64(len(pinData)), SHA256: fixtureDigestHex(pinData)}}
		snapshot, err := json.Marshal(map[string]any{
			"schema":                      "gobi.compiled-modules-execution-snapshot/v1",
			"sourceCommit":                archiveFixtureCommit,
			"verifierGitHead":             archiveFixtureCommit,
			"verifierGitDirty":            false,
			"verifierSourcePinsMatch":     true,
			"verifierSourcePinMismatches": []string{},
			"sourcePins":                  sourcePins,
			"commands":                    []any{},
			"moduleCounts":                map[string]int{"fixedEvents": 0},
		})
		if err != nil {
			t.Fatal(err)
		}
		files = append(files,
			archiveFixtureFile{path: "source/fixtures/module.go", data: pinData, typeflag: tar.TypeReg},
			archiveFixtureFile{path: "execution-before-archive.json", data: snapshot, typeflag: tar.TypeReg},
		)
		content["source/fixtures/module.go"] = pinData
		content["execution-before-archive.json"] = snapshot
	}
	if listedPaths == nil {
		for _, file := range files {
			listedPaths = append(listedPaths, file.path)
		}
	}
	listedPaths = append([]string(nil), listedPaths...)
	sort.Strings(listedPaths)

	manifest := archiveFixtureManifest{
		Schema:                   "gobi.compiled-modules-archive-manifest/v1",
		SourceCommit:             archiveFixtureCommit,
		VerifierGitHead:          archiveFixtureCommit,
		VerifierSourcePinsMatch:  true,
		SourcePinsBefore:         map[string]archivePin{"fixtures/module.go": {Bytes: int64(len(content["source/fixtures/module.go"])), SHA256: fixtureDigestHex(content["source/fixtures/module.go"])}},
		ArchivedSnapshotVerified: true,
	}
	for _, path := range listedPaths {
		data, exists := content[path]
		if !exists {
			data = []byte("listed-but-not-in-tar")
		}
		manifest.Members = append(manifest.Members, archiveFixtureMember{Path: path, Bytes: int64(len(data)), SHA256: fixtureDigestHex(data)})
	}
	if editManifest != nil {
		editManifest(&manifest)
	}

	archiveFile, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(archiveFile)
	tarWriter := tar.NewWriter(gz)
	for _, file := range files {
		typeflag := file.typeflag
		if typeflag == 0 {
			typeflag = tar.TypeReg
		}
		header := &tar.Header{Name: file.path, Typeflag: typeflag, Mode: 0o600, Format: tar.FormatPAX}
		if typeflag == tar.TypeReg || typeflag == tar.TypeRegA {
			header.Size = int64(len(file.data))
		} else {
			header.Linkname = string(file.data)
		}
		if err := tarWriter.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if typeflag == tar.TypeReg || typeflag == tar.TypeRegA {
			if _, err := tarWriter.Write(file.data); err != nil {
				t.Fatal(err)
			}
		}
	}
	if editTar != nil {
		if err := editTar(tarWriter); err != nil {
			t.Fatal(err)
		}
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	if err := archiveFile.Close(); err != nil {
		t.Fatal(err)
	}
	archiveBytes, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	manifest.Archive = archiveFixtureArchive{Path: archivePath, Bytes: int64(len(archiveBytes)), SHA256: fixtureDigestHex(archiveBytes)}
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manifestPath, manifestBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	return archivePath, manifestPath, dest
}

func fixtureDigestHex(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func rewriteArchivePin(t *testing.T, archivePath, manifestPath string) {
	t.Helper()
	archiveBytes, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	var manifest archiveFixtureManifest
	if err := DecodeStrict(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	manifest.Archive.Bytes = int64(len(archiveBytes))
	manifest.Archive.SHA256 = fixtureDigestHex(archiveBytes)
	updated, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manifestPath, updated, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestVerifyArchiveExtractsExactManifestAndReportsCompressedBytes(t *testing.T) {
	archivePath, manifestPath, dest := makeArchiveFixture(t, []archiveFixtureFile{{path: "builds/react-parent/result.json", data: []byte(`{"ok":true}`)}}, nil, nil, nil)
	report, err := VerifyArchive(archivePath, manifestPath, dest)
	if err != nil {
		t.Fatal(err)
	}
	archiveInfo, err := os.Stat(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	if report.Members != 3 {
		t.Fatalf("Members = %d, want three regular members", report.Members)
	}
	if report.Bytes != archiveInfo.Size() {
		t.Fatalf("Bytes = %d, want compressed archive bytes %d", report.Bytes, archiveInfo.Size())
	}
	if report.SourceCommit != archiveFixtureCommit {
		t.Fatalf("SourceCommit = %q", report.SourceCommit)
	}
	for path, want := range map[string]string{
		"builds/react-parent/result.json": `{"ok":true}`,
		"source/fixtures/module.go":       "module/source fixture\n",
	} {
		got, err := os.ReadFile(filepath.Join(dest, filepath.FromSlash(path)))
		if err != nil || string(got) != want {
			t.Fatalf("extracted %s = %q, %v; want %q", path, got, err, want)
		}
	}
	if _, err := os.Stat(filepath.Join(dest, "source", "unlisted.txt")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("unexpected path exists: %v", err)
	}
}

func TestVerifyArchiveRejectsMalformedMembersWithoutPublishingDestination(t *testing.T) {
	tests := []struct {
		name         string
		files        []archiveFixtureFile
		listed       []string
		editManifest func(*archiveFixtureManifest)
		editTar      func(*tar.Writer) error
	}{
		{
			name:  "manifest hash mismatch",
			files: []archiveFixtureFile{{path: "source/fixtures/module.go", data: []byte("module/source fixture\n")}},
			editManifest: func(m *archiveFixtureManifest) {
				for index := range m.Members {
					if m.Members[index].Path == "source/fixtures/module.go" {
						m.Members[index].SHA256 = strings.Repeat("0", 64)
					}
				}
			},
		},
		{
			name:  "manifest member byte count mismatch",
			files: []archiveFixtureFile{{path: "builds/dom-parent/result.json", data: []byte(`{"status":"ok"}`)}},
			editManifest: func(m *archiveFixtureManifest) {
				for index := range m.Members {
					if m.Members[index].Path == "builds/dom-parent/result.json" {
						m.Members[index].Bytes++
					}
				}
			},
		},
		{
			name:  "source pin digest mismatch",
			files: []archiveFixtureFile{{path: "source/fixtures/module.go", data: []byte("module/source fixture\n")}},
			editManifest: func(m *archiveFixtureManifest) {
				pin := m.SourcePinsBefore["fixtures/module.go"]
				pin.SHA256 = strings.Repeat("f", 64)
				m.SourcePinsBefore["fixtures/module.go"] = pin
			},
		},
		{name: "manifest path traversal", files: []archiveFixtureFile{{path: "../escape", data: []byte("x")}}},
		{
			name:   "missing listed member",
			files:  []archiveFixtureFile{{path: "source/fixtures/module.go", data: []byte("module/source fixture\n")}},
			listed: []string{"execution-before-archive.json", "source/fixtures/module.go", "unlisted.txt"},
		},
		{
			name:   "extra unlisted member",
			files:  []archiveFixtureFile{{path: "source/fixtures/module.go", data: []byte("module/source fixture\n")}, {path: "surprise.txt", data: []byte("x")}},
			listed: []string{"execution-before-archive.json", "source/fixtures/module.go"},
		},
		{
			name:  "unpinned archived source member",
			files: []archiveFixtureFile{{path: "source/fixtures/module.go", data: []byte("module/source fixture\n")}, {path: "source/fixtures/extra.go", data: []byte("extra source\n")}},
		},
		{name: "symlink member", files: []archiveFixtureFile{{path: "source/fixtures/module.go", data: []byte("module/source fixture\n")}, {path: "link", data: []byte("source/fixtures/module.go"), typeflag: tar.TypeSymlink}}},
		{
			name:  "duplicate member",
			files: []archiveFixtureFile{{path: "source/fixtures/module.go", data: []byte("module/source fixture\n")}},
			editTar: func(writer *tar.Writer) error {
				data := []byte("module/source fixture\n")
				if err := writer.WriteHeader(&tar.Header{Name: "source/fixtures/module.go", Typeflag: tar.TypeReg, Mode: 0o600, Size: int64(len(data))}); err != nil {
					return err
				}
				_, err := writer.Write(data)
				return err
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			archivePath, manifestPath, dest := makeArchiveFixture(t, tc.files, tc.listed, tc.editManifest, tc.editTar)
			if _, err := VerifyArchive(archivePath, manifestPath, dest); err == nil {
				t.Fatal("VerifyArchive accepted malformed archive")
			}
			if _, err := os.Lstat(dest); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("failed verification published destination: %v", err)
			}
			assertNoArchiveStages(t, filepath.Dir(dest))
		})
	}
}

func TestVerifyArchiveRejectsExistingDestinationAndLeavesItUntouched(t *testing.T) {
	archivePath, manifestPath, dest := makeArchiveFixture(t, nil, nil, nil, nil)
	if err := os.Mkdir(dest, 0o700); err != nil {
		t.Fatal(err)
	}
	keep := filepath.Join(dest, "keep.txt")
	if err := os.WriteFile(keep, []byte("caller data"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyArchive(archivePath, manifestPath, dest); err == nil {
		t.Fatal("VerifyArchive replaced existing destination")
	}
	if got, err := os.ReadFile(keep); err != nil || string(got) != "caller data" {
		t.Fatalf("existing destination changed: %q %v", got, err)
	}
}

func TestVerifyArchiveCleansStageWhenDestinationAppearsDuringVerification(t *testing.T) {
	archivePath := os.Getenv("GOBI_MODULE_ARCHIVE")
	manifestPath := os.Getenv("GOBI_MODULE_MANIFEST")
	if archivePath == "" && manifestPath == "" {
		t.Skip("set GOBI_MODULE_ARCHIVE and GOBI_MODULE_MANIFEST to exercise publication cleanup against the captured archive")
	}
	if archivePath == "" || manifestPath == "" {
		t.Fatal("GOBI_MODULE_ARCHIVE and GOBI_MODULE_MANIFEST must be set together")
	}
	parent := t.TempDir()
	dest := filepath.Join(parent, "restored")
	const sentinel = "concurrently created destination"
	appearance := make(chan error, 1)
	go func() {
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			entries, err := os.ReadDir(parent)
			if err != nil {
				appearance <- err
				return
			}
			for _, entry := range entries {
				if !strings.HasPrefix(entry.Name(), ".module-qualification-archive-") {
					continue
				}
				if err := os.Mkdir(dest, 0o700); err != nil {
					appearance <- err
					return
				}
				if err := os.WriteFile(filepath.Join(dest, "keep.txt"), []byte(sentinel), 0o600); err != nil {
					appearance <- err
					return
				}
				appearance <- nil
				return
			}
			time.Sleep(100 * time.Microsecond)
		}
		appearance <- errors.New("did not observe archive staging directory")
	}()
	if _, err := VerifyArchive(archivePath, manifestPath, dest); err == nil {
		t.Fatal("VerifyArchive succeeded after a destination appeared during extraction")
	}
	if err := <-appearance; err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(dest, "keep.txt"))
	if err != nil || string(got) != sentinel {
		t.Fatalf("concurrently created destination changed: %q %v", got, err)
	}
	assertNoArchiveStages(t, parent)
}

func TestVerifyArchiveRejectsMissingRequiredManifestField(t *testing.T) {
	archivePath, manifestPath, dest := makeArchiveFixture(t, nil, nil, nil, nil)
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	missing := []byte(`"verifierGitDirty":false,`)
	if !bytes.Contains(data, missing) {
		t.Fatal("fixture does not contain verifierGitDirty field")
	}
	data = bytes.Replace(data, missing, nil, 1)
	if err := os.WriteFile(manifestPath, data, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyArchive(archivePath, manifestPath, dest); err == nil {
		t.Fatal("VerifyArchive accepted a missing required false-valued manifest field")
	}
	if _, err := os.Lstat(dest); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("manifest with missing field published destination: %v", err)
	}
}

func TestVerifyArchiveRejectsArchiveByteTruncation(t *testing.T) {
	archivePath, manifestPath, dest := makeArchiveFixture(t, nil, nil, nil, nil)
	archive, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(archivePath, archive[:len(archive)-8], 0o600); err != nil {
		t.Fatal(err)
	}
	rewriteArchivePin(t, archivePath, manifestPath)
	if _, err := VerifyArchive(archivePath, manifestPath, dest); err == nil {
		t.Fatal("VerifyArchive accepted a truncated gzip footer after the manifest hash was updated")
	}
	if _, err := os.Lstat(dest); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("truncated archive published destination: %v", err)
	}
	assertNoArchiveStages(t, filepath.Dir(dest))
}

func TestVerifyArchiveRejectsNonzeroTarTrailerAfterManifestRehash(t *testing.T) {
	archivePath, manifestPath, dest := makeArchiveFixture(t, nil, nil, nil, nil)
	original, err := os.Open(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	compressed, err := gzip.NewReader(original)
	if err != nil {
		t.Fatal(err)
	}
	tarBytes, err := io.ReadAll(compressed)
	if err != nil {
		t.Fatal(err)
	}
	if err := compressed.Close(); err != nil {
		t.Fatal(err)
	}
	if err := original.Close(); err != nil {
		t.Fatal(err)
	}
	badArchive, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	badGzip := gzip.NewWriter(badArchive)
	if _, err := badGzip.Write(tarBytes); err != nil {
		t.Fatal(err)
	}
	if _, err := badGzip.Write([]byte("nonzero trailing tar payload")); err != nil {
		t.Fatal(err)
	}
	if err := badGzip.Close(); err != nil {
		t.Fatal(err)
	}
	if err := badArchive.Close(); err != nil {
		t.Fatal(err)
	}
	rewriteArchivePin(t, archivePath, manifestPath)
	if _, err := VerifyArchive(archivePath, manifestPath, dest); err == nil {
		t.Fatal("VerifyArchive accepted nonzero bytes after the tar terminator with a matching archive hash")
	}
	if _, err := os.Lstat(dest); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("bad tar trailer published destination: %v", err)
	}
	assertNoArchiveStages(t, filepath.Dir(dest))
}

func TestVerifyArchiveRejectsConcatenatedGzipStreamAfterManifestRehash(t *testing.T) {
	archivePath, manifestPath, dest := makeArchiveFixture(t, nil, nil, nil, nil)
	secondPath := filepath.Join(filepath.Dir(archivePath), "second.gz")
	secondFile, err := os.Create(secondPath)
	if err != nil {
		t.Fatal(err)
	}
	second := gzip.NewWriter(secondFile)
	if _, err := second.Write([]byte("extra stream")); err != nil {
		t.Fatal(err)
	}
	if err := second.Close(); err != nil {
		t.Fatal(err)
	}
	if err := secondFile.Close(); err != nil {
		t.Fatal(err)
	}
	firstBytes, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	secondBytes, err := os.ReadFile(secondPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(archivePath, append(firstBytes, secondBytes...), 0o600); err != nil {
		t.Fatal(err)
	}
	rewriteArchivePin(t, archivePath, manifestPath)
	if _, err := VerifyArchive(archivePath, manifestPath, dest); err == nil {
		t.Fatal("VerifyArchive accepted a concatenated gzip stream with a matching archive hash")
	}
	if _, err := os.Lstat(dest); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("concatenated gzip stream published destination: %v", err)
	}
	assertNoArchiveStages(t, filepath.Dir(dest))
}

func assertNoArchiveStages(t *testing.T, parent string) {
	t.Helper()
	entries, err := os.ReadDir(parent)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".module-qualification-archive-") {
			t.Fatalf("failed verification left staging path %q", entry.Name())
		}
	}
}

func TestVerifyArchiveActualPublishedRuntime(t *testing.T) {
	archivePath := os.Getenv("GOBI_MODULE_ARCHIVE")
	manifestPath := os.Getenv("GOBI_MODULE_MANIFEST")
	if archivePath == "" && manifestPath == "" {
		t.Skip("set GOBI_MODULE_ARCHIVE and GOBI_MODULE_MANIFEST for published archive integration")
	}
	if archivePath == "" || manifestPath == "" {
		t.Fatal("GOBI_MODULE_ARCHIVE and GOBI_MODULE_MANIFEST must be set together")
	}
	expectedSource := os.Getenv("GOBI_MODULE_EXPECTED_SOURCE")
	if !commitPattern.MatchString(expectedSource) {
		t.Fatal("GOBI_MODULE_EXPECTED_SOURCE must be an independently selected 40-character lowercase commit when archive integration is enabled")
	}
	dest := filepath.Join(t.TempDir(), "restored")
	report, err := VerifyArchive(archivePath, manifestPath, dest)
	if err != nil {
		t.Fatal(err)
	}
	if report.SourceCommit != expectedSource || report.Members != 529 {
		t.Fatalf("unexpected published runtime report: %+v", report)
	}
	snapshotPath := filepath.Join(dest, "execution-before-archive.json")
	if info, err := os.Stat(snapshotPath); err != nil || info.Size() == 0 {
		t.Fatalf("root snapshot missing after verification: %v", err)
	}
	snapshotBytes, err := os.ReadFile(snapshotPath)
	if err != nil {
		t.Fatal(err)
	}
	var snapshot executionSnapshot
	if err := DecodeStrict(snapshotBytes, &snapshot); err != nil {
		t.Fatal(err)
	}
	if len(snapshot.SourcePins) != 147 {
		t.Fatalf("published source pin count = %d, want 147", len(snapshot.SourcePins))
	}
}
