package analyze

import (
	"fmt"
	"math/big"
	"sort"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
)

const maxSafeInteger = "9007199254740991"

// Analyze discovers package-level Init/Update/View triples and fails closed on
// unsupported reachable syntax or calls. Its output is neutral source/type
// metadata, not an interpretation of application code.
func Analyze(program compilercontract.TypedProgram, options compilercontract.AnalyzeOptions) compilercontract.AnalysisResult {
	result := compilercontract.AnalysisResult{Apps: []compilercontract.AppIR{}, Diagnostics: []compilercontract.Diagnostic{}}
	packages := make(map[string]compilercontract.TypedPackage, len(program.Packages))
	for _, pkg := range program.Packages {
		packages[pkg.ImportPath] = pkg
	}
	entries := options.EntryPackages
	if len(entries) == 0 {
		for _, pkg := range program.Packages {
			entries = append(entries, pkg.ImportPath)
		}
	}
	for _, entry := range entries {
		pkg, ok := packages[entry]
		if !ok {
			result.Diagnostics = append(result.Diagnostics, diagnostic("analyze.package", fmt.Sprintf("entry package %q is missing from TypedProgram", entry), compilercontract.Span{}))
			continue
		}
		app, diagnostics := analyzePackage(program, pkg)
		result.Diagnostics = append(result.Diagnostics, diagnostics...)
		if app.Schema != "" {
			result.Apps = append(result.Apps, app)
		}
	}
	return compilercontract.AnalysisResult{Apps: result.Apps, Diagnostics: sortDiagnostics(result.Diagnostics)}
}

func analyzePackage(program compilercontract.TypedProgram, pkg compilercontract.TypedPackage) (compilercontract.AppIR, []compilercontract.Diagnostic) {
	var diagnostics []compilercontract.Diagnostic
	functions := make(map[compilercontract.SymbolID]compilercontract.TypedFunction)
	byName := make(map[string][]compilercontract.TypedFunction)
	for _, sourcePackage := range program.Packages {
		for _, function := range sourcePackage.Functions {
			functions[function.ID] = function
		}
	}
	for _, function := range pkg.Functions {
		if function.PackagePath != pkg.ImportPath || function.ID != compilercontract.SymbolID(pkg.ImportPath+"."+function.Name) {
			continue
		}
		byName[function.Name] = append(byName[function.Name], function)
	}
	roles := make(map[string]compilercontract.TypedFunction)
	for _, name := range []string{"Init", "Update", "View"} {
		matches := byName[name]
		if len(matches) != 1 {
			diagnostics = append(diagnostics, diagnostic("analyze.role", fmt.Sprintf("package %q must have exactly one package-level %s function", pkg.ImportPath, name), compilercontract.Span{}))
			continue
		}
		roles[name] = matches[0]
	}
	if len(roles) != 3 {
		return compilercontract.AppIR{}, diagnostics
	}
	init, update, view := roles["Init"], roles["Update"], roles["View"]
	if len(init.Signature.Params) != 0 || len(init.Signature.Results) != 1 {
		diagnostics = append(diagnostics, diagnostic("analyze.init-signature", "Init must accept no parameters and return one state value", init.Span))
	}
	stateType := firstType(init.Signature.Results)
	messageType := compilercontract.TypeID("")
	if len(update.Signature.Params) >= 2 {
		messageType = update.Signature.Params[1]
	}
	if len(update.Signature.Params) != 2 || len(update.Signature.Results) != 2 || update.Signature.Params[0] != stateType || firstType(update.Signature.Results) != stateType {
		diagnostics = append(diagnostics, diagnostic("analyze.update-signature", "Update must accept (State, Message) and return (State, []Effect)", update.Span))
	}
	if len(view.Signature.Params) != 1 || view.Signature.Params[0] != stateType || len(view.Signature.Results) != 1 {
		diagnostics = append(diagnostics, diagnostic("analyze.view-signature", "View must accept State and return one view value", view.Span))
	}
	if !typeIs(pkg.Types, stateType, compilercontract.KindStruct) {
		diagnostics = append(diagnostics, diagnostic("analyze.state", fmt.Sprintf("state type %q must be a supported struct", stateType), init.Span))
	}
	if !messageShape(pkg.Types, messageType) {
		diagnostics = append(diagnostics, diagnostic("analyze.message", fmt.Sprintf("message type %q must expose string Name and Arg fields", messageType), update.Span))
	}
	if len(update.Signature.Results) == 2 && !effectSliceShape(pkg.Types, update.Signature.Results[1]) {
		diagnostics = append(diagnostics, diagnostic("analyze.effects", "Update result two must be a slice of supported gobi.Effect values", update.Span))
	}
	if len(view.Signature.Results) == 1 && !viewShape(pkg.Types, view.Signature.Results[0]) {
		diagnostics = append(diagnostics, diagnostic("analyze.view-result", "View result must be gobi.Node or compilercontract.View", view.Span))
	}

	roots := []compilercontract.SymbolID{init.ID, update.ID, view.ID}
	reachable, reachableDiagnostics := reachableFunctions(functions, roots)
	diagnostics = append(diagnostics, reachableDiagnostics...)
	diagnostics = append(diagnostics, ValidateOperations(program, roots)...)
	updateReachable, updateReachableDiagnostics := reachableFunctions(functions, []compilercontract.SymbolID{update.ID})
	diagnostics = append(diagnostics, updateReachableDiagnostics...)

	types := append([]compilercontract.TypeInfo{}, pkg.Types...)
	for _, function := range reachable {
		if function.PackagePath == pkg.ImportPath {
			continue
		}
		for _, sourcePackage := range program.Packages {
			if sourcePackage.ImportPath == function.PackagePath {
				types = mergeTypeInfo(types, sourcePackage.Types)
			}
		}
	}
	sort.SliceStable(types, func(i, j int) bool { return types[i].ID < types[j].ID })
	appSymbols := make([]compilercontract.Symbol, 0, len(reachable))
	for _, function := range reachable {
		calls := []compilercontract.SymbolID{}
		seen := map[compilercontract.SymbolID]bool{}
		walkOperations(function.Body, func(operation compilercontract.Operation) {
			if operation.Kind == compilercontract.OpCall && reachableSetContains(reachable, operation.SymbolID) && !seen[operation.SymbolID] {
				calls = append(calls, operation.SymbolID)
				seen[operation.SymbolID] = true
			}
		})
		appSymbols = append(appSymbols, compilercontract.Symbol{
			ID: function.ID, PackagePath: function.PackagePath, Name: function.Name,
			Signature: function.Signature, Span: function.Span, Calls: calls,
		})
	}
	sort.SliceStable(appSymbols, func(i, j int) bool {
		if appSymbols[i].Span.File != appSymbols[j].Span.File {
			return appSymbols[i].Span.File < appSymbols[j].Span.File
		}
		if appSymbols[i].Span.StartByte != appSymbols[j].Span.StartByte {
			return appSymbols[i].Span.StartByte < appSymbols[j].Span.StartByte
		}
		return appSymbols[i].ID < appSymbols[j].ID
	})
	effectType := updateEffectType(update.Signature.Results, types)
	capabilities := deriveCapabilities(types, reachable, stateType, view.ID, updateReachable, effectType)
	app := compilercontract.AppIR{
		Schema: compilercontract.AppIRSchema, PackagePath: pkg.ImportPath,
		Components: []compilercontract.Component{{
			ID: pkg.ImportPath, PackagePath: pkg.ImportPath,
			StateType: stateType, MessageType: messageType,
			Init: init.ID, Update: update.ID, View: view.ID, Capabilities: capabilities,
		}},
		Symbols: appSymbols, Types: types,
	}
	diagnostics = append(diagnostics, compilercontract.ValidateAppIR(app)...)
	return app, diagnostics
}

