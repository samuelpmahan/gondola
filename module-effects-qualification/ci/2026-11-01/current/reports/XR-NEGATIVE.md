# XR-NEGATIVE — independent review of E-NEGATIVE

**Reviewer:** N4  
**Decision:** `accepted`

## Review summary

The sealed N5 controls are valid against the checked-in PR23 attempt. The unmodified bundle is the positive control: `TestPR23DirectoryIsAccepted` calls `VerifyDirectory`, asserts the pinned source commit and full scenario/profile/event/state/effect/transport counts, and the sealed final verbose log shows it passing. The mutation tests call `CheckCaptures` on the unmodified fixture before changing it. The ordering controls call `CheckOrdering` on the real native replay and browser.swap capture before mutating it. The final verbose log also shows all five literal profiles passing the ordering positive control.

I verified the E-NEGATIVE report, receipt, and rawlog-index seal hashes; all N5 rawlog-index byte counts and hashes; and both source inventory byte counts and hashes. The fixture's `effects.check.json` summary pin matches `effects.summary.json`; all 24 native/profile capture entries in the summary match the actual bytes and hashes. The summary records four scenarios, five profiles each, and seeds 20261104, 20261105, and 20261106. The complete verification output is in `rawlogs/XR-NEGATIVE/integrity-validation.stdout.log`.

## Negative-control findings

Each control reaches its intended check rather than failing on a stale inventory or an incompatible baseline:

- Go state, view tree, rendered DOM, and disabled-click mutations each first refresh the changed profile's byte/hash record in `effects.summary.json`, then refresh the summary pin in `effects.check.json`. Assertions require the corresponding Go replay/rendered-view error. The final verbose output records those four specific errors.
- Event sequence, transport correlation, and effect correlation mutations begin from a positive browser.swap ordering capture. Assertions require the event-index or correlation diagnostic; the final verbose output records each intended reason.
- The duplicate-key control first passes the unmodified capture set, then rewrites and rehashes the capture and its summary/check inventory. It asserts `duplicate key "schema"`.
- The suite-downgrade control removes the seed-20261106 scenario, native replay, and all five profiles. It coherently updates the scenario/capture/seed/count inventory and summary pin, then asserts the required scenario file is missing.

The hard-link overlay unlinks each rewritten file before writing, so the mutations operate on private overlay files. The semantic mutation cases also hash their original target and assert it is unchanged after each control.

## Run evidence and scope

The sealed final full-package log reports `ok github.com/samuelpmahan/gondola/effectqualification 30.099s`; the final verbose N5 log reports `PASS` and contains no `SKIP` markers. Earlier build and integration failures remain in the sealed rawlogs and are not represented as passing runs. The N5 report correctly points to the final named passing logs.

The N5 ordering controls cover event sequence and transport/effect correlation. They do not test contradictory `orderedLedger.pendingCount` values. The independent XR-ORDER review documented that changing the actual browser.swap start row's pending count from 1 to 99 was accepted (`reports/XR-ORDER.md`, `rawlogs/XR-ORDER/adversarial-control.stdout`). That is a separate E-ORDER implementation gap now assigned for repair; it does not invalidate the targeted N5 controls, and this acceptance does not claim complete ordering semantics.

I reviewed historical sealed logs and did not run a new package test. This review is limited to offline Go capture checks for the finite PR23 fixture; it does not claim a fresh browser run. One initial review-only source hash command used the wrong repository-relative path; the correction and final successful result are recorded in `rawlogs/XR-NEGATIVE/review-command-correction.txt` and `source-review.status`.
