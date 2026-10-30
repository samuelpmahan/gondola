# E6 author report: demo, runner, CI, and usage

## Delivered

- `controlled-input/demo.html` and `demo.mjs` mount one `gobiEditor` Go WASM runtime through the unchanged `backend-replacement/host.mjs`, with the new DOM and React renderers.
- The demo displays the Go JSON snapshot, active backend, rendered HTML, actual input value property, disabled paths, and focus state. It shows renderer/runtime errors in an alert and reads an optional renderer `lastError` property when present.
- `controlled-input/demo-smoke.mjs` uses Playwright actions against the served page. It checks normal multi-keystroke input on both renderers, state/message continuity across unsaved and saved renderer swaps, exact save and repeated-save results, reset, disabled properties, binding JSON, and equality between the renderer HTML snapshot and live `innerHTML`.
- `run-controlled-input.sh` runs `run-backend-replacement.sh` first, builds the new Go WASM/editor assets and both browser bundles, then runs Go tests, controlled-input Node tests, the real demo smoke, and `check.mjs` with CLI arguments forwarded. The controlled-input GitHub workflow runs the static baseline first and sets up Go 1.24, Node 22, pinned dependencies, and Playwright Chromium.
- `controlled-input/README.md` documents the binding contract, supported use, limits, run command, and local demo serving command.

## Demo smoke evidence

Command:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 \
node controlled-input/demo-smoke.mjs
```

Environment: Go `go1.24.0`, Node `v22.23.4`, Chromium `153.0.8010.0`. The smoke passed eight observations from initial state through reset. It verified six ordered `edit` messages (`d`, `dr`, `dra`, `draf`, `draft`, `draft!`), two `save` messages, then `reset`; the final state was empty with nine messages retained. Every observation checked live DOM HTML, actual input value, binding JSON, save/reset disabled properties, and backend name.

The smoke screenshot after typing `draft!` in React is `controlled-input/evidence/E6-after-react-edit.png`. The passing smoke output is preserved in `controlled-input/evidence/E6-demo-smoke.log`.

One pre-adjustment smoke attempt typed `!` immediately after a renderer swap. Because the swap remounts the input and cross-renderer caret preservation is outside scope, the caret started at offset zero; Go and actual DOM both correctly reported `!draft`. The smoke now presses End after the swap before continuing the edit. The diagnostic is preserved in `controlled-input/coordination/E6-demo-smoke-pre-adjustment.log`; it showed matching Go state, input property, HTML, and focus, with no renderer error.

## Additional checks and remaining integration gate

- `node --check controlled-input/demo.mjs` and `node --check controlled-input/demo-smoke.mjs` passed with Node 22.
- `bash -n run-controlled-input.sh` passed.
- Built `cmd/editor-wasm` for `js/wasm`, copied the Go 1.24 `wasm_exec.js`, and bundled `controlled-input/react.mjs` and `reference.mjs` using the pinned interaction esbuild.
- The full controlled-input runner and `check.mjs` were not run in this author pass; root owns the integrated runner after harness and adversarial test assets are ready.
