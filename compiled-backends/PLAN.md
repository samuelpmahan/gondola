# Compiled backend replacement plan

## Goal and architecture

Add a native DOM renderer beside the existing React renderer for the four compiled Go fixtures, then permit a live renderer swap in the existing compiled-app runtime. One runtime and one emitted Go module remain mounted per app session. The new backend receives the same AppIR-selected Init/Update/View functions and the same `View` values. The renderer boundary owns DOM creation, update reconciliation, event wiring, snapshots, focus restoration, and unmount only.

The replacement path captures the current logical view and (when both renderer methods exist) selection, synchronously unmounts the old renderer, synchronously renders the cached view in the next renderer, and restores selection by logical key. The base renderer protocol remains backward-compatible; `focusState()` and `restoreFocus(record)` are an optional pair, but are required on both shipped React and DOM renderers. Focus capture must return `null` or the closed selection record; throw, thenable, and malformed-record failures reject before teardown, leaving the old renderer active and the runtime unhalted. Focus restore must return a strict boolean; `false` or any non-boolean/throw/thenable after teardown fails closed without rollback. Reentrant dispatch/nested replacement is rejected without a hidden Update/tick/dispatch ID. A valid completion received during swap is queued, duplicate-fenced, and drained by microtask after the synchronous replacement returns; unmount/failure before drain cancels it. It does not rerun app code or alter runtime state, trace ticks, dispatch IDs, messages, or pending effects during the swap itself. Because teardown precedes the next commit, a commit failure after teardown fails closed and has no rollback guarantee.

## Stack, frozen constraints, and review focus

This milestone stacks on PR11's compiled frontend. Keep the `gobi.compiled-module/v1` and AppIR contracts fixed, keep the emitted Go functions authoritative for app behavior, and preserve existing PR11 receipts and M0 receipt bytes. No WASM, hand-written JavaScript app reducer, dependency/lockfile mutation, or root Git operation is part of this worker plan. Use the root-provided Go/Node toolchain and existing pinned packages.

Reviewers should focus on these likely failure modes:

1. A backend request or emitter branch accidentally changes the app module/AppIR or routes execution to a second app implementation.
2. Replacement calls Init/Update/View, appends a tick, allocates dispatch IDs, or resets/delivers a pending effect.
3. New renderer commit is asynchronous/reentrant, old callbacks remain live, or successful teardown leaves nodes in the old root.
4. Binding/literal event semantics, controlled properties, keys, or live DOM snapshots differ from React/reference expectations.
5. Focus restoration confuses logical keys with DOM node identity, while failure handling implies rollback after teardown.

## Ownership and interfaces

| Lane | Ownership | Shared interface / handoff |
| --- | --- | --- |
| N1 Runtime | `compiled-frontend/frontend/runtime/runtime.mjs` and its tests | Add synchronous `replaceRenderer(nextRenderer)` around the already-mounted runtime. Preserve Go state, trace, dispatch sequence, and pending completion records. |
| N2 DOM | `compiled-frontend/frontend/dom/**`; React renderer/shared validation helpers as assigned | Add `createDOMRenderer({container,onFailure})` implementing `update`, `viewRecord`, `domSnapshot`, `unmount`, `focusState`, `restoreFocus`; share view validation and logical keyed identity semantics. |
| N3 Harness | `compiled-backends/conformance/**` | Five fixture oracles, action/swap replay, adversarial rejection and mutation controls, exact state/tree/DOM/message/effect comparisons. |
| N4 Build | `compiled-frontend/build/**`, `emit/**`, compilercontract build-backend validation only | Backend selection/emission plumbing only. React and DOM consume the same AppIR and emitted Go module; separate builds check AppIR, encoder, forwarding Go, TypeScript, mapping, and role bindings exactly. No schema or app semantics change. |
| N5 Demo | `compiled-backends/demo/**`, runner and workflow paths assigned by lead | Visible four-app demo with one runtime per app and backend swapping; provide actual run instructions/evidence. |
| N6 Contract | `compiled-backends/CONTRACT.md`, `PLAN.md`, `evidence/**` | Publish this contract, contribute scoped rejection fixtures, and perform an independent semantic audit without self-approving. |

The base runtime protocol is `update(view, callbacks)`, `viewRecord()`, `domSnapshot()`, and `unmount()`. Shipped renderers also implement the optional `focusState()`/`restoreFocus(record)` pair using logical identity and selection start/end/direction. Swap remounts create distinct DOM nodes; keys preserve identity only within a renderer's reconciliation. See [CONTRACT.md](CONTRACT.md) for normative behavior and failure semantics.

## Sequence and gates

1. Freeze this contract against the existing PR11 `mountCompiledApp` and `createReactRenderer` APIs; notify runtime, DOM, build, harness, and demo lanes of the protocol before integration.
2. Complete runtime replacement and DOM renderer independently under their disjoint ownership. Do not let either lane change the compiler module schema or Go fixtures.
3. Build the four unchanged apps through both backend request profiles, check the stable companion outputs, and import one compiled module object for each app into the mounted cross-backend harness. Do not compare bundles after deleting source-label text.
4. Run all five fixture oracles: counter add/reset/disabled, form text/checked/literal/save/reset, keyed list identity/empty/detached, effect commit-before-reply, and list-growth spare-capacity/edit/reorder/reset. Run deterministic counter action scripts with alternating React↔DOM swaps and swaps while an effect is pending. Compare every action/reply, typed state, view/bindings, DOM controls, effect correlation, and message order. Run same-backend keyed update checks and cross-backend focus/selection restoration checks.
5. Run the negative semantic audit for malformed renderer methods/focus pairs, unknown View/Node/Binding fields, focus capture throws/thenables/malformed records before teardown, strict boolean restore results, declared async methods, thenable results, reentrant callbacks, failed commits, stale callbacks, and invalid post-unmount calls. Confirm old-renderer usability for capture rejection and fail-closed behavior without a rollback claim after teardown.
6. Run the integrated inherited compiler gates, runtime/renderer tests, five-fixture harness, browser demo smoke, and CI command from a clean source snapshot. Record exact commands and actual outputs. Preserve earlier receipts byte-for-byte.
7. Have a different worker perform the cross-review and report concrete gaps. The contract author does not approve their own lane. Root owns Git/integration and publication.

## Evidence and execution claims

`evidence/` is reserved for this lane's adversarial semantic audit fixtures and execution notes. The evidence separates authored checks from executed checks and reports only observed results. It is not a substitute for N3's integrated cross-backend conformance harness or N1/N2 focused tests. No pre-contract rerun of the prior PR11 suite is required; the integrated milestone gates run after peer code is ready.
