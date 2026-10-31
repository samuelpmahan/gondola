# E-FIX-BUILD: archive provenance and capability-check repair

**Outcome: mixed_change.** N6 repaired the full-run archive provenance gap and strengthened the N3 result gate. Focused helper and syntax checks passed. The full capability runner was not launched, so integrated acceptance remains pending root.

## Archive repair

Before the archive is made, `run.mjs` writes a mode-0444 `execution-before-archive.json` and adds it as a root member of the tar and its hash inventory. The snapshot carries the full `sourceBefore` pins, end-of-commands/pre-archive pins, toolchain and dependency records, command ledger, stage outcomes, and a copy of the pre-archive execution receipt. It explicitly says `archivePending: true`, `archiveStatus: PENDING`, `acceptanceStatus: NOT_FINAL`, and `finalAcceptance: false`.

The archive manifest remains outside the tar. The final outer E-BUILD receipt records its exact path, byte count, and SHA-256 alongside the archive hash. After archiving, `sourceAfter` must match both `sourceBefore` and the snapshot's pre-archive pins; the pre-archive pins must themselves match `sourceBefore`. The final canonical receipt remains outside the tar, so no receipt/archive self-hash cycle is introduced.

The new `archive-helper.mjs` owns the write-once snapshot and archive round-trip operations. Its focused test verifies the read-only snapshot, tar inventory, member hashes, extraction, and external manifest binding in a temporary directory.

## N3 gate repair

The N6 conformance gate now requires `check.swap.rejected.rawPreservationVerified` and `check.swap.compatible.rawPreservationVerified` to be true. It also checks the exact ordered nine-control list and requires `capabilityMutationControlsDetected === 9`, with every row detected and carrying a nonempty error string. The receipt stores both raw-preservation results, the detected count, and every `{id, detected, error}` row.

N3's separate focused attempt 05 was read-only checked against this frozen interface. Its run and capability check report `matched`; both raw-preservation values are true; all nine controls appear in order and were detected. This is focused N3 evidence, not the full N6 integration run.

## Checks performed

- Node v22.23.4 parsed `run.mjs`, `archive-helper.mjs`, and `archive-helper.test.mjs` with `--check`.
- `node --test compiled-capabilities/archive-helper.test.mjs` passed 1/1 test.
- `bash -n run-compiled-capabilities.sh` passed.
- The capability workflow YAML parsed successfully.
- `git diff --check` reported no whitespace errors in the changed runner, helper, test, or documentation files.
- The original E-BUILD receipt and report still match the source hashes recorded in XR-BUILD; the receipt also matches the preserved final author snapshot.
- A read-only assertion confirmed the N3 attempt-05 run/check status and all frozen fields. Its capability-check SHA-256 is `6800d53e9aa4d0a30e16c15e0a789e45ee4bdee3deebec9d01ef38483b377baf` and its run SHA-256 is `b535ceb0e88850b181d7fd36985425581a60231ef2fb9be7b50ff1a50b69ed24`.

The exact commands and source hashes are recorded in `coordination/receipts/E-FIX-BUILD.json`.

## Scope and limits

The full `run-compiled-capabilities.sh` chain, N6 archive, and integrated acceptance were not run. Root must launch the fresh full chain after the remaining review/freeze steps. The existing E-BUILD and XR-BUILD reports and receipts were left untouched. No M0 checksum, dependency lock, unrelated production path, or Git state was changed by N6.
