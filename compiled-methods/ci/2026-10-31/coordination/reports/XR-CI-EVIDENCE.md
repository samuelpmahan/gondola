# XR-CI-EVIDENCE — independent CI evidence review

**Decision: `accepted`.** The current-head run, workflow/source identity, retained log pins, primary artifact, and inherited execution-count claims in E-CI-EVIDENCE are internally consistent and independently verified. The primary current-head CI result is separate from the 8ed historical failure and does not claim PR merge or release.

## Source, workflow and merge identity

The published source and this checkout are `6b49cc0bd4c9512a041f723c86b632ec506afd9d` with tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`. The terminal snapshot records the same identity. The initial inventory and terminal snapshot contain the same 26 run IDs. All 26 workflow heads are the published source SHA; all 26 jobs are completed successfully, split into 13 pull-request and 13 push events. The selected PR #13 record is open, draft, and unmerged. Its captured metadata identifies head `6b49cc0bd4c9512a041f723c86b632ec506afd9d`, base `195c9433179218348d4b9f2477ae1e0725337d15`, and merge-test SHA `0e8d8f962fdb2e0ff74a86bd58bb932a2be3e6a5`, with the reported tree equal to the source tree and parents `[base, head]`.

The merge-test tree/parents and state agree across the captured PR identity, remote prepublication metadata and the PR workflow payload. The merge-test commit object is absent from this checkout, so this review records that identity from the captured provider metadata rather than claiming to have reconstructed the commit object locally.

Terminal snapshot: `compiled-methods/ci/2026-10-31/lanes/evidence/snapshots/jobs-2026-10-31T050732-682Z-6b49cc0-terminal.json`; SHA-256 `408aca6aec71391933281fdf078ad23f62665844f01d0125461d642571b87172`. Initial workflow inventory: `compiled-methods/ci/2026-10-31/repair-head-initial-workflows.json`; SHA-256 `c76a6227bd3e4ffbecd1c7c3294fe3aced95be7901319756c644c2339ae9999a`.

## Retained logs and artifact

I re-read and strict-UTF-8-decoded all 14 retained workflow logs: all 13 PR logs plus the designated primary push and PR logs. Each raw byte length and SHA-256 matched its log-manifest row, and its run/job/event/head/conclusion matched the initial inventory and terminal snapshot. Manifest: `compiled-methods/ci/2026-10-31/lanes/evidence/log-manifest-6b49cc0.json`; SHA-256 `28f55ddcc2746839e35a4258dcef6f0bcdddca58772208b0480bcc2a97dc0cd6`.

The selected primary artifact is push run `41169518187`, job `124444234335`, artifact `13030848292`. Its provider ZIP is 11,460,089 bytes, SHA-256 `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a`; CRC validation passed. I checked all 968 ZIP members, totaling 79,084,644 uncompressed bytes, against the retained manifest and extracted files. There were no missing or mismatched members. Retention manifest SHA-256: `bc1e669ba40c070bfa62c3d04eba5c4277aa3a694bc9d9f37bbadf62c817342f`.

## Inherited counts and provenance

The primary full execution receipts and logs support the report’s nested, overlapping gate counts:

| Gate | Commands | Result |
|---|---:|---|
| Compiled frontend | 33 | 5/5 app fixtures matched; 97 Node tests passed |
| Compiled backends | 18 | 5/5 backend fixtures matched |
| Compiled methods | 17 | 10 method-owned Node tests passed |

These counts are nested full-runner checks and are not additive. The methods run is full/passed, with 17/17 commands successful and 137 stable source pins. The matrix’s 188 input pins (51 checkout source and 137 generated-build inputs) and 149 check-time output pins (145 artifact outputs and 4 checkout source files) matched their source/artifact locations and remained stable.

The typed-composition totals (63 scripts, 2,463 actions, 63 native executions, 2,463 native frames, 4,926 actor/native comparisons, zero mismatches) appear in the retained inherited CI stdout. The exact seed and case bounds (`20261030,20261031`, 30 cases per seed, maximum 40 actions) come from the source-pinned `run-typed-composition.sh`. Its detailed report JSON is not in the ZIP; the report correctly does not present it as an archived artifact.

M0’s pass lines (`same over 5000 inputs`, `receipt matches`, `SHA256SUMS ok`) are in the retained inherited CI stdout. The seed `20261030`, case count, checksum manifest and expected JSON hashes come from checked-in M0 metadata/files; the detailed M0 metadata JSON is not in the ZIP. The report distinguishes these two evidence sources.

The 8ed result remains historical: its separately retained artifact audit identifies the two compiled-methods failures and old request-path mismatch. It is neither counted as a current-head failure nor used as a current-head pass.

## Reproduction and reviewed packet hashes

Independent read-only audit command:

```sh
python3 compiled-methods/ci/2026-10-31/lanes/demo/review-evidence/audit_evidence.py
```

It exited 0 under Python 3.12.14: **29 checks passed, no failures**. Script SHA-256: `3af4cec3fb03bf87f34d19de0d938f8b9bad4030f2e707d3f365a2fc2db168a8`. Result SHA-256: `95ab1fe2500632c379f5d8bf105630931eeda90b7d51b9a0d96d40e9f0be7463`.

The reviewed E-CI-EVIDENCE report SHA-256 is `55667dc7d168a2eba8b3b7f0f6347d5584ac5a227db25b57d27ca14c78fc2592` and its receipt SHA-256 is `283d1fc0181c0f712923f9fae1283db7dfef553489cd7a53f9254711e733f60d`. I found one non-blocking wording issue in the report’s final paragraph: “The two current source workarounds/repairs” names only the published runner-path repair. Clarifying or removing “two” would make that sentence more precise; it does not affect the audited evidence or this acceptance.

## Scope

This review covers the E-CI-EVIDENCE packet’s current-source CI identity, selected primary artifact, retained logs and inherited count/seeds provenance. It does not alter source, reports owned by N3, artifact bytes, Git state, or PR status.
