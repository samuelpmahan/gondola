# E-CI-HARNESS interim source review

**State:** fresh root-shared CI artifacts not yet received; this is not a conformance acceptance result.

**Source-change note:** N2 published a test-only managed-Chromium repair in `195c9433179218348d4b9f2477ae1e0725337d15` (parent 832d212); renderer, runtime, oracle, and harness sources are unchanged. The initial 832d212 review is preserved under `history/832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb/`. Fresh root-shared CI artifacts for 195c943 are still pending, so this remains a source/checker review rather than matrix acceptance.

## Published source identity

- HEAD: `195c9433179218348d4b9f2477ae1e0725337d15`
- tree: `c0e4a66eee3fdd8b789e1b565167856fdab62433`
- The five harness files and runtime/React/DOM/shared-view files retain the attempt-10 hashes recorded in E-HARNESS. The test-only path repair changes `compiled-frontend/frontend/dom/renderer.test.mjs` to `df7debccbb92954722b953f743e126e757ebe14b3a4e4eefa3014c59a098791e` and `compiled-frontend/frontend/react/renderer.browser.test.mjs` to `75f9b3447ee804b92bbd47b324e210bc6a90df28525d0edfb2b7bd1d5461190e`.

## Static checker review

The published checker keeps backend swap observations in `gobi.backend-swap-observations/v1` and compares Go application traces separately from physical DOM. It checks the React, DOM, and alternating profiles against native/direct traces and the independent DOM oracle. For swaps, it verifies no extra application tick, unchanged state/View and host request/completion correlation, committed replacement diagnostics, detached and empty old root, and focus/selection restoration when focus is observed. Fixture-specific keyed focus details are required only for declared witnesses.

Lifetime checks distinguish retired renderer callbacks, which must be fenced out of band without trace/snapshot or dispatch changes, from active missing-target attempts, which must add exactly one suppressed application tick. They reject ambiguous claims of a retained DOM listener invocation. Disabled-element attempts are checked separately. Post-unmount probes preserve the established suppressed-tick behavior with empty physical DOM and no Go Update/effects.

Effect checks require the request and pending DOM/state to commit before host observation; wrong-correlation replies must be rejected before the manual reply without trace or host mutation; duplicate completion must be rejected; and swaps preserve host correlation.

## Local source checks

- Node v22.23.4 syntax checks passed for `browser.mjs`, `check.mjs`, `run.mjs`, `check.test.mjs`, both repaired browser test files, and `audit_ci_harness.mjs`.
- `node --test compiled-backends/conformance/check.test.mjs`: **5 passed, 0 failed**. The suite covers focus-witness policy, detached callback classifications, no-double-tick behavior, action target values, and mutation rejection.
- No browser matrix was rerun during this preliminary review. The audit script is staged to independently inspect the root-shared raw CI captures when available.
