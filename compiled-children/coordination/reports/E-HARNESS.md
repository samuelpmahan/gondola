# E-HARNESS — compiled keyed children conformance

Outcome: **mixed_change** (matched).

Matched 42 source events and 38 Go updates across native Go, direct React/DOM compiled modules, and three mounted browser profiles; detected 6 captured-data mutations; ran 3 bounded seeded schedules.

## Evidence

- Fixed fixture: fixtures/compiled/children/scenario.json (42 source events).
- Literal expectations: compiled-children/oracle/expectations.json; native/direct/browser checks are compared against all typed state fields, complete Gobi view trees, and captured DOM.
- Seeds: 20261031, 20261032, 20261033; the first seed also ran through the mounted browser renderer swap.
- Versions: Node v22.23.4; go version go1.24.0 linux/amd64; Chromium 153.0.8010.0; Playwright 1.64.1.
- Inputs stable during capture: source=true, buildOutputs=true.
- Pin scope: consumed fixture/oracle core, harness, runtime/frontend, Go fixture/native CLI, and emitted build inputs; separately owned `oracle/custody/` artifacts are not imported or pinned by this harness.
- Checker and seeded unit tests: 9/9 passed using Node 22.
- Captured-data mutation controls detected: 6.
- Compressed raw traces: compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2 (compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/native.json.gz 999d18da2b9203ae7f72d8c50fe5de49fb1920c6872ee1567089f9d4811389e3, compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/direct-react.json.gz 9ed4af83c757198f1da67baa6b939113aa8662dd6215fe1433f827fde59b911c, compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/direct-dom.json.gz f3360a23d51ea233a3c315171b0696c3ca853cc99a3717f77d7a3a094c795e2c, compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/browser.json.gz b578feb89f9c1b8c23cb25c946811d207391e535ddb0e9be00ef98826cb9979a, compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/check.json.gz 324f127cb68430c66eca722cd3170a5375701adc093629630df47e6bfd80fed1, compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/seeded.json.gz c60e211875a306774f84383e7cbcfc624e51029e60ea6653f7f1b09ccb7099cd, compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/unit-test-stdout.log.gz 65714af27e646dad54b4880ab623736bbaf6b71281b80d06b17fcee4902b07ef, compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/unit-test-stderr.log.gz 032af0a32aab8e5c8556cad68ccf4e2471c3aa97a41b251e75aac7a2b081914c, compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/run.json.gz 2851743764da36a86aefc3f05dd5529d6e1b479494137a8d1a46a92f650ae38a, compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/manifest.json.gz 54e2ab6ae52b01f91c5c229f1fa8749477b4e75ecbb4b7e573b2eaa1cbe60fd0).
- Run record: ../../../../tmp/gobi-children-n4-attempt12.run.json.
- Raw browser/native/direct evidence prefix: ../../../../tmp/gobi-children-n4-attempt12.

## Commands and failures

- native-go-version: `/tmp/gondola-go/bin/go version`.
- checker-and-seeded-unit-tests: `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/conformance/check.test.mjs compiled-children/conformance/seeded.test.mjs`.
- native-fixed: `/tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script /workspace/scratch/39a56936f173/gondola-next/fixtures/compiled/children/scenario.json`.
- native-seed-20261031: `/tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script /tmp/gobi-children-n4-attempt12.seed-20261031.scenario.json`.
- native-seed-20261032: `/tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script /tmp/gobi-children-n4-attempt12.seed-20261032.scenario.json`.
- native-seed-20261033: `/tmp/gondola-go/bin/go run ./cmd/compiled-children-native --script /tmp/gobi-children-n4-attempt12.seed-20261033.scenario.json`.
- Harness invocation: `/tmp/gondola-node22/node_modules/node/bin/node compiled-children/conformance/run.mjs --native-go /tmp/gondola-go/bin/go --fixture fixtures/compiled/children/scenario.json --expectations compiled-children/oracle/expectations.json --react-manifest compiled-children/compiler-evidence/build/react/buildmanifest.json --dom-manifest compiled-children/compiler-evidence/build/dom/buildmanifest.json --chromium /tmp/chromium --output /tmp/gobi-children-n4-attempt12`.
- Failures: none in this attempt.

Seeded traces are finite deterministic samples. They check native/direct parity and one mounted browser sample; the N5 literal oracle remains the fixed-script authority.
