# XR-RESTORE-SAFE independent review

**Decision: accepted.** The narrow E-RESTORE-SAFE repair removes the unsafe fallback and preserves the no-overwrite contract on the tested Linux profile. I found no reason to amend this packet.

## Reviewed artifact and change

The sealed source and `/tmp/keyed-module-publish/restore.py` are byte-identical: 26,946 bytes, SHA-256 `0dac505c5e9949a2b6168dac955e40c7af805847f73ef27652e1962d603d3f68`. Compared with frozen E-RESTORE source `6cd408b3f86ed91a033e6ad01f494c44c6c8e319409f89453c93777b117191ab`, the diff is confined to the module description, `_commit_no_replace`, and destination help text. The helper now requires Linux `renameat2(RENAME_NOREPLACE)`, rejects a non-Linux platform before probing libc, fails closed when the symbol or kernel primitive is unavailable, and has no `os.rename` call in its AST. The errno handling includes `ENOSYS`, `EINVAL`, `ENOTSUP`, and `EOPNOTSUPP`. The `--help` output states the Linux requirement and unsupported-platform behavior.

## Independent verification

- Re-ran the three unsupported-primitive controls. All rejected as expected; destination and staging were absent for the ordinary unsupported and unsupported-platform cases. In the injected race case, the foreign directory and sentinel remained intact, staging was removed, and the patched `os.rename` call count stayed zero.
- Re-ran all 11 synthetic remote/audit cases; all passed, including healthy retrieval, unsafe path/name, duplicate/link/extra/missing members, absent part, digest mismatch, truncation, and existing destination.
- Also called `_commit_no_replace` on Linux with an existing destination. `RENAME_NOREPLACE` refused it; both the stage and existing sentinel remained intact.
- Performed a fresh restore from the immutable 25-part publication. Verified all 25 segment pins, all 600 restored members and their exact sizes/SHA-256 values (372,962,548 expanded bytes), and all 157 source pins. Source commit: `f4c8f70199a8ca896c13e225a85901abe658d0de`. Index SHA-256: `a09b6e65d33e9601dff85d7fb4a560c4b682f6e51c76183e961f07c2e8c96dce`; manifest SHA-256: `0f8f5b15c36442d54412ad6480f4dbbb475b4cabec45ef800a01498a312f064b`. The temporary restore destination was removed after byte verification.
- Verified all 22 entries in the frozen E-RESTORE-SAFE `SHA256SUMS`. The earlier E-RESTORE report, receipt, and source retain their pinned hashes; the prior XR-RESTORE race witness remains SHA-256 `20096e21d4768c32c74df2b4adbf8f8c9fc85d34a11ebe88dd8fdd3d4c0ac3f6`.

The control cases that intentionally exercise rejection returned their expected failures. One rawlog checksum command first ran from the repository root, where its relative entries could not resolve; I captured that path error and reran from the rawlog directory, where all 30 listed files verified. No restore or control verification failed. Exact invocations, stdout/stderr, source diff, environment, and checksum captures are in `rawlogs/XR-RESTORE-SAFE/`.

## Environment and limits

Python 3.12.14 on Linux 6.18.57 x86_64 with glibc 2.39; `renameat2` was available. The accepted guarantee is limited to Linux systems where `renameat2(RENAME_NOREPLACE)` is present and supported. macOS and Windows were not tested and no cross-platform claim is made. Restore hashes establish byte consistency, not publisher authenticity. Go, Node, M0, and browser suites were outside this focused utility review and were not rerun.
