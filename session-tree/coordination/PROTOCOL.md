# Session-tree allocation and acceptance

The platform exposes seven concurrent slots including the lead. Six existing Luna 6 workers at XHigh occupied all six child slots for the six disjoint author packets. Completed agents were reused for independent reviews; extra worker capacity is not assumed. `spec.json`, `state.json`, native solver bundles, reports, and receipts preserve assignment, actual dispatch, and acceptance separately.

| Worker | Actual actor | Author ownership |
| --- | --- | --- |
| N1 | `/root/accept_go` | Go manager tree and tests |
| N2 | `/root/accept_wasm` | additive WASM bridge and smoke |
| N3 | `/root/accept_host` | nested host and tests |
| N4 | `/root/accept_evidence` | independent reference and scripts |
| N5 | `/root/multiroot_delivery` | browser fixture, oracle, CLI and oracle tests |
| N6 | `/root/accept_godom` | HTTP demo, full runner and workflow |

The lead owns integration, repository publication, and final evidence. Source interfaces were frozen in `../DESIGN.md` before parallel implementation. Browser replay depends on the Go/WASM, host, model, and script contracts; full acceptance additionally requires inherited regressions and a distinct reviewer for each author packet.

Native execution uses `rebalancer==1.0.4` and the inspected `samuelpmahan/chainspot-toolkit` PR 1 head `989c295717511c812b69beda5d125817ffc054c9`. The probe SHA-256 is `5fa75295203944df8b7e2112dbd900b9c89255209a1ac92d61c01bf035d8066c`. `probe.py solve` allocates jobs; collaboration tools actually dispatch the agents. The initial author solve scored 600/600 with zero broken native constraints. `start` records actual actors and `finish` validates the submitted packet receipt. Ready reviews cannot run on their author's worker.

Independent review XR-T3 found raw Go subtree disposal was invoked before the structural-operation guard. The original `amend` receipt is retained. `host-repair-spec.json` allocates R-T3 to N3 and XR-R-T3 to N1; the saved reentry probe and a separate atomic-error rollback probe pass after repair. Focus-witness correction is independently allocated by `focus-repair-spec.json`: the fixed renderer script must focus the actual target immediately before its swap. Original author/reviewer receipts remain historical snapshots rather than being overwritten.

The XR-T6 report retains an initial discrepant runner read. The finished runner already contained the correct keyed-editor path before that observation; it is not counted as a source defect or repair. Reviews explicitly distinguish focused execution from the full runner and fresh CI.

Receipts establish review of bounded snapshots. Final source hashes, integrated execution, preserved failures, and publication evidence are recorded separately in `../evidence/` and `../RESULTS.md`.

XR-T5 amended the oracle for missing actual cross-session cancellation-call order, explicit Add/Reset/Up disabled expectations, and stale delivery after same-name descendant recreation. `oracle-repair-spec.json` allocates R-T4B schedules and R-T5 oracle work to disjoint authors, with independent follow-up reviews. Final fixed counts are 29/21/18; final default replay is 63 scripts, 1,591 actions, 10,352 actor observations, 546 ordinary native comparisons plus one separate negative control. Original amendments and the earlier passing run remain unchanged.

Before the next hour elapsed, five free Luna workers were reallocated to read-only acceptance packets while N5 continued the oracle repair: all six child slots were again active. `acceptance-spec.json` records the external busy worker; its five-packet solve scored 500/500 with zero broken constraints. These are native extraction/reuse audits (`confirmed_reuse` or `insufficient_evidence`), with automatic review generation disabled; they do not replace the independent source reviews. A-MODEL correctly reported insufficient evidence before the repaired default existed. `final-proof-spec.json` separately allocates fresh-trace closure after actual exit zero, including reconciliation of an unreliable process-visibility observation. No test or dispatch is invented to satisfy a receipt validator.

`toolkit-refresh.json` binds the probe fetched at the current toolkit `refs/pull/1/head`: it exactly matches the executed SHA-256. Source and asset manifests preserve both the earlier passing checker snapshot and the final repaired snapshot. Clean remote CI results are appended to PR metadata after publication so they do not change the tree under test.
