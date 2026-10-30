# XR-R-T4 — Review of the corrected renderer-retention witness

**Decision: accepted.** The reviewed `scripts.mjs` and `scripts.test.mjs` hashes match the assignment. The specifically asserted focus-retaining swaps target `oak`, `branch`, and `bud`; each is immediately preceded by a focus action for that same session with a noncollapsed selection. Their expected descendants are mounted before those swaps.

## Review details

The corrected fixed schedule orders its three target-focus witnesses directly before the required swaps:

- `focus(oak, row 1, 2..8, forward)` then `replace(oak, react)`, with `branch` and `bud` already mounted as descendants.
- `focus(branch, row 1, 1..6, backward)` then `replace(branch, godom)`, with `bud` already mounted as a descendant.
- `focus(bud, row 1, 0..5, forward)` then `replace(bud, react)`.

The new script test checks that exact predecessor/session/row/selection relationship, checks descendant lists and mount indexes, and confirms the child remains a live action target after its parent replacement. It also checks that the replaced child remains interactive while its grandchild shell exists. The later `replace(oak, godom)` is not in the test's target-focused required-swap list; it occurs after the `bud` focus witness, so it additionally exercises descendant focus retention through a parent swap.

The fixture captures actual candidate shell, view-root, children-root, parent, and input-node tokens for every active session. `check.mjs` validates those tokens across each candidate replacement, including descendant and sibling input identity, and checks the target's prior selection or a focused descendant's selection afterward. I inspected these assertions but did not run the fixture/browser replay.

## Verification

- `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test session-tree/scripts.test.mjs` — passed, 4 tests, 0 failures.
- Reviewed `session-tree/fixture.mjs` capture/token logic and `session-tree/check.mjs` replacement identity/focus validation by inspection.
- Confirmed the reviewed source snapshot hashes:

```text
session-tree/scripts.mjs       53b93aebe11ef0a38b41de8b654df2973ba4a82be9a13423c49fb77997f17ac6
session-tree/scripts.test.mjs  95e80bff1788bb60701b2a0d7674dccffc90caf8edef12d98df641e94d197014
```

This review covers the fixed schedule and its unit test. I did not run a browser replay and do not claim candidate-versus-reference parity; root's full runner and T5's corrected fixed/default replay are separate verification.
