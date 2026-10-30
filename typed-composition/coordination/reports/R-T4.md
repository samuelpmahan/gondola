# R-T4 — Unsaved-row publication test repair

## Result

Added a focused reference test for an existing child row whose Saved value is empty. The test checks the disabled publish projection, direct typed publish rejection at the current revision, canonical disabled-click suppression, unchanged child and parent snapshots/messages, and empty dirty IDs after each rejection.

The test then saves that same row, completes the pending request, and accepts the first publication at sequence 1. This proves the rejected calls did not consume the global publication sequence. The existing missing-row case remains distinct. No model or script behavior changed.

## Verification

    node --test gondola/typed-composition/reference.test.mjs gondola/typed-composition/scripts.test.mjs
    # passed: 18 tests, 0 failures

This repair covers the independent reference only. It does not claim native/browser differential or full-runner verification.
