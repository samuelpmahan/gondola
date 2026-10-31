# XR--DEMO

**Worker N2 · Decision: amend.** The final methods-only execution, M0 receipt, and bounded demo evidence are substantiated. The canonical E-DEMO receipt has one stale report hash: it points to the canonical report path but records the hash of the packed raw runner report. The canonical receipt needs a metadata-only correction before its report reference is accepted.

## Finding

`compiled-methods/coordination/receipts/E-DEMO.json` records `report.path` as `compiled-methods/coordination/reports/E-DEMO.md` with SHA-256 `dc8b06663b11faff05ea9b6bba8bcd47832c0df6a80ffa0cca698ab20f78f36c`. The current canonical report hashes to `c4670cb17d12daa24ea057358f658414de518dcb3d6bc0b7ff1bda1f9b6a1e68`. The recorded `dc8b…` hash matches the packed raw runner report at `compiled-methods/evidence/demo/attempt-05-methods-only-final/execution/runner-report.md`; it is also independently recorded in `finalEvidencePacket.rawRunnerReportSha256`.

Update the canonical receipt's report pin to the current canonical report hash. Preserve the archived runner receipt and raw runner report as original run evidence, and keep their raw report hash recorded separately from the canonical report pin.

## Verified methods-only evidence

- Canonical E-DEMO report SHA-256: `c4670cb17d12daa24ea057358f658414de518dcb3d6bc0b7ff1bda1f9b6a1e68`; canonical E-DEMO receipt SHA-256: `07225fe6565aba94f9f17510a2daabc1f0062dd5b44f9e045335dc49533be4e3`.
- The runner source is `compiled-methods/run.mjs`, SHA-256 `eb1aa250c0c9cfbb7f3d73abf7692f8e50a57314836f8e5d0ac7d53a77a3cb68`. Its finalizer hashes `join(root, build.outputDir)` and compares the final output pins to the earlier pins for each backend.
- The raw methods-only execution record matches its packed copy. All 137 source pins match before and after the run and match the current checkout. All 16 recorded commands exited 0; the command stdout/stderr hashes match their recorded log files.
- React and DOM requests specify their matching backend and `builds/{backend}/output` directory. Their request, result, and manifest copies match the raw attempt. Each `BuildResult` lists 67 output files. For both backends, all 67 final file hashes and sizes match disk, and the exact before/after pin arrays match. AppIR and encoder hashes match across the builds; the raw module hashes are independently pinned.
- The final evidence inventory contains 56 members, every member hash matches, and it covers every packet file except the inventory manifest itself. The compiled-payload archive SHA-256 is `0d74acba45844f82ec475bae5e0cdf047d7ef0ab8d89ba1695e35161c0163228`; its entries match `compiled-payloads.list`.
- The recorded methods matrix reports matched: 19 ticks, 18 actions, 14 dispatches, four suppressed actions, 18 renderer swaps, and four detected mutation controls. The real HTTP smoke used Chromium `153.0.8010.0`, completed 14 dispatches and three swaps with final state `{parent: 0, child: 2, readOnly: false, savedChild: 1}`, and recorded no browser errors or WASM requests.
- Tool versions match the raw logs and installed package manifests: Node `v22.23.4`, native Go `1.24.0`, compiler Go `1.27.3`, React/ReactDOM `19.3.1`, Playwright `1.64.1`, and esbuild `0.28.2`. The native binary hash and size match the raw receipt.

## M0 and remaining gates

The M0 receipt reports `passed` and `matched`, with 5,000 seeded cases and 27 source pins equal before and after. Its recorded command stdout/stderr and report hashes match the files. A read-only `sha256sum -c SHA256SUMS` check passed all 24 entries; output is preserved in `compiled-methods/evidence/reviews/xr-demo/m0-sha256sums.log`.

The local inherited full runner remains **incomplete**. Its first attempt was stopped after source-pin drift; the second has no final status or exit code. The methods-only pass does not establish a full local run. Managed CI also remains pending; this review does not infer a CI pass from local Chromium evidence.

## Audit artifacts and commands

The independent, read-only audit is `compiled-methods/evidence/reviews/xr-demo/audit.mjs`; its result is `audit.json` (SHA-256 `cb490cec7022abf581798e0f16eb8e6df3ee04dd91e38f87bd3ce4e40f1d8527`). It verifies the canonical hashes, current 137 source pins, all 56 inventory entries, archive members, all 134 React/DOM output pins, request/backend/outputDir provenance, command logs and tool versions, matrix output pins, HTTP smoke records, and M0 receipt/log pins. Audit stdout and stderr are preserved alongside it.

Commands run for this review:

```sh
/tmp/gondola-node22/node_modules/node/bin/node compiled-methods/evidence/reviews/xr-demo/audit.mjs
sha256sum -c SHA256SUMS
```

Both exited 0. No production source, canonical E-DEMO report/receipt, raw attempt, or original review evidence was modified during this review. The only amendment requested is the canonical report hash reference above.
