# E-49CC-FINAL — terminal supplement for the 49cc hosted CI capture

**Outcome: `mixed_change`.** This is a separate terminal supplement to the immutable E-CI-EVIDENCE pending snapshot. It closes that snapshot with the final status and failure evidence for primary PR lifecycle run `41178477290`; it does not rewrite or replace the earlier report or receipt.

## Final workflow inventory

The GitHub Actions API response captured at `2026-10-31T07:35:40Z` contains all 28 expected runs on head `49cc2b96c8817a47319d5b7bd484184a22fa984b`: 14 push runs and 14 pull-request runs, all terminal. The result is 26 successes and two failures:

- Primary push run `41178420647`: failure.
- Primary PR lifecycle run `41178477290`: failure.

The exact full run response and normalized summary are preserved under `../../lanes/old-final/`. The PR run was created at `06:54:40Z`, updated at `07:29:18Z`, and finished with job `124470831563` failed. Its PR head is #14 at the same 49cc SHA. Source tree is `d49ca35b7eda23837c392bbe0d2363551e4c7bec`, parent is `6b49cc0bd4c9512a041f723c86b632ec506afd9d`. The PR synthetic merge remains `d6fe98cd11cb8eb5ba673a449099b170e222b3fa`, tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`, parents `[6b49cc0bd4c9512a041f723c86b632ec506afd9d, 49cc2b96c8817a47319d5b7bd484184a22fa984b]`.

## Final PR lifecycle failure evidence

The exact decoded job log is `../../lanes/old-final/pr-41178477290-job-124470831563-20261031T073540Z-exact.log`, 49,771 UTF-8 bytes, SHA-256 `13f5ed4e5ed71b81af498553592571d98d03e64a933856e2598db6086ab979ff`. It records the full conformance command with `--native-go go` but does not print the harness’s internal failure message.

The PR artifact metadata records artifact `13034662119`, `gobi-compiled-lifecycle-artifacts`, 47,017,957 bytes, digest `sha256:294ab76c6e0555e4b42f31b747673070ff4982739735eb7f4ad85fbc6a728128`, not expired. I downloaded this distinct PR artifact because the log omitted the internal error. The exact ZIP is retained at `../../lanes/old-final/artifact-13034662119.zip`; its size and SHA-256 match the API metadata and it contains 1,272 files.

The PR artifact’s `matrix/lifecycle.failed.json` records:

> `native Go lifecycle replay failed (exit spawn-error): spawnSync /home/runner/work/gondola/gondola/go ENOENT`

It also states that the full conformance check was withheld because a required evidence stage failed. Its `matrix/lifecycle.run.json` preserves `--native-go go`, resolves `nativeGo` to `/home/runner/work/gondola/gondola/go`, and shows the Go version probe attempted that same nonexistent checkout path with no exit code. The error is the same path-resolution failure recorded in the primary push artifact, not a new lifecycle or browser failure. Selected exact artifact members are extracted under `../../lanes/old-final/artifact-members/`; the ZIP remains the full record.

The PR run’s inherited runner exited successfully. The native CLI binary built and its independent probe ran before lifecycle conformance. In the matrix record, direct emitted-module replay, React/DOM/swap browser profiles, source/build pin checks, and final stability checks completed; the native replay failed and the final matrix check was withheld. The job later preserved the artifact successfully. These completed substeps do not convert the PR workflow to success.

## E-CI-EVIDENCE immutability and claim boundary

The earlier E-CI-EVIDENCE report and receipt remain byte-for-byte unchanged: report SHA-256 `dfbe352c0b381a818a376c972e3cde0bb7f3c76f4d7bf35bed1c631375cb93a9`, receipt SHA-256 `f0f0f43e0d1121791422498cd26d732a671c8004bbbadc37f65f5d06f786110c`. That earlier packet records the 27-of-28 pending capture; this supplement records the later 28-of-28 terminal capture and the final PR artifact failure details.

Both lifecycle workflows on source 49cc failed at native Go replay because the bare `go` argument was resolved as a checkout-relative path. The final checker was withheld in both. The other 26 workflow runs succeeded, and several lifecycle build, direct, browser, demo, and inherited stages passed, but this is not a full hosted lifecycle acceptance or a complete native/direct/browser conformance pass. Any native-path repair must be evaluated on a new head with fresh CI.

## Preserved snapshots

- Full final 28-run API response and normalized totals: `../../lanes/old-final/runs-headsha-49cc-20261031T073540Z.json` and `runs-summary-49cc-20261031T073540Z.json`.
- Run, job, and artifact API records: `run-41178477290-20261031T073540Z.json`, `jobs-41178477290-20261031T073540Z.json`, and `artifacts-41178477290-20261031T073540Z.json` under the same lane.
- Exact log, full PR ZIP, selected extracted artifact members, and their hash inventory: `../../lanes/old-final/supplement-index.json` (SHA-256 `75108efd9ba62be4e013633b0272b033b93060efd3ba5cf982ac9801b823c295`).
