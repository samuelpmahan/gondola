# XR-FIX-ARCHIVE-AUDIT: independent verifier repair review

**Decision: accepted for verifier preparation.** N5's repaired read-only verifier rejects the four previously accepted consistent mutations and retains the archive, member, path, and source-binding protections reviewed earlier. This is not acceptance of a real E-BUILD archive.

## Review scope and result

Compared `coordination/acceptance/archive/verify_archive.py` and the E-FIX-ARCHIVE-AUDIT evidence with the four prior XR-PREP-ARCHIVE findings:

- **XRPA-1, command results:** Complete receipts require every immutable pre-archive command, embedded pre-archive command, and final outer command to have `exitCode: 0`, with no signal or error. Self-tests cover nonzero pre-archive and final commands, a pre-archive signal, and a final command error. Independent fixture replay rejected both nonzero cases plus signal/error with the intended validator errors.
- **XRPA-2, pending boundary:** The snapshot must retain `status: archive_pending`, the pending flags, and `archiveBinding.finalArchiveHash: PENDING`; the embedded E-BUILD receipt must be `full` and `running`; and the outer execution-snapshot status must equal `archive_pending`. Self-tests and the independent replay rejected the snapshot and outer-status contradictions.
- **XRPA-3, toolchain and locks:** Complete mode checks Node 22, root Go 1.24.x, compiler Go 1.27.3, required installed and locked dependency versions, agreement between installed and locked maps, and all three lockfile hashes against `sourceBefore`. The conditional `fast-check` check requires 4.10.2 when that dependency is recorded. The 20-control self-test rejects Node 18, locked-version mismatch, lock-hash mismatch, and fast-check mismatch. Read-only inspection confirmed the pinned Node executable reports `v22.23.4`; the current three lockfiles contain the declared versions. The runner does not report an installed fast-check version, and the review makes no such claim.
- **XRPA-4, file/directory collisions:** Tar validation rejects a file path colliding with an explicit directory or any required parent directory. Both the named self-test and independent replay reject the prior `react` file versus `react/` directory case.

## Hashing, inventory, and source-binding checks

`hash_tar_members` reads each regular member, verifies its byte count and SHA-256 against the manifest, rejects unsupported member types, rejects unsafe POSIX paths, and compares exact file and directory inventories. The independent replay rejected symlink and hardlink members, an unmanifested extra member, a missing listed member, and changed `sourceAfter` pins. The self-test separately rejects traversal, member tampering, and a missing immutable provenance payload. Source-before, pre-archive, end-of-command, outer pre-archive, and final source-after pins are cross-compared by the verifier.

The original `XR-PREP-ARCHIVE/deep-probes.py` was rerun unchanged. It exits 1 at its intentionally stale assertion that a consistent Node 18 receipt should be accepted; output confirms it is now rejected by the Node 22 guard. The original probe file and log were not edited. A review-only replay harness then exercised all 15 prior counterexamples and preservation controls against the current verifier, requiring the intended rejection for each; it passed.

## Commands and live archive status

- `PYTHONDONTWRITEBYTECODE=1 python3 compiled-capabilities/coordination/acceptance/archive/verify_archive.py --self-test` — exit 0; 2 valid fixtures and 20 named mutation controls.
- `PYTHONDONTWRITEBYTECODE=1 python3 compiled-capabilities/coordination/reviews/XR-PREP-ARCHIVE/deep-probes.py` — exit 1 as expected from the old test's acceptance expectation; the first repaired gap encountered is consistent Node 18, rejected with `complete receipt must record Node 22.x`.
- `PYTHONDONTWRITEBYTECODE=1 python3 compiled-capabilities/coordination/reviews/XR-FIX-ARCHIVE-AUDIT/replay-counterexamples.py` — exit 0; 15 expected rejections.
- `PYTHONDONTWRITEBYTECODE=1 python3 compiled-capabilities/coordination/acceptance/archive/verify_archive.py --receipt compiled-capabilities/coordination/receipts/E-BUILD.json --root . --require-complete` — exit 2; `outer receipt is missing archive metadata`.

At review time the E-BUILD receipt records `mode: full`, `status: running`, has no archive metadata, and has no `finishedAt`. The verifier therefore fails closed. Root's full run is still in progress; a final archive, external manifest, and outer receipt must be reviewed separately once they exist.

## Conclusion and limit

The four amendment findings are closed in the verifier preparation, and no remaining false acceptance was found in the required finite protocol. Acceptance is limited to the verifier's preparation and synthetic controls. The current full E-BUILD archive is pending, not accepted. Toolchain verification establishes consistency among recorded metadata and source pins; it does not independently authenticate arbitrary forged execution records.
