package build

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
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
		`Object.defineProperty(symbols, "example/fixture.Update", { value: (state, message) => emitted.GobiCompiledUpdate(state, __gobiEncodeGoMessage(message)), enumerable: true })`,
		`Object.defineProperty(symbols, "example/fixture.View", { value: (state) => __gobiDecodeGoView(emitted.GobiCompiledView(state)), enumerable: true })`,
		`import { Message as __gobiMessage } from "@goscript/github.com/samuelpmahan/gondola/gobi/index.js";`,
		`new __gobiMessage(`,
		`export const gobiCompiled = Object.freeze({ schema: "gobi.compiled-module/v1", appIR, symbols: Object.freeze(symbols) });`,
	} {
		if !strings.Contains(text, want) {
			t.Errorf("compiled facade missing %q", want)
		}
	}
	if strings.Contains(text, "state.clone()") {
		t.Fatal("compiled facade applies Go value semantics in handwritten JavaScript")
	}
}

func TestCompiledModuleSourceExportsPairSpecificPlainRecordBridgeAdapters(t *testing.T) {
	for _, side := range []string{"parent", "child"} {
		t.Run(side, func(t *testing.T) {
			app := bridgeSourceProbeApp(side)
			source, err := compiledModuleSource(app)
			if err != nil {
				t.Fatal(err)
			}
			text := string(source)
			if !strings.Contains(text, `export const gobiCompiled = Object.freeze({ schema: "gobi.compiled-module/v1", appIR, symbols: Object.freeze(symbols) });`) {
				t.Fatal("bridge module changed the legacy gobiCompiled v1 object")
			}
			if !strings.Contains(text, "export const gobiModuleBridges = Object.freeze({") {
				t.Fatal("module lacks a separate gobiModuleBridges export")
			}
			for _, key := range []string{"input:", "publication:", "output:", "receive:"} {
				want := (side == "parent" && (key == "output:" || key == "receive:")) || (side == "child" && (key == "input:" || key == "publication:"))
				if strings.Contains(text, key) != want {
					t.Errorf("%s bridge key presence = %v, want %v for %q", side, strings.Contains(text, key), want, key)
				}
			}
			if side == "parent" {
				for _, want := range []string{"value.Step", "value.Locked", "value.Revision", "publication.Count", "publication.Revision"} {
					if !strings.Contains(text, want) {
						t.Errorf("parent bridge adapter omits local record projection %q", want)
					}
				}
			} else {
				for _, want := range []string{"input.Step", "input.Locked", "input.Revision", "value.Count", "value.Revision"} {
					if !strings.Contains(text, want) {
						t.Errorf("child bridge adapter omits local record conversion %q", want)
					}
				}
			}
		})
	}
}

