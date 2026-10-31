# XR-AUTHOR-CUSTODY (N2): independent archive review

**Decision: `accepted` for historical custody only.** The final author/review archive is internally complete against its frozen content inventory, the exact 235-entry cutoff selection, and the external member inventory. This review does not accept the later full runtime pipeline, delivery, or CI.

## Archive integrity and streaming review

I read the final archive once with Python `tarfile` in streaming `r|gz` mode. For each regular member I checked the path, uncompressed byte length, and SHA-256 against the external inventory. I also independently streamed the archive's outer SHA-256 and decoded each nested `.gz` member in memory with zlib; I did not extract members or make a second archive copy.

The read-only final archive is `compiled-children/evidence-preflight/pre-repair-author-review-history.final.tar.gz`: **164,464,000 bytes**, SHA-256 `a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0`, mode `0444`. The independently checked external inventory is 189,820 bytes, SHA-256 `e48e7cd189dc1038dc3f964937b07edaa73459d104554b5a2f619877ae960470`. All **875** members match; their uncompressed total is **2,206,776,977 bytes**. All 40 nested gzip members contain 40 complete streams and decompress to 328,628,073 bytes.

## Cutoff and archive contents

I recomputed the cutoff from the archived source `CONTENT-INVENTORY.json`, rather than trusting the archived selection file alone. At cutoff **2026-10-31 12:52:30 UTC**, the source inventory has 258 coordination rawlog records: exactly 235 at or before cutoff and 23 after it. The recomputed selected paths and hashes match the frozen selection and archived rawlog member set exactly. Every selected source path still exists and matches its cutoff size/hash at review time (235/235). No post-cut rawlog is in the final archive.

The archive contains the exact 17 report/receipt pairs mapped in `RECEIPT-ARTIFACT-MAP.json`, 251 N4 attempt files limited to attempts 01–12, and only the two recorded author demo output directories (`author-smoke-20261031` and `author-smoke-20261031-rerun1`). The archived cutoff state/spec snapshot is the ten-file snapshot timestamped **2026-10-31 12:51:44 UTC**, native epoch 11, state SHA-256 `ee3bfa067e027a16d6efb8cc9c189da77066a9240a342fdd45a109dcf12e7611`. I compared all ten frozen snapshot files with the archived copies. At review, mutable native state was epoch 18, SHA-256 `f7c48085f5808ebd26e7c3d4eeb73bf94ff3aa12a9b128535c61dba965d35a37`; it differs from the historical snapshot. The snapshot claims apply to the archived epoch 11 bytes only.

## Preserved exceptions and excluded evidence

All five archived repair-original manifests and all 15 preserved original files match their recorded byte counts and SHA-256 values. One manifest records the original `compiled-frontend/conformance/no-wasm.mjs` path and separately preserves its original bytes at `compiled-children/coordination/repairs/E-FIX-WASM-OBSERVABILITY/originals/no-wasm.mjs`. The source path is not itself a second archived file; this is consistent with the archive's frozen author-evidence and original-copy scope, and is not a missing-preserved-original finding.

The archive does not contain the unavailable E-ORACLE audit-script bytes pinned to `7b124f1f2a3c5ac4d36e2f0d255b7b1548b4d095bb8e2c9b0b82bfa846a2466e`. It preserves the recorded current `f814c0…` version and custody copy (both 7,470 bytes and hash `f814c0aea342736b9227b85614d87285110912898e55f92f60a1b38412cd8853`). I make no restoration claim; this historical mismatch is represented accurately.

The old XR-ORACLE rawlog ledger's three byte counts remain stale (1,497 vs 1,958; 224 vs 238; 20 vs 21), while the SHA-256 values match. The superseding author ledger records the actual lengths and matching hashes. It does not rewrite the historical packet.

The final archive excludes retry1 (167,917,858 bytes, SHA-256 `954bad6b31df16f92c8297d64a53029c26159c3aeede1694d53a626a90c4f1a7`), five stable archive-named partial files, and two unlisted temporary capture files. The 45,875,200-byte temp payload is present only in superseded retry1; the later 29,884,416-byte temp remains outside the final archive. Partial/temp origin and completion state remain unknown, as recorded; I assign no cause. None is represented as a completed capture. The final stage's preserved logs show two failed extraction attempts followed by the corrected inventory-bounded stage; the selected final archive itself verifies cleanly.

## Commands and scope

The independent audit command was:

```sh
/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-stream-audit.py
```

The successful stdout is captured in `N2-XR-AUTHOR-CUSTODY-stream-audit-rerun6.json`; exit code is 0 and stderr is empty. Earlier audit attempts and their exact commands, errors, and exit codes are retained alongside it. Those failures came from my checker initially assuming the final pruned archive was the source inventory, then assuming a current source copy must also be archived, and then from correcting schema/path assumptions. They were checker errors, not archive defects; the final checker uses the retry1 source inventory for cutoff recomputation and separately verifies preserved originals and the frozen snapshot. One initial receipt-validation wrapper run also failed because it redirected output over the success log that the receipt itself pinned; the resulting self-overwrite mismatch and exit code are preserved. I separated the first-pass failure log from the stable success-output log, rebuilt the receipt pins, and reran validation against that final pin set.

This is a read-only historical custody review. No source, archive, native scheduler state, Git state, runtime, or CI was changed or executed. The archive is accepted as the bounded historical packet described above; full-run and CI acceptance remain outside this decision.
