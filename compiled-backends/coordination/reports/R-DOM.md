# R-DOM

**Outcome: mixed change.** Corrected the native DOM renderer's input outerHTML ordering identified by N3's `attempt-06/form` browser capture. Input `checked` is represented as live control state and is not serialized as an HTML attribute. Added a focused GoScript-shaped browser regression that checks a post-input update, callback messages, keyed node retention, focus, and backward selection. N3's four-app/five-fixture matrix is pending and is not claimed here.

## Repair

`compiled-frontend/frontend/dom/renderer.mjs` now emits input attributes in the order used by the established `outerHTML-v1` oracle: ordinary input attributes first, followed by `type` and `value`. The source View is still consumed in its original attribute order; this is an input-element lowering rule, not an oracle change or global serializer normalizer. The `checked` Go attribute is applied to `input.checked` after attribute patching and is excluded from serialized attributes. A controlled checkbox without a checked attribute is reset to false as before.

The regression in `compiled-frontend/frontend/dom/renderer.test.mjs` wraps native-GoScript-shaped struct and GoSlice view values. It first checks the initial HTML, then edits and checks the live controls, captures the keyed draft node, focus, and backward selection, updates the compiled View, and verifies exact HTML and live control state. It also verifies the two binding messages and that the keyed input remains the same focused node with the same selection.

## Evidence and verification

The preserved N3 failure is [attempt-06/form.browser.failed.json](../../artifacts/conformance-captures/attempt-06/form.browser.failed.json), SHA-256 `4ea4e6eb7d3ddf79b4ae9e6e033d941ed0a6558b7c7003537c6534f59c9bcc09`. It records the expected input order `aria-label`, `type`, `value`, versus the old DOM output `type`, `value`, `aria-label`. The independent oracle is unchanged. The pre-repair source/test hashes and failing witness fingerprint are pinned in [before.sha256](../../evidence/repairs/dom/before.sha256).

The added focused test was first run against the old renderer and failed on the exact initial `outerHTML-v1` order. The captured red output is [input-order.red.log](../../evidence/repairs/dom/input-order.red.log), SHA-256 `bcad347537fe08c4d1b33ab512b50a6fc578b479cc23dc99cc2ed71532f781ff`.

Verification used Node `v22.23.4` and Chromium `153.0.8010.0` at `/tmp/chromium`:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/dom/renderer.test.mjs
```

Result: **4 passed, 0 failed** in Chromium. The saved output is [renderer.test.log](../../evidence/repairs/dom/renderer.test.log), SHA-256 `0a164b4b3d112bedbde565591f7c90b25f8579282de56bfb2cec1f7e587a8dd4`. It includes the original mount/binding/style/stale-callback checks, the new post-input regression, and keyed reorder focus/selection preservation. Node emitted a non-failing `[UNDICI-EHPA]` experimental `EnvHttpProxyAgent` warning from the Playwright environment.

## Limits

This is focused renderer evidence only. The full four-app/five-fixture integration matrix and cross-backend focus restore are pending N3 after source freeze. No production runtime, build, harness, demo, or DOM oracle files were changed for R-DOM.

## SHA-256

- Before renderer: `86fed3d2bd883a1de533731148c6b5238ac220343ccf9db6b4cc5340a0a7a38e`
- Before test: `7c7d472e2994869a1798bad82c7b466ba653734e35abdaaad9d0295e5347ca29`
- After renderer: `8037c0b9d3430310aa9492ab9d1041207e33276f8a6dce219b84b2af17efa166`
- After test: `8857f373a5d39c0f04b328021315867e6ffea34166ff18877f9dee3b44033efd`
- Failing browser capture: `4ea4e6eb7d3ddf79b4ae9e6e033d941ed0a6558b7c7003537c6534f59c9bcc09`
- Red log: `bcad347537fe08c4d1b33ab512b50a6fc578b479cc23dc99cc2ed71532f781ff`
- Green log: `0a164b4b3d112bedbde565591f7c90b25f8579282de56bfb2cec1f7e587a8dd4`
