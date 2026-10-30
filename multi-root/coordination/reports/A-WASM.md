# A-WASM — Strict WASM session boundary audit

## Result: no concrete blocker found

Audited `cmd/multi-root-wasm` strict decoding, method arity and error frames, session routing, and invalid-operation atomicity. The bridge consistently enforces primitive safe-integer IDs, exact own-field objects, primitive string fields, and exact argument counts. Scoped calls pass the decoded session ID to `multisession.Manager`; invalid dispatch/reply inputs return `{error: string}` before any session mutation. I found no reproducible defect in the assigned scope.

## Evidence

- `cmd/multi-root-wasm/main_wasm.go:27-150` exposes the ten expected methods. Each binds an explicit arity, validates its session/request arguments, and routes scoped calls through the manager with the supplied ID. `method` at lines 156-167 converts panics into the exact error frame; `exactArgs` rejects both missing and extra arguments.
- `cmd/multi-root-wasm/main_wasm.go:182-213` and `216-333` require primitive numeric safe integers and exact own-key step/reply objects. `Reflect.ownKeys` includes symbols and non-enumerable keys; accessors and proxy traps are caught as error frames. String fields must be primitive strings.
- `cmd/multi-root-wasm/bridge_decode.go:19-159` provides native-testable JSON decoders. They reject non-objects, duplicate keys (including escaped duplicates), extra/missing keys, non-string fields, noncanonical or unsafe reply IDs, and trailing JSON values. `main_test.go` covers these cases and numeric boundaries.
- Atomicity follows from `collection.Session.Dispatch`: path, key, binding, transition, and allocation validation complete before state, history, outbox, or request ownership is committed (`collection/session.go:182-214`). The bridge completes decoding before calling this method. Reply shape and ID validation likewise precede `Manager.Complete`.
- Session scoping is direct: `Manager.Dispatch`, `Effects`, `Complete`, `Audit`, and `Dispose` resolve only the addressed manager entry (`multisession/manager.go:63-127`). Completion request IDs are local to that session.

## Executed verification

- Direct Node 24 probe against the existing `multi-root/build/multi-root.wasm`: created two sessions with IDs 1 and 2, dispatched the same row/request IDs into both, rejected extra method arguments, extra object fields, fractional reply IDs, and a throwing `ownKeys` proxy, verified the invalid calls left the target snapshot unchanged, then completed request 1 in session 1 and confirmed session 2 remained pending. Result: `{"ok":true,"ids":[1,2],"malformedRejected":true,"invalidAtomic":true,"sessionRouting":true}`.
- The browser smoke source (`cmd/multi-root-wasm/smoke.html`) additionally checks all method arities, symbol and non-enumerable extras, throwing proxy/getter containment, invalid-ID variants, exact error-frame shape, and unchanged snapshots after malformed calls.
- Native Go tests could not be run in this environment: `go` is absent from `PATH`, and the previously reported `/tmp/gondola-go/bin/go` is no longer present. No toolchain was downloaded. The checked-in Go tests were inspected but not rerun.

## Limits

The direct WASM probe used the existing generated artifact rather than a fresh build. Full browser smoke was not run because no Chromium executable is available in this environment. No production or test files were changed.
