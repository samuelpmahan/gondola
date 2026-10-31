# R-RESTORE-CUSTODY: catalog of restore review evidence

**Outcome: `insufficient_evidence`.** This packet catalogs the frozen XR-RESTORE references, the bytes preserved in quarantine, and the newer capture. It makes no restore acceptance claim. The original XR-RESTORE packet is ineligible for final acceptance because its frozen receipt binds earlier raw outputs whose bytes are unavailable, while the newer capture has no newly generated comparison record.

## Preserved author and review references

The E-RESTORE author report (`e8e81c1db9e3f949ab1ee8788299ed90e060c81518497c471877b30d4f0d1100`) and receipt (`9dcc5282ccc30d4ab8fba0ff4ec52ab01567bc60a2a870dc2dcad27308abd24f`) remain the original author data, unchanged per root. The frozen XR-RESTORE report and receipt are preserved at `lanes/restore-custody/before-repair/XR-RESTORE.md` and `.json`, with hashes `4b84960baaa150d6691c78204057c45b4e3e7d9cd8a9c8fd362466e6c6415987` and `25459bae404239551cf9d21df6d6a35b6c40a153bd4bc00f289dd397b1acea87`.

Several frozen references still match retained bytes: the top-level `smoke-audit.json` digest (`ff7fce98387a2598ece8067ad4aa74f33b48162ed25aefe63b116e9266b9d493`), `verify_smoke.py` (`e8936372d6de71f04027b600b5b4fe6dd6c08409dccdd80c5fa92f8d84b69890`), `smoke.stderr.log` (`db12ad97221988bf346c55d06788e21a01bb6a683d69266bf732ed4d6d9763c8`), and screenshot (`6f366f62a04be4223324602333013b5bfc5c69aaf2c9eeb2edd61e44b8bd8053`). The retained smoke audit is still the old record: its embedded `restore_record_sha256` points to the unavailable old restore-audit JSON, so its top-level digest alone does not bind the newer capture.

## Lost frozen bytes and newer capture

The prior verifier (`95b5f40caa9bd0c44319296c9fe5acee03132d3acdb5293a180df64469c3e615`, 8,834 bytes), prior `restore-audit.json` (`20402278cf34ba544a74ffbb35f07b820eace1663d0f26d35c7d812aff3684a1`, 3,929 bytes), prior `smoke.json` (`7d5ef34edc2c7b71e9ec0e1d3af0ad036741d26b43382560340a0e154a12ba24`, 853,539 bytes), and prior `smoke.stdout.log` (`91aedfb40d87e48a79510a90ce2e1cc5696b4cdd61e1414fea1b3a6e189f1d4a`, 1,731 bytes) are unavailable. The first three are explicit frozen receipt references; the earlier stdout digest was captured before replacement but is not in the receipt.

The quarantine preserves the later verifier (`ed0c9ec60f9449788eff6c835805a612112ae632b82fd3bc683e492364f0847f`), later restore record (`16258189edfb4688cdd35ef2be2674aeadcc21302bf0f4ac141077d183daa557`, naming `/tmp/gobi-lifecycle-xr-restore-u0hhs2un`), later raw smoke output (`9fe409e1ab7dcd4da67e95ab5164c0ee3f9b37fda532021420c72079a0d26766`), and later stdout log (`dc7d485f850fdc1c2433dabde9c79afd0b5006c437fbbe157a53b348c82c51a2`). The screenshot bytes remained identical. The frozen smoke audit/verifier were not regenerated or run against this later capture, so it is cataloged as newer unbound data, not as a replacement accepted result.

## Sequence and limits

After the final XR-RESTORE report/receipt had been acknowledged, N4 added a canonical-path duplicate guard to the restore verifier and reran restore plus smoke. This overwrote the old verifier, restore record, raw smoke JSON, and smoke stdout. N4 disclosed the sequence; root quarantined the current lane and frozen XR-RESTORE report/receipt before repair. No E-RESTORE author data was changed. The earlier restore tree path `/tmp/gobi-lifecycle-xr-restore-a5lo0n55/demo/site` was reported as retained by N4 but was not independently checked during this catalog task.

No old script or JSON was reconstructed, and no restore or smoke was rerun here. The complete per-file hash inventory and dispositions are in `lanes/restore-custody/catalog/catalog.json`. Root owns state and Git; source remains pinned to `00da54ad0f5a4006b13a5cded18ce291845978bc`.
