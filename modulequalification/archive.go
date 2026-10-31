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
	"regexp"
	"strings"
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
