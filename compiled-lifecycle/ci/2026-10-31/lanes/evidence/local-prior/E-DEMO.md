# E-DEMO (compiled Go value methods)

**Outcome: mixed_change.** The nested value-method app compiles through the existing GoScript CLI, matches native/direct/React/DOM/swap traces, and runs in a real HTTP demo using the existing runtime and both renderers.

## Execution

- Mode: `full`
- Status: `passed`
- Attempt: `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z`
- Invocation: `bash run-compiled-methods.sh` 
- Source pins: stable (137 before, 137 after)
- Started: 2026-10-31T06:36:06.561Z
- Finished: 2026-10-31T06:58:15.145Z

Inherited backend receipt: `compiled-backends/coordination/receipts/E-DEMO.json` (SHA-256 `e0a01a411bd1fb38d6a2fe5bb602873003064d9bdf37b20dd52efe43fdc4af0a`, mode `full`, status `passed`).

## Commands

- `inherited-full-runner`: `bash /workspace/scratch/39a56936f173/gondola/run-compiled-backends.sh` (exit 0; stdout SHA-256 `3c89ac65b6aeef4872c1879a82b938be489d30f5e62b0b07ac1aa65894b27832`; stderr SHA-256 `fbd225f885d630dc79d8364944905ccb081b7e0939b813fcc3c0c828b9fdd785`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/inherited-full-runner.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/inherited-full-runner.stderr.log`)
- `syntax-runner`: `/tmp/gondola-node22/node_modules/node/bin/node --check /workspace/scratch/39a56936f173/gondola/compiled-methods/run.mjs` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `209c7997119474ebfe8fa1ba88398a848f660c6f9272735d077598fde5e0b971`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/syntax-runner.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/syntax-runner.stderr.log`)
- `syntax-demo-app`: `/tmp/gondola-node22/node_modules/node/bin/node --check /workspace/scratch/39a56936f173/gondola/compiled-methods/demo/app.mjs` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `86bb74b5081ed8ee5eb8541a82981909c7bad052afe8ee2a79af365b8ee9b6ea`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/syntax-demo-app.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/syntax-demo-app.stderr.log`)
- `syntax-demo-build`: `/tmp/gondola-node22/node_modules/node/bin/node --check /workspace/scratch/39a56936f173/gondola/compiled-methods/demo/build.mjs` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `bc115f4e8db936165dc86b1a1a8a87b81a988464a6769084ad7f7be112bc0d16`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/syntax-demo-build.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/syntax-demo-build.stderr.log`)
- `syntax-demo-smoke`: `/tmp/gondola-node22/node_modules/node/bin/node --check /workspace/scratch/39a56936f173/gondola/compiled-methods/demo/smoke.mjs` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e6d825dc0f1852fae501374813aa26c548fd0687004f94fd233e4ad986038416`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/syntax-demo-smoke.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/syntax-demo-smoke.stderr.log`)
- `syntax-shell-runner`: `bash -n /workspace/scratch/39a56936f173/gondola/run-compiled-methods.sh` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/syntax-shell-runner.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/syntax-shell-runner.stderr.log`)
- `syntax-shell-inherited`: `bash -n /workspace/scratch/39a56936f173/gondola/run-compiled-backends.sh` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/syntax-shell-inherited.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/syntax-shell-inherited.stderr.log`)
- `version-root-go`: `go version` (exit 0; stdout SHA-256 `a25c9afbc0b5cef0771a799565082fe511d668065f83bd54750592f8102aa9f3`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/version-root-go.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/version-root-go.stderr.log`)
- `version-compiled-go`: `go version` (exit 0; stdout SHA-256 `5707bf75dd54b4fdd5ac209444d48c9c4179ebf8510f80e2f7293dfbedc1012b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/version-compiled-go.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/version-compiled-go.stderr.log`)
- `method-owned-node-tests`: `/tmp/gondola-node22/node_modules/node/bin/node --test /workspace/scratch/39a56936f173/gondola/compiled-methods/browser/dom-oracle.test.mjs /workspace/scratch/39a56936f173/gondola/compiled-methods/conformance/check.test.mjs` (exit 0; stdout SHA-256 `b37255e25f52dd89cc3b2d5704008d924c73df68416c9097fb05c77dc041c45d`; stderr SHA-256 `1c7ccf64bccc10bc7751611c28daf1e757e9ffd53065235851b345fd6f4f8ec7`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/method-owned-node-tests.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/method-owned-node-tests.stderr.log`)
- `method-go-tests`: `go test ./fixtures/compiled/methods ./cmd/compiled-native` (exit 0; stdout SHA-256 `73b7f2330f42d965f0e9791199c2c1298aeb6566b3cfc535854e183422661e66`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/method-go-tests.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/method-go-tests.stderr.log`)
- `build-native`: `go build -o /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/compiled-native ./cmd/compiled-native` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/build-native.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/build-native.stderr.log`)
- `compile-react`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `541ec4c61bef727679ebb75c6b5e1ef2b7464e29849a3a9979655e6d24724214`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/compile-react.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/compile-react.stderr.log`)
- `compile-dom`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `0954a5dbc33c38d3f683ff77844a0edf060f71a55d4bf2ce4719e7120c5e642f`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/compile-dom.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/compile-dom.stderr.log`)
- `method-conformance`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola/compiled-methods/conformance/run.mjs --app-ir /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/builds/react/output/apps/methods-0cac42b0a982/app-ir.json --compiled /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/builds/react/output/apps/methods-0cac42b0a982/gobi-compiled.mjs --helpers /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/builds/react/output/apps/methods-0cac42b0a982/encoder.mjs --dom-app-ir /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/builds/dom/output/apps/methods-0cac42b0a982/app-ir.json --dom-compiled /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/builds/dom/output/apps/methods-0cac42b0a982/gobi-compiled.mjs --dom-helpers /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/builds/dom/output/apps/methods-0cac42b0a982/encoder.mjs --native-bin /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/compiled-native --fixture /workspace/scratch/39a56936f173/gondola/compiled-methods/conformance/fixtures/methods.json --schedule /workspace/scratch/39a56936f173/gondola/compiled-methods/conformance/swap-schedule.json --browser-adapter /workspace/scratch/39a56936f173/gondola/compiled-methods/browser/runner.mjs --output /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/matrix/methods --chromium /tmp/chromium` (exit 0; stdout SHA-256 `33951d1783deb5b1605a4a60a3e39692bedcfaf3e8bd021fb32119f453985ddd`; stderr SHA-256 `ec408e63372eca0dba5a1996acfbbabbb19ecf8d69630786fccf1a9e3e01e4f5`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/method-conformance.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/method-conformance.stderr.log`)
- `build-http-demo`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola/compiled-methods/demo/build.mjs --compiled /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/builds/react/output --output /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/http-demo/site --backend react` (exit 0; stdout SHA-256 `ec59c3b7771da962b01f76b8f29a1fb61beef46a3f2cf4c02d665ad803d9ed2a`; stderr SHA-256 `29e4a57282ab7b0273b5e04920dc14dc7ad6e6d26eba3484269abdd3bd80b8b6`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/build-http-demo.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/build-http-demo.stderr.log`)
- `http-demo-smoke`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola/compiled-methods/demo/smoke.mjs --demo /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/http-demo/site --output /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/http-demo/demo-smoke.json --screenshot /workspace/scratch/39a56936f173/gondola/compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/http-demo/demo.png` (exit 0; stdout SHA-256 `12eb51477ffa6bfdec51f6acecbb18ead49e3d5fd96b82be8744326ad9acb70d`; stderr SHA-256 `c3d994ed22797f4a36bc777bdb7d76a5f6e9cf71aa6e94e111b42ce4a3112234`; logs `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/http-demo-smoke.stdout.log`, `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/logs/http-demo-smoke.stderr.log`)

## Versions

- node: `v22.23.4`
- react: `19.3.1`
- reactDOM: `19.3.1`
- playwright: `1.64.1`
- esbuild: `0.28.2`
- rootGo: `go version go1.24.0 linux/amd64`
- compiledGo: `go version go1.27.3 linux/amd64`

## Checks

- default full run-compiled-backends.sh completed before method-specific validation
- method runner, demo modules, and shell entrypoints passed syntax checks
- Node v22.23.4 ran all 2 compiled-methods browser and conformance test files
- Go 1.24 method fixture and native replay tests passed; native binary built
- react method app built by gobi-build and every output matched BuildResult
- dom method app built by gobi-build and every output matched BuildResult
- React/DOM method outputs share one AppIR and encoder; raw compiled module pins remain separate
- native, direct GoScript, React, DOM, and alternating-swap method fixture traces matched
- local HTTP demo exercised Go methods, read-only child behavior, saved capture, and state-preserving renderer swaps
- React and DOM method build outputs remained byte-stable through conformance and HTTP smoke

## Method build and matrix

`compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/` retains per-backend build requests/results/output pins, the registered native binary, conformance outputs, the HTTP build, smoke JSON, and screenshot. The build uses a single actual GoScript method app per profile. The conformance driver uses the React build's one compiled module in the React, DOM, and swap profiles; React and DOM raw bundle hashes are retained independently.

- Method fixture: `compiled-methods/conformance/fixtures/methods.json`
- Fixture script SHA-256: `fb8a0d6bb1bb82df318450bd819e9c56114625a03324725e9bedd04846f70cc7`
- Fixture matrix status: `matched` (19 ticks; 18 actions; 4 suppressed intents)
- HTTP demo smoke status: `passed`
- Screenshot: `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/http-demo/demo.png`

## Failures

- None recorded.

## Limits

- The demo runs the compiled GoScript module with the existing runtime and React/DOM renderers. UI listeners forward Gobi actions; application state transitions remain in Go.
- The child read-only policy and saved-value behavior are fixture Go methods. The page's renderer selector only calls `replaceRenderer`; no JavaScript reducer or WASM runtime is used.
- The full inherited run-compiled-backends.sh completed before method-specific compilation and smoke checks.
- Any uncompleted command, source mismatch, output mismatch, or missing evidence leaves this execution failed/partial.
