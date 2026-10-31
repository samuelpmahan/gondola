package analyze

import (
	"fmt"
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"math"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func projectPackage(root string, source *loadedSourcePackage) (compilercontract.TypedPackage, []compilercontract.Diagnostic) {
	collector := newTypeCollector()
	result := compilercontract.TypedPackage{
		ImportPath: source.list.ImportPath,
		Files:      append([]compilercontract.SourceFile{}, source.texts...),
		Types:      []compilercontract.TypeInfo{},
		Functions:  []compilercontract.TypedFunction{},
	}
	diagnostics := packageStateDiagnostics(root, source)
	for _, file := range source.files {
		for _, declaration := range file.Decls {
			function, ok := declaration.(*ast.FuncDecl)
			if !ok || function.Body == nil {
				continue
			}
			if function.Recv == nil && function.Name.Name == "init" {
				continue
			}
			object, _ := source.info.Defs[function.Name].(*types.Func)
			if object == nil {
				diagnostics = append(diagnostics, diagnostic("source.function-object", "could not resolve function declaration", nodeSpan(root, source.fset, function)))
				continue
			}
			if function.Recv != nil && !supportedValueReceiver(object) {
				// Unsupported receiver kinds remain excluded. Direct call sites and
				// method values/expressions are represented as unsupported operations.
				continue
			}
			typedFunction, err := projectFunction(root, source, function, collector)
			if err != nil {
				if function.Recv != nil {
					// A direct call to a method whose typed representation is outside
					// the profile fails as an unresolved call in ValidateOperations.
					continue
				}
				diagnostics = append(diagnostics, diagnostic("source.signature-type", err.Error(), nodeSpan(root, source.fset, function)))
				continue
			}
			result.Functions = append(result.Functions, typedFunction)
		}
	}
	result.Types = collector.list()
	return result, diagnostics
}

func packageStateDiagnostics(root string, source *loadedSourcePackage) []compilercontract.Diagnostic {
	diagnostics := []compilercontract.Diagnostic{}
	for _, file := range source.files {
		for _, declaration := range file.Decls {
			switch value := declaration.(type) {
			case *ast.GenDecl:
				if value.Tok == token.VAR {
					for _, spec := range value.Specs {
						diagnostics = append(diagnostics, diagnostic("source.package-global", "mutable package-level variables are unsupported by the v1 component analyzer", nodeSpan(root, source.fset, spec)))
					}
				}
			case *ast.FuncDecl:
				if value.Recv == nil && value.Name.Name == "init" {
					diagnostics = append(diagnostics, diagnostic("source.init-function", "package init functions are unsupported by the v1 component analyzer", nodeSpan(root, source.fset, value)))
				}
			}
		}
	}
	return diagnostics
}

func projectFunction(root string, source *loadedSourcePackage, function *ast.FuncDecl, collector *typeCollector) (compilercontract.TypedFunction, error) {
	object, _ := source.info.Defs[function.Name].(*types.Func)
	if object == nil {
		return compilercontract.TypedFunction{}, fmt.Errorf("could not resolve function declaration")
	}
	signature, err := projectSignature(object.Type().(*types.Signature), collector)
	if err != nil {
		return compilercontract.TypedFunction{}, err
	}
	if object.Type().(*types.Signature).Recv() != nil {
		if !supportedValueReceiver(object) {
			return compilercontract.TypedFunction{}, fmt.Errorf("unsupported method receiver")
		}
		receiver, err := collector.id(object.Type().(*types.Signature).Recv().Type())
		if err != nil {
			return compilercontract.TypedFunction{}, fmt.Errorf("receiver: %w", err)
		}
		signature.Params = append([]compilercontract.TypeID{receiver}, signature.Params...)
	}
	builder := operationBuilder{root: root, loaded: source, types: collector}
	return compilercontract.TypedFunction{
		ID:          objectSymbol(object),
		PackagePath: source.list.ImportPath,
		Name:        object.Name(),
		Signature:   signature,
		Span:        nodeSpan(root, source.fset, function),
		Body:        []compilercontract.Operation{builder.statement(function.Body)},
	}, nil
}

func supportedValueReceiver(function *types.Func) bool {
	if function == nil || function.Pkg() == nil {
		return false
	}
	signature, ok := function.Type().(*types.Signature)
	if !ok || signature.Recv() == nil || (signature.TypeParams() != nil && signature.TypeParams().Len() != 0) {
		return false
	}
	receiver := types.Unalias(signature.Recv().Type())
	if _, pointer := receiver.(*types.Pointer); pointer {
		return false
	}
	named, ok := receiver.(*types.Named)
	if !ok || named.Obj() == nil || named.Obj().Pkg() == nil || named.Obj().Pkg().Path() != function.Pkg().Path() {
		return false
	}
	if named.TypeParams() != nil && named.TypeParams().Len() != 0 {
		return false
	}
	if named.TypeArgs() != nil && named.TypeArgs().Len() != 0 {
		return false
	}
	return true
}

func projectSignature(signature *types.Signature, collector *typeCollector) (compilercontract.Signature, error) {
	result := compilercontract.Signature{Params: []compilercontract.TypeID{}, Results: []compilercontract.TypeID{}}
	if signature.Params() != nil {
		for i := 0; i < signature.Params().Len(); i++ {
			id, err := collector.id(signature.Params().At(i).Type())
			if err != nil {
				return compilercontract.Signature{}, fmt.Errorf("parameter %d: %w", i, err)
			}
			result.Params = append(result.Params, id)
		}
	}
	if signature.Results() != nil {
		for i := 0; i < signature.Results().Len(); i++ {
			id, err := collector.id(signature.Results().At(i).Type())
			if err != nil {
				return compilercontract.Signature{}, fmt.Errorf("result %d: %w", i, err)
			}
			result.Results = append(result.Results, id)
		}
	}
	return result, nil
}

type operationBuilder struct {
	root   string
	loaded *loadedSourcePackage
	types  *typeCollector
}

func (b operationBuilder) statement(node ast.Stmt) compilercontract.Operation {
	if node == nil {
		return compilercontract.Operation{Kind: compilercontract.OpUnsupported, Operator: "missing statement", Children: []compilercontract.Operation{}}
	}
	span := nodeSpan(b.root, b.loaded.fset, node)
	children := []compilercontract.Operation{}
	result := compilercontract.Operation{Span: span, Children: children}
	appendExpr := func(expr ast.Expr) {
		if expr != nil {
			result.Children = append(result.Children, b.expression(expr))
		}
	}
	switch value := node.(type) {
	case *ast.BlockStmt:
		result.Kind = compilercontract.OpBlock
		for _, statement := range value.List {
			result.Children = append(result.Children, b.statement(statement))
		}
	case *ast.DeclStmt:
		result.Kind = compilercontract.OpDecl
		ast.Inspect(value.Decl, func(child ast.Node) bool {
			if expression, ok := child.(ast.Expr); ok {
				if expression == nil {
					return true
				}
				result.Children = append(result.Children, b.expression(expression))
				return false
			}
			return true
		})
	case *ast.AssignStmt:
		result.Kind, result.Operator = compilercontract.OpAssign, assignmentOperator(value.Tok.String(), len(value.Lhs))
		for _, expression := range value.Lhs {
			result.Children = append(result.Children, b.expression(expression))
		}
		for _, expression := range value.Rhs {
			result.Children = append(result.Children, b.expression(expression))
		}
	case *ast.ReturnStmt:
		result.Kind = compilercontract.OpReturn
		for _, expression := range value.Results {
			result.Children = append(result.Children, b.expression(expression))
		}
	case *ast.IfStmt:
		result.Kind = compilercontract.OpIf
		if value.Init != nil {
			result.Operator = "hasInit"
			result.Children = append(result.Children, b.statement(value.Init))
		} else {
			result.Operator = "noInit"
		}
		result.Children = append(result.Children, b.expression(value.Cond), b.statement(value.Body))
		if value.Else != nil {
			result.Children = append(result.Children, b.statement(value.Else))
		}
	case *ast.SwitchStmt:
		result.Kind = compilercontract.OpSwitch
		if value.Init != nil {
			result.Children = append(result.Children, b.statement(value.Init))
		}
		if value.Tag != nil {
			appendExpr(value.Tag)
		}
		for _, statement := range value.Body.List {
			result.Children = append(result.Children, b.statement(statement))
		}
	case *ast.TypeSwitchStmt:
		result.Kind, result.Operator = compilercontract.OpUnsupported, "type switch"
	case *ast.ForStmt:
		result.Kind = compilercontract.OpFor
		if value.Init != nil {
			result.Children = append(result.Children, b.statement(value.Init))
		} else {
			result.Children = append(result.Children, missingOperation(span))
		}
		if value.Cond != nil {
			appendExpr(value.Cond)
		} else {
			result.Children = append(result.Children, missingOperation(span))
		}
		if value.Post != nil {
			result.Children = append(result.Children, b.statement(value.Post))
		} else {
			result.Children = append(result.Children, missingOperation(span))
		}
		result.Children = append(result.Children, b.statement(value.Body))
	case *ast.RangeStmt:
		result.Kind, result.Operator = compilercontract.OpRange, value.Tok.String()
		if value.Key != nil {
			result.Children = append(result.Children, b.expression(value.Key))
		}
		if value.Value != nil {
			result.Children = append(result.Children, b.expression(value.Value))
		}
		result.Children = append(result.Children, b.expression(value.X), b.statement(value.Body))
	case *ast.ExprStmt:
		result.Kind = compilercontract.OpExpr
		appendExpr(value.X)
	case *ast.IncDecStmt:
		result.Kind, result.Operator = compilercontract.OpIncDec, value.Tok.String()
		appendExpr(value.X)
	case *ast.BranchStmt:
		result.Kind, result.Operator = compilercontract.OpBranch, value.Tok.String()
	case *ast.CaseClause:
		result.Kind, result.Operator = compilercontract.OpBranch, "case:"+strconv.Itoa(len(value.List))
		for _, expression := range value.List {
			result.Children = append(result.Children, b.expression(expression))
		}
		for _, statement := range value.Body {
			result.Children = append(result.Children, b.statement(statement))
		}
	case *ast.EmptyStmt:
		result.Kind, result.Operator = compilercontract.OpBranch, "empty"
	default:
		result.Kind, result.Operator = compilercontract.OpUnsupported, fmt.Sprintf("%T", node)
	}
	return result
}

func (b operationBuilder) expression(node ast.Expr) compilercontract.Operation {
	if node == nil {
		return compilercontract.Operation{Kind: compilercontract.OpUnsupported, Operator: "missing expression", Children: []compilercontract.Operation{}}
	}
	result := compilercontract.Operation{Span: nodeSpan(b.root, b.loaded.fset, node), Children: []compilercontract.Operation{}}
	if typed, ok := b.loaded.info.Types[node]; ok && typed.Type != nil {
		t := typed.Type
		if basic, ok := t.Underlying().(*types.Basic); ok && basic.Info()&types.IsUntyped != 0 {
			t = types.Default(t)
		}
		if id, err := b.types.id(t); err == nil {
			result.TypeID = id
		}
	}
	appendExpr := func(expr ast.Expr) {
		if expr != nil {
			result.Children = append(result.Children, b.expression(expr))
		}
	}
	switch value := node.(type) {
	case *ast.BasicLit:
		result.Kind = compilercontract.OpLiteral
		if result.TypeID != "" {
			if literal, err := b.literal(value, result.TypeID); err == nil {
				result.Literal = &literal
			}
		}
	case *ast.Ident:
		result.Kind, result.Operator = compilercontract.OpIdent, value.Name
		if object := b.loaded.info.Uses[value]; object != nil {
			if constantObject, ok := object.(*types.Const); ok {
				if info, found := typeInfoByID(b.types.list(), result.TypeID); found && isIntegerType(info) {
					result.Kind = compilercontract.OpLiteral
					if literal, err := b.literalValue(constantObject.Val(), result.TypeID); err == nil {
						result.Literal = &literal
					}
				}
			} else if _, ok := object.(*types.Var); ok {
				result.SymbolID = b.localObjectSymbol(object)
			} else if target := objectSymbol(object); target != "" {
				result.SymbolID = target
			} else if builtin, ok := object.(*types.Builtin); ok {
				result.SymbolID = compilercontract.SymbolID("builtin." + builtin.Name())
			} else if _, ok := object.(*types.TypeName); ok {
				result.Operator = "type:" + value.Name
			}
		}
	case *ast.BinaryExpr:
		result.Kind, result.Operator = compilercontract.OpBinary, value.Op.String()
		appendExpr(value.X)
		appendExpr(value.Y)
	case *ast.UnaryExpr:
		result.Kind, result.Operator = compilercontract.OpUnary, value.Op.String()
		appendExpr(value.X)
	case *ast.CallExpr:
		if !b.methodCall(value, &result) {
			result.Kind = compilercontract.OpCall
			result.SymbolID = b.callTarget(value.Fun)
			result.Children = append(result.Children, b.expression(value.Fun))
			for _, argument := range value.Args {
				result.Children = append(result.Children, b.expression(argument))
			}
		}
	case *ast.SelectorExpr:
		if selection := b.loaded.info.Selections[value]; selection != nil && selection.Kind() != types.FieldVal {
			result.Kind, result.Operator = compilercontract.OpUnsupported, unsupportedMethodSelectionReason(selection)
			appendExpr(value.X)
			break
		}
		result.Kind, result.Operator = compilercontract.OpSelector, value.Sel.Name
		appendExpr(value.X)
		if selection := b.loaded.info.Selections[value]; selection != nil {
			if target := objectSymbol(selection.Obj()); target != "" {
				result.SymbolID = target
			}
		} else if object := b.loaded.info.Uses[value.Sel]; object != nil {
			result.SymbolID = objectSymbol(object)
		}
	case *ast.IndexExpr:
		result.Kind = compilercontract.OpIndex
		appendExpr(value.X)
		appendExpr(value.Index)
	case *ast.SliceExpr:
		result.Kind = compilercontract.OpIndex
		appendExpr(value.X)
		appendExpr(value.Low)
		appendExpr(value.High)
		appendExpr(value.Max)
	case *ast.CompositeLit:
		result.Kind = compilercontract.OpComposite
		for _, element := range value.Elts {
			result.Children = append(result.Children, b.expression(element))
		}
	case *ast.KeyValueExpr:
		result.Kind = compilercontract.OpKeyValue
		appendExpr(value.Key)
		appendExpr(value.Value)
	case *ast.ParenExpr:
		result.Kind = compilercontract.OpParen
		appendExpr(value.X)
	case *ast.ArrayType:
		result.Kind, result.Operator = compilercontract.OpIdent, "type"
	case *ast.StarExpr:
		result.Kind, result.Operator = compilercontract.OpUnary, "*"
		appendExpr(value.X)
	case *ast.FuncLit, *ast.TypeAssertExpr, *ast.Ellipsis:
		result.Kind, result.Operator = compilercontract.OpUnsupported, fmt.Sprintf("%T", node)
	default:
		result.Kind, result.Operator = compilercontract.OpUnsupported, fmt.Sprintf("%T", node)
	}
	return result
}

func (b operationBuilder) methodCall(call *ast.CallExpr, result *compilercontract.Operation) bool {
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return false
	}
	selection := b.loaded.info.Selections[selector]
	if selection == nil || selection.Kind() == types.FieldVal {
		return false
	}
	function, _ := selection.Obj().(*types.Func)
	if function == nil {
		result.Kind, result.Operator = compilercontract.OpUnsupported, "unresolved method call"
		result.Children = append(result.Children, b.expression(selector.X))
		for _, argument := range call.Args {
			result.Children = append(result.Children, b.expression(argument))
		}
		return true
	}
	target := objectSymbol(function)
	if reason := supportedMethodSelectionReason(selection, function); reason != "" {
		result.Kind, result.Operator = compilercontract.OpUnsupported, reason
		result.Children = append(result.Children, b.expression(selector.X))
		for _, argument := range call.Args {
			result.Children = append(result.Children, b.expression(argument))
		}
		return true
	}
	if isTrustedGobiMethod(function) {
		result.Kind, result.SymbolID = compilercontract.OpCall, target
		result.Children = append(result.Children, b.methodSelectorCallee(selector, target))
		for _, argument := range call.Args {
			result.Children = append(result.Children, b.expression(argument))
		}
		return true
	}
	result.Kind, result.SymbolID = compilercontract.OpCall, target
	result.Children = append(result.Children, b.expression(selector.X))
	for _, argument := range call.Args {
		result.Children = append(result.Children, b.expression(argument))
	}
	return true
}

