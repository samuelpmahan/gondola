# E-FIX-ARCHIVE-SUITE-ADMISSION: accept future passing archive tests

**Outcome: mixed_change.** N6 changed one guard in `compiled-capabilities/run.mjs` in the isolated checkout at source 978. The original bytes are preserved in primary child coordination. Syntax validation and a bounded probe of the exact source predicate passed. The full pipeline was not rerun; root will verify admission in a fresh integrated run.

## Repair

`runArchiveHelperTests()` now requires at least five TAP tests and requires every reported test to pass. The guard rejects missing test/pass counts, fewer than five tests, `pass !== tests`, and any nonzero `fail`, `cancelled`, `skipped`, or `todo` count. This admits five current passing tests and future additions that also pass. The stage receipt message records the actual passing count instead of hard-coding three. No other runner gate or source path changed.

## Source-978 failure record

The preserved full run at `compiled-children/coordination/failed-full-source-978/` shows `archive-helper-startup-regressions` produced TAP counts `{tests: 5, pass: 5, fail: 0, cancelled: 0, skipped: 0, todo: 0}` and exited 0. The inherited runner then rejected the successful suite because its guard expected exactly three tests. Root reported that the child-specific 46 unit tests, two GoScript builds, 9 oracle tests, 42 native/direct/browser events, 39 checkpoints, 12 mutation controls, 32 HTTP smoke cases, and the 239-member archive consumer all passed. The archive SHA-256 is `a11817d20da1a167a016dba08cedd4ea2baf2aa75232d8fe0110e9193fde5c9f`; the independent consumer passed.

That attempt also recorded source-before/pre-archive pin errors. Root identified those as secondary to `sourceBefore` being unset in the attempt, not evidence of an actual source edit. Both failure details remain preserved in the source-978 bundle; this repair does not revise its receipt or report.

## Checks

- Node v22.23.4 parsed `compiled-capabilities/run.mjs` successfully.
- A bounded probe extracted and evaluated the exact `if` predicate from `runArchiveHelperTests()` in the edited source. It accepted 5/5 and 6/6 clean TAP counts; it rejected four tests, a failing test, a pass-count mismatch, cancellation, skip, todo, and missing counts.
- The full source-978 evidence independently records the existing real-tar helper suite at 5/5. No helper test source was changed for this task.

The probe, syntax-check logs, failed-source references, byte pins, and originals manifest are listed in `compiled-children/coordination/rawlogs/E-FIX-ARCHIVE-SUITE-ADMISSION/manifest.json`.

## Receipt validation

The receipt passed the existing read-only `compiled-children/coordination/probe.py::validate_receipt` using the pinned interpreter (Python 3.12.14, `rebalancer` 1.0.4). The check confirmed the active N6 job and that scheduler state bytes were unchanged. No solver, dispatch, or finish command ran.

## Limits

No full pipeline, npm or Go command, Git mutation, or scheduler write was performed. Final integrated acceptance remains pending root's fresh run.
