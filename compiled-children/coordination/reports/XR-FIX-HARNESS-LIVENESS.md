# XR-FIX-HARNESS-LIVENESS

**Decision: `accepted`.** N6’s harness liveness repair closes the XR-HARNESS false-accept. The original wrong-renderer witness now fails the current lifecycle checker, and the fresh source-bound replay and targeted tests match.

## Review findings

- Replayed the preserved XR-HARNESS mutated browser archive (`wrong-active-renderer-browser.json.gz`, SHA-256 `dfd8a37b439369754fe3574ca1fc93b1ee7090fc74109275fed2656d8d5b8835`). It relabels the accepted React swap result and the later physical click’s operation, action, and dispatch from React/id 2 to retired DOM/id 1. `assertRendererLifecycle` now rejects it at the accepted candidate check: expected backend `react`, received `dom`. Replay details and the exact rejection are in `rawlogs/XR-FIX-HARNESS-LIVENESS-20261031-01/old-witness-replay.stdout.json`.
- The current captured swap profile accepts the unique React/id 2 candidate, retains React/id 2 after rejecting the incompatible candidate, then records event 13 as a real `HTMLElement.click` whose callback, action observation, and dispatch are all React/id 2. `check.mjs` validates renderer identity across swap records, event snapshots, actions, and dispatches (`assertRendererLifecycle`, lines 371–517); the authentic captured profile is also hash-checked by `swap-contract.test.mjs`.
- The fixed replay keeps full typed state, Gobi view tree, DOM, event order, effect order, and renderer checks against the literal expectations. The native checker compares every ordered Go step’s message, effects, complete state, and NodeRecord (`check.mjs`, lines 101–148). Direct traces compare encoded typed states and full view records (`180–204`); browser traces compare typed state, view tree, runtime DOM, renderer DOM, and physical DOM (`533–610`). No application state reducer was added to the checker or seed generator; seeded schedules are message inputs (`seeded.mjs`, lines 39–42).
- All 12 captured-data mutation controls pass, including accepted-swap backend/ID, post-rejection callback backend/ID, detached action metadata, and removal of a no-WASM coverage entry. No-WASM coverage is required to be complete with the exact ten function/constructor hooks (`check.mjs`, lines 8–18 and 512–530). The captured profiles report zero guarded API attempts and zero WASM requests.

## Custody and replay evidence

- The original E-HARNESS author report and receipt match their preserved originals byte-for-byte: report 4,553 bytes / SHA-256 `5e3f75356b88f0e2a5857e0c611ee2eca0581ec2f0f94ffdead7f132550e5021`; receipt 16,513 bytes / SHA-256 `79694227b67a2be6c6858cef659c1698d2dbf69d54a4c4784889227293359782`.
- The accidental generated E-HARNESS report and receipt from the first N6 attempt remain preserved as separate rawlogs (5,069 bytes / `e375b7b2caf6387507544714adabe919e751f3059c87d8e78bcba34813a42bb2`; 18,856 bytes / `bc8c28337e473f7483f381277713b338abffb4d516ec9bb773ebdb632b9c6718`). The final runner writes attempt outputs at the supplied output prefix and stores a uniquely named `E-HARNESS-<timestamp>-<pid>` trace directory using exclusive directory creation; it refuses to overwrite an existing run file and contains no writes to the canonical report or receipt paths (`run.mjs`, lines 214–230 and 552–619).
- N6’s source-bound `replay-custody-safe` evidence matched 42 source events, 38 Go updates, and 39 literal checkpoints; it reports 27 physical clicks per profile and 12/12 mutations detected. All 85 source pins and 8 build-output pins matched before and after. The independent archive verifier checked all 10 gzip archives by hash, byte length, decompression, and byte equality.
- Seeded replays were 20261031, 20261032, and 20261033, each with 60 events and 59 Go updates. Only 20261031 has mounted-browser evidence; seeds 20261032 and 20261033 are native/direct-only and are not counted as browser passes.
- I independently ran the targeted Node 22 suite: `check.test.mjs`, `seeded.test.mjs`, and `swap-contract.test.mjs`; 18 passed, 0 failed. I also ran the archived witness replay and N6’s independent replay/archive verifier. The targeted command emitted Node’s existing experimental `EnvHttpProxyAgent` warning; it did not fail a test.

## Boundary

This review accepts the liveness repair and its captured evidence. It does not claim root’s later full acceptance or CI result. The original attempt-12 capture is used as a pinned adversarial test input; final behavior/counts come from the fresh custody-safe replay. No production, native, oracle, harness, scheduler, or Git files were edited in this review.

## Review artifacts

- Review audit: `rawlogs/XR-FIX-HARNESS-LIVENESS-20261031-01/review-audit.stdout.json`
- Old XR-HARNESS witness replay: `rawlogs/XR-FIX-HARNESS-LIVENESS-20261031-01/old-witness-replay.stdout.json`
- Targeted Node tests: `rawlogs/XR-FIX-HARNESS-LIVENESS-20261031-01/targeted-tests.stdout.log`
- Independent replay/archive verification: `rawlogs/XR-FIX-HARNESS-LIVENESS-20261031-01/independent-replay-verifier.stdout.json`
