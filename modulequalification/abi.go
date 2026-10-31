// Package modulequalification composes the finite native checks for captured
// independently compiled module runs.
package modulequalification

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"sort"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/moduleabi"
)

const (
	abiBuildManifestSchema = "gobi.build-manifest/v1"
	abiMaxMetadataBytes    = 16 << 20
	abiMaxArtifactBytes    = 64 << 20
)

const (
	abiModuleParentPackage = "github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent"
	abiModuleChildPackage  = "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild"
)

type abiBuildProfile struct {
	name        string
	backend     string
	role        string
	packagePath string
}

var abiBuildProfiles = [...]abiBuildProfile{
	{name: "react-parent", backend: "react", role: "parent", packagePath: abiModuleParentPackage},
	{name: "react-child", backend: "react", role: "child", packagePath: abiModuleChildPackage},
	{name: "dom-parent", backend: "dom", role: "parent", packagePath: abiModuleParentPackage},
	{name: "dom-child", backend: "dom", role: "child", packagePath: abiModuleChildPackage},
}

type abiBuildManifest struct {
	Schema            string        `json:"schema"`
	ForwarderModule   string        `json:"forwarderModule"`
	ForwarderGoMod    string        `json:"forwarderGoMod"`
	ForwarderSources  []string      `json:"forwarderSources"`
	EmittedTypeScript []string      `json:"emittedTypeScript"`
	Apps              []abiBuildApp `json:"apps"`
}

type abiBuildApp struct {
	Backend          string                `json:"backend"`
	ComponentID      string                `json:"componentId"`
	PackagePath      string                `json:"packagePath"`
	AppIR            string                `json:"appIR"`
	Module           string                `json:"module"`
	Encoder          string                `json:"encoder"`
	Components       string                `json:"components"`
	ModuleABI        string                `json:"moduleABI"`
	ForwarderPackage string                `json:"forwarderPackage"`
	RoleBindings     []abiBuildRoleBinding `json:"roleBindings"`
}

type abiBuildRoleBinding struct {
	Role            string `json:"role"`
	AppIRSymbol     string `json:"appIRSymbol"`
	ForwarderExport string `json:"forwarderExport"`
}

