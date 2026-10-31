# XR--CI-BUILD (N2 review of N4)

**Decision: amend.** N4's source review is substantively accurate and its `insufficient_evidence` outcome correctly avoids claiming final build acceptance. However, the E-CI-BUILD receipt contains one incorrect source pin, and the available CI inventory is only the initial run at head `832d212`. Correct the receipt pin and issue a new final build-acceptance packet tied to the repaired head and immutable fresh CI artifacts.

## Finding XR-CI-BUILD-01 — receipt source pin does not match source

The E-CI-BUILD report's source-review table records `compiled-frontend/emit/backend.go` as `b2486fff69d106a4801e5a5400c961b3b6ab55ff9be440dcbdec5a9631f3d3ed`, which matches the file at reviewed head `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`. The paired E-CI-BUILD receipt instead records `b2486fff69d106a4801e5a5400c9611d05fb27792e775bd2cd57ab17c5a79309`. The other eight receipt hashes match. Correct the source pin in the packet metadata; no Go source correction is indicated.

## Source review

I independently recomputed all nine pins in the source-review Markdown and checked the described request validation, backend selection, AppIR emitter, manifest tagging, legacy adapter fallback, publication ordering, and parity-test assertions. Those source-level descriptions match the pinned code and tests. No build implementation defect is claimed in this review.

The source report accurately limits its conclusion to a read-only interim audit: it says local Go tests and CLI builds were not run, it does not claim the four-app output inventories or Go test/race/vet gates passed, and it does not treat `PreservedPreviousOutput` as evidence for a pre-Publish validation rejection. The missing acceptance evidence remains a gate, separate from the source audit.

## Fresh-CI evidence gap

`compiled-backends/ci/2026-10-31/runs-initial.json` has 24 stored workflow records. All 24 are for head `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`; at capture, 20 were in progress and 4 queued. The archived merge metadata describes the initial merge of that head into `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`, not a repaired-head CI result. These records do not establish a final build acceptance packet.

## Required follow-up

After the browser repair is published, N4 must provide a new report and receipt keyed to the exact repaired head and immutable fresh CI artifacts. Verify both React and DOM CLI output trees and manifests; four app paths and backend tags per tree; 209 files per tree; 204 exact companion outputs; raw bundle hashes separately; AppIR/module/encoder/source and runtime pins; Go toolchain versions; and actual Go test, race, and vet command outputs. Do not assert normalized bundle equality or infer physical prior-output preservation from the pre-Publish result flag.

## Review scope and evidence

- Reviewed head: `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`; tree `bc8883df935c7d0c8b7265831cacdf5521fb70d2`.
- Input E-CI-BUILD report SHA-256: `7aede8f251b37c74382050c375f1c7921f5bb413137a90e1528a0112555a53b0`.
- Input E-CI-BUILD receipt SHA-256: `d5c484d48b123508e39c373553cbad37b56efe0c41965199adb04d47b270d59f`.
- Detailed source-pin and CI metadata audit: [`source-audit.md`](../../lanes/reviews/xr-ci-build/source-audit.md), SHA-256 `61acda284fca4e6a2c5d6be8f6375570fcfdd6ea2a36b42ec117f5564eeb2188`.
- No Go tests, compiler, or CLI builds were run. No production, CI, or Git files were changed.

