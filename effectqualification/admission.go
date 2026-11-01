package effectqualification

import (
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
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/moduleabi"
	"github.com/samuelpmahan/gondola/modulequalification"
)

const (
	admissionFixtureSourceCommit = "e0933465725e470dc610e3f81b4bbee95538c1d0"
	maxAdmissionFiles            = 16384
	maxAdmissionFileBytes        = int64(128 << 20)
	maxAdmissionTotal            = int64(1 << 30)
)

// InputPin is the independently computed size and digest of one regular file
// in the accepted directory tree.
type InputPin struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

// SourceIdentity reports the provenance assertions that were checked
// against the archived source bytes. Head is a format and consistency pin;
// this offline verifier does not authenticate Git history or the producer.
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

// ABICheck summarizes checks derived from all four exact output trees.
type ABICheck struct {
	Status string `json:"status"`
	Builds int    `json:"builds"`
	Pairs  int    `json:"pairs"`
}

// ArchiveSummary is populated by the CLI after its archive verifier has
// independently validated and extracted an effects archive.
type ArchiveSummary struct {
	Members      int    `json:"members"`
	Bytes        int64  `json:"bytes"`
	SourceCommit string `json:"sourceCommit"`
}

// Report combines native capture, ordering, ABI, and exact input-tree checks.
// It does not claim browser execution or authenticated source provenance.
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

type namedSourcePin struct {
	path string
	pin  modulequalification.SourcePin
}

type effectSourceClosureBefore struct {
	Head                string   `json:"head"`
	Dirty               bool     `json:"dirty"`
	Status              string   `json:"status"`
	SourcePinsMatch     bool     `json:"sourcePinsMatch"`
	SourcePinMismatches []string `json:"sourcePinMismatches"`
}

type effectSourceClosureAfter struct {
	Head   string `json:"head"`
	Dirty  bool   `json:"dirty"`
	Status string `json:"status"`
}

type effectRunnerContext struct {
	Schema                  string            `json:"schema"`
	SourceCommit            string            `json:"sourceCommit"`
	VerifierGitHead         string            `json:"verifierGitHead"`
	VerifierGitDirty        bool              `json:"verifierGitDirty"`
	VerifierSourcePinsMatch bool              `json:"verifierSourcePinsMatch"`
	SourcePinMismatches     []string          `json:"sourcePinMismatches"`
	Tools                   map[string]string `json:"tools"`
	SourceClosureScope      json.RawMessage   `json:"sourceClosureScope"`
	DirtyAllowed            bool              `json:"dirtyAllowed"`
}

type effectExecutionSnapshot struct {
	Schema                  string                                   `json:"schema"`
	SourceCommit            string                                   `json:"sourceCommit"`
	VerifierGitHead         string                                   `json:"verifierGitHead"`
	VerifierGitDirty        bool                                     `json:"verifierGitDirty"`
	VerifierSourcePinsMatch bool                                     `json:"verifierSourcePinsMatch"`
	SourcePinMismatches     []string                                 `json:"sourcePinMismatches"`
	SourcePins              map[string]modulequalification.SourcePin `json:"sourcePins"`
	TestSourceFilesPinned   []string                                 `json:"testSourceFilesPinned"`
	SourceClosureScope      json.RawMessage                          `json:"sourceClosureScope"`
	Counts                  json.RawMessage                          `json:"counts"`
	Commands                json.RawMessage                          `json:"commands"`
}

