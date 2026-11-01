package build

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"go/token"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/s4wave/goscript/compiler"
	"github.com/samuelpmahan/gondola/compiled-frontend/analyze"
	"github.com/samuelpmahan/gondola/compiled-frontend/emit"
	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/moduleabi"
)

type manifestApp struct {
	// Backend is additive build metadata consumers may ignore when choosing a
	// renderer from their own build invocation.
	Backend          string                `json:"backend"`
	ComponentID      string                `json:"componentId"`
	PackagePath      string                `json:"packagePath"`
	AppIR            string                `json:"appIR"`
	Module           string                `json:"module"`
	Encoder          string                `json:"encoder"`
	Components       string                `json:"components"`
	ModuleABI        string                `json:"moduleABI,omitempty"`
	ForwarderPackage string                `json:"forwarderPackage"`
	RoleBindings     []manifestRoleBinding `json:"roleBindings"`
}

type manifestRoleBinding struct {
	Role            string `json:"role"`
	AppIRSymbol     string `json:"appIRSymbol"`
	ForwarderExport string `json:"forwarderExport"`
}

type buildManifest struct {
	Schema            string        `json:"schema"`
	ForwarderModule   string        `json:"forwarderModule"`
	ForwarderGoMod    string        `json:"forwarderGoMod"`
	ForwarderSources  []string      `json:"forwarderSources"`
	EmittedTypeScript []string      `json:"emittedTypeScript"`
	Apps              []manifestApp `json:"apps"`
}

const forwarderModulePath = "gobi.generated/compiled"

type forwarderPackage struct {
	PackagePath string
}

type stageFailure struct {
	diagnostics []compilercontract.Diagnostic
	err         error
}

func (e *stageFailure) Error() string { return e.err.Error() }
func (e *stageFailure) Unwrap() error { return e.err }

// Build validates, analyzes, compiles, emits, and atomically publishes all
// requested apps as one transaction. A failed attempt never returns a
// successful BuildResult, even when a prior output tree was preserved.
func Build(request compilercontract.BuildRequest) compilercontract.BuildResult {
	result := compilercontract.BuildResult{
		Schema:                  compilercontract.BuildResultSchema,
		Apps:                    []compilercontract.AppIR{},
		Outputs:                 []compilercontract.OutputFile{},
		Diagnostics:             []compilercontract.Diagnostic{},
		PreservedPreviousOutput: false,
	}
	if err := ValidateRequest(request); err != nil {
		result.Diagnostics = append(result.Diagnostics, buildDiagnostic("build.request", err.Error()))
		return result
	}
	absoluteRoot, err := filepath.Abs(request.SourceRoot)
	if err != nil {
		result.Diagnostics = append(result.Diagnostics, buildDiagnostic("build.source-root", err.Error()))
		return result
	}
	request.SourceRoot = absoluteRoot

	var builtApps []compilercontract.AppIR
	var builtOutputs []compilercontract.OutputFile
	preserved, err := Publish(request.OutputDir, func(stage string) error {
		apps, outputs, diagnostics, stageErr := produce(request, stage)
		builtApps = apps
		builtOutputs = outputs
		if stageErr != nil {
			return &stageFailure{diagnostics: diagnostics, err: stageErr}
		}
		return nil
	})
	result.PreservedPreviousOutput = preserved
	if err != nil {
		var failure *stageFailure
		if errors.As(err, &failure) {
			result.Diagnostics = stageFailureDiagnostics(result.Diagnostics, failure)
		} else {
			result.Diagnostics = append(result.Diagnostics, buildDiagnostic("build.publish", err.Error()))
		}
		return result
	}
	result.OK = true
	result.Apps = builtApps
	result.Outputs = builtOutputs
	return result
}

func stageFailureDiagnostics(existing []compilercontract.Diagnostic, failure *stageFailure) []compilercontract.Diagnostic {
	result := append(existing, failure.diagnostics...)
	if len(failure.diagnostics) == 0 {
		result = append(result, buildDiagnostic("build.stage", failure.err.Error()))
	}
	return result
}

