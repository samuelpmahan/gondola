# E-FIX-STARTUP: create the full-run attempts parent safely

**Outcome: mixed_change.** The runner now creates the attempts parent recursively, then creates its unique attempt directory exclusively. Regression tests cover both a missing parent and a duplicate attempt name. Targeted checks passed; the full runner was not launched.

## Failure repaired

Root's first startup on a clean worktree failed before any test stage because `mkdir(attemptRoot)` assumed `compiled-capabilities/builds/attempts/` already existed. The preserved failure is `coordination/root-checks/startup-failed-2324068/command.log` (SHA-256 `8d37cd1446f90513077746c8ebb309851421ae1d30ee8b7483d02170f8e285db`). The original `/tmp` log has the same hash.

`archive-helper.mjs` now exports `createExclusiveAttemptDirectory(attemptPath)`. It runs `mkdir(dirname(attemptPath), { recursive: true })`, then a plain `mkdir(attemptPath)`. The latter remains exclusive and preserves the prior collision failure. `run.mjs` calls this helper before creating the attempt's output subdirectories. The helper and tests are included in the runner's explicit source-pin list.

The full runner now executes `node --test compiled-capabilities/archive-helper.test.mjs` as the `archive-helper-startup-regressions` stage after toolchain inventory and before M0 preparation and the inherited lifecycle chain. It runs through the existing command/stage machinery, records TAP `tests`, `pass`, `fail`, `cancelled`, `skipped`, and `todo` counts in the execution receipt, and requires exactly 3/3 passes. If the command or TAP summary fails, the stage fails and the runner withholds the inherited lifecycle chain.

## Regression evidence

The test-first run failed because the test imported the not-yet-implemented helper. After implementation, the same test file passed all three checks:

- An absent `builds/attempts` parent is created and the unique attempt directory is created below it.
- An existing attempt name rejects with `EEXIST`, and a marker file inside that attempt remains unchanged.
- The earlier immutable archive snapshot and tar round-trip test still passes.

Node v22.23.4 `--check` passed for `run.mjs`, `archive-helper.mjs`, and `archive-helper.test.mjs`. The targeted test passed 3/3 after wiring it into the runner. `git diff --check` reported no whitespace errors. Exact red/green and final recheck output is retained in `coordination/reviews/E-FIX-STARTUP/logs/`.

## Scope and limits

N6 did not invoke `run-compiled-capabilities.sh`; root will rerun the full chain after this repair is independently reviewed. The root startup failure log and prior E-BUILD, XR-BUILD, E-FIX-BUILD, E-FIX-HARNESS, and XR-FIX-HARNESS records were left untouched. No M0 checksum, lockfile, dependency, unrelated production path, or Git state was changed.
