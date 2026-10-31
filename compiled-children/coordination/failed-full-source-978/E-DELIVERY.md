# E-DELIVERY: compiled keyed child collection delivery

**Outcome: mixed_change. Status: failed.** 2 failure(s) were recorded; this full delivery attempt is not accepted.

## Commands and versions

- Attempt: `compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7` (full mode, Node v22.23.4, root Go go version go1.24.0 linux/amd64, compiler Go go version go1.27.3 linux/amd64, Chromium Chromium 153.0.8010.0).
- Fixture: `fixtures/compiled/children/scenario.json`; scenario seed: `fixed frozen fixture; seeded sequence seed is recorded by N4 harness output`.
- `version-npm`: `npm --version` (exit 0; stdout SHA-256 `d9f29f5aab43c8c1a8d6acc856e258b89735f541aa5e1f07b39a62f28bfa8d06`; stderr SHA-256 `6efb89c5491111e153af087b51e267921a1d604a8feff76a61da444f78049cad`).
- `version-root-go`: `go version` (exit 0; stdout SHA-256 `a25c9afbc0b5cef0771a799565082fe511d668065f83bd54750592f8102aa9f3`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `version-compiler-go`: `go version` (exit 0; stdout SHA-256 `5707bf75dd54b4fdd5ac209444d48c9c4179ebf8510f80e2f7293dfbedc1012b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `version-chromium`: `/tmp/chromium --version` (exit 0; stdout SHA-256 `685fc1764b9a92beaca4b87593f55170ca6b158f4179690064c25a352f08531b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `inherited-full-capabilities`: `bash /workspace/scratch/39a56936f173/gondola-children-archive/run-compiled-capabilities.sh` (exit 1; stdout SHA-256 `c4a6d9a43bad252d64493938421c4c37a28a1736eccfa2daa6b0b4294d8fabf7`; stderr SHA-256 `624e7f61d8eb5e7506154a42afe0c111310c91d409db30b25847f1bde6252ab5`).
- `new-host-and-harness-unit-tests`: `/tmp/gondola-node22/node_modules/node/bin/node --test /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/conformance/browser-version.test.mjs /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/conformance/check.test.mjs /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/conformance/seeded.test.mjs /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/conformance/swap-contract.test.mjs /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/inherited-acceptance.test.mjs /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/runtime/runtime.test.mjs /workspace/scratch/39a56936f173/gondola-children-archive/compiled-frontend/conformance/no-wasm.test.mjs` (exit 0; stdout SHA-256 `6c7d41cfb6c6cb6809371fa27fa4a9a84ad53f538d1ee9c1a7fb0bbfcca359ec`; stderr SHA-256 `aea58de96dbc889a297308741aff99fdb6ef0cb1ee40baa4b999fa1c6af3a7e2`).
- `compile-react-goscript`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `841ad8b671c8a5767a13b070a8ead4b4a6e8adda04395ef2c6644b0adaf4e780`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `compile-dom-goscript`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `5e4f9e8c7f2e9419a744fac59a5e36cd52cfe090f5cd0f582681dec92320f1c9`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `n5-independent-literal-oracle`: `/tmp/gondola-node22/node_modules/node/bin/node --test /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/oracle/oracle.test.mjs` (exit 0; stdout SHA-256 `b5c60de0374f12c3079bf35ee897b99825e79a1ffbdeaba9780e30de4a084e65`; stderr SHA-256 `4bec16dafe5e3e8f9fef6067af85970397e58bb7bc2f12c03a7376f254d6ce43`).
- `n4-native-direct-browser-harness`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/conformance/run.mjs --native-go /tmp/gondola-go/bin/go --fixture /workspace/scratch/39a56936f173/gondola-children-archive/fixtures/compiled/children/scenario.json --expectations /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/oracle/expectations.json --react-manifest /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/react/output/buildmanifest.json --dom-manifest /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/dom/output/buildmanifest.json --chromium /tmp/chromium --output /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/harness/run` (exit 0; stdout SHA-256 `0b220d2ee9260d9a1ff97c8c4ed148593e933ba1d8822e6c5127c2e5b6cc796b`; stderr SHA-256 `3c22a07b36aed9841ca1278d00652e3838c8ee56bf8ee7eab47f0bbbcc76a0d9`).
- `build-http-demo`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/build.mjs --compiled /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/react/output --output /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/demo/site --backend react` (exit 0; stdout SHA-256 `ace958408c0ac9c941210626059aaa8e98a767e0c26316ee2fd3baab081865d0`; stderr SHA-256 `b27be37a5076791223943dc4eb01a443574afe88fe44dc81fa08c79d4654755b`).
- `http-browser-smoke`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/smoke.mjs --demo /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/demo/site --output /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/demo/smoke.json --screenshot /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/demo/screenshot.png --chromium /tmp/chromium --port 0` (exit 0; stdout SHA-256 `f8e9b3914d2ee6d105b9586d35fb32c15b0338d327b35f28e547a666e93df076`; stderr SHA-256 `c50fc07c0fd45d0f2ab49f4b4b272ed2ea76b41d5d9c658faf519d1b57719d8e`).
- `archive-capability-artifacts`: `tar -czf /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7.tar.gz -C /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7 --no-recursion --null --files-from /tmp/gobi-capability-archive-list-HVpcwu/members.nul` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `list-capability-archive`: `tar -tzf /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7.tar.gz` (exit 0; stdout SHA-256 `8efe8a13fc3cb4d6aa0df496f38b05d19bf77e11cc783f21c7e16e65dbe5efd0`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `extract-capability-archive`: `tar -xzf /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7.tar.gz -C /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/archive-verification` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `independent-post-command-archive-consumer`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/verify-archive.mjs --archive /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7.tar.gz --manifest /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7.archive-manifest.json --output /workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/provenance/post-command-archive-consumer.json --expected-archive-sha256 a11817d20da1a167a016dba08cedd4ea2baf2aa75232d8fe0110e9193fde5c9f --expected-manifest-sha256 ddecfc97e4f2cf21684a6d0148333883e4a155a3ebd31e0fe7fda21dc7fb1738` (exit 0; stdout SHA-256 `90cd4f03a0175d69b75617d711ee9e6db041bf0adcb6238b6ec24fbdedd47d21`; stderr SHA-256 `92e432fdc2b063026db137d7ee3ccc89eddf46c8775db78b381878ac832cf1fd`).

## Stage ledger

- preflight-and-toolchain: **passed**
- fresh-full-inherited-capabilities-chain: **failed** — inherited-full-capabilities failed; retained logs: compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/logs/inherited-full-capabilities.stdout.log and compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/logs/inherited-full-capabilities.stderr.log
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
- new N3 host, inherited-gate, shared no-WASM, and N4/N6 conformance tests passed under Node 22 (46/46)
- react collection fixture compiled through go run ./cmd/gobi-build and every BuildResult output hash was verified
- dom collection fixture compiled through go run ./cmd/gobi-build and every BuildResult output hash was verified
- React and DOM builds share byte-identical AppIR, encoder, and output path inventory
- N5's independent literal scenario expectations and negative checker controls passed
- N4 real native, direct-compiled, React, and DOM replay matched state, view tree, DOM order, swaps, pending replies, disabled behavior, and stale-generation rejection
- HTTP demo smoke passed 32 browser and endpoint checks against the compiled Go collection
- The inherited full chain failed and is retained as a blocking failure; dependent inherited evidence was not accepted.
- new archive and external manifest verified after commands; 239/239 member hashes round-tripped

## Archive and delivery boundary

The immutable pre-archive snapshot and 239-member tar round trip passed. Archive SHA-256: `a11817d20da1a167a016dba08cedd4ea2baf2aa75232d8fe0110e9193fde5c9f`; external manifest SHA-256: `ddecfc97e4f2cf21684a6d0148333883e4a155a3ebd31e0fe7fda21dc7fb1738`. A separate Node consumer independently listed, extracted, and hashed all members after the archive command. The runner rechecked both outer hashes and source pins before finalizing this receipt.

Prior evidence limitation: The known prior local-container archive corruption remains excluded; its evidence is not copied, repaired, rewritten, or used for this run. The new attempt has independent archive and delivery verification. The accepted prior evidence identifier is `978eaea98831154f8152baa1a64f1d1356916596`.

## Failures and mismatches

- inherited-full-capabilities: (node:69) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:61) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)
- stage:fresh-full-inherited-capabilities-chain: inherited-full-capabilities failed; retained logs: compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/logs/inherited-full-capabilities.stdout.log and compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7/logs/inherited-full-capabilities.stderr.log

Inherited chain: not verified. N4 harness: matched. N5 literal oracle: Node test runner: 9/9 passed. HTTP demo: passed.

The prior local-container archive was left untouched and is not acceptance evidence. This report does not claim hosted CI success unless a separate run artifact is supplied and matched to this exact source and receipt.
