# CI-PUBLICATION: PR #11 artifact and run attribution

**Outcome: `insufficient_evidence` for successful CI acceptance. Source, run, checkout, and artifact attribution is confirmed, but the GitHub Actions run failed and does not accept PR #11 as a successful CI application run.**

## Scope

This packet audits GitHub PR, commit, workflow, job, log, and artifact metadata for one run, plus the single archive root materialized into the immutable provider directory. It does not edit the tested application tree or inspect every file in the complete archived artifact.

The native allocation assigned N6 / CI-PUBLICATION in epoch 0. The recorded allocation was exact score 600/600 with zero broken constraints; the plan pins Rebalancer 1.0.4 and toolkit PR1 probe head `989c295717511c812b69beda5d125817ffc054c9`. Allocation/worker acknowledgements are separate from this GitHub Actions result.

## PR and source identity

At the captured API observation, PR #11 was open, draft, mergeable, and unmerged. Its base was `42df6883337605d901a23e9fed874768c7ce1824`; its source head was `408e330517b1dd5e5f865e2ff1914465f98bcf66`. GitHub Git Data reports the source head tree as `cd615e4bd0e83e31dd87232207afb2bf6416ccff`, with the base as its sole parent. The local worktree and the recorded local alias `f7441435e5900efa17eb58c7285384dfe2787d29` have the same tree and parent.

The PR merge ref pointed to synthetic merge commit `2dc5918b4401d54bd991303c5b345f6491288016`. GitHub Git Data reports its tree as the same `cd615e4...` tree and its parents as base `42df688...` then source head `408e330...`. This is a synthetic merge object; the PR remained unmerged.

## Run-to-checkout binding

GitHub run `41140265213`, attempt 1, was the `pull_request` run for PR #11. Its `head_sha` was the PR source head `408e330...`. The one job, `124352550636` (`compiled-frontend`), completed with conclusion `failure`.

The job log explicitly records fetching `2dc5918...` to `refs/remotes/pull/11/merge`, then `HEAD is now at 2dc5918` and `git log -1` returning the same SHA. The workflow file at source head (`.github/workflows/compiled-frontend.yml`, SHA-256 `87d756a359b6851f4a0c78743d7f8a2f38c43832f7db91ebca3f25537535a276`) uses `actions/checkout@v4` without a ref override. The checkout commit differs from the run head SHA, while its tree is independently verified equal to the source head tree.

## Artifact-to-run binding

The completed run published one artifact: `gobi-compiled-frontend-artifacts`, ID `13019432197`, 119,128,377 bytes, GitHub digest `sha256:7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4`. Its artifact API row associates it with run `41140265213`, branch `codex/gobi-compiled-frontend-20261030`, and head SHA `408e330...`. The job log reports the same artifact ID, size, and ZIP digest.

Root materialized the archive once at `provider/downloads/run-41140265213.zip`. N6 independently ran `sha256sum` on that immutable path and got the exact GitHub digest above. The selected extraction is under `provider/extracted/`; its manifest SHA-256 is `504a7b04f88da14d79fa0c6d91e3792c44badebb089220d8a152acc81c8dda4c`. The extraction manifest lists 19 files from `compiled-frontend/artifacts` and 71 inherited aggregate reports. Other inherited shards remain in the preserved archive and were not inspected for this packet.

The archived `execution.json` (`26d4f82477d0989543f0fdaa9e6885c53990961e0a4c7de74bb9bd5d1c825c86`) records 116 `sourceBefore` path/hash pins. N6 ran the independent verifier against the exact local checkout at `408e330...`: 116 checked, zero mismatches. The verification script and command are preserved in `audits/CI-PUBLICATION/verify-source-before.mjs`. The failed execution has no `sourceAfter` list; this packet makes no before/after mutation claim. Its environment receipt has `CHROMIUM_PATH: null` and `CHROMIUM_EXECUTABLE_PATH: null`.

## CI result and failure

The workflow job failed in step 6, “Run baseline, inherited interaction and compiled frontend gates.” The evidence-preservation step 7 completed successfully and uploaded the artifact.

The archived execution receipt reports these Go gates exited 0: root Go 1.24.13 tests/race/vet and compiled-frontend Go 1.27.3 tests/race/vet. The Node 22.23.4 suite ran 81 tests: 79 passed and 2 failed. Both failures are in `compiled-frontend/conformance/no-wasm.test.mjs`:

- “browser guard detects compilation and instantiation attempts instead of allowing fallback”
- “browser guard rejects WASM asset requests”

Both failed before their guard assertions because Chromium launch reported: `executable doesn't exist at /tmp/chromium`. The source test supplies `process.env.CHROMIUM_PATH ?? "/tmp/chromium"` directly to `chromium.launch`, instead of using the shared launcher options. The archived Node command has no explicit environment overrides. Thus this run proves neither of those two WASM guard behaviors in CI; it does prove the two browser tests are the recorded cause of the overall failure. This is a test-launch-path failure, not evidence that application behavior passed or failed.

The run therefore is **not an accepted CI pass**. The archived execution command list ends at `node-tests`; it contains no `compile-four`, native replay, direct-JavaScript/browser replay, or demo build/smoke command. No fresh five-profile CI app-conformance run is established or claimed.

## Reproduction and evidence files

From the evidence worktree root:

```sh
sha256sum compiled-frontend/ci/2026-10-30/provider/downloads/run-41140265213.zip
/tmp/gondola-node22/node_modules/node/bin/node compiled-frontend/ci/2026-10-30/audits/CI-PUBLICATION/verify-source-before.mjs
```

The first command returns `7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4`. The second prints `sourcePinCount: 116`, `mismatches: 0` on Node v22.23.4.

Supporting evidence is in:

- `audits/CI-PUBLICATION/github-observation-20261030T225242Z.json`
- `audits/CI-PUBLICATION/completed-run-artifact-20261030T231204Z.json`
- `audits/CI-PUBLICATION/job-log-excerpts-20261030T231204Z.txt`
- `audits/CI-PUBLICATION/artifact-analysis.json`
- `audits/CI-PUBLICATION/workflow-at-408e330.yml`
- `audits/CI-PUBLICATION/verify-source-before.mjs`
- `provider/extracted/compiled-frontend/artifacts/execution.json`
- `provider/extracted/compiled-frontend/artifacts/logs/node-tests.stdout.log`
- `provider/extracted/extraction-manifest.json`

## Limits

This is one failed first-attempt workflow run for the exact published PR head. It establishes the PR/run/checkout/artifact identity and the two Node launch failures. It does not establish successful application CI, a source-after check, completion of the compiled app acceptance gate, inspection of every archived inherited shard, merge, or deployment. A repaired follow-up run at a later head must be reported as a separate publication event and cannot overwrite this failure evidence.
