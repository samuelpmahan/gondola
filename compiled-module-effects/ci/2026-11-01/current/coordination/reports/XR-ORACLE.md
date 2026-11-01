# XR-ORACLE — independent review of E-ORACLE

**Reviewer:** N4  
**Job:** `XR-ORACLE`  
**Decision:** **AMEND**  
**Reviewed packet:** sealed E-ORACLE report, receipt, source inventory, raw-log index, exact oracle/test sources, E-HARNESS attempt 03 captures, and the pinned E-BUILD-final artifact.

## Decision

The healthy capture matrix matches the independent finite replay across all four scenarios and five profiles. The captured Core state, effects, browser DOM, disabled controls, request/cancel ordering, generated build boundary cases, and the existing 8 + 7 saved-evidence controls all pass.

AMEND is required because the parity checker accepts two malformed reply-ledger captures: it does not require a reply correlation, and it does not validate the causal `stateEventIndex` on an accepted reply. Both fields are present and correct in the healthy packet. The gap is in the oracle’s fail-closed validation, not in the observed runtime result.

## Packet and source verification

- The sealed E-ORACLE report and receipt match `seal.json`; both owned source files match the sealed source inventory. All 37 indexed E-ORACLE raw-log files rehash correctly.
- The E-ORACLE dependency manifest has 59 source pins. During this review, N2’s path repair changed three current files: `abi-admission.mjs`, `build.mjs`, and `module-loader.mjs`. The review therefore reloaded the exact sealed E-BUILD copies for those three sources and checked all 59/59 original dependency pins. The other 56 pins also match the current worktree.
- The pinned E-BUILD-final index remains SHA-256 `70046a0e7f1070c3ec2ad2186e060137a77f2d8df02b5c23bb1760baf156c444`. The N4 attempt-03 capture summary remains SHA-256 `ef336f8b37a8d19980ec6cd230efcfb186890d41cabb9fb3f65a6656a8bbffb4`.
- The review-only loader preparation redirects source-pin reads to those sealed files. The E-BUILD and E-ORACLE production sources were not edited by this review. The separate E-BUILDPATH qualification is outside this review.

## Healthy evidence reviewed

The sealed oracle regenerates the literal intent stream and the three fixed seed streams itself. Its model tracks parent/controller state, each child’s complete effect wrapper and `modulechild.State` Core, keyed generation, per-generation request ID and token, pending replies, publications, retired child state, and transport outcomes. Native output is checked against that model; the native trace is not used to derive expected transitions.

| Scenario | Events | Native states | Effects | Transport rows | Lifecycle rows |
|---|---:|---:|---:|---:|---:|
| Literal | 31 | 32 | 10 | 20 | 5 |
| Seed 20261104 | 49 | 50 | 16 | 32 | 5 |
| Seed 20261105 | 50 | 51 | 17 | 34 | 5 |
| Seed 20261106 | 48 | 49 | 15 | 30 | 5 |

Across the 20 profile captures, the replay matched 178 native events, 182 native states, 58 effects, 116 transport rows, 20 native lifecycle rows, 890 profile event rows, and 910 profile snapshots. The expected Go tree and full current Go state matched in direct React, direct DOM, browser React, browser DOM, and browser swap captures.

The browser checker parses each saved live `innerHTML`, normalizes attribute order and comment markers, coalesces adjacent text nodes, and compares wrappers, nodes, attributes, and text with the expected Go trees. It also checks rendered control type, value, disabled status, connection, and callback deltas. The three browser profiles recorded 324 actual `HTMLElement.click()` calls; 48 disabled clicks invoked no callback, leaving 276 callbacks. Page errors were zero.

Snapshot rows contain state and pending correlations; full trace history is kept in separate ordered, effect, lifecycle, and transport ledgers. The top-level trace field contains call counts, failure, and renderer epoch, with no nested event history growing in each snapshot.

The ordered ledger confirms request → Go commit/render → transport start; correlation survives renderer swaps independently of renderer epoch. Cancellation retires the request correlation after the Go cancellation transition and before `transport.cancel`. Removal records Go unmount, unmounted state, declared cancellation, transport cancellation, then renderer teardown, with the retired generation preserved.

Build admission loaded four independent React/DOM parent/child builds, the five standard child roles (`Init`, `Update`, `View`, `Input`, `Publication`), five capabilities, and two closed effect descriptors. For each backend the checker replayed ten native boundary cases across 16 state/effect steps and four effects through the generated child `Update` and encoder. `Generation` and `RequestID` remained the only `uint64` BigInt fields and encoded exactly within the JavaScript safe-integer range. The existing seven build-admission controls rejected all seven mutations.

The sealed Node tests passed 3/3, and the sealed oracle syntax check passed. N5’s eight capture controls and seven build controls pass on the healthy packet. They mutate saved evidence and are not mounted-host fault injections.

## Finding: reply correlation and causal state link are optional

`assertHostLedgers` compares a reply’s correlation only under `if (original && reply.correlation)`. Removing the correlation from the accepted reply for `a:g1:r3` still yields `status: matched`.

The checker does not compare a reply row’s existing `stateEventIndex` to the accepted source event. Setting that field to `999` on the same `a:g1:r3` reply also yields `status: matched`.

The healthy row is correctly linked: source scenario event 12 has `hostEventIndex: 10` and `result.eventIndex: 10`; its reply row has `stateEventIndex: 10` and correlation `{dispatchId: "dispatch-000005", effectIndex: 0}`. Rejected duplicate or canceled deliveries can legitimately point to the prior delivery/cancellation state while their current source event has no host event. Validation should require the correlation on known replies and compare accepted reply state linkage to the accepted source event, while modeling rejected rows against their original correlation and prior state.

The existing eight capture mutations do not cover either omission. The independent repro is saved in [correlation-linkage-gap-probe.stdout.json](../rawlogs/XR-ORACLE/correlation-linkage-gap-probe.stdout.json), with the exact source hash and mutations in [correlation-linkage-gap-probe.mjs](../rawlogs/XR-ORACLE/correlation-linkage-gap-probe.mjs).

## Commands and evidence

The authoritative old-scope replay, unit output, packet verification, and exact commands are indexed in [rawlogs/XR-ORACLE/index.json](../rawlogs/XR-ORACLE/index.json). The full E-ORACLE and E-HARNESS archives remain referenced by their original hashes; this review does not duplicate them.

Toolchain: Node `v22.23.4`; root Go `go1.24.0`; compiler Go `go1.27.3`; GoScript `v0.6.2`; esbuild `0.28.2`.

**No production source files were modified during this review.**
