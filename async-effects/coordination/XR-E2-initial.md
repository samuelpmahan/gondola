# XR-E2 independent review: host and transports

## Review result

The host's single-session queue and transport behavior pass the focused checks below. I found one conditional session-isolation bug that needs a contract decision before treating the public host API as safe for multiple live hosts. I also found a low-severity mismatch between the announced `pending()` semantics and the implementation/tests.

## Findings

### XR-E2-1 — A live old host can complete a new Go session by reusing an ID

`createEffectHost` calls `runtime.init()` for every new host instance (`host.mjs:88–90`). Each host's `requests` map and active lifecycle are private to that host. A delivery callback checks only its own host lifecycle, then calls the shared `runtime.complete()` with the request ID (`host.mjs:310–329`). If two hosts share the package-global WASM runtime and the first host remains mounted, the second host's `init()` replaces the Go session and restarts IDs at 1. Once the second session has pending ID 1, the still-active first host's old ID 1 callback is indistinguishable to Go and can complete the second session.

I reproduced this on Node v22.23.4 using `createAsyncReference()` as a runtime with the same `init()` replacement semantics and two effect hosts with separate callback transports. Host A started ID 1; host B initialized the shared runtime and started its own ID 1; delivering A's callback changed the runtime to `Saved: "old session answer"` and `PendingID: 0`. B's correct ID 1 reply then remained stale. This requires overlapping host lifetimes; unmounting A before creating B correctly fences its callback.

**Action:** either enforce and document one active host per runtime (including rejection of a second host until the first is unmounted), or add a runtime/session generation fence to delivery callbacks. Add a regression test for both the overlapping-host collision and the unmount-before-new-session safe path.

### XR-E2-2 — `pending()` includes cancelled records despite the announced API

The E2 API announcement described `pending()` as returning undelivered, uncancelled commands. Current `transport.mjs:113–116` filters only on `deliveries === 0`, so a cancelled but undelivered request remains in the result. `transport.test.mjs` explicitly expects that behavior after cancellation. Keeping its callback deliverable is correct for advisory cancellation; the ambiguity is whether `pending()` means “not yet delivered” or “currently uncancelled.”

**Action:** make the API description and expectation explicit. If it means undelivered work, current code/test are consistent; if it means uncancelled pending work as announced, filter cancelled entries while retaining their callbacks for forced late delivery.

## Verified behavior

- `node --test async-effects/host.test.mjs async-effects/transport.test.mjs` passed: 16 tests, 0 failures, on Node v22.23.4.
- The focused checks confirmed deferred effect draining, save followed by renderer swap before the drain, out-of-order/duplicate late replies, mount-time dispatch fencing, and old-renderer facade fencing.
- The cancellation-failure test confirms the queue reports the error and still starts later commands from the same outbox batch. A separate check confirmed the same for a failed first `start` followed by a valid second `start`.
- An unmount check with both `transport.cancel()` and renderer `unmount()` throwing confirmed errors are aggregated, the root is still cleared, and late delivery makes no Go completion call.
- The manual transport accepts `Number.MAX_SAFE_INTEGER` and rejects the next integer; its delivery callback and returned reply agree at the upper bound.
- Unmount sets the host to disposed and clears the renderer owner before cancellation/renderer cleanup. Late callbacks are fenced even when cleanup reports errors.

No implementation files were changed in this review. I did not run the integrated browser/WASM harness; E4/E5 own that gate.
