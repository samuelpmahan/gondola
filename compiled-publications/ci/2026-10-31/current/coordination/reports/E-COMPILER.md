# E-COMPILER — completed

**Outcome:** `mixed_change`  
**Worker:** N2  
**Summary:** Fixed one conservative analyzer false negative for Go keyed struct literals with an omitted string field, then proved the publications fixture builds and encodes its typed value slices in both real GoScript backends.

## Compiler correction

The cancellation capability scan already requires a reachable, typed `gobi.Effect` descriptor with literal `Kind` and `Name`, a string `Arg`, and an empty `Reply`. Go defines an omitted field in a keyed struct literal as its zero value; for `Reply string`, that is `""`. The analyzer previously treated an omitted `Reply` as unknown and omitted `effect.cancel` from AppIR. [analyze.go](/workspace/scratch/39a56936f173/gondola-publications/compiled-frontend/analyze/analyze.go:1013) now accepts an omitted Reply as the Go zero string. If Reply is present, it must still be a literal empty string.

The regression [analyze_test.go](/workspace/scratch/39a56936f173/gondola-publications/compiled-frontend/analyze/analyze_test.go:159) proves omitted and explicit empty Reply both declare `effect.cancel`; nonempty and computed Reply do not. It also rejects a similarly shaped composite of a different type. Existing tests continue to reject mismatched kind/name, computed kind, and unreachable descriptors.

## Actual GoScript builds

Both CLI requests used the current frozen N1 source and the corrected analyzer. From `compiled-frontend`, the exact commands were `GOTOOLCHAIN=go1.27.3 GOBI_NODE=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-go/bin/go run ./cmd/gobi-build < ../compiled-publications/compiler/build/react-proof-request.json > ../compiled-publications/compiler/build/react-proof.stdout.json 2> ../compiled-publications/compiler/build/react-proof.stderr.log` and the matching `dom-proof` paths. Each command exited 0, returned `gobi.build-result/v1` with `ok: true`, no diagnostics, and 67 output files. `verify-builds.py` checked every output path, byte length, and SHA against the CLI result, and confirmed the AppIR and encoder are identical across backends.

| Backend | Manifest | AppIR SHA-256 | Module SHA-256 | Encoder SHA-256 | Outputs |
|---|---|---|---|---|---:|
| REACT | `compiled-publications/compiler/build/react-proof/buildmanifest.json` | `e673590e57b0b4e5afbf77f5b654f73767f8f410cd35e5315e332c00d325c07f` | `e56ad0cf6d57d932414110d4dc3733fffb137e0be6d3fd8265abbcfeadf38758` | `12b9b02389aee4493f724a181ec033f3e884d5559755dcb58b98ee6d02b872f9` | 67 |
| DOM | `compiled-publications/compiler/build/dom-proof/buildmanifest.json` | `e673590e57b0b4e5afbf77f5b654f73767f8f410cd35e5315e332c00d325c07f` | `fa95be22436027720eac19eeb1aa56bc05ee0ff2decb5dbab5ed383fac006e5b` | `12b9b02389aee4493f724a181ec033f3e884d5559755dcb58b98ee6d02b872f9` | 67 |

The manifest-resolved module is `apps/publications-5ad33d9496e7/gobi-compiled.mjs`; AppIR is `apps/publications-5ad33d9496e7/app-ir.json`; encoder is `apps/publications-5ad33d9496e7/encoder.mjs`; components helper is `apps/publications-5ad33d9496e7/components.gen.mjs`. The generated forwarder package is `gobi.generated/compiled/facades/publications-5ad33d9496e7`.

Both current AppIRs declare `['view.node', 'numeric.safe-integer', 'numeric.float64', 'effect.request-reply', 'effect.cancel']`. The `State` AppIR fields include `Children []...ChildState` and `Publications []...Publication`. The encoder probe verified each nested child/publication struct and all scalar kinds: strings, bools, signed/unsigned safe integers, and `float64` values. The initial encoded `Children` and `Publications` values both have `Value.kind: "slice"`.

