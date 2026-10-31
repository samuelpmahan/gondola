package modulequalification

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

const captureRootEnv = "GOBI_MODULE_CAPTURE_ROOT"

type mutationCorpus struct {
	Schema   string         `json:"schema"`
	Fixture  string         `json:"fixture"`
	Baseline corpusBaseline `json:"baseline"`
	Cases    []mutationCase `json:"cases"`
}

type corpusBaseline struct {
	Root                  string `json:"root"`
	SummaryPath           string `json:"summaryPath"`
	SummaryStatus         string `json:"summaryStatus"`
	ProfileCount          int    `json:"profileCount"`
	FixedEvents           int    `json:"fixedEvents"`
	FixedGoUpdates        int    `json:"fixedGoUpdates"`
	FixedStateCheckpoints int    `json:"fixedStateCheckpoints"`
	SeedEvents            int    `json:"seedEvents"`
}

type mutationCase struct {
	ID                 string          `json:"id"`
	Checker            string          `json:"checker"`
	File               string          `json:"file"`
	Pointer            string          `json:"pointer"`
	Mutation           string          `json:"mutation"`
	Value              json.RawMessage `json:"value"`
	Index              int             `json:"index"`
	From               string          `json:"from"`
	Edits              []mutationEdit  `json:"edits"`
	ExpectedDiagnostic string          `json:"expectedDiagnostic"`
	ExpectedDetail     string          `json:"expectedDetail"`
}

type mutationEdit struct {
	Pointer  string          `json:"pointer"`
	Mutation string          `json:"mutation"`
	Value    json.RawMessage `json:"value"`
	Index    int             `json:"index"`
	From     string          `json:"from"`
}

// TestCapturedFixtureIsActuallyAccepted is the positive control for every
// negative mutation below. The mutation tests must not pass merely because an
// overlay is malformed, has a missing source file, or is rejected before the
// intended captured field is inspected.
func TestCapturedFixtureIsActuallyAccepted(t *testing.T) {
	root := capturedRoot(t)
	capture, err := CheckCaptures(root)
	if err != nil {
		t.Fatalf("unmodified actual captures rejected: %v", err)
	}
	if capture.Profiles != 12 || capture.Events != 144 || capture.Updates != 99 || len(capture.Seeds) != 3 {
		t.Fatalf("actual capture report does not describe the finite fixture: %+v", capture)
	}
	if capture.MutationControls != 0 {
		t.Fatalf("capture checker must not copy the producer's claimed mutation-control count: %+v", capture)
	}
	if got := fmt.Sprint(capture.Seeds); got != "[20261031 20261032 20261033]" {
		t.Fatalf("seed set changed: %s", got)
	}
	if err := CheckABIs(root); err != nil {
		t.Fatalf("unmodified four-build ABI set rejected: %v", err)
	}
	if _, err := VerifyDirectory(root); err != nil {
		t.Fatalf("unmodified complete directory rejected: %v", err)
	}
}

