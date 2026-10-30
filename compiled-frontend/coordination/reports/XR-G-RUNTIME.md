# XR-G-RUNTIME

**Decision: amend.** N1’s facade wraps Update with `state.clone()`; its ABI probe shows raw Update mutates input while the facade preserves the caller. Runtime calls this adapter, encodes state with the separate module, and deep-clones snapshots into ticks. Source order is Update → View → synchronous commit → tick → effects. Focused tests pass 9/9 using stubs; no four-app or browser proof.

Three reproducible runtime integration gaps remain:

1. N3 renderer callbacks supply `{Path,Event,Value}`, while runtime `dispatch` requires `{path,event,value}`. The independent probe gets `dispatch-input`, 0 Update calls, and only the init tick.
2. Action validation reads getters before `busy` is reserved. An enumerable `path` getter reentered `dispatch`; both inner and outer transitions were accepted (2 Updates, 3 ticks), bypassing the reentry fence.
3. N3’s actual unmount clears the renderer view. A post-unmount `recordStaleAction` then returns accepted, records no tick, and sets `suppressed-action` failure because `viewRecord()` is null. The runtime test stub retains a view and masks this case.

The runtime host checks only `fixture.request` kind. The frozen Go validators also require Name `lookup` and Reply `complete`; current runtime host tests accept `first`/`second` and `done`, so those traces are rejected by the Go contract. No source edits were made. Focused probe and raw result: `coordination/reviews/xr_g_runtime_probe.mjs` and `.json`.

Hashes: runtime `6252e457db9992bb14ae7b866b2bc893c04eebab1b2917a3c0da6fa53e0067df`; tests `90021458ce9d5810838a3aa8ed0cdb51763c9e49752a015ba897130fb79782f8`; N1 ABI report `123a3d0e75b06409572906107924f3389e3d63149486bd72cde61b5f7d8c4519`; build facade `719c8495cdd131860b4879cba3108fc3e327aa967904037fd12dd3462ffa6277`.
