# XR-HOST: Independent host and renderer admission review

## Decision

**Accepted for the assigned N2 host/runtime scope.** I found no implementation defect in the reviewed capability admission, cancellation gating, renderer replacement preflight, or lifecycle delivery preservation. The source and authored E-HOST report/receipt match the frozen `compiled-capabilities/PLAN.md` contract. This review does not certify the pending full native/browser integration chain.

## Review findings

- `mountCompiledApp` reads `hostCapabilities` as an own data property, defaults to the legacy request/reply capability, validates explicit arrays as dense, unique, known host-effect capabilities, and checks component requirements before calling `Init` or rendering. Renderer `viewCapabilities` is independently validated before `Init`; it accepts only view/binding capabilities. A component requiring `effect.cancel` must have explicit host cancellation support and an explicit renderer profile.
- Cancellation effects require both the component declaration and host support before `effectPolicy` runs. The cancellation policy test confirms a fully declared cancellation still fails when the policy rejects it; a separate test confirms policy cannot grant cancellation to an undeclared component.
- React and DOM adapters expose frozen `view.node`, `binding.value`, and `binding.checked` declarations. These view capabilities remain separate from host effect support.
- Candidate replacement sets the admission guard before inspecting candidate properties. Own profile and renderer method lookup uses property descriptors; accessors are not invoked, methods are resolved through descriptors along the prototype chain, and async methods fail preflight. The old lease is not transitioned until all candidate and current-renderer methods have passed admission. During that interval, dispatch, stale-action recording, cancellation, unmount, completion, and nested replacement are guarded. Admission rejection records a diagnostic and leaves the old lease active.
- The lifecycle driver checks admission before consuming normal or retired callbacks. It reports retryable delivery during admission, restores callback/status when runtime completion is retryable, and refuses `retireAll` without closing or releasing callbacks. The focused tests cover pending delivery and retired-callback retry.
- I independently exercised malformed profiles against the actual runtime: sparse, unknown, duplicate, extra-key, and accessor-item profiles reject before `Init`; malformed replacement profiles preserve the old renderer and trace; accessor getters remain uncalled. The script and output are in `logs/profile-probes.mjs` and `logs/profile-probes.log`.
- The candidate Proxy test now attempts dispatch and nested replacement from the profile descriptor trap. Both are blocked, the old renderer remains active, and its callback succeeds after rejection. The E-HOST report accurately says the original intermediate failure output was not captured; I did not claim otherwise.

## Fresh verification

All commands ran from the repository root with Node `v22.23.4`; renderer tests used Chromium `153.0.8010.0`.

| Command | Result | Review log |
|---|---:|---|
| `set -o pipefail\n/tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/runtime/runtime.test.mjs compiled-frontend/frontend/react/bindings.test.mjs 2>&1 \| tee compiled-capabilities/coordination/reviews/XR-HOST/logs/runtime-bindings.log` | 40 passed, 0 failed | `logs/runtime-bindings.log` |
| `set -o pipefail\nCHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/dom/renderer.test.mjs compiled-frontend/frontend/react/renderer.test.mjs 2>&1 \| tee compiled-capabilities/coordination/reviews/XR-HOST/logs/renderers.log` | 26 passed, 0 failed | `logs/renderers.log` |
| `set -o pipefail\nGOBI_LIFECYCLE_APP_DIR=/workspace/scratch/39a56936f173/gondola-capabilities/compiled-capabilities/builds/feasibility/react/output/apps/lifecycle-7e6575d90707 /tmp/gondola-node22/node_modules/node/bin/node --test compiled-lifecycle/runtime/runtime.test.mjs 2>&1 \| tee compiled-capabilities/coordination/reviews/XR-HOST/logs/lifecycle.log` | 12 passed, 0 failed | `logs/lifecycle.log` |
| `set -o pipefail\n/tmp/gondola-node22/node_modules/node/bin/node --test compiled-capabilities/oracle/literal-oracle.test.mjs 2>&1 \| tee compiled-capabilities/coordination/reviews/XR-HOST/logs/oracle.log` | 8 passed, 0 failed | `logs/oracle.log` |
| `/tmp/gondola-node22/node_modules/node/bin/node compiled-capabilities/coordination/reviews/XR-HOST/logs/profile-probes.mjs` | All 10 malformed-profile probes passed | `logs/profile-probes.log` |
| Node `--check` on the eight changed runtime, renderer, binding, and test modules listed in the receipt | Passed | Output returned only environment warnings; exit status 0 |

The initial parallel test invocation returned output larger than the tool display limit. I read each complete TAP summary from the review-owned tee logs before recording the counts. No test failure was captured by this review. The independent literal oracle is synthetic; actual React/DOM behavior remains covered by the renderer suites and the separate N3 integration lane.

## Pins

The receipt contains SHA-256 pins for all eight reviewed N2 source files, the frozen plan, authored E-HOST report/receipt, each fresh TAP log, and the standalone malformed-profile probe. No production files or Git state were changed for this review.
