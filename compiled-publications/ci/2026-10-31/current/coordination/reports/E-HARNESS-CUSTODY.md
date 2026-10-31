# E-HARNESS-CUSTODY additive correction

**Worker:** N4  
**Outcome:** `mixed_change`  
**Date:** 2026-10-31

## Corrected evidence entry

The sealed E-HARNESS receipt and report contain an incorrect SHA-256 transcription for the preserved fixed browser capture from attempt 005. The receipt records `10480e56a8f9a0c411e2b3fa794f95744616f538cd15ffa7e5910d28a1d19302`; the actual capture digest is:

`10480f72f01393911edb85939749dec64deefaa9ba2733720d4b801e67be3be1`

Both `run.browser.capture.json` and its paired `run.browser.json` are present, each 160,485,984 bytes, and `cmp` confirms they are byte-identical with that corrected digest. This addendum corrects only that metadata entry. The original E-HARNESS report and receipt and their seals are unchanged.

## Unaffected evidence checks

- The live E-HARNESS report/receipt hashes still match their sealed copies: report `1fa324297f6f8b28cbaaf968e548bc22b99326429681f50c699a560f2f94500d`; receipt `76474e974a98d124a16a0facae04ee18f422eefd4b21544edeed5401d76dedf7`.
- The compact fixed, mounted-seed, and swap captures and their fixed/seed check outputs still match the hashes recorded in the original E-HARNESS receipt. Their hashes are recorded in `rawlogs/E-HARNESS-CUSTODY/audit.json`.
- The current C3 runtime receipt remains byte-for-byte at its E-DELIVERY-pinned hash `79abd6b0f4eff15321d3ff5efd80f19c3dc72deea1f22ed18fabcbcfa10ab332` (242,893 bytes). It reports `passed`, `finalAcceptance: true`, and `sourcePinsMatch: true`. The current coordination E-DELIVERY receipt is also pinned in the audit log.
- The C3 browser, check, and seeded output files were read and hashed without modification; their exact paths, sizes, and digests are in the audit log.

No source, old report/receipt, sealed file, attempt capture, compact capture, C3 output, Git state, or scheduler state was modified. No files were deleted. This is an evidence-only correction, not a rerun or a new conformance claim.
