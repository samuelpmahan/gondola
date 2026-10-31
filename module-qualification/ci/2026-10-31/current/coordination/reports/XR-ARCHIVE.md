# XR-ARCHIVE — independent archive verifier review

**Reviewer:** N3  
**Decision:** `amend`

## Scope and packet integrity

Reviewed the sealed E-ARCHIVE report and receipt, its source inventory, its ten-file raw-log index, the implementation and focused tests, and the pinned PR20 archive and manifest. E-ARCHIVE report and receipt hashes match the seal. All four owned Go source/test files match the sealed sizes and SHA-256 values. Every E-ARCHIVE indexed raw log matches its declared size and digest. The archive and manifest bytes at the recorded paths also match the author packet pins.

The archived implementation uses strict JSON decoding before validating closed manifest/snapshot field sets. It applies compressed, expanded, manifest, member, path, and count bounds; rejects unsafe paths, non-regular members, duplicate/missing/extra entries, mismatching member/source hashes, truncated gzip, nonzero tar trailers, and concatenated gzip data; extracts to a private sibling staging directory; and publishes only after archive, source-closure, and snapshot checks.

## Independent execution

Go `1.24.0 linux/amd64` passed the focused explicit-file command against the actual archive and manifest:

```text
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false GOBI_MODULE_ARCHIVE=/workspace/scratch/39a56936f173/gondola/compiled-modules/output/attempts/attempt-20261031T213332911Z-35.tar.gz GOBI_MODULE_MANIFEST=/workspace/scratch/39a56936f173/gondola/compiled-modules/output/attempts/attempt-20261031T213332911Z-35.manifest.json /tmp/gondola-go/go/bin/go test modulequalification/archive.go modulequalification/archive_test.go modulequalification/json.go modulequalification/json_test.go -count=1 -v
```

All 12 top-level tests passed, including nested malformed-member and strict-JSON controls, the existing-destination preservation check, and actual archive extraction. The actual archive test verified the expected source commit, 529 members, and 147 source pins. A separate Python standard-library tar stream audit independently checked the exact member inventory, regular-file types, every member’s byte count and SHA-256, the root snapshot’s 147-pin map, and the archive/manifest byte pins. It measured 67,486,104 member-data bytes, below the 128 MiB expanded limit. The archive is 6,373,581 bytes and the manifest is 125,900 bytes, each below its configured bound.

The focused command and output, Go version, pin audit, independent tar audit, and raw-log index are under `native-module-coordination/rawlogs/XR-ARCHIVE/`. The author’s earlier package-wide `go test ./modulequalification` red is preserved in E-ARCHIVE logs and explicitly attributed there to N1’s temporary uninitialized `CheckCaptures` implementation. This review does not treat that concurrent package result as an archive failure or as a package-wide pass.

## Finding — destination can be replaced in a check/rename race

`VerifyArchive` checks that the destination is absent at the beginning and again at `archive.go` lines 163–167, then calls `os.Rename(stage, destAbs)` at lines 168–170. On Unix, rename of a directory onto an existing empty directory succeeds and replaces that destination. I independently confirmed the operating-system primitive: the probe in `rename-race-probe.stdout.log` observed a successful rename and a changed destination inode.

A caller or concurrent process can therefore create an empty destination after the final `Lstat` but before `os.Rename`; the verifier can return success after replacing that directory. The existing test proves preservation when a destination exists before invocation, and the implementation detects a destination present at its final check, but neither closes this last race window. This conflicts with the stated absent-destination / atomic publish behavior. Use an atomic no-replace directory publication mechanism for supported platforms, or otherwise make the destination reservation/publish protocol preserve a concurrently created path; add a regression test for that interleaving. The primitive probe is not represented as an end-to-end concurrent `VerifyArchive` reproduction.

## Acceptance boundary

The archive and strict-JSON checks passed for the pinned artifact, including real source-pin closure consistency. Those hashes and archived fields establish internal byte consistency; they do not authenticate a publisher or independently prove the named Git commit produced the pinned source. The atomic no-replace race is the only must-fix found in this bounded review. I made no production, Git, archive, or native state changes.