func (b operationBuilder) methodSelectorCallee(selector *ast.SelectorExpr, target compilercontract.SymbolID) compilercontract.Operation {
	result := compilercontract.Operation{
		Kind: compilercontract.OpSelector, Span: nodeSpan(b.root, b.loaded.fset, selector),
		Operator: selector.Sel.Name, SymbolID: target, Children: []compilercontract.Operation{b.expression(selector.X)},
	}
	if typed, ok := b.loaded.info.Types[selector]; ok && typed.Type != nil {
		if typeID, err := b.types.id(typed.Type); err == nil {
			result.TypeID = typeID
		}
	}
	return result
}

func isTrustedGobiMethod(function *types.Func) bool {
	if function == nil || function.Pkg() == nil || function.Pkg().Path() != "github.com/samuelpmahan/gondola/gobi" {
		return false
	}
	signature, ok := function.Type().(*types.Signature)
	if !ok || signature.Recv() == nil || (signature.TypeParams() != nil && signature.TypeParams().Len() != 0) {
		return false
	}
	receiver, ok := types.Unalias(signature.Recv().Type()).(*types.Named)
	if !ok || receiver.Obj() == nil || receiver.Obj().Name() != "Node" {
		return false
	}
	if params := receiver.TypeParams(); params != nil && params.Len() != 0 {
		return false
	}
	if args := receiver.TypeArgs(); args != nil && args.Len() != 0 {
		return false
	}
	switch function.Name() {
	case "Set", "Flag", "Css", "Keyed", "Handle":
		return true
	default:
		return false
	}
}

