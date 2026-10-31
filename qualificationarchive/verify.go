package qualificationarchive

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"

	"github.com/samuelpmahan/gondola/backendqualification"
)

const verificationReceiptSchema = "gobi.portable-qualification-verification/v1"

// Receipt is a deterministic summary of a successfully verified archive.
// Cases are the registry-ordered results recomputed by backendqualification,
// rather than verdicts copied from the archive.
type Receipt struct {
	Schema         string                                   `json:"schema"`
	SourceCommit   string                                   `json:"sourceCommit"`
	Qualified      bool                                     `json:"qualified"`
	ArchiveSHA256  string                                   `json:"archiveSHA256"`
	ManifestSHA256 string                                   `json:"manifestSHA256"`
	Members        int                                      `json:"members"`
	Cases          []backendqualification.CertificateResult `json:"cases"`
}

// Verify extracts and verifies a portable qualification archive, re-runs the
// existing Go certificate policy over its captured raw report, and compares
// that result with the archived certificate and source/provenance records.
// This checks consistency of the archived evidence; it does not rerun browser
// behavior or establish producer authenticity.
func Verify(archivePath, manifestPath, expectedCommit string) (receipt Receipt, err error) {
	bundle, err := Extract(archivePath, manifestPath, expectedCommit)
	if err != nil {
		return Receipt{}, fmt.Errorf("extract qualification archive: %w", err)
	}
	if bundle == nil {
		return Receipt{}, errors.New("extract qualification archive returned no bundle")
	}
	defer func() {
		if closeErr := bundle.Close(); closeErr != nil {
			if err == nil {
				receipt = Receipt{}
				err = fmt.Errorf("close extracted qualification archive: %w", closeErr)
			}
		}
	}()

	if bundle.Root == "" || bundle.SourceCommit != expectedCommit {
		return Receipt{}, errors.New("extracted bundle root or source commit is invalid")
	}
	if !isLowerSHA256(bundle.ArchiveSHA256) || !isLowerSHA256(bundle.ManifestSHA256) || bundle.Members <= 0 {
		return Receipt{}, errors.New("extracted bundle has invalid archive metadata")
	}
	manifestAttempt, err := verifyManifestBindings(manifestPath, bundle, expectedCommit)
	if err != nil {
		return Receipt{}, fmt.Errorf("verify manifest bindings: %w", err)
	}

	rawPath := filepath.Join(bundle.Root, "qualification", "qualification.raw.json")
	certificatePath := filepath.Join(bundle.Root, "certificate", "certificate.json")
	recomputed, err := backendqualification.CertifyFile(rawPath)
	if err != nil {
		return Receipt{}, fmt.Errorf("recompute Go qualification certificate: %w", err)
	}
	if recomputed.SourceCommit != expectedCommit || recomputed.Schema != "gobi.backend-qualification-certificate/v1" || !recomputed.Qualified || len(recomputed.Results) != 13 {
		return Receipt{}, errors.New("recomputed certificate does not match the requested source or qualification schema")
	}

	archivedBytes, err := os.ReadFile(certificatePath)
	if err != nil {
		return Receipt{}, fmt.Errorf("read archived certificate: %w", err)
	}
	var archived backendqualification.Certificate
	if err := decodeStrictJSON(archivedBytes, &archived); err != nil {
		return Receipt{}, fmt.Errorf("decode archived certificate: %w", err)
	}
	if archived.SourceCommit != expectedCommit || !certificateEqual(archived, recomputed) {
		return Receipt{}, errors.New("archived certificate differs from the recomputed Go certificate")
	}
	if err := verifyArchiveBindings(bundle.Root, expectedCommit, manifestAttempt, recomputed, archivedBytes); err != nil {
		return Receipt{}, fmt.Errorf("verify archive provenance bindings: %w", err)
	}

	return Receipt{
		Schema:         verificationReceiptSchema,
		SourceCommit:   expectedCommit,
		Qualified:      true,
		ArchiveSHA256:  bundle.ArchiveSHA256,
		ManifestSHA256: bundle.ManifestSHA256,
		Members:        bundle.Members,
		Cases:          cloneCertificateResults(recomputed.Results),
	}, nil
}

