# XR-ATOMIC — independent no-replace publication review

**Reviewer:** N3  
**Decision:** `accepted`

## Packet and source integrity

The E-ATOMIC report and receipt match their seal hashes. All five owned files match the sealed inventory, and the six current source pins in the author packet (including the unchanged strict JSON helper) match their recorded sizes and SHA-256 values. All 15 author-indexed raw logs match their entries. The pinned PR20 archive and manifest still match E-ARCHIVE: archive SHA-256 `039e6b8f7d074c6c4873fc4a04ebc56f6b7110250046906e222eb1d17503e20c`; manifest SHA-256 `ef2f332d15e306daabc290d127a42bfc2f9486fa43219785192f1674d7804fb2`. The earlier E-ARCHIVE and XR-ARCHIVE report and receipt packets remain byte-for-byte sealed.

## No-replace behavior

On Linux/amd64, `installDirectoryNoReplace` calls syscall `renameat2` number 316 with `AT_FDCWD` for both absolute paths and flag `RENAME_NOREPLACE` (1). The local Linux amd64 UAPI header independently confirms syscall number 316. `BytePtrFromString` rejects embedded NULs, pointers are kept alive across the syscall, and every syscall error is returned as a `LinkError`; there is no `os.Rename` fallback. The `linux && amd64` build tag confines this syscall implementation to its ABI. The complementary `!linux || !amd64` implementation returns an unsupported error and contains no overwrite-capable fallback.

I reran the focused explicit-file Go 1.24 suite against the pinned actual archive and manifest, with the independent expected source supplied. All 15 top-level tests passed. The direct helper test successfully publishes to an absent destination; its existing-empty-destination control receives `os.ErrExist`, verifies the destination inode is unchanged and remains empty, and confirms the staging tree remains intact. `VerifyArchive` also rejects a destination created during extraction, preserves its sentinel, and removes its staging directory on failure. The actual archive integration passed with 529 members and 147 source pins. Existing strict-JSON, member-integrity, gzip/footer, and tar-trailer controls passed in the same focused run.

The no-replace guarantee is grounded in the atomic Linux `RENAME_NOREPLACE` syscall and the direct helper control; I did not claim an end-to-end scheduler race stress test. A syscall or filesystem that does not support the operation returns an error and the archive verifier’s deferred cleanup removes the stage.

## Platform and expected-source checks

The fallback files compiled for `darwin/arm64` with `go test -c`. This verifies source selection and compilation only; no Darwin binary was run. Other unsupported platforms follow the same fail-closed build-tag implementation.

The updated integration test requires `GOBI_MODULE_EXPECTED_SOURCE` whenever archive inputs are set, validates the exact lowercase 40-character form, and compares it with the verifier result. I reran the integration test without that variable and observed the expected failure. The current `module-qualification/run.mjs` derives the expected value from its `--source-commit` argument, validates that it matches Git HEAD before producing evidence, then passes it to the Go test environment. This is a test input contract review, not a claim that a fresh full CI pipeline ran.

## Boundary

The focused archive and install tests pass; no package-wide `modulequalification` result is claimed while the capture-verifier lane remains concurrent. Darwin was compile-checked only. Archive hashes and source pins establish byte consistency, not publisher authenticity or proof that the named Git commit produced the archive. I made no production, Git, archive, or native state changes.

Commands, tool version, source/input pin checks, platform syscall number, expected-source contract excerpt, and raw output are preserved in `native-module-coordination/rawlogs/XR-ATOMIC/`.
