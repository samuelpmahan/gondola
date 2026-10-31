# XR-FIX-RUNNER-ACCEPTANCE

**Decision: accepted for the bounded runner repair.** The repaired runner removes the prose-substring gate, validates the actual nested lifecycle → methods → backends → frontend receipt chain, and assigns a nonzero Node exit code after final receipt and report processing whenever the final receipt is not passed. The focused regressions and validation against the preserved nested receipts passed. This review does not include or imply a fresh full E-BUILD run.

## Source inspected

Reviewed the frozen N6 repair in `compiled-capabilities/run.mjs`, `runner-acceptance.mjs`, `runner-acceptance.test.mjs`, `README.md`, and `RESULTS.md`. Their SHA-256 values match the author’s E-FIX-RUNNER-ACCEPTANCE receipt: `794fbdc26e22b7522de20b0e94e6070f8d7bb87eba888e7d8f0c34141fb77b0b`, `224ab2b6d6d1b8694fc51fa2c110fe9653d1ca5c5e4cfd26dea302b9b01c6c71`, `f72b7c1f6e091b21824630173db72829dce9c0fd541d55c331850882831292e4`, `7b0bb2aec6ca429f068a55fd26c8d2f55f4dd96c3319b4f2f461b29a2e8d07f8`, and `c1553eda044b5de399d052bfd129272aa52f8714354a191ca66391ebeb14bec6`.

## Review findings

- The old phrase-based check is absent. The runner executes `bash run-compiled-lifecycle.sh`, then calls `validateInheritedLifecycleEvidence` on the actual receipt/report bytes. Validation requires full, passed, failure-free, fresh records; stable-source-pin declarations; all-passed lifecycle stages; successful inherited commands; structured methods build/matrix/test/demo facts; and receipt/report/archive-copy hashes through the nested backend and frontend records.
- `runner-acceptance.mjs` and its regression test are included in `sourceFiles`. The runner records `sourceBefore`, then runs `runner-acceptance-regressions`, and later compares final source pins. A failed test stage throws before the inherited chain starts.
- Seven tests cover a valid structured chain, rejection of prose-only evidence, receipt tampering, stale/partial/failed methods receipts, matrix and backend-hash mutation, an actual child-process exit of 1 for failed/running receipts (and 0 for passed), and runner wiring with the old prose predicate absent.
- I verified the preserved actual nested lifecycle, methods, backend, and frontend receipt bytes using the existing actual-nested verifier; it returned `status: passed` and the reported hashes match the live files.
- Finalization calls `applyReceiptExitCode(receipt)` after archive finalization, source-pin verification, receipt save, and report generation. Report-generation failure records a failed receipt and sets exit code 1 before applying the final policy; prior nonzero exit codes are preserved.
- README and RESULTS accurately describe the test order and the distinction between the bounded repair evidence and the still-required fresh full run.

## Independent verification

Node was `/tmp/gondola-node22/node_modules/node/bin/node`, version `v22.23.4`.

| Command | Result | Review log |
| --- | --- | --- |
| `node --check compiled-capabilities/run.mjs` | exit 0 | `coordination/reviews/XR-FIX-RUNNER-ACCEPTANCE/logs/syntax-runner.*` |
| `node --check compiled-capabilities/runner-acceptance.mjs` | exit 0 | `coordination/reviews/XR-FIX-RUNNER-ACCEPTANCE/logs/syntax-helper.*` |
| `node --check compiled-capabilities/runner-acceptance.test.mjs` | exit 0 | `coordination/reviews/XR-FIX-RUNNER-ACCEPTANCE/logs/syntax-tests.*` |
| `node --test compiled-capabilities/runner-acceptance.test.mjs` | 7/7 passed; no failures, skips, or cancellations | `coordination/reviews/XR-FIX-RUNNER-ACCEPTANCE/logs/focused.stdout.log` |
| `node compiled-capabilities/coordination/reviews/E-FIX-RUNNER-ACCEPTANCE/verify-actual-nested.mjs` | exit 0; structured actual chain passed | `coordination/reviews/XR-FIX-RUNNER-ACCEPTANCE/logs/actual-nested.stdout.log` |

Each command has a separately preserved stderr and exit-code file. The only stderr content was Node’s experimental `EnvHttpProxyAgent` warning. The author’s original red log remains unchanged in `coordination/reviews/E-FIX-RUNNER-ACCEPTANCE/logs/red.log`.

## Scope limit

The full capability runner was not launched. Acceptance of this repair is limited to the reviewed source and focused checks; a fresh full E-BUILD chain and its final archive still need to run after this review.