func supportedMethodSelectionReason(selection *types.Selection, function *types.Func) string {
	if selection.Kind() == types.MethodExpr {
		return "method expression"
	}
	if selection.Kind() != types.MethodVal {
		return "unsupported method selection"
	}
	if len(selection.Index()) != 1 {
		return "promoted method selection"
	}
	receiver := types.Unalias(selection.Recv())
	if _, pointer := receiver.(*types.Pointer); pointer {
		return "pointer method receiver"
	}
	if _, interfaceType := receiver.Underlying().(*types.Interface); interfaceType {
		return "interface method dispatch"
	}
	if signature, ok := function.Type().(*types.Signature); ok && signature.Recv() != nil {
		if _, pointer := types.Unalias(signature.Recv().Type()).(*types.Pointer); pointer {
			return "pointer method receiver"
		}
	}
	named, ok := receiver.(*types.Named)
	if ok && ((named.TypeArgs() != nil && named.TypeArgs().Len() != 0) || (named.TypeParams() != nil && named.TypeParams().Len() != 0)) {
		return "generic or non-concrete method receiver"
	}
	if selection.Indirect() {
		return "implicit pointer method adaptation"
	}
	if !supportedValueReceiver(function) {
		return "pointer or unsupported method receiver"
	}
	if !ok {
		return "non-concrete method receiver"
	}
	return ""
}

