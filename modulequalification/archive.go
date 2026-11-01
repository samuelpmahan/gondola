package modulequalification

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
	"path"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	archiveManifestSchema   = "gobi.compiled-modules-archive-manifest/v1"
	executionSnapshotSchema = "gobi.compiled-modules-execution-snapshot/v1"
	archiveSnapshotPath     = "execution-before-archive.json"

	maxCompressedArchiveBytes int64 = 64 << 20
	maxExpandedArchiveBytes   int64 = 128 << 20
	maxArchiveManifestBytes   int64 = 32 << 20
	maxArchiveMemberBytes     int64 = 32 << 20
	maxArchiveMembers               = 4096
	maxArchivePathBytes             = 4096
	maxArchiveSegmentBytes          = 255
)

var (
	commitPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
	sha256Pattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

// ArchiveReport summarizes the verified archive. Bytes is the compressed
// archive file size declared by the manifest and independently measured.
type ArchiveReport struct {
	Members      int
	Bytes        int64
	SourceCommit string
}

type archiveManifest struct {
	Schema                   string               `json:"schema"`
	SourceCommit             string               `json:"sourceCommit"`
	VerifierGitHead          string               `json:"verifierGitHead"`
	VerifierGitDirty         bool                 `json:"verifierGitDirty"`
	VerifierSourcePinsMatch  bool                 `json:"verifierSourcePinsMatch"`
	Members                  []archiveMember      `json:"members"`
	Archive                  archiveFileReference `json:"archive"`
	SourcePinsBefore         map[string]sourcePin `json:"sourcePinsBefore"`
	ArchivedSnapshotVerified bool                 `json:"archivedSnapshotVerified"`
}

type archiveMember struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type archiveFileReference struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type sourcePin struct {
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type executionSnapshot struct {
	Schema                      string               `json:"schema"`
	SourceCommit                string               `json:"sourceCommit"`
	VerifierGitHead             string               `json:"verifierGitHead"`
	VerifierGitDirty            bool                 `json:"verifierGitDirty"`
	VerifierSourcePinsMatch     bool                 `json:"verifierSourcePinsMatch"`
	VerifierSourcePinMismatches []string             `json:"verifierSourcePinMismatches"`
	SourcePins                  map[string]sourcePin `json:"sourcePins"`
	Commands                    json.RawMessage      `json:"commands"`
	ModuleCounts                json.RawMessage      `json:"moduleCounts"`
}

// VerifyArchive validates the archive and its complete manifest, extracts
// only listed regular files into a private sibling staging directory, and
// atomically installs that directory at dest without replacing an entry that
// appeared after verification began. dest must not exist and its parent
// directory must already exist.
func VerifyArchive(archivePath, manifestPath, dest string) (report ArchiveReport, returnErr error) {
	if strings.TrimSpace(archivePath) == "" || strings.TrimSpace(manifestPath) == "" || strings.TrimSpace(dest) == "" {
		return ArchiveReport{}, errors.New("archive, manifest, and destination paths are required")
	}
	destAbs, parent, err := prepareDestination(dest)
	if err != nil {
		return ArchiveReport{}, err
	}
	if _, err := os.Lstat(destAbs); err == nil {
		return ArchiveReport{}, errors.New("archive destination already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return ArchiveReport{}, fmt.Errorf("inspect archive destination: %w", err)
	}

	manifestBytes, err := readRegularFile(manifestPath, maxArchiveManifestBytes, "archive manifest")
	if err != nil {
		return ArchiveReport{}, err
	}
	var manifest archiveManifest
	if err := DecodeStrict(manifestBytes, &manifest); err != nil {
		return ArchiveReport{}, fmt.Errorf("decode archive manifest: %w", err)
	}
	if err := validateManifestJSONShape(manifestBytes); err != nil {
		return ArchiveReport{}, fmt.Errorf("validate archive manifest fields: %w", err)
	}
	if err := validateManifest(manifest); err != nil {
		return ArchiveReport{}, err
	}

	archiveBytes, err := readRegularFile(archivePath, maxCompressedArchiveBytes, "archive")
	if err != nil {
		return ArchiveReport{}, err
	}
	archiveDigest := sha256.Sum256(archiveBytes)
	archiveSHA := hex.EncodeToString(archiveDigest[:])
	if int64(len(archiveBytes)) != manifest.Archive.Bytes || archiveSHA != manifest.Archive.SHA256 {
		return ArchiveReport{}, errors.New("archive byte length or SHA-256 differs from the manifest")
	}

	stage, err := os.MkdirTemp(parent, ".module-qualification-archive-")
	if err != nil {
		return ArchiveReport{}, fmt.Errorf("create archive staging directory: %w", err)
	}
	keepStage := false
	defer func() {
		if !keepStage {
			if cleanupErr := os.RemoveAll(stage); cleanupErr != nil {
				cleanupFailure := fmt.Errorf("remove failed archive staging directory: %w", cleanupErr)
				if returnErr == nil {
					report = ArchiveReport{}
					returnErr = cleanupFailure
				} else {
					returnErr = errors.Join(returnErr, cleanupFailure)
				}
			}
		}
	}()
	if err := os.Chmod(stage, 0o700); err != nil {
		return ArchiveReport{}, fmt.Errorf("secure archive staging directory: %w", err)
	}

	if err := extractExactArchive(archiveBytes, stage, manifest.Members); err != nil {
		return ArchiveReport{}, err
	}
	if err := verifySourceClosure(stage, manifest); err != nil {
		return ArchiveReport{}, err
	}
	if err := verifyArchivedSnapshot(stage, manifest); err != nil {
		return ArchiveReport{}, err
	}
	if _, err := os.Lstat(destAbs); err == nil {
		return ArchiveReport{}, errors.New("archive destination appeared during verification")
	} else if !errors.Is(err, os.ErrNotExist) {
		return ArchiveReport{}, fmt.Errorf("recheck archive destination: %w", err)
	}
	if err := installDirectoryNoReplace(stage, destAbs); err != nil {
		return ArchiveReport{}, fmt.Errorf("publish verified archive extraction without replacement: %w", err)
	}
	keepStage = true
	return ArchiveReport{Members: len(manifest.Members), Bytes: int64(len(archiveBytes)), SourceCommit: manifest.SourceCommit}, nil
}

func prepareDestination(destination string) (absolute, parent string, err error) {
	absolute, err = filepath.Abs(destination)
	if err != nil {
		return "", "", fmt.Errorf("resolve archive destination: %w", err)
	}
	absolute = filepath.Clean(absolute)
	base := filepath.Base(absolute)
	if base == "." || base == string(filepath.Separator) || base == "" {
		return "", "", errors.New("archive destination must name a new directory")
	}
	parent = filepath.Dir(absolute)
	info, err := os.Lstat(parent)
	if err != nil {
		return "", "", fmt.Errorf("inspect archive destination parent: %w", err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", "", errors.New("archive destination parent must be an existing real directory")
	}
	resolved, err := filepath.EvalSymlinks(parent)
	if err != nil {
		return "", "", fmt.Errorf("resolve archive destination parent: %w", err)
	}
	if filepath.Clean(resolved) != parent {
		return "", "", errors.New("archive destination parent contains a symbolic link")
	}
	return absolute, parent, nil
}

func readRegularFile(filePath string, limit int64, label string) ([]byte, error) {
	before, err := os.Lstat(filePath)
	if err != nil {
		return nil, fmt.Errorf("inspect %s: %w", label, err)
	}
	if !before.Mode().IsRegular() {
		return nil, fmt.Errorf("%s must be a regular file", label)
	}
	if before.Size() > limit {
		return nil, fmt.Errorf("%s exceeds the %d-byte limit", label, limit)
	}
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", label, err)
	}
	defer file.Close()
	after, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("stat %s: %w", label, err)
	}
	if !after.Mode().IsRegular() || !os.SameFile(before, after) {
		return nil, fmt.Errorf("%s changed while being opened", label)
	}
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", label, err)
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("%s exceeds the %d-byte limit", label, limit)
	}
	if int64(len(data)) != after.Size() {
		return nil, fmt.Errorf("%s changed while being read", label)
	}
	return data, nil
}

func validateManifest(manifest archiveManifest) error {
	if manifest.Schema != archiveManifestSchema {
		return fmt.Errorf("archive manifest schema must be %q", archiveManifestSchema)
	}
	if !commitPattern.MatchString(manifest.SourceCommit) || manifest.VerifierGitHead != manifest.SourceCommit {
		return errors.New("archive source commit and verifier Git head must be the same 40-character lowercase commit")
	}
	if manifest.VerifierGitDirty || !manifest.VerifierSourcePinsMatch || !manifest.ArchivedSnapshotVerified {
		return errors.New("archive manifest does not attest a clean, source-pin-matched, snapshot-verified run")
	}
	if manifest.Archive.Path == "" || !utf8.ValidString(manifest.Archive.Path) || strings.ContainsRune(manifest.Archive.Path, '\x00') {
		return errors.New("archive manifest archive.path is empty or invalid")
	}
	if manifest.Archive.Bytes <= 0 || manifest.Archive.Bytes > maxCompressedArchiveBytes || !sha256Pattern.MatchString(manifest.Archive.SHA256) {
		return errors.New("archive manifest archive byte count or SHA-256 is invalid")
	}
	if len(manifest.Members) == 0 || len(manifest.Members) > maxArchiveMembers {
		return fmt.Errorf("archive manifest members count must be between 1 and %d", maxArchiveMembers)
	}
	if len(manifest.SourcePinsBefore) == 0 {
		return errors.New("archive manifest sourcePinsBefore must be nonempty")
	}
	if len(manifest.SourcePinsBefore) > maxArchiveMembers {
		return errors.New("archive manifest sourcePinsBefore exceeds the member limit")
	}

	byPath := make(map[string]archiveMember, len(manifest.Members))
	var declaredBytes int64
	for index, member := range manifest.Members {
		if err := validateArchivePath(member.Path); err != nil {
			return fmt.Errorf("archive manifest members[%d]: %w", index, err)
		}
		if member.Bytes < 0 || member.Bytes > maxArchiveMemberBytes || !sha256Pattern.MatchString(member.SHA256) {
			return fmt.Errorf("archive manifest member %q has invalid size or SHA-256", member.Path)
		}
		if _, exists := byPath[member.Path]; exists {
			return fmt.Errorf("archive manifest has duplicate member %q", member.Path)
		}
		byPath[member.Path] = member
		if declaredBytes > maxExpandedArchiveBytes-member.Bytes {
			return fmt.Errorf("archive manifest expanded member bytes exceed %d", maxExpandedArchiveBytes)
		}
		declaredBytes += member.Bytes
	}
	if err := rejectFileAsParent(byPath); err != nil {
		return err
	}
	snapshot, ok := byPath[archiveSnapshotPath]
	if !ok {
		return errors.New("archive manifest is missing the root execution snapshot")
	}
	for relativePath, pin := range manifest.SourcePinsBefore {
		if err := validateArchivePath(relativePath); err != nil {
			return fmt.Errorf("source pin %q: %w", relativePath, err)
		}
		if pin.Bytes < 0 || pin.Bytes > maxArchiveMemberBytes || !sha256Pattern.MatchString(pin.SHA256) {
			return fmt.Errorf("source pin %q has invalid size or SHA-256", relativePath)
		}
		row, exists := byPath["source/"+relativePath]
		if !exists || row.Bytes != pin.Bytes || row.SHA256 != pin.SHA256 {
			return fmt.Errorf("source pin %q does not exactly match its archived source member", relativePath)
		}
	}
	sourceMemberCount := 0
	for name := range byPath {
		if strings.HasPrefix(name, "source/") {
			sourceMemberCount++
			if _, ok := manifest.SourcePinsBefore[strings.TrimPrefix(name, "source/")]; !ok {
				return fmt.Errorf("archived source member %q has no source pin", name)
			}
		}
	}
	if sourceMemberCount != len(manifest.SourcePinsBefore) {
		return errors.New("archive source members and source pin records are not a one-to-one set")
	}
	if snapshot.Bytes > maxArchiveMemberBytes {
		return errors.New("execution snapshot exceeds the per-member byte limit")
	}
	return nil
}

func validateManifestJSONShape(data []byte) error {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(data, &top); err != nil {
		return err
	}
	if err := requireExactJSONFields(top, "archive manifest", "schema", "sourceCommit", "verifierGitHead", "verifierGitDirty", "verifierSourcePinsMatch", "members", "archive", "sourcePinsBefore", "archivedSnapshotVerified"); err != nil {
		return err
	}
	var members []json.RawMessage
	if err := json.Unmarshal(top["members"], &members); err != nil {
		return fmt.Errorf("manifest members must be an array: %w", err)
	}
	for index, encoded := range members {
		var member map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &member); err != nil {
			return fmt.Errorf("manifest members[%d] must be an object: %w", index, err)
		}
		if err := requireExactJSONFields(member, fmt.Sprintf("manifest members[%d]", index), "path", "bytes", "sha256"); err != nil {
			return err
		}
	}
	var archive map[string]json.RawMessage
	if err := json.Unmarshal(top["archive"], &archive); err != nil {
		return fmt.Errorf("manifest archive must be an object: %w", err)
	}
	if err := requireExactJSONFields(archive, "manifest archive", "path", "bytes", "sha256"); err != nil {
		return err
	}
	var sourcePins map[string]json.RawMessage
	if err := json.Unmarshal(top["sourcePinsBefore"], &sourcePins); err != nil || sourcePins == nil {
		return errors.New("manifest sourcePinsBefore must be an object")
	}
	for name, encoded := range sourcePins {
		var pin map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &pin); err != nil {
			return fmt.Errorf("source pin %q must be an object: %w", name, err)
		}
		if err := requireExactJSONFields(pin, fmt.Sprintf("source pin %q", name), "bytes", "sha256"); err != nil {
			return err
		}
	}
	return nil
}

