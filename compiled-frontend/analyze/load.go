package analyze

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/importer"
	"go/parser"
	"go/scanner"
	"go/token"
	"go/types"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
)

type listedPackage struct {
	ImportPath string
	Dir        string
	GoFiles    []string
	Error      *struct{ Err string }
	Module     *struct{ Path string }
}

type loadedSourcePackage struct {
	list  listedPackage
	files []*ast.File
	texts []compilercontract.SourceFile
	info  *types.Info
	pkg   *types.Package
	fset  *token.FileSet
}

type sourceImporter struct {
	packages map[string]*types.Package
	fallback types.Importer
}

func (i *sourceImporter) Import(path string) (*types.Package, error) {
	if pkg := i.packages[path]; pkg != nil {
		return pkg, nil
	}
	return i.fallback.Import(path)
}

func (i *sourceImporter) ImportFrom(path, dir string, mode types.ImportMode) (*types.Package, error) {
	if pkg := i.packages[path]; pkg != nil {
		return pkg, nil
	}
	if from, ok := i.fallback.(types.ImporterFrom); ok {
		return from.ImportFrom(path, dir, mode)
	}
	return i.fallback.Import(path)
}

// LoadSources loads package syntax and go/types facts without depending on
// goscript's private semantic model. It uses `go list` only for module-aware
// file selection, then type-checks repository packages in dependency order.
func LoadSources(sourceRoot string, entryPackages []string) (compilercontract.TypedProgram, []compilercontract.Diagnostic) {
	program := compilercontract.TypedProgram{Packages: []compilercontract.TypedPackage{}}
	diagnostics := make([]compilercontract.Diagnostic, 0)
	if len(entryPackages) == 0 {
		return program, []compilercontract.Diagnostic{diagnostic("source.entries", "at least one entry package is required", compilercontract.Span{})}
	}
	root, err := filepath.Abs(sourceRoot)
	if err != nil {
		return program, []compilercontract.Diagnostic{diagnostic("source.root", err.Error(), compilercontract.Span{})}
	}
	modulePath, err := modulePath(root)
	if err != nil {
		return program, []compilercontract.Diagnostic{diagnostic("source.module", err.Error(), compilercontract.Span{})}
	}
	command := exec.Command("go", append([]string{"list", "-deps", "-json"}, entryPackages...)...)
	command.Dir = root
	var stderr bytes.Buffer
	command.Stderr = &stderr
	stdout, err := command.Output()
	if err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		return program, []compilercontract.Diagnostic{diagnostic("source.go-list", message, compilercontract.Span{})}
	}
	listed, err := decodePackageList(stdout)
	if err != nil {
		return program, []compilercontract.Diagnostic{diagnostic("source.go-list-json", err.Error(), compilercontract.Span{})}
	}
	selected := map[string]bool{}
	for _, entry := range entryPackages {
		selected[entry] = true
	}
	local := make([]listedPackage, 0)
	foundEntries := map[string]bool{}
	for _, item := range listed {
		if item.Error != nil {
			diagnostics = append(diagnostics, diagnostic("source.package", item.Error.Err, compilercontract.Span{}))
			continue
		}
		if selected[item.ImportPath] {
			foundEntries[item.ImportPath] = true
		}
		if item.ImportPath == modulePath || strings.HasPrefix(item.ImportPath, modulePath+"/") {
			local = append(local, item)
		}
	}
	for _, entry := range entryPackages {
		if !foundEntries[entry] {
			diagnostics = append(diagnostics, diagnostic("source.entry-missing", fmt.Sprintf("entry package %q was not returned by go list", entry), compilercontract.Span{}))
		}
	}
	if len(diagnostics) != 0 {
		return program, sortDiagnostics(diagnostics)
	}

	packages := make(map[string]*types.Package, len(local))
	loaded := make(map[string]*loadedSourcePackage, len(local))
	fallback := importer.ForCompiler(token.NewFileSet(), "gc", nil)
	imports := &sourceImporter{packages: packages, fallback: fallback}
	for _, item := range local {
		fset := token.NewFileSet()
		files := make([]*ast.File, 0, len(item.GoFiles))
		texts := make([]compilercontract.SourceFile, 0, len(item.GoFiles))
		for _, name := range item.GoFiles {
			full := filepath.Join(item.Dir, name)
			parsed, parseErr := parser.ParseFile(fset, full, nil, parser.AllErrors|parser.ParseComments)
			if parseErr != nil {
				diagnostics = append(diagnostics, parseDiagnostics(root, parseErr)...)
				continue
			}
			files = append(files, parsed)
			content, readErr := os.ReadFile(full)
			if readErr != nil {
				diagnostics = append(diagnostics, diagnostic("source.read", readErr.Error(), compilercontract.Span{}))
				continue
			}
			rel, relErr := filepath.Rel(root, full)
			if relErr != nil || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				diagnostics = append(diagnostics, diagnostic("source.path", fmt.Sprintf("source file %q escapes sourceRoot", full), compilercontract.Span{}))
				continue
			}
			texts = append(texts, compilercontract.SourceFile{Path: filepath.ToSlash(rel), Source: string(content)})
		}
		if len(files) != len(item.GoFiles) {
			continue
		}
		info := &types.Info{
			Types:      make(map[ast.Expr]types.TypeAndValue),
			Defs:       make(map[*ast.Ident]types.Object),
			Uses:       make(map[*ast.Ident]types.Object),
			Selections: make(map[*ast.SelectorExpr]*types.Selection),
			Implicits:  make(map[ast.Node]types.Object),
		}
		config := &types.Config{Importer: imports, Sizes: types.SizesFor("gc", "amd64"), GoVersion: "go1.24", Error: func(typeErr error) {
			diagnostics = append(diagnostics, typeDiagnostics(root, fset, typeErr)...)
		}}
		checked, checkErr := config.Check(item.ImportPath, fset, files, info)
		if checkErr != nil {
			continue
		}
		packages[item.ImportPath] = checked
		loaded[item.ImportPath] = &loadedSourcePackage{list: item, files: files, texts: texts, info: info, pkg: checked, fset: fset}
	}
	if len(diagnostics) != 0 {
		return program, sortDiagnostics(diagnostics)
	}
	for _, entry := range entryPackages {
		loadedPackage := loaded[entry]
		if loadedPackage == nil {
			diagnostics = append(diagnostics, diagnostic("source.entry-typecheck", fmt.Sprintf("entry package %q was not type-checked", entry), compilercontract.Span{}))
			continue
		}
		typed, packageDiagnostics := projectPackage(root, loadedPackage)
		program.Packages = append(program.Packages, typed)
		diagnostics = append(diagnostics, packageDiagnostics...)
	}
	if len(diagnostics) == 0 {
		dependencies, dependencyDiagnostics := projectReachableLocalDependencies(root, entryPackages, program.Packages, loaded)
		program.Packages = append(program.Packages, dependencies...)
		diagnostics = append(diagnostics, dependencyDiagnostics...)
	}
	return program, sortDiagnostics(diagnostics)
}

