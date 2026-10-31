package modulequalification

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	qualificationMaxFiles      = 4096
	qualificationMaxEntries    = 8192
	qualificationMaxTotalBytes = int64(128 << 20)
	qualificationMaxFileBytes  = int64(32 << 20)
)

// SourcePin names the archive validator's exact size/digest record for a
// source file. The alias keeps the verifier and archive parser on one schema.
type SourcePin = sourcePin

// InputPin identifies one file actually present in the verified profile root.
type InputPin struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

// SourceIdentity is the bounded source provenance recovered from the profile
// snapshot and checked against the archived source copies.
type SourceIdentity struct {
	Head                 string `json:"head"`
	Dirty                bool   `json:"dirty"`
	SourcePinsMatch      bool   `json:"sourcePinsMatch"`
	BeforeStatus         string `json:"beforeStatus"`
	AfterStatus          string `json:"afterStatus"`
	SourcePinCount       int    `json:"sourcePinCount"`
	SourcePinBytes       int64  `json:"sourcePinBytes"`
	ArchivedSourceChecks int    `json:"archivedSourceChecks"`
}

// ABICheck describes the exact finite ABI boundary that CheckABIs accepted.
type ABICheck struct {
	Status string `json:"status"`
	Builds int    `json:"builds"`
	Pairs  int    `json:"pairs"`
}

// ArchiveSummary uses stable report JSON names independent of the transport
// helper's Go field tags.
type ArchiveSummary struct {
	Members      int    `json:"members"`
	Bytes        int64  `json:"bytes"`
	SourceCommit string `json:"sourceCommit"`
}

// Report combines native capture and ABI checks with hashes of the verified
// input tree. It does not represent a browser-run mutation-control certificate.
type Report struct {
	Schema         string          `json:"schema"`
	SourceCommit   string          `json:"sourceCommit"`
	SourceIdentity SourceIdentity  `json:"sourceIdentity"`
	Inputs         []InputPin      `json:"inputs"`
	Capture        CaptureReport   `json:"capture"`
	ABI            ABICheck        `json:"abi"`
	Archive        *ArchiveSummary `json:"archive,omitempty"`
	Scope          []string        `json:"scope"`
}

type sourceClosureBefore struct {
	Head                string   `json:"head"`
	Dirty               bool     `json:"dirty"`
	Status              string   `json:"status"`
	SourcePinsMatch     bool     `json:"sourcePinsMatch"`
	SourcePinMismatches []string `json:"sourcePinMismatches"`
}

type sourceClosureAfter struct {
	Head   string `json:"head"`
	Dirty  bool   `json:"dirty"`
	Status string `json:"status"`
}

type runnerContext struct {
	Schema            string            `json:"schema"`
	SourceCommit      string            `json:"sourceCommit"`
	VerifierGitHead   string            `json:"verifierGitHead"`
	VerifierGitDirty  bool              `json:"verifierGitDirty"`
	VerifierGitStatus string            `json:"verifierGitStatus"`
	Tools             map[string]string `json:"tools"`
	Fixture           struct {
		Path   string `json:"path"`
		SHA256 string `json:"sha256"`
	} `json:"fixture"`
}

