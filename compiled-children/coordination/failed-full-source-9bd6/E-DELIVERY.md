# E-DELIVERY: compiled keyed child collection delivery

**Outcome: mixed_change. Status: failed.** 3 failure(s) were recorded; this full delivery attempt is not accepted.

## Commands and versions

- Attempt: `compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6` (full mode, Node v22.23.4, root Go go version go1.24.0 linux/amd64, compiler Go go version go1.27.3 linux/amd64, Chromium Chromium 153.0.8010.0).
- Fixture: `fixtures/compiled/children/scenario.json`; scenario seed: `fixed frozen fixture; seeded sequence seed is recorded by N4 harness output`.
- `version-npm`: `npm --version` (exit 0; stdout SHA-256 `d9f29f5aab43c8c1a8d6acc856e258b89735f541aa5e1f07b39a62f28bfa8d06`; stderr SHA-256 `63b2aa7b20873f588da07fa83d08035a04ffc8be5586f36b6c0d41a66d19b9d5`).
- `version-root-go`: `go version` (exit 0; stdout SHA-256 `a25c9afbc0b5cef0771a799565082fe511d668065f83bd54750592f8102aa9f3`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `version-compiler-go`: `go version` (exit 0; stdout SHA-256 `5707bf75dd54b4fdd5ac209444d48c9c4179ebf8510f80e2f7293dfbedc1012b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `version-chromium`: `/tmp/chromium --version` (exit 0; stdout SHA-256 `685fc1764b9a92beaca4b87593f55170ca6b158f4179690064c25a352f08531b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `inherited-full-capabilities`: `bash /workspace/scratch/39a56936f173/gondola-next/run-compiled-capabilities.sh` (exit 0; stdout SHA-256 `8321f9729b659c6309fedd7ede9b6ebbf4dbae06d8b7e34c85143393b9b8c1bd`; stderr SHA-256 `0149ac3f227bc008b78d73e31dd17fbe7234313028f4da10b8f154031845b71e`).
- `new-host-and-harness-unit-tests`: `/tmp/gondola-node22/node_modules/node/bin/node --test /workspace/scratch/39a56936f173/gondola-next/compiled-children/conformance/check.test.mjs /workspace/scratch/39a56936f173/gondola-next/compiled-children/conformance/seeded.test.mjs /workspace/scratch/39a56936f173/gondola-next/compiled-children/conformance/swap-contract.test.mjs /workspace/scratch/39a56936f173/gondola-next/compiled-children/inherited-acceptance.test.mjs /workspace/scratch/39a56936f173/gondola-next/compiled-children/runtime/runtime.test.mjs /workspace/scratch/39a56936f173/gondola-next/compiled-frontend/conformance/no-wasm.test.mjs` (exit 0; stdout SHA-256 `06f0bda20ae3aa6d07b12f75ad80e08e091dde7b4e4ea23ca07b0d2f54df133f`; stderr SHA-256 `25d38ddd5f8115aa13d76abd7faf530010e527be4d0acbcd97ddd464097377df`).
- `compile-react-goscript`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `9e4010aeca5a8e20886ac375da618d7e123c4295873b0c6d29a4af9e2935193c`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `compile-dom-goscript`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `957104c7fb0aaacec9bfb44a1a1e349bda533de65790238d2f08719a70773e13`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `n5-independent-literal-oracle`: `/tmp/gondola-node22/node_modules/node/bin/node --test /workspace/scratch/39a56936f173/gondola-next/compiled-children/oracle/oracle.test.mjs` (exit 0; stdout SHA-256 `814b6e9a93b3cd388fc7aa1b568fbb992bdee07220f41262e919cd55f8a1d5ea`; stderr SHA-256 `e33b9d01bfb50942acb4fbe6f5864d630947d9e4c2f1039884fdaa4f6d7cb82c`).
- `n4-native-direct-browser-harness`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-next/compiled-children/conformance/run.mjs --native-go /tmp/gondola-go/bin/go --fixture /workspace/scratch/39a56936f173/gondola-next/fixtures/compiled/children/scenario.json --expectations /workspace/scratch/39a56936f173/gondola-next/compiled-children/oracle/expectations.json --react-manifest /workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6/react/output/buildmanifest.json --dom-manifest /workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6/dom/output/buildmanifest.json --chromium /tmp/chromium --output /workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6/harness/run` (exit 0; stdout SHA-256 `fe3c1e294ad6de5dbd97928d3965a43d58097595a5237a61f114e879003b2b27`; stderr SHA-256 `ec8eab5e1a0e41cd1e4b701b1ac99487e6588b627546f6e3d5e15a648d99eaf7`).
- `build-http-demo`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/build.mjs --compiled /workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6/react/output --output /workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6/demo/site --backend react` (exit 0; stdout SHA-256 `8eea7f9aaaf1374e1782cab0844376e2b0af5be45a9c9ae64c9bb24be85cab2b`; stderr SHA-256 `6218a30d78ba84651a61ca9c2fe4a16623f5323e816c716f1056ce6f0a7f8677`).
- `http-browser-smoke`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/smoke.mjs --demo /workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6/demo/site --output /workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6/demo/smoke.json --screenshot /workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6/demo/screenshot.png --chromium /tmp/chromium --port 0` (exit 0; stdout SHA-256 `f713e04fe37752014ed736dbe8d4f68e3bcc717308b86acb3eac54cc5f3d14a4`; stderr SHA-256 `35a6c6135aba3422721702064fe9cb402e188183a64cd3980ed154ddfd1b4355`).
- `archive-capability-artifacts`: `tar -czf /workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6.tar.gz -C /workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6 logs react dom harness oracle demo inherited provenance execution-before-archive.json` (exit 1; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `70ab9742719307234011e21cdd77c104ef66d1cc3870738d4ad5e38f6efe6c0d`).

## Stage ledger

- preflight-and-toolchain: **passed**
- fresh-full-inherited-capabilities-chain: **passed**
- new-host-and-harness-unit-tests: **passed**
- fresh-react-goscript-build: **passed**
- fresh-dom-goscript-build: **passed**
- react-dom-build-parity: **passed**
- n5-independent-literal-oracle: **passed**
- n4-native-direct-browser-harness: **passed**
- compiled-http-demo-and-browser-smoke: **passed**
- immutable-archive-and-boundary-verification: **failed** — archive-capability-artifacts failed; retained logs: compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6/logs/archive-capability-artifacts.stdout.log and compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6/logs/archive-capability-artifacts.stderr.log

## Acceptance checks

- Any prior author E-DELIVERY report and receipt were preserved as read-only attempt provenance before canonical files were updated
- Go 1.24, compiler Go 1.27.3, Node 22, Chromium, React 19.3.1, dependency versions, and all existing npm lock hashes were verified
- fresh inherited E-BUILD passed the invocation-window, finish-time, actual current-source, immutable pre-archive snapshot, report, archive, manifest, and full lifecycle-command checks
- new N3 host, inherited-gate, shared no-WASM, and N4/N6 conformance tests passed under Node 22 (44/44)
- react collection fixture compiled through go run ./cmd/gobi-build and every BuildResult output hash was verified
- dom collection fixture compiled through go run ./cmd/gobi-build and every BuildResult output hash was verified
- React and DOM builds share byte-identical AppIR, encoder, and output path inventory
- N5's independent literal scenario expectations and negative checker controls passed
- N4 real native, direct-compiled, React, and DOM replay matched state, view tree, DOM order, swaps, pending replies, disabled behavior, and stale-generation rejection
- HTTP demo smoke passed 32 browser and endpoint checks against the compiled Go collection

## Archive and delivery boundary

No complete archive verification was produced.

Prior evidence limitation: The known prior local-container archive corruption remains excluded; its evidence is not copied, repaired, rewritten, or used for this run. The new attempt has independent archive and delivery verification. The accepted prior evidence identifier is `978eaea98831154f8152baa1a64f1d1356916596`.

## Failures and mismatches

- archive-capability-artifacts: tar: harness: file changed as we read it
- stage:immutable-archive-and-boundary-verification: archive-capability-artifacts failed; retained logs: compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6/logs/archive-capability-artifacts.stdout.log and compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6/logs/archive-capability-artifacts.stderr.log
- archive-delivery-boundary: archive, manifest, or source boundary verification is incomplete

Inherited chain: passed. N4 harness: matched. N5 literal oracle: Node test runner: 9/9 passed. HTTP demo: passed.

The prior local-container archive was left untouched and is not acceptance evidence. This report does not claim hosted CI success unless a separate run artifact is supplied and matched to this exact source and receipt.
