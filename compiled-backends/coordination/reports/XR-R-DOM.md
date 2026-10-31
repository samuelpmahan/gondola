# XR-R-DOM (N4 independent review)

**Decision: accepted for the focused R-DOM repair.** The input-attribute ordering change and `checked` property handling address the preserved attempt-06 form mismatch. The four focused Chromium tests cover the specific rendering and same-renderer identity/focus behavior claimed by R-DOM. This does not accept the full backend milestone: N3's current four-app/five-fixture integration run and cross-backend focus-transfer evidence remain separate.

## Source and behavior review

The reviewed source hashes match the R-DOM receipt: renderer `8037c0b9d3430310aa9492ab9d1041207e33276f8a6dce219b84b2af17efa166`, test `8857f373a5d39c0f04b328021315867e6ffea34166ff18877f9dee3b44033efd`.

`attributesInDOMOrder` changes ordering only for `input`: ordinary attributes retain their source order and precede `type`, then `value`; `checked` is omitted from serialized attributes. `applyAttributes` then applies checked state through `element.checked`. For other element tags, source attribute order is unchanged. This matches the existing fixture's `outerHTML-v1` expectation; this review makes no claim about every browser/React attribute combination.

The new GoScript-shaped browser test begins with source-order attributes `type`, `value`, `aria-label` and checks the expected literal HTML `aria-label`, `type`, `value`. It edits the draft and checks the checkbox, then updates the View. The post-update snapshot has no serialized `checked` attribute while the live control record reports `checked: true`. The event observations contain the expected `draft` and `checked` messages.

The test saves the keyed draft input and verifies the same physical node is still present and focused after update, with selection `[1, 4, "backward"]`. A separate existing test reorders keyed inputs and verifies the moved input remains the same focused node with its selection. These are within-DOM-renderer reconciliation checks. They do not establish React-to-DOM focus restoration, which remounts different physical nodes and belongs to N3's integration run.

## Evidence review

- The preserved attempt-06 form browser capture (`4ea4e6eb7d3ddf79b4ae9e6e033d941ed0a6558b7c7003537c6534f59c9bcc09`) records the actual DOM input as `<input type="text" value="typed draft" aria-label="Draft">`; the independent expected order is `<input aria-label="Draft" type="text" value="typed draft">`. Its failure occurred during the first React-to-DOM swap after text editing.
- The preserved red test log (`bcad347537fe08c4d1b33ab512b50a6fc578b479cc23dc99cc2ed71532f781ff`) fails at the initial HTML assertion with the same order difference against the pre-repair renderer. The pre-repair renderer and test hashes are retained in `compiled-backends/evidence/repairs/dom/before.sha256`.
- The green log (`0a164b4b3d112bedbde565591f7c90b25f8579282de56bfb2cec1f7e587a8dd4`) records 4 passed, 0 failed using Node `v22.23.4` and Chromium `153.0.8010.0` at `/tmp/chromium`. The current test hash matches the receipt. I audited the saved run rather than starting another Chromium process while N3's post-repair integration run is active.

## Boundary

Accepted: the focused input serialization and live checked-state repair, with keyed-node/focus/backward-selection coverage inside the DOM renderer. Not accepted by this review: the complete four-app/five-fixture matrix, a current N3 form-positive run, or cross-backend focus restoration. The report and receipt accurately mark those as pending; no universal renderer-equivalence claim is inferred from the focused suite.

No production files were changed during this review.
