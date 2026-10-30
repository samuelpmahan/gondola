# Compiled frontend v1 contract

Status: frozen API snapshot for lane integration. Root package is github.com/samuelpmahan/gondola/compilercontract and must compile with Go 1.24. The nested compiler module imports it through replace-to-parent; root code never imports the Go 1.27 compiler module.

All contract JSON uses lowerCamel fields and closed objects: exact keys only, required keys remain present when null or empty, and array/string order and content are preserved. Source spans use source-root-relative slash paths and UTF-8 byte offsets [startByte,endByte), zero-based and end-exclusive. Unknown versions, fields, capabilities, operations, and enum values fail closed.

## Root Go API

    const AppIRSchema = "gobi.app-ir/v1"
    const BuildRequestSchema = "gobi.build-request/v1"
    const BuildResultSchema = "gobi.build-result/v1"
    const TraceSchema = "gobi.trace/v1"
    const HostScriptSchema = "gobi.host-script/v1"

    type SymbolID string
    type TypeID string
    type Span struct { File string; StartByte, EndByte int }
    type Diagnostic struct { Code, Severity, Message string; Span Span; Related []Span }
    type Signature struct { Params, Results []TypeID }
    type Symbol struct { ID SymbolID; PackagePath, Name string; Signature Signature; Span Span; Calls []SymbolID }
    type Component struct { ID, PackagePath string; StateType, MessageType TypeID; Init, Update, View SymbolID; Capabilities []Capability }
    type AppIR struct { Schema, PackagePath string; Components []Component; Symbols []Symbol; Types []TypeInfo }
    type TypeInfo struct { ID TypeID; Kind TypeKind; Bits uint8; ElemType TypeID; Length *int; Fields []TypeField; JSRepresentation JSRepresentation }
    type TypeField struct { Name string; Type TypeID }
    type View struct { Tree gobi.Node; Bindings []Binding }
    type Binding struct { Path, Event, Message string; Source BindingSource }
    func NewView(tree gobi.Node, bindings ...Binding) View
    type NodeRecord struct { Kind gobi.Kind; Tag, Key string; Attrs []AttrRecord; On []HandlerRecord; Kids []NodeRecord; Text string }
    func NodeRecordFromGobi(node gobi.Node) NodeRecord
    func ViewRecordFromView(view View) ViewRecord
    func EncodeValue(value any, typeID TypeID, types []TypeInfo) (Value, error)
    func DecodeValueJSON(data []byte, types []TypeInfo) (Value, error)
    func GenerateValueEncoder(types []TypeInfo) (string, error)
    func ValidateValue(value Value, types []TypeInfo) error
    func ValidateAppIR(app AppIR) []Diagnostic

JSON forms:
- Span: {file,startByte,endByte}
- Signature: {params,results}, ordered type IDs.
- Symbol: {id,packagePath,name,signature,span,calls}
- Component: {id,packagePath,stateType,messageType,init,update,view,capabilities}
- AppIR: {schema,packagePath,components,symbols,types}
- View: {tree,bindings}; runtime Go and emitted-JS fields are exactly Tree and Bindings. It wraps the unchanged gobi.Node; it does not edit gobi.Node, gobi.Message, or gobi.Effect. Wire tree fields are lowerCamel and map one-for-one to the unchanged Gobi fields.

TypeInfo.Kind is bool|string|int|uint|float64|struct|slice|array. Bits is present only for int/uint and must be 8,16,32,64. ElemType is required for slice/array; Length only for array; Fields only for struct and follow Go declaration order. Pointers, maps, interfaces, complex, function, channel, and unsafe values are unsupported, never coerced.

Value JSON is a tagged union with required typeId and kind, plus exactly one payload:
- kind bool: bool
- string: string
- int or uint: integer as an exact base-10 string
- float64: float64Bits as 16 lower-case hex digits containing IEEE-754 binary64 bits
- slice or array: items array; slices also require isNil
- struct: fields array of ordered {name,value}
Nil slice is {isNil:true,items:[]}; empty non-nil slice is {isNil:false,items:[]}. Arrays have no isNil. Only finite float64 values are supported; negative zero is 8000000000000000. Integer state encoding preserves the full declared Go width exactly as decimal text when the probed representation is BigInt. The executable v1 numeric profile conservatively requires Number-backed integer values and integer operations to remain in signed safe range [-9007199254740991,9007199254740991] (unsigned [0,9007199254740991]) and not overflow; out-of-profile values and operations fail with source-located diagnostics. GoScript emits explicit int64/uint64 as BigInt and int/uint and narrower integers as Number. The generated and native encoders preserve BigInt integers at full declared width; Number-backed integers must be safe integers and in the declared Go range, and the native encoder rejects tagged/decoded Number values outside the same safe range. Neither encoder converts an imprecise Number to decimal. Non-finite floats, bitwise operations, and unsupported builtins/library operations fail closed.

