# XR-GO: independent review of the publications fixture

**Decision: accepted.** I found no blocking mismatch between the current Go fixture, its tests, the frozen contract, and the native trace. Review was read-only with respect to production source.

## Source and author packet pins

Current SHA-256 values match the E-GO receipt for `app.go`, `view.go`, `app_test.go`, `scenario.json`, and `CONTRACT.md`. The E-GO report and receipt also match their recorded hashes. I ran the native `probe.validate_receipt` validator against the completed E-GO packet and independently checked its source, report, and six rawlog pins; all matched.

## Semantic review

| Contract area | Independent evidence | Result |
| --- | --- | --- |
| Typed input and lock | `ParentInput` is carried in Go state. Only steps 1–3 are accepted; a changed step or lock toggle advances the revision once; same-step input is a no-op. Counter updates and captures require a live, unlocked parent. | Pass |
| Snapshot and queue ownership | `Update` clones both `Children` and `Publications`. Capture appends a value record with global publication ID, parent generation, child generation, input revision, and counter value. The test preserves the previous state, and the trace keeps value 4 queued after oak reaches 7. | Pass |
| Delivery fences | Canonical decimal IDs find exactly one queued entry. Delivery checks parent liveness/generation, lock, input revision, child presence/generation, and the child’s accepted-ID watermark. Accepted and rejected records are consumed once; unknown, duplicate, and malformed IDs leave state unchanged. | Pass |
| Generations and reuse | `NextGeneration` is global across child addition and parent remount. Initial parent/oak/elm generations are 1/2/3; reused elm is generation 4; remounted parent is 5; the new oak is 6. A bounded probe confirmed a reused nonzero child counter resets and its old publication is rejected. | Pass |
| Safe integer ceilings | Source guards counter increments, IDs, parent/child request sequences, generation allocation, input revisions, and accepted/rejected totals. The existing unit test covers publication-ID and step-revision ceilings; a separate probe reached the counter ceiling exactly and verified no-ops at the counter, sequence, generation, revision, and decision-count limits. | Pass |
| Request and cancellation profile | Requests use the frozen request tuple and canonical generation/request tokens. Completion only updates a live pending match. Parent removal cancels pending children in reverse current order, then the parent; all cancellation effects carry an empty reply field. | Pass |

## Fresh verification

Using Go 1.24.0, I ran `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go test -count=1 -v ./fixtures/compiled/publications`; all 10 tests passed. I generated a fresh trace through the native CLI. It has 50 source events and 45 Go dispatches, validates the no-tick rows, and is byte-identical to both the E-GO trace and the E-NATIVECLI capture. The trace audit confirms revision changes, immutable captured value, out-of-order acceptance and stale-ID rejection, stale-input/child-generation/parent-generation rejection, duplicate/malformed no-ops, an empty final queue, and cancellation order `child:elm:g4:r1`, `child:oak:g2:r2`, `parent:g1:r2`.

## Scope

This review covers the Go fixture and native trace only. It does not claim mounted React/DOM, browser, hosted CI, or full-pipeline acceptance. Those remain with their assigned lanes.