// CheckABIs verifies the exact four React/DOM module builds in root. It checks
// closed build manifests and AppIR values, derives each descriptor from the
// actual AppIR and four generated artifact byte strings, compares the result
// with the strict sidecar, and finally checks each React and DOM parent/child
// pair against moduleabi's frozen role and nominal wire-type contract.
func CheckABIs(root string) error {
	if strings.TrimSpace(root) == "" {
		return errors.New("module qualification root is required")
	}
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return fmt.Errorf("resolve module qualification root: %w", err)
	}
	rootInfo, err := os.Lstat(absoluteRoot)
	if err != nil {
		return fmt.Errorf("inspect module qualification root %q: %w", absoluteRoot, err)
	}
	if rootInfo.Mode()&os.ModeSymlink != 0 || !rootInfo.IsDir() {
		return fmt.Errorf("module qualification root %q must be a real directory", absoluteRoot)
	}

	descriptors := map[string]map[string]moduleabi.Descriptor{
		"react": {},
		"dom":   {},
	}
	for _, profile := range abiBuildProfiles {
		descriptor, err := checkABIModuleBuild(absoluteRoot, profile)
		if err != nil {
			return fmt.Errorf("%s: %w", profile.name, err)
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

func checkABIModuleBuild(root string, profile abiBuildProfile) (moduleabi.Descriptor, error) {
	manifestRelative := path.Join("builds", profile.name, "output", "buildmanifest.json")
	manifestBytes, err := readABIRegularFileUnder(root, manifestRelative, abiMaxMetadataBytes)
	if err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("read %s: %w", manifestRelative, err)
	}
	var manifest abiBuildManifest
	if err := DecodeStrict(manifestBytes, &manifest); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("decode %s: %w", manifestRelative, err)
	}
	if err := validateABIBuildManifest(manifest, profile); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("validate %s: %w", manifestRelative, err)
	}
	app := manifest.Apps[0]
	outputRelative := path.Join("builds", profile.name, "output")

	appPaths := map[string]string{
		"app-ir.json":        app.AppIR,
		"gobi-compiled.mjs":  app.Module,
		"encoder.mjs":        app.Encoder,
		"components.gen.mjs": app.Components,
	}
	if err := validateABIManifestAppPaths(appPaths, app.ModuleABI, profile); err != nil {
		return moduleabi.Descriptor{}, err
	}

	artifactFiles := make(map[string][]byte, len(appPaths))
	for _, basename := range []string{"app-ir.json", "gobi-compiled.mjs", "encoder.mjs", "components.gen.mjs"} {
		relative := appPaths[basename]
		limit := int64(abiMaxArtifactBytes)
		if basename == "app-ir.json" {
			limit = abiMaxMetadataBytes
		}
		contents, err := readABIRegularFileUnder(root, path.Join(outputRelative, relative), limit)
		if err != nil {
			return moduleabi.Descriptor{}, fmt.Errorf("read artifact %q: %w", relative, err)
		}
		artifactFiles[relative] = contents
	}

	var appIR compilercontract.AppIR
	if err := DecodeStrict(artifactFiles[app.AppIR], &appIR); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("decode AppIR %q: %w", app.AppIR, err)
	}
	if appIR.Schema != compilercontract.AppIRSchema {
		return moduleabi.Descriptor{}, fmt.Errorf("AppIR %q schema is %q, want %q", app.AppIR, appIR.Schema, compilercontract.AppIRSchema)
	}
	if appIR.PackagePath != profile.packagePath {
		return moduleabi.Descriptor{}, fmt.Errorf("AppIR %q packagePath is %q, want %q", app.AppIR, appIR.PackagePath, profile.packagePath)
	}
	if len(appIR.Components) != 1 || appIR.Components[0].ID != app.ComponentID || appIR.Components[0].PackagePath != app.PackagePath {
		return moduleabi.Descriptor{}, fmt.Errorf("AppIR %q component identity does not match build manifest", app.AppIR)
	}

	descriptorRelative := path.Join(outputRelative, app.ModuleABI)
	descriptorBytes, err := readABIRegularFileUnder(root, descriptorRelative, abiMaxMetadataBytes)
	if err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("read module ABI sidecar %q: %w", app.ModuleABI, err)
	}
	var strictSidecar moduleabi.Descriptor
	if err := DecodeStrict(descriptorBytes, &strictSidecar); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("strictly decode module ABI sidecar %q: %w", app.ModuleABI, err)
	}
	descriptor, err := moduleabi.DecodeDescriptorJSON(descriptorBytes)
	if err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("decode module ABI sidecar %q: %w", app.ModuleABI, err)
	}
	if !reflect.DeepEqual(strictSidecar, descriptor) {
		return moduleabi.Descriptor{}, fmt.Errorf("strict and moduleabi decoders disagree for sidecar %q", app.ModuleABI)
	}
	if err := moduleabi.ValidateArtifactBytes(descriptor, artifactFiles); err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("validate sidecar against generated artifact bytes: %w", err)
	}
	derived, err := moduleabi.Describe(appIR, artifactFiles)
	if err != nil {
		return moduleabi.Descriptor{}, fmt.Errorf("derive ABI from AppIR and artifact bytes: %w", err)
	}
	if !reflect.DeepEqual(derived, descriptor) {
		return moduleabi.Descriptor{}, errors.New("strict sidecar does not equal the ABI derived from AppIR and generated artifact bytes")
	}
	if descriptor.ComponentID != app.ComponentID || descriptor.PackagePath != profile.packagePath {
		return moduleabi.Descriptor{}, errors.New("module ABI sidecar identity does not match the build manifest")
	}
	return descriptor, nil
}

func validateABIBuildManifest(manifest abiBuildManifest, profile abiBuildProfile) error {
	if manifest.Schema != abiBuildManifestSchema {
		return fmt.Errorf("schema is %q, want %q", manifest.Schema, abiBuildManifestSchema)
	}
	if manifest.ForwarderModule == "" || manifest.ForwarderGoMod == "" || len(manifest.ForwarderSources) == 0 || len(manifest.EmittedTypeScript) == 0 {
		return errors.New("build manifest is missing required forwarder or emitted-source inventory")
	}
	if manifest.Apps == nil || len(manifest.Apps) != 1 {
		return fmt.Errorf("expected exactly one app record, got %d", len(manifest.Apps))
	}
	app := manifest.Apps[0]
	if app.Backend != profile.backend {
		return fmt.Errorf("app backend is %q, want %q", app.Backend, profile.backend)
	}
	if app.ComponentID != profile.packagePath || app.PackagePath != profile.packagePath {
		return fmt.Errorf("app componentId/packagePath must both be %q", profile.packagePath)
	}
	if app.ForwarderPackage == "" {
		return errors.New("app forwarderPackage is required")
	}
	wantBindings := []abiBuildRoleBinding{
		{Role: "init", AppIRSymbol: profile.packagePath + ".Init", ForwarderExport: "GobiCompiledInit"},
		{Role: "update", AppIRSymbol: profile.packagePath + ".Update", ForwarderExport: "GobiCompiledUpdate"},
		{Role: "view", AppIRSymbol: profile.packagePath + ".View", ForwarderExport: "GobiCompiledView"},
	}
	if !reflect.DeepEqual(app.RoleBindings, wantBindings) {
		return errors.New("app roleBindings do not exactly match conventional Init/Update/View exports")
	}
	return nil
}

