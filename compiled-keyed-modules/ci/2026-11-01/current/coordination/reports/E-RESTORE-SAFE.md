# E-RESTORE-SAFE author report — N1

**Outcome: `mixed_change`.** Applied the narrow XR-RESTORE amendment to `/tmp/keyed-module-publish/restore.py`. The old `os.rename` fallback is removed. Commit now requires Linux `renameat2(RENAME_NOREPLACE)`; if Linux, libc, or the kernel does not provide that operation, restoration fails closed and cleans its staging tree.

## Change and preservation

Only `_commit_no_replace` and the CLI help/docstring changed. The commit helper rejects non-Linux before probing libc, requires the `renameat2` symbol, uses `RENAME_NOREPLACE` flag `1`, and converts missing/unsupported primitive cases (`ENOSYS`, `EINVAL`, `ENOTSUP`/`EOPNOTSUPP`) into an error. There is no `os.rename` fallback. `restore()` already cleans the staged tree if commit raises. Help now states the Linux `renameat2(RENAME_NOREPLACE)` requirement.

The original E-RESTORE source (`6cd408b3f86ed91a033e6ad01f494c44c6c8e319409f89453c93777b117191ab`), author report, author receipt, and XR-RESTORE race witness were left unchanged. A diff against the sealed E-RESTORE source is preserved at `rawlogs/E-RESTORE-SAFE/source-diff.patch`; it contains only the narrow commit/help clarification.

## Verification

The final utility SHA-256 is `0dac505c5e9949a2b6168dac955e40c7af805847f73ef27652e1962d603d3f68`. It was syntax-checked and its help output now names the Linux requirement.

The actual primary restore ran in a temporary destination with the final utility on Linux 6.18.57 x86_64 / Python 3.12.14. It exited 0 and independently verified all 25 segments, all 600 archive members, 372,962,548 expanded bytes, and all 157 source pins. Its temporary destination was removed after checks.

The unchanged 11-case synthetic audit/remote suite passed with the current utility. Three added commit controls passed:

- With `renameat2` unavailable, a normal restore failed closed and left neither destination nor staging tree.
- A race witness injected a foreign destination with a sentinel during the unavailable-symbol lookup, after restore prechecks and staging. The utility rejected the commit, preserved the foreign destination and sentinel, removed staging, and made zero `os.rename` calls.
- A simulated non-Linux platform failed before libc lookup and left no destination or staging tree.

The XR-RESTORE basic existing-destination proof remains valid for the unchanged successful `renameat2(RENAME_NOREPLACE)` call. The 11-case suite covers the ordinary pre-existing destination sentinel case. I did not rerun Go, Node, M0, browser, or the actual audit archive: this repair changes only the publication primitive, and the frozen application source and bundle are unchanged.

## Supported environment and limits

The tested guarantee is Linux with libc and kernel support for `renameat2(RENAME_NOREPLACE)`. Unsupported platforms fail before commit rather than attempting a weaker operation. macOS and Windows were not run. SHA-256 values provide byte consistency, not publisher authenticity. Exact commands, outputs, the simulated race, input pins, and source diff are in `rawlogs/E-RESTORE-SAFE/`.
