# E-CI-READINESS — clean-checkout workflow and compiled-test path

**Outcome: `confirmed_reuse`.** The corrected workflow parses and its paths align with the lifecycle runner. The runner now invokes the compiled lifecycle integration suite after fresh React and DOM builds, passing `GOBI_LIFECYCLE_APP_DIR` for the generated React app. I independently ran the 10-test runtime suite and the missing-environment regression from an isolated mirror with no feasibility directory. This confirms the lifecycle-specific path; it does not claim a hosted GitHub Actions run or a full inherited-chain pass.

## Workflow review

The exact prior workflow bytes are preserved at `coordination/ci-readiness/evidence/workflow-before.yml` (2,017 bytes; SHA-256 `464789e75a245e40147d6200c11808ee2350efc8687b0300727cc2b62bbf2642`). PyYAML 6.0.3 reproduces the saved syntax failure at lines 48 and 60. The corrected `.github/workflows/gobi-compiled-lifecycle.yml` is 2,019 bytes, SHA-256 `8c7382b44c764f8f51c8038150714d7b70c0896b3bf52359c1a848d17f99d1bd`, and parses successfully. The workflow runs on push and pull request, sets up Go 1.24 and Node 22, runs locked installs for the root, `interaction`, and `compiled-frontend` lockfiles, installs Playwright Chromium, then invokes `bash run-compiled-lifecycle.sh` with no arguments.

That no-argument command selects the runner's default `full` mode. Full mode invokes `bash run-compiled-methods.sh` and requires a fresh passing inherited run. The `--lifecycle-only` option is explicitly reported as partial and skips that inherited chain. N6's recorded execution used `--lifecycle-only`; it is useful lifecycle-path evidence, not a full-workflow result.

The `if: always()` upload step includes the generated lifecycle attempt tree, feasibility evidence, matrix and demo evidence, the E-BUILD report/receipt, and the inherited compiled-methods, compiled-backends, and compiled-frontend artifact paths. The audit checked these paths against the runner's output roots. No GitHub-hosted job was started in this review.

## Build-before-test and environment contract

During the first live source inspection, `runCompiledLifecycleNodeTest` was defined but had no call site. That was a valid WIP finding at `run.mjs` SHA-256 `2aa23460b844450efb2ffd2907f996ff07cc08c80aaff2933a7575d49db73885`; it is not the final readiness result. N6 added the call after the React and DOM profile builds. The current source is SHA-256 `ac79d5038946e9ff0f69a26acc992c132279bcce2dcba0469f1ea77a2e7826b5`, and the current source is pinned in N6's later execution.

The helper derives `appDir` from the freshly generated React AppIR, verifies that AppIR, module and encoder share that directory and exist, then executes Node with `GOBI_LIFECYCLE_APP_DIR=appDir`. The test loader requires this variable, reads and validates the AppIR package path, and imports the compiled module and encoder from that directory. It no longer scans `builds/feasibility/final/...`.

N6's source-pinned lifecycle-only attempt `compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/` passed 13 stages and 18 commands with zero failures. The compiled-runtime test started after both fresh builds completed; its command exited 0 with 10/10 tests. The environment points at that attempt's freshly built React AppIR directory. All 122 source pins were stable before/after the attempt and still match; all 134 React/DOM build-output pins were stable before/after and still match. Its 719-member archive round-tripped successfully. Its recorded mode remains `lifecycle-only`, so the inherited full chain is not claimed here.

## Independent isolated probe

I created `/tmp/gondola-ci-readiness.wL6yHx/source` with only the runtime test, lifecycle runtime wrapper, and shared compiled frontend runtime source. The mirror has no `compiled-lifecycle/builds/feasibility` directory. I validated the fresh actual GoScript app from `builds/portability/attempt-00/react/` before use: the CLI request targets the canonical lifecycle Go package and React backend; the build record reports a real `go run ./cmd/gobi-build` invocation, `ok: true`, 67 outputs, zero diagnostics, and `acceptanceClaim: false`. AppIR, manifest, compiled module and encoder hashes match that record. The AppIR component ID/package path is the canonical fixture path; the compiled module's embedded AppIR matches `app-ir.json`, and its Go `Init`, `Update`, and `View` functions plus generated encoder are callable. The fixture Go source, `view.go`, scenario and root module hashes are retained in the app-validation JSON.

With `GOBI_LIFECYCLE_APP_DIR` pointing to that generated app directory, the isolated mirror passed all 10 runtime tests. With the variable unset, the isolated missing-environment regression passed 1/1. The first local probe accidentally ran from the workspace cwd rather than the mirror; it is preserved as `root-cwd-suite.*` and explicitly excluded from the isolated result. The correctly scoped run is recorded in `isolated-suite.command.json` with stdout, stderr and exit code.

## Preserved failures and evidence boundaries

The pre-fix YAML bytes and parse error, the old runtime test snapshot, and N2's before-change red regression are copied under `coordination/ci-readiness/evidence/`. The red command exited 1 with `Missing expected rejection`: the old loader found the cached ignored fixture when `GOBI_LIFECYCLE_APP_DIR` was unset. That failure is distinct from the current green explicit-env regression.

This review confirmed the YAML syntax with PyYAML, runner source ordering, N6's recorded lifecycle-only execution, and the isolated Node tests. It did not launch the complete default command or a hosted GitHub job. No product, workflow, test, Git or shared-state source was changed by this review; the audit scripts, preserved inputs and logs are under `coordination/ci-readiness/`, and the isolated mirror is under `/tmp`.

## Key source and evidence hashes

| Item | SHA-256 |
|---|---|
| Corrected workflow | `8c7382b44c764f8f51c8038150714d7b70c0896b3bf52359c1a848d17f99d1bd` |
| Current lifecycle runner | `ac79d5038946e9ff0f69a26acc992c132279bcce2dcba0469f1ea77a2e7826b5` |
| Lifecycle shell entrypoint | `81a45e018a53c437af4099199461def46a10f395b20eb0e7372342a5db32ed7b` |
| Final runtime test source | `a07ec74fe85995e7ac18fd0d03a789e3d722f3507b6a24b5d03f410bef58e59d` |
| Lifecycle runtime implementation | `9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed` |
| N6 partial execution record | `b0b181c5044b829e4e6d305f8507c447a5e6d2addb29d05c6a1b528ed496976b` |
| N6 fresh React portability manifest | `bee3a7810efcc4e9379776961bff22703a740695575c1981a1e8d7475df78603` |
| N6 fresh React portability AppIR | `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d` |
| N6 fresh React portability module | `172c04df5a13b6963f27647fdce075a3e4df9f8cf65f3b9c8ca77d029bac975f` |
| N6 fresh React portability encoder | `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4` |

The captured commands, pin validations, full hashes, old/new failure logs, and actual isolated output are indexed in `compiled-lifecycle/coordination/ci-readiness/evidence/`.
