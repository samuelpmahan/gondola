# H-HOST — public composition host admission probe

## Result

**Outcome: mixed change; public host admission does not preserve the strict Go boundary.** The actual browser probe reproduced both suspected paths through `createCompositionHost().setChildInputs`. The Go/WASM API rejects a symbol own key when called directly, while the public host silently drops it and accepts the remaining input. An enumerable accessor runs during host cloning before the strict Go bridge is called; that getter can create a new Go root, and the later `setChildInputs` call fails without undoing that creation.

## Actual browser setup

The probe launched the repository's `http-lab` and loaded the real `typed-composition/demo.html` in Chromium through a local reverse proxy. The proxy served the current `composition-wasm` source build from `/tmp/host-admission/composition.wasm`; it did not overwrite the shared build artifact. The demo's actual modules, GoDOM WASM, renderer assets, host API, and Go/WASM bridge were loaded. The probe source and complete browser observations are retained in [`host-admission-probe.mjs`](../reviews/host-admission-probe.mjs) and [`host-admission-result.json`](../reviews/host-admission-result.json).

The probe-built bridge and relevant source hashes were:

| Artifact | SHA-256 |
|---|---|
| Fresh `composition.wasm` loaded by Chromium | `3e2ad04fc31bab0684c942590b3f030d83328e6b43e513bd69e8bafc5fdb87cc` |
| `typed-composition/host.mjs` | `0ef7df9683a101bb4bb2c9c01bdc6560288a6b9325791fe15431cee232b94383` |
| `cmd/composition-wasm/main_wasm.go` | `6030447ef75d87188c9fd58b24b87f386288f5f399b44d6e3724243cc9fd5459` |
| `cmd/composition-wasm/bridge_decode.go` | `9e07552eeadd896575209f4ec3e5406ba0b0f0264131d9366e46fb47b59f6893` |

Reproduction commands:

```sh
PATH=/tmp/gondola-go/bin:$PATH GOOS=js GOARCH=wasm go build -o /tmp/host-admission/composition.wasm ./cmd/composition-wasm
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node typed-composition/coordination/reviews/host-admission-probe.mjs > typed-composition/coordination/reviews/host-admission-result.json
```

The browser probe starts `http-lab` itself and serves the fresh WASM through its local proxy so the demo and bridge run in the same browser origin.

## Observed behavior

The demo began with parent ID `1`, child ID `2`, manager list `[1, 2]`, and child input `Title: "Review ticket"`, `InputRevision: 1`.

1. The probe created an input with own data fields `Title` and `ReadOnly`, plus one own symbol key. Calling the demo's direct manager wrapper rejected it with `gobiComposition.setChildInputs: invalid inputs: input must contain exactly 2 own field(s)`. The manager list and child snapshot remained unchanged.
2. Calling public `host.setChildInputs` with the same object produced no error. The child changed to `Title: "symbol-normalized-by-host"`, revision `2`, and the manager list remained `[1, 2]`. The host's `clone` uses `Object.entries`, which omits symbol keys before the strict bridge receives the copied record.
3. Next, the probe defined an enumerable `Title` getter. The getter called `globalThis.gobiComposition.create()` and returned the number `7`. Public `host.setChildInputs` invoked the getter exactly once, allocated root ID `3`, and then failed with `composition host: gobiComposition.setChildInputs() failed`. Afterwards, manager list and manager/host trees contained `[1, 2, 3]`; the child input remained at the earlier title and revision `2`. The Go creation is not rolled back when the later typed-input call fails.

There were no page errors. Full before/after snapshots, input descriptors, captured errors, lists/trees, getter count, allocated ID, and source hashes are in the retained result JSON.

## Contract impact and limits

`DESIGN.md` says inputs must reach the strict Go boundary without host cloning or coercion because cloning can execute accessors and erase unknown own fields. This probe shows the current public host violates that admission contract in both ways. The bridge's direct symbol-key check still rejects the malformed object, but this is not enough when the public wrapper normalizes it before admission. The accessor side effect occurs before the bridge reentry fence can apply.

This is a bounded browser observation of the public `setChildInputs` path and the exact source/WASM hashes above. It does not evaluate unrelated host methods or claim a broader browser security boundary; the design explicitly states that JavaScript is not an authentication principal or sandbox.
