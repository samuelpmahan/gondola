# E-HARNESS — compiled keyed children conformance

Outcome: **mixed_change** (matched).

Matched 42 source events and 38 Go updates across native Go, direct React/DOM compiled modules, and three mounted browser profiles; detected 12 captured-data mutations; ran 3 bounded seeded schedules.

## Evidence

- Fixed fixture: fixtures/compiled/children/scenario.json (42 source events).
- Literal expectations: compiled-children/oracle/expectations.json; native/direct/browser checks are compared against all typed state fields, complete Gobi view trees, and captured DOM.
- Seeds: 20261031, 20261032, 20261033; the first seed also ran through the mounted browser renderer swap.
- Versions: Node v22.23.4; go version go1.24.0 linux/amd64; Chromium 153.0.8010.0; Playwright 1.64.1.
- Inputs stable during capture: source=true, buildOutputs=true.
- Pin scope: consumed fixture/oracle core, harness, runtime/frontend, Go fixture/native CLI, and emitted build inputs; separately owned `oracle/custody/` artifacts are not imported or pinned by this harness.
- Checker and seeded unit tests: 18/18 passed using Node 22.
- Captured-data mutation controls detected: 12.
- Compressed raw traces: compiled-children/coordination/rawlogs/E-HARNESS-20261031T125654.208Z-2 (compiled-children/coordination/rawlogs/E-HARNESS-20261031T125654.208Z-2/native.json.gz 999d18da2b9203ae7f72d8c50fe5de49fb1920c6872ee1567089f9d4811389e3, compiled-children/coordination/rawlogs/E-HARNESS-20261031T125654.208Z-2/direct-react.json.gz 9ed4af83c757198f1da67baa6b939113aa8662dd6215fe1433f827fde59b911c, compiled-children/coordination/rawlogs/E-HARNESS-20261031T125654.208Z-2/direct-dom.json.gz f3360a23d51ea233a3c315171b0696c3ca853cc99a3717f77d7a3a094c795e2c, compiled-children/coordination/rawlogs/E-HARNESS-20261031T125654.208Z-2/browser.json.gz 464cef00c9dbc7955d47e4a96c2fa2418ecc50aa12e879619ae1b3e347e06202, compiled-children/coordination/rawlogs/E-HARNESS-20261031T125654.208Z-2/check.json.gz 8d7a1e494db3c3f760abe7619492fa097f073df0609913179e58a73d590ae910, compiled-children/coordination/rawlogs/E-HARNESS-20261031T125654.208Z-2/seeded.json.gz 6bdee345d2dbf989e8ac652fab3b43dbe1e38a352c9f7294fede510a33ff6aac, compiled-children/coordination/rawlogs/E-HARNESS-20261031T125654.208Z-2/unit-test-stdout.log.gz 6d774ec8f87e03904770991133988900e5a7dac01877f509b64b2b87046fd5ec, compiled-children/coordination/rawlogs/E-HARNESS-20261031T125654.208Z-2/unit-test-stderr.log.gz 9ae9ecd94fbf5cd97ed0d3fdf69fd1e8d9fd154dab12d35000e520cee011d8a5, compiled-children/coordination/rawlogs/E-HARNESS-20261031T125654.208Z-2/run.json.gz 6682b7655273230a765bdff0eb191e07699a5896ab9ca6b40d7116e7f18be92f, compiled-children/coordination/rawlogs/E-HARNESS-20261031T125654.208Z-2/manifest.json.gz cf9f7c918399562d14bec0bd7eebc301c505ee24851c6c477e82caea8995aa56).
- Run record: compiled-children/conformance/evidence/E-FIX-HARNESS-LIVENESS-20261031-01/replay.run.json.
- Raw browser/native/direct evidence prefix: compiled-children/conformance/evidence/E-FIX-HARNESS-LIVENESS-20261031-01/replay.

## Commands and failures

- native-go-version: `/tmp/gondola-go/bin/go version`.
- checker-and-seeded-unit-tests: `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/conformance/check.test.mjs compiled-children/conformance/seeded.test.mjs compiled-children/conformance/swap-contract.test.mjs`.
- native-fixed: `/tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script /workspace/scratch/39a56936f173/gondola-next/fixtures/compiled/children/scenario.json`.
- native-seed-20261031: `/tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script /workspace/scratch/39a56936f173/gondola-next/compiled-children/conformance/evidence/E-FIX-HARNESS-LIVENESS-20261031-01/replay.seed-20261031.scenario.json`.
- native-seed-20261032: `/tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script /workspace/scratch/39a56936f173/gondola-next/compiled-children/conformance/evidence/E-FIX-HARNESS-LIVENESS-20261031-01/replay.seed-20261032.scenario.json`.
- native-seed-20261033: `/tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script /workspace/scratch/39a56936f173/gondola-next/compiled-children/conformance/evidence/E-FIX-HARNESS-LIVENESS-20261031-01/replay.seed-20261033.scenario.json`.
- Harness invocation: `/tmp/gondola-node22/node_modules/node/bin/node compiled-children/conformance/run.mjs --native-go /tmp/gondola-go/bin/go --fixture fixtures/compiled/children/scenario.json --expectations compiled-children/oracle/expectations.json --react-manifest compiled-children/compiler-evidence/build/react-repeat/buildmanifest.json --dom-manifest compiled-children/compiler-evidence/build/dom/buildmanifest.json --chromium /tmp/chromium --output /workspace/scratch/39a56936f173/gondola-next/compiled-children/conformance/evidence/E-FIX-HARNESS-LIVENESS-20261031-01/replay`.
- Failures: none in this attempt.

Seeded traces are finite deterministic samples. They check native/direct parity and one mounted browser sample; the N5 literal oracle remains the fixed-script authority.
