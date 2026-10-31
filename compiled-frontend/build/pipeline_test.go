package build

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func TestCompiledModuleSourceExportsOnlyValidatedFacadeAndCopiesUpdateState(t *testing.T) {
	const packagePath = "example/fixture"
	app := compilercontract.AppIR{
		Schema:      compilercontract.AppIRSchema,
		PackagePath: packagePath,
		Components: []compilercontract.Component{{
			ID: packagePath, PackagePath: packagePath,
			Init: "example/fixture.Init", Update: "example/fixture.Update", View: "example/fixture.View",
		}},
		Symbols: []compilercontract.Symbol{
			{ID: "example/fixture.Init", PackagePath: packagePath, Name: "Init"},
			{ID: "example/fixture.Update", PackagePath: packagePath, Name: "Update"},
			{ID: "example/fixture.View", PackagePath: packagePath, Name: "View"},
		},
	}
	source, err := compiledModuleSource(app)
	if err != nil {
		t.Fatal(err)
	}
	text := string(source)
	facadeImport := `import * as emitted from "@goscript/gobi.generated/compiled/facades/` + appDirectoryName(packagePath) + `/index.js"`
	for _, want := range []string{
		facadeImport,
		`Object.defineProperty(symbols, "example/fixture.Init", { value: emitted.GobiCompiledInit, enumerable: true })`,
		`Object.defineProperty(symbols, "example/fixture.Update", { value: emitted.GobiCompiledUpdate, enumerable: true })`,
		`Object.defineProperty(symbols, "example/fixture.View", { value: emitted.GobiCompiledView, enumerable: true })`,
		`export const gobiCompiled = Object.freeze({ schema: "gobi.compiled-module/v1", appIR, symbols: Object.freeze(symbols) });`,
	} {
		if !strings.Contains(text, want) {
			t.Errorf("compiled facade missing %q", want)
		}
	}
	if strings.Contains(text, "state.clone()") || strings.Contains(text, "(state, message) =>") {
		t.Fatal("compiled facade applies Go value semantics in handwritten JavaScript")
	}
}

func TestCompiledEntryDirectoryNameIsStableAndPackageSpecific(t *testing.T) {
	first := appDirectoryName("github.com/example/a/counter")
	if first != appDirectoryName("github.com/example/a/counter") {
		t.Fatal("same package path produced different output directories")
	}
	if first == appDirectoryName("github.com/example/b/counter") {
		t.Fatal("same final segment from distinct package paths collided")
	}
	if !strings.HasPrefix(first, "counter-") || len(strings.TrimPrefix(first, "counter-")) != 12 {
		t.Fatalf("app directory %q does not follow segment+12-hex hash layout", first)
	}
}

func TestVerifyCompiledEntriesRequiresEveryRequestedEntry(t *testing.T) {
	if err := verifyCompiledEntries([]string{"example/a", "example/b"}, []string{"example/a", "example/b"}); err != nil {
		t.Fatalf("complete compiler result rejected: %v", err)
	}
	if err := verifyCompiledEntries([]string{"example/a"}, []string{"example/a", "example/b"}); err == nil {
		t.Fatal("compiler result missing an entry was accepted")
	}
}

