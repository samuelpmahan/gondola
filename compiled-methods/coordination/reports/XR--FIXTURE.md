# XR--FIXTURE

**Decision: accepted.** The bounded E-FIXTURE report matches the Go fixture, native adapter, replay tests, frozen action script, and method contract. I found no material discrepancy in the stated value-composition behavior.

## Review findings

- `Init`, `Update`, and `View` remain package-level roles and delegate to concrete value-receiver methods. `State` stores Parent and Child as `counter.State` values, with `ReadOnly` and typed `SavedChild` fields.
- The four Add/Reset methods call the existing `counter.Update` and return its state/effect results. The other action helpers return `(State, []gobi.Effect)`. Current `method-contract.json` agrees with all seven two-result helper signatures.
- The script contains 18 click actions and yields 19 ticks including the initial state. Suppressed action indexes `6`, `9`, `10`, and `17` have null messages and dispatch IDs. The expected saved-value steps capture Child=2, later edit Child to 3, then publish Parent=2; the locked capture/publish sequence sets Parent from 3 to 1.
- View paths in `view.go` match the documented structure: Parent at `0`, Child at `1`, lock toggle at `2`, saved value at `3`, capture at `4`, and publish at `5`. Child Add/Reset are disabled while locked; Parent controls depend on their own count, and capture/publish remain enabled.
- The native tests verify both replay snapshots and Go value isolation. `TestMethodValueReceiversDoNotMutateOriginalNestedState` checks the original and intermediate inputs across direct receiver calls and `Update`; while locked, direct `childAdd` and `childReset` return unchanged values without effects.
- Every E-FIXTURE source pin, report hash, and retained author test-log hash matches the current file bytes. The independent focused test below also passed.

## Verification

- `PATH=/tmp/gondola-go/bin:/usr/bin:/bin GOTOOLCHAIN=local GOFLAGS=-buildvcs=false go test -count=1 -v ./cmd/compiled-native ./fixtures/compiled/methods` from the repository root: passed. The retained output is `compiled-methods/evidence/reviews/xr-fixture/go-test.log`.
- `git diff --check -- cmd/compiled-native/replay.go cmd/compiled-native/replay_test.go fixtures/compiled/methods/app.go fixtures/compiled/methods/view.go`: passed.
- Read-only checks confirmed every source/evidence hash in `E-FIXTURE.json` and the original report hash.

## Limits

Acceptance covers the fixture and native Go replay/value semantics. It does not establish Manager behavior, session ownership, cancellation, or a general composition protocol. This review does not claim GoScript/AppIR or browser execution; those belong to the compiler, harness, and browser lanes. The author report accurately states these boundaries.

The machine-readable audit and independent test log are pinned in `compiled-methods/coordination/receipts/XR--FIXTURE.json`.