func requireExactJSONFields(object map[string]json.RawMessage, label string, expected ...string) error {
	if object == nil || len(object) != len(expected) {
		return fmt.Errorf("%s must contain exactly %v", label, expected)
	}
	for _, key := range expected {
		if _, exists := object[key]; !exists {
			return fmt.Errorf("%s is missing exact field %q", label, key)
		}
	}
	return nil
}

func rejectFileAsParent(members map[string]archiveMember) error {
	for name := range members {
		for parent := path.Dir(name); parent != "."; parent = path.Dir(parent) {
			if _, exists := members[parent]; exists {
				return fmt.Errorf("archive member %q is also a parent directory path", parent)
			}
		}
	}
	return nil
}

func validateArchivePath(name string) error {
	if name == "" || len(name) > maxArchivePathBytes || !utf8.ValidString(name) {
		return errors.New("archive path is empty, too long, or invalid UTF-8")
	}
	if strings.ContainsAny(name, "\\\x00") || strings.Contains(name, ":") || path.IsAbs(name) || filepath.IsAbs(name) || path.Clean(name) != name {
		return fmt.Errorf("archive path %q is absolute, nonportable, or not normalized", name)
	}
	for _, segment := range strings.Split(name, "/") {
		if segment == "" || segment == "." || segment == ".." || len(segment) > maxArchiveSegmentBytes {
			return fmt.Errorf("archive path %q has an unsafe segment", name)
		}
		if strings.ContainsAny(segment, "<>\"|?*") || strings.HasSuffix(segment, ".") || strings.HasSuffix(segment, " ") {
			return fmt.Errorf("archive path %q has a nonportable segment", name)
		}
		for _, r := range segment {
			if r < 0x20 || r == 0x7f {
				return fmt.Errorf("archive path %q contains a control character", name)
			}
		}
	}
	return nil
}