func bridgeSourceProbeApp(side string) compilercontract.AppIR {
	const packagePath = "example.test/module"
	const wirePackage = "github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	state := compilercontract.TypeID(packagePath + ".State")
	input := compilercontract.TypeID(wirePackage + ".Input")
	publication := compilercontract.TypeID(wirePackage + ".Publication")
	app := compilercontract.AppIR{
		Schema: compilercontract.AppIRSchema, PackagePath: packagePath,
		Components: []compilercontract.Component{{ID: packagePath, PackagePath: packagePath, StateType: state, MessageType: "example.test/module.Message", Init: compilercontract.SymbolID(packagePath + ".Init"), Update: compilercontract.SymbolID(packagePath + ".Update"), View: compilercontract.SymbolID(packagePath + ".View")}},
		Types: []compilercontract.TypeInfo{
			{ID: input, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Step", Type: "int"}, {Name: "Locked", Type: "bool"}, {Name: "Revision", Type: "int"}}},
			{ID: publication, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Count", Type: "float64"}, {Name: "Revision", Type: "int"}}},
		},
	}
	app.Symbols = []compilercontract.Symbol{
		{ID: app.Components[0].Init, PackagePath: packagePath, Name: "Init", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{}, Results: []compilercontract.TypeID{state}}},
		{ID: app.Components[0].Update, PackagePath: packagePath, Name: "Update", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{state, "example.test/module.Message"}, Results: []compilercontract.TypeID{state, "[]github.com/samuelpmahan/gondola/gobi.Effect"}}},
		{ID: app.Components[0].View, PackagePath: packagePath, Name: "View", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{state}, Results: []compilercontract.TypeID{"github.com/samuelpmahan/gondola/gobi.Node"}}},
	}
	if side == "parent" {
		app.Symbols = append(app.Symbols,
			compilercontract.Symbol{ID: compilercontract.SymbolID(packagePath + ".Output"), PackagePath: packagePath, Name: "Output", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{state}, Results: []compilercontract.TypeID{input}}},
			compilercontract.Symbol{ID: compilercontract.SymbolID(packagePath + ".Receive"), PackagePath: packagePath, Name: "Receive", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{state, publication}, Results: []compilercontract.TypeID{state}}},
		)
	} else {
		app.Symbols = append(app.Symbols,
			compilercontract.Symbol{ID: compilercontract.SymbolID(packagePath + ".Input"), PackagePath: packagePath, Name: "Input", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{state, input}, Results: []compilercontract.TypeID{state}}},
			compilercontract.Symbol{ID: compilercontract.SymbolID(packagePath + ".Publication"), PackagePath: packagePath, Name: "Publication", Signature: compilercontract.Signature{Params: []compilercontract.TypeID{state}, Results: []compilercontract.TypeID{publication}}},
		)
	}
	return app
}