func readSourceIdentity(root string) (SourceIdentity, []namedSourcePin, error) {
	metadataDir := filepath.Join(root, "metadata")
	var before effectSourceClosureBefore
	if err := decodeAdmissionFile(filepath.Join(metadataDir, "git-source-closure.json"), &before); err != nil {
		return SourceIdentity{}, nil, fmt.Errorf("decode metadata/git-source-closure.json: %w", err)
	}
	var after effectSourceClosureAfter
	if err := decodeAdmissionFile(filepath.Join(metadataDir, "git-source-closure-after.json"), &after); err != nil {
		return SourceIdentity{}, nil, fmt.Errorf("decode metadata/git-source-closure-after.json: %w", err)
	}
	var context effectRunnerContext
	if err := decodeAdmissionFile(filepath.Join(metadataDir, "runner-context.json"), &context); err != nil {
		return SourceIdentity{}, nil, fmt.Errorf("decode metadata/runner-context.json: %w", err)
	}
	var snapshot effectExecutionSnapshot
	if err := decodeAdmissionFile(filepath.Join(root, "execution-before-archive.json"), &snapshot); err != nil {
		return SourceIdentity{}, nil, fmt.Errorf("decode execution-before-archive.json: %w", err)
	}
	var pinsBefore map[string]modulequalification.SourcePin
	if err := decodeAdmissionFile(filepath.Join(metadataDir, "source-pins-before.json"), &pinsBefore); err != nil {
		return SourceIdentity{}, nil, fmt.Errorf("decode metadata/source-pins-before.json: %w", err)
	}
	var pinsAfter map[string]modulequalification.SourcePin
	if err := decodeAdmissionFile(filepath.Join(metadataDir, "source-pins-after.json"), &pinsAfter); err != nil {
		return SourceIdentity{}, nil, fmt.Errorf("decode metadata/source-pins-after.json: %w", err)
	}

	if snapshot.Schema != "gobi.module-effects-execution-snapshot/v1" || context.Schema != "gobi.module-effects-run-context/v1" {
		return SourceIdentity{}, nil, fmt.Errorf("unexpected source identity schemas: snapshot=%q runner=%q", snapshot.Schema, context.Schema)
	}
	head := before.Head
	if !isAdmissionCommit(head) || before.Dirty || before.Status != "" || !before.SourcePinsMatch || before.SourcePinMismatches == nil || len(before.SourcePinMismatches) != 0 {
		return SourceIdentity{}, nil, errors.New("pre-run source closure is not a clean, canonical source identity")
	}
	if after.Head != head || after.Dirty || after.Status != "" {
		return SourceIdentity{}, nil, fmt.Errorf("post-run source identity differs or is dirty (head=%q dirty=%t status=%q)", after.Head, after.Dirty, after.Status)
	}
	if context.SourceCommit != head || context.VerifierGitHead != head || context.VerifierGitDirty || !context.VerifierSourcePinsMatch || context.SourcePinMismatches == nil || len(context.SourcePinMismatches) != 0 || context.DirtyAllowed {
		return SourceIdentity{}, nil, errors.New("runner source identity does not match the clean pinned source closure")
	}
	if snapshot.SourceCommit != head || snapshot.VerifierGitHead != head || snapshot.VerifierGitDirty || !snapshot.VerifierSourcePinsMatch || snapshot.SourcePinMismatches == nil || len(snapshot.SourcePinMismatches) != 0 {
		return SourceIdentity{}, nil, errors.New("execution snapshot source identity does not match the clean pinned source closure")
	}
	if len(snapshot.SourcePins) == 0 || !sameEffectSourcePins(snapshot.SourcePins, pinsBefore) || !sameEffectSourcePins(pinsBefore, pinsAfter) {
		return SourceIdentity{}, nil, errors.New("source pin manifests disagree")
	}
	if len(snapshot.SourcePins) > maxAdmissionFiles {
		return SourceIdentity{}, nil, fmt.Errorf("source pin manifest exceeds %d entries", maxAdmissionFiles)
	}
	if _, ok := snapshot.SourcePins["EXPECTED.json"]; !ok {
		return SourceIdentity{}, nil, errors.New("source pin manifest does not preserve EXPECTED.json")
	}
	if _, ok := snapshot.SourcePins["SHA256SUMS"]; !ok {
		return SourceIdentity{}, nil, errors.New("source pin manifest does not preserve SHA256SUMS")
	}

	paths := make([]string, 0, len(snapshot.SourcePins))
	for name := range snapshot.SourcePins {
		paths = append(paths, name)
	}
	sort.Strings(paths)
	named := make([]namedSourcePin, 0, len(paths))
	var total int64
	for _, name := range paths {
		pin := snapshot.SourcePins[name]
		if !validAdmissionRelativePath(name) {
			return SourceIdentity{}, nil, fmt.Errorf("invalid source pin path %q", name)
		}
		if pin.Bytes < 0 || pin.Bytes > maxAdmissionFileBytes || !isAdmissionSHA256(pin.SHA256) {
			return SourceIdentity{}, nil, fmt.Errorf("invalid source pin metadata for %s", name)
		}
		total += pin.Bytes
		if total > maxAdmissionTotal {
			return SourceIdentity{}, nil, fmt.Errorf("source pin bytes exceed %d", maxAdmissionTotal)
		}
		actual, err := hashOneRegularFile(root, filepath.ToSlash(filepath.Join("source", filepath.FromSlash(name))))
		if err != nil {
			return SourceIdentity{}, nil, fmt.Errorf("verify source/%s: %w", name, err)
		}
		if actual.Bytes != pin.Bytes || actual.SHA256 != pin.SHA256 {
			return SourceIdentity{}, nil, fmt.Errorf("source pin mismatch at source/%s: got %d bytes %s, want %d bytes %s", name, actual.Bytes, actual.SHA256, pin.Bytes, pin.SHA256)
		}
		named = append(named, namedSourcePin{path: name, pin: pin})
	}
	if err := comparePinnedSourceInventory(root, snapshot.SourcePins); err != nil {
		return SourceIdentity{}, nil, err
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

func comparePinnedSourceInventory(root string, pins map[string]modulequalification.SourcePin) error {
	sourceRoot := filepath.Join(root, "source")
	info, err := os.Lstat(sourceRoot)
	if err != nil {
		return fmt.Errorf("inspect source directory: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return errors.New("source must be an ordinary directory")
	}
	seen := make(map[string]struct{}, len(pins))
	err = filepath.WalkDir(sourceRoot, func(name string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if name == sourceRoot {
			return nil
		}
		stat, err := os.Lstat(name)
		if err != nil {
			return err
		}
		if stat.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("source inventory contains symbolic link %s", name)
		}
		if stat.IsDir() {
			return nil
		}
		if !stat.Mode().IsRegular() {
			return fmt.Errorf("source inventory entry %s is not a regular file", name)
		}
		relative, err := filepath.Rel(sourceRoot, name)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		if _, ok := pins[relative]; !ok {
			return fmt.Errorf("source file %s is not pinned", relative)
		}
		seen[relative] = struct{}{}
		return nil
	})
	if err != nil {
		return fmt.Errorf("walk pinned source inventory: %w", err)
	}
	if len(seen) != len(pins) {
		for name := range pins {
			if _, ok := seen[name]; !ok {
				return fmt.Errorf("pinned source path %s is absent from source inventory", name)
			}
		}
		return errors.New("source inventory does not match source pin manifest")
	}
	return nil
}

type effectBuildProfile struct {
	backend     string
	role        string
	packagePath string
	outputDir   string
}

var effectBuildProfiles = [...]effectBuildProfile{
	{backend: "react", role: "parent", packagePath: "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent", outputDir: "react-parent"},
	{backend: "react", role: "child", packagePath: "github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild", outputDir: "react-child"},
	{backend: "dom", role: "parent", packagePath: "github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent", outputDir: "dom-parent"},
	{backend: "dom", role: "child", packagePath: "github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild", outputDir: "dom-child"},
}

// These generic-map envelopes need an explicit allowlist because DecodeStrict
// cannot reject unknown keys when its destination is a map. The source v1
// build records are role-specific: only parent records contain keyedHelper.
var effectBuildIndexKeys = []string{
	"actualBuildCount",
	"adapterChecks",
	"admission",
	"buildContext",
	"builds",
	"childPackagePath",
	"closedEffectDescriptors",
	"commands",
	"inventory",
	"nativeMountBoundaries",
	"outputRoot",
	"parentPackagePath",
	"schema",
	"sourcePins",
	"toolchain",
}

var effectBuildRecordBaseKeys = []string{
	"artifacts",
	"backend",
	"componentId",
	"manifest",
	"manifestPath",
	"outputCount",
	"outputDir",
	"outputs",
	"packagePath",
	"result",
	"resultPath",
	"role",
}

type effectArtifactRecord struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type effectBuildSourcePin struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type effectBuildManifest struct {
	Schema            string           `json:"schema"`
	ForwarderModule   string           `json:"forwarderModule"`
	ForwarderGoMod    string           `json:"forwarderGoMod"`
	ForwarderSources  []string         `json:"forwarderSources"`
	EmittedTypeScript []string         `json:"emittedTypeScript"`
	Apps              []effectBuildApp `json:"apps"`
}

type effectBuildApp struct {
	Backend          string                   `json:"backend"`
	ComponentID      string                   `json:"componentId"`
	PackagePath      string                   `json:"packagePath"`
	AppIR            string                   `json:"appIR"`
	Module           string                   `json:"module"`
	Encoder          string                   `json:"encoder"`
	Components       string                   `json:"components"`
	ModuleABI        string                   `json:"moduleABI"`
	ForwarderPackage string                   `json:"forwarderPackage"`
	RoleBindings     []effectBuildRoleBinding `json:"roleBindings"`
}

type effectBuildRoleBinding struct {
	Role            string `json:"role"`
	AppIRSymbol     string `json:"appIRSymbol"`
	ForwarderExport string `json:"forwarderExport"`
}

// checkEffectBuilds verifies all four independent output trees from their
// actual files. Index counts and producer success flags are only metadata; the
// acceptance proof comes from exact inventories, rehashed artifacts, AppIR,
// moduleabi derivation, and pair validation below.
func checkEffectBuilds(root string) error {
	indexPath := filepath.Join(root, "builds", "build-index.json")
	indexBytes, err := readAdmissionFile(indexPath, maxAdmissionFileBytes)
	if err != nil {
		return fmt.Errorf("read builds/build-index.json: %w", err)
	}
	var index map[string]json.RawMessage
	if err := modulequalification.DecodeStrict(indexBytes, &index); err != nil {
		return fmt.Errorf("decode builds/build-index.json: %w", err)
	}
	if err := checkExactAdmissionJSONKeys("build index", index, effectBuildIndexKeys); err != nil {
		return err
	}
	if fieldString(index, "schema") != "gobi.module-effects-build-index/v1" {
		return fmt.Errorf("build index schema is %q", fieldString(index, "schema"))
	}
	if fieldString(index, "parentPackagePath") != effectBuildProfiles[0].packagePath || fieldString(index, "childPackagePath") != effectBuildProfiles[1].packagePath {
		return errors.New("build index package paths do not match the keyed parent and effects child fixtures")
	}
	if fieldInteger(index, "actualBuildCount") != len(effectBuildProfiles) {
		return errors.New("build index does not record exactly four requested builds")
	}
	var indexedSourcePins map[string]effectBuildSourcePin
	if err := modulequalification.DecodeStrict(index["sourcePins"], &indexedSourcePins); err != nil {
		return fmt.Errorf("decode build index sourcePins: %w", err)
	}
	var archivedSourcePins map[string]modulequalification.SourcePin
	if err := decodeAdmissionFile(filepath.Join(root, "metadata", "source-pins-before.json"), &archivedSourcePins); err != nil {
		return fmt.Errorf("decode metadata/source-pins-before.json for build closure: %w", err)
	}
	if len(indexedSourcePins) == 0 {
		return errors.New("build index sourcePins import closure is empty")
	}
	for name, indexed := range indexedSourcePins {
		archived, ok := archivedSourcePins[name]
		if !validAdmissionRelativePath(name) || !ok || indexed.Path != name || indexed.Bytes != archived.Bytes || indexed.SHA256 != archived.SHA256 {
			return fmt.Errorf("build index source pin does not match archived source/%s bytes", name)
		}
	}
	if err := checkClosedEffectDescriptors(index); err != nil {
		return err
	}
	buildsRaw, ok := index["builds"]
	if !ok {
		return errors.New("build index is missing builds")
	}
	var builds map[string]json.RawMessage
	if err := modulequalification.DecodeStrict(buildsRaw, &builds); err != nil {
		return fmt.Errorf("decode build index builds: %w", err)
	}
	if len(builds) != 2 {
		return fmt.Errorf("build index must have exactly react and dom backends, got %d", len(builds))
	}
	descriptors := map[string]map[string]moduleabi.Descriptor{"react": {}, "dom": {}}
	for _, profile := range effectBuildProfiles {
		backendRaw, ok := builds[profile.backend]
		if !ok {
			return fmt.Errorf("build index is missing %s backend", profile.backend)
		}
		var backend map[string]json.RawMessage
		if err := modulequalification.DecodeStrict(backendRaw, &backend); err != nil {
			return fmt.Errorf("decode build index %s backend: %w", profile.backend, err)
		}
		if len(backend) != 2 {
			return fmt.Errorf("%s backend must contain exactly parent and child builds", profile.backend)
		}
		profileRaw, ok := backend[profile.role]
		if !ok {
			return fmt.Errorf("build index is missing %s %s", profile.backend, profile.role)
		}
		descriptor, err := checkOneEffectBuild(root, profile, profileRaw)
		if err != nil {
			return fmt.Errorf("%s-%s: %w", profile.backend, profile.role, err)
		}
		descriptors[profile.backend][profile.role] = descriptor
	}
	for _, backend := range []string{"react", "dom"} {
		if err := moduleabi.ValidatePair(descriptors[backend]["parent"], descriptors[backend]["child"]); err != nil {
			return fmt.Errorf("%s parent/child ABI pair: %w", backend, err)
		}
	}
	return nil
}

func checkExactAdmissionJSONKeys(label string, object map[string]json.RawMessage, required []string) error {
	allowed := make(map[string]struct{}, len(required))
	for _, key := range required {
		allowed[key] = struct{}{}
	}

	missing := make([]string, 0)
	for _, key := range required {
		if _, ok := object[key]; !ok {
			missing = append(missing, key)
		}
	}
	if len(missing) != 0 {
		sort.Strings(missing)
		return fmt.Errorf("%s is missing required field %q", label, missing[0])
	}

	extra := make([]string, 0)
	for key := range object {
		if _, ok := allowed[key]; !ok {
			extra = append(extra, key)
		}
	}
	if len(extra) != 0 {
		sort.Strings(extra)
		return fmt.Errorf("%s has unknown or incorrectly-cased field %q", label, extra[0])
	}
	return nil
}

func effectBuildRecordKeySet(role string) ([]string, error) {
	keys := append([]string(nil), effectBuildRecordBaseKeys...)
	switch role {
	case "parent":
		return append(keys, "keyedHelper"), nil
	case "child":
		return keys, nil
	default:
		return nil, fmt.Errorf("unsupported build record role %q", role)
	}
}

func checkClosedEffectDescriptors(index map[string]json.RawMessage) error {
	raw, ok := index["closedEffectDescriptors"]
	if !ok {
		return errors.New("build index is missing closed effect descriptors")
	}
	var got []struct {
		Kind     string `json:"kind"`
		Name     string `json:"name"`
		Argument string `json:"argument"`
		Reply    string `json:"reply"`
	}
	if err := modulequalification.DecodeStrict(raw, &got); err != nil {
		return fmt.Errorf("decode closed effect descriptors: %w", err)
	}
	want := []struct {
		Kind     string `json:"kind"`
		Name     string `json:"name"`
		Argument string `json:"argument"`
		Reply    string `json:"reply"`
	}{
		{Kind: "fixture.request", Name: "save", Argument: "opaque active token: key:g<generation>:r<requestID>", Reply: "complete"},
		{Kind: "lifecycle.cancel", Name: "cancel", Argument: "opaque active token: key:g<generation>:r<requestID>", Reply: ""},
	}
	if !reflect.DeepEqual(got, want) {
		return fmt.Errorf("closed effect descriptors differ from the supported request/cancel ABI: got %+v", got)
	}
	return nil
}

func checkOneEffectBuild(root string, profile effectBuildProfile, raw json.RawMessage) (moduleabi.Descriptor, error) {
	var record map[string]json.RawMessage
	if err := modulequalification.DecodeStrict(raw, &record); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("decode build record: %w", err)
	}
	requiredKeys, err := effectBuildRecordKeySet(profile.role)
	if err != nil {
		return moduleabi.Descriptor{}, err
	}
	if err := checkExactAdmissionJSONKeys(profile.backend+"-"+profile.role+" build record", record, requiredKeys); err != nil {
		return moduleabi.Descriptor{}, err
	}
	if fieldString(record, "backend") != profile.backend || fieldString(record, "role") != profile.role ||
		fieldString(record, "packagePath") != profile.packagePath || fieldString(record, "componentId") != profile.packagePath {
		return moduleabi.Descriptor{}, errors.New("build record backend, role, packagePath, or componentId is incorrect")
	}
	if fieldString(record, "outputDir") != profile.outputDir {
		return moduleabi.Descriptor{}, fmt.Errorf("outputDir is %q, want %q", fieldString(record, "outputDir"), profile.outputDir)
	}
	manifestPath := fieldString(record, "manifestPath")
	resultPath := fieldString(record, "resultPath")
	if manifestPath != path.Join(profile.outputDir, "buildmanifest.json") || resultPath != path.Join("metadata", profile.outputDir, "build-result.json") {
		return moduleabi.Descriptor{}, errors.New("build record manifest or result path is not the expected profile path")
	}
	if err := checkBuildRecordPin(root, manifestPath, rawField(record, "manifest")); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("manifest pin: %w", err)
	}
	if err := checkBuildRecordPin(root, resultPath, rawField(record, "result")); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("build result pin: %w", err)
	}

	outputsRaw, ok := record["outputs"]
	if !ok {
		return moduleabi.Descriptor{}, errors.New("build record is missing output inventory")
	}
	var outputs []effectArtifactRecord
	if err := modulequalification.DecodeStrict(outputsRaw, &outputs); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("decode output inventory: %w", err)
	}
	if len(outputs) == 0 || fieldInteger(record, "outputCount") != len(outputs) {
		return moduleabi.Descriptor{}, errors.New("build output count does not match its nonempty inventory")
	}
	seen := make(map[string]struct{}, len(outputs))
	for _, output := range outputs {
		if !validAdmissionRelativePath(output.Path) || output.Bytes < 0 || !isAdmissionSHA256(output.SHA256) {
			return moduleabi.Descriptor{}, fmt.Errorf("invalid output inventory record %q", output.Path)
		}
		if _, duplicate := seen[output.Path]; duplicate {
			return moduleabi.Descriptor{}, fmt.Errorf("duplicate output path %q", output.Path)
		}
		seen[output.Path] = struct{}{}
		actual, err := hashOneRegularFile(root, filepath.ToSlash(filepath.Join("builds", profile.outputDir, filepath.FromSlash(output.Path))))
		if err != nil {
			return moduleabi.Descriptor{}, fmt.Errorf("hash output %s: %w", output.Path, err)
		}
		if actual.Bytes != output.Bytes || actual.SHA256 != output.SHA256 {
			return moduleabi.Descriptor{}, fmt.Errorf("output inventory mismatch at %s", output.Path)
		}
	}
	actualOutputs, err := listBuildOutputFiles(filepath.Join(root, "builds", profile.outputDir))
	if err != nil {
		return moduleabi.Descriptor{}, err
	}
	if len(actualOutputs) != len(seen) {
		return moduleabi.Descriptor{}, fmt.Errorf("output inventory has %d entries but profile tree has %d regular files", len(seen), len(actualOutputs))
	}
	for _, name := range actualOutputs {
		if _, ok := seen[name]; !ok {
			return moduleabi.Descriptor{}, fmt.Errorf("unlisted build output %s", name)
		}
	}

	manifestBytes, err := readAdmissionFile(filepath.Join(root, "builds", filepath.FromSlash(manifestPath)), maxAdmissionFileBytes)
	if err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("read build manifest: %w", err)
	}
	var manifest effectBuildManifest
	if err := modulequalification.DecodeStrict(manifestBytes, &manifest); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("decode build manifest: %w", err)
	}
	if err := validateEffectBuildManifest(manifest, profile); err != nil {
		return moduleabi.Descriptor{}, err
	}
	app := manifest.Apps[0]
	for _, name := range append(append([]string{}, manifest.ForwarderSources...), manifest.EmittedTypeScript...) {
		if _, ok := seen[name]; !ok {
			return moduleabi.Descriptor{}, fmt.Errorf("build manifest source %q is absent from output inventory", name)
		}
	}
	if _, ok := seen[manifest.ForwarderGoMod]; !ok {
		return moduleabi.Descriptor{}, errors.New("build manifest forwarderGoMod is absent from output inventory")
	}
	appPaths := map[string]string{
		"app-ir.json":        app.AppIR,
		"gobi-compiled.mjs":  app.Module,
		"encoder.mjs":        app.Encoder,
		"components.gen.mjs": app.Components,
	}
	if err := validateEffectAppPaths(appPaths, app.ModuleABI); err != nil {
		return moduleabi.Descriptor{}, err
	}
	artifactFiles := make(map[string][]byte, len(appPaths))
	for _, basename := range []string{"app-ir.json", "gobi-compiled.mjs", "encoder.mjs", "components.gen.mjs"} {
		relative := appPaths[basename]
		limit := maxAdmissionFileBytes
		if basename == "app-ir.json" {
			limit = 16 << 20
		}
		contents, err := readAdmissionFile(filepath.Join(root, "builds", profile.outputDir, filepath.FromSlash(relative)), limit)
		if err != nil {
			return moduleabi.Descriptor{}, fmt.Errorf("read artifact %q: %w", relative, err)
		}
		artifactFiles[relative] = contents
	}
	var appIR compilercontract.AppIR
	if err := modulequalification.DecodeStrict(artifactFiles[app.AppIR], &appIR); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("decode AppIR %q: %w", app.AppIR, err)
	}
	if appIR.Schema != compilercontract.AppIRSchema || appIR.PackagePath != profile.packagePath || len(appIR.Components) != 1 ||
		appIR.Components[0].ID != profile.packagePath || appIR.Components[0].PackagePath != profile.packagePath {
		return moduleabi.Descriptor{}, errors.New("AppIR schema or component identity does not match the build profile")
	}
	if err := checkEffectCapabilities(appIR.Components[0].Capabilities, profile.role); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("AppIR capabilities: %w", err)
	}

	descriptorPath := path.Join("builds", profile.outputDir, app.ModuleABI)
	descriptorBytes, err := readAdmissionFile(filepath.Join(root, filepath.FromSlash(descriptorPath)), 16<<20)
	if err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("read module ABI sidecar: %w", err)
	}
	var sidecar moduleabi.Descriptor
	if err := modulequalification.DecodeStrict(descriptorBytes, &sidecar); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("strictly decode module ABI sidecar: %w", err)
	}
	decoded, err := moduleabi.DecodeDescriptorJSON(descriptorBytes)
	if err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("validate module ABI sidecar: %w", err)
	}
	if !reflect.DeepEqual(sidecar, decoded) {
		return moduleabi.Descriptor{}, errors.New("strict and moduleabi sidecar decoders disagree")
	}
	if err := moduleabi.ValidateArtifactBytes(decoded, artifactFiles); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("validate sidecar against exact generated artifact bytes: %w", err)
	}
	derived, err := moduleabi.Describe(appIR, artifactFiles)
	if err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("derive ABI from AppIR and artifact bytes: %w", err)
	}
	if !reflect.DeepEqual(derived, decoded) {
		return moduleabi.Descriptor{}, errors.New("module ABI sidecar does not equal ABI derived from AppIR and exact artifact bytes")
	}
	if decoded.ComponentID != profile.packagePath || decoded.PackagePath != profile.packagePath {
		return moduleabi.Descriptor{}, errors.New("module ABI sidecar identity does not match the build profile")
	}
	if err := checkEffectCapabilities(decoded.Capabilities, profile.role); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("module ABI capabilities: %w", err)
	}
	return decoded, nil
}

