# E-WORKFLOW — hosted workflow context repair

**Worker:** N3  
**Outcome:** `mixed_change`  
**Repair of:** E-DELIVERY

## Finding and change

GitHub Actions run `41235795977` was reported to have failed during workflow initialization before creating a job, against source commit `f7874237b1ceb5dab195a40b12f8df8a3dcc45a0`. The reported cause was use of `${{ runner.temp }}` in the `portable-go-verification` job-level `env`, where the runner context is unavailable. The original workflow bytes are preserved in `rawlogs/E-WORKFLOW/workflow.before.yml`; their SHA-256 `7d75b9481957099f53e33fc52fa9158fee10f3128a84483216376b6b1452d5e9` matches the E-DELIVERY frozen source pin and receipt.

Moved only `GOBI_PORTABLE_OUTPUT_DIR` from that job-level environment to the `Verify the published archive with Go` step's `env`. The workflow's job-level repository commit and `GOFLAGS` values, both jobs, and the artifact-upload path were left intact. The output directory still includes run ID and attempt, and the upload step still reads that runner-temp directory.

The failed run ID, source commit, and summarized failure are recorded in `rawlogs/E-WORKFLOW/failed-run-41235795977.json` as task-dispatch metadata. No original GitHub API payload or job log was supplied to this worker, so the record does not present itself as a downloaded platform log.

## Verification

Installed actionlint v1.7.12 with the requested command using Go toolchain 1.27.3. The installer executable reports Go 1.24.0; the actionlint binary reports it was built with Go 1.27.3.

- Before the edit, actionlint exited 1 and identified exactly the forbidden context at line 34: `context "runner" is not allowed here` in job-level `env`.
- After the edit, actionlint exited 0 with no diagnostics.
- PyYAML 6.0.3 parsed the repaired workflow. Assertions confirmed that the output directory is absent from job-level `env`, present on the Go verification step, both jobs remain, and the upload step's runner-temp path is unchanged.
- The independently generated unified diff shows only the environment assignment moving to the verification step. The final receipt passed the read-only native validator against the active E-WORKFLOW/N3 packet.

Exact commands, exit codes, tool versions, before/after source hashes, the diff, static diagnostic, and parser result are retained under `rawlogs/E-WORKFLOW/` and individually pinned by the receipt.

## Limits

No GitHub workflow was rerun from this worker. Static actionlint context validation establishes that the specific initialization error is removed from the workflow source; it does not claim a hosted run succeeded. The existing failed run remains preserved as historical evidence. No application, Go library, runner, or verifier code was changed.
