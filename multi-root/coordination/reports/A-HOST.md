# A-HOST — independent JavaScript host/runtime audit

## Result

No active blocker found in the current `multi-root/host.mjs` or `runtime.mjs` for root isolation, transport ownership, generation fencing, renderer replacement, or manager error-frame handling. One disposal-failure limitation is documented below: if the manager itself refuses to dispose a live session, the host retires the root and reports the error, but cannot recover that session through the removed root handle.

## Findings

- **Session and transport scope:** Each mount creates a manager session and binds a `createSessionRuntime()` to that session ID. Duplicate session IDs are rejected before transport allocation. A transport object is accepted once per host, including across later generations; `fencedTransport()` scopes starts and deliveries to the owning root record and deduplicates cancellations. Tests verify two sessions can both use local request ID `1`, that cancellation is root-local, and that reusing a transport instance is rejected without affecting its current owner.
- **Session/generation fencing:** The host callback gate checks that the record is active, still owns the root, and matches the root's current generation. The session runtime independently checks this fence before `init`, `dispatch`, `complete`, `effects`, and `audit`. The root reuse test delivers a late response from the retired generation after remount and confirms it cannot update the new session. Runtime tests verify every bridge call stops after retirement.
- **Renderer failure and rollback:** Replacement delegates to `createKeyedHost()`, which saves focus, unmounts the selected renderer, tries the candidate, and remounts the previous renderer if candidate mount or focus restoration fails. The host wrapper reports the restored backend as active; if rollback also fails, it marks that root failed. Existing tests cover focus-preserving replacement and failed candidate mount with successful rollback. An additional inline probe forced both candidate and rollback mounts to fail: root A was marked failed, while sibling root B remained active and could be unmounted normally. A renderer update failure during HTTP completion likewise rejects A's `settled()` and leaves B able to complete.
- **Manager error frames:** `createMultiRootManagerAdapter()` translates the exact `{error: string}` frame to a method-specific throw across all eight manager methods. It retains method context, passes ordinary values through, and is idempotent. Runtime tests cover every method's error frame plus normal fake values and `this` binding; host tests cover create, initialization snapshot, queued effects, and disposal errors.
- **Disposal exceptions:** `retire()` marks the record inactive and removes it from the root map before calling `manager.dispose()`. It aggregates a disposal failure, still attempts keyed-host teardown, and releases transport ownership; the sibling remains mounted. An injected manager whose `dispose(1)` throws while retaining its session reproduces the boundary: `host.unmount(root1)` throws an `AggregateError`, `snapshotAll()` contains only root 2, and the fake manager's `list()` still contains session 1. This is a recovery limitation of a failed disposal call, not evidence of a defect in the current Go manager contract. Since the root handle is retired, there is no retry path through this host instance.

## Verification

- `node --test gondola/multi-root/host.test.mjs gondola/multi-root/runtime.test.mjs` — passed, 19 tests.
- `node --test gondola/multi-root/*.test.mjs` — passed, 35 tests.
- Inline failure probe — forced candidate mount and rollback mount failures; confirmed only the affected root entered `failed` lifecycle.
- Inline disposal probe — injected a throwing manager `dispose`; confirmed the error is surfaced, the root is retired, and the sibling remains live. The injected manager retained the undisposed session as expected.
- No production or test files were changed.

## Limits

This audit used the Node unit suites and targeted fake-manager/renderer probes. It did not rerun the browser composition, Go/WASM build, or live HTTP transport. The injected `dispose()` failure demonstrates how the host contains a failed cleanup operation; it does not establish that the production manager fails for an active session.