type fileReference struct {
	Path   *string `json:"path"`
	Bytes  *int64  `json:"bytes"`
	SHA256 *string `json:"sha256"`
}

type manifestBinding struct {
	Schema             *string          `json:"schema"`
	Policy             *string          `json:"policy"`
	Attempt            *string          `json:"attempt"`
	SourceCommit       *string          `json:"sourceCommit"`
	Members            *[]fileReference `json:"members"`
	PreArchiveSnapshot *fileReference   `json:"preArchiveSnapshot"`
}

type executionSnapshot struct {
	Schema          *string         `json:"schema"`
	Attempt         *string         `json:"attempt"`
	SourceCommit    *string         `json:"sourceCommit"`
	SourceBefore    json.RawMessage `json:"sourceBefore"`
	SourceAfter     json.RawMessage `json:"sourceAfter"`
	SourcePinsMatch *bool           `json:"sourcePinsMatch"`
	Build           struct {
		Provenance  *fileReference `json:"provenance"`
		NativeTrace *fileReference `json:"nativeTrace"`
		SourceBase  *string        `json:"sourceBase"`
	} `json:"build"`
	Qualification struct {
		Summary   *fileReference `json:"summary"`
		RawReport *fileReference `json:"rawReport"`
	} `json:"qualification"`
	Certificate struct {
		Path      *string `json:"path"`
		Bytes     *int64  `json:"bytes"`
		SHA256    *string `json:"sha256"`
		Schema    *string `json:"schema"`
		Qualified *bool   `json:"qualified"`
		Results   *int    `json:"results"`
	} `json:"certificate"`
	Demo struct {
		Build struct {
			SourceCommit          *string `json:"sourceCommit"`
			Qualified             *bool   `json:"qualified"`
			CaseCount             *int    `json:"caseCount"`
			HealthyCases          *int    `json:"healthyCases"`
			FaultCases            *int    `json:"faultCases"`
			EvidenceFilesVerified *int    `json:"evidenceFilesVerified"`
		} `json:"build"`
		Smoke *fileReference `json:"smoke"`
	} `json:"demo"`
	ArchivePending  *bool `json:"archivePending"`
	FinalAcceptance *bool `json:"finalAcceptance"`
}

type qualificationInputReferences struct {
	RawReport *fileReference `json:"rawReport"`
	Summary   *fileReference `json:"summary"`
}

type buildInputSummary struct {
	ReactCompiled         *fileReference `json:"reactCompiled"`
	ReactHelpers          *fileReference `json:"reactHelpers"`
	DOMCompiled           *fileReference `json:"domCompiled"`
	DOMHelpers            *fileReference `json:"domHelpers"`
	FixturePath           *fileReference `json:"fixturePath"`
	ExpectationsPath      *fileReference `json:"expectationsPath"`
	NativePath            *fileReference `json:"nativePath"`
	ProvenancePath        *fileReference `json:"provenancePath"`
	ContractBaseCommitRef *string        `json:"contractBaseCommitRef"`
}

type buildProvenance struct {
	Schema                    *string            `json:"schema"`
	ContractBaseCommitRef     *string            `json:"contractBaseCommitRef"`
	Fixture                   *fileReference     `json:"fixture"`
	Plan                      *fileReference     `json:"plan"`
	Expectations              *fileReference     `json:"expectations"`
	NativeTrace               *fileReference     `json:"nativeTrace"`
	SourcePins                map[string]filePin `json:"sourcePins"`
	SourcePinsMatchAfterBuild *bool              `json:"sourcePinsMatchAfterBuild"`
}

