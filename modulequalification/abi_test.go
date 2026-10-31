package modulequalification

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCheckABIsAcceptsActualReactAndDOMBuilds(t *testing.T) {
	root := actualABICaptureRoot(t)
	if err := CheckABIs(root); err != nil {
		t.Fatalf("actual four-build module capture rejected: %v", err)
	}
}

func TestCheckABIsRejectsCorruptedActualBuildInputs(t *testing.T) {
	sourceRoot := actualABICaptureRoot(t)
	root := copyABIBuilds(t, sourceRoot)

	t.Run("duplicate AppIR property", func(t *testing.T) {
		manifest, err := readTestBuildManifest(root, "react-parent")
		if err != nil {
			t.Fatal(err)
		}
		appIRPath := filepath.Join(root, "builds", "react-parent", "output", filepath.FromSlash(manifest.Apps[0].AppIR))
		original, err := os.ReadFile(appIRPath)
		if err != nil {
			t.Fatal(err)
		}
		needle := []byte(`"schema":"gobi.app-ir/v1"`)
		if !bytes.Contains(original, needle) {
			t.Fatal("captured AppIR schema token was not found")
		}
		mutated := bytes.Replace(original, needle, []byte(`"schema":"gobi.app-ir/v1","schema":"gobi.app-ir/v1"`), 1)
		if err := os.WriteFile(appIRPath, mutated, 0o600); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.WriteFile(appIRPath, original, 0o600) })
		if err := CheckABIs(root); err == nil || !strings.Contains(err.Error(), "react-parent") {
			t.Fatalf("duplicate AppIR property was not rejected with profile context: %v", err)
		}
	})

	t.Run("changed generated module bytes", func(t *testing.T) {
		manifest, err := readTestBuildManifest(root, "react-parent")
		if err != nil {
			t.Fatal(err)
		}
		modulePath := filepath.Join(root, "builds", "react-parent", "output", filepath.FromSlash(manifest.Apps[0].Module))
		original, err := os.ReadFile(modulePath)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(modulePath, append(append([]byte(nil), original...), '\n'), 0o600); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.WriteFile(modulePath, original, 0o600) })
		if err := CheckABIs(root); err == nil || !strings.Contains(err.Error(), "react-parent") {
			t.Fatalf("changed module bytes were not rejected with profile context: %v", err)
		}
	})

	t.Run("unsafe sidecar path in manifest", func(t *testing.T) {
		manifestPath := filepath.Join(root, "builds", "react-parent", "output", "buildmanifest.json")
		original, err := os.ReadFile(manifestPath)
		if err != nil {
			t.Fatal(err)
		}
		var manifest abiBuildManifest
		if err := json.Unmarshal(original, &manifest); err != nil {
			t.Fatal(err)
		}
		manifest.Apps[0].ModuleABI = "../module-abi.json"
		mutated, err := json.Marshal(manifest)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(manifestPath, mutated, 0o600); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.WriteFile(manifestPath, original, 0o600) })
		if err := CheckABIs(root); err == nil || !strings.Contains(err.Error(), "unsafe segment") {
			t.Fatalf("unsafe moduleABI path was not rejected: %v", err)
		}
	})

	t.Run("unknown sidecar property", func(t *testing.T) {
		manifest, err := readTestBuildManifest(root, "react-parent")
		if err != nil {
			t.Fatal(err)
		}
		descriptorPath := filepath.Join(root, "builds", "react-parent", "output", filepath.FromSlash(manifest.Apps[0].ModuleABI))
		original, err := os.ReadFile(descriptorPath)
		if err != nil {
			t.Fatal(err)
		}
		trimmed := bytes.TrimSpace(original)
		if len(trimmed) == 0 || trimmed[len(trimmed)-1] != '}' {
			t.Fatal("captured descriptor is not a JSON object")
		}
		mutated := append([]byte(nil), trimmed[:len(trimmed)-1]...)
		mutated = append(mutated, []byte(`,"unexpected":true}`)...)
		if err := os.WriteFile(descriptorPath, mutated, 0o600); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.WriteFile(descriptorPath, original, 0o600) })
		if err := CheckABIs(root); err == nil || !strings.Contains(err.Error(), "unknown") {
			t.Fatalf("unknown sidecar property was not rejected by strict decoding: %v", err)
		}
	})
}

func actualABICaptureRoot(t *testing.T) string {
	t.Helper()
	root := os.Getenv("GOBI_MODULE_CAPTURE_ROOT")
	if root == "" {
		root = "/tmp/gobi-published-restore-check"
	}
	if info, err := os.Stat(root); err != nil || !info.IsDir() {
		t.Skipf("actual module capture root is unavailable at %q", root)
	}
	return root
}

func copyABIBuilds(t *testing.T, sourceRoot string) string {
	t.Helper()
	destination := t.TempDir()
	for _, profile := range abiBuildProfiles {
		source := filepath.Join(sourceRoot, "builds", profile.name)
		target := filepath.Join(destination, "builds", profile.name)
		err := filepath.WalkDir(source, func(current string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			relative, err := filepath.Rel(source, current)
			if err != nil {
				return err
			}
			output := filepath.Join(target, relative)
			info, err := entry.Info()
			if err != nil {
				return err
			}
			if info.Mode()&os.ModeSymlink != 0 {
				return os.ErrInvalid
			}
			if entry.IsDir() {
				return os.MkdirAll(output, 0o700)
			}
			if !info.Mode().IsRegular() {
				return os.ErrInvalid
			}
			data, err := os.ReadFile(current)
			if err != nil {
				return err
			}
			return os.WriteFile(output, data, 0o600)
		})
		if err != nil {
			t.Fatalf("copy %s build: %v", profile.name, err)
		}
	}
	return destination
}

func readTestBuildManifest(root, profile string) (abiBuildManifest, error) {
	path := filepath.Join(root, "builds", profile, "output", "buildmanifest.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return abiBuildManifest{}, err
	}
	var manifest abiBuildManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return abiBuildManifest{}, err
	}
	return manifest, nil
}
