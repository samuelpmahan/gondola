# E-FIX-ORACLE-FRESH-CHECKOUT

**Worker:** N5  
**Status:** bounded repair ready for independent review  
**Outcome:** `mixed_change`  
**Target checkout:** `/workspace/scratch/39a56936f173/gondola-children-archive` at `935cb00ce92d4a28f346ac431db302c9f580ea44`

## Finding and change

The inherited clean-checkout run passed its 46 host/harness unit tests and two GoScript builds, then failed in the independent oracle because `oracle.test.mjs` read `compiled-children/oracle/evidence/native.json`. That ignored capture is absent from a clean checkout. The initial failure packet is preserved at `compiled-children/coordination/failed-full-source-935/` in the primary checkout, with the detailed original oracle logs in the CI attempt archive.

`oracle.test.mjs` now runs `go run ./cmd/compiled-children-native --script fixtures/compiled/children/scenario.json` from the repository root and checks that live Go output against the existing literal oracle. It never reads the ignored evidence path. When the runner supplies `GOBI_COMPILED_CHILDREN_NATIVE_CAPTURE`, the test writes the exact Go stdout bytes there; standalone runs need no capture file.

`run.mjs` supplies a unique path under `attempt/oracle/native.json`, records the fresh trace hash and command details in the oracle receipt, and includes `native.json` among `archivedInputs`. The manual oracle module, expectations, scenario, projections, and negative controls were not changed. No source files beyond the two authorized paths were edited by this repair.

## Verification

Environment: Node `v22.23.4`; Go `go1.24.0 linux/amd64`.

- Clean absent-file run: all 9 existing oracle tests passed. `compiled-children/oracle/evidence/native.json` was absent.
- Poisoned ambient-file run: all 9 tests passed with an invalid ignored `evidence/native.json` present (SHA-256 `e48b8bb10ef3b9b02afd9f32274521a66e1eedd2d90048a164cecc2e46af4a37`). The temporary poison was removed and absence verified afterward.
- Runner-path simulation: all 9 tests passed with the same capture-path environment used by `run.mjs`. It produced a native trace of 653,879 bytes, SHA-256 `8ad3a28bd1a5e03a3c324dcecb1b5c55d97ffae257b1011103e7730573baefbb`; the trace has schema `gobi.compiled-children-native/v1`, 42 source events, and 38 update steps.
- `node --check` passed for both edited files; `git diff --check` passed for those files.

The fresh trace and command logs are preserved under `compiled-children/coordination/rawlogs/E-FIX-ORACLE-FRESH-CHECKOUT-*` in the primary checkout. Pre-edit source copies and their hashes are under `coordination/repairs/E-FIX-ORACLE-FRESH-CHECKOUT/originals/`.

## Scope and limits

The full delivery runner was intentionally not launched. Runner retention and receipt pinning were source-reviewed and the test was exercised with the runner-supplied capture path, but a complete attempt archive was not created here. No Git operation, native state write, full-chain run, or application change was made.

One auxiliary structure probe initially expected 39 native update steps and exited 1. The expectation was wrong: 39 counts the independent snapshots including the initial view, while the native trace correctly contains 38 updates for 42 events. That probe and the corrected passing check are both preserved; this was not a failure of the oracle test or implementation.

A receipt-integrity probe initially resolved the copied-originals path incorrectly and stopped before byte verification; no files were changed. The corrected validator used the recorded primary-checkout-relative paths and passed all recorded source, original, manifest, and rawlog hash checks.
