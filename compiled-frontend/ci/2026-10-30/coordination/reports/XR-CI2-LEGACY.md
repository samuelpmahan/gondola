# XR-CI2-LEGACY — independent review

**Decision: accepted** for the bounded CI and source-preservation packet on PR #11 head `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`. This review verified the retained evidence without running workflows, downloading artifacts, or modifying application/compiler sources.

## Run and log evidence

The final PR-filtered snapshots contain 11 runs and 11 job groups. Every receipt row matched its run ID and job ID; each matching run and job is completed successfully. All 11 retained PR job logs match the SHA-256 values in the CI2-LEGACY receipt and contain all three inherited baseline markers: `same over 5000 inputs`, `receipt matches`, and `SHA256SUMS ok`.

The separate final unfiltered snapshot contains 22 runs on the reviewed head: 11 `pull_request` and 11 `push`; all 22 are completed with `success`. The retained detailed logs are for the 11 PR-triggered jobs. The packet does **not** contain duplicate push-job logs, so the push conclusion is status-snapshot-only. The earlier in-progress snapshot also matches the packet’s historical statement: 4 of 11 push runs were completed successfully and 7 were still in progress at that observation time.

The completed logs support the per-workflow parity figures in the primary report. The compiled-frontend log records four apps, five scripts, 43 ticks, zero mismatches, demo smoke success, and artifact upload metadata. This review did not download or rematerialize that artifact.

## Inherited baseline and source inventory

The hashed source inventory agrees with the receipt’s source head, tree, and parent. It records the inherited baseline as 5,000 cases with seed `20261030`, verdict `same over 5000 inputs`, 59 executable rule literals, and 24 checksum pins. It shows 23 pins present and matching before the emitter; the sole missing entry is generated `react-map.gen.mjs`, which the report says is emitted before checksum validation in completed runs.

The same inventory records base `42df6883337605d901a23e9fed874768c7ce1824` with 1,228 paths and head with 1,841 paths; its base-to-head diff is 613 additions and no modifications or deletions. That supports the bounded statement that the predecessor paths remain unchanged. The prior-head delta is 14 paths (3 modifications, 11 additions). This cross-review verified the saved inventory hash and contents; it did not independently rerun the Git diff.

## Findings and limits

No discrepancies were found in the 11 PR run/job/log mappings, baseline marker checks, final 22-run event/status counts, source identity, or the cited baseline/preservation counts. The review is limited to saved PR logs plus run snapshots and the saved inventory. It does not claim detailed push-log verification, a new CI execution, deployment or merge readiness, or general compiler correctness.
