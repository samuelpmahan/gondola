# R-HARNESS

**Worker N2 · Outcome: mixed change.** Corrected the wrong-message mutation control so it changes only the message value while preserving the valid lowercase `gobi.trace/v1` shape. Added a test that asserts the rejection reason identifies `message.name` as the changed value rather than reporting a field-shape mismatch. The full matrix matched again using the immutable compiler-gate outputs and existing native binary.

## Repair

The old `wrong-message` vector used `{Name, Arg}` and was rejected because the trace schema requires `{name, arg}`. The repaired `wrong-message-value` vector supplies `{name: "parentAdd", arg: ""}` where the expected value is `{name: "childAdd", arg: ""}`. The unit test checks for `message.name: value differs; expected "childAdd", got "parentAdd"` and explicitly rejects an `object field set differs` reason.

This packet leaves E-HARNESS and the original XR--HARNESS review unchanged. Its mutation result applies to the new repair run. The count wording is clarified here: the AppIR has **10 receiver methods**, **13 methods-package symbols** including the three `Init`/`Update`/`View` roles, and **2 counter dependency functions**, for **15 symbols total**.

## Verification

Node `v22.23.4` syntax checks passed for `compiled-methods/conformance/check.mjs` and `check.test.mjs`. The combined `check.test.mjs` and browser DOM-oracle test suite passed **10/10**. Full output is `compiled-methods/evidence/repairs/r-harness/node22-units.log`.

The Node 22 full matrix command reused the pinned React and DOM compiler outputs, existing `compiled-native` binary, canonical methods fixture and swap schedule, browser adapter, and local Chromium at `/tmp/chromium`:

```sh
GOBI_GO_BIN=/tmp/gondola-go/bin/go /tmp/gondola-node22/node_modules/node/bin/node compiled-methods/conformance/run.mjs \
  --app-ir compiled-methods/artifacts/compiler-gate/react/output/apps/methods-0cac42b0a982/app-ir.json \
  --compiled compiled-methods/artifacts/compiler-gate/react/output/apps/methods-0cac42b0a982/gobi-compiled.mjs \
  --helpers compiled-methods/artifacts/compiler-gate/react/output/apps/methods-0cac42b0a982/encoder.mjs \
  --native-bin compiled-methods/artifacts/harness-gate/compiled-native \
  --fixture compiled-methods/conformance/fixtures/methods.json \
  --output compiled-methods/evidence/repairs/r-harness/methods \
  --browser-adapter compiled-methods/browser/runner.mjs \
  --schedule compiled-methods/conformance/swap-schedule.json \
  --dom-app-ir compiled-methods/artifacts/compiler-gate/dom/output/apps/methods-0cac42b0a982/app-ir.json \
  --dom-compiled compiled-methods/artifacts/compiler-gate/dom/output/apps/methods-0cac42b0a982/gobi-compiled.mjs \
  --dom-helpers compiled-methods/artifacts/compiler-gate/dom/output/apps/methods-0cac42b0a982/encoder.mjs \
  --chromium /tmp/chromium
```

The command exited 0 with `status: matched`: 19 ticks, 18 actions, 14 dispatches, four suppressed actions, and 18 swaps. The repaired mutation reason is preserved in `methods.check.json`. Native and direct trace SHA-256 values match at `d2c26643dbabeb2f434e51c8b0032e4aa4fe720043d3e5bce2a54871def5cc12`; browser profiles match each other at `5f4337422d692fabafa1dd77ab33273c524c9268ce40046d1fed15b87f031a98`.

`audit-pins.mjs` independently verified 188 source pins before, after, and after checking; 149 compiler/native input pins before and after checking; and all seven evidence pins. It also verified that 11 prior E-HARNESS, XR--HARNESS, and attempt-04 files still match their pre-run SHA-256 values. The audit result is `compiled-methods/evidence/repairs/r-harness/pin-audit.json`.

## Limits

The browser run is local Chromium evidence and is not a managed-CI run. It covers the fixed method fixture and does not test an effect workflow, focusable inputs, generalized composition, Manager semantics, session ownership, or cancellation. The React-built module is the one executed through both renderers; the DOM build remains separately pinned.