func produce(request compilercontract.BuildRequest, stage string) ([]compilercontract.AppIR, []compilercontract.OutputFile, []compilercontract.Diagnostic, error) {
	program, diagnostics := analyze.LoadSources(request.SourceRoot, request.EntryPackages)
	if hasErrors(diagnostics) {
		return []compilercontract.AppIR{}, []compilercontract.OutputFile{}, diagnostics, errors.New("source loading failed")
	}
	analysis := analyze.Analyze(program, compilercontract.AnalyzeOptions{EntryPackages: append([]string{}, request.EntryPackages...)})
	diagnostics = append(diagnostics, analysis.Diagnostics...)
	if hasErrors(diagnostics) {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, errors.New("semantic analysis failed")
	}
	if len(analysis.Apps) != len(request.EntryPackages) {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("analysis produced %d apps for %d entry packages", len(analysis.Apps), len(request.EntryPackages))
	}
	for i, app := range analysis.Apps {
		if app.PackagePath != request.EntryPackages[i] {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("analysis app %d package %q does not match requested entry %q", i, app.PackagePath, request.EntryPackages[i])
		}
		if app.Schema != compilercontract.AppIRSchema {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("analysis app %q has unsupported schema %q", app.PackagePath, app.Schema)
		}
		if appDiagnostics := compilercontract.ValidateAppIR(app); len(appDiagnostics) != 0 {
			diagnostics = append(diagnostics, appDiagnostics...)
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("AppIR validation failed for %q", app.PackagePath)
		}
		if len(app.Components) != 1 {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("entry package %q must produce exactly one component, got %d", app.PackagePath, len(app.Components))
		}
	}
	forwarderRoot, forwarders, err := createForwarderWorkspace(request.SourceRoot, analysis.Apps)
	if err != nil {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("generate Go forwarding facade: %w", err)
	}
	defer os.RemoveAll(forwarderRoot)
	forwarderPackages := make([]string, 0, len(forwarders))
	for _, forwarder := range forwarders {
		forwarderPackages = append(forwarderPackages, forwarder.PackagePath)
	}

	goscriptRoot, err := os.MkdirTemp("", "gobi-goscript-")
	if err != nil {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("create temporary GoScript output: %w", err)
	}
	defer os.RemoveAll(goscriptRoot)
	comp, err := compiler.NewCompiler(&compiler.Config{Dir: forwarderRoot, OutputPath: goscriptRoot}, nil, nil)
	if err != nil {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("initialize pinned GoScript compiler: %w", err)
	}
	compiled, compileErr := comp.CompilePackages(context.Background(), forwarderPackages...)
	if compiled != nil {
		diagnostics = append(diagnostics, compilerDiagnostics(compiled.Diagnostics, request.SourceRoot)...)
	}
	if compileErr != nil {
		if compiled == nil || !hasErrors(diagnostics) {
			diagnostics = append(diagnostics, buildDiagnostic("goscript.compile", compileErr.Error()))
		}
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("GoScript compilation failed: %w", compileErr)
	}
	if compiled == nil {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, errors.New("GoScript compiler returned no compilation result")
	}
	if hasErrors(diagnostics) {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, errors.New("GoScript reported compiler errors")
	}
	compiledEntries := append(append([]string{}, forwarderPackages...), request.EntryPackages...)
	if err := verifyCompiledEntries(compiled.CompiledPackages, compiledEntries); err != nil {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, err
	}
	forwarderSources, err := publishForwarderSources(forwarderRoot, stage)
	if err != nil {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, err
	}
	emittedTypeScript, err := publishEmittedTypeScript(goscriptRoot, stage)
	if err != nil {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, err
	}
	backend, err := emit.NewBackendFor(request.Backend)
	if err != nil {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("select %q AppIR emitter: %w", request.Backend, err)
	}

	manifest := buildManifest{
		Schema:            "gobi.build-manifest/v1",
		ForwarderModule:   forwarderModulePath,
		ForwarderGoMod:    "forwarders/go.mod",
		ForwarderSources:  forwarderSources,
		EmittedTypeScript: emittedTypeScript,
		Apps:              make([]manifestApp, 0, len(analysis.Apps)),
	}
	var sharedNodeMap []byte
	for appIndex, app := range analysis.Apps {
		forwarder := forwarders[appIndex]
		component := app.Components[0]
		appDirName := appDirectoryName(app.PackagePath)
		appDir := filepath.Join(stage, "apps", appDirName)
		if err := os.MkdirAll(appDir, 0o755); err != nil {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("create app output %q: %w", app.PackagePath, err)
		}
		files, err := backend.Emit(app)
		if err != nil {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("emit app %q: %w", app.PackagePath, err)
		}
		for _, file := range files {
			if file.Path == emit.ReactMapFile {
				if sharedNodeMap == nil {
					sharedNodeMap = append([]byte{}, file.Bytes...)
				} else if string(sharedNodeMap) != string(file.Bytes) {
					return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, errors.New("Gobi node mapping changed between app emissions")
				}
				continue
			}
			if err := writeOutputFile(appDir, file.Path, file.Bytes); err != nil {
				return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, err
			}
		}
		if err := writeOutputFile(appDir, "app-ir.json", mustMarshal(app)); err != nil {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, err
		}
		encoder, err := compilercontract.GenerateGoScriptValueEncoder(app.Types)
		if err != nil {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("generate state encoder for %q: %w", app.PackagePath, err)
		}
		if err := writeOutputFile(appDir, "encoder.mjs", []byte(encoder)); err != nil {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, err
		}
		goscriptEntry := filepath.Join(goscriptRoot, "@goscript", filepath.FromSlash(forwarder.PackagePath), "index.ts")
		if _, err := os.Stat(goscriptEntry); err != nil {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("GoScript forwarding output for %q is missing %s: %w", app.PackagePath, goscriptEntry, err)
		}
		entrySource, err := compiledModuleSource(app)
		if err != nil {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, err
		}
		entryPath := filepath.Join(appDir, ".gobi-compiled.entry.mjs")
		if err := os.WriteFile(entryPath, entrySource, 0o644); err != nil {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("write compiled module entry for %q: %w", app.PackagePath, err)
		}
		bundlePath := filepath.Join(appDir, "gobi-compiled.mjs")
		node := nodeExecutable()
		command := exec.Command(node, filepath.Join("build", "bundle.mjs"), entryPath, bundlePath, goscriptRoot, request.SourceRoot)
		command.Dir = moduleDir()
		command.Stdout = nil
		var stderr strings.Builder
		command.Stderr = &stderr
		if err := command.Run(); err != nil {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("bundle compiled app %q: %s", app.PackagePath, compilerProcessMessage(stderr.String(), err))
		}
		if err := os.Remove(entryPath); err != nil {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("remove temporary entry for %q: %w", app.PackagePath, err)
		}
		appIRPath := filepath.ToSlash(filepath.Join("apps", appDirName, "app-ir.json"))
		modulePath := filepath.ToSlash(filepath.Join("apps", appDirName, "gobi-compiled.mjs"))
		encoderPath := filepath.ToSlash(filepath.Join("apps", appDirName, "encoder.mjs"))
		componentsPath := filepath.ToSlash(filepath.Join("apps", appDirName, emit.ComponentsFile))
		moduleABIPath := ""
		_, hasModuleBridges, err := moduleBridgeSymbols(app)
		if err != nil {
			return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, err
		}
		if hasModuleBridges {
			artifactPaths := []string{appIRPath, modulePath, encoderPath, componentsPath}
			artifactFiles := make(map[string][]byte, len(artifactPaths))
			for _, artifactPath := range artifactPaths {
				contents, err := os.ReadFile(filepath.Join(stage, filepath.FromSlash(artifactPath)))
				if err != nil {
					return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("read module ABI artifact %q: %w", artifactPath, err)
				}
				artifactFiles[artifactPath] = contents
			}
			descriptor, err := moduleabi.Describe(app, artifactFiles)
			if err != nil {
				return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("describe module ABI for %q: %w", app.PackagePath, err)
			}
			descriptorBytes, err := json.MarshalIndent(descriptor, "", "  ")
			if err != nil {
				return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("encode module ABI for %q: %w", app.PackagePath, err)
			}
			descriptorBytes = append(descriptorBytes, '\n')
			moduleABIPath = filepath.ToSlash(filepath.Join("apps", appDirName, "module-abi.json"))
			if err := writeOutputFile(stage, moduleABIPath, descriptorBytes); err != nil {
				return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, err
			}
		}
		manifest.Apps = append(manifest.Apps, manifestApp{
			Backend:          backend.Name(),
			ComponentID:      component.ID,
			PackagePath:      app.PackagePath,
			AppIR:            appIRPath,
			Module:           modulePath,
			Encoder:          encoderPath,
			Components:       componentsPath,
			ModuleABI:        moduleABIPath,
			ForwarderPackage: forwarder.PackagePath,
			RoleBindings: []manifestRoleBinding{
				{Role: "init", AppIRSymbol: string(component.Init), ForwarderExport: "GobiCompiledInit"},
				{Role: "update", AppIRSymbol: string(component.Update), ForwarderExport: "GobiCompiledUpdate"},
				{Role: "view", AppIRSymbol: string(component.View), ForwarderExport: "GobiCompiledView"},
			},
		})
	}
	if len(sharedNodeMap) == 0 {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("%s emitter returned no shared node mapping file", backend.Name())
	}
	if err := writeOutputFile(stage, emit.ReactMapFile, sharedNodeMap); err != nil {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, err
	}
	manifestBytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, fmt.Errorf("encode build manifest: %w", err)
	}
	manifestBytes = append(manifestBytes, '\n')
	if err := writeOutputFile(stage, "buildmanifest.json", manifestBytes); err != nil {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, err
	}
	outputs, err := collectOutputs(stage)
	if err != nil {
		return analysis.Apps, []compilercontract.OutputFile{}, diagnostics, err
	}
	return analysis.Apps, outputs, diagnostics, nil
}

