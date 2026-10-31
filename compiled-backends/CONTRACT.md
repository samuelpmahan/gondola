# Compiled backend replacement contract

Status: acceptance contract for the bounded second DOM backend and live React↔DOM renderer replacement. This adds a renderer implementation to the compiled frontend in PR11. It does not change AppIR, `gobi.compiled-module/v1`, the compiler ABI, or Go application behavior.

## Scope and unchanged application boundary

One compiled module and one `mountCompiledApp` runtime own each live app session. React and DOM renderers consume the exact same Go-produced `View` (`Tree` and `Bindings`) and route events through the runtime callbacks. Init, Update, View, Go value-copy behavior, typed state encoding, dispatch IDs, trace history, and the effect host remain owned by the existing emitted Go functions and runtime. No application reducer or state transition is implemented in JavaScript.

The second backend is admitted only for the four existing compiled Go apps (counter, form, list, effect). It must use the same generated module and AppIR for each app as React. Backend choice selects a renderer only; it does not select a second app module, compiler path, or application implementation. The test harness may mount one renderer at a time for a given runtime/root.

## Renderer protocol

The existing React renderer and the new `createDOMRenderer({container, onFailure})` implement the synchronous protocol passed to `mountCompiledApp`:

```js
{
  update(view, callbacks),
  viewRecord(),
  domSnapshot(),
  unmount(),
  // optional pair; required on the shipped React and DOM renderers
  focusState(),
  restoreFocus(focusState)
}
```

`view` is the unchanged compilercontract `View`, including its binding sidecar. Renderer implementations treat this view as read-only. `callbacks` supplies `dispatch(action, message)` and `onStaleAction(action, renderEpoch)`. `viewRecord()` returns `{tree, bindings}`. `domSnapshot()` returns `{normalization:"outerHTML-v1", html, controls}` with ordered, physically sampled controls. `update` and `unmount` commit synchronously; thenables are rejected. A renderer must reject malformed/unknown node data and must fence callbacks from prior commits, detached elements, and unmounted roots. A successful `unmount()` synchronously empties the renderer's root. Renderers are trusted structural adapters; the contract does not claim protection from a hostile Proxy or side-effecting getter supplied in place of the compiler-produced view.

`focusState()` and `restoreFocus(record)` are an optional pair on the backward-compatible base protocol. Both are required on the shipped React and DOM renderers. Capture returns `null` unless focus is inside a supported enabled input with a valid selection; otherwise it returns exactly `{identity, selectionStart, selectionEnd, selectionDirection}` with a string identity, nonnegative safe-integer selection offsets (`selectionEnd >= selectionStart`), and a string direction. The runtime validates this record before teardown. `restoreFocus(record)` runs after the new renderer commits and must return a boolean synchronously: `true` confirms restoration; `false` means it could not restore and replacement fails closed. Renderer implementations use the same logical identity rule: explicit node keys identify keyed descendants under their keyed ancestry; unkeyed nodes use their child-index path. Cross-backend replacement creates new physical DOM nodes; where both methods are present, it promises logical key and selection restoration, not DOM node identity. A third-party renderer omitting both methods can be swapped without a focus-preservation claim. Supplying only one method is invalid.

Within one backend, stable keys preserve the backend's own keyed reconciliation identity. DOM/React physical identity is not compared across backends. The observable tree, bindings, control values/properties, and app state are compared against the same fixture expectations.

## `runtime.replaceRenderer(nextRenderer)`

The runtime accepts a renderer implementing the base protocol above; `focusState` and `restoreFocus` must either both be present or both absent. Replacement operates on the already-running runtime and its cached current Go `View`:

1. Validate the required renderer method shape and focus-method pairing before teardown. Declared async functions are rejected at admission; every method result is checked at call time for a thenable.
2. When the old renderer implements the focus pair, synchronously capture and validate its focus/selection record. `null` means nothing to restore. A thrown, thenable, or malformed focus capture rejects the replacement before teardown; the old renderer remains active and the runtime is not halted.
3. Synchronously unmount the old renderer. A successful replacement leaves its old root physically empty and fences its event callbacks.
4. Synchronously commit the cached current `View` to the next renderer, then restore focus/selection by logical identity when both renderers implement the pair and capture returned a record. The restore result must be exactly `true`; `false`, any non-boolean, a thenable, or a thrown error is a replacement failure after teardown and therefore fails closed without rollback.
5. Activate the new renderer for subsequent snapshots, dispatch, effects, and unmount. A successful call returns the current `{state, view, dom}` snapshot.

Replacement is renderer-only: it does not call Go Init, Update, or View; append an application tick; allocate a dispatch ID; change the accepted Go state or delivered-message history; create, delete, or rewrite pending effect records; or run an effect's Go completion Update during the swap. Passing the currently active renderer instance is rejected before teardown. A held effect can complete exactly once after any number of successful swaps and follows the same existing reply path.

