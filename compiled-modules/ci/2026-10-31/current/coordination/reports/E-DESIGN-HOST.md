# E-DESIGN-HOST — host composition reconnaissance

**Worker:** N3  
**Outcome:** `confirmed_reuse`  
**Mode:** read-only design; no production edits or tests run

## Existing host and renderer boundary

`compiled-frontend/frontend/runtime/runtime.mjs` exports `mountCompiledApp(options)`. It admits one compiled module, one `componentId`, one state `encoder`, one `renderer`, and an optional effect host/policy. It validates the selected AppIR component and capability set, checks the encoder and renderer protocol, calls that component's Go `Init`, and returns a single-module runtime with `dispatch`, `complete`, `snapshot`, `trace`, `replaceRenderer`, diagnostics, and `unmount`. It has no typed parent/child bridge call, child slot, or pair-wide mount API.

The existing React and DOM renderers accept a single Gobi `ViewRecord` tree and callbacks scoped to that renderer. Both implement the synchronous `update(view, callbacks)`, `viewRecord()`, `domSnapshot()`, and `unmount()` protocol, with declared view capabilities. The existing runtime performs capability admission before renderer replacement, preserves that module's Go state, and has explicit fail-closed behavior after teardown begins. This is useful per-module behavior, but cannot itself apply the newly selected typed `Input` and `Receive` bridge functions to its private state.

The checked workspace also contains `session-tree/host.mjs`, which uses separate containers for parent and child session shells so parent renderer replacement does not erase child roots. This is a useful containment precedent, not a dependency for the finite pair; the proposed pair needs only two dedicated render roots under one outer UI container.

## Recommended host API

Add `mountCompiledModulePair(options)` in `compiled-modules/runtime/`. The options should hold exactly one parent artifact and one child artifact, each with its own compiled module, encoder, and component ID, plus one outer container and a renderer factory. The returned pair should expose scoped parent/child event dispatch, `snapshot()`, deterministic `trace()`, renderer replacement, and `unmount()`.

Before calling either module's `Init`/`View`, creating a renderer, or mutating the outer container, the host should call the shared ABI validator on both artifacts and the parent-to-child link. Admission must check the additive `gobi.module-abi/v1` descriptors against the exact role signatures and ordered shared type closure. A mismatch rejects with zero init/view/render calls and leaves any already-mounted pair unchanged.

Consume the generated bridge facades from the separate named `gobiModuleBridges` export linked by additive `moduleABI`. Keep `gobiCompiled` at its exact legacy shape with its three standard symbols: the existing runtime validates that envelope, so bridge roles must not be inserted into its ordinary `symbols` registry. AppIR v1 and legacy module exports remain unchanged.

Use one generic state loop per compiled artifact, with its own Go state, encoder, rendered view, renderer callback, and local trace. Reuse the existing renderer protocol and encoder; add the small bridge-aware loop needed because `mountCompiledApp` does not expose state transforms. The host passes only canonical primitive-field records; generated per-module facade adapters reconstruct each module's local Go structs. No GoScript class or encoder Value crosses the module boundary, and JavaScript performs no app transition, arithmetic, lock policy, or reset decision.

Create stable parent and child containers under a single UI root and mount one existing React or DOM renderer into each. Each physical callback dispatches only into its owning compiled module. Keep the pair's state trees separate in snapshots, with a combined host trace recording the fixed event order and bridge payloads.

The selected bridge order is:

- Initialization: initialize both modules, then call parent `Output` → child `Input`, then child `Publication` → parent `Receive`.
- Parent event: parent `Update`, parent `Output`, child `Input`; do not echo a publication back in this same transaction.
- Child event: child `Update`, child `Publication`, parent `Receive`; do not send parent `Output` back in this same transaction.

This keeps bridges finite and deterministic. Nonempty application effect lists should be rejected for this bounded effect-free milestone.

For a renderer swap, pre-admit candidate renderers and their view capabilities for both slots before changing either slot. Preserve both Go states and keep the sibling renderer root alive when one module swaps. If a renderer operation fails after teardown begins, report a failed pair transition without claiming a rollback; the generic runtime documents the same post-teardown limit for a single root.

## ABI alignment and acceptance boundary

The host API matches the selected `modulewire` contract: parent `Output(State) Input` and `Receive(State, Publication) State`; child `Input(State, Input) State` and `Publication(State) Publication`. `Input` is `{Step int, Locked bool, Revision int}` and `Publication` is `{Count float64, Revision int}`. Go owns input revisions, counts, the Add/Reset/lock rules, publication revision checks, and views. The host only routes these typed values between generated adapters and records order.

The required user behavior remains in the compiled Go views: lock disables Add; Reset is disabled at zero and remains enabled for positive counts regardless of lock; parent input revisions advance in Go. Reset to zero and repeated Add/Reset are Go transitions and should be exercised at both renderer profiles. ABI mismatch must be tested before any Go initialization or DOM work, and compatible swaps must preserve both module states.

This recommendation covers the finite one-parent/one-child composition only. No arbitrary module graph, async effects, malicious-code containment, cryptographic provenance, pixel equivalence, or untested browser/OS support is claimed. This reconnaissance ran no integration, Go, or browser tests.

## Inspected source pins

| File | SHA-256 |
|---|---|
| `compiled-frontend/frontend/runtime/runtime.mjs` | `52c44ead9f79f75ef7b211168d4cdb1260544846e8735f67cad93ff470240c5f` |
| `compiled-frontend/frontend/dom/renderer.mjs` | `14d6d12e1360cb1668ce5b901604c1d7d71415aca52fc45f80b34f2a24bbed54` |
| `compiled-frontend/frontend/react/renderer.mjs` | `14644a6b2545b2dbf52854779fcf4187d8b1e221636d97178647d64259e04ce4` |
| `compiled-children/runtime/runtime.mjs` | `7ed7bfa6f567658a0fc283cfce4e76c4dd28fa2646eeea2d8519b2bf4746777b` |
| `session-tree/host.mjs` | `f5ce451235ec2506d80d9ac3ebc364a9e43ba774cd56a66e25e3f8f7bd8a0c5a` |
| selected `module-coordination/CONTRACT.md` | `52e0ce00c2a4975881a28990b864854f02285b8b4a916bd830b736d39696d219` |
