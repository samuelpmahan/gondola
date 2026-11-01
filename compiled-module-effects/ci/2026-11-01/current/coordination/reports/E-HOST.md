# E-HOST — compiled module effects runtime

**Worker:** N3  
**Outcome:** `mixed_change`  
**Repository base:** `f4c8f70199a8ca896c13e225a85901abe658d0de`

## Implementation

Added `compiled-module-effects/runtime/runtime.mjs`, which mounts the existing keyed parent and each separately compiled effect child through the existing compiled React bindings and registered renderer factories. The host validates the original parent/child ABI pair and the closed effect tuples before calling compiled roles. Go updates remain the source of child state, request IDs, pending state, reply state, and cancellation decisions; the host only routes declared messages, tracks token-to-transport correlations, and executes the admitted request/cancel descriptors.

Child removal invokes the compiled child `Update(unmount)` and records the complete before/after Go wrapper state before the renderer is torn down. If Go emits its declared cancel descriptor, the host retires that request correlation before calling `transport.cancel(token, correlation)`. The ordered ledger records the Go unmount transition, unmounted state, Go cancel, transport cancel, and renderer teardown. Retained callbacks for canceled, delivered, old-generation, or unmounted requests are rejected before another Go update.

Renderer epochs fence UI callbacks. Effect replies instead follow the child key/generation/request token and stay pending across backend replacement. Backend replacement stages callback objects with the candidate child instances before installing them, and later child remounts use the active backend's renderer factory. Queued starts begin after Go state and the rendered pending view are committed; a synchronous transport reply is queued until the request start returns and the Go dispatch unwinds.

Exported runtime helpers include `createDeferredModuleEffectTransport()` for deterministic manual completion and `createTimerModuleEffectTransport({delayMs})` for the demo. `snapshot()` contains current Go state, current view/DOM records, and pending correlations; `trace()` and `ledger()` expose ordered event/effect/lifecycle records without nesting the full trace into each snapshot.

## Verification

The host suite ran against E-BUILD-final's four independently compiled React/DOM parent and child artifacts and the artifact loader's ABI/effect admission. It used a synthetic memory renderer and FakeElement; this packet is host-unit evidence with real emitted Go modules. It does not claim that React or a real browser DOM was mounted. N6 owns the browser renderer smoke.

All six host tests passed under Node `v22.23.4`:

1. Healthy independently compiled parent and child mount and initialize.
2. Synchronous transport delivery observes committed pending Go state and rendered view, then accepts exactly one completion update.
3. Pending reply survives backend replacement; old UI callback is fenced; candidate renderer Add/Save callbacks work immediately; remove/remount uses the active backend and remains interactive.
4. Go unmount and declared cancellation precede renderer teardown; a cancel-time callback and old generation callbacks cannot mutate the remount.
5. Closed effect tuples and wrong reply correlations are rejected without a Go update.
6. Changed child ABI admission is rejected before mount.

Exact test command and TAP output are in `module-effects-coordination/rawlogs/E-HOST/runtime-node-test.log`. The build index SHA-256 is `70046a0e7f1070c3ec2ad2186e060137a77f2d8df02b5c23bb1760baf156c444`.

## Evidence boundary

The runtime unit suite covers actual compiled Go modules through a synthetic renderer. It does not exercise real React rendering, browser `HTMLElement.click()`, the timer transport, the full repository suite, or N4/N5 cross-run parity. N6 provides real browser/demo evidence; N4 and N5 own conformance and independent oracle checks. No Git mutation was made by N3.
