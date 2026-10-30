# A-MODEL — composed model and evidence acceptance

## Outcome: insufficient_evidence

The JavaScript collection reference is independent of Go and the candidate renderers, and the repaired fixed schedules express the requested cap, same-alias stale callback, and focus witnesses. The earlier 544+1 native replay is real and hash-bound, but it ran against the pre-R-T4B schedule and pre-final-oracle snapshot. It cannot support final acceptance of the repaired schedules or the open lifecycle assertions.

## Reference provenance and shared-host boundary

`session-tree/reference.mjs` owns separate `sessions` and parent-position maps and creates each collection using the JavaScript `createCollectionReference()` from `keyed-editor/model.mjs`. That model projects and transitions its own Go-shaped snapshots; its source chain goes through the JavaScript async/HTTP reference, not Go/WASM or candidate renderer code. `mountTreeReferenceCollection()` independently turns those reference snapshots into pinned React 19.3.1 elements and dispatches events back to that reference runtime. The original XR-T4 review accepted this independence and verified the reference’s state/tree/disposal model and browser renderer behavior.

The browser fixture still uses `createSessionTreeHost()` for both the Go/WASM candidate and the JS/React reference. That shared adapter is useful for comparing the candidate collection against the JS collection model with separate renderers, but candidate/reference parity alone is not an independent oracle for session-tree host lifecycle. The pre-repair checker did add direct expectations for manager/host trees and lists, symbolic and physical parent ownership, state/snapshot/bindings/messages/audit, DOM and input identity, postorder returned bundles, sibling isolation, stale callback effects, and replacement/focus behavior. XR-T5 independently found three lifecycle-visible holes in those expectations: actual cross-session transport cancellation invocation order was not recorded; Add-at-cap, Reset-empty, and Up-first-row disabled values lacked model-derived assertions; and stale delivery occurred before the same-name subtree was recreated. Those gaps were preserved in the initial `RESULTS.md` checkpoint and are not closed by the old replay.

## Repaired fixed schedules

The current schedule hash is `17707f0ca1b6147a25cd6a121e444189900f5b06ed512906d43766cda0e01631`; its tests hash is `ed2588447d2de094694c1b50324875c238aa27e1a840d248658b6f313f7a18b8`. The independently reviewed XR-R-T4B report accepts the changes and records 6/6 schedule tests passing.

- Fixed action counts are **29/21/18**. The first witness adds two empty oak rows after two existing saves, so oak reaches the four-row cap without creating extra requests or cancellation commands.
- The middle witness remains 21 actions. Each oak/branch/bud renderer replacement immediately follows a focus and selection action on that target; descendant sessions remain mounted through the swaps.
- The third witness disposes the old orchard/fruit/seed subtree, remounts all three same-name sessions, and only then releases the old seed request 1. The new seed has no request 1 yet, so the fixture history lookup selects the retired transport; the new subtree is live for before/after state and audit comparison.

These script checks prove the witness sequences and cap bounds. The T5 action oracle must still assert the expected disabled values and post-recreation stale fence, and a fresh replay must execute the repaired scripts before those checks are accepted.

## Exact scope of the previous full run

`session-tree/build/replay-default.json` has SHA-256 `33a7dc92211bfd0fc551bd5f894b1a658d5ee59026a7bb70d7e1f070c404add8`. Its 63 raw scenario shards all match their recorded SHA-256 values; the 63 scenarios contain 1,587 actions and the full mismatch artifact is empty and hash-correct. The report records **544/544 main native comparisons plus one matched negative-control comparison**.

The replay’s source manifest binds `reference.mjs` at `97e3dce4fa1147abf9da86c4fa091c8a8102bafdd9ee9caae965f9b866e53d3c` (still current) and the executed React bundle at `fca350ec76c1addf4bde3325ab5b04b0f75e7495ac213fd1c9ccdaebbe9c21a2`. It binds the old schedule source at `53b93aebe11ef0a38b41de8b654df2973ba4a82be9a13423c49fb77997f17ac6`, whose fixed counts were 27/21/16, not the current 29/21/18. It also binds the pre-repair checker `d07f80f1632941493c728a45fabd6b79d25517400b5ec320a531bc314d226867`. Thus the result verifies that earlier exact source set only. The current `RESULTS.md` correctly labels it an initial pass and says final oracle reconciliation/affected-gate execution are pending.

The original checker review and repair receipts remain intact. No full replay or broad test was rerun for this composed review, and no active R-T5 source was inspected.
