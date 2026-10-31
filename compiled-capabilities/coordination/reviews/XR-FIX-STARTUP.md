# XR-FIX-STARTUP: independent review of clean-worktree startup repair

## Decision

**Accepted.** The bounded repair fixes the recorded startup failure: the runner recursively creates the attempts parent, then creates the unique attempt directory with an exclusive `mkdir`. The regression stage is source-pinned, runs before M0 and the inherited lifecycle chain, and requires exactly three clean TAP passes.

## Reviewed delta

I reviewed `git diff 2324068` for only these three files:

- `compiled-capabilities/archive-helper.mjs`
- `compiled-capabilities/archive-helper.test.mjs`
- `compiled-capabilities/run.mjs`

The diff contains no other paths. `createExclusiveAttemptDirectory` uses recursive creation only for `dirname(attemptPath)` and plain `mkdir(attemptPath)` for the child. This repairs the missing-parent `ENOENT` while retaining `EEXIST` protection for a colliding attempt name. The collision test also verifies that the existing marker file remains unchanged.

The helper and test file are both present in the runner's explicit `sourceFiles` pin array. The runner invokes the helper regression through the normal stage/command path, records the test receipt, and checks test/pass/fail/cancelled/skipped/todo counts. The stage is before M0 and inherited execution; a failed stage throws before those stages begin.

The preserved startup log confirms the prior failure occurred at `mkdir(attemptRoot)` with `ENOENT` because `builds/attempts` did not exist. Its SHA-256 matches the E-FIX-STARTUP report. The preserved Git bundle also verifies successfully and contains the failed-startup ref.

## Verification

Fresh checks passed under Node `v22.23.4`:

- `node --test compiled-capabilities/archive-helper.test.mjs`: 3/3 passed (missing parent, exclusive collision with sentinel preservation, and archive snapshot/round-trip regression).
- `node --check` passed for `run.mjs`, `archive-helper.mjs`, and `archive-helper.test.mjs`.
- A read-only static check confirmed both helper paths occur inside the exact `sourceFiles` array, the regression stage precedes M0 and inherited execution, exact TAP counts are enforced, failure withholds later stages, and the direct `mkdir(attemptRoot)` call is gone.
- `git diff --check 2324068 --` the three reviewed paths passed; the diff path list contains exactly those three files.
- `git bundle verify compiled-capabilities/coordination/root-checks/startup-failed-2324068/source.bundle` passed.

Logs and hashes are recorded in `coordination/reviews/XR-FIX-STARTUP/logs/` and the XR-FIX-STARTUP receipt.

## Scope and limits

This review covers the bounded startup repair and its focused regression checks. I did not run the full capability runner, edit production files, modify the original failure log or bundle, rewrite prior records, or perform Git mutations. The root full-run regression remains pending.
