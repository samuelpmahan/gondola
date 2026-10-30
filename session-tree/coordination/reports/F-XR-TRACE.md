# F-XR-TRACE — final replay evidence closure

## Outcome: confirmed reuse

The fresh default replay is now available and is bound to the corrected R-T5 checker and R-T4B fixed schedules. I independently checked the replay summary hash, every source pin, all raw scenario shard hashes, and all native comparison envelopes. The run reports a zero exit and matched status. This closes the prior XR-R-T5 fresh-default evidence gap; it does not claim that the pending CI full entrypoint passed.

## Corrected process-visibility note

The historical XR-R-T5 report recorded that the `replay-accepted.json` process had ended because a `ps` check no longer showed it and the file had not yet appeared. That observation was not authoritative: the process visibility check can fail in this environment, and root's retained execution session still reported the run active at 17:48:17. Root's final execution record later confirmed exit code 0 at 17:49:14. The fresh summary is present now. The earlier report remains unchanged; this report supersedes only its interim process-status note.

## Verified fresh summary

`session-tree/build/replay-accepted.json` has SHA-256 `b01f01ccb5ede1a98e20fe5f74fa617cd191ca0a2851931a3744e1b6d59497d7`. It reports `matched`, seeds 20261030 and 20261031 with 30 cases each, and 40 maximum generated actions. The three fixed scripts have 29, 21, and 18 actions, respectively. Totals are 63 scripts, 1,591 actions, 1,654 ticks, 5,176 session observations per actor, and 546/546 matched ordinary native comparisons. The mismatch count is zero and the empty mismatch artifact hash matches its pin.

All required adversarial controls are detected: the focus-loss control, the cross-session cancellation-order mutation, and bilateral Add-at-cap, Reset-empty, and Up-first-row disabled-state mutations. Each disabled-state negative produces only the expected finding on both actors.

The R-T4B stale callback witness is present in the fresh 18-action fixed shard. On both candidate and reference, retired seed session 13/generation 1 request 1 is delivered after remounting orchard/fruit/seed as sessions 14/15/16 generation 2. The current seed has not issued request 1. The full active arrays, including snapshots and audits, and manager tree are unchanged across callback delivery.

## Independent integrity checks

- Recomputed the summary SHA-256 and matched it to `session-tree/evidence/final-execution.json`'s `summary_sha256`.
- Recomputed all 14 source/build pins in the summary; all matched. This includes the repaired `check.mjs`, `check.test.mjs`, `fixture.mjs`, `fixture.html`, and `scripts.mjs` hashes from XR-R-T5/R-T4B.
- Recomputed all 63 scenario shard hashes and the one negative-scenario shard hash; all 64 matched their summary entries.
- Parsed all 547 native input envelopes. Every envelope has nonempty `golden.Ticks` and `candidate.Ticks` arrays with equal lengths. The 546 ordinary native results and one negative-control result all report matched.
- The final execution record `session-tree/evidence/final-execution.json` binds the same summary hash, reports `exit_code: 0`, verifies 63 scenario and 1 negative shard, 547 nonempty native envelopes, 34 Node tests passed, and the one-blur external focus-loss control detected.

The corrected checker and fixed actual-browser replay were accepted in XR-R-T5/R-T4B. Root's execution record says the inherited full runner had exited zero before the final oracle/schedule repairs; unchanged runtime and inherited gates were reused while affected Node/browser/native gates were rerun. The fresh CI full entrypoint is still pending. No tests were rerun in this closure review.
