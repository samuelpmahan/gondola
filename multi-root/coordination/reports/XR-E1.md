# XR-E1 — Independent review of the Go session manager

**Decision: amend.** I reviewed `multisession/manager.go` and `multisession/manager_test.go` against `multi-root/DESIGN.md` and Task 1 of the implementation plan. The manager's session isolation, safe-integer allocation, copy behavior, and mutex protection otherwise look sound, but disposal can discard a queued cancellation.

## Finding: disposal loses cancellations already queued by a prior transition

`Dispose` collects cancellations only from rows whose `PendingID` is nonzero in the current snapshot, then removes the session. A cancel/remove/reset transition clears that ID and places a cancel command in the session outbox. If the request's start was already drained, but the cancel has not yet been drained through `Effects`, `Dispose` returns no command and permanently makes the queued cancellation unreachable. The transport can keep doing work for a disposed session.

Exact reproduction using the public manager API:

1. Create a session, add a row, edit it, and save it.
2. Call `Effects` once to deliver the `start` command to the transport.
3. Remove the row with `Step{Path: "2/0/6", Event: "click", Key: "row-1-remove"}`. This queues `cancel` and removes the row.
4. Call `Dispose` before calling `Effects` again.

Observed with Go 1.24:

```text
drained starts=[]asyncsave.Command{asyncsave.Command{Kind:"start", ID:0x1, Value:"draft"}}; dispose after pending row removal=[]asyncsave.Command{}
```

The same gap applies after a cancel or reset transition clears `PendingID` while the request's cancel command remains queued. This conflicts with the design's requirement that disposal return pending cancel commands before removing the session.

Suggested repair: have `Dispose` preserve queued cancel commands from the session outbox (in outbox order), add cancels for requests still pending in current row order, deduplicate IDs, then remove the session. Add regressions for remove/cancel/reset after draining the start but before draining the cancel. The existing queued-start test should continue to return a cancel for the current `PendingID` while discarding the undelivered start.

## Other reviewed behaviors

- The largest safe session ID can be allocated, and the following `Create` returns an exhaustion error without wrapping or reusing IDs.
- Same-numbered row/request IDs in separate sessions remain scoped: existing tests verify both sessions can allocate request 1 and complete/audit their own request 1.
- `Snapshot`, `Effects`, `Audit`, and `List` return independent mutable data in the tested fields. Existing mutation probes cover nested tree/binding data, messages, effects, audits, and IDs.
- Disposal of active requests emits cancellations in current row order. An additional probe reordered three pending rows and observed request cancellation order `[1, 3, 2]`, matching the current visible row order.
- All scoped operations route through `sessionLocked`, so both unknown and disposed IDs are rejected. Existing tests check all methods for an unknown ID and check snapshot/completion/disposal after teardown; the shared lookup also rejects the other scoped methods after teardown.
- Manager calls are guarded by one mutex. The race suite and an external 64-goroutine create/snapshot/effects/audit/dispose probe passed without a race report.

## Verification

Toolchain: Go `go1.24.0 linux/amd64`.

```sh
GOTOOLCHAIN=local /tmp/gondola-go/bin/go test -count=1 -race ./multisession
# ok; exit 0

GOTOOLCHAIN=local /tmp/gondola-go/bin/go vet ./multisession
# exit 0

GOTOOLCHAIN=local /tmp/gondola-go/bin/go run -race /tmp/multisession-review-probe.go
# reproduced the lost queued cancel; last safe ID allocated as 9007199254740991,
# next Create returned an exhaustion error; 64 concurrent lifecycle probes left 0 active sessions

GOTOOLCHAIN=local /tmp/gondola-go/bin/go run /tmp/multisession-review-order-probe.go
# active request IDs 1, 2, 3 were reordered as rows 1, 3, 2; Dispose returned cancels 1, 3, 2
```

The two `/tmp` probe programs were review-only and were not added to the repository. No E1 source or tests were edited.
