# E-CI-BUILD source preflight (N4)

This is a read-only source/test audit while the fresh CI run is in progress. It is not the final CI artifact audit or build acceptance. No production files were changed and no local Go tests or CLI builds were run in this preflight.

## Reviewed paths and pins

| File | SHA-256 |
|---|---|
| `compiled-frontend/build/request.go` | `7d288b0cd06e480a7dea0098ece974432f5e9e89cc602ba52a5f697ec1c6d6e6` |
| `compiled-frontend/build/request_test.go` | `477d1cc4d15693f34381e6c1db88e64c86f770ad04a5be123320367c5db5fd8e` |
| `compiled-frontend/build/pipeline.go` | `1c3b98f253f011b00a01460eb7b1611d05fb27792e775bd2cd57ab17a5c79309` |
| `compiled-frontend/build/pipeline_test.go` | `b8c8ece15090988a6ce03e6f69015af0b47e31556bfe3a9dc6413ca4cf515b28` |
| `compiled-frontend/build/publish.go` | `7e2857aca4cebf749a7c27f51c3cb6c1c9a71109a55b8bb00852e076eb4e0860` |
| `compiled-frontend/emit/backend.go` | `b2486fff69d106a4801e5a5400c961b3b6ab55ff9be440dcbdec5a9631f3d3ed` |
| `compiled-frontend/emit/backend_test.go` | `dc5c6a1ce143a1d79908eba2805879ff14d7f80d8d27e4ce650fccedf7e4c015` |
| `compilercontract/contract.go` | `fa3ef8b3c60f3ff1d4a0e80827bfa65dc21ad741b3c421c1f4634f6b3c0b363e` |
| `gobi/build.go` | `ddf183ec2eb7769441d0a12494bbf267e67bceeb9ae9022ec9e2d60923ad0b95` |

## Source findings

- The JSON request parser enforces one closed object, required fields, and duplicate/unknown/trailing-data rejection. `ValidateRequest` admits only `react` and `dom`.
- `Build` validates the request before staging or publication. A valid build analyzes AppIR, compiles GoScript, emits the shared AppIR metadata through the selected emitter, writes the per-app manifest backend tag, and publishes through the existing atomic `Publish` path.
- React and DOM emitters independently validate AppIR and call the same `emitAppIR` helper. That helper produces the shared node map and component-role metadata. The selected emitter does not choose another GoScript compilation or state encoder path.
- Build tests compare React/DOM AppIR, paths, role bindings, and `OutputFile` inventory equality for non-manifest/non-bundle files. Compiled module bundles are checked for nonempty bytes but intentionally not equated. Tests also cover backend manifest metadata, unknown backend rejection, and existing output-tree preservation.
- The legacy adapter retains the default React constructor. The zero-valued adapter guard first preserves the legacy identity check, then delegates a nil emitter to `Backend{}.Emit` to return the prior React AppIR validation error instead of panicking.
- The build request struct contains a `backend` field; the emitter selector and manifest name carry that selection. AppIR and BuildResult types do not gain backend-specific fields. This audit is based on the current published source pins above.

## Request-rejection result semantics

Root confirmed the established contract from the prior PR11 semantic review: unsupported-backend validation returns before `Publish`, so `PreservedPreviousOutput` stays false and does not claim that the output path was inspected or preserved by the transaction. The unsupported-backend test verifies failure, no Apps/Outputs, and that a preexisting marker/tree is unchanged, but does not assert the flag. Preserve this behavior and schema; do not reinterpret the boolean. Any stronger physical preservation claim in final evidence must use actual before/after output hashes, not this flag alone.

## Pending CI evidence

Fresh CI artifacts are required before final acceptance. The final audit will verify the supplied React/DOM CLI manifests, all four app paths and per-app tags, 209 output files per tree, 204 exact companion outputs, separate raw module hashes, AppIR/encoder and runtime pins, Go 1.24/1.27 versions, and actual test/race/vet command outputs. No normalized-bundle equality claim will be made.
