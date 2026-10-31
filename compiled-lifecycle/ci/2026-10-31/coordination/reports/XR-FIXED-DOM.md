# XR-FIXED-DOM — independent DOM audit of E-FIXED-DOM

**Decision: accepted** (`confirmed_reuse`) for the pinned successful provider artifact and its finite lifecycle fixture. I verified the artifact output records directly from the original provider ZIP, not from the fixed extraction directory.

## Author packet and provider binding

I reviewed N4's E-FIXED-DOM report (SHA-256 `466168c1755cfd9dafa92975c29d9e94c29bb1bd27b601dd2e928f1ea332672f`), receipt (SHA-256 `94bead6347bbf0c7af557a3dd2e08638c796b3c03c8c1711c01c42bb2e06648f`), and audit JSON (SHA-256 `a0e2c072b7edcabbc12c0fe349a90b3a6ed758f89abf50a232b54d335c7b8279`). Their receipt links to the stated report and audit hashes.

The provider run is `41181505234`, artifact `13035044166`, conclusion `success`, source commit `00da54ad0f5a4006b13a5cded18ce291845978bc`, tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`. The original ZIP at `/tmp/gobi-compiled-lifecycle-41181505234.zip` is 47,072,021 bytes, SHA-256 `0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26`. I verified 1,270 unique, relative, safe members and 413,394,195 uncompressed bytes; `ZipFile.testzip()` returned `None`.

The E-FIXED-DOM audit script reads `fixed/extracted` paths. To meet the evidence boundary for this review, I re-read the provider outputs directly from the original ZIP into memory and matched the run's 128 generated-attempt pins, eight build-output pins, five conformance evidence pins, and the raw trace files against those ZIP bytes. I checked the 51 source-input pins against `git show` objects from the immutable 00da commit. The fixture scenario and literal oracle are source files rather than ZIP members; their hashes match the run's pinned inputs. No result in this review relies on the extraction-only temporary tree.

## State, View, effects, and checker

The archived execution is `full` and `passed`. The archived lifecycle run, conformance check, and manifest all report `matched`; every recorded run stage completed, and source and build pins are stable. I materialized the hand-authored oracle from the pinned source commit, then compared its 26 states and 26 event steps against the archived native, direct, and browser outputs. The direct and three browser profiles match the native state, View, message, and effect data at each Go tick. The single fixture renderer swap keeps the same state and does not create a Go tick. The fixture's 13 expected-state checkpoints also match the literal state table.

The complete checker records 26 events/ticks, 16 clicks, 17 alternating swaps, seven requests, and three cancellations in the order `grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`. It reports literal-oracle checks passed for native, direct, browser, and physical DOM. All eight mutation controls were detected.

## Physical DOM and callback lifecycle

Each of React, DOM, and alternating-swap profiles contains 27 initial/event snapshots. I compared all 81 captured physical snapshots to the literal outerHTML and control oracle: the HTML string, renderer and runtime snapshots, and each live button's boolean `disabled` property match. The audit covers 792 live button properties, of which 228 are `disabled: true`.

Action metadata also matches the scenario per click: method, attempted target, event path and message, connected state, actual disabled property, value, type, visible text, and tick increment. The profiles record 48 active clicks total. After subtree remount, each profile tries six retained detached Parent/Child/Grandchild buttons. All 18 targets remain disconnected and their attempts leave the trace, snapshot, callbacks, pending effects, effect records, and physical HTML unchanged.

The native state record confirms removal retires Parent, Child, and Grandchild while preserving the independent pending Sibling. Remount creates a fresh generation-2 subtree without mutating Sibling. On the fixed swap, all four original pending tokens keep their correlations. The alternating profile records 17 swaps: 16 eligible and one ineligible for callback fencing. Each eligible swap records two retired callbacks, for 32 total; both dispatch and stale callbacks are rejected as stale. The browser profiles finish with no pending effects, zero page errors, and no WASM requests or API attempts.

## Build identity and exact evidence hashes

The AppIR component ID is `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle` and includes `effect.request-reply`. React and DOM AppIRs and encoders match. The compiled module hashes differ by build root and are recorded separately; no raw-module equality claim is made.

| Original ZIP member | Bytes | SHA-256 |
|---|---:|---|
| `matrix/lifecycle.native.json` | 441,286 | `2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5` |
| `matrix/lifecycle.direct.json` | 2,395,699 | `4fbd9bb6b94e14647edfad95bf681949b2a14ead04091d351f2f4f6eb1689d71` |
| `matrix/lifecycle.browser.capture.json` | 66,817,124 | `f93564a73887472bef70fcb925882ef80a07a2845dfddec25ce89be9796ba280` |
| `matrix/lifecycle.check.json` | 12,259 | `b1bbd8a41d6eca789aa27fe5bbcdaa582e908249d8d1ff1fabc4e603e374718a` |
| `matrix/lifecycle.run.json` | 153,235 | `0584a60bab261d1a447550dbc60ffc4371db2531653d4c075dcd7831c6236eaf` |
| `matrix/lifecycle.manifest.json` | 94,456 | `020a961a7a102fdf7b53c03b1fd659e0f2e1fc08bf0ac5d3daeecc39de28ea41` |

The literal oracle source in the immutable Git commit is SHA-256 `795ba7fef0ff680019f4988aba5cfcecb25b205516a2c7058bfc720fc217cb82`; the scenario is `45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650`. The AppIR package identity is checked against both build roots; React module SHA-256 is `70e1d1171ab71b84e906ef2819faed10902a1cc893afb568e99e077d0f10b260`, DOM module SHA-256 is `dabb20e55c86b1821ee12254e10ca4a9a25ec4e12573ad27e6650024f9f69d9c`, and shared encoder SHA-256 is `521a73b7cdcbec19b764e8dea2936f466c2fd71550b06bae1d5110d3a503c4a4`.

## Reproduction and limits

The independent archive-based audit command is:

```sh
python3 compiled-lifecycle/ci/2026-10-31/fixed/reviews/dom/audit_dom_archive_review.py
```

It ran under Python `3.12.14`. For the pure reference table, the script invoked `/tmp/gondola-node22/node_modules/node/bin/node` version `v22.23.4` with `--input-type=module -e` to import the pinned oracle exports. This only materializes literal expected values; it does not run tests, the conformance runner, a build, or a browser.

- Review audit JSON: `compiled-lifecycle/ci/2026-10-31/fixed/reviews/dom/audit_review.json`
- Review script: `compiled-lifecycle/ci/2026-10-31/fixed/reviews/dom/audit_dom_archive_review.py`

Acceptance is limited to this captured artifact and finite lifecycle fixture. No source, Git metadata, shared state, or extraction file was changed.
