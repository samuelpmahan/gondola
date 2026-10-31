# XR-FIX-BUILD: independent review of archive provenance repair

## Decision

**Accepted.** E-FIX-BUILD closes XR-BUILD-1 and wires the N3 raw-preservation and capture-mutation requirements into the full runner gate. The runner, archive helper, helper test, and documentation agree on the immutable pre-archive payload and its outer receipt bindings.

## Findings

No remaining blocking finding in the reviewed repair.

- The snapshot is written exclusively with mode `0444` before archive creation. It uses schema `gobi.compiled-capabilities-execution-before-archive/v1`, stores `sourceBefore`, `preArchiveSourcePins`, toolchain versions and dependency-install details, command ledger, stage outcomes, and the pre-archive receipt; it explicitly records `archiveStatus: PENDING`, `archivePending: true`, `acceptanceStatus: NOT_FINAL`, and `finalAcceptance: false`.
- `execution-before-archive.json` is added to the tar inventory and its SHA-256 is included in the external archive manifest. The manifest stays outside the tar, and the final outer receipt binds both the archive and manifest hashes. The final source check requires `sourceAfter` to match `sourceBefore` and pre-archive pins; the independent archive verifier checks the same values against both snapshot pin lists.
- The pre-archive command ledger and stage outcomes are prefixes of the final outer receipt records. The embedded pre-archive receipt matches those snapshot records. Archive creation, listing, and extraction commands follow the immutable command-ledger prefix, avoiding a receipt/archive self-hash cycle.
- `archive-helper.mjs` and `archive-helper.test.mjs` are explicit source-pin paths. The helper verifies tar inventory and extracted member hashes. The fresh helper test checks write-once/read-only snapshot behavior, archive membership, round-trip hashes, external manifest binding, and equality of the before/after source pins in its synthetic fixture.
- The full runner requires both `rawPreservationVerified` fields, the exact ordered nine N3 mutation IDs, `capabilityMutationControlsDetected === 9`, and detected rows with nonempty errors. N3 attempt 05 independently reports both raw checks true and all nine controls detected in that order.

The original E-BUILD report and receipt still match the hashes captured by XR-BUILD. The XR-BUILD report and receipt also match the E-FIX-BUILD preservation hashes. The E-BUILD receipt remains the pre-run placeholder; this review does not claim that an integrated archive exists or that milestone acceptance passed.

## Verification

Fresh checks passed under Node `v22.23.4`:

- `node --check` passed for `compiled-capabilities/run.mjs`, `archive-helper.mjs`, and `archive-helper.test.mjs`.
- `node --test compiled-capabilities/archive-helper.test.mjs` passed 1/1 test.
- `bash -n run-compiled-capabilities.sh` passed.
- The capability workflow YAML parsed successfully.
- `python3 compiled-capabilities/coordination/acceptance/archive/verify_archive.py --self-test` passed all 6 self-tests.
- The read-only static audit passed for archive payload fields, source pins, manifest/archive bindings, final source comparisons, preserved author/review hashes, the N3 gate, and attempt-05 evidence.

Exact command output and hashes are retained under `coordination/reviews/XR-FIX-BUILD/`; source and record hashes are in the XR-FIX-BUILD receipt.

## Scope and limits

This is an independent review of the bounded repair and its helper checks. I did not run `run-compiled-capabilities.sh`, build a full attempt archive, change production files, modify the original E-BUILD or XR-BUILD records, or perform Git operations. Root must still run the fresh integrated chain and verify its real archive with `verify_archive.py --require-complete`.
