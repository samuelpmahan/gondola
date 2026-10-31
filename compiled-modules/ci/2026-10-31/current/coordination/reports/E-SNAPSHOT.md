# E-SNAPSHOT — archive the execution snapshot at the archive root

**Worker:** N4  
**Outcome:** `mixed_change`

## Change

`freezeArchive()` now writes the immutable `execution-before-archive.json` directly in the attempt root. `makeMembers()` already walks all files recursively, so it automatically inventories that root file. The archive helper's `includePaths` now admits the exact root filename as well as the existing directories. The shared archive helper remains unchanged and can read the snapshot at its documented extracted root path.

## Verification

- Node.js v22.23.4 syntax check passed for `compiled-modules/run.mjs`.
- `node --test compiled-capabilities/archive-helper.test.mjs` passed 7/7.
- A small fixture used the actual `writeImmutableSnapshot()` and `archiveAndVerify()` helper. Recursive file inventory automatically included the root snapshot, GNU tar 1.35 produced a two-member archive, and round-trip validation recovered the expected snapshot schema and matching source-pin record. The archive SHA-256 was `9cae8f7b11fb88db2bdee4c15f3feeea96ab2132fa0f8a63aa0af113ba9bc40f`.
- The preserved attempt `attempt-20261031T212507314Z-35` has a matched conformance summary (24 fixed events, 16 Go updates, 12 browser profiles, and three 40-event seeded runs). Root reported that this full producer then failed during archive verification because the helper could not find the root snapshot. The exact producer error is treated as root-provided task context; this task did not rerun the full producer.

Only `compiled-modules/run.mjs` was changed. The archive helper and its test file were pinned unchanged. No Git, application, fixture, or scheduler state was changed.
