# E-CI-DOM: primary hosted lifecycle artifact DOM audit

**Outcome: `confirmed_reuse` for the direct-module and physical-browser DOM evidence only.** The primary workflow failed during native CLI replay, so this report does not claim native Go equivalence, a completed lifecycle checker, or overall CI success.

## Artifact and source binding

This audit uses the primary push artifact `13034915662` from run `41178420647`, on source `49cc2b96c8817a47319d5b7bd484184a22fa984b` (tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`). The retained provider record identifies 47,035,803 bytes with SHA-256 `6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`. The independent binding verifier reassembled and checked all 12 downloaded ZIP chunks, matched the capture, direct trace, run record, failure record, browser bundle and nested lifecycle archive to extracted action-artifact members, then matched selected React/DOM AppIR, encoder, compiled-module and manifest members to the nested archive. React and DOM share AppIR SHA-256 `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d` and encoder SHA-256 `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`; their backend-specific compiled modules have distinct hashes recorded in `lanes/dom/artifact-bindings.json`.

The capture is `extracted/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.browser.capture.json`, 66,817,124 bytes, SHA-256 `a663d77ba16c43adfb3f4b12666845b82047b3e1b9c7ed68ffea8c98ac304ad6`. Its bundle is pinned at SHA-256 `ef3510480d4d30ffb5f8ee172e8b29532269cce806cc0c030cd22e553ba92368`. All captured source pins match the 49cc checkout; the fixture `app.go` and `view.go` hashes are separately checked by the audit because the attempt’s source-pin list omits those two files.

## Literal state, tree, and physical DOM checks

I ran a separate audit that imports the hand-authored lifecycle oracle, not candidate output, and independently decodes each raw encoded `State` field. For each React, DOM, and alternating-swap profile, it checks all 26 Go trace ticks and all 27 physical snapshots against literal expected state, Go View tree, renderer snapshot, and DOM. The 27th snapshot is the second snapshot at the renderer swap, which has no Go tick. The audit compares captured `outerHTML` and each live control’s actual `HTMLElement.disabled` property against the literal DOM/control expectations. It also verifies all 16 actual enabled button clicks, paths, dispatched messages and corresponding tick increments.

The checked tree has Parent → Child → Grandchild plus the independent Sibling. Removing Parent leaves the removed placeholder and Sibling, removes Child and Grandchild, and produces cancellation records in Grandchild, Child, Parent order. Sibling remains pending. The controls at that point expose disabled Sibling Request and Parent Remove, with Parent Remount enabled. Remount restores the three-node subtree at generation 2 with reset counters, preserves Sibling’s pending request, and updates the live Remove/Remount disabled properties.

Each profile ends with an empty pending queue. Seven expected requests and the three ordered cancellations are recorded. The retired generation-1 Parent, Child and Grandchild completions are rejected without Go ticks; the sibling and fresh generation-2 replies are accepted; duplicate completions are rejected. The alternating profile records 17 renderer swaps. At each swap, the trace, typed state/View, pending correlations and effect records are equal before and after replacement. Six retained detached Child/Grandchild Add and Request buttons were clicked after remount; they remained disconnected and made no change to state/View, callbacks, pending effects, effects or physical HTML. Sixteen swaps had an eligible old user-action callback; both its dispatch and stale callback were fenced. The remaining scheduled swap had no prior user-action callback to retain.

Across profiles, the capture reports browser `156.0.8078.4`, Playwright `1.64.1`, no page errors, no WASM requests or API attempts, and identical canonical snapshot and trace hashes. At each tick, browser state, View, requested effects and completed effects also match the separate direct emitted-module replay. This is a comparison against the compiled module, not native Go.

## Workflow failure boundary

The hosted execution record is failed and the lifecycle matrix record is rejected. Direct emitted-module replay and all three browser profiles completed, but the required native Go CLI stage tried to spawn `/home/runner/work/gondola/gondola/go` and failed with `ENOENT`; the final conformance checker was withheld. Therefore this packet establishes the bounded compiled-state, View, physical DOM/control, cancellation, effect and callback-fence checks from the artifact. It does not establish the missing native comparison or a full CI pass. The older local preflight is not used as evidence for this hosted run.

## Reproduction and hashes

Commands run from the repository root:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --max-old-space-size=4096 compiled-lifecycle/ci/2026-10-31/lanes/dom/audit-ci-dom.mjs
python3 compiled-lifecycle/ci/2026-10-31/lanes/dom/verify-artifact-bindings.py
```

The audit is deterministic and uses no random seed. The browser profiles and raw artifact were not regenerated or modified. Audit script SHA-256: `3005b2606bf801dda3b44d2b8cc58c39d3c726fd3f6c2f68f59e3cd94449bb94`; result SHA-256: `8e33f9018264192dd36e60825d7d4555f85c4594660d02fbe8d09948ebe82049`. Artifact-binding script SHA-256: `550eeaa51216b4418234447b193d9f88736ce3050cc7a8a41acd82fd9e2d371b`; binding result SHA-256: `7659587e4ed91eb352e5ffd51dee5c2bbac8a56b91a191b43c0979b6cf8763d7`.
