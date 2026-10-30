# R-GODOM — bridge handle repair

## Outcome: mixed_change

Implemented the two GoDOM bridge repairs in `cmd/godom-wasm/main_wasm.go` and added browser smoke regressions in `cmd/godom-wasm/smoke.html`. No adapter or other production file was changed.

## Changes

- The WASM runtime now creates one Go `js.Func` for `mount` and one shared callback for each of the seven renderer methods. This keeps `keepers` fixed at eight callbacks, regardless of how many renderer handles are mounted.
- Each handle gets seven JavaScript bound functions carrying a hidden, monotonic, safe-integer ID. The shared dispatcher removes that ID before checking exact public argument counts, then routes through the live instance map. It returns stale-handle errors after removal, while repeated `unmount()` remains idempotent.
- Mount checks active and in-progress roots before calling `godom.New`. Reserving during `init()` prevents re-entrant duplicate mounts from reaching the DOM. Unmount removes the handle route first, then keeps the root reserved until renderer cleanup completes so a cleanup callback cannot install a renderer that the old cleanup subsequently erases.
- IDs are rejected once the JavaScript safe-integer range is exhausted. Removed mount reservations clear their backing-slice slot to avoid retaining the root reference.
- The smoke now checks duplicate-root rejection before `init()` with unchanged DOM/state, re-entrant duplicate calls from `init()`, root reuse, 100 mount/unmount cycles with stale-handle fencing, and re-entrant mount attempts from `replaceChildren()` during unmount.

## Checks and limits

- JavaScript syntax checks passed for the extracted inline smoke script and `cmd/godom-wasm/smoke.mjs` using `node --check`.
- The actual Go/WASM smoke was attempted against the existing build artifacts, but Playwright stopped before loading the page because the Chromium headless-shell executable is missing at `/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome`.
- No Go toolchain is present, so Go formatting, compilation, and WASM execution were unavailable locally. The adapter test suite had passed 5/5 in the preceding audit; it was not rerun because these edits do not change the adapter.
- The fixed eight-callback count is established by source structure; no new public diagnostic API was added. W6 source cross-review and fresh CI compile/browser smoke remain pending.
- The legacy singleton compatibility path in `renderer-conformance/adapter.mjs` remains unchanged and still aliases facades for legacy bridges that return no per-instance handle.
