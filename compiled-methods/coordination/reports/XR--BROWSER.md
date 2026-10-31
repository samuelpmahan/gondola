# XR--BROWSER

**Decision: accepted.** E-BROWSER's bounded oracle and local Chromium evidence are supported by the implementation and retained artifacts. I found no browser-lane discrepancy requiring an amendment.

## Independent checks

- The oracle is hand-authored from the frozen methods fixture contract. `METHODS_STATES` supplies 19 literal expected states and `METHODS_ACTIONS` supplies the ordered 18 click intents; the oracle does not import AppIR, a renderer, or browser output. `expectedMethodsDOM` builds fixed markup and live button-property expectations from those states. The unit test separately pins the initial serialized DOM and controls and tests markup/disabled-state mutations.
- I independently reconstructed all expected state transitions from the frozen `methods.json` action/expectation rows and `FIXTURE.md`/Go `View` shape. I compared each raw profile's 19 trace states and trace DOM snapshots, all 19 oracle snapshots, and all 19 physical DOM snapshots against that reconstruction. All three profiles match across the 171 checked snapshots.
- Each profile records 18 ordered actions and 19 logical ticks. The physically disabled actions are indexes 6, 9, 10, and 17. For each, the raw record shows an attempted `HTMLElement.click`, no callback/count change and no renderer observation; the subsequent runtime suppression record contributes the null-message/null-dispatch tick. The other 14 clicks reach one renderer callback with the fixture's exact action, message and empty value, in sequence.
- The swap profile alternates React/DOM after each action, including the final one. All 18 transitions keep the trace/state/view stable, synchronously empty and detach the old root, use a distinct new root, then invoke a callback captured from the retired renderer. Each retained callback is observed as stale, receives exactly one runtime fence, and does not advance the trace.
- The run records no page errors, WebAssembly API attempts or `.wasm` network requests. Each profile's unmount record shows an empty physical container and renderer snapshot. The runner installs the no-WASM guard before loading application code and checks guard results after the profiles.
- The E-BROWSER source files, report hash, N2 audit hash, and N3 raw run/browser/check hashes match the consumed receipt. The N3 run records equal before/after/final source pin inventories (188) and equal pre/post-check output inventories (149). I rehashed the recorded output and evidence inventories and 186 of the current source files; I left `compiled-methods/conformance/check.mjs` and `check.test.mjs` alone while N2's concurrent repair is in progress. Their historic pins remain present in the retained N3 run record.

## Scope and limits

This accepts the browser lane for the retained local run only. The React-built GoScript module is the single module mounted through React, DOM and swap profiles; the DOM-built output is separately pinned, not mounted by this matrix. Chromium `153.0.8010.0` was run locally from `/tmp/chromium`; managed-CI browser execution is not established here. The fixture is deterministic and button-only, so it provides no focus/selection, effects, randomized-sequence or general-application guarantee. The swapped-profile React callback capture reads React's internal props property and is bounded to this pinned setup.

The read-only audit script and machine summary are in `compiled-methods/evidence/reviews/xr-browser/`. No production files, tests, browser runs, Git data, or native coordination state were changed by this review.
