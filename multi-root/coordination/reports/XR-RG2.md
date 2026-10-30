# XR-RG2 — final GoDOM panic-cleanup lease review

## Decision: accepted

The final source corrects the prior amend finding. `mountRenderer()` now registers reservation release before panic recovery; LIFO defer execution therefore runs recovery and `renderer.Unmount()` while the root remains in `mountingRoots`. The reservation is released afterward on both success and error paths.

The smoke adds the targeted regression: force `Function.prototype.bind` to throw during renderer API construction, make `root.replaceChildren()` re-enter `mount()` on that root, and assert the nested facade `init()` is never called. It also verifies the failed mount returns an error, clears the root, and allows a later fresh mount.

The reviewed source and smoke match the requested SHA-256 values:

- `main_wasm.go`: `0088ad98470707502e8b84b5afeea7e85ea28ff3d6e892a1c3f5d22beaab49e7`
- `smoke.html`: `f0600bb6d260348d8db4fd17641179881980aafed830a488243379da0bb43a03`

## Review and verification

- Shared bridge registrations remain fixed at eight Go `js.Func`s: one mount callback and seven shared method dispatchers. Per-instance JavaScript bound methods carry positive, monotonic IDs checked within the safe-integer range.
- Public argument counts are checked after removing the bound ID. Stale methods return error frames; stale zero-argument `unmount()` remains idempotent. Instance routes are deleted before teardown, and root leases block reentrant mounts through both explicit teardown and panic cleanup.
- The renderer map lookup and deletion remain scoped to one handle. The smoke covers simultaneous roots, stale handles, root reuse, update/callback failures, explicit unmount reentry, and the new API-construction failure reentry case.
- `node --test gondola/renderer-conformance/adapter.test.mjs` — passed, 5 tests.
- `node --check gondola/cmd/godom-wasm/smoke.mjs` and inline `smoke.html` parsing with `vm.Script` — passed.
- Go and Chromium executables were unavailable locally. This is a source and syntax acceptance; no Go compile, WASM execution, or browser smoke result is claimed. CI must still compile and execute the browser smoke.
- No production or test files were changed during this review.