## State and encoder evidence

The exact Node22 probe commands were `/tmp/gondola-node22/node_modules/node/bin/node compiled-publications/compiler/encoder-probe.mjs react compiled-publications/compiler/build/react-proof compiled-publications/coordination/rawlogs/E-GO/native-trace.json` and the matching `dom` path. The probes imported the generated module and encoder paths from each build manifest, resolved AppIR Init/Update, applied the actual native trace messages, and called `gobiEncodeState` after each update. They compared the encoded, decoded state against the literal native Go states at all 45 dispatch steps plus initial state. React and DOM snapshots were identical to each other and each matched native Go.

Native trace: 50 source events, 45 Go dispatch steps, 1,148,369 bytes, SHA-256 `bbf6db314e6f9f68802e0dd3d49b5216c4ed93db5696d9f9980055de12bced3d`. The runtime slice representation varied with execution: `Children` was an array in 3 checkpoints and a GoScript slice wrapper in 43; `Publications` was an array in 20 and a GoScript slice wrapper in 26. In every checkpoint both were encoded as typed slice Values with matching lengths.

## Red evidence and superseded output

The first CLI run against the earlier N1 source checkpoint exited 1 in both backends with 19 safe-integer/call-profile diagnostics. Its exact build results and stderr are preserved in `compiler/build/react.stdout.json`, `dom.stdout.json`, and the matching stderr/attempt files. The intermediate `react-repaired` and `dom-repaired` artifacts were produced by the pre-fix analyzer while the reachable Go cancel literal omitted Reply. They built but omitted `effect.cancel` because the analyzer failed to apply Go keyed-literal zero-value semantics. These AppIRs remain preserved with capabilities `['view.node', 'numeric.safe-integer', 'numeric.float64', 'effect.request-reply']` and are superseded; consumers must use `react-proof` and `dom-proof`.

The new omitted-Reply regression failed before the analyzer fix, then the full analyzer package suite passed afterward with the exact command `GOTOOLCHAIN=go1.27.3 /tmp/gondola-go/bin/go test ./analyze -count=1` from `compiled-frontend`. A direct Go 1.24 analyzer command is blocked by the compiler module's declared `go 1.27.0` floor; this is a toolchain-floor limitation, not a test failure. A temporary modfile experiment was run before root clarified the module-floor policy; it is marked exploratory and is not acceptance evidence. No module files or locks were changed.

## Exact pins and limits

The before/after source pin files are byte-identical: 22 source/tool paths, SHA-256 `f6604b31b7a7fadfb5ce9d7234070502ca800371a5b4e75db8b6f96817e04478`. The final fixture pins are app.go `c9865a8d2c6e4da3568f1e288d3506144d94c5f987006f9128878acd479fa0bb`, view.go `458e33f640a6fe9edfa3a200405ec9ef381d43668f2088706c58f012481079bc`, app_test.go `6402baa2a342528c93ef52e4e93ba6e9c51d013193cc2a8fa8d9989bde39c392`, and scenario.json `824240f36750c9806265edc4511143188d20e3d1ba0686cd37fe7cd996193819`. Analyzer source pins are analyze.go `9e39ccd6cbe6b68dd5b42af9abf50ee2dc3fe926b4ac08f4f76fafbe59a60f52` and analyze_test.go `e67a8060324212838ff9e385d0a4d77eea5c830ea1baae957149780aa1942145`.

This proves the bounded typed slice/value profile for this fixture through the existing compiler and encoder. It does not claim support for arbitrary Go programs or browser/HTTP acceptance; mounted browser behavior is owned by the harness and delivery lanes.

Evidence indexes: `compiler/build/cli-proof-attempts.json`, `compiler/build/resolved-builds-proof.json`, `compiler/build/encoder-comparison-proof.json`, and `compiler/rawlogs/N2-E-COMPILER-source-proof-before.json`.
