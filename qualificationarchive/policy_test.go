package qualificationarchive

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

const (
	policyTestCommit   = "77f7ce36439f1ae457a397269ea5a8c6d2db1cb2"
	policyTestPolicy   = "explicit stable NUL-separated file inventory; no recursive tar traversal"
	policyTestSnapshot = "execution-before-archive.json"
)

type policyTestMember struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type policyTestManifest struct {
	Schema             string             `json:"schema"`
	Policy             string             `json:"policy"`
	Attempt            string             `json:"attempt"`
	SourceCommit       string             `json:"sourceCommit"`
	Members            []policyTestMember `json:"members"`
	PreArchiveSnapshot policyTestMember   `json:"preArchiveSnapshot"`
}

type policyTestTarEntry struct {
	Path     string
	Data     []byte
	Typeflag byte
	Linkname string
	Mode     int64
	Size     int64
	UseSize  bool
	ZeroFill bool
	Devmajor int64
	Devminor int64
}

func policyTestDigest(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func policyTestRegular(path string, data []byte) policyTestTarEntry {
	return policyTestTarEntry{Path: path, Data: data, Typeflag: tar.TypeReg, Mode: 0o600}
}

func policyTestMemberFor(path string, data []byte) policyTestMember {
	return policyTestMember{Path: path, Bytes: int64(len(data)), SHA256: policyTestDigest(data)}
}

func policyTestZeroDigest(size int64) string {
	hash := sha256.New()
	var zeros [32 * 1024]byte
	for size > 0 {
		chunk := int64(len(zeros))
		if size < chunk {
			chunk = size
		}
		_, _ = hash.Write(zeros[:chunk])
		size -= chunk
	}
	return hex.EncodeToString(hash.Sum(nil))
}

func policyTestZeroMember(path string, size int64) policyTestMember {
	return policyTestMember{Path: path, Bytes: size, SHA256: policyTestZeroDigest(size)}
}

type policyTestZeroReader struct{}

func (policyTestZeroReader) Read(p []byte) (int, error) {
	clear(p)
	return len(p), nil
}

func policyTestSortMembers(members []policyTestMember) {
	sort.Slice(members, func(i, j int) bool { return members[i].Path < members[j].Path })
}

// policyTestWriteFixture creates a small archive without consulting the mounted
// integration fixture. Entries and manifest rows are independently specified so
// malformed inventories can be tested without editing the evidence under review.
func policyTestWriteFixture(t *testing.T, entries []policyTestTarEntry, members []policyTestMember, snapshot policyTestMember, manifestCommit string) (string, string) {
	t.Helper()
	if members == nil {
		members = []policyTestMember{}
	}
	policyTestSortMembers(members)
	manifest := policyTestManifest{
		Schema:             "gobi.backend-qualification-archive/v1",
		Policy:             policyTestPolicy,
		Attempt:            "attempt-policy-test",
		SourceCommit:       manifestCommit,
		Members:            members,
		PreArchiveSnapshot: snapshot,
	}
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		t.Fatalf("marshal test manifest: %v", err)
	}

	archivePath := filepath.Join(t.TempDir(), "fixture.tar.gz")
	archiveFile, err := os.Create(archivePath)
	if err != nil {
		t.Fatalf("create test archive: %v", err)
	}
	gz := gzip.NewWriter(archiveFile)
	tarWriter := tar.NewWriter(gz)
	for _, entry := range entries {
		typeflag := entry.Typeflag
		if typeflag == 0 {
			typeflag = tar.TypeReg
		}
		mode := entry.Mode
		if mode == 0 {
			mode = 0o600
		}
		size := int64(len(entry.Data))
		if entry.UseSize {
			size = entry.Size
		}
		header := &tar.Header{
			Name:     entry.Path,
			Mode:     mode,
			Size:     size,
			Typeflag: typeflag,
			Linkname: entry.Linkname,
			ModTime:  time.Unix(1, 0).UTC(),
			Devmajor: entry.Devmajor,
			Devminor: entry.Devminor,
		}
		if err := tarWriter.WriteHeader(header); err != nil {
			_ = archiveFile.Close()
			t.Fatalf("write tar header %q: %v", entry.Path, err)
		}
		if typeflag == tar.TypeReg || typeflag == tar.TypeRegA {
			var err error
			if entry.ZeroFill {
				_, err = io.CopyN(tarWriter, policyTestZeroReader{}, size)
			} else {
				_, err = tarWriter.Write(entry.Data)
			}
			if err != nil {
				_ = archiveFile.Close()
				t.Fatalf("write tar data %q: %v", entry.Path, err)
			}
		}
	}
	if err := tarWriter.Close(); err != nil {
		_ = archiveFile.Close()
		t.Fatalf("close tar writer: %v", err)
	}
	if err := gz.Close(); err != nil {
		_ = archiveFile.Close()
		t.Fatalf("close gzip writer: %v", err)
	}
	if err := archiveFile.Close(); err != nil {
		t.Fatalf("close archive file: %v", err)
	}

	manifestPath := filepath.Join(t.TempDir(), "manifest.json")
	if err := os.WriteFile(manifestPath, manifestBytes, 0o600); err != nil {
		t.Fatalf("write test manifest: %v", err)
	}
	return archivePath, manifestPath
}

