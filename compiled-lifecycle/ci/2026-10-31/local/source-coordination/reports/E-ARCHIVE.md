# E-ARCHIVE

**Outcome: mixed change.** Packaged the specified closed lifecycle history into `/tmp/gondola-lifecycle-history.tar.gz` and wrote a repository-relative per-file SHA-256/byte inventory to `compiled-lifecycle/coordination/archive/members.json`. The archive is an additive custody copy; the raw source files remain in place.

## Contents and exclusions

The archive contains exactly these roots:

- `compiled-lifecycle/conformance/evidence/attempt-00` through `attempt-05`
- `compiled-lifecycle/demo/evidence/attempt-01-slice-abi-failure`
- `compiled-lifecycle/coordination/reviews/r-oracle`
- `compiled-lifecycle/coordination/reviews/xr-demo`
- `compiled-lifecycle/coordination/reviews/xr-effect-slice`
- `compiled-lifecycle/coordination/reviews/xr-fixture`
- `compiled-lifecycle/coordination/reviews/xr-harness`
- `compiled-lifecycle/coordination/reviews/xr-oracle`
- `compiled-lifecycle/coordination/reviews/xr-oracle-repair`
- `compiled-lifecycle/coordination/reviews/xr-runtime`
- `compiled-lifecycle/coordination/reviews/xr-unmount`

The tarball has **261 regular files**, **92 directories**, and **353 total members**. The regular files contain **435,916,585 uncompressed bytes**. Every inventory path is repository-relative, so extracting at the repository root restores the recorded paths.

Active/full attempts after attempt-05, `coordination/reviews/r-portable-test`, other portable/readiness work, `node_modules`, the archive inventory itself, and `/tmp` outputs are excluded. The tar was assembled from explicit source roots; it does not recursively include `coordination/archive/**`.

## Integrity verification

- Archive: **20,398,966 bytes**, SHA-256 `09d8f49c7d039a44ad0ba1e10973aaa1d2a7c561c6972f05d1ceb24dba47f4a6`.
- Inventory: `compiled-lifecycle/coordination/archive/members.json`, SHA-256 `716d61ef287c3a4b0cffdb1a79d41710489d8fd0ce580197e19392b3255cd9f5`.
- Pre-archive source manifest: SHA-256 `530dadc448ebe90bbb9068c9454f7bd800e3afb93021029bae3ce566c0bd067c`.
- Verified each tar file member's exact byte count and SHA-256 against the pre-archive source manifest; all 261 matched.
- Verified all 92 tar directory members match the selected source directory tree; no symlinks or other special members were present.
- Recomputed every source file after archive creation; the pre/post member inventories were byte-for-byte equal. No raw history was deleted, renamed, or edited.

## Historical source limitation

The archive preserves all files present in the specified closed roots, including review reports, receipts, test logs, and before/after reproductions. The XR-RUNTIME review records that the exact pre-bridge shared-runtime source bytes and its original lifecycle test bytes were unavailable in the workspace; the archive therefore preserves their recorded hashes and the available report/evidence, not those missing historical source snapshots.

## Reproduction

From the repository root, the archive was created with GNU tar using sorted names, normalized modification times and numeric owner/group metadata, with gzip timestamp suppression. The archive itself is outside the repository at `/tmp/gondola-lifecycle-history.tar.gz`; its file list and verification results are recorded in the inventory.

