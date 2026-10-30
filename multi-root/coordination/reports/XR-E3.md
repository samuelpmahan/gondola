# XR-E3 — Independent review of multi-instance GoDOM bridge

## Decision: accepted

Reviewed only cmd/godom-wasm and renderer-conformance/adapter.mjs plus its tests. No E3 source was changed. I found no blocking defect in the instance bridge or its compatibility path.

The Go bridge publishes only mount(). Every successful mount returns a distinct method table whose callbacks close over that renderer and its mounted fence. Wrong arity and renderer failures use the exact single-property {error: string} frame. Unmount fences the handle before cleanup, is idempotent, and cannot clear a sibling root. Calls on a stale handle fail without addressing a renderer later mounted into the same root.

The adapter returns per-instance forwarding methods, unwraps exact Go error frames, rejects malformed instance handles, and retains the prior singleton test-double shape only when mount returns null and the complete legacy method table exists.

## Independent probes

- Adapter unit tests passed all 5 cases, including two distinct handles, instance-local failures, exact error unwrapping, malformed handles, and the legacy singleton test-double path.
- A fresh GoDOM WASM build was mounted twice in one Chromium realm. The root A facade used the actual Go collection WASM; root B used an independent test facade. Two real renderer handles rendered separate roots and independently captured/restored focus.
- Root A invalid-update and callback-dispatch failures fenced only A. Root B continued dispatching, kept its DOM and focus, and did not receive A's failure callback.
- Unmounting A left B's DOM and state unchanged; repeated unmount succeeded; stale A calls returned errors. A fresh renderer mounted into A's vacated root, and the old handle could not mutate it. B also survived A's later callback failure and teardown.
- The smoke exercised the prior single-root collection flow within root A: add, controlled input, reorder, save/completion, keyed input retention, detached listener cleanup, and DOM snapshot. Wrong-arity results from the actual WASM handle had exactly one error property.

## Commands and results

- GOTOOLCHAIN=local GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/xr-e3-review-godom.wasm ./cmd/godom-wasm — passed.
- GOTOOLCHAIN=local GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/xr-e3-review-collection.wasm ./cmd/collection-wasm — passed.
- /tmp/gondola-node22/node_modules/node/bin/node --test renderer-conformance/adapter.test.mjs — passed, 5/5. Node printed an experimental EnvHttpProxyAgent warning.
- CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node cmd/godom-wasm/smoke.mjs /tmp/xr-e3-review-godom.wasm /tmp/xr-e3-review-collection.wasm /tmp/gondola-go/lib/wasm/wasm_exec.js — passed; result reported simultaneousInstances=2, independentFocusRestore=true, idempotentUnmountAndStaleHandleFence=true, independentCallbackFailureFence=true, and rootReuseAfterUnmount=true.
- GOTOOLCHAIN=local /tmp/gondola-go/bin/go test ./godom ./cmd/godom-wasm — passed; both packages report no test files.
- GOTOOLCHAIN=local GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go vet ./godom ./cmd/godom-wasm — passed with no output.
- Tool versions: Go 1.24.0, Node v22.23.4, Chromium 153.0.8010.0.

## Scope limits

This packet verifies the renderer bridge and adapter boundary. Root B uses a test facade, so this smoke does not claim two independent Go collection sessions; the multi-session manager and composition host own that guarantee. No full repository/default runner was executed for this review.
