# G-SEMANTIC

**Outcome: `mixed_change`.** The nested frontend module now compiles typed Go forwarding packages through pinned GoScript, publishes the exact generated Go source and TypeScript, and binds the emitted forwarding exports to the original AppIR role IDs. The build request decoder rejects duplicate, missing, unknown, and trailing fields. A failed build attempt reports `ok:false` and keeps the last published output tree.

## Build flow

The build CLI accepts one closed `gobi.build-request/v1` JSON object. It validates the requested app packages and React backend, loads and analyzes the original Go packages, then creates a temporary module with fixed path `gobi.generated/compiled` and a local replacement pointing at the source root. For each AppIR app it writes typed Go forwarding functions for Init, Update, and View. These functions call the original Go functions directly.

Pinned GoScript v0.6.2 compiles the generated forwarders and their app dependencies. The emitted Update contains the GoScript-generated `(state).clone()` at the Go call boundary. The generated JavaScript entry maps each original AppIR role ID to `GobiCompiledInit`, `GobiCompiledUpdate`, or `GobiCompiledView`; it contains no application transition logic.

The build publishes the Go forwarder `go.mod` and `.go` files under `forwarders/`, every emitted `.ts` file under `emitted-ts/@goscript/`, and the usual AppIR, encoder, React metadata, and app bundle. `buildmanifest.json` records each role-ID-to-export binding and the source paths. `BuildResult.Outputs` includes every published file with its byte count and SHA-256. The entire output is staged before replacement.

## Verification

Toolchain versions: Go 1.27.3, Node v22.23.4, esbuild 0.28.2, and `github.com/s4wave/goscript` v0.6.2 at commit `d8f58a091947cff26a9171be7bd130892b0afad3`. The actual compiler public API and the missing `PORTING.md` reference are documented in `semantic/ABI.md`.

Focused build package gates passed:

- `GOTOOLCHAIN=go1.27.3 PATH=/tmp/gondola-go/bin:$PATH GOBI_NODE=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-go/bin/go test -count=1 ./build`
- `GOTOOLCHAIN=go1.27.3 PATH=/tmp/gondola-go/bin:$PATH GOBI_NODE=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-go/bin/go test -race -count=1 ./build`
- `GOTOOLCHAIN=go1.27.3 PATH=/tmp/gondola-go/bin:$PATH /tmp/gondola-go/bin/go vet ./build`

The fresh four-app CLI build succeeded at `/tmp/gondola-compiled-atomic`: 4 apps, 186 emitted TypeScript files, 5 forwarder input files, 209 inventoried outputs, and no diagnostics. The Node 22 smoke imported each generated bundle, invoked each actual Init/Update/View export, encoded the resulting state, confirmed all three public role exports, checked each emitted forwarder contains the GoScript `.clone()` call, and independently recomputed all 209 output byte counts and SHA-256 values.

The valid-request failure probe exited 1 and returned `ok:false`, `preservedPreviousOutput:true`, and no output inventory. It then rechecked all 209 files from the prior successful build and found every hash unchanged. The duplicate-field CLI probe also exited 1 and wrote a JSON `ok:false` result containing the duplicate-field diagnostic.

Evidence and commands are under `toolchain/build-four/`, including `result.json`, `smoke-result.json`, `failure-result.json`, `duplicate-field-result.json`, `preservation-check.json`, exit-code records, and `command.txt`.

## Hashes and limits

The N1 source/evidence checkpoint is `900dc38eee351e745717136cb54ae26d0765ec53d25c2d99e226b2b4ee620f2b`, covering 86 scoped files. Its per-file hashes are in `toolchain/build-four/source-checkpoint.json`. The checkpoint excludes that self-manifest and `build/compiled/**`, so the root integration runner can publish there without changing the N1 source hash.

The N2 freeze used for the final rerun was `analyze.go` `28270a69953b8a65d797b0187ca64cd50f48693a5cf283d9cd5edf16841f19c5`, `project.go` `32a2c6cee4d3a84a83d76733343f49c061910e3b6329d7fd153a1979a400868a`, and `compilercontract/value.go` `e6f26347e56d8bd97f4802dff206489ed3901082525a2b4c7497fe0811c71a1f`.

These checks prove the compiler/build boundary and emitted-module smoke only. They do not prove complete Go compatibility or the four apps’ full action traces, React DOM behavior, or browser conformance. N6 owns those independent checks, and root owns the full nested-module suite, inherited Go 1.24 suite, integrated output at `build/compiled`, CI, and publication.
