# XR-GO — independent review of the sealed native Go packet

**Reviewer:** N3  
**Decision:** `accepted`  
**Score:** 200/200; broken items: 0  
**Reviewed packet:** original sealed E-GO only (`module-effects-coordination/seals/E-GO`)  
**Base:** `f4c8f70199a8ca896c13e225a85901abe658d0de`

## Scope and source identity

This review covers the original Go wrapper and native replay packet, not the later E-GOCOMPILE implementation or analyzer changes. The sealed E-GO report and receipt hashes match `seals/E-GO/seal.json`; all six owned source files match `source-inventory.json`. Nine base dependency files match the E-GO pinned hashes from an archive of the exact base commit. The remaining pinned dependency, `compiled-module-effects/conformance/scenarios.mjs`, matches its captured E-GO hash.

The archived keyed parent source matches its original E-GO dependency hash and has no `effectmodulechild` import, so the parent/child composition remains one-way as claimed.

To avoid reviewing the later working-tree source, I created `/tmp/gondola-xr-go-original` from `git archive` of the base commit and overlaid only the six sealed E-GO source files. No production source was edited. The original focused Go command passed all six packages; `counter` correctly reported no test files.

## Native replay and count checks

The original literal scenario has 31 events. Replaying it from the isolated sealed source produced byte-for-byte identical output to the sealed E-GO output (SHA-256 `dffa1412facedeb3d5047f0def6f297dfe296c8ca070a3519a606e50a668ebc8`). The output contains 32 state snapshots, 10 Go effects, 20 transport rows, one retired child, and zero pending transports.

All three original seeded schedules were also rerun from the isolated source. Each output hash exactly matches the recorded E-GO seed summary:

| Seed | Events | States | Effects | Transport rows | Pending |
|---|---:|---:|---:|---:|---:|
| 20261104 | 49 | 50 | 16 | 32 | 0 |
| 20261105 | 50 | 51 | 17 | 34 | 0 |
| 20261106 | 48 | 49 | 15 | 30 | 0 |

## Contract review

The wrapper keeps request ID, pending/reply state, mount identity, token validation, and cancel decisions in Go. It emits only the frozen request and cancellation descriptors. Canonical positive safe-integer parsing rejects malformed, cross-key, cross-generation, leading-zero, zero, and out-of-range identities. A request commits the next ID and pending token before returning its effect; duplicate pending requests are no-ops. Completion accepts only the exact current pending token, while duplicate, canceled, stale, and malformed replies leave Go state unchanged. Existing counter, typed Input, and Publication behavior is delegated to the original module child.

The literal removal at event 15 retains the complete retired Go child state. Its ordered lifecycle rows are `go.update.unmount` → `go.state.unmounted` → `go.effect.cancel` → `transport.cancel` → `renderer.teardown`. Before unmount, generation 1 has request ID 4 and pending token `a:g1:r4`; after the Go update, `Mounted` and `Pending` are false while the ID and token are retained. The test also checks the old request is canceled, the old reply cannot mutate a remount or sibling, and generation 2 can start at request ID 1 under a distinct token.

The native replay resolves clicks against the current Go View and respects disabled controls. It captures full parent/child state snapshots separately from event, effect, transport, lifecycle, and retired-child ledgers. The native renderer-swap event is only replay metadata; this packet does not claim real renderer or browser behavior.

## Evidence boundary

The sealed E-GO packet is accepted for its declared native Go scope. It does not establish compiler admission, browser interaction, real asynchronous transport, or full-repository correctness. Those remain later gates. E-GOCOMPILE’s later fixes do not invalidate the native-only E-GO claims reviewed here.

Commands, original source verification, isolated test output, literal count/hash comparison, seeded count/hash comparisons, and tool versions are indexed under `module-effects-coordination/rawlogs/XR-GO/`.