func validateEffectBuildManifest(manifest effectBuildManifest, profile effectBuildProfile) error {
	if manifest.Schema != "gobi.build-manifest/v1" || manifest.ForwarderModule != "gobi.generated/compiled" || manifest.ForwarderGoMod == "" ||
		len(manifest.ForwarderSources) == 0 || len(manifest.EmittedTypeScript) == 0 || manifest.Apps == nil || len(manifest.Apps) != 1 {
		return errors.New("build manifest schema or required source/app inventory is invalid")
	}
	for _, name := range append(append([]string{}, manifest.ForwarderSources...), manifest.EmittedTypeScript...) {
		if !validAdmissionRelativePath(name) {
			return fmt.Errorf("invalid build manifest source path %q", name)
		}
	}
	if !validAdmissionRelativePath(manifest.ForwarderGoMod) || !strings.HasPrefix(manifest.ForwarderGoMod, "forwarders/") {
		return errors.New("build manifest forwarderGoMod must name a file under forwarders/")
	}
	for _, name := range manifest.ForwarderSources {
		if !strings.HasPrefix(name, "forwarders/") {
			return fmt.Errorf("forwarder source %q must be under forwarders/", name)
		}
	}
	for _, name := range manifest.EmittedTypeScript {
		if !strings.HasPrefix(name, "emitted-ts/") {
			return fmt.Errorf("emitted TypeScript source %q must be under emitted-ts/", name)
		}
	}
	app := manifest.Apps[0]
	if app.Backend != profile.backend || app.ComponentID != profile.packagePath || app.PackagePath != profile.packagePath || app.ForwarderPackage == "" {
		return errors.New("build manifest app backend, component, package, or forwarder package does not match the build profile")
	}
	wantBindings := []effectBuildRoleBinding{
		{Role: "init", AppIRSymbol: profile.packagePath + ".Init", ForwarderExport: "GobiCompiledInit"},
		{Role: "update", AppIRSymbol: profile.packagePath + ".Update", ForwarderExport: "GobiCompiledUpdate"},
		{Role: "view", AppIRSymbol: profile.packagePath + ".View", ForwarderExport: "GobiCompiledView"},
	}
	if !reflect.DeepEqual(app.RoleBindings, wantBindings) {
		return errors.New("build manifest roleBindings do not match conventional Init/Update/View exports")
	}
	return nil
}

