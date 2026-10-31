# E-FIX-ARCHIVE-INVENTORY: explicit frozen tar inventory

**Outcome: mixed_change.** N6 changed the shared archive helper in isolated checkout `gondola-children-archive` (revision 935 (task-provided; no revision lookup performed)) and added real-tar regressions. The focused helper suite passes 5/5. The integrated full runner was not launched; root must run it against the frozen source.

## Repair

`archiveAndVerify` keeps its existing call signature and post-archive gates. It now validates that inventory paths are normalized relative file paths, rejects duplicates and paths outside the declared include roots, sorts the pinned `members` list, and writes that exact list as NUL-delimited paths. GNU tar receives `--no-recursion --null --files-from <list>` from the attempt root. This avoids recursively enumerating included directories while still archiving every file in the frozen inventory. The existing tar member-list comparison, extraction, and per-member byte/SHA-256 round-trip checks remain in place. The children runner imports this shared helper; no runner invocation or acceptance gate was changed.

## Regression evidence

The exact command `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-capabilities/archive-helper.test.mjs` passed all five tests under Node v22.23.4 and GNU tar 1.35. The unlisted-entry churn test contains no tar-flag or file-list preconditions: run against the preserved pre-fix helper, the same test reached real tar and failed with `tar: harness: file changed as we read it` (exit 1); run against the repaired helper, the full five-test suite passed. The suite includes the existing snapshot/round-trip checks plus two real-tar cases:

- A 12 MiB listed payload is archived while an unlisted hidden file repeatedly appears and disappears inside an included directory. The command succeeds, and the resulting archive contains exactly the frozen member list.
- A listed payload is changed after its inventory hash is captured. Tar itself succeeds, then the preserved extraction/hash gate rejects the mismatch.

Both edited files also pass Node syntax checks. Raw stdout/stderr and tool versions are under `compiled-children/coordination/rawlogs/E-FIX-ARCHIVE-INVENTORY/`; the manifest records byte counts and hashes.

## Original failure context

Root reported that source attempt `9bd6` completed inherited and new checks, native/direct/browser/HTTP checks, and the 32-case HTTP smoke with no semantic mismatches, then failed packaging with `tar: harness: file changed as we read it`. Its failed archive is 52,324,311 bytes (SHA-256 `57b2b63e5549e6e2a944c1f9658f165606847e701f809782c8d64f1759bcef4d`); the outside manifest is 86,400 bytes (SHA-256 `6a5822c0cfbd90f8327b7bc274cebd15509e13e3e29affa344d9210a2fd0b0c4`). Root’s later independent consumer matched all 426 manifest members and found no content/hash mismatch among the listed payloads. The inventory itself included the three listed transient files recorded in the rawlog manifest. The tar complaint is consistent with directory metadata changing during recursive traversal, but the writer and cause are unknown. Root reports that the immutable failed-artifact bundle is now recorded as `17a52c292f1a4b367f280c3ae043ad65fc09e858`; I rehashed the original archive and outside manifest at the exact preserved paths and confirmed both still match the root-recorded pins. The earlier precondition-only old-helper witness, the draft test and its logs, and both behavioral comparison snapshots are preserved under `compiled-children/coordination/repairs/E-FIX-ARCHIVE-INVENTORY/history/`; the earlier witness is explicitly not treated as tar-behavior evidence.

## Native receipt validation

The receipt passed the existing read-only `compiled-children/coordination/probe.py::validate_receipt` function using `/tmp/gondola-rebalancer-env/bin/python` (Python 3.12.14, `rebalancer` 1.0.4). The check matched the currently assigned N6 job and confirmed the scheduler state bytes were unchanged. A preliminary `python3` import attempt failed because that interpreter could not import the pinned dependency; its stderr is preserved, and no claim is made about why that interpreter lacked it. The pinned interpreter was then used successfully.

## Source pins and limits

- `compiled-capabilities/archive-helper.mjs`: `ad424b1fa1b92368f29fea12b8ff78d49d4ee2348b78962ec420e0585080682d`
- `compiled-capabilities/archive-helper.test.mjs`: `2dd1d91f8f9fd73054c5bb9bd46b2c4c0fb758f77f5f077090e6321777125cff`
- Pre-change copies and their hashes are preserved at `compiled-children/coordination/repairs/E-FIX-ARCHIVE-INVENTORY/originals/`.
- No full runner, npm install, Go command, Git mutation/publication, scheduler mutation, or primary source edit was performed by this repair.
- This focused regression proves the helper contract on a synthetic attempt. It does not replace a fresh integrated archive, source pin check, or independent post-command consumer verification.

The receipt and rawlog manifest provide exact command, tool version, source, original, and log hashes.
