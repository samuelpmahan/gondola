# R-T3 — reserve the session-tree host during refresh

## Result

**Outcome: mixed_change.** Reproduced and fixed synchronous structural reentry from a custom renderer update during session-tree refresh. Refresh now reserves the session-tree operation slot until the underlying renderer refresh returns or throws.

## Reproduction

Added a regression to the existing fake session-tree host fixture. Its current renderer's update path calls the public host's dispose, replace, and refresh methods synchronously while the outer refresh is painting.

Before the source fix, the targeted test failed with manager.calls.disposeTree equal to [1]. The nested disposal committed during the renderer update, and the outer refresh then failed because the keyed host had been disposed. This confirms the root hypothesis: refresh asserted that the host was idle but did not reserve the operation slot.

## Change

The session-tree refresh path now sets operation to {kind: "refresh", node} immediately before calling the flat host and clears it in finally. Existing assertIdle checks therefore reject nested dispose, replace, refresh, and mount operations before they can mutate Go or host lifecycle state. The regression verifies all three requested nested operations are rejected, Go disposal is not called, the live session remains mounted, and the outer refresh updates the existing renderer successfully.

Only session-tree/host.mjs, session-tree/host.test.mjs, and this task's report/receipt were changed.

## Verification

- Before fix: node --test --test-name-pattern='refresh reserves structural host operations' session-tree/host.test.mjs reproduced the bug; nested DisposeTree call was [1].
- After fix: the same targeted regression passed.
- After fix: node --test session-tree/host.test.mjs passed 13/13.

The full browser/native replay and inherited runner were not run by this bounded repair lane.