func ValidateOperations(program compilercontract.TypedProgram, roots []compilercontract.SymbolID) []compilercontract.Diagnostic {
	functions := make(map[compilercontract.SymbolID]compilercontract.TypedFunction)
	types := make(map[compilercontract.TypeID]compilercontract.TypeInfo)
	for _, pkg := range program.Packages {
		for _, function := range pkg.Functions {
			functions[function.ID] = function
		}
		for _, info := range pkg.Types {
			types[info.ID] = info
		}
	}
	reachable, diagnostics := reachableFunctions(functions, roots)
	for _, function := range reachable {
		walkOperationsWithContext(function.Body, types, map[string]string{}, false, false, func(operation compilercontract.Operation, guards map[string]string, forPost, makeHint bool) {
			span := operation.Span
			switch operation.Kind {
			case compilercontract.OpUnsupported:
				diagnostics = append(diagnostics, diagnostic("analyze.unsupported-operation", fmt.Sprintf("unsupported reachable Go construct %s", operation.Operator), span))
			case compilercontract.OpCall:
				if operation.SymbolID == "" {
					diagnostics = append(diagnostics, diagnostic("analyze.dynamic-call", "dynamic or unresolved call is unsupported", span))
				} else if _, local := functions[operation.SymbolID]; !local && !supportedCall(operation.SymbolID, types) {
					diagnostics = append(diagnostics, diagnostic("analyze.unsupported-call", fmt.Sprintf("unsupported reachable call %q", operation.SymbolID), span))
				}
				if strings.HasPrefix(string(operation.SymbolID), "convert:") && isIntegerType(types[operation.TypeID]) && !safeIntegerConversion(operation, types) {
					diagnostics = append(diagnostics, diagnostic("analyze.numeric-profile", "runtime integer conversion is not proven within the v1 safe-integer profile", span))
				}
			case compilercontract.OpLiteral:
				if operation.Literal == nil {
					diagnostics = append(diagnostics, diagnostic("analyze.numeric-profile", "literal cannot be represented exactly by the v1 state/value profile", span))
				} else if operation.Literal.Integer != nil {
					value, ok := new(big.Int).SetString(*operation.Literal.Integer, 10)
					limit, _ := new(big.Int).SetString(maxSafeInteger, 10)
					if !ok || value.Cmp(limit) > 0 || value.Cmp(new(big.Int).Neg(new(big.Int).Set(limit))) < 0 {
						diagnostics = append(diagnostics, diagnostic("analyze.numeric-profile", "integer literal exceeds the v1 safe-integer profile", span))
					}
				}
			case compilercontract.OpBinary:
				if isIntegerType(types[operation.TypeID]) && arithmeticOperator(operation.Operator) {
					if !safeIntegerExpression(operation, guards, makeHint, types) {
						diagnostics = append(diagnostics, diagnostic("analyze.numeric-profile", "integer arithmetic is not proven within the v1 safe-integer profile", span))
					}
				}
				if operation.Operator == "&" || operation.Operator == "|" || operation.Operator == "^" || operation.Operator == "<<" || operation.Operator == ">>" || operation.Operator == "&^" {
					diagnostics = append(diagnostics, diagnostic("analyze.bitwise", "bitwise integer operations are unsupported", span))
				}
			case compilercontract.OpIncDec:
				if len(operation.Children) > 0 && isIntegerType(types[operation.Children[0].TypeID]) {
					key := expressionKey(operation.Children[0])
					bound := guards[key]
					want := "upper"
					if operation.Operator == "--" {
						want = "lower"
					}
					if !hasGuard(bound, want) {
						diagnostics = append(diagnostics, diagnostic("analyze.numeric-profile", "integer increment/decrement lacks a safe bound guard", span))
					}
				}
			case compilercontract.OpAssign:
				lhsCount := assignmentLHSCount(operation.Operator)
				if !isAssignmentOperator(assignmentToken(operation.Operator)) || lhsCount < 1 || lhsCount > len(operation.Children) {
					diagnostics = append(diagnostics, diagnostic("analyze.assignment-shape", "assignment operator or left-hand side arity is unsupported", span))
				}
				if len(operation.Children) > 0 && isIntegerType(types[operation.Children[0].TypeID]) && isCompoundAssignment(assignmentToken(operation.Operator)) {
					diagnostics = append(diagnostics, diagnostic("analyze.numeric-profile", "integer compound assignment has no v1 operand and range proof", span))
				}
			case compilercontract.OpUnary:
				if operation.Operator == "&" || operation.Operator == "*" || operation.Operator == "^" {
					diagnostics = append(diagnostics, diagnostic("analyze.unsupported-unary", fmt.Sprintf("unary operation %q is unsupported", operation.Operator), span))
				} else if operation.Operator == "-" && len(operation.Children) > 0 && isIntegerType(types[operation.Children[0].TypeID]) && operation.Children[0].Kind != compilercontract.OpLiteral {
					diagnostics = append(diagnostics, diagnostic("analyze.numeric-profile", "negating a runtime integer is not proven safe", span))
				}
			case compilercontract.OpRange:
				// Range is permitted for slices; map/channel range is rejected by
				// the source type metadata and runtime operation kind.
			}
		})
	}
	return sortDiagnostics(diagnostics)
}

