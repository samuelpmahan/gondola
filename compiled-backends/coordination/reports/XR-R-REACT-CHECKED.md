# XR-R-REACT-CHECKED (N4 independent review)

**Decision: accepted for the focused controlled-checkbox repair.** The post-commit cleanup is restricted to validated `target.checked` bindings, preserves the live checked property, and leaves non-bound static checked attributes intact. The focused tests inspect raw DOM and cover mount, updates, and fresh-renderer remount. This does not accept the paused four-app/five-fixture matrix.

## Source review

`normalizeAndValidate` validates that each `target.checked` binding points to an `<input type="checkbox">`, uses the `change` event, and represents true checked state with a checked flag. `lowerView` continues to supply React's controlled `checked` property and checked event handler from that View and binding.

After `flushSync` commits React's update, `clearControlledCheckedAttributes(built.bindings)` iterates only the validated binding records whose source is `target.checked`. It looks up the committed input by path, saves `element.checked`, removes the reflected `checked` HTML attribute, then restores the saved property. Unbound static checked inputs are not visited. The helper does not dispatch events or call application code. This is a source-level basis for saying the cleanup itself does not mutate Go state; the focused browser test does not mount a compiled Go runtime or directly inspect Go state.

The snapshot path remains `renderedRoot.outerHTML` and the snapshot's controls are read from live DOM properties. The repair does not weaken or normalize `outerHTML-v1`; the added test also reads `host.firstElementChild.outerHTML` directly. The reviewed R-REACT-CHECKED source scope contains only the React renderer, its browser regression, and repair evidence; it excludes the oracle, DOM renderer, runtime, and build output.

## Behavior verified

The browser regression proves:

- Initial controlled `checked=true` mounts with `controlled.checked === true` and no physical `checked` attribute. The non-bound static checked input keeps both its checked property and `checked=""` attribute.
- Re-rendering true, then false, then true leaves the controlled checkbox property in sync while its checked attribute remains absent. The test preserves and compares both keyed input nodes through these updates.
- A fresh renderer remount with checked true produces the same controlled/static HTML and property distinction. Focus continuity across unmount/remount is not claimed.
- The draft input remains focused with backward selection `[1, 3, "backward"]` through the in-place updates.
- Raw physical outerHTML is captured after initial mount, before update, after each checked update, and on fresh renderer remount.

The current attempt-07 captures independently show the same reflected-attribute mismatch in form, list, and list-growth: a bound checked input in the React capture includes `checked=""` where the expected `outerHTML-v1` does not. The repair is intentionally limited to validated checked bindings, rather than applying to every checked attribute.

## Test evidence

N2's preserved red log fails on the initial raw outerHTML because React emitted `checked=""` on the bound checkbox. Its green raw-HTML log passes the new real-Chromium browser test and prints the live properties and markup. The full React suite log records 26 passed, 0 failed.

I independently reran the current full React suite with Node `v22.23.4`: 26 passed, 0 failed. I also reran the browser test with `GOBI_CAPTURE_PHYSICAL_OUTERHTML=1`: 1 passed, 0 failed; the captured raw DOM shows the controlled checkbox checked property toggling true/false/true while the serialized attribute remains absent, while static checked markup remains present. These independent logs are in `evidence/reviews/xr-r-react-checked/`.

## Boundary

Accepted here: explicit, validated `target.checked` bindings in the React renderer, including physical markup and live checked state across mount, update, and fresh renderer remount. No compiled-app module/Go runtime state matrix was run by this review. The root has paused N3's full matrix for the separate R-OBS runtime error-path repair; do not infer full backend or cross-renderer acceptance from this focused result.

No production files were changed during this review.
