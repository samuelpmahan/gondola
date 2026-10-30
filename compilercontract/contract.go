// Package compilercontract defines the Go 1.24 boundary between source
// analysis, compiled app functions, generic renderers, and replay tooling.
package compilercontract

import "github.com/samuelpmahan/gondola/gobi"

const (
	AppIRSchema          = "gobi.app-ir/v1"
	BuildRequestSchema   = "gobi.build-request/v1"
	BuildResultSchema    = "gobi.build-result/v1"
	TraceSchema          = "gobi.trace/v1"
	HostScriptSchema     = "gobi.host-script/v1"
	CompiledModuleSchema = "gobi.compiled-module/v1"
)

type SymbolID string
type TypeID string

type Span struct {
	File      string `json:"file"`
	StartByte int    `json:"startByte"`
	EndByte   int    `json:"endByte"`
}

type Diagnostic struct {
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
	Span     Span   `json:"span"`
	Related  []Span `json:"related"`
}

type Signature struct {
	Params  []TypeID `json:"params"`
	Results []TypeID `json:"results"`
}

type Symbol struct {
	ID          SymbolID   `json:"id"`
	PackagePath string     `json:"packagePath"`
	Name        string     `json:"name"`
	Signature   Signature  `json:"signature"`
	Span        Span       `json:"span"`
	Calls       []SymbolID `json:"calls"`
}

type Component struct {
	ID           string       `json:"id"`
	PackagePath  string       `json:"packagePath"`
	StateType    TypeID       `json:"stateType"`
	MessageType  TypeID       `json:"messageType"`
	Init         SymbolID     `json:"init"`
	Update       SymbolID     `json:"update"`
	View         SymbolID     `json:"view"`
	Capabilities []Capability `json:"capabilities"`
}

type AppIR struct {
	Schema      string      `json:"schema"`
	PackagePath string      `json:"packagePath"`
	Components  []Component `json:"components"`
	Symbols     []Symbol    `json:"symbols"`
	Types       []TypeInfo  `json:"types"`
}

type TypeKind string

const (
	KindBool    TypeKind = "bool"
	KindString  TypeKind = "string"
	KindInt     TypeKind = "int"
	KindUint    TypeKind = "uint"
	KindFloat64 TypeKind = "float64"
	KindStruct  TypeKind = "struct"
	KindSlice   TypeKind = "slice"
	KindArray   TypeKind = "array"
)

type TypeInfo struct {
	ID               TypeID           `json:"id"`
	Kind             TypeKind         `json:"kind"`
	Bits             uint8            `json:"bits,omitempty"`
	ElemType         TypeID           `json:"elemType,omitempty"`
	Length           *int             `json:"length,omitempty"`
	Fields           []TypeField      `json:"fields,omitempty"`
	JSRepresentation JSRepresentation `json:"jsRepresentation,omitempty"`
}

type JSRepresentation string

const (
	JSDirect              JSRepresentation = "direct"
	JSBigInt              JSRepresentation = "bigint"
	JSNumber              JSRepresentation = "number"
	JSClass               JSRepresentation = "class"
	JSArray               JSRepresentation = "array"
	JSFloat64Array        JSRepresentation = "float64-array"
	JSSliceWrapper        JSRepresentation = "goscript-slice"
	JSArrayOrSlice        JSRepresentation = "array-or-goscript-slice"
	JSFloat64ArrayOrSlice JSRepresentation = "float64-array-or-goscript-slice"
)

type TypeField struct {
	Name string `json:"name"`
	Type TypeID `json:"type"`
}

type Capability string

const (
	CapabilityViewNode       Capability = "view.node"
	CapabilityBindingValue   Capability = "binding.value"
	CapabilityBindingChecked Capability = "binding.checked"
	CapabilityEffectRequest  Capability = "effect.request-reply"
	CapabilitySafeInteger    Capability = "numeric.safe-integer"
	CapabilityFloat64        Capability = "numeric.float64"
)

type BindingSource string

const (
	TargetValue   BindingSource = "target.value"
	TargetChecked BindingSource = "target.checked"
)

type Binding struct {
	Path    string        `json:"path"`
	Event   string        `json:"event"`
	Message string        `json:"message"`
	Source  BindingSource `json:"source"`
}

// View keeps explicit dynamic input bindings next to an unchanged Gobi tree.
// The Go and compiled-JS field names are Tree and Bindings.
type View struct {
	Tree     gobi.Node `json:"-"`
	Bindings []Binding `json:"-"`
}

type SourceFile struct {
	Path   string `json:"path"`
	Source string `json:"source"`
}

type OperationKind string

const (
	OpUnsupported OperationKind = "unsupported"
	OpBlock       OperationKind = "block"
	OpDecl        OperationKind = "decl"
	OpAssign      OperationKind = "assign"
	OpReturn      OperationKind = "return"
	OpIf          OperationKind = "if"
	OpSwitch      OperationKind = "switch"
	OpFor         OperationKind = "for"
	OpRange       OperationKind = "range"
	OpExpr        OperationKind = "expr"
	OpIncDec      OperationKind = "incDec"
	OpLiteral     OperationKind = "literal"
	OpIdent       OperationKind = "ident"
	OpBinary      OperationKind = "binary"
	OpUnary       OperationKind = "unary"
	OpCall        OperationKind = "call"
	OpSelector    OperationKind = "selector"
	OpIndex       OperationKind = "index"
	OpComposite   OperationKind = "composite"
	OpKeyValue    OperationKind = "keyValue"
	OpParen       OperationKind = "paren"
	OpBranch      OperationKind = "branch"
)

type TypedProgram struct {
	Packages []TypedPackage `json:"packages"`
}

type TypedPackage struct {
	ImportPath string          `json:"importPath"`
	Files      []SourceFile    `json:"files"`
	Types      []TypeInfo      `json:"types"`
	Functions  []TypedFunction `json:"functions"`
}

type TypedFunction struct {
	ID          SymbolID    `json:"id"`
	PackagePath string      `json:"packagePath"`
	Name        string      `json:"name"`
	Signature   Signature   `json:"signature"`
	Span        Span        `json:"span"`
	Body        []Operation `json:"body"`
}

type Operation struct {
	Kind     OperationKind `json:"kind"`
	Span     Span          `json:"span"`
	TypeID   TypeID        `json:"typeId,omitempty"`
	SymbolID SymbolID      `json:"symbolId,omitempty"`
	Operator string        `json:"operator,omitempty"`
	Literal  *Value        `json:"literal,omitempty"`
	Children []Operation   `json:"children"`
}

type AnalyzeOptions struct {
	EntryPackages []string `json:"entryPackages"`
}

type AnalysisResult struct {
	Apps        []AppIR      `json:"apps"`
	Diagnostics []Diagnostic `json:"diagnostics"`
}

type BuildRequest struct {
	Schema        string   `json:"schema"`
	SourceRoot    string   `json:"sourceRoot"`
	EntryPackages []string `json:"entryPackages"`
	Backend       string   `json:"backend"`
	OutputDir     string   `json:"outputDir"`
}

type OutputFile struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}

type BuildResult struct {
	Schema                  string       `json:"schema"`
	OK                      bool         `json:"ok"`
	Apps                    []AppIR      `json:"apps"`
	Outputs                 []OutputFile `json:"outputs"`
	Diagnostics             []Diagnostic `json:"diagnostics"`
	PreservedPreviousOutput bool         `json:"preservedPreviousOutput"`
}
