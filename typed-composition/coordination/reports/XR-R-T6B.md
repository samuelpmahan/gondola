# XR-R-T6B — independent review of process cleanup repair

## Decision

**Accepted.** The R-T6B changes address both findings from XR-R-T6: post-start
process errors no longer stand in for exit, and the browser smoke treats
unsuccessful HTTP-lab cleanup as a failure.

## Reviewed

Read the XR-R-T6 amendment, R-T6B report and receipt, and inspected
`http-lab-process.mjs`, `http-lab-process.test.mjs`, and `browser-smoke.mjs`.
I did not edit production files or rerun the author's lifecycle suite or
browser smoke.

## Findings

- A pre-spawn error records `spawn-error`; a post-spawn error is retained in
  `processErrors` and does not resolve the terminal-observation promise.
  Cleanup therefore continues through its SIGTERM wait and SIGKILL escalation
  until an actual `exit`/`close` observation or the second bounded timeout.
  The prior reviewer probe now returns
  `{"outcomeKind":"exit","killSignals":["SIGTERM","SIGKILL"]}`.
- False and thrown signal attempts are included in `killFailures`; missing
  terminal observation returns `timed-out` with `residual: true`. The smoke's
  `assertCleanHTTPProcessClose` rejects missing/nonterminal outcomes, residual
  processes, failed signal attempts, and post-spawn process errors.
- Browser shutdown and lab shutdown are nested in `finally`, so lab cleanup is
  still attempted if browser shutdown throws. A cleanup-only failure is thrown
  as an aggregate. If the operation already failed, that original error stays
  primary and receives cleanup diagnostics when extensible; otherwise those
  diagnostics are logged while the original error is rethrown.
- Readiness and cleanup waits are bounded. Settling readiness clears its
  timeout; each raced cleanup timer is cleared in `finally`; closing the
  `readline` interface stops its line handling. The child error listener stays
  active to retain later process diagnostics and avoid an unhandled error.

The author's report records 9/9 focused lifecycle tests and a real HTTP browser
smoke passing. Those results remain author-reported here; this review only
reran the bounded prior review probe. Neither this review nor R-T6B claims the
full inherited runner or seeded oracle passed.
