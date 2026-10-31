# XR-HARNESS (N5): independent review of E-HARNESS attempt 12

**Decision: `amend`.** The attempt12 fixed native/direct/browser captures replay successfully against the checker and literal oracle, and the archived inputs are hash-verified. One checker false-accept leaves the required live renderer swap evidence unbound: a capture with the accepted renderer and its post-rejection live callback both relabeled as the retired DOM renderer still reports `matched`.

## Evidence review

- Verified all 10 gzip artifacts in `rawlogs/E-HARNESS-20261031T123850.820Z-2/` against the archive SHA-256, decompressed byte count, and source SHA-256 in `trace-index.json`. The capture replay uses this exact attempt12 archive; the original inputs remain unchanged.
- Replayed N4's `checkChildrenConformance` directly on the archived native, direct React, direct DOM, and three browser-profile captures. It returned the same `matched` result as archived `check.json`: 42 source events, 38 Go updates, 39 literal state projections, 27 physical `HTMLElement.click()` actions per profile, and all six existing capture mutations rejected.
- Replayed `checkSeededChildrenReplay` for seeds `20261031`, `20261032`, and `20261033`. Each has 60 events and 59 Go updates. Only seed 20261031 has a mounted browser swap profile, as recorded; all three native/direct runs and the first browser profile match the checker output.
- The actual fixed capture shows one compatible DOM → React swap accepted with pending tokens preserved and the old root removed before the replacement root was added. The incompatible candidate is rejected with `TypeError`, preserves the React renderer and pending tokens, and does not mutate the physical DOM. The later real click is in the actual capture as backend `react`, renderer id 2.
- The disabled request click is fenced with no state/tick/effect change; the retired callback and cancelled old reply are rejected. Effect records show child-only clear order `oak:g5:r2`, then `elm:g3:r2`, and parent removal order `oak:g7:r1`, `pine:g6:r1`, then `parent:g1:r2`.
- `noWasm` reports zero API attempts and zero WASM requests on fixed profiles and the mounted first-seed profile. Versions in the pinned receipt are Node 22.23.4, Go 1.24.0, Chromium 153.0.8010.0, and Playwright 1.64.1.
- Recomputed every pinned source/build file from the attempt12 run: 83 source pins and 8 build-output pins match current bytes; before/after sets match. The pin walker excludes directories named `custody`, and no `oracle/custody/` path appears in the recorded source pins. The fixed fixture and literal expectation remain pinned as inputs.

## Required amendment: bind the accepted renderer to live post-swap callbacks

In [check.mjs](../../conformance/check.mjs), the physical-click loop verifies event index, Action path, message, and that the method was `HTMLElement.click()` (lines 362–375), but it does not check the callback's `backend` or `rendererId`. The swap checks confirm an accepted return, pending preservation, and callback fencing (lines 483–501), but do not assert the accepted active renderer identity. The rejected-swap check does assert the previous active backend (lines 494–495).

The browser recorder captures the actual renderer identity with each callback in [browser-entry.mjs](../../conformance/browser-entry.mjs) (lines 73–83). The unmodified capture correctly records React renderer id 2 after the replacement. However, this clone mutation also passes `checkChildrenConformance`:

- change accepted swap `after.renderer` from `{backend:"react", id:2}` to `{backend:"dom", id:1}`;
- change the event 13 post-rejection live callback's backend/renderer id from `react/2` to `dom/1` in the event operation, physical action observation, and dispatch observation.

The checker still returns `status:"matched"`. This makes the live-swap callback requirement unverifiable by the current checker and its mutation controls even though this captured run behaves correctly. Add assertions tying the accepted candidate and the real post-swap click callback to the candidate's backend/renderer id, ensure the rejected candidate leaves that active identity intact, and add a negative capture mutation for this mismatch. The replay script and compressed mutated capture are preserved in `rawlogs/XR-HARNESS-20261031-01/`.

## Scope and decision boundary

The N4 checker, recorder, direct replay, runner, and seeded generator were reviewed. The two `check.test.mjs` and `seeded.test.mjs` files are N5-owned and were excluded from the implementation quality decision; their recorded hashes remain part of attempt12's input pin set. The earlier E-HARNESS attempt12 report states no run failures. Review-helper path/field mistakes were corrected and preserved separately; they are not N4 failures. No implementation files, Go code, oracle files, original harness receipt/report, or original capture were changed.

The false-accept is a must-fix for the live renderer-swap acceptance claim, so review does not accept the harness proof yet. Root can rerun fresh acceptance after the checker assertion and negative control are added.
