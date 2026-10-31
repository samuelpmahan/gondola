# E-TEMP — safely remove the UTF-8 compiler test copy

**Worker:** N4  
**Outcome:** `mixed_change`

## Change

`runFocusedTests()` now records the names already present under `fixtures/compiled/` with the `utf8boundary-` prefix before any test runs. After the root Go and compiler Go suites finish, the runner considers only newly appearing prefix entries. It removes a candidate only when it is an ordinary directory containing exactly one ordinary `app.go` whose bytes match the tracked `compiled-frontend/build/testdata/utf8app/app.go` byte-for-byte. It unlinks that file and removes the now-empty directory; it never recursively deletes a tree.

All new candidates are checked before deletion. A new non-directory or symlink, extra file, non-regular entry, or modified `app.go` makes cleanup fail and preserves the candidate. Existing names are skipped and never removed. The compiler-test metadata records existing names, observed new names, and each removed filename, byte count, and SHA-256. Git status and source checks remain strict; `.gitignore` and test/application sources are unchanged.

## Verification

The preserved `ae701` producer attempt reached final source/status verification and failed because the status changed after the profile. The observed new path was `fixtures/compiled/utf8boundary-2424491191/app.go`; attribution to a particular test action is not established. That attempt's command and log remain preserved.

I evaluated the cleanup helpers from the current runner source against temporary fixture directories. The positive exact-copy case was removed. A preexisting matching directory was retained. Modified bytes, an extra file, and a symlink were each rejected and left in place. These checks did not touch the tracked fixture. Node 22 syntax validation passed, and the shared archive-helper suite passed 7/7. The full producer was not rerun; root owns the clean source-bound run.

Only `compiled-modules/run.mjs` was changed. No Go test fixture, application state, schema, profile count, Git state, or scheduler state was modified by this task.
