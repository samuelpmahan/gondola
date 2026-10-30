# Pinned GoScript ABI findings

Status: the actual pinned compiler was exercised on the unchanged counter source and on an isolated ABI fixture. This is a bounded compiler/runtime observation, not an application build or browser conformance claim.

## Toolchain and public surface

- `github.com/s4wave/goscript` v0.6.2 resolves to commit `d8f58a091947cff26a9171be7bd130892b0afad3` (`refs/tags/v0.6.2`), verified from the cached Go module origin record in `toolchain/probe_counter/results/module-origin.json`.
- Go 1.27.3, Node 22.23.4, and esbuild 0.28.2 were used. The nested module pins GoScript in `go.mod`/`go.sum`; the existing interaction esbuild install was used for the probe.
- Public compiler entry points are `compiler.NewCompiler(&compiler.Config{Dir, OutputPath}, nil, nil)` and `(*Compiler).CompilePackages(ctx, patterns...)`. `CompilationResult` exposes compiled/copied package paths, diagnostics, and optional async report. `SemanticModel` is exported, but its symbol/type/function maps and semantic records are private; there is no public symbol/type/call metadata API. The frontend therefore obtains its neutral typed input from source AST and `go/types`, as specified by the contract, and treats GoScript as the actual TypeScript lowering stage.
- The repository’s `PORTING.md` reference is dangling; no such file exists in the checkout. This probe does not infer undocumented support from that reference.

## Counter exports and state boundary

The unchanged `counter/counter.go` compiled successfully. `counter/index.ts` exports exactly `Init`, `State`, `Update`, and `View`. Generated signatures observed in `counter.gs.ts`:

```text
Init(): State
Update(s: State, m: gobi.Message): [State, $.Slice<gobi.Effect>]
View(s: State): gobi.Node
```

`Update` returns `[s, null]` for the counter’s no-effect path. Calling this raw emitted export directly from Node mutates the caller’s `State` object (`Count` becomes 1 and the returned state is the same object). Treating that raw export as a Go value boundary is incorrect.

The probe compiled a Go forwarding adapter with the pinned compiler. Its emitted function calls `counter.Update((state).clone(), message)`. Node verified the caller’s counter stays at 0, the returned counter is 1, and the two objects differ. A second forwarding function proved `Snapshot.clone()` recursively clones nested structs and fixed arrays while preserving slice backing: nested struct and array edits do not affect the caller, and an element edit on a slice of structs is shared. A separate `append` case starts from a one-element `[]Inner` with no spare capacity, appends a second element, then edits the first returned element. The caller remains length 1 with count 13; the returned slice is a `GoSlice` wrapper with `backing`, `offset`, `length`, `capacity`, and `target`, length 2, and counts 113 and 15. For `[]float64`, an element edit is shared; appending changes the returned length from 3 to 4 while the caller’s length stays 3. The app ABI must expose the generated forwarding facade for `Update`; the raw generated application export is not suitable for direct dispatch.

## Runtime values observed

The isolated fixture generated a struct with bool, string, signed/unsigned integer, float64, nested struct, array, and six slice element types. Observed output:

- Go struct fields are enumerable properties using their declared Go field names. Generated struct instances also carry own enumerable, writable, configurable `__goStructValue: true`; `clone` is a prototype method, not an own property. The generated encoder must allow this known compiler marker while checking the declared Go fields.
- Scalar JavaScript representations observed: `int`, `int8`, `int16`, `int32`, `uint`, `uint8`, `uint16`, `uint32`, `byte`, and `rune` are `number`; `int64` and `uint64` are `bigint`. The probe observed `-9n` and `42n` for the latter. Number-backed integer execution must stay in the contract’s safe range and within the declared Go width.
- `[2]Inner` is a native JavaScript array of `Inner` objects; cloning a containing struct creates independent array/Inner values.
- Before append/reallocation, `[]float64` is a `Float64Array`; `[]int`, `[]uint64`, `[]string`, `[]bool`, and `[]Inner` are native JavaScript arrays; `uint64` elements are bigint. For all six slice element types, nil is `null`, while an empty non-nil slice is a separate zero-length array or typed array. After append/reallocation, all tested slice categories may become a `GoSlice` wrapper: `[]float64` uses a `Float64Array` backing, and `[]Inner` uses an `Array` backing.
- `math.Copysign(0, -1)` remains negative zero: `Object.is(value, -0)` is true and its IEEE-754 bits are `8000000000000000`.
- Exact `GoSlice` observation: constructor `GoSlice`, not `Array` or a typed view; own keys are `backing`, `offset`, `length`, `capacity`, `target`. All are own enumerable/writable/configurable; `backing` is an Array or Float64Array, offset/length/capacity are numbers, and `target` is present with value `undefined`. `slice[0]` is undefined. `Symbol.iterator` and `.window()` are functions, `Array.from(slice)` enumerates its visible elements, and the prototype has a non-enumerable configurable `__meta__` getter returning the slice itself. The generated encoder should distinguish native Array, typed view, and this exact wrapper and reject other shapes.
- Gobi `Node.Kids` is emitted as a JavaScript array. `Node.Attrs` and `Node.On` use GoScript slice wrappers. A branch test of `base.Set("id", "left")` and `base.Set("id", "right")` preserved the base’s one attribute and independent `left`/`right` values, confirming the current full-slice append behavior. The initial counter reset button has an `Attr{Name:"disabled", Flag:true}`.

