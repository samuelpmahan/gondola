# E1 author report — Go async save session and WASM API

## Implemented

- `asyncsave/` provides pure `Init`, `Update`, and `View` functions plus `Session` state, dispatch, reply completion, a typed command outbox, and copied completion audit receipts. `State` embeds `editor.State`, so snapshots serialize `Draft`, `Saved`, and `Saves` at the top level beside `NextID`, `PendingID`, and `Status`.
- `View` reuses `editor.View` and its `inputbinding` sidecar. It keeps the original five editor children and appends Cancel, Status, and Pending output. Reset is enabled for editor work or non-idle async status; the request counter alone does not enable it.
- Save commands capture the exact draft and use monotonically increasing IDs through reset. Replacing a pending save queues cancel before start. Allocation fails atomically at the JavaScript safe-integer boundary, before it can cancel prior work or append a save message.
- `Complete` rejects zero and unsafe IDs atomically. Each valid delivery adds a decimal-ID `reply` message and audit record. Only the active ID changes state; stale, duplicate, cancelled, and post-reset replies remain observable without changing application state. Active errors preserve prior saved data and save count.
- `cmd/async-save-wasm/` exposes `globalThis.gobiAsyncSave={init,dispatch,complete,effects,audit}`. Its wire validator requires the exact Step object `{Path,Event,Value}` with primitive string fields and the exact Reply object `{ID,Value,Error}` with a primitive number ID in `1..9007199254740991` and primitive string values. Missing, null, wrong-typed, wrapped, non-object, and unexpected fields return `{error: ...}` before the session is called. Cycles, BigInt, and throwing serializers also return errors instead of terminating WASM. `smoke.mjs` exercises the actual WASM API with Node built-ins.

## Tests and build evidence

Tests were written before the implementation. The first `/tmp/gondola-go/bin/go test ./asyncsave` failed to compile because the new tests referenced the not-yet-implemented `Session`, `Snapshot`, `NewSession`, `Command`, `Reply`, and `Outcome` types.

The following targeted package tests passed after implementation:

```sh
/tmp/gondola-go/bin/go test ./asyncsave ./cmd/async-save-wasm
```

Output:

```text
ok  github.com/samuelpmahan/gondola/asyncsave
?   github.com/samuelpmahan/gondola/cmd/async-save-wasm [no test files]
```

Both the native stub and JS/WASM bridge builds passed:

```sh
/tmp/gondola-go/bin/go build -o /tmp/async-save-wasm.wasm ./cmd/async-save-wasm
GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/async-save-wasm-browser.wasm ./cmd/async-save-wasm
```

The final WASM bridge build, boundary smoke, and syntax check passed with Node `v22.23.4`:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --check cmd/async-save-wasm/smoke.mjs
/tmp/gondola-node22/node_modules/node/bin/node cmd/async-save-wasm/smoke.mjs /tmp/async-save-wasm-bridge-review.wasm /tmp/gondola-go/lib/wasm/wasm_exec.js
```

```text
WASM API smoke passed: exact Step/Reply schemas, atomic malformed-input rejection, valid reply recovery, outbox drain, audit, safe IDs, and unserializable-input recovery.
```

The Go test cases cover flattened snapshot JSON and field ordering, stable editor bindings and child indices, disabled controls, edit/save/cancel/reset, exact command order and captured values, reset ID non-reuse, duplicate and out-of-order replies, stale replies after cancel/reset, accepted errors and retry, atomic invalid IDs, safe-integer exhaustion without canceling active work, and copy isolation for snapshots and audits. The final Node smoke rejects null, missing, wrong-type, wrapped, extra, non-object, invalid-ID, cyclic, BigInt, and throwing-serializer inputs before session mutation. It verifies unchanged messages/outbox/audit while a valid request remains pending, then proves a valid reply still applies and the runtime remains alive.

XR-E1's initial independent finding about JSON `null` decoding into Go string zero values was amended in `cmd/async-save-wasm/main_wasm.go`; final source was rebuilt at `/tmp/async-save-wasm-bridge-review.wasm` and rerun through the expanded smoke. The initial finding remains preserved in the reviewer record; the final independent recheck is tracked separately.

## Scope and handoff

Only `asyncsave/`, `cmd/async-save-wasm/`, and this author report were changed for E1. No inherited editor, renderer, session, or Git state was modified. The E5 integrated runner owns the full inherited suite and browser-level composition; this report claims native package and WASM API checks, not browser transport/rendering parity.