func validateABIManifestAppPaths(artifacts map[string]string, moduleABIPath string, profile abiBuildProfile) error {
	if moduleABIPath == "" {
		return errors.New("build manifest has no moduleABI sidecar path")
	}
	var appDirectory string
	basenames := make([]string, 0, len(artifacts))
	for basename := range artifacts {
		basenames = append(basenames, basename)
	}
	sort.Strings(basenames)
	for _, basename := range basenames {
		relative := artifacts[basename]
		if err := validateABIOutputRelativePath(relative); err != nil {
			return fmt.Errorf("manifest artifact path %q: %w", relative, err)
		}
		if path.Base(relative) != basename {
			return fmt.Errorf("manifest artifact %q must use basename %q", relative, basename)
		}
		if !strings.HasPrefix(relative, "apps/") || path.Dir(relative) == "apps" {
			return fmt.Errorf("manifest artifact %q must be under apps/<appDir>", relative)
		}
		directory := path.Dir(relative)
		if appDirectory == "" {
			appDirectory = directory
		} else if directory != appDirectory {
			return errors.New("manifest artifacts do not share one app directory")
		}
	}
	if err := validateABIOutputRelativePath(moduleABIPath); err != nil {
		return fmt.Errorf("manifest moduleABI path %q: %w", moduleABIPath, err)
	}
	if path.Base(moduleABIPath) != "module-abi.json" || path.Dir(moduleABIPath) != appDirectory {
		return errors.New("moduleABI sidecar must be module-abi.json in the artifact app directory")
	}
	expectedPrefix := "moduleparent-"
	if profile.role == "child" {
		expectedPrefix = "modulechild-"
	}
	appDirName := path.Base(appDirectory)
	if !strings.HasPrefix(appDirName, expectedPrefix) || len(appDirName) == len(expectedPrefix) {
		return fmt.Errorf("app output directory %q does not match %s role", appDirName, profile.role)
	}
	return nil
}

func validateABIOutputRelativePath(value string) error {
	if value == "" || strings.Contains(value, "\\") || strings.ContainsRune(value, '\x00') || strings.HasPrefix(value, "/") {
		return errors.New("path must be a non-empty canonical output-relative slash path")
	}
	if path.Clean(value) != value {
		return errors.New("path is not canonical")
	}
	for _, segment := range strings.Split(value, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return errors.New("path contains an unsafe segment")
		}
	}
	return nil
}

func readABIRegularFileUnder(root, relative string, maxBytes int64) ([]byte, error) {
	if err := validateABIOutputRelativePath(relative); err != nil {
		return nil, err
	}
	rootInfo, err := os.Lstat(root)
	if err != nil {
		return nil, err
	}
	if rootInfo.Mode()&os.ModeSymlink != 0 || !rootInfo.IsDir() {
		return nil, errors.New("build output root is not a real directory")
	}
	parts := strings.Split(relative, "/")
	current := root
	for index, segment := range parts {
		current = filepath.Join(current, segment)
		info, err := os.Lstat(current)
		if err != nil {
			return nil, err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil, fmt.Errorf("path segment %q is a symlink", strings.Join(parts[:index+1], "/"))
		}
		if index < len(parts)-1 {
			if !info.IsDir() {
				return nil, fmt.Errorf("path segment %q is not a directory", strings.Join(parts[:index+1], "/"))
			}
			continue
		}
		if !info.Mode().IsRegular() {
			return nil, errors.New("path does not name a regular file")
		}
		if info.Size() < 0 || info.Size() > maxBytes {
			return nil, fmt.Errorf("file size %d exceeds limit %d", info.Size(), maxBytes)
		}
		file, err := os.Open(current)
		if err != nil {
			return nil, err
		}
		defer file.Close()
		fileInfo, err := file.Stat()
		if err != nil {
			return nil, err
		}
		if !fileInfo.Mode().IsRegular() {
			return nil, errors.New("opened path is not a regular file")
		}
		contents, err := io.ReadAll(io.LimitReader(file, maxBytes+1))
		if err != nil {
			return nil, err
		}
		if int64(len(contents)) > maxBytes {
			return nil, fmt.Errorf("file contents exceed limit %d", maxBytes)
		}
		return contents, nil
	}
	return nil, errors.New("empty output-relative path")
}
