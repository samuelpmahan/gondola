# Assignment and acceptance protocol

The root coordinates integration, Git, and final acceptance. Workers own explicit, disjoint path sets recorded per job in `state.json`; source changes outside a lane require a new assignment. Dependency gates release downstream work only after inspectable prerequisite evidence exists. Reviewer ownership differs from the author of the packet being reviewed. A native `done` status means a receipt was read, not that its claims were accepted.

The native solver is the unmodified `experiments/rebalancer/probe.py` from toolkit PR1 head `989c295717511c812b69beda5d125817ffc054c9`, with `rebalancer==1.0.4`. Its SHA-256 is `5fa75295203944df8b7e2112dbd900b9c89255209a1ac92d61c01bf035d8066c`. Bundles and allocation JSON live in `native/`. The probe allocates work; platform collaboration calls separately deliver assignments. It does not invoke an LLM.

The executable runner retains its author lane label `N5` when it writes a local or CI execution receipt. That label does not establish that CI dispatched a model worker; a GitHub workflow is a separate automated executor. Agent assignments, operating-system processes, and workflow runs must be reported separately.

The platform advertised seven total slots including root. Six proposed worker deliveries were attempted; five Luna6 XHigh followups succeeded and N6 failed with `agent thread limit reached`. `state-before-dispatch-limit.json` preserves the original proposed/acknowledged state. Root removed the unavailable worker, reset its undelivered contract job to pending, and recorded the failed delivery before solving with five actual workers. The queued contract packet later ran on N1. No sixth worker execution is claimed.

| Worker | Actual agent | Initial ownership |
| --- | --- | --- |
| N1 | `/root/backend_runtime` | Go fixture and native replay adapter |
| N2 | `/root/backend_dom` | Browser adapter and independent DOM/control oracle |
| N3 | `/root/backend_harness` | Native/direct/browser comparison and method graph checks |
| N4 | `/root/backend_build` | Source projection, method selection, and analyzer tests |
| N5 | `/root/backend_demo` | Full runner, HTTP demo, smoke, and workflow |

Subsequent native epochs explicitly transfer ownership for repairs and allocate independent cross-reviews. Only root writes native state and Git metadata. Extract receipts use `confirmed_reuse`, `mixed_change`, `not_reuse`, or `insufficient_evidence`; reviews use `accepted`, `amend`, or `rejected`. Amendment chains require an inspectable repair and an independent review of that repair. Original author/review records and failed attempts remain retained.

At epoch04, seed7 local search twice returned score400 when the independent exhaustive matching gate found600. Both allocations were rejected before delivery. The retained retry log and state event record that limit. Root then set explicit independent reviewer eligibility for the three disjoint ready lanes; the unchanged probe returned score600, matching the exact score with zero broken constraints. This is a constrained allocation result, not a claim that the heuristic solved every unrestricted matching optimally.

Source hashes are captured before execution. Any edit to pinned source during a run invalidates exact-checkpoint acceptance; initial hashes must never be rewritten. The first full run was interrupted and preserved after two concurrent checker edits; a later runner reporting fix is also recorded in its final mismatch set. Full default execution resumes only after source repair and review gates freeze. Historical packet hashes describe their original checkpoints; later repair records explain differences.

`verify.py` checks worker identities, receipt schemas, capacity, and author/reviewer separation. It deliberately does not turn amended reviews, failed commands, partial runs, or untested behavior into code acceptance. Executed guarantees and final status belong in `../RESULTS.md` and the immutable delivery evidence.