func compiledModuleSource(app compilercontract.AppIR) ([]byte, error) {
	if len(app.Components) != 1 {
		return nil, fmt.Errorf("app %q has %d components; compiled facade requires one", app.PackagePath, len(app.Components))
	}
	component := app.Components[0]
	var initName, updateName, viewName string
	for _, symbol := range app.Symbols {
		switch symbol.ID {
		case component.Init:
			initName = symbol.Name
		case component.Update:
			updateName = symbol.Name
		case component.View:
			viewName = symbol.Name
		}
	}
	if initName != "Init" || updateName != "Update" || viewName != "View" {
		return nil, fmt.Errorf("app %q role symbols do not resolve to emitted Init/Update/View exports", app.PackagePath)
	}
	bridgeRoles, hasModuleBridges, err := moduleBridgeSymbols(app)
	if err != nil {
		return nil, err
	}
	packageImport := "@goscript/" + forwarderPackagePath(app) + "/index.js"
	quotedImport, _ := json.Marshal(packageImport)
	quotedSchema, _ := json.Marshal(compilercontract.CompiledModuleSchema)
	quotedInitID, _ := json.Marshal(string(component.Init))
	quotedUpdateID, _ := json.Marshal(string(component.Update))
	quotedViewID, _ := json.Marshal(string(component.View))
	source := fmt.Sprintf(`// Generated from validated AppIR. Do not edit.
import * as emitted from %s;
import { appIR } from "./components.gen.mjs";
%s

const component = appIR.components[0];
if (!component || component.packagePath !== %q || component.init !== %s || component.update !== %s || component.view !== %s) {
  throw new Error("generated compiled role metadata does not match the requested package");
}
const symbols = Object.create(null);
Object.defineProperty(symbols, %s, { value: emitted.GobiCompiledInit, enumerable: true });
Object.defineProperty(symbols, %s, { value: (state, message) => emitted.GobiCompiledUpdate(state, __gobiEncodeGoMessage(message)), enumerable: true });
Object.defineProperty(symbols, %s, { value: (state) => __gobiDecodeGoView(emitted.GobiCompiledView(state)), enumerable: true });
export const gobiCompiled = Object.freeze({ schema: %s, appIR, symbols: Object.freeze(symbols) });
	`, string(quotedImport), goScriptStringBoundarySource, app.PackagePath, string(quotedInitID), string(quotedUpdateID), string(quotedViewID), string(quotedInitID), string(quotedUpdateID), string(quotedViewID), string(quotedSchema))
	if hasModuleBridges {
		var bridgeSource strings.Builder
		bridgeSource.WriteString("\nexport const gobiModuleBridges = Object.freeze({\n")
		if bridgeRoles["Input"].ID != "" {
			bridgeSource.WriteString("  input: (state, input) => emitted.GobiModuleInput(state, input.Step, input.Locked, input.Revision),\n")
			bridgeSource.WriteString("  publication: (state) => { const value = emitted.GobiModulePublication(state); return Object.freeze({ Count: value.Count, Revision: value.Revision }); },\n")
		}
		if bridgeRoles["Output"].ID != "" {
			bridgeSource.WriteString("  output: (state) => { const value = emitted.GobiModuleOutput(state); return Object.freeze({ Step: value.Step, Locked: value.Locked, Revision: value.Revision }); },\n")
			bridgeSource.WriteString("  receive: (state, publication) => emitted.GobiModuleReceive(state, publication.Count, publication.Revision),\n")
		}
		bridgeSource.WriteString("});\n")
		source += bridgeSource.String()
	}
	return []byte(source), nil
}

