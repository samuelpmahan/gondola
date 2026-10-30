# XR-E2 independent review: host and transports

## Review result

Accepted after the runtime ownership lease repair and pending-set wording decision. The initial review findings remain preserved in `XR-E2-initial.md`.

## Rechecked findings

### XR-E2-1 — Shared-runtime session collision: closed for the supported API

The host now keeps a module-level `WeakMap` lease keyed by runtime object identity. A second live host using the same runtime object is rejected before `runtime.init()`; lease ownership is released after unmount, including cleanup-error paths, and after initial mount failure. The host comment documents that wrappers which alias the same underlying singleton cannot be detected, so callers must pass the same runtime object and avoid external reinitialization while the host owns it.

I reran the collision scenario through the fresh `gobiAsyncSave` Go WASM API after E1's strict wire change. The second host was rejected before a second init. After unmounting the first host, the new session reused ID 1; delivering the old host's ID 1 callback made no `complete()` call, and the new ID 1 reply saved the expected value. All steps and replies used the required complete fields. The Go WASM smoke also passed its malformed-input atomicity checks.

### XR-E2-2 — Manual `pending()` meaning: clarified

The chosen behavior is to keep canceled-but-undelivered starts in `pending()`, because their callbacks remain intentionally deliverable for late-reply probes. `transport.mjs` and `E2-author.md` now describe `pending()` as undelivered/manual-deliverable starts, including canceled records. The original implementation and tests remain unchanged.

## Verification

- `/tmp/gondola-node22/node_modules/node/bin/node --test async-effects/host.test.mjs async-effects/transport.test.mjs`: **19 passed, 0 failed**, Node v22.23.4.
- Actual Go WASM shared-session recheck passed: rejected concurrent owner before init; ownership transferred after unmount; old callback was fenced against the new session's reused ID; new reply completed successfully. `cmd/async-save-wasm/smoke.mjs` also passed against the fresh WASM artifact.
- Focused checks passed for deferred/microtask draining, immediate save then swap, mount-time fences, cleanup exceptions with late-callback fencing, transport errors followed by later same-batch commands, and `Number.MAX_SAFE_INTEGER` acceptance versus rejection of the next integer.

## Scope and limitations

No implementation files were changed by this review. The ownership lease is keyed to the runtime object passed to `createEffectHost`; callers must not construct distinct wrappers around the same global Go singleton or call that singleton's `init()` outside the owning host. I did not run the integrated browser/WASM comparison harness; E4/E5 own that gate.