// TestRealCaptureMutationControls applies each declared mutation to a
// hard-link overlay of the real producer output. The baseline stays unchanged;
// every non-target file retains the exact captured bytes. The summary's
// status remains "matched" for all mutations so it cannot serve as the
// checker verdict.
func TestRealCaptureMutationControls(t *testing.T) {
	root := capturedRoot(t)
	corpus := readMutationCorpus(t)
	if corpus.Schema != "gobi.module-qualification-mutation-controls/v1" {
		t.Fatalf("unexpected mutation control schema %q", corpus.Schema)
	}
	if corpus.Fixture != "independent-module-pair-v1" || len(corpus.Cases) != 10 {
		t.Fatalf("incomplete mutation corpus: fixture=%q cases=%d", corpus.Fixture, len(corpus.Cases))
	}
	for _, tc := range corpus.Cases {
		t.Run(tc.ID, func(t *testing.T) {
			if tc.ExpectedDiagnostic == "" || !strings.HasPrefix(tc.File, "conformance/") && !strings.HasPrefix(tc.File, "builds/") && !strings.HasPrefix(tc.File, "source/") {
				t.Fatalf("invalid mutation control: %+v", tc)
			}
			originalPath := filepath.Join(root, filepath.FromSlash(tc.File))
			originalHash := fileSHA256(t, originalPath)
			overlay := hardlinkOverlay(t, root)
			mutateCapturedFile(t, filepath.Join(overlay, filepath.FromSlash(tc.File)), tc)
			err := runConfiguredChecker(overlay, tc.Checker)
			if err == nil {
				t.Fatalf("checker accepted mutated %s field %s", tc.File, tc.Pointer)
			}
			if !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(tc.ExpectedDiagnostic)) {
				t.Fatalf("mutation was rejected for an unrelated reason; wanted diagnostic containing %q, got: %v", tc.ExpectedDiagnostic, err)
			}
			if tc.ExpectedDetail != "" && !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(tc.ExpectedDetail)) {
				t.Fatalf("mutation was rejected before its intended semantic check; wanted detail containing %q, got: %v", tc.ExpectedDetail, err)
			}
			t.Logf("mutated %s %s; checker rejected: %v", tc.File, tc.Pointer, err)
			assertSummaryStillMatched(t, overlay, corpus.Baseline)
			if got := fileSHA256(t, originalPath); got != originalHash {
				t.Fatalf("mutation changed immutable baseline file %s: before=%s after=%s", tc.File, originalHash, got)
			}
		})
	}
}

func fileSHA256(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s for hash: %v", path, err)
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func runConfiguredChecker(root, checker string) error {
	switch checker {
	case "CheckCaptures":
		_, err := CheckCaptures(root)
		return err
	case "CheckABIs":
		return CheckABIs(root)
	case "VerifyDirectory":
		_, err := VerifyDirectory(root)
		return err
	default:
		return fmt.Errorf("unknown checker %q in mutation corpus", checker)
	}
}

func capturedRoot(t *testing.T) string {
	t.Helper()
	root := os.Getenv(captureRootEnv)
	if root == "" {
		t.Skip("set GOBI_MODULE_CAPTURE_ROOT to the immutable actual 12-profile capture root")
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		t.Fatalf("%s must name an existing capture directory: root=%q err=%v", captureRootEnv, root, err)
	}
	return root
}

func readMutationCorpus(t *testing.T) mutationCorpus {
	t.Helper()
	_, source, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate adversarial test source")
	}
	path := filepath.Join(filepath.Dir(source), "..", "module-qualification", "controls", "mutations.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read mutation control corpus %s: %v", path, err)
	}
	var corpus mutationCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatalf("decode mutation control corpus: %v", err)
	}
	return corpus
}

// hardlinkOverlay mirrors directory structure and hard-links regular files.
// A mutation unlinks only its target before writing, so it cannot alter the
// immutable producer root. Preserving regular file types also prevents a
// symlink rejection from masquerading as the expected semantic failure.
func hardlinkOverlay(t *testing.T, source string) string {
	t.Helper()
	dest := t.TempDir()
	err := filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		out := filepath.Join(dest, rel)
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("capture root contains unsupported symlink %s", rel)
		}
		if entry.IsDir() {
			return os.MkdirAll(out, info.Mode().Perm())
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("capture root contains non-regular file %s (%s)", rel, info.Mode())
		}
		if err := os.Link(path, out); err == nil {
			return nil
		}
		// Hard-link failures can be filesystem-specific. Preserve exact bytes
		// with a private copy rather than degrading the test to a symlink.
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		return os.WriteFile(out, data, info.Mode().Perm())
	})
	if err != nil {
		t.Fatalf("make hard-link overlay of actual capture root: %v", err)
	}
	return dest
}

