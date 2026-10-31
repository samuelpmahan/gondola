# E-PUBLISHED-HISTORY-CUSTODY (N2): published history verification

**Outcome: `confirmed_reuse`.** The published immutable history commit contains the exact 164,464,000-byte pre-repair evidence archive described by its manifest. All published chunk blobs, manifest, restoration program, README, commit parent/tree, and archive stream hash verified. This is historical evidence publication only; it is not full runtime or CI acceptance.

## Commit and source boundary

I inspected commit `45317abb8d6f7c1153ea9999927727fa43203710` with `GIT_NO_LAZY_FETCH=1`. It has tree `375dda6c5ac7d3973a5b37d1e0deb6275a0c183d` and parent `9bd6c88a577f519d80b7be860f698363adcd1c05`, which was also the primary checkout's HEAD during review. The commit diff contains exactly 43 paths, all under `compiled-children/ci/2026-10-31/history/`: manifest, README, restore script, and 40 numbered chunks. No source path is part of this publication commit.

## Chunk and manifest verification

The published subtree has 43 Git blobs. For each of the 40 numbered chunks, I read the blob directly with Git, with lazy fetch disabled, and checked the actual byte count, manifest SHA-256, tree blob ID, and independently computed Git blob SHA-1. All checks passed. Thirty-nine chunks are 4,194,304 bytes each; `part-039.bin` is 886,144 bytes. Hashing the chunks in manifest order gives **164,464,000 bytes** and SHA-256 `a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0`, exactly matching the published manifest.

The manifest is 8,846 bytes, Git blob `8ceff2f13048f25a16827fe28167d567b8799a1b`, SHA-256 `afab2e266b8489eb42bca6c6c8b6524b1b23964cec724df5edac89f8edf11a3c`. The README is 1,197 bytes, Git blob `61324c9b54617d387386815194375df7c0717e3a`, SHA-256 `3624bdd58269405ca0f97a2d3b925af18d63f112d1ea41deff2d6ec469fa983b`. The restore program is 713 bytes, Git blob `d878f1ce644ad461ce5a5ea7aa5ed4d1a74cf8be`, SHA-256 `72f6c14ce5bac447a6ebf6068727cf8b0f328e986b6b8a9df815b0c39c02b0d4`.

The published README labels this as pre-repair author/review history, not final runtime acceptance. I inspected the published `restore.py`: it refuses to replace an existing output, validates each chunk's length and SHA-256, then validates the complete byte count and SHA-256. I independently verified the ordered chunk stream without materializing a duplicate archive; root reports a separate local restore with the same hash.

## Cutoff and custody exceptions

The published manifest binds the same full archive hash as E-AUTHOR-CUSTODY. The 235 selected / 23 post-cut rawlog counts, missing `7b124f…` original audit bytes, superseding `f814c0…` custody copy, stale three XR-ORACLE byte counts, superseded retry1 archive, five partials, and two unlisted temporary captures remain as documented in the source custody evidence. No restoration of the missing bytes or cause for the partial/temp files is claimed.

While checking continuity, I found a metadata typo in the already closed XR-AUTHOR-CUSTODY receipt. Its `archive.sha256` field is 63 characters and omits the trailing `0`: `a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e`. The expected 64-character digest is `a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0`; the published manifest and this independent chunk reconstruction match that full digest. The XR-AUTHOR report contains the correct digest, and the E-AUTHOR receipt/report both match it. The closed XR receipt is preserved unchanged; this is a prior receipt metadata defect, not evidence of archive corruption.

## Exact verification

The read-only verification command was:

```sh
GIT_NO_LAZY_FETCH=1 python3 compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.py
```

It verified the complete 43-path diff and all 43 published Git objects, including every chunk's actual bytes and both hash forms. The structured output is `N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.json`; exit code is 0 and stderr is empty. The earlier checker run that incorrectly required the XR receipt's malformed field to match the full stream digest is preserved with exit 1. The final checker records that mismatch explicitly and confirms the full hash against the E-AUTHOR receipt/report and the published chunk stream. An initial receipt-validation attempt also caught that I had edited the receipt-builder script after producing a receipt that pinned its previous bytes; its exit 1 and exact error are preserved. I rebuilt the receipt from the final builder and reran native receipt and pin validation successfully. This was a review-packet assembly ordering error, not a published-object mismatch.

No Git index, refs, source files, native scheduler state, or archive files were changed. No full runtime or CI run was launched for this verification.
