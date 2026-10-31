# E-FIXTURE — compiled lifecycle Go fixture

**Worker:** N1  
**Outcome:** mixed change  
**Scope:** `fixtures/compiled/lifecycle/**`, `cmd/compiled-lifecycle-native/**`, `compiled-lifecycle/CONTRACT.md`, `compiled-lifecycle/FIXTURE.md`, this report, and its receipt.

## Frozen contract and implementation

Added a finite value-owned Go application with Parent → Child → Grandchild and an independent Sibling root. Four `NodeState` values own lifecycle generation/request IDs, pending tokens, reply values, and existing `counter.State`. The fixture uses the package-level GoScript roles and `gobi.Message`, `gobi.Effect`, and `gobi.Node`; no JavaScript application reducer or pointer-based Manager compilation is claimed.

The stable effect ABI uses the admitted `fixture.request/lookup/<token>/complete` request. Removal returns explicit `lifecycle.cancel/cancel/<token>/` effects in Grandchild, Child, Parent order. Tokens include the actual scope, generation, and monotonic request ID. Remount refuses to revive any subtree whose generation reached the safe-integer limit.

The 26-event script has 13 machine-checked state checkpoints and eight exact effect expectations. It covers a pending renderer swap, postorder removal, independent sibling survival, remount with fresh generations, direct stale Go replies, valid replies, duplicate replies, and token allocation under reordered requests. The standalone command resolves click messages from the actual Gobi view and replays the Go roles.

## Verification

Toolchains observed:

- Root tests and native adapter: `go version go1.24.0 linux/amd64`.
- Existing GoScript compiler CLI: `go version go1.27.3 linux/amd64`.

Passing author checks from the repository root:

```sh
PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false go test -count=1 ./fixtures/compiled/lifecycle ./cmd/compiled-lifecycle-native
PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false go run ./cmd/compiled-lifecycle-native --script fixtures/compiled/lifecycle/scenario.json > /tmp/compiled-lifecycle-native-final.json
```

The tests passed. The native output parsed as schema `gobi.compiled-lifecycle-native/v1`, AppIR component ID `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`, with 26 steps. Event 9 emitted `grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1` cancellations in order; the final request ID was 7.

Passing compiler commands from `compiled-frontend/`:

```sh
printf '%s\n' '{"schema":"gobi.build-request/v1","sourceRoot":"/workspace/scratch/39a56936f173/gondola","entryPackages":["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"],"backend":"react","outputDir":"/tmp/compiled-lifecycle-react-append-final"}' | PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false go run ./cmd/gobi-build > /tmp/compiled-lifecycle-react-append-final.json
printf '%s\n' '{"schema":"gobi.build-request/v1","sourceRoot":"/workspace/scratch/39a56936f173/gondola","entryPackages":["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"],"backend":"dom","outputDir":"/tmp/compiled-lifecycle-dom-append-final"}' | PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false go run ./cmd/gobi-build > /tmp/compiled-lifecycle-dom-append-final.json
```

Both returned exit code 0 and `ok:true`, 67 outputs, no diagnostics, and the full package-path component ID. AppIR includes `effect.request-reply`, using the existing admitted request kind.

## Failed attempts and limits

The initial React/DOM compiler attempt used an early-return `NextRequestID >= maxSafeID` guard. Both builds failed closed with four `analyze.numeric-profile` diagnostics: `integer increment/decrement lacks a safe bound guard` at `app.go` byte spans 2726–2747, 3286–3307, 3851–3872, and 4457–4478. The source was restructured so each increment is nested in the analyzer-admitted true-side `< maxSafeID` branch; both final backend builds pass. A separate early effect-kind draft used `lifecycle.request`, which did not derive `effect.request-reply`; it was amended to the real existing `fixture.request` kind without changing the compiler.

Mounted runtime acceptance is not claimed in this fixture packet. N5 preserved the demo smoke failure at `compiled-lifecycle/demo/evidence/attempt-01-slice-abi-failure/`: emitted GoScript effects are `$.Slice<gobi.Effect>`, while the existing runtime requires a dense JavaScript array and reported `Update effects must be an array or null`. A dense-literal fallback was tested and also emitted a GoScript slice; its source snapshot is `fixtures/compiled/lifecycle/dense-cancellation-experiment.go.txt`. The final Go fixture therefore keeps its ordinary append-based cancellation implementation. N2 owns the bounded runtime encoding bridge; N3/N5 own mounted integration evidence. This report records the issue without claiming it passed.

The evidence establishes the bounded fixture's Go transitions, native view/action mapping, and successful GoScript AppIR/module generation. It does not establish a generic lifecycle Manager compiler, runtime effect-slice delivery, mounted renderer replacement, or browser reply fencing; those remain in the runtime/harness gates.
