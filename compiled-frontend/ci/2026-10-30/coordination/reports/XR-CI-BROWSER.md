# XR-CI-BROWSER — N4

**Decision: `accepted`** as an accurate, bounded report of the first failed CI attempt. This does not accept the run as passing browser or application CI.

## Spot-check

The receipt and report consistently identify run `41140265213`, job `124352550636`, artifact `13019432197`, and PR head `408e330517b1dd5e5f865e2ff1914465f98bcf66`. These identifiers, tree `cd615e4bd0e83e31dd87232207afb2bf6416ccff`, parent `42df6883337605d901a23e9fed874768c7ce1824`, and archive digest `7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4` agree with the existing CI-PUBLICATION metadata and extraction manifest.

The extracted execution receipt ends at `node-tests` with exit 1, records `sourceBefore` count 116 and no `sourceAfter`, and reports all root Go 1.24 and compiler Go 1.27.3 test/race/vet commands passing. The Node log hash matches both the extraction manifest and the receipt; its summary is 79/81, with the two no-WASM tests failing at Chromium launch because `/tmp/chromium` was absent. The pinned test source selects that fallback when `CHROMIUM_PATH` is unset. The report correctly limits the cause to launch: the WASM assertions were not reached.

The retained first-attempt audit records 19 compiled artifact files verified with no mismatches and 116 source pins matched; it also records no `compile-four` command, compiled app outputs, or raw browser traces. This matches the execution command list and the CI-PUBLICATION packet. The CI-BROWSER receipt's `no_wasm_guard_assertions_reached: false` is consistent with the narrative that the assertions were not reached; the audit's `failed_before_guard_behavior: true` expresses the same fact more clearly.

## Evidence checked and limits

This review used only the existing CI-BROWSER packet and already-materialized provider artifacts: its report, receipt, `first-attempt.json`, audit script, extraction manifest, execution receipt, and Node log; plus the existing CI-PUBLICATION run/artifact metadata. The hashes checked are in `audits/XR-CI-BROWSER/review.json`. I did not download artifacts again or run the workflow, browser, tests, or app build.

The conclusion is limited to attempt 1. The packet accurately says no mounted-app DOM/control/focus/effect or post-unmount behavior was established, and leaves repaired CI acceptance to a separate run. I found no material contradiction requiring amendment.
