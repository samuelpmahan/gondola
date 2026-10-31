# XR--RUNTIME

**Decision: amend.** I independently reviewed N1's renderer replacement implementation against `compiled-backends/CONTRACT.md` and reran its focused runtime suite. The main lifecycle invariants pass: swap does not call Init/Update/View or append a tick; a completion accepted during replacement stays pending at synchronous return, is duplicate-fenced, and drains afterward; unmount cancels the held completion; retired callbacks are out-of-band; the current renderer's post-unmount callback produces the existing suppressed tick; declared async methods reject before teardown; and a returned thenable after teardown fails the runtime without claiming rollback.

Two protocol edges need repair before acceptance.

## Findings

### 1. `restoreFocus()` can report success without restoring focus

At `compiled-frontend/frontend/runtime/runtime.mjs:1029-1034`, the runtime treats every non-thenable result other than literal `false` as successful restoration. A renderer returning `undefined` therefore commits the swap and records `focusRestored: true`, even though the protocol requires `restoreFocus` to report whether it could restore. The independent probe supplied a valid captured focus record and an `undefined` result; replacement returned successfully and diagnostics marked focus restored.

Require a boolean result and fail closed on malformed values. Also validate that `focusState()` returns either `null` or the documented focus record so absence and malformed capture are not conflated.

### 2. A rejected returned Promise becomes unhandled after the runtime fails closed

At `compiled-frontend/frontend/runtime/runtime.mjs:414-418`, `noThenable` detects `.then` and throws, but leaves a native Promise's rejection unobserved. The independent probe returned `Promise.reject(new Error("late renderer rejection"))` from `nextRenderer.update()`. `replaceRenderer()` correctly threw `RuntimeFailure` with stage `renderer-replacement`, and snapshots became unavailable, but Node also emitted `unhandledRejection: "late renderer rejection"` on the next turn.

Keep the synchronous post-teardown failure semantics while ensuring a rejected renderer Promise does not escape as a second process-level failure. This probe uses a native Promise and does not rely on a hostile Proxy or accessor.

## Evidence

The authored runtime suite passes **23/23** on Node `v22.23.4`. It covers the no-application-work swap, renderer leases, stale callback fencing, focus transfer, admission failures, thenable failure, held effect reply ordering, duplicate delivery, and unmount cancellation. The test suite did not cover the two malformed return values above.

The focused real-browser integration remains pending N3; this review does not claim that React-to-DOM swaps or physical cross-backend selection restoration pass in Chromium. No production files were modified in this review.

## Reviewed sources

| Source | SHA-256 |
| --- | --- |
| `compiled-frontend/frontend/runtime/runtime.mjs` | `a35338302fc391499575fe7d3c7c59c41a3eeaddce23a3039f0a13d84ac94ae2` |
| `compiled-frontend/frontend/runtime/runtime.test.mjs` | `f2fb585601675f60a2994b91b4c8feb4dd77507668bef27ff6e37200ad4c381d` |

## Review evidence

- Focused test log: `compiled-backends/evidence/reviews/xr-runtime/runtime-tests.log` (23 passed, 0 failed).
- Independent failure probe: `compiled-backends/evidence/reviews/xr-runtime/replacement-failure-probe.mjs` and `.json`.
- The probe also preserves the non-failing Node `UNDICI-EHPA` experimental `EnvHttpProxyAgent` warning from the test environment.
