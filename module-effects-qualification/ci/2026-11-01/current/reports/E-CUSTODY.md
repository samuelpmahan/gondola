# E-CUSTODY — N5 checksum-list recovery

**Outcome: mixed_change (recovery only).** The missing original `rawlogs/E-OFFLINE/sha256sums.txt` was reconstructed byte-for-byte from the original frozen command order and the historical report hash preserved in my earlier tool output. The candidate is 1,133 bytes with SHA-256 `a201c2d9a38409755c0144a3af1045c17131b9cd500fb10519cab1983928b929`, exactly matching the sealed target. Root verified and restored the canonical file, and confirmed that the E-OFFLINE raw-log index has no remaining mismatches.

## Reconstruction evidence

The post-seal addendum specified the missing file’s target size and digest. The frozen E-OFFLINE `commands.txt` preserved the exact order of the eight inputs to the original checksum command. The first reconstruction used the current sealed E-OFFLINE report hash, `61966352bf57cca37b797d9ccb70ee075cf48b23c0e77bad3deb87065b334dad`; it was the correct size but produced digest `660fc1ddc7be122b78c62128f50a4938060cded68690858766248d8bf745725f`.

My earlier tool output, from before the later report amendment, recorded the historical report hash `11d72fa4780a80886477febc04e3373c0ffd5f2f845d60d893263890d6619cfe`. Substituting only that historical report-hash line into the same eight-entry candidate produced the exact target size and digest. The matching target digest verifies the candidate’s complete bytes and line ordering, rather than only confirming a plausible reconstruction.

The exact recovered candidate is retained at [`candidate-sha256sums-original-report-pin.txt`](../rawlogs/E-CUSTODY/candidate-sha256sums-original-report-pin.txt). The alternate candidate using the later report hash is preserved for comparison. Copies of the original addendum, frozen command record, seal, and raw-log index are included in the E-CUSTODY raw logs.

## Scope

This packet recovers one derived checksum-list serialization. It does not rerun the Go CLI or change the original directory/archive acceptance results. The sealed E-OFFLINE source, binary, CLI outputs, and reports remain the consumer evidence; the old and amended report hashes are metadata revision history, not a source or output integrity gap. No production source or Git state was changed.

## Evidence

- Reconstruction commands: [`commands.txt`](../rawlogs/E-CUSTODY/commands.txt)
- Candidate sizes and digests: [`candidate-check.stdout.txt`](../rawlogs/E-CUSTODY/candidate-check.stdout.txt)
- Historical and sealed report hashes: [`historical-report-pin.txt`](../rawlogs/E-CUSTODY/historical-report-pin.txt)
- Original target and frozen context copies: `input-addendum.json`, `input-frozen-commands.txt`, `input-seal.json`, `input-rawlogs-index.json`