func reachableFunctions(functions map[compilercontract.SymbolID]compilercontract.TypedFunction, roots []compilercontract.SymbolID) ([]compilercontract.TypedFunction, []compilercontract.Diagnostic) {
	seen := map[compilercontract.SymbolID]bool{}
	queue := append([]compilercontract.SymbolID{}, roots...)
	var ordered []compilercontract.TypedFunction
	var diagnostics []compilercontract.Diagnostic
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if seen[id] {
			continue
		}
		seen[id] = true
		function, ok := functions[id]
		if !ok {
			diagnostics = append(diagnostics, diagnostic("analyze.root", fmt.Sprintf("reachable function %q is not in the source program", id), compilercontract.Span{}))
			continue
		}
		ordered = append(ordered, function)
		walkOperations(function.Body, func(operation compilercontract.Operation) {
			if operation.Kind == compilercontract.OpCall && functions[operation.SymbolID].ID != "" && !seen[operation.SymbolID] {
				queue = append(queue, operation.SymbolID)
			}
		})
	}
	return ordered, diagnostics
}

func supportedCall(id compilercontract.SymbolID, types map[compilercontract.TypeID]compilercontract.TypeInfo) bool {
	name := string(id)
	if strings.HasPrefix(name, "convert:") {
		_, ok := types[compilercontract.TypeID(strings.TrimPrefix(name, "convert:"))]
		return ok
	}
	if strings.HasPrefix(name, "builtin.") {
		switch strings.TrimPrefix(name, "builtin.") {
		case "len", "cap", "make", "append", "copy", "new":
			return true
		}
		return false
	}
	parts := strings.Split(name, ".")
	if len(parts) < 2 {
		return false
	}
	path, function := strings.Join(parts[:len(parts)-1], "."), parts[len(parts)-1]
	switch path {
	case "github.com/samuelpmahan/gondola/gobi":
		switch function {
		case "El", "Txt", "Frag", "S", "Set", "Flag", "Css", "Keyed", "Handle":
			return true
		}
	case "github.com/samuelpmahan/gondola/compilercontract":
		return function == "NewView"
	case "strconv":
		switch function {
		case "Itoa", "FormatUint", "FormatFloat":
			return true
		}
	case "math":
		return function == "Copysign"
	}
	return false
}

func walkOperations(operations []compilercontract.Operation, visit func(compilercontract.Operation)) {
	for _, operation := range operations {
		visit(operation)
		walkOperations(operation.Children, visit)
	}
}

