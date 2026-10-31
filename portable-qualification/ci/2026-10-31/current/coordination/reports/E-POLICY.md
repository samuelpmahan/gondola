# E-POLICY (N5): archive admission tests and threat boundary

**Outcome: `mixed_change`.** Added independent adversarial tests for `qualificationarchive.Extract` and documented the portable verifier's bounded threat boundary. The focused policy suite passed against the current N1 archive implementation.

## Test coverage

`qualificationarchive/policy_test.go` builds temporary tar/gzip archives and manifests using the published manifest shape; it does not depend on the mounted N4 archive or N1 test helpers. Ten policy test groups cover:

- traversal, absolute, backslash, dot-segment, repeated-separator, and path-normalization aliases in manifest and tar paths;
- duplicate archive members, duplicate manifest rows, extra archive members, and missing members;
- symlinks, hardlinks, character/block devices, and FIFOs;
- trailing non-gzip bytes and a concatenated gzip member;
- malformed expected/manifest commits and a valid but mismatched commit;
- a truthful 32 MiB + 1 single-file entry, four truthful 32 MiB files exceeding the 128 MiB expanded-stream limit in aggregate, and 4,097 manifest/archive members;
- a valid baseline extraction and cleanup.

All rejected-input checks isolate `TMPDIR` and assert that `Extract` leaves no partial extraction paths. The expanded and over-file-limit inputs stream zero bytes to temporary archives; no large fixture files are committed. The archive hashes and manifest SHA-256 values are computed from their actual generated content.

## Verification

Command:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test -count=1 -v -run '^TestPolicy' ./qualificationarchive
```

Go `1.24.0 linux/amd64` returned exit code 0. All 10 policy test groups and 27 nested cases passed (37 passing test nodes in total); the package's other test files compiled as part of this invocation. I did not run the other package tests or the portable verification profile. N1's separate archive tests include the compressed-byte limit case; this focused run does not claim to execute that test.

An initial fixture attempt failed before calling `Extract`: Go's standard `tar.Writer` rejects a regular-file name ending in `/`. I removed that unencodable fixture case, preserved the failure log, and reran the policy suite successfully. This was a test-data construction issue, not an application rejection result.

## Bounded claims

`portable-qualification/THREATS.md` distinguishes archive integrity and certificate consistency from origin authenticity or fresh browser behavior. The verifier checks archive/manifest agreement and recomputes the included qualification certificate; it does not authenticate who produced the archive or prove that its browser capture is genuine. The document records the contract limits: 64 MiB compressed, 128 MiB decompressed tar stream, 4,096 members, and 32 MiB per file.

## Source boundary

Owned files and hashes:

- `qualificationarchive/policy_test.go`: `33c3dd4a2b348f08186357808a1695c27207d7f75b39ac5c947a0e8d255db941`
- `portable-qualification/THREATS.md`: `5ebc9d17d308da706e490508f443a3402292fcae654f9f3d5a1ae9074fb13de2`

The focused run exercised N1 `qualificationarchive/archive.go` at SHA-256 `87e2db7726efb9ebf9262983b4dcc9674c7a7860fcd7b62918df04f7f3e2ea03`. Exact package input hashes and command output are pinned in the receipt and raw logs. No Go implementation, fixture, Git state, or scheduler state was changed by N5.
