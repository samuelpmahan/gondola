# XR-R-CI-BUILD-FINAL (N5 independent review of N4)

**Decision: amend.** N4's repaired-head build evidence is substantively verified. The primary artifact ZIP was available in this audit workspace and its bytes independently match provider metadata. The ZIP is Git-ignored and is not a retained tracked artifact, so the packet should distinguish its current workspace availability from its Git retention status.

## Findings

### XR-R-CI-BUILD-FINAL-01 — stale ZIP availability limitation

The final report says the ZIP is unavailable locally for rehashing, and `artifact-audit.json` says it is not separately retained. During this review, `compiled-backends/ci/2026-10-31/original.zip` is present in the workspace but listed in the dated directory's `.gitignore`, so the distinction is local audit availability versus Git-retained evidence. I independently computed SHA-256 `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa`; both size (14,931,201 bytes) and digest match the provider artifact record and `primary-provenance.json`. Its 817 members match the retained index, and all 817 extracted files match that index. Update the limitation and audit metadata to make the retention distinction explicit and record the direct rehash. This does not change the outcome of the CI run or any build output claim.

## Independently verified

- The chosen primary is successful full push run `41155530877`, job `124401386239`, artifact `13025112465`, on exact head `195c9433179218348d4b9f2477ae1e0725337d15` and tree `c0e4a66eee3fdd8b789e1b565167856fdab62433`. No PR-run or overall PR-ready status is inferred.
- Both actual output trees contain four apps and 209 files. Every output's size and SHA-256 match its `BuildResult`; backend tags and the four package paths are correct. React and DOM `BuildResult.apps` are identical, and manifests are equal after removing only the backend tags.
- The 204 non-manifest, non-bundle companion outputs match byte-for-byte. The four raw module files per backend have independent hashes; neither the report nor this review makes a bundle equality claim.
- All six root/compiler Go test, race, and vet commands exit zero. I rehashed their twelve stdout/stderr logs against the archived execution receipt. The full execution record has 33 successful commands.
- The 122 compiled-frontend and 126 backend-runner before/after pin lists are unchanged, and each recorded source pin matches the exact reviewed head. The GoScript dependency is pinned at `github.com/s4wave/goscript v0.6.2`, with module and sum hashes checked.
- The consumed interim E-CI-BUILD report/receipt remain byte-identical to their history copies. The historical Markdown source-review pin and actual `emit/backend.go` SHA are `b2486fff69d106a4801e5a5400c961b3b6ab55ff9be440dcbdec5a9631f3d3ed`; the old JSON receipt's different value is preserved as a documented typo. The final R-CI-BUILD-FINAL report path is canonical and its digest matches the final receipt.

## Review procedure and evidence

I independently recomputed the artifact ZIP, member, extraction, build-output, bundle, companion, execution-log, source-pin, GoScript, and prior-packet hashes. The reproducible read-only checker is [`audit_build_crosscheck.py`](../../lanes/reviews/xr-r-ci-build-final/audit_build_crosscheck.py); its computed results are [`artifact-crosscheck.json`](../../lanes/reviews/xr-r-ci-build-final/artifact-crosscheck.json).

- Checker command: `python3 compiled-backends/ci/2026-10-31/lanes/reviews/xr-r-ci-build-final/audit_build_crosscheck.py`
- Checker result: success; cross-check JSON SHA-256 `e17f5befa6212a91010ebf4e43cae03ed77fbe02dd33bc719bd650a3dbaa7956`.
- Reviewed source head/tree: `195c9433179218348d4b9f2477ae1e0725337d15` / `c0e4a66eee3fdd8b789e1b565167856fdab62433`.
- Input N4 report SHA-256: `3c15391e3ec0c9a32667bbac70d3c81b12743fed4eb0643fec0508bd2982badd`.
- Input N4 receipt SHA-256: `3441c6015c1699d9957d9d0ad3c36b2d7c3d849260fe8b15b80cf868ce1c6c7c`.
- Input N4 artifact-audit SHA-256: `254c2e3e37e1ab84953fb133c405bb803b80770f6a622127f86cf8a9f891179c`.

This review only amends the evidence description for ZIP availability. It does not identify a build/source defect, rerun the CI commands, or evaluate root-owned PR checks.
