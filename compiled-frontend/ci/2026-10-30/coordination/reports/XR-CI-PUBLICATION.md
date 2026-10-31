# XR-CI-PUBLICATION — N4

**Decision: `accepted`** as an accurate, bounded publication and failure-attribution audit. This accepts the report's evidence handling; it does not accept the failed GitHub Actions run as CI success.

## Independent spot-check

The existing API observation and completion snapshot agree on PR #11 source head `408e330517b1dd5e5f865e2ff1914465f98bcf66`, tree `cd615e4bd0e83e31dd87232207afb2bf6416ccff`, and base/parent `42df6883337605d901a23e9fed874768c7ce1824`. The completion snapshot associates run `41140265213`, attempt 1, job `124352550636`, with that PR head and records the job conclusion as `failure`. The checkout log excerpt records the synthetic `refs/remotes/pull/11/merge` commit `2dc5918b4401d54bd991303c5b345f6491288016`; its tree is recorded equal to the source head tree, with the base and PR head as its two parents.

The artifact API snapshot, job-log excerpt, completed-run snapshot, and existing artifact analysis agree on artifact `13019432197`, 119,128,377 bytes, and digest `sha256:7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4`. The extraction manifest records the same archive digest. Its selected inventory has 19 compiler artifact files and 71 inherited aggregate reports. The report correctly limits its archive inspection; it does not say the remaining inherited shards were reviewed.

The extracted execution receipt records 116 `sourceBefore` pins, no `sourceAfter`, and ends at `node-tests` with exit 1. The receipt's version and command details match the archived execution JSON. The Node log summary is 79 passing / 2 failing / 81 total. Both failing test names and the `/tmp/chromium` launch error match the log; the pinned test source uses `process.env.CHROMIUM_PATH ?? '/tmp/chromium'`, and the recorded environment has both Chromium path variables null. The report correctly says the tests failed before their WASM assertions and that no four-app build, replay, or demo phase was reached.

## Evidence checked

The review used only already-materialized files: `github-observation-20261030T225242Z.json`, `completed-run-artifact-20261030T231204Z.json`, `job-log-excerpts-20261030T231204Z.txt`, `artifact-analysis.json`, the immutable `provider/extracted/extraction-manifest.json`, `execution.json`, and `node-tests.stdout.log`. Their existing hashes are retained in `audits/XR-CI-PUBLICATION/review.json`. No artifact was downloaded again, and no tests, workflow, browser, or local build were run.

The report and receipt consistently classify this first attempt as `insufficient_evidence` for successful CI acceptance. They distinguish the confirmed run/artifact attribution from a passing CI outcome, state the missing `sourceAfter` limitation, and preserve the failure as a separate event from any later repaired run. I found no material contradiction requiring an amendment.

## Limits

This is a bounded metadata and failure-attribution review of the existing N6 packet. It is not a full review of all files inside the archived artifact, and it establishes no successful app build, browser conformance, or demo execution.