func walkOperationsWithContext(operations []compilercontract.Operation, types map[compilercontract.TypeID]compilercontract.TypeInfo, guards map[string]string, forPost, makeHint bool, visit func(compilercontract.Operation, map[string]string, bool, bool)) {
	current := cloneGuards(guards)
	for _, operation := range operations {
		current = walkOperationWithContext(operation, types, current, forPost, makeHint, visit)
	}
}

func walkOperationWithContext(operation compilercontract.Operation, types map[compilercontract.TypeID]compilercontract.TypeInfo, guards map[string]string, forPost, makeHint bool, visit func(compilercontract.Operation, map[string]string, bool, bool)) map[string]string {
	visit(operation, guards, forPost, makeHint)
	children := operation.Children
	switch operation.Kind {
	case compilercontract.OpBlock:
		current := cloneGuards(guards)
		for _, child := range children {
			current = walkOperationWithContext(child, types, current, false, makeHint, visit)
		}
		return current
	case compilercontract.OpIf:
		conditionIndex := 0
		current := cloneGuards(guards)
		if operation.Operator == "hasInit" {
			conditionIndex = 1
			if len(children) > 0 {
				current = walkOperationWithContext(children[0], types, current, false, makeHint, visit)
			}
		}
		if conditionIndex >= len(children) {
			return current
		}
		condition := children[conditionIndex]
		_ = walkOperationWithContext(condition, types, current, false, makeHint, visit)
		thenGuards := mergeGuards(current, guardsFromCondition(condition, types))
		thenIndex := conditionIndex + 1
		thenAfter := cloneGuards(thenGuards)
		if thenIndex < len(children) {
			thenAfter = walkOperationWithContext(children[thenIndex], types, thenAfter, false, makeHint, visit)
		}
		elseAfter := cloneGuards(current)
		if thenIndex+1 < len(children) {
			elseAfter = walkOperationWithContext(children[thenIndex+1], types, elseAfter, false, makeHint, visit)
		}
		return intersectGuards(thenAfter, elseAfter)
	case compilercontract.OpFor:
		current := cloneGuards(guards)
		if len(children) > 0 {
			current = walkOperationWithContext(children[0], types, current, false, makeHint, visit)
		}
		if len(children) <= 1 {
			return current
		}
		condition := children[1]
		_ = walkOperationWithContext(condition, types, current, false, makeHint, visit)
		loopGuards := mergeGuards(current, guardsFromCondition(condition, types))
		bodyAfter := cloneGuards(loopGuards)
		if len(children) > 3 {
			bodyAfter = walkOperationWithContext(children[3], types, bodyAfter, false, makeHint, visit)
		}
		if len(children) > 2 {
			bodyAfter = walkOperationWithContext(children[2], types, bodyAfter, true, makeHint, visit)
		}
		return intersectGuards(current, bodyAfter)
	case compilercontract.OpSwitch:
		base := cloneGuards(guards)
		for _, child := range children {
			if child.Kind == compilercontract.OpBranch && strings.HasPrefix(child.Operator, "case:") {
				continue
			}
			base = walkOperationWithContext(child, types, base, false, makeHint, visit)
		}
		result := cloneGuards(base)
		for _, child := range children {
			if child.Kind != compilercontract.OpBranch || !strings.HasPrefix(child.Operator, "case:") {
				continue
			}
			branch := walkOperationWithContext(child, types, cloneGuards(base), false, makeHint, visit)
			result = intersectGuards(result, branch)
		}
		return result
	case compilercontract.OpBranch:
		if strings.HasPrefix(operation.Operator, "case:") {
			count, _ := strconv.Atoi(strings.TrimPrefix(operation.Operator, "case:"))
			current := cloneGuards(guards)
			for i, child := range children {
				if i < count {
					_ = walkOperationWithContext(child, types, current, false, makeHint, visit)
					continue
				}
				current = walkOperationWithContext(child, types, current, false, makeHint, visit)
			}
			return current
		}
	case compilercontract.OpAssign:
		lhsCount := assignmentLHSCount(operation.Operator)
		current := cloneGuards(guards)
		for _, child := range children {
			current = walkOperationWithContext(child, types, current, false, makeHint, visit)
		}
		if lhsCount < 0 || lhsCount > len(children) {
			return map[string]string{}
		}
		for _, target := range children[:lhsCount] {
			current = invalidateTargetGuards(current, target)
		}
		return current
	case compilercontract.OpIncDec:
		current := cloneGuards(guards)
		for _, child := range children {
			current = walkOperationWithContext(child, types, current, false, makeHint, visit)
			current = invalidateTargetGuards(current, child)
		}
		return current
	case compilercontract.OpCall:
		current := cloneGuards(guards)
		for i, child := range children {
			childMakeHint := makeHint
			if operation.SymbolID == "builtin.make" {
				childMakeHint = i >= 3
			}
			current = walkOperationWithContext(child, types, current, false, childMakeHint, visit)
		}
		return current
	}
	current := cloneGuards(guards)
	for _, child := range children {
		current = walkOperationWithContext(child, types, current, false, makeHint, visit)
	}
	return current
}

