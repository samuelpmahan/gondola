# E-GO — typed effects in independently keyed Go children

**Worker:** N1  
**Outcome:** `mixed_change`  
**Repository base:** `f4c8f70199a8ca896c13e225a85901abe658d0de`

## Implementation

Added `fixtures/compiled/effectmodulechild`, a value-owned wrapper around the existing `modulechild.Core`. The wrapper retains the standard `Input(State, modulewire.Input) State` and `Publication(State) modulewire.Publication` roles. Its state stores the keyed mount identity, per-generation safe request ID, pending flag, opaque token, and reply. Go messages are `mount(key:gN)`, `unmount(key:gN)`, `request`, `cancel`, and `complete(token)`; existing empty-argument `add` and `reset` continue through the old Core.

Mount and token parsing require canonical positive safe integers. A fresh wrapper accepts one mount. Requests are suppressed while pending and increment their per-generation ID before emitting `fixture.request/save/token/complete`. A valid completion echoes the exact token into Go-owned reply state. Cancel and unmount emit `lifecycle.cancel/cancel/token/empty`; unmount first sets `Mounted=false` and clears `Pending`. Stale, malformed, cross-key, cross-generation, and duplicate completions leave Go state unchanged. The reply is a bounded token echo; this fixture makes no external payload claim.

The existing child counter view remains in place. Request and cancel controls are appended at paths `3/0` and `3/1`; the existing Add and Reset paths remain `2/1` and `2/2`. Request is disabled while pending; Cancel is enabled only while pending.

Added `cmd/module-effects-native`. It composes the existing keyed parent with independently mounted effect-child states and does not add a child import to the parent. It resolves literal view clicks against Go `View`, applies typed input/publication roles, and queues effect requests until explicit `transport-reply` events. The trace has separate full-current-state snapshots, event references, ordered Go effects, ordered transport events, a final pending projection, and retired-child state. Each removal records five causal lifecycle entries: Go unmount before state; unmounted Go state; emitted Go cancellation; transport cancellation; renderer teardown. It does not nest prior events or effects in state snapshots.

## Frozen interface

- Component package: `github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild`.
- `State`: `Core modulechild.State`, `Key string`, `Generation uint64`, `Mounted bool`, `RequestID uint64`, `Pending bool`, `Token string`, `Reply string`.
- Token: `key:g<generation>:r<requestID>`; canonical positive decimal safe integers; keys `a` and `b`.
- Request effect: `{Kind:"fixture.request", Name:"save", Arg:token, Reply:"complete"}`.
- Cancel effect: `{Kind:"lifecycle.cancel", Name:"cancel", Arg:token, Reply:""}`.
- Reply message: `{Name:"complete", Arg:token}`; Go stores the token as `Reply`.
- Native input: `gobi.module-effects-scenario/v1`; output: `gobi.module-effects-native/v1`.

## Verification

TDD began with the package tests failing because `Init`, `Update`, and `State` were not implemented. After the wrapper and replay were added, Go 1.24 tests passed for the new wrapper and CLI plus the existing keyed parent, module child, module parent, and wire packages. The raw logs preserve the initial red attempt and a first formatter lookup failure (`gofmt` was not on the shell PATH); formatting then used `/tmp/gondola-go/go/bin/gofmt`.

The frozen literal replay ran with 31 source events and produced 32 state snapshots, 10 Go effects, 20 transport ledger rows, one retired child, and no final pending requests. The three deterministic schedules also ran successfully:

| Seed | Events | States | Effects | Transport rows | Pending |
|---|---:|---:|---:|---:|---:|
| 20261104 | 49 | 50 | 16 | 32 | 0 |
| 20261105 | 50 | 51 | 17 | 34 | 0 |
| 20261106 | 48 | 49 | 15 | 30 | 0 |

The literal trace confirms a canceled request cannot complete, a duplicate completion is rejected, a renderer swap leaves a pending request deliverable, and key `a` can reuse request ID 1 only under generation 2. The Go test also checks Add/Reset isolation and that removal records old state before teardown.

## Evidence boundary

This packet covers the Go wrapper and native Go replay. The four compiler builds, AppIR typed-role/helper/effect admission, the independent host, direct/browser parity, mutation controls, real-timer demo, archive, and publication remain downstream lane or root gates. No browser, compiler build, or full repository test suite was run by N1. No Git mutation or shared-source change was made by N1.

Exact commands, Go/Node versions, source/dependency pins, initial failures, literal stdout, and seeded replay hashes are recorded under `module-effects-coordination/rawlogs/E-GO/`.
