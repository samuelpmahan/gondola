# XR--DOM

**Decision: amend.** I independently reviewed N2's native DOM renderer, shared view validator, and React refactor, then reran the focused Chromium and React regression suites. No blocking defect surfaced in the inspected renderer behavior or the 3 Chromium / 25 React test cases.

## Findings

- `createDOMRenderer` uses the shared validation and identity helpers, preserves keyed physical nodes through reorder, reads live target values for bindings, keeps literal `On.Arg` intact, emits ordered outerHTML and controls, and empties its root on unmount. The focused browser tests passed these assertions.
- The React change is a source extraction of its existing validation and record helpers into `shared/view.mjs`; the surrounding React lowering/mount logic remains unchanged. The React renderer and bindings suites passed 25/25 after the extraction.
- The descriptor checks admit the observed GoSlice field layout and inspect native array/backing descriptors without ordinary gets or invoking the spare-capacity factory. The tests use marker-and-wrapper-shaped GoScript values, not a runtime-generated compiled app instance.

Acceptance remains open for the N3 integration gate. N2's three DOM tests do not exercise actual generated app modules, a runtime-owned React↔DOM replacement, old-root versus new-root physical node identity, focus restoration across backends, or retired callback fencing through a live DOM listener. The DOM test snapshots live control properties before its input interactions; it then verifies the resulting event messages, but does not take a second snapshot after the properties change. The 25 React regressions are not a mounted React browser run. N3's four-app/five-fixture matrix must establish these cross-backend claims before full acceptance.

## Independent verification

```sh
CHROMIUM_PATH=/tmp/chromium PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-frontend/frontend/dom/renderer.test.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-frontend/frontend/react/renderer.test.mjs compiled-frontend/frontend/react/bindings.test.mjs
```

Results: **3 passed, 0 failed** in Chromium `153.0.8010.0`, then **25 passed, 0 failed** under Node `v22.23.4`. The Node runs emitted a non-failing experimental `EnvHttpProxyAgent` warning. Syntax checks for `shared/view.mjs`, `dom/renderer.mjs`, and `react/renderer.mjs` all exited 0.

The source fingerprints, commands, captured logs, and behavioral checklist are in [the review evidence directory](../evidence/reviews/xr-dom/audit.md). No production source was modified by this review.

## Integration addendum — N3 attempt-06/form

This addendum preserves the bounded source review above and records subsequent integration evidence; it does not revise the earlier test results. N3's captured `attempt-06/form` browser run identifies a concrete cross-backend exact-output defect on the first React-to-DOM replacement after typing into the draft input. The browser runner rejects with `new renderer DOM differs from the independent DOM oracle after swap` at stage `profile-or-swap`.

The captured post-input oracle HTML orders the draft input attributes as `aria-label="Draft" type="text" value="typed draft"`. The DOM renderer's captured HTML orders them as `type="text" value="typed draft" aria-label="Draft"`. These are semantically equivalent HTML attributes, but they differ under the required exact `outerHTML-v1` comparison. The mismatch occurs on the keyed `form-draft` input after the action `{path:"0", event:"input", value:"typed draft"}`; the corresponding logical view retains the source attribute order `type`, `value`, `aria-label`.

Evidence is in [the browser failure capture](../../artifacts/conformance-captures/attempt-06/form.browser.failed.json) (SHA-256 `4ea4e6eb7d3ddf79b4ae9e6e033d941ed0a6558b7c7003537c6534f59c9bcc09`), corroborated by [the run record](../../artifacts/conformance-captures/attempt-06/form.run.json) (SHA-256 `6c5ee930c7308745e6e43a602cde8bc3cc98d084166902c502e995753330a13c`) and [the failure envelope](../../artifacts/conformance-captures/attempt-06/form.failed.json) (SHA-256 `2714d2f9826600c6bb8a3f31e5f924a00e2fa125b1d1c4edea0f5480bd75f041`). The browser capture records the rejected stage and error; the run record says `sourceStable: true`. The native and direct JavaScript traces are byte-identical in this capture (both SHA-256 `fea373984870d8613d2c6bd961594b77c7f37d18de01e0ce01b8fb8f25d2f18e`). This is a captured integration result; I did not rerun or alter the N2 renderer source during this addendum.

Decision remains **amend**. N2 source-level focused suites passed as documented above, but this captured cross-backend mismatch blocks acceptance of the DOM replacement profile until corrected and rerun through the independent oracle.