func guardsFromCondition(condition compilercontract.Operation, types map[compilercontract.TypeID]compilercontract.TypeInfo) map[string]string {
	result := map[string]string{}
	if condition.Kind == compilercontract.OpParen && len(condition.Children) == 1 {
		return guardsFromCondition(condition.Children[0], types)
	}
	if condition.Kind == compilercontract.OpBinary && condition.Operator == "&&" {
		for _, child := range condition.Children {
			for key, value := range guardsFromCondition(child, types) {
				addGuard(result, key, value)
			}
		}
		return result
	}
	if condition.Kind != compilercontract.OpBinary || len(condition.Children) != 2 {
		return result
	}
	left, right := condition.Children[0], condition.Children[1]
	if bound, ok := integerConstant(right); ok {
		if key := expressionKey(left); key != "" {
			if kind, safe := comparisonGuard(condition.Operator, left, bound, types); safe {
				addGuard(result, key, kind)
			}
		}
	}
	if bound, ok := integerConstant(left); ok {
		if key := expressionKey(right); key != "" {
			if kind, safe := comparisonGuard(reverseComparison(condition.Operator), right, bound, types); safe {
				addGuard(result, key, kind)
			}
		}
	}
	if right.Kind == compilercontract.OpCall && right.SymbolID == "builtin.len" {
		if key := expressionKey(left); key != "" && isIntegerType(types[left.TypeID]) && lenResultIsBounded(right, types) {
			if condition.Operator == "<" || condition.Operator == "<=" {
				addGuard(result, key, "upper")
			}
		}
	}
	if left.Kind == compilercontract.OpCall && left.SymbolID == "builtin.len" {
		if key := expressionKey(right); key != "" && isIntegerType(types[right.TypeID]) && lenResultIsBounded(left, types) {
			if condition.Operator == ">" || condition.Operator == ">=" {
				addGuard(result, key, "upper")
			}
		}
	}
	return result
}

func mergeGuards(left, right map[string]string) map[string]string {
	merged := make(map[string]string, len(left)+len(right))
	for key, value := range left {
		addGuard(merged, key, value)
	}
	for key, value := range right {
		addGuard(merged, key, value)
	}
	return merged
}

func cloneGuards(guards map[string]string) map[string]string {
	clone := make(map[string]string, len(guards))
	for key, value := range guards {
		clone[key] = value
	}
	return clone
}

func intersectGuards(sets ...map[string]string) map[string]string {
	result := map[string]string{}
	if len(sets) == 0 {
		return result
	}
	for key, value := range sets[0] {
		bits := guardBits(value)
		for _, set := range sets[1:] {
			bits &= guardBits(set[key])
		}
		if bits != 0 {
			result[key] = guardName(bits)
		}
	}
	return result
}

func addGuard(guards map[string]string, key, value string) {
	if key == "" || value == "" {
		return
	}
	guards[key] = guardName(guardBits(guards[key]) | guardBits(value))
}

func guardBits(value string) uint8 {
	switch value {
	case "upper":
		return 1
	case "lower":
		return 2
	case "both":
		return 3
	default:
		return 0
	}
}

func guardName(bits uint8) string {
	switch bits {
	case 1:
		return "upper"
	case 2:
		return "lower"
	case 3:
		return "both"
	default:
		return ""
	}
}

func hasGuard(value, want string) bool {
	return guardBits(value)&guardBits(want) == guardBits(want)
}

func expressionKey(operation compilercontract.Operation) string {
	switch operation.Kind {
	case compilercontract.OpIdent:
		if strings.HasPrefix(operation.Operator, "type:") {
			return ""
		}
		if strings.HasPrefix(string(operation.SymbolID), "local:") {
			return "$" + string(operation.SymbolID)
		}
		return operation.Operator
	case compilercontract.OpSelector:
		if len(operation.Children) == 0 {
			return operation.Operator
		}
		base := expressionKey(operation.Children[0])
		if base == "" {
			return ""
		}
		return base + "." + operation.Operator
	case compilercontract.OpParen:
		if len(operation.Children) != 0 {
			return expressionKey(operation.Children[0])
		}
	}
	return ""
}

func literalIs(operation compilercontract.Operation, integer string) bool {
	value, ok := integerConstant(operation)
	return ok && value.String() == integer
}

func safeIntegerExpression(operation compilercontract.Operation, guards map[string]string, makeHint bool, types map[compilercontract.TypeID]compilercontract.TypeInfo) bool {
	if len(operation.Children) != 2 {
		return false
	}
	left, right := operation.Children[0], operation.Children[1]
	if makeHint && operation.Operator == "*" {
		return safeMakeCapacityDouble(left, right, operation.TypeID, types)
	}
	leftKey, rightKey := expressionKey(left), expressionKey(right)
	switch operation.Operator {
	case "+":
		return (literalIs(right, "1") && hasGuard(guards[leftKey], "upper")) ||
			(literalIs(left, "1") && hasGuard(guards[rightKey], "upper"))
	case "-":
		return literalIs(right, "1") && hasGuard(guards[leftKey], "lower")
	default:
		return false
	}
}

