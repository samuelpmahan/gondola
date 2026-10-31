# R-CI-DOM-FINAL source and artifact audit

## Current source head

- Published head: `195c9433179218348d4b9f2477ae1e0725337d15`
- Tree: `c0e4a66eee3fdd8b789e1b565167856fdab62433`
- Parent: `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`
- Current source view is a fast-forward of the prior published acceptance head. The `832d212` CI packets remain historical and are not acceptance evidence for this head.

## Current DOM/React source pins

| File | SHA-256 at `195c943` |
|---|---|
| `compiled-frontend/frontend/dom/renderer.mjs` | `8037c0b9d3430310aa9492ab9d1041207e33276f8a6dce219b84b2af17efa166` |
| `compiled-frontend/frontend/dom/renderer.test.mjs` | `df7debccbb92954722b953f743e126e757ebe14b3a4e4eefa3014c59a098791e` |
| `compiled-frontend/frontend/shared/view.mjs` | `ef2aaa7daf021b3e46dd5cec159951ec1e84d4ea3d7f3888ec6b8c27d7a959e0` |
| `compiled-frontend/frontend/react/renderer.mjs` | `35581215d912c0b19a63de9f122b75fef774c717100590d272cf9e7731943f6a` |
| `compiled-frontend/frontend/react/renderer.test.mjs` | `0d2c1483c19ff95cc320dab64aeb2f4ec795e0b14e4128b45fe9aa0dafc2e99f` |
| `compiled-frontend/frontend/react/renderer.browser.test.mjs` | `75f9b3447ee804b92bbd47b324e210bc6a90df28525d0edfb2b7bd1d5461190e` |
| `compiled-frontend/frontend/react/bindings.test.mjs` | `3ecbf7d0958e0ca4c330c2136ed615d6154e84d7efe79af5526cc38fb09249e9` |
| `compiled-frontend/conformance/browser.mjs` | `e5226c8156a27bb1da620556e71cc10daa49d5b7ec3b364c00aa806f2ac90bea` |

The renderer and shared-validator hashes are unchanged from the prior packet. The two browser-test hashes changed in the parent-to-head diff solely to import `chromiumLaunchOptions` from `../../conformance/browser.mjs` and pass `process.env.CHROMIUM_PATH`; renderer logic and test assertions were not changed. The shared helper is unchanged.

## Canonical packet location and historical source-scope mapping

| Consumed packet | Historical `source_scope` path | Canonical dated path | SHA-256 |
|---|---|---|---|
| E-CI-DOM report | `compiled-backends/coordination/reports/E-CI-DOM.md` | `compiled-backends/ci/2026-10-31/coordination/reports/E-CI-DOM.md` | `a141f71c0b289d7b16c027ae331a1c89de39e8c0a5d8e3a3cd20875794848e59` |
| E-CI-DOM receipt | `compiled-backends/coordination/receipts/E-CI-DOM.json` | `compiled-backends/ci/2026-10-31/coordination/receipts/E-CI-DOM.json` | `ff9b86058e17a425196d26c21593801d737549029fa954a9477080c066429af8` |
| R-CI-BROWSER report | `compiled-backends/ci/2026-10-31/coordination/reports/R-CI-BROWSER.md` | same canonical path | `98d170064376a733ce9d3a94e495343e54a0f7f0e8438c8c62f6156c530b6afd` |
| R-CI-BROWSER receipt | `compiled-backends/ci/2026-10-31/coordination/receipts/R-CI-BROWSER.json` | same canonical path | `49a4b673a75353d67b8e6553097ca416e1e9eb5891fe7b24b2acd8dee3941771` |

E-CI-DOM was moved byte-for-byte from the old base paths above. Its source_scope strings remain historical; `compiled-backends/ci/2026-10-31/lanes/dom/location-correction.md` documents the metadata-only relocation (SHA-256 `aae609e65b17e3cbae1054492c53eff60666a87256de9f83e9da5092709229b9`). The E-CI-DOM and R-CI-BROWSER packets remain unmodified.

## Current-head CI artifact verification

The primary immutable artifact is the successful **push** workflow at current source head `195c9433179218348d4b9f2477ae1e0725337d15`, not the initial `832d212` run and not a PR merge/synthetic checkout:

- Run `41155530877`, job `124401386239`, artifact `13025112465`; the provenance, run, and job records all match the exact `195c943` checkout and complete successfully.
- Provider ZIP `original.zip` is 14,931,201 bytes with SHA-256 `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa`. The retained index and extracted inventory contain 817 files; ZIP CRC validation reports no bad member.
- `compiled-frontend/artifacts/execution.json` reports `status=passed`, `mismatches=0`, and 122 source hashes before and after. I compared all 122 paths and digests against the current checkout: no missing file, path change, or hash drift.
- `compiled-backends/artifacts/execution.json` reports `status=passed`, `sourcePinsMatch=true`, and 126 source hashes before and after. I compared all 126 paths and digests against the current checkout: no missing file, path change, or hash drift.
- CI records both `CHROMIUM_PATH` and `CHROMIUM_EXECUTABLE_PATH` as null. The `Install Playwright managed Chromium` job step completed successfully; the browser snapshots identify Chromium `156.0.8078.4`.
- Node `v22.23.4` ran the 97-test suite with exit code 0: **97 passed, 0 failed**. The four DOM browser cases (TAP 41–44) and the React checked-control browser case (TAP 48) all passed. The source/test browser path used the managed browser; neither executable override was set.

## Snapshot and backend matrix evidence

- All five fixture check records report `status=matched`; each shows React, DOM, and alternating-swap backends matched. Their browser records have 0 page errors.
- The five fixture artifacts contain 43 ticks total and 37 completed backend swaps. Every `outerHTML-v1` DOM snapshot and live-control record matches across the standalone React profile, standalone DOM profile, and alternating-swap profile at every tick.
- Across the swap profiles, all nine focus/selection witnesses preserve the logical identity and selection before/after replacement. The list fixture retains the keyed `row-2-label` selection `[0,2]` with direction `backward` after keyed movement and swap.
- In the form fixture’s checked-true tick, React, DOM, and alternating-swap snapshots all omit the serialized `checked` attribute while reporting the live control property `checked=true`; their HTML and controls agree. The false tick similarly retains the absent attribute and reports `checked=false`.

## Historical 832d212 failure (not substituted for current-head evidence)

The initial `832d212` CI failure is now verified from its archived artifact, not inferred from prior local results:

- Artifact `13025052808`, run `41153480221`, is pinned to head `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`.
- `source.zip` is 65,988 bytes, SHA-256 `e78cfe71bcf0f77180d03a9ac2a3cd3ee5afcf9d7df7834aab097e56ef3362fc`; its index lists 38 members and the ZIP itself contains 38 members.
- Extracted `compiled-frontend/artifacts/logs/node-tests.stdout.log` is 23,752 bytes, SHA-256 `da450dd8f9b41521c3afe7d208da43493ecdf21cb6ef9`. TAP reports 97 total, 92 passed, and 5 failed. Failures 41–44 are the four DOM browser cases and failure 48 is the React browser case; all five report that Chromium executable `/tmp/chromium` does not exist. The paired stderr log is empty.

The accepted scoped DOM evidence is the primary successful push run above. The PR run remains separately tracked (run `41155534356`, synthetic checkout `ce26da0` with the same source tree); this report does not substitute push evidence for PR status or claim root’s broader 24-job PR-ready gate. No tests, compilers, or CLI builds were rerun in this artifact-audit phase.

## Reproduction of this audit

`compiled-backends/ci/2026-10-31/lanes/dom/final/verify-final-evidence.py` reads the retained provider ZIP/index and extracted execution/conformance records. It verifies the archive digest/CRC and indexed extracted file hashes, compares the 122 and 126 recorded source pins against the current checkout, checks the browser TAP cases, and compares the React, DOM, and alternating-swap `outerHTML-v1` snapshots and live-control records across all fixture ticks. The verifier itself is read-only and prints JSON; captured output is `compiled-backends/ci/2026-10-31/lanes/dom/final/audit-summary.json`. This is an evidence audit, not a rerun of CI tests or builds.

The source delta from parent `832d212` to `195c943` contains only the two browser test launcher changes, the portability repair note and its structured record, and the historical `RESULTS.md` update. Within the renderer paths, the DOM/React implementations, shared validator, and test assertions are unchanged; the two browser test modules use the existing shared `chromiumLaunchOptions` helper. The exact delta can be checked with `git diff 832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb..195c9433179218348d4b9f2477ae1e0725337d15`.

