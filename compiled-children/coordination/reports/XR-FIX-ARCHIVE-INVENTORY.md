# XR-FIX-ARCHIVE-INVENTORY (N3)

**Decision: `accepted`.** The frozen archive-helper repair addresses the directory-churn failure while preserving the archive inventory and listed-byte integrity checks. No must-fix issue found in the bounded repair packet.

## Review findings

- The secondary helper and test match the receipt pins: helper `ad424b1fa1b92368f29fea12b8ff78d49d4ee2348b78962ec420e0585080682d`, test `2dd1d91f8f9fd73054c5bb9bd46b2c4c0fb758f77f5f077090e6321777125cff`. The three public helper signatures match the preserved pre-fix originals. Archiving now uses a sorted NUL-delimited member list with GNU tar `--no-recursion`; archive member-set and extracted bytes/SHA-256 gates remain.
- The original manifest, both preserved original files, all 12 history files, and all 36 author rawlog entries match their recorded sizes and hashes. The initial old-helper witness is correctly marked as a flag-precondition failure that never tested tar behavior. The later final witness uses a behavior-only test and reports the real tar diagnostic.
- I reran the behavior-only old-helper test against the preserved old helper and final test source: it reached GNU tar and failed with `tar: harness: file changed as we read it` (exit 1). I reran the repaired helper suite: **5 passed, 0 failed**. Both helper and test syntax checks exit 0. The final behavior test has no tar-flag or file-list precondition, and the listed-byte mutation regression still requires an `archive round-trip mismatch` rejection.
- The prior source attempt and its separate 426-member container verification are recorded as historical context in E-FIX. I did not rerun or re-audit that container. The packet leaves writer identity unknown; this review does not modify or attribute the older archive corruption.

## Verification boundary

Commands run:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-capabilities/archive-helper.test.mjs
/tmp/gondola-node22/node_modules/node/bin/node --test --test-name-pattern='real tar archives only the frozen inventory while an unlisted hidden file churns' compiled-capabilities/archive-helper.test.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-capabilities/archive-helper.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-capabilities/archive-helper.test.mjs
```

The first command ran in `/workspace/scratch/39a56936f173/gondola-children-archive`; the behavior-red command ran in the preserved old-helper workspace `/tmp/gobi-archive-old-helper-final-10pxkn5p`. Raw outputs and exit codes are recorded under `coordination/rawlogs/XR-FIX-ARCHIVE-INVENTORY-*`. Full runner, npm, Git writes, and native state writes were not performed. This review does not establish a fresh integrated archive or current full-run acceptance.
