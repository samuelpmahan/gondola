# XR-HOST — independent host review

**Decision:** amend. **Reviewer:** N5. **Scope:** sealed E-HOST host/runtime and demo files, final module contract/rulings/acceptance, author tests and prior captured browser evidence. No production source was changed.

## Finding

Renderer capability rejection is fail-closed for Go calls and outer DOM publication, but does not unmount a renderer instance that the factory already returned. In initial mount, the expression `parentRenderer = requireRenderer(factory(...), ...)` at `compiled-modules/runtime/runtime.mjs:758` assigns only after `requireRenderer` succeeds. If capability validation throws, the catch at lines 790–795 sees `parentRenderer === null` and cannot release the detached instance. The same ordering occurs for swap candidates at lines 701–702; the catch at 724–728 intends to unmount candidates but sees null for the candidate whose validation threw.

A reviewer witness against the pinned source reproduces both paths. On initial mount, the weak candidate has `unmountCalls === 0`, while both Go `Init` counts and outer-container children remain zero. On swap, the rejected candidate again has `unmountCalls === 0`; the existing DOM backend, roots, states, and call counts remain intact, and an old callback still dispatches successfully. This verifies the rejection/liveness gates while demonstrating the candidate resource leak. Keep the original assertion-red witness and the follow-up observation witness in `rawlogs/XR-HOST/`.

The bounded repair is to retain each factory result before capability validation, then unmount a rejected candidate exactly once in the existing failure path. Preserve the original capability error if cleanup itself throws. Regression tests should cover both initial admission and swap, including unchanged outer DOM/Go calls and an old live callback after rejected swap.

## Checks that passed

- E-HOST report and receipt match their seal. All 14 author source pins rehashed to the pinned bytes, including all four host-owned files and the shared runtime/compiler/ABI inputs.
- Node v22.23.4: `node --test compiled-modules/runtime/runtime.test.mjs` passed 5/5. The test file covers invalid ABI before renderer factory/Go/outer DOM effects; initial renderer capability rejection before Go; Go-only dispatch, declared-action matching, disabled suppression, stale callback fencing, swap state/call-count preservation, effect rejection, and mutation during async admission.
- A reviewer witness passed 8/8: the five sealed focused tests plus checks for the two candidate leaks and parent-event order/counters. Parent events invoke `parent.Update`, `parent.output`, `child.input`, then parent and child `View`; the count deltas match those calls and do not increment publication/receive.
- Code inspection found host routing only: production runtime calls compiled component symbols and bridge functions, resolves physical actions from the current Go `View`, and rejects nonempty effect slices. Demo controls only request renderer changes/read snapshots/traces. Test-only JavaScript reducers are test doubles, not production application transitions.
- Raw browser captures still present at the author-declared paths match their recorded byte lengths and SHA-256 values. The author packet reports three fixed profiles (React, DOM, swap), each with 24 source events, 16 Go steps, and 17 checkpoints; captured page errors and failures are zero.

## Evidence boundary and limits

Both browser captures used prior compiled artifacts, before the separate UTF-8 producer repair. The strict literal checker was red for `Step −` being encoded as `Step â`. This review does not treat those captures as current producer or end-to-end acceptance. It also does not independently re-review the shared ABI validator implementation; this packet checks the host’s pinned integration boundary. The finite host claim remains one parent plus one child, the declared synchronous bridge profile, and the tested React/DOM renderers. It makes no claim of arbitrary module graphs, async effects, malicious-code isolation, or other browser/OS coverage.

## Reviewed identities

- Sealed E-HOST report: `89eb67ef239955163a4d49eb5d1fd18ea743b5980022b17284d74b8d91dbf3cb`
- Sealed E-HOST receipt: `0e12c8526461a6d8b646da87bb22303f216c04f3f5419ac03ac70e65e582ace3`
- Source inventory: `6a305d2bf90b65e50669930f99e5ef5fd72f2b083acdd065fea39e945ce54c44`
- Final contract: `ba6dbd37c15c83068216702f5c864af5e423d0871490a890a65052bd66710020`
- Final rulings: `15612273fa54d60ae92a0175231b369abb6bc9b1d521620f954fe5d0e48616a2`
- Acceptance: `2449f2eb33dea9b38d9f1151472b6c4a492b8be2b42f9bfc38e1e889d7d60ea8`

Reviewer commands, raw stdout/stderr, the assertion-red and observation witnesses, source pin verification, and prior browser capture metadata are indexed in `rawlogs/XR-HOST/index.json`.
