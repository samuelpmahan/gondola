# E-PREP-SCHEDULER: Read-only native schedule auditor

## Prepared tool

Added [`audit.py`](../acceptance/scheduler/audit.py), a standard-library Python CLI that reads the coordination evidence and never writes to it. It replays the event stream from the six actual initial launches in `dispatch.json`; dynamic repair and preparation jobs become visible only at their recorded extension events. For each accepted solve it reconstructs ready jobs, worker eligibility, review dependencies, priorities, in-flight pins, and dispatches.

The auditor checks that each accepted solve event matches its `native/epoch-NN.json`, that its saved native bundle exists, that native capacity declarations agree with replayed pins and ready jobs, assignments respect worker and per-packet capacity, pinned workers stay on their active packet, and each recorded start follows the latest accepted recommendation. It independently computes the maximum weighted assignment with a small dynamic program and checks both `exact_score` and `native_score`, plus `native_constraints.brokenCount == 0`. It validates receipt identity and required fields, checks model and reasoning only from the six actual spawn receipts, preserves the rejected epoch-03 nonoptimal log as evidence, and requires every original AMEND review to receive a later accepted `XR-FIX-*` review before complete acceptance.

The command without `--require-complete` distinguishes evidence errors from open work. It returns success with `INCOMPLETE` while packets or AMEND closures remain open. `--require-complete` promotes those outstanding gates to failure. The self-tests mutate only deep-copied in-memory snapshots; they never alter scheduler records.

## Observed evidence

At the captured run, the source state was epoch 12 with 26 packets: 17 done, 5 running, and 4 pending. The default audit reported **INCOMPLETE** with no structural errors across 12 accepted native epochs. All 12 event/native pairs passed the independent score comparison and recorded zero broken native constraints. It confirmed six actual initial `gpt-6-luna` / `xhigh` spawns, and the epoch-0 spawn map matches the solver recommendation.

The original `XR-GO`, `XR-BUILD`, and `XR-HARNESS` reviews retain their recorded `amend` decisions. `XR-FIX-GO` is accepted and closes the `XR-GO` amendment. The `XR-FIX-BUILD` and `XR-FIX-HARNESS` reviews had not yet completed. Three preparation extracts were running and one was done; all four preparation reviews remained pending. Therefore `--require-complete` correctly exited 2; final acceptance is not claimed.

The rejected epoch-03 recommendation remains recorded with `dispatch_performed: false`. Its retained [`epoch-03-failed-nonoptimal.log`](../epoch-03-failed-nonoptimal.log) contains the `nonoptimal_native_score` diagnostic. The replay found no dispatch between that rejection and the next accepted solve, and all later starts match accepted recommendations.

## Verification

| Command | Result | Captured output |
|---|---|---|
| `python3 -m unittest discover -s compiled-capabilities/coordination/acceptance/scheduler -v` | 12 mutation tests passed: score, broken count, declared and actual capacity, self-review, missing receipt, spawn model, rejected dispatch, start/recommendation mismatch, and pinned-worker movement | [`unittest.log`](../acceptance/scheduler/logs/unittest.log) |
| `python3 compiled-capabilities/coordination/acceptance/scheduler/audit.py` | Exit 0; `INCOMPLETE`, with no structural errors | [`audit-inflight.log`](../acceptance/scheduler/logs/audit-inflight.log) |
| `python3 compiled-capabilities/coordination/acceptance/scheduler/audit.py --require-complete` | Exit 2 as required while nine packets and two AMEND closures remain open | [`audit-require-complete.log`](../acceptance/scheduler/logs/audit-require-complete.log) |

## Limits and status

The audit verifies internal consistency of the recorded JSON/events and the existence of saved native bundles; it does not decode or authenticate the binary bundles or independently establish who authored each receipt. The initial model claim is grounded only in `dispatch.json`'s six actual spawn entries; later worker reuse and cross-review are allowed without inferring extra agent capacity from logical packets. This is preparation evidence for the final scheduler acceptance run, not final acceptance. No scheduler state, native epoch, probe, receipt belonging to another job, or Git state was changed.
