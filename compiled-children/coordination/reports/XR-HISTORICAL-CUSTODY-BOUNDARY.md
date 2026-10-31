# XR-HISTORICAL-CUSTODY-BOUNDARY (N1): independent historical custody review

**Decision: `accepted` for N2's finite historical custody finding.** I inspected N2's report, receipt, stream-verification source, inventory and cleanup records. I reran the stream verifier with the pinned native Python interpreter. It completed with exit 0, confirmed the retry1 archive outer size and SHA-256, and read each member from the tar stream to verify its path, byte count and digest against the retry1 inventory. No extraction or archive copy was made. The N2 receipt validator also passed with exit 0.

## Verified retry1 boundary

The superseded retry1 archive is **167,917,858 bytes**, SHA-256 `954bad6b31df16f92c8297d64a53029c26159c3aeede1694d53a626a90c4f1a7`. The pinned inventory contains **902 members / 2,252,949,830 uncompressed bytes**; all 902 member paths, lengths, and SHA-256 values matched in my stream rerun. The inventory SHA-256 is `cec1e261e9ac5da9adb00b32b4e06c72852f371122053df2708a50085d47567a`.

The later v2 cleanup evidence has 874 removal rows totaling 2,252,623,803 bytes. Each row maps by path record, size, and digest to an independently streamed retry1 member. Those rows reference 456 unique retry1 members, leaving 446 inventory members unreferenced by the v2 rows. The v3 cleanup record's 875 files / 2,206,776,977 bytes match the final inventory. These are separate cleanup scopes and do not imply that v2 covered every retry1 member.

## Explicit unresolved extra

The earlier staging cleanup record reports **903 files / 2,282,834,246 bytes**, while the 902-member retry1 inventory accounts for **2,252,949,830 bytes**. The aggregate difference is one file / **29,884,416 bytes**. A candidate remains in another stage with that byte count and SHA-256 `5893d3aea92f4513b911cdfd08dcf41018720dd556a85a2be604d5ea172ee296`; the records do not establish that it is identical to the removed extra. I therefore accept the verified 902-member retry1 boundary and explicitly do **not** claim all 903 removed staging files are recoverable or identified.

## Selected history and scope

The selected 875-member published archive remains a separate, previously accepted packet: E-/XR-PUBLISHED-HISTORY-CUSTODY pin it at **164,464,000 bytes**, SHA-256 `a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0`, associated with history commit `45317abb8d6f7c1153ea9999927727fa43203710`. N2 checked those prior receipt/report pins rather than re-streaming that archive. The old 63-character XR-AUTHOR hash typo is superseded by those accepted packets. Retry1 remains superseded history, not current source, runtime, browser, or CI acceptance.

The initial checker phrase mismatch and receipt-build path failure are preserved in N2's raw logs; the final verifier and native validation both pass. I made no production, README, archive, Git, or native scheduler changes.

## Reviewer packet validation note

One initial receipt-validation rerun redirected its output into a log that the same validator checks, truncating the pinned log before validation and failing with a byte-count mismatch. The command and both output streams are retained as `validate-review-self-pin-failure.*` under this review's rawlog directory. The final native validation ran with stdout/stderr sent to `/dev/null`, so it did not alter pinned evidence; it exited 0.
