# XR-FIX-SCHEDULER: Independent review

**Decision: accepted.** The E-FIX-SCHEDULER repair closes the exact reordered-AMEND extension finding from XR-PREP-SCHEDULER and includes the requested regression test. The independent check also confirms the separate root startup-failure extension is validated from its pinned evidence without using an AMEND review gate.

## Findings

No blocking or non-blocking findings remain for the reviewed repair.

The AMEND extension replay now verifies that the referenced review is visible and completed, is a review job, and has a receipt decision of `amend` before exposing repair jobs. It also checks that the extension adds one `extract` with `repair_of` set to that review and one `XR-FIX-*` review depending on that extract. The test `test_amend_extension_before_completed_review_is_rejected` reproduces the exact mutation from XR-PREP-SCHEDULER: it moves the E-FIX-BUILD/XR-FIX-BUILD extension immediately before XR-BUILD completion and removes the original later event.

I reran the same in-memory mutation independently. The result is `FAIL` with `amend_extension_before_review` at the moved extension. The live history places the XR-PREP-SCHEDULER completion at event 67 and its repair extension at event 70, so the repair remains visible only after the AMEND decision completed.

The root's `extend-after-executed-failure` event is validated through a separate replay branch. The current event names source `232406843678f46c569e1c54b34b268c84e7764e`, the exact failed `run-compiled-capabilities.sh` command, the ENOENT failure description, and the new E-FIX-STARTUP/XR-FIX-STARTUP packets. The contained repository log's SHA-256 matches the event pin (`8d37cd1446f90513077746c8ebb309851421ae1d30ee8b7483d02170f8e285db`) and its contents show the `run.mjs:160:1` startup failure. The standalone branch checks those fields and repair/review links; it does not require or read an AMEND review receipt. E-FIX-STARTUP and XR-FIX-STARTUP are both done in the captured state.

## Verification

| Check | Result |
|---|---|
| Scheduler unit suite | 14 tests passed, including the exact reordered-extension mutation and startup-log pin mutation. |
| Independent in-memory reorder probe | Rejected with `amend_extension_before_review`; no shared state was changed. |
| Live scheduler audit | Exit 0, `INCOMPLETE`, epochs 0–16 accepted, 32 packets, zero structural errors. |
| Required-complete audit | Exit 2, as expected while XR-FIX-SCHEDULER and XR-FIX-ARCHIVE-AUDIT are running and their AMEND closures are open. |
| Native assignment cross-check | Exhaustive assignment scores matched native, exact, and dispatched scores for all 17 captured epochs. |
| Root startup-failure evidence | Source, command, failure text, new job IDs, contained log path, log SHA-256, and diagnostic content all match. |
| E-FIX-SCHEDULER source pins | Current auditor/test hashes match the repair receipt; preserved E-PREP-SCHEDULER and XR-PREP-SCHEDULER hashes match their pinned originals. |

Exact commands and machine-readable outputs are in [`logs/`](XR-FIX-SCHEDULER/logs/), including the test run, both live audit modes, independent reorder probe, and startup-failure evidence check.

## Scope and limits

The scheduler remains in flight. This review accepts the E-FIX-SCHEDULER repair only; it does not assert complete scheduler acceptance. At the captured snapshot, 30 of 32 packets were done and XR-FIX-SCHEDULER plus XR-FIX-ARCHIVE-AUDIT were running. The `--require-complete` result was captured while this review job was still running.

No scheduler state, spec, event, native epoch, pre-existing receipt, production file, or Git state was modified.
