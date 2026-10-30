# R-T3 — reserve subtree disposal against reentry

## Finding and repair

The XR-T3 probe reproduced a real reentry gap: `host.dispose(rootID)` fenced its subtree, then called Go `disposeTree()` while the host's structural-operation reservation was still `null`. A manager callback could synchronously call `host.mountRoot()`, allocate a fresh Go root, and leave it live after the original subtree was disposed.

Disposal now reserves the host operation before calling the authoritative Go method and retains that reservation through cached-bundle cleanup and renderer unmount. The reservation transitions from `authoritative` to `cleanup` only after the Go result is validated. If the Go bridge throws or returns an error frame, the host restores all subtree lifecycle flags and clears the reservation before rethrowing. A defensive bundle-validation exception still proceeds through cleanup with an aggregate error. Flat-host disposal cannot consume cached commands before the cleanup phase.

Added regressions prove the manager callback cannot reenter `mountRoot`, no extra Go root is allocated, and the unrelated sibling remains live. The error-frame path verifies the whole subtree is restored, the sibling remains usable, and a subsequent root mount succeeds, proving the reservation is released.

## Verification

The exact reviewer probe was run before and after the repair:

```sh
node /tmp/xr-t3-reentry-probe.mjs
# Before: {"reentryBlocked":false,"reentryError":null,"reentrantSession":2,"liveTreeAfterDispose":[{"SessionID":2,"ParentID":0,"Depth":1}],"bundles":[1]}

node /tmp/xr-t3-reentry-probe.mjs
# After: {"reentryBlocked":true,"reentryError":"session tree host: mount cannot re-enter an active dispose operation","reentrantSession":null,"liveTreeAfterDispose":[],"bundles":[1]}

node --test session-tree/host.test.mjs
# 11 passed, 0 failed
node --check session-tree/host.mjs
node --check session-tree/host.test.mjs
```

SHA-256 of final reviewed files:

| File | SHA-256 |
| --- | --- |
| `session-tree/host.mjs` | `bf128868e63b70637faf4e8febaf6d739deb687e8f7551a2d12d52693971f4e3` |
| `session-tree/host.test.mjs` | `832ef0c93d94ea0215d58edfbb164ec13406bebdbe803503428dacc7286dfa44` |

No Go/WASM or browser runtime check was run for this repair.
