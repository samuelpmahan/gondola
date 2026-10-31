# E-CI-RUNTIME source audit (interim)

## Published source pin

Audited the fresh acceptance worktree at commit `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`, tree `bc8883df935c7d0c8b7265831cacdf5521fb70d2`. Runtime SHA-256 is `dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4`; runtime tests are `39790809f3392bb47b3f48d17bfdc40b6fe8628961513f0b1ddf3e69a014e907`. These match the published R-OBSERVATION frozen source hashes. CONTRACT and PLAN hashes are `7a221afaf0455ff6060b2634dde7660899c5c8abb40cea0de8874f31f583075b` and `e91bc98abaf2aea117de2aedf88f332eab484f43336a914d2952d9d8505a4756`.

## Prior-review closure checked

- XR--RUNTIME recorded the initial `restoreFocus(undefined)` false-success and rejected update-Promise leak. R-RUNTIME then added focus-result validation and a native Promise rejection sink; XR-R-RUNTIME accepted that repair at runtime/test hashes `e729e3b360892edf01511b64657d32f638db54b5f5b0d2767b980114bb6d3105` / `3ddaaded2db26d7b2acf9bcbd8e85584f1f4b57e1e89b325a602aff5dab39fcc`.
- XR-R-CONTRACT found the same rejected-Promise leak in post-commit `viewRecord()` and `domSnapshot()` observation. R-OBSERVATION adds `noThenable` before both record-shape validations and checks active runtime `unmount()` before reporting success. The published 27-test suite includes these regressions.

## Bounded source observations

`replaceRenderer()` validates renderer/focus protocol and declared async methods before teardown, commits the cached raw Go view, does not call application `Update` or create an application tick as part of swapping, and records replacement diagnostics separately. A valid completion admitted during a swap stays held for a post-return microtask; the code cancels held completion delivery on unmount/failure. Renderer callbacks carry a lease, so callbacks from retired renderer generations are fenced. After teardown, returned thenables and replacement/observation failures halt the runtime without a rollback claim. Active runtime unmount returns false and reports failure when a renderer unmount result is asynchronous; it does not equate invocation with successful physical teardown.

No scoped runtime source blocker was found in this bounded review. This source inspection does not establish browser-level physical root cleanup, cross-backend focus restoration, full fixture conformance, or the CI job result. Those require the fresh immutable CI artifacts and are intentionally not inferred from prior reviews or local checks.

## Independent current-source checks (not CI evidence)

Node toolchain: `v22.23.4` (recorded in `node-version.txt`).

| Command | Result | Evidence |
|---|---|---|
| `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/runtime/runtime.test.mjs` | 27 passed, 0 failed | `local-runtime-node22.log`, SHA-256 `20af8264fb835eb0036bd5a74330805d194eef59d58065a3f899e6345d04c553` |
| `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --test compiled-backends/evidence/semantic/swap-semantics.test.mjs` | 9 passed, 0 failed | `local-semantics-node22.log`, SHA-256 `1fdd5f97100769d4c2dbc751d1d192c4ad4edcea98fd52003dc433235e0686b2` |
| `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --check compiled-frontend/frontend/runtime/runtime.mjs` | Exit 0 | `local-runtime-syntax.log`, SHA-256 `db12ad97221988bf346c55d06788e21a01bb6a683d69266bf732ed4d6d9763c8` |
| `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --check compiled-frontend/frontend/runtime/runtime.test.mjs` | Exit 0 | `local-test-syntax.log`, SHA-256 `db12ad97221988bf346c55d06788e21a01bb6a683d69266bf732ed4d6d9763c8` |

The runtime tests emitted Node's existing experimental `UNDICI-EHPA` warning. The local checks are advisory evidence for this review only. Final outcome remains pending the actual CI test log, count, source pin, and outcome provided by root; no CI pass/fail is asserted here.