type filePin struct {
	Bytes  *int64  `json:"bytes"`
	SHA256 *string `json:"sha256"`
}

type sourcePinMap map[string]filePin

func verifyManifestBindings(manifestPath string, bundle *Bundle, expectedCommit string) (string, error) {
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return "", fmt.Errorf("read manifest after extraction: %w", err)
	}
	digest := sha256.Sum256(data)
	if hex.EncodeToString(digest[:]) != bundle.ManifestSHA256 {
		return "", errors.New("manifest bytes changed after extraction")
	}
	var manifest manifestBinding
	if err := decodeStrictJSON(data, &manifest); err != nil {
		return "", fmt.Errorf("decode verified manifest header: %w", err)
	}
	if manifest.Schema == nil || *manifest.Schema != "gobi.backend-qualification-archive/v1" ||
		manifest.Policy == nil || *manifest.Policy != "explicit stable NUL-separated file inventory; no recursive tar traversal" ||
		manifest.Attempt == nil || !validAttempt(*manifest.Attempt) ||
		manifest.SourceCommit == nil || *manifest.SourceCommit != expectedCommit ||
		manifest.Members == nil || len(*manifest.Members) != bundle.Members ||
		manifest.PreArchiveSnapshot == nil || manifest.PreArchiveSnapshot.Path == nil || *manifest.PreArchiveSnapshot.Path != "execution-before-archive.json" {
		return "", errors.New("manifest metadata does not match the extracted bundle")
	}
	if err := verifyMemberReference(bundle.Root, "execution-before-archive.json", *manifest.PreArchiveSnapshot); err != nil {
		return "", fmt.Errorf("pre-archive snapshot manifest reference: %w", err)
	}
	return *manifest.Attempt, nil
}

func verifyArchiveBindings(root, expectedCommit, manifestAttempt string, certificate backendqualification.Certificate, certificateBytes []byte) error {
	var execution executionSnapshot
	if err := readJSONMember(root, "execution-before-archive.json", &execution); err != nil {
		return fmt.Errorf("read pre-archive execution snapshot: %w", err)
	}
	if execution.Schema == nil || *execution.Schema != "gobi.backend-qualification-pre-archive-snapshot/v1" ||
		execution.Attempt == nil || !validAttempt(*execution.Attempt) || *execution.Attempt != manifestAttempt ||
		execution.SourceCommit == nil || *execution.SourceCommit != expectedCommit ||
		execution.SourcePinsMatch == nil || !*execution.SourcePinsMatch ||
		execution.ArchivePending == nil || !*execution.ArchivePending ||
		execution.FinalAcceptance == nil || *execution.FinalAcceptance {
		return errors.New("pre-archive snapshot identity or state is inconsistent")
	}
	attempt := *execution.Attempt

	if execution.Certificate.Path == nil || execution.Certificate.Bytes == nil || execution.Certificate.SHA256 == nil ||
		execution.Certificate.Schema == nil || execution.Certificate.Qualified == nil || execution.Certificate.Results == nil ||
		*execution.Certificate.Schema != certificate.Schema || !*execution.Certificate.Qualified || *execution.Certificate.Results != len(certificate.Results) {
		return errors.New("pre-archive certificate metadata is incomplete or inconsistent")
	}
	certRef := &fileReference{Path: execution.Certificate.Path, Bytes: execution.Certificate.Bytes, SHA256: execution.Certificate.SHA256}
	if err := verifyAttemptReference(root, attempt, certRef, "certificate/certificate.json", certificateBytes); err != nil {
		return fmt.Errorf("certificate reference: %w", err)
	}

	if err := verifyAttemptReferenceFromDisk(root, attempt, execution.Qualification.RawReport, "qualification/qualification.raw.json"); err != nil {
		return fmt.Errorf("raw report reference: %w", err)
	}
	if err := verifyAttemptReferenceFromDisk(root, attempt, execution.Qualification.Summary, "qualification/qualification.summary.json"); err != nil {
		return fmt.Errorf("qualification summary reference: %w", err)
	}
	if err := verifyAttemptReferenceFromDisk(root, attempt, execution.Build.Provenance, "inputs/provenance/build-inputs.json"); err != nil {
		return fmt.Errorf("build provenance reference: %w", err)
	}
	if err := verifyAttemptReferenceFromDisk(root, attempt, execution.Build.NativeTrace, "inputs/native/native-trace.json"); err != nil {
		return fmt.Errorf("native trace reference: %w", err)
	}
	if err := verifyAttemptReferenceFromDisk(root, attempt, execution.Demo.Smoke, "demo/http-smoke.json"); err != nil {
		return fmt.Errorf("demo smoke reference: %w", err)
	}

	if execution.Demo.Build.SourceCommit == nil || *execution.Demo.Build.SourceCommit != expectedCommit ||
		execution.Demo.Build.Qualified == nil || !*execution.Demo.Build.Qualified ||
		execution.Demo.Build.CaseCount == nil || *execution.Demo.Build.CaseCount != len(certificate.Results) ||
		execution.Demo.Build.HealthyCases == nil || *execution.Demo.Build.HealthyCases != 3 ||
		execution.Demo.Build.FaultCases == nil || *execution.Demo.Build.FaultCases != 10 ||
		execution.Demo.Build.EvidenceFilesVerified == nil || *execution.Demo.Build.EvidenceFilesVerified != len(certificate.Results) {
		return errors.New("demo provenance does not match the verified certificate")
	}

	if err := verifySourceSnapshots(root, execution); err != nil {
		return err
	}
	if err := verifyQualificationInputs(root, attempt, execution); err != nil {
		return err
	}
	if err := verifyBuildProvenance(root, attempt, execution); err != nil {
		return err
	}
	return nil
}

