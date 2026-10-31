# XR--DEMO (N6 independent review of N5)

**Decision: accepted for the stated `backends-only` route, with the full fresh-CI gate still pending.** The execution receipt, current pins, five conformance captures, demo smoke evidence, and retained attempt-02/03 archives are consistent. Attempt 01 is explicitly unavailable and is not represented as retained evidence.

## Independent audit

I reviewed `E-DEMO.md`, `E-DEMO.json`, both compiled output trees, the five native/direct/browser/check capture sets, the HTTP smoke receipt and pinned screenshot, and the two retained failed-attempt archives. I did not rerun the compiler, browser harness, or HTTP smoke, and did not modify N5 outputs.

The read-only audit script verified all 126 receipt source-pin entries against current bytes, confirmed identical before/after source-pin arrays, and checked the React and DOM output pins before and after smoke. Each output tree contains 209 pinned files and four manifest-tagged apps. The two trees have the same paths; exactly five hashes differ: `buildmanifest.json` and the four raw `gobi-compiled.mjs` bundles. The other 204 files are byte-identical. React manifests are tagged `react`; DOM manifests are tagged `dom`.

All five conformance records are `matched`, with stable 34-entry source-pin sets. The audit checked each pinned native, direct, browser, checker, and build input file. Native and direct trace JSON objects are exactly equal for every fixture. Browser captures contain React, DOM, and alternating-swap profiles with the recorded tick counts, no page errors, and no WASM requests or API attempts. The recorded checker results report all three profiles matched and all mutation controls detected.

| Fixture | Ticks | Swaps | Focus swaps | Mutation controls |
| --- | ---: | ---: | ---: | ---: |
| counter | 5 | 4 | 0 | 8 |
| form | 10 | 9 | 1 | 10 |
| list | 11 | 10 | 5 | 8 |
| effect | 5 | 3 | 2 | 11 |
| list-growth | 12 | 11 | 1 | 8 |
| **Total** | **43** | **37** | **9** | **45** |

The pinned HTTP smoke receipt reports five passed checks, zero errors, and no WASM requests. Its smoke output pins remained unchanged. This is a review of N5's preserved browser evidence; it is not a new HTTP/browser execution.

## Retry archive integrity

The attempt-02 checksum manifest covers 519 payload files; all 519 were present and verified with no unexpected files. Attempt 03 covers 513 payload files; all 513 were present and verified with no unexpected files. These remain failed diagnostics, not passing runs.

Attempt 01 failed during import before a complete archive was captured. The author report accurately records that no complete receipt, logs, source snapshot, builds, or traces remain; this review does not reconstruct or claim those artifacts.

## Scope and limits

N5 ran the explicit `backends-only` route. It did not run the inherited full frontend regression chain. The inherited retry 52594 and current compiled-frontend partial 54490 are separate lead-reported gates, not work performed by N5 or this review. Full fresh CI after publication remains pending. No blocker was found in the bounded N5 backend/demo evidence.

## Evidence

- Read-only audit: `compiled-backends/evidence/reviews/xr-demo/audit_n5.py`
- Audit result and command output: `compiled-backends/evidence/reviews/xr-demo/audit.json`, `compiled-backends/evidence/reviews/xr-demo/audit-command.log`
- N5 source pins: 126 entries, unchanged before/after; see `compiled-backends/coordination/receipts/E-DEMO.json`
- Attempt-02 archive: 519/519 checksums verified
- Attempt-03 archive: 513/513 checksums verified
