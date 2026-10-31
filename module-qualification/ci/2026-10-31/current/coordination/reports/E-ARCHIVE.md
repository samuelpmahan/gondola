# E-ARCHIVE — strict native archive verification

**Worker:** N2  
**Outcome:** `mixed_change`

## Implementation

Added `modulequalification.DecodeStrict(data, out)` and `modulequalification.VerifyArchive(archivePath, manifestPath, dest)`. The JSON helper rejects duplicate keys at every depth (including escaped spellings of the same key), invalid UTF-8, unpaired surrogate escapes, trailing values, unknown and incorrectly-cased struct fields, and preserves generic numbers as `json.Number`.

The archive verifier checks the closed runtime manifest, archive byte length and SHA-256, exact member metadata, normalized relative paths, source-pin closure, and the archived root snapshot. It compares `sourcePinsBefore` against the snapshot and every `source/<path>` entry. Extraction accepts regular files only, rejects duplicates, missing and extra entries, path traversal, links, truncation, nonzero tar trailers, and concatenated gzip streams. Limits are 64 MiB compressed archive, 128 MiB expanded tar, 32 MiB manifest/member, 4096 members, 4096-byte paths, and 255-byte path segments.

Files are written into a private sibling staging directory with restrictive permissions. `dest` must be absent and have an existing real parent directory. The verifier renames the stage into place only after all checks pass; failures remove the stage and surface cleanup errors. `ArchiveReport.Bytes` is the compressed archive byte count.

## Verification

Go `1.24.0 linux/amd64` passed the focused explicit-file test command, including strict-JSON negative cases and extraction of the actual PR20 runtime archive. The actual check validated source commit `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0`, all 529 archive members, and all 147 source pins against the root snapshot and archived source files. The expected root `/tmp/gobi-published-restore-check` already existed, so the test used its own fresh `t.TempDir()/restored` destination and left the existing directory untouched.

Negative controls cover duplicate/escaped JSON keys, invalid UTF-8 and surrogate escapes, wrong member hashes and lengths, source pin mismatch or unpinned source, traversal, links, duplicate/missing/extra members, a truncated gzip footer after recomputing the manifest archive hash, nonzero tar trailer bytes, concatenated gzip members, and existing-destination preservation. Failure cases leave no staging directory or published destination.

A package-level `go test ./modulequalification -count=1` attempt during the concurrent N1 implementation was not green: its two capture tests reached N1's temporary `CheckCaptures` “not initialized” stub. The exact log and exit code are preserved; this result is not attributed to the archive or JSON files and is not a package-wide pass claim.

Exact focused command, environment, output, archive pins, and the concurrent package-test failure are recorded under `native-module-coordination/rawlogs/E-ARCHIVE/`.

## Scope and limits

Verification establishes that the supplied archive bytes, manifest, snapshot, and source-pin file set agree. It does not establish publisher authenticity or independently prove that the claimed commit produced the pinned source. The helper validates the bounded runtime archive profile, not arbitrary tar features or archive formats. No Git metadata, scheduler state, producer run, or other lane source was changed.