// VerifyDirectory validates one complete compiled-module attempt directory.
// It uses only the Go capture and ABI validators and hashes the tree contents
// before returning a report.
func VerifyDirectory(root string) (Report, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return Report{}, fmt.Errorf("resolve module qualification root: %w", err)
	}
	info, err := os.Lstat(absRoot)
	if err != nil {
		return Report{}, fmt.Errorf("stat module qualification root %q: %w", root, err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return Report{}, fmt.Errorf("module qualification root %q is not an ordinary directory", root)
	}

	identity, sourcePins, err := readSourceIdentity(absRoot)
	if err != nil {
		return Report{}, fmt.Errorf("source identity: %w", err)
	}
	inputsBefore, err := hashInputFiles(absRoot)
	if err != nil {
		return Report{}, fmt.Errorf("hash profile inputs before validation: %w", err)
	}

	abiErr := CheckABIs(absRoot)
	capture, captureErr := CheckCaptures(absRoot)
	if abiErr != nil || captureErr != nil {
		parts := make([]string, 0, 2)
		if abiErr != nil {
			parts = append(parts, "ABI: "+abiErr.Error())
		}
		if captureErr != nil {
			parts = append(parts, "capture: "+captureErr.Error())
		}
		return Report{}, errors.New("module qualification failed: " + strings.Join(parts, "; "))
	}

	inputsAfter, err := hashInputFiles(absRoot)
	if err != nil {
		return Report{}, fmt.Errorf("hash profile inputs after validation: %w", err)
	}
	if !sameInputPins(inputsBefore, inputsAfter) {
		return Report{}, fmt.Errorf("profile input files changed during validation")
	}
	for _, pin := range sourcePins {
		wantPath := "source/" + pin.path
		found := false
		for _, input := range inputsAfter {
			if input.Path == wantPath {
				found = input.Bytes == pin.pin.Bytes && input.SHA256 == pin.pin.SHA256
				break
			}
		}
		if !found {
			return Report{}, fmt.Errorf("source identity: input inventory changed after pin check at %s", wantPath)
		}
	}

	return Report{
		Schema:         "gobi.module-qualification-report/v1",
		SourceCommit:   identity.Head,
		SourceIdentity: identity,
		Inputs:         inputsBefore,
		Capture:        capture,
		ABI:            ABICheck{Status: "passed", Builds: 4, Pairs: 2},
		Scope: []string{
			"source identity and embedded source pins checked against actual source/<path> bytes",
			"Go-native ABI checks for the four React/DOM parent/child builds and two module pairs",
			"Go-native fixed and seeded capture checks returned by CheckCaptures",
			"no browser is launched by this verifier",
			"producer-captured mutation-control metadata is not treated as Go-executed negative-control proof",
			"sourceCommit is checked for format and internal consistency; this report does not authenticate Git history or verifier-build provenance",
		},
	}, nil
}

type namedSourcePin struct {
	path string
	pin  SourcePin
}

