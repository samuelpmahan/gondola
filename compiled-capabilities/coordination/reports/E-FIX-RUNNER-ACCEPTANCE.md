# E-FIX-RUNNER-ACCEPTANCE

**Outcome: mixed change; full acceptance remains pending.** Replaced the inherited-run prose check with structured, fresh, hash-bound receipt validation, and made final E-BUILD failure determine the Node process exit code. Focused checks passed; the full runner was not rerun.

## Failure and repair

The preserved cohort `ci/2026-10-31/failed-local-031c/execution.json` records a failed stage because the outer runner searched for the text `inherited compiled-methods`. Its nested fresh full lifecycle receipt was actually `passed`; that receipt binds the methods receipt, which binds backend and frontend execution evidence. The process nevertheless exited 0 because a caught stage failure was not reflected in the final process status.

`runner-acceptance.mjs` validates the actual receipt facts: full mode, passed status, stable source pins, freshness, successful inherited commands, lifecycle stages, structured method builds/matrix/demo results, receipt and report hashes, and the methods receipt hash in both the lifecycle summary and copied archive inventory. It also verifies the hash-bound backend receipt and frontend execution pins. It does not inspect the diagnostic `finalOutputLine` to decide acceptance. `run.mjs` executes seven acceptance regressions before the inherited full chain and pins the helper and tests in `sourceBefore`. After archive and report finalization, every final receipt status other than `passed` sets `process.exitCode` to a nonzero value.

## Verification

- Node v22.23.4 syntax checks passed for `run.mjs`, `runner-acceptance.mjs`, and `runner-acceptance.test.mjs`.
- The red regression run failed 1/7 because `run.mjs` had not yet called the structured validator or exit policy. Its raw TAP is retained.
- The final focused suite passed 7/7. It covers the current nested receipt shape, prose-only evidence rejection, receipt hash tampering, stale/partial/failed evidence, structured matrix and child-hash mutations, a real Node child exit of 1 for failed/running receipts, and runner wiring.
- A separate Node 22 command ran the validator against the preserved actual nested receipts. It passed the lifecycle → methods → backends → frontend chain, including the copied execution receipt hash.
- No full capability runner was started after this repair. A fresh full run is still required after independent review.

## Documentation

`README.md` now describes the startup, M0, acceptance-test, and inherited-lifecycle order and gives a manual local command to serve `<receipt.attempt>/demo/site`. `RESULTS.md` records the failed cohort and the focused repair result without claiming a fresh full pass.
