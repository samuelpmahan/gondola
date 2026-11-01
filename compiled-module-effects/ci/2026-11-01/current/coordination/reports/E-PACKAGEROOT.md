# E-PACKAGEROOT — coordination-root symlink guard repair

**Worker:** N2  
**Job:** E-PACKAGEROOT  
**Outcome:** `mixed_change`  
**Qualification:** publisher fixture repair passed; final root packaging awaits independent review

## Change

`pack_audit()` now checks the caller-provided, expanded absolute coordination path for a symlink and directory type before calling `resolve()`. This preserves the guard that `scan_tree()` already applied to the original path and prevents a directory alias from being canonicalized before validation. The check runs before output creation. Existing file, snapshot, deterministic archive, and exclusion logic remains in place.

The only modified publisher files are `/tmp/module-effects-publish/publisher/pack_audit.py` and `test_publisher.py`. The regression first demonstrated the bug: direct `scan_tree(alias)` rejected the root while `pack_audit(alias)` succeeded. After the fix, the same API-level test rejects the symlink alias and confirms a regular coordination root packages its marker file.

## Verification

Under Python 3.12.14, the new regression passed and the complete publisher fixture suite passed 7/7, including all six original fixtures. The red failure and green outputs are retained under `rawlogs/E-PACKAGEROOT/tests/`.

The original E-PACKAGE report/receipt seal and all 17 indexed E-PACKAGE rawlogs still verify. The prior XR-PACKAGE AMEND report and receipt remain unchanged. The other three publisher files match their sealed E-PACKAGE snapshots. Frozen restore remains SHA-256 `9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98`; consumer preparation remains SHA-256 `c1d7fed5afb75ca2cecbed4df8ddca50890d3cafd60dd5b0bfbc032e2a1e8a82`.

## Qualification boundary

This repair was exercised only against disposable fixture trees. I did not run the packer against the shared coordination root or create a clean aggregate archive; final packaging remains gated on independent review. No repository sources, restore/consumer files, Git state, or scheduler state were changed.

Exact commands, Python version, red/green tests, current source snapshots and pins, frozen-tool hashes, and preservation checks are indexed at `rawlogs/E-PACKAGEROOT/index.json`.