func integerConstant(operation compilercontract.Operation) (*big.Int, bool) {
	switch operation.Kind {
	case compilercontract.OpLiteral:
		if operation.Literal == nil || operation.Literal.Integer == nil {
			return nil, false
		}
		value, ok := new(big.Int).SetString(*operation.Literal.Integer, 10)
		return value, ok
	case compilercontract.OpParen:
		if len(operation.Children) == 1 {
			return integerConstant(operation.Children[0])
		}
	case compilercontract.OpUnary:
		if operation.Operator == "-" && len(operation.Children) == 1 {
			value, ok := integerConstant(operation.Children[0])
			if ok {
				return value.Neg(value), true
			}
		}
	}
	return nil, false
}

func comparisonGuard(operator string, variable compilercontract.Operation, bound *big.Int, types map[compilercontract.TypeID]compilercontract.TypeInfo) (string, bool) {
	if bound == nil || !isIntegerType(types[variable.TypeID]) {
		return "", false
	}
	minimum, maximum, ok := safeIntegerRange(types[variable.TypeID])
	if !ok {
		return "", false
	}
	switch operator {
	case "<":
		return "upper", bound.Cmp(maximum) <= 0
	case "<=":
		return "upper", bound.Cmp(maximum) < 0
	case ">":
		return "lower", bound.Cmp(minimum) >= 0
	case ">=":
		return "lower", bound.Cmp(minimum) > 0
	default:
		return "", false
	}
}

func reverseComparison(operator string) string {
	switch operator {
	case "<":
		return ">"
	case "<=":
		return ">="
	case ">":
		return "<"
	case ">=":
		return "<="
	default:
		return ""
	}
}

func safeIntegerRange(info compilercontract.TypeInfo) (*big.Int, *big.Int, bool) {
	if !isIntegerType(info) || info.Bits == 0 || info.Bits > 64 {
		return nil, nil, false
	}
	minimum := new(big.Int)
	maximum := new(big.Int)
	if info.Kind == compilercontract.KindInt {
		maximum.Lsh(big.NewInt(1), uint(info.Bits-1))
		maximum.Sub(maximum, big.NewInt(1))
		minimum.Neg(new(big.Int).Add(maximum, big.NewInt(1)))
	} else {
		maximum.Lsh(big.NewInt(1), uint(info.Bits))
		maximum.Sub(maximum, big.NewInt(1))
	}
	safe := new(big.Int)
	safe.SetString(maxSafeInteger, 10)
	if maximum.Cmp(safe) > 0 {
		maximum = safe
	}
	if info.Kind == compilercontract.KindInt {
		safeMin := new(big.Int).Neg(new(big.Int).Set(safe))
		if minimum.Cmp(safeMin) < 0 {
			minimum = safeMin
		}
	}
	return minimum, maximum, true
}

func lenResultIsBounded(operation compilercontract.Operation, types map[compilercontract.TypeID]compilercontract.TypeInfo) bool {
	if operation.Kind != compilercontract.OpCall || operation.SymbolID != "builtin.len" || len(operation.Children) < 2 {
		return false
	}
	argument := operation.Children[1]
	info, ok := types[argument.TypeID]
	_, bounded := maxRepresentableCollectionLength(info, types)
	return ok && bounded
}

func safeMakeCapacityDouble(left, right compilercontract.Operation, resultType compilercontract.TypeID, types map[compilercontract.TypeID]compilercontract.TypeInfo) bool {
	var length compilercontract.Operation
	if left.Kind == compilercontract.OpCall && left.SymbolID == "builtin.len" && literalIs(right, "2") {
		length = left
	} else if right.Kind == compilercontract.OpCall && right.SymbolID == "builtin.len" && literalIs(left, "2") {
		length = right
	} else {
		return false
	}
	if !lenResultIsBounded(length, types) {
		return false
	}
	argumentType := types[length.Children[1].TypeID]
	limit, bounded := maxRepresentableCollectionLength(argumentType, types)
	if !bounded {
		return false
	}
	maximum := new(big.Int).Mul(limit, big.NewInt(2))
	_, typeMaximum, ok := safeIntegerRange(types[resultType])
	if !ok {
		return false
	}
	safeMaximum := new(big.Int)
	safeMaximum.SetString(maxSafeInteger, 10)
	if typeMaximum.Cmp(safeMaximum) < 0 {
		safeMaximum = typeMaximum
	}
	return maximum.Cmp(safeMaximum) <= 0
}

func maxRepresentableCollectionLength(info compilercontract.TypeInfo, types map[compilercontract.TypeID]compilercontract.TypeInfo) (*big.Int, bool) {
	arrayMaximum := big.NewInt(4294967295)
	safeMaximum := new(big.Int)
	safeMaximum.SetString(maxSafeInteger, 10)
	switch info.Kind {
	case compilercontract.KindArray:
		if info.Length == nil || *info.Length < 0 {
			return nil, false
		}
		length := big.NewInt(int64(*info.Length))
		return length, length.Cmp(arrayMaximum) <= 0
	case compilercontract.KindSlice:
		element := types[info.ElemType]
		switch info.JSRepresentation {
		case compilercontract.JSArrayOrSlice, compilercontract.JSArray:
			if element.Kind == compilercontract.KindFloat64 {
				return nil, false
			}
			return new(big.Int).Set(arrayMaximum), true
		case compilercontract.JSFloat64ArrayOrSlice, compilercontract.JSFloat64Array:
			if element.Kind != compilercontract.KindFloat64 {
				return nil, false
			}
			return new(big.Int).Div(safeMaximum, big.NewInt(8)), true
		case compilercontract.JSSliceWrapper:
			if element.ID == "" {
				return nil, false
			}
			if element.Kind == compilercontract.KindFloat64 {
				return new(big.Int).Div(safeMaximum, big.NewInt(8)), true
			}
			return new(big.Int).Set(arrayMaximum), true
		default:
			return nil, false
		}
	default:
		return nil, false
	}
}

