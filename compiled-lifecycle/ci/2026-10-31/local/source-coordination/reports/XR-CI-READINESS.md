# XR-CI-READINESS independent review

**Decision: accepted for the CI-readiness evidence described here.** The workflow YAML is repaired and parses; the pre-fix bytes are recovered byte-for-byte from the old source pin and reproduce the recorded parse error. The current runner contains the post-build test call and N6's retained `lifecycle-only` execution proves it ran 10 tests against the React app generated in that attempt. N5's no-cache source mirror also passes the explicit-env regression and all 10 runtime tests.

This review does not claim a GitHub-hosted CI run or acceptance of the inherited full chain. N6's attempt used `--lifecycle-only`; the default workflow invokes `bash run-compiled-lifecycle.sh` without arguments and therefore selects full mode. The PR14 full run is separately owned and reported by root.

## Workflow recovery and parse check

I compared `compiled-lifecycle/coordination/ci-readiness/evidence/workflow-before.yml` against both the retained root-check copy and the recorded old pin. The two source copies are byte-identical at 2,017 bytes and SHA-256 `464789e75a245e40147d6200c11808ee2350efc8687b0300727cc2b62bbf2642`. PyYAML `6.0.3` with `BaseLoader` reproduces the syntax failure: `could not find expected ':'`, with context at line 48 and problem at line 60. The old pin in both workflow proof records matches those bytes.

The current `.github/workflows/gobi-compiled-lifecycle.yml` is 2,019 bytes, SHA-256 `8c7382b44c764f8f51c8038150714d7b70c0896b3bf52359c1a848d17f99d1bd`, and parses with the same parser. Its parsed structure has push and pull-request triggers, Go 1.24 and Node 22 setup, locked npm installs for the repository, `interaction`, and `compiled-frontend`, Chromium installation, and the no-argument lifecycle runner command. The artifact upload has `if: always()` and includes lifecycle attempt, matrix/demo, and inherited output paths. The independent parser and step/path checks are in `coordination/reviews/xr-ci-readiness/workflow-audit.py` and `workflow-audit.json`.

## Current runner call and N6 execution

The current `compiled-lifecycle/run.mjs` hash is `ac79d5038946e9ff0f69a26acc992c132279bcce2dcba0469f1ea77a2e7826b5`. The initial no-call observation at source hash `2aa23460b844450efb2ffd2907f996ff07cc08c80aaff2933a7575d49db73885` is recorded as WIP in N5's packet. In current source, `main()` completes the React build and the DOM build, then invokes `compiled-lifecycle-runtime-tests`; the helper derives `appDir` from the fresh React AppIR, checks that AppIR/module/encoder share that directory, and passes `GOBI_LIFECYCLE_APP_DIR` to Node. The runner's default mode is `full`; `--lifecycle-only` is explicit.

I independently checked N6's retained execution at `compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/`. The execution JSON hash is `b0b181c5044b829e4e6d305f8507c447a5e6d2addb29d05c6a1b528ed496976b`. It records `lifecycle-only`, status passed, 13 passed stages, 18 successful commands, 122 source pins stable and matching the current tree, and 134 React/DOM output pins stable and matching current output. The React and DOM builds both finished before the compiled runtime test started. The test command passed `GOBI_LIFECYCLE_APP_DIR` pointing at that attempt's fresh React AppIR directory. Its raw stdout log reports 10 passed, 0 failed; the log hash matches the command record. I independently reran the 10-test suite against that actual attempt-specific appDir, also passing.

The execution record says the lifecycle-only attempt archived and round-trip-checked 719 members. This confirms its recorded artifact integrity only; it does not upgrade the attempt to full mode or hosted CI.

## Fresh app provenance and isolated mirror

I checked N5's fresh real GoScript appDir at `compiled-lifecycle/builds/portability/attempt-00/react/output/apps/lifecycle-7e6575d90707`. Its retained build record proves it came from `go run ./cmd/gobi-build` with Go `1.27.3`, a React request for the canonical lifecycle Go package, 67 outputs, zero diagnostics, and `acceptanceClaim: false`. The independent audit rehashed all 67 outputs against the build record. The manifest and AppIR component ID/package path agree on `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`; AppIR, compiled module, and encoder hashes match the record.