func createForwarderWorkspace(sourceRoot string, apps []compilercontract.AppIR) (string, []forwarderPackage, error) {
	root, err := os.MkdirTemp("", "gobi-forwarders-")
	if err != nil {
		return "", nil, fmt.Errorf("create temporary Go forwarding module: %w", err)
	}
	cleanup := func(err error) (string, []forwarderPackage, error) {
		_ = os.RemoveAll(root)
		return "", nil, err
	}
	goMod := fmt.Sprintf("module %s\n\ngo 1.27.0\n\nrequire github.com/samuelpmahan/gondola v0.0.0\n\nreplace github.com/samuelpmahan/gondola => %s\n", forwarderModulePath, strconv.Quote(sourceRoot))
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte(goMod), 0o644); err != nil {
		return cleanup(fmt.Errorf("write forwarding module go.mod: %w", err))
	}
	forwarders := make([]forwarderPackage, 0, len(apps))
	for _, app := range apps {
		packagePath := forwarderPackagePath(app)
		directory := filepath.Join(root, "facades", appDirectoryName(app.PackagePath))
		if err := os.MkdirAll(directory, 0o755); err != nil {
			return cleanup(fmt.Errorf("create forwarding package for %q: %w", app.PackagePath, err))
		}
		source, err := forwarderSource(app)
		if err != nil {
			return cleanup(fmt.Errorf("generate forwarding package for %q: %w", app.PackagePath, err))
		}
		if err := os.WriteFile(filepath.Join(directory, "forwarder.go"), source, 0o644); err != nil {
			return cleanup(fmt.Errorf("write forwarding package for %q: %w", app.PackagePath, err))
		}
		forwarders = append(forwarders, forwarderPackage{PackagePath: packagePath})
	}
	return root, forwarders, nil
}

func forwarderPackagePath(app compilercontract.AppIR) string {
	return forwarderModulePath + "/facades/" + appDirectoryName(app.PackagePath)
}

