# XR-RP-RP-E1 — Recheck of queued-cancel disposal repair

**Decision: accepted.** I independently rechecked the RP-E1 changes in `multisession/manager.go` and `multisession/manager_test.go`. `Dispose` now drains the session's undelivered effect outbox, retains queued cancel commands in effect order, appends cancellations for requests still pending in current row order, deduplicates by request ID, then removes the session.

## Reproduction and order checks

The exact remove, cancel, and reset-before-dispose regressions all pass:

- `TestDisposeReturnsQueuedCancelAfterRemoveBeforeDispose`
- `TestDisposeReturnsQueuedCancelAfterCancelBeforeDispose`
- `TestDisposeReturnsQueuedResetCancelsBeforeDispose`

An external public-API probe repeated the earlier removal case: after draining `start` ID 1, it removed the pending row and disposed before another `Effects` call. Disposal now returns `cancel` ID 1 instead of an empty slice.

Queue and pending-row order plus deduplication are covered by `TestDisposeCombinesQueuedAndPendingCancelsInOrderWithoutDuplicates` and `TestDisposeCancelCollectionDeduplicatesAndPreservesFirstOccurrenceOrder`. The combined case returns queued cancels `[2, 1, 4]` in effect order, then still-pending row cancels `[3, 5]`, with no duplicate IDs. A separate three-row reorder probe observed pending cancellation order `[1, 3, 2]`, matching the current row order.

## Concurrent and browser checks

The race suite passed. A 64-goroutine probe concurrently created sessions and called snapshot, effects, audit, and dispose; it completed without a race report and left no active sessions.

The real multi-root bridge Chromium smoke created three simultaneous Go/WASM sessions, gave each request ID 1, disposed one session, completed its sibling, and rejected the disposed session's late reply. The GoDOM smoke passed with two simultaneous real GoDOM handles. A combined Chromium probe also mounted three real manager sessions and two GoDOM handles, triggered a queued cancel followed immediately by disposal, verified only that session's transport was canceled, delivered late callbacks for the disposed generation without a Go `Complete`, and completed the sibling request.

## Commands and results

Toolchain: Go `go1.24.0 linux/amd64`, Node `v22.23.4`, Chromium `153.0.8010.0`.

```sh
GOTOOLCHAIN=local /tmp/gondola-go/bin/go test -count=1 ./multisession -run 'TestDispose(ReturnsQueued|CombinesQueued|CancelCollection)'
# passed

GOTOOLCHAIN=local /tmp/gondola-go/bin/go test -count=1 -race ./multisession
# passed: ok, 1.015s

GOTOOLCHAIN=local /tmp/gondola-go/bin/go vet ./multisession
# passed with no output

GOTOOLCHAIN=local /tmp/gondola-go/bin/go test -count=1 ./cmd/multi-root-wasm
# passed

GOTOOLCHAIN=local GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/ia3-multi-root.wasm ./cmd/multi-root-wasm
# passed

GOTOOLCHAIN=local GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/ia3-godom.wasm ./cmd/godom-wasm
# passed

cp "$(GOTOOLCHAIN=local /tmp/gondola-go/bin/go env GOROOT)/lib/wasm/wasm_exec.js" /tmp/ia3-wasm_exec.js
# passed

GOTOOLCHAIN=local /tmp/gondola-go/bin/go run -race /tmp/multisession-review-probe.go
# queued removal cancel returned; last safe SessionID allocated, following Create exhausted cleanly;
# 64 concurrent lifecycle calls left 0 active sessions

GOTOOLCHAIN=local /tmp/gondola-go/bin/go run /tmp/multisession-review-order-probe.go
# passed: reordered pending request IDs 1, 3, 2 were canceled in that order

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node cmd/multi-root-wasm/smoke.mjs /tmp/ia3-multi-root.wasm /tmp/ia3-wasm_exec.js
# passed: sessions [1,2,3], shared local request IDs [1,1,1], disposal cancel, sibling completion, late replies rejected

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node cmd/godom-wasm/smoke.mjs /tmp/ia3-godom.wasm keyed-editor/build/keyed-collection.wasm /tmp/ia3-wasm_exec.js
# passed: two simultaneous handles, focus restoration, independent failure fences, idempotent unmount, root reuse

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node /tmp/ia3-browser-runner.mjs
# passed: three Go sessions, two GoDOM handles, queued Dispose cancel, sibling completion, two stale callback drops, root reuse
```

The `/tmp` probes and build outputs were not added to the repository. No source edits were made during this review.
