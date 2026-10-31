# XR--CI-HARNESS

**Decision: accepted.** N3's `E-CI-HARNESS` acceptance is supported by the selected immutable primary artifact and by an independent raw-capture recomputation. I found no input weakening, DOM-oracle change, mismatch in the reported totals, or provenance error. This accepts the E-CI-HARNESS packet for its successful push artifact only; it does not infer the separate PR workflow result or close the full PR gate.

## Provenance and immutable inputs

The primary is successful push run `41155530877`, job `124401386239`, artifact `13025112465`, checked out at commit `195c9433179218348d4b9f2477ae1e0725337d15`, tree `c0e4a66eee3fdd8b789e1b565167856fdab62433`. I checked the provenance, run, job, artifact metadata, exact archive SHA-256 `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa`, and all 817 extracted-file pins. The full execution record is `passed`, includes the inherited run, records 18 successful outer commands, and has 126 stable source pins. The separately tracked PR run `41155534356` remains outside this decision.

The 949 tracked-input count independently recomputes as 817 extracted archive files, 126 source-pin paths, and six top-level provenance/archive inputs; all resolve to distinct paths. The five conformance run records each pin 34 source files, four build outputs, and one browser bundle. Run and manifest pin lists agree.

## Raw matrix recomputation

I compared the native and direct trace objects exactly. For each fixture, I projected the React, DOM, and alternating-swap browser traces to application ticks and matched them to native. Every physical DOM snapshot in all three profiles matched the hand-authored `expectedDOMSnapshots` oracle at each tick. I also reran `checkBackendConformance` on each raw capture and obtained byte-structure-equivalent checker JSON; all mutation controls remained detected.

| Fixture | App ticks | Swaps | Focus swaps | Mutation controls | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| counter | 5 | 4 | 0 | 8/8 | matched |
| form | 10 | 9 | 1 | 10/10 | matched |
| list | 11 | 10 | 5 | 8/8 | matched |
| effect | 5 | 3 | 2 | 11/11 | matched |
| list-growth | 12 | 11 | 1 | 8/8 | matched |
| **Total** | **43** | **37** | **9** | **45/45** | **matched** |

The swap observations are in `gobi.backend-swap-observations/v1`, outside `Gobi.Trace`. Across all 37 events, the application trace, committed state/View, return snapshot, and effect-host requests/completions remain unchanged during the swap; the old renderer root is detached and empty. The nine recorded focus transitions preserve identity and selection; the declared list witness preserves key `row-2-label` and its backward `[0,2]` selection. In the effect fixture, the request remains pending across the scheduled swap and the manual completion occurs once afterward.

The lifetime evidence has distinct semantics: 15 physically disabled-control suppressions; one retired-renderer callback fenced without changing trace/snapshot; two active missing-target driver attempts, each adding one suppressed tick with the captured target value; and one retained callback invoked from a detached but still active renderer node, which also adds a suppressed tick. That last observation is callback-invocation evidence, not proof of native DOM-listener delivery. Post-unmount attempts preserve the existing suppressed-tick contract with empty physical DOM and no Go update or effects. All five browser records report zero page errors and no WASM requests/API attempts.

## Source and earlier-attempt review

I compared the current audit's source-pin list with the preserved initial-832 audit: all nine previously pinned harness/runtime/renderer sources are unchanged. The only two new pinned paths are `frontend/dom/renderer.test.mjs` and `frontend/react/renderer.browser.test.mjs`, the scoped managed-Chromium launcher repair. The final source hashes for the runtime, renderers, shared view validator, checker, and browser harness match their pinned values. The independent DOM oracle remains SHA-256 `e3f50a6d450dacce6b12fdeec2ac1fdcacfd5a1520c67f6dbc8b439efbaa46e8`; exact snapshots and control records were recomputed against it. I found no relaxed comparison, dropped mutation control, altered fixture, or oracle edit.

The retained N3 audit history is accurate and not used to select acceptance evidence:

- `audit-preflight-pin-mismatch.log` is an earlier non-acceptance attempt whose old expected hash for the repaired React browser test no longer matched source 195.
- `audit-node22.log` records an `EEXIST` collision at the default `audit.json` output, which is opened with exclusive-write semantics. The retry to the unique `audit-node22.json` path is successful and reports `accepted`, totals `43/37/9/45`; output SHA-256 `7571d894b0d5229dd1f30241ef94caa05bdbb0c65be2c62f508c5beb2bf9034b`.
- `audit-pre-execution-command-check.json` is preserved as an earlier, incomplete audit result (858 tracked inputs and no `workflowExecution`); it is not the final result. The canonical final N3 result reports 949 tracked inputs and includes full-workflow verification.

My independent audit had two initial assertion corrections: JSON omits the optional `rendererCallback` field rather than serializing it as `null`, and invoking a retained callback from a detached active node correctly adds one suppressed tick. I corrected those review-script expectations; the final Node 22.23.4 run passed. A later attempt to reuse the already-created output path hit the same safe `EEXIST` behavior, so the final run used the unique `independent-audit-final.json` path. These review-tool attempts did not modify the captured artifact or source.

## Reproduction and limits

From the evidence checkout, run:

```sh
/tmp/gondola-node22/node_modules/node/bin/node compiled-backends/ci/2026-10-31/lanes/reviews/xr-ci-harness/independent_harness_review.mjs
```

The script is `lanes/reviews/xr-ci-harness/independent_harness_review.mjs` (SHA-256 `ea34d193be7cd0b581b99befcbb3111c178a97fe1301ede27f87459ca8915373`). Its final output is `lanes/reviews/xr-ci-harness/independent-audit-final.json` (SHA-256 `45b76e5828c825edff974a707248a0529fd0cfe87a91129ee873b8e48aab928a`); stdout and stderr are retained beside it. The review recomputes the supplied archive and captures; it does not rerun native or browser execution. Other engines, hydration, concurrent rendering, arbitrary Go applications, production effect transport, separate PR status, and the overall PR-ready gate are outside this scoped acceptance.
