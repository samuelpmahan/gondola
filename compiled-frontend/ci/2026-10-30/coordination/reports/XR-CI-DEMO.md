# XR-CI-DEMO — N5 independent review

**Decision: `accepted`.** N4’s CI-DEMO packet accurately reports a failed CI attempt and keeps its demo conclusion limited to `insufficient_evidence`. This accepts the packet’s evidence and scope; it does not accept the failed run as CI success or establish any later repair.

## Independent checks

- Recomputed SHA-256 for the already-materialized primary ZIP: `7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4`, matching artifact `13019432197` and the provider analysis. I did not fetch or download an artifact.
- Recomputed extraction-manifest SHA-256 `504a7b04f88da14d79fa0c6d91e3792c44badebb089220d8a152acc81c8dda4`. The manifest’s entries for `execution.json` and `node-tests.stdout.log` match both extracted files’ recomputed hashes.
- The completed-run provider snapshot binds run `41140265213`, job `124352550636`, artifact `13019432197`, PR #11 head `408e330517b1dd5e5f865e2ff1914465f98bcf66`, source tree `cd615e4bd0e83e31dd87232207afb2bf6416ccff`, and base `42df6883337605d901a23e9fed874768c7ce1824`. This binding is explicitly attributed by N4 to the root provider gate, not to the extraction manifest.
- `execution.json` records the Go 1.24 root test/race/vet and Go 1.27.3 compiler test/race/vet commands exiting 0, followed by `node-tests` exiting 1. The Node output reports 79 passing, 2 failing, 81 total. Both failure names, source locations, and `/tmp/chromium` launch errors in `failed-run.json` match the captured Node log.
- The failing test source sets `executablePath: process.env.CHROMIUM_PATH ?? "/tmp/chromium"` in both cases. CI records `CHROMIUM_PATH` and `CHROMIUM_EXECUTABLE_PATH` as null. The workflow installs Chromium through Playwright and does not supply `CHROMIUM_PATH`; `run-compiled-frontend.sh` only exports `/tmp/chromium` when that path exists and is executable. This supports N4’s bounded finding that the tests failed at browser launch, before either WASM assertion ran.
- `run.mjs` orders `node-tests` before `compile-four`, `build-demo`, and `demo-smoke`. The failed execution receipt ends at `node-tests`; no later compile, app conformance, demo, or screenshot claim is made. `sourceAfter` and output pins are absent, and N4 states that this run cannot establish source/output stability.
- Recomputed the seven source hashes N4 cites (runner, demo sources, runtime, and no-WASM test); each matches the corresponding source pin and this head. The static-review packet is clearly labeled source inspection, separate from CI execution evidence.

## Disposition and limits

The report, receipt, and failed-run audit agree on the failed outcome and the missing demo evidence. The `insufficient_evidence` outcome is appropriate: the CI attempt produced no completed four-app build or demo run to compare, so `not_reuse` would overstate what this artifact establishes. I found no material contradiction requiring amendment.

This review is limited to the CI-DEMO packet, its selected immutable artifact files, relevant workflow/test source, and the matching root provider metadata. It does not inspect every file in the ZIP, rerun tests, execute a browser, or make claims about any later CI attempt.
