# E-CI-DEMO

**Outcome: confirmed_reuse.** The fresh full compiled-backends push run is pinned to the repaired source head `195c9433179218348d4b9f2477ae1e0725337d15`. I verified its retained artifact digest, complete command log stream hashes, inherited full-runner receipts, before/after source and build pins, five conformance captures, and the actual HTTP demo smoke.

## Primary CI run

- Workflow: `Gobi compiled DOM and React backends` (`.github/workflows/compiled-backends.yml`).
- Run: `41155530877`, event `push`; job `124401386239` (`compiled-backends`) completed successfully with every step successful.
- Checked-out commit/tree: `195c9433179218348d4b9f2477ae1e0725337d15` / `c0e4a66eee3fdd8b789e1b565167856fdab62433`. Direct parent: `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`; PR base: `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`. The Actions log shows checkout of this exact commit.
- Workflow executed the default command `bash run-compiled-backends.sh` with no `--backends-only` argument. N5 receipt mode is `full`. The nested `bash run-compiled-frontend.sh` exited 0 before N5 build/matrix commands; its default path includes typed-composition and compiled-frontend gates.
- Provider artifact `13025112465`: `original.zip`, 14,931,201 bytes, SHA-256 `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa`. All 817 ZIP paths match `retained-index.json`; every indexed extracted file and the retained tar archive re-hashed successfully.

## Execution and command evidence

The N5 execution receipt is `extracted/compiled-backends/artifacts/execution.json` (SHA-256 `6abb89ef41972c790ee95e0248c141944f97a55fbe4b9cd7d29fa78adc90907e`). It reports `mode=full`, `status=passed`, no failures, and 18 commands with exit code 0. The exact command, argument, working-directory, environment, timestamp, exit status, and stdout/stderr digest records are included in the final JSON receipt. The command names, in order, are: `syntax-runner, syntax-demo-app, syntax-demo-build, syntax-demo-smoke, syntax-shell-runner, version-root-go, version-compiled-go, inherited-full-runner, build-native, compile-react, compile-dom, backend-conformance-counter, backend-conformance-form, backend-conformance-list, backend-conformance-effect, backend-conformance-list-growth, build-http-demo, http-demo-smoke`. All 36 corresponding outer stdout/stderr log files match their recorded SHA-256 values.

The inherited compiled-frontend receipt is SHA-pinned to `29be76274bceac28e5df142de9aea4419941d330d26f8f5d9de3a747474efc3a`; it reports `passed`, with 33 successful commands. All 66 child stdout/stderr log streams match the recorded hashes. Its 122 source pins and 209 compiled output pins are unchanged before/after and match archived files. Five inherited app/conformance results are `matched`.

The N5 source pin lists contain 126 entries before and after execution. The arrays are identical, and all 126 hashes in each set match the Git tree at commit `195c943`. React and DOM each recorded 209 output pins before and after smoke. The before lists use output-directory-relative paths and the after lists use repository-relative paths; I stripped only the exact `compiled-backends/artifacts/compiled/{backend}/` root prefix, then compared path/hash pairs. Every entry matches the corresponding retained artifact file. The inherited compiled-frontend outputs were also independently checked against the archive.

## Build and conformance results

Both CLI profiles published four apps with their requested backend tags. The reported React/DOM output comparison confirms byte-identical AppIR, encoders, generated components, node map, forwarder source, and GoScript TypeScript; raw GoScript bundle hashes are recorded separately and are not claimed identical across compiler staging directories. The live demo and harness load one actual React-profile compiled Go module per app and exercise it with both renderer implementations.

All five native/direct/browser conformance profiles matched, with stable source pins: counter, form, list, effect, and list-growth. Their raw native, direct, browser, check, manifest, and run captures are retained and re-hashed against the index.

## HTTP demo and managed browser

The CI workflow installed Playwright-managed Chromium 156.0.8078.4 (Playwright Chromium v1248) under `/home/runner/.cache/ms-playwright/chromium-1248`. The N5 receipt records `CHROMIUM_PATH=null`; the smoke invocation has no executable-path override, and its browser version is `156.0.8078.4`. The `/tmp/chromium` fallback was therefore not selected in this run.

The HTTP smoke passed all five checks at `http://127.0.0.1:46853/`: four compiled Go apps loaded through React, counter state survived React→DOM→React and the retired callback was fenced without an app tick, form value/focus/backward selection survived both swaps, keyed list state survived both renderers, and a pending manual effect completed through its original callback. Browser errors, app failures, and WASM requests were all empty. The four demo build outputs have identical before/after pins. The screenshot is retained at `extracted/compiled-backends/artifacts/demo.png` (151,554 bytes; SHA-256 `5422b89958275a81bed3fd203ae2840d047dd8bfcbe12dfe90e397c3a1ac93fe`).

## Toolchain and source pins

- Node `v22.23.4`; Go root profile `go1.24.13`; compiled profile `go1.27.3`.
- React/React DOM `19.3.1`; Playwright `1.64.1`; esbuild `0.28.2`.
- Lock SHA-256: root `e35def24ea8e20847d1ea58a59bc3b233b6c0d1d9fa697e44e735812617ef53b`; interaction `b1dc4681b030322933246c2b4622a4cbb9ebcb8ac7f69f0f4021459c9d603ed0`; compiled-frontend `245318fce8e9760b07f8c465240d85b1449d4b75110c510aa5f362be3c600079`.
- Primary Actions log SHA-256: `c647178d63605521abb5c60ae780703cec06a6e9137dcd22b39b2f10d28d7bcb`. Retained-index SHA-256: `7b621030d9d9576db534905af653c62b7a518b344c0dfd0e16f1a96a64e03826`.
- The source-pinned runner writes a `status=running` receipt before the first command. The uploaded artifact keeps only the final receipt, not a separate initial snapshot; its `startedAt` precedes the first command timestamp, and the verified source order persists this behavior.

## Limits

- This packet accepts the successful current-head push run only. It does not assert PR workflow statuses or overall PR readiness; root checks those separately.
- The demo uses a loopback static HTTP server and an in-memory manual effect host; no production transport request is sent.
- Renderer replacement creates new physical nodes. The smoke covers Go state and focus/selection supported by the contract, not physical node identity. Renderer replacement failure has no visual rollback guarantee.
- All 817 provider artifact members are retained. Other inherited build intermediates outside the uploaded artifact require reproduction from logged commands and their source inputs.

Exact N5 and nested command/log-hash objects, source pins before/after, backend output pins before/after, demo output/evidence pins, and conformance capture hashes are recorded in `receipts/E-CI-DEMO.json`; the complete immutable provider bundle remains under `compiled-backends/ci/2026-10-31/`.