func forwarderSource(app compilercontract.AppIR) ([]byte, error) {
	if len(app.Components) != 1 {
		return nil, fmt.Errorf("app %q must have exactly one component", app.PackagePath)
	}
	component := app.Components[0]
	symbols := make(map[compilercontract.SymbolID]compilercontract.Symbol, len(app.Symbols))
	for _, symbol := range app.Symbols {
		symbols[symbol.ID] = symbol
	}
	initSymbol, ok := symbols[component.Init]
	if !ok || initSymbol.Name != "Init" {
		return nil, fmt.Errorf("Init role %q does not resolve to an Init symbol", component.Init)
	}
	updateSymbol, ok := symbols[component.Update]
	if !ok || updateSymbol.Name != "Update" {
		return nil, fmt.Errorf("Update role %q does not resolve to an Update symbol", component.Update)
	}
	viewSymbol, ok := symbols[component.View]
	if !ok || viewSymbol.Name != "View" {
		return nil, fmt.Errorf("View role %q does not resolve to a View symbol", component.View)
	}
	if len(initSymbol.Signature.Params) != 0 || len(initSymbol.Signature.Results) != 1 ||
		len(updateSymbol.Signature.Params) != 2 || len(updateSymbol.Signature.Results) != 2 ||
		len(viewSymbol.Signature.Params) != 1 || len(viewSymbol.Signature.Results) != 1 {
		return nil, fmt.Errorf("app %q role signatures do not match the compiled frontend profile", app.PackagePath)
	}

	packageSet := map[string]bool{app.PackagePath: true}
	for _, typeID := range append(append(append([]compilercontract.TypeID{}, initSymbol.Signature.Results...), updateSymbol.Signature.Params...), updateSymbol.Signature.Results...) {
		if err := collectGoTypePackages(typeID, packageSet); err != nil {
			return nil, err
		}
	}
	for _, typeID := range append([]compilercontract.TypeID{}, viewSymbol.Signature.Params...) {
		if err := collectGoTypePackages(typeID, packageSet); err != nil {
			return nil, err
		}
	}
	for _, typeID := range viewSymbol.Signature.Results {
		if err := collectGoTypePackages(typeID, packageSet); err != nil {
			return nil, err
		}
	}
	bridgeRoles, hasModuleBridges, err := moduleBridgeSymbols(app)
	if err != nil {
		return nil, err
	}
	if hasModuleBridges {
		for _, name := range []string{"Input", "Publication", "Output", "Receive"} {
			if symbol := bridgeRoles[name]; symbol.ID != "" {
				for _, typeID := range append(append([]compilercontract.TypeID{}, symbol.Signature.Params...), symbol.Signature.Results...) {
					if err := collectGoTypePackages(typeID, packageSet); err != nil {
						return nil, err
					}
				}
			}
		}
	}
	packagePaths := make([]string, 0, len(packageSet))
	for packagePath := range packageSet {
		packagePaths = append(packagePaths, packagePath)
	}
	sort.Strings(packagePaths)
	aliases := make(map[string]string, len(packagePaths))
	typeAliasIndex := 0
	for _, packagePath := range packagePaths {
		if packagePath == app.PackagePath {
			aliases[packagePath] = "gobiApp"
			continue
		}
		aliases[packagePath] = fmt.Sprintf("gobiType%d", typeAliasIndex)
		typeAliasIndex++
	}

	var source strings.Builder
	source.WriteString("package facade\n\nimport (\n")
	for _, packagePath := range packagePaths {
		fmt.Fprintf(&source, "\t%s %s\n", aliases[packagePath], strconv.Quote(packagePath))
	}
	source.WriteString(")\n\n")
	initResult, err := goTypeExpression(initSymbol.Signature.Results[0], aliases)
	if err != nil {
		return nil, err
	}
	updateParams := make([]string, len(updateSymbol.Signature.Params))
	for index, typeID := range updateSymbol.Signature.Params {
		typeExpr, err := goTypeExpression(typeID, aliases)
		if err != nil {
			return nil, err
		}
		paramName := "state"
		if index == 1 {
			paramName = "message"
		}
		updateParams[index] = paramName + " " + typeExpr
	}
	updateResults := make([]string, len(updateSymbol.Signature.Results))
	for index, typeID := range updateSymbol.Signature.Results {
		typeExpr, err := goTypeExpression(typeID, aliases)
		if err != nil {
			return nil, err
		}
		updateResults[index] = typeExpr
	}
	viewParam, err := goTypeExpression(viewSymbol.Signature.Params[0], aliases)
	if err != nil {
		return nil, err
	}
	viewResult, err := goTypeExpression(viewSymbol.Signature.Results[0], aliases)
	if err != nil {
		return nil, err
	}
	fmt.Fprintf(&source, "func GobiCompiledInit() %s {\n\treturn gobiApp.Init()\n}\n\n", initResult)
	fmt.Fprintf(&source, "func GobiCompiledUpdate(%s) (%s, %s) {\n\treturn gobiApp.Update(state, message)\n}\n\n", strings.Join(updateParams, ", "), updateResults[0], updateResults[1])
	fmt.Fprintf(&source, "func GobiCompiledView(state %s) %s {\n\treturn gobiApp.View(state)\n}\n", viewParam, viewResult)
	if hasModuleBridges {
		if symbol := bridgeRoles["Input"]; symbol.ID != "" {
			stateType, err := goTypeExpression(symbol.Signature.Params[0], aliases)
			if err != nil {
				return nil, err
			}
			inputType, err := goTypeExpression(symbol.Signature.Params[1], aliases)
			if err != nil {
				return nil, err
			}
			stateResult, err := goTypeExpression(symbol.Signature.Results[0], aliases)
			if err != nil {
				return nil, err
			}
			fmt.Fprintf(&source, "\nfunc GobiModuleInput(state %s, step int, locked bool, revision int) %s {\n\treturn gobiApp.Input(state, %s{Step: step, Locked: locked, Revision: revision})\n}\n", stateType, stateResult, inputType)
		}
		if symbol := bridgeRoles["Publication"]; symbol.ID != "" {
			stateType, err := goTypeExpression(symbol.Signature.Params[0], aliases)
			if err != nil {
				return nil, err
			}
			publicationType, err := goTypeExpression(symbol.Signature.Results[0], aliases)
			if err != nil {
				return nil, err
			}
			fmt.Fprintf(&source, "\nfunc GobiModulePublication(state %s) %s {\n\treturn gobiApp.Publication(state)\n}\n", stateType, publicationType)
		}
		if symbol := bridgeRoles["Output"]; symbol.ID != "" {
			stateType, err := goTypeExpression(symbol.Signature.Params[0], aliases)
			if err != nil {
				return nil, err
			}
			inputType, err := goTypeExpression(symbol.Signature.Results[0], aliases)
			if err != nil {
				return nil, err
			}
			fmt.Fprintf(&source, "\nfunc GobiModuleOutput(state %s) %s {\n\treturn gobiApp.Output(state)\n}\n", stateType, inputType)
		}
		if symbol := bridgeRoles["Receive"]; symbol.ID != "" {
			stateType, err := goTypeExpression(symbol.Signature.Params[0], aliases)
			if err != nil {
				return nil, err
			}
			publicationType, err := goTypeExpression(symbol.Signature.Params[1], aliases)
			if err != nil {
				return nil, err
			}
			stateResult, err := goTypeExpression(symbol.Signature.Results[0], aliases)
			if err != nil {
				return nil, err
			}
			fmt.Fprintf(&source, "\nfunc GobiModuleReceive(state %s, count float64, revision int) %s {\n\treturn gobiApp.Receive(state, %s{Count: count, Revision: revision})\n}\n", stateType, stateResult, publicationType)
		}
	}
	return []byte(source.String()), nil
}