func mutateCapturedFile(t *testing.T, path string, tc mutationCase) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read mutation target %s: %v", path, err)
	}
	var changed []byte
	switch tc.Mutation {
	case "append-bytes":
		var suffix string
		if err := json.Unmarshal(tc.Value, &suffix); err != nil {
			t.Fatalf("decode append-bytes value for %s: %v", tc.ID, err)
		}
		changed = append(data, suffix...)
	default:
		changed = mutateJSONAtPointer(t, data, tc)
		for _, edit := range tc.Edits {
			changed = mutateJSONAtPointer(t, changed, mutationCase{Pointer: edit.Pointer, Mutation: edit.Mutation, Value: edit.Value, Index: edit.Index, From: edit.From})
		}
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("unlink hard-linked target before mutation: %v", err)
	}
	if err := os.WriteFile(path, changed, 0o644); err != nil {
		t.Fatalf("write mutated target: %v", err)
	}
}

func mutateJSONAtPointer(t *testing.T, data []byte, tc mutationCase) []byte {
	t.Helper()
	start, end, err := locateJSONPointer(data, tc.Pointer)
	if err != nil {
		t.Fatalf("locate mutation %s at %s: %v", tc.ID, tc.Pointer, err)
	}
	if tc.Mutation == "swap-with-index" {
		parent := tc.Pointer[:strings.LastIndex(tc.Pointer, "/")]
		otherPointer := parent + "/" + strconv.Itoa(tc.Index)
		otherStart, otherEnd, err := locateJSONPointer(data, otherPointer)
		if err != nil {
			t.Fatalf("locate swap target for %s at %s: %v", tc.ID, otherPointer, err)
		}
		if start == otherStart {
			t.Fatalf("swap mutation %s selected the same index twice", tc.ID)
		}
		if start > otherStart {
			start, end, otherStart, otherEnd = otherStart, otherEnd, start, end
		}
		out := make([]byte, 0, len(data)-(end-start)-(otherEnd-otherStart))
		out = append(out, data[:start]...)
		out = append(out, data[otherStart:otherEnd]...)
		out = append(out, data[end:otherStart]...)
		out = append(out, data[start:end]...)
		out = append(out, data[otherEnd:]...)
		return out
	}
	old := data[start:end]
	var replacement []byte
	switch tc.Mutation {
	case "replace-number", "replace-string", "replace-boolean":
		replacement = append([]byte(nil), tc.Value...)
	case "append-string", "replace-substring":
		var before, after string
		if err := json.Unmarshal(old, &before); err != nil {
			t.Fatalf("decode string target for %s: %v", tc.ID, err)
		}
		if tc.Mutation == "append-string" {
			var suffix string
			if err := json.Unmarshal(tc.Value, &suffix); err != nil {
				t.Fatalf("decode appended string for %s: %v", tc.ID, err)
			}
			after = before + suffix
		} else {
			if tc.From == "" || !strings.Contains(before, tc.From) {
				t.Fatalf("target string for %s does not contain expected fragment %q", tc.ID, tc.From)
			}
			var value string
			if err := json.Unmarshal(tc.Value, &value); err != nil {
				t.Fatalf("decode replacement string for %s: %v", tc.ID, err)
			}
			after = strings.Replace(before, tc.From, value, 1)
		}
		replacement, err = json.Marshal(after)
		if err != nil {
			t.Fatalf("encode replacement string for %s: %v", tc.ID, err)
		}
	default:
		t.Fatalf("unknown mutation operation %q", tc.Mutation)
	}
	if len(replacement) == 0 || !json.Valid(replacement) {
		t.Fatalf("mutation %s produced invalid JSON token %q", tc.ID, replacement)
	}
	out := make([]byte, 0, len(data)-(end-start)+len(replacement))
	out = append(out, data[:start]...)
	out = append(out, replacement...)
	out = append(out, data[end:]...)
	return out
}

