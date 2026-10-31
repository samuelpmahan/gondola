# XR-R-CI-DEMO — independent review of the screenshot wording repair

**Decision: `accepted`.** The repair accurately narrows the final screenshot description, preserves the earlier report and receipt, and refreshes the canonical report hash. The change is metadata-only; the CI execution, smoke evidence, audit code, audit result, and provider artifact remain unchanged.

## Repair and preserved originals

I reviewed R-CI-DEMO report SHA-256 `1f7692f34a76bac8e1c4c2eb2e863a3237ac07d324a3922d4428440aaca9eab2` and receipt SHA-256 `3c2236e8844d10fa9abae77ed234e2726851d124d4da24556fffefcd7d080f3a`. Its before-copy contains the original E-CI-DEMO report (`8,547` bytes, SHA-256 `9560e6f73314d002bf9ec9710035857c32b445d950233426f498e7a74cc45d05`) and receipt (`9,409` bytes, SHA-256 `e02d5fad69f211e096291e4bf1499459073cda0bf97fc03dd825debf7edb6b50`). Both byte sequences match the preservation manifest and the hashes from my prior XR-CI-DEMO review.

The revised canonical report says Parent is 0 with Parent Reset disabled, while Child is 2 with Child Reset enabled. It separately states that the smoke checked each reset disabled at its own zero state. This matches the retained screenshot and smoke source/record. The screenshot SHA-256 remains `623f8f010d87c0c2c2f1e709ce2daec64c11a1bfca508a1071352682ec7ba55b`; the smoke JSON SHA-256 remains `412f3c341dfdf67a521defef21965e0a2c993cb9cefb89fd6aabbf58060fe80d`.

## Canonical receipt and unchanged evidence

The current canonical report hashes to `59e3df79f76a43df07226dd59c959cd57a32cd528e9dbfade09f3b8765fa43da`, and the canonical receipt records that value. A recursive comparison of the preserved pre-repair receipt with the current receipt found exactly one changed JSON path: `/report/sha256`. The old receipt remains preserved unchanged.

The runner SHA-256 remains `eb1aa250c0c9cfbb7f3d73abf7692f8e50a57314836f8e5d0ac7d53a77a3cb68`. The demo audit script and result remain `f9b2143844af0cbd19ccb72b700cde046670bd14dc5aee0700dbfd01d01a1127` and `b1a43514f2b943d38caad7ea9cd03136baddd163df3eff571c2285f0fc25ac5c`. The provider ZIP remains `11,460,089` bytes with SHA-256 `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a`; all three retained chunks match their recorded sizes and hashes. No CI rerun or repeat of the previously accepted 164-check substantive audit was needed for this wording-only repair.

## Scope

This review accepts R-CI-DEMO's bounded correction and confirms the earlier XR-CI-DEMO amendment is resolved. It does not repeat the demo behavior audit or make a new aggregate CI claim. No source, artifact, or Git state was changed.
