# E-GO (N1) author report

**Outcome: `mixed_change`.** Implemented the Go-owned typed keyed child collection, stable Gobi projection, deterministic lifecycle scenario, and native trace CLI. The contract was frozen by the root before implementation. This lane did not edit compiler, host, harness, oracle, delivery, or scheduler files.

## Go state and view

- `State` owns `Children []ChildState` in presentation order. Each child owns its stable key, `counter.State`, globally allocated creation generation, per-generation request sequence, pending token, and reply.
- Parent and child requests use the frozen `fixture.request/lookup/.../complete` profile. Cancellation uses `lifecycle.cancel/cancel/.../empty`. `Update` value-copies the child slice before mutations so an earlier state remains unchanged.
- Add, duplicate add, move, remove, key reuse, counter update, request, completion, clear, parent removal, and remount are handled by Go. Keys follow the frozen lowercase ASCII identifier rule; malformed/unknown inputs and exhausted safe-integer sequences are no-ops.
- A removed and re-added key gets a fresh global generation. Old completion messages cannot match it. Clear cancels pending children in reverse presentation order and leaves a pending parent request intact. Parent removal cancels pending children in reverse order before its own pending request.
- The Gobi view carries child keys and click handlers. Request buttons disable while pending; add buttons disable for existing keys; parent and clear controls reflect liveness and collection state.

## Native event and trace interface

`fixtures/compiled/children/scenario.json` keeps click paths plus direct Go messages, effect replies, renderer swaps, a disabled-action probe, and a captured stale-callback probe. The native CLI resolves each click path against the current Gobi view and rejects a message mismatch. Renderer swaps and callback/disabled probes stay in `events` without creating Go steps. Go-emitted request/cancel effects maintain a native pending-token ledger; effect replies require a live correlation and are consumed once. Direct stale `complete` messages exercise the reducer’s no-op path.

The recorded trace has 42 source events and 38 state-changing Go steps. Events 9–12 are tick-free: disabled request, compatible swap, stale captured callback, and rejected candidate. The fixed schedule covers append, count, duplicate add, requests, reorder while pending, selective removal, key reuse, stale completion, child clear with parent work pending, child-first parent removal, and fresh-generation remount.

## Verification

Observed Go version: `go version go1.24.0 linux/amd64`.

Executed:

```text
/tmp/gondola-go/bin/go test -count=1 -v ./fixtures/compiled/children ./cmd/compiled-children-native
```

Exit 0. Eleven top-level test functions passed, including two effect-correlation subtests (13 cases total). Reducer tests cover key/order identity, stale replies, cancellation order, duplicate pending suppression, malformed arguments, safe-integer ceilings, immutable prior state, and disabled view state. Native tests cover event/tick separation, click-path message validation, and duplicate/canceled effect-reply rejection.

```text
/tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script fixtures/compiled/children/scenario.json
```

Exit 0; output schema `gobi.compiled-children-native/v1`, 42 events and 38 Go steps. The final trace has parent generation 8 completed and one `ash` child. Raw stdout, stderr, Go version, and command record are under `fixtures/compiled/children/evidence/`.

E-COMPILER (N2) reports both current-source React and DOM GoScript builds exited 0 with 67 outputs and no diagnostics on Go 1.27.3 / Node 22.23.4. Source hashes reported by N2 match this lane’s `app.go` and `view.go`; those build results are peer-reported, not rerun by N1.

## Limits and review status

This author receipt proves Go reducer and native trace behavior. It does not claim actual emitted-runtime, mounted React/DOM, renderer-swap, HTTP demo, or cross-backend parity; those are owned by E-HOST, E-HARNESS, E-ORACLE, E-DELIVERY, and root integration. Independent review is pending; this lane does not self-approve.
