# XR-E3 independent review

## Initial review: finding recorded, then repaired and independently rechecked

The E3 React renderer and update host passed their initial tests and real-browser probes. The initial review found an unhandled native-event failure path: React fenced itself after an event-driven render failure, but the host was not notified and continued processing the committed Go state and queued effects. E3 repaired this with a renderer-to-host failure callback, and the repaired files passed the independent recheck below.

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

## Historical finding XR-E3-1: native-event renderer update failures did not reach the host

In the initial `react.mjs`, native `dispatchEvent` caught update errors and only set renderer-local `lastError` and `active = false`. The host facade had already cached a successful Go snapshot and queued `drainEffects`. Since the host had no renderer failure callback, it stayed usable and started the effect even though the renderer had fenced itself. This applied to errors caught inside native event handling; errors propagated through host-invoked `click()` and completion updates were already handled.

Reproducer:

```sh
GONDOLA_REPO_ROOT="$PWD" \
/tmp/gondola-node22/node_modules/node/bin/node \
  keyed-editor/coordination/reports/XR-E3-probe.mjs
```

Before the repair, this probe modeled the renderer-local catch and observed the real host facade/pump. Its initial output was:

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

This initial probe injected a synthetic renderer commit failure rather than forcing React's own DOM commit to throw. The initial finding and output are preserved here even though the probe was updated for the recheck.

## Repair and independent recheck

E3 added optional `rendererFailed(error)` to the host facade. React event failures report through it, and the host fences synchronously, records the failure for `settled()`, prevents queued effects from draining, and schedules renderer/root cleanup. Go state remains committed. The E2 DOM renderer also reports native-event patch failures through the optional callback; public `update()` failures still propagate to the host caller.

Final E3 suite command from `gondola/`:

```sh
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
/tmp/gondola-node22/node_modules/node/bin/node --test \
  keyed-editor/protocol.test.mjs keyed-editor/dom.test.mjs \
  keyed-editor/react.test.mjs keyed-editor/host.test.mjs
```

Result: **21 tests passed, 0 failed**, including the actual Chromium React commit-failure test and the host regression that confirms the pending effect drain is skipped.

The final E2 DOM amendment plus inherited controlled-input suite also passed under Node 22:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test \
  keyed-editor/protocol.test.mjs keyed-editor/dom.test.mjs \
  controlled-input/protocol.test.mjs controlled-input/dom.test.mjs
```

Result: **24 tests passed, 0 failed**, including the DOM event-patch failure callback regression.

After repair, the durable host probe at `coordination/reports/XR-E3-probe.mjs` passed and reported:

```json
{
  "rendererError": "synthetic DOM commit failure",
  "rendererFenced": true,
  "hostUsable": false,
  "hostSnapshotBlocked": true,
  "committedRuntimeVersion": 1,
  "settledError": "keyed host queued work failed",
  "effectsCalls": 0,
  "effectsStartedAfterPaintFailure": 0,
  "hostUnmountedRenderer": true
}
```

The real four-row Chromium host probe was rerun after repair:

```sh
GONDOLA_REPO_ROOT="$PWD" CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
/tmp/gondola-node22/node_modules/node/bin/node /tmp/xr-e3-swap-probe.mjs
GONDOLA_REPO_ROOT="$PWD" CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
/tmp/gondola-node22/node_modules/node/bin/node /tmp/xr-e3-probe.mjs
```

Both passed. The host probe verified DOM-to-React and React-to-DOM swaps, Add-disabled-at-four behavior, stable React input identity and selection through reorder/completion, current path/key dispatch, single runtime init, and cleanup. The separate React probe verified identity/focus on reorder and edit plus invalid-update fencing and atomicity. Both probes used one `BrowserContext`; independent connection-pool behavior remains covered by the three-context evidence cited above.

**Final review result: E3 accepted; no remaining E3 finding.** The E3 repair remains bounded to event-error propagation and does not claim Go-state rollback after a successful dispatch.

## Review limits

- The four-row browser probe used one `BrowserContext`; separate connection-pool behavior is covered by the preserved three-context receipt above.
- E3 tests use a JS runtime fixture and manual transport, not the real Go/WASM session or live HTTP lab. The composed E5/E6 gate remains necessary.
- The forced update-failure diagnostic uses a synthetic renderer commit exception; it does not claim a real-browser React commit-failure injection.
