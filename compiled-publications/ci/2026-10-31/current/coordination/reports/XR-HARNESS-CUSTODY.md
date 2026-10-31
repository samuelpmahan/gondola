# XR-HARNESS-CUSTODY independent review

**Worker:** N2  
**Decision:** `accepted`  
**Date:** 2026-10-31

## Finding

The additive E-HARNESS-CUSTODY packet corrects a metadata transcription error in the sealed E-HARNESS receipt for attempt 005. Both `run.browser.capture.json` and paired `run.browser.json` are present at 160,485,984 bytes, compare byte-for-byte equal, and independently hash to `10480f72f01393911edb85939749dec64deefaa9ba2733720d4b801e67be3be1`. The original receipt records `10480e56a8f9a0c411e2b3fa794f95744616f538cd15ffa7e5910d28a1d19302`; that original is preserved as sealed evidence. The discrepancy is in the receipt metadata, not the capture bytes.

The original E-HARNESS report and receipt remain byte-identical to their sealed copies (SHA-256 `1fa324297f6f8b28cbaaf968e548bc22b99326429681f50c699a560f2f94500d` and `76474e974a98d124a16a0facae04ee18f422eefd4b21544edeed5401d76dedf7`). The additive E-HARNESS-CUSTODY report and receipt also match their respective seals (SHA-256 `588f2b7293c20f42e9161efb99dfe8f5aa9d44c31457c0e3f962146741707961` and `0424511b673fe23d90bc3ec66374b7182b9b374887f1461b03916975807e0548`). Thus the correction is additive and does not rewrite either prior packet.

## Unaffected evidence

All seven compact evidence entries selected from the original receipt remain present and match their recorded hashes: the fixed, mounted-seed, and swap browser captures; fixed and seed checks; and compact unit-test log. The current C3 delivery receipt still pins the runtime receipt at 242,893 bytes and SHA-256 `79abd6b0f4eff15321d3ff5efd80f19c3dc72deea1f22ed18fabcbcfa10ab332`; that receipt remains `passed`, with `finalAcceptance: true` and `sourcePinsMatch: true`. The browser, check, and seeded outputs also match the additive packet's byte counts and hashes. C3's declared scope is the typed-input/keyed-publication profile; inherited PR16 CI is separately pending, so this review makes no broader runtime or CI claim.

The audited files were present. This review was read-only and deleted nothing. It did not rerun tests or runtime conformance.

## Reproduction and evidence

From repository root, run:

```sh
python3 compiled-publications/coordination/rawlogs/XR-HARNESS-CUSTODY/audit.py > compiled-publications/coordination/rawlogs/XR-HARNESS-CUSTODY/audit.json
```

The script hashes files in 1 MiB blocks and compares the paired captures and live/sealed packets in 1 MiB blocks. All ten recorded checks passed. Audit JSON SHA-256: `8a63e1bf1dc989ab49ad9a97deaa3af9c204875021581b4517860460ecf63895`.

Decision scope: accept the additive custody correction and its preservation evidence. This is not a new runtime acceptance or a rewrite of the original E-HARNESS packet.
