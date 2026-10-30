# Minimal dual-Go browser spike

This was the first dependency gate for the Go DOM renderer. The small Go app
WASM publishes `appDispatch`; the independent Go renderer WASM registers a
native button callback and an exported `click` method. The browser calls the
renderer API's `click`, which invokes the actual button's native `.click()`,
enters the renderer's Go `js.Func`, calls the JavaScript facade, enters the app
WASM's Go dispatch callback, returns into the renderer callback, and
synchronously re-enters the renderer WASM `update` method.

The exact probe source is retained in the adjacent `*.txt` files. It is a
small mechanism-only probe; the separate `../smoke.html` and `../smoke.mjs`
test uses the real Go collection app and final Go DOM implementation.

From the repository root, reproduce the original spike with Go 1.24, Node 22,
Playwright available from `interaction/node_modules`, and Chromium at
`/tmp/chromium`:

```sh
mkdir -p /tmp/godom-spike
cp cmd/godom-wasm/spike-mini/app.go.txt /tmp/godom-spike/app.go
cp cmd/godom-wasm/spike-mini/renderer.go.txt /tmp/godom-spike/renderer.go
cp cmd/godom-wasm/spike-mini/index.html.txt /tmp/godom-spike/index.html
cp cmd/godom-wasm/spike-mini/run.mjs.txt /tmp/godom-spike/run.mjs
GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/godom-spike/app.wasm /tmp/godom-spike/app.go
GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/godom-spike/renderer.wasm /tmp/godom-spike/renderer.go
cp /tmp/gondola-go/lib/wasm/wasm_exec.js /tmp/godom-spike/wasm_exec.js
/tmp/gondola-node22/node_modules/node/bin/node /tmp/godom-spike/run.mjs
```

Observed browser result:

```text
SPIKE_RESULT updated:1:1 updated:1:1
```

