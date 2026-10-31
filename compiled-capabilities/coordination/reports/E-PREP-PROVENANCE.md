# E-PREP-PROVENANCE — Source provenance auditor preparation

**Worker:** N1  
**Outcome:** `mixed_change`  
**Acceptance state:** preparation only; the full capability run and publication binding are pending.

## Prepared auditor

Added `compiled-capabilities/coordination/acceptance/provenance/audit.mjs`, a read-only CLI auditor for the source provenance portion of E-BUILD acceptance. It checks:

- E-BUILD `sourceBefore` and `sourceAfter` contain the same unique path, byte-count, and SHA-256 rows.
- The pin set exactly covers paths derived from the pinned runner's source file and directory lists, plus the signed generated-map exception. For each regular source input, current bytes and the local and published Git blobs match the pin.
- A publication binding uses the frozen base commit, and the local and remote commits resolve to the bound trees and the same direct parent list. Both must directly parent the frozen base. Local and remote commit IDs may differ.
- The original M0 `SHA256SUMS` bytes match the frozen base, all 23 tracked M0 inputs and `EXPECTED.json` retain their original bytes, and `react-map.gen.mjs` remains an untracked generated file matching its signed SHA-256 row.

Missing receipt, full-run pins, publication binding, local source commit, or expected tree yields `status: incomplete` and `finalAcceptance: false`. The CLI does not validate archive or build artifacts; those checks are assigned to other acceptance work.

## Checks run

Using Node v22.23.4:

- `node --check compiled-capabilities/coordination/acceptance/provenance/audit.mjs` — passed.
- `node --check compiled-capabilities/coordination/acceptance/provenance/audit.test.mjs` — passed.
- `node --test compiled-capabilities/coordination/acceptance/provenance/audit.test.mjs` — 3 tests passed, 0 failed. Coverage includes safe/unique source pins, order-independent pin equality, distinct local/remote commit IDs with matching tree/direct parent binding, and fail-closed missing evidence.
- Ran the auditor against the current E-BUILD author preflight with the frozen base commit/tree and without a publication binding. It exited 2 and reported `status: incomplete`, `finalAcceptance: false`, missing full-run pins and binding, while confirming 23 tracked M0 inputs and the generated map against the original 24-row manifest.

Raw command output is preserved under `compiled-capabilities/coordination/acceptance/provenance/logs/` and its hashes are listed in the receipt.

## Pending evidence

The current E-BUILD receipt is an author preflight: it has no full-run `sourceBefore`/`sourceAfter` pins. The root-owned source commit, remote publication binding, and completed full-run receipt are not available yet. Therefore this preparation did not validate full-run source pins or the local/remote binding and does not claim milestone acceptance. Run this auditor with those exact inputs after the root completes the full run and publication binding.

No commit, merge, deploy, or Git mutation was made.
