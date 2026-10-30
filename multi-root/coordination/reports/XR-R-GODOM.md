# XR-R-GODOM — independent review of the GoDOM bridge repair

## Decision: amend

The shared-dispatcher repair addresses the unbounded exported `js.Func` registrations and duplicate-root ownership gap in normal operation. I found one remaining root-lease hole during mount panic cleanup. The root is reserved through `godom.New()` initialization and through explicit unmount teardown, but the reservation is released before the panic recovery handler cleans up a successfully created renderer when handle API construction panics.

## Findings

### Required: retain the root lease through panic cleanup

In `mountRenderer()`, the recovery defer is registered before `defer releaseMountingRoot(root)`. Go runs defers in last-in, first-out order, so if `rendererAPI(id)` panics after `godom.New()` has returned a renderer, `releaseMountingRoot(root)` removes the in-progress lease first. The recovery handler then calls `renderer.Unmount()`, which invokes `root.replaceChildren()` after the lease is gone. If that teardown re-enters `gobiGoDOM.mount(root, ...)`, `rootInUse()` sees neither an entry in `instances` (the original handle has not yet been committed) nor a mounting reservation. The nested mount can commit before the failed mount's cleanup clears the root, leaving an active handle whose DOM was erased.

This path can be induced by making a bound-method construction fail after renderer initialization, for example by replacing `Function.prototype.bind` with a throwing function for the mount. The smoke already uses a re-entrant `root.replaceChildren()` hook to check explicit unmount teardown; the same hook during panic cleanup exposes the missing lease. This is a source-level reproduction path, not a runtime reproduction: Go/WASM and Chromium were unavailable here.

Keep the root reserved until the recovery cleanup has completed, including on panic. For example, order or structure the defers so the panic handler's `renderer.Unmount()` runs before the mount reservation is released. Then verify the injected bind-panic plus re-entrant `replaceChildren()` case rejects the nested mount before its facade `init()` and leaves no committed nested handle.

## Reviewed paths with no additional issue found

- **Bounded bridge callbacks:** `main()` registers one mount callback and seven shared renderer method callbacks. Each renderer API binds the hidden instance ID to those shared functions, so exported Go `js.Func` registrations stay at eight across mount/unmount cycles. DOM event callbacks remain renderer-owned and are released by renderer teardown.
- **IDs and method dispatch:** IDs increase monotonically through the JavaScript safe-integer range and are parsed only from finite, positive integral numeric hidden arguments. The dispatcher strips the bound ID before enforcing each public method's exact argument count. Repeated zero-argument `unmount()` on a stale API is idempotent; other stale methods return an error frame and cannot reach a newly mounted instance.
- **Normal root ownership and cleanup:** active and mounting roots are checked before renderer initialization; the mount reservation blocks same-root reentry from `facade.init()`. Explicit unmount removes the instance route, reserves the root through renderer teardown, and releases the reservation afterward. The release helper removes the entry and clears the vacated tail slot. Successful unmount removes the instance from the map before teardown, preventing stale API calls from addressing a later handle.
- **Isolation:** each map entry owns its own root and renderer. The dispatcher looks up only the hidden ID's instance, and unmount deletes only that entry. The smoke exercises simultaneous roots, separate focus and DOM snapshots, stale calls, invalid-update and callback-failure isolation, root reuse, repeated cleanup, and unmount-time reentrant mount rejection. I found no source path where one handle selects a sibling renderer.
- **Error recovery:** public bridge calls check arity and return exact `{error: string}` frames for invalid calls; the dispatcher has a panic recovery boundary. The remaining finding is specifically that mount recovery's *cleanup* is not covered by the same root lease until it returns.

## Verification

- `node --test gondola/renderer-conformance/adapter.test.mjs` — passed, 5 tests.
- `node --check gondola/cmd/godom-wasm/smoke.mjs` — passed.
- Parsed the inline JavaScript in `cmd/godom-wasm/smoke.html` with `vm.Script` — passed.
- Manually checked the Go variable scope around `id, err := allocateInstanceID()` and the subsequent `renderer, err = godom.New(...)`; the current source is syntactically plausible. No Go compiler or Chromium executable was available, so this review does not claim a Go compile, WASM run, or browser smoke pass.
- No production or test files were changed.

## Limits

The Go bridge callback counts and browser lifecycle behaviors were inspected from source and the smoke script, not measured in a live WASM runtime. CI still needs to compile and run the browser smoke after the panic-cleanup lease is repaired, including the injected reentrant cleanup case.
