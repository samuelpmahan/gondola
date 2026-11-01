# XR-HARNESS — independent review of E-HARNESS

**Reviewer:** N2  
**Job:** XR-HARNESS  
**Decision:** `accepted`  
**Reviewed packet:** E-HARNESS, author-frozen after attempt-03.

## Review result

I independently verified the sealed source inventory and rechecked every saved native/direct/browser capture against the frozen native oracle. The source file pins all matched: 59 build source entries and 13 harness/dependency entries, covering 71 unique files because `compiled-module-effects/build/module-loader.mjs` appears in both sets. The final build index also matches its SHA-256 pin.

The replay matched all four scenarios across 20 actual capture arrays: eight direct profiles (React and DOM for each scenario) and twelve mounted browser profiles (React, DOM, and swap for each scenario). The derived counts are:

| Evidence | Count |
|---|---:|
| Native source events | 178 |
| Native full-state checkpoints | 182 |
| Go effects | 58 |
| Transport rows | 116 |
| Direct profile event rows | 356 |
| Mounted browser profile event rows | 534 |
| Total profile event rows | 890 |
| Profile state snapshots | 910 |

The 182 native checkpoints are the 178 events plus one initial full state for each of four scenarios. Each of the 20 profile captures has one initial snapshot and one snapshot per event.

## State, rendering, input, and ordering checks

The independent audit checked the raw parent Go state and encoded state at every snapshot, and the full child state fields `Core`, `Key`, `Generation`, `Mounted`, `RequestID`, `Pending`, `Token`, and `Reply` wherever a child is mounted. Every mounted child has captured Go View tree and binding records. Browser snapshots contain actual DOM HTML and control arrays; the audit checked 83,106 DOM control fields. Direct profiles use the synthetic renderer path and correctly record no browser DOM snapshot.

All 324 browser click events record `usedHTMLElementClick: true` on a connected button. The 276 enabled clicks invoke exactly one renderer callback; the 48 disabled clicks invoke none. The direct captures use the host callback path and leave `domClick` null, so browser input is clearly distinguished from direct dispatch. This is programmatic `HTMLElement.click()`, with no trusted pointer or OS-input claim.

The saved literal direct React ordered ledger records request Go state commit (sequence 3), request queue (4), render commit (6), then transport start (7). For cancellation, the Go cancel effect precedes correlation retirement and transport cancellation (sequences 16–18). On removal, Go unmount update/commit and Go cancellation precede transport cancellation and renderer teardown (55–62). The independent parity oracle checks the ordered ledgers for all 20 captures, including pending replies across backend swaps, retained callbacks, duplicate replies, and old-generation fencing.

Snapshot records contain only current Go state, current View/DOM projection, and live pending correlations. Event, ordered, effect, lifecycle, and transport histories are separate top-level arrays; they are not recopied into every snapshot. The saved shape is linear in events, snapshots, and ledger rows. The recheck found no nested event/lifecycle-history expansion in the 910 snapshots.

## Mutation controls and preserved failures

The independent rerun rejected all 15 malformed cases: eight capture mutations and seven build-admission mutations. The capture set covers Go cancellation and sibling isolation, duplicate and wrong-correlation replies, old-generation replies, renderer-epoch confusion, start-before-render, and cancellation ordering. Build controls cover descriptor/capability removal, failed child admission, wrong child package, keyed-helper removal, source-pin removal, and changing child uint64 representation to number.

Attempt-01 is preserved with its pinned Go version string format failure before capture. Attempt-02 preserves five literal profiles and the pending-row schema mismatch; the N5 correction was independent of N4 source. Attempt-03 is the successful packet rechecked here. These attempts remain in the original E-HARNESS evidence tree; this review stores hash references instead of duplicating the captures or browser bundles.

## Verification and evidence

The review command reloaded the pinned build index, ran the independent build-admission checker and its seven mutation controls, verified all 72 source-pin entries, replayed native parity on every scenario/profile set, reran all eight capture mutation controls, and checked DOM click, state, View, DOM/control, and lifecycle ordering evidence. It exited successfully under Node v22.23.4.

The exact command and audit output are in `rawlogs/XR-HARNESS/independent-audit.log`; the audit script and result are adjacent. The reviewed report/receipt, source inventory, final build index, successful evidence, and attempts 01/02 are pinned in `rawlogs/XR-HARNESS/source-pins.json`. That raw-log tree is checksummed by its own index. No production source, E-HARNESS evidence, Git branch, or scheduler state was changed by this review.

## Scope boundary

This acceptance covers the sealed E-HARNESS captures against the pinned E-BUILD-final index. It does not qualify the reusable build CLI for arbitrary output or checkout roots. A later N6 run found a separate source-path comment normalization case under a fresh output root; root assigned that issue to E-BUILDPATH.

## Limits

This independent review replays the sealed capture arrays through the oracle and inspects the browser click records and frozen runner source; it does not launch a second browser session. The packet demonstrates programmatic browser clicks and deterministic deferred transport, not trusted physical input or a real HTTP service.
