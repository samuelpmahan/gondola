# XR-HARNESS independent review

**Worker:** N1  
**Reviewed packet:** E-HARNESS / N4  
**Decision:** `amend`  
**Date:** 2026-10-31

## Result

The compact harness evidence preserves the information needed to check state, view, DOM, effects, event order, physical clicks, and renderer callback fences. I independently replayed the compact fixed browser capture and mounted seed capture through the checker, and ran the portable tests that spawn a fresh native Go trace. Those checks passed.

The sealed E-HARNESS packet has one evidence-hash mismatch for the older attempt-005 fixed browser capture. The actual file is intact and byte-identical to its `.browser.json` duplicate, but both the receipt and report record a different digest. This is a metadata-only custody finding; it does not indicate a harness or runtime mismatch. The author packet should remain unchanged and be corrected in a separately tracked repair packet.

## Verified harness behavior

- All 26 E-HARNESS source and input pins match their current bytes. Fourteen of its fifteen pinned evidence files also match; the sole mismatch is the fixed attempt-005 capture described below.
- The compact fixed capture is 8,634,354 bytes and its hash matches the E-HARNESS receipt. It contains React, DOM, and swap profiles, each with 50 events, 51 per-event snapshots, and one complete 46-tick trace. Each profile records 34 physical `HTMLElement.click` actions, six requests, three cancellations, four deliveries, and no pending effects at completion. The swap profile records one accepted and one rejected swap.
- Compaction removes repeated cumulative traces from event rows. Each profile retains the complete trace once, including each tick's state, view, DOM, message, and effect data. Every source event still has indexed event/step/state metadata and an operation result. Per-event snapshots retain physical DOM, pending effect keys, and state indices. The checker maps these back to the independent literal state/view/DOM projections and checks the effect ledger and order.
- Disabled clicks retain before/after callback, pending, trace, effect, and physical DOM fences. The swap profile retains old-root removal/replacement evidence, accepted/rejected renderer identity, pending/effect preservation, retired callback results, and the live callback after the rejected candidate. The separate compact swap replay and compact fixed replay both pass their assertions.
- The compact fixed checker detects all 16 captured-data mutations. The direct typed-value mutation selects an encoded `float64` struct field with `float64Bits == 4010000000000000` and changes it to `4019000000000000`; it is checked against the actual captured typed state. Other mutations cover native state/order, browser DOM, control state/order, cancellation order, renderer identity, callback metadata, and no-WASM guard coverage.
- The mounted seed capture for `20261031` is 6,816,769 bytes and matches its pinned hash. Its swap profile has 71 events, 72 snapshots, 71 ticks, and two physical clicks; an independent seeded replay check passed. The author packet limits browser mounting to this seed. Seeds `20261032` and `20261033` are native/direct only.
- The focused Node suite passed 5/5 tests. `check.test.mjs` invokes `go run ./cmd/compiled-publications-native --script ...` on demand, with a 128 MiB buffer; it does not consume a stored author-side native trace. An independent compact fixed check returned `matched`, 50 events, 45 updates, 46 checkpoints, and 16/16 mutations; the compact mounted seed checker returned state/tree/DOM parity.

## Finding XR-HARNESS-1: incorrect fixed capture digest

E-HARNESS receipt `evidence[]` records `compiled-publications/coordination/rawlogs/E-HARNESS-20261031T-005/run.browser.capture.json` as SHA-256 `10480e56a8f9a0c411e2b3fa794f95744616f538cd15ffa7e5910d28a1d19302`. The E-HARNESS report repeats that digest in abbreviated form. The preserved file is 160,485,984 bytes and hashes to `10480f72f01393911edb85939749dec64deefaa9ba2733720d4b801e67be3be1`. Its paired `run.browser.json` is also 160,485,984 bytes and has that same actual digest.

The incorrect digest is the only mismatch among the author's listed source, input, and evidence pins. It prevents the sealed packet's stated hash from identifying the file even though the file pair and all compact evidence are intact. Preserve the original E-HARNESS report and receipt; record any correction as a new repair/supersession packet.

## Limits

This review did not rerun the large pre-compaction full attempt or the complete integrated runner. E-HARNESS itself says its full attempt 005 passed before compaction, then compact fixed/seed validations passed, but no full runner or CI was run after the compact capture/output-path change. Only seed `20261031` has a compact mounted-browser capture. No claim is made here about final release acceptance or other engines and transports.

## Review evidence

The exact commands, outputs, compact-capture structural audit, source/input pin checks, and observed hash discrepancy are under `compiled-publications/coordination/rawlogs/XR-HARNESS/`. The receipt pins each review artifact and all reviewed source/evidence digests.
