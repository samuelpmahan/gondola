# E-HOST: Host and renderer capability admission

## Change

Added a separate host-effect profile and renderer view profile to the compiled frontend runtime.

- `mountCompiledApp({ hostCapabilities })` accepts a dense, unique array of known host-effect capabilities. If omitted, it uses the legacy `effect.request-reply` profile. A component that declares `effect.cancel` is rejected before `Init` unless the host explicitly supplies both of its declared effect requirements.
- The runtime recognizes `effect.cancel` in AppIR. An emitted `lifecycle.cancel` passes only when both the component declares `effect.cancel` and the explicit host profile includes it; this check runs before `effectPolicy`. Thus an optional policy cannot grant cancellation support by itself.
- Renderer adapters declare `viewCapabilities`, limited to `view.node`, `binding.value`, and `binding.checked`. The React and DOM adapters publish frozen arrays containing all three. Explicit renderer profiles are checked at initial mount and replacement. Profile-less renderers retain the legacy path only for components without `effect.cancel`; an effect-cancel component requires an explicit renderer profile.
- Mount and replacement profiles are read through own data-property descriptors and copied by value. Sparse, duplicate, unsupported, or accessor-backed declarations fail closed. Candidate replacement checks run before lease transition, focus capture, or old-renderer unmount. Rejected candidates throw `TypeError`, record an admission rejection, and preserve the old renderer, state, view, DOM, pending effects, and callbacks.
- During candidate admission, the runtime blocks state-changing reentry without retiring the active lease. The lifecycle effect driver checks the read-only `isAdmittingRendererCandidate()` query before delivery or retirement; a paused `deliver()` returns a retryable result without consuming the callback. `forceDeliverRetired()` and `retireAll()` also leave callbacks intact during that window.
- The capability arrays are declarations by trusted adapters and hosts; admission verifies those declarations and does not prove that an arbitrary custom backend implements them correctly.

## Evidence

All captured green runs used Node `v22.23.4`.

| Check | Result | Captured output |
|---|---:|---|
| `node --test compiled-frontend/frontend/runtime/runtime.test.mjs compiled-frontend/frontend/react/bindings.test.mjs` | 40 passed | [`E-HOST-green-runtime.log`](../logs/E-HOST-green-runtime.log) |
| `CHROMIUM_PATH=/tmp/chromium node --test compiled-frontend/frontend/dom/renderer.test.mjs compiled-frontend/frontend/react/renderer.test.mjs` | 26 passed | [`E-HOST-green-renderers.log`](../logs/E-HOST-green-renderers.log) |
| `GOBI_LIFECYCLE_APP_DIR=compiled-capabilities/builds/feasibility/react/output/apps/lifecycle-7e6575d90707 node --test compiled-lifecycle/runtime/runtime.test.mjs` | 12 passed | [`E-HOST-green-lifecycle.log`](../logs/E-HOST-green-lifecycle.log) |
| Node `--check` on the changed runtime, adapter, bindings, and test modules | passed | Commands recorded in the receipt |
| Independent literal capability oracle | 8 passed | Recorded by E-ORACLE in its receipt |

### Red-to-green evidence

The new admission and cancellation tests were run against the base runtime from `HEAD` before implementation. The baseline run failed 5/5 selected runtime cases and 1/1 binding case, as expected: the base runtime rejected the new AppIR capability as unknown, ignored the mount host profile, let `effectPolicy` accept cancellation without a component declaration, and had no renderer profile admission. Raw TAP is in [`E-HOST-red-runtime.log`](../logs/E-HOST-red-runtime.log) and [`E-HOST-red-bindings.log`](../logs/E-HOST-red-bindings.log).

During implementation, a full runtime pass also caught two temporary regressions: candidate method access occurred before a reentrancy guard, and snapshotting the active unmount method broke a test that replaces that method at runtime. Both were fixed. The initial tool output for that intermediate pass was not tee'd to a file; the final captured runtime suite above passes 40/40. The reentrancy regression is now covered by the candidate-profile Proxy trap test, which asserts no state mutation or renderer retirement and confirms the old callback remains usable afterward.

Two early invocations also lacked their required test environment: DOM tests first ran without `CHROMIUM_PATH` and could not launch Playwright's browser; lifecycle tests first ran without `GOBI_LIFECYCLE_APP_DIR`. These were environment setup failures, not source failures. The runs above passed after setting `/tmp/chromium` and the freshly generated lifecycle fixture directory. The first failed invocations were not separately captured.

## Scope and status

Modified the compiled frontend runtime, React and DOM renderer declarations, React binding capability validation, lifecycle runtime, focused tests, and E-HOST evidence files. No Git commit, merge, or deployment was performed. The root full-run remains the integration gate; native/browser build acceptance is not claimed here.
