# CI-GO — closed first-attempt audit

**Outcome: `insufficient_evidence` for compiler/output acceptance.** This packet closes the first CI attempt only: the immutable provider archive is verified, and all completed Go 1.24 and Go 1.27.3 test, race, and vet commands in this run exited 0. The full compiled-frontend runner then failed at the Node test gate: 79 of 81 tests passed, while two no-WASM tests could not launch Chromium at `/tmp/chromium`. The run stopped before the compiler CLI and output inventory. Any later repaired run is outside this packet and must be audited separately.

## Artifact and source attribution

The provider archive is `provider/downloads/run-41140265213.zip`, 119,128,377 bytes, SHA-256 `7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4`. Its extraction manifest is `provider/extracted/extraction-manifest.json`, SHA-256 `504a7b04f88da14d79fa0c6d91e3792c44badebb089220d8a152acc81c8dda4c`. I verified all 19 manifest-listed compiler artifact files against their recorded hashes and sizes. The execution receipt SHA-256 is `26d4f82477d0989543f0fdaa9e6885c53990961e0a4c7de74bb9bd5d1c825c86`.

The CI checkout identifies PR11 head `408e330517b1dd5e5f865e2ff1914465f98bcf66`, tree `cd615e4bd0e83e31dd87232207afb2bf6416ccff`. All 116 `sourceBefore` hashes in the execution receipt match this local exact-head checkout. The run stopped before `sourceAfter`; independent workflow-run/artifact binding remains with CI-PUBLICATION.

## Go checks completed

The execution receipt records Go 1.24.13 for root packages and Go 1.27.3 for the compiled-frontend module. Node was v22.23.4; React and React DOM were 19.3.1; esbuild was 0.28.2; Playwright was 1.64.1. `GOTOOLCHAIN=go1.27.3`; `GOFLAGS`, `CHROMIUM_PATH`, and `CHROMIUM_EXECUTABLE_PATH` were unset.

| Runtime | Command scope | Test | Race | Vet |
|---|---|---:|---:|---:|
| Go 1.24.13 | `./compilercontract ./fixtures/compiled/... ./cmd/compiled-native` | pass (five packages; test results cached) | pass (five packages) | pass (no diagnostics) |
| Go 1.27.3 | `./analyze ./build ./cmd/... ./emit` | pass | pass | pass (no diagnostics) |

The exact stdout/stderr files and hashes are listed in [`failed-run-audit.json`](../../audits/CI-GO/failed-run-audit.json). Root Go logs show `compilercontract`, compiled `effect`, `form`, `list`, and `cmd/compiled-native`. Nested logs show `analyze`, `build`, `cmd/gobi-build` (no test files), and `emit`.

## Stop point and current blocker

`compiled-frontend/run.mjs` exited at its `node-tests` command. The two failures were:

- “browser guard detects compilation and instantiation attempts instead of allowing fallback”
- “browser guard rejects WASM asset requests”

Both report that Chromium could not launch because `/tmp/chromium` does not exist. The source test uses `process.env.CHROMIUM_PATH ?? "/tmp/chromium"`, while the recorded execution environment has `CHROMIUM_PATH: null`. The Node log records 79 passes, 2 failures, and 0 skips.

Consequently, this artifact contains no `compile-four` CLI result, native compiler binary output, four-app output inventory, fixture comparisons, or demo build/smoke evidence. Passing Go tests, race, and vet do not establish those later gates. The source inspection, provider integrity checks, Go command receipts, and Node failure details are preserved under [`audits/CI-GO/`](../../audits/CI-GO/).

