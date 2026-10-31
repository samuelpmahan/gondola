# XR-CI-LEGACY

**Decision: `accepted`.** The CI-LEGACY packet accurately describes the frozen PR #11 CI status for head `408e330517b1dd5e5f865e2ff1914465f98bcf66` and tree `cd615e4bd0e83e31dd87232207afb2bf6416ccff`: 10 workflows succeeded and the compiled-frontend workflow failed at Node tests with 79/81 passing.

I matched all 11 report rows to `workflow-runs.snapshot-3.json`, `workflow-jobs.snapshot-3.json`, and `workflow-run-details.snapshot-3.json`. The PR head and base match across all 11 runs, and each report run/job ID and conclusion matches its snapshot. All 11 stored raw job logs hash-match the report table. Each contains the `same over 5000 inputs`, `receipt matches`, and `SHA256SUMS ok` baseline markers, along with Go 1.24.13, Node v22.23.4, npm 10.9.9, and the synthetic PR merge commit listed in the report.

The primary run’s existing provider `execution.json` records Node suite exit 1; its saved Node log has 79 passes and 2 failures. The failures are the two named `no-wasm.test.mjs` browser tests, both reporting that `/tmp/chromium` is absent. The execution environment records `CHROMIUM_PATH` as null; the saved suite also confirms the explicit Chromium configuration test passed. The run stopped before `compile-four`, fixture comparisons, and demo stages. CI-LEGACY does not claim those stages passed.

The N5 static audit records the frozen predecessor-preservation comparison as 1,228 parent paths retained and 602 additions with no modifications or deletions. I did not rerun that Git comparison; this review checks the saved audit/report alignment and focuses on the workflow status, existing logs, and pins. The packet is limited to the frozen head; no later CI2 status is reviewed.

Detailed row and log hash checks are in [`review.json`](../../audits/XR-CI-LEGACY/review.json). No artifact was downloaded and no workflow or test was rerun for this review.

