# E-DELIVERY: compiled keyed child collection delivery

**Outcome: mixed_change. Status: passed.** The full inherited capability chain, fresh React/DOM collection builds, N5 literal oracle, N4 native/direct/browser parity, HTTP smoke, source boundaries, and immutable archive all passed.

## Commands and versions

- Attempt: `compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7` (full mode, Node v22.23.4, root Go go version go1.24.0 linux/amd64, compiler Go go version go1.27.3 linux/amd64, Chromium Chromium 153.0.8010.0).
- Fixture: `fixtures/compiled/children/scenario.json`; scenario seed: `fixed frozen fixture; seeded sequence seed is recorded by N4 harness output`.
- `version-npm`: `npm --version` (exit 0; stdout SHA-256 `d9f29f5aab43c8c1a8d6acc856e258b89735f541aa5e1f07b39a62f28bfa8d06`; stderr SHA-256 `6efb89c5491111e153af087b51e267921a1d604a8feff76a61da444f78049cad`).
- `version-root-go`: `go version` (exit 0; stdout SHA-256 `a25c9afbc0b5cef0771a799565082fe511d668065f83bd54750592f8102aa9f3`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `version-compiler-go`: `go version` (exit 0; stdout SHA-256 `5707bf75dd54b4fdd5ac209444d48c9c4179ebf8510f80e2f7293dfbedc1012b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `version-chromium`: `/tmp/chromium --version` (exit 0; stdout SHA-256 `685fc1764b9a92beaca4b87593f55170ca6b158f4179690064c25a352f08531b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `inherited-full-capabilities`: `bash /workspace/scratch/39a56936f173/gondola-children-archive/run-compiled-capabilities.sh` (exit 0; stdout SHA-256 `2cca227b4529c184fbb9a3ee1de423acf7c079c03c87626dbb53d030de2ee2fc`; stderr SHA-256 `0149ac3f227bc008b78d73e31dd17fbe7234313028f4da10b8f154031845b71e`).
- `new-host-and-harness-unit-tests`: `/tmp/gondola-node22/node_modules/node/bin/node --test /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/conformance/browser-version.test.mjs /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/conformance/check.test.mjs /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/conformance/seeded.test.mjs /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/conformance/swap-contract.test.mjs /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/inherited-acceptance.test.mjs /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/runtime/runtime.test.mjs /workspace/scratch/39a56936f173/gondola-children-archive/compiled-frontend/conformance/no-wasm.test.mjs` (exit 0; stdout SHA-256 `543af0a9ad9bb2ec4fde549e51c77b640f5468047b7b139641794559519d449e`; stderr SHA-256 `02712b004d33f7712fd1791e5d9013df620dc8dd5be6f02668428eac2752c6e6`).
- `compile-react-goscript`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `2701c3d6a9c81f9416ac916db5c2727113798477db8e45f63ea8db9b5d3361a9`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `compile-dom-goscript`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `e4055cf84b12ae69f13469b0a5b173cc08ea241e9f555af9d4746caad42f67ea`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `n5-independent-literal-oracle`: `/tmp/gondola-node22/node_modules/node/bin/node --test /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/oracle/oracle.test.mjs` (exit 0; stdout SHA-256 `dc16b61887dead9e79aeefebb254fab79601e7d5dca7bd2b452ad948f28a303e`; stderr SHA-256 `419220fc7f68edba1be3cde44e510dee02d8fdc317ac49bc18a4740072df3c7a`).
- `n4-native-direct-browser-harness`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/conformance/run.mjs --native-go /tmp/gondola-go/bin/go --fixture /workspace/scratch/39a56936f173/gondola-children-archive/fixtures/compiled/children/scenario.json --expectations /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/oracle/expectations.json --react-manifest /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7/react/output/buildmanifest.json --dom-manifest /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7/dom/output/buildmanifest.json --chromium /tmp/chromium --output /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7/harness/run` (exit 0; stdout SHA-256 `5d4ab43a084f8186a6b1fda2da3c0bef17d1abfcdf0ef51db6b00218cddf698a`; stderr SHA-256 `f88ae1b08439614ddd5c1142fc0d530046531431974f8a9dc99c1ed373995ed7`).
- `build-http-demo`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/build.mjs --compiled /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7/react/output --output /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7/demo/site --backend react` (exit 0; stdout SHA-256 `dfbc91157a904712415aca22026abe183b0d42334eb611414c305954059fadae`; stderr SHA-256 `4ccb2d57bf0fbf496c0c3f1f99e4a7bfa7675b495c47708bd5dc7ca7b6a1a9e0`).
- `http-browser-smoke`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/smoke.mjs --demo /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7/demo/site --output /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7/demo/smoke.json --screenshot /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7/demo/screenshot.png --chromium /tmp/chromium --port 0` (exit 0; stdout SHA-256 `6921085b9e7faaeea52d79d18e28b562e9fb755768be86a0dbe0b5f95834367b`; stderr SHA-256 `5e4095072af752f2867cc5789f12ebe2d6b2a8c9ac8924376d49b695b5354456`).
- `archive-capability-artifacts`: `tar -czf /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7.tar.gz -C /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7 --no-recursion --null --files-from /tmp/gobi-capability-archive-list-Fp2RQS/members.nul` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `list-capability-archive`: `tar -tzf /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7.tar.gz` (exit 0; stdout SHA-256 `e1377ed9287935ec35f7dbd315d712ef1221cdb9f390cdd28228fa5c6892b6d2`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `extract-capability-archive`: `tar -xzf /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7.tar.gz -C /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7/archive-verification` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `independent-post-command-archive-consumer`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/verify-archive.mjs --archive /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7.tar.gz --manifest /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7.archive-manifest.json --output /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7/provenance/post-command-archive-consumer.json --expected-archive-sha256 5c70c112bd8e9e1366ff572ebde718192236409739059246a422fff52c6c1b01 --expected-manifest-sha256 ba2e35fc2841aaf250e5d21fdfd6b84fba02dd4f5853bd84b6e562d3f0f17f5a` (exit 0; stdout SHA-256 `3abef0ea6a4593dbb9b43756ef217d940d4865941954fba0b93b07f872c4c971`; stderr SHA-256 `4b6b559e35fe50f69c647773a6e90aadecafd44c0fea2655b390d95fa5c07839`).

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
- immutable-archive-and-boundary-verification: **passed**

## Acceptance checks

- Any prior author E-DELIVERY report and receipt were preserved as read-only attempt provenance before canonical files were updated
- Go 1.24, compiler Go 1.27.3, Node 22, Chromium, React 19.3.1, dependency versions, and all existing npm lock hashes were verified
- fresh inherited E-BUILD passed the invocation-window, finish-time, actual current-source, immutable pre-archive snapshot, report, archive, manifest, and full lifecycle-command checks
- new N3 host, inherited-gate, shared no-WASM, and N4/N6 conformance tests passed under Node 22 (46/46)
- react collection fixture compiled through go run ./cmd/gobi-build and every BuildResult output hash was verified
- dom collection fixture compiled through go run ./cmd/gobi-build and every BuildResult output hash was verified
- React and DOM builds share byte-identical AppIR, encoder, and output path inventory
- N5's independent literal scenario expectations and negative checker controls passed
- N4 real native, direct-compiled, React, and DOM replay matched state, view tree, DOM order, swaps, pending replies, disabled behavior, and stale-generation rejection
- HTTP demo smoke passed 32 browser and endpoint checks against the compiled Go collection
- new archive and external manifest verified after commands; 417/417 member hashes round-tripped

## Archive and delivery boundary

The immutable pre-archive snapshot and 417-member tar round trip passed. Archive SHA-256: `5c70c112bd8e9e1366ff572ebde718192236409739059246a422fff52c6c1b01`; external manifest SHA-256: `ba2e35fc2841aaf250e5d21fdfd6b84fba02dd4f5853bd84b6e562d3f0f17f5a`. A separate Node consumer independently listed, extracted, and hashed all members after the archive command. The runner rechecked both outer hashes and source pins before finalizing this receipt.

Prior evidence limitation: The known prior local-container archive corruption remains excluded; its evidence is not copied, repaired, rewritten, or used for this run. The new attempt has independent archive and delivery verification. The accepted prior evidence identifier is `978eaea98831154f8152baa1a64f1d1356916596`.

## Failures and mismatches

- No failures recorded.

Inherited chain: passed. N4 harness: matched. N5 literal oracle: Node test runner: 9/9 passed. HTTP demo: passed.

The prior local-container archive was left untouched and is not acceptance evidence. This report does not claim hosted CI success unless a separate run artifact is supplied and matched to this exact source and receipt.
