# XR-T2 — independent review of the nested-session WASM bridge

**Decision: accepted.** I reviewed the current `cmd/multi-root-wasm/main_wasm.go`, `tree_bridge_test.go`, and smoke files against the frozen Go/WASM contract. The bridge exposes the additive tree methods with exact arities, routes IDs through the existing positive safe-integer validation, emits the expected JSON fields and empty arrays, and preserves the prior bridge checks. A fresh build and Chromium smoke passed on the reviewed source snapshot.

## Contract review

- `createChild(parentID)` and `disposeTree(id)` are installed with arity 1; `tree()` is installed with arity 0. They use the same `method` wrapper as existing API methods, which rejects extra or missing arguments and catches panics as exactly `{error: string}`. The smoke checks the complete method table and extra/missing argument cases.
- Both session arguments pass through `decodeSessionID`: only primitive numeric, integral values from 1 through `MaxSessionID` are accepted. The smoke rejects zero, negative, fractional, unsafe, string, and boxed-number IDs for the tree methods. Invalid and dead parents are also exercised; the tree and next allocated ID remain unchanged.
- Tree and disposal results use the existing `toJS` JSON encoder. Native tests pin `SessionInfo` to `{SessionID,ParentID,Depth}`, `Disposal` to `{SessionID,Commands}`, command `Value:""`, and empty arrays to `[]`. The real-WASM smoke checks those shapes and the nested metadata in-browser.
- The smoke checks that single-session `dispose` rejects a non-leaf without changing its snapshot/tree or draining effects. It then checks depth-first postorder bundles, local request cancellation, sibling survival despite equal local request IDs, and rejection of all scoped calls for every removed subtree ID, including late completions.
- The original three-root bridge and codec path remains exercised before the new nested-tree sequence: same-numbered request IDs, independent sibling completion/audits, late-call rejection, strict input validation, exact arity, and HTTP codec shapes all run in this smoke file.

No bridge defect was found. The smoke does not construct a depth-33 tree in the browser; that boundary is enforced by the delegated manager and covered by T1's native manager tests. No implementation edits were made during this review.

## Verification

Tool versions: Go `go1.24.0 linux/amd64`, Node `v22.23.4`, Chromium `153.0.8010.0`.

```sh
GOTOOLCHAIN=local /tmp/gondola-go/bin/go test -count=1 ./cmd/multi-root-wasm
# passed: ok, 0.002s

GOTOOLCHAIN=local /tmp/gondola-go/bin/go vet ./cmd/multi-root-wasm
# passed with no output

GOTOOLCHAIN=local GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/xr-t2-multi-root.wasm ./cmd/multi-root-wasm
# passed

cp /tmp/gondola-go-sdk/go/lib/wasm/wasm_exec.js /tmp/xr-t2-wasm_exec.js

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node cmd/multi-root-wasm/smoke.mjs /tmp/xr-t2-multi-root.wasm /tmp/xr-t2-wasm_exec.js
# passed in Chromium; result: {"ok":true,"sessions":[1,2,3],"sharedLocalRequestIDs":[1,1,1],"disposedCancellation":[{"Kind":"cancel","ID":1,"Value":""}],"siblingCompletion":"saved two","lateRepliesRejected":true,"nestedTree":[4,6,7,8],"subtreePostorder":[7,6,8,4],"invalidParentsRejected":true}
```

The smoke process emitted an environment-level Node warning about `Undici EnvHttpProxyAgent` being experimental; the browser reported no page errors and the smoke completed successfully.

## Reviewed artifact hashes

```text
cmd/multi-root-wasm/main_wasm.go       70b4b1cfcb669ad83c2333805e3355f9e441f91d69f88768686a65f7fb261f79
cmd/multi-root-wasm/tree_bridge_test.go ea33853a7a3e3449d8fe228c79b2cd08b2a962031b126d572b0a3032fcd686fa
cmd/multi-root-wasm/smoke.html          4f4682b54d79e750ae6b8725b67640f5578ec09e2c2b77b5d57b1523ad102b29
cmd/multi-root-wasm/smoke.mjs           bd957af21881a05d1b4ceb0a02c306feac402e7c622f22bb6f4ead9bdc5d2262
/tmp/xr-t2-multi-root.wasm              8c3c279ab1f38f7efde2a8f993d049c96dd26defffdb73a1f6d35b65ada249bc
/tmp/xr-t2-wasm_exec.js                 0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14
```

The full inherited `run-multi-root.sh` chain was not run in this review; this packet covers the focused bridge package and real-WASM bridge smoke only.
