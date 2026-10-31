# XR-NATIVECLICK — independent native click review

**Decision:** accepted. **Reviewer:** N5. This read-only review covers sealed E-NATIVECLICK, its Go command and tests, the final contract/acceptance, and the author’s source and replay evidence. No source files were changed.

## Findings

The Go runner resolves `kind:"click"` against the current Go view for the selected parent/child target. It requires a unique handler for the action event, reads the target node’s disabled flag, and returns a disabled row with no resolved message or step when the node is disabled. The replay loop calls `dispatchMessage` only when resolution says dispatch; therefore a disabled click creates no Go update or bridge checkpoint. Enabled clicks use the message from the Go view handler. The explicit `disabled-action` kind fails if the current Go node is enabled and is recorded with `disabled:true` when the node is disabled.

`main.go` uses actual Go fixture `Init`, `View`, and `Update` functions. No JavaScript Go reducer or fixture event reclassification was introduced. The canonical 24-event scenario still matches the E-GO hash. Each pinned seed remains 40 `click` source events; all three native traces preserve their source events and have the recorded step counts 29, 27, and 27.

I found no blocking defect in the reviewed native-click change.

## Independent checks

- The sealed E-NATIVECLICK report and receipt match their seal. All 49 receipt-referenced pins matched current files; the four sealed packet artifacts also matched. The raw evidence index matched its receipt hash and all 49 entries it indexes.
- Go 1.24.0 package tests passed: `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test -count=1 ./cmd/compiled-modules-native`.
- Fresh Go CLI replays of seeds `20261031`, `20261032`, and `20261033` matched the sealed output hashes and counts. Each emitted 40 source events; disabled rows had `disabled:true`, `message:null`, and `stepIndex:null`; enabled rows had messages and step indexes. Disabled/enabled click counts were 11/29, 13/27, and 13/27.
- A fresh canonical CLI replay matched the pinned 24-event, 16-step trace hash.
- Black-box CLI runs with unknown fields at the scenario root and nested action both exited 1 with empty stdout, confirming no trace is written for malformed input. The package test also checks unknown top-level fields and malformed action paths.
- Tests verify enabled physical actions resolve their messages from Go views, disabled actions do not create steps, bridge order for parent and child updates is correct, and explicit `disabled-action` rejects an enabled Add.

## Limits

This is native Go verification only. It does not establish mounted DOM/React propagation or browser equivalence; those belong to the separate harness capture. The Unicode encoder work is outside these CLI files and was not reviewed here. No arbitrary event-count/resource bound is claimed beyond the supplied canonical scenario and three fixed 40-event seeds.

## Reviewed identities

- E-NATIVECLICK report: `f47d30b057b582c828dd6351294f48009205bfe4420fe5ea64efade9f5fb3269`
- E-NATIVECLICK receipt: `ed7727ed124bd89b9f756c12ca0c95fe65aa04932e9a9f27f967985e710bc6ac`
- Owned `main.go`: `356902a6517f6922409431730344364f23a156df9a90f2957f7f52d1cc9b1a3f`
- Owned `main_test.go`: `a3b6d3f60a2ec272afdeaac1e13db985bc92165d784bce6eb85b6087449ec7de`
- Original fixed scenario: `9b99a2d7ac7f9d044bcc590414787ea4a9d934f180503a45aac7684778f94539`

Fresh test/replay output, unknown-field probes, pin verification, and exact commands are indexed under `rawlogs/XR-NATIVECLICK/`.
