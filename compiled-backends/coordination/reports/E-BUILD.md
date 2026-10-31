# E-BUILD

**Outcome: mixed change.** The build API and emitter now accept `backend: "dom"` alongside `react`. React remains the default in existing callers. The new `emit.NewBackendFor` selector routes AppIR through React or DOM emitter types; both emit the same validated AppIR role table and shared Gobi node mapping. The legacy `gobi.Backend` adapter also supports an explicit backend and keeps its captured `gobi.App` identity check.

The build pipeline compiles GoScript and creates forwarders, encoders, and AppIR before selecting the renderer emitter. It records the selected emitter name in the internal `buildmanifest.json` at `apps[i].backend`; no `compilercontract` request/result/AppIR schema changed. App module and encoder paths stay the same.

## Verification

Toolchains: Go `1.27.3` for the compiled frontend build, Go `1.24.0` for root compiler contracts, and Node `22.23.4` for esbuild bundling.

- `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false go test ./emit ./build` from `compiled-frontend`: passed.
- `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false go test ./compilercontract` from the repository root: passed.
- The actual `cmd/gobi-build` CLI accepted four entries (`counter`, `form`, `list`, `effect`) with both backend values. Each invocation returned four apps and 209 output files; manifest app tags matched the selected backend.
- An unsupported `svelte` CLI request exited 1 with `ok:false`, zero apps, and zero output claims. A pre-existing output marker remained unchanged.
- The two four-app output trees had identical file paths. The 204 non-manifest, non-bundle files matched byte-for-byte, including AppIR, encoders, forwarder sources, emitted GoScript TypeScript, and node mapping. Module paths, encoder paths, and role bindings matched.
- The build test checks emitter parity and the DOM legacy identity guard, and verifies AppIR plus all non-manifest, non-bundle output hashes across React/DOM builds.
- `git diff --check` on the six owned Go source/test files passed.

Raw `gobi-compiled.mjs` SHA-256 values differ between independent build directories because esbuild includes each temporary staging and GoScript path in source-label comments. Raw hashes are preserved in the receipt; this lane does not claim cross-directory bundle byte identity or normalize bundle text. The renderer harness should mount one concrete compiled module instance through both renderers.

An early diagnostic test compared raw bundles byte-for-byte and failed on the differing temporary source-label paths. That comparison was removed; final tests passed without a broad comment normalizer.

## Limits

N4 did not run the integrated browser renderer-swap matrix. N3 owns that harness validation. No GoScript semantics, AppIR language profile, forwarder logic, or typed encoder behavior was changed.
