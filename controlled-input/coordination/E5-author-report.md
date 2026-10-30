# E5 adversarial probes author report

## Delivered

- Added `controlled-input/adversarial.mjs` with `runAdversarial(page)`, using the browser fixture's actual host, Go runtimes, and both renderers.
- The browser probes check native disabled Save/Reset suppression and assert zero runtime dispatch calls under both renderers; empty input; Unicode and markup-shaped text escaping; repeated saves and reset; unchanged literal click arguments under DOM-property tampering; rejected duplicate, colliding, malformed, and unsupported bindings; React failed-mount root reuse; renderer-local runtime-error retention and event fencing; detached inputs after renderer swaps and unmount; and ordinary multi-key typing with focus, input identity, value, and caret checks after every key.
- Invalid snapshot probes now assert the reason for each rejection by inspecting the `cause` chain. The input `Node.On` case is named and checked as a rejection by the click-only handler contract; it does not claim the sidecar collision branch was reached.
- `expectedErrors` is empty. Runtime-failure probes inspect each renderer's explicit `lastError` and verify the callback fence; they do not emit or ignore global browser errors.
- Added `controlled-input/adversarial.test.mjs` with pure protocol-negative tests for duplicate path/event bindings, rejected non-click input handlers, unsupported event/source semantics, invalid input targets/value attributes, malformed paths, literal argument lookup, and the Playwright API guard.

## Initial author-pass verification

Command:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --check controlled-input/adversarial.mjs
/tmp/gondola-node22/node_modules/node/bin/node --test controlled-input/adversarial.test.mjs
```

Before XR-E5 feedback, this command passed **6 tests, 0 failed** under Node `v22.23.4`.

Amendment verification also passed:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test controlled-input/adversarial.test.mjs
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
node controlled-input/check.mjs --seed 20261030 --cases 0 --output /tmp/input-e5-amended-fixed.json
```

The amended Node suite passed **7/7 tests**. The fixed-only Chromium integration run passed **9/9 adversarial probes**, 8 replay scripts, 74 observations, zero parity mismatches, and all 16 native `CompareInteraction` comparisons. It also observed zero runtime dispatch calls for disabled Save/Reset under both DOM and React. Browser: Chromium `153.0.8010.0`, React/ReactDOM `19.3.1`, Node `v22.23.4`. The amended trace is `/tmp/input-e5-amended-fixed.json`; the earlier E4 report and `controlled-input/build/diagnostic-fixed.json` preserve the prior run.

## Findings and limits

- Renderer replacement remounts the input and does not preserve the caret. The keyboard probe focuses each mounted input and presses End before typing, then verifies the existing node remains focused with the expected end caret after every ordinary keystroke. Swap selection preservation remains out of scope.
- The unchanged backend host does not mark itself unusable when a native input event's runtime dispatch fails. Both renderers retain `lastError` and fence later input events; the host snapshot remains readable. This behavior is explicitly recorded in the browser observations and does not change the inherited host.
- The browser negative suite confirms case-specific rejection by both renderers. The input-node `On` fixture is rejected by the closed `click`-only handler contract before the sidecar collision check; duplicate path/event bindings are separately rejected as ambiguous.

## Amendment

XR-E5 identified that the first disabled-control probe checked only the unchanged Go snapshot, which could pass if a renderer incorrectly called Go and Go suppressed the disabled dispatch. The amended probe records calls at the runtime boundary and asserts zero calls for both renderers. XR-E5 also identified that the first invalid-binding probe accepted any thrown error. The amended probes check each expected validator cause, including through the DOM renderer's generic wrapper. These were test-strength gaps; no renderer or protocol behavior changed.

No inherited files were changed.