func TestBuildEmitsSeparateTypedModuleBridgeABIForParentAndChild(t *testing.T) {
	root := repositoryRoot(t)
	cases := []struct {
		packagePath string
		wantRoles   []string
		wantBridge  []string
	}{
		{
			packagePath: "github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent",
			wantRoles:   []string{"Init", "Output", "Receive", "Update", "View"},
			wantBridge:  []string{"output", "receive"},
		},
		{
			packagePath: "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild",
			wantRoles:   []string{"Init", "Input", "Publication", "Update", "View"},
			wantBridge:  []string{"input", "publication"},
		},
	}
	for _, backend := range []string{"react", "dom"} {
		t.Run(backend, func(t *testing.T) {
			for _, tc := range cases {
				t.Run(filepath.Base(tc.packagePath), func(t *testing.T) {
					output := filepath.Join(t.TempDir(), "build")
					result := Build(compilercontract.BuildRequest{
						Schema: compilercontract.BuildRequestSchema, SourceRoot: root,
						EntryPackages: []string{tc.packagePath}, Backend: backend, OutputDir: output,
					})
					if !result.OK {
						t.Fatalf("Build failed: diagnostics=%#v", result.Diagnostics)
					}
					var manifest struct {
						Apps []struct {
							PackagePath string `json:"packagePath"`
							Module      string `json:"module"`
							Encoder     string `json:"encoder"`
							AppIR       string `json:"appIR"`
							Components  string `json:"components"`
							ModuleABI   string `json:"moduleABI"`
						} `json:"apps"`
					}
					manifestBytes, err := os.ReadFile(filepath.Join(output, "buildmanifest.json"))
					if err != nil {
						t.Fatal(err)
					}
					if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
						t.Fatal(err)
					}
					if len(manifest.Apps) != 1 || manifest.Apps[0].PackagePath != tc.packagePath || manifest.Apps[0].ModuleABI == "" {
						t.Fatalf("module app manifest missing package or moduleABI path: %#v", manifest.Apps)
					}
					app := manifest.Apps[0]
					var descriptor struct {
						Schema         string `json:"schema"`
						ComponentID    string `json:"componentID"`
						PackagePath    string `json:"packagePath"`
						ArtifactSHA256 string `json:"artifactSHA256"`
						Roles          []struct {
							Name string `json:"name"`
						} `json:"roles"`
						Artifacts []struct {
							Path   string `json:"path"`
							Bytes  int64  `json:"bytes"`
							SHA256 string `json:"sha256"`
						} `json:"artifacts"`
						ABISHA256 string `json:"abiSHA256"`
					}
					descriptorBytes, err := os.ReadFile(filepath.Join(output, filepath.FromSlash(app.ModuleABI)))
					if err != nil {
						t.Fatalf("module ABI descriptor %q is unavailable: %v", app.ModuleABI, err)
					}
					if err := json.Unmarshal(descriptorBytes, &descriptor); err != nil {
						t.Fatal(err)
					}
					if descriptor.Schema != "gobi.module-abi/v1" || descriptor.ComponentID != tc.packagePath || descriptor.PackagePath != tc.packagePath {
						t.Fatalf("unexpected module ABI identity: %#v", descriptor)
					}
					if len(descriptor.ArtifactSHA256) != 64 || len(descriptor.ABISHA256) != 64 {
						t.Fatalf("module ABI digests are missing: %#v", descriptor)
					}
					gotRoles := make([]string, len(descriptor.Roles))
					for index, role := range descriptor.Roles {
						gotRoles[index] = role.Name
					}
					sort.Strings(gotRoles)
					sort.Strings(tc.wantRoles)
					if !reflect.DeepEqual(gotRoles, tc.wantRoles) {
						t.Fatalf("descriptor roles = %#v, want %#v", gotRoles, tc.wantRoles)
					}
					wantArtifacts := map[string]bool{app.AppIR: false, app.Module: false, app.Encoder: false, app.Components: false}
					for _, artifact := range descriptor.Artifacts {
						contents, err := os.ReadFile(filepath.Join(output, filepath.FromSlash(artifact.Path)))
						if err != nil {
							t.Fatalf("descriptor artifact %q is missing: %v", artifact.Path, err)
						}
						if artifact.Bytes != int64(len(contents)) || artifact.SHA256 != fmt.Sprintf("%x", sha256.Sum256(contents)) {
							t.Fatalf("descriptor artifact does not bind actual bytes: %#v", artifact)
						}
						if _, ok := wantArtifacts[artifact.Path]; !ok {
							t.Errorf("descriptor binds unexpected artifact %q", artifact.Path)
						} else {
							wantArtifacts[artifact.Path] = true
						}
					}
					for path, found := range wantArtifacts {
						if !found {
							t.Errorf("descriptor omits generated artifact %q", path)
						}
					}
					moduleSource, err := os.ReadFile(filepath.Join(output, filepath.FromSlash(app.Module)))
					if err != nil {
						t.Fatal(err)
					}
					moduleText := string(moduleSource)
					if !strings.Contains(moduleText, "gobiCompiled") {
						t.Fatal("compiled module omits the legacy gobiCompiled v1 facade")
					}
					if !strings.Contains(moduleText, "gobiModuleBridges") {
						t.Fatal("module output does not export the separate gobiModuleBridges object")
					}
					for _, role := range tc.wantBridge {
						if !strings.Contains(moduleText, role+":") {
							t.Errorf("module bridge export omits %q", role)
						}
					}
					appIRBytes, err := os.ReadFile(filepath.Join(output, filepath.FromSlash(app.AppIR)))
					if err != nil {
						t.Fatal(err)
					}
					var appIR compilercontract.AppIR
					if err := json.Unmarshal(appIRBytes, &appIR); err != nil {
						t.Fatal(err)
					}
					for _, name := range tc.wantRoles {
						found := false
						for _, symbol := range appIR.Symbols {
							if symbol.PackagePath == tc.packagePath && symbol.Name == name {
								found = true
								break
							}
						}
						if !found {
							t.Errorf("AppIR omits role %q", name)
						}
					}
				})
			}
		})
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
			ModuleABI        string `json:"moduleABI"`
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
	if manifest.Apps[0].ModuleABI != "" {
		t.Fatalf("legacy counter build unexpectedly declares module ABI path %q", manifest.Apps[0].ModuleABI)
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
