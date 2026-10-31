# XR-R-RUNTIME (N6 independent review of N1)

**Decision: accepted.** The R-RUNTIME repair addresses both bounded defects from XR--RUNTIME: malformed focus results are handled at the correct lifecycle phase, and only `restoreFocus(true)` is reported as restored. Rejected Promise returns fail synchronously without leaking an unhandled rejection, including a normal Promise subclass whose `.then` method is overridden.

## Source and protocol review

Reviewed runtime SHA-256 `e729e3b360892edf01511b64657d32f638db54b5f5b0d2767b980114bb6d3105` and test SHA-256 `3ddaaded2db26d7b2acf9bcbd8e85584f1f4b57e1e89b325a602aff5dab39fcc`, matching N1's R-RUNTIME receipt.

The replacement sequence validates method shape/focus pairing and declared async methods before teardown. Focus capture then runs before old renderer unmount. Its returned value is checked synchronously for thenability and validated as `null` or an exact data record with a string identity, safe nonnegative selection offsets (`selectionEnd >= selectionStart`), and string direction. Throws, returned thenables, and malformed records reject while the old renderer remains active; they do not halt the runtime or add an application tick.

After teardown and next-renderer commit, focus restoration is called only when the old renderer captured a non-null record and the next renderer provides the paired method. The return must be exactly `true`. `false`, other non-boolean values, thenables, and throws fail closed at `focus-restore`; diagnostics do not mark focus as restored, the runtime is halted/unavailable, and no rollback is claimed.

`noThenable` handles actual Promise objects by calling the captured `Promise.prototype.then` intrinsic with a rejection handler that fulfills the sink. This bypasses an own `.then` getter and a Promise subclass's overridden `.then` method. Other values are rejected when their `then` property is callable; the function itself is not invoked. For a regular synchronous function that returns a Promise, failure timing follows the operation: focus capture is still a pre-teardown rejection, while update/unmount/focus-restore results discovered after teardown fail closed.

## Independent verification

| Check | Command | Result |
|---|---|---|
| Runtime suite | `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/runtime/runtime.test.mjs` | Node v22.23.4; 25 passed, 0 failed |
| Promise/thenable probe | `/tmp/gondola-node22/node_modules/node/bin/node compiled-backends/evidence/reviews/xr-r-runtime/promise-edge-probe.mjs` | Passed; rejected Promise subclasses from capture and update produced no unhandled rejection; overridden subclass `.then` and custom thenable `.then` methods were not invoked |

The original 25-test log is in `evidence/reviews/xr-r-runtime/runtime-node22.log`. The focused probe and its output are `promise-edge-probe.mjs` and `promise-edge-probe.log`; the audit notes and scope limits are in `audit.md`. Node emitted the existing experimental `UNDICI-EHPA` warning.

## Limits

- This accepts the bounded runtime repair only. N3's full four-app React↔DOM matrix and the separate checked-property remount repair remain outside this review.
- The runtime does not sandbox arbitrary JavaScript objects. A thenable's `then` property may be inspected, and hostile Proxies, side-effecting accessors, or Promise species constructors are outside this acceptance.
- No production code was changed by N6.
