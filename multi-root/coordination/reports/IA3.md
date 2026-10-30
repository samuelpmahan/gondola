# IA3 — Chromium multi-session and multi-GoDOM probe

## Result

Passed an independent Chromium probe using freshly built Go 1.24 WASM artifacts. The browser started the real multi-root manager WASM and GoDOM renderer WASM, mounted three manager sessions into three roots, and held two simultaneous real GoDOM renderer handles in roots A and C while root B used the existing DOM renderer.

The probe verified:

- Session IDs 1, 2, and 3 were simultaneously active. A and C independently saved through local request ID 1 with distinct draft values and per-session transports.
- A and C had distinct snapshot state and root-local DOM. Focus capture reported only the root containing `document.activeElement`; each handle restored its own saved key and selection.
- Invalid update fenced GoDOM handle C. GoDOM handle A, its manager session, and root B remained usable.
- After draining C's `start`, direct manager dispatch of C's cancel cleared `PendingID` and queued the cancel. Disposing C immediately returned `{Kind:"cancel", ID:1, Value:""}`; the C transport logged one cancellation, with no A cancellation.
- C's handle became stale and its root cleared. The old C transport callback after disposal did not call Go `Complete`. A's same-numbered request completed successfully while C was disposed.
- Reusing root C allocated fresh session ID 4 and a new GoDOM handle. The stale C handle and old C callback could not change the new session or DOM.

## Exact commands and results

Toolchain: Go `go1.24.0 linux/amd64`, Node `v22.23.4`, Chromium `153.0.8010.0`.

```sh
GOTOOLCHAIN=local GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/ia3-multi-root.wasm ./cmd/multi-root-wasm
# passed

GOTOOLCHAIN=local GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/ia3-godom.wasm ./cmd/godom-wasm
# passed

cp "$(GOTOOLCHAIN=local /tmp/gondola-go/bin/go env GOROOT)/lib/wasm/wasm_exec.js" /tmp/ia3-wasm_exec.js
# passed

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node /tmp/ia3-browser-runner.mjs
# passed; output:
{"ok":true,"sessionIDs":[1,2,3,4],"simultaneousGoDOMHandles":2,"sameRequestIDs":[1,1],"queuedDisposeCommands":[{"Kind":"cancel","ID":1,"Value":""}],"lateCallbacksRejected":2,"independentFocusAndFailure":true,"siblingCompletion":"saved by A","rootReuse":true}
```

The runner served the temporary harness from `/tmp`, imported the repository's host, DOM renderer, and GoDOM adapter modules, and captured the actual handles returned by the GoDOM WASM bridge. The transport was an in-memory controlled callback transport so the probe could deliver stale replies directly. Both harness files and all three build artifacts remain outside the repository. No production source was edited for IA3.

## Limits

This probe covers Chromium with a controlled transport. It does not add an HTTP-lab request sequence, React renderer root, other browser engines, or a sustained mount/unmount memory test. The repository's separate demo and HTTP browser gates cover the shipped HTTP flow.
