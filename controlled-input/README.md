# Controlled input across replaceable renderers

This milestone adds a small Go-owned editor and a browser binding for one controlled text input. The draft, saved value, save count, Gobi tree, and ordered message history live in one Go session. The DOM and React renderers receive snapshots from that session; replacing the renderer does not initialize a new one.

The browser binding is explicit data alongside the tree: the text input at path `0` maps its `input` event's `target.value` to the Go `edit` message. `gobi.On` keeps its existing literal `Arg` meaning, so the Save and Reset clicks use the same declared message path as other Gobi handlers. The supported dynamic case is only `input[type=text]`, one `value` attribute, `event=input`, and `source=target.value`.

## Run the checks

From the repository root, run:

```sh
bash run-controlled-input.sh
```

The runner first runs `run-backend-replacement.sh` to preserve the earlier interaction and renderer-replacement gates. It then builds `cmd/editor-wasm`, copies the Go `wasm_exec.js` runtime, bundles the new React renderer and independent reference using the pinned interaction dependencies, runs all Go tests and controlled-input Node tests, launches the real browser demo smoke, and passes any remaining command-line arguments to `controlled-input/check.mjs`.

Use Go 1.24 and Node 22. The runner uses the pinned packages in `interaction/package.json` and Playwright's Chromium. It follows the existing skip switches when dependencies and the browser are already installed:

```sh
npm ci --prefix interaction --no-audit --no-fund
interaction/node_modules/.bin/playwright install chromium
GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 bash run-controlled-input.sh
```

## Open the demo

After a successful runner build, serve the repository root over HTTP and open `/controlled-input/demo.html`. For example:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/controlled-input/demo.html`. The page displays the Go JSON snapshot, active backend, and observed DOM HTML, input value property, and focus state. Type an unsaved draft, switch backends, and continue editing to see the same Go state and message history persist. Save may be repeated; Reset clears all editor fields.

## Renderer contract and limits

Each renderer is mounted through the existing backend host with `snapshot()`, `domSnapshot()`, `click(path)`, and `unmount()`. It validates the declared binding, reads `currentTarget.value` for input events, sends a normal Go `Step`, and renders the returned snapshot. Literal handlers continue to resolve through `gobi.On`. An additional backend can use the same host interface and must implement this binding behavior for the narrow text-input case above; it should reject unsupported binding semantics instead of guessing.

The editor has no effects. Input text is plain text and remains escaped by normal DOM rendering. Focus continuity while switching renderers, IME composition, asynchronous scheduling, arbitrary HTML node support, and pixel parity are outside this milestone. Ordinary multi-keystroke typing, in-session renderer swaps, save/reset actions, runtime snapshots, and live DOM are exercised by the browser smoke.

On failure, a renderer records `lastError` and fences later callbacks. It cannot roll back Go state already accepted by the runtime or guarantee DOM rollback if a browser API throws midway through painting. The unchanged host remains readable after direct native-input errors; the demo also inspects the renderer error. These fault paths have a narrower guarantee than successful state/tree/DOM parity.

See [RESULTS.md](RESULTS.md) for executed commands, exact versions/seeds, full traces, independent reviews and remaining guarantees. The experiment supplies concrete renderers; it does not implement `gobi.Backend.Emit` or a Go-to-JavaScript compiler. A third backend must implement the same declared binding and literal-message semantics, controlled value properties, disabled suppression and lifecycle fences, then run the shared deterministic harness against the independent reference.
