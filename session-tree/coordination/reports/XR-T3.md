# XR-T3 — independent review of the session-tree host

**Decision: amend.** The ten focused `host.test.mjs` tests pass, and the implementation handles nested shells, allocation scoping, authoritative parent checks, subtree pre-fencing, postorder cancellation consumption, failed mounts, unowned descendants, sibling isolation, and stale callbacks in those tested paths. An independent reentry probe found a gap: the host permits a reentrant mount while the authoritative `manager.disposeTree()` call is in progress.

## Finding: disposal does not reserve the host operation guard before the raw tree call

In `host.mjs`, `dispose()` fences every node in the target subtree, then calls `bridgeCall(manager, "disposeTree", id)` at line 477. The shared `operation` guard is assigned only after the call returns and bundle validation finishes, at line 489. During the raw call, `assertIdle()` therefore sees `operation === null` and permits a synchronous composition mount.

I reproduced this with a temporary fake manager whose `disposeTree` synchronously calls `host.mountRoot()` before delegating to the independent reference manager. Disposing root 1 succeeded, but the reentrant mount also succeeded and left root 2 live:

```json
{"reentryBlocked":false,"reentryError":null,"reentrantSession":2,"liveTreeAfterDispose":[{"SessionID":2,"ParentID":0,"Depth":1}],"bundles":[1]}
```

The probe is preserved at `/tmp/xr-t3-reentry-probe.mjs` (SHA-256 `e317afbf42e01696a5c19a95f754df245ae924a45c54b22cd295c6f2a0bd7ea3`). This conflicts with the frozen contract to block reentrant composition mounts and leaves new lifecycle work inside an active subtree-disposal operation. The existing reentry test covers a renderer reentering during mount allocation, but not a manager callback during disposal.

Suggested repair: reserve a disposal operation before calling the raw `disposeTree`; populate its cancellation cache after a successful atomic result, and clear the operation while restoring node activity/lifecycle if the manager returns an error. Add a regression where the fake manager attempts `mountRoot` (and ideally `mountChild` under an unaffected live sibling) from inside `disposeTree`, and verify the attempt is rejected without another raw allocation. The existing `DisposeTree` failure restoration case should continue to pass.

## Other reviewed contracts

- **Guarded allocation and mount rollback:** `flatManager.create()` is available once only while the synchronous mount context is active and delegates to root `create` or parent-scoped `createChild`. Reentrant mounts during renderer initialization are rejected. After renderer mount, `manager.tree()` is validated and the new record's parent/depth must match the allocation context. Renderer mount failure removes its shell and session in the tested path.
- **Nested shell ownership:** Every shell keeps `viewRoot` and `childrenRoot` as siblings. The renderer is mounted only on `viewRoot`; the test preserves child and grandchild shell/view identity across parent and child renderer replacements.
- **Ownership and disposal:** The host compares the authoritative manager subtree with active host nodes before mutation, rejecting unowned descendants. It fences all owned descendants before calling `disposeTree`, validates exact postorder bundles, caches per-session cancel commands for flat-host disposal, unmounts leaf-first, and leaves sibling transports/state untouched. The normal-path tests observe one cancel in each local transport and zero raw Go `dispose` calls after `disposeTree`.
- **Stale callbacks and cleanup:** Removed nodes reject runtime facade calls; late transport callbacks do not reach completion. Disposal continues through cancel and renderer-unmount failures and reports the collected errors.

## Commands and evidence

Tools: Node `v22.23.4`; Chromium `153.0.8010.0`; Go `go1.24.0 linux/amd64` (no browser/demo run was needed for this host-level probe).

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test session-tree/host.test.mjs
# passed: 10 tests, 0 failures

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node /tmp/xr-t3-reentry-probe.mjs
# exposed the reentrant-mount gap shown above
```

The test runner emitted an environment-level Node warning that `Undici EnvHttpProxyAgent` is experimental. No production files were edited. This review does not claim a full replay or browser demo pass.

## Reviewed source hashes

```text
session-tree/host.mjs      3a3dc2811021f7753dd5cf2b93d9f2b98148b79b27fa0f11af81b733675e8b15
session-tree/host.test.mjs 46581fe4fd6acf7f33a38ce3eed4b540013fc7382588ca2e14146c4cf0569384
```