func readSourceIdentity(root string) (SourceIdentity, []namedSourcePin, error) {
	metadataDir := filepath.Join(root, "metadata")
	var before sourceClosureBefore
	if err := decodeFile(filepath.Join(metadataDir, "git-source-closure.json"), &before); err != nil {
		return SourceIdentity{}, nil, fmt.Errorf("decode metadata/git-source-closure.json: %w", err)
	}
	var after sourceClosureAfter
	if err := decodeFile(filepath.Join(metadataDir, "git-source-closure-after.json"), &after); err != nil {
		return SourceIdentity{}, nil, fmt.Errorf("decode metadata/git-source-closure-after.json: %w", err)
	}
	var context runnerContext
	if err := decodeFile(filepath.Join(metadataDir, "runner-context.json"), &context); err != nil {
		return SourceIdentity{}, nil, fmt.Errorf("decode metadata/runner-context.json: %w", err)
	}
	var snapshot executionSnapshot
	if err := decodeFile(filepath.Join(root, "execution-before-archive.json"), &snapshot); err != nil {
		return SourceIdentity{}, nil, fmt.Errorf("decode execution-before-archive.json: %w", err)
	}
	var pinsBefore map[string]SourcePin
	if err := decodeFile(filepath.Join(metadataDir, "source-pins-before.json"), &pinsBefore); err != nil {
		return SourceIdentity{}, nil, fmt.Errorf("decode metadata/source-pins-before.json: %w", err)
	}
	var pinsAfter map[string]SourcePin
	if err := decodeFile(filepath.Join(metadataDir, "source-pins-after.json"), &pinsAfter); err != nil {
		return SourceIdentity{}, nil, fmt.Errorf("decode metadata/source-pins-after.json: %w", err)
	}

	if snapshot.Schema != "gobi.compiled-modules-execution-snapshot/v1" ||
		context.Schema != "gobi.compiled-modules-run-context/v1" {
		return SourceIdentity{}, nil, fmt.Errorf("unexpected source identity schema: snapshot=%q runner=%q", snapshot.Schema, context.Schema)
	}
	head := before.Head
	if !isGitCommit(head) || before.Dirty || before.Status != "" || !before.SourcePinsMatch || len(before.SourcePinMismatches) != 0 {
		return SourceIdentity{}, nil, fmt.Errorf("pre-run Git/source closure is not clean and complete")
	}
	if after.Head != head || after.Dirty || after.Status != "" {
		return SourceIdentity{}, nil, fmt.Errorf("post-run source identity differs or is dirty (head=%q dirty=%t status=%q)", after.Head, after.Dirty, after.Status)
	}
	if snapshot.SourceCommit != head || snapshot.VerifierGitHead != head || snapshot.VerifierGitDirty ||
		!snapshot.VerifierSourcePinsMatch || len(snapshot.VerifierSourcePinMismatches) != 0 {
		return SourceIdentity{}, nil, fmt.Errorf("execution snapshot source identity does not match clean Git closure")
	}
	if context.SourceCommit != head || context.VerifierGitHead != head || context.VerifierGitDirty || context.VerifierGitStatus != "" {
		return SourceIdentity{}, nil, fmt.Errorf("runner context source identity does not match clean Git closure")
	}
	if len(snapshot.SourcePins) == 0 || !sameSourcePins(snapshot.SourcePins, pinsBefore) || !sameSourcePins(pinsBefore, pinsAfter) {
		return SourceIdentity{}, nil, fmt.Errorf("source pin manifests disagree")
	}
	if len(snapshot.SourcePins) > qualificationMaxFiles {
		return SourceIdentity{}, nil, fmt.Errorf("source pin manifest exceeds %d entries", qualificationMaxFiles)
	}

	paths := make([]string, 0, len(snapshot.SourcePins))
	for path := range snapshot.SourcePins {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	named := make([]namedSourcePin, 0, len(paths))
	var total int64
	for _, path := range paths {
		pin := snapshot.SourcePins[path]
		if !validSourcePath(path) {
			return SourceIdentity{}, nil, fmt.Errorf("invalid source pin path %q", path)
		}
		if pin.Bytes < 0 || pin.Bytes > qualificationMaxFileBytes || !isSHA256(pin.SHA256) {
			return SourceIdentity{}, nil, fmt.Errorf("invalid source pin metadata for %s", path)
		}
		total += pin.Bytes
		if total > qualificationMaxTotalBytes {
			return SourceIdentity{}, nil, fmt.Errorf("source pin bytes exceed %d", qualificationMaxTotalBytes)
		}
		actual, err := hashRegularFile(root, filepath.ToSlash(filepath.Join("source", filepath.FromSlash(path))))
		if err != nil {
			return SourceIdentity{}, nil, fmt.Errorf("verify source/%s: %w", path, err)
		}
		if actual.Bytes != pin.Bytes || actual.SHA256 != pin.SHA256 {
			return SourceIdentity{}, nil, fmt.Errorf("source pin mismatch at source/%s: got %d bytes %s, want %d bytes %s", path, actual.Bytes, actual.SHA256, pin.Bytes, pin.SHA256)
		}
		named = append(named, namedSourcePin{path: path, pin: pin})
	}
	fixturePin, ok := snapshot.SourcePins[context.Fixture.Path]
	if context.Fixture.Path == "" || !ok || !isSHA256(context.Fixture.SHA256) || context.Fixture.SHA256 != fixturePin.SHA256 {
		return SourceIdentity{}, nil, fmt.Errorf("runner context fixture is not bound to the source pin manifest")
	}

	return SourceIdentity{
		Head:                 head,
		Dirty:                false,
		SourcePinsMatch:      true,
		BeforeStatus:         before.Status,
		AfterStatus:          after.Status,
		SourcePinCount:       len(named),
		SourcePinBytes:       total,
		ArchivedSourceChecks: len(named),
	}, named, nil
}

func decodeFile(path string, out any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return DecodeStrict(data, out)
}

func sameSourcePins(left, right map[string]SourcePin) bool {
	if len(left) != len(right) {
		return false
	}
	for path, pin := range left {
		if other, ok := right[path]; !ok || other != pin {
			return false
		}
	}
	return true
}

func sameInputPins(left, right []InputPin) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}

func isGitCommit(value string) bool {
	if len(value) != 40 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil && value == strings.ToLower(value)
}

func isSHA256(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil && value == strings.ToLower(value)
}

func validSourcePath(path string) bool {
	if path == "" || !utf8.ValidString(path) || strings.Contains(path, "\\") || strings.HasPrefix(path, "/") || filepath.ToSlash(filepath.Clean(filepath.FromSlash(path))) != path {
		return false
	}
	for _, segment := range strings.Split(path, "/") {
		if segment == "" || segment == "." || segment == ".." || len(segment) > 255 {
			return false
		}
	}
	return len(path) <= 4096
}