func validateEffectAppPaths(artifacts map[string]string, moduleABIPath string) error {
	if !validAdmissionRelativePath(moduleABIPath) {
		return fmt.Errorf("invalid module ABI path %q", moduleABIPath)
	}
	var appDir string
	for basename, relative := range artifacts {
		if !validAdmissionRelativePath(relative) || path.Base(relative) != basename || !strings.HasPrefix(relative, "apps/") || path.Dir(relative) == "apps" {
			return fmt.Errorf("invalid %s artifact path %q", basename, relative)
		}
		directory := path.Dir(relative)
		if appDir == "" {
			appDir = directory
		} else if directory != appDir {
			return errors.New("generated app artifacts do not share one app directory")
		}
	}
	if path.Dir(moduleABIPath) != appDir || path.Base(moduleABIPath) != "module-abi.json" {
		return errors.New("module ABI sidecar must be module-abi.json beside the app artifacts")
	}
	return nil
}

func checkEffectCapabilities(got []compilercontract.Capability, role string) error {
	want := []compilercontract.Capability{
		compilercontract.CapabilityFloat64,
		compilercontract.CapabilitySafeInteger,
		compilercontract.CapabilityViewNode,
	}
	if role == "child" {
		want = append(want, compilercontract.CapabilityEffectRequest, compilercontract.CapabilityEffectCancel)
	}
	sort.Slice(want, func(i, j int) bool { return want[i] < want[j] })
	actual := append([]compilercontract.Capability(nil), got...)
	sort.Slice(actual, func(i, j int) bool { return actual[i] < actual[j] })
	if !reflect.DeepEqual(actual, want) {
		return fmt.Errorf("got %v, want exact capability set %v", actual, want)
	}
	return nil
}

