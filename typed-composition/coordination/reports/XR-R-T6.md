# XR-R-T6 — independent review of the R-T6 process cleanup correction

## Decision

**Amend.** The demo copy and the original readiness/exit race correction are sound, but the cleanup path can report failure without making the browser smoke fail, and an asynchronous `ChildProcess` error can prematurely end cleanup while the process remains alive.

## Reviewed

Read the XR-T6 amendment and R-T6 report, inspected the current `http-lab-process.mjs`, `http-lab-process.test.mjs`, `browser-smoke.mjs`, and `demo.html`, and compared the R-T6 review diff. I did not rerun the author's five lifecycle tests or the browser smoke.

## Findings

- **Cleanup failures are discarded by the browser smoke.** `close()` returns `{kind: "kill-error"}` when a kill call throws and `{kind: "timed-out"}` if no exit arrives after SIGTERM and SIGKILL. `browser-smoke.mjs` awaits `lab.close()` in `finally` but ignores the returned result. A smoke that otherwise passed can therefore exit successfully without confirming that the HTTP lab stopped.
- **Any child `error` is treated as process exit.** The helper's `error` listener always sets `spawnError` and resolves the exit promise with `{kind: "error"}`. A `ChildProcess` can emit `error` for a failed `kill()` as well as a failed spawn. If that happens after readiness while the lab is still running, `close()`'s wait resolves from the error event and returns immediately without attempting SIGKILL. The browser smoke then discards that error result too.

A bounded review-only probe at `coordination/reviews/xr_r_t6_kill_error_probe.mjs` models a live child whose SIGTERM attempt emits an asynchronous `EPERM` error and whose SIGKILL would exit it. It produced `{"outcomeKind":"error","killSignals":["SIGTERM"]}`: the process was not observed exiting and SIGKILL was never attempted. This probe is distinct from the author's five tests and exercises the error-after-readiness condition.

## Verified correction

- The helper registers `exit` and `error` listeners synchronously after spawn, before readiness can settle, and checks already-populated exit state. Early exit rejects readiness and remains available to `close()`; a spawn error rejects readiness and makes cleanup return without waiting for a nonexistent process.
- Normal cleanup has two bounded waits and sends SIGTERM before SIGKILL.
- Demo text now correctly says the child view displays its parent's supplied title while the parent view displays its Published count.

## Requested repair

Distinguish spawn failure from post-spawn process errors. A post-readiness `error` must not resolve the exit wait as though the child exited; cleanup should continue to the SIGKILL/real-exit bound and preserve the error. Also make `close()` failure observable to its caller, either by rejecting on kill failure/timeout or by having `browser-smoke.mjs` inspect and fail on unsuccessful cleanup results. Preserve the nested `finally` so cleanup is still attempted when browser shutdown or readiness fails.

No production source was edited. The R-T6 author's focused test and browser-smoke results remain author-reported; this review does not claim those tests were rerun or that the full inherited runner passed.
