# Review and observed evidence

## Checks executed

- Node 24.22.1: 13 new lab tests passed. This includes real compiled Go artifact tests with a headless renderer for semantic replay admission, not browser DOM claims.
- Existing compiled frontend runtime: 36 tests passed, zero failures/skips.
- Go 1.24.9: 13 tests passed in the existing form/list/effect fixture packages with -count=1. Counter has no package tests.
- Chrome 155: 13 browser checks passed. The actual Go modules ran with both existing React 19.3.1 and DOM adapters. The receipt is browser-receipt.json.
- All eight routes at 390 and 768 px: scrollWidth did not exceed clientWidth. The 390 px iframe's effective content width was 375 px where a scrollbar was present.
- Real browser input: dragged/released the spring, adjusted damping from 14 to 8, saved it and reproduced its final fixed-tick state. Restored the saved variant from another route.
- Real controlled form input: typed “Keep the feeling”, saved through Go, switched DOM to React. Actual Go state, Gobi view and DOM matched. Saved the resulting preferred variant.
- Narrow dock workbench: selected a tool and scrolled natively to the parameter panel. Observed clientWidth=scrollWidth=375, scrollHeight=1773, scrollTop=929.

## Independent review and fixes

A separate read-only reviewer examined the initial lab commit. It found three Important issues and no Critical or Minor issues:

1. A schema-valid but semantically rejected Go replay could change live state while retaining an old journal. A failing real-artifact test reproduced the mismatch. Replay now validates the entire journal in a disposable host, then runs the accepted journal in the live host, with rollback for an unexpected commit failure.
2. A small imported file could amplify into an excessive retained state/view/DOM trace. A bounded regression reproduced missing admission. The lab now reserves a cumulative 4 MiB trace budget before action/reply execution in live and replay hosts. Rejected edits restore the last accepted controlled DOM.
3. Motion tick coalescing could exceed the 144,000-tick portable limit. The prospective limit is now checked before any event mutation. Tests pin the boundary and unchanged last accepted checkpoint.

The regressions were observed failing before fixes; the final new suite passed 13/13. A browser regression also exposed the controlled-field restoration gap, failed before its fix, then passed. A replay-resumption check initially depended on requestAnimationFrame in a background tab; it now checks the pause transition regardless of visibility and continuous animation only when visible, recording that scope in its receipt.

## Decisions and limits

- Gondola sibling lab chosen after inspecting both repositories. PageRouter's fixed Atlas contract and deployed shell are left intact; no independent integration project is introduced.
- Existing compiled Go artifacts are restored and hash-verified rather than freshly rebuilt by the lab. Existing Go source is separately tested. Motion models are JavaScript; neither boundary is presented as Go compilation.
- A renderer swap compares actual state/view/DOM for this case. Replay compares a journal against this implementation's saved state. Neither is an independent universal proof or pixel comparison.
- Cancel & reset is host disposal plus timer cancellation, not a new cancel transition in the inherited Go request fixture.
- Mobile-width layout, keyboard paths and native browser scrolling were exercised. Physical touch hardware, IME, Safari and Firefox were not tested.
- The complete historical M0 and PR23 compiler/qualification suites were not rerun. Changes are confined to the sibling lab and its documentation/evidence; inherited runtime/renderer sources and sealed archives are unchanged.
- The managed development preview is temporary and is not a production deployment. Sites' saved deployment URLs are production, so no Sites publishing operation was used.

No deferred minor findings. No merge or production publication is authorized by these checks.