Final AppIR TypeInfo includes jsRepresentation from the actual N1 ABI probe. Its closed values are direct, bigint, number, class, array, float64-array, goscript-slice, array-or-goscript-slice, and float64-array-or-goscript-slice. bool/string use direct; explicit int64/uint64 use bigint; int, uint, 8/16/32-bit integers, byte, and rune use number; float64 uses number; structs use class; arrays use array. Slice types use array-or-goscript-slice for ordinary elements and float64-array-or-goscript-slice for float64 elements. A source-specific GoScript value such as Gobi Node Attrs/On may use goscript-slice where the observed source operation proves that exact shape. The GoSlice wrapper has own data fields backing, offset, length, capacity, target (undefined); its backing is an Array or Float64Array as selected by the element type. An absent or unprobed representation cannot be emitted into a successful build.

Binding.Source is target.value or target.checked. Binding.Path is slash-separated zero-based child indexes from the view root. Binding messages are declared by the component. A binding cannot duplicate a literal handler at the same path/event. target.checked maps exact booleans to "true"/"false"; gobi.On.Arg always remains a literal.

## Compiler-neutral semantic input and analyzer

TypedProgram is built from Go source AST plus go/types metadata, independently of goscript. goscript v0.6.2 does not expose a public typed-symbol or call-graph model; its public CompilationResult is used only for emitted/copied/original file lists, diagnostics, and actual generated JavaScript. Neither root package imports goscript.

    type TypedProgram struct { Packages []TypedPackage }
    type TypedPackage struct { ImportPath string; Files []SourceFile; Types []TypeInfo; Functions []TypedFunction }
    type SourceFile struct { Path, Source string }
    type TypedFunction struct { ID SymbolID; PackagePath, Name string; Signature Signature; Span Span; Body []Operation }
    type Operation struct { Kind OperationKind; Span Span; TypeID TypeID; SymbolID SymbolID; Operator string; Literal *Value; Children []Operation }
    type AnalyzeOptions struct { EntryPackages []string }
    type AnalysisResult struct { Apps []AppIR; Diagnostics []Diagnostic }

    func analyze.LoadSources(sourceRoot string, entryPackages []string) (TypedProgram, []Diagnostic)
    func analyze.Analyze(program TypedProgram, opts AnalyzeOptions) AnalysisResult
    func analyze.ValidateOperations(program TypedProgram, roots []SymbolID) []Diagnostic

Operation children preserve source/evaluation order and every operation has a source span. OperationKind is a closed enum in compiled-frontend/analyze. For assignment operations emitted by LoadSources, Operator is the Go assignment token followed by `#lhs=N`, where N is the number of left-hand expressions; this preserves the source split needed for mutation invalidation. Unsupported semantic nodes must be represented as unsupported with their original span, not dropped. Analyze discovers only package-level Init/Update/View triples, checks exact function signatures and reachable helper calls, and returns source-located diagnostics. AppIR symbols include reachable helpers and ordered call references. Capability enum is exactly view.node, binding.value, binding.checked, effect.request-reply, numeric.safe-integer, numeric.float64.

Integer validation is deliberately narrow. A runtime integer `+ 1` or `++` requires a true-branch upper guard within the declared Go type and safe-number limit; `- 1` or `--` requires a corresponding lower guard. The only multiplication accepted is `len(slice-or-array) * 2` used as a `make` capacity, where the probed JS backing length is bounded and the result fits the output integer type. Integer compound assignments are rejected because v1 does not prove both operands and the resulting range. Runtime integer conversions are rejected unless the argument is a compile-time integer constant that fits both the safe range and target Go type. Numeric constant identifiers are projected as literal operations and receive the same checks as numeric literals. `&&` may combine guard facts; true-side facts do not flow through `else` or after the `if`, writes invalidate facts for the written local/field path, and switch case expressions are not treated as conjunctive guards. `LoadSources` assigns each local variable a source-position identity so a same-named shadow cannot reuse a guard. Mutable package-level variables and `init` functions in an entry package are rejected. This is a bounded validator for the accepted profile, not a general Go range-analysis proof; initialization effects in imported dependency packages are not analyzed by v1.

## Generated JavaScript ABI and build API

The generated module exports exactly the runtime object gobiCompiled with shape:
    {schema:"gobi.compiled-module/v1", appIR:AppIR, symbols:{[symbolID]:compiledFunction}}
Each exported symbols entry corresponds to an AppIR component role ID (Init/Update/View) and is the actual goscript-emitted function or a transparent value-semantics adapter, never a handwritten application reducer. Internal reachable helpers remain in AppIR for source/call-graph evidence and are linked normally inside emitted code; they need not be exported by gobiCompiled.symbols. Init() returns state; Update(state,{Name,Arg}) returns [nextState,effects] where each effect keeps {Kind,Name,Arg,Reply}; View(state) returns unchanged gobi.Node data or {Tree,Bindings}. The Update adapter calls the emitted GoScript struct clone() on its state argument before calling the raw emitted Update. The pinned probe demonstrates that clone() recursively copies nested structs and arrays while preserving slice backing references. This corrects the emitted function's mutation of its State argument at the ABI boundary, not by normalizing trace snapshots. AppIR role IDs select exact functions. Backend API is Emit(AppIR) ([]gobi.File,error); this React profile does not claim arbitrary Go or complete goscript IR support.

