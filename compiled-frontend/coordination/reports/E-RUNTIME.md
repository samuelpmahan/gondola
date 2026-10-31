# E-RUNTIME

**Outcome: mixed change.** Added synchronous renderer replacement to the compiled runtime. A successful `replaceRenderer(nextRenderer)` unmounts the current renderer, commits the cached raw Go `View` to the new renderer, and returns the current `{state,view,dom}` snapshot. The operation does not call compiled `Init`, `Update`, or `View`, append a Gobi trace tick, consume a dispatch ID, or replace the pending effect-correlation map.

## Runtime behavior

- Renderer admission is reserved before inspecting the candidate protocol. Invalid, same-instance, reentrant, declared-async, and unpaired focus-hook candidates are rejected before old-renderer teardown where the runtime can know this in advance. The prior renderer remains usable after these preflight rejections.
- After admission, the runtime captures focus state when both sides provide the optional synchronous `focusState()` / `restoreFocus(state)` pair. It then synchronously unmounts the old renderer and commits the most recently cached raw Go view to the candidate. It validates the new view and DOM snapshots before activating the candidate generation.
- Each callback closes over its renderer-instance lease. Callbacks from retired renderers are fenced regardless of their renderer-local view epoch. Their attempts appear in `runtime.rendererDiagnostics().fencedCallbacks`, outside the application trace; they do not invoke Update or append an application tick. Callbacks emitted while either renderer is transitioning are rejected.
- A valid effect completion that arrives synchronously during replacement is accepted as queued and retained under its existing dispatch/effect correlation. It remains pending at the synchronous return snapshot and is processed by a microtask after `replaceRenderer` returns. Duplicates are rejected. Unmount or a replacement failure before the drain cancels the held completion.
- If teardown has been attempted and a later synchronous step fails, the runtime halts and throws `RuntimeFailure` with stage `renderer-replacement`. `snapshot()` then fails with an unavailable-renderer error. Diagnostics record the phase and whether synchronous old-renderer unmount completed; no restoration of the old renderer is claimed.

## Verification

Command, run from `compiled-frontend`:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test frontend/runtime/runtime.test.mjs
```

Result: **23 passed, 0 failed**, Node `v22.23.4`. The focused suite covers trace/state preservation; retained pending effects and dispatch IDs; retired callbacks from more than one renderer view epoch; focus snapshot/restore; same-instance, invalid, reentrant and declared-async admission; a thenable commit failure; callback and Proxy-trap reentry during swap; exactly-once held effect delivery after return; and cancellation after unmount or swap failure. Node emitted its existing experimental `EnvHttpProxyAgent` warning.

An earlier run had 22 passing tests and one failing probe because the fake renderer repeated its reentrancy injection during the later, valid completion update. The probe was narrowed to inject only during replacement; the rerun passed all 23 tests.

## Limits

The runtime tests use compiled-symbol and renderer stubs. They establish the runtime lifecycle and queue contract, not cross-backend DOM behavior, real focus/selection transfer, generated-app conformance, or mounted Chromium behavior. Those remain with the integration/harness lanes. A regular renderer function that returns a thenable can only be identified after it has been called; when that occurs after old-renderer teardown, the runtime fails closed and reports that no rollback occurred.

## SHA-256

- `frontend/runtime/runtime.mjs`: `a35338302fc391499575fe7d3c7c59c41a3eeaddce23a3039f0a13d84ac94ae2`
- `frontend/runtime/runtime.test.mjs`: `f2fb585601675f60a2994b91b4c8feb4dd77507668bef27ff6e37200ad4c381d`