func moduleBridgeSymbols(app compilercontract.AppIR) (map[string]compilercontract.Symbol, bool, error) {
	roles := make(map[string]compilercontract.Symbol, 4)
	for _, symbol := range app.Symbols {
		if symbol.PackagePath != app.PackagePath {
			continue
		}
		switch symbol.Name {
		case "Input", "Publication", "Output", "Receive":
			if _, exists := roles[symbol.Name]; exists {
				return nil, false, fmt.Errorf("app %q has duplicate module bridge role %q", app.PackagePath, symbol.Name)
			}
			if symbol.ID != compilercontract.SymbolID(app.PackagePath+"."+symbol.Name) {
				return nil, false, fmt.Errorf("app %q module bridge role %q has non-canonical symbol ID %q", app.PackagePath, symbol.Name, symbol.ID)
			}
			roles[symbol.Name] = symbol
		}
	}
	if len(roles) == 0 {
		return roles, false, nil
	}
	parent := roles["Output"].ID != "" && roles["Receive"].ID != ""
	child := roles["Input"].ID != "" && roles["Publication"].ID != ""
	if parent == child || (parent && (roles["Input"].ID != "" || roles["Publication"].ID != "")) || (child && (roles["Output"].ID != "" || roles["Receive"].ID != "")) {
		return nil, false, fmt.Errorf("app %q must declare exactly the parent Output/Receive or child Input/Publication bridge pair", app.PackagePath)
	}
	if len(app.Components) != 1 {
		return nil, false, fmt.Errorf("app %q must have exactly one component for module bridges", app.PackagePath)
	}
	stateType := app.Components[0].StateType
	if parent {
		if !signatureMatches(roles["Output"].Signature, []compilercontract.TypeID{stateType}, []compilercontract.TypeID{moduleabi.InputTypeID}) ||
			!signatureMatches(roles["Receive"].Signature, []compilercontract.TypeID{stateType, moduleabi.PublicationID}, []compilercontract.TypeID{stateType}) {
			return nil, false, fmt.Errorf("app %q parent module bridge signatures are invalid", app.PackagePath)
		}
	} else if !signatureMatches(roles["Input"].Signature, []compilercontract.TypeID{stateType, moduleabi.InputTypeID}, []compilercontract.TypeID{stateType}) ||
		!signatureMatches(roles["Publication"].Signature, []compilercontract.TypeID{stateType}, []compilercontract.TypeID{moduleabi.PublicationID}) {
		return nil, false, fmt.Errorf("app %q child module bridge signatures are invalid", app.PackagePath)
	}
	typeIndex := make(map[compilercontract.TypeID]compilercontract.TypeInfo, len(app.Types))
	for _, info := range app.Types {
		typeIndex[info.ID] = info
	}
	if !matchesBridgeWireType(typeIndex[moduleabi.InputTypeID], "Input", []compilercontract.TypeField{{Name: "Step", Type: "int"}, {Name: "Locked", Type: "bool"}, {Name: "Revision", Type: "int"}}) ||
		!matchesBridgeWireType(typeIndex[moduleabi.PublicationID], "Publication", []compilercontract.TypeField{{Name: "Count", Type: "float64"}, {Name: "Revision", Type: "int"}}) {
		return nil, false, fmt.Errorf("app %q module wire types do not match the fixed Input/Publication ABI", app.PackagePath)
	}
	return roles, true, nil
}

