# Compiled children historical evidence

This is the frozen **pre-repair author/review history**, not final runtime acceptance. Source publication: `9bd6c88a577f519d80b7be860f698363adcd1c05`. It preserves rejected attempts, the exact 235-log cutoff, and documented custody exceptions. See the source branch's `compiled-children/evidence-preflight/archive-inventory.final.json`, `coordination/reports/XR-AUTHOR-CUSTODY.md`, and `RESULTS.md`.

The archive contains 875 members, 2,206,776,977 uncompressed bytes, including 40 verified nested gzip streams. Compressed size: 164464000 bytes. SHA-256: `a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0`.

Git stores the archive in forty individually hash-bound chunks to keep individual blobs below GitHub's file-size limit. From a checkout of this evidence commit, run:

```sh
python3 compiled-children/ci/2026-10-31/history/restore.py
tar -tzf compiled-children/ci/2026-10-31/history/pre-repair-author-review-history.final.tar.gz
```

The restore command refuses to replace an existing archive and checks every chunk plus the complete byte stream. This publication does not alter source, Milestone 0 receipts, main, or any deployment.
