# E-DELIVERY: compiled keyed child collection delivery

**Outcome: mixed_change. Status: failed.** 2 failure(s) were recorded; this full delivery attempt is not accepted.

## Commands and versions

- Attempt: `compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9` (full mode, Node v22.23.4, root Go go version go1.24.0 linux/amd64, compiler Go go version go1.27.3 linux/amd64, Chromium Chromium 153.0.8010.0).
- Fixture: `fixtures/compiled/children/scenario.json`; scenario seed: `fixed frozen fixture; seeded sequence seed is recorded by N4 harness output`.
- `version-npm`: `npm --version` (exit 0; stdout SHA-256 `d9f29f5aab43c8c1a8d6acc856e258b89735f541aa5e1f07b39a62f28bfa8d06`; stderr SHA-256 `96f83acb0670803893874ee45fdd370c88bf1cdc15b145b687a9774cd6c28506`).
- `version-root-go`: `go version` (exit 0; stdout SHA-256 `a25c9afbc0b5cef0771a799565082fe511d668065f83bd54750592f8102aa9f3`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `version-compiler-go`: `go version` (exit 0; stdout SHA-256 `5707bf75dd54b4fdd5ac209444d48c9c4179ebf8510f80e2f7293dfbedc1012b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `version-chromium`: `/tmp/chromium --version` (exit 0; stdout SHA-256 `685fc1764b9a92beaca4b87593f55170ca6b158f4179690064c25a352f08531b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `inherited-full-capabilities`: `bash /workspace/scratch/39a56936f173/gondola-children-ci/run-compiled-capabilities.sh` (exit 0; stdout SHA-256 `e6c01786270bd55c4fe179451594ca05ae4e6dbb9fc46445a909c0f90d7ae6cb`; stderr SHA-256 `4e840b24968513d98daac8458292919bb6d804a5540edcc3bce8475075a16fe5`).
- `new-host-and-harness-unit-tests`: `/tmp/gondola-node22/node_modules/node/bin/node --test /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/conformance/browser-version.test.mjs /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/conformance/check.test.mjs /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/conformance/seeded.test.mjs /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/conformance/swap-contract.test.mjs /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/inherited-acceptance.test.mjs /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/runtime/runtime.test.mjs /workspace/scratch/39a56936f173/gondola-children-ci/compiled-frontend/conformance/no-wasm.test.mjs` (exit 0; stdout SHA-256 `2d6f7f611e79e313164ac7d37b0da2665816847ad7d2a6204a163f3b65dd9b3c`; stderr SHA-256 `a100d506cfdd467091b0f5ebb4d37e1a42efda3f1f497619d9351ed38b67f1b9`).
- `compile-react-goscript`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `15eb6366a1abf96631e8078b24aaee9211c47f6dfef57192d29bd03b7bb5660a`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `compile-dom-goscript`: `go run ./cmd/gobi-build` (exit 0; stdout SHA-256 `07747b7ead8d40a76d0ccfa2f3ea432fb846ba9c6fd5e1c03a21bceac7f2f76a`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `n5-independent-literal-oracle`: `/tmp/gondola-node22/node_modules/node/bin/node --test /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/oracle/oracle.test.mjs` (exit 1; stdout SHA-256 `ca9bd2b42de296cce1a4c53fd6bcf838dda6423056a922c3ecc17977049ade18`; stderr SHA-256 `419220fc7f68edba1be3cde44e510dee02d8fdc317ac49bc18a4740072df3c7a`).
- `archive-capability-artifacts`: `tar -czf /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9.tar.gz -C /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9 logs react dom harness oracle demo inherited provenance execution-before-archive.json` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `list-capability-archive`: `tar -tzf /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9.tar.gz` (exit 0; stdout SHA-256 `42db17d60574d34de06e9dfb7ed984fd62789f02fb6d3bbf3c7c533f099c135b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `extract-capability-archive`: `tar -xzf /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9.tar.gz -C /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9/archive-verification` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- `independent-post-command-archive-consumer`: `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/demo/verify-archive.mjs --archive /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9.tar.gz --manifest /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9.archive-manifest.json --output /workspace/scratch/39a56936f173/gondola-children-ci/compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9/provenance/post-command-archive-consumer.json --expected-archive-sha256 11c5f737f57cb46ce700a3b90bff9f2757d18126d967c19fc33ea1a337391a53 --expected-manifest-sha256 0aaea7e4090186c9ed07c4360869507f4bab575426b1b6240d9c6bc8c890808c` (exit 0; stdout SHA-256 `298601b7438d3b5dc758adf0f6c50a23aaf5ab4e21db17ba866cafeac8b8695d`; stderr SHA-256 `09333eda0ab31135e2ca0fe8bf521014cb4732ed25cfa328d0e3671e5dc455df`).

## Stage ledger

- preflight-and-toolchain: **passed**
- fresh-full-inherited-capabilities-chain: **passed**
- new-host-and-harness-unit-tests: **passed**
- fresh-react-goscript-build: **passed**
- fresh-dom-goscript-build: **passed**
- react-dom-build-parity: **passed**
- n5-independent-literal-oracle: **failed** — n5-independent-literal-oracle failed; retained logs: compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9/logs/n5-independent-literal-oracle.stdout.log and compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9/logs/n5-independent-literal-oracle.stderr.log
- n4-native-direct-browser-harness: **skipped**
- compiled-http-demo-and-browser-smoke: **skipped**
- immutable-archive-and-boundary-verification: **passed**

## Acceptance checks

- Any prior author E-DELIVERY report and receipt were preserved as read-only attempt provenance before canonical files were updated
- Go 1.24, compiler Go 1.27.3, Node 22, Chromium, React 19.3.1, dependency versions, and all existing npm lock hashes were verified
- fresh inherited E-BUILD passed the invocation-window, finish-time, actual current-source, immutable pre-archive snapshot, report, archive, manifest, and full lifecycle-command checks
- new N3 host, inherited-gate, shared no-WASM, and N4/N6 conformance tests passed under Node 22 (46/46)
- react collection fixture compiled through go run ./cmd/gobi-build and every BuildResult output hash was verified
- dom collection fixture compiled through go run ./cmd/gobi-build and every BuildResult output hash was verified
- React and DOM builds share byte-identical AppIR, encoder, and output path inventory
- new archive and external manifest verified after commands; 362/362 member hashes round-tripped

## Archive and delivery boundary

The immutable pre-archive snapshot and 362-member tar round trip passed. Archive SHA-256: `11c5f737f57cb46ce700a3b90bff9f2757d18126d967c19fc33ea1a337391a53`; external manifest SHA-256: `0aaea7e4090186c9ed07c4360869507f4bab575426b1b6240d9c6bc8c890808c`. A separate Node consumer independently listed, extracted, and hashed all members after the archive command. The runner rechecked both outer hashes and source pins before finalizing this receipt.

Prior evidence limitation: The known prior local-container archive corruption remains excluded; its evidence is not copied, repaired, rewritten, or used for this run. The new attempt has independent archive and delivery verification. The accepted prior evidence identifier is `978eaea98831154f8152baa1a64f1d1356916596`.

## Failures and mismatches

- n5-independent-literal-oracle: (node:38992) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)
- stage:n5-independent-literal-oracle: n5-independent-literal-oracle failed; retained logs: compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9/logs/n5-independent-literal-oracle.stdout.log and compiled-children/demo/output/attempts/attempt-20261031T134933282Z-9/logs/n5-independent-literal-oracle.stderr.log

Inherited chain: passed. N4 harness: not matched. N5 literal oracle: not passed. HTTP demo: not passed.

The prior local-container archive was left untouched and is not acceptance evidence. This report does not claim hosted CI success unless a separate run artifact is supplied and matched to this exact source and receipt.