func unsupportedMethodSelectionReason(selection *types.Selection) string {
	if selection.Kind() == types.MethodExpr {
		return "method expression"
	}
	if selection.Kind() == types.MethodVal {
		if len(selection.Index()) != 1 {
			return "promoted method value"
		}
		return "method value"
	}
	return "unsupported method selection"
}

func assignmentOperator(token string, lhsCount int) string {
	return token + "#lhs=" + strconv.Itoa(lhsCount)
}

func (b operationBuilder) localObjectSymbol(object types.Object) compilercontract.SymbolID {
	if object == nil {
		return ""
	}
	position := b.loaded.fset.PositionFor(object.Pos(), false)
	if position.Filename == "" {
		return ""
	}
	relative, err := filepath.Rel(b.root, position.Filename)
	if err != nil || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return ""
	}
	return compilercontract.SymbolID(fmt.Sprintf("local:%s:%d", filepath.ToSlash(relative), position.Offset))
}

func (b operationBuilder) callTarget(expression ast.Expr) compilercontract.SymbolID {
	switch value := expression.(type) {
	case *ast.Ident:
		object := b.loaded.info.Uses[value]
		if object == nil {
			return ""
		}
		if _, ok := object.(*types.Builtin); ok {
			return compilercontract.SymbolID("builtin." + object.Name())
		}
		if _, ok := object.(*types.TypeName); ok {
			return "convert:" + compilercontract.SymbolID(typeIDString(object.Type()))
		}
		return objectSymbol(object)
	case *ast.SelectorExpr:
		if selection := b.loaded.info.Selections[value]; selection != nil {
			return objectSymbol(selection.Obj())
		}
		return objectSymbol(b.loaded.info.Uses[value.Sel])
	default:
		return ""
	}
}