func extractExactArchive(archiveBytes []byte, root string, members []archiveMember) error {
	reader := bytes.NewReader(archiveBytes)
	compressed, err := gzip.NewReader(reader)
	if err != nil {
		return fmt.Errorf("open gzip archive: %w", err)
	}
	compressed.Multistream(false)
	closed := false
	defer func() {
		if !closed {
			_ = compressed.Close()
		}
	}()

	limited := &io.LimitedReader{R: compressed, N: maxExpandedArchiveBytes + 1}
	tarReader := tar.NewReader(limited)
	byPath := make(map[string]archiveMember, len(members))
	for _, member := range members {
		byPath[member.Path] = member
	}
	seen := make(map[string]struct{}, len(members))
	for {
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fmt.Errorf("read tar archive: %w", err)
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA {
			return fmt.Errorf("tar member %q is not a regular file", header.Name)
		}
		if err := validateArchivePath(header.Name); err != nil {
			return fmt.Errorf("tar member path: %w", err)
		}
		member, listed := byPath[header.Name]
		if !listed {
			return fmt.Errorf("tar archive contains unlisted member %q", header.Name)
		}
		if _, duplicate := seen[header.Name]; duplicate {
			return fmt.Errorf("tar archive contains duplicate member %q", header.Name)
		}
		if header.Size < 0 || header.Size > maxArchiveMemberBytes || header.Size != member.Bytes {
			return fmt.Errorf("tar member %q size differs from manifest", header.Name)
		}
		destination := filepath.Join(root, filepath.FromSlash(header.Name))
		if err := ensurePathWithinRoot(root, destination); err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
			return fmt.Errorf("create archive member parent: %w", err)
		}
		output, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			return fmt.Errorf("create archive member %q: %w", header.Name, err)
		}
		digest := sha256.New()
		written, copyErr := io.CopyN(io.MultiWriter(output, digest), tarReader, header.Size)
		closeErr := output.Close()
		if copyErr != nil {
			return fmt.Errorf("extract archive member %q: %w", header.Name, copyErr)
		}
		if closeErr != nil {
			return fmt.Errorf("close archive member %q: %w", header.Name, closeErr)
		}
		if written != member.Bytes || hex.EncodeToString(digest.Sum(nil)) != member.SHA256 {
			return fmt.Errorf("archive member %q byte count or SHA-256 differs from manifest", header.Name)
		}
		seen[header.Name] = struct{}{}
	}
	if len(seen) != len(members) {
		for _, member := range members {
			if _, exists := seen[member.Path]; !exists {
				return fmt.Errorf("archive is missing manifest member %q", member.Path)
			}
		}
	}
	if err := drainTarEnd(limited); err != nil {
		return err
	}
	expanded := maxExpandedArchiveBytes + 1 - limited.N
	if expanded > maxExpandedArchiveBytes {
		return fmt.Errorf("expanded archive exceeds %d bytes", maxExpandedArchiveBytes)
	}
	if err := compressed.Close(); err != nil {
		return fmt.Errorf("close gzip archive: %w", err)
	}
	closed = true
	if reader.Len() != 0 {
		return errors.New("gzip archive has trailing or concatenated data")
	}
	return nil
}

func ensurePathWithinRoot(root, destination string) error {
	relative, err := filepath.Rel(root, destination)
	if err != nil {
		return fmt.Errorf("resolve archive member path: %w", err)
	}
	if relative == "." || relative == ".." || filepath.IsAbs(relative) || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return errors.New("archive member escapes extraction root")
	}
	return nil
}

func drainTarEnd(reader io.Reader) error {
	var buffer [32 * 1024]byte
	for {
		count, err := reader.Read(buffer[:])
		for _, value := range buffer[:count] {
			if value != 0 {
				return errors.New("tar archive has nonzero bytes after its end marker")
			}
		}
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("finish tar archive: %w", err)
		}
		if count == 0 {
			return errors.New("tar archive stream made no progress")
		}
	}
}

func verifySourceClosure(root string, manifest archiveManifest) error {
	snapshotBytes, err := os.ReadFile(filepath.Join(root, archiveSnapshotPath))
	if err != nil {
		return fmt.Errorf("read archived execution snapshot: %w", err)
	}
	var snapshot executionSnapshot
	if err := DecodeStrict(snapshotBytes, &snapshot); err != nil {
		return fmt.Errorf("decode archived execution snapshot: %w", err)
	}
	if err := validateSnapshotJSONShape(snapshotBytes); err != nil {
		return fmt.Errorf("validate archived execution snapshot fields: %w", err)
	}
	if snapshot.Schema != executionSnapshotSchema || snapshot.SourceCommit != manifest.SourceCommit || snapshot.VerifierGitHead != manifest.SourceCommit {
		return errors.New("archived execution snapshot schema or source commit differs from manifest")
	}
	if snapshot.VerifierGitDirty || !snapshot.VerifierSourcePinsMatch || snapshot.VerifierSourcePinMismatches == nil || len(snapshot.VerifierSourcePinMismatches) != 0 {
		return errors.New("archived execution snapshot does not attest a clean, source-pin-matched run")
	}
	if !equalSourcePins(snapshot.SourcePins, manifest.SourcePinsBefore) {
		return errors.New("archived execution snapshot source pins differ from manifest sourcePinsBefore")
	}
	return nil
}

func validateSnapshotJSONShape(data []byte) error {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(data, &top); err != nil {
		return err
	}
	if err := requireExactJSONFields(top, "execution snapshot", "schema", "sourceCommit", "verifierGitHead", "verifierGitDirty", "verifierSourcePinsMatch", "verifierSourcePinMismatches", "sourcePins", "commands", "moduleCounts"); err != nil {
		return err
	}
	var sourcePins map[string]json.RawMessage
	if err := json.Unmarshal(top["sourcePins"], &sourcePins); err != nil || sourcePins == nil {
		return errors.New("execution snapshot sourcePins must be an object")
	}
	for name, encoded := range sourcePins {
		var pin map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &pin); err != nil {
			return fmt.Errorf("snapshot source pin %q must be an object: %w", name, err)
		}
		if err := requireExactJSONFields(pin, fmt.Sprintf("snapshot source pin %q", name), "bytes", "sha256"); err != nil {
			return err
		}
	}
	var mismatches []string
	if err := json.Unmarshal(top["verifierSourcePinMismatches"], &mismatches); err != nil || mismatches == nil {
		return errors.New("execution snapshot verifierSourcePinMismatches must be an array")
	}
	return nil
}

func verifyArchivedSnapshot(root string, manifest archiveManifest) error {
	path := filepath.Join(root, archiveSnapshotPath)
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read archived snapshot: %w", err)
	}
	for _, member := range manifest.Members {
		if member.Path == archiveSnapshotPath {
			if int64(len(data)) != member.Bytes || digestHex(data) != member.SHA256 {
				return errors.New("archived execution snapshot differs from its member record")
			}
			return nil
		}
	}
	return errors.New("archive manifest is missing the root execution snapshot member")
}