func policyTestBaseline(t *testing.T) (string, string, []byte, policyTestMember) {
	t.Helper()
	contents := []byte(`{"snapshot":"portable-policy-test"}`)
	snapshot := policyTestMemberFor(policyTestSnapshot, contents)
	archivePath, manifestPath := policyTestWriteFixture(t,
		[]policyTestTarEntry{policyTestRegular(policyTestSnapshot, contents)},
		[]policyTestMember{snapshot}, snapshot, policyTestCommit)
	return archivePath, manifestPath, contents, snapshot
}

func policyTestExpectReject(t *testing.T, archivePath, manifestPath, expectedCommit string) {
	t.Helper()
	tmpRoot, err := os.MkdirTemp("", "gobi-policy-test-")
	if err != nil {
		t.Fatalf("create private temp root: %v", err)
	}
	defer os.RemoveAll(tmpRoot)
	t.Setenv("TMPDIR", tmpRoot)
	bundle, err := Extract(archivePath, manifestPath, expectedCommit)
	if err == nil {
		if bundle != nil {
			_ = bundle.Close()
		}
		t.Fatal("Extract accepted an adversarial archive/manifest")
	}
	if bundle != nil {
		_ = bundle.Close()
		t.Fatal("Extract returned a bundle together with an error")
	}
	left, err := os.ReadDir(tmpRoot)
	if err != nil {
		t.Fatalf("inspect failed-extraction temp root: %v", err)
	}
	if len(left) != 0 {
		t.Fatalf("failed extraction left temporary paths: %v", left)
	}
}

func TestPolicyFixtureBaselineIsAdmitted(t *testing.T) {
	archivePath, manifestPath, _, _ := policyTestBaseline(t)
	bundle, err := Extract(archivePath, manifestPath, policyTestCommit)
	if err != nil {
		t.Fatalf("baseline fixture rejected: %v", err)
	}
	if bundle == nil || bundle.Root == "" || bundle.SourceCommit != policyTestCommit || bundle.Members != 1 {
		t.Fatalf("unexpected baseline bundle metadata: %#v", bundle)
	}
	root := bundle.Root
	if err := bundle.Close(); err != nil {
		t.Fatalf("close baseline bundle: %v", err)
	}
	if _, err := os.Stat(root); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("bundle Close did not remove its private root: stat error=%v", err)
	}
}

