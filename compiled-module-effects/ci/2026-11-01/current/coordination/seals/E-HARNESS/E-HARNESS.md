# E-HARNESS — native/direct/browser effect conformance

**Worker:** N4  
**Job:** E-HARNESS  
**Outcome:** mixed_change  
**Status:** matched, author-frozen after attempt-03.

## Result

The deterministic manual-completion harness matched native Go state transitions against direct React/DOM hosts and browser React/DOM/swap captures for the fixed literal scenario and all three pinned seeds. The browser lane invoked the live rendered button with programmatic `HTMLElement.click()`. The host completed each enabled browser click through the renderer callback and preserved native disabled controls. No page errors or parity mismatches occurred.

| Scenario | Source events | Go effects | Transport rows | Actual profile capture arrays (events/snapshots) |
|---|---:|---:|---:|---|
| literal | 31 | 10 | 20 | direct.react: 31 events/32 snapshots; direct.dom: 31 events/32 snapshots; browser.react: 31 events/32 snapshots; browser.dom: 31 events/32 snapshots; browser.swap: 31 events/32 snapshots |
| seed-20261104 | 49 | 16 | 32 | direct.react: 49 events/50 snapshots; direct.dom: 49 events/50 snapshots; browser.react: 49 events/50 snapshots; browser.dom: 49 events/50 snapshots; browser.swap: 49 events/50 snapshots |
| seed-20261105 | 50 | 17 | 34 | direct.react: 50 events/51 snapshots; direct.dom: 50 events/51 snapshots; browser.react: 50 events/51 snapshots; browser.dom: 50 events/51 snapshots; browser.swap: 50 events/51 snapshots |
| seed-20261106 | 48 | 15 | 30 | direct.react: 48 events/49 snapshots; direct.dom: 48 events/49 snapshots; browser.react: 48 events/49 snapshots; browser.dom: 48 events/49 snapshots; browser.swap: 48 events/49 snapshots |

Totals derived from captured arrays: **178 native events**, **58 Go effects**, **116 transport rows**, and **890 profile event rows**. The build-admission checker rejected **7/7** malformed build summaries; the mounted parity checker rejected **8/8** malformed capture mutations.

Coverage includes concurrent sibling requests, cancelling one while preserving the other, accepting a pending reply after renderer swap, removing and remounting the same key with a fresh generation and reused request ID, rejecting canceled/duplicate/old-generation replies and retained old UI callbacks, disabled repeated requests, reset at zero, and add/reset isolation. The ordered ledger checks Go commit/render before transport start and Go unmount/cancel before transport cancellation and renderer teardown; effect correlation remains keyed by key, generation, and request token independently of UI renderer epoch.

## Pins and versions

- Build index: `/workspace/scratch/39a56936f173/gondola/compiled-module-effects/build/output/E-BUILD-final/build-index.json`, SHA-256 `70046a0e7f1070c3ec2ad2186e060137a77f2d8df02b5c23bb1760baf156c444`.
- Parent/child package identities, ABI/helper pins, and all build input source pins: [source-pins.json](../rawlogs/E-HARNESS/attempt-03/source-pins.json). The file records 59 build source pins and 13 harness/dependency source pins.
- Node v22.23.4; native Go go version go1.24.0 linux/amd64; compiler Go go1.27.3 linux/amd64; GoScript v0.6.2; esbuild 0.28.2.
- Chromium 153.0.8010.0; Playwright 1.64.1.

## Exact commands

Harness invocation:

```sh
/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola/compiled-module-effects/conformance/run.mjs --native-go /tmp/gondola-go/go/bin/go --build-index compiled-module-effects/build/output/E-BUILD-final/build-index.json --chromium /tmp/chromium-portable --output ../module-effects-coordination/rawlogs/E-HARNESS/attempt-03/capture
```

The driver ran native Go once per scenario with `/tmp/gondola-go/go/bin/go run ./cmd/module-effects-native -script <scenario.json>`, from the repository root, with `GOTOOLCHAIN=local` and `GOFLAGS=-buildvcs=false`. Exact expanded scenario commands are recorded in [evidence.json](../rawlogs/E-HARNESS/attempt-03/evidence.json).

## Preserved diagnostics

- Attempt 01 stopped at build-admission toolchain-format validation before capture.
- Attempt 02 preserved all five literal captures but stopped at the oracle pending-row shape check; N5 replayed the preserved captures successfully after its correction.
- Attempt 03 is the final matched packet. Its summary, check, scenario/native/profile captures, source pins, versions, command records, and capture inventory are preserved under `rawlogs/E-HARNESS/attempt-03/`.

## Limits

Browser input is programmatic `HTMLElement.click()`; this does not claim trusted pointer or OS input. Effect transport uses a deterministic manual deferred completion queue and opaque Go-generated token echo; no real HTTP service is claimed. Timer-based demo behavior is covered by the host/runtime lane, not this manual queue acceptance.