type sourceFunctionDecl struct {
	packageSource *loadedSourcePackage
	declaration   *ast.FuncDecl
	function      *types.Func
}

func projectReachableLocalDependencies(root string, entries []string, entryPackages []compilercontract.TypedPackage, loaded map[string]*loadedSourcePackage) ([]compilercontract.TypedPackage, []compilercontract.Diagnostic) {
	index := make(map[compilercontract.SymbolID]sourceFunctionDecl)
	paths := make([]string, 0, len(loaded))
	for path := range loaded {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	for _, path := range paths {
		source := loaded[path]
		for _, file := range source.files {
			for _, declaration := range file.Decls {
				function, ok := declaration.(*ast.FuncDecl)
				if !ok || function.Body == nil || function.Recv == nil && function.Name.Name == "init" {
					continue
				}
				object, _ := source.info.Defs[function.Name].(*types.Func)
				if object == nil || object.Type().(*types.Signature).Recv() != nil && !supportedValueReceiver(object) {
					continue
				}
				index[objectSymbol(object)] = sourceFunctionDecl{packageSource: source, declaration: function, function: object}
			}
		}
	}

	projected := make(map[compilercontract.SymbolID]compilercontract.TypedFunction)
	for _, pkg := range entryPackages {
		for _, function := range pkg.Functions {
			projected[function.ID] = function
		}
	}
	dependencyPackages := make(map[string]*compilercontract.TypedPackage)
	checkedPackageState := make(map[string]bool)
	visited := make(map[compilercontract.SymbolID]bool)
	queue := make([]compilercontract.SymbolID, 0)
	entryCount := len(entryPackages)
	entryTypes := sourceTypeIndex(entryPackages)
	for _, entry := range entries {
		for _, pkg := range entryPackages[:entryCount] {
			if pkg.ImportPath != entry {
				continue
			}
			byName := make(map[string][]compilercontract.TypedFunction)
			for _, name := range []string{"Init", "Update", "View"} {
				id := compilercontract.SymbolID(pkg.ImportPath + "." + name)
				if projected[id].ID != "" {
					queue = append(queue, id)
				}
			}
			for _, function := range pkg.Functions {
				byName[function.Name] = append(byName[function.Name], function)
			}
			var stateType compilercontract.TypeID
			if initializers := byName["Init"]; len(initializers) == 1 && len(initializers[0].Signature.Results) == 1 {
				stateType = initializers[0].Signature.Results[0]
			}
			bridgeRoles, bridgeDiagnostics := discoverModuleBridgeRoles(pkg, byName, stateType, entryTypes)
			if len(bridgeDiagnostics) == 0 && bridgeRoles.input != nil && bridgeRoles.publication != nil {
				queue = append(queue, bridgeRoles.input.ID, bridgeRoles.publication.ID)
			}
		}
	}

	var diagnostics []compilercontract.Diagnostic
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if visited[id] {
			continue
		}
		visited[id] = true
		function, exists := projected[id]
		if !exists {
			if supportedCall(id, sourceTypeIndex(entryPackages)) {
				continue
			}
			declaration, found := index[id]
			if !found {
				// Keep the unresolved edge in the projected call. ValidateOperations
				// will reject it if it is reachable from a component role.
				continue
			}
			packagePath := declaration.packageSource.list.ImportPath
			if !checkedPackageState[packagePath] {
				checkedPackageState[packagePath] = true
				if entryPackagesContain(entryPackages[:entryCount], packagePath) {
					// Entry packages were already checked by projectPackage.
				} else {
					stateDiagnostics := packageStateDiagnostics(root, declaration.packageSource)
					if len(stateDiagnostics) != 0 {
						diagnostics = append(diagnostics, stateDiagnostics...)
						continue
					}
				}
			}
			collector := newTypeCollector()
			projectedFunction, err := projectFunction(root, declaration.packageSource, declaration.declaration, collector)
			if err != nil {
				// A source-local dependency call without a safe typed body remains
				// unresolved and is rejected by ValidateOperations if reachable.
				continue
			}
			function = projectedFunction
			projected[id] = function
			dependency := dependencyPackages[packagePath]
			if dependency == nil {
				dependency = &compilercontract.TypedPackage{
					ImportPath: packagePath,
					Files:      []compilercontract.SourceFile{},
					Types:      []compilercontract.TypeInfo{},
					Functions:  []compilercontract.TypedFunction{},
				}
				dependencyPackages[packagePath] = dependency
			}
			dependency.Functions = append(dependency.Functions, function)
			dependency.Types = mergeTypeInfo(dependency.Types, collector.list())
		}
		walkOperations(function.Body, func(operation compilercontract.Operation) {
			if operation.Kind == compilercontract.OpCall && operation.SymbolID != "" && !visited[operation.SymbolID] {
				queue = append(queue, operation.SymbolID)
			}
		})
	}

	result := make([]compilercontract.TypedPackage, 0, len(dependencyPackages))
	for _, path := range paths {
		if dependency := dependencyPackages[path]; dependency != nil {
			sort.SliceStable(dependency.Types, func(i, j int) bool { return dependency.Types[i].ID < dependency.Types[j].ID })
			sort.SliceStable(dependency.Functions, func(i, j int) bool { return dependency.Functions[i].ID < dependency.Functions[j].ID })
			result = append(result, *dependency)
		}
	}
	return result, diagnostics
}

