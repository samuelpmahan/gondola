# E-FIX-SCHEDULER: Validate extension evidence before replay

**Outcome: mixed_change.** Repaired the scheduler auditor's AMEND timeline gate and added a separate verifier for the root's executed startup-failure extension. The live replay now reports no structural errors; final scheduling acceptance remains open.

## Change

`audit.py` now requires each `extend-after-review-amend` event to reference a review already replayed as complete, with a matching review receipt whose decision is `amend`, before any repair packet becomes visible. It checks that the event adds exactly one extraction packet with `repair_of` pointing to that review and one `XR-FIX-*` review depending on the repair. The regression test uses N5's exact in-memory mutation: move the E-FIX-BUILD/XR-FIX-BUILD extension immediately before the XR-BUILD completion event and remove its original later occurrence. The auditor rejects this reordered history with `amend_extension_before_review`.

The root's `extend-after-executed-failure` event is modeled separately from AMEND extensions. The auditor checks its recorded source revision, exact attempted command, failure description, new packet IDs, repair links, log path, pinned SHA-256, and log contents. It does not require a prior AMEND review for E-FIX-STARTUP. E-FIX-STARTUP is now done and its XR-FIX-STARTUP review is running; an in-progress review without a receipt remains incomplete work, not a structural error.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Scheduler mutation tests | 14 passed | [`extension-gate-green.log`](../acceptance/scheduler/logs/extension-gate-green.log) |
| N5 independent exhaustive score and exact reorder probe | All 15 epoch scores matched; moved extension now returns `FAIL` with the expected precondition error | [`extension-gate-independent-after-repair.json`](../acceptance/scheduler/logs/extension-gate-independent-after-repair.json) |
| Live scheduler audit | `INCOMPLETE`, 16 accepted epochs, zero structural errors, six open packets | [`audit-repair.json`](../acceptance/scheduler/logs/audit-repair.json) |
| `--require-complete` | Exit 2 while open packets and two AMEND closures remain | [`audit-repair-complete.json`](../acceptance/scheduler/logs/audit-repair-complete.json) |
| Root startup-failure event | Source, command, path, recorded SHA, and actual log SHA match; log shows the ENOENT before the run stages | [`startup-failure-evidence.log`](../acceptance/scheduler/logs/startup-failure-evidence.log) |
| Prior E-PREP and XR-PREP report hashes | All three original report hashes match N5's preserved source hashes | [`original-review-evidence-check.log`](../acceptance/scheduler/logs/original-review-evidence-check.log) |

The pre-fix run is preserved in [`extension-gate-red.log`](../acceptance/scheduler/logs/extension-gate-red.log). The new reordered-event assertion failed before the repair because no AMEND extension precondition was enforced. That baseline also exposed the newly added startup-failure event as unmodeled; the repair now validates that distinct event and restores an error-free live replay.

## Current evidence status

At the captured audit, 16 accepted native epochs passed event/native comparison, capacity, pin, dispatch, and independent score checks. The root startup-failure event is bound to `compiled-capabilities/coordination/root-checks/startup-failed-2324068/command.log` with SHA-256 `8d37cd1446f90513077746c8ebb309851421ae1d30ee8b7483d02170f8e285db`. It added E-FIX-STARTUP and XR-FIX-STARTUP after the recorded execution failure; epoch 14's native recommendation then dispatched E-FIX-STARTUP.

`--require-complete` still fails because packets remain open and the XR-PREP-SCHEDULER and XR-PREP-ARCHIVE amendment reviews do not yet have accepted XR-FIX closures. The original E-PREP-SCHEDULER and XR-PREP-SCHEDULER reports and receipts were not changed. Their hashes are recorded in this repair receipt; the original XR-PREP-SCHEDULER receipt still retains its pre-repair source hashes for the auditor and tests.

## Scope

Only `coordination/acceptance/scheduler/`, `coordination/reports/E-FIX-SCHEDULER.md`, and `coordination/receipts/E-FIX-SCHEDULER.json` were changed. No real state, spec, event, native epoch, shared probe, production file, or Git state was edited.
