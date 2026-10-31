# XR-R-COMPILER

**Decision: accepted.** N4’s repair places method-selection validation ahead of the trusted Gobi fast path. The new regression rejects Gobi method expressions and promoted selections while keeping an ordinary direct `Node.Set(...).Flag(...)` builder chain valid. I independently ran the focused regression and a bounded diagnostic-span probe. The fresh React/DOM build inventories and preserved pre-repair archive also match their pins.

## Source and regression review

In `compiled-frontend/analyze/project.go`, `methodCall` now evaluates `supportedMethodSelectionReason(selection, function)` before `isTrustedGobiMethod(function)`. This closes the ordering hole recorded in XR--COMPILER: `MethodExpr` and multi-index promoted selections are rejected before a `gobi.Node` builder function can enter the allowlist branch. The direct Gobi path still emits the same trusted call target and selector callee after the selection passes shape checks.

`TestTrustedGobiBuilderSelectionShapes` covers the Gobi `Node.Set` method expression, an embedded/promoted `Node.Set`, pointer selection, interface dispatch, and the positive `El(...).Set(...).Flag(...)` chain. Its positive case checks both trusted call targets in the projected Update operation. `TestUnsupportedMethodDispatchFormsFailClosed` continues to cover the generic receiver boundary and other unsupported user-defined method forms.

I ran the focused analyzer tests on Go `1.27.3 linux/amd64`:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:/usr/bin:/bin GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false GOBI_NODE=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-go/bin/go test -count=1 ./analyze -run '^(TestTrustedGobiBuilderSelectionShapes|TestUnsupportedMethodDispatchFormsFailClosed)$' -v
```

Both test functions and all five Gobi-selection subtests passed. The retained N4 RED transcript shows the method-expression and promoted-method cases admitted under the old ordering. The GREEN transcript passes after the change; the pointer-selection case also now reports the bounded receiver diagnostic.

For source-span verification, I ran the analyzer against a small evidence-only app containing one Gobi method expression and one promoted builder call. It returned exactly two diagnostics and no additional errors. Their byte spans select the complete offending calls in the source file: `gobi.Node.Set(gobi.El("div"), "class", "expression")` at `[242,294)` and `wrapper.Set("class", "promoted")` at `[341,373)`. Source snapshots, the original invocation record, and JSON output are under `evidence/reviews/xr-r-compiler/`. After execution, runnable probe copies were moved to `/tmp/xr-r-compiler-span-probe`; in-repository snapshots use `.go.txt` so the root module’s full Go test discovery will not pick them up.

## Fresh React/DOM build evidence

I independently enumerated the fresh output trees, checking each file’s path, byte length, and SHA-256 against both output inventories. Both CLI results report `ok: true`, one app, 67 outputs, and no diagnostics. Each manifest’s app entry identifies the requested backend. React and DOM AppIR match at `07d0d25e…`, and encoders match at `60302ad9…`. The only output-file differences are `buildmanifest.json` and the raw `gobi-compiled.mjs` bundle; the bundle hashes are separately pinned, without a normalized byte-identity claim.

The pre-repair compiler-gate archive remains unchanged. I verified archive SHA-256 `bc043f86742d2bc380a6b3c7220459905ed2f674b7288ccf7892fd89aadc9fc6` and compared all 138 archived member paths, byte counts, and hashes with the retained inventory and current original-gate files.

N4’s final scoped analyzer/build/CLI/emitter tests, race tests, and vet logs are pinned and record successful exits. I did not rerun those broader scoped commands; my independent execution was limited to the focused analyzer regression and span probe. I did not run root-wide `go test ./...`, browser/runtime tests, or a new CLI build.

## Limits

This repair closes the trusted Gobi selection bypass without expanding the accepted method profile. Review scope is the analyzer fix, its tests, retained focused verification, and the fresh React/DOM compiler outputs. It does not establish browser/runtime behavior, overall milestone CI, or the broad root test suite. No production code, contract, fixture, Git state, or shared coordination state was changed by this review.
