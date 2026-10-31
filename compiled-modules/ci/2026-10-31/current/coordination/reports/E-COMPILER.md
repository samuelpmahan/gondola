# E-COMPILER — typed parent/child module emission

**Outcome:** `mixed_change`. The compiler now discovers the frozen optional bridge roles, includes their type closure in AppIR, emits primitive-field bridge adapters in a separate `gobiModuleBridges` export, and writes an artifact-bound `moduleABI` sidecar. The ordinary `gobiCompiled` v1 object and its three `Init`/`Update`/`View` symbols remain unchanged. Parent and child were each built independently for React and DOM.

## Implementation

- `compiled-frontend/analyze/analyze.go` recognizes only the complete parent role pair `Output(State) modulewire.Input` / `Receive(State, modulewire.Publication) State` or complete child pair `Input(State, modulewire.Input) State` / `Publication(State) modulewire.Publication`. It verifies exact Go types and field order, adds bridge functions to reachability/operation validation, and includes imported wire types in AppIR's type closure. Existing applications may omit bridge roles.
- `compiled-frontend/build/pipeline.go` compiles local adapters that reconstruct the target bundle's own GoScript record from primitive fields or project an outgoing record into a plain JS object. The generated bridge object is a distinct named export (`gobiModuleBridges`), with parent keys `output` and `receive`, or child keys `input` and `publication`. The manifest gets an optional `moduleABI` path. The descriptor is derived by `moduleabi.Describe` from the analyzed AppIR and exact generated `app-ir.json`, `gobi-compiled.mjs`, `encoder.mjs`, and `components.gen.mjs` bytes; those four artifact rows exclude the descriptor and build manifest to avoid self-reference. The JSON sidecar is pretty-printed with a trailing newline.
- Analyzer/build tests cover the exact accepted pairs, partial or crossed role rejection, malformed wire types, type closure, adapter exports, descriptor bytes, and the legacy standard facade.

No fixture `app.go` or `view.go` adaptation was needed. Fixture hashes: `modulewire.go` `9d29a10bdf9069852d861a38ede52f11b40a650da057dbd85070bb7da5c4561f`; parent `app.go` `1da626a1e56e34c9b08bb9d56e6d99f4cbf783439c25053cd61d83eca1830c37`; child `app.go` `1a0906fa3d6efdaefe5f580f6783901c6243c8403108b0b9423d35a2b815a246`; child `view.go` `0a860eae91c70fc86535deb56754410a89c20186d658c68642a5476e6f1f7407`.

## Verification

Compiler tests ran from `/workspace/scratch/39a56936f173/gondola/compiled-frontend` with `GOTOOLCHAIN=go1.27.3`, `GOFLAGS=-buildvcs=false`, and PATH prefixed with `/tmp/gondola-go/go/bin:/tmp/gondola-node22/node_modules/node/bin` (Go `go1.27.3 linux/amd64`, Node `v22.23.4`). All commands exited 0:

```sh
go test ./analyze -run 'TestAnalyze(IncludesOnlyCompleteTypedModuleBridgePairsAndTheirTypeClosure|RejectsPartialOrWrongModuleBridgeRoleSet)' -count=1
go test ./build -run 'Test(BuildEmitsSeparateTypedModuleBridgeABIForParentAndChild|CompiledModuleSourceExportsOnlyValidatedFacadeAndCopiesUpdateState|CompiledModuleSourceExportsPairSpecificPlainRecordBridgeAdapters)' -count=1
go test ./analyze ./build -count=1
go test ./...
go vet ./...
```

Test-first RED logs are preserved at `module-coordination/rawlogs/E-COMPILER/test-red-analyze.log` and `test-red-build.log`; these record the pre-implementation missing analyzer bridge roots/type closure and missing `moduleABI` output. Additional implementation/test corrections and their exact logs are preserved under `rawlogs/E-COMPILER/failures/`. `failures/index.json` distinguishes the expected REDs from setup/test assertion issues and their corrections.

Four actual `go run ./cmd/gobi-build` invocations consumed separate one-entry request JSON files (React/DOM × parent/child) via stdin. All returned `ok:true`; output counts were 67 for each parent and 70 for each child. Each manifest contains the appIR/module/encoder/components paths and the optional moduleABI sidecar. App component IDs and package paths are `github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent` and `.../modulechild`.

| Build | Manifest SHA-256 | ABI SHA-256 | Artifact digest |
|---|---|---|---|
| React parent | `d4e7f39173467fd433d409ce53c8b7ab3340b60f353e5a0d47522c1081654d37` | `7ac5a916d9cf08667b7dddec2cb70f2f2ad9147c9a2cdb5820e5dc301f215277` | `3dfd31c0e783ef39c03343d19a74fe65484b2304e2b721d829d9d1038c90752f` |
| React child | `48cb8aa9d8b529b2a0dbcc3c71276c4870f718efcc3cec9c27ee58c6e5a72a97` | `092380b7c276452369752cf77d306b89c28f7facfad653045e3d42e4c4df30d3` | `970aa7a2350fd8c27418f8113422524ed267bef01b89342657a3dbe4fc95e894` |
| DOM parent | `3a1866ae2b7bd5c816a88c2d4703083ea42c9b4c0954f6f7088395a81ef08389` | `2f8c61741f2cae080b7b68b9a6780421e0e71f41283bc3b208c80011eff3b2fc` | `891a24a01bf860dd048a5e57c48e7c7f18351d303af29d779ee59442b5e6bf23` |
| DOM child | `8b1d8d74a9faa802b08e488b660cc00d2aae2b2d8bd59065900afa8295bdcf7c` | `d3c9e119047ab254cbb0c342f261750531ad478dd5b950bda64c7f23d1444a8d` | `ee6d45434f6abbf95f813046b468717c980c3c0d7d0837dee8235a096840c122` |

Build roots are `/tmp/gobi-module-gate1-{react,dom}-module{parent,child}-20261031`. Exact requests, full build-result JSON, artifact paths and individual hashes are recorded in `rawlogs/E-COMPILER/stable-builds/index.json` (SHA-256 `445e2207c1660a43cdcd91aebc1c26964a9fceba36ca238b9fd86de1d964d022`).

A Node 22 smoke imported and invoked each compiled pair under both profile bundles: parent `output` produced `{Step:1,Locked:false,Revision:1}`, child `input` accepted the plain record, child `publication` produced `{Count:0,Revision:1}`, and parent `receive` accepted it. It also confirmed the standard symbol exports stayed exactly `Init`/`Update`/`View` and the bridge keys are side-specific. Both profiles exited 0; evidence is in `rawlogs/E-COMPILER/stable-builds/smoke-index.json` (SHA-256 `2f5353bd0c52f66ac876de776caf3cd31e3bbde8c792d555491d555bff76cb74`). Node printed its experimental `EnvHttpProxyAgent` warning; this did not affect exit status.

## Limits

This packet establishes compiler analysis, actual React/DOM GoScript emission, ABI sidecar generation, and direct Node invocation of generated bridge exports for this one frozen pair of effect-free modules with flat `int`, `bool`, and `float64` fields. It does not establish pair mounting in a browser, renderer mutation/callback correctness, arbitrary Go types, arbitrary module graphs, effects, malicious-code containment, or cross-bundle GoScript class identity. Those are separate host/harness gates.
