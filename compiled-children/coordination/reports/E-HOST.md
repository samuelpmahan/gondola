# E-HOST: Compiled children host driver

## Change

Added [`runtime.mjs`](../../runtime/runtime.mjs) and focused host tests in [`runtime.test.mjs`](../../runtime/runtime.test.mjs). The wrapper reuses `mountCompiledApp` and its explicit request-reply/cancel capabilities. `compiled-frontend/frontend/runtime/runtime.mjs` was not changed.

The closed policy accepts only:

- `fixture.request / lookup / <token> / complete`
- `lifecycle.cancel / cancel / <token> / empty reply`

Parent tokens use `parent:g<generation>:r<requestSeq>`. Child tokens use `child:<key>:g<generation>:r<requestSeq>`, with keys matching `[a-z][a-z0-9_-]{0,15}`. Generation and request sequence values are canonical positive decimal integers no greater than `Number.MAX_SAFE_INTEGER`.

The driver stores effect tokens, correlations, and delivery callbacks. It does not store child order, identity, liveness, or any other collection state. `effects.deliver(token)` sends the original correlation with `Message{Name:"complete", Arg:token}`. Go-emitted cancellation maps the token to its original correlation and calls the shared runtime's `cancelEffect`. Delivery pauses with a retryable result during renderer candidate admission. Unmount retires pending correlations.

`mountCompiledChildrenApp({ module, componentId?, appId?, encoder, renderer, onTick?, onFailure? })` returns `{ runtime, effects }`. The runtime is the shared compiled mount surface, including `snapshot()`, `trace()`, `dispatch()`, `complete()`, `replaceRenderer()`, and `unmount()`. The effects object exposes `pending()`, `records()`, and `deliver(token)`.

## Verification

All runs used Node `v22.23.4`.

| Command | Result | Evidence |
|---|---:|---|
| `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/runtime/runtime.test.mjs` before implementation | Expected red: 5/5 failed because the host API was absent | [`E-HOST-red-runtime.log`](../rawlogs/E-HOST-red-runtime.log) |
| Correction replay with the two initial incorrect assertions | 4 passed, 2 failed on test expectations | [`E-HOST-correction-replay.log`](../rawlogs/E-HOST-correction-replay.log) |
| `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/runtime/runtime.test.mjs compiled-frontend/frontend/runtime/runtime.test.mjs` | 42 passed, 0 failed (6 host tests and 36 inherited shared-runtime tests) | [`E-HOST-green-all-runtime.log`](../rawlogs/E-HOST-green-all-runtime.log) |
| Node `--check` on the host runtime and test, plus `git diff --check -- compiled-children/runtime` | Passed | [`E-HOST-green-static.log`](../rawlogs/E-HOST-green-static.log) |

The two correction-replay failures came from test assumptions, not host behavior: the shared runtime's completion result does not expose a `completedEffects` array, and a candidate renderer declaring `view.node` is compatible with the component. The assertions were changed to inspect the host's completion record and to use a candidate missing required `view.node` support. The final combined run passes.

The focused host suite uses a synthetic compiled-ABI module to isolate wrapper behavior. It verifies token validation, deterministic delivery/cancellation, correlation retention across compatible swaps, rejection preservation for incompatible swaps, retired callback fencing, retryable delivery during candidate admission, and unmount retirement. Actual Go fixture behavior and React/DOM/native parity remain the N4 and root integration gates; this report does not claim them.

## Scope and status

Only the compiled-children runtime and its E-HOST report, receipt, and raw logs were changed. The existing shared runtime and lifecycle wrapper remain untouched. No Git commit, merge, or deployment was performed.
