# XR-T4 — Independent model and scripts review

## Decision: amend

The independent model's transition logic matches the Go composition API for the reviewed state and policy paths. I found a causal coverage gap around an existing row with empty `Saved`: the test named for unsaved rows publishes row ID 2 after creating only row 1, so it exercises the missing-row guard. Add a focused assertion for the nonempty-`Saved` admission path before accepting the lane's test evidence.

## Review findings

- The model composes the existing JavaScript session-tree/collection references with separate composition metadata; it does not import the Go manager. State extension and the exact four-field snapshot envelope match `composition.Snapshot`.
- The projection preserves collection children 0–2, appends title and inbox at 3–4, and places each row's publish button at child 9. Its class, label, handler, `ROW/REVISION` argument, and disabled cases match the Go projection. Read-only walks every button and input, keeps bindings/handlers, validates an event before suppressing it, and still routes completion through the collection reference.
- Inputs are immediate-parent only, equal updates increment revisions, and failed parent/revision/title cases do not dirty state. Publication captures the saved row data, checks the current revision and read-only policy, uses a global sequence, records the message on the child, routes the inbox receipt only to the immediate parent, and dirties child plus parent. Message merging and `Changes()` ordering/clearing match the Go manager.
- The fixed scripts witness equal-input stale revisions, rendered publish dispatch, captured saved content after a draft edit, repeated receipts, read-only completion, grandchild routing, inbox retention, disposal, and recreation. The current author files contain 12 reference tests plus 5 script tests, so the report and receipt count of 17 is correct.
- A separate bounded seed-coverage probe executed all 60 default generated scripts against the independent model: maximum script length was 40; 47 scripts included a publish, 12 included a completion, and 51 enabled ReadOnly at least once. All scripts emitted their expected per-action frames. This supplements, but does not replace, the author tests, which execute six custom bounded seeded cases.

## Required test amendment

`reference.test.mjs` currently labels a case “unsaved rows” but checks `publish(child, 2, 2)` when row 2 does not exist. Add a causal witness that creates an existing child row with empty `Saved`, asserts its publish button is disabled, calls `publish(child, 1, currentRevision)`, and verifies the error leaves child state/messages, parent inbox, sequence-visible behavior, and dirty IDs unchanged. The fixed trace snapshots an empty child row, but its focused assertions do not currently check that disabled condition. The root control test similarly asserts the disabled projection and direct `Publish(root, ...)` rejection; a direct disabled root publish-step suppression assertion would close the same rendering-to-dispatch path.

I ran a bounded probe at `coordination/reviews/xr_t4_empty_publish_probe.mjs`. It confirms the model currently renders both an empty child row and root row disabled, rejects publication of the existing unsaved row without dirty IDs, and suppresses the disabled root publish step without changing its snapshot. The behavior appears correct; the requested amendment is to make those contract witnesses durable in the author tests.

## Limits

This review covers the independent model and script lane. It does not claim native Go differential, actual browser composition replay, host propagation, or the inherited runner passed.