func signatureMatches(signature compilercontract.Signature, params, results []compilercontract.TypeID) bool {
	if len(signature.Params) != len(params) || len(signature.Results) != len(results) {
		return false
	}
	for index := range params {
		if signature.Params[index] != params[index] {
			return false
		}
	}
	for index := range results {
		if signature.Results[index] != results[index] {
			return false
		}
	}
	return true
}

func matchesBridgeWireType(info compilercontract.TypeInfo, name string, fields []compilercontract.TypeField) bool {
	if info.ID != compilercontract.TypeID(moduleabi.WirePackage+"."+name) || info.Kind != compilercontract.KindStruct ||
		info.JSRepresentation != compilercontract.JSClass || len(info.Fields) != len(fields) {
		return false
	}
	for index := range fields {
		if info.Fields[index] != fields[index] {
			return false
		}
	}
	return true
}

func collectGoTypePackages(typeID compilercontract.TypeID, packages map[string]bool) error {
	value := string(typeID)
	if isGoBuiltinType(value) {
		return nil
	}
	if strings.HasPrefix(value, "[]") {
		return collectGoTypePackages(compilercontract.TypeID(strings.TrimPrefix(value, "[]")), packages)
	}
	if strings.HasPrefix(value, "[") {
		closing := strings.IndexByte(value, ']')
		if closing < 2 {
			return fmt.Errorf("unsupported Go array type ID %q", value)
		}
		if _, err := strconv.Atoi(value[1:closing]); err != nil {
			return fmt.Errorf("unsupported Go array length in type ID %q", value)
		}
		return collectGoTypePackages(compilercontract.TypeID(value[closing+1:]), packages)
	}
	dot := strings.LastIndexByte(value, '.')
	if dot <= 0 || dot == len(value)-1 || !token.IsIdentifier(value[dot+1:]) {
		return fmt.Errorf("unsupported Go forwarding type ID %q", value)
	}
	packages[value[:dot]] = true
	return nil
}

func goTypeExpression(typeID compilercontract.TypeID, aliases map[string]string) (string, error) {
	value := string(typeID)
	if isGoBuiltinType(value) {
		return value, nil
	}
	if strings.HasPrefix(value, "[]") {
		element, err := goTypeExpression(compilercontract.TypeID(strings.TrimPrefix(value, "[]")), aliases)
		if err != nil {
			return "", err
		}
		return "[]" + element, nil
	}
	if strings.HasPrefix(value, "[") {
		closing := strings.IndexByte(value, ']')
		if closing < 2 {
			return "", fmt.Errorf("unsupported Go array type ID %q", value)
		}
		if _, err := strconv.Atoi(value[1:closing]); err != nil {
			return "", fmt.Errorf("unsupported Go array length in type ID %q", value)
		}
		element, err := goTypeExpression(compilercontract.TypeID(value[closing+1:]), aliases)
		if err != nil {
			return "", err
		}
		return value[:closing+1] + element, nil
	}
	dot := strings.LastIndexByte(value, '.')
	if dot <= 0 || dot == len(value)-1 || !token.IsIdentifier(value[dot+1:]) {
		return "", fmt.Errorf("unsupported Go forwarding type ID %q", value)
	}
	alias := aliases[value[:dot]]
	if alias == "" {
		return "", fmt.Errorf("forwarding type %q has no import alias", value)
	}
	return alias + "." + value[dot+1:], nil
}

func isGoBuiltinType(value string) bool {
	switch value {
	case "bool", "string", "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr", "byte", "rune", "float32", "float64":
		return true
	default:
		return false
	}
}

