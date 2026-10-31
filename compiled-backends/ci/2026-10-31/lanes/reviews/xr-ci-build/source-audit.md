# XR--CI-BUILD source and packet audit

## Scope and pinned source

Read-only audit at `HEAD=832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`, tree `bc8883df935c7d0c8b7265831cacdf5521fb70d2`. The reviewed N4 packet is `compiled-backends/ci/2026-10-31/coordination/reports/E-CI-BUILD.md` and its matching receipt. The nine hashes in N4's source-review Markdown were recomputed at this head and match:

| Source | SHA-256 |
|---|---|
| `compiled-frontend/build/request.go` | `7d288b0cd06e480a7dea0098ece974432f5e9e89cc602ba52a5f697ec1c6d6e6` |
| `compiled-frontend/build/request_test.go` | `477d1cc4d15693f34381e6c1db88e64c86f770ad04a5be123320367c5db5fd8e` |
| `compiled-frontend/build/pipeline.go` | `1c3b98f253f011b00a01460eb7b1611d05fb27792e775bd2cd57ab17c5a79309` |
| `compiled-frontend/build/pipeline_test.go` | `b8c8ece15090988a6ce03e6f69015af0b47e31556bfe3a9dc6413ca4cf515b28` |
| `compiled-frontend/build/publish.go` | `7e2857aca4cebf749a7c27f51c3cb6c1c9a71109a55b8bb00852e076eb4e0860` |
| `compiled-frontend/emit/backend.go` | `b2486fff69d106a4801e5a5400c961b3b6ab55ff9be440dcbdec5a9631f3d3ed` |
| `compiled-frontend/emit/backend_test.go` | `dc5c6a1ce143a1d79908eba2805879ff14d7f80d8d27e4ce650fccedf7e4c015` |
| `compilercontract/contract.go` | `fa3ef8b3c60f3ff1d4a0e80827bfa65dc21ad741b3c421c1f4634f6b3c0b363e` |
| `gobi/build.go` | `ddf183ec2eb7769441d0a12494bbf267e67bceeb9ae9022ec9e2d60923ad0b95` |

The E-CI-BUILD receipt independently duplicates those pins, but its `compiled-frontend/emit/backend.go` value is wrong: it records `b2486fff69d106a4801e5a5400c9611d05fb27792e775bd2cd57ab17c5a79309`; the actual file and source-review Markdown pin are `b2486fff69d106a4801e5a5400c961b3b6ab55ff9be440dcbdec5a9631f3d3ed`. The other eight receipt pins match the source-review table and actual files. This is an evidence metadata error, not an implementation finding.

## Source claim review

The E-CI-BUILD source review's claims match the inspected sources and tests in this bounded scope:

- `DecodeRequest` admits one closed JSON object, rejects duplicate, unknown, missing, and trailing fields, and validates the backend enum as `react` or `dom`.
- `Build` initializes `PreservedPreviousOutput` false and validates the request before calling `Publish`. Thus unsupported-backend rejection returns before `Publish` inspects the prior output directory. The unsupported-backend test checks the error, empty Apps/Outputs, and prior marker bytes; it does not claim the boolean proves preservation.
- `produce` shares analysis, GoScript compilation, encoder generation, and compiled module source. It selects `emit.NewBackendFor(request.Backend)` for AppIR metadata and writes the selected emitter name into manifest entries.
- React and DOM `Emit` validate AppIR and call the same `emitAppIR`, which writes the shared `react-map.gen.mjs` and component-role module. Emitter tests compare those files byte-for-byte.
- Build parity tests compare AppIR, manifest paths and role bindings, inventory paths and exact bytes except the manifest and raw `gobi-compiled.mjs` bundles. The tests only require bundles to be nonempty; no equal-bundle hash claim is supported.
- `GobiBackend.Emit` preserves nil-receiver and source-identity guards; its non-nil zero-value adapter fallback calls `Backend{}.Emit(backend.appIR)`, producing the legacy React AppIR-validation error instead of dereferencing a nil emitter.

I found no source-level finding that contradicts N4's interim audit. No Go test, compiler, or CLI build was run in this review, consistent with the review scope.

## Fresh-CI evidence check

The archived `runs-initial.json` contains 24 workflow records, all at head `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb` and timestamps `2026-10-31T01:04:02Z` through `2026-10-31T01:04:06Z`; at capture, 20 were `in_progress` and 4 `queued`. The archived merge metadata is the initial merge of that head into base `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`, with merge commit `32bdafa0337bfeda55058e9afb36ff06cc6f8496` and tree `bc8883df935c7d0c8b7265831cacdf5521fb70d2`.

These are initial-run records for the published source, not a fresh repaired-head build acceptance packet. The E-CI-BUILD receipt accurately says fresh repaired-head evidence is pending. This review found no evidence that would let the 832d212 packet establish the final acceptance gates.

## Required next packet

N4 should produce a new acceptance report and receipt keyed to the exact repaired head and immutable fresh CI artifacts. That packet must record and verify the actual React and DOM CLI output trees and manifests; four app paths and backend tags per tree; 209 files per tree; 204 exact companion outputs; raw bundle hashes separately; AppIR/module/encoder/source and runtime pins; Go toolchain versions; and actual Go test, race, and vet command outputs. Do not claim normalized bundle equality or infer physical previous-output preservation from `PreservedPreviousOutput` on pre-Publish rejection.