func verifySourceSnapshots(root string, execution executionSnapshot) error {
	var before, after sourcePinMap
	if err := readJSONMember(root, "provenance/source-before.json", &before); err != nil {
		return fmt.Errorf("read source-before provenance: %w", err)
	}
	if err := readJSONMember(root, "provenance/source-after.json", &after); err != nil {
		return fmt.Errorf("read source-after provenance: %w", err)
	}
	var inlineBefore, inlineAfter sourcePinMap
	if len(execution.SourceBefore) == 0 || json.Unmarshal(execution.SourceBefore, &inlineBefore) != nil ||
		len(execution.SourceAfter) == 0 || json.Unmarshal(execution.SourceAfter, &inlineAfter) != nil {
		return errors.New("pre-archive snapshot omits source-before/source-after maps")
	}
	if len(before) == 0 || !sourcePinMapsEqual(before, after) ||
		!sourcePinMapsEqual(before, inlineBefore) || !sourcePinMapsEqual(after, inlineAfter) {
		return errors.New("source-before/source-after maps do not agree")
	}
	for _, sourcePath := range sortedPinPaths(before) {
		pin := before[sourcePath]
		if err := verifySourcePin(root, sourcePath, pin); err != nil {
			return fmt.Errorf("source snapshot pin %q: %w", sourcePath, err)
		}
	}
	return nil
}

func verifyQualificationInputs(root, attempt string, execution executionSnapshot) error {
	var refs qualificationInputReferences
	if err := readJSONMember(root, "provenance/qualification-inputs.json", &refs); err != nil {
		return fmt.Errorf("read qualification input provenance: %w", err)
	}
	if !sameReference(refs.RawReport, execution.Qualification.RawReport) || !sameReference(refs.Summary, execution.Qualification.Summary) {
		return errors.New("qualification input references differ from the pre-archive snapshot")
	}
	if err := verifyAttemptReferenceFromDisk(root, attempt, refs.RawReport, "qualification/qualification.raw.json"); err != nil {
		return fmt.Errorf("qualification provenance raw report: %w", err)
	}
	if err := verifyAttemptReferenceFromDisk(root, attempt, refs.Summary, "qualification/qualification.summary.json"); err != nil {
		return fmt.Errorf("qualification provenance summary: %w", err)
	}
	return nil
}

