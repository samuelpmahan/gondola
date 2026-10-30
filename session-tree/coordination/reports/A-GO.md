# A-GO — composed acceptance of typed Go session-tree manager

**Outcome: confirmed_reuse.** I verified the accepted T1 Go manager behavior against the current implementation, the recorded full-run log, and the T1/XR-T1 receipts. The current source matches the recorded source hashes; I found no production drift or material guarantee gap in the reviewed Go tree contract.

## Bound source and execution evidence

Current file hashes match `session-tree/evidence/source-assets.json`:

- `multisession/manager.go`: `e04033f26fbe63e639dd27468642f6702d9638fce69166711823d920db6d9166`
- `multisession/manager_tree_test.go`: `3a8663471fd8e4fe5bc5fd161b572b8f7f50e928e6f19fd701e9a05fcf546c36`
- `cmd/multi-root-wasm/main_wasm.go`: `70b4b1cfcb669ad83c2333805e3355f9e441f91d69f88768686a65f7fb261f79`
- `cmd/multi-root-wasm/smoke.html`: `4f4682b54d79e750ae6b8725b67640f5578ec09e2c2b77b5d57b1523ad102b29`

The two bridge hashes also match the snapshot named by the accepted XR-T2 receipt. The source-assets file is a historical pre-repair execution snapshot, as noted by the lead; it should be refreshed after source freeze. The T1 and XR-T1 receipts do not embed Go source hashes, so their text alone cannot identify their exact byte snapshot. However, the current manager source at the reviewed lines matches their stated implementation and tests, and matches the recorded execution manifest. No unaccounted change is visible in the current source.

The full-run evidence file is `session-tree/evidence/full-run-before-cancel-review.log`, SHA-256 `e717d074e472e0679eb2480bbb26dffb00df9058956de15fd7c42f8d57c9baa5`. It records the Go manager and bridge package results (`ok .../multisession (cached)`, `ok .../cmd/multi-root-wasm (cached)`) and the real-WASM smoke output:

```json
{"ok":true,"sessions":[1,2,3],"sharedLocalRequestIDs":[1,1,1],"disposedCancellation":[{"Kind":"cancel","ID":1,"Value":""}],"siblingCompletion":"saved two","lateRepliesRejected":true,"nestedTree":[4,6,7,8],"subtreePostorder":[7,6,8,4],"invalidParentsRejected":true}
```

The log is reused evidence, not a new execution. I did not rerun the full runner. T1 records uncached `go test -count=1 ./multisession`, race tests, and `go vet`; XR-T1 independently records fresh invalid-parent/depth/cancellation probes, a create-vs-subtree-dispose race probe, and reruns of normal and race package tests. Both are accepted reports. XR-T2 independently accepted the exact bridge API, wire shape, invalid-parent atomicity, and fresh WASM/Chromium smoke.

## Manager guarantees checked

- `CreateChild` validates the live parent and metadata, rejects depth 32 before allocation, and delegates to an allocator that checks the JavaScript-safe ID ceiling before incrementing. Session and immutable `{SessionID, ParentID, Depth}` metadata are installed while holding the same mutex (`manager.go:65-97`). Root depth is 1; `MaxTreeDepth` is 32.
- `Tree` sorts IDs and returns a fresh slice of scalar records (`manager.go:100-117`).
- `Dispose` validates liveness and rejects a parent with live children before draining effects or mutating either registry (`manager.go:179-193`).
- `DisposeTree` validates the root, computes child-ID-sorted depth-first postorder, then removes each session while still holding the manager mutex (`manager.go:195-230`). Once removal starts there is no public error path. Each per-session bundle includes queued cancels followed by still-pending row IDs, deduplicated in encounter order; both session and tree entries are deleted (`manager.go:242-279`). This makes the operation atomic with respect to other Manager calls and preserves unrelated branches.
- The new tests cover defensive tree results, invalid/dead parent allocation atomicity, depth and safe-ID exhaustion boundaries, non-leaf rejection before drain, cancellation order/deduplication, deterministic subtree bundles, sibling survival, stale-ID rejection, empty bundles, and concurrent tree creation/read/disposal (`manager_tree_test.go`).

## Scope and limits

This is a composed acceptance of the typed Go manager evidence and the matching bridge snapshot. It does not accept the active R-T5 oracle lane, claim integrated parity, or replace the lead's final post-freeze full runner. No source or product documentation was changed, and no tests were rerun for this review.