func publishForwarderSources(sourceRoot, stage string) ([]string, error) {
	paths := make([]string, 0)
	foundGoMod := false
	err := filepath.WalkDir(sourceRoot, func(sourcePath string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(sourceRoot, sourcePath)
		if err != nil {
			return err
		}
		if relative != "go.mod" && relative != "go.sum" && filepath.Ext(relative) != ".go" {
			return nil
		}
		if relative == "go.mod" {
			foundGoMod = true
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("forwarding module contains non-regular source file %q", relative)
		}
		content, err := os.ReadFile(sourcePath)
		if err != nil {
			return err
		}
		outputPath := filepath.ToSlash(filepath.Join("forwarders", relative))
		if err := writeOutputFile(stage, outputPath, content); err != nil {
			return err
		}
		paths = append(paths, outputPath)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("publish generated Go forwarding source: %w", err)
	}
	sort.Strings(paths)
	if !foundGoMod || len(paths) < 2 {
		return nil, errors.New("generated Go forwarding module source is incomplete")
	}
	return paths, nil
}

func publishEmittedTypeScript(goscriptRoot, stage string) ([]string, error) {
	root := filepath.Join(goscriptRoot, "@goscript")
	paths := make([]string, 0)
	err := filepath.WalkDir(root, func(sourcePath string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("GoScript output contains symlink %q", sourcePath)
		}
		if entry.IsDir() || filepath.Ext(sourcePath) != ".ts" {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("GoScript output contains non-regular TypeScript file %q", sourcePath)
		}
		relative, err := filepath.Rel(goscriptRoot, sourcePath)
		if err != nil {
			return err
		}
		content, err := os.ReadFile(sourcePath)
		if err != nil {
			return err
		}
		outputPath := filepath.ToSlash(filepath.Join("emitted-ts", relative))
		if err := writeOutputFile(stage, outputPath, content); err != nil {
			return err
		}
		paths = append(paths, outputPath)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("publish GoScript TypeScript: %w", err)
	}
	sort.Strings(paths)
	if len(paths) == 0 {
		return nil, errors.New("GoScript emitted no TypeScript source files")
	}
	return paths, nil
}

func verifyCompiledEntries(compiled []string, requested []string) error {
	set := make(map[string]bool, len(compiled))
	for _, item := range compiled {
		set[item] = true
	}
	for _, entry := range requested {
		if !set[entry] {
			return fmt.Errorf("GoScript compiler did not compile requested package %q", entry)
		}
	}
	return nil
}

func compilerDiagnostics(diagnostics []compiler.Diagnostic, sourceRoot string) []compilercontract.Diagnostic {
	result := make([]compilercontract.Diagnostic, 0, len(diagnostics))
	for _, item := range diagnostics {
		span := compilercontract.Span{}
		if position := item.Position; position != nil {
			file := position.DisplayFile
			if file == "" {
				file = position.File
			}
			file = filepath.ToSlash(file)
			if filepath.IsAbs(file) {
				if relative, err := filepath.Rel(sourceRoot, file); err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
					file = filepath.ToSlash(relative)
				}
			}
			start, end := lineColumnByteSpan(filepath.Join(sourceRoot, filepath.FromSlash(file)), position.Line, position.Column)
			span = compilercontract.Span{File: file, StartByte: start, EndByte: end}
		}
		message := item.Message
		if item.Detail != "" {
			message += " (" + item.Detail + ")"
		}
		severity := string(item.Severity)
		if severity == "" {
			severity = "error"
		}
		code := item.Code
		if code == "" {
			code = "goscript.compile"
		}
		result = append(result, compilercontract.Diagnostic{Code: code, Severity: severity, Message: message, Span: span, Related: []compilercontract.Span{}})
	}
	return result
}

func lineColumnByteSpan(path string, line, column int) (int, int) {
	data, err := os.ReadFile(path)
	if err != nil || line < 1 || column < 1 {
		return 0, 0
	}
	lineStart := 0
	for current := 1; current < line; current++ {
		next := strings.IndexByte(string(data[lineStart:]), '\n')
		if next < 0 {
			return len(data), len(data)
		}
		lineStart += next + 1
	}
	start := lineStart + column - 1
	if start > len(data) {
		start = len(data)
	}
	end := start
	if end < len(data) && data[end] != '\n' {
		end++
	}
	return start, end
}

func buildDiagnostic(code, message string) compilercontract.Diagnostic {
	return compilercontract.Diagnostic{Code: code, Severity: "error", Message: message, Span: compilercontract.Span{}, Related: []compilercontract.Span{}}
}

func hasErrors(diagnostics []compilercontract.Diagnostic) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Severity == "error" {
			return true
		}
	}
	return false
}

func writeOutputFile(root, relative string, content []byte) error {
	clean := filepath.Clean(filepath.FromSlash(relative))
	if clean == "." || filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return fmt.Errorf("refusing output path outside staging tree: %q", relative)
	}
	path := filepath.Join(root, clean)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create output parent for %q: %w", relative, err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		return fmt.Errorf("write output %q: %w", relative, err)
	}
	return nil
}

func mustMarshal(value any) []byte {
	content, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return content
}

func appDirectoryName(packagePath string) string {
	last := path.Base(packagePath)
	digest := sha256.Sum256([]byte(packagePath))
	return last + "-" + hex.EncodeToString(digest[:])[:12]
}

func collectOutputs(root string) ([]compilercontract.OutputFile, error) {
	outputs := make([]compilercontract.OutputFile, 0)
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		digest := sha256.Sum256(data)
		outputs = append(outputs, compilercontract.OutputFile{Path: filepath.ToSlash(relative), SHA256: hex.EncodeToString(digest[:]), Bytes: int64(len(data))})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("inventory build outputs: %w", err)
	}
	sort.Slice(outputs, func(i, j int) bool { return outputs[i].Path < outputs[j].Path })
	return outputs, nil
}

func compilerProcessMessage(stderr string, err error) string {
	message := strings.TrimSpace(stderr)
	if message == "" {
		return err.Error()
	}
	return message
}

func moduleDir() string {
	_, file, _, ok := runtimeCaller(0)
	if !ok {
		return "."
	}
	return filepath.Dir(filepath.Dir(file))
}

func nodeExecutable() string {
	if configured := strings.TrimSpace(os.Getenv("GOBI_NODE")); configured != "" {
		return configured
	}
	if configured := strings.TrimSpace(os.Getenv("NODE")); configured != "" {
		return configured
	}
	return "node"
}
