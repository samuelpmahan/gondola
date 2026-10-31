# E-COMPILER

**Outcome: mixed change.** The analyzer now projects and validates bounded Go value-receiver methods in the existing static call graph. The compiler contract schema, AppIR role ABI, and GoScript source remain unchanged.

## Implementation

The source projector emits concrete, non-generic value-receiver methods with stable IDs of the form `<packagePath>.<ReceiverType>.<Method>`. Their typed signatures prepend the receiver type as parameter zero. Direct method calls lower to static `OpCall` operations with the receiver expression first and explicit arguments after it. Same-named methods on distinct receiver types therefore remain distinct.

`LoadSources` follows reachable calls from package-level `Init`, `Update`, and `View`, projecting only the local dependency functions needed by those roots. `Analyze` selects roles only from free functions in the requested entry package, builds reachability across projected dependency functions, and runs the existing operation and numeric guards on every reachable body. Existing Gobi `Node` value-builder methods retain their explicit supported-method whitelist. No general pointer-method support was added.

Reachable pointer receivers, interface dispatch, method values, method expressions, promoted methods, and generic receivers fail closed. Tests cover receiver identity and first-parameter signatures, reachable unsafe integer operations in entry and dependency methods, counter dependency edges, multi-result method forwarding, and unsupported dispatch forms. The frozen methods fixture also passed the actual build CLI for both backend requests.

## Verification

Compiler toolchain: Go `1.27.3 linux/amd64`; root contract toolchain: Go `1.24.0 linux/amd64`; GoScript dependency: `github.com/s4wave/goscript v0.6.2`.

- `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:/usr/bin:/bin GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false go test -count=1 ./analyze`: passed.
- `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:/usr/bin:/bin GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false CGO_ENABLED=1 go test -race -count=1 ./analyze`: passed.
- `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:/usr/bin:/bin GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false go vet ./analyze`: passed.
- `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:/usr/bin:/bin GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false go test -count=1 ./analyze ./build ./cmd/gobi-build ./emit`: passed.
- `PATH=/tmp/gondola-go/bin:/usr/bin:/bin GOTOOLCHAIN=local GOFLAGS=-buildvcs=false go test -count=1 ./compilercontract` from the repository root: passed.
- Two `go run ./cmd/gobi-build` requests for `github.com/samuelpmahan/gondola/fixtures/compiled/methods`, one with `backend:"react"` and one with `backend:"dom"`, each returned `ok:true`, one AppIR, and 67 outputs. Requests, results, manifests, complete output trees, and a per-file SHA-256 inventory are retained under `compiled-methods/artifacts/compiler-gate/` and `compiled-methods/evidence/compiler/compiler-gate-inventory.json`.

Both builds produced byte-identical AppIR (SHA-256 `07d0d25ede9993e1f58e108f4cc153717ff62061ff519b50619615cd4faccd3b`) and encoder module (`60302ad92de2fba828a8babdafeafa66f04a05c166ac0d5854019ba9f1ea19e4`). The raw `gobi-compiled.mjs` hashes differ: React `9260f395881015f56233165936fb5176f181d47a8e1ee5193fdd7e061fbca9ac`; DOM `47b70259d75162989826d6444ca25bea9a8ec603fbc0b81c73912a5191fbde3b`. This packet makes no byte-identity claim for those bundles.

The emitted AppIR includes `Init → State.Initialize → counter.Init`, `Update → State.Reduce → {AddParent, ResetParent, AddChild, ResetChild, ToggleReadOnly, CaptureChild, PublishSaved}`, and `View → State.ComposeView`. Each Add/Reset method calls `counter.Update`. `Update`, `Reduce`, and the action methods retain `(State, []gobi.Effect)` signatures, including direct multi-result returns.

## Limits and failed broad check

`go test ./...` was attempted from `compiled-frontend` and fails while compiling the existing archival package `coordination/reviews/xr_r_abi_codec/source-snapshots`, which refers to missing `TypeInfo`, `indexTypes`, and related definitions. A read-only `git diff --exit-code 195c9433179218348d4b9f2477ae1e0725337d15 -- compiled-frontend/coordination/reviews/xr_r_abi_codec/source-snapshots` confirmed those archive files are unchanged from the worktree base. The live analyzer, build, CLI, and emitter package set passes as listed above.

This packet verifies source analysis and actual CLI emission for the frozen methods fixture; browser/native end-to-end execution is owned by the harness and browser lanes. The supported method profile remains limited to direct static calls on concrete value receivers. Pointer methods, interface dispatch, method values and expressions, promoted methods, and generic receivers are rejected when reachable. The two generated module hashes are pinned separately because they differ across output roots.

Raw test logs, toolchain version files, command-attempt history, source pins, output inventories, and generated AppIR artifacts are listed and hashed in `compiled-methods/coordination/receipts/E-COMPILER.json`.
