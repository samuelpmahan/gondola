# XR-T3 — host and refresh review

**Decision: accepted.** Source review found the host/runtime changes consistent with the design. The focused author report records 46/46 tests passing; I did not rerun those same suites.

## Review findings

- Keyed refresh calls `runtime.snapshot()`, validates and caches the new snapshot, updates the existing renderer, then queues effect draining. It does not call `init()` or replace the renderer. The new runtime snapshot method uses the same generation fence as `init()` and all other bridge calls.
- Multi-root and session-tree refreshes resolve only mounted records. Session-tree refresh also rejects re-entry while another tree operation is active. Refresh errors update lifecycle state and propagate to the composition host.
- Composition mutations schedule a microtask after a successful manager call. Propagation drains sorted, unique safe IDs, filters against the current tree before refreshing, and repeats until Go reports no more dirty sessions. Effects from refresh are covered by the subsequent tree-host `settled()` wait; changes from effect completions advance the mutation version and are propagated before settling completes.
- Disposed nodes are fenced before snapshot refresh. Rejected Go error frames do not schedule propagation. Refresh failures are recorded and surfaced through `settled()`; committed manager state is not rolled back. A `WeakMap` prevents two hosts from directly claiming the same manager object.
- Focus preservation follows the existing keyed renderer `update()` paths: the DOM renderer reuses keyed nodes and captures/restores logical selection; the React renderer captures selection, renders with stable keys, and restores it if the input remains enabled. Read-only refresh correctly leaves disabled controls ineligible for focus restoration.

## Independent probe

Added and ran `coordination/reviews/XR-T3-probe.mjs`, exercising a path beyond the author suite: dispatch queued an asynchronous save effect; its transport reply ran through `complete`, produced a second dirty refresh, and was awaited by `host.settled()`.

```sh
node typed-composition/coordination/reviews/XR-T3-probe.mjs
# passed: {"ok":true,"managerCalls":{"snapshots":5,"dispatch":1,"complete":1,"effects":4,"changes":4},"rendererUpdates":4,"saved":"saved by transport"}
```

## Verified and unverified

Verified by source inspection: refresh uses the existing renderer, runtime snapshots are generation-guarded, manager mutations schedule post-call propagation, effect completions are included in settling, disposed dirty IDs are fenced, manager reuse is blocked while directly owned, and renderer failures surface without state rollback. The independent probe verified one asynchronous completion-and-refresh cycle.

The author report records the focused Node tests as passing. This review did not rerun them. Actual browser focus/selection during composition refresh, the inherited `run-session-tree.sh` gate, and the full typed-composition browser/replay run remain unverified by this lane review.
