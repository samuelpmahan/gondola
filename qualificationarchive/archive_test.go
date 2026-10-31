package qualificationarchive

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

const archiveTestCommit = "77f7ce36439f1ae457a397269ea5a8c6d2db1cb2"

type archiveTestManifest struct {
	Schema  string `json:"schema"`
	Policy  string `json:"policy"`
	Attempt string `json:"attempt"`
	Commit  string `json:"sourceCommit"`
	Members []struct {
		Path  string `json:"path"`
		Bytes int64  `json:"bytes"`
		SHA   string `json:"sha256"`
	} `json:"members"`
	Snapshot struct {
		Path  string `json:"path"`
		Bytes int64  `json:"bytes"`
		SHA   string `json:"sha256"`
	} `json:"preArchiveSnapshot"`
}

func writeArchiveFixture(t *testing.T, data map[string][]byte) (string, string, []byte, []byte) {
	t.Helper()

	snapshot, ok := data["execution-before-archive.json"]
	if !ok {
		snapshot = []byte(`{"schema":"gobi.backend-qualification-pre-archive-snapshot/v1","sourceCommit":"` + archiveTestCommit + `"}`)
		data["execution-before-archive.json"] = snapshot
	}

	paths := make([]string, 0, len(data))
	for path := range data {
		paths = append(paths, path)
	}
	sort.Strings(paths)

	manifest := archiveTestManifest{
		Schema:  "gobi.backend-qualification-archive/v1",
		Policy:  "explicit stable NUL-separated file inventory; no recursive tar traversal",
		Attempt: "attempt-20261031T181327827Z-18",
		Commit:  archiveTestCommit,
	}
	manifest.Snapshot.Path = "execution-before-archive.json"
	for _, path := range paths {
		body := data[path]
		digest := sha256.Sum256(body)
		row := struct {
			Path  string `json:"path"`
			Bytes int64  `json:"bytes"`
			SHA   string `json:"sha256"`
		}{Path: path, Bytes: int64(len(body)), SHA: hex.EncodeToString(digest[:])}
		manifest.Members = append(manifest.Members, row)
		if path == manifest.Snapshot.Path {
			manifest.Snapshot.Bytes = row.Bytes
			manifest.Snapshot.SHA = row.SHA
		}
	}
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}

	root := t.TempDir()
	manifestPath := filepath.Join(root, "runtime.manifest.json")
	archivePath := filepath.Join(root, "runtime.tar.gz")
	if err := os.WriteFile(manifestPath, manifestBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	archiveFile, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(archiveFile)
	tarWriter := tar.NewWriter(gz)
	for _, path := range paths {
		body := data[path]
		header := &tar.Header{Name: path, Mode: 0o600, Size: int64(len(body)), Typeflag: tar.TypeReg, Format: tar.FormatPAX}
		if err := tarWriter.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if _, err := tarWriter.Write(body); err != nil {
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
	return archivePath, manifestPath, archiveBytes, manifestBytes
}

func TestExtractVerifiesMembersAndCloseOwnsOnlyItsTempDirectory(t *testing.T) {
	data := map[string][]byte{
		"qualification/qualification.raw.json": []byte(`{"schema":"gobi.backend-qualification-run/v1"}`),
		"certificate/certificate.json":         []byte(`{"schema":"gobi.backend-qualification-certificate/v1"}`),
	}
	archivePath, manifestPath, archiveBytes, manifestBytes := writeArchiveFixture(t, data)
	archiveHash := sha256.Sum256(archiveBytes)
	manifestHash := sha256.Sum256(manifestBytes)

	first, err := Extract(archivePath, manifestPath, archiveTestCommit)
	if err != nil {
		t.Fatal(err)
	}
	firstRoot := first.Root
	if first.SourceCommit != archiveTestCommit {
		t.Fatalf("SourceCommit = %q", first.SourceCommit)
	}
	if first.Members != len(data) { // helper adds the pre-archive snapshot
		t.Fatalf("Members = %d, want %d", first.Members, len(data))
	}
	if first.ArchiveSHA256 != hex.EncodeToString(archiveHash[:]) {
		t.Fatalf("ArchiveSHA256 = %q", first.ArchiveSHA256)
	}
	if first.ManifestSHA256 != hex.EncodeToString(manifestHash[:]) {
		t.Fatalf("ManifestSHA256 = %q", first.ManifestSHA256)
	}
	for path, want := range data {
		got, err := os.ReadFile(filepath.Join(first.Root, filepath.FromSlash(path)))
		if err != nil {
			t.Fatalf("read extracted %s: %v", path, err)
		}
		if !bytes.Equal(got, want) {
			t.Fatalf("extracted %s differs", path)
		}
	}

	second, err := Extract(archivePath, manifestPath, archiveTestCommit)
	if err != nil {
		t.Fatal(err)
	}
	secondRoot := second.Root
	if firstRoot == secondRoot {
		t.Fatal("two Extract calls returned the same temporary root")
	}

	victim := filepath.Join(t.TempDir(), "caller-owned")
	if err := os.WriteFile(victim, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	first.Root = victim
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(firstRoot); !os.IsNotExist(err) {
		t.Fatalf("owned extraction root remains after Close: %v", err)
	}
	if got, err := os.ReadFile(victim); err != nil || string(got) != "keep" {
		t.Fatalf("Close removed or changed caller-owned path: %q, %v", got, err)
	}
	if _, err := os.Stat(secondRoot); err != nil {
		t.Fatalf("closing one bundle removed another bundle root: %v", err)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("second Close should be idempotent: %v", err)
	}
	if err := second.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(secondRoot); !os.IsNotExist(err) {
		t.Fatalf("second extraction root remains after Close: %v", err)
	}
}

func TestExtractRejectsBadMemberDigestAndCleansPartialExtraction(t *testing.T) {
	data := map[string][]byte{
		"qualification/qualification.raw.json": []byte(`{"ok":true}`),
	}
	archivePath, manifestPath, _, _ := writeArchiveFixture(t, data)
	tmp := t.TempDir()
	t.Setenv("TMPDIR", tmp)
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	mutated := bytes.Replace(manifestBytes, sha256Sum(data["qualification/qualification.raw.json"]), []byte(strings.Repeat("0", 64)), 1)
	if bytes.Equal(mutated, manifestBytes) {
		t.Fatal("test failed to change member digest")
	}
	if err := os.WriteFile(manifestPath, mutated, 0o600); err != nil {
		t.Fatal(err)
	}
	if bundle, err := Extract(archivePath, manifestPath, archiveTestCommit); err == nil {
		_ = bundle.Close()
		t.Fatal("Extract accepted a member whose digest differs from the manifest")
	}
	entries, err := os.ReadDir(tmp)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("failed extraction left temporary paths: %v", entries)
	}
}

func TestExtractRejectsWrongExpectedCommitBeforeCreatingTempDirectory(t *testing.T) {
	archivePath, manifestPath, _, _ := writeArchiveFixture(t, map[string][]byte{
		"qualification/qualification.raw.json": []byte(`{}`),
	})
	tmp := t.TempDir()
	t.Setenv("TMPDIR", tmp)
	if _, err := Extract(archivePath, manifestPath, strings.Repeat("a", 40)); err == nil {
		t.Fatal("Extract accepted a commit different from the manifest")
	}
	entries, err := os.ReadDir(tmp)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("commit mismatch created temporary paths: %v", entries)
	}
}

func TestExtractRejectsUnknownAndDuplicateManifestKeys(t *testing.T) {
	archivePath, manifestPath, _, manifestBytes := writeArchiveFixture(t, map[string][]byte{
		"qualification/qualification.raw.json": []byte(`{}`),
	})
	unknown := bytes.Replace(manifestBytes, []byte(`"attempt":"attempt-20261031T181327827Z-18"`), []byte(`"attempt":"attempt-20261031T181327827Z-18","surprise":true`), 1)
	if bytes.Equal(unknown, manifestBytes) {
		t.Fatal("test failed to add unknown field")
	}
	if err := os.WriteFile(manifestPath, unknown, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Extract(archivePath, manifestPath, archiveTestCommit); err == nil {
		t.Fatal("Extract accepted an unknown manifest field")
	}
	wrongCase := bytes.Replace(manifestBytes, []byte(`"sourceCommit":"`+archiveTestCommit+`"`), []byte(`"SourceCommit":"`+archiveTestCommit+`"`), 1)
	if bytes.Equal(wrongCase, manifestBytes) {
		t.Fatal("test failed to change manifest field case")
	}
	if err := os.WriteFile(manifestPath, wrongCase, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Extract(archivePath, manifestPath, archiveTestCommit); err == nil {
		t.Fatal("Extract accepted a case-insensitive alias for a manifest field")
	}

	duplicate := bytes.Replace(manifestBytes, []byte(`"sourceCommit":"`+archiveTestCommit+`"`), []byte(`"sourceCommit":"`+strings.Repeat("a", 40)+`","sourceCommit":"`+archiveTestCommit+`"`), 1)
	if bytes.Equal(duplicate, manifestBytes) {
		t.Fatal("test failed to add duplicate key")
	}
	if err := os.WriteFile(manifestPath, duplicate, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Extract(archivePath, manifestPath, archiveTestCommit); err == nil {
		t.Fatal("Extract accepted a duplicate sourceCommit key")
	}
}

func TestExtractRejectsCompressedArchiveAboveLimitBeforeReading(t *testing.T) {
	_, manifestPath, _, _ := writeArchiveFixture(t, map[string][]byte{
		"qualification/qualification.raw.json": []byte(`{}`),
	})
	tmp := t.TempDir()
	path := filepath.Join(tmp, "oversized.tar.gz")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(maxCompressedArchiveBytes + 1); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := Extract(path, manifestPath, archiveTestCommit); err == nil {
		t.Fatal("Extract accepted an archive above the compressed-byte limit")
	}
}

func sha256Sum(data []byte) []byte {
	digest := sha256.Sum256(data)
	return []byte(hex.EncodeToString(digest[:]))
}

func TestArchiveTestManifestShapeIsPublishedArchiveSchema(t *testing.T) {
	_, manifestPath, _, _ := writeArchiveFixture(t, map[string][]byte{
		"qualification/qualification.raw.json": []byte("{}"),
	})
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	var keys map[string]json.RawMessage
	if err := json.Unmarshal(data, &keys); err != nil {
		t.Fatal(err)
	}
	want := []string{"attempt", "members", "policy", "preArchiveSnapshot", "schema", "sourceCommit"}
	got := make([]string, 0, len(keys))
	for key := range keys {
		got = append(got, key)
	}
	sort.Strings(got)
	if !reflectStringSlicesEqual(got, want) {
		t.Fatalf("manifest keys = %v, want %v", got, want)
	}
}

func reflectStringSlicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