func locateJSONPointer(data []byte, pointer string) (int, int, error) {
	if pointer == "" || pointer[0] != '/' {
		return 0, 0, fmt.Errorf("pointer must begin with slash")
	}
	parts := strings.Split(strings.TrimPrefix(pointer, "/"), "/")
	for i, raw := range parts {
		parts[i] = strings.ReplaceAll(strings.ReplaceAll(raw, "~1", "/"), "~0", "~")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	return locateJSONValue(decoder, data, parts)
}

func locateJSONValue(decoder *json.Decoder, data []byte, path []string) (int, int, error) {
	start := int(decoder.InputOffset())
	for start < len(data) && isJSONSpace(data[start]) {
		start++
	}
	// Decoder.Token leaves InputOffset immediately after an object's key;
	// the colon is structural punctuation and is consumed implicitly when
	// Token reads the corresponding value, so exclude it from the value span.
	if start < len(data) && data[start] == ':' {
		start++
		for start < len(data) && isJSONSpace(data[start]) {
			start++
		}
	}
	token, err := decoder.Token()
	if err != nil {
		return 0, 0, err
	}
	if len(path) == 0 {
		if open, ok := token.(json.Delim); ok && (open == '{' || open == '[') {
			if err := skipJSONContainer(decoder, open); err != nil {
				return 0, 0, err
			}
		}
		return start, int(decoder.InputOffset()), nil
	}
	delim, ok := token.(json.Delim)
	if !ok {
		return 0, 0, fmt.Errorf("cannot descend through scalar at %q", path[0])
	}
	switch delim {
	case '{':
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return 0, 0, err
			}
			key, ok := keyToken.(string)
			if !ok {
				return 0, 0, fmt.Errorf("object key is %T", keyToken)
			}
			if key == path[0] {
				return locateJSONValue(decoder, data, path[1:])
			}
			if err := skipJSONValue(decoder); err != nil {
				return 0, 0, err
			}
		}
		if _, err := decoder.Token(); err != nil {
			return 0, 0, err
		}
		return 0, 0, fmt.Errorf("object member %q not found", path[0])
	case '[':
		want, err := strconv.Atoi(path[0])
		if err != nil || want < 0 {
			return 0, 0, fmt.Errorf("invalid array index %q", path[0])
		}
		for index := 0; decoder.More(); index++ {
			if index == want {
				return locateJSONValue(decoder, data, path[1:])
			}
			if err := skipJSONValue(decoder); err != nil {
				return 0, 0, err
			}
		}
		if _, err := decoder.Token(); err != nil {
			return 0, 0, err
		}
		return 0, 0, fmt.Errorf("array index %d out of range", want)
	default:
		return 0, 0, fmt.Errorf("cannot descend through delimiter %q", delim)
	}
}

func skipJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	if open, ok := token.(json.Delim); ok && (open == '{' || open == '[') {
		return skipJSONContainer(decoder, open)
	}
	return nil
}

func skipJSONContainer(decoder *json.Decoder, open json.Delim) error {
	switch open {
	case '{':
		for decoder.More() {
			if _, err := decoder.Token(); err != nil {
				return err
			}
			if err := skipJSONValue(decoder); err != nil {
				return err
			}
		}
	case '[':
		for decoder.More() {
			if err := skipJSONValue(decoder); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("unexpected opening delimiter %q", open)
	}
	_, err := decoder.Token()
	return err
}

func isJSONSpace(value byte) bool {
	return value == ' ' || value == '\t' || value == '\n' || value == '\r'
}

func assertSummaryStillMatched(t *testing.T, root string, expected corpusBaseline) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(expected.SummaryPath))
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read unchanged summary %s: %v", path, err)
	}
	var summary struct {
		Status                string `json:"status"`
		BrowserProfileCount   int    `json:"browserProfileCount"`
		FixedEventCount       int    `json:"fixedEventCount"`
		FixedGoUpdates        int    `json:"fixedGoUpdates"`
		FixedStateCheckpoints int    `json:"fixedStateCheckpoints"`
	}
	if err := json.Unmarshal(data, &summary); err != nil {
		t.Fatalf("decode unchanged summary: %v", err)
	}
	if summary.Status != expected.SummaryStatus || summary.BrowserProfileCount != expected.ProfileCount || summary.FixedEventCount != expected.FixedEvents || summary.FixedGoUpdates != expected.FixedGoUpdates || summary.FixedStateCheckpoints != expected.FixedStateCheckpoints {
		t.Fatalf("mutation altered or bypassed baseline summary: %+v", summary)
	}
}
