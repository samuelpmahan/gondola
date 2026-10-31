# XR-BUILD-BASE: independent review of N5's base-reference repair

**Worker:** N3  
**Decision:** `accepted`  
**Date:** 2026-10-31

## Result

The E-BUILD-BASE report and receipt match their seal copies, and the report hash matches the receipt pin. Reviewed repair source hashes match the sealed receipt: `build.mjs` SHA-256 `a97518f48ea902d4bfe33dd12cdaf6d583fcfe0d845d36aa4f0ab76a3aa0331d` and `base-ref.test.mjs` SHA-256 `77a95d7b0d83abd96ceabf23a49ff136a2a6d4a57f78408532d51da8a1ea11b5`.

The contract header, builder constant, and new receipt all contain the exact 40-character reference `5662efcd7feb7920e4690d38cc76a297fed69d5a`. The builder validates the lowercase 40-hex form and equality with the parsed `PR17` header before it creates output directories or starts a build. The four targeted Node tests passed: exact full reference, rejection of the historical 39-character prefix, rejection of a different 40-character reference, and rejection of a malformed contract. Both syntax checks passed.

I independently checked both retained run directories without rerunning either build. In each run, React and DOM have 67 physical output files, all output files match that run's recorded inventory, and the provenance contains 87 source-input pins. Both 87-pin sets are identical and rehash cleanly against the current tree; they include `backend-qualification/CONTRACT.md` at 7,213 bytes and SHA-256 `9416f6e12dab2674f355026106e1a8cceb2ab509f8f5287bd189a799e20745be`. The React and DOM AppIR hashes match across both runs and the original E-BUILD build. Each run's 50-event, 45-step native trace is byte-identical to the original E-BUILD trace.

The original E-BUILD source, report, and receipt remain intact under their seals. The historical E-BUILD packet retains its original 86 inputs; this repair's two build records correctly show 87. These are builder-input pins, not the outer 152-plus-8 source snapshot or a complete repository/source-candidate attestation; that broader audit remains with root/N6.

## Repeat-run note

Each retained output tree matches its own build manifest and file hashes. Comparing the two runs, each React and DOM inventory differs only at `apps/publications-5ad33d9496e7/gobi-compiled.mjs`. The module hashes differ because 34 generated line comments contain per-run temporary stage paths; the differing lines are comments only, with no differing non-comment line. The repair packet claims matching 67-file counts, identical AppIR, and identical native traces, not byte-for-byte identity of these temporary-path comments.

## Evidence and scope

`rawlogs/XR-BUILD-BASE/audit-build-base.py` rehashes both 87-input sets, four 67-file output trees, AppIR/native evidence, the repair packet, and the historical E-BUILD seals. The focused four-test rerun and syntax-check logs are also included. No source, Git state, scheduler/native state, or full build was changed or rerun by this review.
