# E6 author report

## Scope completed

Added the adversarial browser runner and its Node tests in `async-effects/adversarial.mjs` and `async-effects/adversarial.test.mjs`.

The runner exports a frozen `expectedProbeNames` inventory and `runAdversarial(page)`. It validates that every expected probe appears exactly once, rejects unexpected or mislabeled entries, records case-specific failures, and returns `{ok, expectedProbeNames, probes, validation}`. Each probe reports its kind as `real-go` or `synthetic`.

The 11 probes cover cancelled, out-of-order, duplicate, and error/retry replies; Reset ID monotonicity; a renderer swap during a pending request; late delivery after unmount; reuse of ID 1 after a new Go `init` with the old host callback fenced; synchronous synthetic transport start/cancel failures; and a retained stale renderer facade. Runtime wrapper counts assert exact dispatch/completion deltas and zero Go calls after unmount or through stale facades.

## Verification

- Node 22: `/tmp/gondola-node22/node_modules/node/bin/node --test async-effects/adversarial.test.mjs` — 7/7 pass.
- Node 22 syntax check: `/tmp/gondola-node22/node_modules/node/bin/node --check async-effects/adversarial.mjs` — pass.
- Coordinated E4 fixed-only browser recheck: `async-effects/build/e4-fixed-diagnostic-recheck.json` — 16 fixed scenarios, 122 ticks, zero scenario mismatches; all 11 E6 probes pass (8 `real-go`, 3 `synthetic`); no Go runtime errors reported.
- The Reset observation confirms ID 1, Reset to empty editor state with `NextID: 1`, allocation of ID 2, and a forced late ID 1 reply that leaves ID 2 pending and `Saved` empty. The ID 2 reply then saves successfully.
- The earlier one-probe failure is preserved at `async-effects/build/e4-fixed-diagnostic-first.json`. It was an assertion mistake: Reset correctly clears `Saved`; the corrected probe records and checks that actual Go state.

## Limits

Synthetic transport and stale-facade probes use local fault injection and are labeled `synthetic`. The browser evidence is from the coordinated Chromium run and does not claim cross-browser equivalence or a real network service.
