# XR-RESULT-BROWSER: independent review of the closed browser packet

## Decision

**Accepted for the local failed-cohort browser evidence only.** N3's E-RESULT-BROWSER packet accurately records the captured browser facts and keeps the failed full-run gate separate. This review does not accept the full run, hosted artifact, source publication, or milestone.

## Raw capability browser evidence

I independently read the current local attempt's capture, check, run, AppIR, lifecycle check/browser, execution receipt, literal oracle, and the author's audit code/output. The review audit recomputed the admission case IDs from the oracle, compared the raw before/after values, verified the trace and mutation controls, and checked the cited file hashes.

The 19 unique admission stimuli split into 7 capability requirement cases, 6 host declaration cases, and 6 renderer declaration cases. Every case records `TypeError`, zero Init/Update/View/renderer method calls, and an empty container. The host-option accessor case records an own getter descriptor constructed and zero getter invocations; array and renderer capability getter counters are also zero.

The unmodified React and DOM AppIRs agree on capabilities: `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`. Filtering those through the renderer view-capability set yields only `view.node`. The active incompatible candidate advertises `[]`; it is rejected at admission before candidate methods or old unmount.

Raw state, logical view, physical DOM, and pending-effect values match across the rejected and compatible swap snapshots. The old renderer remains live after rejection and its click increments the trace on the same generation. The compatible commit detaches the old root; its old callback is then marked stale and does not change generation or trace. The pending correlated reply is accepted after the swap.

The physical Request control is disabled when clicked and the trace stays at three ticks. The complete capture has five ticks and this nine-event order: `init`, `click-add-parent`, `click-request-parent`, `disabled-request-click-suppressed`, `reject-incompatible-renderer`, `old-active-click-after-rejection`, `compatible-renderer-commit`, `fence-old-callback-after-commit`, `deliver-pending-reply`. The final messages are `addParent`, `requestParent`, `addParent`, and `complete`, with dispatch IDs `dispatch-0001` through `dispatch-0004`; the completion is correlated to `parent:g1:r1`.

All 9 capability-capture mutation controls and all 8 inherited lifecycle controls are marked detected. The inherited lifecycle check reports `matched`, 17 swaps, 26 events, and 26 ticks. The raw evidence hashes in N3's receipt match all 11 referenced files; source and build-output pin lists are stable and the AppIR pins match. The saved audit reports 15 capability-run source pins, 179 inherited lifecycle source pins, and 8 build output pins.

## Failed full-run boundary

The local E-BUILD attempt remains `failed` at `inherited-static-and-interaction-lifecycle`; its only failure is that the outer text predicate expects “inherited compiled-methods” while the nested successful receipt says “fresh full run-compiled-methods.sh completed.” N3's receipt says the nested lifecycle result passed. The 16 recorded commands exited zero and N3 records the root-observed outer process exit code as 0. The runner log and failed E-BUILD receipt remain the gate evidence; a zero process exit is not acceptance.

N3 explicitly says its capture is local, not the hosted CI artifact. N4 owns that artifact's download and catalog; this review makes no hosted claim.

## Reproduction and preserved files

No browser or full suite was rerun. The independent raw-data verifier is `coordination/reviews/XR-RESULT-BROWSER/review_audit.py`; it exited 0 and wrote `audit.json`. The review receipt pins the verifier, audit, N3 report/receipt, and raw input files.

This result accepts only the local 031c462/a2e1164 failed-cohort browser subevidence. It does not repair or override the failed full gate and does not imply hosted or milestone acceptance.
