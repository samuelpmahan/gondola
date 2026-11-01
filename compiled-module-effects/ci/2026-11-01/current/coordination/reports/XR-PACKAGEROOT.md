# XR-PACKAGEROOT — independent review of the root-guard repair

**Reviewer:** N4  
**Job:** XR-PACKAGEROOT  
**Decision:** **ACCEPTED**  
**Qualification:** publisher fixture gate passed; final audit packaging remains a separate step.

## Result

The sealed repair checks the caller-provided expanded absolute coordination path with `is_symlink()` and `is_dir()` before calling `resolve()`. The check runs before output-path creation. The prior root-alias witness now rejects before producing output, while a real coordination root still packages its marker deterministically.

I independently reran the seven publisher fixtures under Python 3.12.14. All passed, including the six original cases and the new root guard regression. A separate temporary probe confirmed that a symlink root, a regular file root, and a missing root are rejected without creating output. Two separate pack operations on the same regular fixture root produced the same 118-byte archive SHA-256 (`5bf84142aaf6f0de5d576620dd935d7bc64a0ee994cfee31b7ec89ec76c5082c`) and included `coordination/marker.txt`.

## Preservation and scope

The new repair changes only `pack_audit.py` and `test_publisher.py`. The original E-PACKAGE report/receipt seal and all 17 indexed rawlogs still verify. The preceding XR-PACKAGE AMEND report and receipt remain unchanged. Both repair files match the new sealed source inventory and live publisher files; the other three publisher files match the original E-PACKAGE source pins. Frozen restore and consumer preparation remain at SHA-256 `9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98` and `c1d7fed5afb75ca2cecbed4df8ddca50890d3cafd60dd5b0bfbc032e2a1e8a82`.

The diff is limited to validating the caller root before resolution and adding the regression test. Existing regular-file scanning, content hashing, exclusion selection, before/after snapshot comparison, output no-overwrite handling, and cleanup code are unchanged. The retained original tests for deterministic audit output and mutation during packaging passed.

The sealed repair packet’s own rawlogs index is pinned in `seals/E-PACKAGEROOT/seal.json`; all 11 indexed rawlogs rehash successfully and the index excludes itself. The test and probe runs used disposable temporary trees. No publisher source, repository source, frozen restore/consumer file, Git state, or scheduler state was modified by this review.

## Acceptance boundary

This qualifies the external publisher fixture repair only. No clean E-RUN/E-DELIVERY primary archive or manifest was available, and I did not run the packer against the shared coordination root or create a final audit archive. The final audit package remains a later root-stage check.

## Evidence

The seven-test rerun, root alias/file/missing path probe, repeated deterministic real-root probe, packet/source verification, runtime, and exact commands are indexed at `rawlogs/XR-PACKAGEROOT/index.json`.

**No E-PACKAGEROOT or production source files were modified during this review.**
