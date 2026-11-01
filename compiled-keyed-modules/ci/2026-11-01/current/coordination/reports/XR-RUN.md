# XR-RUN independent acceptance review — N3

**Decision:** `accepted`  
**Reviewed job:** E-RUN (author N6)

## Sealed source and archive

The E-RUN report and receipt still match their seal: report SHA-256 `6ace8017ac5ce45a3abe0e60d15aa80ad79409df6f95d876f622a2edda191f7b`, receipt SHA-256 `92444590ed2b87ec4d1a5add357ebf9234206c2a932991c44ae3932c0588572f`. The published source is commit `f4c8f70199a8ca896c13e225a85901abe658d0de`, tree `9539b600d72927641217b77a20a38955350eec49`.

I independently consumed the primary archive at `compiled-keyed-modules/output/attempts/attempt-20261101T003733042Z-6-a2f2aa08.tar.gz`. Its 600 regular members match the sibling manifest byte-for-byte and by SHA-256. The archive hash is `1921ef063cd8f62f56384c72c65a0f87b26a6cabb015d3aff42040c96b6453d7`; the 140,670-byte manifest hash is `0f8f5b15c36442d54412ad6480f4dbbb475b4cabec45ef800a01498a312f064b`. All 157 archived source pins match `git show` at f4, and the archived before/after pin maps match each other and the manifest (map hash `0ad1fc4af4bc7fba1fcea09b6e89a081e53775b035b9e874adccf6fa8ee7d912`). The repository was clean before and after consumption; HEAD, tree, and status remained unchanged.

The four compiler outputs are present and manifest-bound: React/DOM parent and child builds. Their counts are 71 parent files and 70 child files per backend; build-index hash is `52941cb76f2408c2d9b3614e92ebd6e334235409ead6abd943d6c72b76ef125c`.

## Saved capture matrix replay

I replayed the sealed parity oracle over the actual archived native, direct, and browser JSON files for all four scenarios. The checker matched all 126 events and 130 native checkpoints, including 8 direct captures and 12 mounted captures. For each scenario, both direct backends matched native controller and child state and exact Go `NodeRecord` trees; React, DOM, and swap browser captures matched those states and trees. The swap captures also passed their DOM identity checks.

I independently recounted the saved mounted-browser events and identities. The 12 profiles contain 330 actual `HTMLElement.click()` attempts: 273 accepted clicks invoked one callback and observed the Go handler message; 57 disabled clicks invoked zero callbacks and left the Go call counts unchanged. The captures contain 24 stale-generation callback probes and 24 stale-generation publication probes; none made bridge calls. Across the four swap profiles, 32 identity checkpoints show that reorder retains both child elements, removing `a` retains `b`, and remount gives only `a` a new DOM identity and generation. The eight renderer swaps preserve Go state, membership, and child initialization counts while replacing renderer-owned DOM nodes.

The sealed capture and build oracles report all healthy checks matched before mutation checks. The 11 capture mutations and 17 build/helper identity mutations were detected. I did not rerun the full browser matrix; I replayed its saved captures and ran a separate mounted demo smoke below.

## Independent focused checks

With Go `1.24.0 linux/amd64`, I rebuilt the native CLI offline using `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off` and fresh Go/module caches. Its literal scenario and three seeded scenarios produced JSON exactly equal to the archived native captures, including bytes and SHA-256: 126 events and 130 checkpoints. Five focused Go packages passed. Node `v22.23.4` ran the runtime, module-loader, and oracle tests: 5 passed, 0 failed, 0 skipped. The runtime test invokes retained callbacks and publications after backend replacement while key/generation remain current, confirming renderer-epoch fencing independently of remove/remount generation fencing; the Go call counts stay unchanged.

I also served the restored prebuilt demo over HTTP without rebuilding it and ran Chromium `153.0.8010.0` with Playwright `1.64.1`. The browser fetched the 2,461-byte index (SHA-256 `80d2ee88280b40d9a2ea46f26ae1bc7bfebd193f9ea49c1a39ec0ea9d313c022`) and 8,880,641-byte bundle (SHA-256 `f582cf495a2a84e872576eae97f5e726377fd7d7419faca7bf1be62aa426cd16`), both HTTP 200; there were no page errors or failed requests. All eight smoke checks passed. A programmatic click on disabled zero-count Reset and another on locked Add invoked no callbacks or Go calls. Reordering retained the actual `a` and `b` roots; remove/remount replaced only `a` (`a:g2`, count 0) while `b` retained its root and count 1. DOM→React→DOM preserved membership and child state without increasing `childInit` (3 before and after).

## Existing regression receipts

The complete `rawlogs/E-RUN/SHA256SUMS` inventory verifies. Its preserved run logs report the Milestone 0 comparison as “same over 5000 inputs” with seed `20261030`, matching receipts, and valid `SHA256SUMS`; the counter interaction reports 107 scripts over 4,473 ticks, 8/8 Node tests, zero skips, and a matched native comparator. The preserved interaction trace gzip hash is `4f5c49b7a22f83fce0765120490c0ffa1487718f970b5e96d500c5a5c0a5a2e2`. The current source’s `EXPECTED.json` and `SHA256SUMS` hashes match the recorded baseline (`639e4327…333d2` and `8b6ec10d…ffe1a0`), and before/after checks are identical. I verified these sealed suite logs rather than rerunning those two broad regressions in this consumer review.

The earlier E-DELIVERY report's 148-checkpoint statement is corrected by the additive record in the E-RUN archive. The four native captures and independent replay both establish 130 checkpoints; this correction does not indicate an execution mismatch.

## Limits

Browser clicks are programmatic DOM `HTMLElement.click()` events, not trusted pointer or OS input. The saved scenario is a finite, synchronous two-key profile; it does not test asynchronous effects. `ReceiveKeyed` and `IsCurrent` are source- and artifact-pinned helper exports but are not admitted by the unchanged shared AppIR reachability analyzer. No source changes were made.

Commands, versions, exact fresh outputs, archive verification, saved-capture audit, and rawlog hashes are recorded under `rawlogs/XR-RUN/`. The retained 46-file reviewer evidence inventory is 12,683,076 bytes with SHA-256 `d53cd2df8a9f6e514002494a00e60b3faddaac9aea31ac63dba050b5f6935515`; the unpacked archive duplicate and temporary Go caches are excluded because the verified primary archive remains available.