Replacement calls are synchronous and non-reentrant. A renderer must not dispatch application messages as a side effect of focus capture, `update`, or focus restoration; event handlers fire only in response to user events. A dispatch or nested replacement attempted while replacement is in progress is rejected without a Go Update, trace tick, or dispatch ID. A valid effect completion that arrives during replacement is accepted and queued, and duplicate delivery is fenced immediately. Its Go reply Update is drained in a microtask after `replaceRenderer` returns, so the synchronous swap-return snapshot still shows the pending state and no reply tick. A queued completion is canceled if the runtime is unmounted or the swap fails before that microtask. This protects one-shot hosts that consume a delivery when calling the completion callback. A retired renderer's callback after a swap is fenced and recorded only in `rendererDiagnostics()`; it does not create an application tick. A callback retained from the currently active renderer after runtime unmount creates one suppressed attempted-action tick with the same state, `message:null`, and `dispatchId:null`, but cannot call Go Update. `rendererDiagnostics()` remains an out-of-band lifecycle record, not part of the application trace. The runtime rejects Promise/thenable returns from renderer operations and rejects nested replacement while a swap is in progress. A renderer with only one focus method is malformed. If neither renderer offers the pair, no focus-preservation guarantee is made.

## Failure behavior

Invalid next-renderer protocol, mismatched focus pair, reentrant replacement, passing the active renderer instance, or an invalid focus capture is rejected before teardown; the current renderer remains active and the runtime is not halted. In particular, a thrown, thenable, or malformed result from old-renderer focus capture is a pre-teardown rejection. Once teardown starts, replacement is a commit operation, not a transaction. If an invoked post-teardown renderer operation returns a thenable, or old unmount, next render, focus restore, or post-commit observation fails, the runtime surfaces the failure and halts/fails closed. It makes no rollback guarantee: the old renderer may already be unmounted, the new root may be empty or partially committed, and the runtime does not claim the previous visual tree was restored. The runtime must never report a successful swap unless next-renderer commit and required observations succeeded.

## Acceptance matrix

| Area | Required evidence |
| --- | --- |
| Same compiled app | Each run mounts the same concrete compiled module object with React and DOM for each of four apps, using five oracle fixtures: counter add/reset/disabled, form text/checked/literal/save/reset, keyed list identity/empty/detached, effect commit-before-reply, and list-growth spare-capacity/edit/reorder/reset. Init/Update/View functions and AppIR/component IDs remain identical across a swap. Separate backend builds compare AppIR, state encoder, forwarding Go, generated TypeScript, component mapping, and role bindings exactly. Both raw `gobi-compiled.mjs` hashes are retained; temporary source-root labels can make separate bundles differ, so bundle normalization is not used as proof. No WASM load, hand-written JS reducer, renderer-specific Go application source, or duplicate app module is used. |
| State and dispatch identity | Counter action, repeated updates, and alternating React↔DOM swaps preserve exact typed Go state, ordered delivered-message log, dispatch-ID sequence, and trace history. Swap itself adds no app tick and consumes no dispatch ID. |
| Effects | Swap while a request is pending, swap again before delivery, then deliver the original completion. The pending correlation remains unchanged, one reply tick occurs, and duplicate/unknown replies remain rejected. |
| Views and DOM | After each action and successful swap, compare Go state, logical tree, binding records, live values/checked/disabled properties, and normalized root DOM to each fixture's independent expected observations. |
| Lifecycle and identity | Successful old renderer unmount physically empties its root. Retired callbacks after a swap are fenced out-of-band with no trace tick; a retained callback from the active renderer after runtime unmount records one suppressed attempted-action tick and no Update/dispatch ID. Keyed identity is stable within each backend. Shipped swap remounts use distinct physical nodes and restore focus/selection by logical key; base-protocol renderers without the optional focus pair make no focus claim. Reentrant dispatch and replacement are rejected without a hidden Update/tick/dispatch ID. Completion during replacement is queued, duplicate-fenced, and processed once after synchronous replacement returns; queued delivery is canceled on unmount or swap failure before drain. |
| Failure and admission | Malformed renderer methods or focus pair, unknown View/Node/Binding fields, focus capture throws/thenables/malformed values, same-instance and reentrant replacement, and declared async methods are rejected before teardown with the old renderer usable. Thenables returned by renderer operations invoked after teardown begins, failed old unmount, false/non-boolean/thenable/throwing focus restoration, failed next commit, and invalid post-commit observation fail closed after teardown. No failure is reported as a successful replacement; no rollback is asserted after teardown. |
| Concurrency boundary | Only one renderer is mounted for a runtime/root at once; effects stay in the one runtime host. Concurrent render scheduling, hydration, pixel equality, browser-engine equivalence, and production network effects are out of scope. |

See [PLAN.md](PLAN.md) for ownership, sequence, and executable gates. `evidence/` holds scoped semantic audit fixtures and their actual execution receipt; authored checks are not acceptance until run against the integrated code.
