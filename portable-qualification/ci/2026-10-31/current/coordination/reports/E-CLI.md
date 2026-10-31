# E-CLI: native qualification verification command

**Worker:** N3  
**Outcome:** `mixed_change`  
**Date:** 2026-10-31

## Change

Added `cmd/verify-qualification`, a Go-only wrapper around `qualificationarchive.Verify(archive, manifest, sourceCommit)`. It requires `--archive`, `--manifest`, and `--source-commit`; accepts optional `--output`; rejects unknown, malformed, repeated, empty, and positional arguments; and prints help without invoking verification.

On success, the command emits the returned receipt as stable indented JSON plus one newline. With `--output`, it creates a new file exclusively and writes the same bytes as stdout. It never clobbers an existing file. Verification failures produce no JSON and no output file; write failures clean up any partial output.

## Verification

- `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test ./qualificationarchive ./cmd/verify-qualification -count=1` passed both packages.
- The complete 405-member runtime bundle (`runtime.tar.gz` SHA-256 `5d895c53ef9fbbeeb6a88cbb71fee4b352f9ebc689605d431efca61b8fa78cc1`; manifest SHA-256 `7645cb803edb5cbb053b43a5a02c04f124e3b60553f7057a6a92777f3d211dcd`) verified with source commit `77f7ce36439f1ae457a397269ea5a8c6d2db1cb2`. The receipt reports schema `gobi.portable-qualification-verification/v1`, `qualified: true`, 405 members, and 13 passing cases.
- The positive receipt is 11,265 bytes with SHA-256 `0aae5ce79da5211dbf836425b4f8f1ee9d40533e07235133dd5c467c33e15979`. The run with `--output` and the stdout-only run produced byte-identical JSON.
- The original published 397-member archive and manifest were preserved as a fail-closed control. Verify rejects its missing archived source-pin copy (`compiled-frontend/frontend/react/review-evidence/r2-go-emit.log`): the process exits 1, stdout stays empty, and no receipt file is created. Root supplied the additive complete bundle with the eight omitted pinned source copies; the Go verifier was not weakened.
- Actual `--help` exits 0 and prints usage. A missing-required-flags invocation exits 1 and writes no stdout. Unit tests also cover repeated/unknown flags, optional output, verification failure cleanup, no-clobber behavior, and stdout-write cleanup.

The first formatting attempt used bare `gofmt`, which was unavailable on `PATH`; that command exited 127 and the chained test did not run. Formatting then succeeded with `/tmp/gondola-go/go/bin/gofmt`. The final test command and actual runs use Go `go1.24.0 linux/amd64`. The extraction receipt passed `/workspace/scratch/39a56936f173/rebalancer-probe.py`'s read-only `validate_receipt` check and the local report/source/evidence SHA-256 checker. An initial attempt used a nonexistent validator-environment path; the corrected `/tmp/rebalancer-env/bin/python` validation passed and no native state was modified.

## Scope and limits

Only `cmd/verify-qualification/main.go` and `cmd/verify-qualification/main_test.go` are owned implementation changes. The command derives no verdict itself and delegates archive/certificate checks to the Go `Verify` API. This verifies consistency of captured evidence; it does not replay browser behavior or establish producer authenticity. Full pipeline and hosted-CI acceptance are outside this CLI packet.

Source, fixture, report, and rawlog hashes are recorded in `portable-coordination/receipts/E-CLI.json`.
