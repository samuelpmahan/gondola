# Async save effects

This milestone keeps asynchronous save state in one Go `asyncsave.Session`. Saving returns a typed `start` command with a monotonically increasing request ID and a copy of the exact draft. The browser transports that command and later delivers a typed reply to the same Go session. Go alone decides whether the reply is still current: a canceled, superseded, duplicate, or late reply is recorded in the message history and audit but cannot change the editor state.

The demo uses the existing controlled-input DOM and React renderers. A renderer swap keeps the Go session and pending request alive. The default manual transport makes replies repeatable: start a save, switch renderers, start another save, deliver the first reply late, then deliver the current reply. Turn on **Reply with a timer** to use a local `setTimeout` transport and watch a save finish after an immediate renderer swap. Neither transport contacts a network service.

A live Go runtime object can belong to only one effect host at a time. Unmount that host before creating another one for the same object. The host can detect reuse of the same object, but it cannot detect distinct wrapper objects that alias one underlying singleton; callers must still provide exclusive ownership.

## Run the checks

Use Go 1.24 and Node 22. From the repository root:

```sh
bash run-async-effects.sh
```

The CI workflow runs `bash run.sh` for the signed Milestone 0 baseline, then installs the pinned browser dependencies and calls the async-effects runner. The runner first runs the inherited interaction, renderer-replacement, and controlled-input checks. It then builds `async-save.wasm`, copies the Go `wasm_exec.js` runtime, runs the Node 22 WASM bridge smoke against that exact build, bundles the independent React state-machine reference, runs Go and Node tests, runs the browser demo smoke, and runs the Go/React parity and adversarial browser checks. It uses the pinned packages in `interaction/package.json` and Playwright Chromium. Run `bash run.sh` first to include the signed Milestone 0 static-rendering baseline in a local full-chain run. If those dependencies are already installed, use the existing skip variables:

```sh
GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 bash run-async-effects.sh
```

After the inherited gates have a passing receipt, `GONDOLA_ASYNC_SKIP_INHERITED=1` can skip only that repeated chain while iterating on async-effects. The normal default always runs it.

## Open the demo

After a successful build, serve the repository root over HTTP:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/async-effects/demo.html`. Type a draft and choose **Save**. In manual mode, use the per-request **Reply success** or **Reply error** controls; delivered requests remain available for duplicate and late replies. `manualTransport.pending()` reports starts that have not been delivered, including canceled IDs, because manual cancellation preserves the callback for forced late replies. Switch between Gobi DOM and Gobi React while requests are pending. The page shows the Go snapshot, typed completion audit, transport command history, rendered HTML, input value property, and disabled controls. The timer option uses an in-page timeout as a transport stand-in.

The browser smoke covers a pending request across a renderer swap, superseding it with a newer save, accepting the newer reply, ignoring the old reply, canceling and resetting a pending request before a late reply, and completing a timed save after an immediate swap. It captures the pending-across-swap state in `evidence/demo-pending-swap.png`.

## Boundaries

The contract covers explicit `start`/`cancel` commands, ordered asynchronous replies, request-ID stale-reply guards, completion audit, and renderer replacement during a pending save. Cancellation in the manual transport is advisory so a late callback remains testable. Timer mode is a local asynchronous stand-in, not a network client. Focus and selection continuity across a renderer swap, IME composition, arbitrary event-loop equivalence, and pixel parity are outside this milestone.
