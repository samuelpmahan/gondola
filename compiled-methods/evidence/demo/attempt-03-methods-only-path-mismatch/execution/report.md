# E-DEMO (compiled Go value methods)

**Outcome: insufficient_evidence.** method-conformance failed; output is retained at compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/method-conformance.stdout.log and compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/method-conformance.stderr.log

## Execution

- Mode: `methods-only`
- Status: `failed`
- Attempt: `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z`
- Invocation: `bash run-compiled-methods.sh` --methods-only
- Source pins: stable (137 before, 137 after)
- Started: 2026-10-31T04:23:58.210Z
- Finished: 2026-10-31T04:24:01.316Z

## Commands

- `syntax-runner`: `/tmp/gondola-node22/node_modules/node/bin/node --check /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/run.mjs` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `8ab9d869bb94e54e9820cc7c60c8819949a1d9729320f1c47493780de71a2817`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/syntax-runner.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/syntax-runner.stderr.log`)
- `syntax-demo-app`: `/tmp/gondola-node22/node_modules/node/bin/node --check /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/demo/app.mjs` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `b0343106b237559a08eb9526e3dcf829c326274eaf598c40bb5201705dc331cf`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/syntax-demo-app.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/syntax-demo-app.stderr.log`)
- `syntax-demo-build`: `/tmp/gondola-node22/node_modules/node/bin/node --check /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/demo/build.mjs` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `0d5d67f1b9c5fb3ff11dd2ee455a8343b3b569eb21461af1dd0ad224462b3c0d`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/syntax-demo-build.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/syntax-demo-build.stderr.log`)
- `syntax-demo-smoke`: `/tmp/gondola-node22/node_modules/node/bin/node --check /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/demo/smoke.mjs` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `28d5a24074d61a340634ff26ef7ea1ffd3767e94871b04789f00596422170230`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/syntax-demo-smoke.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/syntax-demo-smoke.stderr.log`)
- `syntax-shell-runner`: `bash -n /workspace/scratch/39a56936f173/gondola-methods/run-compiled-methods.sh` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/syntax-shell-runner.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/syntax-shell-runner.stderr.log`)
- `syntax-shell-inherited`: `bash -n /workspace/scratch/39a56936f173/gondola-methods/run-compiled-backends.sh` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/syntax-shell-inherited.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/syntax-shell-inherited.stderr.log`)
- `version-root-go`: `go version` (exit 0; stdout SHA-256 `a25c9afbc0b5cef0771a799565082fe511d668065f83bd54750592f8102aa9f3`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/version-root-go.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/version-root-go.stderr.log`)
- `version-compiled-go`: `go version` (exit 0; stdout SHA-256 `5707bf75dd54b4fdd5ac209444d48c9c4179ebf8510f80e2f7293dfbedc1012b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/version-compiled-go.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/version-compiled-go.stderr.log`)
- `method-owned-node-tests`: `/tmp/gondola-node22/node_modules/node/bin/node --test /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/browser/dom-oracle.test.mjs /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/conformance/check.test.mjs` (exit 0; stdout SHA-256 `4ecc0f43e206b41f8c8c1209d2bf3b4627588fff598056531a4edb0dfd556b3c`; stderr SHA-256 `d5fe1f1b11a4b068bc0f180e0427371a2886b68cebed09508251445012a62c76`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/method-owned-node-tests.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/method-owned-node-tests.stderr.log`)
- `method-go-tests`: `go test ./fixtures/compiled/methods ./cmd/compiled-native` (exit 0; stdout SHA-256 `73b7f2330f42d965f0e9791199c2c1298aeb6566b3cfc535854e183422661e66`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/method-go-tests.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/method-go-tests.stderr.log`)
- `build-native`: `go build -o /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/compiled-native ./cmd/compiled-native` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/build-native.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/build-native.stderr.log`)
- `compile-react`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `9133ca294ad48708bd35edc1d9d2e679c1e433c838ad966da873a8fcfbd202c8`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/compile-react.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/compile-react.stderr.log`)
- `compile-dom`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `8ec47e5f4e9e083353881993db1093e371fa9c37e9e49dd62c6184d032ff54b1`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/compile-dom.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/compile-dom.stderr.log`)
- `method-conformance`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/conformance/run.mjs --app-ir /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/builds/react/apps/methods-0cac42b0a982/app-ir.json --compiled /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/builds/react/apps/methods-0cac42b0a982/gobi-compiled.mjs --helpers /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/builds/react/apps/methods-0cac42b0a982/encoder.mjs --dom-app-ir /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/builds/dom/apps/methods-0cac42b0a982/app-ir.json --dom-compiled /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/builds/dom/apps/methods-0cac42b0a982/gobi-compiled.mjs --dom-helpers /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/builds/dom/apps/methods-0cac42b0a982/encoder.mjs --native-bin /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/compiled-native --fixture /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/conformance/fixtures/methods.json --schedule /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/conformance/swap-schedule.json --browser-adapter /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/browser/runner.mjs --output /workspace/scratch/39a56936f173/gondola-methods/compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/matrix/methods --chromium /tmp/chromium` (exit 1; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `ce970828b030b32c64d9da1352841bf673dc0bc34e5b7de16a602fdfd6ef33b4`; logs `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/method-conformance.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/method-conformance.stderr.log`)

## Versions

- node: `v22.23.4`
- react: `19.3.1`
- reactDOM: `19.3.1`
- playwright: `1.64.1`
- esbuild: `0.28.2`
- rootGo: `go version go1.24.0 linux/amd64`
- compiledGo: `go version go1.27.3 linux/amd64`

## Checks

- explicit --methods-only route skipped the inherited full runner
- method runner, demo modules, and shell entrypoints passed syntax checks
- Node v22.23.4 ran all 2 compiled-methods browser and conformance test files
- Go 1.24 method fixture and native replay tests passed; native binary built
- react method app built by gobi-build and every output matched BuildResult
- dom method app built by gobi-build and every output matched BuildResult
- React/DOM method outputs share one AppIR and encoder; raw compiled module pins remain separate

## Method build and matrix

`compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/` retains per-backend build requests/results/output pins, the registered native binary, conformance outputs, the HTTP build, smoke JSON, and screenshot. The build uses a single actual GoScript method app per profile. The conformance driver uses the React build's one compiled module in the React, DOM, and swap profiles; React and DOM raw bundle hashes are retained independently.

- Method fixture: `compiled-methods/conformance/fixtures/methods.json`
- Fixture script SHA-256: `fb8a0d6bb1bb82df318450bd819e9c56114625a03324725e9bedd04846f70cc7`
- Fixture matrix status: `not run` (? ticks; ? actions; ? suppressed intents)
- HTTP demo smoke status: `not run`
- Screenshot: `not captured`

## Failures

- method-conformance: (node:666) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)
Error: methods conformance rejected: ENOENT: no such file or directory, open '/workspace/scratch/39a56936f173/gondola-methods/compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/builds/request.json'; ENOENT: no such file or directory, open '/workspace/scratch/39a56936f173/gondola-methods/compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/builds/request.json'; full check withheld because one or more required evidence stages did not pass; ENOENT: no such file or directory, open '/workspace/scratch/39a56936f173/gondola-methods/compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/builds/request.json'
    at runMethodsConformance (file:///workspace/scratch/39a56936f173/gondola-methods/compiled-methods/conformance/run.mjs:428:19)
    at async main (file:///workspace/scratch/39a56936f173/gondola-methods/compiled-methods/conformance/run.mjs:436:18)
- runner: method-conformance failed; output is retained at compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/method-conformance.stdout.log and compiled-methods/artifacts/attempts/attempt-20261031T042358210Z/logs/method-conformance.stderr.log

## Limits

- The demo runs the compiled GoScript module with the existing runtime and React/DOM renderers. UI listeners forward Gobi actions; application state transitions remain in Go.
- The child read-only policy and saved-value behavior are fixture Go methods. The page's renderer selector only calls `replaceRenderer`; no JavaScript reducer or WASM runtime is used.
- The explicit --methods-only route skipped the inherited full regression runner.
- Any uncompleted command, source mismatch, output mismatch, or missing evidence leaves this execution failed/partial.
