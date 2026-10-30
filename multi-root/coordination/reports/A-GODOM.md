# A-GODOM — independent GoDOM handle and adapter audit

## Decision: mixed_change

Scope reviewed: `cmd/godom-wasm/main_wasm.go`, `godom/renderer_wasm.go`, `renderer-conformance/adapter.mjs`, and `renderer-conformance/adapter.test.mjs`. No production files were changed.

## Findings

### High — simultaneous mounts on the same root can take ownership from one another

`godom.New` validates that a value looks like a DOM element, but neither it nor `gobiGoDOM.mount` records or rejects an already-owned root. Mounting renderer B onto renderer A's root replaces A's DOM while A remains active with its old path and node maps. A's `click` can then invoke a detached element; `handleEvent` drops it because `root.contains(target)` is false, while `Click` sees no callback error and returns A's stale snapshot as success. An `update` through A can insert A's nodes back into the shared root and remove B's rendered root. The existing smoke covers two distinct roots and reuse only after unmount; it does not cover concurrent mounts on one root. This is a concrete same-root handle-isolation gap.

### Medium — each mount permanently retains seven exported Go callbacks

`rendererAPI` appends each handle's seven `js.Func` methods to package-global `keepers`. `Renderer.Unmount` releases DOM event listeners, and the bridge clears its closed-over renderer pointer, but no path releases these API callbacks or removes them from `keepers`. Every mount/unmount cycle therefore leaves seven Go/WASM callback registrations and entries in the global slice for the lifetime of the WASM runtime. This is bounded per handle but unbounded across repeated root replacement.

### Adapter compatibility path is intentionally singleton-shaped

When `mount()` returns `null`/`undefined` and the bridge has the full legacy method table, `mountGoDOM` adapts methods from the global bridge. Two calls therefore create two JS facades that forward into the same singleton methods; the adapter cannot provide per-root isolation for that legacy shape. The current test explicitly preserves this compatibility behavior. The real Go bridge returns independent handles, but callers using the legacy shape should not assume simultaneous-root isolation.

## Checks that passed

- Public bridge methods enforce exact argument counts before checking mounted state. A repeated zero-argument `unmount()` returns null; other stale calls return an error object.
- Each real handle closes over its own renderer, and renderer state/facade/root maps are instance fields. Event callbacks reject detached targets, route against current path/key maps, recover dispatch and paint failures, fence the failing renderer, and call that facade's optional `rendererFailed` callback. The adapter unwraps the bridge's exact one-field error result into a JS exception.
- DOM event listener sets are removed and their `js.Func`s released when an element/event disappears and on unmount.
- The focused adapter suite passed: `node --test renderer-conformance/adapter.test.mjs` (Node v24.22.1, 5/5 tests).
- A temporary Node probe confirmed the legacy fallback's shared-bridge behavior described above. It changed no repository files.

## Verification limits

No Go toolchain or Chromium executable is available in this workspace, so I did not rerun the compiled Go/WASM browser smoke. Prior renderer review evidence in `renderer-conformance/coordination/reports/XR-E2.md` records a successful compiled smoke for distinct roots, wrong arity, stale handles, callback failure notification, and listener cleanup. That evidence does not exercise simultaneous mounts on the same root or callback-table retention across repeated mount/unmount cycles.
