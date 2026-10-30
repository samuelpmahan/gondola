# A-WASM — composed acceptance of the nested WASM bridge and host lifecycle

**Outcome: confirmed_reuse, bounded to the reviewed bridge and host lifecycle.** Current bridge and host source hashes match the independently accepted XR-T2 and XR-R-T3 checkpoints and the recorded full-run source snapshot. I found no drift or contract mismatch in those files. This accepts the additive tree bridge and scoped callback lifecycle evidence; it does not certify the refreshed replay oracle or the entire final feature checkpoint.

## Bridge contract

The current `cmd/multi-root-wasm/main_wasm.go` exposes `createChild(parentID)` and `disposeTree(id)` with arity 1 and `tree()` with arity 0. The shared method wrapper enforces exact argument counts. Session arguments pass through primitive-number, integer, positive, JavaScript-safe ID validation, and failures retain the existing `{error: string}` shape. Empty tree and disposal results are converted to JSON arrays.

The independent XR-T2 review inspected the bridge, native wire-shape tests, and real-WASM smoke at the current hashes. Its Chromium run checked the exact `{SessionID, ParentID, Depth}` tree records and `{SessionID, Commands}` disposal bundles, including `Command.Value: ""`; malformed/extra-argument calls; zero, negative, fractional, string, boxed, and unsafe IDs; invalid or dead parents without tree/allocation mutation; non-leaf `dispose` without draining effects; child-first postorder bundles; stale calls after disposal; and an unrelated sibling with the same local request ID. The original multi-root bridge and codec checks also remain in the smoke. XR-T2's fresh Go 1.24 WASM build and Chromium 153 run passed with:

```json
{"ok":true,"sessions":[1,2,3],"sharedLocalRequestIDs":[1,1,1],"disposedCancellation":[{"Kind":"cancel","ID":1,"Value":""}],"siblingCompletion":"saved two","lateRepliesRejected":true,"nestedTree":[4,6,7,8],"subtreePostorder":[7,6,8,4],"invalidParentsRejected":true}
```

## Host callback and renderer ownership

The accepted R-T3/XR-R-T3 hashes match current `session-tree/host.mjs` and `host.test.mjs`. The host reserves its structural-operation guard before raw `disposeTree`, pre-fences every owned descendant, validates and caches the returned per-session bundles, then lets flat-host leaf unmount consume each bundle once. The guard remains active through cleanup. If Go rejects disposal atomically, the host restores active node state and clears the operation reservation. Transport cancellation stays scoped to each session; retired facades and callbacks cannot complete into a disposed or freshly recreated session. The independent recheck reran the saved red-to-green reentry probe and forced disposal-error probe; its 11 host tests passed. The retained full run also records the tree host suite passing.

The actual nested HTTP browser smoke mounted a DOM root, React child, GoDOM grandchild, and separate GoDOM sibling. Parent and child renderer replacement retained descendant shell/input identity; disposing the child branch cancelled in postorder `[3,2]`; late HTTP releases returned 409; the sibling completed; and a captured callback from the retired root made zero Go `Complete` calls after the root was recreated. The GoDOM renderer API continues to return a per-mount handle, and the host keeps one renderer record per session node. These claims remain within the named DOM/React/GoDOM profile. The root and renderer-conformance docs explicitly limit compilation to the finite keyed profile and disclaim arbitrary component compilation and generic `gobi.Backend.Emit` compatibility.

## Reused execution evidence and boundary

`session-tree/evidence/full-run-before-cancel-review.log` records an exit-zero run of `run-session-tree.sh` using Go 1.24.0, Node 22.23.4, and Chromium 153.0.8010.0. It includes both WASM smoke outputs, the real HTTP nested demo smoke, and the session-tree Node tests. `full-run-before-review.json` records 63 scripts, 1,587 actions, 1,650 global ticks, 544/544 native comparisons, zero mismatches, and detection of the focus-loss negative control. The run's recorded GoDOM and multi-root WASM artifacts match the hashes in the accepted bridge receipt.

The full run is historical evidence, not a new run from this review. The current bridge and host files match its source snapshot, but the current `session-tree/check.mjs` and `fixture.mjs` hashes differ from both `source-assets.json` and the checker/fixture hashes embedded in the retained replay. N5's oracle repair is active; therefore I do not treat the earlier 63-script replay as final acceptance for that repaired oracle. It also predates XR-T5's stronger global cancellation-order, explicit Add/Reset/Up, and same-name-remount stale-callback assertions, which `RESULTS.md` already marks pending. A final source-assets refresh and affected-gate/full-run evidence are still needed for those broader claims. Fresh feature-branch CI is not established by this packet.

No production or documentation files were changed, and no tests were rerun in this composed review.

## Bound hashes

```text
cmd/multi-root-wasm/main_wasm.go             70b4b1cfcb669ad83c2333805e3355f9e441f91d69f88768686a65f7fb261f79
cmd/multi-root-wasm/tree_bridge_test.go      ea33853a7a3e3449d8fe228c79b2cd08b2a962031b126d572b0a3032fcd686fa
cmd/multi-root-wasm/smoke.html               4f4682b54d79e750ae6b8725b67640f5578ec09e2c2b77b5d57b1523ad102b29
cmd/multi-root-wasm/smoke.mjs                bd957af21881a05d1b4ceb0a02c306feac402e7c622f22bb6f4ead9bdc5d2262
session-tree/host.mjs                        bf128868e63b70637faf4e8febaf6d739deb687e8f7551a2d12d52693971f4e3
session-tree/host.test.mjs                   832ef0c93d94ea0215d58edfbb164ec13406bebdbe803503428dacc7286dfa44
session-tree/browser-smoke.mjs               d06f4322c5eed200a50a3aa9e57842874b0b15143e2a9a5ff213556b914f9b5a
renderer-conformance/adapter.mjs             reviewed in place; inherited from the base tree
session-tree/DESIGN.md                       5547615cc06a999a8af5672201fba8151fa96ba79e9c599d55bbc5744018ec9c
session-tree/evidence/full-run-before-cancel-review.log  e717d074e472e0679eb2480bbb26dffb00df9058956de15fd7c42f8d57c9baa5
session-tree/evidence/full-run-before-review.json        9726d144187db71e7ee3cbd57485837c9f01cfd9ad74c45638f87b3c7e5fc804
session-tree/evidence/source-assets.json                 3b9f759eff1d0e3c41f10922630d4f422e3607ef8cfa8096e17d89f9a18f3ee0
session-tree/build/browser-smoke.json                    14d353392ad5cd794a4f619f91eb25e3370b053da4f4bc86249f6f7436d79c21
session-tree/build/replay-default.json                   33a7dc92211bfd0fc551bd5f894b1a658d5ee59026a7bb70d7e1f070c404add8
session-tree/check.mjs (current; not run snapshot)       05384c1ccb897e35b4d30ae1606918e4474e2ecf195bde988d9d0bd9aae612c4
session-tree/fixture.mjs (current; not run snapshot)     4ca46fed7cf88b7eb92db8dc8b2133f0c267b27d2686a912cb8344e6afa3bf5d
```
