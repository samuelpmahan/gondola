# XR-ORACLE: independent review of E-ORACLE

**Worker:** N4  
**Decision:** `accepted`  
**Date:** 2026-10-31

## Review result

I reviewed the sealed E-ORACLE report and receipt, the independent qualification plan and its tests, the actual Node 22 mounted-run capture, and the N1 Go certificate. The plan is a sound independent oracle for the scoped 13-case matrix. Its expected values are pinned to the pre-existing literal publications oracle and fixed scenario; mutant observations are not used to create expectations. I found no oracle-policy defect requiring amendment.

The 13 cases are healthy React, DOM, and renderer-swap profiles, plus five fault families on each backend. Healthy cases require the complete 50-event / 46-trace-checkpoint baseline. Initial-render faults inspect checkpoint 0 before any event; drop/duplicate faults are activated by the real event-0 click at `1/0/1` (`counter.add/oak`) and compare against literal checkpoint 1. The disabled-control witness consistently compares the baseline control at `0/1`.

The fault policy is finite and internally consistent: text corruption and key-order require only `dom`; enabled-control requires `disabled` and permits `dom` as an additional observation; drop-click requires at least one of `dispatch-count`, `trace-count`, or `state`; duplicate-click requires `dispatch-count`. Each family only permits its declared finite extra channels. `oracle.mjs` checks these rules and pins the independent baseline plan inputs. Oracle tests verify the literal initial status, child order, disabled control, event-0 action, and first-action projection.

## Evidence checked

The N4 capture at `backend-qualification/coordination/rawlogs/E-HARNESS/attempt-04-node22-source-pinned/qualification.raw.json` is 13 actual mounted case records, SHA-256 `4222a32d73fde4e9fa31e534ebad7ab61fae8337f6cff7e0b2c9b05486586bcf`. Healthy cases each report 50 events and 46 trace ticks, with no changed channels or page/infrastructure errors. Each fault case reports one activation; initial-render faults compare at 0 events / 1 trace tick and physical-click faults at 1 event / 2 trace ticks. The source commit field is the 40-character qualification base `5662efcd7feb7920e4690d38cc76a297fed69d5a`; it is author/base evidence, not a final candidate attestation.

I reran the Node 22 oracle suite against that preserved capture. All 15 tests passed. This includes Go CLI certification of the actual capture and rejection of five classification controls: missing case, duplicate case, missing activation, generic-error-only evidence, and empty semantic-channel evidence. The captured case inventory and exact command/output/exit code are preserved under `rawlogs/XR-ORACLE/`.

The sealed E-GO certificate is SHA-256 `6877bc6cb8fc31d58d5378f2ac4770c6bf85f30dd06f6918398dd06b0f335174` and records `qualified: true` for 13/13 cases against the same actual report hash. The source plan, oracle module, and tests match their sealed E-ORACLE receipt hashes. N5’s report also preserves an initial upstream-owned Go test failure and the passing rerun after N1/N2 fixed their tests; the final result does not hide or reclassify that earlier attempt, and no oracle policy was weakened to accommodate it.

## Boundaries

This is a scoped review of the oracle and its classification evidence. I did not rerun the browser profiles or the complete qualification pipeline, and this result does not assert final candidate acceptance, CI success, or a full regression result. No source, production, scheduler, or Git state was changed.
