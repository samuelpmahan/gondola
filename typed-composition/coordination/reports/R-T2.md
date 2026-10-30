# R-T2 repair report

## Outcome

Completed the bounded strict-admission repair across the direct WASM bridge and the public composition host. The host now passes original arguments to the bridge without cloning or inspecting them first. The strict bridge rejects accessors, inherited-value fallback, unknown own keys (including symbols), and malformed primitive values before a manager operation can run. It also fences synchronous nested `gobiComposition` calls while validating an outer call.

## Changes

- `cmd/composition-wasm/main_wasm.go` and `bridge_decode.go`: all API calls enter a method-level reentry fence before argument/schema inspection. Exact schema decoding uses `Reflect.ownKeys` and own property descriptors, snapshots only data descriptor values, and contains trap errors. Accessors and prototype fallback are rejected without executing getters.
- `cmd/composition-wasm/smoke.html`: actual-browser probes cover accessor rejection, `ownKeys` and descriptor trap reentry, unchanged manager state/IDs after failed schemas, and valid calls after failures.
- `typed-composition/host.mjs`: removed argument cloning before `Reflect.apply`; output cloning remains after the manager call.
- `typed-composition/host.test.mjs`: verifies host forwards the identical input object, preserving its symbol and accessor descriptor without invoking the getter.
- `typed-composition/coordination/WIRE.md`: records descriptor-based input admission, host pass-through, reentry behavior, and the limit that arbitrary proxy side effects are not rolled back.

## Verification

Commands run from the repository root:

```text
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test typed-composition/host.test.mjs
PATH=/tmp/gondola-go/bin:$PATH go test -count=1 ./cmd/composition-wasm ./cmd/composition-replay ./composition
PATH=/tmp/gondola-go/bin:$PATH GOOS=js GOARCH=wasm go build -o /tmp/host-admission/composition.wasm ./cmd/composition-wasm
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node cmd/composition-wasm/smoke.mjs /tmp/host-admission/composition.wasm typed-composition/build/wasm_exec.js
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node typed-composition/coordination/reviews/host-admission-probe.mjs > typed-composition/coordination/reviews/host-admission-result.post-repair.json
```

All commands exited successfully. Host tests: 7/7 passed. Go tests passed in the three focused packages. Direct browser smoke returned `ok:true`, 16 methods, 18 malformed schema cases rejected, six unsafe IDs rejected, accessor reads 0, both proxy reentry probes blocked, and valid methods remained usable.

The unchanged public-host browser probe was rerun against the updated demo in Chromium. It reported both symbol input and accessor input rejected; `list`, manager tree, and child snapshot state remained unchanged; accessor getter count was 0; nested create returned no ID; and there were no page errors. The full output is preserved at `typed-composition/coordination/reviews/host-admission-result.post-repair.json`. The original `host-admission-probe.mjs` and pre-repair `host-admission-result.json` remain unchanged.

## Evidence hashes

- Built browser artifact `/tmp/host-admission/composition.wasm`: `3e2ad04fc31bab0684c942590b3f030d83328e6b43e513bd69e8bafc5fdb87cc`
- `cmd/composition-wasm/main_wasm.go`: `6030447ef75d87188c9fd58b24b87f386288f5f399b44d6e3724243cc9fd5459`
- `cmd/composition-wasm/bridge_decode.go`: `9e07552eeadd896575209f4ec3e5406ba0b0f0264131d9366e46fb47b59f6893`
- `typed-composition/host.mjs`: `e030ff3e1f10a19b2a520f7b652df5e1bc14cb7d5d33bc2f10076f0d11685f3c`
- `typed-composition/host.test.mjs`: `2bbe3ca09c0a53a5c7c573c771ca9da83c36961d8bbd157e4ae512ea590de0c5`
- `typed-composition/coordination/reviews/host-admission-result.post-repair.json`: `211f742f9c0302f3126d0d071a1d405f5fe139264b4b336d3ead92ffa6afceae`

## Limits

These checks establish the direct bridge and public-host admission behavior for the exercised cases. Proxy traps can still have arbitrary JavaScript-side effects outside the Go manager; the bridge only fences synchronous nested calls into its API. This report does not claim integrated runner or full-suite success.
