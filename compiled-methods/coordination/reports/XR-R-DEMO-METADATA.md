# XR-R-DEMO-METADATA

**Worker N2 · Decision: accepted.** The metadata repair changed only the canonical E-DEMO receipt's `report.sha256` to the actual canonical report hash. The previous canonical receipt/report and XR--DEMO review remain preserved byte-for-byte, and the raw runner report hash remains valid in its raw evidence record.

## Verified change

- Preserved pre-repair E-DEMO receipt SHA-256: `07225fe6565aba94f9f17510a2daabc1f0062dd5b44f9e045335dc49533be4e3`.
- Preserved and current canonical E-DEMO report SHA-256: `c4670cb17d12daa24ea057358f658414de518dcb3d6bc0b7ff1bda1f9b6a1e68`.
- The canonical receipt's `report.sha256` changed from `dc8b06663b11faff05ea9b6bba8bcd47832c0df6a80ffa0cca698ab20f78f36c` to `c4670cb17d12daa24ea057358f658414de518dcb3d6bc0b7ff1bda1f9b6a1e68`. A parsed deep comparison confirmed that no other receipt field changed.
- The new canonical E-DEMO receipt SHA-256 is `bd1d952a7e9c976fee97a12bc4028377c1bd7359ba83809cecff16cd36fc84e3`; it is byte-identical to the preserved `after/E-DEMO.receipt.json`.
- The packed raw runner report remains SHA-256 `dc8b06663b11faff05ea9b6bba8bcd47832c0df6a80ffa0cca698ab20f78f36c`, matching both the packed runner receipt and `finalEvidencePacket.rawRunnerReportSha256`.
- The previous XR--DEMO report and receipt remain unchanged at `2840688ef486a85171c25ca00098ca4d066a11c4c4634dfede622cf536a2d206` and `abda903f4e82ce783f25d0943588eaea67ba7df123b09fad28da0ee18d2067b1` respectively.
- `compiled-methods/run.mjs` remains SHA-256 `eb1aa250c0c9cfbb7f3d73abf7692f8e50a57314836f8e5d0ac7d53a77a3cb68`.

The preservation manifest's four before snapshots and all eight entries in the repair inventory verify against disk. The E-DEMO report is unchanged, and the after snapshot matches the current canonical report and receipt.

## Limits

This is a receipt metadata correction. No tests, builds, browser runs, or Go commands were rerun. The prior XR--DEMO bounded acceptance remains scoped to the local methods-only and M0 evidence: the inherited full local runner is incomplete, and managed CI remains pending.

## Audit

The read-only deep-diff audit is `compiled-methods/evidence/reviews/xr-r-demo-metadata/audit.mjs`; its result is `audit.json` (SHA-256 `85b6a8ec70f2e935ac46837cea7429f6b997e8265b2186a0f99a4f7ff901311b`). Audit stdout and stderr are preserved beside it.

```sh
/tmp/gondola-node22/node_modules/node/bin/node compiled-methods/evidence/reviews/xr-r-demo-metadata/audit.mjs
```

The audit exited 0. No E-DEMO, XR--DEMO, raw runner, production source, or previous review evidence was modified during this review.
