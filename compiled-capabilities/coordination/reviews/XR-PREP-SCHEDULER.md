# XR-PREP-SCHEDULER: independent review of the native schedule auditor

## Decision

**AMEND.** The read-only auditor correctly replays the captured native epochs,
worker assignments, pins, review dependencies, receipts, and open-work gates.
The current event stream is structurally consistent. One timeline authorization
gate is not enforced: the auditor exposes repair packets on an
`extend-after-review-amend` event without checking that the corresponding
review is already complete and its receipt says `amend`.

## Finding

### XR-PREP-SCHEDULER-1 — require the matching completed AMEND before repair extension

At `acceptance/scheduler/audit.py:349-357`, an amendment extension only checks
that each named job exists, then makes it visible and pending. It does not
resolve each repair packet's `repair_of` review, check that review's replayed
status is `done`, or require its receipt decision to be `amend` before the
extension. This leaves a recorded transition named
`extend-after-review-amend` unaudited at its authorization boundary.

I confirmed the gap using an in-memory mutation only: moved the
`E-FIX-BUILD` / `XR-FIX-BUILD` extension immediately before XR-BUILD's
completion event, removed its later occurrence, and ran the auditor. It still
returned `INCOMPLETE` with **no structural errors**. There is no solve or
dispatch between the moved extension and the review completion, so later
epoch evidence does not expose the early extension. A repair could therefore
become visible before the AMEND decision without this auditor rejecting the
timeline.

Please validate each extension against a completed original review whose
receipt decision is exactly `amend`; validate that every repair job names that
review in `repair_of`, and that its generated `XR-FIX-*` review depends on the
repair. Add an in-memory mutation test that moves an extension before the
completed AMEND and requires a structural failure. This would also add the
missing eleventh actual mutation case: the current suite has 12 test methods,
of which 10 mutate evidence and two check ordinary incomplete/complete-mode
behavior.

## Confirmed behavior

- The captured event stream has 14 accepted native epochs (0 through 13), 14
  native JSON records and 14 saved bundles. It has 26 packets and six initial
  worker slots. The live snapshot was epoch 14 with 20 done, 5 running, and 1
  pending packet.
- `capacity.json`, `dispatch.json`, and `spec.json` agree on six workers plus
  the root's seventh concurrency slot. All six initial actual-spawn rows name
  distinct workers, jobs, and agents, and each records `gpt-6-luna` at
  `xhigh`. Epoch 0's dispatch matches those six spawn rows.
- The auditor recomputes ready jobs, free workers, per-packet capacities,
  worker allowlists, review dependencies, self-review exclusions, and pinned
  workers at every accepted solve. The current partial audit returned no
  structural errors.
- The auditor's DP result and dispatch weighted score matched each native
  `native_score` and `exact_score`. I independently enumerated all worker/job
  matchings from each replayed eligibility matrix; all four values matched for
  all 14 epochs. Results are in
  `reviews/XR-PREP-SCHEDULER/logs/independent-probes.json`.
- The rejected nonoptimal recommendation is event 17, explicitly marked
  `dispatch_performed: false`, names `epoch-03-failed-nonoptimal.log`, and is
  followed by accepted epoch 3 with no intervening dispatch. The retained log
  has the `nonoptimal_native_score` diagnostic.
- The receipt gate accepts only `accepted` for completed repair reviews. In
  this snapshot, XR-FIX-GO and XR-FIX-BUILD have completed accepted receipts
  for the repairs linked to XR-GO and XR-BUILD. XR-FIX-HARNESS is still
  running, so XR-HARNESS's AMEND remains open. The extension-order finding
  above is separate from those correctly recorded actual events.
- N2's E-PREP-SCHEDULER receipt and report source hashes match the reviewed
  `audit.py` and tests. Its stored logs also match their receipt hashes. Its
  epoch-12 counts are a historical capture, not a claim about the later live
  state.

## Verification

| Command | Result | Log |
|---|---|---|
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s compiled-capabilities/coordination/acceptance/scheduler -v` | Passed, 12 test methods | `reviews/XR-PREP-SCHEDULER/logs/unittest.log` |
| `PYTHONDONTWRITEBYTECODE=1 python3 compiled-capabilities/coordination/acceptance/scheduler/audit.py --json` | Exit 0; `INCOMPLETE`, 14 accepted epochs, 0 structural errors, 6 open packets | `reviews/XR-PREP-SCHEDULER/logs/audit-current.json` |
| `PYTHONDONTWRITEBYTECODE=1 python3 compiled-capabilities/coordination/acceptance/scheduler/audit.py --require-complete --json` | Exit 2; correctly rejects the live incomplete state and the outstanding XR-HARNESS AMEND closure | `reviews/XR-PREP-SCHEDULER/logs/audit-current-complete.json` |
| `PYTHONDONTWRITEBYTECODE=1 python3 compiled-capabilities/coordination/reviews/XR-PREP-SCHEDULER/logs/independent-probes.py` | 14 independent exhaustive score matches; confirms the extension-order mutation is not detected | `reviews/XR-PREP-SCHEDULER/logs/independent-probes.json` |

The unit suite currently has 12 tests total: 10 evidence mutation tests and 2
mode/status tests. It does not contain an AMEND-extension ordering mutation.

## Current acceptance state and limits

The latest partial audit is `INCOMPLETE`, not final acceptance. Six of 26
packets remain running or pending, and XR-HARNESS still needs an accepted
XR-FIX-HARNESS review. The E-PREP-SCHEDULER author report records an earlier
epoch-12 capture with nine open packets; the source hashes and captured logs
match that report. A 61-file input hash manifest for this review is saved at
`reviews/XR-PREP-SCHEDULER/logs/reviewed-input-hashes.json`.

The auditor checks that native bundle files exist but does not decode or
authenticate their binary contents or establish receipt authorship; N2's
report states these limits. This review changed no scheduler state, spec,
native epoch, receipt belonging to another job, or production/Git file.
