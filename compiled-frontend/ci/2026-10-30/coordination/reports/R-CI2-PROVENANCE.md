# R-CI2-PROVENANCE — trace provenance correction

**Outcome: mixed_change; decision: accepted.** This packet applies the single bounded metadata correction requested by the independent XR-CI2-TRACE review. The repaired head remains `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281` with tree `ca99e9432dca87a6bf6718c20186b1223b870126`. Its direct parent is `408e330517b1dd5e5f865e2ff1914465f98bcf66`; its PR base is `42df6883337605d901a23e9fed874768c7ce1824`.

## Correction and preservation

The CI2-TRACE report, receipt, and raw evidence now distinguish direct parent from PR base. The report says “direct parent” and “PR base”; the receipt uses `direct_parent_sha` and `pr_base_sha`; the raw evidence uses `directParentSha` and `prBaseSha`. The trace payload and all execution, artifact, source-pin, output-pin, and profile evidence remain unchanged.

Before changing the raw evidence, I preserved its original bytes at `audits/R-CI2-PROVENANCE/raw-evidence.original.json` (SHA-256 `e637db3cbe5049e449c0adf35fe94ebce3183b538613786a7b5f1a5b5af5dfa7`). The original producer report and receipt remain preserved in N5's XR audit at `audits/XR-CI2-TRACE/producer-report.original.md` (SHA-256 `5b1118ab47f600b7677cb2f97af31a26d44bb005b5b12d04aa212ee9fd37dce7`) and `producer-receipt.original.json` (SHA-256 `b56f577bc47e08cf21d57e9671a71a303bfb0a82d1a0ac49930281d3c4f689b1`).

| File | Before SHA-256 | After SHA-256 |
|---|---|---|
| CI2-TRACE report | `5b1118ab47f600b7677cb2f97af31a26d44bb005b5b12d04aa212ee9fd37dce7` | `c29bb70c9fcf52c61108c1f425a3d1c3ce3f6ee01686dff4104a265f955ed752` |
| CI2-TRACE receipt | `b56f577bc47e08cf21d57e9671a71a303bfb0a82d1a0ac49930281d3c4f689b1` | `fd05c3530180d5245a4412b6a45fa8dad45bcb79ac037197f7f3247eeeebab08` |
| CI2-TRACE raw evidence | `e637db3cbe5049e449c0adf35fe94ebce3183b538613786a7b5f1a5b5af5dfa7` | `816c79648576a12102626460e7ccc4c703c83e30c9a07ce178a3f8da97728430` |

The updated CI2-TRACE receipt hash-pins the corrected report and raw evidence. A reverse transformation of only the provenance field change reproduces the saved original raw-evidence JSON exactly. The frozen source inventory and XR-CI2-TRACE finding independently agree on direct parent `408e330...` and PR base `42df688...`.

## Scope

This change corrects provenance labels only. No traces were rerun, no application or browser tests were run, no artifact was downloaded, and no provider or application/compiler source was changed. See `audits/R-CI2-PROVENANCE/audit.json` for the before/after hashes and verification checks.
