# XR-T1 independent review — composition Go package

**Decision: accepted.** I reviewed `composition/manager.go` and its frozen packet `coordination/reviews/XR-T1.diff` against `typed-composition/DESIGN.md`, then checked the author report in `coordination/reports/T1.md`. I found no blocking contract or correctness issue. This review does not certify the browser/WASM host integration.

## Review findings

- **Atomic validation and identity checks:** `SetChildInputs` validates title bytes/UTF-8 and IDs before changing state, then checks parent and child liveness, immediate parentage, and revision capacity under the manager mutex. It obtains the base snapshot before committing inputs, revision, and dirty ID. `Publish` validates child/row/revision ranges first, then checks liveness, non-root status, direct parent, read-only policy, revision equality, sequence capacity, row existence, and nonempty saved data before it changes sequence, inbox, messages, or dirty IDs. `Complete` now returns the current composition snapshot together with the base error for an invalid reply; the earlier discarded-error defect recorded by T1 is fixed in this snapshot.
- **Safe IDs and revisions:** Session IDs come from the private `multisession.Manager`, whose allocator caps IDs at `asyncsave.MaxID`. Input revisions and publication sequence stop at `collection.MaxID`; row IDs and externally supplied revisions are range checked. The generated `ROW/REVISION` argument is canonical decimal text.
- **Message and receipt order:** All transitions share the outer mutex. Collection messages append only the base session's new message suffix; publish appends one `publish` message to the child in the same serialized order as its immutable receipt. Receipt sequence allocation, the immediate parent inbox append, and both dirty IDs commit together. Grandchildren route only to their direct parent.
- **Isolation and copies:** The wrapped multisession manager is an unexported field with no accessor. Exported methods serialize access through `Manager.mu`. Snapshots copy collection rows, inbox, messages, and bindings; the Gobi tree is rebuilt from a fresh collection view. `Tree`, `List`, effect/audit outputs, and disposal bundles come from the underlying manager's copy-returning APIs.
- **Read-only behavior:** The projected tree marks every button and input disabled while retaining handlers and bindings. Dispatch verifies canonical path/key/event before suppression; publish additionally checks the exact current literal argument even for a disabled control. Read-only does not cancel pending effects or block `Complete`.
- **Disposal and dirty IDs:** Leaf and subtree deletion mutate composition metadata only after the private manager succeeds, and clear removed IDs from `changes`. Child deletion leaves the parent's inbox intact; deleting an inbox owner removes its state. The global publication sequence is retained across disposal.

## Independent probe

I added `coordination/reviews/xr_t1_probe.go`, a bounded cross-operation race probe that runs 100 input revision increments concurrently with 100 publication attempts pinned to revision zero. It checks that each publication is either admitted before the revision advances or rejected as stale, with no partial inbox/message change, contiguous receipt sequences for admitted publishes, and the expected dirty IDs. Ran:

```sh
GOTOOLCHAIN=local /tmp/gondola-go/bin/go run -race ./typed-composition/coordination/reviews/xr_t1_probe.go
```

Result: `accepted=0 stale=100 revision=100 inbox=0 messages=4 changes=[2]`; the race detector reported no data race. The run exercised the stale-rejection branch under concurrency. T1's separate tests cover successful concurrent publishes and sequence ordering.

No Go package source was modified during this review. I did not rerun the author's exact test suite or the broader inherited/browser runner.