func checkBuildRecordPin(root, relative string, raw json.RawMessage) error {
	var pin effectArtifactRecord
	if err := modulequalification.DecodeStrict(raw, &pin); err != nil {
		return fmt.Errorf("decode pin: %w", err)
	}
	if !validAdmissionRelativePath(relative) || pin.Bytes < 0 || !isAdmissionSHA256(pin.SHA256) {
		return errors.New("invalid pinned path, length, or digest")
	}
	actual, err := hashOneRegularFile(root, filepath.ToSlash(filepath.Join("builds", filepath.FromSlash(relative))))
	if err != nil {
		return err
	}
	if actual.Bytes != pin.Bytes || actual.SHA256 != pin.SHA256 {
		return fmt.Errorf("file pin mismatch at builds/%s", relative)
	}
	return nil
}

func listBuildOutputFiles(root string) ([]string, error) {
	var result []string
	err := filepath.WalkDir(root, func(name string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if name == root {
			return nil
		}
		info, err := os.Lstat(name)
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("build output %s is a symbolic link", name)
		}
		if info.IsDir() {
			return nil
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("build output %s is not a regular file", name)
		}
		relative, err := filepath.Rel(root, name)
		if err != nil {
			return err
		}
		result = append(result, filepath.ToSlash(relative))
		return nil
	})
	sort.Strings(result)
	return result, err
}

