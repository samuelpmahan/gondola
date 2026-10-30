# XR-E1 — independent review of the Go producer

**Scope:** `collection/**` and `cmd/collection-wasm/**` against the producer contract in `keyed-editor/PLAN.md` and E1's report. I did not author E1. No production source or Git state was changed.

## Findings

No reproducible producer defect found in the reviewed scope.

The review checked that `RowID` and `RequestID` are separate named Go types; both counters remain monotonic across reset and deletion; the four-row cap is reflected in the view and enforced in the transition; dispatch checks the current node key before disabled suppression and handler resolution; request-to-row history survives removal/reset; completions retain stale audit records without changing live rows; snapshot, effect, and audit APIs return owned data; and request-ID exhaustion is checked before cancellation or state/message/outbox changes.

The bridge review covered exact method arity, required primitive fields, extra/missing fields, safe integer boundaries, thrown getters and proxies, HTTP codec arguments, and atomic state/outbox/audit behavior for rejected inputs. A separate real-WASM scenario removed rows 1 and 2 while requests 1 and 2 were pending, then allocated rows through 6 and saved row 6 as request 3. Completion 3 was accepted for row 6; late completions 1 and 2 remained stale and retained their original row IDs in audit. The scenario also checked disabled Add at capacity, stale key rejection before disabled suppression, copied snapshot/effect/audit values, and rejection when a removed row's path was reused by a different key.

## Verification

Commands ran from `/workspace/scratch/39a56936f173/gondola`:

```text
/tmp/gondola-go/bin/go test ./collection ./cmd/collection-wasm
PASS

/tmp/gondola-go/bin/go test ./...
PASS

GOTOOLCHAIN=local GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build -o /tmp/xr-e1-keyed-collection.wasm ./cmd/collection-wasm
PASS

/tmp/gondola-node22/node_modules/node/bin/node cmd/collection-wasm/smoke.mjs /tmp/xr-e1-keyed-collection.wasm /tmp/xr-e1-wasm_exec.js
collection-wasm bridge smoke passed

/tmp/gondola-node22/node_modules/node/bin/node /tmp/xr_e1_negative.mjs
XR-E1 real-WASM negative probe passed: strict errors atomic; RowID 6 / RequestID 3 correlation and stale audit; copies; cap; path reuse.
```

The repository and package Go tests had also passed earlier in this review turn. The independent probe and WASM outputs were kept under `/tmp`, not in the producer tree. Node emitted Go's existing `[UNDICI-EHPA] EnvHttpProxyAgent is experimental` warning; assertions still passed.

## Limits

This is a producer and bridge review. It does not establish DOM node retention, focus/selection transfer, browser scheduling, or end-to-end HTTP behavior; those are covered by the other keyed-editor lanes. The custom negative probe was a temporary `/tmp` script rather than a checked-in regression test.
