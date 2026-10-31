# XR-CUSTODY — independent review of E-CUSTODY

**Worker:** N3  
**Decision:** `accepted`  
**Reviewed author packet:** N6 E-CUSTODY

## Result

The E-CUSTODY report and receipt are byte-identical to their seal copies: report SHA-256 `c85dd546c4fa7d594c77e72ed471a048c5673e5d46954efaef25b5b2a6b45beb`, receipt SHA-256 `4da2c028e435ad7611daa5823fc79a4352e46ff80b5fa072d5ab0d457207561d`. All 30 evidence entries named by the author receipt match their recorded sizes and SHA-256 values.

I reviewed and reran the supplied member audit with `GIT_NO_LAZY_FETCH=1`. It verified the 409 reconstructed tar members against the original manifest, the 181 archived `source/` members against local Git blobs at `f7874237b1ceb5dab195a40b12f8df8a3dcc45a0`, and the disjoint 289-prefix plus 120-raw-attempt recovery mapping. The rerun's JSON is byte-identical to the preserved author audit. This is a local content comparison, not external signature authentication.

A separate read-only custody check verified the three reconstruction parts individually and as a sequence:

| Part | Bytes | SHA-256 |
|---|---:|---|
| `member-exact.part000` | 1,048,576 | `c071a35863e045cf99010826e87176a5dc91e82b9a3bc6565a008f4465d531ff` |
| `member-exact.part001` | 1,048,576 | `1a7eba5d64d31f9f02d4d568135b6b3258ec767d283404ce09aed580cb00ee6b` |
| `member-exact.part002` | 382,265 | `e929cddd58cde1c14018efe8b10d8e36917cbb162853760341eeadf21caaeff6` |

Concatenating those bytes in memory yields 2,479,417 bytes and SHA-256 `8f018dd5c3be64ac41e6a2e40d294df2260a26b87e3cfbbcb15757acff8d5968`, matching the reconstructed archive. Its 409 unique names match the manifest set. The damaged archive is neither a reconstruction part nor a manifest member.

The producer's current archive file and the separately preserved damaged copy both have 2,097,152 bytes and SHA-256 `25ddcf58b12560eb2ba77ad94cd6f47e794e03a87486f2dd82b54741c83700f0`; reading the gzip stream reaches an unexpected end marker. The preserved producer receipt is byte-identical to the current producer receipt (266,827 bytes, SHA-256 `4bb5a1539666c31d0c099ca2dee7e78cb2e0c701ef4237929ccc705ef625b5b3`). It records the expected 2,484,521-byte archive SHA-256 `4bc54d8464753d6e39040f977eb42889cfaa958dc27fe440c3a83bef478f999f`, 409 members, and a passing consumer; its manifest also matches the preserved 77,846-byte manifest. Thus the member-exact reconstruction is supported by the original member inventory and producer record, while the original compressed stream has not been recovered.

The author receipt's 30 raw evidence pins match. Its before/after external-input boundary lists are byte-identical (2,254 bytes, SHA-256 `19e8f05c99c325981f60d79d6d585f53a90df75d2569f175bd432b65e5c5ad46`). The source pin history correctly distinguishes the earlier 177/405 snapshot from the final 181/409 inventory and identifies four historical evidence files added to the latter.

## Preserved audit corrections

Two reviewer-side audit harness errors are retained in rawlogs. The first seal comparison used an incorrect path below `seals/E-CUSTODY/` and exited before checking files; correcting it to the sealed `reports/` and `receipts/` subpaths confirmed both seals and all 30 evidence pins. The first split-part check compared a metadata record with an extra `members` field against a file pin containing only `bytes` and `sha256`; correcting the comparison to those two fields passed the archive and part checks. Neither error changed source, archives, manifests, producer evidence, or Git state.

## Scope and limits

No production source, archive, manifest, Git object, or native state was changed. This review did not rerun Go verification, the browser profile, HTTP smoke, or Milestone 0. The post-exit archive truncation's actor and cause remain unknown. The member audit supports byte-exact recovery of the 409 manifest-listed files, not restoration of the original compressed bytes, producer authenticity, or general decoder/platform safety. No Windows/macOS result is claimed.

## Evidence

Exact reviewer commands, exit codes, both preserved reviewer harness failures, member-audit rerun, object checks, packet/seal audit, versions, and source/evidence hashes are pinned in `portable-coordination/receipts/XR-CUSTODY.json` and `portable-coordination/rawlogs/XR-CUSTODY/`.
