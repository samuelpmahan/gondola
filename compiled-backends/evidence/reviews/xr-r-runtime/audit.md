# XR-R-RUNTIME independent audit

## Scope and reviewed source

Independent N6 review of N1's R-RUNTIME repair, limited to the replacement contract defects reported by XR--RUNTIME: focus-record validation, strict boolean restoration, and synchronous Promise/thenable rejection. Reviewed runtime SHA-256 `e729e3b360892edf01511b64657d32f638db54b5f5b0d2767b980114bb6d3105` and runtime-test SHA-256 `3ddaaded2db26d7b2acf9bcbd8e85584f1f4b57e1e89b325a602aff5dab39fcc`.

## Independent execution

- Fresh Node v22.23.4 run of `node --test compiled-frontend/frontend/runtime/runtime.test.mjs`: **25 passed, 0 failed**. Output is preserved in `runtime-node22.log`.
- `promise-edge-probe.mjs` checks rejected Promise subclasses returned from `focusState()` and `update()`, an overridden subclass `.then`, an ordinary custom thenable, old-renderer usability on capture rejection, post-teardown fail-closed behavior, and `unhandledRejection` through the next event-loop turn. It passed; output is in `promise-edge-probe.log`.

Observed behavior matches the repair: focus capture errors reject before teardown; only `restoreFocus(true)` counts as restored; rejected native Promise subclasses are observed with the captured intrinsic Promise method; custom then methods are never called; a returned thenable after teardown fails closed; and no unhandled rejection was observed.

## Boundary

This review accepts the bounded R-RUNTIME repair. It does not claim a sandbox for arbitrary JavaScript objects, Proxies, side-effecting accessors, or hostile Promise species constructors. A plain object thenable's `then` property may be read to determine whether it is callable, but its `then` function is not invoked. N3's four-app React↔DOM matrix and the separate React checked-property remount repair remain outside this runtime review.