func TestPolicyRejectsUnsafeManifestAndTarPaths(t *testing.T) {
	_, _, snapshotBytes, snapshot := policyTestBaseline(t)
	unsafe := []string{
		"../escape",
		"/absolute/path",
		"a/../../escape",
		"a//b",
		"a/./b",
		"./payload",
		"payload\\child",
	}
	for _, name := range unsafe {
		t.Run(strings.NewReplacer("/", "_", "\\", "_", ".", "dot").Replace(name), func(t *testing.T) {
			payload := []byte("unsafe-path")
			members := []policyTestMember{snapshot, policyTestMemberFor(name, payload)}
			entries := []policyTestTarEntry{policyTestRegular(policyTestSnapshot, snapshotBytes), policyTestRegular(name, payload)}
			archivePath, manifestPath := policyTestWriteFixture(t, entries, members, snapshot, policyTestCommit)
			policyTestExpectReject(t, archivePath, manifestPath, policyTestCommit)
		})
	}
}

func TestPolicyRejectsNonCanonicalPathAliases(t *testing.T) {
	snapshotBytes := []byte(`{"snapshot":"portable-policy-test"}`)
	snapshot := policyTestMemberFor(policyTestSnapshot, snapshotBytes)
	payload := []byte("payload")
	tests := []struct {
		name         string
		archivePath  string
		manifestPath string
	}{
		{name: "archive dot segment", archivePath: "folder/./payload.bin", manifestPath: "folder/payload.bin"},
		{name: "manifest dot segment", archivePath: "folder/payload.bin", manifestPath: "folder/./payload.bin"},
		{name: "archive repeated separator", archivePath: "folder//payload.bin", manifestPath: "folder/payload.bin"},
		{name: "manifest repeated separator", archivePath: "folder/payload.bin", manifestPath: "folder//payload.bin"},
	}
	for _, tt := range tests {
		t.Run(strings.ReplaceAll(tt.name, " ", "-"), func(t *testing.T) {
			members := []policyTestMember{snapshot, policyTestMemberFor(tt.manifestPath, payload)}
			entries := []policyTestTarEntry{policyTestRegular(policyTestSnapshot, snapshotBytes), policyTestRegular(tt.archivePath, payload)}
			archivePath, manifestPath := policyTestWriteFixture(t, entries, members, snapshot, policyTestCommit)
			policyTestExpectReject(t, archivePath, manifestPath, policyTestCommit)
		})
	}
}

func TestPolicyRejectsDuplicateExtraAndMissingMembers(t *testing.T) {
	snapshotBytes := []byte(`{"snapshot":"portable-policy-test"}`)
	snapshot := policyTestMemberFor(policyTestSnapshot, snapshotBytes)
	payload := []byte("payload")
	payloadMember := policyTestMemberFor("payload.bin", payload)

	t.Run("duplicate archive member", func(t *testing.T) {
		archivePath, manifestPath := policyTestWriteFixture(t,
			[]policyTestTarEntry{policyTestRegular(policyTestSnapshot, snapshotBytes), policyTestRegular("payload.bin", payload), policyTestRegular("payload.bin", payload)},
			[]policyTestMember{snapshot, payloadMember}, snapshot, policyTestCommit)
		policyTestExpectReject(t, archivePath, manifestPath, policyTestCommit)
	})

	t.Run("duplicate manifest row", func(t *testing.T) {
		archivePath, manifestPath := policyTestWriteFixture(t,
			[]policyTestTarEntry{policyTestRegular(policyTestSnapshot, snapshotBytes), policyTestRegular("payload.bin", payload)},
			[]policyTestMember{snapshot, payloadMember, payloadMember}, snapshot, policyTestCommit)
		policyTestExpectReject(t, archivePath, manifestPath, policyTestCommit)
	})

	t.Run("extra archive member", func(t *testing.T) {
		archivePath, manifestPath := policyTestWriteFixture(t,
			[]policyTestTarEntry{policyTestRegular(policyTestSnapshot, snapshotBytes), policyTestRegular("unlisted.bin", payload)},
			[]policyTestMember{snapshot}, snapshot, policyTestCommit)
		policyTestExpectReject(t, archivePath, manifestPath, policyTestCommit)
	})

	t.Run("missing manifest member", func(t *testing.T) {
		archivePath, manifestPath := policyTestWriteFixture(t,
			[]policyTestTarEntry{policyTestRegular(policyTestSnapshot, snapshotBytes)},
			[]policyTestMember{snapshot, payloadMember}, snapshot, policyTestCommit)
		policyTestExpectReject(t, archivePath, manifestPath, policyTestCommit)
	})
}

