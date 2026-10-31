# Compiled Go lifecycle results

**Status: integration run pending; no acceptance pass is claimed.** The first local GoScript CLI feasibility probe ran before N1's positive-bound/token adjustment and found a fixture guard that the admitted numeric validator could not prove.

## Preliminary CLI probe

The actual compiler CLI was invoked from `compiled-frontend/` for both `react` and `dom`, using Go 1.27.3, the frozen lifecycle package, separate request files, and separate output directories. Both invocations exited 1 with the same four `analyze.numeric-profile` diagnostics: `integer increment/decrement lacks a safe bound guard` at the four `state.NextRequestID++` statements in `fixtures/compiled/lifecycle/app.go`. The requests, `ok:false` build results, and stderr logs are retained in `builds/feasibility/{react,dom}/`.

This is a fixture-profile rejection, not a compiler production change. N1 owns the source guard adjustment. The full E-BUILD runner will repeat both real CLI builds from a fresh attempt after the fixture change, then record native/direct/browser and demo evidence. No GoScript lifecycle, browser, or demo pass is claimed until that complete runner writes a fresh passing receipt.

## Preintegration build and demo attempts

After the positive-bound guard and admitted `fixture.request` effect were applied, separate React and DOM `go run ./cmd/gobi-build` builds passed with one app, 67 outputs, no diagnostics, and `effect.request-reply` in AppIR. AppIR v1 emitted the full package path as the component ID; the fixture and demo were aligned to that existing identity. These builds predate the completed lifecycle host/browser integration and are retained as preintegration evidence, not an acceptance run.

N5's first demo smoke, using the pre-bridge build, reached `removeParent` and failed because GoScript returned `$.Slice<gobi.Effect>` while the shared runtime accepted only an array or null. Its failed smoke JSON, screenshot, bundle, build record, and exact commands remain in `demo/evidence/attempt-01-slice-abi-failure/`.

## Bridge-green preintegration smoke

After N2's generated-encoder bridge and focused suites passed, E-BUILD made fresh React and DOM CLI outputs under `builds/feasibility/bridge-green-02/`. Each build returned one clean app, 67 output files, no diagnostics, the package-path AppIR component ID, and `effect.request-reply`. AppIR and encoder bytes matched across the backend outputs; raw module bytes are retained separately.

The React output built the demo and passed the Chromium HTTP smoke: page, CSS, and bundle all returned HTTP 200; there were no browser, console, failed-request, or runtime failures; the smoke recorded zero WASM requests and zero WASM API attempts. Its full schema summary and screenshot are `builds/feasibility/bridge-green-02/demo-smoke.json` and `builds/feasibility/bridge-green-02/demo.png`. The command/version record is in `builds/feasibility/bridge-green-02/attempt.json`; its 152-member `artifacts.tar.gz` round-tripped against `archive-manifest.json`.

This is preintegration evidence, not an acceptance pass. The source-pinned full runner and native/direct/browser matrix remain pending the N1 unmount admission fix and N4 expected-effects metadata alignment.
