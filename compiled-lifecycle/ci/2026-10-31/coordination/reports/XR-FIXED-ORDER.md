# XR-FIXED-ORDER — independent review of the passed primary run

**Decision: accepted** (`confirmed_reuse`) for the ordered lifecycle/effect, browser DOM, and renderer-fence evidence in the exact successful primary artifact.

## Binding

- Provider artifact `13035044166`, run `41181505234`, ZIP size `47,072,021` bytes, SHA-256 `0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26`.
- Source commit `00da54ad0f5a4006b13a5cded18ce291845978bc`, tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`.
- The frozen E-FIXED-ORDER report/receipt match the assigned hashes. Its audit and audit-script hashes also match its receipt.
- I inspected the original provider ZIP and manifest-pinned matrix files in the fixed extraction. The extraction-only unmanifested temporary file was excluded.

## Findings

The primary run and conformance check both report `matched`. The native fixture has 26 ordered steps; the direct and React, DOM, and swap Go traces each have 26 ticks. Direct and browser traces match on `index`, `message`, `dispatchId`, typed state, requested and completed effects, and View. The request sequence contains seven unique correlations: parent/child/grandchild/sibling at generation one, followed by parent/child/grandchild at generation two.

Removing the subtree emits exactly three cancellation effects in Grandchild, Child, Parent order: `grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`. Parent, Child, and Grandchild retire; Sibling stays alive and pending through removal and remount. Old generation-one Go completions at events 11–13 preserve state, View, and effects. Duplicate Sibling and generation-two Child completions at events 15 and 25 are also no-ops. The accepted replies are Sibling followed by generation-two Grandchild, Child, and Parent.

The fixed renderer replacement preserves all four pending correlations, effect records, trace, state, and View. Across the three profiles, all 81 captured physical snapshots equal the expected DOM trees. The live button `disabled` properties match the corresponding raw HTML attributes; all 48 ordinary click targets are connected and enabled. Six retained detached-button click attempts per profile leave the recorded state, callbacks, pending work, effects, and DOM unchanged, for 18 inert clicks total.

The swap profile records 17 replacements and 18 renderer instances. Sixteen swaps are eligible; each eligible swap records rejected returns for both retired callback types, for 32 rejected callback invocations. One swap is ineligible. The final cumulative `diagnostics.fencedCallbacks` snapshot has 30 entries; the 32 total is supported by the per-swap returned outcomes, which cover all 16 eligible swaps. Each browser profile drains pending work before unmount, which empties the physical DOM without changing trace or effect records. All eight conformance mutation controls were detected.

## Limits

Canonical direct/browser projection excludes injected Go-message `action` metadata. Direct injected completion ticks have `action: null`; browser ticks carry an empty-path click object. Physical click action records are checked separately. No full byte-identical trace claim is made for the excluded field.

Old generation-one Go completions occur after remount but before generation-two requests become pending in this fixed browser script. The stronger active-pending old-reply sequence remains separate headless evidence and is outside this packet.

## Review execution

No builds or test suites were run for this review. The read-only verifier parsed the pinned JSON records and raw HTML snapshots, checked the provider ZIP and frozen E-FIXED-ORDER pins, and wrote `compiled-lifecycle/ci/2026-10-31/fixed/reviews/order/review.json`. Verifier SHA-256: `477a0b56affc6d7d63391450b3eeb6997f486be19ffae5a27cebfb0d5d69a5be`. Review JSON SHA-256: `4cbc58f9ab954cf21db58ffe80c7e8cf5c4ff1f577ee83183381f846f9180f4f`.