func TestPolicyRejectsLinksAndSpecialTarMembers(t *testing.T) {
	snapshotBytes := []byte(`{"snapshot":"portable-policy-test"}`)
	snapshot := policyTestMemberFor(policyTestSnapshot, snapshotBytes)
	tests := []struct {
		name  string
		entry policyTestTarEntry
	}{
		{name: "symlink", entry: policyTestTarEntry{Path: "payload.bin", Typeflag: tar.TypeSymlink, Linkname: "../../outside"}},
		{name: "hardlink", entry: policyTestTarEntry{Path: "payload.bin", Typeflag: tar.TypeLink, Linkname: policyTestSnapshot}},
		{name: "character device", entry: policyTestTarEntry{Path: "payload.bin", Typeflag: tar.TypeChar, Devmajor: 1}},
		{name: "block device", entry: policyTestTarEntry{Path: "payload.bin", Typeflag: tar.TypeBlock, Devmajor: 1}},
		{name: "fifo", entry: policyTestTarEntry{Path: "payload.bin", Typeflag: tar.TypeFifo}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			members := []policyTestMember{snapshot, policyTestMemberFor("payload.bin", nil)}
			entries := []policyTestTarEntry{policyTestRegular(policyTestSnapshot, snapshotBytes), tt.entry}
			archivePath, manifestPath := policyTestWriteFixture(t, entries, members, snapshot, policyTestCommit)
			policyTestExpectReject(t, archivePath, manifestPath, policyTestCommit)
		})
	}
}

func TestPolicyRejectsGzipTrailingAndConcatenatedStreams(t *testing.T) {
	archivePath, manifestPath, _, _ := policyTestBaseline(t)
	original, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatal(err)
	}

	t.Run("trailing non-gzip bytes", func(t *testing.T) {
		mutated := append(bytes.Clone(original), []byte("unexpected-trailing-data")...)
		path := filepath.Join(t.TempDir(), "trailing.tar.gz")
		if err := os.WriteFile(path, mutated, 0o600); err != nil {
			t.Fatal(err)
		}
		policyTestExpectReject(t, path, manifestPath, policyTestCommit)
	})

	t.Run("concatenated gzip member", func(t *testing.T) {
		var tail bytes.Buffer
		gz := gzip.NewWriter(&tail)
		if _, err := gz.Write([]byte("second gzip member")); err != nil {
			t.Fatal(err)
		}
		if err := gz.Close(); err != nil {
			t.Fatal(err)
		}
		mutated := append(bytes.Clone(original), tail.Bytes()...)
		path := filepath.Join(t.TempDir(), "concatenated.tar.gz")
		if err := os.WriteFile(path, mutated, 0o600); err != nil {
			t.Fatal(err)
		}
		policyTestExpectReject(t, path, manifestPath, policyTestCommit)
	})
}

