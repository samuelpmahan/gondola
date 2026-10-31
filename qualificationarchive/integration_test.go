package qualificationarchive_test

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

	"github.com/samuelpmahan/gondola/qualificationarchive"
)

const (
	integrationSourceCommit        = "77f7ce36439f1ae457a397269ea5a8c6d2db1cb2"
	integrationOriginalArchiveSHA  = "61bb3df8c16323be5ef856edf834ac73ac69fde462224dd1ac8b35ef93ed97ca"
	integrationOriginalManifestSHA = "8adc8f345a5b66a6ea1fbb92fe9bd510d1682f4c37d4c76e8a0660e06ce30cb1"
	integrationCompleteArchiveSHA  = "5d895c53ef9fbbeeb6a88cbb71fee4b352f9ebc689605d431efca61b8fa78cc1"
	integrationCompleteManifestSHA = "7645cb803edb5cbb053b43a5a02c04f124e3b60553f7057a6a92777f3d211dcd"
	integrationSupplementSHA       = "343ef3164ebad3f53d32fb05dad2c276ed0ff5cc3bc166aa1af5d37a4704b31c"
	integrationAttempt             = "attempt-20261031T181327827Z-18"
)

type integrationMember struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type integrationManifest struct {
	Schema             string              `json:"schema"`
	Policy             string              `json:"policy"`
	Attempt            string              `json:"attempt"`
	SourceCommit       string              `json:"sourceCommit"`
	Members            []integrationMember `json:"members"`
	PreArchiveSnapshot integrationMember   `json:"preArchiveSnapshot"`
}

type integrationTarEntry struct {
	Path string
	Data []byte
}

func integrationOriginalFixture(t *testing.T) (string, string) {
	t.Helper()
	root := filepath.Join("..", "portable-qualification", "testdata")
	return filepath.Join(root, "runtime.tar.gz"), filepath.Join(root, "runtime.manifest.json")
}

func integrationCompleteFixture(t *testing.T) (string, string) {
	t.Helper()
	root := filepath.Join("..", "portable-qualification", "testdata")
	return filepath.Join(root, "runtime-complete.tar.gz"), filepath.Join(root, "runtime-complete.manifest.json")
}

func TestIntegrationPublishedArchiveExtractsAndVerifies(t *testing.T) {
	archivePath, manifestPath := integrationCompleteFixture(t)
	archiveBytes, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	archiveSHA := integrationDigest(archiveBytes)
	manifestSHA := integrationDigest(manifestBytes)
	if archiveSHA != integrationCompleteArchiveSHA || manifestSHA != integrationCompleteManifestSHA {
		t.Fatalf("complete archive hashes = %s / %s, want %s / %s", archiveSHA, manifestSHA, integrationCompleteArchiveSHA, integrationCompleteManifestSHA)
	}

	bundle, err := qualificationarchive.Extract(archivePath, manifestPath, integrationSourceCommit)
	if err != nil {
		t.Fatalf("Extract published archive: %v", err)
	}
	if bundle == nil {
		t.Fatal("Extract returned a nil bundle")
	}
	root := bundle.Root
	if bundle.SourceCommit != integrationSourceCommit || bundle.Members != 405 ||
		bundle.ArchiveSHA256 != archiveSHA || bundle.ManifestSHA256 != manifestSHA {
		t.Fatalf("Extract returned unexpected metadata: %#v", bundle)
	}
	if _, err := os.Stat(filepath.Join(root, "qualification", "qualification.raw.json")); err != nil {
		t.Fatalf("extracted raw qualification report is missing: %v", err)
	}
	if err := bundle.Close(); err != nil {
		t.Fatalf("close extracted bundle: %v", err)
	}
	if _, err := os.Stat(root); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("Close did not remove its extraction root: %v", err)
	}

	receipt, err := qualificationarchive.Verify(archivePath, manifestPath, integrationSourceCommit)
	if err != nil {
		t.Fatalf("Verify published archive: %v", err)
	}
	if receipt.Schema != "gobi.portable-qualification-verification/v1" || receipt.SourceCommit != integrationSourceCommit ||
		!receipt.Qualified || receipt.ArchiveSHA256 != archiveSHA || receipt.ManifestSHA256 != manifestSHA ||
		receipt.Members != 405 || len(receipt.Cases) != 13 {
		t.Fatalf("Verify returned unexpected receipt metadata: schema=%q commit=%q qualified=%t archive=%q manifest=%q members=%d cases=%d",
			receipt.Schema, receipt.SourceCommit, receipt.Qualified, receipt.ArchiveSHA256, receipt.ManifestSHA256, receipt.Members, len(receipt.Cases))
	}
	wantIDs := []string{
		"healthy-react", "healthy-dom", "healthy-swap",
		"fault-react-text-corruption", "fault-react-key-order", "fault-react-enabled-control",
		"fault-react-drop-click", "fault-react-duplicate-click",
		"fault-dom-text-corruption", "fault-dom-key-order", "fault-dom-enabled-control",
		"fault-dom-drop-click", "fault-dom-duplicate-click",
	}
	for i, row := range receipt.Cases {
		if !row.Passed || i >= len(wantIDs) || row.ID != wantIDs[i] {
			t.Fatalf("case %d is not the expected passing registry result: %#v", i, row)
		}
	}
}

