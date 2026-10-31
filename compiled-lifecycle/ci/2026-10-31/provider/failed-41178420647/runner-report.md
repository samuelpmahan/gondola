# E-BUILD (compiled Go lifecycle)

**Outcome: mixed_change.** 2 failure(s) were recorded while completing the lifecycle evidence chain

## Execution

- Mode: `full`
- Status: `failed`
- Attempt: `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z`
- Invocation: `bash run-compiled-lifecycle.sh` 
- Source pins: stable (122 before, 122 after)
- Started: 2026-10-31T06:54:20.569Z
- Finished: 2026-10-31T07:18:50.268Z

Inherited run receipt: `compiled-methods/coordination/receipts/E-DEMO.json` (passed, mode full).

## Exact commands

- `inherited-full-runner`: `bash /home/runner/work/gondola/gondola/run-compiled-methods.sh` (exit 0; stdout SHA-256 `3534d7af850bd9276fd410d493724042a51f5416c04525f10f4749a1c0540570`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/inherited-full-runner.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/inherited-full-runner.stderr.log`)
- `version-npm`: `npm --version` (exit 0; stdout SHA-256 `d49bd31f65cb736f4045946e1c8365657cfed300dc0e4f173af5e93ab4500e1a`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/version-npm.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/version-npm.stderr.log`)
- `version-root-go`: `go version` (exit 0; stdout SHA-256 `07b0d66d21bcdfdc8456adcb17203f3af8656dc11549da62e6940f99b8d45444`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/version-root-go.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/version-root-go.stderr.log`)
- `version-compiled-go`: `go version` (exit 0; stdout SHA-256 `5707bf75dd54b4fdd5ac209444d48c9c4179ebf8510f80e2f7293dfbedc1012b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/version-compiled-go.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/version-compiled-go.stderr.log`)
- `lifecycle-go-tests`: `go test ./compilercontract ./gobi ./fixtures/compiled/lifecycle ./cmd/compiled-lifecycle-native` (exit 0; stdout SHA-256 `86a90409767a7d18ddd75378c848193164acbb343779c704ee983ea41a473846`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/lifecycle-go-tests.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/lifecycle-go-tests.stderr.log`)
- `lifecycle-compiler-go-tests`: `go test ./analyze ./build ./cmd/... ./emit` (exit 0; stdout SHA-256 `9eacb29a005eef7b8a607fa48f3b3e089da3475e852a05e9f2c6206e695b3f17`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/lifecycle-compiler-go-tests.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/lifecycle-compiler-go-tests.stderr.log`)
- `lifecycle-node-tests-before-build`: `/opt/hostedtoolcache/node/22.23.4/x64/bin/node --test /home/runner/work/gondola/gondola/compiled-frontend/frontend/dom/renderer.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/frontend/react/bindings.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/frontend/react/renderer.browser.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/frontend/react/renderer.test.mjs /home/runner/work/gondola/gondola/compiled-frontend/frontend/runtime/runtime.test.mjs /home/runner/work/gondola/gondola/compiled-lifecycle/browser/lifecycle-oracle.test.mjs /home/runner/work/gondola/gondola/compiled-lifecycle/conformance/check.test.mjs` (exit 0; stdout SHA-256 `61e0cc30043506454084693b304c34e1faafcc32c24043e8f6ef57c05a592e9e`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/lifecycle-node-tests-before-build.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/lifecycle-node-tests-before-build.stderr.log`)
- `build-native`: `go build -o /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/native/compiled-lifecycle-native ./cmd/compiled-lifecycle-native` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/build-native.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/build-native.stderr.log`)
- `native-cli-probe`: `/home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/native/compiled-lifecycle-native --script /home/runner/work/gondola/gondola/fixtures/compiled/lifecycle/scenario.json` (exit 0; stdout SHA-256 `ae38bab913056033f299d40441503ed7d18dae962e46f8273b36495317022f55`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/native-cli-probe.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/native-cli-probe.stderr.log`)
- `compile-react`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `cab680832f851676fe0e7e39c692b591fe8fd40e6f64d3a6e07643b8f90df945`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/compile-react.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/compile-react.stderr.log`)
- `compile-dom`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `432c4657b719fe08ea486ba43882c1c55e1b666cdfaa90ee3242ef0c289e1d6e`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/compile-dom.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/compile-dom.stderr.log`)
- `lifecycle-compiled-runtime-tests`: `/opt/hostedtoolcache/node/22.23.4/x64/bin/node --test /home/runner/work/gondola/gondola/compiled-lifecycle/runtime/runtime.test.mjs` (exit 0; stdout SHA-256 `423cb059cc96073a10f6d57271c0c8b6c07af7bbf11631cbe7ce3f2e7c8173ca`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/lifecycle-compiled-runtime-tests.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/lifecycle-compiled-runtime-tests.stderr.log`)
- `lifecycle-conformance`: `/opt/hostedtoolcache/node/22.23.4/x64/bin/node /home/runner/work/gondola/gondola/compiled-lifecycle/conformance/run.mjs --react-app-ir /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/react/output/apps/lifecycle-7e6575d90707/app-ir.json --react-compiled /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs --react-helpers /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/react/output/apps/lifecycle-7e6575d90707/encoder.mjs --dom-app-ir /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/dom/output/apps/lifecycle-7e6575d90707/app-ir.json --dom-compiled /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs --dom-helpers /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/dom/output/apps/lifecycle-7e6575d90707/encoder.mjs --native-go go --react-manifest /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/react/output/buildmanifest.json --dom-manifest /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/dom/output/buildmanifest.json --fixture /home/runner/work/gondola/gondola/fixtures/compiled/lifecycle/scenario.json --contract /home/runner/work/gondola/gondola/compiled-lifecycle/conformance/lifecycle-contract.json --schedule /home/runner/work/gondola/gondola/compiled-lifecycle/conformance/swap-schedule.json --output /home/runner/work/gondola/gondola/compiled-lifecycle/conformance/evidence/attempt-00/lifecycle` (exit 1; stdout SHA-256 `1ba79d9dc9bfb76681f7886b65802f6c67103c401ebe2514d32fcb3c270d4f6d`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/lifecycle-conformance.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/lifecycle-conformance.stderr.log`)
- `build-http-demo`: `/opt/hostedtoolcache/node/22.23.4/x64/bin/node /home/runner/work/gondola/gondola/compiled-lifecycle/demo/build.mjs --compiled /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/react/output --output /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/demo/site --backend react` (exit 0; stdout SHA-256 `8af96a95ff4db91e409aad904debd50d1787a70b208d761ad8f5fc0d1ee57c08`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/build-http-demo.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/build-http-demo.stderr.log`)
- `http-demo-smoke`: `/opt/hostedtoolcache/node/22.23.4/x64/bin/node /home/runner/work/gondola/gondola/compiled-lifecycle/demo/smoke.mjs --demo /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/demo/site --output /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/demo/demo-smoke.json --screenshot /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/demo/demo.png` (exit 0; stdout SHA-256 `4d9f11b5da7ad417ea66efbb19b6c6b75f7ab67b3931e808d1f9a0250deb5f97`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/http-demo-smoke.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/http-demo-smoke.stderr.log`)
- `archive-lifecycle-artifacts`: `tar -czf /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/lifecycle-artifacts.tar.gz -C /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z inherited react dom native demo matrix logs` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/archive-lifecycle-artifacts.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/archive-lifecycle-artifacts.stderr.log`)
- `list-lifecycle-archive`: `tar -tzf /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/lifecycle-artifacts.tar.gz` (exit 0; stdout SHA-256 `28e40e7db27d1a30ac11491c413dcc577d46a0d8e5cafd8cd96010b0d9a1f7c8`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/list-lifecycle-archive.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/list-lifecycle-archive.stderr.log`)
- `extract-lifecycle-archive`: `tar -xzf /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/lifecycle-artifacts.tar.gz -C /home/runner/work/gondola/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/archive-verification` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/extract-lifecycle-archive.stdout.log`, `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/extract-lifecycle-archive.stderr.log`)

## Toolchains

- node: `v22.23.4`
- npm: `10.9.9`
- rootGo: `go version go1.24.13 linux/amd64`
- compiledGo: `go version go1.27.3 linux/amd64`
- chromiumPath: `not detected`

## Checks

- copied 0 preintegration CLI source/request/result/log/output files into this attempt without replacing the original red or green records
- fresh full run-compiled-methods.sh completed before lifecycle-specific tests and matrix
- Go 1.24 compiler-contract, gobi, lifecycle fixture, and native adapter tests passed
- Go 1.27.3 compiled-frontend analyze/build/CLI/emit tests passed
- Node 22 browser, demo, conformance, renderer, shared-host-runtime, and lifecycle-oracle tests passed before output generation (7 test files)
- native lifecycle CLI binary executed the frozen fixture script and retained fixture.request and lifecycle.cancel effects under the package-path component ID
- react profile compiled one lifecycle package through the actual gobi-build CLI and pinned every BuildResult output
- react AppIR uses component ID github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle and declares effect.request-reply for fixture.request
- dom profile compiled one lifecycle package through the actual gobi-build CLI and pinned every BuildResult output
- dom AppIR uses component ID github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle and declares effect.request-reply for fixture.request
- Node 22 compiled lifecycle runtime integration tests passed against the fresh React GoScript output directory
- React and DOM profiles share AppIR/encoder and all non-manifest, non-module compiler files; raw bundles are retained separately with no cross-directory equality claim
- compiled lifecycle static HTTP demo smoke passed with captured screenshot and stable built site pins
- React and DOM compiler outputs stayed byte-stable through matrix and demo execution
- artifact archive contains 241 pinned build, native, matrix, demo, and log files and round-tripped every member hash

## React and DOM GoScript builds

Each actual `go run ./cmd/gobi-build` invocation has its own `request.json`, raw `result.json`, and `output/**` directory under `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/react` and `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/dom`. The output inventory matches `BuildResult.outputs`; AppIR and encoders are compared byte-for-byte. Separate raw module hashes are retained because temporary source labels can vary between build roots.

- React output files: 67
- DOM output files: 67
- AppIR component ID: `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`
- AppIR capabilities: `view.node, numeric.safe-integer, numeric.float64, effect.request-reply`
- AppIR byte-identical: true
- Encoder byte-identical: true
- Request/cancel ABI: `fixture.request/lookup/token/complete` and `lifecycle.cancel/cancel/token/empty-reply`.
- Raw module equality claimed: false

## Preserved feasibility attempts

- No earlier CLI feasibility artifacts were found.
- Earlier CLI requests, results, stderr, dependency logs, generated outputs, and rejected demo smoke are copied under `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/preflight` and included in the attempt archive.

## Native, direct, browser, and demo evidence

- Native binary: `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/native/compiled-lifecycle-native` (SHA-256 `897f021e17529503724c1535178255546308e98d365fe31ebd5ff57444837655`)
- Native fixture trace: `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/native-cli.json` (26 steps; 7 request effects; 3 cancellations)
- Conformance attempt: compiled-lifecycle/conformance/evidence/attempt-00
- Matrix status: rejected
- Matrix counts: `{}`
- Demo smoke: passed
- Screenshot: compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/demo/demo.png
- Archive: `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/lifecycle-artifacts.tar.gz` (SHA-256 `eb9c9678f224be7cedb2e95be845343320bf8fdf319481c6a6d568a8136a944d`, 241 members, round-trip verified)

## Failures

- lifecycle-conformance: lifecycle-conformance exited 1
- stage:native-direct-browser-matrix: lifecycle-conformance failed; output retained at compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/lifecycle-conformance.stdout.log and compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/logs/lifecycle-conformance.stderr.log
- runner: 2 failure(s) were recorded while completing the lifecycle evidence chain

## Limits

- AppIR v1 `effect.request-reply` is a coarse effect-route marker; this experiment mounts a closed lifecycle effect policy for `fixture.request` and `lifecycle.cancel`, and cancellation retires runtime correlations.
- The ordinary compiled runtime host still rejects `lifecycle.cancel`. Another frontend must implement this explicit lifecycle profile and pass the replay before claiming cancellation support.
- The fixture exercises the finite frozen lifecycle scenario and does not establish arbitrary Manager or pointer-owned Go compilation.
- Renderer replacement runs the same compiled Go module through the shipped React and DOM adapters; raw bundle bytes from separate output roots are pinned independently and are not normalized into an equality claim.
- The inherited full compiled-methods chain completed before lifecycle-specific validation.
- Any failed command, source-pin mismatch, missing trace, output mismatch, or demo failure leaves the overall execution failed.
