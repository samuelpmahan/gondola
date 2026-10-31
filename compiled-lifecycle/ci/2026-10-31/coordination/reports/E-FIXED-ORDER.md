# E-FIXED-ORDER — review of request order and lifecycle fences in the passed primary run

**Decision: accepted for the ordered lifecycle/effect and renderer-fence evidence** (`confirmed_reuse`). This review is bound to the successful primary artifact and keeps the un-compared action-metadata field and the separate stronger headless sequence explicit.

## Artifact and source binding

The reviewed provider artifact is ID `13035044166`, run `41181505234`, commit `00da54ad0f5a4006b13a5cded18ce291845978bc`, tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`. I verified the original ZIP is 47,072,021 bytes and SHA-256 `0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26`. The retained provider verification record reports all 1,270 ZIP members and CRCs passed. The extracted artifact is rooted at `compiled-lifecycle/ci/2026-10-31/fixed/extracted/`.

The attempt `compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z` records E-BUILD `mode: full`, `status: passed`, and 123 unchanged source pins. I checked each pin against the exact Git blobs at commit `00da54ad0f5a4006b13a5cded18ce291845978bc`; all match its tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`. The conformance run and check records both report `matched`, and all seven named stages completed.

## Go and effect evidence

The fixed fixture has 26 events and 26 Go ticks. Native, direct emitted-module, and the React, DOM, and alternating-swap browser profiles are checked against the literal fixture; the check record also reports the physical DOM matched the literal oracle. I independently compared the direct trace with each browser trace over the core fields `index`, `message`, `dispatchId`, `state`, `requestedEffects`, `completedEffects`, and `view`; all three projections match.

Each browser profile records seven requests, with tokens `parent:g1:r1`, `child:g1:r2`, `grandchild:g1:r3`, `sibling:g1:r4`, then `parent:g2:r5`, `child:g2:r6`, and `grandchild:g2:r7`. Parent removal emits exactly three cancellations in Go order: Grandchild, Child, Parent. Their effect indices 0, 1, and 2 target the earlier request correlations for those same tokens. Sibling has no cancel record, remains the sole pending request after subtree retirement, and later completes. The four accepted replies are Sibling followed by generation-2 Grandchild, Child, and Parent.

Three force-delivered retired generation-1 callbacks are rejected in each profile. The direct/native sequence also sends the old Grandchild, Child, and Parent Go completion messages at events 11–13; all are `stale-no-op` and leave the prior state, View, and effects unchanged. Duplicate direct Go completion messages for Sibling and generation-2 Child at events 15 and 25 are also `duplicate-no-op` with unchanged state/View/effects. The six-event retained-button probe runs in each profile after subtree removal/remount: all 18 clicks target disconnected buttons, and trace, snapshot, callbacks, pending work, effects, and physical HTML are unchanged.

In the swap profile, 17 renderer replacements create 18 renderer instances. Sixteen swaps have eligible retired callbacks; each fences both a dispatch callback and a stale callback, for 32 rejected invocations. One swap is ineligible. The scheduled fixed swap preserves the exact four pending Go requests. All three profiles reach an empty pending queue before unmount; unmount leaves no physical DOM and creates no new Go tick or effect change.

The literal check's eight mutation controls were all detected. The raw evidence and its hashes are referenced in `fixed/lanes/order/audit.json`; the large browser capture remains at its original artifact path rather than being duplicated into the review lane.

## Action metadata boundary and schedule limit

The checker compares the core Go fields listed above but excludes `action` from both `assertGoTrace` and the cross-profile `fullGoProjection`. For the injected Go-message ticks 11–13, 15, and 25, the direct trace has `action: null`; the browser trace carries an empty-path click object (`{"path":"","event":"click","value":""}`). That metadata is not compared for canonical parity, so no failure is inferred from it. The 16 physical click action records per profile are validated separately against the expected DOM path, event/value, target properties, and observed Go message.

The browser matrix's old generation-1 Go messages run after remount but before the generation-2 requests at events 19–21. It does not test those stale messages while generation-2 requests are pending. The stronger active-generation case is the separate headless E-LIVE-REPLY supplement at `compiled-lifecycle/ci/2026-10-31/local/source-coordination/receipts/E-LIVE-REPLY.json` (SHA-256 `afbb2cd55e8e6f8cc5159256cd0dce79fd684c0b4bc68c8b18e6467a556b575a`), not part of this browser replay.

## Reproduction and raw evidence

Run `python3 compiled-lifecycle/ci/2026-10-31/fixed/lanes/order/audit_order.py` from the CI worktree root with Python `3.12.14`. The read-only audit checks the pinned artifact and Git source, parses the fixed native/direct/browser records, verifies full core projections and effect/callback order, validates detached-click and unmount invariants, and records the action/schedule boundaries.

- Audit result: `compiled-lifecycle/ci/2026-10-31/fixed/lanes/order/audit.json`.
- Audit script: `compiled-lifecycle/ci/2026-10-31/fixed/lanes/order/audit_order.py`.
- Fixed check: `compiled-lifecycle/ci/2026-10-31/fixed/extracted/compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/matrix/lifecycle.check.json`, SHA-256 `b1bbd8a41d6eca789aa27fe5bbcdaa582e908249d8d1ff1fabc4e603e374718a`.
- Direct trace: same attempt's `matrix/lifecycle.direct.json`, SHA-256 `4fbd9bb6b94e14647edfad95bf681949b2a14ead04091d351f2f4f6eb1689d71`.
- Browser trace/capture: same attempt's `matrix/lifecycle.browser.json` and `matrix/lifecycle.browser.capture.json`, each SHA-256 `f93564a73887472bef70fcb925882ef80a07a2845dfddec25ce89be9796ba280`.
- Environment recorded by E-BUILD: Node `v22.23.4`, Playwright `1.64.1`, Chromium `156.0.8078.4`, root Go `1.24.13`, and compiled Go `1.27.3`.
