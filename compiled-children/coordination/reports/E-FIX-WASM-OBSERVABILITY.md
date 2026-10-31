# E-FIX-WASM-OBSERVABILITY (N2)

**Outcome: `mixed_change`.** WebAssembly observation now records explicit per-hook coverage and fails closed when a present hook cannot be installed or verified. The demo and compiled browser harness reuse the same guard and emit its coverage ledger while preserving their existing request and API-attempt fields.

## Implementation

- [no-wasm.mjs](../../../compiled-frontend/conformance/no-wasm.mjs#L7) records a coverage entry for each exposed hook. It instruments `compile`, `compileStreaming`, `instantiate`, `instantiateStreaming`, and `validate`, plus the `Module`, `Instance`, `Memory`, `Table`, and `Global` constructors. Non-configurable writable data properties remain supported. A missing hook is explicitly recorded as absent; an unobservable or unreplaceable present hook records a failure.
- `assertClear()` requires an observable ledger, rejects failed coverage, validates the global-absent case, and then checks the existing request and API-attempt observations. Its result keeps `wasmRequests` and `wasmAPIAttempts` and adds `guardCoverage: {status, entries, failures}`. `status` is `absent` only when the `WebAssembly` global is absent; installation failures set the page ledger to `failed` and make `assertClear()` throw.
- [no-wasm.test.mjs](../../../compiled-frontend/conformance/no-wasm.test.mjs#L60) preserves the two existing real Chromium tests and adds five VM-backed cases for normal installation, absent global, read-only non-configurable hook rejection, missing coverage-ledger rejection, and non-configurable writable hook support.
- [smoke.mjs](../../demo/smoke.mjs#L165) now uses the shared helper. It keeps `webAssemblyRequests` and `webAssemblyApiCalls`, adds top-level `wasmGuardCoverage`, and adds a smoke check for coverage. Failed smoke output also retains any available ledger.
- [browser.mjs](../../conformance/browser.mjs#L155) adds `guardCoverage` to overall `noWasm` evidence and each profile’s `noWasm` evidence, while retaining the prior `apiAttempts` and `wasmRequests` fields.

This finite observation covers the listed public functions and constructors plus browser requests matching the existing `.wasm` URL suffix pattern. It does not claim to observe every possible engine path for WebAssembly execution.

## Verification

- Node **v22.23.4** syntax checks passed for all four owned source files.
- The focused combined Node suite passed **32/32** tests with Chromium at `/tmp/chromium`: the two preserved real Chromium tests, five new VM cases, and the existing runtime, conformance, seeded, and oracle tests.
- A standalone HTTP smoke against the stable N2 React bundle passed **32/32** checks in Chromium **153.0.8010.0**. `/`, `/demo.css`, and `/demo.bundle.mjs` returned HTTP 200. Coverage was `complete`, all ten listed hooks were installed, failures were empty, and the smoke observed zero guarded API attempts and zero `.wasm` requests.
- The smoke used `compiled-children/demo/output/author-smoke-20261031-rerun1/site/demo.bundle.mjs` (1,853,920 bytes, SHA-256 `c2d5723c7c15a3bba3a59687a4f610682fe5d8cb387ed465118df79471a84ac9`). The run record and smoke JSON are independently pinned in the receipt.
- All three preserved pre-repair sources match their preservation manifest.

Commands, versions, stdout/stderr, exit codes, smoke JSON/screenshot, and the pin audit are recorded under [`../rawlogs`](../rawlogs/). The full inherited delivery pipeline was not launched. N6’s fresh checker/harness review is still required before broader acceptance.

No files outside the four assigned source paths and this job’s own report, receipt, and rawlogs were edited by this job.
