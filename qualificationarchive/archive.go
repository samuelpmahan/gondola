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
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"
)

const (
	archiveSchema       = "gobi.backend-qualification-archive/v1"
	archivePolicy       = "explicit stable NUL-separated file inventory; no recursive tar traversal"
	archiveSnapshotPath = "execution-before-archive.json"
	archiveTempPrefix   = "gobi-qualification-archive-"

	maxCompressedArchiveBytes int64 = 64 << 20
	maxExpandedArchiveBytes   int64 = 128 << 20
	maxManifestBytes          int64 = 32 << 20
	maxArchiveMemberBytes     int64 = 32 << 20
	maxArchiveMembers               = 4096
	maxArchivePathBytes             = 4096
	maxArchiveSegmentBytes          = 255
)

var (
	archiveCommitPattern  = regexp.MustCompile(`^[0-9a-f]{40}$`)
	archiveHashPattern    = regexp.MustCompile(`^[0-9a-f]{64}$`)
	archiveAttemptPattern = regexp.MustCompile(`^attempt-[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)
)

// Bundle is the verified, private extraction of a qualification archive.
// Root contains only the regular files admitted by the manifest. Close removes
// the extraction directory created by this Extract call, regardless of later
// changes to the exported Root field.
type Bundle struct {
	Root           string
	ManifestSHA256 string
	ArchiveSHA256  string
	SourceCommit   string
	Members        int

	closeMu   sync.Mutex
	cleanupAt string
	closed    bool
}

// Close removes only the unique temporary directory owned by this Bundle.
// It is safe to call Close more than once, including on a nil Bundle.
func (bundle *Bundle) Close() error {
	if bundle == nil {
		return nil
	}
	bundle.closeMu.Lock()
	defer bundle.closeMu.Unlock()
	if bundle.closed {
		return nil
	}
	if bundle.cleanupAt == "" {
		bundle.closed = true
		return nil
	}
	err := os.RemoveAll(bundle.cleanupAt)
	if err == nil {
		bundle.cleanupAt = ""
		bundle.closed = true
	}
	return err
}

type archiveManifest struct {
	Schema             *string         `json:"schema"`
	Policy             *string         `json:"policy"`
	Attempt            *string         `json:"attempt"`
	SourceCommit       *string         `json:"sourceCommit"`
	Members            *[]manifestFile `json:"members"`
	PreArchiveSnapshot *manifestFile   `json:"preArchiveSnapshot"`
}

type manifestFile struct {
	Path   *string `json:"path"`
	Bytes  *int64  `json:"bytes"`
	SHA256 *string `json:"sha256"`
}

type verifiedMember struct {
	path   string
	bytes  int64
	sha256 string
}

// Extract verifies the archive bytes and manifest, extracts only the exact
// inventoried regular files into a new private directory, and returns their
// verified metadata. It never follows archive paths outside the new root.
func Extract(archivePath, manifestPath, expectedCommit string) (*Bundle, error) {
	if !archiveCommitPattern.MatchString(expectedCommit) {
		return nil, errors.New("expected source commit must be a 40-character lowercase hexadecimal commit")
	}
	if strings.TrimSpace(archivePath) == "" || strings.TrimSpace(manifestPath) == "" {
		return nil, errors.New("archive and manifest paths are required")
	}

	manifestBytes, err := readBoundedRegularFile(manifestPath, maxManifestBytes, "manifest")
	if err != nil {
		return nil, err
	}
	manifestHash := sha256.Sum256(manifestBytes)
	manifest, err := decodeArchiveManifest(manifestBytes)
	if err != nil {
		return nil, err
	}
	members, snapshot, err := validateManifest(manifest, expectedCommit)
	if err != nil {
		return nil, err
	}

	archiveBytes, err := readBoundedRegularFile(archivePath, maxCompressedArchiveBytes, "archive")
	if err != nil {
		return nil, err
	}
	archiveHash := sha256.Sum256(archiveBytes)

	root, err := os.MkdirTemp("", archiveTempPrefix)
	if err != nil {
		return nil, fmt.Errorf("create private extraction directory: %w", err)
	}
	keepRoot := false
	defer func() {
		if !keepRoot {
			_ = os.RemoveAll(root)
		}
	}()
	if err := os.Chmod(root, 0o700); err != nil {
		return nil, fmt.Errorf("secure private extraction directory: %w", err)
	}

	if err := extractVerifiedMembers(archiveBytes, root, members, snapshot); err != nil {
		return nil, err
	}

	keepRoot = true
	return &Bundle{
		Root:           root,
		ManifestSHA256: hex.EncodeToString(manifestHash[:]),
		ArchiveSHA256:  hex.EncodeToString(archiveHash[:]),
		SourceCommit:   *manifest.SourceCommit,
		Members:        len(members),
		cleanupAt:      root,
	}, nil
}

func readBoundedRegularFile(filePath string, limit int64, label string) ([]byte, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", label, err)
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("stat %s: %w", label, err)
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("%s must be a regular file", label)
	}
	if info.Size() > limit {
		return nil, fmt.Errorf("%s exceeds the %d-byte limit", label, limit)
	}
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", label, err)
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("%s exceeds the %d-byte limit", label, limit)
	}
	if int64(len(data)) != info.Size() {
		return nil, fmt.Errorf("%s changed while being read", label)
	}
	return data, nil
}

func decodeArchiveManifest(data []byte) (archiveManifest, error) {
	if !utf8.Valid(data) {
		return archiveManifest{}, errors.New("manifest must be valid UTF-8 JSON")
	}
	if err := archiveRejectDuplicateJSONKeys(data); err != nil {
		return archiveManifest{}, fmt.Errorf("decode manifest: %w", err)
	}
	if err := validateExactManifestKeys(data); err != nil {
		return archiveManifest{}, fmt.Errorf("decode manifest: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var manifest archiveManifest
	if err := decoder.Decode(&manifest); err != nil {
		return archiveManifest{}, fmt.Errorf("decode manifest: %w", err)
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		if err == nil {
			return archiveManifest{}, errors.New("decode manifest: trailing JSON value")
		}
		return archiveManifest{}, fmt.Errorf("decode manifest: trailing data: %w", err)
	}
	return manifest, nil
}

func validateExactManifestKeys(data []byte) error {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(data, &top); err != nil {
		return err
	}
	if err := requireExactJSONKeys(top, []string{"schema", "policy", "attempt", "sourceCommit", "members", "preArchiveSnapshot"}, "manifest"); err != nil {
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
		if err := requireExactJSONKeys(member, []string{"path", "bytes", "sha256"}, fmt.Sprintf("manifest members[%d]", index)); err != nil {
			return err
		}
	}
	var snapshot map[string]json.RawMessage
	if err := json.Unmarshal(top["preArchiveSnapshot"], &snapshot); err != nil {
		return fmt.Errorf("manifest preArchiveSnapshot must be an object: %w", err)
	}
	return requireExactJSONKeys(snapshot, []string{"path", "bytes", "sha256"}, "manifest preArchiveSnapshot")
}

func requireExactJSONKeys(value map[string]json.RawMessage, expected []string, label string) error {
	if value == nil || len(value) != len(expected) {
		return fmt.Errorf("%s must contain exactly the fields %s", label, strings.Join(expected, ", "))
	}
	for _, key := range expected {
		if _, ok := value[key]; !ok {
			return fmt.Errorf("%s must contain exact field %q", label, key)
		}
	}
	return nil
}

func archiveRejectDuplicateJSONKeys(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := archiveConsumeJSONValue(decoder); err != nil {
		return err
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("trailing JSON value")
		}
		return fmt.Errorf("trailing JSON data: %w", err)
	}
	return nil
}

func archiveConsumeJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, isDelimiter := token.(json.Delim)
	if !isDelimiter {
		return nil
	}
	switch delimiter {
	case '{':
		seen := make(map[string]struct{})
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return errors.New("object key is not a string")
			}
			if _, duplicate := seen[key]; duplicate {
				return fmt.Errorf("duplicate object key %q", key)
			}
			seen[key] = struct{}{}
			if err := archiveConsumeJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil {
			return err
		}
		if end != json.Delim('}') {
			return errors.New("object is not terminated")
		}
	case '[':
		for decoder.More() {
			if err := archiveConsumeJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil {
			return err
		}
		if end != json.Delim(']') {
			return errors.New("array is not terminated")
		}
	default:
		return fmt.Errorf("unexpected JSON delimiter %q", delimiter)
	}
	return nil
}

func validateManifest(manifest archiveManifest, expectedCommit string) ([]verifiedMember, verifiedMember, error) {
	if manifest.Schema == nil || *manifest.Schema != archiveSchema {
		return nil, verifiedMember{}, fmt.Errorf("manifest schema must be %q", archiveSchema)
	}
	if manifest.Policy == nil || *manifest.Policy != archivePolicy {
		return nil, verifiedMember{}, errors.New("manifest policy does not match the explicit file-inventory archive policy")
	}
	if manifest.Attempt == nil || !archiveAttemptPattern.MatchString(*manifest.Attempt) {
		return nil, verifiedMember{}, errors.New("manifest attempt must be a safe attempt identifier")
	}
	if manifest.SourceCommit == nil || !archiveCommitPattern.MatchString(*manifest.SourceCommit) {
		return nil, verifiedMember{}, errors.New("manifest sourceCommit must be a 40-character lowercase hexadecimal commit")
	}
	if *manifest.SourceCommit != expectedCommit {
		return nil, verifiedMember{}, errors.New("manifest sourceCommit does not match the expected source commit")
	}
	if manifest.Members == nil || len(*manifest.Members) == 0 {
		return nil, verifiedMember{}, errors.New("manifest must contain a nonempty members array")
	}
	if len(*manifest.Members) > maxArchiveMembers {
		return nil, verifiedMember{}, fmt.Errorf("manifest exceeds the %d-member limit", maxArchiveMembers)
	}
	if manifest.PreArchiveSnapshot == nil {
		return nil, verifiedMember{}, errors.New("manifest preArchiveSnapshot is required")
	}

	members := make([]verifiedMember, 0, len(*manifest.Members))
	byPath := make(map[string]verifiedMember, len(*manifest.Members))
	previousPath := ""
	for index, row := range *manifest.Members {
		if row.Path == nil || row.Bytes == nil || row.SHA256 == nil {
			return nil, verifiedMember{}, fmt.Errorf("manifest members[%d] requires path, bytes, and sha256", index)
		}
		member := verifiedMember{path: *row.Path, bytes: *row.Bytes, sha256: *row.SHA256}
		if err := validateArchivePath(member.path); err != nil {
			return nil, verifiedMember{}, fmt.Errorf("manifest members[%d]: %w", index, err)
		}
		if member.bytes < 0 || member.bytes > maxArchiveMemberBytes {
			return nil, verifiedMember{}, fmt.Errorf("manifest member %q exceeds the %d-byte file limit", member.path, maxArchiveMemberBytes)
		}
		if !archiveHashPattern.MatchString(member.sha256) {
			return nil, verifiedMember{}, fmt.Errorf("manifest member %q has an invalid SHA-256", member.path)
		}
		if _, exists := byPath[member.path]; exists {
			return nil, verifiedMember{}, fmt.Errorf("manifest contains duplicate member path %q", member.path)
		}
		if index > 0 && member.path <= previousPath {
			return nil, verifiedMember{}, errors.New("manifest members must be in strictly sorted path order")
		}
		previousPath = member.path
		byPath[member.path] = member
		members = append(members, member)
	}

	for _, member := range members {
		for parent := path.Dir(member.path); parent != "."; parent = path.Dir(parent) {
			if _, isFile := byPath[parent]; isFile {
				return nil, verifiedMember{}, fmt.Errorf("manifest file path %q is also a parent of another member", parent)
			}
		}
	}

	snapshotRow := manifest.PreArchiveSnapshot
	if snapshotRow.Path == nil || snapshotRow.Bytes == nil || snapshotRow.SHA256 == nil {
		return nil, verifiedMember{}, errors.New("manifest preArchiveSnapshot requires path, bytes, and sha256")
	}
	snapshot := verifiedMember{path: *snapshotRow.Path, bytes: *snapshotRow.Bytes, sha256: *snapshotRow.SHA256}
	if snapshot.path != archiveSnapshotPath {
		return nil, verifiedMember{}, fmt.Errorf("manifest preArchiveSnapshot path must be %q", archiveSnapshotPath)
	}
	if err := validateArchivePath(snapshot.path); err != nil {
		return nil, verifiedMember{}, fmt.Errorf("manifest preArchiveSnapshot: %w", err)
	}
	if snapshot.bytes < 0 || snapshot.bytes > maxArchiveMemberBytes || !archiveHashPattern.MatchString(snapshot.sha256) {
		return nil, verifiedMember{}, errors.New("manifest preArchiveSnapshot size or SHA-256 is invalid")
	}
	member, ok := byPath[snapshot.path]
	if !ok || member != snapshot {
		return nil, verifiedMember{}, errors.New("manifest preArchiveSnapshot does not exactly match an inventoried member")
	}
	return members, snapshot, nil
}

func validateArchivePath(name string) error {
	if name == "" || len(name) > maxArchivePathBytes || !utf8.ValidString(name) {
		return errors.New("archive member path is empty, too long, or invalid UTF-8")
	}
	if strings.ContainsAny(name, "\\\x00") || path.IsAbs(name) || filepath.IsAbs(name) || path.Clean(name) != name {
		return fmt.Errorf("archive member path %q is absolute or not normalized", name)
	}
	if strings.Contains(name, ":") {
		return fmt.Errorf("archive member path %q contains a drive or stream separator", name)
	}
	segments := strings.Split(name, "/")
	for _, segment := range segments {
		if segment == "" || segment == "." || segment == ".." {
			return fmt.Errorf("archive member path %q contains an ambiguous path segment", name)
		}
		if len(segment) > maxArchiveSegmentBytes {
			return fmt.Errorf("archive member path %q has a segment over the %d-byte portable limit", name, maxArchiveSegmentBytes)
		}
		if strings.ContainsAny(segment, "<>\"|?*") || strings.HasSuffix(segment, ".") || strings.HasSuffix(segment, " ") {
			return fmt.Errorf("archive member path %q contains a nonportable segment", name)
		}
		for _, r := range segment {
			if r < 0x20 || r == 0x7f {
				return fmt.Errorf("archive member path %q contains a control character", name)
			}
		}
	}
	return nil
}

func extractVerifiedMembers(archiveBytes []byte, root string, members []verifiedMember, snapshot verifiedMember) error {
	compressedReader := bytes.NewReader(archiveBytes)
	gzipReader, err := gzip.NewReader(compressedReader)
	if err != nil {
		return fmt.Errorf("open gzip archive: %w", err)
	}
	gzipReader.Multistream(false)
	defer gzipReader.Close()

	limited := &io.LimitedReader{R: gzipReader, N: maxExpandedArchiveBytes + 1}
	tarReader := tar.NewReader(limited)
	byPath := make(map[string]verifiedMember, len(members))
	for _, member := range members {
		byPath[member.path] = member
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
		if header.Size < 0 || header.Size > maxArchiveMemberBytes || header.Size != member.bytes {
			return fmt.Errorf("tar member %q size differs from the manifest or exceeds the file limit", header.Name)
		}
		if header.Name == snapshot.path && header.Size != snapshot.bytes {
			return errors.New("tar preArchiveSnapshot size differs from its manifest record")
		}

		destination, err := safeDestination(root, header.Name)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
			return fmt.Errorf("create parent directory for %q: %w", header.Name, err)
		}
		output, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			return fmt.Errorf("create extracted member %q: %w", header.Name, err)
		}
		digest := sha256.New()
		written, copyErr := io.CopyN(io.MultiWriter(output, digest), tarReader, header.Size)
		closeErr := output.Close()
		if copyErr != nil {
			return fmt.Errorf("extract member %q: %w", header.Name, copyErr)
		}
		if closeErr != nil {
			return fmt.Errorf("close extracted member %q: %w", header.Name, closeErr)
		}
		if written != member.bytes {
			return fmt.Errorf("extracted member %q byte count differs from the manifest", header.Name)
		}
		if hex.EncodeToString(digest.Sum(nil)) != member.sha256 {
			return fmt.Errorf("extracted member %q SHA-256 differs from the manifest", header.Name)
		}
		seen[header.Name] = struct{}{}
	}
	if len(seen) != len(members) {
		for _, member := range members {
			if _, ok := seen[member.path]; !ok {
				return fmt.Errorf("tar archive is missing manifest member %q", member.path)
			}
		}
	}

	if err := drainTarPadding(limited); err != nil {
		return err
	}
	expanded := maxExpandedArchiveBytes + 1 - limited.N
	if expanded > maxExpandedArchiveBytes {
		return fmt.Errorf("expanded archive exceeds the %d-byte limit", maxExpandedArchiveBytes)
	}
	if compressedReader.Len() != 0 {
		return errors.New("gzip archive has trailing or concatenated compressed data")
	}
	return nil
}

func safeDestination(root, archivePath string) (string, error) {
	destination := filepath.Join(root, filepath.FromSlash(archivePath))
	relative, err := filepath.Rel(root, destination)
	if err != nil {
		return "", fmt.Errorf("resolve extracted member %q: %w", archivePath, err)
	}
	if relative == "." || relative == ".." || filepath.IsAbs(relative) || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("archive member path %q escapes the extraction root", archivePath)
	}
	return destination, nil
}

func drainTarPadding(reader io.Reader) error {
	var buffer [32 * 1024]byte
	for {
		count, err := reader.Read(buffer[:])
		for _, value := range buffer[:count] {
			if value != 0 {
				return errors.New("tar archive contains nonzero data after its end marker")
			}
		}
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("finish gzip archive stream: %w", err)
		}
		if count == 0 {
			return errors.New("gzip archive stream made no progress")
		}
	}
}
