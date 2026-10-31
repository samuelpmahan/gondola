# XR-RESTORE: independent review of the retained archive restore proof

**Decision: `accepted` for the bounded local archive and browser-smoke evidence.** I independently reassembled and inspected the accepted archive, extracted it into a new temporary directory, and reran the existing browser smoke from the frozen source checkout against that restored site. The E-RESTORE report and receipt both match their original author pins. A prior comparison note transposed two adjacent hex characters in the receipt digest; that was a reviewer transcription error, not an artifact change. This does not establish a hosted CI result or overall inherited lifecycle acceptance.

## Author packet and archive

The N2 [E-RESTORE report](../reports/E-RESTORE.md) SHA-256 is `e8e81c1db9e3f949ab1ee8788299ed90e060c81518497c471877b30d4f0d1100`; its [receipt](../receipts/E-RESTORE.json) SHA-256 is `9dcc5282ccc30d4ab8fba0ff4ec52ab01567bc60a2a870dc2dcad27308abd24f`. Both match the original author pins, and the receipt binds the report and run evidence. The earlier comparison transcription error is corrected here.

I recomputed each retained chunk's SHA-256 and Git-blob-format SHA-1, compared both values with the retention record, concatenated the chunks in order, and matched the pinned 14,757,771-byte archive SHA-256 `f6c5d09ad0f15b9590e02aedf6ab53b2fc85b2d9e9f00647630708f1364dd9bf`. The archive manifest SHA-256 is `27e0ade2164813d3fba831cc44f19b9f9bf56ef862ee68d8f6942dd0e7064c46`; the R-FINAL receipt SHA-256 is `a6c99407c97e2d6634de14a0a431293309e40d5fcf691a14b6bacaf16791d810`.

The independent verifier found 719 unique regular-file members totaling 168,200,217 uncompressed bytes, exactly matching the manifest and R-FINAL member totals. It rejected no entries because there were no absolute or traversal paths, duplicates, links, special files, unexpected members, or per-member size/digest mismatches. Extraction completed under fresh `/tmp/gobi-lifecycle-xr-restore-a5lo0n55`; the five static `demo/site` files were pinned before and after the smoke and did not change.

## Restored build identity and smoke

The restored `demo-build.json` binds package/component ID `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle` to the R-FINAL React AppIR (`341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d`), compiled module (`e1d1027537b072e45de4ec9257839b7c3b2f02fba74095d89ddebcf5a6ed1594`), and encoder (`521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`). The smoke source and headless scenario match R-FINAL pins: `smoke.mjs` SHA-256 `c64c868341fd8a2e4de18b30403babc246397a08d1cb6f34c1a4f3db5daf5b21`; `scenario.json` SHA-256 `45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650`.

I ran `smoke.mjs` against the new restored site with Node `v22.23.4` and `/tmp/chromium` (Chromium `153.0.8010.0`). All 12 checks passed: 24 ticks, four renderer swaps, and three HTTP responses (page, CSS, and bundle) with status 200. Browser, console, failed-request, WASM-request, and WASM-API-attempt counts were all zero. The full terminal Go state, View tree, and ordered effect records match R-FINAL; the final Go state also matches the 26-event/13-state headless fixture.

The effect evidence includes seven exact request tokens, subtree cancellation in Grandchild→Child→Parent order, preservation and successful completion of the independent Sibling request, rejection of all three retired generation-1 callbacks, and three direct stale Go completion messages whose state remained unchanged. Sibling and all three fresh generation-2 replies were accepted; duplicate Sibling and Child replies were rejected. The browser queue was empty at the end. The screenshot matches the R-FINAL bytes and SHA-256 `6f366f62a04be4223324602333013b5bfc5c69aaf2c9eeb2edd61e44b8bd8053`.

Node emitted its nonfatal experimental `EnvHttpProxyAgent` warning on stderr. The smoke’s browser and request error arrays were empty.

## Commands and claim boundary

Review ran against CI checkout commit `00da54ad0f5a4006b13a5cded18ce291845978bc`, using Python `3.12.14`, Node `v22.23.4`, and Chromium `153.0.8010.0`. Exact commands:

```sh
python3 compiled-lifecycle/ci/2026-10-31/lanes/review-restore/review_restore.py
CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola/compiled-lifecycle/demo/smoke.mjs --demo /tmp/gobi-lifecycle-xr-restore-a5lo0n55/demo/site --output /workspace/scratch/39a56936f173/gondola-lifecycle-ci/compiled-lifecycle/ci/2026-10-31/lanes/review-restore/smoke.json --screenshot /workspace/scratch/39a56936f173/gondola-lifecycle-ci/compiled-lifecycle/ci/2026-10-31/lanes/review-restore/smoke.png
python3 compiled-lifecycle/ci/2026-10-31/lanes/review-restore/verify_smoke.py
```

The first command independently verifies and extracts chunks/members; the second runs the already-built restored site; the third compares complete state, tree, effects, and physical browser evidence against the pinned receipt and fixture. No Go compilation, npm install/ci, or rebuild was run. This accepts the local bundle portability proof only. The separate 00da hosted CI run remains outside this review and is not claimed as passing.

## Review artifacts

- Independent restore implementation: `lanes/review-restore/review_restore.py`, SHA-256 `95b5f40caa9bd0c44319296c9fe5acee03132d3acdb5293a180df64469c3e615`.
- Restore record: `lanes/review-restore/restore-audit.json`, SHA-256 `20402278cf34ba544a74ffbb35f07b820eace1663d0f26d35c7d812aff3684a1`.
- Smoke verifier: `lanes/review-restore/verify_smoke.py`, SHA-256 `e8936372d6de71f04027b600b5b4fe6dd6c08409dccdd80c5fa92f8d84b69890`.
- Fresh smoke JSON: `lanes/review-restore/smoke.json`, SHA-256 `7d5ef34edc2c7b71e9ec0e1d3af0ad036741d26b43382560340a0e154a12ba24`.
- Fresh screenshot: `lanes/review-restore/smoke.png`, SHA-256 `6f366f62a04be4223324602333013b5bfc5c69aaf2c9eeb2edd61e44b8bd8053`.
- Smoke comparison: `lanes/review-restore/smoke-audit.json`, SHA-256 `ff7fce98387a2598ece8067ad4aa74f33b48162ed25aefe63b116e9266b9d493`.

No product source, Git metadata, provider state, or shared state was changed. Writes were limited to the assigned independent review lane and this report/receipt.
