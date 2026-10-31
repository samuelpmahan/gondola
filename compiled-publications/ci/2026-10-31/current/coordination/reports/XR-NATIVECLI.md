# XR-NATIVECLI — independent review

**Decision:** `accepted`  
**Reviewer:** N2  
**Summary:** The sealed native CLI adapter follows the publications fixture contract for Go-owned trace generation, non-dispatch events, action metadata, state snapshots, and host-token correlation. No production edits were needed.

## Reviewed source and provenance

I read the sealed E-NATIVECLI report/receipt, `cmd/compiled-publications-native/main.go` and tests, the frozen publications contract/scenario, and the actual Go fixture. The seven author-pinned production/contract source hashes in E-NATIVECLI receipt match the current files. The author report and receipt are byte-identical to their sealed copies. Review-time source pins for the contract, plan, fixture, CLI and capture are also unchanged before/after review (11 paths; pin JSON SHA-256 `0a72b9035c1e8dc11ea703f13232b43739783511947cd0726e11d97f8727515d`).

The CLI source calls `publications.Init`, resolves UI clicks from `publications.View(state)`, dispatches with `publications.Update`, then snapshots the returned Go state, effects, and a fresh `publications.View`. `snapshotState` copies both value slices. The output is not read from a cached expected-state file. I reran the CLI with Go 1.24 and the actual scenario; its 1,148,369-byte output is byte-identical to N3's sealed capture (SHA-256 `bbf6db314e6f9f68802e0dd3d49b5216c4ed93db5696d9f9980055de12bced3d`).

## Focused checks

The uncached Go 1.24 package test command passed all four top-level tests and two reply-correlation subtests:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go test -count=1 -v -run 'TestScenarioTracePreservesPR16EnvelopeAndPublicationSnapshots|TestScenarioRejectsNestedActionMismatch|TestNativeEffectRepliesRequireLiveHostCorrelation|TestSnapshotStateClonesChildrenAndPublicationsSlices' ./cmd/compiled-publications-native
```

An independent read-only audit of the fresh replay confirmed 50 events and 45 Go steps. Events 6, 7, 26, 27, and 28 have no step index and `message: null`; the disabled/stale-action rows retain explicit empty action values. All 37 nested action rows match their flattened path/event/value fields. Each dispatch step maps back to the event message and source event index.

A request/reply ledger over Go-emitted effects confirmed only the closed request/cancel descriptors, canonical ASCII child/parent token forms, positive safe generation/sequence values, exact live-token reply/cancel consumption, zero pending tokens at end, and the specified parent-removal cancellation order. Unknown, duplicate, and noncanonical publication deliveries at events 22, 48, and 49 leave Go state unchanged.

Two separate CLI negatives also failed closed with exit 1 and empty stdout: a reply using `child:oak:g2:r01` after Go emitted `child:oak:g2:r1`, and a click targeting the counter control after `input.toggleLock` disabled it. The existing unit cases independently reject duplicate replies and replies after cancellation, and reject nested/flattened action mismatch.

## Decision limits

The review covers native CLI/trace behavior only. The `stale-callback` row is validated as a suppressed scenario record with no Go dispatch; this does not establish browser callback behavior. No mounted React/DOM or HTTP acceptance is claimed; those remain with the harness/delivery and root pipeline.

Raw evidence index: `coordination/rawlogs/XR-NATIVECLI/index.json`. It includes exact commands, test output, replay bytes, input pins, trace audit, and the two rejected CLI scenarios.
