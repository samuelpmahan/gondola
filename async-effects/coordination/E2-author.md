# E2 async host and transport author report

## Delivered

- Added `async-effects/host.mjs` with `createEffectHost(root, runtime, renderers, transport, initialBackend = "dom")`. It calls `runtime.init()` once, validates and caches the snapshot, and gives each renderer an epoch-fenced facade whose `init()` reads that cache.
- A module-level `WeakMap` leases each exact runtime object to one live host. A second host is rejected before it can call `runtime.init()` and replace the first host's session. The lease is released after unmount, failed initial mount, and failed initialization. This cannot detect two wrapper objects that alias the same underlying singleton; callers must preserve exclusive ownership of that underlying runtime.
- Renderer dispatch calls Go synchronously and schedules Go's `effects()` outbox in a serialized microtask queue. The queue belongs to the host session, so a save followed by an immediate backend swap still starts its request after the new renderer mounts.
- Transport replies are validated, queued, passed to Go `complete()`, and followed by a renderer remount from the accepted snapshot. The Go runtime is never reinitialized during a completion or renderer swap.
- The host forwards ordered start/cancel commands without owning application transitions. A transport cancellation failure is surfaced through `flush()`/`settled()` while later commands from the same drained batch still run. Synchronous start/cancel failures reject the next settled wait.
- `unmount()` fences queued effects and all late callbacks before any Go call, cancels active requests, and removes the renderer. Cleanup remains available after a renderer lifecycle failure; a second unmount is rejected.
- Added `async-effects/transport.mjs` with `createManualTransport({ defaultValue })` and optional `createTimeoutTransport({ delayMs, valueForCommand, errorForCommand })`. Manual cancellation is advisory; canceled, duplicate, and late replies remain deliverable and logged. `pending()` means undelivered/manual-deliverable starts, including requests already marked canceled. `deliver()` returns the same normalized `{ ID, Value, Error }` passed to the callback. Timer provider failures become explicit error replies.
- Added host and transport unit tests for deferred draining, completion remounts, one init, swaps, stale facades, mount-time dispatch fencing and rollback, immediate save/swap ordering, teardown before a queued start, canceled and duplicate replies, post-unmount fences, failed-renderer cleanup, transport failures, and real `setTimeout` delivery.

## Verification

Command:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test async-effects/host.test.mjs async-effects/transport.test.mjs
```

Result after the runtime-lease amendment: **19 tests passed, 0 failed** on Node 22.23.4.

Added focused lease regressions. A second live host using the same runtime object is rejected before a second `init()` and cannot disturb the first pending ID. After first-host unmount, ownership transfers; a late old callback makes no Go calls while the new session owns the same numeric ID. Failed initial mounting and cleanup that throws both release the lease, with old callbacks fenced.

These focused tests use a deterministic fake runtime to exercise host scheduling and transport behavior. The real Go/WASM request lifecycle and unchanged DOM/React renderers are covered by the integrated browser harness owned by E4/E5.

## Scope

This lane changed only `host.mjs`, `transport.mjs`, their two unit tests, and this report. Completion-triggered remounts may lose focus or selection, consistent with the frozen contract. No network service or application state machine was added in JavaScript.