func objectSymbol(object types.Object) compilercontract.SymbolID {
	if object == nil {
		return ""
	}
	function, ok := object.(*types.Func)
	if !ok || function.Pkg() == nil {
		return ""
	}
	if function.Type().(*types.Signature).Recv() != nil {
		if function.Pkg().Path() == "github.com/samuelpmahan/gondola/gobi" {
			return compilercontract.SymbolID(function.Pkg().Path() + "." + function.Name())
		}
		return methodSymbolID(function)
	}
	return compilercontract.SymbolID(function.Pkg().Path() + "." + function.Name())
}

func methodSymbolID(function *types.Func) compilercontract.SymbolID {
	if function == nil || function.Pkg() == nil {
		return ""
	}
	signature, ok := function.Type().(*types.Signature)
	if !ok || signature.Recv() == nil {
		return compilercontract.SymbolID(function.Pkg().Path() + "." + function.Name())
	}
	receiver := types.Unalias(signature.Recv().Type())
	if pointer, ok := receiver.(*types.Pointer); ok {
		receiver = types.Unalias(pointer.Elem())
	}
	named, ok := receiver.(*types.Named)
	if !ok || named.Obj() == nil || named.Obj().Pkg() == nil {
		return compilercontract.SymbolID(function.Pkg().Path() + ".method." + function.Name())
	}
	return compilercontract.SymbolID(named.Obj().Pkg().Path() + "." + named.Obj().Name() + "." + function.Name())
}

