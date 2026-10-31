# R-COMPILER

**Worker N4 · Outcome: mixed change.** Reordered method-call validation so every resolved selection shape is checked before the trusted Gobi builder-method fast path. Supported direct value-receiver calls remain supported; method expressions, promoted selections, pointer receiver selections, and interface dispatch remain fail-closed.

## Change and test evidence

`operationBuilder.methodCall` now calls `supportedMethodSelectionReason(selection, function)` before `isTrustedGobiMethod(function)`. The fast path still emits the same `OpCall` target and selector callee for an allowed direct `gobi.Node` value method. The v1 compiler contract, AppIR schema, role ABI, and GoScript source are unchanged.

`TestTrustedGobiBuilderSelectionShapes` has isolated subtests for an actual `gobi.Node.Set` method expression, an embedded `embeddedNode.Set` promoted selection, a pointer selection, interface dispatch, and the accepted direct `El(...).Set(...).Flag(...)` chain. The authoritative RED run used the old fast-path-before-validation order: the isolated method-expression and promoted-method packages each produced one app with no diagnostics, while the pointer call lacked its method-selection diagnostic. The interface case was already rejected. The GREEN run passes all five subtests, including the direct-builder positive case. The preliminary combined RED transcript is preserved; the isolated transcript is the precise regression proof.

## Verification

On Go `go1.27.3 linux/amd64`, with Node `v22.23.4` and GoScript module `v0.6.2`, these scoped checks passed against the final analyzer source:

```sh
GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false GOBI_NODE=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-go/bin/go test -count=1 ./analyze ./build ./cmd/... ./emit
GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false GOBI_NODE=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-go/bin/go test -race -count=1 ./analyze ./build ./cmd/... ./emit
GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false GOBI_NODE=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-go/bin/go vet ./analyze ./build ./cmd/... ./emit
```

Two actual `gobi-build` CLI requests built the methods fixture into fresh, isolated React and DOM output directories. Each returned `ok: true`, one AppIR and 67 output files, with no diagnostics. Each manifest reports its requested backend and the same app module, encoder, AppIR and role-binding paths. React and DOM AppIR hashes match (`07d0d25e…`); encoder hashes match (`60302ad9…`); component metadata, forwarders and emitted TypeScript bytes match. The only cross-request file differences are the manifest and the raw GoScript bundle. Raw bundle hashes are retained separately (React `f6ffc400…`, DOM `b96017fd…`); this report makes no normalized or byte-identical bundle claim.

The pre-repair compiler gate remains untouched: its archived 138-file inventory still matches, and `original-compiler-gate.tar.gz` retains SHA-256 `bc043f86742d2bc380a6b3c7220459905ed2f674b7288ccf7892fd89aadc9fc6`. Fresh outputs are under the ignored `compiled-methods/artifacts/repaired-compiler-gate/{react,dom}/`; `build-inventory.json` records every output path, byte count and hash. Root may package those generated artifacts in its evidence archive.

## Limits

This repair closes the trusted Gobi method-selection bypass only. It does not extend the accepted method forms or establish arbitrary Go semantic equivalence. Verification covers the live analyzer/build/CLI/emitter packages, plus fresh methods-fixture CLI builds. No root-wide `go test ./...`, browser execution, or root Go 1.24 contract check was part of this repair; compilercontract schema and role ABI files were not changed. GoScript bundle bytes vary across build invocations and are pinned raw, without normalization.

The final source hashes, RED/GREEN logs, scoped test logs, CLI requests/results, output inventories, and original-gate preservation audit are under `compiled-methods/evidence/repairs/r-compiler/`.