func TestIntegrationOriginalArchivePreservesSourcePinGapAsRejection(t *testing.T) {
	archivePath, manifestPath := integrationOriginalFixture(t)
	archiveBytes, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if integrationDigest(archiveBytes) != integrationOriginalArchiveSHA || integrationDigest(manifestBytes) != integrationOriginalManifestSHA {
		t.Fatal("original published 397-member fixture changed")
	}
	bundle, err := qualificationarchive.Extract(archivePath, manifestPath, integrationSourceCommit)
	if err != nil {
		t.Fatalf("Extract original published archive: %v", err)
	}
	if bundle.Members != 397 {
		_ = bundle.Close()
		t.Fatalf("original archive member count = %d, want 397", bundle.Members)
	}
	if err := bundle.Close(); err != nil {
		t.Fatalf("close original bundle: %v", err)
	}
	if _, err := qualificationarchive.Verify(archivePath, manifestPath, integrationSourceCommit); err == nil {
		t.Fatal("Verify accepted the original archive although eight source-before/source-after pins have no archived source bytes")
	} else if !strings.Contains(err.Error(), "source snapshot pin") ||
		!strings.Contains(err.Error(), "compiled-frontend/frontend/react/review-evidence/r2-go-emit.log") {
		t.Fatalf("original source-pin gap was rejected unexpectedly: %v", err)
	}
}