The probe also executed emitted `strconv` functions in Node:

| Go call | Observed result |
| --- | --- |
| `FormatFloat(-0, 'f', -1, 64)` | `-0` |
| `FormatFloat(-0, 'g', -1, 64)` | `-0` |
| `FormatFloat(1.25, 'f', -1, 64)` | `1.25` |
| `FormatFloat(1e21, 'f', -1, 64)` | `1000000000000000000000` |
| `FormatInt(-9007199254740991, 10)` | `-9007199254740991` |
| `FormatUint(9007199254740991, 10)` | `9007199254740991` |
| `Itoa(-2147483648)` | `-2147483648` |

The integer formatter observations establish these calls at the tested values only. The v1 policy requires rejecting unsafe integer operations and non-finite float values. This ABI probe does not establish that the current analyzer enforces every such case; the four fixture packages passing the current analyzer is only evidence for those source files and operations. Full enforcement remains an analyzer gate owned by N2.

An additional boundary probe increments each integer type at its width maximum. GoScript matches Go wrapping for `int8`, `int16`, `int32`, `uint8`, `uint16`, `uint32`, `byte`, and `rune` in this test. It does not wrap `int64`/`uint64` BigInt results (they become 9223372036854775808n and 18446744073709551616n); host `int`/`uint` become 9007199254740992 as JavaScript numbers when incremented above the safe range. This is an observed compiler limitation, not admitted application behavior. The v1 policy requires rejecting reachable arithmetic that can overflow a declared Go width or leave the safe range before emitting an app. The probe does not prove complete enforcement; it records these raw outputs rather than treating them as successful Go parity.

## Reproduction and limits

From the nested module directory, run `./toolchain/probe_counter/run.sh`. It first emits a native Go reference JSON, then compiles the unchanged counter, the fixture, and the Go forwarding adapter to a fresh temporary TypeScript output tree, bundles imports with the pinned esbuild, and compares the Node calls against the native reference. The source, both outputs, compiler stdout/stderr, Node stderr, copied emitted package files, module origin, and SHA-256 manifest are under `toolchain/probe_counter/`; the manifest was checked with `sha256sum -c`.

This evidence proves the observed GoScript ABI shapes and listed semantics only. It does not prove full GoScript semantic-model access, general Go compatibility, every standard-library operation, React lowering, effects delivery, the build CLI, or browser behavior. The build pipeline now derives value-copy forwarding code from validated AppIR signatures and derives state encoding from the confirmed runtime shapes; it does not hide mutation by normalizing snapshots after the call.

## Build forwarding boundary

For each validated app, the CLI writes one typed Init/Update/View forwarding package into a temporary Go module with fixed module path `gobi.generated/compiled` and a local `replace` to the requested source root. The wrappers call the original Go functions directly. The pinned compiler compiles these wrappers and their app dependencies; its generated Update calls the app Update with `(state).clone()` as observed in the probe. The bundler only maps the original AppIR role IDs to the emitted `GobiCompiledInit`, `GobiCompiledUpdate`, and `GobiCompiledView` exports.

The published build tree includes the exact forwarding `go.mod` and `.go` source under `forwarders/`, the compiler's `.ts` files under `emitted-ts/@goscript/`, the AppIR and generated encoder, the module bundle, and a manifest mapping each AppIR role ID to its Go forwarding export. These inputs and generated source paths are included in `BuildResult.Outputs` with byte counts and SHA-256 hashes. This makes the lowering boundary inspectable; it does not establish application conformance. Four-app native/direct-JS/browser claims remain owned by the independent conformance gate.
