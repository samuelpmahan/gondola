# XR-E3 independent review

## Initial result: finding pending owner repair

The E3 React renderer and update host passed their submitted tests and the real-browser probes below. I found one unhandled native-event failure path that needs owner disposition before accepting E3: React fences itself after an event-driven render failure, but the host is not notified and continues processing the committed Go state and queued effects.

## Verification

Environment: Node `v22.23.4`; Chromium `153.0.8010.0`; checkout root is `gondola/`.

From the `gondola/` working directory:

```sh
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
/tmp/gondola-node22/node_modules/node/bin/node --test \
  keyed-editor/protocol.test.mjs keyed-editor/dom.test.mjs \
  keyed-editor/react.test.mjs keyed-editor/host.test.mjs
```

Result: **18 tests passed, 0 failed**. The React test ran against Chromium; the six host tests used the in-memory runtime and manual transport.

Four-row and cross-backend negative/identity probes ran from `/tmp` with `GONDOLA_REPO_ROOT` set to the checkout root, so their source imports are relocatable:

```sh
GONDOLA_REPO_ROOT="$PWD" CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
/tmp/gondola-node22/node_modules/node/bin/node /tmp/xr-e3-probe.mjs
GONDOLA_REPO_ROOT="$PWD" CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
/tmp/gondola-node22/node_modules/node/bin/node /tmp/xr-e3-swap-probe.mjs
```

Both probes passed. The first used four rows in real React/Chromium and confirmed keyed object retention through reorder and edit, logical selection preservation, exact current `{Path, Event, Value, Key}` dispatch, no key attributes, and an invalid duplicate-key update that left DOM/snapshot unchanged and fenced later renderer calls. The second mounted the actual DOM and React renderers behind `createKeyedHost` with four rows. It confirmed Add is disabled and suppressed at capacity; DOM-to-React and React-to-DOM swaps replace physical nodes while preserving key/selection; React reorder and HTTP completion preserve the same input object and selection; dispatch uses the current path/key; underlying `init()` runs once; and unmount clears the root.

The existing connection-pool receipt [independent-context-pools.json](../../evidence/independent-context-pools.json) records three independent Chromium `BrowserContext`s, each holding four requests while its control GET returned HTTP 200. E3 does not create browser contexts or own the Go row cap; these remain upstream/runtime and composed-harness responsibilities.

## Finding XR-E3-1: native-event renderer update failures do not reach the host

In `react.mjs`, the native `dispatchEvent` path runs `update(runtime.dispatch(step), focus)` inside a catch that sets only the renderer-local `lastError` and `active = false`. The shared host facade has already cached the successful Go snapshot and queued `drainEffects` before it returns the snapshot. The renderer catch then consumes the update error. `createKeyedHost` has no renderer failure callback or check of the React renderer's `lastError`, so it remains usable, retains the new Go snapshot, and starts the queued effect while the renderer has fenced itself. The host's `click()` wrapper and completion path correctly handle errors that propagate through host-invoked methods; this finding is specific to actual browser events handled inside the renderer.

Reproducer:

```sh
GONDOLA_REPO_ROOT="$PWD" \
/tmp/gondola-node22/node_modules/node/bin/node \
  keyed-editor/coordination/reports/XR-E3-probe.mjs
```

The probe models the renderer's local catch while using the real host facade/pump. Its output is:

```json
{
  "rendererError": "synthetic DOM commit failure",
  "rendererFenced": true,
  "hostStillUsable": true,
  "hostCachedVersion": 1,
  "effectsStartedAfterPaintFailure": 1,
  "hostAutoUnmountedRenderer": false
}
```

This probe injects a synthetic renderer commit failure rather than forcing React's own DOM commit to throw. The observed divergence follows directly from the React catch and host facade/pump paths. A minimal repair should notify the host when a renderer's event-triggered update fails, fence the host from further use, surface the error, and prevent still-queued effects from starting; Go state remains committed and is not rolled back. No E3 production files were changed during this review.

## Review limits

- The four-row browser probe used one `BrowserContext`; separate connection-pool behavior is covered by the preserved three-context receipt above.
- E3 tests use a JS runtime fixture and manual transport, not the real Go/WASM session or live HTTP lab. The composed E5/E6 gate remains necessary.
- The forced update-failure diagnostic uses a synthetic renderer commit exception; it does not claim a real-browser React commit-failure injection.
