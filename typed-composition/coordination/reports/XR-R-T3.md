# XR-R-T3 — independent review of the refresh operation guard

## Decision

**Accepted.** The pre-fix renderer-update path could synchronously enter `dispose`, call Go `DisposeTree`, and invalidate the session while the outer refresh was still executing. The current session-tree host reserves the structural operation slot for the full refresh call, rejects nested `dispose`, `replace`, and `refresh` before those operations reach Go or mutate renderer lifecycle, and clears the reservation in `finally` on success and failure. The focused regressions and bounded probes passed.

## Evidence reviewed

- Read `typed-composition/coordination/reports/R-T3.md`, the original `typed-composition/coordination/reviews/XR-T3.diff`, current `session-tree/host.mjs` and `host.test.mjs`, and the typed-composition `XR-T3-probe.mjs`.
- The R-T3 report records the pre-fix targeted regression failing with `manager.calls.disposeTree` equal to `[1]`: nested disposal committed during the renderer callback, after which outer refresh failed. In the original T3 diff, the refresh implementation calls `flatHost.refresh()` without `assertIdle()` or an operation reservation.
- In current `session-tree/host.mjs`, `refresh()` checks idle state, stores `{kind: "refresh", node}` before calling `flatHost.refresh()`, and resets `operation` in `finally`. Thus errors from the flat refresh, lifecycle reconciliation, or result cloning do not leave the structural guard held.
- The current host test wraps renderer `replaceChildren()` so the update callback attempts nested `dispose`, `replace`, and `refresh`. All three are rejected with the active-refresh error, `manager.calls.disposeTree` remains empty, and the outer refresh updates the same renderer with lifecycle `active`.
- The disposal reservation is also set before Go `disposeTree`; its error-frame regression restores the subtree and permits a later mount. The normal disposal regression verifies cancellation and sibling survival. These are context for this guard review, not a reuse of the earlier PR9 raw-dispose reentry acceptance.

## Verification

Focused current host tests:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
node --test --test-name-pattern='refresh|subtree disposal reserves|DisposeTree failure' session-tree/host.test.mjs
```

Result: **4 selected tests passed, 0 failed.** This included ordinary refresh, renderer-callback structural reentry, successful subtree disposal reservation, and DisposeTree failure recovery.

Independent refresh failure-path probe:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
node /tmp/xr-rt3-refresh-failure-probe.mjs
```

Result: `{"refreshFailure":"recovered","refreshSuccess":"completed","replace":"completed","mountAfterFailure":2,"treeAfterDispose":[]}`. The probe injects one `manager.snapshot()` failure during refresh, then verifies refresh, renderer replacement, a new root mount, and disposal all work afterward.

Existing bounded composition propagation probe:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
node typed-composition/coordination/reviews/XR-T3-probe.mjs
```

Result: **passed**; one asynchronous save completed through the transport, refreshes painted through the existing renderer (`rendererUpdates: 4`), and `host.settled()` observed the saved state.

Current reviewed file hashes:

```text
session-tree/host.mjs                 f5ce451235ec2506d80d9ac3ebc364a9e43ba774cd56a66e25e3f8f7bd8a0c5a
session-tree/host.test.mjs            d72cf12edb851bc2c01a35426a0d2585c266fce1a15ba12d0e51271268b8f5c0
typed-composition/host.mjs            e030ff3e1f10a19b2a520f7b652df5e1bc14cb7d5d33bc2f10076f0d11685f3c
typed-composition/host.test.mjs       2bbe3ca09c0a53a5c7c573c771ca9da83c36961d8bbd157e4ae512ea590de0c5
/tmp/xr-rt3-refresh-failure-probe.mjs c94f90da9537ca6049ab8cb1d55620a42f03cbdd6c69b7996c77f5618c2c70a0
```

## Scope limits

The full author host suite, browser replay, native replay, inherited runner, and seeded replay were not rerun. This review confirms the bounded refresh guard and its tested lifecycle paths; it does not claim a full integration pass or verify browser focus behavior.

No production source was edited for this review.
