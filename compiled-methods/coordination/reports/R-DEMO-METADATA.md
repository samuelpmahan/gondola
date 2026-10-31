# R-DEMO-METADATA — canonical report hash correction

**Worker N5 · Outcome: `mixed_change`.** Applied the single metadata correction requested by XR--DEMO. No report text, production code, raw execution evidence, or review evidence was changed.

## Before and after

| File / field | Before | After |
| --- | --- | --- |
| Canonical E-DEMO report SHA-256 | `c4670cb17d12daa24ea057358f658414de518dcb3d6bc0b7ff1bda1f9b6a1e68` | unchanged |
| `E-DEMO.receipt.json` `report.sha256` | `dc8b06663b11faff05ea9b6bba8bcd47832c0df6a80ffa0cca698ab20f78f36c` | `c4670cb17d12daa24ea057358f658414de518dcb3d6bc0b7ff1bda1f9b6a1e68` |
| Raw runner report SHA-256 | `dc8b06663b11faff05ea9b6bba8bcd47832c0df6a80ffa0cca698ab20f78f36c` | unchanged in `finalEvidencePacket.rawRunnerReportSha256` |
| Canonical E-DEMO receipt SHA-256 | `07225fe6565aba94f9f17510a2daabc1f0062dd5b44f9e045335dc49533be4e3` | `bd1d952a7e9c976fee97a12bc4028377c1bd7359ba83809cecff16cd36fc84e3` |

The before packet at `compiled-methods/evidence/repairs/r-demo-metadata/before/` preserves the exact pre-amend E-DEMO report and receipt, plus the XR--DEMO review report and receipt. Its manifest records their hashes. The after packet preserves the canonical E-DEMO report and amended receipt. The amendment script compared the parsed receipt before and after with only `report.sha256` normalized back to its old value; all remaining receipt fields are identical.

The previous raw runner receipt and report remain at `compiled-methods/evidence/demo/attempt-05-methods-only-final/execution/`. The runner report remains pinned as `dc8b06663b11faff05ea9b6bba8bcd47832c0df6a80ffa0cca698ab20f78f36c`; that value now appears only as the raw report pin, not as the canonical report pin.

The implementation source was not edited. `compiled-methods/run.mjs` remains SHA-256 `eb1aa250c0c9cfbb7f3d73abf7692f8e50a57314836f8e5d0ac7d53a77a3cb68`. No tests or builds were rerun because this amendment changes receipt metadata only.
