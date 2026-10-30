# XR-A-RUNNER

**Decision: accepted as a limited static audit.** N4 correctly reported `insufficient_evidence`: the retained evidence is syntax checking and source inspection, not a fresh build or execution of the full runner. This decision accepts the honesty and scope of that audit; it does not accept the runner's eventual end-to-end result. The current `compiled-frontend/artifacts` directory is absent.

## Route and scope confirmed from source

The default `run-compiled-frontend.sh` path calls `run-typed-composition.sh` before switching to `GOTOOLCHAIN=go1.27.3` and invoking `compiled-frontend/run.mjs`. The inherited route checks Go 1.24 and runs its earlier suite. The compiled runner records the root Go version, requires 1.24.x, and runs root `compilercontract`, compiled fixtures, and `cmd/compiled-native` test, race, and vet gates with `GOTOOLCHAIN=local`. It then runs the nested module test, race, vet, and Node test gates under the outer compiled profile.

`--compiled-only` skips the inherited full Go 1.24 route. The nested runner still performs its explicit root Go 1.24 package gates and compiled-module gates, but does not make that mode equivalent to the default inherited suite. It expects root React dependencies to be installed.

Source pins cover the root `counter`, `gobi`, `reactmap`, `compilercontract`, compiled fixtures and native runner, root and interaction manifests/lockfiles, nested Go/npm manifests and source trees, and the generated React map. The source pin is checked before and after the compiled sequence. The recorded build request selects four entry apps with the React backend. N4's code reading of the intended native/direct-JS/browser and demo flow is supported by the current runner source; those commands were not executed in the audit.

## Output inventory and freshness

The current `compiled-frontend/run.mjs` includes `verifyOutputs()`. It requires a nonempty `build.outputs`, rejects duplicate/absolute/escaping paths, and verifies every listed output file's byte length and SHA-256 against the `BuildResult` both before and after conformance and demo commands. The runner also requires a clean successful four-app result and finds each app's AppIR. It does not hardcode `build.outputs.length === 209`; the inventory check is generic and tied to the fresh CLI result. No fresh CLI result exists here, so neither the count nor any actual output digest is independently established by this audit.

The artifact directory is not cleared at startup, so files from an earlier run can remain on disk. The current runner writes its new `status: running` receipt before the first synchronous command; a completed command failure writes a failed receipt. This prevents an old `passed` receipt from being mistaken for the current run after the new run has started, while the retained files still require interpretation through the current receipt and its source/output pins.

## Source-hash drift after N4's audit

N4 retained a 28-entry `source-hashes.sha256` manifest. It verifies against the checked-out source snapshot recorded by that audit. At this review's current source read, all entries except `compiled-frontend/run.mjs` still match. N4's manifest records `6c6f4dd367f6b797114dd2cd9f26ec9b9e90df14bfbedcbc216d5b6c501ce577` for that file; the current file is `b936b3e434cba643b7e0bcd2ad2e27e54c14205dad8c7ce6410ae04c898bbb93`. The root subsequently added the path imports, output-inventory verification, and initial `status: running` receipt write. This is post-audit source drift, not evidence that N4's captured syntax-only run failed.

The retained syntax transcript hashes to `185a250f75454d3628a5a2bc9f25ad097902d847537788c026211bcd6c1779d2`. It records `bash -n` plus Node `--check` passes for the shell runner, current-at-that-time `run.mjs`, and three demo modules. Because `run.mjs` changed after that snapshot, refresh the source manifest and syntax check after the integration source is frozen and before relying on a runner receipt.

## Limits

No full runner, build CLI, output inventory, native/direct/browser comparison, managed-Chromium run, or demo smoke was executed for A-RUNNER or this review. The later actual runner gate must be evaluated from its own current `execution.json`, command logs, source pins, BuildResult output pins, and browser/demo artifacts after the known React GoSlice backing-symbol and runtime complete-fence repairs. This review adds no E2E pass claim.

## Hashes

| Artifact | SHA-256 |
|---|---|
| N4 `coordination/reports/A-RUNNER.md` | `2eda311b03c37ecb8f32be4335745144631da55f47a6e39b948d599c02f473a9` |
| N4 `coordination/receipts/A-RUNNER.json` | `c99254f2c5b6a42a759f62e7ee1091bf07d1583aa4e62bad221372da34be2d14` |
| N4 `coordination/reviews/runner/source-hashes.sha256` | `e2adfd8641ee249bc727a6c6e9bd48aec28815b162984cd86fa26d17918472db` |
| N4 `coordination/reviews/runner/syntax-checks.txt` | `185a250f75454d3628a5a2bc9f25ad097902d847537788c026211bcd6c1779d2` |
| Current `compiled-frontend/run.mjs` at review | `b936b3e434cba643b7e0bcd2ad2e27e54c14205dad8c7ce6410ae04c898bbb93` |

