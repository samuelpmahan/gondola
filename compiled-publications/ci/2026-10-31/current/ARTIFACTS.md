# Additional execution and archive custody

The original interactive counter also passed on the complete C4 checkout after the focused publication run. See counter-regression.json and counter-regression.log: 8 Node tests passed; 107 scripts (7 fixed plus 100 seeded, up to 80 actions each) matched pinned React19.3.1 and the native Go comparator across 4,473 initial/action ticks, seed20261030. The full trace is included in the supplementary audit archive as compiled-publications/ci/2026-10-31/current/counter/trace.json. This is an original-counter regression, not the whole inherited browser chain.

The primary runtime archive is the fresh C4 publication experiment; prior-C3 preserves its earlier successful run. Failed-attempts and outer-logs preserve the two initial failures. Runtime parts are exact Git blobs, checked against both SHA256 and Git object identity before tree publication.

The supplementary audit archive preserves complete coordination records, immutable author/reviewer seals, original raw logs (including failed and partial historical captures), compiler proof scripts and generated build evidence, and the original-counter trace. Historical captures are retained bytes, not accepted results. Its manifest inventories every regular member by path, byte count and SHA256. Restoring the audit archive requires about 1.8GB of disk space; primary runtime restoration is substantially smaller.

Assignment and acceptance receipts are also available directly under coordination/ without restoring the large audit bundle. The canonical original paths are restored under restored-audit/compiled-publications/coordination/. Use restore-audit.sh to reconstruct and hash-check the archive parts, then extract them there. No source, M0 receipt, or historical raw artifact was removed by this publication.

No production deployment or main merge occurred. CI observations are timestamped; queued/running workflows are not passing evidence. A later CI acceptance should be recorded as a new observation, preserving this checkpoint.
