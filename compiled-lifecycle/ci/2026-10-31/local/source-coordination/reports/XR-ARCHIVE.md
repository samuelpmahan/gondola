# XR-ARCHIVE — independent review of E-ARCHIVE

**Decision: accepted for the archive bytes and the external inventory as reviewed.** The tar contents, paths, member hashes, byte counts, selected roots and current source tree all agree with `members.json`. This review does not promote any historical run or claim that the archive is a release artifact.

## Verification method

I checked E-ARCHIVE's report and receipt hashes, then verified `/tmp/gondola-lifecycle-history.tar.gz` with an extraction-free streaming audit. The audit consumed the gzip stream through EOF, so gzip CRC/size validation ran, and parsed every tar member without writing extracted files. For each regular file, it checked the tar byte length and SHA-256 against the external inventory and the current repository source. It compared the complete tar and current-tree path sets against the inventory, checked directory entries, verified the selected root boundaries, and inspected recorded statuses from the archived attempt metadata.

Audit implementation: `compiled-lifecycle/coordination/reviews/xr-archive/verify_archive.py` (Python 3.12.14). The per-member results, including hashes and source comparisons, are in `member-checks.json`; aggregate results are in `audit.json`.

## Results

| Measure | E-ARCHIVE claim | Independent result |
|---|---:|---:|
| Compressed archive size | 20,398,966 bytes | 20,398,966 bytes |
| Archive SHA-256 | `09d8f49c7d039a44ad0ba1e10973aaa1d2a7c561c6972f05d1ceb24dba47f4a6` | Match |
| Regular files | 261 | 261 |
| Directories | 92 | 92 |
| Total tar members | 353 | 353 |
| Regular-file bytes | 435,916,585 | 435,916,585 |
| File names, lengths and SHA-256 values | Match inventory | All 261 match |
| Directory names | Match source tree | All 92 match |
| Current selected source files | Match inventory | All 261 match |

The full external inventory at `compiled-lifecycle/coordination/archive/members.json` has SHA-256 `716d61ef287c3a4b0cffdb1a79d41710489d8fd0ce580197e19392b3255cd9f5`. E-ARCHIVE's report hash `c8a0094dfaadae26598af8f8a9a81a0116d69ee172ef7cae72dc7ba39eab3a34` matches its receipt. No tar member has an absolute path, a `.` or `..` component, a duplicate name, or a path outside the selected roots. All members are regular files or zero-size directories; there are no links or special members. Every selected root is present with files beneath it, and the full current contents of those roots match the inventory exactly.

The archive includes the six conformance attempts `00` through `05`, the failed demo ABI attempt, and the nine named closed review roots: `r-oracle`, `xr-demo`, `xr-effect-slice`, `xr-fixture`, `xr-harness`, `xr-oracle`, `xr-oracle-repair`, `xr-runtime`, and `xr-unmount`. It includes no conformance attempt after `05`, no other demo attempt, no portable-test review, no `node_modules`, and no recursively included archive inventory.

Historical statuses remain distinct in the archived metadata:

| Evidence | Recorded status | Review treatment |
|---|---|---|
| Conformance attempts 00–04 | `rejected` | Preserved as rejected; not acceptance evidence |
| Conformance attempt 05 run/check | `matched` / `matched` | Preserved with its own scope and source pins; the archive itself adds no acceptance claim |
| Demo attempt `01-slice-abi-failure` | `failed`, `acceptance=false` | Preserved as a failure; not acceptance evidence |

The inventory records a pre-archive source-manifest SHA-256 `530dadc448ebe90bbb9068c9454f7bd800e3afb93021029bae3ce566c0bd067c`, and reports that source before/after members were equal. Independently, I verified that every archived file and every current source file matches the per-file entries in that inventory, and that the selected source directory trees are identical. The inventory does not include two separate full before/after snapshot files, so I cannot replay the original two-snapshot comparison itself; the source-stability flag and pre-manifest digest are recorded assertions cross-checked against the archive and current tree.

## Scope

This decision accepts archive integrity, inventory agreement, and the declared closed-root contents. It does not accept or reclassify any included build/test attempt, claim that missing historical source snapshots were recovered, or cover active work created after attempt-05. The E-ARCHIVE report itself records the historical XR-RUNTIME source limitation; the archive preserves that report and the available reproductions and hashes.