func verifyBuildProvenance(root, attempt string, execution executionSnapshot) error {
	var provenance buildProvenance
	if err := readJSONMember(root, "inputs/provenance/build-inputs.json", &provenance); err != nil {
		return fmt.Errorf("read build input provenance: %w", err)
	}
	if provenance.Schema == nil || *provenance.Schema != "gobi.backend-qualification-build-provenance/v1" ||
		provenance.ContractBaseCommitRef == nil || execution.Build.SourceBase == nil ||
		!isLowerGitCommit(*provenance.ContractBaseCommitRef) ||
		*provenance.ContractBaseCommitRef != *execution.Build.SourceBase ||
		provenance.SourcePinsMatchAfterBuild == nil || !*provenance.SourcePinsMatchAfterBuild || len(provenance.SourcePins) == 0 {
		return errors.New("build provenance identity or source pin status is inconsistent")
	}

	var summary buildInputSummary
	if err := readJSONMember(root, "provenance/build-inputs-summary.json", &summary); err != nil {
		return fmt.Errorf("read build input summary: %w", err)
	}
	if summary.ContractBaseCommitRef == nil || *summary.ContractBaseCommitRef != *provenance.ContractBaseCommitRef {
		return errors.New("build summary base reference differs from build provenance")
	}
	refs := []struct {
		name string
		ref  *fileReference
		kind string
	}{
		{"reactCompiled", summary.ReactCompiled, "attempt"},
		{"reactHelpers", summary.ReactHelpers, "attempt"},
		{"domCompiled", summary.DOMCompiled, "attempt"},
		{"domHelpers", summary.DOMHelpers, "attempt"},
		{"fixturePath", summary.FixturePath, "source"},
		{"expectationsPath", summary.ExpectationsPath, "source"},
		{"nativePath", summary.NativePath, "attempt"},
		{"provenancePath", summary.ProvenancePath, "attempt"},
	}
	for _, item := range refs {
		if item.ref == nil {
			return fmt.Errorf("build summary omits %s reference", item.name)
		}
		if item.kind == "source" {
			if err := verifySourceReference(root, item.ref); err != nil {
				return fmt.Errorf("build summary %s: %w", item.name, err)
			}
		} else {
			if err := verifyAttemptReferenceFromDisk(root, attempt, item.ref, ""); err != nil {
				return fmt.Errorf("build summary %s: %w", item.name, err)
			}
		}
	}
	if !sameReference(summary.ProvenancePath, execution.Build.Provenance) || !sameReference(summary.NativePath, execution.Build.NativeTrace) {
		return errors.New("build summary references differ from execution snapshot")
	}
	if !sameReference(summary.FixturePath, provenance.Fixture) || !sameReference(summary.ExpectationsPath, provenance.Expectations) ||
		!sameReferenceContents(summary.NativePath, provenance.NativeTrace) {
		return errors.New("build summary input references differ from build provenance")
	}

	if err := verifySourceReference(root, provenance.Fixture); err != nil {
		return fmt.Errorf("fixture input provenance: %w", err)
	}
	if err := verifySourceReference(root, provenance.Plan); err != nil {
		return fmt.Errorf("oracle plan provenance: %w", err)
	}
	if err := verifySourceReference(root, provenance.Expectations); err != nil {
		return fmt.Errorf("oracle expectations provenance: %w", err)
	}
	if err := verifyInputReference(root, provenance.NativeTrace, "inputs/"); err != nil {
		return fmt.Errorf("native input provenance: %w", err)
	}

	var sourceBefore sourcePinMap
	if err := readJSONMember(root, "provenance/source-before.json", &sourceBefore); err != nil {
		return fmt.Errorf("read source snapshot for build pin comparison: %w", err)
	}
	for _, sourcePath := range sortedPinPaths(provenance.SourcePins) {
		pin := provenance.SourcePins[sourcePath]
		snapshotPin, exists := sourceBefore[sourcePath]
		if !exists || !pinValuesEqual(pin, snapshotPin) {
			return fmt.Errorf("build source pin %q is absent or differs in source snapshot", sourcePath)
		}
		if err := verifySourcePin(root, sourcePath, pin); err != nil {
			return fmt.Errorf("build source pin %q: %w", sourcePath, err)
		}
	}
	return nil
}