func sourceTypeIndex(packages []compilercontract.TypedPackage) map[compilercontract.TypeID]compilercontract.TypeInfo {
	result := make(map[compilercontract.TypeID]compilercontract.TypeInfo)
	for _, pkg := range packages {
		for _, info := range pkg.Types {
			result[info.ID] = info
		}
	}
	return result
}

func mergeTypeInfo(current, additions []compilercontract.TypeInfo) []compilercontract.TypeInfo {
	seen := make(map[compilercontract.TypeID]bool, len(current)+len(additions))
	result := append([]compilercontract.TypeInfo{}, current...)
	for _, info := range current {
		seen[info.ID] = true
	}
	for _, info := range additions {
		if !seen[info.ID] {
			seen[info.ID] = true
			result = append(result, info)
		}
	}
	return result
}

func entryPackagesContain(packages []compilercontract.TypedPackage, importPath string) bool {
	for _, pkg := range packages {
		if pkg.ImportPath == importPath {
			return true
		}
	}
	return false
}

func decodePackageList(data []byte) ([]listedPackage, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	var packages []listedPackage
	for {
		var item listedPackage
		err := decoder.Decode(&item)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		packages = append(packages, item)
	}
	return packages, nil
}

func modulePath(root string) (string, error) {
	data, err := os.ReadFile(filepath.Join(root, "go.mod"))
	if err != nil {
		return "", fmt.Errorf("read go.mod: %w", err)
	}
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[0] == "module" {
			return strings.Trim(fields[1], "\"`"), nil
		}
	}
	return "", fmt.Errorf("go.mod has no module directive")
}