The source mirror at `/tmp/gondola-ci-readiness.wL6yHx/source` contains only the lifecycle test, lifecycle runtime wrapper, and shared compiled frontend runtime named by N5. I verified their byte hashes against the mirror manifest and confirmed `compiled-lifecycle/builds/feasibility` is absent. I reran both tests from that mirror, using the validated actual generated appDir:

- With `GOBI_LIFECYCLE_APP_DIR` unset, the missing-environment regression passes 1/1.
- With it set to the fresh generated appDir, the complete runtime suite passes 10/10.

The first off-mirror-cwd attempt is correctly excluded by N5 and is not used as evidence here. The independent output records live in `coordination/reviews/xr-ci-readiness/`.

## Source and evidence pins

| Item | SHA-256 |
| --- | --- |
| Corrected workflow | `8c7382b44c764f8f51c8038150714d7b70c0896b3bf52359c1a848d17f99d1bd` |
| Recovered old workflow bytes | `464789e75a245e40147d6200c11808ee2350efc8687b0300727cc2b62bbf2642` |
| Current runner | `ac79d5038946e9ff0f69a26acc992c132279bcce2dcba0469f1ea77a2e7826b5` |
| Lifecycle shell entrypoint | `81a45e018a53c437af4099199461def46a10f395b20eb0e7372342a5db32ed7b` |
| Runtime test source | `a07ec74fe85995e7ac18fd0d03a789e3d722f3507b6a24b5d03f410bef58e59d` |
| Production lifecycle runtime | `9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed` |
| N5 E-CI-READINESS report | `181f6bdf853ee5548b77c5f75de722f9f92b2cbdd906b8d65a8711d6597c2c0b` |
| N5 E-CI-READINESS receipt | `8190575a90c1ceaa225f5a2e1ba760d20054bccd40a786ca1e832f4c620a65b8` |
| N6 lifecycle-only execution | `b0b181c5044b829e4e6d305f8507c447a5e6d2addb29d05c6a1b528ed496976b` |
| N5 fresh React build record | `94e70c541f3bc0c478dc0a3191b5dbeca02bb864a1a588277594968a4616a93d` |
| N5 fresh React AppIR | `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d` |
| N5 fresh React compiled module | `172c04df5a13b6963f27647fdce075a3e4df9f8cf65f3b9c8ca77d029bac975f` |
| N5 fresh React encoder | `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4` |

Independent review artifacts:

- Workflow parser/audit script: `2f10883f96e725beec596c5350d5dad99146bf8342f0a22168a2a9cb6fabde97`; output: `2447b8a1b36e8a692979141c33bb7b37d3cd8584674b7c1cdc1d85564671f80d`.
- N6 execution/source/output audit script: `ef3343895fccb854f904d1775ed8e5ce16cf19d303400fab03a772d9e587642e`; output: `1cfa0870da42ee904338c6b14b3a0c8448a4bb035aa3e70c456caa67bc72640c`.
- N5 mirror/build audit script: `34f5bde98c1d9093e7d3b38df5f0cf1912ee39a1a84bf39131ce13788db9a968`; output: `f8820426829776b3124802a0008756df05b4a701c24143e89bdc45a4b2eab635`.
- Independent N5 mirror missing-env output: `55265fb5e153c9c9aac5b11803aab6158f2c27eed30a4a222c6aaf0db213a859`.
- Independent N5 mirror 10-test output: `0d62a403cef9380d12802f05ed8e4422e7e7f6dc38bf6e0c463c155dba7ba7a6`.
- Independent N6 attempt-app 10-test output: `2ac23dff4b943280034d58050585343d56441464e5a78f3ab4fc7360f254bfda`.

## Limits

This review accepts the workflow syntax, the fresh-build-before-runtime-test call, the explicit app-directory contract, and the recorded lifecycle-only execution. It does not accept the default full inherited chain, establish a hosted GitHub Actions job, or validate service-side interpretation of the YAML. No product, workflow, test, Git, or shared-state source was edited by this reviewer.
