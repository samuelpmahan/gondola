# E-ATOMIC — fail-closed no-replace archive publication

**Worker:** N2  
**Outcome:** `mixed_change`

## Change

`VerifyArchive` now publishes its verified staging directory through `installDirectoryNoReplace`. On Linux/amd64, the helper calls the standard-library `syscall.Syscall6` interface for `renameat2` with `RENAME_NOREPLACE`. If that syscall, kernel, or filesystem does not support the operation, its error is returned; there is no overwrite-capable fallback. Other OS/architectures compile a helper that returns an unsupported error. The API and archive validation remain unchanged, and the existing deferred staging cleanup runs when publication fails.

`archive_test.go` now requires `GOBI_MODULE_EXPECTED_SOURCE` whenever archive and manifest integration inputs are supplied. It validates the independent 40-character lowercase source expectation and compares it with the verifier result. The fixed 529-member and 147-source-pin checks remain. The existing archive integration was rerun against the historical 7bd… archive with that value set.

## Verification

Go `1.24.0 linux/amd64` passed the focused explicit-file suite using the actual captured archive and manifest. The suite covered archive and strict-JSON tests, install success to a missing destination, preservation of an existing empty destination’s inode/content on failed install, stage cleanup when a destination appears during extraction, and successful extraction of the captured archive (529 members, 147 source pins). The test output and exact command are pinned in `rawlogs/E-ATOMIC/focused-tests.stdout.log` and `focused-tests.command.json`.

The regression was written first and its initial compile failure is preserved in `install-regression.red.log`. A separately captured integration invocation with the archive variables set but no `GOBI_MODULE_EXPECTED_SOURCE` failed as intended. The first `gofmt` lookup via `PATH` also failed because that executable was not on `PATH`; formatting then ran through `/tmp/gondola-go/go/bin/gofmt`. These records are indexed and are not implementation failures.

The fail-closed non-Linux/amd64 implementation cross-compiled for `darwin/arm64` using `go test -c`; this was a compile check only. The original E-ARCHIVE and XR-ARCHIVE report/receipt hashes still match their seals. The archive and manifest used here still match the E-ARCHIVE pins: archive SHA-256 `039e6b8f7d074c6c4873fc4a04ebc56f6b7110250046906e222eb1d17503e20c`, manifest SHA-256 `ef2f332d15e306daabc290d127a42bfc2f9486fa43219785192f1674d7804fb2`.

## Acceptance boundary

The atomic operation tested here refuses an already-present empty directory; a check-then-rename race is therefore closed on supported Linux/amd64 systems. The existing validation check and the added stage-cleanup case also ensure a destination noticed during extraction survives and the temporary stage is removed. Unsupported systems fail closed. This packet does not claim a full `modulequalification` package run while N1’s concurrent verifier work is active, and the cross-platform check did not execute a Darwin binary.

Only `modulequalification/archive.go`, `archive_test.go`, and new `install*.go` files changed. No Git or native scheduler state changed. Raw-log index: `db720c3911abe825bf6b3a45c21411039bbcf7807994f59a1b939ac097461e1e` (15 entries).
