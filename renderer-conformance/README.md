# Renderer conformance

This milestone runs the same Go collection through three negotiated renderers: the existing keyed JavaScript DOM renderer, the existing React renderer, and a Go/WASM DOM renderer. The Go-generated manifest is written to `build/manifest.json` and admitted before the collection is initialized. The Go fixture set is written to `build/fixtures.json` and consumed by the independent admission checks.

## Full run

From the repository root, run:

```sh
bash run-renderer-conformance.sh
```

The runner checks Go 1.24 and Node 22, then always runs `run-keyed-editor.sh` in its default mode. That executes the inherited M0, async-effects, HTTP-effects, keyed-editor, browser smoke, and keyed replay gates. The conformance runner then builds the Go manifest CLI, fixtures, Go/WASM DOM renderer, and matching `wasm_exec.js`; runs the direct GoDOM bridge smoke with the actual collection WASM; runs native Go and renderer JavaScript tests, independent Go-versus-JavaScript fixture checks, and positive fixtures through all three browser renderers; opens the all-renderer demo against the real loopback HTTP lab; and runs the four-actor replay. Arguments go to the final replay check. No conformance-specific skip or cache route is provided.

The repository's existing `GONDOLA_SKIP_NPM_CI=1` and `GONDOLA_SKIP_BROWSER_INSTALL=1` provisioning flags may be set only after the pinned interaction dependencies and Playwright Chromium are already installed. The CI workflow does those installs before setting either flag.

## Real HTTP demo

The default runner launches the browser smoke against the actual HTTP lab. To inspect the page manually, first run `bash run-renderer-conformance.sh`, then start the lab:

```sh
./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .
```

Open `http://127.0.0.1:8000/renderer-conformance/demo.html`. Add rows, edit and reorder while a save is held, switch among DOM, React, and Go/WASM DOM, then release the reply. The page exposes the Go collection snapshot, keyed tree, bindings, audit and transport history, live DOM, physical node identities, and logical focus selection. The smoke also checks deletion and stale-key rejection, typed HTTP failure, and retry.

## Scope

This is a bounded keyed-renderer profile for the existing editor and loopback browser lab. It covers the protocol manifest, the finite v1 node and attribute set, retained keyed controls, event dispatch, controlled input, disabled controls, logical focus, renderer replacement, and HTTP completion. It does not claim arbitrary framework or `Backend.Emit` compatibility, nor does it cover IME composition, hydration, pixel matching, other browser engines, or a production HTTP service.