func typeIDString(t types.Type) string {
	c := newTypeCollector()
	if basic, ok := t.Underlying().(*types.Basic); ok && basic.Info()&types.IsUntyped != 0 {
		t = types.Default(t)
	}
	id, err := c.id(t)
	if err != nil {
		return "unsupported"
	}
	return string(id)
}

func (b operationBuilder) literal(literal *ast.BasicLit, typeID compilercontract.TypeID) (compilercontract.Value, error) {
	typed := b.loaded.info.Types[literal]
	if typed.Value == nil {
		return compilercontract.Value{}, fmt.Errorf("literal is not a compile-time constant")
	}
	return b.literalValue(typed.Value, typeID)
}

func (b operationBuilder) literalValue(constantValue constant.Value, typeID compilercontract.TypeID) (compilercontract.Value, error) {
	info, ok := typeInfoByID(b.types.list(), typeID)
	if !ok {
		return compilercontract.Value{}, fmt.Errorf("missing literal type metadata")
	}
	value := compilercontract.Value{TypeID: typeID, Kind: info.Kind}
	switch info.Kind {
	case compilercontract.KindBool:
		v := constant.BoolVal(constantValue)
		value.Bool = &v
	case compilercontract.KindString:
		v := constant.StringVal(constantValue)
		value.String = &v
	case compilercontract.KindInt:
		text := constant.ToInt(constantValue).ExactString()
		value.Integer = &text
	case compilercontract.KindUint:
		text := constant.ToInt(constantValue).ExactString()
		value.Integer = &text
	case compilercontract.KindFloat64:
		v, _ := constant.Float64Val(constantValue)
		text := fmt.Sprintf("%016x", math.Float64bits(v))
		value.Float64Bits = &text
	default:
		return compilercontract.Value{}, fmt.Errorf("unsupported literal type %q", info.Kind)
	}
	if err := compilercontract.ValidateValue(value, b.types.list()); err != nil {
		return compilercontract.Value{}, err
	}
	return value, nil
}

func typeInfoByID(types []compilercontract.TypeInfo, id compilercontract.TypeID) (compilercontract.TypeInfo, bool) {
	for _, info := range types {
		if info.ID == id {
			return info, true
		}
	}
	return compilercontract.TypeInfo{}, false
}

func missingOperation(span compilercontract.Span) compilercontract.Operation {
	return compilercontract.Operation{Kind: compilercontract.OpUnsupported, Span: span, Operator: "missing clause", Children: []compilercontract.Operation{}}
}

func nodeSpan(root string, fset *token.FileSet, node ast.Node) compilercontract.Span {
	start := fset.PositionFor(node.Pos(), false)
	end := fset.PositionFor(node.End(), false)
	path := start.Filename
	if rel, err := filepath.Rel(root, path); err == nil && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		path = filepath.ToSlash(rel)
	}
	return compilercontract.Span{File: filepath.ToSlash(path), StartByte: start.Offset, EndByte: end.Offset}
}