func TestBuildPublishesInspectableGoScriptTypeScript(t *testing.T) {
	output := filepath.Join(t.TempDir(), "compiled")
	request := compilercontract.BuildRequest{
		Schema:        compilercontract.BuildRequestSchema,
		SourceRoot:    repositoryRoot(t),
		EntryPackages: []string{"github.com/samuelpmahan/gondola/counter"},
		Backend:       "react",
		OutputDir:     output,
	}
	result := Build(request)
	if !result.OK {
		t.Fatalf("Build failed: diagnostics=%#v", result.Diagnostics)
	}
	manifestBytes, err := os.ReadFile(filepath.Join(output, "buildmanifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		ForwarderModule   string   `json:"forwarderModule"`
		ForwarderGoMod    string   `json:"forwarderGoMod"`
		ForwarderSources  []string `json:"forwarderSources"`
		EmittedTypeScript []string `json:"emittedTypeScript"`
		Apps              []struct {
			PackagePath      string `json:"packagePath"`
			Backend          string `json:"backend"`
			Module           string `json:"module"`
			Encoder          string `json:"encoder"`
			ForwarderPackage string `json:"forwarderPackage"`
			RoleBindings     []struct {
				Role            string `json:"role"`
				AppIRSymbol     string `json:"appIRSymbol"`
				ForwarderExport string `json:"forwarderExport"`
			} `json:"roleBindings"`
		} `json:"apps"`
	}
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.EmittedTypeScript) == 0 {
		t.Fatal("build manifest does not expose emitted GoScript TypeScript")
	}
	if manifest.ForwarderModule != forwarderModulePath || manifest.ForwarderGoMod != "forwarders/go.mod" {
		t.Fatalf("build manifest has incomplete forwarding module metadata: %#v", manifest)
	}
	if len(manifest.Apps) != 1 || manifest.Apps[0].PackagePath != request.EntryPackages[0] || manifest.Apps[0].Backend != request.Backend || manifest.Apps[0].ForwarderPackage != forwarderPackagePath(result.Apps[0]) {
		t.Fatalf("build manifest does not identify the generated forwarding package: %#v", manifest.Apps)
	}
	wantBindings := []struct {
		role, symbol, export string
	}{
		{"init", "github.com/samuelpmahan/gondola/counter.Init", "GobiCompiledInit"},
		{"update", "github.com/samuelpmahan/gondola/counter.Update", "GobiCompiledUpdate"},
		{"view", "github.com/samuelpmahan/gondola/counter.View", "GobiCompiledView"},
	}
	if len(manifest.Apps[0].RoleBindings) != len(wantBindings) {
		t.Fatalf("build manifest role bindings = %#v", manifest.Apps[0].RoleBindings)
	}
	for index, want := range wantBindings {
		got := manifest.Apps[0].RoleBindings[index]
		if got.Role != want.role || got.AppIRSymbol != want.symbol || got.ForwarderExport != want.export {
			t.Fatalf("role binding %d = %#v, want %#v", index, got, want)
		}
	}
	forwarderSourcePath := filepath.ToSlash(filepath.Join("forwarders", "facades", appDirectoryName(request.EntryPackages[0]), "forwarder.go"))
	foundForwarderGoMod := false
	foundForwarderSource := false
	for _, relative := range manifest.ForwarderSources {
		if relative == "forwarders/go.mod" {
			foundForwarderGoMod = true
		}
		if relative == forwarderSourcePath {
			foundForwarderSource = true
		}
	}
	if !foundForwarderGoMod || !foundForwarderSource {
		t.Fatalf("build manifest omits generated forwarding inputs: %#v", manifest.ForwarderSources)
	}
	forwarderSource, err := os.ReadFile(filepath.Join(output, filepath.FromSlash(forwarderSourcePath)))
	if err != nil {
		t.Fatalf("published Go forwarding source is unavailable: %v", err)
	}
	if !strings.Contains(string(forwarderSource), "return gobiApp.Update(state, message)") {
		t.Fatalf("published Go forwarding source does not call the real app Update: %s", forwarderSource)
	}
	foundCounter := false
	for _, relative := range manifest.EmittedTypeScript {
		if filepath.IsAbs(relative) || relative == ".." || strings.HasPrefix(filepath.Clean(relative), ".."+string(filepath.Separator)) {
			t.Fatalf("emitted source path escapes build output: %q", relative)
		}
		if filepath.Ext(relative) != ".ts" {
			t.Fatalf("emitted source path is not TypeScript: %q", relative)
		}
		if strings.HasSuffix(filepath.ToSlash(relative), "/counter/counter.gs.ts") {
			foundCounter = true
		}
		content, err := os.ReadFile(filepath.Join(output, filepath.FromSlash(relative)))
		if err != nil {
			t.Fatalf("manifest emitted source %q is unavailable: %v", relative, err)
		}
		digest := fmt.Sprintf("%x", sha256.Sum256(content))
		foundInInventory := false
		for _, item := range result.Outputs {
			if item.Path == filepath.ToSlash(relative) {
				foundInInventory = true
				if item.SHA256 != digest || item.Bytes != int64(len(content)) {
					t.Fatalf("build output inventory disagrees for emitted source %q: %#v", relative, item)
				}
				break
			}
		}
		if !foundInInventory {
			t.Fatalf("BuildResult.Outputs omits emitted source %q", relative)
		}
	}
	if !foundCounter {
		t.Fatalf("manifest emitted source list lacks the counter's actual Goscript output: %#v", manifest.EmittedTypeScript)
	}
	domRequest := request
	domRequest.Backend = "dom"
	domRequest.OutputDir = filepath.Join(t.TempDir(), "compiled-dom")
	domResult := Build(domRequest)
	if !domResult.OK {
		t.Fatalf("DOM Build failed: diagnostics=%#v", domResult.Diagnostics)
	}
	domManifestBytes, err := os.ReadFile(filepath.Join(domRequest.OutputDir, "buildmanifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var domManifest struct {
		Apps []struct {
			Backend      string `json:"backend"`
			Module       string `json:"module"`
			Encoder      string `json:"encoder"`
			RoleBindings []struct {
				Role            string `json:"role"`
				AppIRSymbol     string `json:"appIRSymbol"`
				ForwarderExport string `json:"forwarderExport"`
			} `json:"roleBindings"`
		} `json:"apps"`
	}
	if err := json.Unmarshal(domManifestBytes, &domManifest); err != nil {
		t.Fatal(err)
	}
	if len(domManifest.Apps) != 1 || domManifest.Apps[0].Backend != "dom" {
		t.Fatalf("build manifest backend metadata = %#v, want dom", domManifest.Apps)
	}
	if domManifest.Apps[0].Module != manifest.Apps[0].Module || domManifest.Apps[0].Encoder != manifest.Apps[0].Encoder ||
		!reflect.DeepEqual(domManifest.Apps[0].RoleBindings, manifest.Apps[0].RoleBindings) {
		t.Fatalf("module/encoder paths or role bindings changed with backend selection: React=%#v DOM=%#v", manifest.Apps[0], domManifest.Apps[0])
	}
	if !reflect.DeepEqual(result.Apps, domResult.Apps) {
		t.Fatal("AppIR changed with backend selection")
	}
	reactArtifacts := withoutBuildManifest(result.Outputs)
	domArtifacts := withoutBuildManifest(domResult.Outputs)
	if len(reactArtifacts) != len(domArtifacts) {
		t.Fatalf("backend-neutral output counts differ: React=%d DOM=%d", len(reactArtifacts), len(domArtifacts))
	}
	for index := range reactArtifacts {
		reactArtifact, domArtifact := reactArtifacts[index], domArtifacts[index]
		if reactArtifact.Path != domArtifact.Path {
			t.Fatalf("backend-neutral output path %d differs: React=%q DOM=%q", index, reactArtifact.Path, domArtifact.Path)
		}
		if strings.HasSuffix(reactArtifact.Path, "/gobi-compiled.mjs") {
			// esbuild's source labels contain independent temporary roots, so raw
			// bundle hashes are build-specific. The harness verifies one imported
			// module instance can mount through both renderers.
			if reactArtifact.Bytes == 0 || domArtifact.Bytes == 0 {
				t.Fatalf("compiled app module %q is empty", reactArtifact.Path)
			}
			continue
		}
		if reactArtifact != domArtifact {
			t.Fatalf("backend-neutral output %q differs: React=%#v DOM=%#v", reactArtifact.Path, reactArtifact, domArtifact)
		}
	}
}

func withoutBuildManifest(outputs []compilercontract.OutputFile) []compilercontract.OutputFile {
	result := make([]compilercontract.OutputFile, 0, len(outputs))
	for _, output := range outputs {
		if output.Path != "buildmanifest.json" {
			result = append(result, output)
		}
	}
	return result
}

func TestFailedBuildPreservesPublishedTreeAndNeverReportsSuccess(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module example.com/empty\n\ngo 1.24\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(t.TempDir(), "compiled")
	if err := os.MkdirAll(output, 0o755); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(output, "previous-good.txt")
	if err := os.WriteFile(marker, []byte("previous build"), 0o644); err != nil {
		t.Fatal(err)
	}
	result := Build(compilercontract.BuildRequest{
		Schema:        compilercontract.BuildRequestSchema,
		SourceRoot:    root,
		EntryPackages: []string{"example.com/empty/missing"},
		Backend:       "react",
		OutputDir:     output,
	})
	if result.OK {
		t.Fatal("failed build reported success")
	}
	if !result.PreservedPreviousOutput {
		t.Fatalf("failed build did not report preserved previous output: %#v", result)
	}
	if len(result.Outputs) != 0 {
		t.Fatalf("failed build reported published outputs: %#v", result.Outputs)
	}
	got, err := os.ReadFile(marker)
	if err != nil {
		t.Fatalf("prior output tree was removed: %v", err)
	}
	if string(got) != "previous build" {
		t.Fatalf("prior output marker changed to %q", got)
	}
	if _, err := os.Stat(filepath.Join(output, "partial.mjs")); !os.IsNotExist(err) {
		t.Fatalf("partial output leaked into published tree: %v", err)
	}
}

func TestUnsupportedBackendLeavesExistingOutputUntouched(t *testing.T) {
	root := repositoryRoot(t)
	output := filepath.Join(t.TempDir(), "compiled")
	if err := os.MkdirAll(output, 0o755); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(output, "previous-good.txt")
	if err := os.WriteFile(marker, []byte("previous build"), 0o644); err != nil {
		t.Fatal(err)
	}
	result := Build(compilercontract.BuildRequest{
		Schema:        compilercontract.BuildRequestSchema,
		SourceRoot:    root,
		EntryPackages: []string{"github.com/samuelpmahan/gondola/counter"},
		Backend:       "svelte",
		OutputDir:     output,
	})
	if result.OK || len(result.Apps) != 0 || len(result.Outputs) != 0 || len(result.Diagnostics) == 0 {
		t.Fatalf("unsupported backend result = %#v; want failure without app or output provenance", result)
	}
	got, err := os.ReadFile(marker)
	if err != nil {
		t.Fatalf("previous output tree was removed: %v", err)
	}
	if string(got) != "previous build" {
		t.Fatalf("previous output marker changed to %q", got)
	}
	entries, err := os.ReadDir(output)
	if err != nil || len(entries) != 1 || entries[0].Name() != filepath.Base(marker) {
		t.Fatalf("unsupported backend leaked staged output: entries=%#v err=%v", entries, err)
	}
}

func repositoryRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("could not locate build test source")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}