func assignmentToken(operator string) string {
	if token, _, ok := strings.Cut(operator, "#lhs="); ok {
		return token
	}
	return operator
}

func assignmentLHSCount(operator string) int {
	_, count, ok := strings.Cut(operator, "#lhs=")
	if !ok {
		return 1
	}
	value, err := strconv.Atoi(count)
	if err != nil || value < 1 {
		return -1
	}
	return value
}

func isCompoundAssignment(operator string) bool {
	switch operator {
	case "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=", "&^=":
		return true
	default:
		return false
	}
}

func isAssignmentOperator(operator string) bool {
	return operator == "=" || operator == ":=" || isCompoundAssignment(operator)
}

func safeIntegerConversion(operation compilercontract.Operation, types map[compilercontract.TypeID]compilercontract.TypeInfo) bool {
	if len(operation.Children) != 2 {
		return false
	}
	value, ok := integerConstant(operation.Children[1])
	if !ok {
		return false
	}
	minimum, maximum, ok := safeIntegerRange(types[operation.TypeID])
	return ok && value.Cmp(minimum) >= 0 && value.Cmp(maximum) <= 0
}

func invalidateTargetGuards(guards map[string]string, target compilercontract.Operation) map[string]string {
	key := expressionKey(target)
	result := cloneGuards(guards)
	if key == "" {
		return result
	}
	for guarded := range result {
		if guarded == key || strings.HasPrefix(guarded, key+".") || strings.HasPrefix(guarded, key+"[") {
			delete(result, guarded)
		}
	}
	return result
}

func arithmeticOperator(operator string) bool {
	switch operator {
	case "+", "-", "*", "/", "%":
		return true
	default:
		return false
	}
}

func isIntegerType(info compilercontract.TypeInfo) bool {
	return info.Kind == compilercontract.KindInt || info.Kind == compilercontract.KindUint
}

func messageShape(types []compilercontract.TypeInfo, id compilercontract.TypeID) bool {
	info, ok := typeInfoByID(types, id)
	if !ok || info.Kind != compilercontract.KindStruct {
		return false
	}
	return structFieldType(types, info, "Name") == "string" && structFieldType(types, info, "Arg") == "string"
}

func effectSliceShape(types []compilercontract.TypeInfo, id compilercontract.TypeID) bool {
	info, ok := typeInfoByID(types, id)
	if !ok || info.Kind != compilercontract.KindSlice {
		return false
	}
	effect, ok := typeInfoByID(types, info.ElemType)
	if !ok || effect.Kind != compilercontract.KindStruct {
		return false
	}
	return strings.HasSuffix(string(effect.ID), ".Effect") && structFieldType(types, effect, "Kind") == "string" &&
		structFieldType(types, effect, "Name") == "string" && structFieldType(types, effect, "Arg") == "string" && structFieldType(types, effect, "Reply") == "string"
}

func viewShape(types []compilercontract.TypeInfo, id compilercontract.TypeID) bool {
	info, ok := typeInfoByID(types, id)
	if !ok || info.Kind != compilercontract.KindStruct {
		return false
	}
	name := string(info.ID)
	return strings.HasSuffix(name, ".Node") || name == "github.com/samuelpmahan/gondola/compilercontract.View"
}

func typeIs(types []compilercontract.TypeInfo, id compilercontract.TypeID, kind compilercontract.TypeKind) bool {
	info, ok := typeInfoByID(types, id)
	return ok && info.Kind == kind
}

func structFieldType(types []compilercontract.TypeInfo, info compilercontract.TypeInfo, name string) compilercontract.TypeID {
	for _, field := range info.Fields {
		if field.Name == name {
			return field.Type
		}
	}
	return ""
}

func firstType(types []compilercontract.TypeID) compilercontract.TypeID {
	if len(types) == 0 {
		return ""
	}
	return types[0]
}

