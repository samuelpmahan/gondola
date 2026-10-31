# E-CI-DOM — current-head DOM audit

**Outcome: `confirmed_reuse`.** The independent DOM audit passed against the fresh primary CI artifact for source `6b49cc0`. The report keeps the earlier local preflight separate from the current-head CI evidence; it does not use the failed `8ed` artifact or local archive as a CI substitute.

## Source and primary artifact

The published source is commit `6b49cc0bd4c9512a041f723c86b632ec506afd9d`, tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`, parent `8ed5b66a223de1992756516f8d3895c6e096f842`. `publication-current.json`, primary artifact metadata, and retention record agree on source identity.

The accepted primary artifact is push run `41169518187`, job `124444234335`, artifact `13030848292`, with workflow outcome `success`. Its provider ZIP is 11,460,089 bytes, SHA-256 `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a`. The ZIP integrity check passed with 968 members; its digest, size, and selected DOM-scoped member hashes match the retained metadata. The artifact's full execution record reports `mode: full`, `status: passed`, 17 successful commands, no failures, and 137 source pins equal before and after.

The separate PR run `41169522175` was still in progress in the latest retained snapshot (`2026-10-31T05:05:54.729Z`, SHA-256 `bab4a3e8269b007ce864dd4cf486e79a05514199c36ecdd3119020dbce2a0990`). The DOM acceptance here is based on the successful immutable primary push artifact, not on that in-progress PR run.

## Independent DOM and control audit

`lanes/dom/dom-oracle.mjs` is hand-authored from the frozen fixture contract. It imports neither the project DOM oracle nor its checker. It constructs the 19 literal Go state values and view trees, serializes expected `outerHTML-v1`, and independently derives button control properties. It was run against the retained primary artifact's native, direct, and actual-browser records.

The audit passed these checks:

- Native and direct traces, and all React, DOM, and swap traces, matched the 19 literal Go states and fixed view trees.
- Each browser profile has 19 matching trace DOM snapshots, 19 `domOracle` snapshots, and 19 physical DOM snapshots. The 18 swap physical snapshots also match their post-action states.
- Physical action records matched the fixed action paths, click values, message presence, and live disabled properties. Disabled intents were exactly indexes `6`, `9`, `10`, and `17`.
- Requested and completed effect arrays were empty on every tick.
- The actual Chromium capture reported no page errors and recorded all 18 alternating renderer transitions.

Current artifact pins: `methods.browser.json` is 1,722,819 bytes, SHA-256 `af59cc079eccee6c2b3550fec081a32f9056758aa54c6a71ef6f53cdc56cf626`; the separate browser capture is byte-identical. Native and direct records are each 205,110 bytes, SHA-256 `d2c26643dbabeb2f434e51c8b0032e4aa4fe720043d3e5bce2a54871def5cc12`. The fixture runner's method conformance record is `matched` for 19 ticks, 18 actions, four suppressed actions, three browser profiles, and 18 swaps.

## Actual CI toolchain

The artifact execution record reports Node `v22.23.4`, React and ReactDOM `19.3.1`, Playwright `1.64.1`, esbuild `0.28.2`, root Go `1.24.13 linux/amd64`, and compiled Go `1.27.3 linux/amd64`. The real browser capture and manifest report Chromium `156.0.8078.4`.

## Commands and reproducibility

The current-head checks were performed against the retained extracted files:

```sh
/tmp/gondola-node22/node_modules/node/bin/node compiled-methods/ci/2026-10-31/lanes/dom/dom-oracle.mjs \
  --browser compiled-methods/ci/2026-10-31/extracted/compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/matrix/methods.browser.json \
  --native compiled-methods/ci/2026-10-31/extracted/compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/matrix/methods.native.json \
  --direct compiled-methods/ci/2026-10-31/extracted/compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/matrix/methods.direct.json \
  --output compiled-methods/ci/2026-10-31/lanes/dom/final/dom-oracle-primary.json \
  --stage ci-primary-fresh-head \
  --source-commit 6b49cc0bd4c9512a041f723c86b632ec506afd9d \
  --artifact-reference compiled-methods/ci/2026-10-31/original.zip
python3 compiled-methods/ci/2026-10-31/lanes/dom/audit-primary.py
```

Both commands exited 0. Node emitted the `UNDICI-EHPA` experimental warning on stderr; it did not affect the result. The independent oracle source SHA-256 is `77dbc9c2a4481a4eeb7c88966da83c9b28204e39b7b92b84874bb2f99fe074d8`; primary oracle result SHA-256 is `47fa3a74382f82252d0f41ca209d6c37fd766c6980a2f205d63a6ae83e803118`. The machine-readable artifact audit is `lanes/dom/final/primary-dom-audit.json`.

## Scope and limits

This result accepts the current-head DOM serialization, live controls, fixed Go state/view consistency, empty effects, disabled browser intents, and swap physical snapshots. Callback fencing, dispatch order, and replacement lifetime are outside this lane and remain with N6. The earlier local methods-only audit passed but remains labeled preflight; the older `8ed` artifact remains excluded failed-head history. No production source, CI artifact, or Git state was changed by this audit.