func TestIntegrationCompleteBundleAddsOnlyPinnedSourceSupport(t *testing.T) {
	originalArchive, _ := integrationOriginalFixture(t)
	completeArchive, _ := integrationCompleteFixture(t)
	original := integrationReadMap(t, originalArchive)
	complete := integrationReadMap(t, completeArchive)
	if len(original) != 397 || len(complete) != 405 {
		t.Fatalf("original/complete member counts = %d/%d, want 397/405", len(original), len(complete))
	}
	for path, body := range original {
		if !bytes.Equal(complete[path], body) {
			t.Fatalf("augmentation changed original member bytes at %s", path)
		}
	}

	testdata := filepath.Join("..", "portable-qualification", "testdata")
	supplementBytes, err := os.ReadFile(filepath.Join(testdata, "runtime-complete.augmentation.json"))
	if err != nil {
		t.Fatal(err)
	}
	if got := integrationDigest(supplementBytes); got != integrationSupplementSHA {
		t.Fatalf("augmentation record SHA-256 = %s, want %s", got, integrationSupplementSHA)
	}
	var supplement struct {
		Schema                     string `json:"schema"`
		SourceCommit               string `json:"sourceCommit"`
		OriginalMembers            int    `json:"originalMembers"`
		CompleteMembers            int    `json:"completeMembers"`
		OriginalMemberBytesChanged bool   `json:"originalMemberBytesChanged"`
		FreshBrowserExecution      bool   `json:"freshBrowserExecution"`
		Added                      []struct {
			Path   string `json:"path"`
			Bytes  int64  `json:"bytes"`
			SHA256 string `json:"sha256"`
		} `json:"added"`
	}
	if err := json.Unmarshal(supplementBytes, &supplement); err != nil {
		t.Fatal(err)
	}
	if supplement.Schema != "gobi.qualification-source-supplement/v1" || supplement.SourceCommit != integrationSourceCommit ||
		supplement.OriginalMembers != 397 || supplement.CompleteMembers != 405 || supplement.OriginalMemberBytesChanged ||
		supplement.FreshBrowserExecution || len(supplement.Added) != 8 {
		t.Fatalf("unexpected source supplement metadata: %#v", supplement)
	}
	addedPaths := make(map[string]bool, len(supplement.Added))
	for _, item := range supplement.Added {
		if _, existed := original[item.Path]; existed {
			t.Fatalf("supplement path %s was already present in original archive", item.Path)
		}
		body, ok := complete[item.Path]
		if !ok || int64(len(body)) != item.Bytes || integrationDigest(body) != item.SHA256 {
			t.Fatalf("added support source does not match supplement pin: %#v", item)
		}
		addedPaths[item.Path] = true
	}
	for path := range complete {
		if _, existed := original[path]; !existed && !addedPaths[path] {
			t.Fatalf("complete archive contains an unrecorded added path %s", path)
		}
	}
}