func verifyAttemptReferenceFromDisk(root, attempt string, ref *fileReference, expectedRel string) error {
	return verifyAttemptReference(root, attempt, ref, expectedRel, nil)
}

func verifyAttemptReference(root, attempt string, ref *fileReference, expectedRel string, provided []byte) error {
	if err := validateReference(ref); err != nil {
		return err
	}
	prefix := "backend-qualification/output/attempts/" + attempt + "/"
	if !strings.HasPrefix(*ref.Path, prefix) {
		return fmt.Errorf("path %q is not under this attempt", *ref.Path)
	}
	rel := strings.TrimPrefix(*ref.Path, prefix)
	if !isSafeRelativePath(rel) || (expectedRel != "" && rel != expectedRel) {
		return fmt.Errorf("unexpected or unsafe attempt member path %q", rel)
	}
	if provided != nil {
		return verifyBytesReference(rel, *ref, provided)
	}
	return verifyMemberReference(root, rel, *ref)
}

func verifySourceReference(root string, ref *fileReference) error {
	if err := validateReference(ref); err != nil {
		return err
	}
	if !isSafeRelativePath(*ref.Path) {
		return fmt.Errorf("unsafe source reference path %q", *ref.Path)
	}
	return verifyMemberReference(root, "source/"+*ref.Path, *ref)
}

func verifyInputReference(root string, ref *fileReference, archivePrefix string) error {
	if err := validateReference(ref); err != nil {
		return err
	}
	if !isSafeRelativePath(*ref.Path) {
		return fmt.Errorf("unsafe input reference path %q", *ref.Path)
	}
	return verifyMemberReference(root, archivePrefix+*ref.Path, *ref)
}

func verifySourcePin(root, sourcePath string, pin filePin) error {
	if !isSafeRelativePath(sourcePath) || pin.Bytes == nil || *pin.Bytes < 0 || pin.SHA256 == nil || !isLowerSHA256(*pin.SHA256) {
		return errors.New("source pin has an invalid path, size, or SHA-256")
	}
	referencePath := sourcePath
	return verifyMemberReference(root, "source/"+sourcePath, fileReference{Path: &referencePath, Bytes: pin.Bytes, SHA256: pin.SHA256})
}

func verifyMemberReference(root, rel string, ref fileReference) error {
	if err := validateReference(&ref); err != nil {
		return err
	}
	if !isSafeRelativePath(rel) {
		return fmt.Errorf("unsafe archive member path %q", rel)
	}
	path := filepath.Join(root, filepath.FromSlash(rel))
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	pathAbs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	relPath, err := filepath.Rel(rootAbs, pathAbs)
	if err != nil || relPath == ".." || strings.HasPrefix(relPath, ".."+string(filepath.Separator)) {
		return fmt.Errorf("archive member %q escapes extraction root", rel)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read archive member %q: %w", rel, err)
	}
	return verifyBytesReference(rel, ref, data)
}

func verifyBytesReference(label string, ref fileReference, data []byte) error {
	if ref.Bytes == nil || ref.SHA256 == nil || *ref.Bytes < 0 || !isLowerSHA256(*ref.SHA256) {
		return fmt.Errorf("%s reference has invalid bytes or SHA-256", label)
	}
	digest := sha256.Sum256(data)
	if int64(len(data)) != *ref.Bytes || hex.EncodeToString(digest[:]) != *ref.SHA256 {
		return fmt.Errorf("%s reference does not match archived bytes", label)
	}
	return nil
}

