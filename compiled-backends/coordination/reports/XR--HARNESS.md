# XR--HARNESS (N6 independent review of N3)

**Decision: accepted.** Attempt 10's preserved five-fixture harness matrix, checker policy, lifetime evidence, and current source pins are internally consistent. I found no concrete acceptance gap in the reviewed harness scope.

## Attempt 10 review

I read the browser driver, checker, schedule, checker tests, final E-HARNESS report and receipt, and the preserved attempt-10 captures. The read-only audit independently resolved and rehashed each fixture's 34 before/after source pins and all four build outputs plus the browser bundle. Each before/after source pin array is identical, every run and checker record is `matched`, every checker reports React, DOM, and alternating swap as matched, and native/direct trace JSON objects are equal.

| Fixture | Ticks | Swaps | Focus swaps | Mutation controls |
| --- | ---: | ---: | ---: | ---: |
| counter | 5 | 4 | 0 | 8 |
| form | 10 | 9 | 1 | 10 |
| list | 11 | 10 | 5 | 8 |
| effect | 5 | 3 | 2 | 11 |
| list-growth | 12 | 11 | 1 | 8 |
| **Total** | **43** | **37** | **9** | **45** |

All listed mutation controls are marked detected in their checker records. The attempt-10 capture files remain separate from the older attempt directories.

## Lifetime evidence

The attempt-10 list record distinguishes the two callback cases. First, it probes retired React renderer 7: trace, snapshot, and dispatch count are unchanged, and one stale fence is recorded out of band. It then invokes active DOM renderer 8's `onStaleAction` for a disconnected target through the driver. This second active missing-target attempt adds one suppressed trace tick with no dispatch. **This evidence does not claim that a retained DOM event listener was invoked.** The checker requires this explicit classification and separately accepts the retained-node-listener category only when that is the recorded method.

The focus policy also matches the observations and fixtures. Whenever a browser event reports focus before a swap, the checker compares the complete captured/restored focus record and requires a replaced physical node plus successful runtime capture/restore diagnostics. Keyed identity and selection range/direction are compared only when the fixture declares a witness for that swap. An unfocused swap cannot satisfy a declared witness, and fixtures declaring a witness must exercise focused restoration.

Each attempt-10 fixture also verifies unmount separately from later callback probes. The physical container and renderer snapshot are empty after unmount, and unmount itself leaves the application trace unchanged. The explicit post-unmount dispatch and stale attempts each add a suppressed tick with the same state and View, empty DOM, no dispatch ID, and no effects. These lifetime probes are checked separately from the 43 fixture-action ticks.

## Historical records and source pins

Attempts 06, 07, and 08 remain present as historical diagnostics, including the earlier counter pass, renderer-oracle failure, focus-witness checker failure, and callback-lifetime failure. Their hashes are captured in `evidence/reviews/xr-harness/attempt10-audit.json`; they are not treated as current-source passes. Attempt 10 itself records the frozen current source hashes below, and the independent audit verified that all per-run pinned files still have those recorded bytes.

| Current harness source | SHA-256 |
| --- | --- |
| `compiled-backends/conformance/browser.mjs` | `9c0f4e41c918c1104b10fb29a0a218bd2b723280bcf6573a5350952041a5179e` |
| `compiled-backends/conformance/check.mjs` | `8445bb81fa6fc3822f58ca7d090d48eaa91596e99585d14c88180c30f9c201a3` |
| `compiled-backends/conformance/run.mjs` | `bb4d5036f95695600a07c55b01852c784e98ad0fd7357e08fe22a33fa3bfe73b` |
| `compiled-backends/conformance/swap-schedules.json` | `f0bf47cf0ac5c17f876a316508729e6d29082feecf08df9813538c5a49b24053` |
| `compiled-backends/conformance/check.test.mjs` | `5cbab8a25128b39ebb78fc1b942f9f931faad67671b6793e59f8020f2a781b66` |

## Verification performed

- Node v22.23.4 syntax checks passed for `browser.mjs`, `check.mjs`, and `run.mjs`.
- The existing checker suite passed **5/5**. It covers mutation rejection, focus with and without declared witnesses, separate retired/active callback lifetime handling, action target values, and message evidence. Node emitted the environment's non-failing experimental `UNDICI-EHPA` warning.
- `audit_attempt10.py` independently verified all 340 before/after source-pin entries (170 identical pairs), build output hashes, bundle hashes, checker/run consistency, native/direct equality, all matrix totals, the stale-action record, and post-unmount behavior. Result: accepted.

The audit command did not rerun N3's Chromium matrix or rewrite its captures. It does not independently claim a new browser execution or accept N5's integrated run. No production, harness, or N3-owned output files were changed.

## Evidence

- `compiled-backends/evidence/reviews/xr-harness/audit_attempt10.py`
- `compiled-backends/evidence/reviews/xr-harness/attempt10-audit.json`
- `compiled-backends/evidence/reviews/xr-harness/audit-command.log`
- `compiled-backends/evidence/reviews/xr-harness/check-tests.log`
