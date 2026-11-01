# XR-PACKAGE — independent review of sealed E-PACKAGE

**Reviewer:** N4  
**Job:** XR-PACKAGE  
**Decision:** **AMEND**  
**Reviewed packet:** sealed E-PACKAGE source inventory, report, receipt, raw-log index, five publisher files, and recorded tooling pins.

## Decision

The saved E-PACKAGE packet, its source copies, and its raw-log inventory are internally consistent. I reran all six synthetic publisher tests under Python 3.12.14; all passed. One confirmed path-policy bypass blocks acceptance: `pack_audit()` resolves the coordination root before the `scan_tree()` non-symlink-root check, so the packer accepts a symlink as the root even though direct `scan_tree()` rejects it.

The reproduction used a temporary coordination directory containing only `marker.txt`, a symlink to that directory, and a temporary output directory. Direct `scan_tree()` rejected the symlink. `pack_audit()` succeeded and emitted `coordination/marker.txt`. This is the root-level symlink guard bypass shown by the saved probe; it is not a claim about other traversal paths.

## Verified packet and fixture results

- The sealed report and receipt match `seals/E-PACKAGE/seal.json`. The 17 files listed in the E-PACKAGE raw-log index all match their byte and SHA-256 pins; the index excludes itself.
- All five publisher files match the sealed source inventory, the source pin manifest, and the live `/tmp/module-effects-publish/publisher/` snapshot. The live publisher directory contains exactly those five files. The focused test run left the pinned source snapshot unchanged.
- The frozen restore and consumer preparation tools are unchanged at SHA-256 `9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98` and `c1d7fed5afb75ca2cecbed4df8ddca50890d3cafd60dd5b0bfbc032e2a1e8a82` respectively.
- The six tests cover manifest-derived member/source-pin counts, 1 MiB segments with per-part SHA-256 and read-only Git blob hashes, commit and source closure binding, archive member pins, deterministic audit output, explicit duplicate/extraction/cache exclusions, retention of authoritative evidence, symlink members, and a before/after source snapshot mutation.
- Source code uses local Git inspection and `git hash-object --stdin` without `-w`; the review observed no network operations or Git mutations. Test and probe outputs were confined to temporary directories; review artifacts are in `rawlogs/XR-PACKAGE/`.

## Blocking finding: symlink coordination root bypasses guard

In the sealed `pack_audit.py`, `pack_audit()` calls `coordination_root.resolve()` at line 299 before calling `scan_tree()` at line 327. `scan_tree()` checks `requested.is_symlink()` at lines 63–66. Because it receives the resolved target, that guard cannot see a symlink supplied as the root path. The probe records both observations: direct scan rejected the symlink, while the packer accepted it and included the target file.

A narrow repair is to validate the caller-supplied coordination root as a real non-symlink directory before resolving it, then pass the validated canonical path through packing. Add an API-level regression test that calls `pack_audit()` with a symlink root and expects rejection. No source repair was made in this review.

## Acceptance boundary

No clean E-RUN/E-DELIVERY primary archive or manifest was available. I did not run the production packer against the shared coordination tree, create a final archive, or run restore/publication. The six passing cases are synthetic fixture coverage only. Root’s final audit pack remains gated on the external publisher repair and review, then the clean primary/archive stage.

## Evidence

The rerun test log, symlink-root witness, seal/source/raw-index integrity check, versions, exact commands, source hashes, and pins are indexed at `rawlogs/XR-PACKAGE/index.json`. The full prepared E-PACKAGE report and receipt are referenced from their seal hashes; they are not duplicated by this review.

**No E-PACKAGE or production source files were modified during this review.**
