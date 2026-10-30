# G-RUNTIME

Implemented the generic compiled-app runtime under `frontend/runtime/`. `mountCompiledApp({module, encoder, componentId, appId, renderer, effectHost, onTick, onFailure})` binds the AppIR Init/Update/View IDs to compiled symbols and encodes typed snapshots with the generated `gobiEncodeState`. It calls the compiled Update adapter directly; Go value-copy behavior remains at that ABI boundary.

The runtime records init, actual dispatch, reply, and suppressed-action ticks with monotonic `dispatch-0001` IDs for actual Update calls only. It commits state and the renderer’s synchronous view/DOM before requesting effects. The deterministic no-I/O host enforces the single allowed kind (`fixture.request`), exact request order, completion correlation/order, and one delivery. Reentrant dispatch is rejected and recorded as a no-op; stale and post-unmount callbacks are fenced. Runtime failures are exposed through the result, `failure()`, and `onFailure`.

Focused verification passed on Node 22: `/tmp/gondola-node22/node_modules/node/bin/node --test frontend/runtime/runtime.test.mjs` — 9 tests, 9 passed, 0 failed. Coverage includes commit-before-reply, reply IDs/correlation, host ordering and missing/extra requests, duplicate delivery, explicit host failure, reentry, stale/unmount callbacks, and nil/empty plus negative-zero snapshots.

This suite uses stub compiled symbols and a stub renderer. It does not establish a mounted browser or four-fixture integration pass. That remains gated on the generated N1 adapter/encoder artifacts and N3 renderer being wired by the integration lane. N3 confirmed its React component bodies only render supplied views; app Init/Update/View and effects run outside them.