func rawField(object map[string]json.RawMessage, name string) json.RawMessage {
	return object[name]
}

func fieldString(object map[string]json.RawMessage, name string) string {
	var result string
	_ = modulequalification.DecodeStrict(object[name], &result)
	return result
}

func fieldInteger(object map[string]json.RawMessage, name string) int {
	var result int
	_ = modulequalification.DecodeStrict(object[name], &result)
	return result
}

func decodeAdmissionFile(name string, out any) error {
	data, err := readAdmissionFile(name, maxAdmissionFileBytes)
	if err != nil {
		return err
	}
	return modulequalification.DecodeStrict(data, out)
}

func sameEffectSourcePins(left, right map[string]modulequalification.SourcePin) bool {
	if len(left) != len(right) {
		return false
	}
	for name, pin := range left {
		if other, ok := right[name]; !ok || pin != other {
			return false
		}
	}
	return true
}

func validAdmissionRelativePath(name string) bool {
	if name == "" || strings.Contains(name, "\\") || strings.HasPrefix(name, "/") || !utf8.ValidString(name) || path.Clean(name) != name || name == "." || name == ".." || strings.HasPrefix(name, "../") {
		return false
	}
	for _, part := range strings.Split(name, "/") {
		if part == "" || part == "." || part == ".." {
			return false
		}
	}
	return true
}

