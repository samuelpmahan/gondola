# XR-GO: Independent review of the keyed-children Go fixture

**Decision: `accepted`.** I found no must-fix behavior or trace mismatch against the frozen contract.

## Review scope

I read the frozen `compiled-children/CONTRACT.md`, E-GO report and receipt, `fixtures/compiled/children/app.go`, `view.go`, `app_test.go`, the scenario JSON, and `cmd/compiled-children-native/main.go` and its tests. I also parsed and byte-compared the saved native trace to a fresh CLI run.

### Source and author-evidence hashes

| Artifact | SHA-256 |
|---|---|
| `compiled-children/CONTRACT.md` | `5ee2115113a53b1d07e3d9d1f477eef61b9437c08f8413f7bf63b4ed00ed1902` |
| `fixtures/compiled/children/app.go` | `d265bbac54017ab366bdf86aa646fdad808f464c5d35cd106259c6943fc32c99` |
| `fixtures/compiled/children/view.go` | `6d0ecf88dfc521ed197213e8922ec12f553505a37f88f5e8e63a1ec8cfda8185` |
| `fixtures/compiled/children/app_test.go` | `0def0cc80e63017e4712e0fe5f8b15a13531798e31a595a50c15e892cb65a628` |
| `cmd/compiled-children-native/main.go` | `2d87f25ff5bb7125cb8265ac310ffcd98cce9a81f001f5197b2ac2ba09c77ca9` |
| `cmd/compiled-children-native/main_test.go` | `1d81ddb843c2aed17df35f89d89d80f06ea6d2070cb1165111059f1278748b19` |
| `fixtures/compiled/children/scenario.json` | `ad9bc4659114075f2ec2b7e1e619f01fc1827e39db2cb5131c60479b31a4f407` |
| E-GO report | `b391368ac7c0253c6447fdfd5567a5a3c702f03240fa30f5ddb8b6391c57e497` |
| E-GO receipt | `68e04d07077ba3464deccd5ecbc8f2e2c2f8bda6ae820ed583ce2601a394caa7` |
| E-GO saved native trace | `8ad3a28bd1a5e03a3c324dcecb1b5c55d97ffae257b1011103e7730573baefbb` |

## Findings

The fixture keeps collection order and child values in Go. `Update` clones the child slice before mutation; because `counter.State` contains only a `float64`, copying each `ChildState` isolates both order and counter history. A reviewer probe exercised add, counter update, reorder, remove, and key reuse while checking that prior states remained unchanged.

Key admission follows the contract's lowercase ASCII rule and 16-byte ceiling. Malformed keys and swaps are no-ops. `NextGeneration`, child and parent request sequence increments, and parent remount use `< maxSafeID` guards. The shipped tests cover the generation ceiling on add and request sequences; an independent probe additionally checked that parent remount stops at the ceiling and that the maximum safe IDs can be emitted once.

Completion matches only the currently pending exact token. In the trace, a direct stale completion for removed `child:oak:g2:r1` leaves reused oak generation 5 pending with an empty reply. A correlated effect reply after cancellation is rejected by the native CLI before `children.Update` is called. The stale direct Go message is a Go no-op step; it is distinct from a host-correlated reply, which must have a live host token.

Cancellation effects are in reverse current presentation order. Clear cancels pending oak then elm while leaving the parent request pending. Parent removal cancels oak, then pine, then the parent request. Reordering does not cancel pending work; later replies for those tokens are accepted.

The saved trace has 42 source events and 38 Go steps. Events 9–12 (disabled action, compatible swap, stale-callback marker, and rejected-swap marker) have no Go step. The fresh native CLI output is byte-identical to the saved trace.

## Independent checks

All Go checks used `/tmp/gondola-go/bin/go`, Go `1.24.0`, `GOTOOLCHAIN=local`, and `GOFLAGS=-buildvcs=false`.

| Command | Result | Raw evidence |
|---|---|---|
| `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go test -count=1 -v ./fixtures/compiled/children ./cmd/compiled-children-native` | Passed: 8 fixture tests, 3 CLI tests, and both correlation subtests (13 cases total) | [`XR-GO-review-go-test.log`](../rawlogs/XR-GO-review-go-test.log) |
| `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script fixtures/compiled/children/scenario.json` | Exit 0; fresh output exactly matches N1's saved trace bytes | [`XR-GO-review-native-trace.json`](../rawlogs/XR-GO-review-native-trace.json), [`XR-GO-review-trace-audit.txt`](../rawlogs/XR-GO-review-trace-audit.txt) |
| `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run ./compiled-children/coordination/rawlogs/XR-GO-review-slice-history.go` | Passed slice-history and safe-ID boundary checks | [`XR-GO-review-slice-history.go`](../rawlogs/XR-GO-review-slice-history.go), [`XR-GO-review-slice-history.log`](../rawlogs/XR-GO-review-slice-history.log) |
| `/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/XR-GO-review-receipt-validation.py` | Native read-only `validate_receipt` accepted E-GO identity/outcome/summary; state shows E-GO closed | [`XR-GO-review-receipt-validation.log`](../rawlogs/XR-GO-review-receipt-validation.log) |

Negative control: I ran the native CLI on a scenario that requests oak, removes oak, then replies to the canceled token. It exited 1 with `event 2 effect-reply token "child:oak:g2:r1" is not pending`; stdout was empty. The code consumes/checks the pending host token before calling `children.Update` for an `effect-reply`.

One reviewer-only probe attempt initially expected a re-added child at the wrong slice index. The input order correctly placed the re-added child at the end; after correcting that verifier expectation, the slice-history and boundary probe passed. The first-pass failure is preserved in [`XR-GO-review-slice-history-firstpass.log`](../rawlogs/XR-GO-review-slice-history-firstpass.log).

## Non-blocking boundaries

The native CLI records renderer-swap, disabled-action, and stale-callback events as no-step metadata/preflight records; it does not mount renderers or invoke a captured callback. That distinction is stated in E-GO's report and leaves actual mounted React/DOM callback behavior to N4 and the root integration run. N2 compiler/build results are peer-reported here and were not rerun as part of this Go review.

The test name `TestInvalidKeysUnknownActionsAndSafeIntegerLimitsAreNoOps` does not actually send an unknown message name. `Update`'s default branch is an explicit no-op, so this is a test-name/coverage mismatch rather than a contract violation. No change is requested for this review.

No production files, Git state, or native scheduler state were changed.
