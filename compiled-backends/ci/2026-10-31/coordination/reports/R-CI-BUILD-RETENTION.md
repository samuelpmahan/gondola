# R-CI-BUILD-RETENTION (N4)

**Outcome: mixed_change.** This metadata-only supplement corrects the local-availability wording in R-CI-BUILD-FINAL using direct hashes of the existing archive files. The primary CI run, build outputs, test results, and consumed final packet remain unchanged.

## Corrected archive availability

- The provider ZIP is present at `compiled-backends/ci/2026-10-31/original.zip`. Its actual size is **14,931,201 bytes** and its actual SHA-256 is `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa`, matching both `primary-provenance.json` and the provider artifact record for artifact `13025112465`.
- I opened the ZIP and verified all **817** members against the 817-entry retained index, including exact paths, member sizes, and SHA-256 values. The extracted files also match the ZIP bytes and retained index.
- The readable copy `ci-artifacts.tar.xz` is **5,217,080 bytes**, SHA-256 `91b781500ff5379cf118918f545b6593969cb28d5495014b68c9a3ea6ca9218d`. I verified all **817** regular-file member paths and bytes against the same retained index. The members total **87,153,279 bytes**.

## Retention status at this review

The ZIP is available for direct audit in this worktree, but `.gitignore` excludes `original.zip`, and it is not tracked by Git. The tar is also present and fully verified, but its current Git status is untracked (`?? compiled-backends/ci/2026-10-31/ci-artifacts.tar.xz`); it is not tracked or published yet. Root plans to include the exact tar in the final evidence publication. This packet records that publication as pending and makes no claim that a Git commit containing the tar already exists. A post-publication check can then establish tracked retention.

The ZIP and tar are separate container files. This audit verifies the ZIP's provider digest and indexed members, and verifies the tar's indexed member bytes; it does not claim the tar reconstructs a byte-identical ZIP container.

## Correction to the consumed final packet

R-CI-BUILD-FINAL report lines 8 and 69 say the ZIP is not separately retained or available locally for rehashing. Those statements are incorrect for the audit worktree used here. The matching stale note is `primaryCi.providerArchiveMetadata.note` in the consumed `artifact-audit.json`. The accurate qualification is that the ZIP is present and has been rehashed in the worktree, while being Git-ignored and not Git-retained.

The existing final report, receipt, and artifact audit have not been edited. Their current SHA-256 values are preserved in the verification record: report `3c15391e3ec0c9a32667bbac70d3c81b12743fed4eb0643fec0508bd2982badd`, receipt `3441c6015c1699d9957d9d0ad3c36b2d7c3d849260fe8b15b80cf868ce1c6c7c`, audit `254c2e3e37e1ab84953fb133c405bb803b80770f6a622127f86cf8a9f891179c`. N5's amendment review remains unchanged at report `6a79bf20e0f9c9f07bff61b7b1cfddb3c2b9fd441dc4e32ddc981bfceefbe927` and receipt `ec4ab656f366c830deb91b2322993b40f25487ac7ffb85f1ed8e778e1c8385fb`.

The original final-build outcome remains `mixed_change`; this supplement makes no build or CI failure finding. It addresses only archive availability, hash verification, and current retention wording.

## Verification and limits

- Read-only verifier: [`verify_archive_retention.py`](../../lanes/build/retention/verify_archive_retention.py).
- Machine-readable result: [`archive-retention-audit.json`](../../lanes/build/retention/archive-retention-audit.json).
- Command: `python3 compiled-backends/ci/2026-10-31/lanes/build/retention/verify_archive_retention.py` (Python 3.12.14); result `passed`.
- No source, workflow, test/build/compiler code, provider ZIP/tar, extracted file, or prior build/audit output was modified, and no CI/test command was rerun. The only new files are this metadata supplement and its own audit script/result.
- The report does not claim current Git tracking for either archive, byte identity between ZIP and tar containers, or any new workflow result.
