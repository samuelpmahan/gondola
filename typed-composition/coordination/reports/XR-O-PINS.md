# XR-O-PINS — independent inherited-pin and restoration review

## Decision

**Accepted.** I independently checked the O-PINS report and machine evidence against the referenced Git objects and current bytes. The key totals and classifications reproduce, the multi-root refresh additions are correctly marked as unpinned, and both historical session-tree files are restored byte-for-byte to PR9.

## Reviewed inputs

| Input | SHA-256 |
|---|---|
| `coordination/reports/O-PINS.md` | `68aa7e7ac71ad42aa43372a74bdd1119c7f2045259d1cbd6f4b89e7bc0b9c06c` |
| `coordination/receipts/O-PINS.json` | `8fa4ad4a12d350a4ff8656930bb0d57e37cde62ed75c08ed5fefeb04c97a7bc5` |
| `evidence/inherited-pins.json` | `e362a4995f97f182ff202922cd529b0bfc31d1231bf75a10566fb2de568aac99` |

## Independent checks

- **M0 checksum:** I read `SHA256SUMS` from M0 `ed3fd43b24a58375032a6bc8f9ef0411bcb0ad46`, PR9 `d6d425765ee9d48eae22342a3cb75fab2e2871ba`, and the worktree. All three files have SHA-256 `8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0` and identical bytes. I parsed all 24 entries and independently hashed each current file; all 24 match M0.
- **Predecessor delivery manifests:** For all eight manifests listed in `inherited-pins.json`, current bytes equal their PR9 blobs and the recorded hashes. I recomputed every file hash in each manifest: **796 pins, 788 matches, 8 mismatches**. The mismatch paths and expected/current hashes match the evidence. The eight consist of two keyed-editor T3 host/test changes, two session-tree T3/R-T3 host/test changes, and four renderer-conformance pins that were already stale at PR8 and remain equal across PR8, PR9, and current.
- **Unpinned multi-root additions:** The four listed `multi-root/host.mjs`, `host.test.mjs`, `runtime.mjs`, and `runtime.test.mjs` entries each have `predecessor_pin: null`; none appears in the eight predecessor pin maps. Their current hashes and PR9 hashes match the evidence and differ from one another. The report treats these as intentional additions without claiming they were covered by predecessor pins.
- **PR8 exceptions:** For all four listed renderer-conformance exceptions, the PR8 blob, PR9 blob, and current file bytes have the recorded identical hash.
- **Historical-path restoration:** Current `session-tree/coordination/reports/XR-R-T3.md` and `session-tree/coordination/receipts/XR-R-T3.json` equal their PR9 blobs and the recorded restored hashes: `92ed6e2ed6d04d9b0530da0f2a837227779dbf17d83ddd76c5f2eb13cedd0ada` and `17f90f68683d86aa4ffb3dec6dd1bf135e4bdf65f15857a252719b14dc31225d`. I read only these two files; no historical path was modified.
- **Archived predecessor audit:** The archived pre-R-T3 `inherited-pins.json`, report, and receipt each match their recorded capture SHA-256. The archived report and receipt also compare byte-for-byte with the restored live A-PRESERVATION report and receipt. The inherited-pins archive is intentionally the earlier record and therefore is not expected to equal the refreshed current pin record.
- **Six preflight source samples:** All six recorded sample hashes equal their PR9 blobs. Five current files still match both M0 and PR9. README is the existing exception: its M0 hash is `d902638d147b9d2dbffbcebd82e8a62ab388234c387fa0d3a798829f4e6d7540`, its PR9 hash is `55a3521ddd5e4321b251e1dd352cc8db7813a2d5d7be910b7a6d19d60caa1773`, and current README is `8f2d142a0544630ce1a6787cc33c1bd94d4c38a9281f05fe58ab71fbb3bd57ed` as recorded in the evidence/report.

The Git objects for M0, PR9, and PR8 all exist. The checks were read-only Git object/current-byte comparisons using `git cat-file -e`, `git show`, and SHA-256 recomputation; no runtime or test suite was run.

## Audit correction and limits

An initial verifier draft had two incorrect assertions: it expected different mismatch-classification labels and compared the archived pre-refresh pin JSON to the refreshed current JSON. A later preflight assertion also had a malformed boolean count. I corrected those audit-script expectations and reran the bounded checks; they passed with the counts above. These were verifier mistakes, not discrepancies in the source bytes or evidence. The review confirms the recorded preservation/restoration claims; it does not reconstruct transient bytes that were overwritten before the saved sample, and it makes no runtime, seeded-oracle, or full-runner claim.
