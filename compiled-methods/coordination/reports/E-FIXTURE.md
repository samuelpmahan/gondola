# E-FIXTURE

**Outcome: mixed change.** Added a bounded Go value-composition fixture whose package roles remain ordinary `Init`, `Update`, and `View` functions. `State` nests the existing `counter.State` by value for Parent and Child and adds `ReadOnly` and `SavedChild`. The role functions delegate to value-receiver methods; the action methods return `(State, []gobi.Effect)` so Add/Reset preserve the exact effect result from `counter.Update`. The seven action methods implement parent/child Add and Reset, child locking, capture of the child count, and publication of the saved value to the parent.

The canonical UI, wire state, message names, fixed action paths, and 18-action sequence are frozen in [`FIXTURE.md`](../../FIXTURE.md). The N3-owned fixture script is `compiled-methods/conformance/fixtures/methods.json`. The view uses keyed parent and child counter sections, reset controls disabled at zero, and child Add/Reset disabled while locked. Capture and publish stay enabled while locked. Capturing Child=2, editing Child to 3, then publishing produces Parent=2; a later locked capture/publish sets Parent from 3 to 1. Four disabled intents remain suppressed ticks without messages or dispatch IDs.

`cmd/compiled-native` now registers this package path and calls its real Go `Init`, `Update`, and `View` functions. Replay tests exercise the 19-tick script and validate state snapshots, dispatch suppression, saved-value behavior, and the lock policy. A separate native test retains original nested Go state across direct receiver calls and `Update`, including PublishSaved at both script scenarios (action indexes 4 and 13): the returned Parent count changes while the input state's `Parent.Count` remains unchanged. It also sends `childAdd` and `childReset` directly through `Update` while `ReadOnly` is true and verifies both calls return unchanged state and no effects, because the fixture's disabled UI actions suppress before reaching those Go branches.

## Verification

Toolchain: Go `1.24.0 linux/amd64`.

- `PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=local go test -count=1 -v ./cmd/compiled-native ./fixtures/compiled/methods` from the repository root: passed. The native package ran all existing replay tests plus the method composition and retained-input tests; all five fixture script subtests passed, including the 19-tick methods script. The methods package compiled successfully.
- `git diff --check -- cmd/compiled-native/replay.go cmd/compiled-native/replay_test.go fixtures/compiled/methods/app.go fixtures/compiled/methods/view.go`: passed.
- `/tmp/gondola-go/bin/gofmt -w` on the four owned Go files: completed. A first `gofmt` lookup using the default PATH exited 127 because the pinned formatter directory was not on PATH; the pinned formatter was used successfully.

Raw test output is retained in `compiled-methods/evidence/fixture/go-test.log`. Source and evidence SHA-256 values are recorded in the receipt.

## Limits

This lane verifies direct native Go execution and retained value semantics. The emitted GoScript/AppIR method call graph and browser rendering are covered by N4 and N2/N3 respectively; those integration results are outside this lane's evidence. The fixture demonstrates value-based delegation and a typed saved-value transfer only. It makes no Manager, session ownership, cancellation, or production composition claim.

After coordination, the N3-owned `compiled-methods/conformance/method-contract.json` now lists all seven action methods with both results (`State` and `[]gobi.Effect`), matching the human signature table in `FIXTURE.md`. This lane did not edit the N3-owned file; its current SHA-256 is recorded as a read-only dependency in the receipt.
