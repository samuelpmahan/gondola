# CI-DEMO — N4

**Outcome: `insufficient_evidence`.** The immutable primary CI artifact is a failed run. It reached the Node test gate but stopped before four-app compilation, conformance, demo bundling, or the real HTTP smoke. No local or later-build output is substituted for this run.

## Provider packet

The root provider gate identifies run `41140265213`, job `124352550636`, artifact `13019432197`, PR head `408e330517b1dd5e5f865e2ff1914465f98bcf66`, and archive SHA-256 `7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4`. Its immutable extraction is `provider/extracted/`. The extraction manifest records the archive digest and per-file hashes; I checked the execution receipt and Node log against those entries. Run/job/artifact/head binding comes from the root provider gate, since the extraction manifest does not itself include those identifiers. The repository plan pins tree `cd615e4bd0e83e31dd87232207afb2bf6416ccff` and parent `42df6883337605d901a23e9fed874768c7ce1824`.

## What the run completed

`compiled-frontend/artifacts/execution.json` records `status: failed`, started `2026-10-30T23:09:22.185Z`, finished `2026-10-30T23:10:22.989Z`, and error `node-tests failed`. Root Go 1.24 test/race/vet and compiler Go 1.27.3 test/race/vet commands all exited 0. The Node suite reported **79 passed, 2 failed, 81 total**.

Both failures are the browser guard tests in `compiled-frontend/conformance/no-wasm.test.mjs`. Chromium launch failed because `/tmp/chromium` did not exist. The CI execution receipt records `CHROMIUM_PATH: null`; the tests choose `process.env.CHROMIUM_PATH ?? '/tmp/chromium'`, while the workflow installs Playwright-managed Chromium without setting that variable. The failure is therefore in the test browser executable selection. The actual browser version was not captured because launch failed.

Captured versions: Go `go1.24.13 linux/amd64` for the root gate and `go1.27.3 linux/amd64` for the compiler gate; Node `v22.23.4`; React and ReactDOM `19.3.1`; esbuild `0.28.2`; Playwright `1.64.1`.

## Demo and generated-output evidence

The runner is fail-fast. Its command receipt ends at `node-tests` with exit code 1; it contains no `compile-four`, `build-demo`, or `demo-smoke` command. The extraction has no four-app build request/result, generated TypeScript, AppIR, compiled modules, encoders, React map, demo bundle, `demo-smoke.json`, or `demo.png`. The HTTP smoke and its four app interactions were **not run in CI**.

The source inspection in `audits/CI-DEMO/static-review.json` describes what the unexecuted demo smoke would exercise. This is source-only evidence. The CI `sourceBefore` pins include `run.mjs`, the four demo source files, runtime source, and the failing no-WASM test; these hashes match this evidence worktree. Since the run stopped early, `sourceAfter` and compiler output pins were not produced, so this attempt does not prove end-to-end source/output stability.

File-level extraction checks passed for `execution.json` (SHA-256 `26d4f82477d0989543f0fdaa9e6885c53990961e0a4c7de74bb9bd5d1c825c86`) and `node-tests.stdout.log` (SHA-256 `176208369d53a4d77ad53f5f40f7e8ac4f540dd88bbdd340667c254b5e74a1c5`). Detailed findings are in `audits/CI-DEMO/failed-run.json`.

## Limits and follow-up

This run provides no evidence that the four compiled apps mounted over HTTP, that their controls/effects worked in a browser, that the demo generated assets matched the compiler outputs, or that a screenshot was produced. It also does not establish a later repair. A repaired launcher must be checked in a **new completed CI run** with its own immutable artifact before CI-DEMO can assess demo execution and generated-output provenance. Do not classify this failed attempt as `not_reuse`: it produced no demo build to compare.
