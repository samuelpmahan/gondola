# XR-PREP-CUSTODY: independent audit of frozen evidence

## Decision

**Accepted.** The historical custody archive reconstructs from its 13 published chunks to the exact 13,252,799-byte archive recorded in the N4 receipt. I independently audited the exact selected member set and byte-compared all 127 archive members with their current original source files. The archive, catalog, and chunks remained unchanged.

## Independent verification

The review audit reconstructed the archive in a temporary directory under `coordination/reviews/XR-PREP-CUSTODY` without invoking the builder. Each chunk's path, order, offset, byte count, and SHA-256 matched the catalog and receipt. Concatenation produced archive SHA-256 `c40e8a0c2fecef574c118992dc85ba4ca1e2f5b1785a9b29fc588ff49f034324` and 13,252,799 bytes.

All 127 tar members matched the catalog and their corresponding repository files byte-for-byte, totaling 295,193,643 source bytes. The archive path set exactly matches the intended selection:

- Conformance attempts 01, 02, and 03; demo attempt 00.
- Closed author packets E-BUILD, E-DEMO, E-FIX-GO, E-GO, E-HARNESS, E-HOST, and E-ORACLE.
- Closed review packets XR-BUILD, XR-DEMO, XR-FIX-GO, XR-GO, XR-HARNESS, XR-HOST, and XR-ORACLE, including their selected review-directory files.
- The preserved failed native epoch-03 log.

Every archive path is a sorted canonical relative POSIX path to a regular file, with no absolute path, traversal, dot segment, drive prefix, backslash, or NUL. The tar metadata matches the catalog; owner, group, and timestamps are zero. The archive contains no mutable state, E-FIX repair packets, PREP packets, newer conformance attempts 04–05, newer demo evidence, custody outputs, or this review packet. The custody manifest's uncaptured-output notes match the E-PREP receipt and are corroborated by the closed E-DEMO and E-HOST reports: their initial selector failure, early environment-missing runs, and intermediate runtime regression lack separately captured raw logs.

The author report says four consecutive builds produced the same hash. I treated that as author evidence and independently performed one reconstruction/member audit from the published chunks; I did not rerun the builder or repeat the four builds. N4's read-only verifier also passed when rerun, reporting 13/13 chunks and 127/127 members verified.

## Verifier scope note

The N4 verifier checks archive and source integrity plus several named exclusions. Its exclusion checks are narrower than a universal future-input policy: they do not enforce the complete fixed allowlist or every possible later attempt, and they do not define Windows path rules. This does not affect the frozen archive audited here: the independent audit recomputed its exact intended 127-path set and confirmed all actual member paths are safe. N5's separate full-run archive verifier provides the stricter reusable contract for the future integrated archive.

## Scope and limits

This is a historical evidence-custody review only. The archive explicitly excludes later attempts 04–05, E-FIX-HARNESS, E-FIX-BUILD, and PREP packets. I did not overwrite or rebuild N4's archive, manifest, or chunks, run the full capability milestone, change production files, or perform Git operations. The custody package makes no full-run acceptance claim.

The independent audit script and logs are under `coordination/reviews/XR-PREP-CUSTODY/`; source hashes and exact counts are in the XR-PREP-CUSTODY receipt.
