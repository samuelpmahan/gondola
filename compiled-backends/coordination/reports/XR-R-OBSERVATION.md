# XR-R-OBSERVATION (N2 independent review of current runtime)

**Decision: accepted for the bounded renderer-observation and final-unmount behaviors reviewed here.** The current runtime applies synchronous-return checks to `viewRecord()` and `domSnapshot()`, sinks rejected native Promise returns without reading an overridden `.then`, reports the expected replacement phase, and fails final unmount without returning success. Fresh runtime tests and syntax checks pass against the reviewed source pins.

## Operation inventory

| Renderer operation | Check and failure path | Evidence |
|---|---|---|
| `update(view)` | `noThenable` runs in `renderView`; replacement changes phase to `new-commit` before invoking it. A returned thenable after teardown fails closed as `RuntimeFailure("renderer-replacement")`. | Existing tests cover returned thenable and rejected native Promise; independent probe records phase `new-commit`. |
| `viewRecord()` | `viewSnapshot` calls the method with the renderer receiver, checks for a thenable, then validates exact `{tree,bindings}` shape. The same helper serves initial/update observations, runtime snapshots/traces, and replacement post-commit observation. | Replacement test injects a rejected native Promise; probe records `new-snapshot` and no unhandled rejection. |
| `domSnapshot()` | `domSnapshot` uses the renderer receiver, checks for a thenable, and validates `outerHTML-v1`, string HTML, controls array, and each control record. | Replacement test injects a rejected native Promise; probe records `new-snapshot` and no unhandled rejection. |
| Old renderer `unmount()` during replacement | The call is guarded after phase becomes `old-unmount`. A thenable fails the replacement; the old renderer is not claimed unmounted unless the synchronous call returned normally. | Independent probe records failed phase `old-unmount`, `oldUnmounted:false`, and no unhandled rejection. |
| `focusState()` / `restoreFocus(state)` | The direct declared async methods are rejected by the preflight loop before teardown. Returned thenables are checked at invocation; focus capture is pre-teardown, restoration is post-commit at `focus-restore`. | Runtime tests cover direct async `update`, malformed capture, and invalid restore results; probe records Promise capture rejected before teardown and Promise restore failing at `focus-restore`. |
| Final runtime `unmount()` | `performUnmount` marks the runtime disposed and callback lease unmounted, cancels held completions, then checks the renderer result. A thrown or thenable result records failure stage `unmount` and returns `false`; no physical-empty-root claim is made on failure. | Runtime test and probe cover a rejected native Promise: false return, `isUnmounted() === true`, failure stage `unmount`, retained mock view, and no unhandled rejection. |

`noThenable` first uses captured `Promise.prototype.then` as a native Promise brand check and attaches a rejection handler before throwing the synchronous-protocol error. The rejected-Promise regression installs an own `.then` getter that would reenter dispatch/replacement; the intrinsic path does not invoke it, and no unhandled rejection or application tick follows. Non-Promise thenables are rejected without invoking their `then` function. This is evidence for the concrete trusted renderer return cases above; it is not a security claim for arbitrary Proxies, accessors, or custom Promise species.

## Verification

Reviewed source fingerprints: runtime `dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4`; runtime tests `39790809f3392bb47b3f48d17bfdc40b6fe8628961513f0b1ddf3e69a014e907`.

| Command | Result |
|---|---|
| `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-frontend/frontend/runtime/runtime.test.mjs` | **27 passed, 0 failed**, Node `v22.23.4` |
| `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check compiled-frontend/frontend/runtime/runtime.mjs` | Exit 0 |
| `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --check compiled-frontend/frontend/runtime/runtime.test.mjs` | Exit 0 |
| `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node compiled-backends/evidence/reviews/xr-r-observation/operation-phase-probe.mjs` | Expected phases for rejected Promise returns across update, old unmount, viewRecord, domSnapshot, restoreFocus, focusState, and final unmount; `unhandledRejections: []` |

The independent probe, its captured JSON output, and command logs are in [the review evidence directory](../../evidence/reviews/xr-r-observation/). Node emitted a non-failing experimental `[UNDICI-EHPA]` `EnvHttpProxyAgent` warning. The earlier R-RUNTIME report/receipt pin a prior source version (runtime `e729e3b…`, tests `3ddaaded…`); this review applies to the current source hashes above and the 27-test suite.

## Limits

- The focused suite and phase probe do not replace N3's integrated four-app/five-fixture browser matrix, which remains a separate active integration gate.
- Direct async-function preflight is implemented across every required operation and optional focus method; the focused admission test uses an `async update` method. A regular method that returns a thenable is necessarily detected when invoked and follows the phase-specific fail-closed path.
- No production sources, tests, runtime contracts, app code, dependencies, lockfiles, or Git state were changed during this review.
