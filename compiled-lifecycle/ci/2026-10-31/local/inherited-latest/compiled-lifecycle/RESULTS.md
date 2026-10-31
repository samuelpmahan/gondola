# Compiled Go lifecycle results

**Status: the explicit lifecycle-only chain passed with stable source pins; the full inherited chain has no accepted E-BUILD pass yet.** Lifecycle-only mode skips `run-compiled-methods.sh` and is partial evidence. The default full command remains the inherited plus lifecycle acceptance gate.

## Preliminary CLI probe

The actual compiler CLI was invoked from `compiled-frontend/` for both `react` and `dom`, using Go 1.27.3, the frozen lifecycle package, separate request files, and separate output directories. Both invocations exited 1 with the same four `analyze.numeric-profile` diagnostics: `integer increment/decrement lacks a safe bound guard` at the four `state.NextRequestID++` statements in `fixtures/compiled/lifecycle/app.go`. The requests, `ok:false` build results, and stderr logs are retained in `builds/feasibility/{react,dom}/`.

This is a fixture-profile rejection, not a compiler production change. N1 owns the source guard adjustment. The full E-BUILD runner will repeat both real CLI builds from a fresh attempt after the fixture change, then record native/direct/browser and demo evidence. No GoScript lifecycle, browser, or demo pass is claimed until that complete runner writes a fresh passing receipt.

## Preintegration build and demo attempts

After the positive-bound guard and admitted `fixture.request` effect were applied, separate React and DOM `go run ./cmd/gobi-build` builds passed with one app, 67 outputs, no diagnostics, and `effect.request-reply` in AppIR. AppIR v1 emitted the full package path as the component ID; the fixture and demo were aligned to that existing identity. These builds predate the completed lifecycle host/browser integration and are retained as preintegration evidence, not an acceptance run.

N5's first demo smoke, using the pre-bridge build, reached `removeParent` and failed because GoScript returned `$.Slice<gobi.Effect>` while the shared runtime accepted only an array or null. Its failed smoke JSON, screenshot, bundle, build record, and exact commands remain in `demo/evidence/attempt-01-slice-abi-failure/`.

## Bridge-green preintegration smoke

After N2's generated-encoder bridge and focused suites passed, E-BUILD made fresh React and DOM CLI outputs under `builds/feasibility/bridge-green-02/`. Each build returned one clean app, 67 output files, no diagnostics, the package-path AppIR component ID, and `effect.request-reply`. AppIR and encoder bytes matched across the backend outputs; raw module bytes are retained separately.

The React output built the demo and passed the Chromium HTTP smoke: page, CSS, and bundle all returned HTTP 200; there were no browser, console, failed-request, or runtime failures; the smoke recorded zero WASM requests and zero WASM API attempts. Its full schema summary and screenshot are `builds/feasibility/bridge-green-02/demo-smoke.json` and `builds/feasibility/bridge-green-02/demo.png`. The command/version record is in `builds/feasibility/bridge-green-02/attempt.json`; its 152-member `artifacts.tar.gz` round-tripped against `archive-manifest.json`.

This is preintegration evidence, not an acceptance pass. At that point the source-pinned full runner and native/direct/browser matrix were still waiting on the N1 unmount admission fix and N4 expected-effects metadata alignment; both repairs have since been completed.

## Fresh lifecycle-only validation

After the portability test loader accepted an explicit generated app directory, E-BUILD ran a fresh lifecycle-only attempt at `builds/attempts/attempt-20261031T065111036Z/`. Its 122 source pins matched before and after; all 13 gates passed with zero failures. It ran the root and compiler Go suites, Node renderer/shared-host/conformance/oracle tests, a native replay, fresh React and DOM CLI builds (67 files each), the compiled lifecycle runtime suite against the new React app directory using `GOBI_LIFECYCLE_APP_DIR`, the native/direct/browser matrix, and the HTTP demo smoke.

The matrix matched 26 events and ticks, 16 clicks, 17 swaps, 7 requests, 3 cancellations, 18 stale physical-click probes across profiles, 32 callback fences across eligible swaps, and all 8 mutation controls. The HTTP smoke passed with all assets at HTTP 200, no browser errors, and no WASM requests or API attempts. The verified archive has 719 members totaling 168,198,179 uncompressed bytes; SHA-256 is `2e674d3d7f43576a0f9052f6164e83f3312933112eaf72fa3348a29d3db22f47`, and every member hash passed extraction verification. The separate partial report and receipt are retained under `builds/attempts/parallel-lifecycle-only-validation/`.

## Full parent attempt retained as failed

The earlier full-mode attempt at `builds/attempts/attempt-20261031T063606056Z/` completed the inherited `run-compiled-methods.sh` chain as a fresh full pass, then completed the lifecycle matrix and demo. E-BUILD correctly records that attempt as failed: its source set changed after start, and the old runner ordering invoked the env-dependent compiled runtime tests before producing a fresh React app directory. The inherited pass, failed Node logs, lifecycle traces, and archive remain in that attempt. This run is not a single full-parent acceptance pass; the repaired runner's default full mode still requires a clean source-pinned run, which is the CI gate.
