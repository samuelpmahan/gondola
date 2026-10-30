# Replaceable Gobi counter backends

This experiment keeps the Go counter runtime alive while swapping the renderer mounted into one DOM root. The `dom` adapter uses the existing `interaction/dom.mjs`; the `react` adapter mounts the same Gobi snapshot through React. Both receive the host's cached runtime snapshot, so replacing a renderer does not call Go `Init` again or clear the delivered-message log.

## Run the checks

Use Go 1.24 and Node 22. From the repository root:

```sh
bash run-backend-replacement.sh
```

The runner first runs `run-interaction.sh`, which builds the Go WebAssembly counter, the independent React reference, and runs the existing interaction checks. It then bundles the Gobi React adapter with the pinned React packages, runs the replacement-host unit tests, clicks through the actual demo in Chromium, and runs the replacement parity check. Browser options such as `--seed`, `--cases`, `--max-actions`, `--output`, and `--headed` are passed to `backend-replacement/check.mjs`.

For dependencies already installed, set `GONDOLA_SKIP_NPM_CI=1` and/or `GONDOLA_SKIP_BROWSER_INSTALL=1`; those variables are forwarded to the existing interaction runner. To select a local Chromium build, set `CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium` and skip the Playwright browser install.

## Open the interactive demo

Build with the runner, then serve the repository root over HTTP:

```sh
python3 -m http.server 8080
```

Open [http://localhost:8080/backend-replacement/demo.html](http://localhost:8080/backend-replacement/demo.html). Use Add and Reset in the live counter, then switch between **Gobi DOM** and **Gobi React**. The page shows the current Go runtime snapshot and the active renderer's observed DOM snapshot after counter actions and backend changes. A failed switch is shown in the page; the host attempts to remount the previous renderer with the latest Go snapshot.

The demo is a counter-specific replacement example. It demonstrates preservation of Go state and delivered messages across these two mounts; it does not assert DOM node identity, focus or selection preservation, pixel equality, or support for every Gobi component and effect.

## Contract for another backend

Add a mount function with the shape `(root, runtimeFacade) => rendererApi` and register it with `createBackendHost`. The facade offers synchronous `init()` and `dispatch(input)` methods. A renderer mount calls `init()` to render the latest snapshot; it must not initialize a second application session. It returns an API with:

- `snapshot()` for its current runtime snapshot
- `domSnapshot()` for observed mounted DOM details
- `click(path)` for the counter's declared child-index path input
- `unmount()` to release its render root and handlers

`createBackendHost` adds `replaceBackend(name)` and `backendName()` while maintaining a single Go runtime. The new renderer must preserve Go `Init`/`Update`/`View` and declared message semantics, report unsupported effects rather than silently dropping them, and prove parity against an independent reference for the supported input set. Broader event types, effects, reconciliation, keys, focus behavior, and arbitrary components need their own fixtures before claiming support.
