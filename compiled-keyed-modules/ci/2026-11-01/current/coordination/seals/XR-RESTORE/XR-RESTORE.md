# XR-RESTORE: independent review of E-RESTORE

**Decision: AMEND**  
**Reviewer / job:** N4 / XR-RESTORE  
**Author:** N1 / E-RESTORE

## Sealed packet and primary restore

The sealed utility copy and `/tmp/keyed-module-publish/restore.py` are identical: SHA-256 `6cd408b3f86ed91a033e6ad01f494c44c6c8e319409f89453c93777b117191ab` (26,801 bytes). E-RESTORE report and receipt hashes match the source seal. The bundle index and manifest remain at their sealed pins; no metadata index, utility source, restored author tree, or earlier E-RESTORE evidence was edited.

I reran the actual local primary restore into a fresh temporary destination, then independently checked every segment, extracted member, and source pin before the temporary tree was removed.

| Evidence | Result |
|---|---:|
| Local primary segments | 25/25 bytes and SHA-256 matched |
| Archive | 25,697,770 bytes; SHA-256 `1921ef063cd8f62f56384c72c65a0f87b26a6cabb015d3aff42040c96b6453d7` |
| Manifest members | 600/600 exact paths, sizes, and SHA-256; 372,962,548 expanded bytes |
| Source pins | 157/157 verified against extracted `source/` files |
| Source commit | `f4c8f70199a8ca896c13e225a85901abe658d0de` |
| Restore command | exited 0 under Python 3.12.14 on Linux 6.18.57 x86_64 |

The focused restore used a fresh `/tmp` temporary directory and cleaned it on success. The final source file SHA stayed equal to the sealed hash.

## Strict metadata and remote controls

I reran N1’s loopback audit suite against the sealed utility: **11/11 cases passed**. The healthy case fetched the index, member manifest, and two parts. Ten invalid cases exited 2 with expected diagnostics: unsafe member path, unsafe segment name, duplicate tar member, link, extra member, missing member, missing remote part, part hash mismatch, truncated gzip, and existing destination. Failed restores left no destination or staging directory; the pre-existing destination sentinel remained unchanged.

Four additional focused controls also exited 2 with targeted errors and no staging or destination residue:

- duplicate JSON key in the segment index;
- unknown segment-index field;
- duplicate member path in audit metadata;
- tar member digest mismatch despite a valid segment digest.

The CRC/trailer fix is present at `restore.py` lines 465–472: after tar end markers, `_extract` drains the gzip stream to EOF. The fresh truncated-archive control failed with `Compressed file ended before the end-of-stream marker was reached`. N1’s four earlier red probes remain present; I verified all 25 entries in `rawlogs/E-RESTORE/SHA256SUMS` as `OK`.

## AMEND: no-replace contract is broader than the fallback

Linux `renameat2(RENAME_NOREPLACE)` refused an existing destination with `EEXIST` and preserved both the staged source and the existing sentinel. The sealed report correctly says this path was tested on Linux and that the non-Linux fallback’s concurrent-race behavior is untested.

However, the public CLI help still says “existing paths are never overwritten” (`restore.py` line 544). `_commit_no_replace` falls back to a pre-check followed by `os.rename` if `renameat2` is absent or unavailable. I reproduced the race without changing the utility: the test forced the fallback branch, created an empty destination between the pre-check and `os.rename`, and confirmed that `os.rename` replaced that destination directory. This was a controlled simulation on Linux, not a macOS or Windows run. It proves the fallback cannot satisfy the unconditional CLI promise under concurrent creation.

**Narrow requested remedy:** fail closed if `renameat2(RENAME_NOREPLACE)` is unavailable or unsupported; remove the `os.rename` fallback. Keep the supported and tested claim bounded to Linux with `renameat2`. No new cross-platform implementation is requested. The reviewer did not edit the utility. This is the sole acceptance blocker; the primary restore and integrity controls otherwise passed.

The shared milestone contract does not state a cross-platform restore requirement, but the restore CLI itself promises universal no-overwrite behavior. That user-facing promise is why this review is AMEND rather than accepted with an unqualified portability caveat.

## Preserved evidence and limits

The actual audit archive was not available in this review; audit mode was exercised with the author’s synthetic remote format and the four added strict-metadata/member-digest cases. The sealed author evidence for offline Go replay and HTTP assets was not rerun here. I did not run macOS or Windows. The checked-in/publish README’s `ASSET_BASE` placeholder is expected until the asset commit is known and is not an archive-restore failure.

N1’s four earlier failed probes were preserved and their SHA256SUMS inventory passed. Three reviewer-only setup mistakes are documented in `rawlogs/XR-RESTORE/attempts.json`; they did not invoke or modify the utility and are excluded from the decision.

## Commands, versions, and pins

Fresh checks and exact command records are in `rawlogs/XR-RESTORE/commands.json` and the per-command stdout/stderr files. Python was `3.12.14`; OS was Linux `6.18.57 x86_64`.

- Sealed utility: `6cd408b3f86ed91a033e6ad01f494c44c6c8e319409f89453c93777b117191ab`.
- E-RESTORE report: `8489490bb5e764b9673aa38b9f0642010083feac68974814615801c0852cba2d`.
- E-RESTORE receipt: `8f6028ca5ba2702342f6bfabf53f7c1bc3e6a1c5f19830e73fe42c4867ebc5b1`.
- `bundle-parts.json`: `a09b6e65d33e9601dff85d7fb4a560c4b682f6e51c76183e961f07c2e8c96dce`.
- `bundle.manifest.json`: `0f8f5b15c36442d54412ad6480f4dbbb475b4cabec45ef800a01498a312f064b`.
- Actual primary review: `rawlogs/XR-RESTORE/primary-restore-review.json`.
- Fresh 11-case remote suite: `rawlogs/XR-RESTORE/audit-synthetic.stdout.json`.
- Four metadata/digest controls: `rawlogs/XR-RESTORE/metadata-synthetic.stdout.json`.
- No-replace race witness: `rawlogs/XR-RESTORE/no-replace-review.stdout.json`.
