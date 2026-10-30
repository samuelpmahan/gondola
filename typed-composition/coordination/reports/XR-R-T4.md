# XR-R-T4 independent review — unsaved-row test correction

**Decision: accepted.** The focused amendment repairs the causal gap identified in XR-T4. It creates an existing child row with empty `Saved`, uses that row's current input revision for direct `publish`, checks the rendered publish button is disabled, and exercises the canonical disabled click path.

## Verification

- The setup creates row 1 and the test explicitly asserts `beforeChild.state.Rows[0].Saved === ""`, `Key === "row-1-publish"`, and handler argument `"1/1"`. The direct call is `publish(child, 1, beforeChild.state.InputRevision)` and asserts the specific empty-saved rejection. It cannot pass by reaching a missing-row error: that row is the existing row at index 0, and the expected error identifies row 1's empty Saved value.
- After the direct rejection, child and parent snapshots compare equal to their pre-call snapshots and `changes()` is empty. The test then dispatches the exact current canonical click on the disabled row button, checks the full returned child snapshot, messages, parent inbox, and dirty IDs remain unchanged.
- It saves that same row, completes request 1, drains the completion dirtiness, then publishes at the same current input revision. The accepted receipt has `Sequence === 1` and the captured saved value, demonstrating the prior direct rejection and disabled click consumed no sequence.
- The prior “stale revisions, wrong parents, roots, and unsaved rows” test still separately exercises a nonexistent row 2 with the `row 2 no longer exists` error. It no longer substitutes for the existing-unsaved-row case.
- I compared `reference.test.mjs` against `evidence/source-before-review.tar.xz`. The only delta is this new test; the reference model and scripts are unchanged.

No author test suite was rerun for this bounded review. The repair matches the requested evidence and has no remaining blocker in scope.