func TestIntegrationRejectsPublishedArchiveHashAndInventoryMutations(t *testing.T) {
	archivePath, manifestPath := integrationCompleteFixture(t)
	original, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	mutated := append([]byte(nil), original...)
	mutated[len(mutated)/2] ^= 0x01
	corruptPath := filepath.Join(t.TempDir(), "corrupt.tar.gz")
	if err := os.WriteFile(corruptPath, mutated, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := qualificationarchive.Verify(corruptPath, manifestPath, integrationSourceCommit); err == nil {
		t.Fatal("Verify accepted a byte-corrupted published archive with the original manifest")
	} else if !strings.Contains(err.Error(), "extract qualification archive") {
		t.Fatalf("corrupted archive was rejected outside extraction: %v", err)
	}

	entries := integrationReadTar(t, archivePath)
	if len(entries) != 405 {
		t.Fatalf("read %d tar members, want 405", len(entries))
	}
	omittedPath := "qualification/qualification.raw.json"
	withoutRaw := make([]integrationTarEntry, 0, len(entries)-1)
	for _, entry := range entries {
		if entry.Path != omittedPath {
			withoutRaw = append(withoutRaw, entry)
		}
	}
	if len(withoutRaw) != len(entries)-1 {
		t.Fatalf("fixture did not contain exactly one %s member", omittedPath)
	}
	omittedArchive := integrationWriteTar(t, withoutRaw)
	if _, err := qualificationarchive.Verify(omittedArchive, manifestPath, integrationSourceCommit); err == nil {
		t.Fatal("Verify accepted a published archive missing a manifest-listed raw report")
	} else if !strings.Contains(err.Error(), "extract qualification archive") {
		t.Fatalf("missing member was rejected outside extraction: %v", err)
	}
}

func TestIntegrationRejectsWellRehashedSemanticCertificateAndSourceMutations(t *testing.T) {
	archivePath, _ := integrationCompleteFixture(t)
	base := integrationReadMap(t, archivePath)

	t.Run("semantic raw capture", func(t *testing.T) {
		members := integrationShallowClone(base)
		integrationMutateRawEventCount(t, members)
		mutantArchive, mutantManifest := integrationWriteRehashedArchive(t, members)
		if _, err := qualificationarchive.Verify(mutantArchive, mutantManifest, integrationSourceCommit); err == nil {
			t.Fatal("Verify accepted a raw capture with a changed measured event count after all archive hashes were recomputed")
		} else if !strings.Contains(err.Error(), "recompute Go qualification certificate") {
			t.Fatalf("rehashed semantic capture was rejected at an unexpected layer: %v", err)
		}
	})

	t.Run("certificate disagreement", func(t *testing.T) {
		members := integrationShallowClone(base)
		var certificate map[string]any
		integrationDecodeJSON(t, members["certificate/certificate.json"], &certificate)
		results := certificate["results"].([]any)
		first := results[0].(map[string]any)
		first["passed"] = false
		members["certificate/certificate.json"] = integrationJSON(t, certificate)
		integrationRefreshExecutionReference(t, members, "certificate", "", "certificate/certificate.json")
		mutantArchive, mutantManifest := integrationWriteRehashedArchive(t, members)
		if _, err := qualificationarchive.Verify(mutantArchive, mutantManifest, integrationSourceCommit); err == nil {
			t.Fatal("Verify accepted a well-formed but altered archived Go certificate after all archive hashes were recomputed")
		} else if !strings.Contains(err.Error(), "archived certificate differs from the recomputed Go certificate") {
			t.Fatalf("rehashed certificate mutation was rejected at an unexpected layer: %v", err)
		}
	})

	t.Run("source pin disagreement", func(t *testing.T) {
		members := integrationShallowClone(base)
		sourcePath := "source/backend-qualification/CONTRACT.md"
		members[sourcePath] = append(append([]byte(nil), members[sourcePath]...), []byte("\nrehashed integration mutation\n")...)
		mutantArchive, mutantManifest := integrationWriteRehashedArchive(t, members)
		if _, err := qualificationarchive.Verify(mutantArchive, mutantManifest, integrationSourceCommit); err == nil {
			t.Fatal("Verify accepted source bytes that disagree with preserved source-before/source-after pins")
		} else if !strings.Contains(err.Error(), "source snapshot pin") {
			t.Fatalf("rehashed source mutation was rejected at an unexpected layer: %v", err)
		}
	})
}

func integrationMutateRawEventCount(t *testing.T, members map[string][]byte) {
	t.Helper()
	var raw map[string]any
	integrationDecodeJSON(t, members["qualification/qualification.raw.json"], &raw)
	results := raw["results"].([]any)
	result := results[0].(map[string]any)
	if result["id"] != "healthy-react" || result["eventsObserved"] != json.Number("50") {
		t.Fatalf("unexpected healthy first row before mutation: %#v", result)
	}
	result["eventsObserved"] = json.Number("49")

	evidencePath := "qualification/" + result["evidencePath"].(string)
	var evidence map[string]any
	integrationDecodeJSON(t, members[evidencePath], &evidence)
	evidence["eventsObserved"] = json.Number("49")
	observed := evidence["observed"].(map[string]any)
	observed["eventsObserved"] = json.Number("49")
	members[evidencePath] = integrationJSON(t, evidence)
	result["evidenceSHA256"] = integrationDigest(members[evidencePath])
	members["qualification/qualification.raw.json"] = integrationJSON(t, raw)

	var snapshot map[string]any
	integrationDecodeJSON(t, members["execution-before-archive.json"], &snapshot)
	qualification := snapshot["qualification"].(map[string]any)
	integrationSetReference(t, qualification["rawReport"].(map[string]any), "qualification/qualification.raw.json", members["qualification/qualification.raw.json"])
	members["execution-before-archive.json"] = integrationJSON(t, snapshot)
	var inputRefs map[string]any
	integrationDecodeJSON(t, members["provenance/qualification-inputs.json"], &inputRefs)
	integrationSetReference(t, inputRefs["rawReport"].(map[string]any), "qualification/qualification.raw.json", members["qualification/qualification.raw.json"])
	members["provenance/qualification-inputs.json"] = integrationJSON(t, inputRefs)
}

func integrationRefreshExecutionReference(t *testing.T, members map[string][]byte, section, referenceName, archivePath string) {
	t.Helper()
	var snapshot map[string]any
	integrationDecodeJSON(t, members["execution-before-archive.json"], &snapshot)
	ref := snapshot[section].(map[string]any)
	if referenceName != "" {
		ref = ref[referenceName].(map[string]any)
	}
	integrationSetReference(t, ref, archivePath, members[archivePath])
	members["execution-before-archive.json"] = integrationJSON(t, snapshot)
}

func integrationSetReference(t *testing.T, reference map[string]any, archivePath string, data []byte) {
	t.Helper()
	if reference["path"] == nil {
		t.Fatalf("reference for %s has no path", archivePath)
	}
	reference["bytes"] = json.Number(fmt.Sprint(len(data)))
	reference["sha256"] = integrationDigest(data)
}

func integrationReadMap(t *testing.T, archivePath string) map[string][]byte {
	t.Helper()
	entries := integrationReadTar(t, archivePath)
	result := make(map[string][]byte, len(entries))
	for _, entry := range entries {
		result[entry.Path] = entry.Data
	}
	return result
}

func integrationReadTar(t *testing.T, archivePath string) []integrationTarEntry {
	t.Helper()
	file, err := os.Open(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	gz, err := gzip.NewReader(file)
	if err != nil {
		t.Fatalf("open fixture gzip: %v", err)
	}
	defer gz.Close()
	reader := tar.NewReader(gz)
	var entries []integrationTarEntry
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatalf("read fixture tar: %v", err)
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA {
			t.Fatalf("published fixture member %s has nonregular type %d", header.Name, header.Typeflag)
		}
		data, err := io.ReadAll(reader)
		if err != nil {
			t.Fatalf("read fixture member %s: %v", header.Name, err)
		}
		entries = append(entries, integrationTarEntry{Path: header.Name, Data: data})
	}
	return entries
}

func integrationWriteTar(t *testing.T, entries []integrationTarEntry) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "mutated.tar.gz")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(file)
	writer := tar.NewWriter(gz)
	for _, entry := range entries {
		header := &tar.Header{Name: entry.Path, Mode: 0o600, Size: int64(len(entry.Data)), Typeflag: tar.TypeReg, Format: tar.FormatPAX}
		if err := writer.WriteHeader(header); err != nil {
			t.Fatalf("write mutated member %s: %v", entry.Path, err)
		}
		if _, err := writer.Write(entry.Data); err != nil {
			t.Fatalf("write mutated member data %s: %v", entry.Path, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	return path
}

func integrationWriteRehashedArchive(t *testing.T, members map[string][]byte) (string, string) {
	t.Helper()
	paths := make([]string, 0, len(members))
	for path := range members {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	entries := make([]integrationTarEntry, 0, len(paths))
	manifest := integrationManifest{
		Schema:       "gobi.backend-qualification-archive/v1",
		Policy:       "explicit stable NUL-separated file inventory; no recursive tar traversal",
		Attempt:      integrationAttempt,
		SourceCommit: integrationSourceCommit,
	}
	for _, path := range paths {
		body := members[path]
		entries = append(entries, integrationTarEntry{Path: path, Data: body})
		manifest.Members = append(manifest.Members, integrationMember{Path: path, Bytes: int64(len(body)), SHA256: integrationDigest(body)})
		if path == "execution-before-archive.json" {
			manifest.PreArchiveSnapshot = integrationMember{Path: path, Bytes: int64(len(body)), SHA256: integrationDigest(body)}
		}
	}
	if manifest.PreArchiveSnapshot.Path == "" {
		t.Fatal("mutation omitted the pre-archive snapshot")
	}
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	manifestPath := filepath.Join(t.TempDir(), "runtime.manifest.json")
	if err := os.WriteFile(manifestPath, manifestBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	return integrationWriteTar(t, entries), manifestPath
}

func integrationShallowClone(source map[string][]byte) map[string][]byte {
	clone := make(map[string][]byte, len(source))
	for path, body := range source {
		clone[path] = body
	}
	return clone
}

func integrationDecodeJSON(t *testing.T, data []byte, target any) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		t.Fatalf("decode mutation input JSON: %v", err)
	}
}

func integrationJSON(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("encode mutated JSON: %v", err)
	}
	return data
}

func integrationDigest(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
