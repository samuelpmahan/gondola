# E-HISTORICAL-CUSTODY-BOUNDARY (N2): retry1 integrity and cleanup limits

**Outcome: `confirmed_reuse` for the preserved superseded history packet.** I independently streamed the retry1 archive and verified every member against `archive-inventory.retry1.json`. The archive is intact and all 902 inventoried members remain recoverable from it. This finding covers historical custody only; retry1 is superseded and is not runtime or CI acceptance.

## Retry1 archive verification

Command:

```sh
/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/N2-E-HISTORICAL-CUSTODY-BOUNDARY-verify-final.py
```

The read-only audit hashed the archive bytes and streamed the tar members without writing an extracted copy. The archive is **167,917,858 bytes**, SHA-256 `954bad6b31df16f92c8297d64a53029c26159c3aeede1694d53a626a90c4f1a7`. Its external inventory lists **902 members** and **2,252,949,830 uncompressed bytes**; all member paths, lengths, and SHA-256 values matched. The independently calculated outer archive hash and length also match the recorded retry1 integrity evidence.

## Cleanup boundary

The cleanup record for `compiled-children/evidence-preflight/archive-root` records removal of **903 files / 2,282,834,246 bytes** before that tree had per-entry hashes. Its correction compares the 902 known retry1 inventory entries (**2,252,949,830 bytes**) and identifies an aggregate difference of one file / **29,884,416 bytes**. A file of that size remains in the separate v1 stage at `/tmp/gobi-author-custody-final-stage-20261031-cut-125230/external-tmp/.gobi-children-n4-attempt04.browser.json.K7Jswf.eYJDeh`; I independently hashed it as `5893d3aea92f4513b911cdfd08dcf41018720dd556a85a2be604d5ea172ee296`. This size match does **not** prove that the retained candidate is identical to the deleted extra. The original per-entry identity/equality cannot be established from the available record. I make no claim that all 903 deleted staging files were recoverable or identical to retained files.

The later v2 cleanup record lists 874 removed rows totaling **2,252,623,803 bytes**. Every row's recorded path, size, and hash maps to a member of the independently verified retry1 archive. Those 874 rows reference 456 distinct retry1 members; 446 inventory members are not referenced by those v2 rows. The record reports no unverified retained entries. This confirms the recorded removed copies against preserved archive members, without claiming that the v2 stage represented all 902 inventory members.

The v3 cleanup record lists **875 files / 2,206,776,977 bytes**, matching the final selected archive inventory. The selected 875-member archive and its published 40-chunk history commit were already independently accepted in E-/XR-PUBLISHED-HISTORY-CUSTODY; I checked those receipt/report pins and did not repeat the selected archive or remote chunk stream here. The selected archive remains preserved locally and remotely. These records do not make retry1 current acceptance: it remains the superseded history archive.

The corrected cleanup record supersedes its earlier broad staging-recoverability wording. The known 902 retry1 members are intact; the aggregate extra is unresolved as a file identity. No source, receipt, selected archive, or failed runtime-attempt loss is claimed by this review.

## Receipt continuity and limits

The accepted E-PUBLISHED-HISTORY-CUSTODY receipt and XR-PUBLISHED-HISTORY-CUSTODY receipt both pin the selected archive at 164,464,000 bytes and SHA-256 `a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0`. Their report pins match the current files. The old 63-character XR-AUTHOR archive-hash typo was already superseded by those accepted packets; this task does not reopen it.

The retry1 archive and preserved inventory are the evidence for all 902 known members. `cleanup-verified-staging.json`, `cleanup-verified-superseded-stage.json`, and `cleanup-verified-final-stage.json` define the distinct cleanup boundaries. The retained candidate only accounts for the aggregate size difference; it is not a per-entry recovery proof. No npm, source, Git, scheduler, runtime, CI, or archive-creation action was performed.

The first archive audit-script attempt stopped because my checker asserted the literal phrase `notproven` while the cleanup record says `not proven`; its command, exit code, and stderr are preserved. A first receipt-build attempt also used the wrong directory for `superseded-retry1-integrity.json`; that file-not-found command and error are retained. After correcting these checker/packet paths, the final audit and native receipt validation passed. Neither initial error indicates an archive mismatch.
