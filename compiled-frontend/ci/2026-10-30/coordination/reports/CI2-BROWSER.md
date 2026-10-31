# CI2-BROWSER

**Outcome: `confirmed_reuse`.** The fresh CI run completed successfully on PR #11 head `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281` (tree `ca99e9432dca87a6bf6718c20186b1223b870126`). Its previous checkpoint is `408e330517b1dd5e5f865e2ff1914465f98bcf66`; the PR base recorded by GitHub is `42df6883337605d901a23e9fed874768c7ce1824`. This packet uses only that run's immutable provider artifact; prior local browser runs are not CI evidence.

## Run and artifact

Run `41144116537`, job `124365059288`, artifact `13020568606` completed successfully. The archive SHA-256 is `c3332c9b5d0186c47dab921902774de05eb2b8d0819c3ad69dc9eb045166947e`; it matches the repaired extraction manifest. I verified all 309 manifested compiler files, all 116 `sourceBefore` and `sourceAfter` pins, and all 209 compiled output pins. Before/after source and output pin sets are equal.

The CI execution contains 33 successful commands and 81/81 passing Node tests. It reports Node `v22.23.4`, Playwright `1.64.1`, and Chromium `156.0.8078.4`. Both Chromium path variables were unset; the browser-options test confirms that Playwright uses its managed browser in that case.

An independent offline rerun of the closed checker for all five profiles matched each captured checker report byte-for-byte:

| Profile | Ticks | Mutation controls | Result |
| --- | ---: | ---: | --- |
| counter | 5 | 17 | matched |
| form | 10 | 18 | matched |
| list | 11 | 19 | matched |
| effect | 5 | 18 | matched |
| list-growth | 12 | 17 | matched |
| **Total** | **43** | **89** | **0 mismatches** |

## Browser observations

- All profiles record zero WASM API attempts, zero `.wasm` requests, no page errors, and empty physical roots and renderer snapshots after unmount.
- The mounted form snapshot contains the edited draft `typed draft` and a checked checkbox. The literal-click intent is `must not replace literal`; the observed button value and target value at dispatch are empty strings. The renderer action stays separate from the Go message `{Name: "literal", Arg: "target.value"}`.
- One disabled physical click per profile is suppressed without a dispatch or callback-count increment. The list profile also records one separate stale callback from a removed node: one stale observation, no message, and dispatch count unchanged. This callback was captured before runtime unmount.
- The keyed list input keeps the same node and focus through reorder; selection is start 0, end 2, direction `backward` before, immediately after, and settled.
- Before the effect reply, CI recorded the committed pending state and physical DOM with the Request button disabled at tick 4. One completion correlated to `dispatch-0002` was applied. The duplicate was rejected without a further tick.

The per-profile browser/direct/native/checker records, the five offline checker outputs, source/output pin audit, and exact trace hashes are preserved under `provider/repaired-extracted/compiled-frontend/artifacts/` and `audits/CI2-BROWSER/`. The direct and browser-base provenance sets each contain 98 inputs and match; browser provenance adds one generated bundle. Three installed dependency manifests (`esbuild`, `react-dom`, and `react` under `interaction/node_modules`) are not included in the checkout/archive file set, so this audit records their CI-reported versions rather than locally rehashing those package files.

## Limits

A callback retained after **runtime unmount** remains untested. This evidence covers the detached-node callback before unmount. Acceptance is limited to the pinned PR head and four apps/five deterministic profiles; it makes no general Go compatibility claim. No browser was relaunched during this review.

The offline audit result is [browser-evidence.json](../../audits/CI2-BROWSER/browser-evidence.json); the review criteria are [acceptance-criteria.json](../../audits/CI2-BROWSER/acceptance-criteria.json).
