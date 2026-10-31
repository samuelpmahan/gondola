# XR-PUBLISHED-HISTORY-CUSTODY (N3)

**Decision: `accepted`.** Independent verification supports the published-history custody packet. No must-fix discrepancy found.

## Findings

- With `GIT_NO_LAZY_FETCH=1`, the published commit is `45317abb8d6f7c1153ea9999927727fa43203710`, tree `375dda6c5ac7d3973a5b37d1e0deb6275a0c183d`, parent `9bd6c88a577f519d80b7be860f698363adcd1c05`; local HEAD matches that parent. Its exact 43 changed paths are all beneath `compiled-children/ci/2026-10-31/history/`.
- The independent rerun of N2's verifier passed and produced byte-identical output to its recorded final verifier output. It validated all 43 published Git blobs and each of the 40 chunk lengths, blob IDs, and SHA-256 values. The ordered stream is **164,464,000 bytes**, SHA-256 `a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0`, matching the manifest and E-AUTHOR custody record.
- The closed XR-AUTHOR receipt's `archive.sha256` field is a 63-character metadata value missing the final `0`; the expected stream hash is 64 characters. The current XR-AUTHOR receipt still matches its recorded historical SHA-256, so its exact bytes were preserved. The published manifest, reconstructed stream, and E-AUTHOR receipt/report carry the correct full digest. This is a receipt metadata typo, not archive corruption.
- The verifier checks the published README's historical-only label and checks the restore program's validation safeguards without executing restoration. The packet makes no current runtime or CI acceptance claim.
- All 4 source artifact pins, 26 rawlog pins, and the E-PUBLISHED report pin match their bytes and hashes.

## Verification boundary

Command rerun:

```sh
GIT_NO_LAZY_FETCH=1 python3 compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.py
```

Exit code was 0, stderr was empty, and its JSON output matches N2's final output byte-for-byte. The audit summary and output are pinned in `coordination/rawlogs/XR-PUBLISHED-HISTORY-CUSTODY-review-audit.json` and `XR-PUBLISHED-HISTORY-CUSTODY-verifier-output.json`.

This review verifies historical publication only. It did not run a full runner, npm, CI, or restore the archive to a duplicate file; it made no Git or native-state writes.
