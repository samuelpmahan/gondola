# RP-E1 — Dispose preserves queued cancellation commands

## Result

Repaired Manager.Dispose in multisession. It now drains the addressed collection session's undelivered effect outbox, preserves queued cancel commands in their original effect order, then appends cancels for requests still pending in current row order. Cancellation IDs are deduplicated with first occurrence winning. Queued start commands are not returned; live requests are covered by the pending-row cancellation pass. The session is removed after this cancel list is assembled, preserving the API and unknown/disposed fencing.

Added direct regressions for remove, cancel, and reset transitions immediately followed by Dispose without Effects draining the cancel commands. Added a mixed transition case verifying queue order followed by visible pending-row order, plus a focused merge test with repeated queued IDs and overlap against a pending row to verify deduplication.

## Commands and results

- GOTOOLCHAIN=local /tmp/gondola-go/bin/go test ./multisession -run 'TestDispose(ReturnsQueued|CombinesQueued)' — expected red before the repair: remove, cancel, and reset each returned an empty cancel list; the combined case omitted previously queued cancels.
- /tmp/gondola-go/bin/gofmt -w multisession/manager.go multisession/manager_test.go — passed.
- GOTOOLCHAIN=local /tmp/gondola-go/bin/go test ./multisession — passed.
- GOTOOLCHAIN=local /tmp/gondola-go/bin/go test -race ./multisession — passed (ok, 1.014s).
- GOTOOLCHAIN=local /tmp/gondola-go/bin/go vet ./multisession — passed with no output.
- GOTOOLCHAIN=local /tmp/gondola-go/bin/go test -count=1 ./cmd/multi-root-wasm — passed.
- GOTOOLCHAIN=local GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/rp-e1-multi-root.wasm ./cmd/multi-root-wasm — passed.
- CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node cmd/multi-root-wasm/smoke.mjs /tmp/rp-e1-multi-root.wasm /tmp/gondola-go/lib/wasm/wasm_exec.js — passed; 3 sessions were created, the pending cancellation and sibling completion worked, and disposed late replies were rejected.

## Limits

The regression tests exercise queued cancellation commands through remove, cancel, and reset and verify the mixed order/dedup rules. The browser bridge smoke exercises its existing pending-request disposal path; it does not add a browser action sequence for the three undrained-cancel variants because the manager package tests cover those exact transitions.
