# XR-T4 — Independent review of the JavaScript reference and schedules

**Decision: accepted.** I reviewed the final `reference.mjs`, `scripts.mjs`, and their tests against the frozen session-tree contract. I found no blocker in model independence, tree and cancellation semantics, the pinned React projection, focus/event handling, or bounded deterministic schedules.

## Independence and model behavior

- `reference.mjs` imports React/ReactDOM and `../keyed-editor/model.mjs`; the latter imports only `../http-effects/reference.mjs`. The reviewed source graph has no Go, WASM, session-tree host, candidate renderer, or candidate snapshot dependency. The browser test constructs its own `createSessionTreeReference()` and passes that model's own snapshots/runtime to `mountTreeReferenceCollection`.
- The reference manager keeps its own `sessions` and `positions` maps. It validates primitive positive safe integer IDs, unknown/dead parents, and depth before allocating; roots have depth 1 and children inherit parent depth + 1. `tree()` sorts by ID and clones records. Invalid `dispose()` checks for children before draining effects. `disposeTree()` computes ascending-child depth-first postorder before removing nodes.
- Disposal bundles use reference-owned collection sessions. They emit queued cancels first, then remaining pending IDs in row order, deduplicate IDs, and preserve the Go JSON command field `Value: ""`. The tests and fresh probes cover unaffected roots and fencing of disposed IDs.
- The React reference builds from reference snapshots, translates supported Gobi attributes and event handlers, and holds its own keyed element refs. The actual Chromium test verifies pinned React/ReactDOM 19.3.1, disabled-state projection, controlled input dispatch, keyed input identity, logical selection restoration after update, absence of a `data-key` dependency, and Save click/effects.

## Schedule checks

The fixed-script validator and independent probes found the fixed witnesses semantically valid and bounded. I additionally ran an inline, review-only validator across seeds `0`, `1`, `2`, `2147483647`, and `4294967295`; caps 0 through 40; and 12 cases per seed/cap. All **2,460 generated schedules / 36,180 actions** were deterministic and valid, with no schedule exceeding its requested action cap or six live nodes. For caps at least four, the initial two-root, child, grandchild setup remained present and was counted within the cap. The largest observed schedule had 40 actions.

Fresh reference-manager probes drained initial starts, then exercised `remove`, `cancel`, and `reset` before leaf `dispose`; each disposal returned the queued cancellation for request 1. A three-row reset followed by `disposeTree` returned cancels `[1,2,3]` in row order with `Value: ""` preserved.

## Verification

Tool versions: Node `v22.23.4`; Chromium `153.0.8010.0`.

- `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node --test session-tree/reference.test.mjs session-tree/scripts.test.mjs` — passed, 8 tests, 0 failures. This includes the actual-browser React reference test.
- Inline generated-schedule probe — passed 205 seed/cap combinations, 2,460 cases, and 36,180 actions; covered caps 0–40 and the forced setup preconditions.
- Inline queued-cancel reference probe — passed remove, cancel, and reset before dispose, plus multi-row reset before `disposeTree`.

The full runner and candidate-versus-reference integrated parity were not run in this review and are not claimed. No source or test files were edited.

## Reviewed source snapshot

T4's author confirmed that the size reduction from 16,381 to 15,884 bytes was a final pre-report simplification removing an unused pending-command map; no `reference.mjs` changes occurred after T4's report or completion. I made no T4 source edits. Hashes of the final reviewed files:

```text
session-tree/reference.mjs       97e3dce4fa1147abf9da86c4fa091c8a8102bafdd9ee9caae965f9b866e53d3c
session-tree/scripts.mjs         1d93390e92a7d9f64092c574c81f7b10b1ed57f87a0342619238ccce2f
session-tree/reference.test.mjs  1065cf23a349852c2cc894368ef601e2a390805bf07b9beef1308315317720a5
session-tree/scripts.test.mjs    0cfcb0cd24531a8e445bdbf78a9fe3ffa1eeebf03488cad176806d615c50190b
```