func validateReference(ref *fileReference) error {
	if ref == nil || ref.Path == nil || ref.Bytes == nil || ref.SHA256 == nil || *ref.Path == "" || *ref.Bytes < 0 || !isLowerSHA256(*ref.SHA256) {
		return errors.New("file reference is incomplete or invalid")
	}
	return nil
}

func readJSONMember(root, rel string, target any) error {
	if !isSafeRelativePath(rel) {
		return fmt.Errorf("unsafe archive member path %q", rel)
	}
	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, target); err != nil {
		return err
	}
	return nil
}

func decodeStrictJSON(data []byte, target any) error {
	if err := rejectDuplicateJSONKeys(data); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("multiple JSON values are not allowed")
		}
		return err
	}
	return nil
}

func certificateEqual(left, right backendqualification.Certificate) bool {
	if len(left.Results) != len(right.Results) {
		return false
	}
	leftComparable := left
	rightComparable := right
	leftComparable.Results = cloneCertificateResults(left.Results)
	rightComparable.Results = cloneCertificateResults(right.Results)
	for i := range left.Results {
		leftComparable.Results[i].ProbeException = nil
		rightComparable.Results[i].ProbeException = nil
	}
	if !reflect.DeepEqual(leftComparable, rightComparable) {
		return false
	}
	for i := range left.Results {
		if !equalJSONSemantics(left.Results[i].ProbeException, right.Results[i].ProbeException) {
			return false
		}
	}
	return true
}

func equalJSONSemantics(left, right json.RawMessage) bool {
	if rejectDuplicateJSONKeys(left) != nil || rejectDuplicateJSONKeys(right) != nil {
		return false
	}
	var leftValue, rightValue any
	leftDecoder := json.NewDecoder(bytes.NewReader(left))
	leftDecoder.UseNumber()
	if err := leftDecoder.Decode(&leftValue); err != nil {
		return false
	}
	rightDecoder := json.NewDecoder(bytes.NewReader(right))
	rightDecoder.UseNumber()
	if err := rightDecoder.Decode(&rightValue); err != nil {
		return false
	}
	return jsonValuesEqual(leftValue, rightValue)
}

func rejectDuplicateJSONKeys(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := consumeJSONValue(decoder); err != nil {
		return err
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("multiple JSON values are not allowed")
		}
		return err
	}
	return nil
}

func consumeJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delim, isDelim := token.(json.Delim)
	if !isDelim {
		return nil
	}
	switch delim {
	case '{':
		seen := make(map[string]struct{})
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return errors.New("JSON object key is not a string")
			}
			if _, duplicate := seen[key]; duplicate {
				return fmt.Errorf("duplicate JSON object key %q", key)
			}
			seen[key] = struct{}{}
			if err := consumeJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim('}') {
			return errors.New("unterminated JSON object")
		}
	case '[':
		for decoder.More() {
			if err := consumeJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim(']') {
			return errors.New("unterminated JSON array")
		}
	default:
		return errors.New("unexpected JSON delimiter")
	}
	return nil
}

