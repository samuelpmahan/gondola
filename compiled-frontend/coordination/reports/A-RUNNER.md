# A-RUNNER

**Outcome: insufficient_evidence.** Static inspection and syntax checks confirm a coherent default route from the inherited Go 1.24 baseline to the isolated compiled frontend profile, plus a deliberately partial `--compiled-only` mode. The runner code provides fail-fast native/direct-JS/browser comparison and a four-app demo. No current `compiled-frontend/artifacts` directory exists, so this audit cannot claim a fresh CLI build, output inventory, browser trace, or end-to-end pass.

## Route and toolchain

- `run-compiled-frontend.sh` prepends `/tmp/gondola-go/bin` when present, checks Node 22, then runs `run-typed-composition.sh` by default. The inherited script sets `GOTOOLCHAIN=local` and checks Go 1.24 before building/running its inherited gates. In this workspace the bundled base binary reports Go 1.24.0.
- After that baseline succeeds, the outer runner sets `GOTOOLCHAIN=go1.27.3`, checks the resulting `go version`, then starts `compiled-frontend/run.mjs`. That runner captures the active Go/Node/React/ReactDOM/esbuild/Playwright versions and relevant environment variables. It separately runs `compilercontract`, compiled fixtures, and `cmd/compiled-native` tests/race/vet with `GOTOOLCHAIN=local`, then runs the complete nested compiled module suite under the compiled profile.
- `--compiled-only` shifts the flag and skips the inherited Go 1.24 chain. It still invokes `run.mjs`, which performs the explicit Go 1.24 root package checks and compiled-module checks. It is not equivalent to the default full inherited gate and assumes required root Node packages are already installed; in a clean checkout, the default inherited `run.sh` performs the root `npm ci` that supplies React for the ESM renderer tests.

## Build and conformance flow

- The runner writes a JSON `gobi.build-request/v1` to `compiled-frontend/artifacts/request.json` and sends the same request on stdin to `go run ./cmd/gobi-build`. The request selects counter, form, list, and effect with the React backend and the artifact build directory.
- It rejects nonzero CLI exit, non-success JSON, diagnostics, or any result with other than four apps. It looks up each app by package path and requires an AppIR output entry before launching native, direct-JS, and browser paths. Subsequent imports/checkers require each app’s compiled module and encoder. The code does **not** assert a fixed `build.outputs` count; without a fresh CLI result this audit does not confirm an expected output total or output manifest contents.
- Native replay consumes the just-built AppIR and fixture. Direct-JS replay invokes the emitted `gobi-compiled.mjs` and encoder without mounting N4’s runtime. Browser replay bundles the current compiled module with `mountCompiledApp` and the React renderer, captures browser evidence, and the checker validates native/direct/browser traces plus fixture expectations and mutation controls.
- `sourcePins()` hashes the root compiler inputs (`counter`, `gobi`, `reactmap`, contract and fixtures), package manifests/lockfiles, compiled frontend sources, and demo sources before and after the run. Direct and browser provenance checks also hash their concrete compiled/helper/fixture inputs. A source change makes the run fail.
- `execute()` writes per-command logs and persists `execution.json`; a failing command throws and the outer catch marks the receipt failed. The chain stops before later conformance steps, so it does not intentionally feed an old good build into a failing run. The runner does not clear `compiled-frontend/artifacts` at start, however, so files from an earlier pass can remain after a failed run. Consumers should rely on a current `execution.json` with `status: passed`, matching source hashes, and current command records rather than an isolated per-app JSON file.

## Delivery and browser path

- The main workflow installs interaction and compiled-frontend lockfiles, then installs Playwright’s managed Chromium with system dependencies. With no custom executable path, Playwright uses that managed browser. Local runners may select `/tmp/chromium`; inherited scripts use `CHROMIUM_EXECUTABLE_PATH`, while the compiled browser and demo smoke use `CHROMIUM_PATH`.
- The root ignore rule matches `react-map.gen.mjs`; `compiled-frontend/.gitignore` explicitly unignores `frontend/react/react-map.gen.mjs`. That file exists and is included by the recursive frontend source pin. Root `counter`, `gobi`, and `reactmap` source and package lockfiles are also in `sourcePins()`. The code establishes inclusion eligibility, but this checkout does not provide a commit/payload boundary to verify remote delivery.
- `demo/build.mjs` imports all four actual compiled modules and their generated encoders, and requires exactly one output directory per app. `demo/app.mjs` obtains component IDs from `module.appIR` and mounts with `mountCompiledApp`; its WebAssembly guard replaces `Module`, `Instance`, `compile`, `instantiate`, and streaming entrypoints. `demo/smoke.mjs` checks all four apps, their main interactions, an effect reply, browser errors, runtime failures, and `.wasm` requests. These checks are present in code but were not executed in this audit.

## Checks and limits

Syntax checks passed:

- `bash -n run-compiled-frontend.sh`
- `/tmp/gondola-node22/node_modules/node/bin/node --check compiled-frontend/run.mjs`
- Node `--check` for `compiled-frontend/demo/app.mjs`, `build.mjs`, and `smoke.mjs`

The commands and source hashes are retained under `coordination/reviews/runner/`. I did not start the full runner, a CLI build, or the integration checker. No actual output count, native/direct/browser parity, managed-Chromium run, or demo pass is claimed.
