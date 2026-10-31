# XR-CI2-PUBLICATION — N4

**Decision: `accepted`** as a bounded, accurate publication and artifact-delivery review. The successful CI claim is limited to the specified PR head and recorded five-profile run.

## Spot-check results

The refreshed PR metadata and source audit agree: PR #11 is open, draft, and unmerged; source head `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281` has tree `ca99e9432dca87a6bf6718c20186b1223b870126` and direct parent `408e330517b1dd5e5f865e2ff1914465f98bcf66`; base is `42df6883337605d901a23e9fed874768c7ce1824`. Synthetic merge candidate `b51f925399376ec611fedf867503b814b6c1db13` is correctly distinguished from the source head and has the same tree with base/head parents. The local alias in the preserved source snapshot has the same tree and parent.

Completion metadata and artifact audit agree on run `41144116537`, successful job `124365059288`, artifact `13020568606`, size `124,558,516` bytes, and digest `sha256:c3332c9b5d0186c47dab921902774de05eb2b8d0819c3ad69dc9eb045166947e`. The API record marks the artifact unexpired through `2027-01-28T23:22:48Z`. The completed metadata binds the artifact to the run and head. The report correctly avoids claiming an exact checkout SHA: completion metadata records checkout-step success but no checkout commit SHA, and the synthetic merge candidate remains separately identified.

The permanent retained subset is recorded as 3,490,468 bytes, SHA-256 `88c6a9568a7374bd0ff6ac4bda84d70a052285e7fd8eafd53e5a1532d4279eeb`, 314 members. The existing delivery-check JSON reports 25/25 checks passed, zero errors, 313 manifest rows verified (309 compiler files plus four selected inherited reports), and the remaining member equal to the extraction manifest. The corresponding archive metadata, extraction manifest, and delivery-check values agree with the report and receipt.

The CI execution result in the publication packet matches the immutable extracted receipt: passed, 33 commands, stable 116 source pins, 81/81 Node tests, five matched profiles, 43 ticks, and zero mismatches. The initial ENOSPC extraction attempt is disclosed with the bounded recovery; the complete original ZIP and every compiled artifact remain covered, while larger inherited shards are explicitly left only in that original ZIP.

## Evidence checked and limits

I checked the existing `source-refresh.json`, `source-snapshot.json`, `repaired-completed.json`, `repaired-archive.json`, extraction manifest, and `delivery-check.json`, plus the report and receipt hashes. Their exact paths and SHA-256 values are retained in `audits/XR-CI2-PUBLICATION/review.json`. No artifact was downloaded again, and I did not rerun the archive verifier, CI, build, or tests.

The report and receipt do not conflate PR source head with synthetic merge commit, state artifact expiry, distinguish the original workflow ZIP from the smaller retained subset, and disclose the extraction-recovery limit. I found no material contradiction requiring amendment. This review does not claim a merge, deployment, full inherited-shard inspection, or universal compiler coverage.
