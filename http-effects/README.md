# Typed HTTP effects

The editor session remains in Go WebAssembly. The unchanged async effects host forwards its `start` and `cancel` commands to a same-origin `fetch` transport, and Go receives replies through the existing completion API. The existing controlled-input DOM and React renderers display the same Go snapshot; they do not implement save transitions.

The local Go HTTP lab serves the demo and records requests by lane and ID. It can echo a successful value, return a server error, produce malformed or wrong-ID responses, send HTTP 503, drop the connection, or hold a response until you release it. Cancel aborts the browser fetch. The server request log exposes whether cancellation was observed.

## Run the checks

Use Go 1.24 and Node 22 from the Gondola repository directory:

```sh
bash run-http-effects.sh
```

The default runner first executes the signed static baseline with `run.sh`, then runs `run-async-effects.sh`, then builds the HTTP-save WebAssembly runtime and HTTP lab, runs the strict WASM bridge smoke, bundles the pinned React renderer and independent reference, runs Go and the HTTP-effects Node tests, drives the interactive demo against real HTTP in Chromium, and runs the seeded parity harness. The parity harness accepts options such as `--seeds 20261030,20261031`, `--cases 30`, `--max-actions 40`, `--output PATH`, and `--headed`; the runner forwards its arguments to that harness.

If interaction npm packages and Chromium are already installed, set `GONDOLA_SKIP_NPM_CI=1` and `GONDOLA_SKIP_BROWSER_INSTALL=1` to avoid reinstalling those during inherited checks. The signed `run.sh` baseline still performs its pinned root `npm ci`. For a local Chromium executable, also set `CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium`.

During iteration, `GONDOLA_HTTP_SKIP_INHERITED=1` skips both inherited gates only when this runner has already recorded a passing receipt and the static-plus-inherited source digest still matches. The normal default always runs the static and inherited chains.

## Open the interactive demo

After a successful build, start the lab from the Gondola repository directory:

```sh
http-effects/build/http-lab -addr 127.0.0.1:8080 -root .
```

Open [http://127.0.0.1:8080/http-effects/demo.html](http://127.0.0.1:8080/http-effects/demo.html). Type a draft, choose the response for the next save, and select **Save**. For a held request, switch to the other renderer while it is pending, refresh the server records, and release it. Try a server error or malformed response and retry the same draft. To inspect cancellation, hold another request and select **Cancel** in the editor; refresh the server records to see whether the aborted fetch was observed.

The page displays the Go state and completion audit, transport start/cancel/reply events, the selected renderer and live DOM, and the server's request records. Each page uses its own lane unless a `?lane=...` value is provided.

## Scope

The demo and checks exercise a finite same-origin HTTP laboratory using the supported Go server, Chromium, pinned React version, and declared response modes. The lab is an inspection tool; it does not provide production authentication, authorization, persistence, cross-origin behavior, or security guarantees. Focus and selection continuity across renderer replacement, IME composition, arbitrary browser event-loop behavior, pixel equality, and universal renderer equivalence remain outside this milestone.