func jsonValuesEqual(left, right any) bool {
	switch a := left.(type) {
	case nil:
		return right == nil
	case bool:
		b, ok := right.(bool)
		return ok && a == b
	case string:
		b, ok := right.(string)
		return ok && a == b
	case json.Number:
		b, ok := right.(json.Number)
		if !ok {
			return false
		}
		ar, aok := new(big.Rat).SetString(string(a))
		br, bok := new(big.Rat).SetString(string(b))
		if aok && bok {
			return ar.Cmp(br) == 0
		}
		return a == b
	case []any:
		b, ok := right.([]any)
		if !ok || len(a) != len(b) {
			return false
		}
		for i := range a {
			if !jsonValuesEqual(a[i], b[i]) {
				return false
			}
		}
		return true
	case map[string]any:
		b, ok := right.(map[string]any)
		if !ok || len(a) != len(b) {
			return false
		}
		for key, value := range a {
			other, exists := b[key]
			if !exists || !jsonValuesEqual(value, other) {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func sameReference(left, right *fileReference) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return left.Path != nil && right.Path != nil && left.Bytes != nil && right.Bytes != nil && left.SHA256 != nil && right.SHA256 != nil &&
		*left.Path == *right.Path && *left.Bytes == *right.Bytes && *left.SHA256 == *right.SHA256
}

func sameReferenceContents(left, right *fileReference) bool {
	if left == nil || right == nil || left.Bytes == nil || right.Bytes == nil || left.SHA256 == nil || right.SHA256 == nil {
		return false
	}
	return *left.Bytes == *right.Bytes && *left.SHA256 == *right.SHA256
}

func sourcePinMapsEqual(left, right sourcePinMap) bool {
	if len(left) != len(right) {
		return false
	}
	for path, pin := range left {
		other, exists := right[path]
		if !exists || !pinValuesEqual(pin, other) {
			return false
		}
	}
	return true
}

func pinValuesEqual(left, right filePin) bool {
	return left.Bytes != nil && right.Bytes != nil && left.SHA256 != nil && right.SHA256 != nil && *left.Bytes == *right.Bytes && *left.SHA256 == *right.SHA256
}

func sortedPinPaths(pins map[string]filePin) []string {
	paths := make([]string, 0, len(pins))
	for path := range pins {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	return paths
}

func isSafeRelativePath(path string) bool {
	if path == "" || strings.ContainsRune(path, '\x00') || strings.Contains(path, "\\") || strings.HasPrefix(path, "/") || strings.Contains(path, ":") {
		return false
	}
	clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(path)))
	return clean == path && clean != "." && clean != ".." && !strings.HasPrefix(clean, "../")
}

func validAttempt(attempt string) bool {
	if !strings.HasPrefix(attempt, "attempt-") {
		return false
	}
	token := strings.TrimPrefix(attempt, "attempt-")
	if len(token) == 0 || len(token) > 128 || !isASCIIAlphaNumeric(token[0]) {
		return false
	}
	for i := 1; i < len(token); i++ {
		c := token[i]
		if !isASCIIAlphaNumeric(c) && c != '.' && c != '_' && c != '-' {
			return false
		}
	}
	return true
}

func isASCIIAlphaNumeric(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9'
}

func isLowerSHA256(value string) bool {
	if len(value) != 64 {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && hex.EncodeToString(decoded) == value
}

func isLowerGitCommit(value string) bool {
	if len(value) != 40 {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && hex.EncodeToString(decoded) == value
}

func cloneCertificateResults(input []backendqualification.CertificateResult) []backendqualification.CertificateResult {
	results := make([]backendqualification.CertificateResult, len(input))
	for i, result := range input {
		results[i] = result
		results[i].ExpectedChannels = append([]string{}, result.ExpectedChannels...)
		results[i].AllowedChannels = append([]string{}, result.AllowedChannels...)
		results[i].ObservedChannels = append([]string{}, result.ObservedChannels...)
		results[i].ProbeException = append(json.RawMessage{}, result.ProbeException...)
		results[i].InfrastructureErrors = append([]string{}, result.InfrastructureErrors...)
		results[i].PageErrors = append([]string{}, result.PageErrors...)
		if result.ActivationEventIndex != nil {
			value := *result.ActivationEventIndex
			results[i].ActivationEventIndex = &value
		}
		if result.ActivationTargetPath != nil {
			value := *result.ActivationTargetPath
			results[i].ActivationTargetPath = &value
		}
	}
	return results
}