func hashInputs(root string) ([]InputPin, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve effects qualification root: %w", err)
	}
	info, err := os.Lstat(absRoot)
	if err != nil {
		return nil, fmt.Errorf("inspect effects qualification root %q: %w", root, err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return nil, fmt.Errorf("effects qualification root %q must be a real directory", root)
	}
	resolvedRoot, err := filepath.EvalSymlinks(absRoot)
	if err != nil {
		return nil, fmt.Errorf("resolve effects qualification root without symlinks: %w", err)
	}
	if filepath.Clean(resolvedRoot) != filepath.Clean(absRoot) {
		return nil, fmt.Errorf("effects qualification root %q is reached through a symbolic link", root)
	}
	var pins []InputPin
	var total int64
	err = filepath.WalkDir(absRoot, func(name string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if name == absRoot {
			return nil
		}
		relative, err := filepath.Rel(absRoot, name)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		info, err := os.Lstat(name)
		if err != nil {
			return fmt.Errorf("inspect %s: %w", relative, err)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("input %s is a symbolic link", relative)
		}
		if info.IsDir() {
			return nil
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("input %s is not a regular file", relative)
		}
		if len(pins) >= maxAdmissionFiles {
			return fmt.Errorf("input file count exceeds %d", maxAdmissionFiles)
		}
		pin, err := hashOneRegularFile(absRoot, relative)
		if err != nil {
			return err
		}
		total += pin.Bytes
		if total > maxAdmissionTotal {
			return fmt.Errorf("input bytes exceed %d", maxAdmissionTotal)
		}
		pins = append(pins, pin)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walk effects qualification inputs: %w", err)
	}
	sort.Slice(pins, func(i, j int) bool { return pins[i].Path < pins[j].Path })
	return pins, nil
}

func hashOneRegularFile(root, relative string) (InputPin, error) {
	if !validAdmissionRelativePath(relative) {
		return InputPin{}, fmt.Errorf("invalid relative input path %q", relative)
	}
	full := filepath.Join(root, filepath.FromSlash(relative))
	before, err := os.Lstat(full)
	if err != nil {
		return InputPin{}, fmt.Errorf("inspect %s: %w", relative, err)
	}
	if before.Mode()&os.ModeSymlink != 0 || !before.Mode().IsRegular() {
		return InputPin{}, fmt.Errorf("input %s must be an ordinary regular file", relative)
	}
	if before.Size() < 0 || before.Size() > maxAdmissionFileBytes {
		return InputPin{}, fmt.Errorf("input %s exceeds %d bytes", relative, maxAdmissionFileBytes)
	}
	file, err := os.Open(full)
	if err != nil {
		return InputPin{}, fmt.Errorf("open %s: %w", relative, err)
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil {
		return InputPin{}, fmt.Errorf("stat open %s: %w", relative, err)
	}
	if !opened.Mode().IsRegular() || !os.SameFile(before, opened) {
		return InputPin{}, fmt.Errorf("input %s changed identity during hashing", relative)
	}
	digest := sha256.New()
	readBytes, err := io.Copy(digest, io.LimitReader(file, maxAdmissionFileBytes+1))
	if err != nil {
		return InputPin{}, fmt.Errorf("hash %s: %w", relative, err)
	}
	if readBytes > maxAdmissionFileBytes {
		return InputPin{}, fmt.Errorf("input %s exceeds %d bytes", relative, maxAdmissionFileBytes)
	}
	after, err := file.Stat()
	if err != nil {
		return InputPin{}, fmt.Errorf("restat %s: %w", relative, err)
	}
	if !os.SameFile(opened, after) || opened.Size() != after.Size() || opened.ModTime() != after.ModTime() || readBytes != after.Size() {
		return InputPin{}, fmt.Errorf("input %s changed while it was being hashed", relative)
	}
	return InputPin{Path: relative, Bytes: readBytes, SHA256: hex.EncodeToString(digest.Sum(nil))}, nil
}

func readAdmissionFile(name string, max int64) ([]byte, error) {
	info, err := os.Lstat(name)
	if err != nil {
		return nil, fmt.Errorf("inspect %s: %w", name, err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() || info.Size() < 0 || info.Size() > max {
		return nil, fmt.Errorf("%s must be a regular file no larger than %d bytes", name, max)
	}
	file, err := os.Open(name)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", name, err)
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !os.SameFile(info, opened) {
		return nil, fmt.Errorf("%s changed identity while opening", name)
	}
	data, err := io.ReadAll(io.LimitReader(file, max+1))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", name, err)
	}
	if int64(len(data)) > max {
		return nil, fmt.Errorf("%s exceeds %d bytes", name, max)
	}
	if !utf8.Valid(data) {
		return nil, fmt.Errorf("%s is not valid UTF-8", name)
	}
	return data, nil
}

func isAdmissionSHA256(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && hex.EncodeToString(decoded) == value
}

func isAdmissionCommit(value string) bool {
	if len(value) != 40 {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && hex.EncodeToString(decoded) == value
}
