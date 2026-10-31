# Capability negotiation results

## Current status

The 31 October full source cohort at local commit `031c462bcd72c0ae0bee2dc05a0972b3902ca40c` ended with an E-BUILD receipt marked `failed`. The nested lifecycle receipt itself was a fresh full pass with stable source pins; the outer runner rejected it because a prose check expected the phrase `inherited compiled-methods`, while the receipt used `fresh full run-compiled-methods.sh completed`. The full command nevertheless returned exit code 0 because a caught stage failure did not set the process exit status. The source and archive are preserved under `ci/2026-10-31/failed-local-031c/` and `builds/attempts/attempt-20261031T095356051Z/`. The archive verifies, but its bound receipt is failed, so it is not accepted as milestone evidence.

E-FIX-RUNNER-ACCEPTANCE replaces that gate with structured, fresh full receipt checks: lifecycle → methods → backends → frontend. The chain binds receipt and report hashes, checks source-pin stability and command outcomes, and checks method build, matrix, and HTTP smoke status. Final E-BUILD status now determines the runner process exit code. The bounded regression suite passes **7/7**, including a real Node child-process exit check. The validator also accepted the preserved nested receipt bytes from the failed cohort. The full capability runner has not yet been rerun after this repair; acceptance remains pending independent review and a fresh complete run.

## Repair verification

Node v22.23.4 syntax checks passed for `run.mjs`, `runner-acceptance.mjs`, and `runner-acceptance.test.mjs`. The focused test command passed 7/7. Direct validation against the preserved full-run receipts passed for the lifecycle receipt, the SHA-bound `compiled-methods/coordination/receipts/E-DEMO.json`, its nested backend receipt, and the bound compiled-frontend execution. The captured red/green test output and actual-receipt validation are under `coordination/reviews/E-FIX-RUNNER-ACCEPTANCE/logs/`.

Earlier focused evidence remains useful but does not replace the pending fresh integrated run:

- React and DOM GoScript CLI builds each emitted 67 pinned files and the declared AppIR profile.
- N4's oracle, N3's conformance driver, and N5's HTTP demo passed during the failed full cohort.
- The inherited lifecycle and compiled-methods receipt chains passed independently; only the old outer prose predicate failed.

The earlier `2324068` clean-start failure occurred before tests and is separately preserved and excluded from this full-run cohort.

## Acceptance evidence required

A fresh full run after independent review must report a passed outer E-BUILD receipt, exit nonzero on every final failure, confirm the typed hash-bound inherited chain, pass all capability stages, maintain source pins through archive creation, and pass the archive verifier in complete mode. Hosted Actions records and any provider artifact must be checked against that exact source and receipt; a green workflow alone is insufficient.