func deriveCapabilities(types []compilercontract.TypeInfo, reachable []compilercontract.TypedFunction, stateType compilercontract.TypeID, view compilercontract.SymbolID, updateReachable []compilercontract.TypedFunction, effectType compilercontract.TypeID) []compilercontract.Capability {
	capabilities := []compilercontract.Capability{compilercontract.CapabilityViewNode}
	seen := map[compilercontract.Capability]bool{compilercontract.CapabilityViewNode: true}
	add := func(capability compilercontract.Capability) {
		if !seen[capability] {
			capabilities = append(capabilities, capability)
			seen[capability] = true
		}
	}
	typeMap := make(map[compilercontract.TypeID]compilercontract.TypeInfo, len(types))
	for _, info := range types {
		typeMap[info.ID] = info
	}
	visitedTypes := map[compilercontract.TypeID]bool{}
	var walkType func(compilercontract.TypeID)
	walkType = func(id compilercontract.TypeID) {
		if visitedTypes[id] {
			return
		}
		visitedTypes[id] = true
		info, ok := typeMap[id]
		if !ok {
			return
		}
		switch info.Kind {
		case compilercontract.KindInt, compilercontract.KindUint:
			add(compilercontract.CapabilitySafeInteger)
		case compilercontract.KindFloat64:
			add(compilercontract.CapabilityFloat64)
		case compilercontract.KindStruct:
			for _, field := range info.Fields {
				walkType(field.Type)
			}
		case compilercontract.KindSlice, compilercontract.KindArray:
			walkType(info.ElemType)
		}
	}
	walkType(stateType)
	for _, function := range reachable {
		walkOperations(function.Body, func(operation compilercontract.Operation) {
			if (operation.Kind == compilercontract.OpIncDec || (operation.Kind == compilercontract.OpBinary && arithmeticOperator(operation.Operator))) && isIntegerType(typeMap[operation.TypeID]) {
				add(compilercontract.CapabilitySafeInteger)
			}
			if typeMap[operation.TypeID].Kind == compilercontract.KindFloat64 && (operation.Kind == compilercontract.OpBinary || operation.Kind == compilercontract.OpIncDec) {
				add(compilercontract.CapabilityFloat64)
			}
			if function.ID == view && operation.Operator == "TargetValue" {
				add(compilercontract.CapabilityBindingValue)
			}
			if function.ID == view && operation.Operator == "TargetChecked" {
				add(compilercontract.CapabilityBindingChecked)
			}
			if operation.Literal != nil && operation.Literal.String != nil && *operation.Literal.String == string(compilercontract.EffectKindRequest) {
				add(compilercontract.CapabilityEffectRequest)
			}
		})
	}
	if hasLifecycleCancelDescriptor(types, updateReachable, effectType) {
		add(compilercontract.CapabilityEffectCancel)
	}
	return capabilities
}

func updateEffectType(results []compilercontract.TypeID, types []compilercontract.TypeInfo) compilercontract.TypeID {
	if len(results) < 2 {
		return ""
	}
	info, ok := typeInfoByID(types, results[1])
	if !ok || info.Kind != compilercontract.KindSlice {
		return ""
	}
	return info.ElemType
}

// hasLifecycleCancelDescriptor recognizes the keyed Gobi effect descriptor,
// rather than searching source text for the protocol strings. The descriptor
// must be constructed in a function reachable from Update, have the actual
// effect element type, and provide the cancel kind/name, a present string Arg
// expression, and an empty reply. The Arg's payload content is left to runtime
// policy. Non-literal kind/name/reply expressions, positional
// composites, and descriptors returned by opaque external functions fail
// closed. Such code can still emit cancellation at runtime without declaring
// this capability; this static signal does not prove every runtime effect.
func hasLifecycleCancelDescriptor(types []compilercontract.TypeInfo, reachable []compilercontract.TypedFunction, effectType compilercontract.TypeID) bool {
	const gobiEffectType compilercontract.TypeID = "github.com/samuelpmahan/gondola/gobi.Effect"
	if effectType != gobiEffectType {
		return false
	}
	effect, ok := typeInfoByID(types, effectType)
	if !ok || effect.Kind != compilercontract.KindStruct ||
		structFieldType(types, effect, "Kind") != "string" ||
		structFieldType(types, effect, "Name") != "string" ||
		structFieldType(types, effect, "Arg") != "string" ||
		structFieldType(types, effect, "Reply") != "string" {
		return false
	}
	for _, function := range reachable {
		found := false
		walkOperations(function.Body, func(operation compilercontract.Operation) {
			if found || operation.Kind != compilercontract.OpComposite || operation.TypeID != effectType {
				return
			}
			fields := make(map[string]compilercontract.Operation, len(operation.Children))
			for _, child := range operation.Children {
				if child.Kind != compilercontract.OpKeyValue || len(child.Children) != 2 || child.Children[0].Kind != compilercontract.OpIdent {
					continue
				}
				fields[child.Children[0].Operator] = child.Children[1]
			}
			kind, kindOK := literalString(fields["Kind"])
			name, nameOK := literalString(fields["Name"])
			reply, replyOK := literalString(fields["Reply"])
			arg, argOK := fields["Arg"]
			if kindOK && nameOK && replyOK && argOK && isStringType(arg.TypeID, types) &&
				kind == "lifecycle.cancel" && name == "cancel" && reply == "" {
				found = true
			}
		})
		if found {
			return true
		}
	}
	return false
}

func literalString(operation compilercontract.Operation) (string, bool) {
	if operation.Kind != compilercontract.OpLiteral || operation.Literal == nil || operation.Literal.String == nil {
		return "", false
	}
	return *operation.Literal.String, true
}

func isStringType(id compilercontract.TypeID, types []compilercontract.TypeInfo) bool {
	info, ok := typeInfoByID(types, id)
	return ok && info.Kind == compilercontract.KindString
}

func reachableSetContains(functions []compilercontract.TypedFunction, id compilercontract.SymbolID) bool {
	for _, function := range functions {
		if function.ID == id {
			return true
		}
	}
	return false
}
