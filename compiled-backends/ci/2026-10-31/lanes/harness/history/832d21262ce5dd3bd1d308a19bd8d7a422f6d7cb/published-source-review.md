# E-CI-HARNESS interim source review

**State:** fresh root-shared CI artifacts not yet received; this is not a conformance acceptance result.

**Source-change hold:** root found two focused browser tests that hard-code `CHROMIUM_PATH` or `/tmp/chromium`; N2 is preparing a test-only repair through the native packet. The 832d212 source/hash findings below are historical until the repaired source is published. The final audit must pin the new commit/tree and consume its fresh CI matrix.

## Published source identity

- HEAD: `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`
- tree: `bc8883df935c7d0c8b7265831cacdf5521fb70d2`
- Current hashes for the five harness files and four runtime/renderer/view files match the published attempt-10 source hashes recorded in E-HARNESS.

## Static checker review

The published checker keeps backend swap observations in `gobi.backend-swap-observations/v1` and compares Go application traces separately from physical DOM. It checks the React, DOM, and alternating profiles against native/direct traces and the independent DOM oracle. For swaps, it verifies no extra application tick, unchanged state/View and host request/completion correlation, committed replacement diagnostics, detached and empty old root, and focus/selection restoration when focus is observed. Fixture-specific keyed focus details are required only for declared witnesses.

Lifetime checks distinguish retired renderer callbacks, which must be fenced out of band without trace/snapshot or dispatch changes, from active missing-target attempts, which must add exactly one suppressed application tick. They reject ambiguous claims of a retained DOM listener invocation. Disabled-element attempts are checked separately. Post-unmount probes preserve the established suppressed-tick behavior with empty physical DOM and no Go Update/effects.

Effect checks require the request and pending DOM/state to commit before host observation; wrong-correlation replies must be rejected before the manual reply without trace or host mutation; duplicate completion must be rejected; and swaps preserve host correlation.

## Local source checks

- Node v22.23.4 syntax checks passed for `browser.mjs`, `check.mjs`, `run.mjs`, and `audit_ci_harness.mjs`.
- `node --test compiled-backends/conformance/check.test.mjs`: **5 passed, 0 failed**. The suite covers focus-witness policy, detached callback classifications, no-double-tick behavior, action target values, and mutation rejection.
- No browser matrix was rerun during this preliminary review. The audit script is staged to independently inspect the root-shared raw CI captures when available.
