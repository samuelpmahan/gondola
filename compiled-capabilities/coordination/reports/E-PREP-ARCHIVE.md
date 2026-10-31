# E-PREP-ARCHIVE: archive acceptance verifier preparation

**Worker:** N5  
**Outcome:** `mixed_change`  
**Status:** verifier prepared; no full-run archive accepted

## Deliverable

Added a read-only Python CLI at
`compiled-capabilities/coordination/acceptance/archive/verify_archive.py`.
It validates a final E-BUILD receipt against its external manifest and gzip tar
without extracting archive members. The verifier checks the archive and
manifest byte counts and SHA-256 values, exact tar/manifest/receipt member
inventories, member hashes, traversal and link/special-file rejection, the
immutable provenance payload, source pin equality, toolchain/dependency
equality, command-ledger prefix, and stage records. `--require-complete` also
requires a passed full receipt, no recorded failures, the expected milestone
stages, the final archive command sequence, stable source pins, and React plus
ReactDOM 19.3.1.

The verifier matches N6's planned payload schema
`gobi.compiled-capabilities-execution-before-archive/v1`, including
`archivePending`, `preArchiveSourcePins`, and
`sourcePinsAtEndOfCommandsAndPreArchive`. The external manifest must be bound
by `receipt.archive.manifest`; the immutable snapshot must be a hashed tar
member. The outer snapshot path is repo-relative, so the verifier checks its
basename and exact size/hash against the root-level tar member.

## Checks run

- `python3 -m py_compile compiled-capabilities/coordination/acceptance/archive/verify_archive.py` — passed, exit 0.
- `python3 compiled-capabilities/coordination/acceptance/archive/verify_archive.py --self-test` — passed, exit 0; one valid in-memory archive and five rejected mutations (wrong source pin, missing provenance member, tampered member, fake version, unsafe traversal member).
- `python3 compiled-capabilities/coordination/acceptance/archive/verify_archive.py --receipt compiled-capabilities/coordination/receipts/E-BUILD.json --root . --require-complete` — failed closed, exit 2 with `outer receipt is missing archive metadata`. The available E-BUILD file is still an author preflight receipt without a full-run archive.

The self-tests use in-memory tar fixtures. They do not stand in for an actual
full-run archive review. Root must execute the verifier against the final
E-BUILD receipt, archive, and manifest before recording archive acceptance.

## Scope

Only `coordination/acceptance/archive/`, `coordination/reports/E-PREP-ARCHIVE.md`,
and `coordination/receipts/E-PREP-ARCHIVE.json` are part of this preparation.
No production runner, original XR-BUILD evidence, M0 input, dependency lockfile,
or Git state was changed.
