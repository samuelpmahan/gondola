# E-GO author report

**Outcome:** `mixed_change`  
**Worker:** N1  
**Summary:** Implemented the bounded Go-owned `a`/`b` keyed controller, keyed publication fence, and native Go replay CLI. Focused Go checks and the 18-event literal replay pass.

## Implemented

- Added `fixtures/compiled/keyedmoduleparent` around the existing `moduleparent.State`. Its `Init`, `Update`, `View`, `Output(State) modulewire.Input`, and `Receive(State,modulewire.Publication) State` roles match the existing parent ABI. `Output` is the same typed field projection as the existing parent. Unkeyed `Receive` is a no-op so publication updates cannot bypass key/generation admission.
- Added fixed `a` and `b` slot state, ordered membership, safe-integer generation increments, `Children(State) []keyedmodulewire.ChildRef`, `IsCurrent`, and per-slot `ReceiveKeyed`. A removal leaves a generation tombstone; remount resets that slot's publication and advances only that key's generation. Reorder changes only membership order.
- Added `fixtures/compiled/keyedmodulewire` identity and keyed-publication records. The keyed parent does not import `modulechild`.
- Added `cmd/keyed-module-native`. It composes the actual keyed parent and two separate existing `modulechild` values, resolves clicks against the current Go views, suppresses disabled actions, and emits one state/view snapshot per scenario event. Stale callback probes replay the original callback message; stale publication probes reuse the publication captured at their source event.
- Added the 18-event literal scenario at `fixtures/compiled/keyedmoduleparent/scenario.json`.

## Verification

Go command version: `/tmp/gondola-go/go/bin/go version` → `go version go1.24.0 linux/amd64`.

Commands and results:

| Command | Result |
| --- | --- |
| `/tmp/gondola-go/go/bin/go test ./cmd/keyed-module-native ./fixtures/compiled/keyedmoduleparent ./fixtures/compiled/keyedmodulewire ./fixtures/compiled/moduleparent ./fixtures/compiled/modulechild` | Pass |
| `/tmp/gondola-go/go/bin/go run ./cmd/keyed-module-native --script fixtures/compiled/keyedmoduleparent/scenario.json` | Pass; `gobi.keyed-module-native/v1`, 18 events |

The focused tests cover initial `a`/`b` generation and order, independent publications, child reset isolation, shared lock propagation, reorder preservation, remove/remount identity, stale callbacks/publications, malformed membership, invalid publication values, generation exhaustion, and disabled view controls. The native trace captures full legacy parent state plus fixed controller slots/order and each live child state/view.

N2's independent React and DOM parent/child builds completed in `compiled-keyed-modules/build/output/E-BUILD-probe-04`; both keyed-helper descriptors expose `Children`, `ReceiveKeyed`, and `IsCurrent`. Exact descriptor/build-result hashes are recorded in `rawlogs/E-GO/integration-probe.sha256`.

## Compiler integration findings

- E-BUILD probe 01 rejected the initial pointer-based `setSlot(*State, ...)`; it was changed to a value-in/value-out helper.
- E-BUILD probe 02 rejected a nested `moduleparent.Output` call and unguarded integer increment/decrement shapes. `Output` now returns the equivalent typed field projection, and generation/count arithmetic is guarded inline. The parent then passed the actual GoScript compiler.
- The GoScript module output exposes only the five standard ABI roles. Keyed helpers therefore depend on the E-BUILD-owned adapter sidecar; this lane does not change shared compiler sources.
- E-BUILD probe 03 encountered a duplicate-export error in the helper adapter. N2 corrected that adapter and probe 04 produced successful React and DOM outputs; this was not a Go fixture failure.

## Limits

- The controller is deliberately finite: keys `a` and `b`, with JavaScript-safe integer generations.
- This proves synchronous Go transitions and generation fencing. It makes no asynchronous effect or browser acceptance claim; runtime lifecycle and mounted renderer checks belong to E-HOST/E-HARNESS and the integrated milestone.
- The exact focused command output, native JSON trace, Go version, and source/dependency hashes are under `rawlogs/E-GO/`.

## Source hashes

Owned source hashes are sealed in `rawlogs/E-GO/owned-source.sha256`. Existing parent/child/wire/counter dependency hashes are sealed in `rawlogs/E-GO/dependency-source.sha256`. No existing fixture receipt or Git state was changed by this lane.
