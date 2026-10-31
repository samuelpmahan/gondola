# R-CI-BUILD-FINAL source preflight (N4)

This is a read-only preparation audit for final build acceptance at published head `195c9433179218348d4b9f2477ae1e0725337d15`, tree `c0e4a66eee3fdd8b789e1b565167856fdab62433`, parent `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`. Fresh CI artifacts for this head have not yet been supplied. This file does not claim CLI, Go test, race, vet, or full build acceptance.

## Current build source pins

The Go build/emitter sources on the repaired head have the following SHA-256 values. These match the corresponding source-review values at the earlier 832 head, including the corrected `emit/backend.go` hash below.

| File | SHA-256 |
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

## Preserved interim packet correction

The consumed interim packet remains unchanged:

- E-CI-BUILD report: `compiled-backends/ci/2026-10-31/coordination/reports/E-CI-BUILD.md`, SHA-256 `7aede8f251b37c74382050c375f1c7921f5bb413137a90e1528a0112555a53b0`.
- E-CI-BUILD receipt: `compiled-backends/ci/2026-10-31/coordination/receipts/E-CI-BUILD.json`, SHA-256 `d5c484d48b123508e39c373553cbad37b56efe0c41965199adb04d47b270d59f`.

The interim Markdown source table records the correct backend file hash: `b2486fff69d106a4801e5a5400c961b3b6ab55ff9be440dcbdec5a9631f3d3ed`. Its paired JSON receipt mistakenly records `b2486fff69d106a4801e5a5400c9611d05fb27792e775bd2cd57ab17c5a79309`. That is a metadata transcription error only; the current source and Markdown agree on the corrected value. The final report/receipt will explicitly map the old incorrect receipt value to the actual SHA-256 and preserve the original packet hashes rather than rewriting consumed evidence.

## Source-level constraints for final artifact audit

- Build request validation admits only `react` or `dom` and occurs before publication.
- The two build profiles select AppIR emitters and add the selected emitter name to each internal manifest app record; AppIR and compiler contract schemas stay backend-neutral.
- GoScript compilation, application modules, forwarders, typed encoders, and AppIR content must be compared from the fresh actual output artifacts. Companion output paths and bytes are expected to match; raw module bundle hashes must be separately recorded because generated source-label comments can vary by staging location. No bundle normalization/equality claim is planned.
- The unsupported-backend result field `PreservedPreviousOutput` remains false on pre-Publish validation failure and does not itself assert inspection or preservation. If the final artifact packet covers a preexisting output, use recorded before/after output hashes to establish physical preservation.

## Fresh artifact gate

The final report will be completed only after root supplies immutable fresh-CI evidence tied to the exact repaired head. It must cover both actual CLI output trees and manifests, four app paths and backend tags per tree, 209 files per tree, 204 exact companion outputs, raw bundle hashes separately, AppIR/module/encoder/source/runtime pins, Go and Node toolchains, and actual Go test, race, and vet command results. The initial 832 head's inventory and status will remain historical and will not substitute for this repaired-head evidence.