func hashRegularFile(root, slashPath string) (InputPin, error) {
	if !validSourcePath(slashPath) {
		return InputPin{}, fmt.Errorf("invalid relative file path %q", slashPath)
	}
	current := root
	segments := strings.Split(slashPath, "/")
	for index, segment := range segments {
		current = filepath.Join(current, segment)
		info, err := os.Lstat(current)
		if err != nil {
			return InputPin{}, err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return InputPin{}, fmt.Errorf("path component %q is a symlink", slashPath)
		}
		if index < len(segments)-1 && !info.IsDir() {
			return InputPin{}, fmt.Errorf("path component %q is not a directory", slashPath)
		}
		if index == len(segments)-1 && !info.Mode().IsRegular() {
			return InputPin{}, fmt.Errorf("path %q is not a regular file", slashPath)
		}
	}

	before, err := os.Lstat(current)
	if err != nil {
		return InputPin{}, err
	}
	if before.Size() < 0 || before.Size() > qualificationMaxFileBytes {
		return InputPin{}, fmt.Errorf("file size %d exceeds limit", before.Size())
	}
	file, err := os.Open(current)
	if err != nil {
		return InputPin{}, err
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil {
		return InputPin{}, err
	}
	if !opened.Mode().IsRegular() || !os.SameFile(before, opened) {
		return InputPin{}, fmt.Errorf("file identity changed while opening")
	}
	hash := sha256.New()
	bytesRead, err := io.Copy(hash, file)
	if err != nil {
		return InputPin{}, err
	}
	after, err := file.Stat()
	if err != nil {
		return InputPin{}, err
	}
	pathAfter, err := os.Lstat(current)
	if err != nil {
		return InputPin{}, err
	}
	if !os.SameFile(opened, after) || !os.SameFile(after, pathAfter) ||
		before.Size() != bytesRead || after.Size() != bytesRead ||
		before.ModTime() != after.ModTime() {
		return InputPin{}, fmt.Errorf("file changed while hashing")
	}
	return InputPin{Path: slashPath, Bytes: bytesRead, SHA256: hex.EncodeToString(hash.Sum(nil))}, nil
}

func hashInputFiles(root string) ([]InputPin, error) {
	rootInfo, err := os.Lstat(root)
	if err != nil {
		return nil, err
	}
	if !rootInfo.IsDir() || rootInfo.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("input root is not an ordinary directory")
	}
	var paths []string
	entriesSeen := 0
	err = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == root {
			return nil
		}
		entriesSeen++
		if entriesSeen > qualificationMaxEntries {
			return fmt.Errorf("input tree exceeds %d entries", qualificationMaxEntries)
		}
		info, err := os.Lstat(path)
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("input tree contains symlink %q", path)
		}
		if entry.IsDir() {
			return nil
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("input tree contains non-regular file %q", path)
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		slash := filepath.ToSlash(rel)
		if !validSourcePath(slash) {
			return fmt.Errorf("input tree contains invalid path %q", slash)
		}
		paths = append(paths, slash)
		if len(paths) > qualificationMaxFiles {
			return fmt.Errorf("input tree exceeds %d files", qualificationMaxFiles)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(paths)
	pins := make([]InputPin, 0, len(paths))
	var total int64
	for _, path := range paths {
		pin, err := hashRegularFile(root, path)
		if err != nil {
			return nil, fmt.Errorf("hash %s: %w", path, err)
		}
		total += pin.Bytes
		if total > qualificationMaxTotalBytes {
			return nil, fmt.Errorf("input tree exceeds %d bytes", qualificationMaxTotalBytes)
		}
		pins = append(pins, pin)
	}
	// Re-enumerate after streaming hashes so additions/removals during the pass
	// cannot silently produce a report for a partial file set.
	var finalPaths []string
	finalEntriesSeen := 0
	err = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == root {
			return nil
		}
		finalEntriesSeen++
		if finalEntriesSeen > qualificationMaxEntries {
			return fmt.Errorf("input tree exceeds %d entries", qualificationMaxEntries)
		}
		if entry.IsDir() {
			return nil
		}
		info, err := os.Lstat(path)
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			return fmt.Errorf("input tree changed to contain an unsafe entry %q", path)
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		finalPaths = append(finalPaths, filepath.ToSlash(rel))
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(finalPaths)
	if len(finalPaths) != len(paths) {
		return nil, fmt.Errorf("input file set changed while hashing")
	}
	for i := range paths {
		if paths[i] != finalPaths[i] {
			return nil, fmt.Errorf("input file set changed while hashing at %s", paths[i])
		}
	}
	return pins, nil
}