func equalSourcePins(left, right map[string]sourcePin) bool {
	if len(left) != len(right) {
		return false
	}
	for path, leftPin := range left {
		rightPin, exists := right[path]
		if !exists || leftPin != rightPin {
			return false
		}
	}
	return true
}

func digestHex(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

const effectsArchiveManifestSchema = "gobi.module-effects-archive-manifest/v1"
const effectsExecutionSnapshotSchema = "gobi.module-effects-execution-snapshot/v1"

// EffectsArchiveReport summarizes a verified module-effects archive. The
// report shape matches ArchiveReport so callers can keep archive handling
// independent of the producer's profile-specific schema.
type EffectsArchiveReport = ArchiveReport

type effectsArchiveManifest struct {
	Schema                   string               `json:"schema"`
	SourceCommit             string               `json:"sourceCommit"`
	VerifierGitHead          string               `json:"verifierGitHead"`
	VerifierGitDirty         bool                 `json:"verifierGitDirty"`
	VerifierSourcePinsMatch  bool                 `json:"verifierSourcePinsMatch"`
	SourcePinMismatches      []string             `json:"sourcePinMismatches"`
	TestSourceFilesPinned    []string             `json:"testSourceFilesPinned"`
	SourceClosureScope       effectsSourceScope   `json:"sourceClosureScope"`
	ExcludedDuplicateLogs    []archiveMember      `json:"excludedDuplicateLogs"`
	ExcludedRegenerableFiles []archiveMember      `json:"excludedRegenerableBundles"`
	Members                  []archiveMember      `json:"members"`
	Archive                  archiveFileReference `json:"archive"`
	SourcePins               map[string]sourcePin `json:"sourcePins"`
	ArchivedSnapshotVerified bool                 `json:"archivedSnapshotVerified"`
}

type effectsSourceScope struct {
	Directories            []string         `json:"directories"`
	ExplicitFiles          []string         `json:"explicitFiles"`
	RootGoSum              effectsRootGoSum `json:"rootGoSum"`
	ExcludedDirectoryNames []string         `json:"excludedDirectoryNames"`
	ExcludedFiles          []string         `json:"excludedFiles"`
	ExcludedCompilerLogs   bool             `json:"excludedCompilerLogs"`
}

type effectsRootGoSum struct {
	Path         string `json:"path"`
	Present      bool   `json:"present"`
	EvidencePath string `json:"evidencePath"`
	Reason       string `json:"reason"`
}

type effectsExecutionSnapshot struct {
	Schema                  string               `json:"schema"`
	SourceCommit            string               `json:"sourceCommit"`
	VerifierGitHead         string               `json:"verifierGitHead"`
	VerifierGitDirty        bool                 `json:"verifierGitDirty"`
	VerifierSourcePinsMatch bool                 `json:"verifierSourcePinsMatch"`
	SourcePinMismatches     []string             `json:"sourcePinMismatches"`
	SourcePins              map[string]sourcePin `json:"sourcePins"`
	TestSourceFilesPinned   []string             `json:"testSourceFilesPinned"`
	SourceClosureScope      effectsSourceScope   `json:"sourceClosureScope"`
	Counts                  effectsRunCounts     `json:"counts"`
	Commands                []effectsCommand     `json:"commands"`
}

type effectsRunCounts struct {
	Builds                                        int                      `json:"builds"`
	Conformance                                   effectsConformanceCounts `json:"conformance"`
	NodeTests                                     int                      `json:"nodeTests"`
	ConformanceCaptureMutationControls            int                      `json:"conformanceCaptureMutationControls"`
	BuildAdmissionMutationControls                int                      `json:"buildAdmissionMutationControls"`
	IndependentCaptureMutationControls            int                      `json:"independentCaptureMutationControls"`
	IndependentCaptureMutationControlApplications int                      `json:"independentCaptureMutationControlApplications"`
}

type effectsConformanceCounts struct {
	Scenarios              map[string]int `json:"scenarios"`
	NativeEvents           int            `json:"nativeEvents"`
	NativeStates           int            `json:"nativeStates"`
	NativeEffects          int            `json:"nativeEffects"`
	NativeTransportEvents  int            `json:"nativeTransportEvents"`
	NativeLifecycleEvents  int            `json:"nativeLifecycleEvents"`
	RetiredChildren        int            `json:"retiredChildren"`
	ProfileEvents          int            `json:"profileEvents"`
	Snapshots              int            `json:"snapshots"`
	ProfileTransportEvents int            `json:"profileTransportEvents"`
	LedgerEvents           int            `json:"ledgerEvents"`
	OrderedLedgerEvents    int            `json:"orderedLedgerEvents"`
	EffectLedgerEvents     int            `json:"effectLedgerEvents"`
	LifecycleLedgerEvents  int            `json:"lifecycleLedgerEvents"`
	ProfileRetiredChildren int            `json:"profileRetiredChildren"`
	CallOrderEvents        int            `json:"callOrderEvents"`
	RendererSwaps          int            `json:"rendererSwaps"`
}

type effectsCommand struct {
	Name        string                `json:"name"`
	Command     string                `json:"command"`
	Args        []string              `json:"args"`
	CWD         string                `json:"cwd"`
	Environment map[string]string     `json:"environment"`
	StartedAt   string                `json:"startedAt"`
	CompletedAt string                `json:"completedAt"`
	ExitCode    int                   `json:"exitCode"`
	Signal      *string               `json:"signal"`
	SpawnError  *string               `json:"spawnError"`
	Stdout      effectsCommandOutput  `json:"stdout"`
	Stderr      effectsCommandOutput  `json:"stderr"`
	Stdin       *effectsCommandOutput `json:"stdin,omitempty"`
	StdoutLog   *string               `json:"stdoutLog"`
	StderrLog   *string               `json:"stderrLog"`
}

type effectsCommandOutput struct {
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

var effectsScenarioNames = []string{
	"literal", "seed-20261104", "seed-20261105", "seed-20261106",
}

var effectsRegenerableBundleNames = []string{
	"conformance/effects.literal.browser.bundle.mjs",
	"conformance/effects.seed-20261104.browser.bundle.mjs",
	"conformance/effects.seed-20261105.browser.bundle.mjs",
	"conformance/effects.seed-20261106.browser.bundle.mjs",
}

// VerifyEffectsArchive validates the module-effects v1 archive format, binds
// its exact source snapshot to the archived source members, and atomically
// extracts the complete member set to dest. VerifyArchive intentionally keeps
// accepting only the compiled-modules archive format.
func VerifyEffectsArchive(archivePath, manifestPath, dest string) (report EffectsArchiveReport, returnErr error) {
	if strings.TrimSpace(archivePath) == "" || strings.TrimSpace(manifestPath) == "" || strings.TrimSpace(dest) == "" {
		return EffectsArchiveReport{}, errors.New("archive, manifest, and destination paths are required")
	}
	destAbs, parent, err := prepareDestination(dest)
	if err != nil {
		return EffectsArchiveReport{}, err
	}
	if _, err := os.Lstat(destAbs); err == nil {
		return EffectsArchiveReport{}, errors.New("archive destination already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return EffectsArchiveReport{}, fmt.Errorf("inspect archive destination: %w", err)
	}

	manifestBytes, err := readRegularFile(manifestPath, maxArchiveManifestBytes, "module-effects archive manifest")
	if err != nil {
		return EffectsArchiveReport{}, err
	}
	var manifest effectsArchiveManifest
	if err := DecodeStrict(manifestBytes, &manifest); err != nil {
		return EffectsArchiveReport{}, fmt.Errorf("decode module-effects archive manifest: %w", err)
	}
	if err := validateEffectsManifestJSONShape(manifestBytes); err != nil {
		return EffectsArchiveReport{}, fmt.Errorf("validate module-effects archive manifest fields: %w", err)
	}
	if err := validateEffectsManifest(manifest); err != nil {
		return EffectsArchiveReport{}, err
	}

	archiveBytes, err := readRegularFile(archivePath, maxCompressedArchiveBytes, "module-effects archive")
	if err != nil {
		return EffectsArchiveReport{}, err
	}
	archiveDigest := sha256.Sum256(archiveBytes)
	archiveSHA := hex.EncodeToString(archiveDigest[:])
	if int64(len(archiveBytes)) != manifest.Archive.Bytes || archiveSHA != manifest.Archive.SHA256 {
		return EffectsArchiveReport{}, errors.New("module-effects archive byte length or SHA-256 differs from the manifest")
	}

	stage, err := os.MkdirTemp(parent, ".module-effects-archive-")
	if err != nil {
		return EffectsArchiveReport{}, fmt.Errorf("create module-effects archive staging directory: %w", err)
	}
	keepStage := false
	defer func() {
		if !keepStage {
			if cleanupErr := os.RemoveAll(stage); cleanupErr != nil {
				cleanupFailure := fmt.Errorf("remove failed module-effects archive staging directory: %w", cleanupErr)
				if returnErr == nil {
					report = EffectsArchiveReport{}
					returnErr = cleanupFailure
				} else {
					returnErr = errors.Join(returnErr, cleanupFailure)
				}
			}
		}
	}()
	if err := os.Chmod(stage, 0o700); err != nil {
		return EffectsArchiveReport{}, fmt.Errorf("secure module-effects archive staging directory: %w", err)
	}
	if err := extractExactArchive(archiveBytes, stage, manifest.Members); err != nil {
		return EffectsArchiveReport{}, err
	}
	if err := verifyEffectsSourceClosure(stage, manifest); err != nil {
		return EffectsArchiveReport{}, err
	}
	if err := verifyEffectsArchivedSnapshot(stage, manifest); err != nil {
		return EffectsArchiveReport{}, err
	}
	if _, err := os.Lstat(destAbs); err == nil {
		return EffectsArchiveReport{}, errors.New("archive destination appeared during verification")
	} else if !errors.Is(err, os.ErrNotExist) {
		return EffectsArchiveReport{}, fmt.Errorf("recheck archive destination: %w", err)
	}
	if err := installDirectoryNoReplace(stage, destAbs); err != nil {
		return EffectsArchiveReport{}, fmt.Errorf("publish verified module-effects archive without replacement: %w", err)
	}
	keepStage = true
	return EffectsArchiveReport{Members: len(manifest.Members), Bytes: int64(len(archiveBytes)), SourceCommit: manifest.SourceCommit}, nil
}

func validateEffectsManifestJSONShape(data []byte) error {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(data, &top); err != nil {
		return err
	}
	if err := requireExactJSONFields(top, "module-effects archive manifest", "schema", "sourceCommit", "verifierGitHead", "verifierGitDirty", "verifierSourcePinsMatch", "sourcePinMismatches", "testSourceFilesPinned", "sourceClosureScope", "excludedDuplicateLogs", "excludedRegenerableBundles", "members", "archive", "sourcePins", "archivedSnapshotVerified"); err != nil {
		return err
	}
	if err := validateEffectsScopeJSONShape(top["sourceClosureScope"], "module-effects manifest sourceClosureScope"); err != nil {
		return err
	}
	if err := validateEffectsMemberArrayShape(top["members"], "module-effects manifest members"); err != nil {
		return err
	}
	if err := validateEffectsMemberArrayShape(top["excludedDuplicateLogs"], "module-effects excludedDuplicateLogs"); err != nil {
		return err
	}
	if err := validateEffectsMemberArrayShape(top["excludedRegenerableBundles"], "module-effects excludedRegenerableBundles"); err != nil {
		return err
	}
	var archive map[string]json.RawMessage
	if err := json.Unmarshal(top["archive"], &archive); err != nil {
		return fmt.Errorf("module-effects archive reference must be an object: %w", err)
	}
	if err := requireExactJSONFields(archive, "module-effects archive reference", "path", "bytes", "sha256"); err != nil {
		return err
	}
	return validateEffectsPinsJSONShape(top["sourcePins"], "module-effects sourcePins")
}

func validateEffectsSnapshotJSONShape(data []byte) error {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(data, &top); err != nil {
		return err
	}
	if err := requireExactJSONFields(top, "module-effects execution snapshot", "schema", "sourceCommit", "verifierGitHead", "verifierGitDirty", "verifierSourcePinsMatch", "sourcePinMismatches", "sourcePins", "testSourceFilesPinned", "sourceClosureScope", "counts", "commands"); err != nil {
		return err
	}
	if err := validateEffectsScopeJSONShape(top["sourceClosureScope"], "module-effects snapshot sourceClosureScope"); err != nil {
		return err
	}
	if err := validateEffectsPinsJSONShape(top["sourcePins"], "module-effects snapshot sourcePins"); err != nil {
		return err
	}
	if err := validateEffectsCountsJSONShape(top["counts"]); err != nil {
		return err
	}
	var commands []json.RawMessage
	if err := json.Unmarshal(top["commands"], &commands); err != nil || commands == nil {
		return errors.New("module-effects execution snapshot commands must be an array")
	}
	for index, encoded := range commands {
		var command map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &command); err != nil {
			return fmt.Errorf("module-effects command[%d] must be an object: %w", index, err)
		}
		if err := requireEffectsCommandFields(command, fmt.Sprintf("module-effects command[%d]", index)); err != nil {
			return err
		}
		for _, name := range []string{"stdout", "stderr"} {
			if err := validateEffectsOutputJSONShape(command[name], fmt.Sprintf("module-effects command[%d].%s", index, name)); err != nil {
				return err
			}
		}
		if stdin, ok := command["stdin"]; ok {
			if err := validateEffectsOutputJSONShape(stdin, fmt.Sprintf("module-effects command[%d].stdin", index)); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateEffectsScopeJSONShape(data []byte, label string) error {
	var scope map[string]json.RawMessage
	if err := json.Unmarshal(data, &scope); err != nil {
		return fmt.Errorf("%s must be an object: %w", label, err)
	}
	if err := requireExactJSONFields(scope, label, "directories", "explicitFiles", "rootGoSum", "excludedDirectoryNames", "excludedFiles", "excludedCompilerLogs"); err != nil {
		return err
	}
	var rootGoSum map[string]json.RawMessage
	if err := json.Unmarshal(scope["rootGoSum"], &rootGoSum); err != nil {
		return fmt.Errorf("%s.rootGoSum must be an object: %w", label, err)
	}
	return requireExactJSONFields(rootGoSum, label+".rootGoSum", "path", "present", "evidencePath", "reason")
}

func validateEffectsMemberArrayShape(data []byte, label string) error {
	var members []json.RawMessage
	if err := json.Unmarshal(data, &members); err != nil || members == nil {
		return fmt.Errorf("%s must be an array", label)
	}
	for index, encoded := range members {
		var member map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &member); err != nil {
			return fmt.Errorf("%s[%d] must be an object: %w", label, index, err)
		}
		if err := requireExactJSONFields(member, fmt.Sprintf("%s[%d]", label, index), "path", "bytes", "sha256"); err != nil {
			return err
		}
	}
	return nil
}

func validateEffectsPinsJSONShape(data []byte, label string) error {
	var pins map[string]json.RawMessage
	if err := json.Unmarshal(data, &pins); err != nil || pins == nil {
		return fmt.Errorf("%s must be an object", label)
	}
	for name, encoded := range pins {
		var pin map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &pin); err != nil {
			return fmt.Errorf("%s[%q] must be an object: %w", label, name, err)
		}
		if err := requireExactJSONFields(pin, fmt.Sprintf("%s[%q]", label, name), "bytes", "sha256"); err != nil {
			return err
		}
	}
	return nil
}

func validateEffectsCountsJSONShape(data []byte) error {
	var counts map[string]json.RawMessage
	if err := json.Unmarshal(data, &counts); err != nil {
		return fmt.Errorf("module-effects snapshot counts must be an object: %w", err)
	}
	if err := requireExactJSONFields(counts, "module-effects snapshot counts", "builds", "conformance", "nodeTests", "conformanceCaptureMutationControls", "buildAdmissionMutationControls", "independentCaptureMutationControls", "independentCaptureMutationControlApplications"); err != nil {
		return err
	}
	var conformance map[string]json.RawMessage
	if err := json.Unmarshal(counts["conformance"], &conformance); err != nil {
		return fmt.Errorf("module-effects snapshot conformance counts must be an object: %w", err)
	}
	if err := requireExactJSONFields(conformance, "module-effects snapshot conformance counts", "scenarios", "nativeEvents", "nativeStates", "nativeEffects", "nativeTransportEvents", "nativeLifecycleEvents", "retiredChildren", "profileEvents", "snapshots", "profileTransportEvents", "ledgerEvents", "orderedLedgerEvents", "effectLedgerEvents", "lifecycleLedgerEvents", "profileRetiredChildren", "callOrderEvents", "rendererSwaps"); err != nil {
		return err
	}
	var scenarios map[string]json.RawMessage
	if err := json.Unmarshal(conformance["scenarios"], &scenarios); err != nil || scenarios == nil {
		return errors.New("module-effects snapshot scenario counts must be an object")
	}
	return nil
}

func requireEffectsCommandFields(command map[string]json.RawMessage, label string) error {
	if len(command) != 14 && len(command) != 15 {
		return fmt.Errorf("%s must contain the exact command fields, with optional stdin", label)
	}
	if err := requireJSONFields(command, label, []string{"name", "command", "args", "cwd", "environment", "startedAt", "completedAt", "exitCode", "signal", "spawnError", "stdout", "stderr", "stdoutLog", "stderrLog"}, "stdin"); err != nil {
		return err
	}
	return nil
}

func requireJSONFields(object map[string]json.RawMessage, label string, required []string, optional ...string) error {
	if object == nil || len(object) < len(required) || len(object) > len(required)+len(optional) {
		return fmt.Errorf("%s must contain required fields %v", label, required)
	}
	for _, key := range required {
		if _, exists := object[key]; !exists {
			return fmt.Errorf("%s is missing exact field %q", label, key)
		}
	}
	for key := range object {
		found := false
		for _, allowed := range required {
			if key == allowed {
				found = true
				break
			}
		}
		if !found {
			for _, allowed := range optional {
				if key == allowed {
					found = true
					break
				}
			}
		}
		if !found {
			return fmt.Errorf("%s has unexpected field %q", label, key)
		}
	}
	return nil
}

func validateEffectsOutputJSONShape(data []byte, label string) error {
	var output map[string]json.RawMessage
	if err := json.Unmarshal(data, &output); err != nil {
		return fmt.Errorf("%s must be an object: %w", label, err)
	}
	return requireExactJSONFields(output, label, "bytes", "sha256")
}

func validateEffectsManifest(manifest effectsArchiveManifest) error {
	if manifest.Schema != effectsArchiveManifestSchema {
		return fmt.Errorf("module-effects archive manifest schema must be %q", effectsArchiveManifestSchema)
	}
	if !commitPattern.MatchString(manifest.SourceCommit) || manifest.VerifierGitHead != manifest.SourceCommit {
		return errors.New("module-effects source commit and verifier Git head must be the same 40-character lowercase commit")
	}
	if manifest.VerifierGitDirty || !manifest.VerifierSourcePinsMatch || manifest.SourcePinMismatches == nil || len(manifest.SourcePinMismatches) != 0 || !manifest.ArchivedSnapshotVerified {
		return errors.New("module-effects archive does not attest a clean, source-pin-matched, snapshot-verified run")
	}
	if manifest.Archive.Path == "" || !utf8.ValidString(manifest.Archive.Path) || strings.ContainsRune(manifest.Archive.Path, '\x00') {
		return errors.New("module-effects archive path is empty or invalid")
	}
	if manifest.Archive.Bytes <= 0 || manifest.Archive.Bytes > maxCompressedArchiveBytes || !sha256Pattern.MatchString(manifest.Archive.SHA256) {
		return errors.New("module-effects archive byte count or SHA-256 is invalid")
	}
	if len(manifest.Members) == 0 || len(manifest.Members) > maxArchiveMembers {
		return fmt.Errorf("module-effects archive members count must be between 1 and %d", maxArchiveMembers)
	}
	if manifest.SourcePins == nil || len(manifest.SourcePins) == 0 || len(manifest.SourcePins) > maxArchiveMembers {
		return errors.New("module-effects source pin manifest is empty or exceeds the member limit")
	}
	if manifest.TestSourceFilesPinned == nil || len(manifest.TestSourceFilesPinned) == 0 || !sort.StringsAreSorted(manifest.TestSourceFilesPinned) {
		return errors.New("module-effects testSourceFilesPinned must be a nonempty sorted array")
	}
	if err := validateEffectsSourceScope(manifest.SourceClosureScope, manifest.SourcePins); err != nil {
		return err
	}
	if manifest.ExcludedDuplicateLogs == nil || len(manifest.ExcludedDuplicateLogs) != 0 {
		return errors.New("module-effects excludedDuplicateLogs must be an empty array in schema v1")
	}
	if len(manifest.ExcludedRegenerableFiles) != len(effectsRegenerableBundleNames) {
		return errors.New("module-effects archive must identify exactly the four regenerable browser bundles")
	}
	excludedBundles := make(map[string]struct{}, len(manifest.ExcludedRegenerableFiles))
	for _, bundle := range manifest.ExcludedRegenerableFiles {
		if err := validateEffectsMemberPin(bundle, "excluded regenerable bundle"); err != nil {
			return err
		}
		if _, duplicate := excludedBundles[bundle.Path]; duplicate {
			return fmt.Errorf("module-effects archive repeats excluded regenerable bundle %q", bundle.Path)
		}
		excludedBundles[bundle.Path] = struct{}{}
	}
	for _, expected := range effectsRegenerableBundleNames {
		if _, ok := excludedBundles[expected]; !ok {
			return fmt.Errorf("module-effects archive is missing excluded regenerable bundle %q", expected)
		}
	}

	byPath := make(map[string]archiveMember, len(manifest.Members))
	var declaredBytes int64
	for index, member := range manifest.Members {
		if err := validateArchivePath(member.Path); err != nil {
			return fmt.Errorf("module-effects archive manifest members[%d]: %w", index, err)
		}
		if member.Bytes < 0 || member.Bytes > maxArchiveMemberBytes || !sha256Pattern.MatchString(member.SHA256) {
			return fmt.Errorf("module-effects archive member %q has invalid size or SHA-256", member.Path)
		}
		if _, duplicate := byPath[member.Path]; duplicate {
			return fmt.Errorf("module-effects archive manifest has duplicate member %q", member.Path)
		}
		byPath[member.Path] = member
		if declaredBytes > maxExpandedArchiveBytes-member.Bytes {
			return fmt.Errorf("module-effects archive expanded member bytes exceed %d", maxExpandedArchiveBytes)
		}
		declaredBytes += member.Bytes
		if _, excluded := excludedBundles[member.Path]; excluded {
			return fmt.Errorf("regenerable browser bundle %q must be excluded from archive members", member.Path)
		}
	}
	if err := rejectFileAsParent(byPath); err != nil {
		return err
	}
	if _, ok := byPath[archiveSnapshotPath]; !ok {
		return errors.New("module-effects archive manifest is missing the root execution snapshot")
	}
	for relativePath, pin := range manifest.SourcePins {
		if err := validateArchivePath(relativePath); err != nil {
			return fmt.Errorf("module-effects source pin %q: %w", relativePath, err)
		}
		if pin.Bytes < 0 || pin.Bytes > maxArchiveMemberBytes || !sha256Pattern.MatchString(pin.SHA256) {
			return fmt.Errorf("module-effects source pin %q has invalid size or SHA-256", relativePath)
		}
		row, exists := byPath["source/"+relativePath]
		if !exists || row.Bytes != pin.Bytes || row.SHA256 != pin.SHA256 {
			return fmt.Errorf("module-effects source pin %q does not exactly match its archived source member", relativePath)
		}
	}
	sourceMemberCount := 0
	for name := range byPath {
		if strings.HasPrefix(name, "source/") {
			sourceMemberCount++
			if _, ok := manifest.SourcePins[strings.TrimPrefix(name, "source/")]; !ok {
				return fmt.Errorf("module-effects archived source member %q has no source pin", name)
			}
		}
	}
	if sourceMemberCount != len(manifest.SourcePins) {
		return errors.New("module-effects archived source members and source pin records are not a one-to-one set")
	}
	for _, testPath := range manifest.TestSourceFilesPinned {
		if !isEffectsTestPath(testPath) {
			return fmt.Errorf("module-effects testSourceFilesPinned entry %q is not a test source path", testPath)
		}
		if _, exists := manifest.SourcePins[testPath]; !exists {
			return fmt.Errorf("module-effects test source %q is not present in sourcePins", testPath)
		}
	}
	if !sort.StringsAreSorted(manifest.SourcePinMismatches) {
		return errors.New("module-effects sourcePinMismatches must be a sorted array")
	}
	return nil
}

func validateEffectsMemberPin(member archiveMember, label string) error {
	if err := validateArchivePath(member.Path); err != nil {
		return fmt.Errorf("%s path: %w", label, err)
	}
	if member.Bytes <= 0 || member.Bytes > maxArchiveMemberBytes || !sha256Pattern.MatchString(member.SHA256) {
		return fmt.Errorf("%s %q has invalid size or SHA-256", label, member.Path)
	}
	return nil
}

func validateEffectsSourceScope(scope effectsSourceScope, sourcePins map[string]sourcePin) error {
	if len(scope.Directories) == 0 || len(scope.ExplicitFiles) == 0 || scope.RootGoSum.Path != "go.sum" || scope.RootGoSum.Present ||
		scope.RootGoSum.EvidencePath != "go.mod" || strings.TrimSpace(scope.RootGoSum.Reason) == "" || !scope.ExcludedCompilerLogs {
		return errors.New("module-effects sourceClosureScope is incomplete or does not describe the pinned root module")
	}
	if scope.Directories == nil || scope.ExplicitFiles == nil || scope.ExcludedDirectoryNames == nil || scope.ExcludedFiles == nil {
		return errors.New("module-effects sourceClosureScope arrays must be present")
	}
	directories := make(map[string]struct{}, len(scope.Directories))
	for _, dir := range scope.Directories {
		if err := validateArchivePath(dir); err != nil {
			return fmt.Errorf("module-effects source directory %q: %w", dir, err)
		}
		if _, duplicate := directories[dir]; duplicate {
			return fmt.Errorf("module-effects sourceClosureScope repeats directory %q", dir)
		}
		directories[dir] = struct{}{}
	}
	explicit := make(map[string]struct{}, len(scope.ExplicitFiles))
	for _, file := range scope.ExplicitFiles {
		if err := validateArchivePath(file); err != nil {
			return fmt.Errorf("module-effects explicit source file %q: %w", file, err)
		}
		if _, duplicate := explicit[file]; duplicate {
			return fmt.Errorf("module-effects sourceClosureScope repeats explicit file %q", file)
		}
		explicit[file] = struct{}{}
		if _, exists := sourcePins[file]; !exists {
			return fmt.Errorf("module-effects explicit source file %q has no source pin", file)
		}
	}
	excludedNames := make(map[string]struct{}, len(scope.ExcludedDirectoryNames))
	for _, name := range scope.ExcludedDirectoryNames {
		if name == "" || strings.Contains(name, "/") || name == "." || name == ".." {
			return fmt.Errorf("module-effects sourceClosureScope has invalid excluded directory name %q", name)
		}
		if _, duplicate := excludedNames[name]; duplicate {
			return fmt.Errorf("module-effects sourceClosureScope repeats excluded directory %q", name)
		}
		excludedNames[name] = struct{}{}
	}
	excludedFiles := make(map[string]struct{}, len(scope.ExcludedFiles))
	for _, file := range scope.ExcludedFiles {
		if err := validateArchivePath(file); err != nil {
			return fmt.Errorf("module-effects excluded source file %q: %w", file, err)
		}
		if _, duplicate := excludedFiles[file]; duplicate {
			return fmt.Errorf("module-effects sourceClosureScope repeats excluded file %q", file)
		}
		excludedFiles[file] = struct{}{}
	}
	for file := range sourcePins {
		_, explicitFile := explicit[file]
		insideDirectory := false
		for dir := range directories {
			if strings.HasPrefix(file, dir+"/") {
				insideDirectory = true
				break
			}
		}
		if !explicitFile && !insideDirectory {
			return fmt.Errorf("module-effects source pin %q is outside sourceClosureScope", file)
		}
		if _, excluded := excludedFiles[file]; excluded {
			return fmt.Errorf("module-effects source pin %q is listed as excluded", file)
		}
		segments := strings.Split(file, "/")
		if !explicitFile {
			for _, segment := range segments[:len(segments)-1] {
				if _, excluded := excludedNames[segment]; excluded {
					return fmt.Errorf("module-effects source pin %q uses excluded directory %q", file, segment)
				}
			}
		}
		if scope.ExcludedCompilerLogs && strings.HasPrefix(file, "compiled-frontend/") &&
			(strings.HasSuffix(file, ".log") || strings.HasSuffix(file, ".exit-code")) {
			return fmt.Errorf("module-effects source pin %q uses an excluded compiler log path", file)
		}
	}
	if _, ok := sourcePins[scope.RootGoSum.Path]; ok {
		return errors.New("module-effects rootGoSum claims absence but go.sum is source-pinned")
	}
	return nil
}

func isEffectsTestPath(path string) bool {
	return strings.HasSuffix(path, ".test.mjs") || strings.HasSuffix(path, "_test.go")
}

func validateEffectsSnapshot(snapshot effectsExecutionSnapshot) error {
	if snapshot.Schema != effectsExecutionSnapshotSchema || snapshot.SourceCommit == "" || snapshot.VerifierGitHead != snapshot.SourceCommit ||
		snapshot.VerifierGitDirty || !snapshot.VerifierSourcePinsMatch || snapshot.SourcePinMismatches == nil || len(snapshot.SourcePinMismatches) != 0 {
		return errors.New("module-effects execution snapshot identity is not clean and source-pin-matched")
	}
	if snapshot.SourcePins == nil || len(snapshot.SourcePins) == 0 || snapshot.TestSourceFilesPinned == nil || len(snapshot.TestSourceFilesPinned) == 0 || !sort.StringsAreSorted(snapshot.TestSourceFilesPinned) {
		return errors.New("module-effects execution snapshot is missing source pins or sorted test source files")
	}
	if err := validateEffectsSourceScope(snapshot.SourceClosureScope, snapshot.SourcePins); err != nil {
		return err
	}
	if snapshot.Counts.Builds != 4 || snapshot.Counts.NodeTests <= 0 || snapshot.Counts.Conformance.Scenarios == nil || len(snapshot.Counts.Conformance.Scenarios) != len(effectsScenarioNames) {
		return errors.New("module-effects execution snapshot counts do not describe the four-build, four-scenario profile")
	}
	for _, scenario := range effectsScenarioNames {
		if snapshot.Counts.Conformance.Scenarios[scenario] <= 0 {
			return fmt.Errorf("module-effects execution snapshot has no conformance captures for scenario %q", scenario)
		}
	}
	countValues := []int{
		snapshot.Counts.ConformanceCaptureMutationControls,
		snapshot.Counts.BuildAdmissionMutationControls,
		snapshot.Counts.IndependentCaptureMutationControls,
		snapshot.Counts.IndependentCaptureMutationControlApplications,
		snapshot.Counts.Conformance.NativeEvents,
		snapshot.Counts.Conformance.NativeStates,
		snapshot.Counts.Conformance.NativeEffects,
		snapshot.Counts.Conformance.NativeTransportEvents,
		snapshot.Counts.Conformance.NativeLifecycleEvents,
		snapshot.Counts.Conformance.RetiredChildren,
		snapshot.Counts.Conformance.ProfileEvents,
		snapshot.Counts.Conformance.Snapshots,
		snapshot.Counts.Conformance.ProfileTransportEvents,
		snapshot.Counts.Conformance.LedgerEvents,
		snapshot.Counts.Conformance.OrderedLedgerEvents,
		snapshot.Counts.Conformance.EffectLedgerEvents,
		snapshot.Counts.Conformance.LifecycleLedgerEvents,
		snapshot.Counts.Conformance.ProfileRetiredChildren,
		snapshot.Counts.Conformance.CallOrderEvents,
		snapshot.Counts.Conformance.RendererSwaps,
	}
	for _, count := range countValues {
		if count < 0 {
			return errors.New("module-effects execution snapshot contains a negative count")
		}
	}
	if snapshot.Commands == nil || len(snapshot.Commands) == 0 {
		return errors.New("module-effects execution snapshot commands must be nonempty")
	}
	commandNames := make(map[string]struct{}, len(snapshot.Commands))
	for index, command := range snapshot.Commands {
		if strings.TrimSpace(command.Name) == "" || strings.TrimSpace(command.Command) == "" || strings.TrimSpace(command.CWD) == "" ||
			command.Args == nil || command.Environment == nil || command.ExitCode != 0 || command.Signal != nil || command.SpawnError != nil {
			return fmt.Errorf("module-effects command[%d] is incomplete or did not succeed", index)
		}
		if _, duplicate := commandNames[command.Name]; duplicate {
			return fmt.Errorf("module-effects command name %q is duplicated", command.Name)
		}
		commandNames[command.Name] = struct{}{}
		started, startErr := time.Parse(time.RFC3339Nano, command.StartedAt)
		completed, completeErr := time.Parse(time.RFC3339Nano, command.CompletedAt)
		if startErr != nil || completeErr != nil || completed.Before(started) {
			return fmt.Errorf("module-effects command %q has invalid timestamps", command.Name)
		}
		for label, output := range map[string]effectsCommandOutput{"stdout": command.Stdout, "stderr": command.Stderr} {
			if output.Bytes < 0 || output.Bytes > maxArchiveMemberBytes || !sha256Pattern.MatchString(output.SHA256) {
				return fmt.Errorf("module-effects command %q has invalid %s digest metadata", command.Name, label)
			}
		}
		if command.Stdin != nil && (command.Stdin.Bytes < 0 || command.Stdin.Bytes > maxArchiveMemberBytes || !sha256Pattern.MatchString(command.Stdin.SHA256)) {
			return fmt.Errorf("module-effects command %q has invalid stdin digest metadata", command.Name)
		}
		if command.StdoutLog != nil && *command.StdoutLog == "" || command.StderrLog != nil && *command.StderrLog == "" {
			return fmt.Errorf("module-effects command %q has an empty output log path", command.Name)
		}
	}
	for _, testPath := range snapshot.TestSourceFilesPinned {
		if !isEffectsTestPath(testPath) {
			return fmt.Errorf("module-effects snapshot test source %q is not a test source path", testPath)
		}
		if _, exists := snapshot.SourcePins[testPath]; !exists {
			return fmt.Errorf("module-effects snapshot test source %q is not source-pinned", testPath)
		}
	}
	return nil
}

func verifyEffectsSourceClosure(root string, manifest effectsArchiveManifest) error {
	snapshotBytes, err := os.ReadFile(filepath.Join(root, archiveSnapshotPath))
	if err != nil {
		return fmt.Errorf("read archived module-effects execution snapshot: %w", err)
	}
	var snapshot effectsExecutionSnapshot
	if err := DecodeStrict(snapshotBytes, &snapshot); err != nil {
		return fmt.Errorf("decode archived module-effects execution snapshot: %w", err)
	}
	if err := validateEffectsSnapshotJSONShape(snapshotBytes); err != nil {
		return fmt.Errorf("validate archived module-effects execution snapshot fields: %w", err)
	}
	if err := validateEffectsSnapshot(snapshot); err != nil {
		return err
	}
	if snapshot.SourceCommit != manifest.SourceCommit || snapshot.VerifierGitHead != manifest.VerifierGitHead ||
		snapshot.VerifierGitDirty != manifest.VerifierGitDirty || snapshot.VerifierSourcePinsMatch != manifest.VerifierSourcePinsMatch ||
		!equalSourcePins(snapshot.SourcePins, manifest.SourcePins) ||
		!reflect.DeepEqual(snapshot.SourcePinMismatches, manifest.SourcePinMismatches) ||
		!reflect.DeepEqual(snapshot.TestSourceFilesPinned, manifest.TestSourceFilesPinned) ||
		!reflect.DeepEqual(snapshot.SourceClosureScope, manifest.SourceClosureScope) {
		return errors.New("archived module-effects execution snapshot differs from the manifest source identity")
	}
	return nil
}

func verifyEffectsArchivedSnapshot(root string, manifest effectsArchiveManifest) error {
	data, err := os.ReadFile(filepath.Join(root, archiveSnapshotPath))
	if err != nil {
		return fmt.Errorf("read archived module-effects snapshot: %w", err)
	}
	for _, member := range manifest.Members {
		if member.Path == archiveSnapshotPath {
			if int64(len(data)) != member.Bytes || digestHex(data) != member.SHA256 {
				return errors.New("archived module-effects execution snapshot differs from its member record")
			}
			return nil
		}
	}
	return errors.New("module-effects archive manifest is missing the root execution snapshot member")
}
