# XR-HARNESS — independent review of E-HARNESS

**Decision: accepted for the recorded attempt-05 source/build snapshot.** This decision does not make the current checkout a source-pinned acceptance: `compiled-lifecycle/browser/lifecycle-oracle.test.mjs` changed after the captured run. The original bytes are preserved in `coordination/reviews/r-oracle/before/`; the change only updates the test's expected effect list. Attempt-05 itself passed its before/after source and build pin gates. The later full runner must cover the current test hash before the current tree can be called accepted.

## Review scope and method

I independently inspected E-HARNESS's report and receipt, attempt-05's native Go output, direct compiled-module replay, browser capture for React/DOM/swap, checker output, manifest and run record, and the harness/oracle/checker source. I checked file hashes and byte counts against the attempt manifest and verified the retained attempts 00–04 report `rejected`. This review does not rerun the full matrix or attribute attempt-05 to source edits made after its frozen snapshot.

E-HARNESS report hash matches its receipt: `5780154ee97181b20ccdc15d64e248e02a9a4fd36b963c8276917ea7279e30f5`. Attempt-05 has `run.status=matched` and `check.status=matched`; all evidence artifact hashes in its manifest match the files. The 178 source-pin entries are identical before and after the attempt, as are all 8 build-output pins before and after the checker. Current build-output hashes still match all 8 recorded pins.

## Findings

The raw native trace covers all 26 fixture events, including four requests, child-first cancellation of Grandchild/Child/Parent, three stale old-generation Go completion no-ops, a successful Sibling reply, three generation-2 requests, and their replies. The direct replay has 26 Go ticks, normalizes all 14 typed effects from the compiled module, and ends with no pending requests. React, standalone DOM, and alternating-swap browser profiles each contain 26 Go ticks, 26 events, 16 physical clicks, 17 browser effect records, and an empty pending set. The browser capture also records empty roots after unmount and no WebAssembly API attempts or network requests.

The checker compares native state, messages, effects and views with the manually enumerated 26-state oracle. It compares direct and each browser profile against the same literal state/view/effect expectations. The DOM checks include literal `outerHTML-v1` and live button properties. React and DOM AppIRs are identical; the required component identity, `view.node` and `effect.request-reply` capabilities, and the declared `Update` result types are checked.

Effect normalization uses the emitted AppIR signature: `Update`'s second result must be a slice whose element is the declared `gobi.Effect`; the generated encoder encodes the actual `Update` result using that result TypeID. The normalizer verifies the slice TypeID/kind, each element TypeID, `Kind/Name/Arg/Reply` field order, and each field's typed string value before producing the host trace. The raw direct evidence shows the `[]github.com/samuelpmahan/gondola/gobi.Effect` slice and typed `gobi.Effect` structs for both request and cancellation effects.

The swap profile has 17 renderer replacements. Sixteen have a retained user-action callback; each replayed both the retired dispatch and stale-action callback, giving 32 fences. The fixed event-8 DOM-to-React replacement is correctly counted as ineligible because its freshly mounted DOM renderer had no user action. State, ticks, pending requests, effects and physical-root retirement are still checked at that swap. After remount, the harness physically clicks six retained detached parent/child/grandchild buttons in each of the React, DOM and swap profiles: 18 probes total. They leave Go state/ticks, callbacks, pending effects, effect records and physical HTML unchanged.

All eight declared mutation controls are detected: native cancellation order, direct old-generation state, direct message, React physical DOM, DOM disabled property, swap effect correlation, detached remount-button coverage and browser cancellation order. The checker emits `status=matched` only after these checks pass.

Attempts 00–04 remain in the evidence tree with their raw outputs and rejection records. Their statuses are all `rejected`; none is treated as acceptance. Attempt-04 is specifically rejected by its source-stability gate. Attempt-05 alone is the accepted matrix for its captured source snapshot.

## Post-run source drift and limits

After attempt-05, `compiled-lifecycle/browser/lifecycle-oracle.test.mjs` changed from the pinned SHA-256 `18c88acd3e9028af30b1f737599ae537fc1354ea65f37037e5c9f89281ebae6d` (10,481 bytes) to current SHA-256 `6a48d1d46addfa07d4792c3bf71d842c7ea6159eb69c5010b00e540df970daf1` (11,347 bytes). The diff only changes the test's expected-effects list to include the seven frozen request effects alongside the cancellation. The original test file is preserved at `compiled-lifecycle/coordination/reviews/r-oracle/before/browser/lifecycle-oracle.test.mjs`. `compiled-lifecycle/browser/lifecycle-oracle.mjs`, harness/checker sources, fixture, and all build outputs still match the attempt pins. Thus the captured attempt remains valid for its frozen snapshot, but it cannot certify the current tree until the final matrix is run against the current hash.

This is a finite deterministic fixture. It does not establish randomized lifecycle behavior or production transport behavior. No production or test source was changed in this review.

## Pinned evidence

| Artifact | SHA-256 |
|---|---|
| attempt-05 manifest | `5c4748f510fa9a69234d824aa619e80e6d32b94ed93a7c7f6a4d3215d61292f1` |
| attempt-05 run | `e4ea41b9bb24317e97ed29b406e7797a5c4b1026934d8092ee6b8a053851c106` |
| native trace | `2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5` |
| direct trace | `4fbd9bb6b94e14647edfad95bf681949b2a14ead04091d351f2f4f6eb1689d71` |
| browser capture | `78886a28fc0ac6e519a21b4765167aabea6d394bf539e05b725bb2a1aabe4763` |
| checker output | `b1bbd8a41d6eca789aa27fe5bbcdaa582e908249d8d1ff1fabc4e603e374718a` |

The exact paths and complete 178-source/8-build pin sets are retained in `compiled-lifecycle/conformance/evidence/attempt-05/lifecycle.manifest.json`. Toolchain recorded by the run: Node v22.23.4, Go 1.24.0, Chromium 153.0.8010.0 and Playwright 1.64.1.