func TestPolicyRejectsMalformedAndMismatchedSourceCommits(t *testing.T) {
	archivePath, manifestPath, _, _ := policyTestBaseline(t)
	for _, expected := range []string{
		"77F7CE36439F1AE457A397269EA5A8C6D2DB1CB2",
		"77f7ce36439f1ae457a397269ea5a8c6d2db1cb",
		"77f7ce36439f1ae457a397269ea5a8c6d2db1cb20",
	} {
		t.Run("invalid expected "+expected, func(t *testing.T) {
			policyTestExpectReject(t, archivePath, manifestPath, expected)
		})
	}

	t.Run("different valid manifest commit", func(t *testing.T) {
		otherCommit := "88f7ce36439f1ae457a397269ea5a8c6d2db1cb2"
		_, _, snapshotBytes, snapshot := policyTestBaseline(t)
		archivePath, manifestPath := policyTestWriteFixture(t,
			[]policyTestTarEntry{policyTestRegular(policyTestSnapshot, snapshotBytes)},
			[]policyTestMember{snapshot}, snapshot, otherCommit)
		policyTestExpectReject(t, archivePath, manifestPath, policyTestCommit)
	})

	t.Run("malformed manifest commit", func(t *testing.T) {
		_, _, snapshotBytes, snapshot := policyTestBaseline(t)
		archivePath, manifestPath := policyTestWriteFixture(t,
			[]policyTestTarEntry{policyTestRegular(policyTestSnapshot, snapshotBytes)},
			[]policyTestMember{snapshot}, snapshot, strings.ToUpper(policyTestCommit))
		policyTestExpectReject(t, archivePath, manifestPath, policyTestCommit)
	})
}

func TestPolicyRejectsSingleFileAboveExpandedFileLimit(t *testing.T) {
	snapshotBytes := []byte(`{"snapshot":"portable-policy-test"}`)
	snapshot := policyTestMemberFor(policyTestSnapshot, snapshotBytes)
	const maxFileBytes int64 = 32 << 20
	tooLarge := maxFileBytes + 1
	largeEntry := policyTestTarEntry{Path: "large.bin", Typeflag: tar.TypeReg, Size: tooLarge, UseSize: true, ZeroFill: true}
	archivePath, manifestPath := policyTestWriteFixture(t,
		[]policyTestTarEntry{policyTestRegular(policyTestSnapshot, snapshotBytes), largeEntry},
		[]policyTestMember{snapshot, policyTestZeroMember("large.bin", tooLarge)}, snapshot, policyTestCommit)
	policyTestExpectReject(t, archivePath, manifestPath, policyTestCommit)
}

func TestPolicyRejectsAggregateExpandedBytesAboveLimit(t *testing.T) {
	snapshotBytes := []byte(`{"snapshot":"portable-policy-test"}`)
	snapshot := policyTestMemberFor(policyTestSnapshot, snapshotBytes)
	const perFileBytes int64 = 32 << 20
	entries := []policyTestTarEntry{policyTestRegular(policyTestSnapshot, snapshotBytes)}
	members := []policyTestMember{snapshot}
	for _, name := range []string{"file-a.bin", "file-b.bin", "file-c.bin", "file-d.bin"} {
		entries = append(entries, policyTestTarEntry{Path: name, Typeflag: tar.TypeReg, Size: perFileBytes, UseSize: true, ZeroFill: true})
		members = append(members, policyTestZeroMember(name, perFileBytes))
	}
	archivePath, manifestPath := policyTestWriteFixture(t, entries, members, snapshot, policyTestCommit)
	policyTestExpectReject(t, archivePath, manifestPath, policyTestCommit)
}

func TestPolicyRejectsMemberCountAboveLimit(t *testing.T) {
	snapshotBytes := []byte(`{"snapshot":"portable-policy-test"}`)
	snapshot := policyTestMemberFor(policyTestSnapshot, snapshotBytes)
	entries := []policyTestTarEntry{policyTestRegular(policyTestSnapshot, snapshotBytes)}
	members := []policyTestMember{snapshot}
	for i := 0; i < 4096; i++ {
		name := fmt.Sprintf("payload/%04d.bin", i)
		data := []byte{byte(i)}
		entries = append(entries, policyTestRegular(name, data))
		members = append(members, policyTestMemberFor(name, data))
	}
	archivePath, manifestPath := policyTestWriteFixture(t, entries, members, snapshot, policyTestCommit)
	policyTestExpectReject(t, archivePath, manifestPath, policyTestCommit)
}
