# XR-BUILD: independent review of E-BUILD

**Worker:** N3  
**Decision:** `amend`  
**Date:** 2026-10-31

## Scope and result

I reviewed the immutable E-BUILD report and receipt, the sealed builder/source packet, its post-seal custody recovery, provenance/source-pin records, and the retained React/DOM output trees. The original E-BUILD report and receipt match their seal copies exactly: report SHA-256 `4df3b79f25de9a3714c9bd0464d41fb915c7c645438edada5d3401992d04ebcd`; receipt SHA-256 `2db247b2ab183171c5174726e28c05d3a2e968b274f21a08bd37b66d27189d84`.

The sealed builder is 17,452 bytes with SHA-256 `315a0d4f227ec99501b7eb4b4305ab16ed1c7a4a4659ace9975b36b584e66ad0`. The preserved reconstructed candidate has the same bytes and hash. The recorded post-seal changed builder is 17,398 bytes with SHA-256 `dd2ffe9434d7494722b2651155e2980f28251cdf13631ed3bbcffeb2dabda53d`; the custody record identifies the exact one-line omission of the baseline expectations source pin and says the post-seal run completed. I did not use that post-seal run as E-BUILD evidence. The sealed E-BUILD receipt/report were not rewritten.

The actual retained build trees independently match their 67-entry inventories, for 67 React files and 67 DOM files with no size/hash mismatches. Both actual AppIR files are 24,682 bytes and SHA-256 `e673590e57b0b4e5afbf77f5b654f73767f8f410cd35e5315e332c00d325c07f`; each exposes `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`. The 86 original source pins rehash cleanly when the builder entry is checked against its immutable sealed copy and the other 85 paths against the current tree. The retained native trace matches the receipt hash and contains 50 events and 45 steps. These checks reused existing build outputs; no build or full pipeline was rerun.

## Must-fix provenance mismatch

The contract's `Base` reference is the 40-character value `5662efcd7feb7920e4690d38cc76a297fed69d5a`. The sealed builder's `contractBaseCommitRef`, generated provenance, and E-BUILD receipt field `source.base_reference_from_contract` all contain only the 39-character prefix `5662efcd7feb7920e4690d38cc76a297fed69d5`. Although a Git implementation may resolve that prefix, it is not the exact contract value claimed by the field. This is the sole confirmed finding and makes the packet require amendment.

The repair should preserve the original sealed E-BUILD packet and publish a superseding provenance record with the exact 40-character contract value, a pin for the contract source, and pins that correspond to the repaired builder source. The retained generated artifacts do not depend on this metadata string, but the current packet cannot claim an exact contract reference. Root separately owns the final repository-wide source-pin/tracking attestation; this review does not claim the 86 build-input pins cover every current qualification source file.

N5's separately authorized E-BUILD-BASE edit briefly overlapped the read-only audit. Its transient observation is retained at `rawlogs/XR-BUILD/transient-authorized-repair-window.stdout.json`; it is not treated as E-BUILD source or confused with the earlier unannounced post-seal `dd2…` change. Review conclusions use the immutable `315a…` sealed source. Git tracked/ignored status was not checked in this review; root owns the planned source audit for the ignored builder path.

## Evidence

The independent checks and exact artifacts are pinned in `coordination/receipts/XR-BUILD.json`. `rawlogs/XR-BUILD/audit-e-build.py` rechecks the sealed receipt/report/source custody, 86 source pins, 134 retained output files, AppIR capabilities, native trace hash/counts, and the exact base-reference strings. No production files, original E-BUILD files, Git state, or scheduler/native state were changed by this review.
