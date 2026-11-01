# E-RESTORE — module-effects archive consumer preparation

**Worker:** N1  
**Outcome:** `mixed_change`  
**Status:** valid against the translated PR22 baseline; clean E-DELIVERY archive acceptance remains pending

## Adapter changes

Created the standalone `/tmp/module-effects-publish/restore.py` from the accepted keyed-module restore tool (base SHA-256 `0dac505c5e9949a2b6168dac955e40c7af805847f73ef27652e1962d603d3f68`). The adapter now requires the closed `gobi.module-effects-segments/v1`, `gobi.module-effects-audit-members/v1`, and `gobi.module-effects-archive-manifest/v1` schemas.

The segments index carries bounded `memberCount` and `sourcePinCount` values. The restore tool checks these against validated member rows and normalized source-pin entries, then derives the result counts from those validated structures. The old fixed 600-member and 157-source-pin checks are removed.

The primary manifest requires exactly the N6 keyset, including mismatch/test-source arrays, source-closure metadata, excluded duplicate log and regenerable bundle pins, archive pin, and snapshot verification. The validator checks exact nested shapes, canonical unique paths, matching source/member byte and digest pins, the test-pin subset, declared source-closure membership, and the `rootGoSum` claim that `source/go.sum` is absent while pinned `go.mod` is present. Excluded log and bundle paths are restricted to their declared `conformance/` suffixes and cannot also appear as archive members.

The fail-closed archive path was reused. AST comparisons confirm that `_safe_member_path`, `_assemble`, `_hash_file`, `_extract`, `_commit_no_replace`, duplicate-JSON-key rejection, and JSON decoding are unchanged from the accepted base. This retains strict regular-file extraction, duplicate and unsafe path rejection, gzip trailer draining, byte/SHA checks, and Linux `renameat2(RENAME_NOREPLACE)` commit behavior.

## Verification

The translated PR22 primary archive was assembled from its 25 preserved segments and verified against the original archive SHA-256 `1921ef063cd8f62f56384c72c65a0f87b26a6cabb015d3aff42040c96b6453d7`. The fixture translator changed only the schema/index metadata and added the new known metadata; the tar bytes and the 600 member / 157 source-pin inventories remain from the PR22 archive.

The final suite passed 14 tests under Python 3.12. Tests cover a small non-magic count manifest, bounded and mismatched counts, closed metadata schemas, source hashes and test-pin consistency, excluded path pin validation, effect audit schema, existing-destination protection, missing segments, duplicate and traversing paths, links, truncated gzip, and no-replace commit behavior. The real translated PR22 archive restored successfully: 25,697,770 compressed bytes, 372,962,548 expanded bytes, 600 members, and 157 source pins.

Commands and output streams are recorded under `module-effects-coordination/rawlogs/E-RESTORE/` and mirrored under `/tmp/module-effects-publish/rawlogs/E-RESTORE/`. The snapshots include the adapter, tests, fixture translator, and original accepted restore source. Segment-by-segment pins and metadata hashes are recorded in `input-pins.json`.

## Pending acceptance gate

This is baseline evidence only. No clean module-effects archive is available yet: E-DELIVERY's latest attempt stopped during generated-comment normalization while a separate E-BUILD repair is pending. The actual E-DELIVERY manifest/archive must be consumed after that clean run; no dirty or synthetic manifest is treated as acceptance evidence here.

The translated historical baseline records `excludedCompilerLogs:false` because its preserved source-pin set includes old compiler log files. E-DELIVERY's current source-closure metadata sets that field to true. The validator checks its boolean type and enforces the declared compiler-log exclusion when true.

SHA-256 establishes byte consistency, not publisher authenticity. The consumer remains Linux-only for atomic no-overwrite commit, and no repository production files, Git state, or scheduler state were changed.

## Version 2 correction — supersedes the preliminary 14-test freeze

The preliminary declaration used adapter SHA-256 `127436db71b0dcd51c49e3143155f9f807d6d6e286e59a5e8726d73aa94910f4` and 14 tests. Review identified that `excludedDirectoryNames` describes directory components, so it must not reject a file solely because its basename equals an excluded directory name. The adapter now checks parent path components only and includes a focused test proving both cases.

The final adapter SHA-256 is `9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98`; all 15 tests pass. The original 14-test logs and raw index remain preserved at `module-effects-coordination/rawlogs/E-RESTORE/versions/first-declared-14-test/`, with original raw index SHA-256 `c0eca9a45e4d82dc3ba3d07fc29ea6e82a7708c1720add3e48f57427905b407b`. The refreshed final raw index and receipt supersede the preliminary declaration without deleting it.
