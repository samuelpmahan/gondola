# E-CI-DEMO local preflight (not CI acceptance)

This is a rehearsal on the published source checkout `6b49cc0bd4c9512a041f723c86b632ec506afd9d`, tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`. It is kept separate from the required fresh managed-CI audit.

## Evidence checked

- The local methods-only archive is `compiled-methods/evidence/builds/final-local-methods-only.tar.gz`, SHA-256 `e9ee3f8917bb65e4956ef4fcc620a627c5decdad9d6ffc4b2cf9a1252d4e4b8f`. Its manifest lists 189 members; the audit verified every member name, byte count, and hash.
- The local runner receipt has 137 source pins. Every pin matches this checkout. It records an explicit `methods-only` pass, not a completed inherited full run.
- The method matrix reports 19 ticks, 18 fixture actions, 14 dispatched actions, 4 suppressed intents, 18 renderer swaps, and matched profiles.
- The HTTP smoke record reports 200 for `/`, `/demo.css`, and `/demo.bundle.mjs`, 14 Go dispatches, 3 renderer swaps, final backend DOM, and final state `{parent: 0, child: 2, readOnly: false, savedChild: 1}`. It reports no browser errors or WASM requests. The served asset byte counts, smoke JSON hash, screenshot hash (`ba3050e60b9e81e2c08b7f244bb6f337a9aa6e0278271ab315fa5437c355eb22`), and exact 67-file React/DOM build pins were checked against the archive.
- The smoke source contains `deepEqual` of the full Go snapshot across renderer replacement and an unchanged tick-count assertion. The local command succeeded with those assertions active. The screenshot was visually inspected; it shows the live Go snapshot and final DOM renderer.
- The standalone M0 record separately passed 5,000 seeded cases with 27 stable pins and matching stdout/stderr hashes. The local inherited full run history remains `incomplete`; its attempts remain distinct from this partial pass.

## Audit command

```sh
python3 compiled-methods/ci/2026-10-31/lanes/demo/audit.py local-preflight \
  --archive compiled-methods/evidence/builds/final-local-methods-only.tar.gz \
  --manifest compiled-methods/evidence/builds/final-local-methods-only.json \
  --receipt compiled-methods/coordination/receipts/E-DEMO.json \
  --source-root . \
  --output compiled-methods/ci/2026-10-31/lanes/demo/preflight/local-demo-audit.json
```

The final result is `local-demo-audit.json`: 350 evidence checks, no failures, classification `local-preflight-only`. Audit script SHA-256: `b69d173ea2fdda6ce5c0023b8a41dacadc897923cc2712899e03d7bc93f80820`. An early draft auditor result is preserved as `local-demo-audit-initial-auditor-mismatch.json`; those false negatives came from the audit script's assumptions about optional source-pin byte counts, assertion messages, and HTML content markers. The auditor was corrected and the full local audit then passed. No product code was changed or retested.

The managed CI artifact is not part of this preflight, and no CI pass is claimed here.
