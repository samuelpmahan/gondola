# XR-R-CI-BUILD-RETENTION (N6 independent review of N4)

**Decision: accepted.** The metadata-only retention supplement accurately distinguishes the provider ZIP's current worktree availability from Git retention and separates the readable tar copy from the ZIP container. I independently rechecked both archives against the retained index and verified that the consumed final-build report, receipt, audit, and prior review remain unchanged.

## Independently verified archive state

- `original.zip` is present in the dated worktree and rehashes to **14,931,201 bytes**, SHA-256 `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa`. Its **817 unique members** match the retained index by exact path, byte length, and SHA-256; extracted files match the ZIP bytes. The file is ignored by the dated `.gitignore` and is not tracked by Git.
- `ci-artifacts.tar.xz` rehashes to **5,217,080 bytes**, SHA-256 `91b781500ff5379cf118918f545b6593969cb28d5495014b68c9a3ea6ca9218d`. It contains **817 unique regular files** (no non-file members) totaling **87,153,279 bytes**, each matching the same indexed path, size, and SHA-256. At review time Git reports it as untracked (`??`); it is not committed or published yet.
- The ZIP and tar are verified independently against the index. No byte identity between their container formats is claimed.

## Preserved packet and scope

The consumed N4 final-build report, receipt, and artifact audit still match their hashes in the N4 supplement. N5's previous review report and receipt are also unchanged. N4's supplement pins its report, receipt, checker, and result consistently, and its result status is `passed`.

The report correctly limits its claim to the current local evidence worktree and says root publication is pending. It does not claim that the tar is already Git-retained or remotely available. I found no metadata or retention claim requiring amendment. The original build result remains a successful full push on source `195c9433179218348d4b9f2477ae1e0725337d15`; this review neither reruns nor expands that CI claim.

## Review procedure

The read-only independent checker is [`verify_retention_review.py`](../../lanes/reviews/xr-r-ci-build-retention/verify_retention_review.py). It independently rehashed the ZIP and tar, checked all archive members and extractions against `retained-index.json`, queried current Git ignore/tracked/untracked status, and recomputed the five preserved consumed-packet pins.

```sh
python3 compiled-backends/ci/2026-10-31/lanes/reviews/xr-r-ci-build-retention/verify_retention_review.py
```

It returned `accepted`; see [`independent-audit.json`](../../lanes/reviews/xr-r-ci-build-retention/independent-audit.json). No source, CI, build output, provider archive, prior packet, Git history, or coordination state was modified, and no CI/build/test command was rerun.
