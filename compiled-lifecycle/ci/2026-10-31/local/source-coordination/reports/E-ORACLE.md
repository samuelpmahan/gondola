# E-ORACLE

**Worker N4 · Outcome: mixed change.** Added a hand-authored, renderer-independent lifecycle oracle for the frozen finite Go fixture. The oracle records every state, event, message, request/cancel effect, node tree, exact `outerHTML-v1` string, and live button property. It contains no JavaScript application reducer and does not infer expected state from candidate traces.

## Oracle coverage

`compiled-lifecycle/browser/lifecycle-oracle.mjs` contains 26 literal `State` checkpoints: Init plus the 25 Go messages in the fixed 26-event scenario. Event index 8 is the DOM → React replacement and has no Go trace tick. `LIFECYCLE_STEPS` independently specifies the 16 physical clicks, three stale generation-1 messages, two duplicate messages, four accepted effect replies, the renderer replacement, and each ordered effect list. The fixed script uses no random seed.

The state table records the four initial requests and request IDs 1–4, cancellation of Grandchild → Child → Parent, sibling survival, remount into generation 2, stale generation-1 replies that leave the remounted state unchanged, sibling completion, generation-2 requests 5–7, reverse-order completions, and duplicate no-ops. Requests use the admitted `fixture.request/lookup/token/complete` effect; cancellation uses `lifecycle.cancel/cancel/token/""`. The component identity in the oracle is the frozen full package path `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`.

The expected tree projection independently records node kinds, tags, keys, ordered attributes, handlers, child order, and text. The DOM projection records exact markup and button controls with path, key, tag, type, value, checked, and disabled fields. The separate physical-control expectations also include visible button text, letting the harness read actual `HTMLElement.disabled` properties at each checkpoint. Pending requests remain listed across the renderer-swap event; no cancellation is expected at that point.

Mutation tests prove the oracle distinguishes reordered cancellation effects and an incorrectly accepted old-generation reply. Additional checks bind the event list to the frozen scenario, preserve sibling pending state through removal, and assert the expected disabled request/remount/remove controls.

## Verification

Node `v22.23.4` at `/tmp/gondola-node22/node_modules/node/bin/node` passed both syntax checks and the focused oracle suite:

- `/tmp/gondola-node22/node_modules/node/bin/node --check compiled-lifecycle/browser/lifecycle-oracle.mjs && /tmp/gondola-node22/node_modules/node/bin/node --check compiled-lifecycle/browser/lifecycle-oracle.test.mjs` — exit 0.
- `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-lifecycle/browser/lifecycle-oracle.test.mjs` — **5 passed, 0 failed**, exit 0. Raw TAP output is `compiled-lifecycle/browser/lifecycle-oracle.node22.test.log`.

The test uses the one fixed fixture script, so there is no seed. Node printed its existing experimental `EnvHttpProxyAgent` warning; all checks exited successfully.

## Evidence boundary

This receipt covers the oracle implementation and its focused tests. At report time, the N3 integrated browser replay had not produced retained profile snapshots, so this lane does not claim that a physical browser's raw DOM or live `disabled` values matched the oracle. N3's browser entry consumes `expectedLifecycleDOM` and `expectedLifecyclePhysicalControls` and is responsible for the actual React/DOM/swap observations. The oracle itself uses no new React implementation; the existing pinned React 19.3.1 and DOM adapters remain the browser harness backends.

The contract covers this fixed value-owned parent/child/grandchild subtree and independent sibling. It does not establish arbitrary pointer-manager compilation, unbounded topology, randomized lifecycle schedules, production transport behavior, or pixel equivalence.

## SHA-256

- `compiled-lifecycle/browser/lifecycle-oracle.mjs`: `795ba7fef0ff680019f4988aba5cfcecb25b205516a2c7058bfc720fc217cb82` (24,962 bytes)
- `compiled-lifecycle/browser/lifecycle-oracle.test.mjs`: `18c88acd3e9028af30b1f737599ae537fc1354ea65f37037e5c9f89281ebae6d` (10,481 bytes)
- `compiled-lifecycle/browser/lifecycle-oracle.node22.test.log`: `2db2aff769448ad04caf3d76e5f0c91a41679b5de9ecadfdf7cb58ae2051e2e1` (1,760 bytes)
- Frozen scenario comparison input `fixtures/compiled/lifecycle/scenario.json`: `45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650`
- Frozen contract `compiled-lifecycle/CONTRACT.md`: `ed9eedea8f9582583d1f89e44be20e55f692f037f2b8decc93025433e478e083`