func diagnostic(code, message string, span compilercontract.Span) compilercontract.Diagnostic {
	return compilercontract.Diagnostic{Code: code, Severity: "error", Message: message, Span: span, Related: []compilercontract.Span{}}
}

func parseDiagnostics(root string, err error) []compilercontract.Diagnostic {
	var out []compilercontract.Diagnostic
	switch value := err.(type) {
	case scanner.ErrorList:
		for _, item := range value {
			out = append(out, diagnostic("source.parse", item.Msg, positionSpan(root, item.Pos.Offset, item.Pos.Filename)))
		}
	default:
		out = append(out, diagnostic("source.parse", err.Error(), compilercontract.Span{}))
	}
	return out
}

func typeDiagnostics(root string, fset *token.FileSet, err error) []compilercontract.Diagnostic {
	var out []compilercontract.Diagnostic
	if value, ok := err.(types.Error); ok {
		position := fset.PositionFor(value.Pos, false)
		span := spanFromPosition(root, position, 1)
		out = append(out, diagnostic("source.type", value.Msg, span))
		return out
	}
	out = append(out, diagnostic("source.type", err.Error(), compilercontract.Span{}))
	return out
}

func positionSpan(root string, offset int, filename string) compilercontract.Span {
	path := filename
	if rel, err := filepath.Rel(root, path); err == nil && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		path = filepath.ToSlash(rel)
	}
	return compilercontract.Span{File: filepath.ToSlash(path), StartByte: offset, EndByte: offset + 1}
}

func spanFromPosition(root string, position token.Position, width int) compilercontract.Span {
	path := position.Filename
	if rel, err := filepath.Rel(root, path); err == nil && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		path = filepath.ToSlash(rel)
	}
	if width < 1 {
		width = 1
	}
	return compilercontract.Span{File: filepath.ToSlash(path), StartByte: position.Offset, EndByte: position.Offset + width}
}

func sortDiagnostics(diagnostics []compilercontract.Diagnostic) []compilercontract.Diagnostic {
	sort.SliceStable(diagnostics, func(i, j int) bool {
		if diagnostics[i].Span.File != diagnostics[j].Span.File {
			return diagnostics[i].Span.File < diagnostics[j].Span.File
		}
		if diagnostics[i].Span.StartByte != diagnostics[j].Span.StartByte {
			return diagnostics[i].Span.StartByte < diagnostics[j].Span.StartByte
		}
		return diagnostics[i].Code < diagnostics[j].Code
	})
	return diagnostics
}