GenerateValueEncoder(types) emits one JavaScript module exporting gobiEncodeState(value,typeId). Its recursive descriptors are generated only from AppIR.Types and the field/array/null representation confirmed by N1's actual pinned-goscript probe. The encoder returns the same tagged Value JSON union as EncodeValue, preserves declared Go integer width through BigInt-to-decimal conversion, checks finite float constraints, and rejects missing/extra fields or unsupported runtime shapes. It is a state encoder, not a state transition or application reducer.

The pinned probe confirms generated structs are classes with exported Go field names and an own __goStructValue marker. int64/uint64 fields are BigInt; int/uint and narrower integer fields are Number; bool/string are primitives. State slices of ordinary types are native Arrays and float64 slices are Float64Array before append/reallocation. Appending/reallocating any probed slice can produce a GoSlice wrapper; float64 uses Float64Array backing and other observed element types use Array backing. Fixed arrays are native Arrays. Nil slices are null and empty non-nil slices are distinct empty arrays/Float64Arrays. Float64 negative zero remains Object.is(value,-0), with bits 8000000000000000. Imported Gobi Node Attrs/On were observed as goscript $.Slice wrappers with backing/offset/length/capacity; Kids is a native Array. The codec branches by exact AppIR jsRepresentation and permits only the verified marker/wrapper shape; it must not treat all slices as JS arrays.

BuildRequest JSON is exactly {schema,sourceRoot,entryPackages,backend,outputDir}. All are required; backend is only react. The CLI consumes one request JSON object on stdin and writes one BuildResult on stdout. BuildResult JSON is {schema,ok,apps,outputs,diagnostics,preservedPreviousOutput}; Output is {path,sha256,bytes}. Errors go to stderr. A failed request has ok:false even if prior output remains on disk; a failed attempt is never reported as success. Diagnostics are ordered by source path, start byte, then code.

## Trace and deterministic host script

    type Trace struct { Schema, AppID string; Ticks []Tick }
    type Action struct { Path, Event, Value string }
    type MessageValue struct { Name, Arg string }
    type EffectValue struct { Kind, Name, Arg, Reply string }
    const EffectKindRequest = "fixture.request"
    type EffectRequest struct { DispatchID string; EffectIndex uint64; Effect EffectValue }
    type EffectCompletion struct { DispatchID string; EffectIndex uint64; Message MessageValue }
    type Tick struct { Index uint64; Action *Action; Message *MessageValue; DispatchID *string; State Value; RequestedEffects []EffectRequest; CompletedEffects []EffectCompletion; View ViewRecord; DOM *DOMSnapshot }
    type ViewRecord struct { Tree NodeRecord; Bindings []Binding }
    type HostScript struct { Schema string; Steps []HostStep }
    type HostStep struct { Request EffectRequest; Completion *MessageValue }
    func NewTrace(appID string) Trace
    func AppendTick(trace *Trace, tick Tick) error
    func ValidateTrace(trace Trace, app AppIR) []Diagnostic
    func ValidateHostScript(script HostScript, requests []EffectRequest, completions []EffectCompletion) []Diagnostic

All trace JSON uses lowerCamel. Tick 0 is init with action, message, dispatchId null. Each attempted user action gets a tick; suppressed/no-dispatch actions retain their action and null message/dispatchId. Every actual Update call, including a host reply, has a unique dispatchId of dispatch-0001, dispatch-0002, and so on, counting actual calls only. A reply tick has action:null and its delivered message; CompletedEffects links it to the originating request by dispatchId/effectIndex. Every tick records type-aware state, ordered requested/completed effects, view tree/bindings, and dom:null for native traces. Trace ticks, requestedEffects, completedEffects, view bindings, DOM controls, and HostScript steps are always non-null arrays (use [] when empty). Nil-versus-empty distinction is preserved for canonical Value slices and raw Gobi Node slices only.

Browser DOM JSON is {normalization:"outerHTML-v1",html,controls}; html is the mounted app root element's outerHTML (not the host container innerHTML). Ordered controls are a separate live-DOM walk and have {path,key,tag,type,value,checked,disabled}, where value/checked/disabled are sampled from physical DOM properties. Required protocol arrays are always serialized as non-null arrays, including [] when empty. Only canonical Value slices and raw Gobi Node slices preserve null versus []. Trace.Action records attempted script intent exactly, even when the action is suppressed or its value differs from the physical target property. The independently captured Message records the exact dispatched message; DOM controls record physical live properties. The browser adapter associates each requested action generically with the observed dispatch or no-op and does not rewrite action intent from the handler or DOM.

The only v1 effect Kind is fixture.request (fixture Name lookup, Reply complete); other kinds, including transport/network kinds, are rejected. HostScript Steps list exact ordered effect requests and either the exact completion message or completion:null for fire-and-forget. Validation rejects missing, extra, reordered, or mismatched requests/completions. Runtime commits state and view before completing a request, delivers each completion once, and fences stale/unmounted callbacks. Native replay calls actual Go fixtures directly; direct-JS replay calls emitted functions without runtime dispatch; browser replay uses the generic runtime. All emit this Trace schema via independent adapters.
