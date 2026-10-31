# E-FIXED-DOM: current primary lifecycle artifact review

**Decision: `accepted` for the bounded native/direct/browser and physical DOM evidence in the current primary artifact.** This review binds to the successful 00da artifact, not the earlier 49cc failed run. The artifact’s full lifecycle checker reports `matched`; I independently compared the archived native, direct, browser, and physical DOM outputs against the hand-authored literal oracle.

## Artifact identity and source binding

- Provider run `41181505234`, artifact `13035044166`, conclusion `success`.
- Source `00da54ad0f5a4006b13a5cded18ce291845978bc`, tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`.
- Retained provider ZIP: 47,072,021 bytes, SHA-256 `0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26`.
- Verified extraction: `compiled-lifecycle/ci/2026-10-31/fixed/extracted`; lifecycle attempt `compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z`.

The lifecycle execution record has 179 stable pin entries: 51 source inputs matched the immutable 00da Git objects, and 128 generated attempt files matched the extracted artifact. The runner recorded identical before/after source and build-output pins through the complete checker. The AppIR identifies `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`; React and DOM AppIR/encoder bytes match, while their raw compiled module hashes are retained separately.

## Literal state, View, and effects

The pinned oracle module manually enumerates 26 Go state checkpoints and all 26 fixture steps. Its topology covers Parent → Child → Grandchild and an independent Sibling. I materialized those pure oracle values and compared them against all 26 native steps and views, the 26 direct typed trace ticks and effects, and each of the React, DOM, and alternating-swap browser traces. The actual native/direct/browser artifacts match the oracle.

The trace retains seven request tokens. Removing Parent cancels Grandchild, Child, then Parent; Sibling remains live with its request pending. Remount creates fresh generation-2 Parent/Child/Grandchild state while preserving Sibling. Old generation-1 completion messages and duplicate completions leave state unchanged. Sibling and fresh generation-2 replies are accepted, and each backend finishes with an empty pending queue.

## Physical browser DOM and callback lifecycle

Each browser profile contains 27 initial/event snapshots, for 81 total. At every snapshot I compared the captured `outerHTML`, renderer/runtime snapshots, and live `HTMLButtonElement.disabled` properties to the literal DOM/control oracle. This covered 792 live button properties, including 228 disabled values. The 16 active clicks per profile also record connected state and the button’s actual `disabled` property.

Removal deletes the mounted descendant controls, leaves Sibling visible and pending, and exposes the removed Parent placeholder. Remount restores the fresh subtree. Each profile retains and clicks six detached subtree buttons; all 18 attempts report disconnected targets and identical before/after trace, state snapshot, callbacks, pending effects, effect records, and physical HTML. The swap profile records 17 renderer swaps, 16 callback-eligible swaps, one ineligible swap, and 32 fenced retired callbacks. All four requests remain correlated across the fixed DOM→React swap.

The complete checker output records eight detected mutation controls: native cancellation order, direct old-generation state, direct message, React physical DOM, DOM disabled control, swap effect correlation, remounted detached button, and literal cancellation order. It records 26 events/ticks, 16 physical clicks, seven requests, three cancellations, no pending terminal effects, zero page errors, and no WASM requests or API attempts.

## Pinned raw evidence

| Evidence | Bytes | SHA-256 |
|---|---:|---|
| `matrix/lifecycle.native.json` | 441,286 | `2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5` |
| `matrix/lifecycle.direct.json` | 2,395,699 | `4fbd9bb6b94e14647edfad95bf681949b2a14ead04091d351f2f4f6eb1689d71` |
| `matrix/lifecycle.browser.capture.json` | 66,817,124 | `f93564a73887472bef70fcb925882ef80a07a2845dfddec25ce89be9796ba280` |
| `matrix/lifecycle.check.json` | 12,259 | `b1bbd8a41d6eca789aa27fe5bbcdaa582e908249d8d1ff1fabc4e603e374718a` |
| `matrix/lifecycle.run.json` | — | `0584a60bab261d1a447550dbc60ffc4371db2531653d4c075dcd7831c6236eaf` |
| `matrix/lifecycle.manifest.json` | — | `020a961a7a102fdf7b53c03b1fd659e0f2e1fc08bf0ac5d3daeecc39de28ea41` |

The independent audit script is `fixed/lanes/dom/audit_fixed_dom.py` (SHA-256 `abf69b1bb3d6c3aade536e2501ce6b248bce41c07773b7cb0f9819137ac11549`); its compact result is `fixed/lanes/dom/audit.json` (SHA-256 `a0e2c072b7edcabbc12c0fe349a90b3a6ed758f89abf50a232b54d335c7b8279`). The audit reads the current retained artifact and immutable source objects. It does not rerun the Go/Node test suites or the conformance checker.

## Scope

This accepts the current primary artifact’s finite lifecycle DOM/state evidence. It does not claim arbitrary Manager or pointer-owned Go compilation. No product source, Git metadata, or shared state was changed.
