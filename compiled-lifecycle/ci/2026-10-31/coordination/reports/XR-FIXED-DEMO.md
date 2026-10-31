# XR-FIXED-DEMO — independent managed lifecycle demo review

**Decision: accepted** (`confirmed_reuse`) for N3’s E-FIXED-DEMO packet, bound to successful run `41181505234`, artifact `13035044166`, source `00da54ad0f5a4006b13a5cded18ce291845978bc`, tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`. The review used the original provider ZIP and the source bytes recorded by that run. It did not rebuild the app or rerun browser tests.

## Independent evidence and source binding

The original ZIP `/tmp/gobi-compiled-lifecycle-41181505234.zip` is 47,072,021 bytes, SHA-256 `0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26`; its 1,270 entries passed a ZIP CRC scan. I parsed the smoke, native/direct/browser traces, matrix checker/runner, demo build record, execution receipt, and screenshot directly from ZIP members. This review did not read the extraction-only browser temporary file cataloged by the build audit.

The embedded E-BUILD execution record is full/passed and has 123 source pins with before/after equality. I independently hashed the 123 corresponding source files and matched every recorded byte count and SHA-256. The native runner used the PATH `go` command and recorded empty native stderr; the conformance run and check both report `matched`, with source and build output stability through the check.

N3’s authored report hash is `a1830ff0511a2c006c185d8d31e9371ae903f5bc00b9be01a8998e4361801761`, and its receipt hash is `cee35ea8f47cc0df940fe7887108977d88e429eaa06d6cb242a021a076df64d6`. Both were left unchanged.

## Actual compiled Go module and managed HTTP smoke

The bundled demo build record and AppIR identify the component/package as `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`, with the `effect.request-reply` capability. Native, direct, and browser traces name the same package. The bundle input list includes the compiled GoScript module, its generated encoder, the lifecycle runtime, and the existing DOM and React renderers. The AppIR is 14,180 bytes (`341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d`), the GoScript module is 521,163 bytes (`70e1d1171ab71b84e906ef2819faed10902a1cc893afb568e99e077d0f10b260`), and the encoder is 15,625 bytes (`521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`). Each matches the demo build record in the original ZIP.

The actual managed HTTP smoke record is passed with all 12 check labels, 24 trace ticks including Init, 23 Go updates, and four renderer swaps. It records `/` (4,546 bytes), `/demo.css` (6,573 bytes), and `/demo.bundle.mjs` (1,837,935 bytes), each HTTP 200. The recorded browser is Chromium `156.0.8078.4`, also reported by the matrix browser record; Playwright is `1.64.1`. Page, console, failed-request, WASM-request, and WASM-API-attempt counts are all zero. Pending effects are empty at completion.

I independently compared HTTP Init and all 23 Go updates to the raw native Go trace by message, full decoded State, Go View tree, and Go-emitted effects. The final state has generation-2 Parent/Child/Grandchild replies completed (`parent:g2:r5`, `child:g2:r6`, `grandchild:g2:r7`) and the generation-1 Sibling reply completed (`sibling:g1:r4`); all have count one and no pending effect. The final backend is DOM. The final physical DOM shows the four Request controls and Remount disabled, while all Add controls and Remove remain enabled. Its snapshot equals the last swap-profile physical DOM.

## Matrix and lifecycle controls

The native scenario, direct compiled module, and each browser profile (`react`, `dom`, `swap`) contain 26 ticks. I compared every normal Go update across the traces for message, full State, View tree, and requested effects. For each renderer-swap event I checked the retained State and View at the current trace position; all four pending requests are also present in the recorded fixed-swap state. All 27 physical DOM snapshots per profile equal their expected DOM, and the manual effect/cancel record sequences are identical across profiles.

The matrix has 26 events, 16 clicks, and 17 swaps. It records seven requests and cancels the removed subtree in child-first order: `grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`. The cancellation targets point to the corresponding request dispatch/effect correlations; Sibling remains pending through Parent removal. All three force-delivered retired callbacks are rejected. Three explicit stale generation-1 Go completions leave state unchanged after remount. The Sibling completion is accepted once and its duplicate is rejected; generation-2 Grandchild, Child, and Parent replies are accepted in that order, and the duplicate Child reply is rejected.

The matrix reports 18 stale physical-button clicks across profiles, 32 retired-renderer fences, 16 callback-eligible swaps and one ineligible swap, and eight detected mutation controls. Its native, direct, browser, and physical-DOM literal-oracle flags are all true. The final Go-disabled control states and text in the screenshot agree with the captured physical DOM.

## Screenshot and review method

I extracted the screenshot member directly from the original provider ZIP and visually inspected that copy. It is a 1,440 × 1,622 PNG, 326,350 bytes, SHA-256 `d1a9d09dc59e88ce02a83e7d8734acf5987e3e4a1a5c3714384a881295b17648`. It shows the completed generation-2 subtree and Sibling, DOM selected, no pending requests, and the expected disabled controls.

The read-only review command is:

```sh
python3 compiled-lifecycle/ci/2026-10-31/fixed/reviews/demo/review_fixed_demo.py
```

It reads the original ZIP, hashes the recorded source files, and writes only the audit JSON and screenshot copy in `fixed/reviews/demo/`. No source, author packet, Git, or shared state was changed. No build or browser test was rerun.

- Review audit: `compiled-lifecycle/ci/2026-10-31/fixed/reviews/demo/audit.json`
- Review script: `compiled-lifecycle/ci/2026-10-31/fixed/reviews/demo/review_fixed_demo.py`
- Screenshot copy: `compiled-lifecycle/ci/2026-10-31/fixed/reviews/demo/managed-demo.png`

This acceptance is limited to the successful pinned artifact and its recorded HTTP demo and lifecycle matrix.
