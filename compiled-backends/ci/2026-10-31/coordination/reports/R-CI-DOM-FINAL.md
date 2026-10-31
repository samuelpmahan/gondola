# R-CI-DOM-FINAL

**Outcome: confirmed_reuse.** The native DOM renderer and React renderer source pins are unchanged at the repaired current head. The fresh successful full push CI artifact for `195c9433179218348d4b9f2477ae1e0725337d15` records the managed-browser test path with both Chromium override variables unset, 97/97 Node tests passing, and the five-fixture browser conformance matrix matching across React, DOM, and alternating renderer swaps.

This packet audits the successful push artifact supplied for the fresh acceptance gate. It does not stand in for the separately tracked PR workflow or claim the root’s overall 24-workflow PR-ready gate.

## Source and provenance

The audited source is the published head `195c9433179218348d4b9f2477ae1e0725337d15`, tree `c0e4a66eee3fdd8b789e1b565167856fdab62433`, parent `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`. The source delta from `832d212` changes only the DOM and React browser test launch setup plus portability documentation and the historical `RESULTS.md` note. The DOM renderer, React renderer, shared view validator, and browser assertions are unchanged. Both browser test files now call the existing `chromiumLaunchOptions` helper.

The primary CI source is run `41155530877` (push), job `124401386239`, artifact `13025112465`. The run and job completed successfully against the exact audited head. The provider ZIP is 14,931,201 bytes, SHA-256 `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa`. Its 817 indexed extracted files match the retained index; ZIP CRC verification is clean. The run/job/artifact provenance records and their hashes are in `lanes/dom/final/audit-summary.json`.

The frontend execution record reports **122/122 source hashes** stable before/after and matching this checkout. The backend execution record reports **126/126 source hashes** stable before/after and matching this checkout. No current-head source pin was missing or mismatched.

## Managed-browser tests

The primary artifact records Node `v22.23.4`, Playwright `1.64.1`, React/ReactDOM `19.3.1`, and Chromium `156.0.8078.4`. The Playwright-managed Chromium install step succeeded. The frontend execution record has `CHROMIUM_PATH=null` and `CHROMIUM_EXECUTABLE_PATH=null`; the recorded `node-tests` command has no environment overrides and exits 0. Its exact executable and complete argument list are retained in `lanes/dom/final/audit-summary.json` and `extracted/compiled-frontend/artifacts/execution.json`.

The recorded command ran the 18 frontend Node test modules with `node --test`: **97 passed, 0 failed**. TAP cases 41–44 are the four DOM browser tests and case 48 is the React controlled-checked browser test; all five passed. `node-tests.stdout.log` SHA-256 is `60fbc3b138975258c1ba4b3c0c597bdebe05aaa78d6a89364e0741f4d19a8269`; stderr is empty (SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).

## Browser snapshots and swaps

The uploaded conformance records cover four Go apps with five fixtures: counter, effect, form, list, and list-growth. All five check records report `matched` for React, DOM, and `alternatingSwap`; there are zero browser page errors. Across 43 ticks, the `outerHTML-v1` HTML and live-control records match exactly between the standalone React, standalone DOM, and swap profiles at every tick. The fixture-specific source artifact paths and hashes are in `lanes/dom/final/audit-summary.json`.

The swap profile records 37 completed renderer swaps and nine focus/selection witnesses. Every witness preserves the logical key identity and selection values across the swap; the list fixture includes a backward selection `[0,2]` for `row-2-label` after keyed movement. This is logical focus continuity across distinct renderer-owned nodes, not cross-backend physical node identity.

The form trace includes both checked states. In all three profiles at every form tick, the live checkbox `checked` property matches the Go model while the serialized `checked` attribute is absent. Text input and other control attributes also match the established `outerHTML-v1` snapshots.

## Canonical packet mapping

The consumed E-CI-DOM packet remains byte-identical and retains historical undated strings in its `source_scope`. Its canonical dated paths are resolved here:

| Packet | Canonical dated path | SHA-256 |
|---|---|---|
| E-CI-DOM report | `compiled-backends/ci/2026-10-31/coordination/reports/E-CI-DOM.md` | `a141f71c0b289d7b16c027ae331a1c89de39e8c0a5d8e3a3cd20875794848e59` |
| E-CI-DOM receipt | `compiled-backends/ci/2026-10-31/coordination/receipts/E-CI-DOM.json` | `ff9b86058e17a425196d26c21593801d737549029fa954a9477080c066429af8` |
| Location correction | `compiled-backends/ci/2026-10-31/lanes/dom/location-correction.md` | `aae609e65b17e3cbae1054492c53eff60666a87256de9f83e9da5092709229b9` |
| R-CI-BROWSER report | `compiled-backends/ci/2026-10-31/coordination/reports/R-CI-BROWSER.md` | `98d170064376a733ce9d3a94e495343e54a0f7f0e8438c8c62f6156c530b6afd` |
| R-CI-BROWSER receipt | `compiled-backends/ci/2026-10-31/coordination/receipts/R-CI-BROWSER.json` | `49a4b673a75353d67b8e6553097ca416e1e9eb5891fe7b24b2acd8dee3941771` |

The prior `832d212` CI result remains historical: its archived artifact records 92/97 Node tests passing, with four DOM browser tests and one React browser test failing because `/tmp/chromium` was absent. It is not used as current-head success evidence. The repaired current head is validated by the new managed-browser push artifact above.

## Audit procedure, limits, and failures

Run `python3 compiled-backends/ci/2026-10-31/lanes/dom/final/verify-final-evidence.py` from the evidence checkout to repeat the read-only archive, pin, TAP, snapshot, and focus checks. The verifier prints its result; the retained output is `lanes/dom/final/audit-summary.json`. No test, compiler, or CLI build was rerun for this packet.

There were no failures in the primary push artifact. This receipt does not assert the status of the separate PR run `41155534356` (synthetic checkout `ce26da0cb62e4ba3fd1ddd2c2f2456c42969b131`, same source tree), and it does not certify the broader 24-workflow PR-ready gate. The earlier `832d212` browser-launch failure is included only as historical provenance.
